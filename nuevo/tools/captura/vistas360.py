#!/usr/bin/env python3
"""vistas360.py — 360 con IA por vistas planas: cortar, rellenar solapes y recomponer.

Los modelos de edición (Nano Banana Pro y compañía) no entienden la
proyección equirectangular: con la panorámica entera la «enderezan» o se
inventan la habitación (medido: ver LEEME, «360 con IA»). Con una vista
en perspectiva normal trabajan bien. La cadena es:

  1. extraer   vistas en perspectiva (rectilíneas) desde la equirectangular
               EXACTA del BIM, con solape entre vecinas. Si ya hay vistas
               hechas con IA, se pegan en la nueva por la zona de solape
               (--previas), para que el modelo continúe su luz y su color.
  2. (IA)      cada vista se edita aparte, con la base como estructura.
  3. componer  se reproyecta cada vista a la equirectangular con pesos que
               caen hacia los bordes (coseno), se iguala la exposición de
               cada vista con sus vecinas en los solapes (ganancia por
               canal), el casquete del techo que no cubre ninguna vista se
               rellena con el color del techo difundido hacia el cenit, y
               se escribe la panorámica con su mapa de cobertura.

La convención es la del 360 base (rumbo horario desde el norte del modelo,
centro de la imagen = rumboCentro, v = 0,5 − elevación/180).

Las vistas se describen en un JSON: [{"nombre", "rumbo", "elev", "fov", "px"}].
"""
import argparse
import json
import math

import cv2
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def base_camara(rumbo, elev):
    b, p = math.radians(rumbo), math.radians(elev)
    f = np.array([math.sin(b) * math.cos(p), math.sin(p), -math.cos(b) * math.cos(p)])
    r = np.array([math.cos(b), 0.0, math.sin(b)])
    u = np.cross(r, f)
    return f, r, u


def dirs_equirect(W, H, rumbo0=0.0):
    x = (np.arange(W) + 0.5) / W
    y = (np.arange(H) + 0.5) / H
    beta = np.radians((x - 0.5) * 360 + rumbo0)[None, :]
    phi = np.radians(90 - y * 180)[:, None]
    d = np.stack(np.broadcast_arrays(np.sin(beta) * np.cos(phi), np.sin(phi) * np.ones_like(beta), -np.cos(beta) * np.cos(phi)), -1)
    return d


def vista_desde_equirect(eq, v, rumbo0=0.0, px=None):
    """Muestrea una vista rectilínea de la equirectangular (bilineal, costura envuelta)."""
    H, W = eq.shape[:2]
    N = px or v['px']
    f, r, u = base_camara(v['rumbo'], v['elev'])
    t = math.tan(math.radians(v['fov']) / 2)
    s = (2 * (np.arange(N) + 0.5) / N - 1) * t
    X, Y = np.meshgrid(s, -s)
    d = f[None, None] + X[..., None] * r[None, None] + Y[..., None] * u[None, None]
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    beta = np.degrees(np.arctan2(d[..., 0], -d[..., 2])) - rumbo0
    phi = np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1)))
    mx = ((beta / 360 + 0.5) % 1.0) * W - 0.5
    my = (0.5 - phi / 180) * H - 0.5
    # columna extra para envolver la costura
    eqw = np.concatenate([eq, eq[:, :1]], axis=1)
    return cv2.remap(eqw, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def proyectar(d, v):
    """Coordenadas (j, i) en la vista (en unidades de 0..1) y peso de cada dirección."""
    f, r, u = base_camara(v['rumbo'], v['elev'])
    z = d @ f
    t = math.tan(math.radians(v['fov']) / 2)
    with np.errstate(divide='ignore', invalid='ignore'):
        x = (d @ r) / z / t
        y = (d @ u) / z / t
    dentro = (z > 1e-6) & (np.abs(x) < 1) & (np.abs(y) < 1)
    # peso: 1 en el interior, cae con coseno en el margen (fracción --margen del semiancho)
    m = v.get('margen', 0.18)
    e = np.maximum(np.abs(x), np.abs(y))
    w = np.where(e < 1 - m, 1.0, 0.5 * (1 + np.cos(np.pi * np.clip((e - (1 - m)) / m, 0, 1))))
    w = np.where(dentro, w, 0.0)
    return (x + 1) / 2, (1 - y) / 2, w


def muestrear(img, ju, iv):
    h, w = img.shape[:2]
    return cv2.remap(img, (ju * w - 0.5).astype(np.float32), (iv * h - 0.5).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def componer(vistas, imagenes, W, H, rumbo0=0.0, igualar=True, techo_desde=None):
    d = dirs_equirect(W, H, rumbo0)
    acc = np.zeros((H, W, 3), np.float64); pes = np.zeros((H, W), np.float64)
    capas = []
    for v, img in zip(vistas, imagenes):
        ju, iv, w = proyectar(d, v)
        ju = np.nan_to_num(ju); iv = np.nan_to_num(iv)
        c = muestrear(img.astype(np.float32), ju, iv)
        capas.append((c, w))
    ganancias = [np.ones(3) for _ in capas]
    if igualar and len(capas) > 1:
        # ganancia por canal de cada vista para casar con la media de las demás en sus solapes
        # (dos pasadas de Jacobi; la vista 0 fija la exposición de referencia)
        for _ in range(3):
            nuevas = []
            for k, (c, w) in enumerate(capas):
                if k == 0:
                    nuevas.append(np.ones(3)); continue
                num = np.zeros(3); den = np.zeros(3)
                for j, (c2, w2) in enumerate(capas):
                    if j == k:
                        continue
                    sol = (w > 0.05) & (w2 > 0.05)
                    if sol.sum() < 500:
                        continue
                    a = (c[sol] * ganancias[k]).mean(0); b = (c2[sol] * ganancias[j]).mean(0)
                    num += b * sol.sum(); den += a * sol.sum()
                nuevas.append(ganancias[k] * np.where(den > 0, num / np.maximum(den, 1e-6), 1))
            ganancias = nuevas
    for (c, w), g in zip(capas, ganancias):
        acc += c * g[None, None] * w[..., None]
        pes += w
    out = acc / np.maximum(pes, 1e-9)[..., None]
    cob = pes > 1e-6
    if techo_desde is not None:
        # casquete del cenit sin vista: color del techo difundido (pirámide de medias)
        out = rellenar_casquete(out, cob, techo_desde)
        cob = np.ones_like(cob)
    return np.clip(out, 0, 255), pes, [g.round(4).tolist() for g in ganancias]


def rellenar_casquete(out, cob, elev_min):
    """Rellena lo no cubierto por encima de elev_min difundiendo los bordes (suave, sin textura)."""
    H, W = cob.shape
    fila = int((0.5 - elev_min / 180) * H)
    hueco = ~cob
    hueco[fila:] = False
    if not hueco.any():
        return out
    # difusión multiescala con envoltura horizontal, a 1/8 de resolución (el techo es liso)
    f = 8
    h2, w2 = H // f, W // f
    m = cv2.resize((~hueco).astype(np.float32), (w2, h2), interpolation=cv2.INTER_AREA)
    m = (m > 0.999).astype(np.float32)
    img = cv2.resize(out.astype(np.float32), (w2, h2), interpolation=cv2.INTER_AREA)
    res = img * m[..., None]
    acc_i = np.zeros_like(img); acc_m = np.zeros_like(m)
    for s in (1, 3, 9, 27, 60):
        pad = int(3 * s) + 1
        a = np.concatenate([res[:, -pad:], res, res[:, :pad]], axis=1)
        b = np.concatenate([m[:, -pad:], m, m[:, :pad]], axis=1)
        a = cv2.GaussianBlur(a, (0, 0), s)[:, pad:-pad]; b = cv2.GaussianBlur(b, (0, 0), s)[:, pad:-pad]
        nuevo = (b > 1e-3) & (acc_m < 1e-4) & (m < 0.5)
        acc_i[nuevo] = a[nuevo] / b[nuevo][..., None]; acc_m[nuevo] = 1
    acc_i = np.where(m[..., None] > 0.5, img, acc_i)
    acc_i = cv2.GaussianBlur(acc_i, (0, 0), 2)
    grande = cv2.resize(acc_i, (W, H), interpolation=cv2.INTER_CUBIC)
    lleno = out.copy()
    # mezcla suave en una franja alrededor del hueco
    t = cv2.GaussianBlur(hueco.astype(np.float32), (0, 0), 12)
    t = np.clip(np.maximum(t * 2, hueco), 0, 1)
    lleno = out * (1 - t[..., None]) + grande * t[..., None]
    # el cenit, a la media de la fila más alta, para que el polo sea un punto
    top = int(H * 0.02)
    media = lleno[:top].mean(axis=(0, 1))
    y = np.linspace(0, 1, top)[:, None, None]
    lleno[:top] = lleno[:top] * y + media * (1 - y)
    return lleno


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='orden', required=True)
    e = sub.add_parser('extraer')
    e.add_argument('--base', required=True); e.add_argument('--vistas', required=True)
    e.add_argument('--solo', default=None, help='nombre de la vista a extraer')
    e.add_argument('--previas', default=None, help='JSON {nombre: imagen IA} de vistas ya hechas, para pegar en el solape')
    e.add_argument('--salida', required=True, help='carpeta')
    e.add_argument('--px', type=int, default=None)
    c = sub.add_parser('componer')
    c.add_argument('--vistas', required=True); c.add_argument('--ia', required=True, help='JSON {nombre: imagen}')
    c.add_argument('--salida', required=True); c.add_argument('--cobertura', default=None)
    c.add_argument('--ancho', type=int, default=8192)
    c.add_argument('--techo-desde', type=float, default=45.0)
    c.add_argument('--sin-igualar', action='store_true')
    a = ap.parse_args()
    vistas = json.load(open(a.vistas))
    if a.orden == 'extraer':
        eq = np.asarray(Image.open(a.base).convert('RGB')).astype(np.float32)
        H, W = eq.shape[:2]
        prev_eq = None
        if a.previas:
            pv = json.load(open(a.previas))
            vv = [v for v in vistas if v['nombre'] in pv]
            imgs = [np.asarray(Image.open(pv[v['nombre']]).convert('RGB')) for v in vv]
            Wp = 4096
            prev_eq, prev_w, _ = componer(vv, imgs, Wp, Wp // 2, igualar=False)
        for v in vistas:
            if a.solo and v['nombre'] != a.solo:
                continue
            img = vista_desde_equirect(eq, v, px=a.px)
            if prev_eq is not None:
                pimg = vista_desde_equirect(prev_eq.astype(np.float32), v, px=a.px)
                pw = vista_desde_equirect(np.repeat(np.clip(prev_w, 0, 1)[..., None], 3, -1).astype(np.float32), v, px=a.px)[..., 0]
                # solo donde la vista previa es fiable (peso alto), con borde suave
                pw = np.clip((pw - 0.15) / 0.5, 0, 1)
                img = img * (1 - pw[..., None]) + pimg * pw[..., None]
                print(v['nombre'], 'pegado de previas en', round(float((pw > 0.5).mean() * 100), 1), '% de la vista')
            Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8)).save(f"{a.salida}/{v['nombre']}.png")
            print('vista', v['nombre'], img.shape)
    else:
        ia = json.load(open(a.ia))
        vv = [v for v in vistas if v['nombre'] in ia]
        imgs = [np.asarray(Image.open(ia[v['nombre']]).convert('RGB')) for v in vv]
        W = a.ancho
        out, pes, gan = componer(vv, imgs, W, W // 2, igualar=not a.sin_igualar, techo_desde=a.techo_desde)
        Image.fromarray((out + 0.5).astype(np.uint8)).save(a.salida)
        if a.cobertura:
            Image.fromarray((np.clip(pes, 0, 2) / 2 * 255).astype(np.uint8)).save(a.cobertura)
        print(json.dumps({'vistas': [v['nombre'] for v in vv], 'ganancias': gan, 'sinCubrir': round(float((pes < 1e-6).mean() * 100), 3)}))


if __name__ == '__main__':
    main()
