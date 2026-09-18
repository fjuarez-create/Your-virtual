# -*- coding: utf-8 -*-
"""
Apolo · SERENEA — lo que tiene que pasar solo al abrir el editor.

Se registra como *startup script* en Project Settings → Plugins → Python, y
se encarga de dos cosas para que nadie tenga que acordarse de ellas:

  1. **Arrancar el servidor MCP.** No arranca solo al abrir el proyecto, y sin
     él la sesión de Claude Code no ve nada. Esto ha costado ya varias veces
     tener que lanzarlo a mano después de cada reinicio o caída.
  2. **Dejar enganchada la reposición** de `apolo_reponer.py`, para que un
     reimport de Datasmith no deshaga los materiales ni deje los prismas
     visibles.

El arranque del editor es asíncrono: al ejecutarse este fichero todavía puede
no haber mundo ni estar registrados los comandos de consola. Por eso no se
hace nada directamente, sino que se espera a que el editor esté listo usando
un callback de tick que se desengancha en cuanto termina.
"""

import unreal

COMANDO_MCP = "ModelContextProtocol.StartServer"

_handle = None
_intentos = 0
MAX_INTENTOS = 600          # ~10 s a 60 fps; de sobra para que el editor arranque


def _log(m):
    unreal.log("[Apolo arranque] " + m)


def _arrancar_mcp():
    try:
        mundo = unreal.EditorLevelLibrary.get_editor_world()
    except Exception:
        mundo = None
    unreal.SystemLibrary.execute_console_command(mundo, COMANDO_MCP)
    _log("servidor MCP lanzado (" + COMANDO_MCP + ")")


def _enganchar_reposicion():
    """Engancha al reimport y, además, repone ya.

    El enganche al reimport no basta: los materiales también se sueltan cuando
    el editor se cae antes de guardar, y eso ha pasado. Reponer al arrancar
    cubre las dos cosas. Si está todo en su sitio no hace nada ni guarda nada,
    así que no alarga el arranque.
    """
    try:
        import apolo_reponer
        apolo_reponer.activar_automatico()
        apolo_reponer.reponer(silencioso=True)
    except Exception as e:
        unreal.log_warning("[Apolo arranque] no pude enganchar la reposición: " + str(e))


def _cuando_listo(delta_seconds):
    """Se llama cada tick hasta que el editor está en condiciones."""
    global _handle, _intentos
    _intentos += 1

    listo = False
    try:
        listo = unreal.EditorLevelLibrary.get_editor_world() is not None
    except Exception:
        listo = False

    if not listo and _intentos < MAX_INTENTOS:
        return

    # o está listo, o se nos ha acabado la paciencia: lo intentamos igual
    if _handle is not None:
        unreal.unregister_slate_post_tick_callback(_handle)
        _handle = None

    _arrancar_mcp()
    _enganchar_reposicion()
    _log("listo. No hace falta tocar nada más.")


def arrancar():
    global _handle
    if _handle is not None:
        return
    _handle = unreal.register_slate_post_tick_callback(_cuando_listo)
    _log("esperando a que el editor termine de abrir...")


arrancar()
