#!/usr/bin/env python3
"""registrar360.py — Encaja una panorámica retocada con IA sobre la geometría del BIM.

La IA conserva la distribución pero deriva unos píxeles (aristas de techo,
marcos, frentes de cocina). Este paso la registra contra el 360 base:

  1. Global: afín (ECC) entre los gradientes de la base y de la IA en la
     franja central (las filas cercanas a los polos estiran y se excluyen).
  2. Local: flujo óptico DIS entre gradientes, con la costura envuelta,
     suavizado fuerte (sigma --suave px) y recortado a --max px, para que
     solo corrija la deriva de baja frecuencia y no deforme texturas.
  3. Se aplica a la imagen IA (y al tamaño que se pida) con remap bilineal.

No mueve la geometría del BIM: mueve la imagen IA hacia ella.
Uso:
  python3 registrar360.py --base base-238-salon.png --ia ia-4k.png \
          --salida ia-4k-reg.png [--ia-grande ia-8k.png --salida-grande ...]
"""
import argparse
import json

import cv2
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def gradiente(img):
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    g = cv2.GaussianBlur(g, (0, 0), 1.5)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    m = np.sqrt(gx * gx + gy * gy)
    m = m / (np.percentile(m, 99) + 1e-6)
    return np.clip(m, 0, 1)


ap = argparse.ArgumentParser()
ap.add_argument('--base', required=True)
ap.add_argument('--ia', required=True)
ap.add_argument('--salida', required=True)
ap.add_argument('--suave', type=float, default=24.0)
ap.add_argument('--max', type=float, default=0.0, help='px; 0 = solo afín (recomendado: el flujo local ondula las verticales)')
ap.add_argument('--ia-grande', default=None)
ap.add_argument('--salida-grande', default=None)
ap.add_argument('--info', default=None)
ap.add_argument('--periodica', action='store_true', help='fuerza escala x = 1 y sin y(x): costura exacta, algo menos de ajuste')
ap.add_argument('--banda-costura', type=float, default=0.015, help='fracción del ancho para repartir el salto de la costura (0 = no tocar)')
a = ap.parse_args()

base = np.asarray(Image.open(a.base).convert('RGB'))
ia = np.asarray(Image.open(a.ia).convert('RGB'))
H, W = base.shape[:2]
if ia.shape[:2] != (H, W):
    ia = np.asarray(Image.fromarray(ia).resize((W, H), Image.LANCZOS))
gb, gi = gradiente(base), gradiente(ia)
info = {}

# 1) afín global en la franja central, a media resolución
f = 2
y0, y1 = int(H * 0.22), int(H * 0.80)
A = cv2.resize(gb[y0:y1], None, fx=1 / f, fy=1 / f, interpolation=cv2.INTER_AREA)
B = cv2.resize(gi[y0:y1], None, fx=1 / f, fy=1 / f, interpolation=cv2.INTER_AREA)
M = np.eye(2, 3, dtype=np.float32)
try:
    cc, M = cv2.findTransformECC(cv2.GaussianBlur(A, (0, 0), 2), cv2.GaussianBlur(B, (0, 0), 2), M, cv2.MOTION_AFFINE,
                                 (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
    info['ecc'] = round(float(cc), 4)
except cv2.error as e:
    info['ecc'] = 'sin convergencia: ' + str(e)[:80]
# llevar M a coordenadas de imagen completa (traslación por la franja y el factor)
S = np.array([[f, 0, 0], [0, f, y0], [0, 0, 1]], np.float64)
Mf = S @ np.vstack([M, [0, 0, 1]]) @ np.linalg.inv(S)
info['afinEstimada'] = np.round(Mf[:2], 5).tolist()
# En un 360 el eje x es el rumbo y es periódico: escala horizontal 1 y sin
# término y(x); si no, la última columna no casa con la primera (costura).
if a.periodica:
    Mf[0, 0] = 1.0
    Mf[1, 0] = 0.0
info['afin'] = np.round(Mf[:2], 5).tolist()
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
mx = (Mf[0, 0] * xs + Mf[0, 1] * ys + Mf[0, 2]).astype(np.float32)
my = (Mf[1, 0] * xs + Mf[1, 1] * ys + Mf[1, 2]).astype(np.float32)

# 2) flujo local (base -> IA ya afinada), con envoltura horizontal
gi_af = cv2.remap(gi, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
p = W // 8
A8 = (np.concatenate([gb[:, -p:], gb, gb[:, :p]], 1) * 255).astype(np.uint8)
B8 = (np.concatenate([gi_af[:, -p:], gi_af, gi_af[:, :p]], 1) * 255).astype(np.uint8)
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
flujo = dis.calc(A8, B8, None)[:, p:-p]
# confianza: solo donde hay borde en la base; difundir con media ponderada
conf = cv2.GaussianBlur(gb, (0, 0), 2)
num = np.stack([cv2.GaussianBlur(flujo[..., k] * conf, (0, 0), a.suave) for k in range(2)], -1)
den = cv2.GaussianBlur(conf, (0, 0), a.suave)[..., None] + 1e-3
fl = num / den
# casquetes polares: sin corrección local
pesoy = np.clip((np.minimum(ys, H - 1 - ys) / H - 0.05) / 0.12, 0, 1)[..., None]
fl = fl * pesoy
mag = np.linalg.norm(fl, axis=-1, keepdims=True)
fl = fl * np.minimum(1, a.max / (mag + 1e-6)) if a.max > 0 else fl * 0
info['flujoMedioPx'] = round(float(np.linalg.norm(fl, axis=-1).mean()), 2)
info['flujoP95Px'] = round(float(np.percentile(np.linalg.norm(fl, axis=-1), 95)), 2)
# mapa total: para cada píxel de salida, dónde leer en la IA original
fx = cv2.remap(mx, xs + fl[..., 0], ys + fl[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
fy = cv2.remap(my, xs + fl[..., 0], ys + fl[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def aplicar(img, escala):
    h, w = img.shape[:2]
    if escala != 1:
        X = cv2.resize(fx, (w, h), interpolation=cv2.INTER_LINEAR) * escala
        Y = cv2.resize(fy, (w, h), interpolation=cv2.INTER_LINEAR) * escala
    else:
        X, Y = fx, fy
    pad = 8
    imgw = np.concatenate([img[:, -pad:], img, img[:, :pad]], 1)
    out = cv2.remap(imgw, (X + pad).astype(np.float32), Y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return coser(out)


def coser(img):
    """Reparte el salto entre la última y la primera columna en una banda (rampa lineal por fila)."""
    if a.banda_costura <= 0:
        return img
    h, w = img.shape[:2]
    k = max(4, int(w * a.banda_costura))
    f = np.roll(img.astype(np.float32), w // 2, axis=1)
    c = w // 2
    salto = f[:, c:c + 2].mean(axis=1) - f[:, c - 2:c].mean(axis=1)      # por fila y canal
    salto = cv2.GaussianBlur(salto.reshape(h, 1, 3), (0, 0), 3).reshape(h, 3)   # suavizado vertical
    r = np.linspace(0, 0.5, k)[None, :, None]
    f[:, c - k:c] += salto[:, None, :] * r
    f[:, c:c + k] -= salto[:, None, :] * r[:, ::-1]
    return np.roll(np.clip(f + 0.5, 0, 255), -(w // 2), axis=1).astype(np.uint8)


Image.fromarray(aplicar(ia, 1)).save(a.salida)
if a.ia_grande and a.salida_grande:
    g = np.asarray(Image.open(a.ia_grande).convert('RGB'))
    Image.fromarray(aplicar(g, g.shape[1] / W)).save(a.salida_grande)
print(json.dumps(info))
if a.info:
    json.dump(info, open(a.info, 'w'), indent=1)
