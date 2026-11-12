#!/usr/bin/env python3
"""Comprueba, DESPUÉS de publicar, con qué cookie guarda la sesión una API.

POR QUÉ. La app de verdad (la raíz del dominio) y el taller (/taller/)
viven en el mismo origen, y desde noviembre de 2026 cada una lleva SU
cookie de sesión (api/lib/auth.php):

  · la app de verdad, «repasos_sesion» con camino «/». Es lo que NO puede
    cambiar nunca: el equipo lleva la sesión abierta desde hace meses, y
    con otro nombre u otro camino se quedarían todos fuera a la vez,
    teniendo que volver a entrar (y hay quien no recuerda su contraseña);
  · el taller, «repasos_sesion_taller» con camino «/taller/», para que
    entrar en uno no saque del otro.

Qué cookie pone cada una lo decide una línea de PHP que mira desde qué
carpeta se sirve. Si un día esa línea se tuerce, ningún fallo avisa: la
app sigue funcionando para quien entra de nuevo. Esto lo mira en el
servidor recién publicado y pone el despliegue en rojo si no es lo que
tiene que ser.

QUÉ HACE, con la cuenta de revisión (la misma con la que el despliegue
comprueba que el revisor de Apple puede entrar):

  1. Pide salir sin estar dentro: el servidor contesta borrando su
     cookie, y ya se ve cuál es (para esto no hace falta ninguna cuenta).
  2. Entra, y mira la cookie que le ponen: nombre y camino.
  3. Con ESA cookie pide «quién soy»: tiene que contestar la cuenta.
  4. Sale, y mira que se borre esa misma cookie y que ya no valga.

La sesión que abre al entrar la cierra SIEMPRE, también cuando la cookie
no es la que tiene que ser y todo acaba en rojo (ver cerrar()).

Del valor de la cookie no se escribe NADA, ni en el registro ni en
ningún fichero: es una sesión abierta. Solo salen su nombre y su camino.
Tampoco la contraseña: va de los secretos al servidor sin pasar por la
línea de órdenes.

Que no se pueda preguntar (sin red, el servidor no contesta, faltan los
secretos de la cuenta) NO es un fallo: se avisa y se sigue. El rojo es
solo para una cookie que se ha visto y no es la que tiene que ser.

Variables:
  SESION_API       la API, acabada en «/» (https://repasos.unikdi.com/api/)
  SESION_NOMBRE    el nombre que tiene que llevar la cookie
  SESION_CAMINO    su camino
  SESION_DE_QUIEN  cómo llamarla en los mensajes («la app de verdad»)
  SESION_EMAIL, SESION_PASSWORD   la cuenta de revisión (pueden faltar)
  SESION_PAUSA     segundos de espera entre intentos de entrar (5)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("SESION_API", "")
NOMBRE = os.environ.get("SESION_NOMBRE", "")
CAMINO = os.environ.get("SESION_CAMINO", "")
QUIEN = os.environ.get("SESION_DE_QUIEN", "") or "esta API"
# «de el taller» y «a el taller» no se dicen: «del taller», «al taller».
DE_QUIEN = "del " + QUIEN[3:] if QUIEN.startswith("el ") else "de " + QUIEN
A_QUIEN = "al " + QUIEN[3:] if QUIEN.startswith("el ") else "a " + QUIEN
CORREO = os.environ.get("SESION_EMAIL", "").strip()
CLAVE = os.environ.get("SESION_PASSWORD", "")
try:
    PAUSA = float(os.environ.get("SESION_PAUSA", "") or 5)
except ValueError:
    PAUSA = 5.0

# Todas las cookies de sesión de la casa empiezan así. Las demás (las que
# pueda poner el alojamiento por su cuenta) no se juzgan.
FAMILIA = "repasos_sesion"


class SinRedirigir(urllib.request.HTTPRedirectHandler):
    """Una redirección no se sigue: la cookie se le pide a ESTA dirección,
    y un «entrar» redirigido se convertiría en otra petición distinta."""

    def redirect_request(self, *args, **kwargs):
        return None


abridor = urllib.request.build_opener(SinRedirigir)


def pedir(ruta, cuerpo=None, galleta=None):
    """Una petición a la API. Devuelve (código, cabeceras Set-Cookie, json).
    Código 0 si no hay manera de preguntar."""
    datos = None if cuerpo is None else json.dumps(cuerpo).encode("utf-8")
    peticion = urllib.request.Request(API + ruta, data=datos)
    peticion.add_header("User-Agent", "comprobar-sesion")
    if datos is not None:
        peticion.add_header("Content-Type", "application/json")
    if galleta is not None:
        peticion.add_header("Cookie", galleta)
    try:
        with abridor.open(peticion, timeout=15) as respuesta:
            codigo, cabeceras, crudo = respuesta.status, respuesta.headers, respuesta.read()
    except urllib.error.HTTPError as e:
        codigo, cabeceras, crudo = e.code, e.headers, e.read()
    except Exception:  # sin red, corte, certificado… (y sin escribir el detalle)
        return 0, [], None
    try:
        cuerpo_json = json.loads(crudo)
    except Exception:
        cuerpo_json = None
    return codigo, cabeceras.get_all("Set-Cookie") or [], cuerpo_json


def leer_galletas(crudas):
    """De las cabeceras Set-Cookie, las de sesión de la casa: una lista de
    diccionarios con nombre, valor (que no se escribe nunca), camino,
    dominio y atributos.

    La misma cabecera repetida tal cual cuenta UNA vez: para el navegador
    es la misma cookie puesta dos veces, y un proxy que repita cabeceras
    no es que la cookie haya cambiado (en las pruebas ponía el despliegue
    en rojo con un mensaje que no se entendía: «NO pone X, sino X, X»)."""
    vistas = []
    for cruda in crudas:
        trozos = [t.strip() for t in cruda.split(";")]
        nombre, _, valor = trozos[0].partition("=")
        nombre = nombre.strip()
        if not nombre.startswith(FAMILIA):
            continue
        galleta = {"nombre": nombre, "valor": valor.strip(), "camino": "", "dominio": "", "atributos": {}}
        for trozo in trozos[1:]:
            clave, _, dato = trozo.partition("=")
            clave = clave.strip().lower()
            if clave == "path":
                galleta["camino"] = dato.strip()
            elif clave == "domain":
                galleta["dominio"] = dato.strip()
            elif clave:
                galleta["atributos"][clave] = dato.strip().lower()
        if galleta not in vistas:
            vistas.append(galleta)
    return vistas


def decir(galletas):
    """Cómo se cuentan en el registro: nombre y camino. Nunca el valor."""
    if not galletas:
        return "ninguna cookie de sesión"
    partes = []
    for g in galletas:
        nombre = g["nombre"] if g["nombre"].replace("_", "").isalnum() else "(nombre raro)"
        camino = g["camino"] if len(g["camino"]) < 60 and g["camino"].isprintable() else "(camino raro)"
        parte = "«%s» con camino «%s»" % (nombre, camino)
        if g["dominio"]:
            parte += " y dominio propio"
        partes.append(parte)
    return ", ".join(partes)


def es_la_buena(galletas):
    """Exactamente UNA cookie de sesión, con el nombre y el camino de
    siempre y sin dominio propio (con dominio sería OTRA cookie para el
    navegador, aunque se llamara igual: conviviría con la de siempre)."""
    return (len(galletas) == 1
            and galletas[0]["nombre"] == NOMBRE
            and galletas[0]["camino"] == CAMINO
            and galletas[0]["dominio"] == "")


# Lo que hay que devolverle al servidor para que cierre la sesión que esta
# guardia abre al entrar: la cabecera «Cookie», con el valor dentro. Solo
# viaja de vuelta al servidor que lo puso; no se escribe en ningún sitio.
# Vacío cuando no queda ninguna sesión por cerrar.
POR_CERRAR = [""]


def lo_que_puso(crudas):
    """La cabecera «Cookie» con TODO lo que el servidor acaba de poner al
    entrar, sea o no una cookie de la casa y tenga el nombre que tenga: es
    lo que le devolvería un navegador. Con ello se le pide salir también
    cuando la cookie de sesión no es la que tiene que ser."""
    pares = []
    for cruda in crudas:
        par = cruda.split(";", 1)[0].strip()
        if par.partition("=")[0].strip() and "=" in par and par not in pares:
            pares.append(par)
    return "; ".join(pares)


def cerrar(avisos):
    """Cierra la sesión que esta guardia abrió, cuando la cookie que le
    pusieron al entrar NO es la que tiene que ser.

    EL CASO (noviembre de 2026). Salir solo se pedía si la cookie era la
    buena. En rojo —la raíz poniendo la cookie del taller, o la de siempre
    con otro camino— la guardia se iba dejando en el servidor una sesión
    abierta de la cuenta de revisión, viva hasta caducar: 30 días. Su valor
    no lo tenía nadie, pero una sesión abierta que no es de nadie no tiene
    por qué quedarse, y menos el día en que algo va mal con las cookies.

    Se le devuelve al servidor todo lo que puso (lo_que_puso()) y se le
    pide salir. Si antes esa sesión valía y después ya no, queda dicho. Lo
    que NO se puede cerrar es una sesión de la que el servidor no ha dado
    nada con qué pedirlo (entró sin poner ninguna cookie): se avisa."""
    devolver, POR_CERRAR[0] = POR_CERRAR[0], ""
    if not devolver:
        avisos.append("La sesión que ha abierto la comprobación NO se ha podido cerrar: al entrar, el servidor no ha puesto ninguna cookie con la que pedírselo. Caduca sola, y su valor no lo tiene nadie.")
        return
    valia, _, _ = pedir("auth/me", galleta=devolver)
    codigo, _, cuerpo = pedir("auth/logout", {}, galleta=devolver)
    if not (codigo == 200 and isinstance(cuerpo, dict) and cuerpo.get("ok") is True):
        avisos.append("No se ha podido cerrar la sesión de la comprobación (%s)." % (codigo or "sin red"))
        return
    codigo, _, _ = pedir("auth/me", galleta=devolver)
    if codigo == 200:
        avisos.append("Después de salir, la sesión de la comprobación SIGUE valiendo: salir no la ha cerrado.")
    elif codigo == 401 and valia == 200:
        print("La sesión que abrió la comprobación queda cerrada igualmente (valía, y ya no: 401).")
    else:
        print("Se ha pedido salir con lo que el servidor puso al entrar. Que la sesión quede cerrada no se puede comprobar desde aquí (antes de salir contestaba %s)."
              % (valia or "sin red"))


def main():
    if not API.endswith("/") or not NOMBRE or not CAMINO:
        print("::error::A la guardia de la sesión le faltan SESION_API (acabada en «/»), SESION_NOMBRE o SESION_CAMINO.")
        return 1

    esperada = "«%s» con camino «%s»" % (NOMBRE, CAMINO)
    fallos = []
    avisos = []
    print("La cookie de sesión %s tiene que ser %s." % (DE_QUIEN, esperada))

    # 1 · Salir sin estar dentro: el servidor borra SU cookie, y se ve cuál es.
    #     Solo cuenta si quien contesta es la API («ok»): un 200 con la
    #     página de mantenimiento del alojamiento no trae ninguna cookie,
    #     y eso no es que la cookie haya cambiado.
    codigo, crudas, cuerpo = pedir("auth/logout", {})
    es_la_api = codigo == 200 and isinstance(cuerpo, dict) and cuerpo.get("ok") is True
    al_salir = leer_galletas(crudas) if es_la_api else None
    if al_salir is None:
        print("Al pedir salir sin estar dentro: el servidor no contesta como la API (%s)." % (codigo or "sin red"))
    else:
        print("Al pedir salir sin estar dentro, el servidor borra: %s." % decir(al_salir))
        if not es_la_buena(al_salir):
            fallos.append("Al salir, %s NO borra %s, sino %s." % (QUIEN, esperada, decir(al_salir)))

    # 2 · Entrar con la cuenta de revisión.
    al_entrar = None
    if not CORREO or not CLAVE:
        print("Faltan los secretos de la cuenta de revisión: no se puede mirar la cookie AL ENTRAR.")
    else:
        codigo = 0
        for intento in (1, 2, 3):
            codigo, crudas, cuerpo = pedir("auth/login", {"email": CORREO, "password": CLAVE})
            if codigo == 200 and isinstance(cuerpo, dict) and isinstance(cuerpo.get("usuario"), dict):
                al_entrar = leer_galletas(crudas)
                POR_CERRAR[0] = lo_que_puso(crudas)
                break
            print("Intento %d de entrar: el servidor contesta %s." % (intento, codigo or "sin red"))
            if intento < 3:
                time.sleep(intento * PAUSA)
        if al_entrar is None:
            print("No se ha podido entrar con la cuenta de revisión: no se puede mirar la cookie AL ENTRAR.")

    if al_entrar is not None:
        print("Al entrar, el servidor pone: %s." % decir(al_entrar))
        if not es_la_buena(al_entrar):
            fallos.append("Al entrar, %s NO pone %s, sino %s." % (QUIEN, esperada, decir(al_entrar)))
            # Rojo; pero la sesión que se acaba de abrir se cierra igual.
            cerrar(avisos)
        else:
            la_mia = al_entrar[0]
            # Los atributos de siempre. Que falte uno no deja a nadie
            # fuera hoy, pero la cookie de la app de verdad no cambia «ni
            # un atributo»: se avisa. La caducidad es el que más duele:
            # sin ella la cookie es «de sesión del navegador», y el móvil
            # olvida a quien había entrado en cuanto cierra la app.
            faltan = [a for a in ("httponly", "secure") if a not in la_mia["atributos"]]
            if la_mia["atributos"].get("samesite") != "lax":
                faltan.append("samesite=lax")
            if "expires" not in la_mia["atributos"] and "max-age" not in la_mia["atributos"]:
                faltan.append("la caducidad (expires o max-age: sin ella, el móvil olvida la sesión al cerrar la app)")
            if faltan:
                avisos.append("A la cookie de sesión %s le falta: %s." % (DE_QUIEN, ", ".join(faltan)))

            # 3 · Con ESA cookie, una petición con sesión tiene que contestar.
            #     Rojo si el servidor NO la reconoce (401: pone una cookie
            #     y lee otra) o si contesta otra cuenta. Una avería
            #     pasajera (500, 502, sin red) no dice nada de la cookie:
            #     se insiste dos veces más y, si sigue, se avisa.
            par = "%s=%s" % (la_mia["nombre"], la_mia["valor"])
            codigo, yo = 0, None
            for intento in (1, 2, 3):
                codigo, _, yo = pedir("auth/me", galleta=par)
                if codigo in (200, 401, 403):
                    break
                if intento < 3:
                    time.sleep(intento * PAUSA)
            correo = str(((yo or {}).get("usuario") or {}).get("email") or "").strip().lower()
            if codigo == 200 and correo == CORREO.lower():
                print("Con esa cookie, una petición con sesión contesta bien (200, y es la cuenta de revisión).")
            elif codigo == 200:
                fallos.append("Con la cookie recién puesta, quien contesta %s NO es la cuenta de revisión." % A_QUIEN)
            elif codigo in (401, 403):
                fallos.append("La cookie que %s acaba de poner NO la reconoce su propio servidor: una petición con sesión contesta %s."
                              % (QUIEN, codigo))
            else:
                avisos.append("No se ha podido probar la cookie en una petición con sesión: el servidor contesta %s."
                              % (codigo or "sin red"))

            # 4 · Salir de verdad: se borra la misma, y deja de valer.
            valia = codigo == 200
            POR_CERRAR[0] = ""
            codigo, crudas, cuerpo = pedir("auth/logout", {}, galleta=par)
            if codigo == 200 and isinstance(cuerpo, dict) and cuerpo.get("ok") is True:
                borrada = leer_galletas(crudas)
                if es_la_buena(borrada):
                    print("Al salir de verdad se borra esa misma cookie.")
                else:
                    fallos.append("Al salir de verdad, %s NO borra %s, sino %s." % (QUIEN, esperada, decir(borrada)))
                codigo, _, _ = pedir("auth/me", galleta=par)
                if codigo == 401 and valia:
                    print("Y la sesión de la comprobación queda cerrada (401).")
                elif codigo == 401:
                    # Ya contestaba que no antes de salir: un 401 ahora no
                    # demuestra nada, y no se dice lo que no se ha visto.
                    print("Se ha pedido salir con esa cookie. Que la sesión quede cerrada no se puede comprobar desde aquí: el servidor ya no la reconocía antes de salir.")
                elif codigo == 200:
                    avisos.append("Después de salir, la sesión de la comprobación SIGUE valiendo: salir no la ha cerrado.")
            else:
                avisos.append("No se ha podido cerrar la sesión de la comprobación (%s)." % (codigo or "sin red"))

    for aviso in avisos:
        print("::warning::" + aviso)
    if fallos:
        for fallo in fallos:
            print("::error::" + fallo)
        print("::error::La cookie de sesión %s NO es la que tiene que ser. Con otro nombre u otro camino, quien tenía la sesión abierta se queda fuera: hay que arreglarlo (o volver atrás) YA." % DE_QUIEN)
        return 1

    if al_entrar is not None:
        print("BIEN: %s guarda la sesión en %s." % (QUIEN, esperada))
    elif al_salir is not None:
        # Sin los secretos de la cuenta no es un aviso: de que faltan ya
        # avisa quien los necesita de verdad (el paso del revisor).
        print("%sLa cookie de sesión %s solo se ha podido mirar al pedir salir (es %s, la que tiene que ser); al entrar, no."
              % ("::warning::" if CORREO and CLAVE else "", DE_QUIEN, esperada))
    else:
        print("::warning::No se ha podido preguntar %s por su cookie de sesión: no contesta." % A_QUIEN)
    return 0


def principal():
    """main(), sin que un tropiezo de la propia guardia tiña de rojo un
    despliegue que ha salido bien: eso no es un fallo de la cookie. Se
    avisa, para que alguien la mire."""
    try:
        return main()
    except Exception as tropiezo:
        # Solo el tipo del error: en su detalle podría venir algo de la respuesta.
        print("::warning::La guardia de la cookie de sesión ha tropezado (%s) y no ha podido mirar: revísala."
              % type(tropiezo).__name__)
        return 0
    finally:
        # Si tropezó DESPUÉS de entrar y antes de salir, la sesión sigue
        # abierta: se pide salir aquí, sin mirar nada más y sin que un
        # segundo tropiezo cambie cómo acaba la guardia.
        if POR_CERRAR[0]:
            try:
                pedir("auth/logout", {}, galleta=POR_CERRAR[0])
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(principal())
