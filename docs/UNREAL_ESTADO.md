# Apolo en Unreal: estado, decisiones y recetas

Documento de traspaso. Está pensado para que una sesión de Claude Code que
corra **en el PC de Fran, con el editor de Unreal abierto y el MCP oficial
conectado**, pueda ponerse a trabajar sin tener que releer nada más. Todo lo
que aquí se afirma está verificado salvo donde pone «sin confirmar».

Fecha de este estado: 17 de septiembre de 2026, noche. **Proyecto vigente:
`Serenea_170926`**, importado desde **fichero `.udatasmith`** (no por Direct
Link), verificado por el MCP, con los prismas dentro y las fases 1 y 2 hechas.
`Serenea_160926` queda muerto: ver «El día de los dos proyectos». La interfaz
web ya está separada del motor y lista para el ejecutable
(`new/unreal.html`; ver «Arquitectura del ejecutable»).

## Qué es esto

SERENEA «Edificio Apolo»: 166 viviendas en Las Huesas (Telde, Gran Canaria),
comercializadas por GILMAR. Ya existe un visor web en three.js en
`showroom.unikdi.com` (`/` clásico, `/new` nuevo) y un panel en `/gestion`
donde el comercial marca cada vivienda como disponible, reservada o vendida.

**Decisión tomada el 15-sep:** se construye además una versión en Unreal
Engine 5.8 que se entrega como **ejecutable de Windows para la pantalla de la
oficina de ventas**. Sin streaming, sin Vagon, sin depender de internet para
el 3D. Cuando cambie el modelo se recompila y se manda el `.exe` nuevo.

El móvil ya está resuelto por la web; no se hace versión Android por ahora.

## Dónde está cada cosa

| Cosa | Dónde |
|---|---|
| Proyecto de Unreal (5.8.2) | `C:\Serenea\Serenea_170926\Serenea_170926.uproject` — **el definitivo, creado el 17-sep. No crear más proyectos.** Contenido importado en `Content/SERENEA_Apolo_17_09_26/`. **Ensayos anteriores, no usar**: `Serenea_160926` (el del duplicado), y en `C:\Serenea\` y `Documents\Unreal Projects\` también `serenea`, `SereneaV6`, `SereneaV6 5.8`, `SERENEA_150926`, `Serenea75`, `Serenea_75`. |
| Este repositorio, clonado en el PC | `D:\Serenea\web` (rama `claude/hopeful-faraday-7y80bt`). Ojo: el proyecto de Unreal está en **C:**, el repositorio en **D:**. |
| Copia de seguridad del modelo | `G:\Unidades compartidas\01 SERENEA BU\04 COMERCIAL_Serenea BU\09 Digital twint - TESTING\Serenea_twin_17.09.26` — **270,8 MB en 6.743 ficheros**: `SERENEA_Apolo_17.09.26.skp` (111 MB), `SERENEA_Apolo_17.09.26.udatasmith` (79 MB) y la carpeta `SERENEA_Apolo_17.09.26_Assets`. Con esos tres se regenera el proyecto entero sin abrir SketchUp. El ZIP de Vagon (`SereneaV6.zip`) queda como archivo muerto. |
| Modelo fuente | SketchUp 2026 en el sobremesa de Fran, con el exportador Datasmith **5.8** (`5_8_200`) instalado. El `.skp` del 17-sep es `SERENEA_Apolo_17.09.26.skp`, y está en la carpeta de copia de arriba. |
| Cómo entra en Unreal | **Por archivo**: en SketchUp, barra Datasmith → *Export* a un `.udatasmith`; en Unreal, **Añadir (+)** → *Datasmith* → *File Import*. Importador Datasmith clásico; *Interchange Datasmith* (experimental) desactivado a propósito. **Para actualizar**: exportar otra vez **al mismo archivo** y clic derecho en el asset DatasmithScene → *Reimportar*; nunca volver a importar. Ver «Actualizar el modelo sin duplicar la escena». |
| Panel y endpoint | `showroom.unikdi.com/gestion` · `/gestion/api/estado.php` |
| Catálogo de viviendas | `data/units.json` (166 entradas: id, planta, dorm, orientacion, supViv, terraza, supTotal, precio) |
| Semilla de estados | `data/availability.json` |

**Nunca** trabajar con el proyecto dentro de una carpeta sincronizada (Drive,
OneDrive). Lo que vive en `G:\Unidades compartidas` es **copia**; el proyecto
se trabaja en `C:\Serenea` y el repositorio en `D:\Serenea\web`.

## Reglas fijas

- Rama de trabajo: `claude/hopeful-faraday-7y80bt`. No crear PR salvo que se pida.
- `[wip]` en el mensaje de commit evita el deploy al hosting.
- Ningún secreto nuevo en el repositorio.
- La sesión local **hace `git pull` antes de tocar el repositorio** y solo
  commitea `docs/` y lo que sea del lado Unreal. El código web (`new/`, `js/`,
  `gestion/`) lo lleva la sesión en la nube; no editarlo desde aquí.
- En Unreal: **guardar a menudo** (Ctrl+Shift+S). El MCP es experimental.
- **No tocar Lightmass** (World Settings). Es iluminación horneada; el
  proyecto va con Lumen y nada de ahí afecta.
- Mantener «Do Not Combine Static Meshes»: cada vivienda tiene que poder
  encenderse, apagarse y cortarse por separado.

## Estado del proyecto de Unreal

Proyecto **definitivo**, `Serenea_170926`, creado el **17-sep por la tarde**
en el sobremesa de Fran (i9, 64 GB, gráfica de 12 GB) con Unreal 5.8.2 y la
plantilla Architecture → Blank (SunSky, ExponentialHeightFog,
PostProcessVolume, CineCameraActor, PlayerStart, InstancedFoliageActor,
Floor). Es el tercer intento: el de Vagon perdió los materiales al abrirlo en
otro PC, y el `Serenea_160926` se quedó con la escena duplicada.

Importado el 17-sep por la tarde desde el fichero
`SERENEA_Apolo_17.09.26.udatasmith`. Verificado por el MCP:

- **Una sola escena Datasmith**, `SERENEA_Apolo_17_09_26`, con 44 hijos
  directos. Que sea una y no dos es lo primero que hay que comprobar tras
  cualquier importación: ver «El día de los dos proyectos».
- **69.296 actores** tras la fase 1. El desglose cuadra al actor con la
  importación del 16-sep más los cortes: 57.111 `StaticMeshActor` (= 57.079
  + los 32 prismas) y 12.143 `Actor` de grupo (= 12.138 + `APOLO_CORTES` y
  sus 4 `CORTE_Pn`). Nada sobra y nada falta.
- El contenido vive en `Content/SERENEA_Apolo_17_09_26/`: `Geometries`
  (6.722), `Materials` (164) y `Textures` (19), más el asset *DatasmithScene*
  `SERENEA_Apolo_17_09_26.uasset` al lado. **No borrarlo**: es el que se
  reimporta. Son 6.906 uassets, uno más de geometría y uno más de material
  que el 16-sep: la caja del prisma y su material.
- **Los prismas `APOLO_CORTES` han entrado**: 32, en cuatro plantas. Ver
  «Los prismas».
- **Fab está disponible en este editor** (botón *Fab* en el Content Browser;
  en el Unreal de Vagon no estaba). Megascans entra directo.
- Máquina: i9-14900KF, 64 GB, **RTX 5070 (12 GB)**, Windows 11, dos monitores.
- MCP oficial: escucha en `127.0.0.1:8000` tras lanzar
  `ModelContextProtocol.StartServer` en la consola del editor. Expone 3
  meta-herramientas y ~52 toolsets descubribles con `list_toolsets`. Python
  3.11 del editor activo: plan B para lo que el MCP no cubra. **Los plugins
  van por proyecto**: ver «Historia útil».

Hecho el 17-sep, **fase 1 completa** (`Main.umap` del 17-sep 20:41):

- **`Floor` borrado**, la losa de plantilla de 10×10 m en el origen.
  69.297 → **69.296 actores**.
- **Los 32 prismas ocultos** con `bVisible = false` en su componente de
  malla, verificado uno a uno, 8 por planta. **La colisión sigue intacta en
  los 32** (`QueryAndPhysics`, perfil `BlockAll`), así que el clic de la
  fase 6 no se rompe.
- Nivel guardado y limpio (`is_dirty = false`).

Hecho el 17-sep, **fase 2**, a falta de que Fran valide el norte a ojo:

- **Exposición congelada**: `Metering Mode` = Auto Exposure Histogram,
  `Exposure Compensation` = 0, `Min EV100` = `Max EV100` = 14, las cuatro
  casillas marcadas, volumen *Unbound*.
- **`SunSky` puesto en la parcela**: latitud 27,986703, longitud −15,395572,
  `Time Zone` 1, *Use Daylight Saving Time* desmarcado, 13 de septiembre,
  `Solar Time` 13,95.
- **`North Offset` = −77,4512°**, calibrado por medición (ver «La parcela y
  el sol»).
- **Lumen ya estaba activo**, no hubo que tocar nada:
  `r.DynamicGlobalIlluminationMethod=1` y `r.ReflectionMethod=1` en
  `Config/DefaultEngine.ini`, más `r.Lumen.HardwareRayTracing=True`.
- Nivel guardado y limpio.
- **Salvedad**: `year` sigue en 2019 porque el MCP **no deja escribirlo**
  (`could not be set: year`). Da igual a efectos prácticos — en el 13-sep la
  declinación solar cambia ~0,1° entre 2019 y 2026 — pero si se quiere
  exacto, se pone a mano en el panel de detalles.

Sin hacer todavía:

- Materiales: ver «Datasmith y los materiales» antes de tocar ninguno.
- Vegetación, coches, entorno, lógica de viviendas, interfaz, empaquetado.

## Actualizar el modelo sin duplicar la escena

**`Añadir (+)` → `Datasmith` → `Import` siempre AÑADE una escena nueva, no
actualiza nunca.** Usarlo sobre un proyecto que ya tiene el modelo deja dos
escenas completas y el doble de actores. Pasó el 17-sep y costó el proyecto
entero.

Para traer una versión nueva del modelo:

1. En SketchUp, barra Datasmith → *Export*, sobre el mismo `.udatasmith`.
2. En Unreal, **botón derecho sobre el asset `SERENEA_Apolo_17_09_26`** en el
   Content Browser → **Reimport**. Eso sustituye en sitio.
3. Comprobar por el MCP que sigue habiendo **un solo** `DatasmithSceneActor`
   y que el recuento no se ha duplicado. Es una llamada y evita el desastre.
4. Reaplicar nuestros overrides: materiales y la ocultación de los prismas.
   Un *Reimport* puede resetear las propiedades por componente, igual que
   hace con los materiales. Debería ir todo en la misma herramienta del
   paso 4 del orden de trabajo.

## Inventario de la escena (fase 0, medido por el MCP el 17-sep)

Medido sobre `Serenea_160926`, pero **vale igual para `Serenea_170926`**: el
desglose por clase del proyecto nuevo cuadra al actor con este más los 37
actores de los cortes. Lo de abajo son, por tanto, las cifras sin prismas.

Nivel `/Game/Main`, **69.260 actores**. Por clase: 57.079 `StaticMeshActor`,
12.138 `Actor` (los nodos de grupo que crea Datasmith), 29 `CineCameraActor`,
y uno de cada: `SunSky_C`, `DatasmithSceneActor`, `PostProcessVolume`,
`ExponentialHeightFog`, `PlayerStart`, `Floor`, `Brush`,
`InstancedFoliageActor`, `WorldSettings`, más 5 actores de sistema.

**No hay ni una carpeta de Outliner** (`get_folders` → 0): todo es jerarquía
de anclaje colgando del `DatasmithSceneActor`, que tiene 43 hijos directos:

| Rama de primer nivel | Hijos directos |
|---|---|
| `SERENEA_APOLO_Central_V4_-_Vista_3D_-_3D_dwg` | **5.757** |
| `SERENEA_V6___Fotovoltaica_orientada_a_fachada_oeste` | 267 |
| `SERENEA_-_terreno_adaptado_al_edificio__sin_escala_` | 231 |
| `SERENEA_V6___Terrazas_plantas_y_muebles_V6` | 160 |
| `SERENEA_V6___Aticos_interiores_V6` | 121 |
| `SERENEA_V6___Cocinas_y_armarios_adicionales_en_aticos` | 56 |
| `SERENEA_V6___Acabados_de_apoyo_en_aticos` | 25 |
| 26 `CineCameraActor` = las escenas de SketchUp (`01___Apolo_y_cuatro_edificios` … `27___Palmeras_canarias`, más `viewport_camera`) | 1 cada una |
| 8 `StaticMeshActor` sueltos: `Componente_3`…`_8`, `Sree`, `Sree_2` | 1 cada uno |

**Corrección importante (17-sep, noche): la rama del DWG NO es «estructura
que no se ve». Es el edificio.** Antes en este documento decía «el DWG de
estructura, confirmado en la escena»; eso era heredar una suposición. Lo
confirmado era que la rama existe y que es la mayor, no qué contiene.

Inspeccionada con una muestra repartida por los 5.757 hijos,
`SERENEA_APOLO_Central_V4_-_Vista_3D_-_3D_dwg` contiene:

- **Carpintería y vidrio**: `VEN-X_Acristalamiento_-_…BAJA_EMISIVIDAD…`,
  `UNIK_VEN_Val-N…`, y las puertas `UNIK_PUE_Pm-N_NHAbatible`,
  `UNIK_PUE_Pm-N_EntradaVivienda` (las 166), `UNIK_PUE_Pet-N_Trastero`.
- **Estructura vista**: `PIE-X_Hormigon_Rectangular_-_NxN_cm`,
  `PIE-X_NxN_-_Cuadrado`.
- **Mobiliario de las viviendas**: sillas, camas, sofás, armarios, neveras,
  lavadoras, muebles de TV, despensas, mesas.

Y las cotas de una muestra los sitúan **dentro del edificio**: x 17–104,
y −40…−19, z 11,6–20,2. O sea que es el modelo BIM del edificio con su
amueblado. **Borrar esa rama dejaría el edificio sin vidrios, sin puertas,
sin pilares y sin muebles**, y es justo lo que se ve al cortar una planta.

Lo mismo con la fotovoltaica: los **534 módulos**
(`Modulo_FV_1722x1134_inclinado_12_grados_hacia_fachada_oeste`, en 267 nodos
`P#_FV_#` y `APOLO_#_#_FV_#`) son placas de cubierta **visibles**, y el
modelo trae una escena de SketchUp dedicada,
`23___Cubiertas_gravilla_y_fotovoltaica`. Es un argumento de venta, no
sobra.

**Lo que de verdad sobra es poquísimo:**

- **`Sree`**: un maniquí de 3D Warehouse de 1,6 m con 20 materiales propios
  (`Sree_Dress`, `Sree_Hair`, `Sree_Pearls`…), en x −0,7…−0,3: **fuera de la
  parcela**, que empieza en x 9,33. Resto claro.
- **`Brush1`**: caja de 20×20×2 m de la plantilla, centrada en el origen y
  también fuera de la parcela.
- `Sree_2`, el segundo maniquí, sí está **dentro** del edificio (x 119,4,
  planta baja). Decidir: puede ser figura de escala a propósito.

**Por tanto, el número de actores no baja borrando, baja fusionando**, y eso
es el paso 9, después de los materiales (fusionar cambia las ranuras de
material, así que antes hay que aplicarlos). Buenos candidatos, porque son
repetidos idénticos y nadie los necesita por separado: los 534 módulos
fotovoltaicos, los ~79 `APA-X_Plazas_Coche`, los 235 `Armario___N`, y los
583 `Pata_corta` y 32 `Neumatico_de_N_segmentos` de muebles y coches.
**No** fusionar lo que tenga que encenderse por vivienda.

**Ancla para emparejar viviendas:** 166 puertas
`UNIK_PUE_Pm-N_EntradaVivienda_-_NxNmm-N-ND`. Es el único elemento de la
escena con cardinalidad exacta 166, así que es el mejor candidato para
emparejar con los ids de `data/units.json` mientras los prismas no estén.

### Lo que ya está bien y lo que no, en números

`SunSky` está **en valores de plantilla, y son de Montreal**: latitud 45,
longitud −73, `Time Zone` −5, *Use Daylight Saving Time* **marcado**,
21-sep-2019, `Solar Time` 13, `North Offset` 0. Todo por poner (ver «La
parcela y el sol»).

`PostProcessVolume`: *Infinite Extent (Unbound)* ya está marcado y el
*Metering Mode* ya es `Auto Exposure Histogram` con su casilla marcada. Pero
`Exposure Compensation` está en **1,263** (la receta pide 0) y Min/Max EV100
están en −10/20 **con las casillas sin marcar**, así que la exposición no
está congelada.

Los 163 materiales son los que generó Datasmith, pero sus nombres ya cubren
casi todo el mapa de «Datasmith y los materiales»:
`APOLO_V6___Monocapa_blanco_roto_5pct_calido`,
`APOLO_V6___Vidrio_claro_transparente`,
`APOLO_V6___Travertino_marfil_veta_vertical`,
`APOLO_V6___PAMESA_WELLS_Ivory_120x60`, `APOLO_V6___Aluminio_plata_grata`,
`V6_Monocapa_contexto` para los edificios vecinos, más `asphalt`,
`sidewalk`, `curb`, `grass`, `glass`, `roof`. Y de las 19 texturas ya
importadas, hay travertino, PAMESA, monocapa, gravilla y tarima, más 9
teselas de ortofoto PNOA de la costa: **para los seis que importan puede que
Megascans no haga falta**.

## Datasmith y los materiales

Cada reimportación desde SketchUp (por archivo o por Direct Link) vuelve a
generar los materiales que creó Datasmith. Por tanto:

- **Los materiales de Datasmith no se editan nunca.** Se sustituyen.
- Se construyen materiales **propios**, con parámetros expuestos, e
  instancias para los que importan.
- Una herramienta **«Aplicar materiales Apolo»** los vuelve a poner después
  de cada reimportación.
- El mapa nombre-Datasmith → material-nuestro vive en un sitio visible para
  poder ampliarlo sin tocar Blueprints.

### Hecho el 17-sep (fase 4)

Todo en **`/Game/Apolo/Materiales/`**, carpeta propia y fuera de la de
Datasmith para que un *Reimport* no la toque.

**Dos maestros**, creados y compilados por el MCP:

| Maestro | Parámetros | Notas |
|---|---|---|
| `M_Apolo_Opaco` | `ColorBase`, `Rugosidad`, `Metalico`, `Tiling`, `Textura` | `Textura × ColorBase` → Base Color; `TexCoord × Tiling` → UVs. La textura por defecto es `/Engine/EngineResources/WhiteSquareTexture`, así que una instancia sin textura sale de color plano. |
| `M_Apolo_Vidrio` | `ColorBase`, `Rugosidad`, `Especular`, `Opacidad`, `Metalico` | `BLEND_Translucent` + `TLM_Surface`. |

**Ocho instancias**, con los valores de la receta de «Materiales»:
`MI_Apolo_Monocapa`, `MI_Apolo_Travertino`, `MI_Apolo_Pamesa`,
`MI_Apolo_Aluminio`, `MI_Apolo_Asfalto`, `MI_Apolo_Acerado`,
`MI_Apolo_Vecinos` y `MI_Apolo_Vidrio`. En las tres que llevan textura
(monocapa, travertino, PAMESA) el `ColorBase` va a blanco y el color lo pone
la textura; en las demás, `ColorBase` es el color de la receta y la textura
es el blanco. `Metalico` a 0 en todas, por herencia del maestro.

**El mecanismo cambió, y a mejor.** El documento planteaba *overrides por
componente*, pero eso son ~57.000 componentes a ~0,2 s: horas. Resulta que
**161 de los 164 materiales de Datasmith son `MaterialInstanceConstant`**
(solo 3 son `Material`), colgados de maestros en `Materials/References/`. Así
que basta **reapadrinarlos a nuestra instancia** con `set_parent`: **una
llamada por material** y cambia toda la escena de golpe, porque la geometría
sigue apuntando al mismo asset.

- Cuesta **~1,1 s por material**. El primero tarda mucho más porque compila
  los shaders de nuestros maestros: conviene lanzarlo en tandas de unos 15
  para no agotar el tiempo de la llamada MCP.
- **Aplicados y verificados los 29** del mapa, de los 161 posibles. Lo que no
  está en el mapa se queda con su material de Datasmith, que es el
  comportamiento seguro.
- **El mapa está en `docs/mapa_materiales_apolo.json`** del repositorio, que
  es la copia versionable, y una copia dentro del proyecto en
  `Content/Apolo/mapa_materiales.json`. Ampliarlo es añadir nombres a las
  listas.
- **Hay que reaplicarlo tras cada *Reimport***, que devuelve los materiales a
  sus padres originales. En la misma pasada debe ir la ocultación de los 32
  prismas, por lo mismo.

Pendiente de la fase 4: dejar la herramienta como script de Python del editor
para que se pueda ejecutar sin el MCP, y decidir si se amplía el mapa a los
132 materiales restantes (mobiliario, cocinas, gimnasio, coches, vegetación),
que de momento siguen con el aspecto que les dio Datasmith.

## La parcela y el sol

`Latitude 27.986703 · Longitude -15.395572`. Canarias es UTC+0 en invierno y
UTC+1 del último domingo de marzo al último de octubre. En el SunSky se pone
el huso **a mano** (`Time Zone` 1 o 0 según la fecha) con «Use Daylight Saving
Time» desmarcado, para que no haya ambigüedad.

Valores verificados con `new/js/visor/sol.js` (algoritmo NOAA, contrastado
contra una implementación independiente, 0,05° de discrepancia máxima):

| Fecha | Mediodía solar | Elevación al mediodía | Orto | Ocaso |
|---|---|---|---|---|
| 13-sep-2026 (UTC+1) | 13:57 | 65,7° | 07:50 | 20:05 |
| 21-jun (UTC+1) | 14:03 | 85,5° | 07:10 | 20:57 |
| 21-dic (UTC+0) | 13:00 | 38,6° | 07:53 | 18:07 |
| 20-mar (UTC+0) | 13:09 | 62,0° | 07:09 | 19:09 |

13-sep, por horas (brújula 0=N, 90=E, 180=S, 270=O): 10:00 → 28,6° / 101,9°;
12:00 → 52,9° / 125,6°; 16:00 → 52,0° / 235,7°; 18:00 → 27,5° / 258,7°.

### El norte, ya calibrado: `North Offset = -77.4512`

Puesto el 17-sep. No hizo falta tantear a ojo, porque **`North Offset` es
exactamente el yaw mundial del norte verdadero**. Se demostró midiendo: con
`northOffset` a 0 y 90, el yaw de la luz direccional pasa de −0,972° a
89,028°, o sea `yaw_luz = azimut − 180 + northOffset`. Para el azimut 0
(norte), el yaw es el propio `northOffset`.

El norte verdadero del modelo salió de **dos referencias independientes que
trae el propio SketchUp**, y coinciden en 0,19°:

- La cámara **`05___Planta_norte_verdadero`**: pitch −90 (cenital) y yaw
  −77,4512°. En una cámara cenital el «arriba de pantalla» es
  `(cos yaw, sin yaw, 0)`, así que el norte está a −77,4512° de +X.
- El objeto **`Norte_verdadero___referencia`** (`StaticMeshActor`, un plano
  de 7,28 × 13,68 m): yaw 12,3631°, cuyo eje largo local −Y cae en −77,637°.

Se adoptó el valor de la cámara, que sale de una fórmula y no de suponer qué
eje del objeto apunta a dónde. La diferencia de 0,19° es irrelevante para las
sombras.

**Comprobación de que la astronomía es correcta.** Con la parcela y la fecha
puestas, `SunSky` reproduce `sol.js` con 0,1° de margen. Ojo: la propiedad
`elevation` del SunSky viene como **180 + elevación real**, y la elevación
real es también el pitch de la luz con el signo cambiado.

| `Solar Time` 13-sep | Unreal (elev / azim) | `sol.js` (elev / azim) |
|---|---|---|
| 10:00 | 28,66° / 101,79° | 28,6° / 101,9° |
| 12:00 | 53,00° / 125,50° | 52,9° / 125,6° |
| 13:57 | 65,78° / 179,03° | 65,7° / ~180° |
| 16:00 | 52,09° / 235,78° | 52,0° / 235,7° |
| 18:00 | 27,56° / 258,76° | 27,5° / 258,7° |

**Lo que sigue pendiente de ojo humano:** que al mediodía solar la sombra
apunte al norte del mapa (Google Maps sobre la parcela), en vista cenital con
`Solar Time 13.95`. La astronomía está comprobada por números; lo que ninguna
medición confirma es que las dos referencias de norte de SketchUp estén bien
puestas.

## Recetas

### Exposición

`PostProcessVolume` → Lens → Exposure. **Marcar la casilla de cada
propiedad** o no hace nada:

| Propiedad | Valor |
|---|---|
| Metering Mode | Auto Exposure Histogram |
| Exposure Compensation | 0 |
| Min EV100 | 14 |
| Max EV100 | 14 |

Min = Max congela la exposición. EV100 es el nivel de luz real: 15 pleno sol,
14 sol claro, 11 cubierto, 8 atardecer, 3 noche. Es el mando que más adelante
se enlaza con la hora del sol. El volumen debe tener **Infinite Extent
(Unbound)** marcado.

**Aplicado el 17-sep** en `Serenea_170926`, con las cuatro casillas marcadas.
En el MCP estas propiedades viven dentro de la struct `Settings` y se llaman
`autoExposureMethod`, `autoExposureBias`, `autoExposureMinBrightness` y
`autoExposureMaxBrightness`; las casillas son los `bOverride_*` de cada una.

Lumen: Project Settings → Global Illumination → Dynamic GI Method = Lumen,
Reflection Method = Lumen. **Ya venía activo** en este proyecto — en
`Config/DefaultEngine.ini` están `r.DynamicGlobalIlluminationMethod=1`,
`r.ReflectionMethod=1` y `r.Lumen.HardwareRayTracing=True` — así que no hay
nada que tocar. (`r.AllowStaticLighting=True` sigue puesto, pero da igual: no
se hornea nada y Lightmass no se toca.)

### Materiales

Metallic **0 en todo**: en un edificio no hay metal desnudo a la vista.
Base Color nunca por encima de 0,7–0,8: con Lumen un blanco al 0,9 rebota
tanto que lava la escena entera (los edificios vecinos son el mayor culpable).

| Material | Base Color | Roughness | Nota |
|---|---|---|---|
| Vidrio | ≈ (0.02, 0.03, 0.03) | 0 | Translucent, Lighting Mode **Surface ForwardShading**, Opacity 0.12, Specular 0.5 |
| Monocapa blanco | ≤ 0.7, algo cálido | 0.75 | |
| Aluminio carpinterías | gris 0.35 | 0.35 | lacado: Metallic 0 |
| Travertino soft touch | textura o (0.62, 0.58, 0.50) | 0.6 | |
| PAMESA Sand | textura o (0.70, 0.64, 0.55) | 0.45 | |
| Asfalto | 0.06 | 0.9 | |
| Acerado | 0.45 | 0.8 | |
| Edificios vecinos | ≈ (0.62, 0.61, 0.58) | 0.8 | bajar del blanco puro |

Texturas: Megascans vía Fab (el plugin de Fab **no está** en este Unreal;
se añade desde el Epic Games Launcher → Library → Fab Library → Add To
Project, o con texturas CC0 de ambientCG / Poly Haven y un material de tres
cables). Siempre **2K**. Las UVs de SketchUp obligan a ajustar `Tiling` en la
instancia. Hierba **seca/mediterránea**, no césped verde. Vegetación canaria
(palmera canaria, buganvilla, adelfa, agave), no árboles centroeuropeos.

### El corte de planta

En la web es un plano de recorte. En Unreal, el equivalente:

1. `Material Parameter Collection` (p. ej. `MPC_Apolo`) con un escalar
   `AlturaDeCorte`.
2. En cada **material maestro** que creó Datasmith (mirar el padre de
   cualquier instancia; son dos o tres y todo lo demás hereda), añadir:
   `AbsoluteWorldPosition.Z > AlturaDeCorte → 0, si no 1` a **Opacity Mask**
   (Blend Mode Masked en los opacos; en los translúcidos, multiplicar la
   Opacity por esa máscara).
3. Cambiar `AlturaDeCorte` corta todo el edificio, mobiliario incluido.
   «Cerrado» = un valor enorme.

Las alturas de corte salen de los prismas: la cara superior de cada
`CORTE_Pn`. Lumen ilumina el interior cortado por sí solo; no hacen falta
luces dentro de las viviendas.

**Ojo: un escalar único no vale.** `data/cortes.json` (lo que hace el visor
web de verdad) no tiene una cota por planta, sino **8 cajones por planta ×
4 plantas = 32 cajas**, cada una con su `y`, porque el edificio está
escalonado en el terreno: la baja va de 6,75 a 11,85 m y el ático de 15,75 a
20,85 m. Cada cajón es un rectángulo en `x`/`z` con su propia cota. Así que
`MPC_Apolo` necesita **una rejilla de cajones con su cota**, no un
`AlturaDeCorte` suelto — que es justo lo que resuelve el shader de
`new/js/visor/cortes.js` con su rejilla de hasta 4 cajones. Decidir esto
antes de montar el paso 5.

### Los prismas: dos familias distintas

**1. Los de SketchUp (`APOLO_CORTES`) son las plataformas de corte, no las
viviendas.** Son 4 grupos × 8 prismas = **32**, verificado por el MCP el
17-sep: `APOLO_CORTES` tiene exactamente cuatro hijos (`CORTE_P1…P4`) y cada
uno ocho `Componente_9_n`. Todos son `StaticMeshActor` independientes («Do
Not Combine» respetado) y comparten la misma malla,
`Geometries/Componente_9`. Los nombres son genéricos de SketchUp, **sin
ningún id de vivienda dentro**.

Corresponden uno a uno con los «cajones» de `data/cortes.json`: cuatro
plantas × ocho plataformas, cada cajón con su `x0,x1,z0,z1` en planta y su
`y` = altura de corte. Sus huellas medidas coinciden **exactamente** — x:
9,33–36,85 / 36,85–68,02 / 68,02–99,44 / 99,44–124,89; y: −42,97–−18,81 /
−18,81–−6,79. Sirven para el corte de planta (la `y` de cada cajón es la
`AlturaDeCorte` de esa plataforma).

(Ojo: los seis `Componente_3…8` sueltos **no** cuelgan de `APOLO_CORTES`,
sino del `DatasmithSceneActor` en el primer nivel. No son prismas.)

**Numeración confirmada: `CORTE_P1` es la baja, no `CORTE_P0`.** Antes se
suponía `P0` = baja y era una planta de desfase.

**2. Las 166 viviendas NO están en el modelo de SketchUp** (el modelo no trae
grupos por vivienda). Se dedujeron de tabiques, puertas y pavimentos con
`tools/viviendas_serenea.mjs` y están en **`data/viviendas_serenea.json`**:
166 entradas por id (`"101"`…), cada una con `planta`, `plataforma` (0–7, la
misma numeración que el orden de los cajones de `cortes.json`), `poligono` =
`[[x, z], …]` en planta, `y0`/`y1` = suelo y techo del prisma, más `entrada`,
`vidrios`, áreas. Es la misma fuente que usa el visor web para el clic, el
color de estado y la cartela.

**Por tanto, en Unreal las 166 viviendas se generan**, no se importan: un
prisma por vivienda extruyendo `poligono` de `y0` a `y1` (Geometry Script:
`append_simple_extrude_polygon` sobre un DynamicMesh → StaticMesh
`SM_VIV_<id>`; simplificar antes el polígono a ~10 cm, que trae escalones de
5 cm de la rasterización), actor `VIV_<id>` con tag `vivienda:<id>`, colisión
en canal Visibility, material translúcido con color y opacidad como
parámetros (opacidad 0 en reposo). Igual que en la web: clic, estado,
cartela.

### El marco de coordenadas, ya calibrado

Los dos JSON están en el marco del GLB de la web: metros, Y arriba,
`poligono`/cajones en el plano (x, z). Unreal viene de SketchUp por
Datasmith: centímetros, Z arriba.

**Calibrado el 17-sep** contra los 32 prismas, comparando la cara superior de
cada uno con las cotas de `cortes.json`. Sale un desfase **único** de
**20,49 m**, y con las cuatro plantas el emparejamiento es el único posible:

| `cortes.json` | Unreal | Cota sup. del primer cajón |
|---|---|---|
| `baja` | `CORTE_P1` | 32,34 m ↔ 11,85 |
| `p1` | `CORTE_P2` | 35,34 m ↔ 14,85 |
| `p2` | `CORTE_P3` | 38,34 m ↔ 17,85 |
| `atico` | `CORTE_P4` | 41,34 m ↔ 20,85 |

La transformación, en metros:

```
Unreal.x =  web.x
Unreal.y =  web.z
Unreal.z =  web.y + 20,49
```

Y para pasarlo a lo que consume el motor, **×100**, que Unreal trabaja en
centímetros. No hay permutación rara ni signos invertidos: la `y` de la web
(altura) pasa a `z`, la `z` de la web pasa a `y` tal cual, y el único ajuste
es el desplazamiento vertical. Las huellas en `x`/`y` de los 32 prismas salen
idénticas a los cajones sin tocar nada, que es la comprobación de que los
signos están bien.

Esa misma transformación se aplica a los 166 polígonos de
`viviendas_serenea.json`.

Referencia del visor: el centro de la parcela en el marco de la web es
(x = 66,72, z = −23,94), `new/js/visor/main.js`.

### Estado actual de los 32

**Ocultos con `bVisible = false`** en el componente de malla, los 32, uno a
uno (fase 1, 17-sep). **La colisión está intacta** en todos
(`QueryAndPhysics`, perfil `BlockAll`), así que siguen recibiendo el trazado
del ratón aunque no se dibujen. Se hizo así y no con el ojo del Esquematizador
porque **el ojo no llega al ejecutable**: el bloque rosa reaparecería en el
`.exe`. Aviso: un *Reimport* puede resetearlo, como hace con los materiales,
así que esto debe entrar en la herramienta «Aplicar materiales Apolo».

**Pendiente de comprobar en la fase 6:** la malla `Componente_9` **no tiene
colisión simple** — su `aggGeom` está vacío y el `collisionTraceFlag` es
`CTF_UseDefault`. El trazado tiraría de la colisión compleja, triángulo a
triángulo, que para una caja son 12 y normalmente funciona. Si falla, se
arregla añadiendo una caja de colisión simple a esa malla. Lo mismo habrá que
vigilar en las mallas generadas de las viviendas.

## Plantas: tres nombres para lo mismo

Los cuatro nombres, ya **verificados por el MCP** (antes había una planta de
desfase en esta tabla):

| `data/units.json` (`planta`) | ids | Protocolo (`orden: planta`) | `cortes.json` | Unreal |
|---|---|---|---|---|
| `Baja` (38) | 1xx | `baja` | `baja` | **`CORTE_P1`** |
| `1ª` (46) | 2xx | `p1` | `p1` | **`CORTE_P2`** |
| `2ª` (46) | 3xx | `p2` | `p2` | **`CORTE_P3`** |
| `Ático` (36) | 4xx | `atico` | `atico` | **`CORTE_P4`** |
| — | — | `all` | — | edificio cerrado |

Los ids de `data/units.json` son cadenas y van de `"101"` a `"436"`: la
centena da la planta.

## Arquitectura del ejecutable

```
   Apolo.exe (Windows, Shipping)
   ├── Interfaz: la de showroom.unikdi.com/new, en HTML/CSS/JS,
   │   dibujada encima del 3D por el plugin Web UI (Tracer Interactive,
   │   Fab, versión para 5.8). Fondo transparente, clics que pasan al 3D.
   │        │  JSON, en los dos sentidos (puente del plugin)
   │        ▼
   ├── Blueprint que interpreta los mensajes de docs/PROTOCOLO_STREAMING.md
   │   (8 órdenes, 6 eventos). Solo pinta: corte, prismas, cámara, sol.
   └── Escena de Unreal
```

Puntos clave:

- **El protocolo es el de `docs/PROTOCOLO_STREAMING.md` tal cual.** Cambia
  el transporte (antes WebSocket a Vagon, ahora el puente de Web UI), no los
  mensajes. La sección de Vagon de ese documento ya no aplica.
- **La lógica comercial no entra en Unreal.** El JavaScript de la interfaz
  pide `/gestion/api/estado.php` (igual que hace `new/js/api.js` hoy) y manda
  a Unreal la orden `estados` con el mapa resuelto. Con eso **no hace falta ni
  C++ ni VaRest** para HTTP: la parte «En Unreal» de
  `docs/PANEL_Y_EJECUTABLE.md` queda sustituida por esto.
- Sin internet: la interfaz lleva empaquetada `data/availability.json` como
  último recurso, y Blueprint guarda el último mapa recibido (SaveGame) para
  arrancar con él si la petición falla. Timeout corto: nunca colgar el
  arranque delante de un cliente.
- **La interfaz ya está separada del motor (hecho el 17-sep).**
  `new/unreal.html` es la página que va dentro del `.exe`;
  `new/js/motor/puente.js` traduce la interfaz al protocolo y
  `new/js/motor/transporte.js` habla con Web UI. Cómo se conecta, qué manda
  al arrancar y qué queda por confirmar dentro del plugin: sección «Notas de
  implementación» de `docs/PROTOCOLO_STREAMING.md`. Para ver la interfaz sin
  Unreal: `showroom.unikdi.com/new/?motor=unreal&simulador=1`.
- Si Web UI diera problemas, se sustituye por UMG **sin tocar los
  Blueprints**: reciben los mismos mensajes venga quien venga.
- Encuadres de cámara (`vista`: conjunto, edificio, planta, plano): los
  valores están en `new/js/visor/camara.js` (azimut, elevación, distancia,
  objetivo). Pasan a CineCameraActors.
- `hora` y `fecha` van directos al SunSky (`Solar Time`, día, mes, huso según
  la regla de arriba). `sol.js` no hace falta en Unreal.
- `escaparate`: a los 90 s sin tocar nada, modo atracción (órbita lenta o el
  vídeo cuando exista). Cualquier entrada lo corta.

## Máquina de destino y empaquetado

- Oficina de ventas: gráfica dedicada obligatoria (RTX 3060 o equivalente,
  16 GB RAM). Si GILMAR no la tiene, un mini-PC propio en el showroom.
- Empaquetar: File → Package Project → Windows, configuración Shipping.
  Esperar 3–6 GB. Se entrega por USB o enlace; cada cambio de modelo es un
  envío completo (motivo de más para que los estados vayan por el endpoint).
- PC de trabajo de Fran: i9, 64 GB, gráfica de 12 GB. Sobra.

## Orden de trabajo propuesto

Todo referido a `Serenea_170926`.

1. ~~Guardar. Borrar `Floor`. Ocultar los prismas. Guardar.~~ **Hecho el
   17-sep** (fase 1 completa).
2. ~~Exposición, `SunSky` y `North Offset`.~~ **Hecho el 17-sep**, y Lumen ya
   venía activo. Falta solo que Fran valide la sombra a ojo.
3. ~~Borrar lo que nunca se ve.~~ **Se cae: no hay casi nada que borrar.**
   Inspeccionado el 17-sep, la rama del DWG es el edificio (vidrios, puertas,
   pilares y muebles) y la fotovoltaica se ve y es argumento de venta. Solo
   sobran `Sree` y `Brush1`, los dos fuera de la parcela: dos actores de
   69.296. La bajada de actores se hace **fusionando** en el paso 9, que va
   después de los materiales. Ver «Inventario de la escena».
4. **Casi hecho el 17-sep**: los dos maestros, las ocho instancias y el mapa
   aplicado a 29 materiales por reapadrinamiento. Falta dejar la herramienta
   como script de Python del editor (que reaplique también la ocultación de
   los prismas), probarla con un *Reimport*, y decidir si se amplía el mapa a
   los 132 materiales restantes. Ver «Datasmith y los materiales».
5. ← **Aquí.** `MPC_Apolo` + máscara de corte en **nuestros** maestros (no en
   los de Datasmith). **Con rejilla de 8 cajones por planta, no con un
   escalar**: ver «El corte de planta». El MCP tiene
   `create_parameter_collection`.
6. Generar los 166 prismas de vivienda desde `data/viviendas_serenea.json`
   con la transformación ya calibrada (ver «Los prismas»); material de
   estado con parámetros. Confirmar de paso que la colisión responde al
   trazado, que las mallas vienen sin colisión simple.
7. Web UI: widget a pantalla completa con `new/unreal.html` (copiar `new/`
   y `assets/` juntos a la carpeta de interfaz del proyecto y cargarla con
   *Load File*; es un solo archivo clásico con los datos dentro, así que
   funciona desde disco), transparencia de ratón, y los 14 manejadores en
   Blueprint: 8 órdenes que entran por *On Interface Event* con
   `Name = "apolo"` y el JSON en `Data`, 6 eventos que salen con *Call*
   (`Function = "apolo"`). Antes de nada, confirmar los dos puntos «por
   confirmar» de `docs/PROTOCOLO_STREAMING.md` (nombres del plugin y la
   petición al panel desde disco).
8. Cámaras, sol enlazado a `hora`/`fecha`, escaparate.
9. Vegetación canaria, coches, entorno. **Fusionar los repetidos** (534
   módulos fotovoltaicos, ~79 coches, 235 armarios, patas y neumáticos) para
   bajar el número de actores; ver «Inventario de la escena». Lo que no
   necesite ser
   independiente para bajar el número de actores.
10. Empaquetar, probar en un PC que no sea el de desarrollo.

## El día de los dos proyectos (17-sep)

Cómo se perdió `Serenea_160926`, para no repetirlo:

1. Los prismas no habían entrado en la importación del 16-sep. Para traerlos,
   se volvió a usar **`Añadir (+)` → `Datasmith` → `Import`** sobre el
   proyecto que ya tenía el modelo.
2. Eso no actualizó nada: **añadió una segunda escena completa**. 69.259 →
   138.542 actores, dos `DatasmithSceneActor` los dos etiquetados
   `SERENEA_Apolo_v75`, con **cero etiquetas en común** (la nueva llevaba
   todos los hijos con sufijo `_2`, y la rama del DWG con `_3`). Solo la
   nueva tenía `APOLO_CORTES`.
3. Quitar la escena vieja por el MCP resultó **inviable**:
   `remove_from_scene` **no arrastra a los hijos** (se borró un grupo de 26
   actores y el total bajó exactamente 1), así que habrían sido ~69.000
   llamadas a ~0,2 s, unas cuatro horas.
4. La salida correcta era el editor: seleccionar el `DatasmithSceneActor`
   sobrante → botón derecho → *Select* → *Select All Descendants* → `Supr`.
   Segundos.
5. Lo que se hizo al final fue más limpio: cerrar Unreal **sin guardar** y
   **empezar un proyecto nuevo** (`Serenea_170926`) importando desde
   **fichero** `.udatasmith` en vez de por Direct Link. Salió a la primera y
   verificado: una escena, 69.297 actores, los 32 prismas dentro.

Lección corta: **tras cualquier importación, contar los `DatasmithSceneActor`
antes de seguir.** Es una llamada al MCP y se ve el problema en el momento, no
cuando el Esquematizador marca el doble de actores.

## Historia útil (para no repetir errores)

- El instalador MSI del exportador Datasmith falla con **error 2872** en
  todas las máquinas: apunta a una carpeta `SketchUp2020UserPlugins` que no
  existe en el paquete. Se instala saltándose la interfaz:
  `Start-Process msiexec -Wait -ArgumentList '/i','<ruta.msi>','/qn','/norestart','SKETCHUP2026CHECKED=1'`
  en PowerShell como administrador. Deja el plugin en
  `C:\ProgramData\SketchUp\SketchUp 2026\SketchUp\Plugins\`.
- Unreal 5.7 rechazaba `.udatasmith` («Unknown extension») porque el plugin
  Datasmith Importer estaba marcado sin reiniciar. En 5.8, reiniciado, entra.
- Los logs de MSI y muchos de Unreal son UTF-16: en PowerShell, leerlos con
  `-Encoding Unicode`.
- Vagon (Cloud Computer) cobra mientras la máquina está encendida aunque te
  desconectes. Ya no se usa; la cuenta se cancela.
- Mover un proyecto de Unreal entre PCs borrando `Saved`, `Intermediate` y
  `DerivedDataCache` es correcto, pero al abrirlo hay que esperar a que
  recompile **todos** los shaders (mientras tanto todo sale gris) y la cámara
  del editor arranca en el origen. El 15-sep se interpretó como «se han
  perdido los materiales» y se optó por empezar de cero.
- En 5.8, el botón de Datasmith no está en la barra: está dentro de
  **Añadir (+)** → *Datasmith* → *Direct Link Import* / *File Import*.
- Con el exportador 5.8 y SketchUp 2026, el triángulo de versiones es:
  SketchUp 2026 ↔ exportador 5.8 ↔ Unreal 5.8. Un exportador de otra versión
  no hace Direct Link con este motor.

- **Los plugins de Unreal se habilitan por proyecto.** Al estrenar
  `Serenea_170926`, `ModelContextProtocol.StartServer` no hacía nada y el
  8000 seguía muerto: el comando no existía porque el `.uproject` nuevo no
  llevaba los plugins. En un proyecto nuevo hay que añadir **los dos**:

  ```json
  { "Name": "ModelContextProtocol", "Enabled": true },
  { "Name": "AllToolsets",          "Enabled": true }
  ```

  Por la interfaz: Edit → Plugins, marcar «Model Context Protocol» y «All
  Toolsets». **Y reiniciar el editor**, que si no no entran. Luego,
  `ModelContextProtocol.StartServer` en la consola: el servidor **no arranca
  solo** al abrir el proyecto.

## Cómo se maneja el MCP del editor (aprendido a base de intentos)

- `call_tool` necesita **los dos** argumentos: `toolset_name` *y* `tool_name`,
  y `tool_name` va **corto** (`get_current_level`, no la ruta completa).
  Pasar solo el nombre largo da «Tool not found».
- `describe_toolset` quiere el parámetro `toolset_name` (no `toolset`).
- **Nunca pedir los 69.260 actores y tirar de ellos uno a uno.** Cada llamada
  suelta cuesta ~0,2 s: mil `get_label` son cuatro minutos y el MCP se va a
  segundo plano. Todo lo que sea recorrer la escena va en un script de
  `ProgrammaticToolset.execute_tool_script`, que agrega en el editor y
  devuelve solo el resumen. Dentro del script, `execute_tool()` sí usa el
  nombre largo del tool.
- `find_actors` filtra `name` por **subcadena de la etiqueta, sin distinguir
  mayúsculas**. Cuidado con los falsos positivos: buscar `cort` devuelve 587
  `Pata_corta`, y `VIV` devuelve las 166 puertas `EntradaVivienda`.
- `find_actors(root=X)` **no es recursivo**: devuelve `X` más sus hijos
  directos. Para contar un subárbol hay que bajar a mano, nivel a nivel.
- `AttachChildren` no se puede leer con `ObjectTools.get_properties`. Para la
  jerarquía, usar `find_actors(root=…)`.
- Los nombres de propiedad de `ObjectTools` van en **camelCase**
  (`northOffset`, `solarTime`, `useDaylightSavingTime`) y no siempre coinciden
  con la etiqueta del editor; sacarlos primero con `list_properties`, porque
  pedir uno que no existe aborta la llamada entera.
- La exposición del `PostProcessVolume` vive en la struct `Settings` (463
  claves). Las casillas del editor son los `bOverride_*`: sin marcarlos, el
  valor no hace nada.
- Para saber qué proyecto hay abierto de verdad, la línea de comandos del
  proceso es lo más fiable:
  `Get-CimInstance Win32_Process -Filter "Name like 'UnrealEditor%'"`.
- Si una propiedad de un `set_properties` falla, **aborta el script entero** —
  y un `try/except` alrededor **no lo atrapa**, porque el error no llega como
  excepción de Python. Ojo, **no es todo o nada**: las propiedades que sí
  valían quedan aplicadas (comprobado con `blendMode`, que se aplicó aunque
  `translucencyLightingMode` fallara en la misma llamada). Cuando haya dudas,
  una propiedad por llamada.
- **`write_file` y `read_file` quieren rutas de disco, no rutas `/Game/`.**
  Pasar `/Game/Apolo/x.json` lo interpreta como `C:\game\apolo\x.json` y lo
  rechaza. La ruta buena es
  `C:/Serenea/Serenea_170926/Content/Apolo/x.json`.
- En materiales translúcidos, «Surface ForwardShading» de la interfaz es
  **`TLM_Surface`** en el enum; `TLM_SurfaceForwardShading` no existe en 5.8.
- Las operaciones que recompilan shaders (`set_parent` sobre una instancia,
  `recompile`) cuestan ~1 s cada una, y la primera de una tanda mucho más
  porque compila el maestro. Trocear en tandas de ~15.
- **`year` del SunSky no se puede escribir** por el MCP (`could not be set:
  year`). El resto (`latitude`, `longitude`, `timeZone`,
  `useDaylightSavingTime`, `month`, `day`, `solarTime`, `northOffset`) sí.
- La propiedad `elevation` del SunSky vale **180 + la elevación real**.
  `dayOfMonth`, `solarElevation` y `solarAzimuth` **no existen**: son `day`,
  `elevation` y `azimuth`.
- Para las propiedades del sol y de la luz, el `SunSky` está en el origen con
  rotación 0, así que la `relativeRotation` de su `directionalLight` es
  también la rotación en mundo.
- `ObjectTools.set_properties` sobre una struct grande como `Settings` del
  `PostProcessVolume` funciona **leyéndola entera, parcheando las claves y
  devolviéndola completa**. No hace falta (ni funciona bien) tocar campos
  anidados sueltos.
- **El servidor MCP no arranca solo.** Cada vez que se abre o reinicia el
  editor hay que volver a lanzar `ModelContextProtocol.StartServer`. Pasó dos
  veces el 17-sep. Se comprueba desde fuera con
  `Get-NetTCPConnection -LocalPort 8000 -State Listen`.
