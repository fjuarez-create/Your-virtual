"""Genera el PDF de la especificación de entrega del BIM a partir del markdown.

    python3 tools/spec_pdf.py docs/ENTREGA_BIM.md docs/ENTREGA_BIM.pdf

Se hace a medida en vez de con un conversor genérico porque el documento sale
de UNIK hacia un tercero: interesa que respire, que las tablas y los nombres de
objeto se lean sin ambigüedad y que el aspecto acompañe.
"""
import re
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, HRFlowable, KeepTogether,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

TINTA = colors.HexColor('#111112')
SUAVE = colors.HexColor('#5b6066')
LINEA = colors.HexColor('#d9d9d5')
FONDO = colors.HexColor('#f4f4f1')

BASE = dict(fontName='Helvetica', textColor=TINTA)
S = {
    'titulo': ParagraphStyle('titulo', **BASE, fontSize=23, leading=27, spaceAfter=5),
    'sub': ParagraphStyle('sub', fontName='Helvetica', fontSize=10.5, leading=15,
                          textColor=SUAVE, spaceAfter=20),
    'h2': ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=13, leading=17,
                         textColor=TINTA, spaceBefore=19, spaceAfter=7),
    'p': ParagraphStyle('p', **BASE, fontSize=9.9, leading=15.2, alignment=TA_JUSTIFY, spaceAfter=8),
    'li': ParagraphStyle('li', **BASE, fontSize=9.9, leading=15.2, leftIndent=13, bulletIndent=3,
                         alignment=TA_JUSTIFY, spaceAfter=4.5),
    'code': ParagraphStyle('code', fontName='Courier-Bold', fontSize=10, leading=15,
                           textColor=TINTA, leftIndent=10, spaceBefore=3, spaceAfter=9),
    'celda': ParagraphStyle('celda', **BASE, fontSize=9.3, leading=13.4),
}
S['titulo'].fontName = 'Helvetica-Bold'


def inline(t):
    """Marcado en línea del markdown → etiquetas de reportlab."""
    t = t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'\*(.+?)\*', r'<i>\1</i>', t)
    t = re.sub(r'`(.+?)`', r'<font face="Courier-Bold">\1</font>', t)
    return t


def construir(md):
    """Recorre el markdown y devuelve la lista de elementos del documento."""
    flujo = []
    lineas = md.split('\n')
    i = 0
    parrafo = []

    def cerrar():
        if parrafo:
            flujo.append(Paragraph(inline(' '.join(parrafo)), S['p']))
            parrafo.clear()

    while i < len(lineas):
        ln = lineas[i]

        if ln.startswith('# '):
            cerrar()
            flujo.append(Paragraph(inline(ln[2:]), S['titulo']))
            flujo.append(HRFlowable(width='100%', thickness=2, color=TINTA,
                                    spaceBefore=6, spaceAfter=12))
        elif ln.startswith('## '):
            cerrar()
            flujo.append(Paragraph(inline(ln[3:]), S['h2']))
            flujo.append(HRFlowable(width='100%', thickness=0.6, color=LINEA,
                                    spaceBefore=1, spaceAfter=9))
        elif ln.startswith('```'):
            cerrar()
            i += 1
            bloque = []
            while i < len(lineas) and not lineas[i].startswith('```'):
                bloque.append(lineas[i])
                i += 1
            flujo.append(Paragraph('<br/>'.join(inline(b) for b in bloque), S['code']))
        elif ln.startswith('|'):
            cerrar()
            filas = []
            while i < len(lineas) and lineas[i].startswith('|'):
                celdas = [c.strip() for c in lineas[i].strip('|').split('|')]
                if not all(set(c) <= set('-: ') for c in celdas):
                    filas.append(celdas)
                i += 1
            i -= 1
            datos = [[Paragraph(inline(c), S['celda']) for c in f] for f in filas]
            t = Table(datos, colWidths=[32 * mm, 105 * mm], hAlign='LEFT')
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), FONDO),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, LINEA),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 7),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ]))
            flujo.append(Spacer(1, 3))
            flujo.append(t)
            flujo.append(Spacer(1, 9))
        elif re.match(r'^\s*[-*] ', ln):
            cerrar()
            texto = re.sub(r'^\s*[-*] ', '', ln)
            while i + 1 < len(lineas) and re.match(r'^\s{2,}\S', lineas[i + 1]):
                i += 1
                texto += ' ' + lineas[i].strip()
            flujo.append(Paragraph(inline(texto), S['li'], bulletText='—'))
        elif re.match(r'^\s*\d+\. ', ln):
            cerrar()
            n, texto = re.match(r'^\s*(\d+)\. (.*)$', ln).groups()
            flujo.append(Paragraph(inline(texto), S['li'], bulletText=f'{n}.'))
        elif ln.strip() == '':
            cerrar()
        else:
            parrafo.append(ln.strip())
        i += 1

    cerrar()
    return flujo


def pie(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.6)
    canvas.setFillColor(SUAVE)
    canvas.drawString(20 * mm, 12 * mm, 'UNIK · SERENEA — Edificio Apolo')
    canvas.drawRightString(190 * mm, 12 * mm, str(doc.page))
    canvas.setStrokeColor(LINEA)
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, 16 * mm, 190 * mm, 16 * mm)
    canvas.restoreState()


def main(entrada, salida):
    md = open(entrada, encoding='utf-8').read()
    # El subtítulo va aparte para poder darle su propio estilo.
    md = md.replace('Documento para pasar al equipo de arquitectura antes de exportar el modelo\n'
                    'definitivo (edificio y entorno).', '')
    doc = BaseDocTemplate(salida, pagesize=A4,
                          leftMargin=20 * mm, rightMargin=20 * mm,
                          topMargin=18 * mm, bottomMargin=22 * mm,
                          title='Entrega del BIM — Edificio Apolo',
                          author='UNIK')
    marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='n')
    doc.addPageTemplates([PageTemplate(id='p', frames=[marco], onPage=pie)])

    flujo = construir(md)
    # subtítulo justo tras el título y su filete
    flujo.insert(2, Paragraph(
        'Especificaciones para exportar el modelo definitivo (edificio y entorno) '
        'destinado al showroom virtual.', S['sub']))
    doc.build(flujo)
    print('PDF generado:', salida)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
