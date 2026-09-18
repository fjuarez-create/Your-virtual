# -*- coding: utf-8 -*-
"""
Apolo · SERENEA — la definición de los materiales, en un sitio.

Aplica de una pasada los valores acordados con Fran. Es idempotente: se puede
ejecutar tantas veces como haga falta, y volver a ejecutarlo después de tocar
algo a mano devuelve todo a lo que dice este fichero.

    import apolo_materiales; apolo_materiales.aplicar()

Se hizo como script y no por el MCP porque el editor se cayó dos veces
aplicándolo por ahí: reapadrinar una instancia a un maestro nuevo dispara una
compilación de shaders larga, y la llamada MCP se corta antes de que termine.
Desde la consola del editor no hay límite de tiempo y aguanta.

LA ESCALA DE LAS TEXTURAS: LAS UV VAN EN PULGADAS
-------------------------------------------------
Las UV que trae este modelo de SketchUp están en **pulgadas**. Se dedujo de
mirar el `UV_Tiling` que Datasmith puso en los materiales que no hemos tocado:
0,0254 en la gravilla de cubierta, que es exactamente una pulgada en metros.

Por eso `Tiling = 1` repetía la textura **cada 2,54 cm** y todo lo texturizado
salía como una papilla plana. La fórmula es:

    Tiling = 0.0254 / (metros que debe medir una repetición)

Los materiales sin textura (aluminio, asfalto, acerado, vecinos, vidrio) usan
el blanco del motor, así que su `Tiling` da igual.
"""

import unreal

MAT = "/Game/Apolo/Materiales/"
PULGADA = 0.0254


def _log(m):
    unreal.log("[Apolo materiales] " + m)


def _cargar(nombre):
    o = unreal.EditorAssetLibrary.load_asset(MAT + nombre)
    if o is None:
        unreal.log_warning("[Apolo materiales] no existe " + nombre)
    return o


def tiling_para(metros):
    """Valor de Tiling para que una repetición mida `metros`."""
    return PULGADA / float(metros)


def _esc(inst, nombre, valor):
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        inst, nombre, float(valor))


def _vec(inst, nombre, r, g, b):
    unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
        inst, nombre, unreal.LinearColor(r, g, b, 1.0))


# --------------------------------------------------------------------------

def travertino():
    """Zócalo: travertino flexible en rollo, tipo Slate-Lite.

    Viene en rollos, así que **no hay una sola junta horizontal**: solo
    verticales cada 1,20 m. El maestro M_Apolo_PiedraRollo se encarga de eso —
    estira el rollo 8 m en vertical (más que cualquier paño del zócalo, así que
    nunca llega a repetir) y le da a cada tira un desplazamiento distinto del
    dibujo, para que no salgan todas clavadas.
    """
    inst = _cargar("MI_Apolo_Travertino")
    padre = _cargar("M_Apolo_PiedraRollo")
    if inst is None or padre is None:
        return False

    actual = inst.get_editor_property("parent")
    if actual is None or actual.get_name() != "M_Apolo_PiedraRollo":
        _log("reapadrinando el travertino al maestro de rollo (compila shaders, tarda)")
        unreal.MaterialEditingLibrary.set_material_instance_parent(inst, padre)

    _esc(inst, "AnchoTira_m", 1.20)          # confirmado por Fran
    _esc(inst, "AltoRollo_m", 8.0)           # sin juntas horizontales
    _esc(inst, "VariacionEntreTiras", 0.5)   # cada tira, su dibujo
    _esc(inst, "Rugosidad", 0.55)            # apomazado
    _esc(inst, "Metalico", 0.0)
    _vec(inst, "ColorBase", 0.74, 0.755, 0.77)  # gris frío, no marfil cálido
    unreal.EditorAssetLibrary.save_loaded_asset(inst, False)
    _log("travertino listo: tiras de 1,20 m, rollo de 8 m, sin juntas horizontales")
    return True


def aluminio():
    """Carpintería: aluminio anodizado plata, microcepillado.

    Metálico de verdad — un anodizado refleja, y con Metallic 0 parecía PVC
    gris. El brillo se controla con la rugosidad: 0,05 sería cromo, 0,8 un mate
    total; 0,52 es el satinado que pidió Fran.
    """
    inst = _cargar("MI_Apolo_Aluminio")
    if inst is None:
        return False
    _vec(inst, "ColorBase", 0.52, 0.525, 0.532)
    _esc(inst, "Metalico", 1.0)
    _esc(inst, "Rugosidad", 0.52)
    unreal.EditorAssetLibrary.save_loaded_asset(inst, False)
    _log("aluminio listo: anodizado plata satinado")
    return True


def monocapa():
    """Fachada: mortero monocapa blanco roto.

    El ColorBase no sube de 0,72 a propósito: con Lumen, una fachada de esta
    superficie en blanco puro rebota tanta luz que lava la escena entera y se
    come el contraste del resto.
    """
    inst = _cargar("MI_Apolo_Monocapa")
    if inst is None:
        return False
    _vec(inst, "ColorBase", 1.30, 1.295, 1.285)
    _esc(inst, "Rugosidad", 0.82)
    _esc(inst, "Metalico", 0.0)
    _esc(inst, "Tiling", tiling_para(1.0))   # grano cada 1 m
    _esc(inst, "TilingV", 1.0)
    unreal.EditorAssetLibrary.save_loaded_asset(inst, False)
    _log("monocapa lista: blanco roto cálido, grano cada 2 m")
    return True


def vidrio():
    """Acristalamiento de baja emisividad, con Fresnel.

    Opacidad baja de frente y alta en ángulo rasante: es lo que separa un
    vidrio de una lámina de plástico gris.
    """
    inst = _cargar("MI_Apolo_Vidrio")
    if inst is None:
        return False
    _vec(inst, "ColorBase", 0.045, 0.075, 0.095)
    _esc(inst, "Opacidad", 0.42)
    _esc(inst, "OpacidadBorde", 0.92)
    _esc(inst, "FresnelPotencia", 2.0)
    _esc(inst, "Rugosidad", 0.0)
    _esc(inst, "Especular", 1.0)
    _esc(inst, "Metalico", 0.0)
    unreal.EditorAssetLibrary.save_loaded_asset(inst, False)
    _log("vidrio listo: baja emisividad con Fresnel")
    return True


def resto():
    """Los que aún no hemos repasado con Fran, con la escala corregida."""
    pam = _cargar("MI_Apolo_Pamesa")
    if pam is not None:
        _vec(pam, "ColorBase", 1.18, 1.08, 0.92)
        _esc(pam, "Rugosidad", 0.68)
        _esc(pam, "Tiling", tiling_para(1.2))   # pieza de 120x60
        _esc(pam, "TilingV", 2.0)               # la mitad de alta que ancha
        unreal.EditorAssetLibrary.save_loaded_asset(pam, False)

    for nombre, col, rug in (
            ("MI_Apolo_Asfalto", (0.06, 0.06, 0.06), 0.90),
            ("MI_Apolo_Acerado", (0.45, 0.45, 0.44), 0.80),
            ("MI_Apolo_Vecinos", (0.62, 0.61, 0.58), 0.80)):
        o = _cargar(nombre)
        if o is None:
            continue
        _vec(o, "ColorBase", col[0], col[1], col[2])
        _esc(o, "Rugosidad", rug)
        _esc(o, "Metalico", 0.0)
        unreal.EditorAssetLibrary.save_loaded_asset(o, False)
    _log("resto de instancias al día")
    return True


def aplicar():
    """Todo, en orden. El travertino va el último porque es el que más tarda."""
    _log("aplicando la definición de materiales...")
    monocapa()
    aluminio()
    vidrio()
    resto()
    travertino()
    _log("hecho. Si el travertino sigue con el dibujo viejo, dale unos segundos "
         "a que termine de compilar los shaders.")


if __name__ == "__main__":
    aplicar()
