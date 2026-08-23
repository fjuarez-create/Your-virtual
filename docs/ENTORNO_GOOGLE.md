# Entorno real de Google — estado y diagnóstico

## Qué está montado
- `js/environment.js`: capa de teselas 3D, apagada por defecto. El botón sólo
  aparece con `?entorno=1` mientras esto no funcione.
- `vendor/3d-tiles-renderer.js`: librería empaquetada (86 KB), sin CDN.
- Clave sellada en el deploy desde el secreto `MAPS_API_KEY`.
- Atribución de Google visible mientras la capa está encendida.
- Exclusión mutua con el modo noche.
- `context.js` agrupado bajo `scene.userData.contexto` para apartarlo entero.

## Datos medidos (no estimados)
- Parcela: 27.986703, -15.395572. Cota del terreno: 77,88 m (Elevation API).
- Rumbo del edificio: 70°, el mismo que ya usaba `context.js`.
- Detalle disponible sobre la parcela: hasta 2,01 m de error geométrico.
- Mallas: `KHR_materials_unlit`, sin Draco ni KTX2, ~53 KB cada una.

## El problema pendiente
NO es la geo-referenciación. `tiles.group.position.y ≈ -6.373.512` es el valor
correcto: si la parcela está en el origen, el centro de la Tierra cae a un
radio terrestre por debajo.

El síntoma es que sólo se sostiene la tesela raíz (`mallasEnGrupo: 1`), la del
planeta entero — de ahí que la atribución muestre GEBCO y Landsat, que son las
capas globales. El árbol no se subdivide hasta el nivel local.

Dónde mirar, por orden:
1. Cómo calcula `TilesRenderer` el error en pantalla cuando `tiles.group`
   cuelga de otro grupo con transformación propia. Comprobar que
   `group.matrixWorld` está actualizado antes de `tiles.update()`.
2. El `far` de la cámara (4.200 m) frente a volúmenes de tamaño planetario.
3. Si `TilesFadePlugin` o la caché LRU están descartando lo recién cargado.

Medir antes de tocar: volcar `tiles.visibleTiles.size`, `tiles.activeTiles.size`
y la distancia cámara→parcela en el marco de las teselas.
