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

Y de la sesión, qué cookie pone la app de verdad y cuál el taller: solo
el nombre y el camino de cada una, nunca su valor.

Al final pregunta, con una sola lectura, si contesta el reconocimiento
de repasos pendientes de una vivienda: escribe el estado, el código de
error si lo hay y tres síes o noes. Nunca el texto del documento ni los
compradores, y esa línea no pone la medición en rojo.

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
# Desde cuándo se cuentan «los apuntes de después»: la hora (UTC) en que
# se encendió la bajada por recepción en producción. Se puede cambiar
# con MEDIR_DESPUES_DE para mirar otro tramo.
DESPUES_DE = os.environ.get("MEDIR_DESPUES_DE", "2026-11-11T12:14:00")
# El día de hoy (UTC = Canarias en invierno), para contar las listas creadas hoy.
HOY = time.strftime("%Y-%m-%d", time.gmtime())
# Las fases que pone la app; cualquier otra palabra se cuenta como «otra».
FASES_CONOCIDAS = ("pre", "post", "unica", "visita")

# El taller vive en el mismo dominio, en /taller. Solo se le pregunta
# qué cookie de sesión pone (ver «LA SESIÓN», abajo); no se entra en él.
BASE_TALLER = os.environ.get("MEDIR_BASE_TALLER", BASE.replace("/api/", "/taller/api/", 1))

# La vivienda por la que se pregunta si contesta el reconocimiento de
# repasos pendientes (ver mirar_reconocimiento). Viaja codificada en la
# dirección («brassie%3A22»), como la manda la app.
VIVIENDA = os.environ.get("MEDIR_VIVIENDA", "brassie:22")

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


def galleta_de_salir(base):
    """Qué cookie de sesión lleva esa API, SIN entrar: se le pide salir
    sin estar dentro y contesta borrando la suya. Devuelve una lista de
    (nombre, camino); el valor no se mira (es «deleted») ni se escribe.

    Va con un abridor aparte, sin las cookies de la medición: con ellas,
    pedir salir cerraría la sesión con la que se está midiendo."""
    peticion = urllib.request.Request(base + "auth/logout", data=b"{}")
    peticion.add_header("Content-Type", "application/json")
    peticion.add_header("User-Agent", "medir-bajada")
    suelto = urllib.request.build_opener()
    try:
        with suelto.open(peticion, timeout=40) as respuesta:
            crudas = respuesta.headers.get_all("Set-Cookie") or []
    except urllib.error.HTTPError as e:
        crudas = e.headers.get_all("Set-Cookie") or []
    except Exception:
        return None
    vistas = []
    for cruda in crudas:
        trozos = [x.strip() for x in cruda.split(";")]
        nombre = trozos[0].split("=", 1)[0]
        if not nombre.replace("_", "").isalnum():
            nombre = "(nombre raro)"
        camino = ""
        for trozo in trozos[1:]:
            if trozo.lower().startswith("path="):
                camino = trozo[5:]
        vistas.append((nombre, camino))
    return vistas


def de_sesion(vistas):
    """De esas cookies, las de la sesión de la app. El alojamiento puede
    poner alguna suya delante, y esa no se juzga."""
    return [par for par in (vistas or []) if par[0].startswith("repasos_sesion")]


def decir_galletas(vistas):
    if vistas is None:
        return "no contesta"
    if not vistas:
        return "no pone ninguna"
    return ", ".join("«%s» con camino «%s»" % par for par in vistas)


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
    despues = {t: set() for t in TABLAS}
    ultimo = ""
    tandas = octetos = sin_avanzar = 0
    personas = 0
    lenta = 0.0
    marca = desde
    completa = False
    motivo = ""
    muestra = None  # una foto, para mirar_ficheros(): la más reciente
    ficha = None    # las claves de una ficha de entrega, para saber qué versión las sirve
    hoy_listas = {}       # las listas creadas hoy: fase, vivienda, quién, borrada, hora
    fichas_con_postventa = set()  # fichas con algún dato de Postventa GUARDADO en el servidor
    fichas_con_fotovoltaica = set()  # de ellas, las que tienen guardado el quinto botón (esquema 24)
    conformes_con_datos = set()   # conformes (medios de tipo documento) con sus datos guardados
    repasos_por_lista = {}  # cuántos repasos distintos tiene cada lista
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
                # La fecha del apunte la pone el reloj de cada móvil; las
                # dos formas («Z» y «+00:00») empiezan igual, así que se
                # comparan los 19 primeros caracteres.
                cuando = str(fila.get("actualizado") or "")[:19]
                if cuando > ultimo:
                    ultimo = cuando
                if cuando >= DESPUES_DE:
                    despues[t].add(fila.get("id"))
                if t == "listas" and isinstance(fila, dict) and str(fila.get("creado") or "")[:10] == HOY:
                    hoy_listas[fila.get("id")] = (
                        str(fila.get("fase") or ""), str(fila.get("unidadId") or ""),
                        str(fila.get("creadoPor") or ""), bool(fila.get("borrada")),
                        str(fila.get("creado") or "")[11:13])
                if t == "tareas" and isinstance(fila, dict):
                    repasos_por_lista.setdefault(fila.get("listaId"), set()).add(fila.get("id"))
                if t == "entregas" and isinstance(fila, dict) and any(
                        str(fila.get(k) or "").strip() not in ("", "null", "None")
                        for k in ("posventa", "posventaHora", "piscina", "clima", "domotica", "fotovoltaica", "armarios")):
                    fichas_con_postventa.add(fila.get("id") or fila.get("unidadId"))
                if t == "entregas" and isinstance(fila, dict) and str(fila.get("fotovoltaica") or "").strip() not in ("", "null", "None"):
                    fichas_con_fotovoltaica.add(fila.get("id") or fila.get("unidadId"))
                if (t == "medios" and isinstance(fila, dict) and str(fila.get("tipo") or "") == "documento"
                        and fila.get("datos")):
                    conformes_con_datos.add(fila.get("id"))
                if t == "entregas" and ficha is None and isinstance(fila, dict):
                    ficha = sorted(fila.keys())
                if (t == "medios" and not fila.get("borrada")
                        and str(fila.get("mime") or "") in EXTENSIONES
                        and (muestra is None or cuando > str(muestra.get("actualizado") or "")[:19])):
                    muestra = fila
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
        "ultimo": ultimo, "despues": {t: len(despues[t]) for t in TABLAS},
        "muestra": muestra, "ficha": ficha,
        "hoy_listas": hoy_listas, "repasos_por_lista": repasos_por_lista,
        "fichas_con_postventa": len(fichas_con_postventa), "conformes_con_datos": len(conformes_con_datos),
        "fichas_con_fotovoltaica": len(fichas_con_fotovoltaica),
    }


def mirar_listas_de_hoy(b):
    """Cuántas listas se han creado hoy y cómo se reparten. El registro es
    público: solo números y las palabras de «fase», que son de la app.
    Ni nombres, ni identificadores, ni viviendas."""
    hoy = b.get("hoy_listas") or {}
    if not hoy:
        return "LISTAS CREADAS HOY (%s, por el reloj del móvil): ninguna." % HOY
    fases, por_vivienda_y_fase, por_persona, por_hora = {}, {}, {}, {}
    viviendas = set()
    borradas = sin_repasos = 0
    for ident, (fase, vivienda, persona, borrada, hora) in hoy.items():
        fase = fase if fase in FASES_CONOCIDAS else "otra"
        fases[fase] = fases.get(fase, 0) + 1
        clave = (vivienda, fase)
        por_vivienda_y_fase[clave] = por_vivienda_y_fase.get(clave, 0) + 1
        por_persona[persona] = por_persona.get(persona, 0) + 1
        por_hora[hora] = por_hora.get(hora, 0) + 1
        viviendas.add(vivienda)
        borradas += 1 if borrada else 0
        if not b["repasos_por_lista"].get(ident):
            sin_repasos += 1
    return ("LISTAS CREADAS HOY (%s, por el reloj del móvil): %d, de ellas %d borradas y %d sin ningún repaso"
            " · por fase: %s · en %d viviendas · por %d personas (la que más, %d)"
            " · la misma vivienda y fase, como mucho %d veces · por hora (UTC): %s."
            % (HOY, len(hoy), borradas, sin_repasos,
               ", ".join("%s %d" % (f, n) for f, n in sorted(fases.items())),
               len(viviendas), len(por_persona), max(por_persona.values()),
               max(por_vivienda_y_fase.values()),
               ", ".join("%sh %d" % (h or "?", n) for h, n in sorted(por_hora.items()))))


def contar(b):
    total = sum(b["distintas"].values())
    return total, ", ".join("%s %d" % (t, b["distintas"][t]) for t in TABLAS)


# Con qué extensión guarda el servidor cada tipo de foto (api/index.php).
EXTENSIONES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def mirar_ficheros(muestra):
    """Las fotos, por su dirección directa y SIN sesión. La carpeta de las
    fotos lleva un .htaccess que cierra el paso, y la app las sirve solo
    por la API, que mira la sesión; pero si delante de Apache hay un
    servidor que entrega los ficheros sin leer ese .htaccess, cualquiera
    que conozca la dirección los abre. Aquí se pide UNA foto de las dos
    maneras, sin cookie, y se escribe solo lo que contesta el servidor:
    ni la dirección, ni el identificador, ni un octeto de la foto.
    Nunca pone la medición en rojo."""
    rotulo = "LAS FOTOS, SIN SESIÓN"
    try:
        if not isinstance(muestra, dict):
            return "%s: no hay ninguna foto con la que probar." % rotulo
        suelto = urllib.request.build_opener()
        suelto.addheaders = [("User-Agent", "medir-bajada")]

        def estado(direccion):
            try:
                with suelto.open(urllib.request.Request(direccion, method="GET"), timeout=20) as r:
                    r.read(1)
                    return r.status
            except urllib.error.HTTPError as e:
                return e.code

        ident = str(muestra.get("id") or "")
        if not ident.replace("-", "").isalnum():
            return "%s: la foto de muestra no tiene un identificador que se pueda probar." % rotulo
        por_api = estado(BASE + "medios/" + ident + "/fichero")
        extension = EXTENSIONES[str(muestra.get("mime"))]
        meses = []
        for campo in ("actualizado", "creado"):
            mes = str(muestra.get(campo) or "")[:7].replace("-", "/")
            if len(mes) == 7 and mes not in meses:
                meses.append(mes)
        directas = [estado(BASE + "uploads/" + mes + "/" + ident + "." + extension) for mes in meses]
        abierta = 200 in directas
        return ("%s: por la API contesta %s (tiene que ser 401); por su dirección directa, %s: %s."
                % (rotulo, por_api, " y ".join(str(c) for c in directas) or "sin probar",
                   "ABIERTAS, cualquiera con la dirección las ve" if abierta else "cerradas"))
    except Exception as e:  # sin red, tarda, corte…: se dice y se sigue
        return "%s no se han podido mirar (%s); la medición sigue igual." % (rotulo, type(e).__name__)


def si_o_no(valor):
    return "sí" if valor is True else "no"


def mirar_reconocimiento():
    """El reconocimiento de repasos pendientes contesta. UN GET, que solo
    lee: ni redacta, ni sella, ni llama a la IA (es lo mismo que pide la
    app al abrir el menú «···» de una vivienda).

    Devuelve UNA línea con el estado HTTP, el código de error si lo hay
    y, si contesta 200, tres síes o noes. La respuesta trae el texto del
    documento y los compradores: de ahí NO se escribe nada. Pase lo que
    pase devuelve una línea que no pone la medición en rojo."""
    rotulo = "EL RECONOCIMIENTO DE REPASOS PENDIENTES"
    try:
        ruta = "constancias/" + urllib.parse.quote(VIVIENDA, safe="")
        peticion = urllib.request.Request(BASE + ruta)
        try:
            with abridor.open(peticion, timeout=20) as respuesta:
                crudo = respuesta.read()
                codigo = respuesta.status
        except urllib.error.HTTPError as e:
            crudo = e.read()
            codigo = e.code
        try:
            r = json.loads(crudo)
        except Exception:
            r = None
        if not isinstance(r, dict):
            return "%s contesta %s, sin datos que se puedan leer." % (rotulo, codigo)
        if codigo == 200:
            return ("%s contesta 200: hay con qué redactar (hayClave), %s; hay documento vigente, %s; está al día, %s."
                    % (rotulo, si_o_no(r.get("hayClave")),
                       si_o_no(isinstance(r.get("actual"), dict)), si_o_no(r.get("alDia"))))
        # Del error, solo su código (una palabra con guiones); la frase no.
        clave = r.get("codigo")
        if not (isinstance(clave, str) and 0 < len(clave) <= 40 and clave.replace("-", "").isalnum()):
            clave = ""
        if codigo == 403 and clave == "sin-permiso":
            return ("%s contesta 403 «sin-permiso»: la ruta llega y el módulo carga "
                    "(la cuenta de revisión no es de las que lo descargan)." % rotulo)
        return "%s contesta %s%s." % (rotulo, codigo, " «%s»" % clave if clave else ", sin código de error")
    except Exception as e:  # sin red, tarda, corte…: se dice y se sigue
        return "%s no se ha podido mirar (%s); la medición sigue igual." % (rotulo, type(e).__name__)


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

    # LA SESIÓN · La app de verdad y el taller comparten dominio, y una
    #     cookie con camino «/» es de todo el dominio: con una sola para
    #     las dos, entrar en una sacaba de la otra. Desde noviembre de
    #     2026 el taller lleva la suya (api/lib/auth.php). Lo que NO
    #     puede cambiar nunca es la de la app de verdad —«repasos_sesion»
    #     con camino «/»—: con otro nombre u otro camino, el equipo
    #     entero se quedaría fuera a la vez. Aquí salen solo el nombre y
    #     el camino; el valor no se escribe.
    puestas = sorted((g.name, g.path) for g in galletas)
    lineas.append("LA SESIÓN, al entrar en la app de verdad: %s." % decir_galletas(puestas))
    if de_sesion(puestas) != [("repasos_sesion", "/")]:
        lineas.append("::error::La cookie de sesión de la app de verdad NO es «repasos_sesion» con camino «/».")
    de_verdad = galleta_de_salir(BASE)
    del_taller = galleta_de_salir(BASE_TALLER)
    lineas.append("LA SESIÓN, al pedir salir sin estar dentro: la app de verdad borra %s; el taller, %s."
                  % (decir_galletas(de_verdad), decir_galletas(del_taller)))
    if de_sesion(de_verdad) != [("repasos_sesion", "/")]:
        lineas.append("::error::Al salir, la app de verdad no borra «repasos_sesion» con camino «/».")
    if de_sesion(del_taller) == [("repasos_sesion_taller", "/taller/")]:
        lineas.append("El taller lleva SU cookie: entrar en él ya no saca de la app de verdad, ni al revés.")
    elif de_sesion(del_taller) == [("repasos_sesion", "/")]:
        lineas.append("El taller comparte todavía la cookie de la app de verdad: entrar en uno saca del otro.")
    else:
        lineas.append("::warning::La cookie del taller no es ninguna de las dos que se esperan.")

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
    # ¿Ha llegado algo DESPUÉS de encender? Dos señales, las dos sin
    # nombres ni textos: la hora del último apunte (reloj del móvil) y el
    # número de orden más alto repartido (la marca, que pone el servidor
    # y solo pasa de la hora de encendido cuando numera una fila nueva).
    nuevas = sum(todo["despues"].values())
    lineas.append("ÚLTIMO APUNTE (reloj del móvil): %s UTC. Apuntado desde %s UTC: %d filas%s."
                  % (todo["ultimo"] or "ninguno", DESPUES_DE, nuevas,
                     "" if not nuevas else " (" + ", ".join(
                         "%s %d" % (t, todo["despues"][t]) for t in TABLAS if todo["despues"][t]) + ")"))
    lineas.append("NÚMERO DE ORDEN MÁS ALTO (la marca): %s UTC; %s."
                  % (todo["marca"][:19] or "sin marca",
                     "ya se ha numerado algo llegado después de encender"
                     if todo["marca"][:19] >= DESPUES_DE else
                     "todavía no se ha numerado nada llegado después de encender"))
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

    # 4 · El reconocimiento de repasos pendientes contesta. Solo lee, y
    #     su línea nunca pone la medición en rojo (ver mirar_reconocimiento).
    lineas.append(mirar_reconocimiento())

    # 4 bis · ¿Sirve ya el servidor las fichas de entrega con lo de
    #     «Postventa» (la cita de la visita de repasos y los cinco
    #     botones)? Son columnas que añaden las versiones 23 y 24 (la
    #     fotovoltaica) del esquema: si las fichas las traen, la base de
    #     producción ha llegado a esa versión. Solo se miran los NOMBRES
    #     de los campos de una ficha.
    # Las claves salen siempre (el servidor pone '' si la columna no
    #     existe), así que lo que de verdad prueba que la base está en la
    #     versión 23 es que haya DATOS guardados en esas columnas nuevas,
    #     y en la 24, que alguna ficha tenga guardada la fotovoltaica.
    lineas.append("LO DE POSTVENTA, GUARDADO DE VERDAD: %d fichas de entrega con alguna cita o botón, y %d conformes con sus datos.%s"
                  % (todo.get("fichas_con_postventa", 0), todo.get("conformes_con_datos", 0),
                     " Las columnas nuevas existen y guardan: la base está en la versión 23."
                     if todo.get("fichas_con_postventa", 0) or todo.get("conformes_con_datos", 0)
                     else " Sin datos todavía: esto no prueba en qué versión está la base."))
    lineas.append("LA FOTOVOLTAICA, GUARDADA DE VERDAD: %d fichas de entrega con su cita.%s"
                  % (todo.get("fichas_con_fotovoltaica", 0),
                     " La columna existe y guarda: la base está en la versión 24."
                     if todo.get("fichas_con_fotovoltaica", 0)
                     else " Ninguna todavía: esto no prueba que la base esté en la 24 (ni que no lo esté)."))
    claves = todo.get("ficha")
    if claves is None:
        lineas.append("LAS FICHAS DE ENTREGA: no ha bajado ninguna con la que mirar.")
    elif all(k in claves for k in ("posventa", "piscina", "clima", "domotica", "fotovoltaica", "armarios")):
        lineas.append("LAS FICHAS DE ENTREGA traen ya lo de «Postventa» (la cita de la visita y los cinco botones, con la fotovoltaica): el servidor es el de ahora.")
    elif all(k in claves for k in ("posventa", "piscina", "clima", "domotica", "armarios")):
        lineas.append("LAS FICHAS DE ENTREGA traen lo de «Entregadas» con cuatro botones, sin la fotovoltaica: el servidor es el de antes de la versión 24.")
    else:
        lineas.append("LAS FICHAS DE ENTREGA no traen todavía lo de «Entregadas»: el servidor es el de antes, o la base no ha llegado a la versión nueva.")

    # 4 ter · Las listas creadas hoy, en números (para saber si un día con
    #     muchas listas nuevas es trabajo del equipo o algo que las repite).
    lineas.append(mirar_listas_de_hoy(todo))

    # 5 · Las fotos, por su dirección directa y sin sesión. Solo dice lo
    #     que contesta el servidor, y tampoco pone la medición en rojo.
    lineas.append(mirar_ficheros(todo.get("muestra")))

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
