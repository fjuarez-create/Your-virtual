"""Levantamiento topográfico (DWG) → modelo 3D del entorno (GLB).

    python3 tools/build_topo.py /tmp/topo.dxf assets/entorno_topo.glb

El DWG viene en UTM 28N (ETRS89) con cotas reales. Aquí se convierte en una
malla por familia de material —terreno, asfalto, aceras, bordillos, pavimento
podotáctil, edificaciones, arquetas y arbolado—, ya colocada en los ejes de la
escena del showroom: origen en el centro de la parcela, Y arriba y el eje largo
del edificio sobre +X.

El relieve sale de las curvas de nivel (60.000 vértices acotados) trianguladas
por Delaunay; sobre esa superficie se drapean las demás capas, de modo que una
acera sigue la pendiente de la calle en vez de flotar sobre un plano.
"""
import math
import sys
from collections import defaultdict

import ezdxf
import numpy as np
from mapbox_earcut import triangulate_float64
from pygltflib import (Accessor, Asset, Attributes, Buffer, BufferView, GLTF2,
                       Material, Mesh, Node, PbrMetallicRoughness, Primitive, Scene)
from pyproj import Transformer
from scipy.interpolate import LinearNDInterpolator
from scipy.spatial import Delaunay
from shapely.geometry import Polygon
from shapely.ops import unary_union

# ── Emplazamiento ────────────────────────────────────────────────────────────
PARCELA_LATLON = (27.986703, -15.395572)   # centro, dado por el promotor
RUMBO = 70.0            # rumbo del eje largo del edificio, como en context.js
RADIO = 210.0           # metros alrededor del origen que se conservan

# Alturas y espesores, en metros
H_BORDILLO = 0.14
H_ACERA = 0.13
H_PODO = 0.145
H_EDIF = 7.0
H_MARCA = 0.02
H_TAPA = 0.02

# ── Materiales: color y acabado por familia ─────────────────────────────────
MATERIALES = {
    'terreno':      (0x9a9179, 1.00),
    'asfalto':      (0x4a4b4e, 0.92),
    'acera':        (0xb9b3a6, 0.88),
    'podotactil':   (0xc7bda4, 0.85),
    'bordillo':     (0xcfcac0, 0.80),
    'marca_vial':   (0xe8e6e0, 0.70),
    'edificacion':  (0xd9d4ca, 0.90),
    'muro':         (0xbdb7ab, 0.92),
    'arqueta':      (0x6f7175, 0.75),
    'tronco':       (0x6b4f35, 0.95),
    'copa':         (0x4f7f4a, 0.90),
}


def utm_de(lat, lon):
    tr = Transformer.from_crs('EPSG:4326', 'EPSG:25828', always_xy=True)
    e, n = tr.transform(lon, lat)
    return e, n


# ── Lectura del DXF ─────────────────────────────────────────────────────────
def puntos_de(e):
    """Vértices de una entidad, en coordenadas del dibujo."""
    t = e.dxftype()
    try:
        if t == '3DFACE':
            return [tuple(getattr(e.dxf, k)) for k in ('vtx0', 'vtx1', 'vtx2', 'vtx3')
                    if getattr(e.dxf, k, None) is not None]
        if t == 'LWPOLYLINE':
            z = e.dxf.elevation
            return [(p[0], p[1], z) for p in e.get_points()]
        if t == 'POLYLINE':
            return [tuple(v.dxf.location) for v in e.vertices]
        if t == 'LINE':
            return [tuple(e.dxf.start), tuple(e.dxf.end)]
        if t == 'CIRCLE':
            c, r = e.dxf.center, e.dxf.radius
            return [(c[0] + r * math.cos(a), c[1] + r * math.sin(a), c[2])
                    for a in np.linspace(0, 2 * math.pi, 17)[:-1]]
        if t == 'INSERT':
            return [tuple(e.dxf.insert)]
        if t == 'HATCH':
            out = []
            for p in e.paths:
                vs = getattr(p, 'vertices', None)
                if vs:
                    out.append([(v[0], v[1], 0.0) for v in vs])
            return out
    except Exception:
        pass
    return []


def contornos_hatch(e):
    """Cada camino de un sombreado, como lista de anillos."""
    anillos = []
    for p in e.paths:
        vs = getattr(p, 'vertices', None)
        if vs and len(vs) >= 3:
            anillos.append([(v[0], v[1]) for v in vs])
    return anillos


# ── Malla ───────────────────────────────────────────────────────────────────
class Malla:
    """Acumula triángulos de una familia de material."""

    def __init__(self):
        self.v = []
        self.i = []

    def tri(self, a, b, c):
        n = len(self.v)
        self.v += [a, b, c]
        self.i += [n, n + 1, n + 2]

    def poligono(self, anillo, z_de, alza=0.0, huecos=()):
        """Triangula un contorno —con sus huecos— y le da cota según el terreno."""
        if len(anillo) < 3:
            return
        aros = [list(anillo)] + [list(h) for h in huecos if len(h) >= 3]
        arr = np.array([p for aro in aros for p in aro], dtype=np.float64)
        cortes, acum = [], 0
        for aro in aros:
            acum += len(aro); cortes.append(acum)
        try:
            idx = triangulate_float64(arr, np.array(cortes, dtype=np.uint32))
        except Exception:
            return
        for k in range(0, len(idx), 3):
            p = [arr[idx[k + j]] for j in range(3)]
            self.tri(*[(q[0], z_de(q[0], q[1]) + alza, q[1]) for q in p])

    def prisma(self, anillo, z_de, base_alza, altura):
        """Extruye un anillo: tapa superior y caras laterales."""
        if len(anillo) < 3:
            return
        arr = np.array(anillo, dtype=np.float64)
        try:
            idx = triangulate_float64(arr, np.array([len(arr)], dtype=np.uint32))
        except Exception:
            return
        z0 = {tuple(q): z_de(q[0], q[1]) + base_alza for q in arr}
        for k in range(0, len(idx), 3):
            p = [arr[idx[k + j]] for j in range(3)]
            self.tri(*[(q[0], z0[tuple(q)] + altura, q[1]) for q in p])
        n = len(arr)
        for k in range(n):
            a, b = arr[k], arr[(k + 1) % n]
            za, zb = z0[tuple(a)], z0[tuple(b)]
            A = (a[0], za, a[1]); B = (b[0], zb, b[1])
            At = (a[0], za + altura, a[1]); Bt = (b[0], zb + altura, b[1])
            self.tri(A, B, Bt)
            self.tri(A, Bt, At)

    def banda(self, linea, z_de, ancho, altura):
        """Cinta elevada a lo largo de una polilínea: bordillos y marcas."""
        pts = [p for p in linea]
        for k in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[k][:2], pts[k + 1][:2]
            dx, dy = x1 - x0, y1 - y0
            L = math.hypot(dx, dy)
            if L < 1e-6:
                continue
            nx, ny = -dy / L * ancho / 2, dx / L * ancho / 2
            esquinas = [(x0 - nx, y0 - ny), (x0 + nx, y0 + ny),
                        (x1 + nx, y1 + ny), (x1 - nx, y1 - ny)]
            z = [z_de(x, y) + altura for x, y in esquinas]
            P = [(e[0], z[j], e[1]) for j, e in enumerate(esquinas)]
            self.tri(P[0], P[1], P[2])
            self.tri(P[0], P[2], P[3])


def main(dxf_path, salida):
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    ox, oy = utm_de(*PARCELA_LATLON)
    print(f'origen UTM: E={ox:.1f} N={oy:.1f}')

    dentro = lambda x, y: (x - ox) ** 2 + (y - oy) ** 2 <= (RADIO * 1.35) ** 2

    # ── 1. Relieve: curvas de nivel + malla del levantamiento ──
    pts = []
    for e in msp.query('POLYLINE[layer=="CURVADO"]'):
        ult = None
        for v in e.vertices:
            x, y, z = v.dxf.location
            if not dentro(x, y):
                continue
            # se ralea: las curvas traen un vértice cada pocos centímetros
            if ult and (x - ult[0]) ** 2 + (y - ult[1]) ** 2 < 1.5 ** 2:
                continue
            pts.append((x, y, z)); ult = (x, y)
    for e in msp.query('3DFACE[layer=="SUPERFICIE"]'):
        for p in puntos_de(e):
            if dentro(p[0], p[1]):
                pts.append(p)
    P = np.array(pts, dtype=np.float64)
    print(f'cotas para el terreno: {len(P)} puntos, Z {P[:,2].min():.1f}..{P[:,2].max():.1f}')

    interp = LinearNDInterpolator(P[:, :2], P[:, 2])
    z_medio = float(np.median(P[:, 2]))
    z0_parcela = float(interp(ox, oy)) if not np.isnan(interp(ox, oy)) else z_medio
    print(f'cota del terreno en la parcela: {z0_parcela:.2f} m')

    def z_de(x, y):
        z = interp(x, y)
        return float(z) if not np.isnan(z) else z_medio

    mallas = defaultdict(Malla)

    # terreno: triangulación de Delaunay recortada al radio pedido
    tri = Delaunay(P[:, :2])
    for s in tri.simplices:
        a, b, c = P[s[0]], P[s[1]], P[s[2]]
        cx, cy = (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3
        if (cx - ox) ** 2 + (cy - oy) ** 2 > RADIO ** 2:
            continue
        lados = [math.dist(a[:2], b[:2]), math.dist(b[:2], c[:2]), math.dist(c[:2], a[:2])]
        if max(lados) > 28:          # no cruzar huecos sin datos
            continue
        mallas['terreno'].tri((a[0], a[2], a[1]), (b[0], b[2], b[1]), (c[0], c[2], c[1]))

    # ── 2. Superficies pavimentadas ──
    aceras = []
    for e in msp.query('HATCH[layer=="TRAMAS ACERAS"]'):
        for anillo in contornos_hatch(e):
            if dentro(*anillo[0]):
                mallas['acera'].prisma(anillo, z_de, 0.0, H_ACERA)
                try:
                    p = Polygon(anillo)
                    if p.is_valid and p.area > 1:
                        aceras.append(p)
                except Exception:
                    pass
    for e in msp.query('HATCH[layer=="PAVIMENTO PODOTÁCTIL"]'):
        for anillo in contornos_hatch(e):
            if dentro(*anillo[0]):
                mallas['podotactil'].poligono(anillo, z_de, H_PODO)

    # Calzada: no hay capa de asfalto en el levantamiento, así que se deduce.
    # El bordillo ES el borde de la calzada, así que ensancharlo desde ahí y
    # restar las aceras deja la banda rodada. Partir de las aceras, como se hizo
    # primero, metía asfalto dentro de los solares.
    ambito = Polygon([(ox + RADIO * 0.92 * math.cos(t), oy + RADIO * 0.92 * math.sin(t))
                      for t in np.linspace(0, 2 * math.pi, 96)])
    from shapely.geometry import LineString
    bordillos = []
    for e in msp.query('LWPOLYLINE[layer=="BORDILLO"]'):
        pl = [(q[0], q[1]) for q in e.get_points() if dentro(q[0], q[1])]
        if len(pl) > 1:
            bordillos.append(LineString(pl))
    if bordillos:
        try:
            union = unary_union(aceras).buffer(0) if aceras else None
            eje = unary_union(bordillos)
            calzada = eje.buffer(8.0, join_style=2, cap_style=2, mitre_limit=2.0)
            if union is not None:
                calzada = calzada.difference(union.buffer(0.04))
            calzada = calzada.intersection(ambito)
            geoms = [calzada] if calzada.geom_type == 'Polygon' else list(calzada.geoms)
            n = 0
            for g in geoms:
                if g.area < 12:
                    continue
                mallas['asfalto'].poligono(list(g.exterior.coords)[:-1], z_de, 0.012,
                                           huecos=[list(h.coords)[:-1] for h in g.interiors])
                n += 1
            print(f'calzada: {n} recintos deducidos de las aceras')
        except Exception as exc:
            print('aviso: no se pudo deducir el asfalto:', exc)

    # ── 3. Bordillos y marcas viales ──
    for e in msp.query('LWPOLYLINE[layer=="BORDILLO"]'):
        pl = [(p[0], p[1]) for p in e.get_points() if dentro(p[0], p[1])]
        if len(pl) > 1:
            mallas['bordillo'].banda(pl, z_de, 0.20, H_BORDILLO)
    for e in msp.query('LWPOLYLINE[layer=="SEÑALIZACIÓN HORIZONTAL"]'):
        pl = [(p[0], p[1]) for p in e.get_points() if dentro(p[0], p[1])]
        if len(pl) > 1:
            mallas['marca_vial'].banda(pl, z_de, 0.12, H_MARCA)

    # ── 4. Edificaciones, vallados y muros ──
    for capa, destino, alt in (('EDIFICACIONES', 'edificacion', H_EDIF),
                               ('EDIFICADO', 'edificacion', H_EDIF),
                               ('VALLADO', 'muro', 1.9),
                               ('MUROS', 'muro', 1.6)):
        for e in msp.query(f'LWPOLYLINE[layer=="{capa}"]'):
            pl = [(p[0], p[1]) for p in e.get_points()]
            if len(pl) >= 3 and dentro(*pl[0]):
                if math.dist(pl[0], pl[-1]) < 0.05:
                    pl = pl[:-1]
                # Varias polilíneas de edificación vienen abiertas y describen
                # solo un tramo de fachada, no un recinto. Cerrarlas y extruirlas
                # a ciegas producía cuñas enormes atravesando el solar, así que
                # se descarta lo que no forme un recinto creíble.
                if capa in ('EDIFICACIONES', 'EDIFICADO'):
                    try:
                        pol = Polygon(pl)
                        if not pol.is_valid or pol.area < 12:
                            continue
                        largo = max(math.dist(a, b) for a in pl for b in pl)
                        compacidad = 4 * math.pi * pol.area / max(pol.length ** 2, 1e-6)
                        if (len(pl) < 4 or largo > 60 or compacidad < 0.32
                                or not pol.is_simple):
                            continue      # tira larga, astilla o contorno cruzado
                    except Exception:
                        continue
                if capa in ('VALLADO', 'MUROS'):
                    mallas[destino].banda(pl, z_de, 0.25, 0.0)
                    for k in range(len(pl) - 1):
                        mallas[destino].prisma([pl[k], pl[k + 1],
                                                (pl[k + 1][0] + 0.2, pl[k + 1][1]),
                                                (pl[k][0] + 0.2, pl[k][1])], z_de, 0, alt)
                else:
                    mallas[destino].prisma(pl, z_de, 0.0, alt)

    # ── 5. Registros: arquetas, pozos, imbornales ──
    for capa in ('ARQUETAS', 'IMBORNALES'):
        for e in msp.query(f'LWPOLYLINE[layer=="{capa}"]'):
            pl = [(p[0], p[1]) for p in e.get_points()]
            if len(pl) >= 3 and dentro(*pl[0]):
                mallas['arqueta'].poligono(pl, z_de, H_TAPA)
    for e in msp.query('CIRCLE[layer=="POZOS"]'):
        c, r = e.dxf.center, e.dxf.radius
        if dentro(c[0], c[1]):
            anillo = [(c[0] + r * math.cos(a), c[1] + r * math.sin(a))
                      for a in np.linspace(0, 2 * math.pi, 17)[:-1]]
            mallas['arqueta'].poligono(anillo, z_de, H_TAPA)

    # ── 6. Arbolado: un árbol por alcorque ──
    alcorques = [tuple(e.dxf.insert)[:2] for e in msp.query('INSERT[layer=="ALCORQUE"]')]
    alcorques = [p for p in alcorques if dentro(*p)]
    for x, y in alcorques:
        zb = z_de(x, y)
        lados = [(x + 0.09 * math.cos(a), y + 0.09 * math.sin(a))
                 for a in np.linspace(0, 2 * math.pi, 9)[:-1]]
        mallas['tronco'].prisma(lados, z_de, 0.0, 2.4)
        for nivel, (rad, alt) in enumerate(((1.5, 2.4), (1.9, 3.3), (1.3, 4.2))):
            anillo = [(x + rad * math.cos(a), y + rad * math.sin(a))
                      for a in np.linspace(0, 2 * math.pi, 11)[:-1]]
            m = mallas['copa']
            for k in range(len(anillo)):
                a1, a2 = anillo[k], anillo[(k + 1) % len(anillo)]
                m.tri((a1[0], zb + alt, a1[1]), (a2[0], zb + alt, a2[1]), (x, zb + alt + 1.0, y))
                m.tri((a1[0], zb + alt, a1[1]), (x, zb + alt - 0.5, y), (a2[0], zb + alt, a2[1]))
    print(f'arbolado: {len(alcorques)} alcorques')

    # ── 7. A los ejes de la escena y a GLB ──
    #    Origen en la parcela, Y arriba, y giro para que el eje largo del
    #    edificio (rumbo 70°) caiga sobre +X, igual que el resto del showroom.
    phi = math.radians(-(90 - RUMBO))
    cos_f, sin_f = math.cos(phi), math.sin(phi)

    def a_escena(p):
        x = p[0] - ox
        z = -(p[2] - oy)          # UTM norte → -Z
        y = p[1] - z0_parcela
        return (x * cos_f + z * sin_f, y, -x * sin_f + z * cos_f)

    gltf = GLTF2(asset=Asset(generator='UNIK · levantamiento topográfico'), scenes=[Scene(nodes=[])],
                 scene=0)
    blob = b''
    for nombre, m in mallas.items():
        if not m.i:
            continue
        V = np.array([a_escena(p) for p in m.v], dtype=np.float32)
        I = np.array(m.i, dtype=np.uint32)
        vb, ib = V.tobytes(), I.tobytes()
        off_v = len(blob); blob += vb + b'\x00' * ((4 - len(vb) % 4) % 4)
        off_i = len(blob); blob += ib + b'\x00' * ((4 - len(ib) % 4) % 4)

        bv_v = len(gltf.bufferViews)
        gltf.bufferViews.append(BufferView(buffer=0, byteOffset=off_v, byteLength=len(vb), target=34962))
        gltf.bufferViews.append(BufferView(buffer=0, byteOffset=off_i, byteLength=len(ib), target=34963))
        ac_v = len(gltf.accessors)
        gltf.accessors.append(Accessor(bufferView=bv_v, componentType=5126, count=len(V), type='VEC3',
                                       min=V.min(axis=0).tolist(), max=V.max(axis=0).tolist()))
        gltf.accessors.append(Accessor(bufferView=bv_v + 1, componentType=5125, count=len(I), type='SCALAR'))

        color, rug = MATERIALES.get(nombre, (0xaaaaaa, 0.9))
        srgb = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, 1.0]
        lin = [c ** 2.2 for c in srgb[:3]] + [1.0]
        mat = len(gltf.materials)
        gltf.materials.append(Material(name=nombre, doubleSided=True,
            pbrMetallicRoughness=PbrMetallicRoughness(baseColorFactor=lin,
                                                     metallicFactor=0.0, roughnessFactor=rug)))
        mesh = len(gltf.meshes)
        gltf.meshes.append(Mesh(name=nombre, primitives=[
            Primitive(attributes=Attributes(POSITION=ac_v), indices=ac_v + 1, material=mat)]))
        gltf.nodes.append(Node(name=nombre, mesh=mesh))
        gltf.scenes[0].nodes.append(len(gltf.nodes) - 1)
        print(f'  {nombre:12s} {len(V):7d} vértices  {len(I)//3:7d} triángulos')

    gltf.buffers.append(Buffer(byteLength=len(blob)))
    gltf.set_binary_blob(blob)
    gltf.save_binary(salida)
    print(f'\n{salida} · {len(blob)/1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
