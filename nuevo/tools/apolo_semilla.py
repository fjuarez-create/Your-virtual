#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Semilla de datos del Edificio Apolo para el showroom nuevo (/nuevo).

Lee las 166 fichas comerciales en PDF (assets/fichas/<id>.pdf, con
`pdftotext -layout`), las cruza con data/units.json (dormitorios, orientación,
superficies y precio del listado V.01), data/availability.json (estados) y
data/viviendas_serenea.json (polígono del modelo y superficie útil), agrupa las
viviendas en tipologías y escribe:

  nuevo/data/fuentes/apolo_semilla.json   una entrada por vivienda, con avisos
  nuevo/data/tipologias.json              tipologías, espejos y recuento de renders
  RUTA de --discrepancias                 tabla de discrepancias en Markdown

Tipología = misma lista de estancias (por tipo) con superficies útiles iguales
±0,15 m² Y mismo dibujo de plano (assets/planos/<id>.png) salvo giro o espejo.
Las terrazas no separan tipologías: dan "variantes" (cuentan para los renders
cenitales, no para los 360 interiores).

Uso:  python3 nuevo/tools/apolo_semilla.py [--discrepancias RUTA.md]
Requiere: pdftotext (poppler), Pillow y numpy.
"""
import argparse, datetime, glob, json, os, re, subprocess, sys, tempfile
from collections import Counter, OrderedDict

import numpy as np
from PIL import Image, ImageFilter

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NUEVO = os.path.join(RAIZ, 'nuevo')
TOL = 0.15            # m², tolerancia entre estancias de una misma tipología
TOL_TERRAZA = 0.5     # m², tolerancia para agrupar terrazas en una variante
UMBRAL_PLANO = 0.93   # correlación mínima entre planos de una misma tipología
NUM = r'(\d+[.,]\d+)'

# ----------------------------------------------------------------- estancias
# tipo -> (código base, nombre del tipo en la plantilla, orden canónico, 360 por defecto)
TIPOS = OrderedDict([
    ('salon-comedor-cocina', ('SCC', 'Salón-comedor-cocina', 10, True)),
    ('estudio', ('EST', 'Estudio (dormitorio-salón-comedor-cocina)', 11, True)),
    ('dormitorio-principal', ('D', 'Dormitorio principal', 20, True)),
    ('dormitorio', ('D', 'Dormitorio', 21, True)),
    ('bano', ('B', 'Baño', 30, True)),
    ('vestidor', ('VE', 'Vestidor', 40, False)),
    ('distribuidor', ('DI', 'Distribuidor', 50, False)),
    ('lavadero', ('LA', 'Lavadero', 60, False)),
    ('terraza', ('TE', 'Terraza', 70, None)),
])


def tipo_estancia(nombre):
    n = nombre.lower().strip()
    if n.startswith('dormitorio-salón') or n.startswith('dormitorio - salón'):
        return 'estudio'
    if n.startswith('salón'):
        return 'salon-comedor-cocina'
    if n == 'dormitorio principal':
        return 'dormitorio-principal'
    if n.startswith('dormitorio'):
        return 'dormitorio'
    if n.startswith('baño') or n.startswith('aseo'):
        return 'bano'
    for t in ('vestidor', 'distribuidor', 'lavadero', 'terraza'):
        if n.startswith(t):
            return t
    raise ValueError('estancia desconocida: %r' % nombre)


# -------------------------------------------------------------------- fichas
def leer_ficha(pdf):
    txt = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True,
                         check=True).stdout.decode('utf-8')
    lineas = txt.split('\n')
    d = {'estancias': [], 'avisosLectura': []}
    m = re.search(r'Ref\.\s*(SEAP-\d+)', txt)
    d['ref'] = m.group(1) if m else None
    m = re.search(r'Nivel\s+(\d)\s*-\s*Vivienda\s+(\d+)', txt)
    d['nivelCabecera'] = int(m.group(1)) if m else None
    d['numCabecera'] = m.group(2) if m else None
    pies = re.findall(r'^\s{20,}Nivel\s+(\d)\s*$', txt, re.M)
    d['nivelPie'] = int(pies[-1]) if pies else None
    d['edificio'] = 'Apolo' if 'Edificio Apolo' in txt else None
    zona = None

    def valor(i, resto):
        m = re.match(r'\s*' + NUM + r'\s*m', resto)
        if m:
            return float(m.group(1).replace(',', '.'))
        # valor partido en dos líneas ("…RZZCC   2" / "59.46 m"), pasa en 225, 325 y 427
        for j in range(i + 1, min(i + 4, len(lineas))):
            m = re.match(r'^\s*' + NUM + r'\s*m\b', lineas[j])
            if m:
                d['avisosLectura'].append('valor partido en dos líneas: ' + lineas[i].strip()[:40])
                return float(m.group(1).replace(',', '.'))
        return None

    for i, ln in enumerate(lineas):
        if ln.strip().startswith('Superficies útiles por estancias'):
            zona = 'est'
            continue
        m = re.match(r'^\s*Superficie construida (interior|exterior|RZZCC)\b(.*)$', ln)
        if m:
            zona = 'tot'
            clave = {'interior': 'supConsInt', 'exterior': 'supConsExt', 'RZZCC': 'supConsZZCC'}[m.group(1)]
            d[clave] = valor(i, m.group(2))
            continue
        if zona == 'est':
            m = re.match(r'^\s*(\S.*?)\s{2,}' + NUM + r'\s*m2', ln)
            if m:
                d['estancias'].append({'nombre': m.group(1).strip(),
                                       'sup': float(m.group(2).replace(',', '.'))})
            elif re.match(r'^\s*[A-Za-zÁÉÍÓÚáéíóúñÑ]', ln):
                d['avisosLectura'].append('línea de estancia sin superficie: ' + ln.strip()[:60])
    return d


# -------------------------------------------------------------------- planos
TRANSFORMACIONES = OrderedDict([
    ('igual', (None, False)),
    ('giro180', (Image.ROTATE_180, False)),
    ('giro90', (Image.ROTATE_90, False)),
    ('giro270', (Image.ROTATE_270, False)),
    ('espejoH', (Image.FLIP_LEFT_RIGHT, True)),
    ('espejoV', (Image.FLIP_TOP_BOTTOM, True)),
    ('traspuesta', (Image.TRANSPOSE, True)),
    ('transversa', (Image.TRANSVERSE, True)),
])
LADO = 96


def vectores_plano(png):
    """Dos capas (muros; muros + mobiliario + puertas) recortadas a la caja de los
    muros, engrosadas, reducidas a 96×96 y normalizadas, para cada transformación."""
    g = Image.open(png).convert('L')
    muros = g.point(lambda v: 255 if v < 90 else 0)
    lineas = g.point(lambda v: 255 if v < 170 else 0)
    caja = muros.getbbox()
    capas = [muros.crop(caja), lineas.crop(caja)]
    out = {}
    for nombre, (tr, _) in TRANSFORMACIONES.items():
        vs = []
        for c in capas:
            im = c.transpose(tr) if tr is not None else c
            a = np.asarray(im.filter(ImageFilter.MaxFilter(5)).resize((LADO, LADO), Image.BOX),
                           dtype=np.float64).ravel()
            a = a - a.mean()
            a /= (np.linalg.norm(a) or 1.0)
            vs.append(a)
        out[nombre] = np.concatenate(vs) / np.sqrt(2)
    return out


def comparar(va, vb):
    """Devuelve (transformación de A que mejor casa con B, puntuación, mejor de la quiralidad contraria)."""
    pts = {k: float(np.dot(va[k], vb['igual'])) for k in TRANSFORMACIONES}
    mejor = max(pts, key=pts.get)
    contraria = max(v for k, v in pts.items() if TRANSFORMACIONES[k][1] != TRANSFORMACIONES[mejor][1])
    return mejor, pts[mejor], contraria


# ------------------------------------------------------------- tipologías
def firma(estancias):
    """{tipo agrupado: [superficies ordenadas]} sin terraza. Dormitorio principal y
    secundarios van por separado; 'Dormitorio individual' = 'Dormitorio secundario'."""
    f = {}
    for e in estancias:
        if e['tipo'] == 'terraza':
            continue
        f.setdefault(e['tipo'], []).append(e['sup'])
    return {k: sorted(v) for k, v in f.items()}


def mismas_estancias(fa, fb, tol=TOL):
    if set(fa) != set(fb):
        return False
    for k in fa:
        if len(fa[k]) != len(fb[k]):
            return False
        if any(abs(x - y) > tol + 1e-9 for x, y in zip(fa[k], fb[k])):
            return False
    return True


def nivel_de(vid):
    return int(vid[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--discrepancias', help='ruta del informe de discrepancias (.md)')
    args = ap.parse_args()

    units = {u['id']: u for u in json.load(open(os.path.join(RAIZ, 'data', 'units.json'), encoding='utf-8'))}
    estados = json.load(open(os.path.join(RAIZ, 'data', 'availability.json'), encoding='utf-8'))
    modelo = json.load(open(os.path.join(RAIZ, 'data', 'viviendas_serenea.json'), encoding='utf-8'))['viviendas']
    pdfs = sorted(glob.glob(os.path.join(RAIZ, 'assets', 'fichas', '*.pdf')))
    fichas = {os.path.basename(p)[:-4]: leer_ficha(p) for p in pdfs}
    ids = sorted(fichas)
    assert set(ids) == set(units) == set(estados) == set(modelo), 'los ids de las fuentes no coinciden'

    disc = []   # (vivienda, campo, ficha, otra fuente, decisión)

    # ------------------------------------------------ correcciones probadas
    # 109: la ficha da salón 13,50 (= dormitorio) y no trae distribuidor. Su plano
    # PNG es idéntico al de la 211 y la 311 (correlación 1,00), con la misma
    # construida (43,48 / 53,68), y el polígono del modelo (38,85 m²) casa con la
    # útil corregida (38,91) y no con la de la ficha (30,51).
    # 336: el PDF es una copia de la 236 (cabecera "Nivel 2 - Vivienda 36",
    # Ref. SEAP-236; solo cambia el rótulo "Nivel 3") y no hay plano 336.png.
    # Todas las demás viviendas de nivel 3 son idénticas a su homóloga de nivel 2.
    correcciones = {
        '109': ('211', 'La ficha 109 da «Salón - comedor - cocina 13.50» (igual que el dormitorio) y no tiene distribuidor: útil 30,51 m², razón 0,70. '
                       'Su plano es idéntico al de la 211 y la 311 (misma construida 43,48 / 53,68) y el polígono del modelo mide 38,85 m². '
                       'Se toman las estancias de la 211 (útil 38,91 m²). Pedir la ficha corregida.'),
        '336': ('236', 'El PDF de la 336 es una copia de la 236 (Ref. SEAP-236, cabecera «Nivel 2 - Vivienda 36») y no existe planos/336.png. '
                       'Se toman los datos de la 236, como en todas las demás parejas 2xx/3xx, que son idénticas. Pedir la ficha y el plano de la 336.'),
    }

    viviendas = OrderedDict()
    for vid in ids:
        F = fichas[vid]
        U = units[vid]
        M = modelo[vid]
        avisos = []
        revisar = set()     # campos a marcar en amarillo en la plantilla
        fuente = F
        if vid in correcciones:
            otro, texto = correcciones[vid]
            fuente = fichas[otro]
            avisos.append(texto)
            revisar.update(['estancias'])
        estancias = []
        for e in fuente['estancias']:
            estancias.append({'nombre': e['nombre'], 'sup': e['sup'], 'tipo': tipo_estancia(e['nombre'])})
        ext = fuente.get('supConsExt') or 0.0
        sup_util = round(sum(e['sup'] for e in estancias), 2)
        # orden canónico y códigos
        estancias.sort(key=lambda e: (TIPOS[e['tipo']][2], -e['sup']))
        cont = Counter()
        for e in estancias:
            base = TIPOS[e['tipo']][0]
            if e['tipo'] in ('dormitorio-principal', 'dormitorio'):
                base = 'D'
            cont[base] += 1
            e['codigo'] = base + (str(cont[base]) if base in ('D', 'B') else ('' if cont[base] == 1 else str(cont[base])))
            e['tiene360'] = TIPOS[e['tipo']][3]
            e['puntos360'] = 1 if e['tiene360'] else 0
        if ext > 0:
            # la ficha solo da la superficie CONSTRUIDA exterior: la útil queda vacía
            grande = ext >= 10
            estancias.append({'nombre': 'Terraza', 'sup': None, 'tipo': 'terraza', 'codigo': 'TE',
                              'tiene360': grande, 'puntos360': (2 if ext >= 40 else 1) if grande else 0,
                              'supConstruida': ext})
        ndorm = sum(1 for e in estancias if e['tipo'] in ('dormitorio-principal', 'dormitorio'))
        nbanos = sum(1 for e in estancias if e['tipo'] == 'bano')
        estudio = any(e['tipo'] == 'estudio' for e in estancias)

        sup_int = fuente['supConsInt']
        sup_zz = fuente['supConsZZCC']
        ref = 'SEAP-' + vid

        # ---- discrepancias
        if F['ref'] != ref:
            disc.append((vid, 'Referencia', F['ref'], ref + ' (id)', 'Se usa ' + ref + '; la ficha es una copia de la 236'))
        if F['nivelCabecera'] != nivel_de(vid) or F['numCabecera'] != vid[1:]:
            disc.append((vid, 'Cabecera de la ficha', 'Nivel %s - Vivienda %s' % (F['nivelCabecera'], F['numCabecera']),
                         'Nivel %d - Vivienda %s' % (nivel_de(vid), vid[1:]), 'Ficha mal generada'))
        if F['avisosLectura']:
            disc.append((vid, 'Lectura del PDF', '; '.join(F['avisosLectura']), '—',
                         'Leído correctamente (%.2f m²); solo es maquetación' % F['supConsZZCC']))
        if vid in correcciones:
            disc.append((vid, 'Estancias / sup. útil', '%.2f m² (%s)' % (F['supUtil'] if 'supUtil' in F else sum(e['sup'] for e in F['estancias']),
                         ', '.join('%s %.2f' % (e['nombre'], e['sup']) for e in F['estancias'])),
                         '%.2f m² (datos de la %s)' % (sup_util, correcciones[vid][0]),
                         'Se precarga la corrección, marcada en amarillo'))
        if abs(U['supViv'] - sup_int) > 0.005:
            disc.append((vid, 'Sup. construida interior', '%.2f' % sup_int, 'units.json supViv %.2f' % U['supViv'],
                         'Se usa la ficha'))
            avisos.append('units.json da %.2f m² construidos y la ficha %.2f; el precio %s € puede estar calculado con la superficie errónea (la 222, gemela, cuesta %s €).'
                          % (U['supViv'], sup_int, '{:,}'.format(U['precio']).replace(',', '.'),
                             '{:,}'.format(units.get('2' + vid[1:], U)['precio']).replace(',', '.')))
            revisar.add('precio')
        if abs((U['terraza'] or 0) - ext) > 0.005:
            disc.append((vid, 'Terraza', '%.2f' % ext, 'units.json %.2f' % U['terraza'], 'Se usa la ficha (diferencia de 0,01)'))
        if abs(U['supTotal'] - U['supViv'] - U['terraza']) > 0.011:
            disc.append((vid, 'supTotal (units.json)', '—', '%.2f ≠ %.2f + %.2f' % (U['supTotal'], U['supViv'], U['terraza']),
                         'No se usa supTotal'))
        if U['dorm'] != ndorm:
            disc.append((vid, 'Dormitorios', '%d (%s)' % (ndorm, 'estudio' if estudio else 'estancias de la ficha'),
                         'units.json dorm %d' % U['dorm'], 'Se usa la ficha'))
            avisos.append('units.json dice %d dormitorios y la ficha %d.' % (U['dorm'], ndorm))
        if abs(M['supUtil'] - sup_util) > 0.005 and vid not in correcciones:
            disc.append((vid, 'Sup. útil', '%.2f' % sup_util, 'viviendas_serenea supUtil %.2f' % M['supUtil'], 'Se usa la ficha'))
        razon_modelo = M['area'] / sup_util
        if abs(razon_modelo - 1) > 0.03:
            disc.append((vid, 'Polígono del modelo', 'útil %.2f' % sup_util, 'area %.2f (%+.1f %%)' % (M['area'], (razon_modelo - 1) * 100),
                         'Revisar el polígono antes de usarlo como velo'))
        razon = sup_util / sup_int
        if not (0.75 <= razon <= 0.95):
            avisos.append('Razón útil/construida %.2f fuera de 0,75–0,95.' % razon)

        nombres_dorm = [e['nombre'] for e in estancias if e['tipo'] == 'dormitorio']
        viviendas[vid] = OrderedDict([
            ('id', vid), ('referencia', ref), ('nivel', nivel_de(vid)), ('plantaUnits', U['planta']),
            ('dormitorios', ndorm), ('banos', nbanos), ('estudio', estudio),
            ('orientacion', U['orientacion']),
            ('supUtil', sup_util), ('supConstruidaInterior', sup_int), ('supConstruidaZZCC', sup_zz),
            ('terraza', round(ext, 2)), ('precio', U['precio']),
            ('estadoSemilla', estados[vid]),
            ('estancias', estancias),
            ('poligonoArea', M['area']),
            ('avisos', avisos), ('revisar', sorted(revisar)),
            ('fuenteDatos', 'ficha %s' % (correcciones[vid][0] if vid in correcciones else vid)),
        ])

    # nombres distintos para el mismo dormitorio (informativo)
    nombres = Counter(e['nombre'] for v in viviendas.values() for e in v['estancias'] if e['tipo'] == 'dormitorio')
    # ------------------------------------------------ comparación de planos
    vec = {}
    for vid in ids:
        png = os.path.join(RAIZ, 'assets', 'planos', vid + '.png')
        if os.path.exists(png):
            vec[vid] = vectores_plano(png)
        else:
            viviendas[vid]['avisos'].append('No hay plano assets/planos/%s.png.' % vid)

    # ------------------------------------------------ agrupación
    grupos = []   # cada grupo: {'ref': id, 'ids': [...], 'firma': f}
    for vid in ids:
        f = firma(viviendas[vid]['estancias'])
        sitio = None
        for g in grupos:
            if not all(mismas_estancias(f, firma(viviendas[o]['estancias'])) for o in g['ids']):
                continue
            if vid in vec and g['ref'] in vec:
                _, p, _ = comparar(vec[vid], vec[g['ref']])
                if p < UMBRAL_PLANO:
                    continue
            sitio = g
            break
        if sitio is None:
            grupos.append({'ref': vid, 'ids': [vid]})
        else:
            sitio['ids'].append(vid)

    # parejas de planos casi iguales que han quedado en tipologías distintas (control)
    casi = []
    refs = [g['ref'] for g in grupos if g['ref'] in vec]
    for i, a in enumerate(refs):
        for b in refs[i + 1:]:
            t, p, _ = comparar(vec[a], vec[b])
            if p >= UMBRAL_PLANO:
                casi.append((a, b, t, round(p, 3)))

    # códigos: <dormitorios>D-<nn> (E-<nn> para estudios), numerados por id más bajo
    cont = Counter()
    tipologias = []
    for g in grupos:
        v0 = viviendas[g['ref']]
        clave = 'E' if v0['estudio'] else '%dD' % v0['dormitorios']
        cont[clave] += 1
        codigo = '%s-%02d' % (clave, cont[clave])
        orient = OrderedDict()
        espejadas = []
        punt = []
        for vid in g['ids']:
            if vid == g['ref']:
                orient[vid] = 'igual'
                continue
            if vid in vec and g['ref'] in vec:
                t, p, contraria = comparar(vec[g['ref']], vec[vid])
                orient[vid] = t
                punt.append((p, contraria))
                if TRANSFORMACIONES[t][1]:
                    espejadas.append(vid)
            else:
                orient[vid] = 'sin plano'
        for vid in g['ids']:
            viviendas[vid]['tipologia'] = codigo
            viviendas[vid]['transformacionPlano'] = orient[vid]
        # variantes por terraza
        variantes = []
        for vid in g['ids']:
            t = viviendas[vid]['terraza']
            for var in variantes:
                if abs(var['terraza'] - t) <= TOL_TERRAZA:
                    var['ids'].append(vid)
                    break
            else:
                variantes.append({'terraza': t, 'ids': [vid]})
        for var in variantes:
            ts = [viviendas[x]['terraza'] for x in var['ids']]
            var['terraza'] = [min(ts), max(ts)] if min(ts) != max(ts) else min(ts)
            var['espejadas'] = [x for x in var['ids'] if x in espejadas]
        # estancias de referencia con su rango
        est_ref = []
        for e in viviendas[g['ref']]['estancias']:
            if e['tipo'] == 'terraza':
                continue
            sups = [x['sup'] for vid in g['ids'] for x in viviendas[vid]['estancias'] if x['codigo'] == e['codigo']]
            est_ref.append(OrderedDict([('codigo', e['codigo']), ('tipo', e['tipo']), ('nombre', e['nombre']),
                                        ('sup', e['sup']), ('rango', [min(sups), max(sups)]), ('tiene360', e['tiene360'])]))
        niveles = sorted({nivel_de(x) for x in g['ids']})
        ventanas = sorted({'antepecho' if n == 1 else 'suelo-techo' for n in niveles})
        n360_interior = sum(1 for e in est_ref if e['tiene360']) * len(ventanas)
        n360_terraza = 0
        for var in variantes:
            t = var['terraza'] if not isinstance(var['terraza'], list) else var['terraza'][0]
            if t >= 10:
                n360_terraza += 2 if t >= 40 else 1
        ints = [viviendas[x]['supConstruidaInterior'] for x in g['ids']]
        tipologias.append(OrderedDict([
            ('codigo', codigo),
            ('ids', g['ids']),
            ('recuento', len(g['ids'])),
            ('niveles', niveles),
            ('dormitorios', v0['dormitorios']),
            ('banos', v0['banos']),
            ('estudio', v0['estudio']),
            ('estancias', est_ref),
            ('supUtil', [min(viviendas[x]['supUtil'] for x in g['ids']), max(viviendas[x]['supUtil'] for x in g['ids'])]),
            ('supConstruidaInterior', [min(ints), max(ints)]),
            ('orientaciones', dict(Counter(viviendas[x]['orientacion'] for x in g['ids']))),
            ('referencia', g['ref']),
            ('espejadas', espejadas),
            ('transformaciones', orient),
            ('similitudMinima', round(min(p for p, _ in punt), 3) if punt else None),
            ('margenQuiralidad', round(min(p - c for p, c in punt), 3) if punt else None),
            ('variantes', variantes),
            ('ventanas', ventanas),
            ('renders', OrderedDict([
                ('cenitales', len(variantes)),
                ('cenitalesSinEspejo', sum(1 + (1 if var['espejadas'] and len(var['espejadas']) < len(var['ids']) else 0) for var in variantes)),
                ('p360Interior', n360_interior),
                ('p360Terraza', n360_terraza),
            ])),
        ]))

    # ------------------------------------------------ salidas
    hoy = datetime.date.today().isoformat()
    resumen = OrderedDict([
        ('viviendas', len(ids)),
        ('tipologias', len(tipologias)),
        ('tipologiasConUnaSolaVivienda', sum(1 for t in tipologias if t['recuento'] == 1)),
        ('rendersCenitales', sum(t['renders']['cenitales'] for t in tipologias)),
        ('rendersCenitalesSinReutilizarEspejos', sum(t['renders']['cenitalesSinEspejo'] for t in tipologias)),
        ('puntos360Interior', sum(t['renders']['p360Interior'] for t in tipologias)),
        ('puntos360Terraza', sum(t['renders']['p360Terraza'] for t in tipologias)),
    ])
    salida_tip = OrderedDict([
        ('generado', hoy),
        ('edificio', 'apolo'),
        ('criterio', 'Misma lista de estancias por tipo con superficies útiles iguales ±%.2f m² (fichas PDF) y mismo plano '
                     '(assets/planos/<id>.png) salvo giro o espejo, con correlación ≥ %.2f. Las terrazas no separan '
                     'tipologías: forman variantes (±%.1f m²).' % (TOL, UMBRAL_PLANO, TOL_TERRAZA)),
        ('transformaciones', 'Cómo se pasa del plano de la vivienda de referencia al de cada vivienda: igual, giro90/180/270 '
                             '(misma distribución girada) o espejoH/espejoV/traspuesta/transversa (distribución simétrica). '
                             'Las «espejadas» son las de quiralidad contraria a la referencia.'),
        ('renders', 'cenitales = una imagen por variante (terraza distinta) reutilizando la imagen volteada en las espejadas; '
                    'cenitalesSinEspejo = si no se quiere voltear la imagen; p360Interior = puntos con 360 (salón/estudio, '
                    'dormitorios, baños) × tipos de ventana presentes (nivel 1 antepecho; niveles 2-4 suelo-techo); '
                    'p360Terraza = terrazas ≥ 10 m² (2 puntos si ≥ 40 m²).'),
        ('resumen', resumen),
        ('planosCasiIgualesEntreTipologias', [{'a': a, 'b': b, 'transformacion': t, 'similitud': p} for a, b, t, p in casi]),
        ('tipologias', tipologias),
    ])
    with open(os.path.join(NUEVO, 'data', 'tipologias.json'), 'w', encoding='utf-8') as fh:
        json.dump(salida_tip, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(NUEVO, 'data', 'fuentes', 'apolo_semilla.json'), 'w', encoding='utf-8') as fh:
        json.dump(OrderedDict([('generado', hoy),
                               ('fuentes', ['assets/fichas/*.pdf', 'data/units.json', 'data/availability.json',
                                            'data/viviendas_serenea.json', 'assets/planos/*.png']),
                               ('nombresDormitorio', dict(nombres)),
                               ('viviendas', viviendas)]), fh, ensure_ascii=False, indent=1)

    if args.discrepancias:
        escribir_discrepancias(args.discrepancias, disc, viviendas, units, estados, nombres, casi, resumen)
    print('viviendas %d · tipologías %d · discrepancias %d · planos casi iguales entre tipologías %d'
          % (len(ids), len(tipologias), len(disc), len(casi)))
    print(json.dumps(resumen, ensure_ascii=False))


def escribir_discrepancias(ruta, disc, viviendas, units, estados, nombres, casi, resumen):
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    L = ['# Discrepancias entre fuentes · Edificio Apolo', '',
         'Generado por `nuevo/tools/apolo_semilla.py` el %s. Fuente principal: fichas PDF (`assets/fichas/<id>.pdf`).' % datetime.date.today().isoformat(),
         'Se comparan con `data/units.json` (listado de precios V.01), `data/availability.json` y `data/viviendas_serenea.json`.', '',
         '## Tabla', '', '| Vivienda | Campo | Ficha PDF | Otra fuente | Decisión |', '|---|---|---|---|---|']
    for d in disc:
        L.append('| ' + ' | '.join(str(x).replace('|', '/') for x in d) + ' |')
    L += ['', '## Observaciones generales', '',
          '- **Estados**: `data/availability.json` es una disponibilidad de DEMOSTRACIÓN (commit a525537, «disponibilidad demo 70/30 fija»): '
          'una de cada tres viviendas sale vendida (102, 105, 108…). Recuento: %s. Los estados reales viven solo en el servidor '
          '(`gestion/datos/estado.json`, servido por `/gestion/api/estado.php`). La plantilla los lleva precargados y marcados en amarillo: '
          'hay que sustituirlos por los reales antes de la primera carga.' % dict(Counter(estados.values())),
          '- **Precios**: salen del listado de precios V.01 (agosto 2026, según README). En Drive existe `SERENEA_Pricing v.07`: '
          'confirmar que siguen vigentes.',
          '- **Nombre de las plantas**: `units.json` dice Baja / 1ª / 2ª / Ático; las fichas dicen Nivel 1 / 2 / 3 / 4 y el cliente habla de '
          '«planta 1, 2, 3 y ático». La plantilla usa Planta 1, Planta 2, Planta 3 y Ático (ventana con antepecho solo en la Planta 1).',
          '- **Dormitorios**: el mismo dormitorio se llama de formas distintas según la ficha: %s. '
          'Las fichas de nivel 2 y 3 con orientación Noreste (212–216, 312–316) dicen «Dormitorio individual»; las demás, «Dormitorio secundario».'
          % ', '.join('«%s» ×%d' % kv for kv in nombres.most_common()),
          '- **Terrazas**: las fichas solo dan «Superficie construida exterior»; no hay superficie útil de terraza. En la planta 1 las '
          'viviendas a jardín interior 107, 108, 116, 117, 123 y 124 tienen 11,92–11,94 m² exteriores (¿patio o terraza?).',
          '- **Ficha 317**: los rótulos de las viviendas vecinas del plano de situación son los de la planta 2 (216, 217, 218). Sin efecto en los datos.',
          '- **`viviendas_serenea.json`**: su `supUtil` coincide con las fichas en las 166 viviendas (incluida la 109 errónea: se calculó de la misma ficha). '
          'El área del polígono del modelo está a menos del 3 % de la útil en todas menos la 109, lo que confirma la corrección.',
          ]
    if casi:
        L += ['', '## Planos casi iguales en tipologías distintas', '',
              'Planos que casan (≥ 0,93) pero con estancias que difieren más de 0,15 m²: posibles erratas o variantes mínimas.', '',
              '| A | B | Transformación | Similitud | Estancias A | Estancias B |', '|---|---|---|---|---|---|']
        for a, b, t, p in casi:
            ea = ', '.join('%s %.2f' % (e['codigo'], e['sup']) for e in viviendas[a]['estancias'] if e['sup'] is not None)
            eb = ', '.join('%s %.2f' % (e['codigo'], e['sup']) for e in viviendas[b]['estancias'] if e['sup'] is not None)
            L.append('| %s | %s | %s | %.3f | %s | %s |' % (a, b, t, p, ea, eb))
    L += ['', '## Resumen de tipologías', '', '```', json.dumps(resumen, ensure_ascii=False, indent=1), '```', '']
    with open(ruta, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(L))


if __name__ == '__main__':
    main()
