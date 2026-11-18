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
UMBRAL_PLANO = 0.80   # correlación mínima entre planos de una misma tipología (medido: 0,84–1,00)
UMBRAL_FAMILIA = 0.80 # entre tipologías con el mismo programa y otras medidas
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
# Los planos PNG están todos a la misma escala (≈125 px/m, comprobado con los
# polígonos del modelo), así que se comparan sin reescalar: correlación
# normalizada de máscaras con búsqueda de desplazamiento por FFT, para los ocho
# giros/espejos. Así una terraza o un jardín dibujado en un plano y no en otro
# solo resta un poco de parecido, en vez de descolocar la comparación.
# Quiralidad: giros = misma distribución girada; espejos = distribución simétrica.
TRANSFORMACIONES = OrderedDict([
    ('igual', (lambda a: a, False)),
    ('giro180', (lambda a: np.rot90(a, 2), False)),
    ('giro90', (lambda a: np.rot90(a, 1), False)),
    ('giro270', (lambda a: np.rot90(a, 3), False)),
    ('espejoH', (np.fliplr, True)),
    ('espejoV', (np.flipud, True)),
    ('traspuesta', (lambda a: a.T, True)),
    ('transversa', (lambda a: np.rot90(a, 2).T, True)),
])
REDUCCION = 8      # 1 px = 8 px del plano ≈ 6,4 cm
LIENZO = 448       # lado del lienzo de la FFT (≥ suma de los lados de dos planos reducidos)


class Plano:
    """Dos capas del plano (muros; muros + mobiliario + puertas), engrosadas y reducidas,
    con sus FFT precalculadas para cada transformación."""

    def __init__(self, png):
        g = Image.open(png).convert('L')
        self.capas = []
        for umbral in (90, 170):
            m = g.point([255 if v < umbral else 0 for v in range(256)]).filter(ImageFilter.MaxFilter(5))
            m = m.crop(m.getbbox())
            m = m.resize((max(1, m.width // REDUCCION), max(1, m.height // REDUCCION)), Image.BOX)
            self.capas.append(np.asarray(m, dtype=np.float64) / 255.0)
        self.normas = [float(np.sqrt((c * c).sum())) for c in self.capas]
        self.fft = {k: [np.fft.rfft2(f(c), (LIENZO, LIENZO)) for c in self.capas]
                    for k, (f, _) in TRANSFORMACIONES.items()}
        self.conj = [np.conj(x) for x in self.fft['igual']]


def comparar(pa, pb):
    """Transformación de A que mejor casa con B, su puntuación (0–1) y la mejor de la
    quiralidad contraria (la diferencia es el margen con que se decide si es espejo)."""
    pts = {}
    for k in TRANSFORMACIONES:
        s = 0.0
        for i in (0, 1):
            c = np.fft.irfft2(pa.fft[k][i] * pb.conj[i], (LIENZO, LIENZO)).max()
            s += c / (pa.normas[i] * pb.normas[i])
        pts[k] = s / 2
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


def coma(x):
    return ('%.2f' % x).replace('.', ',')


def miles(n):
    return '{:,}'.format(int(n)).replace(',', '.')


def n_dorm(n, estudio=False):
    if estudio or n == 0:
        return 'estudio (0 dormitorios)'
    return '%d dormitorio%s' % (n, '' if n == 1 else 's')


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
        for i, e in enumerate(fuente['estancias']):
            estancias.append({'nombre': e['nombre'], 'sup': e['sup'], 'tipo': tipo_estancia(e['nombre']), '_i': i})
        ext = fuente.get('supConsExt') or 0.0
        sup_util = round(sum(e['sup'] for e in estancias), 2)
        # orden canónico y códigos
        estancias.sort(key=lambda e: (TIPOS[e['tipo']][2], e['_i']))   # tipo canónico y, dentro, orden de la ficha
        for e in estancias:
            del e['_i']
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
            avisos.append('units.json da %s m² construidos y la ficha %s; el precio %s € puede estar calculado con la superficie errónea (la %s, gemela, cuesta %s €).'
                          % (coma(U['supViv']), coma(sup_int), miles(U['precio']), '2' + vid[1:],
                             miles(units.get('2' + vid[1:], U)['precio'])))
            revisar.add('precio')
        if abs((U['terraza'] or 0) - ext) > 0.005:
            disc.append((vid, 'Terraza', '%.2f' % ext, 'units.json %.2f' % U['terraza'], 'Se usa la ficha (diferencia de 0,01)'))
        if abs(U['supTotal'] - U['supViv'] - U['terraza']) > 0.011:
            disc.append((vid, 'supTotal (units.json)', '—', '%.2f ≠ %.2f + %.2f' % (U['supTotal'], U['supViv'], U['terraza']),
                         'No se usa supTotal'))
        if U['dorm'] != ndorm:
            disc.append((vid, 'Dormitorios', '%d (%s)' % (ndorm, 'estudio' if estudio else 'estancias de la ficha'),
                         'units.json dorm %d' % U['dorm'], 'Se usa la ficha'))
            avisos.append('units.json (listado V.01) dice %s y la ficha %s: se usa la ficha.' % (n_dorm(U['dorm']), n_dorm(ndorm, estudio)))
            revisar.add('dormitorios')
        if abs(M['supUtil'] - sup_util) > 0.005 and vid not in correcciones:
            disc.append((vid, 'Sup. útil', '%.2f' % sup_util, 'viviendas_serenea supUtil %.2f' % M['supUtil'], 'Se usa la ficha'))
        razon_modelo = M['area'] / sup_util
        if abs(razon_modelo - 1) > 0.03:
            disc.append((vid, 'Polígono del modelo', 'útil %.2f' % sup_util, 'area %.2f (%+.1f %%)' % (M['area'], (razon_modelo - 1) * 100),
                         'Revisar el polígono antes de usarlo como velo'))
        razon = sup_util / sup_int
        if not (0.75 <= razon <= 0.95):
            avisos.append('Razón útil/construida %s fuera de 0,75–0,95.' % coma(razon))

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

    # precios con indicio de estar calculados con la clase de dormitorios equivocada:
    # su €/m² casa con la mediana de la clase que dice units.json y no con la de la ficha
    import statistics
    clases = {}
    for vid, v in viviendas.items():
        if units[vid]['dorm'] == v['dormitorios']:
            clases.setdefault((v['nivel'], v['orientacion'], v['dormitorios']), []).append(v['precio'] / v['supConstruidaInterior'])
    for vid, v in viviendas.items():
        du = units[vid]['dorm']
        if du == v['dormitorios']:
            continue
        r = v['precio'] / v['supConstruidaInterior']
        real = clases.get((v['nivel'], v['orientacion'], v['dormitorios']))
        falsa = clases.get((v['nivel'], v['orientacion'], du))
        if real and falsa and abs(r - statistics.median(falsa)) < abs(r - statistics.median(real)):
            v['avisos'].append('Su precio (%s €/m²) casa con la tarifa de las de %s (%s €/m²) y no con la de las de %s (%s €/m²): confirmar el precio en el Pricing.'
                               % (miles(round(r)), n_dorm(du), miles(round(statistics.median(falsa))),
                                  n_dorm(v['dormitorios']), miles(round(statistics.median(real)))))
            v['revisar'] = sorted(set(v['revisar']) | {'precio'})
            disc.append((vid, 'Precio (indicio)', '%d dormitorios' % v['dormitorios'], '%s € = %d €/m², tarifa de %d dorm.' % ('{:,}'.format(v['precio']).replace(',', '.'), round(r), du),
                         'Se precarga el precio de units.json, marcado en amarillo'))

    # nombres distintos para el mismo dormitorio (informativo)
    nombres = Counter(e['nombre'] for v in viviendas.values() for e in v['estancias'] if e['tipo'] == 'dormitorio')
    # ------------------------------------------------ planos
    planos = {}
    for vid in ids:
        png = os.path.join(RAIZ, 'assets', 'planos', vid + '.png')
        if os.path.exists(png):
            planos[vid] = Plano(png)
        else:
            viviendas[vid]['avisos'].append('No hay plano assets/planos/%s.png.' % vid)
    # la 336 no tiene plano: sus datos salen de la 236 y se le asigna su plano
    sustituto = {vid: correcciones[vid][0] for vid in correcciones if vid not in planos}
    def plano(vid):
        return planos.get(vid) or planos.get(sustituto.get(vid))

    # ------------------------------------------------ tipologías (estancias ±0,15, enlace completo)
    grupos = []
    for vid in ids:
        f = firma(viviendas[vid]['estancias'])
        for g in grupos:
            if all(mismas_estancias(f, firma(viviendas[o]['estancias'])) for o in g):
                if plano(vid) is None or comparar(plano(g[0]), plano(vid))[1] >= UMBRAL_PLANO:
                    g.append(vid)
                    break
        else:
            grupos.append([vid])

    def ventana(n):
        return 'antepecho' if n == 1 else 'suelo-techo'

    def grupo_nivel(n):
        return {1: 'planta 1', 2: 'plantas 2-3', 3: 'plantas 2-3', 4: 'ático'}[n]

    def puntos_360(est, regimenes):
        """salón/estudio y dormitorios tienen ventana: un 360 por tipo de ventana; baños
        interiores (sin ventana): uno solo."""
        con_ventana = sum(1 for e in est if e['tiene360'] and e['tipo'] != 'bano')
        banos = sum(1 for e in est if e['tiene360'] and e['tipo'] == 'bano')
        return con_ventana * len(regimenes) + banos

    def puntos_terraza(t):
        return 0 if t < 10 else (2 if t >= 40 else 1)

    cont = Counter()
    tipologias = []
    for g in grupos:
        ref = g[0]
        v0 = viviendas[ref]
        clave = 'E' if v0['estudio'] else '%dD' % v0['dormitorios']
        cont[clave] += 1
        codigo = '%s-%02d' % (clave, cont[clave])
        trans = OrderedDict()
        espejadas, sims, margenes = [], [], []
        for vid in g:
            if vid == ref:
                trans[vid] = 'igual'
                continue
            t, p, contraria = comparar(plano(ref), plano(vid))
            trans[vid] = t if vid in planos else t + ' (plano de la %s)' % sustituto[vid]
            sims.append(p)
            margenes.append(p - contraria)
            if TRANSFORMACIONES[t][1]:
                espejadas.append(vid)
        # variantes de plano para los cenitales: terraza ±0,5 · construida interior ±0,15 ·
        # grupo de plantas (la planta 1 tiene la fachada del corredor distinta y el ático,
        # cubierta y terraza propias; las plantas 2 y 3 son idénticas)
        variantes = []
        for vid in g:
            V = viviendas[vid]
            for var in variantes:
                if (var['grupoPlantas'] == grupo_nivel(V['nivel'])
                        and all(abs(viviendas[o]['terraza'] - V['terraza']) <= TOL_TERRAZA
                                and abs(viviendas[o]['supConstruidaInterior'] - V['supConstruidaInterior']) <= TOL + 1e-9
                                for o in var['ids'])):
                    var['ids'].append(vid)
                    break
            else:
                variantes.append(OrderedDict([('grupoPlantas', grupo_nivel(V['nivel'])), ('ids', [vid])]))
        letras = 'abcdefghijklmnopqrstuvwxyz'
        for i, var in enumerate(variantes):
            ts = sorted(viviendas[x]['terraza'] for x in var['ids'])
            cs = sorted(viviendas[x]['supConstruidaInterior'] for x in var['ids'])
            var['codigo'] = codigo + letras[i]
            var['terraza'] = ts[0] if ts[0] == ts[-1] else [ts[0], ts[-1]]
            var['supConstruidaInterior'] = cs[0] if cs[0] == cs[-1] else [cs[0], cs[-1]]
            var['espejadas'] = [x for x in var['ids'] if x in espejadas]
            var['referencia'] = var['ids'][0]
            comps = {x: comparar(plano(var['ids'][0]), plano(x)) for x in var['ids'][1:]}
            var['similitudMinima'] = round(min(c[1] for c in comps.values()), 3) if comps else None
            # cómo colocar la imagen de la referencia de la variante en cada vivienda
            var['transformaciones'] = OrderedDict([(x, 'igual' if x == var['ids'][0] else comps[x][0]) for x in var['ids']])
            for x in var['ids']:
                viviendas[x]['variante'] = var['codigo']
        # estancias de referencia con el rango de la tipología
        est_ref = []
        for e in v0['estancias']:
            if e['tipo'] == 'terraza':
                continue
            sups = [x['sup'] for vid in g for x in viviendas[vid]['estancias'] if x['codigo'] == e['codigo']]
            est_ref.append(OrderedDict([('codigo', e['codigo']), ('tipo', e['tipo']), ('nombre', e['nombre']),
                                        ('sup', e['sup']), ('rango', [min(sups), max(sups)]),
                                        ('tiene360', e['tiene360'])]))
        niveles = sorted({nivel_de(x) for x in g})
        regimenes = sorted({ventana(n) for n in niveles})
        p360t = 0
        terrazas_vistas = []
        for var in variantes:
            t = var['terraza'] if not isinstance(var['terraza'], list) else var['terraza'][0]
            if puntos_terraza(t) and all(abs(t - o) > TOL_TERRAZA for o in terrazas_vistas):
                terrazas_vistas.append(t)
                p360t += puntos_terraza(t)
        for vid in g:
            viviendas[vid]['tipologia'] = codigo
            viviendas[vid]['transformacionPlano'] = trans[vid]
        tipologias.append(OrderedDict([
            ('codigo', codigo),
            ('ids', g),
            ('recuento', len(g)),
            ('niveles', niveles),
            ('dormitorios', v0['dormitorios']),
            ('banos', v0['banos']),
            ('estudio', v0['estudio']),
            ('estancias', est_ref),
            ('supUtil', [min(viviendas[x]['supUtil'] for x in g), max(viviendas[x]['supUtil'] for x in g)]),
            ('supConstruidaInterior', [min(viviendas[x]['supConstruidaInterior'] for x in g),
                                       max(viviendas[x]['supConstruidaInterior'] for x in g)]),
            ('orientaciones', dict(Counter(viviendas[x]['orientacion'] for x in g))),
            ('referencia', ref),
            ('espejadas', espejadas),
            ('transformaciones', trans),
            ('similitudMinima', round(min(sims), 3) if sims else None),
            ('margenEspejo', round(min(margenes), 3) if margenes else None),
            ('ventanas', regimenes),
            ('variantes', variantes),
            ('renders', OrderedDict([
                ('cenitales', len(variantes)),
                ('cenitalesSinVoltear', sum(1 + (1 if 0 < len(v['espejadas']) < len(v['ids']) else 0) for v in variantes)),
                ('p360Interior', puntos_360(est_ref, regimenes)),
                ('p360Terraza', p360t),
            ])),
        ]))

    # ------------------------------------------------ familias (mismo programa, otras medidas)
    # Tipologías con las mismas estancias por tipo y el mismo dibujo, pero con
    # superficies que difieren más de 0,15 m² (p. ej. 101…106, que se estrechan a lo
    # largo de la fachada). Solo informativo: un 360 de la familia podría servir de
    # imagen orientativa para todas si el cliente lo acepta.
    padre = list(range(len(tipologias)))
    def raiz(i):
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i
    programa = [tuple(sorted(Counter(e['tipo'] for e in t['estancias']).items())) for t in tipologias]
    casi = []
    for i in range(len(tipologias)):
        for j in range(i + 1, len(tipologias)):
            if programa[i] != programa[j]:
                continue
            a, b = tipologias[i]['referencia'], tipologias[j]['referencia']
            t, p, _ = comparar(plano(a), plano(b))
            if p >= UMBRAL_FAMILIA:
                padre[raiz(j)] = raiz(i)
                casi.append((a, b, t, round(p, 3)))
    familias = OrderedDict()
    for i, t in enumerate(tipologias):
        familias.setdefault(raiz(i), []).append(i)
    lista_familias = []
    for n, miembros in enumerate(familias.values(), 1):
        ts = [tipologias[i] for i in miembros]
        regs = sorted({r for t in ts for r in t['ventanas']})
        fam = OrderedDict([('codigo', 'F%02d' % n), ('tipologias', [t['codigo'] for t in ts]),
                           ('recuento', sum(t['recuento'] for t in ts)),
                           ('p360Interior', puntos_360(ts[0]['estancias'], regs)),
                           ('p360Terraza', sum(t['renders']['p360Terraza'] for t in ts))])
        for t in ts:
            t['familia'] = fam['codigo']
        lista_familias.append(fam)

    # ------------------------------------------------ salidas
    hoy = datetime.date.today().isoformat()
    resumen = OrderedDict([
        ('viviendas', len(ids)),
        ('tipologias', len(tipologias)),
        ('tipologiasDeUnaVivienda', sum(1 for t in tipologias if t['recuento'] == 1)),
        ('variantesCenital', sum(t['renders']['cenitales'] for t in tipologias)),
        ('cenitalesSinVoltear', sum(t['renders']['cenitalesSinVoltear'] for t in tipologias)),
        ('puntos360Interior', sum(t['renders']['p360Interior'] for t in tipologias)),
        ('puntos360Terraza', sum(t['renders']['p360Terraza'] for t in tipologias)),
        ('variantesCenitalSinSepararPlanta1', sum(len({(v['grupoPlantas'] == 'ático', json.dumps(v['terraza']), json.dumps(v['supConstruidaInterior'])) for v in t['variantes']}) for t in tipologias)),
        ('familias', len(lista_familias)),
        ('puntos360InteriorPorFamilia', sum(f['p360Interior'] for f in lista_familias)),
    ])
    salida_tip = OrderedDict([
        ('generado', hoy),
        ('edificio', 'apolo'),
        ('criterio', 'Tipología: misma lista de estancias por tipo con superficies útiles iguales ±%.2f m² (fichas PDF; '
                     '«Dormitorio individual» = «Dormitorio secundario») y el mismo plano (assets/planos/<id>.png) salvo '
                     'giro o espejo, correlación ≥ %.2f. La terraza no separa tipologías.' % (TOL, UMBRAL_PLANO)),
        ('transformaciones', 'Cómo se pasa del plano de la vivienda de referencia al de cada vivienda: igual, giro90/180/270 '
                             '(misma distribución girada) o espejoH/espejoV/traspuesta/transversa (distribución simétrica). '
                             '«espejadas» = quiralidad contraria a la referencia. margenEspejo = diferencia mínima entre la '
                             'mejor transformación y la mejor de la quiralidad contraria (cuanto mayor, más seguro).'),
        ('variantes', 'Variante de plano = un render cenital: misma tipología, terraza ±%.1f m², construida interior '
                      '±%.2f m² y mismo grupo de plantas (planta 1 / plantas 2-3 / ático). Las espejadas usan la imagen '
                      'volteada; las giradas, la misma imagen girada.' % (TOL_TERRAZA, TOL)),
        ('renders', 'cenitales = variantes; cenitalesSinVoltear = si no se acepta voltear la imagen; p360Interior = '
                    'salón/estudio y dormitorios × tipos de ventana presentes (planta 1 antepecho; resto suelo-techo) + '
                    'baños (interiores, cada uno una vez por tipología); p360Terraza = terrazas ≥ 10 m² distintas (2 puntos si ≥ 40 m²).'),
        ('resumen', resumen),
        ('familias', lista_familias),
        ('parejasDeFamilia', [{'a': a, 'b': b, 'transformacion': t, 'similitud': p} for a, b, t, p in casi]),
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
        escribir_discrepancias(args.discrepancias, disc, viviendas, units, estados, nombres, tipologias, resumen)
    print('viviendas %d · tipologías %d · discrepancias %d' % (len(ids), len(tipologias), len(disc)))
    print(json.dumps(resumen, ensure_ascii=False))


def escribir_discrepancias(ruta, disc, viviendas, units, estados, nombres, tipologias, resumen):
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
          '- **Precios**: salen de `data/units.json` (listado V.01, agosto 2026, según README). Se ha leído (solo lectura) la hoja de Drive '
          '`SERENEA_Pricing v.07`: el lector solo devuelve sus primeras filas; las de 101 a 108 coinciden en precio, dormitorios y superficies '
          '(la 106 da RZC 64,76 y la ficha 64,75). El resto no se ha podido comprobar desde aquí: confirmar que el listado V.01 sigue vigente.',
          '- **Pricing v.07, otros edificios**: tiene hojas de Zeus, Hera, Atenea y Hermes, con referencias `SE-ZE-1A`, `SE-HE-1A`, `SE-AT-1A` '
          'y, para Hermes, otra vez `SE-HE-1A`: Hera y Hermes comparten prefijo y sus referencias chocarían. Las fichas usan `SEAP-101` y el '
          'Pricing `SE-AP-101`: la plantilla usa el formato de las fichas. El Pricing llama a la planta 1 «Planta 01 (baja)».',
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
    L += ['', '## Tipologías (resumen)', '',
          '| Código | Viviendas | Dorm. | Estancias (m² útiles) | Niveles | Espejadas | Variantes cenital | 360 int. | 360 terr. |',
          '|---|---|---|---|---|---|---|---|---|']
    for t in tipologias:
        L.append('| %s | %d (%s) | %s | %s | %s | %d | %d | %d | %d |' % (
            t['codigo'], t['recuento'], ', '.join(t['ids']), 'estudio' if t['estudio'] else t['dormitorios'],
            ', '.join('%s %.2f' % (e['codigo'], e['sup']) for e in t['estancias']),
            ', '.join(map(str, t['niveles'])), len(t['espejadas']), t['renders']['cenitales'],
            t['renders']['p360Interior'], t['renders']['p360Terraza']))
    L += ['', '## Resumen de tipologías', '', '```', json.dumps(resumen, ensure_ascii=False, indent=1), '```', '']
    with open(ruta, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(L))


if __name__ == '__main__':
    main()
