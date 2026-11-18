#!/usr/bin/env python3
"""Genera la hoja de control de producción de imágenes del showroom SERENEA.

Lee nuevo/data/tipologias.json y nuevo/data/serenea.json y escribe
nuevo/plantilla/SERENEA_Produccion_Imagenes_v1.xlsx con una fila por pieza.

Uso:  python3 -I nuevo/tools/crear_produccion_imagenes.py [--resumen ruta.json]

Las reglas de recuento son las de nuevo/docs/PRODUCCION_IMAGENES.md (§2):
- 360 interiores: una toma por tipología, nivel y estancia con ventana
  (salón/estudio y dormitorios), porque la vista cambia con la altura; las
  viviendas espejadas que dan a calle llevan su propia toma (sufijo -E); las
  que dan al jardín interior reutilizan la toma volteada. Baños: una por
  tipología (son interiores).
- Terrazas de 10 m² o más: una toma por vivienda (dos si pasan de 40 m²).
- Cenitales de vivienda: recorte automático del render de planta en mosaico
  (200 px/m), una por vivienda; los datos de hotspots, uno por variante.
"""
import json
import os
import sys
import datetime as dt
from collections import OrderedDict, Counter

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA = os.path.join(RAIZ, 'data')
SALIDA = os.path.join(RAIZ, 'plantilla', 'SERENEA_Produccion_Imagenes_v1.xlsx')

F0 = dt.date(2026, 11, 27)   # Fase 0 preparación
F1 = dt.date(2026, 12, 11)   # Fase 1 piloto
FV = dt.date(2026, 12, 18)   # Validación del piloto
F2 = dt.date(2027, 1, 29)    # Fase 2 Apolo completo
F3 = dt.date(2027, 3, 26)    # Fase 3 conjunto (si los modelos llegan antes del 15-01-2027)

PILOTO_TIP = {'2D-08', '1D-01'}
PILOTO_NIVEL = 2          # planta del piloto (render de planta y cenitales)
PILOTO_TERRAZA = '107'    # patio de 11,9 m² de la 1D-01, para validar las terrazas

ESTADOS = ['Pendiente', 'En preparación', 'En render', 'En revisión', 'Aprobada',
           'Rechazada', 'Publicada', 'Reutilizar existente', 'Bloqueada (falta material)']
RESPONSABLES = ['Artista 3D (D5)', 'Claude', 'Fran / UNIK', 'Dirección comercial',
                'Memorable', 'Pendiente de asignar']
HERRAMIENTAS = ['D5 Render Pro', 'D5 Render Pro (vídeo)', 'Script GLB/three.js',
                'Script Python', 'ffmpeg', 'Weave · Veo 3.1 I2V', 'Weave · Kling inicio-final',
                'Weave · Nano Banana Pro', 'Weave · Topaz CGI', 'SketchUp + Ruby',
                'Memorable (existente)', 'DaVinci Resolve']
TIPOS = OrderedDict([
    ('REF', 'Preparación / biblia'),
    ('MOD', 'Modelado previo'),
    ('EXT', 'Render exterior maestro'),
    ('MSK', 'Máscara / pase de ID'),
    ('VID', 'Vídeo de transición'),
    ('PLA', 'Render de planta (mosaico)'),
    ('CEN', 'Cenital de vivienda (recorte)'),
    ('HOT', 'Hotspots y enlaces (datos)'),
    ('360', '360 interior'),
    ('36T', '360 terraza'),
    ('ZC', 'Zona común'),
])

COLS = ['Código', 'Tipo', 'Descripción', 'Edificio', 'Planta', 'Vivienda / tipología',
        'Estancia', 'Cámara', 'Resolución master', 'Formato', 'Herramienta', 'Depende de',
        'Fase', 'Estado', 'Responsable', 'Fecha objetivo', 'Cantidad', 'Notas']
ANCHOS = [30, 24, 46, 10, 10, 18, 22, 44, 20, 30, 24, 30, 12, 20, 20, 14, 9, 60]

RES_EXT = '5120×2880 (16:9)'
RES_360 = '8192×4096 (2:1)'
RES_PLA = '200 px/m · teselas 8000×4000'
FMT_EXT = 'PNG 16 bit → WebP/AVIF + JPG'
FMT_360 = 'PNG 16 bit → JPG q90 → cubo multirresolución'
FMT_MSK = 'PNG indexado + JSON de polígonos'
FMT_VID = 'ProRes/H.265 → H.264 + AV1 (web)'
CAM360 = '360 a 1,50 m, nivelada; posición según ficha de cámara (§2.4)'

NOMBRE_NIVEL = {1: 'Planta 1', 2: 'Planta 2', 3: 'Planta 3', 4: 'Ático'}


def fase_de(nivel, tip):
    # El piloto lleva las dos tipologías completas (todos sus niveles), para
    # validar la regla de ventanas (planta 1 con antepecho) y las vistas por altura.
    return '1 · Piloto' if tip in PILOTO_TIP else '2 · Apolo'


def fecha_de(fase):
    return {'0 · Preparación': F0, '1 · Piloto': F1, '2 · Apolo': F2, '3 · Conjunto': F3}[fase]


def fila(**k):
    base = OrderedDict((c, '') for c in COLS)
    base['Estado'] = 'Pendiente'
    base['Cantidad'] = 1
    base.update(k)
    if not base['Fecha objetivo'] and base['Fase'] in ('0 · Preparación', '1 · Piloto', '2 · Apolo', '3 · Conjunto'):
        base['Fecha objetivo'] = fecha_de(base['Fase'])
    base['Tipo'] = TIPOS.get(base['Tipo'], base['Tipo'])
    return base


def cargar():
    tip = json.load(open(os.path.join(DATA, 'tipologias.json'), encoding='utf-8'))
    ser = json.load(open(os.path.join(DATA, 'serenea.json'), encoding='utf-8'))
    apolo = [e for e in ser['edificios'] if e['id'] == 'apolo'][0]
    viv = {}
    for p in apolo['plantas']:
        for v in p['viviendas']:
            v['_nivel'] = int(v['id'][0])
            viv[v['id']] = v
    return tip, viv


def filas_apolo(tip, viv):
    R = []
    F = '0 · Preparación'
    R += [
        fila(Código='SER-AP-REF-01', Tipo='REF', Descripción='Auditoría del SketchUp 17.09.26: mobiliario por vivienda, materiales con los nombres de la paleta, grupos por planta y tramo', Edificio='Apolo', Herramienta='SketchUp + Ruby', Responsable='Artista 3D (D5)', Fase=F, Notas='Comprobar que apolo_mobiliario cubre las 43 tipologías; completar las que falten como componentes por tipología.'),
        fila(Código='SER-AP-REF-02', Tipo='REF', Descripción='Lookdev D5: hora maestra, cielo, materiales y exposición fijos; escena plantilla', Edificio='Apolo', Herramienta='D5 Render Pro', Responsable='Artista 3D (D5)', Fase=F, Notas='Sol acimut ≈ 241°, altura ≈ 28° (mediados de octubre, hacia las 17:15 hora local). Cenitales: mismo acimut, altura 70°.'),
        fila(Código='SER-AP-REF-03', Tipo='REF', Descripción='LUT del proyecto SERENEA_LUT_v1.cube y carta de color de referencia', Edificio='Conjunto', Herramienta='DaVinci Resolve', Responsable='Claude', Depende_de='SER-AP-REF-02', Fase=F),
        fila(Código='SER-AP-REF-04', Tipo='REF', Descripción='Personajes: pareja Serenea (mujer sentada en sofá, hombre cocinando) como recursos 3D fijos de D5', Edificio='Conjunto', Herramienta='D5 Render Pro', Responsable='Artista 3D (D5)', Fase=F, Notas='Mismos dos recursos y mismo vestuario en todas las cenitales de vivienda.'),
        fila(Código='SER-AP-REF-05', Tipo='REF', Descripción='Cámaras por script: escenas de SketchUp con nombre y coordenadas exactas (exteriores, ortográficas, 360) y fichero camaras_produccion.json', Edificio='Apolo', Herramienta='SketchUp + Ruby', Responsable='Claude', Depende_de='SER-AP-REF-01', Fase=F, Notas='El mismo fichero alimenta las capturas de máscara en three.js.'),
        fila(Código='SER-AP-REF-06', Tipo='REF', Descripción='Prueba de casado render ↔ máscara (IoU ≥ 0,98, desfase de borde ≤ 1 px) en una cámara exterior y en la planta 2', Edificio='Apolo', Herramienta='Script GLB/three.js', Responsable='Claude', Depende_de='SER-AP-REF-05', Fase=F),
    ]
    for r in R:
        if 'Depende_de' in r:
            r['Depende de'] = r.pop('Depende_de')
    # Conjunto (provisional con volúmenes; definitivo en fase 3)
    R += [
        fila(Código='SER-CJ-EXT-01p', Tipo='EXT', Descripción='Aérea del conjunto provisional: Apolo modelado + volúmenes de Zeus, Atenea, Hera y Hermes', Edificio='Conjunto', Cámara='Aérea fija CJ-C01, axonométrica, 35 mm eq., dron ≈ 120 m', **{'Resolución master': RES_EXT}, Formato=FMT_EXT, Herramienta='D5 Render Pro', **{'Depende de': 'SER-AP-REF-02'}, Fase='1 · Piloto', Responsable='Artista 3D (D5)', Notas='Sustituye a la captura three.js mientras faltan los otros cuatro modelos.'),
        fila(Código='SER-CJ-MSK-01p', Tipo='MSK', Descripción='Máscara de los cinco edificios desde CJ-C01 (provisional)', Edificio='Conjunto', Cámara='CJ-C01', **{'Resolución master': RES_EXT}, Formato=FMT_MSK, Herramienta='Script GLB/three.js', **{'Depende de': 'SER-CJ-EXT-01p'}, Fase='1 · Piloto', Responsable='Claude'),
    ]
    # Apolo edificio
    R += [
        fila(Código='SER-AP-EXT-01', Tipo='EXT', Descripción='Apolo en primer plano desde la calle, con chincheta de Hera visible al fondo', Edificio='Apolo', Cámara='Cámara fija AP-C01, 1,60–6 m, 24–35 mm eq., verticales corregidas', **{'Resolución master': RES_EXT}, Formato=FMT_EXT, Herramienta='D5 Render Pro', **{'Depende de': 'SER-AP-REF-02'}, Fase='1 · Piloto', Responsable='Artista 3D (D5)', Notas='Zona segura central 9:16 para el recorte de móvil.'),
        fila(Código='SER-AP-MSK-01', Tipo='MSK', Descripción='Máscara de plantas (P1, P2, P3, Ático; con los saltos de tramo) desde AP-C01', Edificio='Apolo', Cámara='AP-C01', **{'Resolución master': RES_EXT}, Formato=FMT_MSK, Herramienta='Script GLB/three.js', **{'Depende de': 'SER-AP-EXT-01'}, Fase='1 · Piloto', Responsable='Claude'),
        fila(Código='SER-AP-VID-01', Tipo='VID', Descripción='Transición conjunto → Apolo (vuelo de cámara de CJ-C01 a AP-C01)', Edificio='Apolo', Cámara='Trayectoria CJ-C01 → AP-C01, 6–8 s, velocidad suave', **{'Resolución master': '3840×2160, 25 fps'}, Formato=FMT_VID, Herramienta='D5 Render Pro (vídeo)', **{'Depende de': 'SER-CJ-EXT-01p, SER-AP-EXT-01'}, Fase='1 · Piloto', Responsable='Artista 3D (D5)', Notas='Alternativa: Weave · Veo 3.1 I2V con primer y último fotograma. Último fotograma = SER-AP-EXT-01 (SSIM ≥ 0,95, desfase ≤ 2 px).'),
        fila(Código='SER-AP-VID-02', Tipo='VID', Descripción='Transición Apolo → conjunto (inversa de VID-01)', Edificio='Apolo', Cámara='Inversa de VID-01', **{'Resolución master': '3840×2160, 25 fps'}, Formato=FMT_VID, Herramienta='ffmpeg', **{'Depende de': 'SER-AP-VID-01'}, Fase='1 · Piloto', Responsable='Claude', Notas='Sin coste de generación si no hay elementos en movimiento.'),
        fila(Código='SER-AP-EXT-02', Tipo='EXT', Descripción='Imagen fija del panel izquierdo: Memorable CAM11 FRONTAL', Edificio='Apolo', Cámara='Memorable CAM11', **{'Resolución master': 'Original (≈15 MB)'}, Formato='JPG → WebP 1600 px', Herramienta='Memorable (existente)', Fase='1 · Piloto', Estado='Reutilizar existente', Responsable='Claude', Notas='Pedir a Memorable permiso de uso web.'),
    ]
    # Plantas
    for n in (1, 2, 3, 4):
        fase = '1 · Piloto' if n == 2 else '2 · Apolo'
        if n == 3:
            R.append(fila(Código='SER-AP-PLA-N3', Tipo='PLA', Descripción='Planta 3: reutiliza el render de la planta 2 (geometría idéntica en todas las fichas)', Edificio='Apolo', Planta='Planta 3', Cámara='La misma que PLA-N2', **{'Resolución master': RES_PLA}, Formato=FMT_EXT, Herramienta='Script Python', **{'Depende de': 'SER-AP-PLA-N2-A, SER-AP-PLA-N2-B'}, Fase=fase, Responsable='Claude', Notas='Si el mobiliario o el estilismo cambian entre plantas 2 y 3, pasa a render propio.'))
        else:
            for pase, txt in (('A', 'sin personas (vista de planta completa)'), ('B', 'con personas (fuente de las cenitales de vivienda)')):
                R.append(fila(Código=f'SER-AP-PLA-N{n}-{pase}', Tipo='PLA', Descripción=f'{NOMBRE_NIVEL[n]}: render cenital ortográfico con mobiliario, {txt}', Edificio='Apolo', Planta=NOMBRE_NIVEL[n], Cámara='Ortográfica cenital, norte arriba, corte a 1,40 m sobre el suelo de cada tramo', **{'Resolución master': RES_PLA}, Formato=FMT_EXT, Herramienta='D5 Render Pro', **{'Depende de': 'SER-AP-REF-02, SER-AP-REF-04'}, Fase=fase, Responsable='Artista 3D (D5)', Cantidad=6, Notas='6 teselas por pase (3×2, solape 64 px); mismo sol en todas.'))
        R.append(fila(Código=f'SER-AP-MSK-N{n}', Tipo='MSK', Descripción=f'{NOMBRE_NIVEL[n]}: polígonos de viviendas en píxeles de la planta', Edificio='Apolo', Planta=NOMBRE_NIVEL[n], Cámara='Misma ortográfica que PLA', **{'Resolución master': RES_PLA}, Formato=FMT_MSK, Herramienta='Script GLB/three.js', **{'Depende de': 'SER-AP-REF-05'}, Fase=fase, Responsable='Claude'))
    # Cenitales por vivienda (recorte)
    for vid in sorted(viv):
        v = viv[vid]
        n = v['_nivel']
        # la planta 2 entera sale del mismo render del piloto
        fase = '1 · Piloto' if n == PILOTO_NIVEL else '2 · Apolo'
        src = f'SER-AP-PLA-N{2 if n == 3 else n}-B'
        R.append(fila(Código=f'SER-AP-CEN-{vid}', Tipo='CEN', Descripción=f'Cenital detallada de la vivienda {vid} (recorte + versión aislada)', Edificio='Apolo', Planta=NOMBRE_NIVEL[n], **{'Vivienda / tipología': f'{vid} · {v["tipologia"]}'}, Cámara='Recorte de la ortográfica a 200 px/m', **{'Resolución master': '≈1600×2200 (según vivienda)'}, Formato='PNG → WebP/AVIF 2× y 1×', Herramienta='Script Python', **{'Depende de': f'{src}, SER-AP-HOT-*'}, Fase=fase, Responsable='Claude'))
    # Hotspots por variante
    for tp in tip['tipologias']:
        for var in tp['variantes']:
            niveles = sorted({int(i[0]) for i in var['ids']})
            fase = '1 · Piloto' if tp['codigo'] in PILOTO_TIP else '2 · Apolo'
            R.append(fila(Código=f'SER-AP-HOT-{var["codigo"]}', Tipo='HOT', Descripción=f'Posiciones de hotspots en la cenital y enlaces entre estancias ({var["grupoPlantas"]})', Edificio='Apolo', Planta=var['grupoPlantas'], **{'Vivienda / tipología': f'{var["codigo"]} ({len(var["ids"])} viv.)'}, Cámara='Proyección de las cámaras 360 en la planta', **{'Resolución master': 'JSON'}, Formato='JSON (x, y en px; yaw/pitch de enlaces)', Herramienta='Script Python', **{'Depende de': 'SER-AP-REF-05'}, Fase=fase, Responsable='Claude', Notas='Las viviendas de la variante heredan los puntos con su transformación (giro o espejo).'))
    # 360 interiores
    for tp in tip['tipologias']:
        ids = tp['ids']
        niveles = sorted({viv[i]['_nivel'] for i in ids})
        orient = viv[ids[0]]['orientacion']
        espejadas = set(tp['espejadas'])
        con_ventana = [e for e in tp['estancias'] if e['tiene360'] and e['tipo'] != 'bano']
        banos = [e for e in tp['estancias'] if e['tiene360'] and e['tipo'] == 'bano']
        for n in niveles:
            ref = [i for i in ids if viv[i]['_nivel'] == n and i not in espejadas] or [i for i in ids if viv[i]['_nivel'] == n]
            ventana = 'antepecho blanco' if n == 1 else 'suelo-techo'
            for e in con_ventana:
                R.append(fila(Código=f'SER-AP-360-{tp["codigo"]}-N{n}-{e["codigo"]}', Tipo='360', Descripción=f'{e["nombre"]} · vista real de la {NOMBRE_NIVEL[n].lower()} · ventana {ventana}', Edificio='Apolo', Planta=NOMBRE_NIVEL[n], **{'Vivienda / tipología': f'{tp["codigo"]} (ref. {ref[0]})'}, Estancia=e['nombre'], Cámara=CAM360, **{'Resolución master': RES_360}, Formato=FMT_360, Herramienta='D5 Render Pro', **{'Depende de': 'SER-AP-REF-02, SER-AP-REF-05'}, Fase=fase_de(n, tp['codigo']), Responsable='Artista 3D (D5)', Notas=f'Orientación: {orient}.'))
            esp_n = [i for i in ids if viv[i]['_nivel'] == n and i in espejadas]
            if esp_n and orient != 'Jardín interior':
                for e in con_ventana:
                    R.append(fila(Código=f'SER-AP-360-{tp["codigo"]}-N{n}-{e["codigo"]}-E', Tipo='360', Descripción=f'{e["nombre"]} · vivienda espejada con vista a calle · {NOMBRE_NIVEL[n].lower()}', Edificio='Apolo', Planta=NOMBRE_NIVEL[n], **{'Vivienda / tipología': f'{tp["codigo"]} (ref. {esp_n[0]})'}, Estancia=e['nombre'], Cámara=CAM360, **{'Resolución master': RES_360}, Formato=FMT_360, Herramienta='D5 Render Pro', **{'Depende de': 'SER-AP-REF-02, SER-AP-REF-05'}, Fase=fase_de(n, tp['codigo']), Responsable='Artista 3D (D5)', Notas='No se voltea: la calle saldría invertida.'))
        for e in banos:
            fase = '1 · Piloto' if tp['codigo'] in PILOTO_TIP else '2 · Apolo'
            R.append(fila(Código=f'SER-AP-360-{tp["codigo"]}-{e["codigo"]}', Tipo='360', Descripción=f'{e["nombre"]} (interior, vale para todos los niveles; volteado en las espejadas)', Edificio='Apolo', Planta='Todas', **{'Vivienda / tipología': f'{tp["codigo"]} (ref. {tp["referencia"]})'}, Estancia=e['nombre'], Cámara='360 a 1,40 m en el centro del baño', **{'Resolución master': RES_360}, Formato=FMT_360, Herramienta='D5 Render Pro', **{'Depende de': 'SER-AP-REF-02'}, Fase=fase, Responsable='Artista 3D (D5)'))
    # Terrazas
    for vid in sorted(viv):
        v = viv[vid]
        tr = v['superficies']['terraza'] or 0
        if tr >= 10:
            puntos = 2 if tr >= 40 else 1
            for k in range(1, puntos + 1):
                R.append(fila(Código=f'SER-AP-36T-{vid}-T{k}', Tipo='36T', Descripción=f'Terraza de la vivienda {vid} ({tr:.2f} m²), punto {k} de {puntos}', Edificio='Apolo', Planta=NOMBRE_NIVEL[v['_nivel']], **{'Vivienda / tipología': f'{vid} · {v["tipologia"]}'}, Estancia='Terraza', Cámara='360 a 1,50 m, a ≥ 1,0 m de la barandilla', **{'Resolución master': RES_360}, Formato=FMT_360, Herramienta='D5 Render Pro', **{'Depende de': 'SER-AP-REF-02'}, Fase='1 · Piloto' if vid == PILOTO_TERRAZA else '2 · Apolo', Responsable='Artista 3D (D5)', Notas='Una por vivienda: en la terraza la vista es lo que se vende.'))
    # Zonas comunes
    zc = [
        ('SER-AP-ZC-01', 'Portal tipo (360)', 'D5 Render Pro', 'Artista 3D (D5)', 'Pendiente'),
        ('SER-AP-ZC-02', 'Patio-jardín central (360)', 'D5 Render Pro', 'Artista 3D (D5)', 'Pendiente'),
        ('SER-AP-ZC-03', 'Gimnasio comunitario (360)', 'D5 Render Pro', 'Artista 3D (D5)', 'Pendiente'),
        ('SER-AP-ZC-04', 'Garaje planta −1 (360, opcional)', 'D5 Render Pro', 'Artista 3D (D5)', 'Pendiente'),
        ('SER-AP-ZC-05', 'Imágenes fijas: Memorable CAM05 aparcamiento, CAM06 gimnasio, CAM09 patio, CAM13 terraza', 'Memorable (existente)', 'Claude', 'Reutilizar existente'),
    ]
    for cod, des, her, resp, est in zc:
        R.append(fila(Código=cod, Tipo='ZC', Descripción=des, Edificio='Apolo', Cámara=CAM360 if '360' in des else 'Cámaras de Memorable', **{'Resolución master': RES_360 if '360' in des else 'Original'}, Formato=FMT_360 if '360' in des else 'JPG → WebP', Herramienta=her, Fase='2 · Apolo', Estado=est, Responsable=resp))
    return R


# Estimación del resto del conjunto (Pricing v.07; variantes por planta y superficie,
# método que en Apolo da 71 frente a las 72 reales).
RESTO = [
    # edificio, num, viviendas, variantes, 360 int, terrazas
    ('Zeus', 2, 26, 18, 71, 5),
    ('Atenea', 3, 30, 11, 43, 8),
    ('Hera', 4, 22, 15, 60, 5),
    ('Hermes', 5, 63, 12, 46, 14),
]
SIGLA = {'Zeus': 'ZE', 'Atenea': 'AT', 'Hera': 'HE', 'Hermes': 'HM'}


def filas_resto():
    R = []
    F = '3 · Conjunto'
    for nom, num, nviv, nvar, n360, nter in RESTO:
        s = SIGLA[nom]
        R += [
            fila(Código=f'SER-{s}-MOD-01', Tipo='MOD', Descripción=f'{nom}: modelo 3D (envolvente LOD 300 + distribución interior y mobiliario) a partir del BIM del estudio o de los PDF de anteproyecto', Edificio=nom, Herramienta='SketchUp + Ruby', **{'Depende de': 'Modelo BIM o planos del cliente'}, Fase=F, Estado='Bloqueada (falta material)', Responsable='Pendiente de asignar', Notas='Sin modelo no hay ninguna pieza de este edificio.'),
            fila(Código=f'SER-{s}-EXT-01', Tipo='EXT', Descripción=f'{nom} en primer plano (cámara fija), con la chincheta de otro edificio al fondo', Edificio=nom, Cámara=f'{s}-C01', **{'Resolución master': RES_EXT}, Formato=FMT_EXT, Herramienta='D5 Render Pro', **{'Depende de': f'SER-{s}-MOD-01'}, Fase=F, Responsable='Artista 3D (D5)'),
            fila(Código=f'SER-{s}-MSK-01', Tipo='MSK', Descripción=f'{nom}: máscara de plantas', Edificio=nom, Cámara=f'{s}-C01', **{'Resolución master': RES_EXT}, Formato=FMT_MSK, Herramienta='Script GLB/three.js', **{'Depende de': f'SER-{s}-EXT-01'}, Fase=F, Responsable='Claude'),
            fila(Código=f'SER-{s}-VID-01', Tipo='VID', Descripción=f'Transición conjunto → {nom}', Edificio=nom, Cámara=f'CJ-C01 → {s}-C01', **{'Resolución master': '3840×2160, 25 fps'}, Formato=FMT_VID, Herramienta='D5 Render Pro (vídeo)', **{'Depende de': f'SER-CJ-EXT-01, SER-{s}-EXT-01'}, Fase=F, Responsable='Artista 3D (D5)'),
            fila(Código=f'SER-{s}-VID-02', Tipo='VID', Descripción=f'Transición {nom} → conjunto (inversa)', Edificio=nom, **{'Resolución master': '3840×2160, 25 fps'}, Formato=FMT_VID, Herramienta='ffmpeg', **{'Depende de': f'SER-{s}-VID-01'}, Fase=F, Responsable='Claude'),
            fila(Código=f'SER-{s}-PLA', Tipo='PLA', Descripción=f'{nom}: renders de planta (P1, P2 = P3, Ático) × 2 pases', Edificio=nom, Cámara='Ortográfica cenital', **{'Resolución master': RES_PLA}, Formato=FMT_EXT, Herramienta='D5 Render Pro', **{'Depende de': f'SER-{s}-MOD-01'}, Fase=F, Responsable='Artista 3D (D5)', Cantidad=6, Notas='Estimación: 3 plantas únicas × 2 pases; teselas según huella.'),
            fila(Código=f'SER-{s}-MSK-PL', Tipo='MSK', Descripción=f'{nom}: polígonos de viviendas por planta', Edificio=nom, Formato=FMT_MSK, Herramienta='Script GLB/three.js', **{'Depende de': f'SER-{s}-MOD-01'}, Fase=F, Responsable='Claude', Cantidad=4),
            fila(Código=f'SER-{s}-CEN', Tipo='CEN', Descripción=f'{nom}: cenitales de vivienda (recorte)', Edificio=nom, Formato='PNG → WebP/AVIF', Herramienta='Script Python', **{'Depende de': f'SER-{s}-PLA'}, Fase=F, Responsable='Claude', Cantidad=nviv),
            fila(Código=f'SER-{s}-HOT', Tipo='HOT', Descripción=f'{nom}: hotspots y enlaces por variante (estimado)', Edificio=nom, Formato='JSON', Herramienta='Script Python', **{'Depende de': f'SER-{s}-MOD-01'}, Fase=F, Responsable='Claude', Cantidad=nvar),
            fila(Código=f'SER-{s}-360', Tipo='360', Descripción=f'{nom}: 360 interiores por tipología, nivel y estancia (estimado)', Edificio=nom, Cámara=CAM360, **{'Resolución master': RES_360}, Formato=FMT_360, Herramienta='D5 Render Pro', **{'Depende de': f'SER-{s}-MOD-01'}, Fase=F, Responsable='Artista 3D (D5)', Cantidad=n360, Notas='Estimado con el Pricing v.07; recontar con las fichas reales.'),
            fila(Código=f'SER-{s}-36T', Tipo='36T', Descripción=f'{nom}: 360 de terrazas de ático (estimado)', Edificio=nom, Cámara='360 a 1,50 m', **{'Resolución master': RES_360}, Formato=FMT_360, Herramienta='D5 Render Pro', **{'Depende de': f'SER-{s}-MOD-01'}, Fase=F, Responsable='Artista 3D (D5)', Cantidad=nter),
            fila(Código=f'SER-{s}-ZC', Tipo='ZC', Descripción=f'{nom}: portal y espacio exterior (360)', Edificio=nom, Cámara=CAM360, **{'Resolución master': RES_360}, Formato=FMT_360, Herramienta='D5 Render Pro', **{'Depende de': f'SER-{s}-MOD-01'}, Fase=F, Responsable='Artista 3D (D5)', Cantidad=2),
        ]
    R += [
        fila(Código='SER-CJ-EXT-01', Tipo='EXT', Descripción='Aérea definitiva del conjunto (cinco edificios modelados), tarde dorada', Edificio='Conjunto', Cámara='CJ-C01', **{'Resolución master': RES_EXT}, Formato=FMT_EXT, Herramienta='D5 Render Pro', **{'Depende de': 'SER-ZE/AT/HE/HM-MOD-01'}, Fase=F, Responsable='Artista 3D (D5)'),
        fila(Código='SER-CJ-MSK-01', Tipo='MSK', Descripción='Máscara definitiva de los cinco edificios', Edificio='Conjunto', Cámara='CJ-C01', **{'Resolución master': RES_EXT}, Formato=FMT_MSK, Herramienta='Script GLB/three.js', **{'Depende de': 'SER-CJ-EXT-01'}, Fase=F, Responsable='Claude'),
        fila(Código='SER-CJ-EXT-02', Tipo='EXT', Descripción='Portada opcional: conjunto en hora azul (sin máscaras; solo imagen de entrada)', Edificio='Conjunto', Cámara='CJ-C01', **{'Resolución master': RES_EXT}, Formato=FMT_EXT, Herramienta='D5 Render Pro', **{'Depende de': 'SER-CJ-EXT-01'}, Fase=F, Responsable='Artista 3D (D5)', Notas='Opcional. No duplicar vídeos ni plantas por hora del día.'),
        fila(Código='SER-AP-VID-01b', Tipo='VID', Descripción='Rehacer la transición conjunto → Apolo con la aérea definitiva', Edificio='Apolo', **{'Resolución master': '3840×2160, 25 fps'}, Formato=FMT_VID, Herramienta='D5 Render Pro (vídeo)', **{'Depende de': 'SER-CJ-EXT-01'}, Fase=F, Responsable='Artista 3D (D5)'),
    ]
    return R


def escribir(apolo, resto, ruta):
    wb = Workbook()
    arial = Font(name='Arial', size=10)
    arial_b = Font(name='Arial', size=10, bold=True)
    cab_font = Font(name='Arial', size=10, bold=True, color='FFFFFF')
    cab_fill = PatternFill('solid', fgColor='1F1F1F')
    gris = PatternFill('solid', fgColor='F2F2F2')
    piloto_fill = PatternFill('solid', fgColor='EAF1EA')
    fina = Side(style='thin', color='D0D0D0')
    borde = Border(left=fina, right=fina, top=fina, bottom=fina)
    ajuste = Alignment(vertical='top', wrap_text=True)

    # Léeme
    ws = wb.active
    ws.title = 'Léeme'
    textos = [
        ('SERENEA · Control de producción de imágenes del showroom · v1 (18.11.26)', arial_b),
        ('', arial),
        ('Una fila por pieza. Las reglas, cámaras, resoluciones y nomenclatura están en nuevo/docs/PRODUCCION_IMAGENES.md.', arial),
        ('Hoja «Piezas Apolo»: recuento real a partir de las 166 fichas y las 43 tipologías (nuevo/data/tipologias.json).', arial),
        ('Hoja «Resto del conjunto»: estimación por edificio (columna Cantidad) a partir del Pricing v.07; se desglosará cuando lleguen los modelos.', arial),
        ('Hoja «Resumen»: recuentos por tipo, fase y estado; se actualiza sola con fórmulas.', arial),
        ('', arial),
        ('Cómo usarla', arial_b),
        ('· Cambiar solo Estado, Responsable, Fecha objetivo y Notas. El código no se cambia: es el nombre del fichero.', arial),
        ('· Estado «Reutilizar existente» = pieza que ya existe (Memorable) y solo hay que adaptar.', arial),
        ('· Fondo verde claro = pieza del piloto: planta 2 de Apolo completa (render y 46 cenitales) y las tipologías 2D-08 y 1D-01 enteras (todas sus plantas y estancias).', arial),
        ('· Cantidad > 1 = la fila agrupa varias imágenes (teselas o estimaciones).', arial),
        ('', arial),
        ('Fases y fechas objetivo', arial_b),
        (f'0 · Preparación: {F0:%d/%m/%Y}   ·   1 · Piloto: {F1:%d/%m/%Y}   ·   Validación del piloto: {FV:%d/%m/%Y}', arial),
        (f'2 · Apolo completo: {F2:%d/%m/%Y}   ·   3 · Conjunto y demás edificios: {F3:%d/%m/%Y} (si los modelos llegan antes del 15/01/2027)', arial),
        ('', arial),
        ('Leyenda obligatoria en la web: «Imágenes orientativas, no contractuales. Mobiliario y cocina no incluidos salvo indicación en la memoria de calidades.»', arial),
    ]
    for i, (t, f) in enumerate(textos, 1):
        c = ws.cell(row=i, column=1, value=t)
        c.font = f
    ws.column_dimensions['A'].width = 140

    def hoja(nombre, filas):
        h = wb.create_sheet(nombre)
        for j, col in enumerate(COLS, 1):
            c = h.cell(row=1, column=j, value=col)
            c.font = cab_font
            c.fill = cab_fill
            c.alignment = Alignment(vertical='center', wrap_text=True)
            c.border = borde
            h.column_dimensions[get_column_letter(j)].width = ANCHOS[j - 1]
        for i, r in enumerate(filas, 2):
            for j, col in enumerate(COLS, 1):
                v = r[col]
                c = h.cell(row=i, column=j, value=v)
                c.font = arial
                c.alignment = ajuste
                c.border = borde
                if col == 'Fecha objetivo' and isinstance(v, dt.date):
                    c.number_format = 'DD/MM/YYYY'
                if col == 'Cantidad':
                    c.number_format = '0'
                if r['Fase'] == '1 · Piloto':
                    c.fill = piloto_fill
        h.freeze_panes = 'C2'
        h.auto_filter.ref = f'A1:{get_column_letter(len(COLS))}{len(filas) + 1}'
        h.row_dimensions[1].height = 30
        h.page_setup.orientation = 'landscape'
        h.page_setup.paperSize = h.PAPERSIZE_A3
        h.sheet_properties.pageSetUpPr.fitToPage = True
        h.page_setup.fitToWidth = 1
        h.page_setup.fitToHeight = 0
        h.print_title_rows = '1:1'
        n = len(filas) + 1
        for col, lista in (('Estado', 'Listas!$A$2:$A${}'.format(len(ESTADOS) + 1)),
                           ('Responsable', 'Listas!$B$2:$B${}'.format(len(RESPONSABLES) + 1)),
                           ('Herramienta', 'Listas!$C$2:$C${}'.format(len(HERRAMIENTAS) + 1))):
            j = COLS.index(col) + 1
            dv = DataValidation(type='list', formula1=lista, allow_blank=True)
            dv.error = 'Elige un valor de la lista (hoja Listas).'
            dv.errorTitle = 'Valor no válido'
            h.add_data_validation(dv)
            dv.add(f'{get_column_letter(j)}2:{get_column_letter(j)}{n}')
        j = COLS.index('Fecha objetivo') + 1
        dvf = DataValidation(type='date', operator='between', formula1='DATE(2026,11,1)', formula2='DATE(2028,12,31)', allow_blank=True)
        dvf.error = 'Fecha entre 01/11/2026 y 31/12/2028.'
        h.add_data_validation(dvf)
        dvf.add(f'{get_column_letter(j)}2:{get_column_letter(j)}{n}')
        return h

    hoja('Piezas Apolo', apolo)
    hoja('Resto del conjunto', resto)

    # Resumen con fórmulas
    rs = wb.create_sheet('Resumen')
    rs.column_dimensions['A'].width = 34
    for col in 'BCDEFG':
        rs.column_dimensions[col].width = 16
    hdr = ['Tipo', 'Filas Apolo', 'Imágenes Apolo', 'Piloto (filas)', 'Aprobadas Apolo', 'Imágenes resto (estim.)', 'Total imágenes']
    for j, t in enumerate(hdr, 1):
        c = rs.cell(row=1, column=j, value=t)
        c.font = cab_font
        c.fill = cab_fill
        c.border = borde
        c.alignment = Alignment(wrap_text=True, vertical='center')
    nA = len(apolo) + 1
    nR = len(resto) + 1
    for i, tipo in enumerate(TIPOS.values(), 2):
        rs.cell(row=i, column=1, value=tipo)
        rs.cell(row=i, column=2, value=f"=COUNTIF('Piezas Apolo'!$B$2:$B${nA},A{i})")
        rs.cell(row=i, column=3, value=f"=SUMIF('Piezas Apolo'!$B$2:$B${nA},A{i},'Piezas Apolo'!$Q$2:$Q${nA})")
        rs.cell(row=i, column=4, value=f"=COUNTIFS('Piezas Apolo'!$B$2:$B${nA},A{i},'Piezas Apolo'!$M$2:$M${nA},\"1 · Piloto\")")
        rs.cell(row=i, column=5, value=f"=COUNTIFS('Piezas Apolo'!$B$2:$B${nA},A{i},'Piezas Apolo'!$N$2:$N${nA},\"Aprobada\")")
        rs.cell(row=i, column=6, value=f"=SUMIF('Resto del conjunto'!$B$2:$B${nR},A{i},'Resto del conjunto'!$Q$2:$Q${nR})")
        rs.cell(row=i, column=7, value=f'=C{i}+F{i}')
    tot = len(TIPOS) + 2
    rs.cell(row=tot, column=1, value='Total')
    for j in range(2, 8):
        L = get_column_letter(j)
        rs.cell(row=tot, column=j, value=f'=SUM({L}2:{L}{tot - 1})')
    for row in rs.iter_rows(min_row=2, max_row=tot, max_col=7):
        for c in row:
            c.font = arial_b if c.row == tot else arial
            c.border = borde
            if c.row == tot:
                c.fill = gris
    rs.cell(row=tot + 2, column=1, value='Imágenes = suma de la columna Cantidad (teselas y estimaciones incluidas).').font = arial
    rs.freeze_panes = 'A2'

    # Listas
    ls = wb.create_sheet('Listas')
    for j, (t, vals) in enumerate((('Estado', ESTADOS), ('Responsable', RESPONSABLES), ('Herramienta', HERRAMIENTAS)), 1):
        c = ls.cell(row=1, column=j, value=t)
        c.font = cab_font
        c.fill = cab_fill
        ls.column_dimensions[get_column_letter(j)].width = 30
        for i, v in enumerate(vals, 2):
            ls.cell(row=i, column=j, value=v).font = arial
    ls.protection.sheet = True

    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    wb.save(ruta)


def resumen(apolo, resto):
    def agrega(filas):
        c = Counter()
        for r in filas:
            c[r['Tipo']] += r['Cantidad']
        return dict(c)
    pil = Counter(r['Tipo'] for r in apolo if r['Fase'] == '1 · Piloto')
    return {
        'filasApolo': len(apolo), 'filasResto': len(resto),
        'imagenesApolo': agrega(apolo), 'imagenesResto': agrega(resto),
        'filasPilotoPorTipo': dict(pil),
        'filasApoloPorTipo': dict(Counter(r['Tipo'] for r in apolo)),
    }


def main():
    tip, viv = cargar()
    apolo = filas_apolo(tip, viv)
    resto = filas_resto()
    codigos = [r['Código'] for r in apolo + resto]
    dup = [c for c, n in Counter(codigos).items() if n > 1]
    if dup:
        sys.exit('Códigos duplicados: ' + ', '.join(dup[:10]))
    escribir(apolo, resto, SALIDA)
    res = resumen(apolo, resto)
    if '--resumen' in sys.argv:
        ruta = sys.argv[sys.argv.index('--resumen') + 1]
        json.dump(res, open(ruta, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False, indent=1))
    print('Escrito', SALIDA)


if __name__ == '__main__':
    main()
