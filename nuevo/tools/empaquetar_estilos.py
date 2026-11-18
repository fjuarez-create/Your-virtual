#!/usr/bin/env python3
"""Empaqueta nuevo/estilos/ en un solo HTML autocontenido para publicarlo
como Artifact de claude.ai (imágenes, fuentes y JSON incrustados en base64).

La versión web (https://showroom.unikdi.com/nuevo/estilos/) es
nuevo/estilos/index.html + estilos.css + estilos.js + fuentes/ + img/ y lee
../data/serenea.json; este script no la toca (salvo --fuentes).

Uso, desde la raíz del repositorio:

    python3 nuevo/tools/empaquetar_estilos.py --salida /ruta/estilos-artifact.html
    python3 nuevo/tools/empaquetar_estilos.py --fuentes      # regenera fuentes/nhg-*.woff2

--fuentes necesita fontTools y brotli (pip install fonttools brotli). Las
fuentes Neue Haas Grotesk del repositorio son de prueba («Personal Use Only»):
sirven para previsualizar; antes de abrir el showroom hace falta licencia web.

El fichero de salida sigue el contrato de los Artifacts: sin <!doctype>,
<html>, <head> ni <body> propios (los pone la plataforma al publicar), con
<title> y <meta name="claude:viewport-fit-sides"> al principio y sin cargar
nada de fuera. Empieza por <meta charset="utf-8"> para que también se lea
bien abierto como fichero suelto (file://); al publicarlo no estorba.
"""
import argparse
import base64
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
EST = RAIZ / 'nuevo' / 'estilos'
FUENTES_ORIGEN = RAIZ / 'assets' / 'fonts'
LIMITE = 12 * 1024 * 1024

FUENTES_NHG = {
    'nhg-display-45.woff2': 'neuehaasgrotdisp-45light.ttf',
    'nhg-display-55.woff2': 'neuehaasgrotdisp-55roman.ttf',
    'nhg-display-65.woff2': 'neuehaasgrotdisp-65medium-trial.otf',
    'nhg-text-55.woff2': 'neuehaasgrottext-55roman-trial.otf',
    'nhg-text-65.woff2': 'neuehaasgrottext-65medium-trial.otf',
}
# Una sola versión de cada imagen (la grande); las -m apuntan a ella.
IMAGENES = [
    'img/conjunto.webp', 'img/edificio.webp', 'img/planta-2.webp',
    'img/vivienda-238-aislada.webp', 'img/panel-apolo.webp', 'img/estancia-salon.webp',
]
ALIAS = {
    'img/conjunto-m.webp': 'img/conjunto.webp',
    'img/edificio-m.webp': 'img/edificio.webp',
    'img/planta-2-m.webp': 'img/planta-2.webp',
    'img/vivienda-238-aislada-m.webp': 'img/vivienda-238-aislada.webp',
    'img/estancia-salon-m.webp': 'img/estancia-salon.webp',
}
# Ruta tal como la pide estilos.js -> fichero en disco
JSONS = {
    '../data/serenea.json': RAIZ / 'nuevo' / 'data' / 'serenea.json',
    'img/conjunto.json': EST / 'img' / 'conjunto.json',
    'img/edificio-plantas.json': EST / 'img' / 'edificio-plantas.json',
    'img/planta-2-viviendas.json': EST / 'img' / 'planta-2-viviendas.json',
    'img/vivienda-238.json': EST / 'img' / 'vivienda-238.json',
}
MIME = {'.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2'}


def convertir_fuentes():
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        sys.exit('Falta fontTools: pip install fonttools brotli')
    destino = EST / 'fuentes'
    destino.mkdir(exist_ok=True)
    for dst, src in FUENTES_NHG.items():
        f = TTFont(FUENTES_ORIGEN / src)
        f.flavor = 'woff2'
        f.save(destino / dst)
        print(f'  {src} -> fuentes/{dst} ({(destino / dst).stat().st_size:,} B)')


def data_uri(ruta: Path) -> str:
    mime = MIME[ruta.suffix.lower()]
    return f'data:{mime};base64,' + base64.b64encode(ruta.read_bytes()).decode('ascii')


def json_seguro(obj) -> str:
    """JSON compacto que se puede meter dentro de <script>."""
    t = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    return t.replace('</', '<\\/').replace('<!--', '<\\!--')


def empaquetar(salida: Path):
    html = (EST / 'index.html').read_text(encoding='utf-8')
    css = (EST / 'estilos.css').read_text(encoding='utf-8')
    js = (EST / 'estilos.js').read_text(encoding='utf-8')

    def fuente(m):
        ruta = EST / m.group(1)
        if not ruta.exists():
            sys.exit(f'Falta {ruta}: ejecuta antes con --fuentes')
        return f'url("{data_uri(ruta)}")'
    css = re.sub(r'url\("(fuentes/[^"]+\.woff2)"\)', fuente, css)

    titulo = re.search(r'<title>.*?</title>', html, re.S)
    cuerpo = re.search(r'<body[^>]*>(.*)</body>', html, re.S)
    if not titulo or not cuerpo:
        sys.exit('index.html sin <title> o sin <body>')
    cuerpo = re.sub(r'\s*<script src="estilos\.js"></script>\s*', '\n', cuerpo.group(1))

    activos = {}
    for ruta in IMAGENES:
        p = EST / ruta
        if not p.exists():
            sys.exit(f'Falta la imagen {p}')
        activos[ruta] = data_uri(p)
    datos = '\n'.join(
        f'<script type="application/json" data-ruta="{ruta}">{json_seguro(json.loads(p.read_text(encoding="utf-8")))}</script>'
        for ruta, p in JSONS.items())

    js = js.replace('</script', '<\\/script')
    salida_txt = (
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f'{titulo.group(0)}\n'
        '<meta name="claude:viewport-fit-sides" content="cover">\n'
        f'<style>\n{css}\n</style>\n'
        f'{cuerpo.strip()}\n'
        f'{datos}\n'
        f'<script>window.SERENEA_ACTIVOS={json_seguro(activos)};window.SERENEA_ALIAS={json_seguro(ALIAS)};</script>\n'
        f'<script>\n{js}\n</script>\n'
    )
    # Nada debe cargarse de fuera: ni src/href http(s) ni url(http...).
    externos = re.findall(r'(?:src|href)\s*=\s*"(https?:[^"]+)"|url\(\s*["\']?(https?:[^)"\']+)', salida_txt)
    externos = [a or b for a, b in externos]
    if externos:
        sys.exit(f'Recursos externos en la salida: {externos[:5]}')
    tam = len(salida_txt.encode('utf-8'))
    if tam > LIMITE:
        sys.exit(f'La salida pesa {tam / 1048576:.1f} MB (> 12 MB)')
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(salida_txt, encoding='utf-8')
    print(f'{salida} · {tam / 1048576:.2f} MB · {len(activos)} imágenes, {len(JSONS)} JSON, '
          f'{len(re.findall("font/woff2", css))} fuentes')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--salida', type=Path, help='HTML de un solo fichero que se escribe')
    ap.add_argument('--fuentes', action='store_true', help='regenera fuentes/nhg-*.woff2 desde assets/fonts')
    a = ap.parse_args()
    if not a.salida and not a.fuentes:
        ap.error('indica --salida, --fuentes o ambos')
    if a.fuentes:
        convertir_fuentes()
    if a.salida:
        empaquetar(a.salida)


if __name__ == '__main__':
    main()
