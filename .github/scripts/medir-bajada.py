#!/usr/bin/env python3
"""Mide la bajada de cambios de repasos.unikdi.com. No cambia nada.

Entra con la cuenta de revisión (la misma con la que el despliegue
comprueba que el revisor de Apple puede entrar) y hace lo que hace un
móvil que estrena la app: pide los cambios desde el principio, tanda a
tanda, hasta que el servidor dice que no queda más. Después vuelve a
pedir con la marca que le han dado, como en la sincronización siguiente.

Lo que deja escrito en el registro son SOLO números: cuántas tandas,
cuántas filas de cada tipo, cuánto pesa, y con qué forma viene la marca:

  · acabada en «Z»       → la bajada de siempre (por fecha del apunte);
  · acabada en «+00:00»  → la bajada por recepción, ya encendida.

Ni nombres, ni textos, ni la contraseña: esta sale de los secretos y va
al servidor sin pasar por ningún fichero ni por la línea de órdenes.
"""

import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("MEDIR_BASE", "https://repasos.unikdi.com/api/")
TABLAS = ["listas", "tareas", "comentarios", "medios", "mensajes", "lecturas", "entregas"]
# La app hace 25 tandas por sincronización. Aquí se sigue hasta el final,
# con un tope de cordura por si el servidor no dejara nunca de decir «más».
TOPE_TANDAS = 600

galletas = http.cookiejar.CookieJar()
abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(galletas))
abridor.addheaders = [("User-Agent", "medir-bajada")]


def pedir(ruta, cuerpo=None):
    """Una petición a la API. Devuelve (código, octetos, json o None)."""
    datos = None if cuerpo is None else json.dumps(cuerpo).encode("utf-8")
    peticion = urllib.request.Request(BASE + ruta, data=datos)
    if datos is not None:
        peticion.add_header("Content-Type", "application/json")
    try:
        with abridor.open(peticion, timeout=40) as respuesta:
            crudo = respuesta.read()
            codigo = respuesta.status
    except urllib.error.HTTPError as e:
        crudo = e.read()
        codigo = e.code
    except Exception as e:  # sin red, corte, certificado…
        return 0, 0, {"error": type(e).__name__}
    try:
        return codigo, len(crudo), json.loads(crudo)
    except Exception:
        return codigo, len(crudo), None


def forma(marca):
    if not marca:
        return "vacía"
    if marca.endswith("+00:00"):
        return "«+00:00» (bajada por recepción, encendida)"
    if marca.endswith("Z"):
        return "«Z» (bajada de siempre)"
    return "otra (%d caracteres)" % len(marca)


def bajar(desde):
    """Baja por tandas desde esa marca. Devuelve el resumen de la bajada."""
    vistas = {t: set() for t in TABLAS}
    filas = {t: 0 for t in TABLAS}
    tandas = octetos = sin_avanzar = 0
    personas = 0
    lenta = 0.0
    marca = desde
    completa = False
    motivo = ""
    while tandas < TOPE_TANDAS:
        antes = time.monotonic()
        codigo, peso, r = pedir("cambios?desde=" + urllib.parse.quote(marca, safe=""))
        lenta = max(lenta, time.monotonic() - antes)
        if codigo != 200 or not isinstance(r, dict):
            motivo = "el servidor contesta %s en la tanda %d" % (codigo or "sin red", tandas + 1)
            break
        tandas += 1
        octetos += peso
        personas = max(personas, len(r.get("personas") or []))
        for t in TABLAS:
            for fila in r.get(t) or []:
                filas[t] += 1
                vistas[t].add(fila.get("id"))
        nueva = r.get("ahora") or ""
        if not r.get("mas"):
            marca = nueva or marca
            completa = True
            break
        if nueva == marca:
            # La app corta aquí sin dar la bajada por completa y sigue en
            # la sincronización siguiente. Se le da un respiro y se insiste.
            sin_avanzar += 1
            if sin_avanzar >= 5:
                motivo = "el servidor dice «más» cinco veces seguidas sin mover la marca"
                break
            time.sleep(2)
            continue
        sin_avanzar = 0
        marca = nueva
    else:
        motivo = "no acaba en %d tandas" % TOPE_TANDAS
    return {
        "tandas": tandas, "octetos": octetos, "lenta": lenta, "marca": marca,
        "completa": completa, "motivo": motivo, "personas": personas,
        "filas": filas, "distintas": {t: len(vistas[t]) for t in TABLAS},
    }


def contar(b):
    total = sum(b["distintas"].values())
    return total, ", ".join("%s %d" % (t, b["distintas"][t]) for t in TABLAS)


def main():
    correo = os.environ.get("REVISION_EMAIL", "").strip()
    clave = os.environ.get("REVISION_PASSWORD", "")
    if not correo or not clave:
        print("::warning::Faltan los secretos de la cuenta de revisión: no se puede medir.")
        return 0

    codigo = 0
    for intento in (1, 2, 3):
        codigo, _, r = pedir("auth/login", {"email": correo, "password": clave})
        if codigo == 200:
            break
        print("Intento %d de entrar: el servidor contesta %s." % (intento, codigo or "sin red"))
        time.sleep(intento * 5)
    if codigo != 200:
        print("::error::No se puede entrar con la cuenta de revisión (%s)." % (codigo or "sin red"))
        return 1

    lineas = []

    # 0 · ¿Deja pasar el alojamiento una marca escrita con «+00:00»? La
    #     bajada por recepción manda la marca así, con el «+» codificado
    #     en la dirección (%2B00%3A00), y es la primera vez que la app
    #     manda un «+» en una dirección. Si algo delante de PHP lo
    #     cortara, ningún móvil con marca nueva podría bajar. El servidor
    #     de siempre ya entiende esa marca, así que se puede mirar ANTES
    #     de publicar nada: las dos formas de la misma hora tienen que
    #     contestar 200 con datos.
    hace_un_rato = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - 3600))
    codigo_z, _, r_z = pedir("cambios?desde=" + urllib.parse.quote(hace_un_rato + ".000Z", safe=""))
    codigo_mas, _, r_mas = pedir("cambios?desde=" + urllib.parse.quote(hace_un_rato + ".000+00:00", safe=""))
    pasa = codigo_mas == 200 and isinstance(r_mas, dict) and "ahora" in r_mas
    if pasa and codigo_z == 200:
        lineas.append("LA MARCA CON «+00:00» EN LA DIRECCIÓN: pasa (200 con datos, igual que con «Z»).")
    else:
        lineas.append("::error::La marca con «+00:00» en la dirección NO pasa: el servidor contesta %s (con «Z», %s)."
                      % (codigo_mas or "sin red", codigo_z or "sin red"))

    # 1 · Como un móvil que estrena la app: todo, desde el principio.
    todo = bajar("")
    total, reparto = contar(todo)
    lineas.append("BAJADA DE CERO: %d tandas, %d filas distintas (%s), %d personas en el directorio."
                  % (todo["tandas"], total, reparto, todo["personas"]))
    repetidas = sum(todo["filas"].values()) - total
    lineas.append("Pesa %.1f MB; %d filas viajaron más de una vez; la tanda más lenta, %.1f s."
                  % (todo["octetos"] / 1048576, repetidas, todo["lenta"]))
    lineas.append("La marca viene acabada en %s." % forma(todo["marca"]))
    if todo["completa"]:
        sincronizaciones = -(-todo["tandas"] // 25)
        lineas.append("Un móvil que tenga que bajarlo todo necesita %d sincronizaci%s (25 tandas cada una)."
                      % (sincronizaciones, "ón" if sincronizaciones == 1 else "ones"))
    else:
        lineas.append("::error::La bajada de cero NO acaba: %s." % todo["motivo"])

    # 2 · La sincronización siguiente: con la marca que nos han dado.
    siguiente = None
    if todo["completa"]:
        siguiente = bajar(todo["marca"])
        total2, _ = contar(siguiente)
        lineas.append("LA SIGUIENTE, con esa marca: %d tanda%s, %d filas, y %s."
                      % (siguiente["tandas"], "" if siguiente["tandas"] == 1 else "s", total2,
                         "queda al día" if siguiente["completa"] else "NO queda al día (" + siguiente["motivo"] + ")"))

    # 3 · Con la recepción encendida, una marca «de las de antes» tiene
    #     que traerlo todo otra vez (así rellena cada móvil sus huecos).
    if todo["completa"] and todo["marca"].endswith("+00:00"):
        vieja = bajar("2026-11-01T00:00:00.000Z")
        total3, _ = contar(vieja)
        lineas.append("CON UNA MARCA DE LAS DE ANTES: %d tandas y %d filas (tienen que ser todas: %d)."
                      % (vieja["tandas"], total3, total))
        if not vieja["completa"] or total3 < total:
            lineas.append("::error::Con una marca de las de antes no baja todo.")

    pedir("auth/logout", {})

    for linea in lineas:
        print(linea)
    resumen = os.environ.get("GITHUB_STEP_SUMMARY")
    if resumen:
        with open(resumen, "a", encoding="utf-8") as f:
            f.write("## La bajada de cambios, medida\n\n")
            for linea in lineas:
                f.write("- " + linea.replace("::error::", "**FALLO:** ") + "\n")

    mal = any(linea.startswith("::error::") for linea in lineas)
    if siguiente is not None and not siguiente["completa"]:
        print("::warning::La sincronización siguiente no queda al día a la primera.")
    return 1 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
