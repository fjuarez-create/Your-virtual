#!/usr/bin/env python3
"""comparar360.py — ¿Respeta una panorámica retocada (IA) la geometría del BIM?

Compara una equirectangular nueva (p. ej. la pasada de IA sobre el 360 base)
con el pase de segmentación del 360 base (misma cámara, misma convención):

· Recuperación de bordes: cada borde entre clases del pase id (muro/techo,
  muro/vidrio, carpintería, puerta, mobiliario…) tiene que tener un borde de
  imagen cerca en la panorámica nueva. Se mide la distancia de cada píxel de
  borde del BIM al borde más cercano de la nueva (Canny + transformada de
  distancia), por pares de clases, ponderada por el ángulo sólido (cos φ).
· Geometría inventada: bordes nuevos sobre paños lisos (muro y techo) a más
  de --holgura px de cualquier borde del BIM: una ventana, un hueco o una
  moldura que no existen. Se da la fracción del paño cubierta y las manchas.
· Imagen de control: la nueva con los bordes del BIM encima (verde = hay
  borde cerca, rojo = falta) y los bordes inventados en magenta.

Uso:
  python3 nuevo/tools/captura/comparar360.py --id base-238-salon-id.png \
          --leyenda base-238-salon.json --nueva ia.jpg --salida control.jpg
  (--prueba hace la autocomprobación: la base contra sí misma y contra
   versiones desplazadas, para calibrar las cifras)
"""
import argparse
import json
import math

import cv2
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--id', required=True)
ap.add_argument('--leyenda', required=True, help='JSON del 360 base (lleva "leyenda")')
ap.add_argument('--nueva', required=True)
ap.add_argument('--normal', default=None, help='pase de normales (por defecto, junto al id)')
ap.add_argument('--profundidad', default=None, help='profundidad en mm, 16 bit (por defecto, junto al id)')
ap.add_argument('--salida', default=None)
ap.add_argument('--holgura', type=float, default=6.0, help='px a 4096 de ancho')
ap.add_argument('--prueba', action='store_true')
a = ap.parse_args()

ids = np.asarray(Image.open(a.id).convert('RGB'))
H, W = ids.shape[:2]
base = json.load(open(a.leyenda))
ley = base['leyenda']
rumbo0 = base.get('rumboCentro', 0)
cod = (ids[..., 0].astype(np.int64) << 16) | (ids[..., 1].astype(np.int64) << 8) | ids[..., 2]
clase = np.full((H, W), -1, np.int64)
for c in ley:
    r, g, b = c['color']
    clase[cod == ((r << 16) | (g << 8) | b)] = c['id']
nombre = {c['id']: c['clave'] for c in ley}
esc = W / 4096
hol = a.holgura * esc
peso = np.cos((0.5 - (np.arange(H) + 0.5) / H) * np.pi)[:, None] * np.ones((1, W))

# Bordes del BIM: píxel con un vecino (derecha / abajo, con la costura envuelta) de otra clase.
der = np.roll(clase, -1, axis=1)
aba = np.vstack([clase[1:], clase[-1:]])
borde = (clase != der) | (clase != aba)
par = np.where(clase != der, np.minimum(clase, der) * 100 + np.maximum(clase, der), np.minimum(clase, aba) * 100 + np.maximum(clase, aba))
# Aristas dentro de una misma clase: pliegue de la normal (> 20°, esquinas
# de muro) y salto de profundidad (> 4 %, un mueble delante de otro).
import os
fn = a.normal or a.id.replace('-id.png', '-normal.png')
fp = a.profundidad or a.id.replace('-id.png', '-depth-mm.png')
arista = np.zeros((H, W), bool)
if os.path.exists(fn):
    nn = np.asarray(Image.open(fn).convert('RGB')).astype(np.float32) / 127.5 - 1
    nn /= np.linalg.norm(nn, axis=-1, keepdims=True) + 1e-6
    for vec in (np.roll(nn, -1, axis=1), np.vstack([nn[1:], nn[-1:]])):
        arista |= (nn * vec).sum(-1) < math.cos(math.radians(20))
if os.path.exists(fp):
    dd = np.asarray(Image.open(fp)).astype(np.float32)
    for vec in (np.roll(dd, -1, axis=1), np.vstack([dd[1:], dd[-1:]])):
        arista |= np.abs(dd - vec) > 0.04 * np.maximum(dd, vec)
arista &= ~borde
par = np.where(arista, 9999, par)
borde |= arista
lim = int(H * 0.04)  # muy cerca de los polos la equirectangular estira: fuera
borde[:lim] = False; borde[-lim:] = False
dist_bim = cv2.distanceTransform((~borde).astype(np.uint8), cv2.DIST_L2, 5)
liso = np.isin(clase, [c['id'] for c in ley if c['clave'] in ('muro', 'techo')])


def bordes_imagen(img):
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    g = cv2.GaussianBlur(g, (0, 0), 1.2 * max(1, esc))
    v = np.median(g)
    return cv2.Canny(g, int(max(5, 0.33 * v * 0.25)), int(max(15, 0.66 * v * 0.35))) > 0


def medir(img):
    if img.shape[:2] != (H, W):
        img = np.asarray(Image.fromarray(img).resize((W, H), Image.LANCZOS))
    e = bordes_imagen(img)
    dist_nueva = cv2.distanceTransform((~e).astype(np.uint8), cv2.DIST_L2, 5)
    d = dist_nueva[borde]; w = peso[borde]
    res = {'recuperacion2px': round(float((w * (d <= 2 * esc)).sum() / w.sum()), 4),
           'recuperacion4px': round(float((w * (d <= 4 * esc)).sum() / w.sum()), 4),
           'distanciaMedianaPx': round(float(np.median(d) / esc), 2)}
    pares = {}
    for k in np.unique(par[borde]):
        m = borde & (par == k)
        if m.sum() < 200:
            continue
        i, j = divmod(int(k), 100)
        dd = dist_nueva[m]; ww = peso[m]
        pares['arista o salto dentro de una clase' if k == 9999 else f'{nombre.get(i, i)}/{nombre.get(j, j)}'] = {'px': int(m.sum()), 'recuperacion4px': round(float((ww * (dd <= 4 * esc)).sum() / ww.sum()), 4)}
    res['porPares'] = dict(sorted(pares.items(), key=lambda kv: -kv[1]['px']))
    inventado = e & liso & (dist_bim > hol)
    inventado[:lim] = False; inventado[-lim:] = False
    res['bordesInventadosEnPanosLisos'] = round(float((peso * inventado).sum() / (peso * liso).sum()), 5)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(inventado.astype(np.uint8), np.ones((5, 5), np.uint8)), 8)
    manchas = sorted(([int(x) for x in st[k]] for k in range(1, n) if st[k][4] > 400 * esc * esc), key=lambda s: -s[4])[:10]
    res['manchasInventadas'] = [{'caja': s[:4], 'area': s[4], 'rumbo': round(((((s[0] + s[2] / 2) / W) - 0.5) * 360 + rumbo0) % 360, 1)} for s in manchas]
    return res, img, e, dist_nueva, inventado


nueva = np.asarray(Image.open(a.nueva).convert('RGB'))
res, img, e, dist_nueva, inventado = medir(nueva)
if a.prueba:
    pruebas = {}
    for dx in (0, 4, 12, 40):
        r, *_ = medir(np.roll(img, int(round(dx * esc)), axis=1))
        pruebas[f'desplazada{dx}px'] = {k: r[k] for k in ('recuperacion2px', 'recuperacion4px', 'distanciaMedianaPx', 'bordesInventadosEnPanosLisos')}
    res['autocomprobacion'] = pruebas
print(json.dumps(res, ensure_ascii=False, indent=1))

if a.salida:
    out = (img.astype(np.float32) * 0.55).astype(np.uint8)
    ok = borde & (dist_nueva <= 4 * esc)
    out[cv2.dilate(ok.astype(np.uint8), np.ones((2, 2), np.uint8)) > 0] = (40, 220, 60)
    mal = borde & ~ok
    out[cv2.dilate(mal.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = (255, 40, 40)
    out[cv2.dilate(inventado.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = (255, 0, 255)
    Image.fromarray(out).save(a.salida, quality=88)
