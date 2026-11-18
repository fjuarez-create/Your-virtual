#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
procesar.py — De las capturas en bruto de capturar.mjs a las imágenes y los
JSON de nuevo/estilos/img/, con su comprobación.

  python3 nuevo/tools/captura/procesar.py --brutos <carpeta de capturar.mjs> \
          [--salida nuevo/estilos/img] [--comprobacion <carpeta para los PNG de control>]

Qué hace:
  · conjunto  → conjunto.{jpg,webp} (+ -m) y conjunto.json (contorno de Apolo y
                de los otros edificios SERENEA que trae el entorno, sin numerar).
  · edificio  → edificio.{jpg,webp} (+ -m) y edificio-plantas.json: la máscara de
                plantas lógicas trazada a polígonos (Douglas-Peucker).
  · planta-2  → planta-2.{jpg,webp} (+ -m) y planta-2-viviendas.json: polígonos de
                las viviendas de nivel 2 por la transformación afín EXACTA de la
                cámara ortográfica.
  · vivienda  → vivienda-<id>.{jpg,webp} (+ -m, + -aislada) y vivienda-<id>.json:
                estancias separadas con la sección del modelo y nombradas con la
                ficha comercial; un punto (hotspot) por estancia principal.
  · Comprueba la alineación y la mide en píxeles (ver `verificacion` en cada JSON).

Requiere numpy, Pillow y opencv-python-headless (pip install opencv-python-headless)
y pdftotext (poppler) para leer las fichas.
"""
import argparse
import json
import math
import os
import re
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
LIMITE_BYTES = 350_000            # ≤ 350 kB por fichero
ANCHO_MOVIL = 1200

NIVELES = [
    {'nivel': 1, 'clave': 'baja', 'nombre': 'Planta 1', 'color': (255, 0, 0)},
    {'nivel': 2, 'clave': 'p1', 'nombre': 'Planta 2', 'color': (0, 255, 0)},
    {'nivel': 3, 'clave': 'p2', 'nombre': 'Planta 3', 'color': (0, 0, 255)},
    {'nivel': 4, 'clave': 'atico', 'nombre': 'Planta ático', 'color': (255, 255, 0)},
]


# ───────────────────────────── utilidades ─────────────────────────────
def leer_json(ruta):
    with open(ruta, encoding='utf-8') as f:
        return json.load(f)


def escribir_json(ruta, datos):
    with open(ruta, 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
        f.write('\n')


def rgb(ruta):
    return np.array(Image.open(ruta).convert('RGB'))


def r2(v, n=2):
    return round(float(v), n)


def exportar(img, salida, base, ancho_movil=ANCHO_MOVIL, limite=LIMITE_BYTES):
    """JPG y WebP optimizados (≤ limite) a tamaño completo y a ancho_movil.
    Baja la calidad de 2 en 2 hasta que cabe; devuelve lo escrito."""
    hechos = {}
    variantes = [('', img)]
    if img.width > ancho_movil:
        alto = round(img.height * ancho_movil / img.width)
        variantes.append(('-m', img.resize((ancho_movil, alto), Image.LANCZOS)))
    for sufijo, im in variantes:
        for fmt, ext in (('JPEG', 'jpg'), ('WEBP', 'webp')):
            ruta = os.path.join(salida, f'{base}{sufijo}.{ext}')
            for q in range(88, 39, -2):
                if fmt == 'JPEG':
                    im.save(ruta, 'JPEG', quality=q, optimize=True, progressive=True, subsampling='4:2:0')
                else:
                    im.save(ruta, 'WEBP', quality=q, method=6)
                if os.path.getsize(ruta) <= limite:
                    break
            hechos[f'{base}{sufijo}.{ext}'] = {'ancho': im.width, 'alto': im.height, 'bytes': os.path.getsize(ruta), 'calidad': q}
    return hechos


def contornos(binaria, escala=4, eps=0.8, area_min=150.0, hueco_min=150.0):
    """Polígonos (exteriores y huecos) de una máscara binaria, en píxeles de
    la imagen (origen arriba a la izquierda, continuos). Se traza sobre la
    máscara ampliada `escala` veces (vecino más próximo) para que el contorno
    pase a 1/(2·escala) px del borde real del píxel, no por su centro, y se
    simplifica con Douglas-Peucker (cv2.approxPolyDP) a `eps` px."""
    b = binaria.astype(np.uint8)
    # limpieza: fuera manchas y agujeros menores que area_min (en px de la imagen)
    n, lab, st, _ = cv2.connectedComponentsWithStats(b, connectivity=8)
    for i in range(1, n):
        if st[i, 4] < area_min:
            b[lab == i] = 0
    inv = 1 - b
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        toca_borde = x == 0 or y == 0 or x + w == b.shape[1] or y + h == b.shape[0]
        if a < hueco_min and not toca_borde:
            b[lab == i] = 1
    grande = cv2.resize(b, (b.shape[1] * escala, b.shape[0] * escala), interpolation=cv2.INTER_NEAREST)
    cs, jer = cv2.findContours(grande, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    exteriores, huecos = [], []
    if jer is None:
        return exteriores, huecos, b
    for c, h in zip(cs, jer[0]):
        p = (c.reshape(-1, 2).astype(np.float32) + 0.5) / escala
        s = cv2.approxPolyDP(p.reshape(-1, 1, 2), eps, True).reshape(-1, 2)
        if len(s) < 3:
            continue
        area = abs(cv2.contourArea(s))
        if h[3] < 0:
            if area >= area_min:
                exteriores.append(s)
        elif area >= hueco_min:
            huecos.append(s)
    return exteriores, huecos, b


def rasterizar(polis, huecos, forma, escala=4):
    """Cobertura (0..1) de unos polígonos con huecos: se rellena a `escala`
    veces y se promedia por píxel."""
    H, W = forma
    g = np.zeros((H * escala, W * escala), np.uint8)
    q = lambda p: np.round(np.asarray(p) * escala * 16).astype(np.int32).reshape(-1, 1, 2)
    if polis:
        cv2.fillPoly(g, [q(p) for p in polis], 1, lineType=cv2.LINE_8, shift=4)
    if huecos:
        cv2.fillPoly(g, [q(p) for p in huecos], 0, lineType=cv2.LINE_8, shift=4)
    return g.reshape(H, escala, W, escala).mean(axis=(1, 3))


def error_simplificacion(binaria, polis, huecos):
    """IoU y desviación media del borde (px) entre la máscara y sus polígonos."""
    cob = rasterizar(polis, huecos, binaria.shape)
    m = binaria.astype(np.float32)
    inter = np.minimum(cob, m).sum()
    union = np.maximum(cob, m).sum()
    dif = np.abs(cob - m).sum()
    perim = sum(cv2.arcLength(np.asarray(p, np.float32).reshape(-1, 1, 2), True) for p in polis + huecos) or 1.0
    return {'iou': r2(inter / union if union else 1.0, 5), 'desviacionMediaBordePx': r2(dif / perim, 3),
            'areaMascaraPx': int(m.sum()), 'areaPoligonosPx': int(round(cob.sum()))}


def dentro_centros(poligono, x0, y0, x1, y1):
    """Máscara de los centros de píxel (i + 0,5, j + 0,5) dentro del polígono
    (regla par-impar, exacta) en la caja [x0, x1) × [y0, y1)."""
    xs = np.arange(x0, x1) + 0.5
    ys = np.arange(y0, y1) + 0.5
    X, Y = np.meshgrid(xs, ys)
    dentro = np.zeros(X.shape, bool)
    p = np.asarray(poligono, np.float64)
    for i in range(len(p)):
        xa, ya = p[i]
        xb, yb = p[(i + 1) % len(p)]
        if ya == yb:
            continue
        cruza = (ya > Y) != (yb > Y)
        xc = (xb - xa) * (Y - ya) / (yb - ya) + xa
        dentro ^= cruza & (X < xc)
    return dentro


def distancia_a_borde(px, py, poligono):
    p = np.asarray(poligono, np.float64)
    a = p
    b = np.roll(p, -1, axis=0)
    d = np.full(px.shape, np.inf)
    for (xa, ya), (xb, yb) in zip(a, b):
        dx, dy = xb - xa, yb - ya
        L = dx * dx + dy * dy or 1e-12
        t = np.clip(((px - xa) * dx + (py - ya) * dy) / L, 0, 1)
        d = np.minimum(d, np.hypot(px - (xa + t * dx), py - (ya + t * dy)))
    return d


def comprobar_afin(mascara_r, polis_px):
    """Contrasta la máscara de la GPU (R = índice + 1) con los polígonos
    proyectados a mano. Devuelve, por vivienda y en total, los píxeles en que
    difieren y a qué distancia del borde analítico cae su centro."""
    H, W = mascara_r.shape
    total_px = total_dif = 0
    dist_max = dist_dif = 0.0
    por = []
    for i, pol in enumerate(polis_px):
        p = np.asarray(pol)
        x0 = max(0, int(math.floor(p[:, 0].min())) - 2)
        x1 = min(W, int(math.ceil(p[:, 0].max())) + 2)
        y0 = max(0, int(math.floor(p[:, 1].min())) - 2)
        y1 = min(H, int(math.ceil(p[:, 1].max())) + 2)
        ana = dentro_centros(pol, x0, y0, x1, y1)
        gpu = mascara_r[y0:y1, x0:x1] == (i + 1)
        dif = ana ^ gpu
        n = int(dif.sum())
        dmax = 0.0
        if n:
            jj, ii = np.nonzero(dif)
            dmax = float(distancia_a_borde(ii + x0 + 0.5, jj + y0 + 0.5, pol).max())
        # distancia del centro de cada píxel de borde de la GPU al borde analítico
        cruz = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], np.uint8)
        borde = gpu & ~cv2.erode(gpu.astype(np.uint8), cruz).astype(bool)
        jj, ii = np.nonzero(borde)
        db = distancia_a_borde(ii + x0 + 0.5, jj + y0 + 0.5, pol) if len(ii) else np.zeros(1)
        por.append({'pixeles': int(gpu.sum()), 'distintos': n, 'distMaxDistintosPx': r2(dmax, 3), 'distMaxBordePx': r2(db.max(), 3)})
        total_px += int(gpu.sum())
        total_dif += n
        dist_max = max(dist_max, float(db.max()))
        dist_dif = max(dist_dif, dmax)
    return {
        'pixelesComparados': total_px,
        'pixelesDistintos': total_dif,
        'fraccionDistinta': r2(total_dif / total_px if total_px else 0, 7),
        'distMaxDistintosAlBordePx': r2(dist_dif, 4),
        'distMaxCentroBordeGPUaPoligonoPx': r2(dist_max, 3),
        'nota': 'La GPU pinta un píxel si su centro cae dentro del triángulo; aquí se aplica la misma regla al polígono proyectado a mano con la afín. '
                'Distintos = píxeles en que no coinciden; distMaxDistintosAlBordePx = lo lejos que está su centro del borde del polígono (≈ 0: empates '
                'de centros que caen justo sobre el borde, no un error de la transformación). distMaxCentroBordeGPUaPoligonoPx ≤ 1 px: cada píxel de borde '
                'de la GPU tiene el borde analítico a menos de un píxel de su centro.',
        'porVivienda': por,
    }


def centroide_poligono(p):
    p = np.asarray(p, np.float64)
    x, y = p[:, 0], p[:, 1]
    x1, y1 = np.roll(x, -1), np.roll(y, -1)
    cr = x * y1 - x1 * y
    a = cr.sum() / 2
    if abs(a) < 1e-9:
        return float(x.mean()), float(y.mean())
    return float(((x + x1) * cr).sum() / (6 * a)), float(((y + y1) * cr).sum() / (6 * a))


def punto_interior(p, forma):
    """Centroide si cae dentro y lejos del borde; si no, el punto más alejado
    del borde (máximo de la transformada de distancia)."""
    cx, cy = centroide_poligono(p)
    c = np.asarray(p, np.float32).reshape(-1, 1, 2)
    d = cv2.pointPolygonTest(c, (cx, cy), True)
    H, W = forma
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.round(np.asarray(p) * 16).astype(np.int32).reshape(-1, 1, 2)], 1, shift=4)
    dt = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    if d >= 0.5 * dt.max():
        return cx, cy
    j, i = np.unravel_index(np.argmax(dt), dt.shape)
    return i + 0.5, j + 0.5


def mat4(lista):
    """Matriz de three.js (toArray, por columnas) → numpy 4×4."""
    return np.array(lista, np.float64).reshape(4, 4).T


def proyectar(camara, puntos):
    P, V = mat4(camara['proyeccion']), mat4(camara['vista'])
    out = []
    for x, y, z in puntos:
        c = P @ V @ np.array([x, y, z, 1.0])
        n = c[:3] / c[3]
        out.append([(n[0] + 1) / 2 * camara['ancho'], (1 - n[1]) / 2 * camara['alto']])
    return out


def lista_px(p, n=1):
    return [[r2(x, n), r2(y, n)] for x, y in np.asarray(p).tolist()]


def fuente(tam):
    for r in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf']:
        if os.path.exists(r):
            return ImageFont.truetype(r, tam)
    return ImageFont.load_default()


def superponer(base, capas, salida, recortes=None, escala_recorte=3):
    """PNG de comprobación: la imagen con los polígonos encima (relleno
    translúcido y borde de 1 px) y, si se piden, recortes ampliados al píxel."""
    im = base.convert('RGBA')
    velo = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(velo)
    for capa in capas:
        col = capa['color']
        for p in capa['poligonos']:
            pts = [tuple(v) for v in p]
            if len(pts) >= 3:
                d.polygon(pts, fill=col + (capa.get('alfa', 70),))
    im = Image.alpha_composite(im, velo)
    d = ImageDraw.Draw(im)
    for capa in capas:
        col = capa['color']
        for p in capa['poligonos']:
            pts = [tuple(v) for v in p]
            if len(pts) >= 2:
                d.line(pts + [pts[0]], fill=col + (255,), width=capa.get('grosor', 1))
        for (x, y, texto) in capa.get('etiquetas', []):
            f = fuente(capa.get('tamTexto', 18))
            d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=col + (255,), outline=(255, 255, 255, 255), width=2)
            if texto:
                d.text((x + 9, y - 10), texto, fill=(20, 20, 20, 255), font=f, stroke_width=3, stroke_fill=(255, 255, 255, 255))
    im = im.convert('RGB')
    im.save(salida)
    hechos = [salida]
    for k, (x0, y0, x1, y1) in enumerate(recortes or []):
        r = im.crop((x0, y0, x1, y1)).resize(((x1 - x0) * escala_recorte, (y1 - y0) * escala_recorte), Image.NEAREST)
        ruta = salida.replace('.png', f'-zoom{k + 1}.png')
        r.save(ruta)
        hechos.append(ruta)
    return hechos


# ───────────────────────────── vistas ─────────────────────────────
def versiones(hechos, base, ancho):
    out = {'escritorio': {}, 'movil': {}}
    for nombre, h in hechos.items():
        clave = 'movil' if nombre.startswith(base + '-m.') else ('escritorio' if re.match(re.escape(base) + r'\.(jpg|webp)$', nombre) else None)
        if not clave:
            continue
        ext = nombre.rsplit('.', 1)[1]
        out[clave][ext] = nombre
        out[clave]['ancho'], out[clave]['alto'] = h['ancho'], h['alto']
        out[clave]['escala'] = r2(h['ancho'] / ancho, 6)
    return out


def camara_publica(c):
    claves = ['tipo', 'ancho', 'alto', 'posicion', 'objetivo', 'fov', 'arriba', 'x0', 'z0', 's', 'cerca', 'lejos']
    d = {k: c[k] for k in claves if k in c}
    if c.get('especificacion', {}).get('camara', {}).get('pose'):
        d['pose'] = c['especificacion']['camara']['pose']
    if c.get('especificacion', {}).get('sol'):
        d['sol'] = c['especificacion']['sol']
    return d


def borde_superior(mascara_edificio, imagen, ventana=6, umbral=18):
    """Desfase entre el borde superior del edificio en la máscara y el borde
    más fuerte de la imagen en esa columna (luminancia, gradiente vertical).
    Mide que máscara e imagen salen de la misma proyección."""
    L = cv2.cvtColor(imagen, cv2.COLOR_RGB2GRAY).astype(np.float32)
    g = np.abs(np.diff(L, axis=0))      # g[y] = |L[y+1] − L[y]|: borde entre y e y+1
    H, W = mascara_edificio.shape
    desf = []
    for x in range(2, W - 2):
        col = np.nonzero(mascara_edificio[:, x])[0]
        if not len(col):
            continue
        y = int(col[0])                  # primer píxel de edificio: el borde está entre y−1 e y
        if y < ventana + 1 or y > H - ventana - 2:
            continue
        if not mascara_edificio[y:y + 4, x].all():
            continue
        tramo = g[y - 1 - ventana:y - 1 + ventana + 1, x]
        k = int(np.argmax(tramo))
        if tramo[k] < umbral:
            continue
        desf.append(k - ventana)         # 0 = el salto de la imagen está justo en el borde de la máscara
    desf = np.asarray(desf)
    if not len(desf):
        return {'columnas': 0}
    return {
        'columnas': int(len(desf)),
        'desfaseMedianaPx': r2(np.median(desf), 2),
        'desfaseMedioAbsPx': r2(np.abs(desf).mean(), 3),
        'columnasConDesfase0': r2((desf == 0).mean(), 4),
        'columnasConDesfaseMax1': r2((np.abs(desf) <= 1).mean(), 4),
        'nota': 'Por cada columna se busca, ±6 px alrededor del borde superior del edificio en la máscara, el salto de luminancia más fuerte de la imagen (fondo → edificio).',
    }


def perfil_borde(mascara, imagen, kmax=4):
    """Contraste de la imagen a través del borde de una máscara, desplazando
    la medida k píxeles a lo largo de la normal: D(k) = media de |I(p + k·n) −
    I(p + n + k·n)| sobre todos los pares (p dentro, p + n fuera) del borde, en
    las cuatro direcciones. Si máscara e imagen salen de la misma proyección,
    el salto de la imagen está justo en el borde de la máscara y D es máximo
    en k = 0. Devuelve el perfil normalizado y el k del máximo."""
    I = imagen.astype(np.float32)
    B = mascara.astype(bool)
    H, W = B.shape
    m = kmax + 2
    suma = np.zeros(2 * kmax + 1)
    pares = 0
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        q = np.zeros_like(B)
        q[m:H - m, m:W - m] = B[m:H - m, m:W - m] & ~B[m + dy:H - m + dy, m + dx:W - m + dx]
        jj, ii = np.nonzero(q)
        if not len(ii):
            continue
        pares += len(ii)
        for k in range(-kmax, kmax + 1):
            a = I[jj + k * dy, ii + k * dx]
            b = I[jj + (k + 1) * dy, ii + (k + 1) * dx]
            suma[k + kmax] += np.abs(a - b).sum(axis=1).sum()
    if not pares:
        return {'pares': 0}
    D = suma / pares
    return {
        'pares': int(pares),
        'desfasePicoPx': int(np.argmax(D) - kmax),
        'perfil': {str(k): r2(D[k + kmax] / D.max(), 3) for k in range(-kmax, kmax + 1)},
        'nota': 'Contraste medio de la imagen entre píxeles vecinos a través del borde de la máscara, desplazado k px hacia fuera (k > 0) o hacia dentro (k < 0); 1 = máximo. Pico en k = 0: el borde de la máscara cae exactamente sobre el borde visible.',
    }


def procesar_conjunto(brutos, salida, comprob):
    cam = leer_json(os.path.join(brutos, 'conjunto-camara.json'))
    img = Image.open(os.path.join(brutos, 'conjunto.png')).convert('RGB')
    m = rgb(os.path.join(brutos, 'conjunto-mascara-edificios.png'))
    hechos = exportar(img, salida, 'conjunto')
    apolo = (m[:, :, 0] > 127) & (m[:, :, 1] < 128)
    ex, hu, b = contornos(apolo, eps=1.0, area_min=400, hueco_min=400)
    edificios = [{
        'id': 'apolo', 'numero': 1, 'nombre': 'Apolo', 'poligonos': [lista_px(p) for p in ex],
        'chincheta': lista_px(proyectar(cam, [[66.72, 24.28 + 4.0, -23.94]]))[0],
        'verificacion': error_simplificacion(b, ex, hu),
    }]
    # Otros edificios SERENEA: B = número de grupo (captura.js los separa en planta).
    grupos = {g['grupo']: g for g in cam.get('gruposSerenea', [])}
    cA = [66.72, -23.94]
    candidatos = []
    for gnum, g in sorted(grupos.items()):
        mg = (m[:, :, 1] == 255) & (m[:, :, 0] == 0) & (m[:, :, 2] == gnum)
        if mg.sum() < 2000:
            continue
        exi, hui, bi = contornos(mg, eps=1.0, area_min=400, hueco_min=400)
        if not exi:
            continue
        ys, xs = np.nonzero(mg)
        k = g['caja']
        cx, cz = (k['x0'] + k['x1']) / 2, (k['z0'] + k['z1']) / 2
        dx, dz = cx - cA[0], cz - cA[1]
        rumbo = ('sur' if dz > 0 else 'norte') if abs(dz) > abs(dx) else ('este' if dx > 0 else 'oeste')
        sup = int(ys.min())
        candidatos.append({
            'poligonos': [lista_px(p) for p in exi], 'areaPx': int(mg.sum()),
            'chincheta': [r2(xs[ys <= sup + 3].mean(), 1), r2(sup, 1)],
            'mundo': {'centro': [r2(cx, 1), r2(cz, 1)], 'caja': k, 'huellaM2': g['huellaM2'],
                      'situacion': f'al {rumbo} de Apolo, a {round(math.hypot(dx, dz))} m de su centro'},
        })
    # Número probable por la disposición del fotograma 1 del storyboard (vista
    # desde el mismo lado): a la izquierda de Apolo y en su eje el 4 (Hera, que
    # el fotograma 2 enseña al fondo a la izquierda), más a la izquierda el 5,
    # a la derecha arriba el 2 y abajo el 3. POR CONFIRMAR con el cliente.
    izq = sorted([c for c in candidatos if c['chincheta'][0] < edificios[0]['chincheta'][0]], key=lambda c: -c['chincheta'][0])
    der = sorted([c for c in candidatos if c['chincheta'][0] >= edificios[0]['chincheta'][0]], key=lambda c: c['chincheta'][1])
    probable = {}
    for c, n in zip(izq, [4, 5]):
        probable[id(c)] = n
    for c, n in zip(der, [2, 3]):
        probable[id(c)] = n
    for k, c in enumerate(candidatos):
        n = probable.get(id(c))
        edificios.append({'id': f'serenea-{chr(97 + k)}', 'numero': None, 'numeroProbable': n,
                          'nombre': None, 'nombreProbable': 'Hera' if n == 4 else None, **c,
                          'nota': 'Volumen del entorno con acabados SERENEA. Número deducido de la disposición del storyboard (fotogramas 1, 2 y 8): POR CONFIRMAR con el cliente.'})
    verif = {'apoloContornoFrenteAImagen': perfil_borde(apolo, np.array(img))}
    datos = {
        'imagen': 'conjunto', 'ancho': cam['ancho'], 'alto': cam['alto'],
        'sistema': 'Píxeles de la imagen de escritorio (ancho × alto), origen arriba a la izquierda. Para la versión -m, multiplicar por versiones.movil.escala o usar un SVG con viewBox="0 0 ancho alto".',
        'provisional': True, 'origen': 'Captura del modelo BIM (three.js), no es el render definitivo.',
        'versiones': versiones(hechos, 'conjunto', cam['ancho']), 'camara': camara_publica(cam), 'edificios': edificios,
        'verificacion': verif,
    }
    escribir_json(os.path.join(salida, 'conjunto.json'), datos)
    capas = [{'color': (255, 40, 40), 'poligonos': edificios[0]['poligonos'], 'grosor': 2, 'etiquetas': [tuple(edificios[0]['chincheta']) + ('1 Apolo',)]}]
    capas += [{'color': (20, 170, 60), 'poligonos': e['poligonos'], 'grosor': 2, 'etiquetas': [tuple(e['chincheta']) + (e['id'],)]} for e in edificios[1:]]
    pngs = superponer(img, capas, os.path.join(comprob, 'conjunto-comprobacion.png'))
    return datos, hechos, pngs


def procesar_edificio(brutos, salida, comprob):
    cam = leer_json(os.path.join(brutos, 'edificio-camara.json'))
    img = Image.open(os.path.join(brutos, 'edificio.png')).convert('RGB')
    arr = np.array(img)
    m = rgb(os.path.join(brutos, 'edificio-mascara-plantas.png'))
    hechos = exportar(img, salida, 'edificio')
    plantas, capas, verif = [], [], {}
    area_min = 0.00006 * cam['ancho'] * cam['alto']   # ≈ 190 px a 2400×1350: fuera recortes sueltos
    for N in NIVELES:
        b = np.all(m == np.array(N['color'], np.uint8), axis=2)
        ex, hu, bl = contornos(b, eps=0.9, area_min=area_min, hueco_min=area_min)
        ex.sort(key=lambda p: -abs(cv2.contourArea(p)))
        e = error_simplificacion(bl, ex, hu)
        verif[N['nombre']] = {**e, 'poligonos': len(ex), 'huecos': len(hu),
                              'vertices': int(sum(len(p) for p in ex + hu))}
        xs = np.concatenate([p[:, 0] for p in ex]) if ex else np.zeros(1)
        ys = np.concatenate([p[:, 1] for p in ex]) if ex else np.zeros(1)
        plantas.append({
            'nivel': N['nivel'], 'clave': N['clave'], 'nombre': N['nombre'],
            'poligonos': [lista_px(p) for p in ex], 'huecos': [lista_px(p) for p in hu],
            'caja': [r2(xs.min(), 1), r2(ys.min(), 1), r2(xs.max(), 1), r2(ys.max(), 1)],
            'areaPx': e['areaMascaraPx'],
        })
        capas.append({'color': N['color'], 'poligonos': [lista_px(p) for p in ex], 'alfa': 60, 'grosor': 2})
    edificio = np.any(m != 0, axis=2)
    verif['siluetaFrenteAImagen'] = perfil_borde(edificio, arr)
    me = rgb(os.path.join(brutos, 'edificio-mascara-edificios.png'))
    verif['siluetaFrenteAImagen']['iguales'] = bool(np.array_equal(edificio, (me[:, :, 0] > 127) & (me[:, :, 1] < 128)))
    datos = {
        'imagen': 'edificio', 'ancho': cam['ancho'], 'alto': cam['alto'],
        'sistema': 'Píxeles de la imagen de escritorio (ancho × alto), origen arriba a la izquierda, continuos. '
                   'Para la versión -m, multiplicar por versiones.movil.escala o usar un SVG con viewBox="0 0 ancho alto". '
                   'Cada planta puede tener varios polígonos (el edificio se escalona y el arbolado lo interrumpe); '
                   '«huecos» son agujeros interiores: dibujar exteriores y huecos en el mismo <path> con fill-rule="evenodd".',
        'provisional': True, 'origen': 'Captura del modelo BIM (three.js), no es el render definitivo.',
        'versiones': versiones(hechos, 'edificio', cam['ancho']), 'camara': camara_publica(cam),
        'chincheta': lista_px(proyectar(cam, [[66.72, 24.28 + 3.0, -23.94]]))[0],
        'criterio': 'Cada fragmento visible del edificio se asigna a la planta cuyo suelo (mínimo de las viviendas de esa planta en su cajón, '
                    'data/viviendas_serenea.json, −0,15 m para que el canto del forjado vaya con la planta que pisa encima) queda por debajo; '
                    'por encima del ático + 2,95 m (cubierta, casetones) y por debajo de la planta 1 (zócalo) no hay planta. '
                    'Lo que tapa el edificio (árboles, farolas) recorta la planta, igual que en la imagen.',
        'limitesNivel': cam.get('limitesNivel'),
        'plantas': plantas, 'verificacion': verif,
    }
    escribir_json(os.path.join(salida, 'edificio-plantas.json'), datos)
    W, H = cam['ancho'], cam['alto']
    recortes = [(int(W * 0.50), int(H * 0.30), int(W * 0.50) + 300, int(H * 0.30) + 220),
                (int(W * 0.84), int(H * 0.36), int(W * 0.84) + 300, int(H * 0.36) + 220)]
    pngs = superponer(img, capas, os.path.join(comprob, 'edificio-comprobacion.png'), recortes=recortes)
    return datos, hechos, pngs


def procesar_planta(brutos, salida, comprob, nombre='planta-2'):
    cam = leer_json(os.path.join(brutos, f'{nombre}-camara.json'))
    img = Image.open(os.path.join(brutos, f'{nombre}.png')).convert('RGB')
    arr = np.array(img)
    mr = rgb(os.path.join(brutos, f'{nombre}-mascara-viviendas.png'))[:, :, 0]
    viv = leer_json(os.path.join(RAIZ, 'data', 'viviendas_serenea.json'))['viviendas']
    estados = leer_json(os.path.join(RAIZ, 'data', 'availability.json'))
    units = {u['id']: u for u in leer_json(os.path.join(RAIZ, 'data', 'units.json'))}
    t = cam['transformacion']
    a, b, c, d = t['a'], t['b'], t['c'], t['d']
    ids = cam['ordenViviendas']
    clave_planta = cam.get('especificacion', {}).get('planta', 'p1')
    polis = [[[a * x + c, b * z + d] for x, z in viv[i]['poligono']] for i in ids]
    verif = comprobar_afin(mr, polis)
    verif['contornosFrenteAImagen'] = perfil_borde(mr > 0, arr)
    hechos = exportar(img, salida, nombre)
    fondo = arr[2, 2].tolist()
    lista = []
    for i, p in zip(ids, polis):
        cx, cy = punto_interior(p, arr.shape[:2])
        u = units.get(i, {})
        lista.append({'id': i, 'estado': estados.get(i), 'dormitorios': u.get('dorm'), 'puntos': lista_px(p, 2), 'centroide': [r2(cx, 1), r2(cy, 1)]})
    datos = {
        'imagen': nombre, 'ancho': cam['ancho'], 'alto': cam['alto'], 'planta': clave_planta,
        'nivel': next(N['nivel'] for N in NIVELES if N['clave'] == clave_planta),
        'sistema': 'Píxeles de la imagen de escritorio (ancho × alto), origen arriba a la izquierda, continuos. Norte arriba (−z del SketchUp). '
                   'Para la versión -m, multiplicar por versiones.movil.escala o usar un SVG con viewBox="0 0 ancho alto".',
        'provisional': True, 'origen': 'Captura ortográfica del modelo BIM cortado por su planta (three.js), no es el render definitivo.',
        'fondo': '#%02x%02x%02x' % tuple(fondo),
        'versiones': versiones(hechos, nombre, cam['ancho']), 'camara': camara_publica(cam),
        'transformacion': {
            'descripcion': 'px = a·x + c ; py = b·z + d, con [x, z] del polígono de data/viviendas_serenea.json (metros del SketchUp). Exacta: es la proyección ortográfica de la cámara.',
            'a': r2(a, 6), 'b': r2(b, 6), 'c': r2(c, 6), 'd': r2(d, 6),
            'pxPorMetro': r2(a, 6),
        },
        'estadoNota': '«estado» es la semilla de data/availability.json, solo para las maquetas: la web lee el estado vivo del panel.',
        'viviendas': lista, 'verificacion': verif,
    }
    escribir_json(os.path.join(salida, f'{nombre}-viviendas.json'), datos)
    col = {'disponible': (30, 160, 70), 'reservada': (230, 150, 20), 'vendida': (200, 40, 40)}
    capas = []
    for v in lista:
        capas.append({'color': col.get(v['estado'], (60, 60, 200)), 'poligonos': [v['puntos']], 'alfa': 45, 'grosor': 1,
                      'etiquetas': [(v['centroide'][0], v['centroide'][1], v['id'])], 'tamTexto': 14})
    W = cam['ancho']
    pngs = superponer(img, capas, os.path.join(comprob, f'{nombre}-comprobacion.png'),
                      recortes=[(80, 60, 380, 300), (W // 2 - 150, 280, W // 2 + 150, 520)], escala_recorte=4)
    return datos, hechos, pngs


# ─────────────── estancias de una vivienda ───────────────
def leer_ficha(id_):
    ruta = os.path.join(RAIZ, 'assets', 'fichas', f'{id_}.pdf')
    txt = subprocess.run(['pdftotext', '-layout', ruta, '-'], capture_output=True, text=True, check=True).stdout
    estancias, constr = [], {}
    for linea in txt.splitlines():
        r = re.match(r'^\s*(.+?)\s{2,}(\d+[.,]\d+)\s*m2\s*$', linea)
        if not r:
            continue
        nombre, m2 = r.group(1).strip(), float(r.group(2).replace(',', '.'))
        if nombre.lower().startswith('superficie'):
            constr[nombre] = m2
        else:
            estancias.append({'nombre': nombre, 'm2': m2})
    ref = re.search(r'Ref\.\s*([A-Z]+-\d+)', txt)
    return {'estancias': estancias, 'superficies': constr, 'referencia': ref.group(1) if ref else None}


def tipo_ficha(nombre):
    n = nombre.lower()
    if re.search(r'sal[oó]n|cocina|comedor|estar', n):
        return 'salon'
    if 'dormitorio' in n:
        return 'dormitorio'
    if re.search(r'ba[nñ]o|aseo', n):
        return 'bano'
    if 'terraza' in n:
        return 'terraza'
    return 'otro'


RE_COCINA = re.compile(r'DEKTON|Induccion|Horno|Cromo_cocina|V4_Acero', re.I)
RE_SANITARIO = re.compile(r'Ceramica_blanca_sanitarios|Vidrio_mampara|Cromo_sanitarios', re.I)


def procesar_vivienda(brutos, salida, comprob, id_):
    nombre = f'vivienda-{id_}'
    cam = leer_json(os.path.join(brutos, f'{nombre}-camara.json'))
    img = Image.open(os.path.join(brutos, f'{nombre}.png')).convert('RGB')
    arr = np.array(img)
    mr = rgb(os.path.join(brutos, f'{nombre}-mascara-viviendas.png'))[:, :, 0]
    viv = leer_json(os.path.join(RAIZ, 'data', 'viviendas_serenea.json'))['viviendas'][id_]
    t = cam['transformacion']
    a, b, c, d = t['a'], t['b'], t['c'], t['d']
    aPx = lambda x, z: [a * x + c, b * z + d]
    contorno = [aPx(x, z) for x, z in viv['poligono']]
    verif = {'contorno': comprobar_afin(mr, [contorno]), 'contornoFrenteAImagen': perfil_borde(mr > 0, arr)}

    # Rejilla de 2,5 cm en el marco del SketchUp: tabiques y puertas de la
    # sección a +1,0 m del suelo, y la huella de la vivienda.
    E = cam['estancias']
    R = 0.025
    caja = E['caja']
    gx0, gz0 = caja['x0'], caja['z0']
    GW, GH = int(math.ceil((caja['x1'] - gx0) / R)), int(math.ceil((caja['z1'] - gz0) / R))
    aG = lambda x, z: (int(round((x - gx0) / R)), int(round((z - gz0) / R)))
    libre = np.zeros((GH, GW), np.uint8)
    cv2.fillPoly(libre, [np.array([aG(x, z) for x, z in viv['poligono']], np.int32)], 1)
    seg = E['secciones'][sorted(E['secciones'].keys())[0]]
    for s in seg:
        cv2.line(libre, aG(s[0], s[1]), aG(s[2], s[3]), 0, 2)
    n, lab, st, _ = cv2.connectedComponentsWithStats(libre, connectivity=4)
    comps = [i for i in range(1, n) if st[i, 4] * R * R >= 0.8]

    # Mobiliario rasterizado en la misma rejilla.
    mob = E['mobiliario']
    nombres = mob['nombres']
    cocina = np.zeros((GH, GW), np.uint8)
    sanit = np.zeros((GH, GW), np.uint8)
    obst = np.zeros((GH, GW), np.uint8)
    y0 = E['y0']
    for tri in mob['triangulos']:
        mat = nombres[tri[0]]
        pts = np.array([aG(tri[1] / 100, tri[2] / 100), aG(tri[3] / 100, tri[4] / 100), aG(tri[5] / 100, tri[6] / 100)], np.int32)
        ymax = tri[7] / 100
        if RE_COCINA.search(mat):
            cv2.fillConvexPoly(cocina, pts, 1)
        if RE_SANITARIO.search(mat):
            cv2.fillConvexPoly(sanit, pts, 1)
        if ymax > y0 + 0.25 and not re.search(r'Puertas interiores|Aluminio plata|vidrio', mat, re.I):
            cv2.fillConvexPoly(obst, pts, 1)

    medidas = []
    for i in comps:
        m = lab == i
        area = st[i, 4] * R * R
        tipo = 'salon' if (cocina[m].sum() * R * R) > 0.3 else ('bano' if (sanit[m].sum() * R * R) > 0.05 else ('dormitorio' if area >= 5.0 else 'otro'))
        medidas.append({'comp': i, 'area': area, 'tipo': tipo})

    ficha = leer_ficha(id_)
    asignadas = []
    for tipo in ['salon', 'dormitorio', 'bano', 'terraza', 'otro']:
        fs = sorted([e for e in ficha['estancias'] if tipo_ficha(e['nombre']) == tipo], key=lambda e: -e['m2'])
        ms = sorted([e for e in medidas if e['tipo'] == tipo], key=lambda e: -e['area'])
        for f, mm in zip(fs, ms):
            asignadas.append({**mm, 'nombre': f['nombre'], 'm2Ficha': f['m2']})
        for mm in ms[len(fs):]:
            asignadas.append({**mm, 'nombre': None, 'm2Ficha': None})
    # Puntos: el sitio de suelo libre más holgado de cada estancia (lejos de
    # tabiques y muebles), tirando un poco hacia su centro. El salón-comedor-
    # cocina lleva dos: «Salón» (lejos de la cocina) y «Cocina» (delante de la
    # encimera).
    def a_px_grid(i, j):
        return aPx(gx0 + (i + 0.5) * R, gz0 + (j + 0.5) * R)

    def mejor(region, centro=None, peso=0.25):
        dt = cv2.distanceTransform((region & (obst == 0)).astype(np.uint8), cv2.DIST_L2, 5) * R
        if dt.max() <= 0:
            dt = cv2.distanceTransform(region.astype(np.uint8), cv2.DIST_L2, 5) * R
        jj, ii = np.mgrid[0:GH, 0:GW]
        if centro is None:
            ys, xs = np.nonzero(region)
            centro = (xs.mean(), ys.mean())
        pen = np.hypot(ii - centro[0], jj - centro[1]) * R
        sc = np.where(region, np.minimum(dt, 0.9) - peso * pen, -1e9)
        j, i = np.unravel_index(np.argmax(sc), sc.shape)
        return i, j, float(dt[j, i])

    estancias, sinPunto = [], []
    for e in asignadas:
        m = lab == e['comp']
        cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cpx = max(cs, key=cv2.contourArea).reshape(-1, 2).astype(np.float64)
        cpx = cv2.approxPolyDP(cpx.astype(np.float32).reshape(-1, 1, 2), 1.5, True).reshape(-1, 2)
        pol = [aPx(gx0 + (i + 0.5) * R, gz0 + (j + 0.5) * R) for i, j in cpx]
        comun = {'superficieFicha': e['m2Ficha'], 'superficieMedida': r2(e['area'], 2), 'tipo': e['tipo'], 'poligono': lista_px(pol, 1)}
        if e['tipo'] == 'otro':
            sinPunto.append({'nombre': e['nombre'], **comun})
            continue
        if e['tipo'] == 'salon':
            dk = cv2.distanceTransform((cocina == 0).astype(np.uint8), cv2.DIST_L2, 5) * R
            zona_salon = m & (dk > 1.8)
            i, j, holgura = mejor(zona_salon if zona_salon.any() else m)
            px, py = a_px_grid(i, j)
            estancias.append({'nombre': 'Salón - comedor', 'x': r2(px, 1), 'y': r2(py, 1), 'estimada': False,
                              'metodo': 'suelo libre más holgado del salón, a más de 1,8 m de la cocina', 'holguraM': r2(holgura, 2),
                              'estanciaFicha': e['nombre'], **comun})
            kc = (cocina > 0) & cv2.dilate(m.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
            ys, xs = np.nonzero(kc)
            delante = m & (dk > 0.5) & (dk < 1.3)
            i, j, holgura = mejor(delante, centro=(xs.mean(), ys.mean()), peso=0.6)
            px, py = a_px_grid(i, j)
            estancias.append({'nombre': 'Cocina', 'x': r2(px, 1), 'y': r2(py, 1), 'estimada': False,
                              'metodo': 'delante del centro de la encimera (mobiliario de cocina del modelo), a 0,5–1,3 m de ella', 'holguraM': r2(holgura, 2),
                              'estanciaFicha': e['nombre'], 'superficieFicha': e['m2Ficha'], 'tipo': 'cocina'})
            continue
        i, j, holgura = mejor(m)
        px, py = a_px_grid(i, j)
        estancias.append({'nombre': e['nombre'] or e['tipo'], 'x': r2(px, 1), 'y': r2(py, 1), 'estimada': e['nombre'] is None,
                          'metodo': 'suelo libre más holgado de la estancia (sección del modelo a +1,0 m)', 'holguraM': r2(holgura, 2), **comun})
    orden = {'salon': 0, 'cocina': 1, 'dormitorio': 2, 'bano': 3, 'terraza': 4}
    estancias.sort(key=lambda e: (orden.get(e['tipo'], 9), -(e.get('superficieFicha') or 0)))

    hechos = exportar(img, salida, nombre)
    # Variante aislada: fuera de la vivienda (huella + 30 cm de muro), velo del color de fondo.
    fondo = arr[2, 2].astype(np.float32)
    huella = np.zeros(arr.shape[:2], np.uint8)
    cv2.fillPoly(huella, [np.round(np.asarray(contorno) * 16).astype(np.int32).reshape(-1, 1, 2)], 1, shift=4)
    k = int(round(0.30 * a)) * 2 + 1
    huella = cv2.dilate(huella, np.ones((k, k), np.uint8))
    suave = cv2.GaussianBlur(huella.astype(np.float32), (0, 0), 2.0)[:, :, None]
    aisl = arr.astype(np.float32) * suave + (arr.astype(np.float32) * 0.12 + fondo * 0.88) * (1 - suave)
    img_a = Image.fromarray(np.clip(aisl, 0, 255).astype(np.uint8))
    hechos.update(exportar(img_a, salida, f'{nombre}-aislada'))

    xs = [p[0] for p in contorno]
    ys = [p[1] for p in contorno]
    datos = {
        'imagen': nombre, 'imagenAislada': f'{nombre}-aislada', 'id': id_, 'referencia': ficha['referencia'],
        'ancho': cam['ancho'], 'alto': cam['alto'],
        'sistema': 'Píxeles de la imagen de escritorio (ancho × alto), origen arriba a la izquierda, continuos. Norte arriba, misma orientación que la planta. '
                   'Para la versión -m, multiplicar por versiones.movil.escala o usar un SVG con viewBox="0 0 ancho alto".',
        'provisional': True, 'origen': 'Captura ortográfica del modelo BIM cortado por su planta (three.js), no es el render definitivo.',
        'fondo': '#%02x%02x%02x' % tuple(int(v) for v in fondo),
        'versiones': versiones(hechos, nombre, cam['ancho']), 'camara': camara_publica(cam),
        'transformacion': {'descripcion': 'px = a·x + c ; py = b·z + d (metros del SketchUp)', 'a': r2(a, 6), 'b': r2(b, 6), 'c': r2(c, 6), 'd': r2(d, 6), 'pxPorMetro': r2(a, 6)},
        'contorno': lista_px(contorno, 2), 'cajaContorno': [r2(min(xs), 1), r2(min(ys), 1), r2(max(xs), 1), r2(max(ys), 1)],
        'superficies': ficha['superficies'],
        'estancias': estancias, 'sinPunto': sinPunto,
        'estanciasNota': 'Estancias separadas con la sección horizontal del modelo a +1,0 m del suelo (tabiques y hojas de puerta) dentro del contorno de la vivienda; '
                         'tipo por el mobiliario que contienen (encimera → salón-cocina, sanitarios → baño, ≥ 5 m² → dormitorio) y nombre de la ficha comercial '
                         '(assets/fichas/<id>.pdf) por tipo y orden de superficie. La superficie medida sale ~5 % menor que la de la ficha porque la rejilla pierde el grueso de las líneas.',
        'verificacion': verif,
    }
    escribir_json(os.path.join(salida, f'{nombre}.json'), datos)
    capas = [{'color': (40, 90, 220), 'poligonos': [lista_px(contorno)], 'alfa': 0, 'grosor': 2}]
    pal = [(220, 60, 60), (230, 140, 30), (40, 160, 90), (130, 70, 200), (20, 150, 190), (200, 60, 160), (110, 110, 110)]
    for k, e in enumerate([e for e in estancias if 'poligono' in e] + sinPunto):
        capas.append({'color': pal[k % len(pal)], 'poligonos': [e['poligono']], 'alfa': 50, 'grosor': 1})
    capas.append({'color': (230, 30, 60), 'poligonos': [], 'etiquetas': [(e['x'], e['y'], e['nombre']) for e in estancias], 'tamTexto': 22})
    pngs = superponer(img, capas, os.path.join(comprob, f'{nombre}-comprobacion.png'), recortes=[(60, 60, 360, 300)], escala_recorte=4)
    return datos, hechos, pngs


def copiar_fotos(salida):
    """Fotos existentes que sirven en /nuevo, optimizadas."""
    hechos = {}
    hero = Image.open(os.path.join(RAIZ, 'assets', 'hero_obra.jpg')).convert('RGB')
    hechos.update(exportar(hero, salida, 'obra'))
    return hechos


def derivadas(brutos, salida):
    """Recortes del render del edificio que las maquetas necesitan: imagen
    del panel de vivienda («Render Apolo (fijo)» del storyboard) y portada
    para compartir el enlace (1200 × 630)."""
    hechos = {}
    im = Image.open(os.path.join(brutos, 'edificio.png')).convert('RGB')
    W, H = im.size

    def caja(cx, cy, w, aspecto):
        """Recorte de ancho w y proporción `aspecto` centrado en (cx, cy) y
        metido dentro de la imagen sin deformar."""
        w = min(w, W, int(H * aspecto))
        h = int(round(w / aspecto))
        x0 = int(min(max(0, cx - w / 2), W - w))
        y0 = int(min(max(0, cy - h / 2), H - h))
        return (x0, y0, x0 + w, y0 + h)

    # panel 4:3 sobre la fachada larga (fracciones de la imagen)
    panel = im.crop(caja(W * 0.64, H * 0.43, int(W * 0.48), 4 / 3)).resize((1200, 900), Image.LANCZOS)
    hechos.update(exportar(panel, salida, 'panel-apolo', ancho_movil=10 ** 6))
    og = im.crop(caja(W * 0.55, H * 0.45, int(W * 0.78), 1200 / 630)).resize((1200, 630), Image.LANCZOS)
    og.save(os.path.join(salida, 'og-nuevo.jpg'), 'JPEG', quality=84, optimize=True, progressive=True)
    hechos['og-nuevo.jpg'] = {'ancho': 1200, 'alto': 630, 'bytes': os.path.getsize(os.path.join(salida, 'og-nuevo.jpg')), 'calidad': 84}
    return hechos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--brutos', required=True)
    ap.add_argument('--salida', default=os.path.join(RAIZ, 'nuevo', 'estilos', 'img'))
    ap.add_argument('--comprobacion', default=None)
    ap.add_argument('--vivienda', default=None, help='ids separados por comas (por defecto, todas las capturadas)')
    args = ap.parse_args()
    comprob = args.comprobacion or os.path.join(args.brutos, 'comprobacion')
    os.makedirs(args.salida, exist_ok=True)
    os.makedirs(comprob, exist_ok=True)
    resumen = {'ficheros': {}, 'comprobacion': [], 'verificacion': {}}
    tareas = [('conjunto', lambda: procesar_conjunto(args.brutos, args.salida, comprob)),
              ('edificio', lambda: procesar_edificio(args.brutos, args.salida, comprob))]
    for f in sorted(os.listdir(args.brutos)):
        r = re.match(r'^(planta-[\w-]+)-camara\.json$', f)
        if r:
            tareas.append((r.group(1), (lambda n: lambda: procesar_planta(args.brutos, args.salida, comprob, n))(r.group(1))))
        r = re.match(r'^vivienda-(\w+)-camara\.json$', f)
        if r and (not args.vivienda or r.group(1) in args.vivienda.split(',')):
            tareas.append((f'vivienda-{r.group(1)}', (lambda i: lambda: procesar_vivienda(args.brutos, args.salida, comprob, i))(r.group(1))))
    for nombre, fn in tareas:
        if not os.path.exists(os.path.join(args.brutos, f'{nombre}.png')):
            print('falta', nombre)
            continue
        datos, hechos, pngs = fn()
        resumen['ficheros'].update(hechos)
        resumen['comprobacion'] += pngs
        v = datos.get('verificacion', {})
        if 'porVivienda' in v:
            v = {k: w for k, w in v.items() if k != 'porVivienda'}
        if 'contorno' in v:
            v = {**v, 'contorno': {k: w for k, w in v['contorno'].items() if k != 'porVivienda'}}
        resumen['verificacion'][nombre] = v
        print('hecho', nombre)
    resumen['ficheros'].update(derivadas(args.brutos, args.salida))
    resumen['ficheros'].update(copiar_fotos(args.salida))
    escribir_json(os.path.join(comprob, 'resumen.json'), resumen)
    print(json.dumps(resumen, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
