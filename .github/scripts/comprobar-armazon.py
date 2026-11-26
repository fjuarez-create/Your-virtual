#!/usr/bin/env python3
"""Comprueba que el service worker guarda TODO el código de la app.

Por qué existe esto: sw.js lleva a mano la lista de ficheros que se
guardan para funcionar sin cobertura. Si un módulo nuevo no entra en esa
lista, pasan dos cosas y las dos son malas:

  · Sin cobertura, la pantalla que lo use no abre.
  · Y con cobertura es peor: el módulo se pide a la red, o sea al último
    despliegue, mientras el resto de la sesión va con la versión que
    tenga guardada el móvil. Media aplicación de cada. Eso es justo lo
    que reventó el 20 de agosto de 2026 al entrar en Tareas.

La lista se quedó corta una vez —frases.js, mensajes.js,
ajustesLocales.js y ejemplos.js— y se quedará corta otra vez, porque se
escribe a mano. Esto lo cuenta antes de subir nada.

    python3 .github/scripts/comprobar-armazon.py [carpeta]
"""
import pathlib
import re
import sys

RAIZ = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'repasos')
ENTRADA = 'js/app.js'

# import … from 'x'  ·  import('x')  ·  export … from 'x'
IMPORTA = re.compile(r"""(?:\bfrom|\bimport)\s*\(?\s*['"](\.[^'"]+)['"]""")


def lista_del_armazon(sw):
    """Lo que el service worker guarda: el código y lo demás."""
    guardados = set()
    for nombre in ('CODIGO', 'EXTRAS'):
        dentro = re.search(r'const %s = \[(.*?)\n\];' % nombre, sw, re.S)
        if not dentro:
            print(f'No encuentro la lista {nombre} en sw.js', file=sys.stderr)
            sys.exit(2)
        guardados |= set(re.findall(r"'([^']+)'", dentro.group(1)))
    return guardados


def alcanzables(entrada):
    """Todos los módulos a los que se llega desde app.js, directa o no."""
    vistos = set()
    por_ver = [entrada]
    while por_ver:
        actual = por_ver.pop()
        if actual in vistos:
            continue
        vistos.add(actual)
        fichero = RAIZ / actual
        if not fichero.is_file():
            print(f'  ¡ojo! {actual} se importa y no existe')
            continue
        for destino in IMPORTA.findall(fichero.read_text(encoding='utf-8')):
            ruta = (pathlib.PurePosixPath(actual).parent / destino).as_posix()
            # Normaliza los «..» sin tocar el disco.
            partes = []
            for p in ruta.split('/'):
                if p == '..':
                    if partes:
                        partes.pop()
                elif p not in ('.', ''):
                    partes.append(p)
            por_ver.append('/'.join(partes))
    return vistos


def main():
    sw = (RAIZ / 'sw.js').read_text(encoding='utf-8')
    guardados = lista_del_armazon(sw)
    modulos = alcanzables(ENTRADA)

    faltan = sorted(m for m in modulos if m not in guardados)
    sobran = sorted(g for g in guardados
                    if g.startswith('js/') and g.endswith('.js') and g not in modulos)

    print(f'{len(modulos)} módulos alcanzables desde {ENTRADA}')
    for s in sobran:
        print(f'  sobra (ya no se usa): {s}')
    if faltan:
        print('')
        print('FALTAN EN LA LISTA DEL SERVICE WORKER:')
        for f in faltan:
            print(f'  - {f}')
        print('')
        print('Añádelos a ARMAZON en repasos/sw.js. Sin eso, esas pantallas')
        print('no abren sin cobertura y, con cobertura, pueden mezclar una')
        print('versión con otra a mitad de sesión.')
        sys.exit(1)
    print('Todo el código de la app está guardado. Bien.')


if __name__ == '__main__':
    main()
