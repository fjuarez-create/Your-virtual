# Apolo en Unreal: estado, decisiones y recetas

Documento de traspaso. Está pensado para que una sesión de Claude Code que
corra **en el PC de Fran, con el editor de Unreal abierto y el MCP oficial
conectado**, pueda ponerse a trabajar sin tener que releer nada más. Todo lo
que aquí se afirma está verificado salvo donde pone «sin confirmar».

Fecha de este estado: 17 de septiembre de 2026 (proyecto `Serenea_160926`,
importado por Direct Link y guardado; escena inventariada por el MCP).

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
| Proyecto de Unreal (5.8.2) | `C:\Serenea\Serenea_160926\Serenea_160926.uproject` (confirmado por el log del editor) — proyecto del 16-sep, plantilla Architecture → Blank. En `C:\Serenea\` y en `Documents\Unreal Projects\` hay varios ensayos anteriores (`serenea`, `SereneaV6`, `SereneaV6 5.8`, `SERENEA_150926`, `Serenea75`, `Serenea_75`): **no usarlos**. |
| Este repositorio, clonado en el PC | `D:\Serenea\web` (rama `claude/hopeful-faraday-7y80bt`). Ojo: el proyecto de Unreal está en **C:**, el repositorio en **D:**. |
| Copia de seguridad | El proyecto de Vagon (`SereneaV6.zip` en Drive, `09 Digital twint - TESTING`) queda como archivo muerto: no se reutiliza. El proyecto nuevo se regenera desde SketchUp por Direct Link, pero en cuanto tenga trabajo encima (materiales, Blueprints) hay que hacerle copia igual. |
| Modelo fuente | SketchUp 2026 en el sobremesa de Fran, con el exportador Datasmith **5.8** (`5_8_200`) instalado. El `.skp` se llama `SERENEA_Apolo_v7`, y probablemente `SERENEA_Apolo_v75`: Datasmith bautiza la escena con el nombre del fichero de SketchUp y en Unreal entró como `SERENEA_Apolo_v75`. **Sin confirmar**: el `.skp` no está en este PC, hay que mirarlo en SketchUp. |
| Cómo entra en Unreal | **Datasmith Direct Link**, no por archivo. En SketchUp: barra Datasmith → *Synchronize*. En Unreal: botón **Añadir (+)** → *Datasmith* → *Direct Link Import*. Importador Datasmith clásico; *Interchange Datasmith* (experimental) **desactivado** a propósito. |
| Panel y endpoint | `showroom.unikdi.com/gestion` · `/gestion/api/estado.php` |
| Catálogo de viviendas | `data/units.json` (166 entradas: id, planta, dorm, orientacion, supViv, terraza, supTotal, precio) |
| Semilla de estados | `data/availability.json` |

**Nunca** trabajar con el proyecto dentro de una carpeta sincronizada (Drive,
OneDrive). El ZIP en Drive es copia; se trabaja en `D:\Serenea`.

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

Proyecto **nuevo**, creado el 16-sep en el sobremesa de Fran (i9, 64 GB,
gráfica de 12 GB) con Unreal 5.8.2 y la plantilla Architecture → Blank
(SunSky, ExponentialHeightFog, PostProcessVolume, CineCameraActor,
PlayerStart, InstancedFoliageActor, Floor). El proyecto de Vagon del sábado
no se reutiliza: al abrirlo en otro PC perdió los materiales y se decidió
empezar de cero.

Hecho el 16-sep (el log del editor fecha el import:
`Imported SERENEA_Apolo_v75 in 36.9 s`, 16-sep 18:09):

- Importado por **Direct Link** desde SketchUp (`SERENEA_Apolo_v75`; Fran confirma que el v7 es el mismo modelo que el v6 de la web, sin cambios de geometría ni de ids).
  **69.260 actores**, medidos por el MCP el 17-sep. (Los 126.386 que se
  anotaron el 16-sep eran del proyecto de ensayo anterior; en este no.)
- El contenido vive en `Content/SERENEA_Apolo_v75/` — **con el 5 final**, no
  `v7` — en `Geometries` (6.721 assets), `Materials` (163) y `Textures` (19),
  más el asset *DatasmithScene* `SERENEA_Apolo_v75.uasset` (80 MB) al lado.
  Ese asset es el que se re-sincroniza; no borrarlo. 6.904 uassets en total.
- **El nivel está guardado**: `Content/Main.umap` (210 MB) del 16-sep 19:10,
  y el MCP da `is_dirty(/Game/Main) = false`. Los 5.214 assets que había sin
  guardar ya se guardaron.
- **Los prismas `APOLO_CORTES` NO han entrado en este proyecto** (el MCP
  no encuentra ni actores ni assets con «cort» o «prisma»). En el proyecto
  de ensayo del 15-sep sí entraron, así que el modelo los tiene: lo más
  probable es que la etiqueta estuviera **oculta en SketchUp** al sincronizar,
  y Direct Link no exporta lo oculto. Arreglo: en SketchUp, etiqueta de los
  prismas visible → *Synchronize* → en Unreal, reimportar el asset
  DatasmithScene → ocultarlos **en Unreal** (ojo del Outliner), nunca en
  SketchUp. Sin los prismas no hay clic, ni estados, ni corte: bloquea las
  fases 3 en adelante.
- **Fab está disponible en este editor** (botón *Fab* en el Content Browser;
  en el Unreal de Vagon no estaba). Megascans entra directo.
- Máquina: i9-14900KF, 64 GB, **RTX 5070 (12 GB)**, Windows 11, dos monitores.
- MCP oficial arrancado el 16-sep con `ModelContextProtocol.StartServer`:
  escucha en `127.0.0.1:8000`; expone 3 meta-herramientas y ~52 toolsets
  descubribles con `list_toolsets` (actores, assets, Blueprints, materiales,
  instancias, escena, mallas, texturas, UMG, logs, Python…). Python 3.11 del
  editor activo: plan B para lo que el MCP no cubra.

Sin hacer todavía (nada de lo del sábado se conserva):

- Borrar `Floor` (la losa de plantilla de 10×10 m en el origen; sigue ahí).
- Exposición, `North Offset`, Lumen (recetas abajo).
- Materiales: ver «Direct Link y los materiales» antes de tocar ninguno.
- Vegetación, coches, entorno, lógica de viviendas, interfaz, empaquetado.

La web (`/new`) usa el v6 y, según Fran, el v7 es idéntico: los ids de
`data/units.json` valen tal cual para emparejar prismas.

## Inventario de la escena (fase 0, medido por el MCP el 17-sep)

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

El **DWG de estructura sí está**, y es el grueso de la escena: esa rama de
5.757 hijos es el primer sitio donde mirar para bajar el número de actores.

Candidatos a borrar que salieron en el barrido:

- **534 módulos fotovoltaicos** (`Modulo_FV_1722x1134_inclinado_12_grados_hacia_fachada_oeste`,
  agrupados como `APOLO_18_142_FV_nnn` y tres cotas más: 19_542, 20_942,
  22_342). Son placas de cubierta, no prismas: los nombres se parecen y
  confunden.
- **`Sree`**: un maniquí de 3D Warehouse, con 20 materiales propios
  (`Sree_Dress`, `Sree_Hair`, `Sree_Pearls`, `Sree_Watch`…).
- 583 `Pata_corta` y 32 `Neumatico_de_N_segmentos`: mobiliario y coches
  modelados pata a pata y neumático a neumático.

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
casi todo el mapa de «Direct Link y los materiales»:
`APOLO_V6___Monocapa_blanco_roto_5pct_calido`,
`APOLO_V6___Vidrio_claro_transparente`,
`APOLO_V6___Travertino_marfil_veta_vertical`,
`APOLO_V6___PAMESA_WELLS_Ivory_120x60`, `APOLO_V6___Aluminio_plata_grata`,
`V6_Monocapa_contexto` para los edificios vecinos, más `asphalt`,
`sidewalk`, `curb`, `grass`, `glass`, `roof`. Y de las 19 texturas ya
importadas, hay travertino, PAMESA, monocapa, gravilla y tarima, más 9
teselas de ortofoto PNOA de la costa: **para los seis que importan puede que
Megascans no haga falta**.

## Direct Link y los materiales

Cada *Synchronize* desde SketchUp vuelve a generar los materiales que creó
Datasmith. Por tanto:

- **Los materiales de Datasmith no se editan nunca.** Se sustituyen.
- Se construyen materiales **propios**: maestros (`M_Apolo_Opaco`,
  `M_Apolo_Vidrio`, `M_Apolo_Suelo`…) con parámetros expuestos, e
  instancias para los seis que importan, con texturas Megascans a 2K.
- Una herramienta **«Aplicar materiales Apolo»** (Editor Utility Blueprint,
  script de Python del editor, o directamente por el MCP) recorre la escena y
  asigna cada material nuestro **por el nombre del material de SketchUp**
  (`APOL…claro` → `MI_Apolo_Monocapa`, etc.), como *override* en el
  componente. Se ejecuta en segundos después de cada sincronización.
- El mapa nombre-SketchUp → material-nuestro vive en un sitio visible (un
  DataTable o el propio script) para poder ampliarlo sin tocar Blueprints.

Es la **primera tarea** de la sesión local con el MCP, antes que cualquier
afinado a mano.

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

**Calibrar el norte:** a esta latitud, al mediodía solar la sombra apunta
exactamente al norte, todos los días del año. Poner `Solar Time 13.95` el
13-sep, vista cenital, y girar `North Offset` hasta que las sombras apunten
al norte del mapa (Google Maps sobre la parcela). Comprobación: a las 10:00 el
sol al este-sureste y bajo; a las 18:00 al oeste y bajo.

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

Lumen: Project Settings → Global Illumination → Dynamic GI Method = Lumen,
Reflection Method = Lumen.

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

### Los prismas

Uno por vivienda, agrupados por planta bajo `APOLO_CORTES`. Hacen cuatro
cosas, las mismas que en la web:

- **Clic**: reciben el trazado del ratón (colisión activada, canal Visibility).
- **Color de estado**: material translúcido con color y opacidad como
  parámetros; opacidad 0 cuando no toca verse.
- **Cartela**: punto de anclaje de la etiqueta.
- **Corte**: su altura es la de la planta.

Falta emparejar cada prisma con su id de `data/units.json`. Los ids son
cadenas (`"214"`). Mirar el nombre o los metadatos Datasmith de cada
componente.

## Plantas: tres nombres para lo mismo

| `data/units.json` (`planta`) | Protocolo (`orden: planta`) | SketchUp / Outliner |
|---|---|---|
| `Baja` (38) | `baja` | `CORTE_P0` (sin confirmar) |
| `1ª` (46) | `p1` | `CORTE_P1` |
| `2ª` (46) | `p2` | `CORTE_P2` |
| `Ático` (36) | `atico` | `CORTE_P3` (visto) |
| — | `all` | edificio cerrado |

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
- La sesión en la nube separa la interfaz del motor three.js en `new/` para
  que la misma interfaz corra en el navegador (con three.js debajo) y dentro
  del `.exe` (con Unreal debajo). Hasta que eso esté, el lado Unreal puede
  construir los manejadores contra el protocolo con una página de prueba.
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

1. ~~Guardar~~ (hecho: el nivel estaba limpio). Borrar `Floor` ← **aquí**.
   Ocultar `APOLO_CORTES` no procede: no está en la escena.
2. Exposición (`Min EV100 = Max EV100 = 14`, y `Exposure Compensation` de
   1,263 a 0) y `North Offset` calibrado. `SunSky` entero, que sigue en
   Montreal.
3. Traer los prismas (ver arriba) y borrar lo que nunca se ve: la rama
   `SERENEA_APOLO_Central_V4_-_Vista_3D_-_3D_dwg` (5.757 hijos, el DWG de
   estructura, confirmado en la escena), los 534 módulos fotovoltaicos y
   `Sree`.
4. Juego de materiales propios + herramienta «Aplicar materiales Apolo» por
   nombre. Probarla haciendo un *Synchronize* y viendo que sobrevive.
5. `MPC_Apolo` + máscara de corte en **nuestros** maestros (no en los de
   Datasmith). Probar con `AlturaDeCorte`.
6. Emparejar prismas ↔ ids; material de estado con parámetros.
7. Web UI; widget con una página de prueba; los 14 manejadores en Blueprint
   contra el protocolo.
8. Cámaras, sol enlazado a `hora`/`fecha`, escaparate.
9. Vegetación canaria, coches, entorno. Fusionar lo que no necesite ser
   independiente para bajar el número de actores.
10. Empaquetar, probar en un PC que no sea el de desarrollo.

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
