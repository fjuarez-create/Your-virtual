# Apolo en Unreal: estado, decisiones y recetas

Documento de traspaso. Está pensado para que una sesión de Claude Code que
corra **en el PC de Fran, con el editor de Unreal abierto y el MCP oficial
conectado**, pueda ponerse a trabajar sin tener que releer nada más. Todo lo
que aquí se afirma está verificado salvo donde pone «sin confirmar».

Fecha de este estado: 15 de septiembre de 2026.

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
| Proyecto de Unreal (5.8) | `D:\Serenea\SereneaV6\SereneaV6.uproject` |
| Este repositorio, clonado en el PC | `D:\Serenea\web` (rama `claude/hopeful-faraday-7y80bt`) |
| Copia de seguridad del proyecto | ZIP en Google Drive, `09 Digital twint - TESTING` |
| Modelo fuente | SketchUp 2026 en el PC de Fran, con el exportador Datasmith 5.8 instalado |
| Exportación usada | `SERENEA_Apolo_v6_Entrega.udatasmith` (75,7 MB) + carpeta `_Assets` |
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

Plantilla Architecture → Blank, que trae SunSky, ExponentialHeightFog,
PostProcessVolume, CineCameraActor, PlayerStart, InstancedFoliageActor.

Hecho el 13-sep:

- Importado por Datasmith (Interchange) en el nivel `Main`. **69.288 actores.**
- Los prismas de corte que Fran modeló en SketchUp han entrado con su
  jerarquía: `SERENEA_Apolo_v6_Entrega → APOLO_CORTES → CORTE_P3 → Componente_9…`.
  Están **ocultos en el editor** (ojo del Outliner). Son la capa de interacción
  completa (ver más abajo).
- SunSky con las coordenadas de la parcela.
- El actor `Floor` de la plantilla, borrado.
- Materiales de SketchUp importados con sus nombres (`APOL…alido`, `APOL…claro`,
  `APOLO…tical`, `APOL…mate`…). Fran empezó a afinarlos a mano.

**Sin confirmar** (preguntar o mirar antes de dar por hecho):

- Exposición: se dio un `Exposure Compensation = 10` erróneo que quemaba la
  imagen. El arreglo es `Min EV100 = Max EV100 = 14` (receta abajo). No se
  sabe si quedó aplicado.
- `North Offset` del SunSky: no se sabe si se calibró. Si está mal, todas las
  sombras mienten.
- Si se borró el grupo `SERENEA_APOLO_Central_V4_-_Vista_3D_-_3D_dwg`
  (pilotes y cimentación de un DWG: miles de actores que nunca se ven).
- Si el vidrio y la fachada llegaron a cambiarse.

Pendiente de todo: vegetación, coches, entorno, lógica de viviendas,
interfaz, empaquetado.

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

1. Confirmar exposición y norte. Guardar.
2. Borrar el DWG de estructura si sigue ahí. Guardar.
3. Vidrio y fachada (receta). Luego suelos con texturas.
4. `MPC_Apolo` + máscara de corte en los maestros. Probar con `AlturaDeCorte`.
5. Emparejar prismas ↔ ids; material de estado con parámetros.
6. Instalar Web UI; widget con una página de prueba; los 14 manejadores en
   Blueprint contra el protocolo.
7. Cámaras, sol enlazado a `hora`/`fecha`, escaparate.
8. Vegetación canaria, coches, entorno. Fusionar lo que no necesite ser
   independiente (calles, vecinos) para bajar de 69.000 actores.
9. Empaquetar, probar en un PC que no sea el de desarrollo.

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
