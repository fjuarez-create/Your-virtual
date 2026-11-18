#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera la plantilla Excel de carga del showroom con Apolo precargado:

  nuevo/plantilla/SERENEA_Showroom_Carga_v1.xlsx

Columnas, listas y reglas salen de excel_a_json.py (una sola definición para la
plantilla, el conversor en Python y el importador del panel en el navegador).
Datos de Apolo: nuevo/data/fuentes/apolo_semilla.json (de apolo_semilla.py).

Uso:  python3 nuevo/tools/crear_plantilla.py [-o SALIDA.xlsx]
"""
import argparse, datetime, json, os, sys
from collections import OrderedDict, Counter

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import excel_a_json as X  # noqa: E402

from openpyxl import Workbook, load_workbook  # noqa: E402
from openpyxl.comments import Comment  # noqa: E402
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side  # noqa: E402
from openpyxl.utils import get_column_letter  # noqa: E402
from openpyxl.worksheet.datavalidation import DataValidation  # noqa: E402

RAIZ = X.RAIZ
SALIDA = os.path.join(RAIZ, 'nuevo', 'plantilla', 'SERENEA_Showroom_Carga_v1.xlsx')
SEMILLA = os.path.join(RAIZ, 'nuevo', 'data', 'fuentes', 'apolo_semilla.json')

# ------------------------------------------------------------------- estilo
FUENTE = 'Arial'
TINTA = '1F2A30'          # casi negro azulado
GRIS = '6B767D'
F_NORMAL = Font(name=FUENTE, size=10, color=TINTA)
F_CAB_OB = Font(name=FUENTE, size=10, bold=True, color='FFFFFF')
F_CAB_OP = Font(name=FUENTE, size=10, bold=True, color=TINTA)
F_GUIA = Font(name=FUENTE, size=10, italic=True, color=GRIS)
F_TITULO = Font(name=FUENTE, size=16, bold=True, color=TINTA)
F_SUB = Font(name=FUENTE, size=10, color=GRIS)
F_H2 = Font(name=FUENTE, size=11, bold=True, color=TINTA)
R_CAB_OB = PatternFill('solid', fgColor=TINTA)
R_CAB_OP = PatternFill('solid', fgColor='D5DBDF')
R_REVISAR = PatternFill('solid', fgColor='FFF2CC')
R_EJEMPLO = PatternFill('solid', fgColor='EEF0F2')
LINEA = Side(style='thin', color='9AA4AA')
B_CAB = Border(bottom=Side(style='medium', color=TINTA))
FILAS_VALIDADAS = {'Edificios': 60, 'Plantas': 400, 'Viviendas': 3000, 'Estancias': 15000, 'PlanesPago': 60}

FORMATOS = {'m2': '#,##0.00" m²"', 'euros': '#,##0" €"', 'porcentaje': '0.0%', 'entero': '0',
            'decimal': '#,##0.00', 'id': '@', 'ref:Viviendas': '@', 'ref:Edificios': '@', 'ref:PlanesPago': '@'}


def lista_rango(nombre):
    i = list(X.LISTAS).index(nombre) + 1
    letra = get_column_letter(i)
    return "Listas!$%s$2:$%s$%d" % (letra, letra, len(X.LISTAS[nombre]) + 1)


def ayuda_cabecera(c):
    t = c['ayuda']
    if c['obligatoria']:
        t = 'OBLIGATORIA. ' + t
    return t


def preparar_hoja(ws, columnas, congelar):
    for j, c in enumerate(columnas, start=1):
        celda = ws.cell(row=1, column=j, value=X.cabecera(c))
        celda.font = F_CAB_OB if c['obligatoria'] else F_CAB_OP
        celda.fill = R_CAB_OB if c['obligatoria'] else R_CAB_OP
        celda.alignment = Alignment(wrap_text=True, vertical='center', horizontal='left')
        celda.border = B_CAB
        com = Comment(ayuda_cabecera(c), 'SERENEA')
        com.width = 320
        com.height = 110
        celda.comment = com
        ws.column_dimensions[get_column_letter(j)].width = c['ancho'] + 2
    ws.row_dimensions[1].height = 44
    ws.freeze_panes = congelar
    ws.sheet_view.zoomScale = 110


def validaciones(ws, hoja, columnas):
    n = FILAS_VALIDADAS[hoja]
    for j, c in enumerate(columnas, start=1):
        letra = get_column_letter(j)
        rango = '%s2:%s%d' % (letra, letra, n)
        t = c['tipo']
        dv = None
        if t.startswith('lista:'):
            dv = DataValidation(type='list', formula1=lista_rango(t[6:]), allow_blank=True)
            dv.error = 'Elige un valor de la lista.'
        elif t == 'sino':
            dv = DataValidation(type='list', formula1=lista_rango('sino'), allow_blank=True)
            dv.error = 'Elige Sí o No.'
        elif t == 'ref:Edificios':
            dv = DataValidation(type='list', formula1='Edificios!$A$2:$A$%d' % FILAS_VALIDADAS['Edificios'], allow_blank=True)
            dv.error = 'Tiene que ser el ID de un edificio de la hoja Edificios.'
        elif t == 'ref:PlanesPago':
            dv = DataValidation(type='list', formula1='PlanesPago!$A$2:$A$%d' % FILAS_VALIDADAS['PlanesPago'], allow_blank=True)
            dv.error = 'Tiene que ser el código de un plan de la hoja PlanesPago.'
        elif t == 'ref:Viviendas':
            dv = DataValidation(type='list', formula1='Viviendas!$B$2:$B$%d' % FILAS_VALIDADAS['Viviendas'], allow_blank=True)
            dv.error = 'Tiene que ser el ID de una vivienda de la hoja Viviendas.'
        elif t == 'entero':
            dv = DataValidation(type='whole', operator='between', formula1=str(c.get('min', 0)),
                                formula2=str(c.get('max', 999999)), allow_blank=True)
            dv.error = 'Número entero entre %s y %s.' % (c.get('min', 0), c.get('max', 999999))
        elif t == 'm2':
            dv = DataValidation(type='decimal', operator='between', formula1='0', formula2='2000', allow_blank=True)
            dv.error = 'Superficie en m², entre 0 y 2.000, con dos decimales.'
        elif t == 'euros':
            dv = DataValidation(type='decimal', operator='between', formula1='0', formula2='100000000', allow_blank=True)
            dv.error = 'Importe en euros, sin decimales y sin IGIC.'
        elif t == 'porcentaje':
            dv = DataValidation(type='decimal', operator='between', formula1='0', formula2='1', allow_blank=True)
            dv.error = 'Porcentaje entre 0 % y 100 %. Escribe 7 para un 7 %.'
        elif t == 'id':
            dv = DataValidation(type='textLength', operator='between', formula1='1', formula2=str(c.get('maxlen', 30)), allow_blank=True)
            dv.error = 'Identificador de 1 a %d caracteres, sin espacios.' % c.get('maxlen', 30)
        if dv is None:
            continue
        dv.errorTitle = c['cabecera']
        dv.errorStyle = 'stop'
        dv.showErrorMessage = True
        dv.promptTitle = c['cabecera'][:32]
        dv.prompt = c['ayuda'][:250]
        dv.showInputMessage = True
        ws.add_data_validation(dv)
        dv.add(rango)


def formatos_columna(ws, hoja, columnas, desde, hasta):
    for j, c in enumerate(columnas, start=1):
        fmt = FORMATOS.get(c['tipo'])
        for r in range(desde, hasta + 1):
            celda = ws.cell(row=r, column=j)
            celda.font = F_NORMAL
            if fmt:
                celda.number_format = fmt
            if c['tipo'] in ('texto',) and c['ancho'] >= 28:
                celda.alignment = Alignment(wrap_text=False, vertical='top')


def escribir_filas(ws, columnas, filas, revisar=None, estilo=None):
    """filas: lista de dicts campo → valor. revisar: lista paralela de conjuntos de campos."""
    for i, d in enumerate(filas, start=2):
        for j, c in enumerate(columnas, start=1):
            v = d.get(c['campo'])
            if c['tipo'] == 'porcentaje' and isinstance(v, (int, float)):
                v = v / 100.0
            if c['tipo'] == 'sino' and isinstance(v, bool):
                v = 'Sí' if v else 'No'
            celda = ws.cell(row=i, column=j, value=v)
            if revisar and c['campo'] in revisar[i - 2]:
                celda.fill = R_REVISAR
            if estilo and estilo[i - 2] == 'guia':
                celda.font = F_GUIA
            elif estilo and estilo[i - 2] == 'ejemplo':
                celda.font = F_GUIA
                celda.fill = R_EJEMPLO


# ------------------------------------------------------------------- LÉEME
def hoja_leeme(ws, datos):
    ws.sheet_view.showGridLines = False
    ws.column_dimensions['A'].width = 3
    ws.column_dimensions['B'].width = 26
    ws.column_dimensions['C'].width = 92
    fila = [1]

    def linea(texto='', fuente=F_NORMAL, b=None, alto=None):
        r = fila[0]
        if b is not None:
            ws.cell(row=r, column=2, value=b).font = Font(name=FUENTE, size=10, bold=True, color=TINTA)
            ws.cell(row=r, column=2).alignment = Alignment(vertical='top', wrap_text=True)
            celda = ws.cell(row=r, column=3, value=texto)
        else:
            ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
            celda = ws.cell(row=r, column=2, value=texto)
        celda.font = fuente
        celda.alignment = Alignment(wrap_text=True, vertical='top')
        if alto:
            ws.row_dimensions[r].height = alto
        else:
            largo = len(texto or '') + (0 if b is None else 0)
            ancho = 92 if b is not None else 118
            ws.row_dimensions[r].height = max(15, 13.5 * (1 + largo // ancho))
        fila[0] += 1

    def titulo(t):
        linea()
        linea(t, F_H2)
        r = fila[0] - 1
        for cc in (2, 3):
            ws.cell(row=r, column=cc).border = Border(bottom=LINEA)

    linea('SERENEA · Plantilla de carga del showroom', F_TITULO, alto=26)
    linea('Versión 1 · %s · Edificio Apolo precargado (%d viviendas, %d estancias)'
          % (datos['fecha'], datos['viviendas'], datos['estancias']), F_SUB)

    titulo('Para qué sirve')
    linea('Con este Excel se hace la primera carga del showroom: edificios, plantas, viviendas con sus superficies, precios y '
          'estados, y las estancias de cada vivienda con sus puntos 360. Después, el día a día (vender, reservar, cambiar un '
          'precio) se hace en el panel, no aquí.')

    titulo('Lo que ya está relleno y hay que revisar')
    linea('Apolo completo, sacado de las 166 fichas comerciales en PDF y del listado de precios V.01 (agosto 2026).', b='Apolo')
    linea('Datos dudosos. Cada uno lleva la explicación en la columna «Notas internas» de su fila. Revísalos y quita el '
          'color cuando estén bien (el color no se carga: es solo una ayuda).', b='Celdas en amarillo')
    linea('Los estados que trae la columna Estado son de DEMOSTRACIÓN (una de cada tres viviendas sale vendida). Antes de '
          'la primera carga pon los reales: si se cargan así, la web enseñaría ventas que no existen.', b='Estados')
    linea('Confirma que siguen vigentes (en Drive está el «SERENEA_Pricing v.07»; sus primeras filas coinciden). Hay cinco '
          'viviendas con un precio que parece calculado con la tarifa de otro número de dormitorios: están en amarillo.', b='Precios')
    linea('La ficha 109 trae mal las estancias (se han tomado de la 211, que tiene el mismo plano) y la ficha 336 es una '
          'copia de la 236 (se han tomado sus datos). Pide las fichas corregidas.', b='Fichas 109 y 336')
    linea('Por su número en el plano del conjunto: 1 Apolo, 2 Zeus, 3 Atenea, 4 Hera y 5 Hermes. En el Pricing v.07 Hera y '
          'Hermes comparten el prefijo SE-HE: aquí Hera usa HE y Hermes HM para que sus referencias no choquen.',
          b='Otros edificios')
    linea('Solo hay una fila de ejemplo, que no se carga. Escribe tus planes reales y asígnalos en Viviendas › Plan de pagos.',
          b='Planes de pago')
    linea('Escribe el IGIC por defecto en la hoja Promoción (no se ha rellenado para no suponerlo).', b='IGIC')

    titulo('Cómo rellenarla, paso a paso')
    pasos = [
        ('1. Promoción', 'Revisa los datos generales y escribe el IGIC por defecto.'),
        ('2. Edificios', 'Una fila por edificio. El ID es corto y fijo (apolo, hera…): no lo cambies una vez publicado.'),
        ('3. Plantas', 'Una fila por planta de cada edificio, de abajo arriba. «Tipo de ventana»: antepecho en la planta 1 '
                       '(pretil blanco), suelo-techo en las demás. Lo usan los renders.'),
        ('4. PlanesPago', 'Una fila por plan de pagos. Los cuatro porcentajes (reserva, contrato, aplazado durante la obra y '
                          'entrega) suman 100 %. Si la reserva es un importe fijo, ponlo en su columna y deja la reserva en 0 %: '
                          'se descuenta del pago a la firma del contrato.'),
        ('5. Viviendas', 'Una fila por vivienda. Edificio y Planta tienen que existir en sus hojas. Precio sin IGIC y sin '
                         'decimales. Estado y Visible en web, del desplegable.'),
        ('6. Estancias', 'Una fila por estancia de cada vivienda, en el orden en que se verán. La suma de las superficies '
                         'útiles interiores tiene que dar la «Sup. útil» de la vivienda. «Tiene 360» = Sí pone la bolita.'),
        ('7. Guardar', 'Guarda como Libro de Excel (.xlsx), con el mismo nombre de hojas. No como .xls ni .csv.'),
    ]
    for b, t in pasos:
        linea(t, b=b)

    titulo('Reglas y formatos')
    reglas = [
        ('Obligatorio', 'Las cabeceras con asterisco y fondo oscuro son obligatorias. Las de fondo gris, opcionales. '
                        'Pasa el ratón por una cabecera para ver su explicación.'),
        ('Hojas y cabeceras', 'No cambies los nombres de las hojas ni de las cabeceras. Puedes ordenar y filtrar filas. No '
                              'insertes columnas en medio; si añades alguna al final, se ignora.'),
        ('Superficies', 'En m² con dos decimales: escribe 60,87 (el formato ya añade «m²»).'),
        ('Precios', 'En euros, sin IGIC y sin decimales: 191000 (se verá «191.000 €»).'),
        ('Porcentajes', 'Escribe 7 en una celda de porcentaje y quedará 7 %.'),
        ('Listas', 'Estado, Visible en web, Tipo, Orientación, Planta, Tipo de ventana… se eligen del desplegable. '
                   'Los valores están en la hoja Listas (protegida, sin contraseña: Revisar › Desproteger hoja si hace falta '
                   'añadir alguno; avisa antes, porque la web también tiene que conocerlo).'),
        ('Identificadores', 'Sin espacios ni tildes. El ID de vivienda es único en toda la promoción y no se cambia nunca: '
                            'Apolo mantiene 101–436, los mismos del ejecutable de la oficina. Para otros edificios usa prefijo '
                            '(HE-1A, ZE-1A…). La referencia comercial también es única.'),
        ('Dormitorios y baños', 'Tienen que coincidir con las estancias de tipo Dormitorio principal / Dormitorio y '
                                'Baño / Aseo. Estudio = 0 dormitorios.'),
        ('Terrazas', 'Su superficie construida va en Viviendas › Terraza. En Estancias la fila Terraza puede ir sin '
                     'superficie útil (las fichas no la dan) y no suma en la útil.'),
        ('Filas guía', 'Las filas en gris cursiva que empiezan por «GUÍA» en Notas internas se ignoran. Bórralas o rellénalas.'),
        ('Notas internas', 'Nunca se publican.'),
    ]
    for b, t in reglas:
        linea(t, b=b)

    titulo('Cómo se carga en el panel')
    carga = [
        ('1', 'Abre el panel con tu dirección privada: cada persona con acceso tiene la suya, con su propio parámetro secreto, y no se comparte.'),
        ('2', 'Pulsa «Cargar Excel» y elige este fichero. El fichero no sale de tu ordenador: el panel lo lee en el navegador.'),
        ('3', 'El panel lo comprueba y enseña los errores por hoja y fila, por ejemplo: «Viviendas · fila 37 · 136: la suma de '
              'sus estancias es 47,10 m² y la útil dice 47,54 m²». Si hay errores no se carga nada: corrige el Excel y vuelve a cargarlo.'),
        ('4', 'Sin errores, verás un resumen (viviendas por estado, cambios respecto a lo publicado) y los avisos. Revisa y pulsa «Publicar».'),
        ('5', 'La web se actualiza en ese momento, y también el ejecutable de la oficina de ventas, que lee los mismos estados.'),
    ]
    for b, t in carga:
        linea(t, b=b)

    titulo('Qué pasa con los cambios posteriores')
    despues = [
        ('Día a día', 'Estado, precio y Visible en web se cambian en el panel, vivienda a vivienda. Lo último que se guarda en el panel es lo que vale.'),
        ('Volver a cargar', 'Si cargas otra vez un Excel, se sustituyen superficies, estancias, textos y tipologías. Los '
                            'estados, precios y visibilidad cambiados en el panel se conservan, salvo que marques «Aplicar '
                            'también estados y precios del Excel»; antes de publicar, el panel enseña la lista de diferencias.'),
        ('Viviendas que faltan', 'Una vivienda que ya no esté en el Excel no se borra sola: el panel avisa y pide confirmación. '
                                 'Para retirarla de la venta, mejor Estado = No a la venta o Visible en web = No.'),
        ('Rehacer la carga', 'Descarga antes desde el panel el Excel con los datos actuales (mismo formato) y trabaja sobre él, '
                             'para no volver atrás estados y precios.'),
    ]
    for b, t in despues:
        linea(t, b=b)

    titulo('Hojas')
    for b, t in [('Promoción', 'Datos generales y IGIC por defecto.'),
                 ('Edificios', 'Los cinco edificios del conjunto.'),
                 ('Plantas', 'Plantas de cada edificio y su tipo de ventana.'),
                 ('Viviendas', 'Una fila por vivienda: superficies, precio, estado.'),
                 ('Estancias', 'Una fila por estancia: superficie útil y 360.'),
                 ('PlanesPago', 'Hitos de pago en porcentaje.'),
                 ('Listas', 'Valores de los desplegables (protegida).')]:
        linea(t, b=b)

    titulo('Colores')
    r = fila[0]
    for b, t, relleno, fuente in [('Cabecera oscura', 'Columna obligatoria.', R_CAB_OB, F_CAB_OB),
                                  ('Cabecera gris', 'Columna opcional.', R_CAB_OP, F_CAB_OP),
                                  ('Amarillo', 'Dato a revisar (explicación en Notas internas).', R_REVISAR, F_NORMAL),
                                  ('Gris cursiva', 'Fila guía o de ejemplo: no se carga.', R_EJEMPLO, F_GUIA)]:
        linea(t, b=b)
        ws.cell(row=fila[0] - 1, column=2).fill = relleno
        ws.cell(row=fila[0] - 1, column=2).font = Font(name=FUENTE, size=10, bold=True,
                                                       italic=fuente.italic, color=fuente.color)
    ws.sheet_view.zoomScale = 110


# ------------------------------------------------------------------ principal
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('-o', '--salida', default=SALIDA)
    a = ap.parse_args()
    semilla = json.load(open(SEMILLA, encoding='utf-8'))['viviendas']

    wb = Workbook()
    wb.properties.creator = 'SERENEA'
    wb.properties.title = 'SERENEA · Plantilla de carga del showroom'
    ws_l = wb.active
    ws_l.title = 'LÉEME'

    # ---- Promoción
    ws = wb.create_sheet('Promoción')
    for j, (t, w) in enumerate((('Campo', 30), ('Valor', 44), ('Ayuda', 80)), start=1):
        celda = ws.cell(row=1, column=j, value=t)
        celda.font = F_CAB_OB
        celda.fill = R_CAB_OB
        celda.border = B_CAB
        celda.alignment = Alignment(vertical='center')
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.row_dimensions[1].height = 24
    valores = {'id': 'serenea', 'nombre': 'SERENEA', 'promotora': 'Serenea by Unik SL',
               'direccion': 'C/ Íñigo López de Mendoza', 'localidad': 'Las Huesas, Telde',
               'igic': None, 'textoPrecio': '+ IGIC', 'versionPrecios': 'Listado de precios V.01 (agosto 2026)'}
    revisar_prom = {'igic', 'versionPrecios'}
    for i, (etq, campo, tipo, oblig, ayuda) in enumerate(X.PROMOCION, start=2):
        a1 = ws.cell(row=i, column=1, value=etq + (' *' if oblig else ''))
        a1.font = Font(name=FUENTE, size=10, bold=oblig, color=TINTA)
        v = valores.get(campo)
        b1 = ws.cell(row=i, column=2, value=v)
        b1.font = F_NORMAL
        if tipo == 'porcentaje':
            b1.number_format = '0.0%'
            dv = DataValidation(type='decimal', operator='between', formula1='0', formula2='1', allow_blank=True)
            dv.error = 'Porcentaje entre 0 % y 100 %. Escribe 7 para un 7 %.'
            dv.showErrorMessage = True
            ws.add_data_validation(dv)
            dv.add(b1.coordinate)
        if campo in revisar_prom:
            b1.fill = R_REVISAR
        c1 = ws.cell(row=i, column=3, value=ayuda)
        c1.font = F_SUB
        c1.alignment = Alignment(wrap_text=True, vertical='top')
    ws.freeze_panes = 'A2'

    # ---- Edificios
    cols = X.HOJAS['Edificios']
    ws = wb.create_sheet('Edificios')
    preparar_hoja(ws, cols, 'B2')
    dorm = Counter(('E' if v['estudio'] else v['dormitorios']) for v in semilla.values())
    texto_apolo = '%d viviendas: estudios y de 1, 2 y 3 dormitorios, con áticos con terraza.' % len(semilla)
    edif = [
        dict(id='apolo', nombre='Apolo', numero=1, numPlantas=4, orden=1, estado='En venta', texto=texto_apolo,
             notas='Edificio 1 del boceto del conjunto.'),
        dict(id='zeus', nombre='Zeus', numero=2, orden=2, estado='Próximamente',
             notas='Edificio 2 del plano del conjunto. Prefijo de referencias: ZE.'),
        dict(id='atenea', nombre='Atenea', numero=3, orden=3, estado='Próximamente',
             notas='Edificio 3 del plano del conjunto. Prefijo de referencias: AT.'),
        dict(id='hera', nombre='Hera', numero=4, orden=4, estado='Próximamente',
             notas='Edificio 4 del plano del conjunto. Prefijo de referencias: HE.'),
        dict(id='hermes', nombre='Hermes', numero=5, orden=5, estado='Próximamente',
             notas='Edificio 5 del plano del conjunto. Prefijo de referencias: HM (en el Pricing v.07 figura SE-HE, igual que Hera).'),
    ]
    rev = [set(), {'estado'}, {'estado'}, {'estado'}, {'estado'}]
    escribir_filas(ws, cols, edif, rev)
    formatos_columna(ws, 'Edificios', cols, 2, len(edif) + 1)
    for i in range(len(edif)):
        for j, c in enumerate(cols, start=1):
            if c['campo'] in rev[i]:
                ws.cell(row=i + 2, column=j).fill = R_REVISAR
    validaciones(ws, 'Edificios', cols)
    ws.auto_filter.ref = 'A1:%s%d' % (get_column_letter(len(cols)), len(edif) + 1)

    # ---- Plantas
    cols = X.HOJAS['Plantas']
    ws = wb.create_sheet('Plantas')
    preparar_hoja(ws, cols, 'C2')
    pl = [
        dict(edificio='apolo', codigo='P1', nombre='Planta 1', orden=1, ventana='antepecho',
             notas='Fichas: «Nivel 1». units.json: «Baja». Pricing v.07: «Planta 01 (baja)». Ventana con pretil blanco.'),
        dict(edificio='apolo', codigo='P2', nombre='Planta 2', orden=2, ventana='suelo-techo', notas='Fichas: «Nivel 2». units.json: «1ª».'),
        dict(edificio='apolo', codigo='P3', nombre='Planta 3', orden=3, ventana='suelo-techo', notas='Fichas: «Nivel 3». units.json: «2ª».'),
        dict(edificio='apolo', codigo='P4', nombre='Ático', orden=4, ventana='suelo-techo', notas='Fichas: «Nivel 4». Áticos con terraza.'),
    ]
    estilo = ['normal'] * len(pl)
    for e in ('zeus', 'atenea', 'hera', 'hermes'):
        pl.append(dict(edificio=e, notas='GUÍA: una fila por planta de este edificio (P1 = Planta 1, antepecho; resto suelo-techo).'))
        estilo.append('guia')
    escribir_filas(ws, cols, pl, None, estilo)
    formatos_columna(ws, 'Plantas', cols, 2, FILAS_VALIDADAS['Plantas'])
    for i, s in enumerate(estilo):
        if s == 'guia':
            for j in range(1, len(cols) + 1):
                ws.cell(row=i + 2, column=j).font = F_GUIA
    validaciones(ws, 'Plantas', cols)
    ws.auto_filter.ref = 'A1:%s%d' % (get_column_letter(len(cols)), len(pl) + 1)

    # ---- Viviendas
    cols = X.HOJAS['Viviendas']
    ws = wb.create_sheet('Viviendas')
    preparar_hoja(ws, cols, 'C2')
    filas, rev, estilo = [], [], []
    mapa_rev = {'estancias': {'supUtil'}, 'precio': {'precio'}, 'dormitorios': {'dormitorios'}}
    estado_lista = {'disponible': 'Disponible', 'reservada': 'Reservada', 'vendida': 'Vendida'}
    for vid, v in semilla.items():
        filas.append(dict(edificio='apolo', id=vid, referencia=v['referencia'], planta='P%d' % v['nivel'],
                          tipologia=v.get('tipologia'), dormitorios=v['dormitorios'], banos=v['banos'],
                          orientacion=v['orientacion'], supUtil=v['supUtil'],
                          supConstruidaInterior=v['supConstruidaInterior'], supConstruidaZZCC=v['supConstruidaZZCC'],
                          terraza=v['terraza'] or None, precio=v['precio'], igic=None,
                          estado=estado_lista[v['estadoSemilla']], visible=True, planPagos=None,
                          notas=' '.join(v['avisos']) or None))
        r = {'estado'}
        for k in v['revisar']:
            r |= mapa_rev.get(k, {k})
        if vid == '336':
            r |= {'supUtil', 'supConstruidaInterior', 'supConstruidaZZCC', 'terraza', 'referencia'}
        rev.append(r)
        estilo.append('normal')
    for e, nombre in (('zeus', 'Zeus'), ('atenea', 'Atenea'), ('hera', 'Hera'), ('hermes', 'Hermes')):
        filas.append(dict(edificio=e, notas='GUÍA: una fila por vivienda de %s. ID con prefijo del edificio (p. ej. HE-1A), referencia comercial, planta de la hoja Plantas, superficies de la ficha, precio sin IGIC y estado.' % nombre))
        rev.append(set())
        estilo.append('guia')
    escribir_filas(ws, cols, filas, rev, estilo)
    formatos_columna(ws, 'Viviendas', cols, 2, FILAS_VALIDADAS['Viviendas'])
    for i, s in enumerate(estilo):
        for j, c in enumerate(cols, start=1):
            celda = ws.cell(row=i + 2, column=j)
            if s == 'guia':
                celda.font = F_GUIA
            if c['campo'] in rev[i]:
                celda.fill = R_REVISAR
    validaciones(ws, 'Viviendas', cols)
    ws.auto_filter.ref = 'A1:%s%d' % (get_column_letter(len(cols)), len(filas) + 1)

    # ---- Estancias
    cols = X.HOJAS['Estancias']
    ws = wb.create_sheet('Estancias')
    preparar_hoja(ws, cols, 'D2')
    nombre_tipo = {k: v for v, k in X.CODIGOS['tiposEstancia'].items()}
    filas, rev, estilo = [], [], []
    for vid, v in semilla.items():
        for orden, e in enumerate(v['estancias'], start=1):
            nota = None
            if e['tipo'] == 'terraza':
                nota = 'La ficha solo da la superficie construida exterior (%.2f m²), que va en Viviendas › Terraza.' % e['supConstruida']
                if not e['tiene360']:
                    nota += ' Balcón pequeño: sin 360 de momento.'
            filas.append(dict(vivienda=vid, orden=orden, codigo=e['codigo'], nombre=e['nombre'],
                              tipo=nombre_tipo[e['tipo']], superficie=e['sup'], tiene360=bool(e['tiene360']),
                              puntos360=e['puntos360'] if e['tiene360'] else None, notas=nota))
            rev.append({'superficie', 'nombre'} if vid in ('109', '336') else set())
            estilo.append('normal')
    filas.append(dict(notas='GUÍA: una fila por estancia de cada vivienda de los demás edificios, con el ID de la vivienda.'))
    rev.append(set())
    estilo.append('guia')
    escribir_filas(ws, cols, filas, rev, estilo)
    formatos_columna(ws, 'Estancias', cols, 2, len(filas) + 400)
    for i, s in enumerate(estilo):
        for j, c in enumerate(cols, start=1):
            celda = ws.cell(row=i + 2, column=j)
            if s == 'guia':
                celda.font = F_GUIA
            if c['campo'] in rev[i]:
                celda.fill = R_REVISAR
    validaciones(ws, 'Estancias', cols)
    ws.auto_filter.ref = 'A1:%s%d' % (get_column_letter(len(cols)), len(filas) + 1)
    n_estancias = len(filas) - 1

    # ---- PlanesPago
    cols = X.HOJAS['PlanesPago']
    ws = wb.create_sheet('PlanesPago')
    preparar_hoja(ws, cols, 'B2')
    ej = [dict(codigo='EJEMPLO', nombre='Ejemplo de formato: no es un plan real', reservaPct=0, reservaImporte=None,
               contratoPct=20, aplazadoPct=30, cuotas=12, entregaPct=50, ejemplo=True,
               notas='Fila de EJEMPLO con cifras inventadas para enseñar el formato. No se carga. Bórrala y escribe los planes reales.')]
    escribir_filas(ws, cols, ej, None, ['ejemplo'])
    formatos_columna(ws, 'PlanesPago', cols, 2, FILAS_VALIDADAS['PlanesPago'])
    for j in range(1, len(cols) + 1):
        ws.cell(row=2, column=j).font = F_GUIA
        ws.cell(row=2, column=j).fill = R_EJEMPLO
    validaciones(ws, 'PlanesPago', cols)
    ws.auto_filter.ref = 'A1:%s2' % get_column_letter(len(cols))

    # ---- Listas (protegida)
    ws = wb.create_sheet('Listas')
    for j, (nombre, valores_l) in enumerate(X.LISTAS.items(), start=1):
        celda = ws.cell(row=1, column=j, value=X.TITULOS_LISTAS[nombre])
        celda.font = F_CAB_OB
        celda.fill = R_CAB_OB
        celda.alignment = Alignment(wrap_text=True, vertical='center')
        ws.column_dimensions[get_column_letter(j)].width = max(16, max(len(x) for x in valores_l) + 2)
        for i, val in enumerate(valores_l, start=2):
            ws.cell(row=i, column=j, value=val).font = F_NORMAL
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = 'A2'
    ws.protection.sheet = True
    ws.protection.formatColumns = False
    ws.sheet_properties.tabColor = '9AA4AA'

    # ---- LÉEME (al final, con los recuentos)
    hoja_leeme(ws_l, {'fecha': datetime.date.today().strftime('%d-%m-%Y'), 'viviendas': len(semilla),
                      'estancias': n_estancias})
    ws_l.sheet_properties.tabColor = TINTA
    wb.active = 0

    os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
    wb.save(a.salida)
    comprobar(a.salida, len(semilla), n_estancias)
    print('plantilla →', a.salida)


def comprobar(ruta, n_viv, n_est):
    """Reabre el fichero y comprueba lo esencial."""
    wb = load_workbook(ruta)
    esperadas = ['LÉEME', 'Promoción', 'Edificios', 'Plantas', 'Viviendas', 'Estancias', 'PlanesPago', 'Listas']
    assert wb.sheetnames == esperadas, wb.sheetnames
    for h, cols in X.HOJAS.items():
        ws = wb[h]
        cab = [ws.cell(row=1, column=j).value for j in range(1, len(cols) + 1)]
        assert cab == [X.cabecera(c) for c in cols], (h, cab)
        assert ws.freeze_panes, h
        assert ws.auto_filter.ref, h
        assert ws.data_validations.dataValidation, h
        assert all(ws.cell(row=1, column=j).comment for j in range(1, len(cols) + 1)), h
    vv = wb['Viviendas']
    ids = [vv.cell(row=r, column=2).value for r in range(2, vv.max_row + 1) if vv.cell(row=r, column=2).value]
    assert len(ids) == n_viv == len(set(ids)), len(ids)
    ee = wb['Estancias']
    n = sum(1 for r in range(2, ee.max_row + 1) if ee.cell(row=r, column=1).value)
    assert n == n_est, (n, n_est)
    assert wb['Listas'].protection.sheet
    assert vv.cell(row=2, column=9).number_format == X_FORMATO_M2
    print('comprobado: %d hojas, %d viviendas, %d estancias, validaciones y cabeceras correctas' % (len(wb.sheetnames), len(ids), n))


X_FORMATO_M2 = FORMATOS['m2']

if __name__ == '__main__':
    main()
