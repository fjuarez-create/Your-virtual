#!/usr/bin/env python3
"""procesar360.py — Pasa los brutos de capturar360.mjs a los ficheros finales
del 360 base y comprueba, midiendo, que la panorámica es correcta.

Entrada (carpeta --brutos, nombre --nombre):
  <n>-color.png, <n>-prof24.png, <n>-normal.png, <n>-id.png, <n>-camara.json,
  <n>-plana-<dir>-{color,id}.png  (vistas planas de referencia)
  [<n>-color-8192.png]            (máster opcional)

Salida (--salida):
  <n>.png            color equirectangular (8 bit, sRGB)
  <n>-depth.png      profundidad 16 bit, cerca = claro: v = 65535·(1 − d/dmax), 0 = sin geometría
  <n>-depth-mm.png   profundidad radial métrica 16 bit en mm (0 = sin geometría)
  <n>-normal.png     normales de mundo (RGB = n·0,5 + 0,5; R = +x este, G = +y arriba, B = +z sur)
  <n>-id.png         segmentación (colores planos, leyenda en el JSON)
  <n>-8k.png         máster de color 8192×4096 si existe
  <n>.json           cámara, convención, leyenda, comprobaciones medidas
  comprobacion/      vistas planas frente a la reproyección, ampliaciones
Y, con --jpg, la versión web optimizada.

Uso:
  python3 nuevo/tools/captura/procesar360.py --brutos /ruta/brutos --nombre base-238-salon \
          --salida /ruta/base --jpg nuevo/estilos/img/360/base-238-salon.jpg
"""
import argparse
import json
import math
import os

import cv2
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--brutos', required=True)
ap.add_argument('--nombre', default='base-238-salon')
ap.add_argument('--salida', required=True)
ap.add_argument('--jpg', default=None)
ap.add_argument('--jpg-calidad', type=int, default=82)
ap.add_argument('--jpg-ancho', type=int, default=4096)
ap.add_argument('--json-web', default=None, help='JSON reducido junto al JPG')
a = ap.parse_args()

B = lambda s: os.path.join(a.brutos, f'{a.nombre}{s}')
os.makedirs(a.salida, exist_ok=True)
COMP = os.path.join(a.salida, 'comprobacion')
os.makedirs(COMP, exist_ok=True)
S = lambda s: os.path.join(a.salida, f'{a.nombre}{s}')

cam = json.load(open(B('-camara.json')))
W, H = cam['ancho'], cam['alto']
rumbo0 = math.radians(cam['rumboCentro'])
C = np.array(cam['camara']['posicion'])
suelo = cam['camara']['sueloTerminado']

color = np.asarray(Image.open(B('-color.png')).convert('RGB'))
p24 = np.asarray(Image.open(B('-prof24.png')).convert('RGB')).astype(np.int64)
normal = np.asarray(Image.open(B('-normal.png')).convert('RGB'))
ids = np.asarray(Image.open(B('-id.png')).convert('RGB'))
assert color.shape[:2] == (H, W) and ids.shape[:2] == (H, W)

mm = p24[..., 0] * 65536 + p24[..., 1] * 256 + p24[..., 2]
d = mm / 1000.0
hit = mm > 0

clases = cam['clases']
clave_de_color = {tuple(c['color']): c['clave'] for c in clases}
codigo = (ids[..., 0].astype(np.int64) << 16) | (ids[..., 1].astype(np.int64) << 8) | ids[..., 2]
mapa = {}
for c in clases:
    r, g, b = c['color']
    mapa[c['clave']] = codigo == ((r << 16) | (g << 8) | b)
fuera_de_leyenda = int((~np.logical_or.reduce(list(mapa.values()))).sum())

# Geometría de cada píxel: dirección y punto 3D reconstruido con la profundidad.
jj, ii = np.mgrid[0:H, 0:W]
beta = ((ii + 0.5) / W - 0.5) * 2 * np.pi + rumbo0
phi = (0.5 - (jj + 0.5) / H) * np.pi
dx, dy, dz = np.sin(beta) * np.cos(phi), np.sin(phi), -np.cos(beta) * np.cos(phi)
X, Y, Z = C[0] + d * dx, C[1] + d * dy, C[2] + d * dz
peso = np.cos(phi)  # ángulo sólido por píxel ∝ cos φ

info = {'resolucion': [W, H], 'cara': cam['cara'], 'muestras': cam['muestras']}

# ── 1. Exportación ──
Image.fromarray(color).save(S('.png'), optimize=True)
dmax = math.ceil(float(d[hit].max()) * 2) / 2
dep16 = np.where(hit, np.round(65535 * np.clip(1 - d / dmax, 0, 1)), 0).astype(np.uint16)
Image.fromarray(dep16).save(S('-depth.png'))
Image.fromarray(np.clip(mm, 0, 65535).astype(np.uint16)).save(S('-depth-mm.png'))
Image.fromarray(normal).save(S('-normal.png'), optimize=True)
Image.fromarray(ids).save(S('-id.png'), optimize=True)
maestro = None
for f in os.listdir(a.brutos):
    if f.startswith(f'{a.nombre}-color-') and f.endswith('.png'):
        maestro = f
        m8 = Image.open(os.path.join(a.brutos, f)).convert('RGB')
        assert m8.size == (2 * W, H * 2) or m8.size[0] == 2 * m8.size[1], m8.size
        m8.save(S('-8k.png'))
        m8a = np.asarray(m8).astype(np.int32)
        info['maestro8k'] = {'resolucion': list(m8.size), 'costuraDifMedia': round(float(np.abs(m8a[:, 0] - m8a[:, -1]).mean()), 3),
                             'difMediaReducidaFrente4k': round(float(np.abs(np.asarray(m8.resize((W, H), Image.LANCZOS)).astype(np.int32) - color.astype(np.int32)).mean()), 3)}
        del m8a
info['profundidad'] = {'dmaxM': dmax, 'codificacion': 'depth.png: v = round(65535·(1 − d/dmax)), d distancia RADIAL a la cámara en m; 0 = sin geometría. depth-mm.png: d en mm (tope 65535).',
                       'minM': round(float(d[hit].min()), 4), 'maxM': round(float(d[hit].max()), 4)}

# ── 2. Comprobaciones ──
chk = {}
# 2.1 Huecos: direcciones sin geometría (la estancia tiene que estar cerrada).
chk['huecos'] = {'pixelesSinGeometria': int((~hit).sum()), 'pixelesClaseVacio': int(mapa['vacio'].sum()),
                 'pixelesFueraDeLeyenda': fuera_de_leyenda, 'total': W * H}
# 2.2 Costura: primera columna frente a la última, comparada con dos columnas vecinas cualquiera.
c = color.astype(np.int32)
costura = float(np.abs(c[:, 0] - c[:, -1]).mean())
vecinas = np.abs(np.diff(c, axis=1)).mean(axis=(0, 2))
chk['costura'] = {
    'colorDifMediaPrimeraUltima': round(costura, 3),
    'colorDifMediaColumnasVecinasMediana': round(float(np.median(vecinas)), 3),
    'colorDifMediaColumnasVecinasP95': round(float(np.percentile(vecinas, 95)), 3),
    'idFilasIgualesPrimeraUltima': round(float((codigo[:, 0] == codigo[:, -1]).mean()), 5),
    'profundidadDifMediaMm': round(float(np.abs(mm[:, 0] - mm[:, -1]).mean()), 2),
    'nota': 'La costura está en el rumbo centro + 180°. Si cuadra, la diferencia entre la primera y la última columna es como la de dos columnas vecinas.',
}
# 2.3 Polos: fila de arriba = techo, fila de abajo = suelo, sin agujeros ni estrellas.
def fila(k):
    clases_fila = {cl: int(mapa[cl][k].sum()) for cl in mapa if mapa[cl][k].any()}
    return {'clases': clases_fila, 'profundidadM': [round(float(d[k].min()), 4), round(float(d[k].max()), 4)],
            'colorDesv': round(float(c[k].std(axis=0).mean()), 3)}
chk['polos'] = {'cenit': fila(0), 'nadir': fila(H - 1),
                'cenitFilas8ColorDesvMax': round(float(max(c[k].std(axis=0).mean() for k in range(8))), 3),
                'nadirFilas8ColorDesvMax': round(float(max(c[H - 1 - k].std(axis=0).mean() for k in range(8))), 3)}
# Alturas medidas en la propia panorámica: cámara sobre el suelo = profundidad en el nadir.
alt_cam = float(np.median(d[H - 1]))
alt_techo = float(np.median(d[0]))
chk['alturas'] = {'camaraSobreSueloM': round(alt_cam * math.sin(math.pi / 2 - math.pi / (2 * H)), 4),
                  'techoSobreCamaraM': round(alt_techo * math.sin(math.pi / 2 - math.pi / (2 * H)), 4),
                  'alturaLibreM': round((alt_cam + alt_techo) * math.sin(math.pi / 2 - math.pi / (2 * H)), 4),
                  'nota': 'Profundidad en la fila del nadir y del cenit (centro de píxel a 90° − 180°/(2·alto)) proyectada en vertical.'}
# Planitud: todos los píxeles de techo a la misma cota, los de suelo también.
for cl in ('techo', 'suelo'):
    m = mapa[cl] & hit
    if m.any():
        chk['alturas'][f'{cl}CotaM'] = [round(float(np.percentile(Y[m], 1)), 4), round(float(np.median(Y[m])), 4), round(float(np.percentile(Y[m], 99)), 4)]
# 2.4 Verticales: el borde de los vidrios, columna a columna, a lo largo de su alto.
def bordes_verticales(mask, nombre):
    """Por cada mancha vertical del mask, columna del borde izquierdo y derecho en cada fila."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    out = []
    for k in range(1, n):
        x0, y0, w, h, area = st[k]
        if h < 40 or area < 200:
            continue
        izq, der = [], []
        for y in range(y0 + 3, y0 + h - 3):
            cols = np.nonzero(lab[y] == k)[0]
            if len(cols):
                izq.append(cols.min()); der.append(cols.max())
        izq, der = np.array(izq), np.array(der)
        mi, md = np.median(izq), np.median(der)
        out.append({'mancha': nombre, 'caja': [int(x0), int(y0), int(w), int(h)], 'filas': int(len(izq)),
                    'bordeIzqCol': [int(izq.min()), int(izq.max())], 'bordeDerCol': [int(der.min()), int(der.max())],
                    'filasA1pxDeLaMedianaIzq': round(float((np.abs(izq - mi) <= 1).mean()), 4),
                    'filasA1pxDeLaMedianaDer': round(float((np.abs(der - md) <= 1).mean()), 4)})
    return out

def esquinas_de_muro():
    """Aristas verticales entre paños de muro (esquinas, pilares, mochetas):
    donde la normal horizontal del muro gira más de 20° de un píxel al de al
    lado. Cada arista es una cadena de píxeles; si las verticales salen
    verticales, su columna no cambia de una fila a otra."""
    n = normal.astype(np.float64) / 255 * 2 - 1
    muro = mapa['muro'] & (np.abs(n[..., 1]) < 0.2)
    ang = np.arctan2(n[..., 0], n[..., 2])
    dif = np.abs(np.angle(np.exp(1j * (ang[:, 1:] - ang[:, :-1]))))
    b = np.zeros((H, W), bool)
    b[:, 1:] = muro[:, 1:] & muro[:, :-1] & (dif > math.radians(20))
    lim = int(H * 0.22)                         # lejos de los polos (allí las columnas convergen)
    b[:lim] = False; b[H - lim:] = False
    nc, lab, st, _ = cv2.connectedComponentsWithStats(b.astype(np.uint8), 8)
    aristas = []
    for k in range(1, nc):
        x0, y0, w, h, area = st[k]
        if h < 60:
            continue
        ys, xs = np.nonzero(lab == k)
        cols = np.array([xs[ys == y].mean() for y in np.unique(ys)])
        aristas.append({'col': round(float(np.median(cols)), 1), 'rumbo': round(math.degrees(((np.median(cols) + 0.5) / W - 0.5) * 2 * np.pi + rumbo0) % 360, 2),
                        'filas': int(h), 'desvColPx': round(float(cols.std()), 3), 'rangoColPx': round(float(cols.max() - cols.min()), 2)})
    return aristas
esq = esquinas_de_muro()
chk['verticales'] = {'vidrio': bordes_verticales(mapa['vidrio'], 'vidrio'), 'puerta': bordes_verticales(mapa['puerta'], 'puerta'),
                     'esquinasDeMuro': esq,
                     'esquinasResumen': {'aristas': len(esq), 'desvColMaxPx': max((e['desvColPx'] for e in esq), default=None),
                                         'rangoColMaxPx': max((e['rangoColPx'] for e in esq), default=None)},
                     'nota': 'Con la cámara nivelada una vertical del mundo es una columna exacta. Vidrios y puertas: fracción de filas cuyo borde está a ±1 px de la columna mediana (las puertas llevan manilla y dintel, que no son verticales). Esquinas de muro: desviación de la columna de cada arista a lo largo de su alto.'}

# 2.5 Reproyección frente a la vista plana directa (misma posición, sin cubo).
def muestrear(img, u, v, vecino):
    x = u * W - 0.5
    y = np.clip(v * H - 0.5, 0, H - 1)
    if vecino:
        xi = np.round(x).astype(int) % W
        yi = np.clip(np.round(y).astype(int), 0, H - 1)
        return img[yi, xi]
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    x1 = (x0 + 1) % W; x0 %= W; y1 = np.clip(y0 + 1, 0, H - 1)
    f = img.astype(np.float64)
    return (f[y0, x0] * (1 - fx) * (1 - fy) + f[y0, x1] * fx * (1 - fy) + f[y1, x0] * (1 - fx) * fy + f[y1, x1] * fx * fy)

def gnomonica(v):
    w, h, fov = v['ancho'], v['alto'], math.radians(v['fov'])
    b, e = math.radians(v['rumbo']), math.radians(v['elevacion'])
    f = np.array([math.sin(b) * math.cos(e), math.sin(e), -math.cos(b) * math.cos(e)])
    r = np.cross(f, [0, 1, 0]); r /= np.linalg.norm(r)
    up = np.cross(r, f)
    t = math.tan(fov / 2)
    yy, xx = np.mgrid[0:h, 0:w]
    nx = ((xx + 0.5) / w * 2 - 1) * t * (w / h)
    ny = (1 - (yy + 0.5) / h * 2) * t
    ray = nx[..., None] * r + ny[..., None] * up + f
    ray /= np.linalg.norm(ray, axis=-1, keepdims=True)
    bb = np.arctan2(ray[..., 0], -ray[..., 2])
    pp = np.arcsin(np.clip(ray[..., 1], -1, 1))
    u = (0.5 + (bb - rumbo0) / (2 * np.pi)) % 1.0
    vv = 0.5 - pp / np.pi
    return u, vv

comp = []
for v in cam['planas']:
    u, vv = gnomonica(v)
    pc = np.asarray(Image.open(B(f"-plana-{v['nombre']}-color.png")).convert('RGB')).astype(np.float64)
    pid = np.asarray(Image.open(B(f"-plana-{v['nombre']}-id.png")).convert('RGB'))
    rc = muestrear(color, u, vv, False)
    rid = muestrear(ids, u, vv, True)
    dif = np.abs(rc - pc)
    mse = float((dif ** 2).mean())
    igual = np.all(rid == pid, axis=-1)
    # bordes de clase en la vista plana, engordados 1 px
    cod = (pid[..., 0].astype(np.int64) << 16) | (pid[..., 1].astype(np.int64) << 8) | pid[..., 2]
    borde = np.zeros(cod.shape, bool)
    borde[:, 1:] |= cod[:, 1:] != cod[:, :-1]; borde[:, :-1] |= cod[:, 1:] != cod[:, :-1]
    borde[1:] |= cod[1:] != cod[:-1]; borde[:-1] |= cod[1:] != cod[:-1]
    borde1 = cv2.dilate(borde.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    distintos = ~igual
    # desplazamiento: correlación de fase entre la plana y la reproyección (luminancia)
    g1 = cv2.cvtColor(pc.astype(np.float32), cv2.COLOR_RGB2GRAY)
    g2 = cv2.cvtColor(rc.astype(np.float32), cv2.COLOR_RGB2GRAY)
    (sx, sy), _ = cv2.phaseCorrelate(g1, g2)
    comp.append({'vista': v['nombre'], 'rumbo': v['rumbo'], 'fov': v['fov'],
                 'colorDifMedia': round(float(dif.mean()), 3), 'colorPSNRdB': round(10 * math.log10(255 ** 2 / mse), 2) if mse else None,
                 'idPixelesIguales': round(float(igual.mean()), 5), 'idDistintos': int(distintos.sum()),
                 'idDistintosEnBorde1px': round(float((distintos & borde1).sum() / max(1, distintos.sum())), 4),
                 'desplazamientoPx': [round(sx, 3), round(sy, 3)]})
    # imagen de comprobación: plana | reproyectada | diferencia ×4
    dimg = np.clip(dif * 4, 0, 255).astype(np.uint8)
    lado = np.concatenate([pc.astype(np.uint8), rc.astype(np.uint8), dimg], axis=1)
    Image.fromarray(lado).resize((lado.shape[1] // 2, lado.shape[0] // 2), Image.LANCZOS).save(os.path.join(COMP, f"plana-vs-equirect-{v['nombre']}.jpg"), quality=88)
chk['reproyeccion'] = {'vistas': comp, 'nota': 'Vista plana dibujada directamente con una cámara en perspectiva (fov 75°, 1200×800) frente a la misma vista remuestreada de la equirectangular (bilineal en color, vecino en id). Si la reproyección es exacta, las ids solo difieren en píxeles de borde y el desplazamiento es 0.'}

# 2.6 Distancias libres (radiales) por clase, y la ventana medida en la panorámica.
dist = {}
for cl in mapa:
    m = mapa[cl] & hit
    if m.any():
        k = np.argmin(np.where(m, d, np.inf))
        y0, x0 = divmod(int(k), W)
        dist[cl] = {'minM': round(float(d[y0, x0]), 3), 'rumbo': round(math.degrees(beta[y0, x0]) % 360, 1), 'elevacion': round(math.degrees(phi[y0, x0]), 1),
                    'fraccionEsfera': round(float(peso[m].sum() / peso.sum()), 5)}
chk['distancias'] = {'porClase': dist, 'reglas': 'PRODUCCION_IMAGENES §2: cámara a ≥ 0,6 m del mobiliario y a ≥ 1,0 m del vidrio.',
                     'cumpleMobiliario': all(dist[c]['minM'] >= 0.6 for c in ('mobiliario', 'mueble_fijo') if c in dist),
                     'cumpleVidrio': dist.get('vidrio', {}).get('minM', 9) >= 1.0}
# Ventana(s) de la estancia reconstruidas desde la panorámica (profundidad + dirección).
n, lab, st, _ = cv2.connectedComponentsWithStats((mapa['vidrio'] | mapa['carpinteria']).astype(np.uint8), 8)
ventanas = []
for k in range(1, n):
    if st[k][4] < 500:
        continue
    m = (lab == k) & hit
    mv = m & mapa['vidrio']
    if not mv.any():
        continue
    xs, zs = X[mv], Z[mv]
    ys_v, ys_c = Y[mv], Y[m]
    hor = np.sqrt((X[m] - C[0]) ** 2 + (Z[m] - C[2]) ** 2)
    if np.median(hor) > 7:
        continue
    ventanas.append({
        'caja': [int(v) for v in st[k][:4]], 'distanciaHorizontalM': round(float(np.median(hor)), 3),
        'vidrioDesdeSueloM': [round(float(np.percentile(ys_v, 0.2) - suelo), 3), round(float(np.percentile(ys_v, 99.8) - suelo), 3)],
        'conCarpinteriaDesdeSueloM': [round(float(np.percentile(ys_c, 0.2) - suelo), 3), round(float(np.percentile(ys_c, 99.8) - suelo), 3)],
        'anchoVidrioM': round(float(math.hypot(np.percentile(xs, 99.8) - np.percentile(xs, 0.2), np.percentile(zs, 99.8) - np.percentile(zs, 0.2))), 3),
        'x': [round(float(np.percentile(X[m], 0.2)), 3), round(float(np.percentile(X[m], 99.8)), 3)],
        'z': [round(float(np.percentile(Z[m], 0.2)), 3), round(float(np.percentile(Z[m], 99.8)), 3)],
        'fraccionEsfera': round(float(peso[m].sum() / peso.sum()), 5)})
# Ventana medida de cerca (toma auxiliar sin el sofá delante).
cerca = None
vc = cam.get('ventanaCerca')
if vc and os.path.exists(B('-ventana-id.png')):
    C2 = np.array(vc['camara']['posicion'])
    i2 = np.asarray(Image.open(B('-ventana-id.png')).convert('RGB'))
    q2 = np.asarray(Image.open(B('-ventana-prof24.png')).convert('RGB')).astype(np.int64)
    d2 = (q2[..., 0] * 65536 + q2[..., 1] * 256 + q2[..., 2]) / 1000.0
    h2, w2 = d2.shape
    j2, k2 = np.mgrid[0:h2, 0:w2]
    b2 = ((k2 + 0.5) / w2 - 0.5) * 2 * np.pi + math.radians(vc['rumboCentro'])
    f2 = (0.5 - (j2 + 0.5) / h2) * np.pi
    X2, Y2, Z2 = C2[0] + d2 * np.sin(b2) * np.cos(f2), C2[1] + d2 * np.sin(f2), C2[2] - d2 * np.cos(b2) * np.cos(f2)
    vids = cam.get('vidriosEstancia') or []
    cx, cz = vc['centro'][0], vc['centro'][2]
    eje = vc['eje']
    plano = (np.abs((X2 if eje == 'x' else Z2) - (cx if eje == 'x' else cz)) < 0.15) & (np.abs((Z2 if eje == 'x' else X2) - (cz if eje == 'x' else cx)) < 0.8)
    def cl(nombre):
        r, g, b = next(c['color'] for c in clases if c['clave'] == nombre)
        return np.all(i2 == (r, g, b), -1)
    mv, mc = plano & cl('vidrio'), plano & (cl('vidrio') | cl('carpinteria'))
    lat = Z2 if eje == 'x' else X2
    cerca = {'desde': vc['camara']['posicion'],
             'vidrioDesdeSueloM': [round(float(Y2[mv].min() - suelo), 3), round(float(Y2[mv].max() - suelo), 3)],
             'vidrioAnchoM': round(float(lat[mv].max() - lat[mv].min()), 3),
             'huecoConCarpinteriaDesdeSueloM': [round(float(Y2[mc].min() - suelo), 3), round(float(Y2[mc].max() - suelo), 3)],
             'huecoConCarpinteriaAnchoM': round(float(lat[mc].max() - lat[mc].min()), 3),
             'lateral': [round(float(lat[mc].min()), 3), round(float(lat[mc].max()), 3)],
             'techoDesdeSueloM': chk['alturas'].get('alturaLibreM')}
    cerca['antepechoM'] = cerca['huecoConCarpinteriaDesdeSueloM'][0]
    cerca['dintelM'] = round(cerca['techoDesdeSueloM'] - cerca['huecoConCarpinteriaDesdeSueloM'][1], 3) if cerca['techoDesdeSueloM'] else None
    cerca['vidriosDelModelo'] = [{'nombre': v['nombre'], 'desdeSueloM': [round(v['min'][1] - suelo, 3), round(v['max'][1] - suelo, 3)],
                                  'anchoM': round(max(v['max'][0] - v['min'][0], v['max'][2] - v['min'][2]), 3)} for v in vids
                                 if abs(((v['min'][0] + v['max'][0]) / 2 if eje == 'x' else (v['min'][2] + v['max'][2]) / 2) - (cx if eje == 'x' else cz)) < 0.2]
chk['ventanasMedidas'] = {'deCerca': cerca, 'ventanas': ventanas, 'techoDesdeSueloM': chk['alturas'].get('alturaLibreM'),
                          'nota': 'Cotas reconstruidas píxel a píxel con la profundidad. «ventanas»: desde el punto 360 (percentiles 0,2–99,8; el sofá tapa el pie de la ventana). «deCerca»: toma auxiliar a 1,25 m del vidrio, sin nada delante (mín./máx.).'}
info['comprobaciones'] = chk

# Fracción de la esfera por clase (ponderada por ángulo sólido).
info['clasesPresentes'] = {cl: round(float(peso[mapa[cl]].sum() / peso.sum()), 5) for cl in mapa if mapa[cl].any()}

# ── 3. Ampliaciones de los polos y de la costura para mirarlas ──
tira = np.concatenate([color[:, -200:], color[:, :200]], axis=1)
Image.fromarray(tira[H // 4: 3 * H // 4]).save(os.path.join(COMP, 'costura-200px-a-cada-lado.jpg'), quality=90)
Image.fromarray(color[:160]).resize((W // 2, 80), Image.LANCZOS).save(os.path.join(COMP, 'cenit-160-filas.jpg'), quality=90)
Image.fromarray(color[-160:]).resize((W // 2, 80), Image.LANCZOS).save(os.path.join(COMP, 'nadir-160-filas.jpg'), quality=90)
# Mosaico de pases a 1024 px
def peq(img):
    return np.asarray(Image.fromarray(img).resize((1024, 512), Image.NEAREST if img is ids else Image.LANCZOS))
dep8 = (dep16 >> 8).astype(np.uint8)
mos = np.concatenate([np.concatenate([peq(color), peq(np.stack([dep8] * 3, -1))], 1), np.concatenate([peq(normal), peq(ids)], 1)], 0)
Image.fromarray(mos).save(os.path.join(COMP, 'pases.jpg'), quality=88)

# ── 4. JSON ──
salida = {
    'nombre': a.nombre, 'imagen': os.path.basename(S('.png')), 'vivienda': cam['vivienda'], 'estancia': cam['estancia'],
    'provisional': True, 'origen': cam['descripcion'], 'convencion': cam['convencion'], 'rumboCentro': cam['rumboCentro'],
    'camara': cam['camara'], 'luz': cam['luz'], 'direcciones': cam['direcciones'], 'vidriosEstancia': cam.get('vidriosEstancia'),
    'puertas': cam['puertas'].get('vanos'), 'leyenda': clases, 'ficheros': {
        'color': os.path.basename(S('.png')), 'profundidad': os.path.basename(S('-depth.png')), 'profundidadMm': os.path.basename(S('-depth-mm.png')),
        'normales': os.path.basename(S('-normal.png')), 'id': os.path.basename(S('-id.png')), 'maestro8k': os.path.basename(S('-8k.png')) if maestro else None},
    'tiempos': cam['tiempos'], **info,
}
json.dump(salida, open(S('.json'), 'w'), ensure_ascii=False, indent=1)

if a.jpg:
    os.makedirs(os.path.dirname(a.jpg), exist_ok=True)
    im = Image.fromarray(color)
    if a.jpg_ancho != W:
        im = im.resize((a.jpg_ancho, a.jpg_ancho // 2), Image.LANCZOS)
    im.save(a.jpg, quality=a.jpg_calidad, optimize=True, progressive=True, subsampling='4:2:0')
    salida['jpg'] = {'fichero': a.jpg, 'bytes': os.path.getsize(a.jpg), 'calidad': a.jpg_calidad, 'ancho': im.size[0], 'alto': im.size[1]}
    json.dump(salida, open(S('.json'), 'w'), ensure_ascii=False, indent=1)
    if a.json_web:
        web = {k: salida[k] for k in ('nombre', 'vivienda', 'estancia', 'provisional', 'origen', 'convencion', 'rumboCentro', 'leyenda')}
        web.update({'imagen': os.path.basename(a.jpg), 'ancho': im.size[0], 'alto': im.size[1],
                    'camara': {k: cam['camara'][k] for k in ('posicion', 'alturaSobreSuelo', 'sueloTerminado', 'alturaLibre', 'puntoPx')},
                    'rumboPrincipal': cam['direcciones'].get('ventana', {}).get('rumbo'),
                    'direcciones': {k: {'rumbo': v['rumbo'], 'elevacion': v['elevacion']} for k, v in cam['direcciones'].items()},
                    'comprobaciones': {k: chk[k] for k in ('huecos', 'costura', 'alturas')}, 'reproyeccion': comp})
        json.dump(web, open(a.json_web, 'w'), ensure_ascii=False, indent=1)

print(json.dumps({'ventanaDeCerca': cerca, 'huecos': chk['huecos'], 'costura': chk['costura'], 'polos': chk['polos'], 'alturas': chk['alturas'],
                  'verticales': chk['verticales'], 'reproyeccion': comp, 'distancias': chk['distancias'], 'ventanas': ventanas,
                  'clases': info['clasesPresentes'], 'profundidad': info['profundidad']}, ensure_ascii=False, indent=1))
