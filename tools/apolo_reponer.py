# -*- coding: utf-8 -*-
"""
Apolo · SERENEA — reponer lo que un Reimport de Datasmith deshace.

Un *Reimport* del asset DatasmithScene regenera los materiales y la jerarquía
que vienen de SketchUp. Con eso se pierden dos cosas nuestras:

  1. El «enchufe» de los materiales: cada material de Datasmith es un
     MaterialInstanceConstant al que le cambiamos el padre para que apunte a
     nuestra instancia de /Game/Apolo/Materiales/. El reimport puede
     devolverlo a su padre original de Materials/References/.
  2. La ocultación de los 32 prismas de APOLO_CORTES (bVisible = False en su
     componente de malla).

Nada más se pierde: /Game/Apolo/ y todo lo que añadamos nosotros en Unreal es
permanente. Ver docs/UNREAL_ESTADO.md, «Qué sobrevive a un reimport y qué no».

CÓMO SE USA
-----------
Manual, desde la consola de Unreal (pestaña Output Log, modo «Cmd» → «Python»):

    import apolo_reponer; apolo_reponer.reponer()

Automático, para que se dispare solo después de cada reimport:

    import apolo_reponer; apolo_reponer.activar_automatico()

Y para que eso quede puesto en cada arranque del editor:
Project Settings → Plugins → Python → *Startup scripts* → añadir
`apolo_reponer.py`. A partir de ahí no hay que acordarse de nada.

DÓNDE VIVE
----------
El fichero va en `<Proyecto>/Content/Python/`, que Unreal añade solo al
sys.path. El mapa de materiales lo lee de
`<Proyecto>/Apolo/mapa_materiales.json` — **fuera de Content**, porque un
.json dentro de Content hace que Unreal pregunte si quiere importarlo.
La copia buena y versionada está en el repositorio, en
`docs/mapa_materiales_apolo.json`.
"""

import json
import os

import unreal

CARPETA_NUESTRA = "/Game/Apolo/Materiales/"
CARPETA_DATASMITH = "/Game/SERENEA_Apolo_17_09_26/Materials/"
RAIZ_PRISMAS = "APOLO_CORTES"


# ---------------------------------------------------------------- utilidades

def _log(msg):
    unreal.log("[Apolo] " + msg)


def _aviso(msg):
    unreal.log_warning("[Apolo] " + msg)


def _ruta_mapa():
    """<Proyecto>/Apolo/mapa_materiales.json"""
    return os.path.join(
        unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()),
        "Apolo", "mapa_materiales.json")


def cargar_mapa():
    """Devuelve {nombre_instancia_nuestra: [nombres de material de Datasmith]}.

    Las claves que empiezan por «_» son comentarios del JSON y se ignoran.
    """
    ruta = _ruta_mapa()
    if not os.path.isfile(ruta):
        _aviso("no encuentro el mapa en " + ruta +
               " — cópialo de docs/mapa_materiales_apolo.json del repositorio")
        return {}
    with open(ruta, "r", encoding="utf-8") as f:
        crudo = json.load(f)
    return {k: v for k, v in crudo.items() if not k.startswith("_")}


# ------------------------------------------------------------- 1. materiales

def reponer_materiales(mapa=None):
    """Reapadrina los materiales de Datasmith a nuestras instancias.

    Solo toca los que hagan falta: si el padre ya es el nuestro, lo salta.
    Cada cambio recompila shaders (~1 s), así que saltarse los que ya están
    bien es lo que hace que la reposición sea rápida cuando no hay nada que
    hacer.
    """
    mapa = cargar_mapa() if mapa is None else mapa
    if not mapa:
        return {"cambiados": 0, "ya_estaban": 0, "ausentes": []}

    cambiados, ya_estaban, ausentes = [], [], []

    for nuestro, nombres_datasmith in mapa.items():
        padre = unreal.EditorAssetLibrary.load_asset(CARPETA_NUESTRA + nuestro)
        if padre is None:
            _aviso("no existe nuestra instancia " + nuestro + ", me la salto")
            continue

        for nombre in nombres_datasmith:
            ruta = CARPETA_DATASMITH + nombre
            if not unreal.EditorAssetLibrary.does_asset_exist(ruta):
                ausentes.append(nombre)
                continue

            instancia = unreal.EditorAssetLibrary.load_asset(ruta)
            if not isinstance(instancia, unreal.MaterialInstanceConstant):
                _aviso(nombre + " no es una instancia de material, me la salto")
                continue

            actual = instancia.get_editor_property("parent")
            if actual is not None and actual.get_name() == nuestro:
                ya_estaban.append(nombre)
                continue

            unreal.MaterialEditingLibrary.set_material_instance_parent(
                instancia, padre)
            unreal.EditorAssetLibrary.save_loaded_asset(instancia, False)
            cambiados.append(nombre)

    if ausentes:
        _aviso("no encontrados en el proyecto: " + ", ".join(ausentes))

    return {"cambiados": len(cambiados), "ya_estaban": len(ya_estaban),
            "ausentes": ausentes}


# ---------------------------------------------------------------- 2. prismas

def _actores_del_nivel():
    subsistema = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    return subsistema.get_all_level_actors()


def reponer_prismas():
    """Oculta los 32 prismas de APOLO_CORTES sin tocarles la colisión.

    Se oculta el COMPONENTE (bVisible = False), no con el ojo del
    Esquematizador: el ojo no llega al ejecutable y el bloque rosa
    reaparecería en el .exe. La colisión vive en otro sitio, así que los
    prismas siguen recibiendo el trazado del ratón aunque no se dibujen.
    """
    raiz = None
    for actor in _actores_del_nivel():
        if actor.get_actor_label() == RAIZ_PRISMAS:
            raiz = actor
            break

    if raiz is None:
        _aviso("no está " + RAIZ_PRISMAS + " en la escena. Lo más probable: "
               "la etiqueta se quedó OCULTA en SketchUp al exportar, y "
               "Datasmith no exporta lo oculto. Hazla visible, exporta otra "
               "vez al mismo .udatasmith y reimporta.")
        return {"ocultados": 0, "ya_estaban": 0, "encontrados": 0}

    ocultados = ya_estaban = encontrados = 0
    sin_colision = []

    # APOLO_CORTES -> CORTE_Pn -> prismas
    for planta in raiz.get_attached_actors():
        for prisma in planta.get_attached_actors():
            for comp in prisma.get_components_by_class(unreal.StaticMeshComponent):
                encontrados += 1
                if comp.get_editor_property("visible"):
                    comp.set_editor_property("visible", False)
                    ocultados += 1
                else:
                    ya_estaban += 1

                cuerpo = comp.get_editor_property("body_instance")
                if str(cuerpo.get_editor_property("collision_profile_name")) != "BlockAll":
                    sin_colision.append(prisma.get_actor_label())

    if sin_colision:
        _aviso("prismas cuyo perfil de colisión ya no es BlockAll (el clic de "
               "la fase 6 dependerá de esto): " + ", ".join(sin_colision))

    return {"ocultados": ocultados, "ya_estaban": ya_estaban,
            "encontrados": encontrados}


# ------------------------------------------------- 3. vidrios que no exporta

TAG_VIDRIO = "apolo:vidrio_anadido"
PLANO = "/Engine/BasicShapes/Plane"
MAT_VIDRIO = "/Game/Apolo/Materiales/MI_Apolo_Vidrio"
ANCHO_HOJA_CM = 76.0   # hoja de 800 mm menos el retranqueo del marco
ALTO_HOJA_CM = 186.0   # hoja de 2000 mm, idem
MARGEN_CM = 10.0       # holgura al buscar si ya hay un acristalamiento


def _caja(actor):
    b = actor.get_actor_bounds(False)
    return b  # (origin, extent)


def _solapan(o1, e1, o2, e2):
    for i in ("x", "y", "z"):
        if abs(getattr(o1, i) - getattr(o2, i)) > getattr(e1, i) + getattr(e2, i):
            return False
    return True


def reponer_vidrios():
    """Crea el vidrio de las ventanas a las que Datasmith no se lo exporta.

    El componente `UNIK_VEN_Pal-N_NHAbatible` sale de SketchUp **sin panel de
    vidrio**: su malla solo trae la ranura del aluminio y no hay ningún actor
    `Acristalamiento` en el hueco. En SketchUp se ve bien, así que es la
    exportación la que se lo deja. Sin esto, esas ventanas se ven como paneles
    ciegos.

    Los planos que crea llevan el tag `apolo:vidrio_anadido`, así que son
    reconocibles y se borran y rehacen en cada pasada. Si algún día el
    componente se arregla en SketchUp, esta función dejará de crear nada por sí
    sola: al detectar un acristalamiento en el hueco, se lo salta.
    """
    subsistema = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actores = subsistema.get_all_level_actors()

    # fuera los de la pasada anterior, para no duplicar
    previos = [a for a in actores if a.actor_has_tag(TAG_VIDRIO)]
    for p in previos:
        subsistema.destroy_actor(p)

    ventanas, acristalamientos = [], []
    for a in actores:
        if a.actor_has_tag(TAG_VIDRIO):
            continue
        et = a.get_actor_label()
        if et.startswith("UNIK_VEN_Pal") and "Manilla" not in et:
            ventanas.append(a)
        elif "Acristalamiento" in et:
            acristalamientos.append(a)

    cajas = [a.get_actor_bounds(False) for a in acristalamientos]

    plano = unreal.EditorAssetLibrary.load_asset(PLANO)
    material = unreal.EditorAssetLibrary.load_asset(MAT_VIDRIO)
    if plano is None or material is None:
        _aviso("no encuentro el plano o el material de vidrio")
        return {"creados": 0, "ya_tenian": 0}

    creados = ya_tenian = 0
    for w in ventanas:
        origen, extent = w.get_actor_bounds(False)
        holgura = unreal.Vector(extent.x + MARGEN_CM, extent.y + MARGEN_CM,
                                extent.z + MARGEN_CM)
        if any(_solapan(origen, holgura, o, e) for (o, e) in cajas):
            ya_tenian += 1
            continue

        rot = unreal.Rotator(-90.0, 0.0, w.get_actor_rotation().yaw)
        nuevo = subsistema.spawn_actor_from_object(plano, origen, rot)
        if nuevo is None:
            continue
        nuevo.set_actor_label("VIDRIO_ANADIDO")
        nuevo.tags = [TAG_VIDRIO]
        nuevo.set_actor_scale3d(unreal.Vector(ANCHO_HOJA_CM / 100.0,
                                              ALTO_HOJA_CM / 100.0, 1.0))
        for comp in nuevo.get_components_by_class(unreal.StaticMeshComponent):
            comp.set_material(0, material)
        creados += 1

    return {"creados": creados, "ya_tenian": ya_tenian,
            "borrados_previos": len(previos)}


# -------------------------------------------------------------------- 4. todo

def reponer(guardar=True, silencioso=False):
    """Repone materiales y prismas. Es seguro llamarlo siempre.

    Solo guarda el nivel **si ha cambiado algo**, para que se pueda llamar al
    arrancar el editor sin efectos secundarios ni esperas. Cuando está todo en
    su sitio no hace nada: comprobar los 29 materiales es instantáneo.

    `silencioso` calla el resumen cuando no había nada que reponer, para no
    ensuciar el log en cada arranque.
    """
    mat = reponer_materiales()
    pri = reponer_prismas()
    vid = reponer_vidrios()
    hubo_cambios = bool(mat["cambiados"] or pri["ocultados"] or vid["creados"])

    if guardar and hubo_cambios:
        unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()

    if hubo_cambios or not silencioso:
        _log("materiales: {0} reenchufados, {1} ya estaban bien".format(
            mat["cambiados"], mat["ya_estaban"]))
        _log("prismas: {0} ocultados, {1} ya estaban ocultos, {2} encontrados".format(
            pri["ocultados"], pri["ya_estaban"], pri["encontrados"]))
        _log("vidrios de ventana: {0} creados, {1} ventanas ya lo traian".format(
            vid["creados"], vid["ya_tenian"]))
        if hubo_cambios:
            _aviso("habia cosas sueltas y se han repuesto. Si no venias de un "
                   "reimport, probablemente el editor se cayo antes de guardar.")

    if pri["encontrados"] and pri["encontrados"] != 32:
        _aviso("esperaba 32 prismas y he encontrado {0}. Míralo antes de "
               "seguir: las cotas de corte salen de ahí.".format(pri["encontrados"]))

    _log("hecho.")
    return {"materiales": mat, "prismas": pri}


# ------------------------------------------------------- 4. modo automático

_manejador = None


def _al_terminar_import(rutas):
    """Se dispara al acabar una importación. Solo actúa si venía Datasmith."""
    try:
        es_datasmith = any("SERENEA_Apolo" in str(r) for r in rutas)
    except TypeError:
        es_datasmith = True

    if not es_datasmith:
        return

    _log("detectado un reimport de Datasmith; repongo.")
    reponer()


def activar_automatico():
    """Engancha la reposición al final de cada importación.

    Con esto, reimportar el modelo y que los materiales sigan bien es la misma
    operación: no hay que acordarse de ejecutar nada.
    """
    global _manejador
    if _manejador is not None:
        _log("el modo automático ya estaba activo.")
        return

    subsistema = unreal.get_editor_subsystem(unreal.ImportSubsystem)
    _manejador = _al_terminar_import
    subsistema.on_assets_post_import.add_callable(_manejador)
    _log("modo automático activado: repondré solo después de cada reimport.")


def desactivar_automatico():
    global _manejador
    if _manejador is None:
        return
    subsistema = unreal.get_editor_subsystem(unreal.ImportSubsystem)
    subsistema.on_assets_post_import.remove_callable(_manejador)
    _manejador = None
    _log("modo automático desactivado.")


# Al ejecutar el fichero (también como startup script) deja el automático
# puesto. No repone en ese momento: al arrancar el editor no hace falta, y
# así el arranque no se alarga.
if __name__ == "__main__":
    activar_automatico()
