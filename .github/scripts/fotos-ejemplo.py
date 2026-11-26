#!/usr/bin/env python3
"""Busca en Wikimedia Commons una foto para cada repaso de muestra.

Esta máquina no es este ordenador: se ejecuta en el robot de GitHub,
que sí tiene salida a internet abierta. Deja las fotos en
repasos/assets/ejemplos/ y un fichero de créditos al lado, porque casi
todo lo que hay en Commons pide citar al autor y la licencia.

No sube nada a la aplicación: solo deja los ficheros en una rama
aparte para poder mirarlos uno a uno antes de que los vea nadie.

    python3 .github/scripts/fotos-ejemplo.py
"""
import io
import json
import os
import time
import urllib.parse
import urllib.request

API = 'https://commons.wikimedia.org/w/api.php'
AGENTE = 'UNIK-Works-fotos-ejemplo/1.0 (https://repasos.unikdi.com; info@unikdi.com)'
DESTINO = 'repasos/assets/ejemplos'

# Licencias que se admiten. Todas obligan a citar salvo las dos
# primeras, y citar se cita igual: el fichero de créditos las lleva
# todas con su autor y su enlace.
LICENCIAS = ('cc0', 'public domain', 'pd', 'cc by', 'cc by-sa')

# Qué se busca para cada repaso. En inglés porque Commons está
# catalogado en inglés y en español apenas hay nada de esto.
BUSQUEDAS = [
    ('rodapie-despegado', 'skirting board interior wall'),
    ('junta-alicatado', 'bathroom tile grout joint'),
    ('corredera-roza', 'sliding aluminium patio door'),
    ('gotele-techo', 'textured ceiling paint roller'),
    ('enchufe-suelto', 'electrical wall socket outlet'),
    ('monomando-gotea', 'kitchen mixer tap faucet'),
    ('cajon-cocina', 'kitchen drawer cabinet'),
    ('desconchon-revoco', 'peeling render facade wall'),
    ('tope-puerta', 'door stopper rubber'),
    ('rejilla-ventilacion', 'ventilation grille wall'),
    ('baldosa-levantada', 'ceramic floor tile'),
    ('silicona-ducha', 'shower tray silicone sealant'),
    ('barandilla-holgura', 'stair railing handrail metal'),
    ('vidrio-rayado', 'glass balustrade terrace'),
    ('videoportero', 'video door entry intercom'),
    ('pulsador-reves', 'light switch wall'),
    ('manchas-yeso', 'plaster construction site floor'),
    ('remate-antepecho', 'aluminium window sill'),
    ('puerta-armario', 'wardrobe door interior'),
    ('fuga-desague', 'drain pipe siphon leak'),
    ('foco-parpadea', 'ceiling downlight lamp'),
    ('junta-dilatacion', 'expansion joint concrete floor'),
    ('cinta-pladur', 'drywall joint tape ceiling'),
    ('rejuntado-cocina', 'kitchen wall tiles grout'),
    ('grifo-jardin', 'garden water tap outdoor'),
    ('riego-goteros', 'drip irrigation hedge garden'),
    ('vierteaguas', 'window sill drip stone'),
    ('puerta-roza', 'front door frame house'),
    ('luz-cubierta', 'roof terrace outdoor light'),
    ('canto-escalon', 'staircase tread step edge'),
    ('encimera-golpe', 'kitchen countertop worktop'),
    ('bomba-piscina', 'swimming pool pump equipment'),
    ('paso-instalaciones', 'pipe penetration wall sealing'),
    ('persiana-torcida', 'roller shutter window blind'),
    ('humedad-techo', 'damp stain ceiling mould'),
    ('termo-sin-fijar', 'electric water heater wall'),
    ('zocalo-juntas', 'stone plinth garden wall'),
    ('corredera-vestidor', 'sliding wardrobe door bedroom'),
    ('sumidero-suelto', 'floor drain grate terrace'),
    ('pomo-flojo', 'cabinet knob handle furniture'),
]


def pedir(parametros):
    url = API + '?' + urllib.parse.urlencode(parametros)
    pet = urllib.request.Request(url, headers={'User-Agent': AGENTE})
    with urllib.request.urlopen(pet, timeout=30) as r:
        return json.load(r)


def bajar(url):
    pet = urllib.request.Request(url, headers={'User-Agent': AGENTE})
    with urllib.request.urlopen(pet, timeout=60) as r:
        return r.read()


def licencia_vale(meta):
    corta = (meta.get('LicenseShortName', {}).get('value') or '').lower()
    return any(l in corta for l in LICENCIAS), corta


def buscar(termino):
    """Devuelve (bytes, ficha) de la primera foto que sirva, o None."""
    datos = pedir({
        'action': 'query', 'format': 'json', 'formatversion': '2',
        'generator': 'search',
        'gsrsearch': f'filetype:bitmap {termino}',
        'gsrnamespace': '6', 'gsrlimit': '10',
        'prop': 'imageinfo',
        'iiprop': 'url|size|extmetadata|mime',
        'iiurlwidth': '1400',
    })
    for pagina in datos.get('query', {}).get('pages', []):
        info = (pagina.get('imageinfo') or [{}])[0]
        meta = info.get('extmetadata', {}) or {}
        if info.get('mime') not in ('image/jpeg', 'image/png'):
            continue
        if (info.get('width') or 0) < 900:
            continue
        vale, corta = licencia_vale(meta)
        if not vale:
            continue
        url = info.get('thumburl') or info.get('url')
        if not url:
            continue
        try:
            crudo = bajar(url)
        except Exception as e:                      # noqa: BLE001
            print(f'    no se pudo bajar: {e}')
            continue
        ficha = {
            'titulo': pagina.get('title', ''),
            'autor': (meta.get('Artist', {}).get('value') or '').replace('\n', ' '),
            'licencia': corta,
            'pagina': info.get('descriptionurl', ''),
        }
        return crudo, ficha
    return None


def main():
    from PIL import Image                            # el robot lo instala antes

    os.makedirs(DESTINO, exist_ok=True)
    creditos = []
    puestas = 0
    for slug, termino in BUSQUEDAS:
        print(f'· {slug}: {termino}')
        try:
            hallado = buscar(termino)
        except Exception as e:                       # noqa: BLE001
            print(f'    falló la búsqueda: {e}')
            hallado = None
        if not hallado:
            print('    sin resultado que valga')
            continue
        crudo, ficha = hallado
        try:
            im = Image.open(io.BytesIO(crudo)).convert('RGB')
        except Exception as e:                       # noqa: BLE001
            print(f'    no es una imagen legible: {e}')
            continue
        # Cuadrada y a 1200: es como se ven en la ficha de la tarea.
        lado = min(im.width, im.height)
        izq = (im.width - lado) // 2
        arr = (im.height - lado) // 2
        im = im.crop((izq, arr, izq + lado, arr + lado)).resize((1200, 1200), Image.LANCZOS)
        im.save(f'{DESTINO}/{slug}.jpg', quality=86)
        creditos.append(f"- `{slug}.jpg` — {ficha['titulo']} · {ficha['autor']} · "
                        f"{ficha['licencia']} · {ficha['pagina']}")
        puestas += 1
        print(f"    puesta ({ficha['licencia']})")
        time.sleep(0.4)                              # Commons agradece la pausa

    with open(f'{DESTINO}/CREDITOS.md', 'w', encoding='utf-8') as f:
        f.write('# De dónde salen estas fotos\n\n')
        f.write('Son fotos de muestra para las tareas de prueba, bajadas de\n')
        f.write('Wikimedia Commons. NO son fotos de Brassie: si algún día se\n')
        f.write('sustituyen por las de la obra, mejor.\n\n')
        f.write('\n'.join(creditos) + '\n')
    print(f'\n{puestas} fotos de {len(BUSQUEDAS)}')


if __name__ == '__main__':
    main()
