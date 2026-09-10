"""Importación inicial para ejecutar DENTRO del editor Unreal 5.7.

Cada fuente se importa a un mapa separado para conservar transformaciones y
evitar superponer cuatro variantes de planta. No implementa aún el runtime,
la iluminación final, las farolas ni el enlace de la interfaz con Pixel Streaming.
"""
import hashlib
import json
from pathlib import Path

import unreal


def importar():
    proyecto = Path(unreal.Paths.project_dir()).resolve()
    fuentes = proyecto / "SourceAssets"
    manifest = json.loads((fuentes / "manifest.json").read_text(encoding="utf-8"))
    # Validar todo antes de cambiar el mapa actual.
    for modelo in manifest["modelos"]:
        archivo = proyecto / modelo["salida"]
        if hashlib.sha256(archivo.read_bytes()).hexdigest() != modelo["salidaSha256"]:
            raise RuntimeError(f"Fuente modificada o incompleta: {archivo.name}")

    niveles = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actores = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    manager = unreal.InterchangeManager.get_interchange_manager_scripted()
    # Guardar contenido del editor antes de crear nuevos mapas.
    if not unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True):
        raise RuntimeError("No se han podido guardar los cambios del editor")
    resultados = []
    for modelo in manifest["modelos"]:
        nombre = modelo["nombre"]
        mapa = f"/Game/Serenea/Mapas/L_{nombre}"
        if unreal.EditorAssetLibrary.does_asset_exist(mapa):
            raise RuntimeError(f"El mapa ya existe; no se sobrescribe: {mapa}")
        if not niveles.new_level(mapa):
            raise RuntimeError(f"No se pudo crear {mapa}")
        source = manager.create_source_data(str(proyecto / modelo["salida"]))
        if not manager.can_translate_source_data(source, True):
            raise RuntimeError(f"Interchange no puede importar la escena {nombre}")
        params = unreal.ImportAssetParameters()
        params.is_automated = True
        params.replace_existing = False
        params.import_level = niveles.get_current_level()
        params.override_pipelines = [
            unreal.SoftObjectPath("/Interchange/Pipelines/DefaultSceneAssetsPipeline.DefaultSceneAssetsPipeline"),
            unreal.SoftObjectPath("/Interchange/Pipelines/DefaultSceneLevelPipeline.DefaultSceneLevelPipeline"),
        ]
        if not manager.import_scene(f"/Game/Serenea/Importados/{nombre}", source, params):
            raise RuntimeError(f"Error de importación: {nombre}")
        # Etiquetas estables para montar el runtime sin depender de nombres de actor.
        mallas = 0
        for actor in actores.get_all_level_actors():
            if actor.get_components_by_class(unreal.StaticMeshComponent):
                actor.tags = list(actor.tags) + [unreal.Name(f"SereneaFuente:{nombre}")]
                mallas += 1
        if not mallas:
            raise RuntimeError(f"No hay mallas importadas en {nombre}")
        if not niveles.save_current_level():
            raise RuntimeError(f"No se pudo guardar {mapa}")
        unreal.EditorAssetLibrary.save_directory(f"/Game/Serenea/Importados/{nombre}")
        resultados.append({"fuente": nombre, "mapa": mapa, "actoresConMallas": mallas})
        unreal.log(f"SERENEA: {nombre}, {mallas} actores importados")
    salida = proyecto / "Saved/Serenea/importacion.json"
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps(resultados, ensure_ascii=False, indent=2), encoding="utf-8")
    niveles.load_level("/Game/Serenea/Mapas/L_apolo_envolvente")
    unreal.log("Fuentes importadas. Pendiente: montar el visor, iluminar y validar en GPU.")


if __name__ == "__main__":
    importar()
