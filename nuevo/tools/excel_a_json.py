#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Valida la plantilla de carga del showroom (SERENEA_Showroom_Carga_v*.xlsx) y la
convierte en nuevo/data/serenea.json (promoción → edificios → plantas →
viviendas → estancias).

Uso:
  python3 nuevo/tools/excel_a_json.py PLANTILLA.xlsx [-o SALIDA.json] [--informe INFORME.txt]
                                       [--con-notas] [--forzar] [--esquema ESQUEMA.json]

  -o           salida (por defecto nuevo/data/serenea.json)
  --informe    guarda también el informe de errores y avisos en un fichero
  --con-notas  incluye las notas internas (NUNCA en el JSON público)
  --forzar     escribe el JSON aunque haya errores (solo para pruebas)
  --esquema    escribe el esquema de columnas y listas en JSON, para que el
               panel web (SheetJS) aplique exactamente las mismas reglas

Código de salida: 0 sin errores, 1 con errores, 2 si el fichero no se puede leer.
Las reglas están documentadas en nuevo/docs/DATOS.md. Este fichero es la
referencia: el importador del panel en el navegador las replica.
"""
import argparse, datetime, hashlib, json, os, re, sys, unicodedata
from collections import OrderedDict, Counter

VERSION_ESQUEMA = 1
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SALIDA = os.path.join(RAIZ, 'nuevo', 'data', 'serenea.json')

# --------------------------------------------------------------------- listas
LISTAS = OrderedDict([
    ('estados', ['Disponible', 'Reservada', 'Vendida', 'No a la venta']),
    ('sino', ['Sí', 'No']),
    ('tiposEstancia', ['Salón-comedor-cocina', 'Salón-comedor', 'Salón', 'Cocina',
                       'Estudio (dormitorio-salón-comedor-cocina)', 'Dormitorio principal', 'Dormitorio',
                       'Baño', 'Aseo', 'Vestidor', 'Distribuidor', 'Lavadero', 'Trastero interior',
                       'Terraza', 'Patio', 'Otro']),
    ('ventanas', ['antepecho', 'suelo-techo']),
    ('orientaciones', ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste',
                       'Jardín interior']),
    ('estadosEdificio', ['En venta', 'Próximamente', 'Agotado', 'Oculto']),
    ('codigosPlanta', ['P-1', 'P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']),
])
TITULOS_LISTAS = {
    'estados': 'Estado de la vivienda', 'sino': 'Sí / No', 'tiposEstancia': 'Tipo de estancia',
    'ventanas': 'Tipo de ventana', 'orientaciones': 'Orientación', 'estadosEdificio': 'Estado comercial del edificio',
    'codigosPlanta': 'Código de planta',
}
# código en el JSON para cada valor de lista
CODIGOS = {
    'estados': {'Disponible': 'disponible', 'Reservada': 'reservada', 'Vendida': 'vendida',
                'No a la venta': 'no-a-la-venta'},
    'tiposEstancia': {'Salón-comedor-cocina': 'salon-comedor-cocina', 'Salón-comedor': 'salon-comedor',
                      'Salón': 'salon', 'Cocina': 'cocina',
                      'Estudio (dormitorio-salón-comedor-cocina)': 'estudio',
                      'Dormitorio principal': 'dormitorio-principal', 'Dormitorio': 'dormitorio',
                      'Baño': 'bano', 'Aseo': 'aseo', 'Vestidor': 'vestidor', 'Distribuidor': 'distribuidor',
                      'Lavadero': 'lavadero', 'Trastero interior': 'trastero', 'Terraza': 'terraza',
                      'Patio': 'patio', 'Otro': 'otro'},
    'estadosEdificio': {'En venta': 'en-venta', 'Próximamente': 'proximamente', 'Agotado': 'agotado',
                        'Oculto': 'oculto'},
}
EXTERIORES = {'terraza', 'patio'}            # no cuentan en la superficie útil
DORMITORIOS = {'dormitorio-principal', 'dormitorio'}
BANOS = {'bano', 'aseo'}

# ------------------------------------------------------------------- columnas
# tipo: id | texto | entero | decimal | m2 | euros | porcentaje | sino | lista:<nombre> | ref:<hoja>
def col(cab, campo, tipo='texto', oblig=False, ancho=14, ayuda='', **extra):
    d = OrderedDict([('cabecera', cab), ('campo', campo), ('tipo', tipo), ('obligatoria', oblig),
                     ('ancho', ancho), ('ayuda', ayuda)])
    d.update(extra)
    return d


HOJAS = OrderedDict([
    ('Edificios', [
        col('ID', 'id', 'id', True, 10, 'Identificador corto, sin espacios (apolo, hera…). No se cambia nunca una vez publicado: lo usan las URL y los renders.'),
        col('Nombre visible', 'nombre', 'texto', True, 18, 'Como se verá en la web: «Apolo».'),
        col('Nº en el plano del conjunto', 'numero', 'entero', True, 12, 'El número de la chincheta en la vista del conjunto (1 a 5).', min=1, max=99),
        col('Nº de plantas', 'numPlantas', 'entero', False, 10, 'Solo de control: tiene que coincidir con las filas del edificio en la hoja Plantas.', min=1, max=60),
        col('Orden', 'orden', 'entero', True, 8, 'Orden en menús y listados (1 = primero).', min=1, max=99),
        col('Estado comercial', 'estado', 'lista:estadosEdificio', True, 15, 'En venta, Próximamente, Agotado u Oculto (no se muestra en la web).'),
        col('Texto breve', 'texto', 'texto', False, 50, 'Una o dos frases para la tarjeta del edificio. Máximo 200 caracteres.', maxlen=200),
        col('Notas internas', 'notas', 'texto', False, 40, 'No se publica.'),
    ]),
    ('Plantas', [
        col('Edificio', 'edificio', 'ref:Edificios', True, 10, 'ID del edificio (hoja Edificios).'),
        col('Código', 'codigo', 'lista:codigosPlanta', True, 9, 'P1, P2… (P0 = baja si la hubiera, P-1 = sótano). Único dentro del edificio.'),
        col('Nombre visible', 'nombre', 'texto', True, 14, 'Como se verá en el selector de plantas: «Planta 1», «Ático».'),
        col('Orden', 'orden', 'entero', True, 8, 'De abajo arriba: 1 = la más baja.', min=1, max=99),
        col('Tipo de ventana', 'ventana', 'lista:ventanas', True, 13, 'antepecho (con pretil blanco, planta 1) o suelo-techo (resto). Lo usan los renders.'),
        col('Notas internas', 'notas', 'texto', False, 40, 'No se publica.'),
    ]),
    ('Viviendas', [
        col('Edificio', 'edificio', 'ref:Edificios', True, 10, 'ID del edificio (hoja Edificios).'),
        col('ID', 'id', 'id', True, 8, 'Identificador único en TODA la promoción. Apolo: 101–436 (los mismos del ejecutable de Unreal y de /gestion/api/estado.php). Otros edificios: con prefijo, p. ej. HE-1A.'),
        col('Referencia', 'referencia', 'texto', True, 12, 'Referencia comercial que ve el cliente: SEAP-101. Única en toda la promoción.'),
        col('Planta', 'planta', 'lista:codigosPlanta', True, 8, 'Código de la planta (hoja Plantas) de ese edificio.'),
        col('Tipología', 'tipologia', 'texto', False, 10, 'Código de tipología (1D-01…). Las viviendas de una misma tipología comparten render cenital y 360. Ver nuevo/data/tipologias.json.'),
        col('Dormitorios', 'dormitorios', 'entero', True, 11, '0 = estudio. Tiene que cuadrar con los dormitorios de la hoja Estancias.', min=0, max=9),
        col('Baños', 'banos', 'entero', True, 8, 'Baños y aseos. Tiene que cuadrar con la hoja Estancias.', min=0, max=9),
        col('Orientación', 'orientacion', 'lista:orientaciones', False, 14, 'Fachada principal o «Jardín interior».'),
        col('Sup. útil (m²)', 'supUtil', 'm2', True, 12, 'Suma de las superficies útiles de las estancias interiores (sin terraza). Dos decimales.'),
        col('Sup. construida interior (m²)', 'supConstruidaInterior', 'm2', True, 14, '«Superficie construida interior» de la ficha.'),
        col('Sup. construida con ZZCC (m²)', 'supConstruidaZZCC', 'm2', False, 14, '«Superficie construida RZZCC» de la ficha (con repercusión de zonas comunes).'),
        col('Terraza (m²)', 'terraza', 'm2', False, 11, '«Superficie construida exterior» de la ficha. Vacío o 0 si no tiene.'),
        col('Precio sin impuestos (€)', 'precio', 'euros', False, 14, 'Sin IGIC y sin decimales. Obligatorio si está Disponible o Reservada.'),
        col('IGIC (%)', 'igic', 'porcentaje', False, 9, 'Vacío = el de la hoja Promoción. Escribe 7 para un 7 %.'),
        col('Estado', 'estado', 'lista:estados', True, 13, 'Disponible, Reservada, Vendida o No a la venta.'),
        col('Visible en web', 'visible', 'sino', True, 10, 'No = aparece en el plano con velo gris y sin datos ni precio.'),
        col('Plan de pagos', 'planPagos', 'ref:PlanesPago', False, 12, 'Código de la hoja PlanesPago. Vacío = sin botón «Ver pagos».'),
        col('Notas internas', 'notas', 'texto', False, 50, 'No se publica.'),
    ]),
    ('Estancias', [
        col('Vivienda', 'vivienda', 'ref:Viviendas', True, 9, 'ID de la vivienda (hoja Viviendas).'),
        col('Orden', 'orden', 'entero', True, 7, 'Orden de la lista en la ficha (1, 2, 3…).', min=1, max=99),
        col('Código', 'codigo', 'id', True, 8, 'Único dentro de la vivienda: SCC, D1, D2, B1, VE, DI, TE… Nombra los 360: <tipología>_<código>.', maxlen=12),
        col('Nombre visible', 'nombre', 'texto', True, 28, 'Como se verá en la ficha: «Dormitorio principal».'),
        col('Tipo', 'tipo', 'lista:tiposEstancia', True, 22, 'De la lista. Terraza y Patio no cuentan en la superficie útil.'),
        col('Sup. útil (m²)', 'superficie', 'm2', False, 12, 'Obligatoria salvo en Terraza y Patio (las fichas solo dan su superficie construida, que va en Viviendas › Terraza).'),
        col('Tiene 360', 'tiene360', 'sino', True, 9, 'Sí = lleva bolita y panorámica 360 en el plano de la vivienda.'),
        col('Puntos 360', 'puntos360', 'entero', False, 9, 'Cuántas bolitas (1 por defecto; 2 en terrazas grandes).', min=0, max=4),
        col('Notas internas', 'notas', 'texto', False, 40, 'No se publica.'),
    ]),
    ('PlanesPago', [
        col('Código', 'codigo', 'id', True, 12, 'Identificador del plan (sin espacios): ESTANDAR, OBRA-24… Es lo que se elige en Viviendas › Plan de pagos.', maxlen=20),
        col('Nombre visible', 'nombre', 'texto', True, 28, 'Título en la ventana «Ver pagos».'),
        col('Reserva (%)', 'reservaPct', 'porcentaje', False, 10, 'Porcentaje del precio a la reserva. Si la reserva es un importe fijo, deja 0 % y usa la columna siguiente.'),
        col('Reserva (importe fijo, €)', 'reservaImporte', 'euros', False, 13, 'Importe fijo de reserva. Se descuenta del pago a la firma del contrato.'),
        col('Firma del contrato (%)', 'contratoPct', 'porcentaje', True, 12, 'Porcentaje a la firma del contrato privado de compraventa.'),
        col('Aplazado durante la obra (%)', 'aplazadoPct', 'porcentaje', True, 13, 'Porcentaje que se paga en cuotas durante la obra.'),
        col('Nº de cuotas del aplazado', 'cuotas', 'entero', False, 11, 'Número de cuotas (mensuales) del aplazado.', min=0, max=120),
        col('Entrega de llaves (%)', 'entregaPct', 'porcentaje', True, 12, 'Resto a la escritura y entrega. Los cuatro porcentajes suman 100 %.'),
        col('Es ejemplo', 'ejemplo', 'sino', True, 9, 'Sí = fila de ejemplo: no se carga. Bórrala o pon No cuando sea un plan real.'),
        col('Notas internas', 'notas', 'texto', False, 40, 'No se publica.'),
    ]),
])

PROMOCION = [
    # (etiqueta en la columna A, campo, tipo, obligatoria, ayuda)
    ('ID de la promoción', 'id', 'id', True, 'Identificador corto y fijo: serenea.'),
    ('Nombre visible', 'nombre', 'texto', True, 'Como se verá en la web.'),
    ('Promotora', 'promotora', 'texto', True, 'Razón social que figura en las fichas.'),
    ('Dirección', 'direccion', 'texto', False, 'Calle y número.'),
    ('Localidad', 'localidad', 'texto', False, 'Barrio y municipio.'),
    ('IGIC por defecto (%)', 'igic', 'porcentaje', False, 'Se aplica a todas las viviendas que no tengan su propio IGIC. Escribe 7 para un 7 %.'),
    ('Texto junto al precio', 'textoPrecio', 'texto', False, 'Lo que acompaña al precio en la ficha: «+ IGIC».'),
    ('Teléfono de contacto', 'telefono', 'texto', False, 'Para el botón de contacto de la ficha.'),
    ('Correo de contacto', 'correo', 'texto', False, 'Para el botón de contacto de la ficha.'),
    ('Aviso legal', 'avisoLegal', 'texto', False, 'Pie de la ficha: «Superficies e imágenes orientativas…».'),
    ('Versión de los precios', 'versionPrecios', 'texto', False, 'De dónde salen los precios (p. ej. «Pricing v.07»). No se publica.'),
]

# columna que identifica la fila en los mensajes (y que, vacía, convierte una fila «GUÍA» en ignorable)
CLAVES = {'Edificios': 'id', 'Plantas': 'codigo', 'Viviendas': 'id', 'Estancias': 'vivienda', 'PlanesPago': 'codigo'}

TOL_SUMA = 0.05          # m² entre la suma de estancias y la útil de la vivienda
RAZON_UTIL = (0.70, 0.97)  # útil / construida interior razonable


# ------------------------------------------------------------------ utilidades
def sin_tildes(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def norm(s):
    return re.sub(r'\s+', ' ', sin_tildes(str(s)).strip().lower())


def cabecera(c):
    return c['cabecera'] + (' *' if c['obligatoria'] else '')


def vacio(v):
    return v is None or (isinstance(v, str) and v.strip() == '')


class Informe:
    def __init__(self):
        self.errores = []
        self.avisos = []

    def error(self, hoja, fila, texto, clave=None):
        self.errores.append((hoja, fila, clave, texto))

    def aviso(self, hoja, fila, texto, clave=None):
        self.avisos.append((hoja, fila, clave, texto))

    @staticmethod
    def _linea(h, f, c, t):
        donde = h + (' · fila %d' % f if f else '') + (' · %s' % c if c else '')
        return '  %s: %s' % (donde, t)

    def texto(self):
        L = []
        for titulo, lista in (('ERRORES (impiden la carga)', self.errores), ('AVISOS (no impiden la carga)', self.avisos)):
            L.append('%s: %d' % (titulo, len(lista)))
            orden = list(HOJAS) + ['Promoción', 'Libro']
            for e in sorted(lista, key=lambda e: (orden.index(e[0]) if e[0] in orden else 99, e[1] or 0)):
                L.append(self._linea(*e))
            L.append('')
        return '\n'.join(L)


def num(v):
    """Número desde una celda: acepta números y textos «1.234,56 m²», «60,87», «7 %»."""
    if isinstance(v, bool):
        raise ValueError
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(' ', ' ')
    s = re.sub(r'(m²|m2|€|eur|%)', '', s, flags=re.I).strip().replace(' ', '')
    if re.fullmatch(r'-?\d{1,3}(\.\d{3})+(,\d+)?', s):      # 1.234,56
        s = s.replace('.', '').replace(',', '.')
    elif re.fullmatch(r'-?\d+,\d+', s):                      # 60,87
        s = s.replace(',', '.')
    elif re.fullmatch(r'-?\d{1,3}(,\d{3})+(\.\d+)?', s):     # 1,234.56
        s = s.replace(',', '')
    return float(s)


def convertir(v, c, inf, hoja, fila, clave):
    """Convierte y valida una celda según su columna. Devuelve el valor o None."""
    t = c['tipo']
    nombre = c['cabecera']
    if vacio(v):
        return None
    try:
        if t == 'id':
            if isinstance(v, float) and v.is_integer():
                v = int(v)
            s = str(v).strip()
            if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.\-]*', s):
                inf.error(hoja, fila, '%s: «%s» no vale como identificador (solo letras sin tilde, números, guion, punto y guion bajo; sin espacios).' % (nombre, s), clave)
                return None
            if c.get('maxlen') and len(s) > c['maxlen']:
                inf.error(hoja, fila, '%s: «%s» tiene más de %d caracteres.' % (nombre, s, c['maxlen']), clave)
            return s
        if t == 'texto' or t.startswith('ref:'):
            if isinstance(v, float) and v.is_integer():
                v = int(v)
            s = re.sub(r'\s+', ' ', str(v)).strip()
            if c.get('maxlen') and len(s) > c['maxlen']:
                inf.aviso(hoja, fila, '%s: tiene %d caracteres; el máximo recomendado es %d.' % (nombre, len(s), c['maxlen']), clave)
            return s
        if t == 'entero':
            x = num(v)
            if not float(x).is_integer():
                raise ValueError
            x = int(x)
            if ('min' in c and x < c['min']) or ('max' in c and x > c['max']):
                inf.error(hoja, fila, '%s: %d está fuera del rango %s–%s.' % (nombre, x, c.get('min', '…'), c.get('max', '…')), clave)
                return None
            return x
        if t in ('decimal', 'm2', 'euros'):
            x = num(v)
            if x < 0:
                inf.error(hoja, fila, '%s: no puede ser negativo (%s).' % (nombre, v), clave)
                return None
            if t == 'm2':
                if x > 2000:
                    inf.error(hoja, fila, '%s: %s m² no es una superficie razonable.' % (nombre, v), clave)
                    return None
                return round(x, 2)
            if t == 'euros':
                if abs(x - round(x)) > 0.004:
                    inf.aviso(hoja, fila, '%s: %s tiene decimales; se redondea a euros.' % (nombre, v), clave)
                return int(round(x))
            return x
        if t == 'porcentaje':
            texto_pct = isinstance(v, str) and '%' in v
            x = num(v)
            # en Excel, con formato de porcentaje, 7 % se guarda como 0,07
            if not texto_pct and x <= 1:
                x = x * 100
            x = round(x, 4)
            if x < 0 or x > 100:
                inf.error(hoja, fila, '%s: %s no es un porcentaje entre 0 y 100.' % (nombre, v), clave)
                return None
            return x
        if t == 'sino':
            s = norm(v)
            if s in ('si', 's', 'yes', 'true', '1', 'x'):
                return True
            if s in ('no', 'n', 'false', '0'):
                return False
            raise ValueError
        if t.startswith('lista:'):
            lista = LISTAS[t[6:]]
            s = norm(v)
            for op in lista:
                if norm(op) == s:
                    return op
            inf.error(hoja, fila, '%s: «%s» no está en la lista (%s).' % (nombre, v, ', '.join(lista)), clave)
            return None
    except (ValueError, TypeError):
        tipos = {'entero': 'un número entero', 'decimal': 'un número', 'm2': 'una superficie en m²',
                 'euros': 'un importe en euros', 'porcentaje': 'un porcentaje', 'sino': 'Sí o No'}
        inf.error(hoja, fila, '%s: «%s» no es %s.' % (nombre, v, tipos.get(t, 'válido')), clave)
        return None
    raise RuntimeError('tipo de columna desconocido: ' + t)


def leer_hoja(wb, hoja, inf):
    """Lista de (fila, {campo: valor}) con las filas con datos de la hoja."""
    columnas = HOJAS[hoja]
    if hoja not in wb.sheetnames:
        inf.error(hoja, None, 'Falta la hoja «%s».' % hoja)
        return []
    ws = wb[hoja]
    cab = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    pos = {}
    for i, v in enumerate(cab):
        if vacio(v):
            continue
        n = norm(str(v).replace('*', ''))
        for c in columnas:
            if norm(c['cabecera']) == n:
                pos[c['campo']] = i
                break
        else:
            inf.aviso(hoja, 1, 'Columna «%s» desconocida: se ignora.' % v)
    for c in columnas:
        if c['campo'] not in pos:
            (inf.error if c['obligatoria'] else inf.aviso)(hoja, 1, 'Falta la columna «%s».' % c['cabecera'])
    clave_campo = CLAVES[hoja]
    filas = []
    for r, fila in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        crudo = {c['campo']: (fila[pos[c['campo']]] if c['campo'] in pos and pos[c['campo']] < len(fila) else None)
                 for c in columnas}
        if all(vacio(v) for v in crudo.values()):
            continue
        notas = norm(crudo.get('notas') or '')
        if notas.startswith('guia') and vacio(crudo.get(clave_campo)):
            continue                     # fila guía: se ignora sin avisar
        clave = None if vacio(crudo.get(clave_campo)) else str(crudo[clave_campo]).strip()
        if clave and clave.endswith('.0'):
            clave = clave[:-2]
        d = {}
        for c in columnas:
            x = convertir(crudo[c['campo']], c, inf, hoja, r, clave)
            if x is None and c['obligatoria'] and vacio(crudo[c['campo']]):
                inf.error(hoja, r, 'Falta «%s» (obligatoria).' % c['cabecera'], clave)
            d[c['campo']] = x
        filas.append((r, d))
    return filas


def leer_promocion(wb, inf):
    out = OrderedDict()
    if 'Promoción' not in wb.sheetnames:
        inf.error('Promoción', None, 'Falta la hoja «Promoción».')
        return out
    ws = wb['Promoción']
    etiquetas = {}
    for r, fila in enumerate(ws.iter_rows(min_row=1, values_only=True), start=1):
        if fila and not vacio(fila[0]):
            etiquetas[norm(str(fila[0]).replace('*', ''))] = (r, fila[1] if len(fila) > 1 else None)
    for etiqueta, campo, tipo, oblig, ayuda in PROMOCION:
        r, v = etiquetas.get(norm(etiqueta), (None, None))
        if r is None:
            (inf.error if oblig else inf.aviso)('Promoción', None, 'Falta la fila «%s».' % etiqueta)
            continue
        c = col(etiqueta, campo, tipo, oblig)
        x = convertir(v, c, inf, 'Promoción', r, None)
        if x is None and oblig:
            inf.error('Promoción', r, 'Falta «%s» (obligatorio).' % etiqueta)
        out[campo] = x
    return out


# ---------------------------------------------------------------- validación
def validar_y_construir(wb, inf, con_notas=False):
    prom = leer_promocion(wb, inf)
    hojas = {h: leer_hoja(wb, h, inf) for h in HOJAS}

    def unicos(hoja, claves, nombre):
        vistos = {}
        for r, d in hojas[hoja]:
            k = tuple(d.get(x) for x in claves)
            if any(x is None for x in k):
                continue
            if k in vistos:
                inf.error(hoja, r, '%s «%s» repetido (ya está en la fila %d).' % (nombre, ' / '.join(map(str, k)), vistos[k]), k[-1])
            else:
                vistos[k] = r
        return {(k[0] if len(k) == 1 else k): r for k, r in vistos.items()}

    ed_ids = unicos('Edificios', ['id'], 'ID de edificio')
    unicos('Edificios', ['numero'], 'Nº en el plano')
    pl_ids = unicos('Plantas', ['edificio', 'codigo'], 'Planta')
    viv_ids = unicos('Viviendas', ['id'], 'ID de vivienda')
    unicos('Viviendas', ['referencia'], 'Referencia')
    unicos('Estancias', ['vivienda', 'codigo'], 'Código de estancia')
    plan_ids = unicos('PlanesPago', ['codigo'], 'Código de plan')

    # planes de pago
    planes = OrderedDict()
    ejemplos = set()
    for r, d in hojas['PlanesPago']:
        if d.get('codigo') is None:
            continue
        if d.get('ejemplo'):
            ejemplos.add(d['codigo'])
            continue
        pcts = [d.get('reservaPct') or 0, d.get('contratoPct') or 0, d.get('aplazadoPct') or 0, d.get('entregaPct') or 0]
        if abs(sum(pcts) - 100) > 0.01:
            inf.error('PlanesPago', r, 'Los porcentajes suman %s %% y tienen que sumar 100 %%.' % round(sum(pcts), 2), d['codigo'])
        if (d.get('aplazadoPct') or 0) > 0 and not d.get('cuotas'):
            inf.aviso('PlanesPago', r, 'Hay aplazado pero no el nº de cuotas.', d['codigo'])
        if d.get('reservaImporte') and (d.get('reservaPct') or 0) > 0:
            inf.aviso('PlanesPago', r, 'Tiene reserva en % y en importe fijo: se usará el importe.', d['codigo'])
        p = OrderedDict([('codigo', d['codigo']), ('nombre', d['nombre']),
                         ('reserva', OrderedDict([('porcentaje', d.get('reservaPct') or 0), ('importe', d.get('reservaImporte'))])),
                         ('contrato', d.get('contratoPct') or 0),
                         ('aplazado', OrderedDict([('porcentaje', d.get('aplazadoPct') or 0), ('cuotas', d.get('cuotas'))])),
                         ('entrega', d.get('entregaPct') or 0)])
        if con_notas and d.get('notas'):
            p['notas'] = d['notas']
        planes[d['codigo']] = p

    # edificios
    edificios = OrderedDict()
    for r, d in hojas['Edificios']:
        if d.get('id') is None:
            continue
        e = OrderedDict([('id', d['id']), ('nombre', d['nombre']), ('numero', d['numero']), ('orden', d['orden']),
                         ('estado', CODIGOS['estadosEdificio'].get(d['estado'])), ('texto', d.get('texto')),
                         ('numPlantas', d.get('numPlantas')), ('plantas', [])])
        if con_notas and d.get('notas'):
            e['notas'] = d['notas']
        e['_fila'] = r
        edificios[d['id']] = e

    # plantas
    plantas = OrderedDict()
    for r, d in hojas['Plantas']:
        if d.get('edificio') is None or d.get('codigo') is None:
            continue
        if d['edificio'] not in edificios:
            inf.error('Plantas', r, 'El edificio «%s» no existe en la hoja Edificios.' % d['edificio'], d['codigo'])
            continue
        p = OrderedDict([('codigo', d['codigo']), ('nombre', d['nombre']), ('orden', d['orden']),
                         ('ventana', d['ventana']), ('viviendas', [])])
        if con_notas and d.get('notas'):
            p['notas'] = d['notas']
        plantas[(d['edificio'], d['codigo'])] = p
        edificios[d['edificio']]['plantas'].append(p)
    for e in edificios.values():
        ords = Counter(p['orden'] for p in e['plantas'])
        for o, n in ords.items():
            if n > 1:
                inf.error('Plantas', None, 'El edificio «%s» tiene %d plantas con el orden %s.' % (e['id'], n, o))
        if e['numPlantas'] and e['plantas'] and e['numPlantas'] != len(e['plantas']):
            inf.aviso('Edificios', e['_fila'], 'Dice %d plantas y en la hoja Plantas hay %d.' % (e['numPlantas'], len(e['plantas'])), e['id'])

    # estancias agrupadas por vivienda
    est_por_viv = OrderedDict()
    for r, d in hojas['Estancias']:
        if d.get('vivienda') is None:
            continue
        if d['vivienda'] not in viv_ids:
            inf.error('Estancias', r, 'La vivienda «%s» no existe en la hoja Viviendas.' % d['vivienda'], d['vivienda'])
            continue
        tipo = CODIGOS['tiposEstancia'].get(d.get('tipo'))
        if tipo and tipo not in EXTERIORES and d.get('superficie') is None:
            inf.error('Estancias', r, 'Falta la superficie útil de «%s».' % (d.get('nombre') or d.get('codigo')), d['vivienda'])
        if d.get('tiene360') and d.get('puntos360') == 0:
            inf.aviso('Estancias', r, 'Tiene 360 = Sí pero Puntos 360 = 0: no se verá ninguna bolita.', d['vivienda'])
        e = OrderedDict([('codigo', d.get('codigo')), ('orden', d.get('orden')), ('nombre', d.get('nombre')),
                         ('tipo', tipo), ('superficie', d.get('superficie')),
                         ('tiene360', bool(d.get('tiene360'))),
                         ('puntos360', (d.get('puntos360') if d.get('puntos360') is not None else 1) if d.get('tiene360') else 0)])
        if con_notas and d.get('notas'):
            e['notas'] = d['notas']
        e['_fila'] = r
        est_por_viv.setdefault(d['vivienda'], []).append(e)

    # viviendas
    igic_prom = prom.get('igic')
    sin_igic = 0
    procesadas = set()
    for r, d in hojas['Viviendas']:
        vid = d.get('id')
        if vid is None:
            if any(not vacio(d.get(k)) for k in ('referencia', 'precio', 'estado')):
                inf.aviso('Viviendas', r, 'Fila sin ID: se ignora.')
            continue
        if vid in procesadas:
            continue                      # ID repetido: ya se ha dado el error
        procesadas.add(vid)
        ed = d.get('edificio')
        if ed is None:
            continue
        if ed not in edificios:
            inf.error('Viviendas', r, 'El edificio «%s» no existe en la hoja Edificios.' % ed, vid)
            continue
        planta = plantas.get((ed, d.get('planta')))
        if d.get('planta') is not None and planta is None:
            inf.error('Viviendas', r, 'La planta «%s» no existe para el edificio «%s» en la hoja Plantas.' % (d['planta'], ed), vid)
            continue
        if planta is None:
            continue
        estado = CODIGOS['estados'].get(d.get('estado'))
        if estado in ('disponible', 'reservada') and d.get('precio') is None:
            (inf.error if estado == 'disponible' else inf.aviso)('Viviendas', r, 'Está %s y no tiene precio.' % d['estado'].lower(), vid)
        if d.get('precio') is not None and d['precio'] < 10000:
            inf.aviso('Viviendas', r, 'Precio %s €: ¿falta algún cero?' % d['precio'], vid)
        if d.get('visible') is False and estado == 'disponible':
            inf.aviso('Viviendas', r, 'Disponible pero no visible en la web: se verá con velo gris.', vid)
        if d.get('planPagos') is not None:
            if d['planPagos'] in ejemplos:
                inf.error('Viviendas', r, 'El plan de pagos «%s» es una fila de ejemplo.' % d['planPagos'], vid)
                d['planPagos'] = None
            elif d['planPagos'] not in planes:
                inf.error('Viviendas', r, 'El plan de pagos «%s» no existe en la hoja PlanesPago.' % d['planPagos'], vid)
                d['planPagos'] = None
        if d.get('tipologia') is None:
            inf.aviso('Viviendas', r, 'Sin tipología: no se le podrán asignar render cenital ni 360.', vid)
        if d.get('igic') is None and igic_prom is None:
            sin_igic += 1
        # superficies
        util, ci, cz = d.get('supUtil'), d.get('supConstruidaInterior'), d.get('supConstruidaZZCC')
        if util is not None and ci is not None:
            if util > ci:
                inf.error('Viviendas', r, 'La útil (%.2f) es mayor que la construida interior (%.2f).' % (util, ci), vid)
            elif ci and not (RAZON_UTIL[0] <= util / ci <= RAZON_UTIL[1]):
                inf.aviso('Viviendas', r, 'Útil / construida = %.2f, fuera de lo habitual (%.2f–%.2f).' % (util / ci, RAZON_UTIL[0], RAZON_UTIL[1]), vid)
        if ci is not None and cz is not None and ci > cz:
            inf.error('Viviendas', r, 'La construida interior (%.2f) es mayor que la construida con ZZCC (%.2f).' % (ci, cz), vid)
        ests = sorted(est_por_viv.get(vid, []), key=lambda e: (e['orden'] or 0))
        if not ests:
            inf.aviso('Viviendas', r, 'No tiene estancias en la hoja Estancias.', vid)
        else:
            interiores = [e for e in ests if e['tipo'] not in EXTERIORES and e['superficie'] is not None]
            suma = round(sum(e['superficie'] for e in interiores), 2)
            if util is not None and abs(suma - util) > TOL_SUMA:
                inf.error('Viviendas', r, 'La suma de sus estancias es %.2f m² y la útil dice %.2f m² (diferencia %.2f).' % (suma, util, suma - util), vid)
            nd = sum(1 for e in ests if e['tipo'] in DORMITORIOS)
            nb = sum(1 for e in ests if e['tipo'] in BANOS)
            if d.get('dormitorios') is not None and nd != d['dormitorios']:
                inf.error('Viviendas', r, 'Dice %d dormitorios y en Estancias hay %d.' % (d['dormitorios'], nd), vid)
            if d.get('banos') is not None and nb != d['banos']:
                inf.error('Viviendas', r, 'Dice %d baños y en Estancias hay %d.' % (d['banos'], nb), vid)
            ords = Counter(e['orden'] for e in ests)
            for o, n in ords.items():
                if n > 1:
                    inf.aviso('Estancias', None, 'La vivienda %s tiene %d estancias con el orden %s.' % (vid, n, o), vid)
            exteriores = [e for e in ests if e['tipo'] in EXTERIORES]
            if exteriores and not d.get('terraza'):
                inf.aviso('Viviendas', r, 'Tiene terraza o patio en Estancias pero Terraza (m²) está vacía.', vid)
        for e in ests:
            e.pop('_fila', None)
        visible = bool(d.get('visible'))
        v = OrderedDict([
            ('id', vid), ('referencia', d.get('referencia')), ('tipologia', d.get('tipologia')),
            ('dormitorios', d.get('dormitorios')), ('banos', d.get('banos')), ('orientacion', d.get('orientacion')),
            ('superficies', OrderedDict([('util', util), ('construidaInterior', ci), ('construidaZZCC', cz),
                                         ('terraza', d.get('terraza') or 0)])),
            ('precio', d.get('precio') if visible else None),
            ('igic', d.get('igic') if d.get('igic') is not None else igic_prom),
            ('estado', estado), ('visible', visible),
            ('planPagos', d.get('planPagos') if visible else None),
            ('estancias', ests),
        ])
        if con_notas and d.get('notas'):
            v['notas'] = d['notas']
        planta['viviendas'].append(v)
    if sin_igic:
        inf.aviso('Promoción', None, 'No hay IGIC por defecto y %d viviendas no tienen IGIC propio: la web solo podrá mostrar «+ IGIC», sin el total.' % sin_igic)

    # edificios sin contenido
    for e in edificios.values():
        n = sum(len(p['viviendas']) for p in e['plantas'])
        if not e['plantas']:
            inf.aviso('Edificios', e['_fila'], 'Todavía no tiene plantas ni viviendas.', e['id'])
        elif not n:
            inf.aviso('Edificios', e['_fila'], 'Tiene plantas pero ninguna vivienda.', e['id'])
        e.pop('_fila', None)
        e['plantas'].sort(key=lambda p: p['orden'] or 0)

    lista_ed = sorted(edificios.values(), key=lambda e: e['orden'] or 0)
    todas = [v for e in lista_ed for p in e['plantas'] for v in p['viviendas']]
    resumen = OrderedDict([
        ('edificios', len(lista_ed)),
        ('edificiosConViviendas', sum(1 for e in lista_ed if any(p['viviendas'] for p in e['plantas']))),
        ('plantas', sum(len(e['plantas']) for e in lista_ed)),
        ('viviendas', len(todas)),
        ('estancias', sum(len(v['estancias']) for v in todas)),
        ('estados', dict(Counter(v['estado'] for v in todas))),
        ('planesPago', len(planes)),
    ])
    if not con_notas:
        prom.pop('versionPrecios', None)
    prom['moneda'] = 'EUR'
    doc = OrderedDict([
        ('esquema', VERSION_ESQUEMA),
        ('generado', datetime.datetime.now().astimezone().isoformat(timespec='seconds')),
        ('promocion', prom),
        ('planesPago', list(planes.values())),
        ('edificios', lista_ed),
        ('resumen', resumen),
    ])
    return doc


def esquema_json():
    return OrderedDict([
        ('version', VERSION_ESQUEMA),
        ('hojas', OrderedDict((h, [OrderedDict([('cabeceraExcel', cabecera(c))] + list(c.items())) for c in cols])
                              for h, cols in HOJAS.items())),
        ('promocion', [OrderedDict([('etiqueta', e), ('campo', c), ('tipo', t), ('obligatoria', o), ('ayuda', a)])
                       for e, c, t, o, a in PROMOCION]),
        ('listas', LISTAS),
        ('codigos', CODIGOS),
        ('exteriores', sorted(EXTERIORES)),
        ('toleranciaSumaEstancias', TOL_SUMA),
        ('razonUtilConstruida', list(RAZON_UTIL)),
    ])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('plantilla', nargs='?')
    ap.add_argument('-o', '--salida', default=SALIDA)
    ap.add_argument('--informe')
    ap.add_argument('--con-notas', action='store_true')
    ap.add_argument('--forzar', action='store_true')
    ap.add_argument('--esquema')
    a = ap.parse_args()
    if a.esquema:
        with open(a.esquema, 'w', encoding='utf-8') as fh:
            json.dump(esquema_json(), fh, ensure_ascii=False, indent=1)
        print('esquema →', os.path.relpath(a.esquema))
        if not a.plantilla:
            return 0
    if not a.plantilla:
        ap.error('falta la plantilla .xlsx')
    try:
        import openpyxl
        wb = openpyxl.load_workbook(a.plantilla, data_only=True, read_only=False)
    except Exception as ex:   # noqa: BLE001
        print('No se puede abrir %s: %s' % (a.plantilla, ex), file=sys.stderr)
        return 2
    inf = Informe()
    doc = validar_y_construir(wb, inf, con_notas=a.con_notas)
    with open(a.plantilla, 'rb') as fh:
        doc['origen'] = OrderedDict([('fichero', os.path.basename(a.plantilla)),
                                     ('sha256', hashlib.sha256(fh.read()).hexdigest()[:16])])
    texto = 'Validación de %s\n\n%s' % (os.path.basename(a.plantilla), inf.texto())
    r = doc['resumen']
    texto += 'Resumen: %d edificios (%d con viviendas), %d plantas, %d viviendas, %d estancias, %d planes de pago. Estados: %s\n' % (
        r['edificios'], r['edificiosConViviendas'], r['plantas'], r['viviendas'], r['estancias'], r['planesPago'],
        ', '.join('%s %d' % (k or 'sin estado', n) for k, n in sorted(r['estados'].items(), key=lambda kv: str(kv[0]))))
    escribir = not inf.errores or a.forzar
    if escribir:
        os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
        with open(a.salida, 'w', encoding='utf-8') as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=1)
        texto += 'JSON → %s\n' % a.salida
    else:
        texto += 'No se escribe el JSON: corrige los errores y vuelve a cargar.\n'
    print(texto)
    if a.informe:
        with open(a.informe, 'w', encoding='utf-8') as fh:
            fh.write(texto)
    return 1 if inf.errores else 0


if __name__ == '__main__':
    sys.exit(main())
