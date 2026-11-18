#!/usr/bin/env python3
"""ia360.py — Pasada de IA sobre un 360 exacto del BIM: entrada y montaje.

Los modelos de edición de imagen (Nano Banana Pro, Seedream, GPT Image) no
saben de panorámicas: no aceptan 2:1 o no entienden que el borde izquierdo
continúa en el derecho. Este script resuelve las dos puntas de la cadena:

  preparar  Equirectangular base -> entrada para el modelo:
            · se reduce a --alto (768 por defecto; los modelos ven ~1 Mpx
              de entrada de todos modos);
            · se rellena hasta 21:9 con la propia panorámica ENVUELTA
              (lo que hay a la izquierda de la costura se pega a la derecha
              y al revés), para que el modelo vea la continuidad;
            · se añade una ondulación de ±2 niveles de muy baja frecuencia
              (invisible) que evita repeticiones largas en el WebP;
            · se escribe .webp, .b64 (para un data URI) y .json.
  montar    Salida del modelo -> equirectangular 2:1 sin costura:
            · se recorta el núcleo 2:1 (escala deducida del ancho);
            · se funden los solapes envueltos sobre la costura (el modelo
              pintó dos veces la misma franja; se mezcla con rampa coseno);
            · se llevan los polos al color medio (cenit y nadir son un
              punto: cualquier variación en la fila se ve como un remolino);
            · se reescala a --ancho y se miden costura y polos antes y
              después (niveles de 8 bit).

Uso:
  python3 ia360.py preparar --base base-238-salon.png --salida entradas/e768
  python3 ia360.py montar --ia salida-modelo.png --meta entradas/e768.json \
          --salida ia-238-salon.png --ancho 4096
"""
import argparse
import base64
import hashlib
import json

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def preparar(a):
    b = np.asarray(Image.open(a.base).convert('RGB'))
    h = a.alto; w = 2 * h
    im = np.asarray(Image.fromarray(b).resize((w, h), Image.LANCZOS)).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    g = 1.6 * np.sin(xx / w * 2 * np.pi * 3 + yy / h * 7) + 1.2 * np.cos(yy / h * 2 * np.pi * 2.3)
    im = np.clip(im + g[..., None] + 0.5, 0, 255).astype(np.uint8)
    wt = round(h * a.relacion[0] / a.relacion[1]); p = wt - w; pl = p // 2; pr = p - pl
    pad = np.concatenate([im[:, w - pl:], im, im[:, :pr]], axis=1)
    Image.fromarray(pad).save(a.salida + '.webp', 'WEBP', quality=a.calidad, method=6)
    s = base64.b64encode(open(a.salida + '.webp', 'rb').read()).decode()
    open(a.salida + '.b64', 'w').write(s)
    meta = {'pl': pl, 'pr': pr, 'w': w, 'h': h, 'ancho': wt, 'md5b64': hashlib.md5(s.encode()).hexdigest(), 'caracteres': len(s)}
    json.dump(meta, open(a.salida + '.json', 'w'))
    print(json.dumps(meta))


def costura(img):
    """Salto en la costura frente al salto típico entre columnas vecinas (niveles)."""
    f = img.astype(np.float32)
    salto = np.abs(f[:, 0] - f[:, -1]).mean()
    vec = np.abs(np.diff(f, axis=1)).mean(axis=(0, 2))
    return {'saltoCostura': round(float(salto), 2), 'vecinasMediana': round(float(np.median(vec)), 2),
            'vecinasP95': round(float(np.percentile(vec, 95)), 2),
            'razon': round(float(salto / max(np.median(vec), 1e-3)), 2)}


def polos(img, filas=4):
    f = img.astype(np.float32)
    return {'cenitDesviacion': round(float(f[:filas].std(axis=1).mean()), 2),
            'nadirDesviacion': round(float(f[-filas:].std(axis=1).mean()), 2)}


def montar(a):
    meta = json.load(open(a.meta))
    o = np.asarray(Image.open(a.ia).convert('RGB')).astype(np.float32)
    Ho, Wo = o.shape[:2]
    s = Wo / meta['ancho']
    pl, pr, w = meta['pl'] * s, meta['pr'] * s, meta['w'] * s
    x0 = int(round(pl)); x1 = int(round(pl + w)); W = x1 - x0
    nucleo = o[:, x0:x1].copy()
    crudo = nucleo.copy()
    izq = o[:, :x0]           # = final del núcleo, pintado otra vez a la izquierda
    der = o[:, x1:]           # = principio del núcleo, pintado otra vez a la derecha
    k = int(min(izq.shape[1], der.shape[1]) * a.solape)
    info = {'entrada': [Wo, Ho], 'escala': round(s, 4), 'nucleo': [W, Ho], 'solapePx': k}
    if k > 4:
        # desalineación entre las dos pinturas de la misma franja (correlación de fase)
        import cv2
        g1 = cv2.cvtColor(nucleo[:, W - k:].astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
        g2 = cv2.cvtColor(izq[:, izq.shape[1] - k:].astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
        (dx, dy), resp = cv2.phaseCorrelate(g1, g2)
        info['desalineacionSolapeIzq'] = [round(dx, 2), round(dy, 2), round(resp, 3)]
        g3 = cv2.cvtColor(nucleo[:, :k].astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
        g4 = cv2.cvtColor(der[:, :k].astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
        (dx, dy), resp = cv2.phaseCorrelate(g3, g4)
        info['desalineacionSolapeDer'] = [round(dx, 2), round(dy, 2), round(resp, 3)]
        t = (1 - np.cos(np.linspace(0, np.pi, k))) / 2 * 0.5   # 0 -> 0,5 hacia la costura
        fin = nucleo[:, W - k:]; otro = izq[:, izq.shape[1] - k:]
        nucleo[:, W - k:] = fin * (1 - t[None, :, None]) + otro * t[None, :, None]
        ini = nucleo[:, :k]; otro = der[:, :k]
        t2 = t[::-1]
        nucleo[:, :k] = ini * (1 - t2[None, :, None]) + otro * t2[None, :, None]
    elif a.rodar:
        # sin solape: mezcla local girando media vuelta (la costura al centro)
        r = np.roll(nucleo, W // 2, axis=1)
        k = int(W * 0.02); c = W // 2
        izqm = r[:, c - k:c].mean(axis=1, keepdims=True); derm = r[:, c:c + k].mean(axis=1, keepdims=True)
        corr = (derm - izqm) / 2
        rampa = np.concatenate([np.linspace(0, 1, k), np.linspace(1, 0, k)])
        signo = np.concatenate([np.ones(k), -np.ones(k)])
        r[:, c - k:c + k] += (corr * (rampa * signo)[None, :, None])
        nucleo = np.roll(r, -(W // 2), axis=1)
    # polos: hacia el color medio de la banda
    H = Ho; banda = int(H * a.polo)
    for arriba in (True, False):
        filas = slice(0, banda) if arriba else slice(H - banda, H)
        blk = nucleo[filas]
        media = blk.mean(axis=(0, 1), keepdims=True)
        y = np.linspace(0, 1, banda)
        peso = ((1 + np.cos(np.pi * y)) / 2) ** 1.5         # 1 en el polo, 0 al final de la banda
        if not arriba:
            peso = peso[::-1]
        # en el polo, color medio; alejándose, se conserva la imagen
        nucleo[filas] = blk * (1 - peso[:, None, None]) + media * peso[:, None, None]
    out = np.clip(nucleo + 0.5, 0, 255).astype(np.uint8)
    fin = Image.fromarray(out).resize((a.ancho, a.ancho // 2), Image.LANCZOS)
    crudo_r = Image.fromarray(np.clip(crudo + 0.5, 0, 255).astype(np.uint8)).resize((a.ancho, a.ancho // 2), Image.LANCZOS)
    fin_a = np.asarray(fin); cru_a = np.asarray(crudo_r)
    info['costuraAntes'] = costura(cru_a); info['costuraDespues'] = costura(fin_a)
    info['polosAntes'] = polos(cru_a); info['polosDespues'] = polos(fin_a)
    fin.save(a.salida)
    if a.crudo:
        crudo_r.save(a.crudo)
    print(json.dumps(info, ensure_ascii=False))
    if a.info:
        json.dump(info, open(a.info, 'w'), ensure_ascii=False, indent=1)


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest='orden', required=True)
p = sub.add_parser('preparar')
p.add_argument('--base', required=True)
p.add_argument('--salida', required=True, help='prefijo: escribe .webp, .b64 y .json')
p.add_argument('--alto', type=int, default=768)
p.add_argument('--calidad', type=int, default=75)
p.add_argument('--relacion', type=int, nargs=2, default=[21, 9])
m = sub.add_parser('montar')
m.add_argument('--ia', required=True)
m.add_argument('--meta', required=True)
m.add_argument('--salida', required=True)
m.add_argument('--crudo', default=None, help='guarda también el núcleo sin coser, para comparar')
m.add_argument('--info', default=None)
m.add_argument('--ancho', type=int, default=4096)
m.add_argument('--solape', type=float, default=0.9, help='fracción del solape envuelto que se funde')
m.add_argument('--polo', type=float, default=0.035, help='fracción del alto que se lleva al color medio en cada polo')
m.add_argument('--rodar', action='store_true', help='sin solape: mezcla girando media vuelta')
a = ap.parse_args()
preparar(a) if a.orden == 'preparar' else montar(a)
