# Contrato de módulos del visor (new/js/visor)

Motor nuevo del digital twin de SERENEA. Sustituye a `new/js/main.js` (que se
queda como referencia hasta que el nuevo arranque) y se apoya en lo que ya
existe: `app/layout.js` (plantas, tramos, viviendas), `app/api.js` (datos),
`app/promotions.js` (catálogo de edificios) y `app/building.js` (envolventes
de vivienda y carga del GLB por plantas).

Objetivo de calidad: un render arquitectónico de verdad. En movimiento, luz
física, sombras del sol en cascada, oclusión, reflejos, bloom, desenfoque de
movimiento y AgX. En reposo, trazado de rayos progresivo dentro del navegador
que converge en uno a tres segundos en una RTX de gama media.

## Reglas comunes

- ES modules sin bundler. Importaciones por el mapa de `new/index.html`:
  `three`, `three/addons/…`, `three-mesh-bvh`, `three-bvh-csg`,
  `three-gpu-pathtracer`, `camera-controls`, y `app/…` para los módulos
  existentes. Todo está en `new/vendor/` (Three.js r185).
- Cada módulo exporta una función `crearX(ctx, …)` que devuelve un objeto con
  el estado y los métodos listados abajo. Nada de singletons ni de `window`.
- Identificadores y comentarios en español, como el resto del repositorio.
  Comentarios que expliquen el porqué, no el qué.
- Nada de red: no hay CDN, no hay descargas. Los recursos están en `assets/`
  (`apolo_levels.glb`, `entorno_topo.glb`, `sky_day.hdr`) y `data/`.
- Cada módulo trae una página de demostración en `new/_demos/<módulo>.html`
  que lo ejercita solo con los recursos del repositorio, y un guion de
  Playwright que la captura. Ver "Cómo probar".
- Un módulo no toca ficheros de otro módulo. La integración la hace
  `visor/main.js`.

## ctx (escena.js, ya escrito)

```js
import { crearEscena } from 'app/visor/escena.js';
const ctx = crearEscena(canvas);
// ctx.renderer   WebGLRenderer (WebGL2, AgX, sombras PCFSoft, sin antialias:
//                el antialias lo pone el post)
// ctx.scene      THREE.Scene
// ctx.camera     PerspectiveCamera (fov 45, near 0.5, far 4200)
// ctx.canvas
// ctx.calidad    'alta' | 'media'  (media: DPR 1.25, sin SSR, menos muestras)
// ctx.setCalidad(tier)
// ctx.setTamano(w, h)  → emite 'tamano'
// ctx.on(evento, fn) / ctx.emit(evento, datos)
// ctx.capas      { normal: 0, cartelas: 1 }  (las cartelas se dibujan aparte,
//                sin post ni tone mapping, como en el visor actual)
```

## luz.js — momentos del día

```js
const luz = crearLuz(ctx);
luz.momento                      // 'amanecer' | 'dia' | 'atardecer' | 'noche'
luz.setMomento(clave, { duracion = 1.6 })  // fundido; emite 'momento' al acabar
luz.update(dt)
luz.equirect                     // DataTexture equirectangular HDR (Float/Half)
                                 // del cielo ACTUAL, para el trazador
luz.envMap                       // textura PMREM del mismo cielo, para IBL
luz.sol                          // DirectionalLight (con CSM aplicado)
luz.csm                          // instancia de CSM; luz.csm.setupMaterial(m)
luz.parametros                   // la fila de MOMENTOS activa (bloom, umbral,
                                 // exposicion, niebla, luces…)
luz.ventanas                     // true si en este momento las ventanas se
                                 // encienden (amanecer, atardecer, noche)
luz.aplicarMaterial(material)    // registra un material para CSM y para
                                 // las transiciones de envMapIntensity
```

- Tabla `MOMENTOS` heredada de `new/js/main.js` (elev, azim, turbidez,
  rayleigh, sol, solInt, cielo, suelo, hemiInt, relleno, rellenoInt,
  exposicion, niebla, bloom, umbral, hdri, luces). Ajústala si mejora.
- Mediodía: `assets/sky_day.hdr` (HDRLoader, equirect) como fondo, IBL y
  entorno del trazador. Su sol está a elevación 47°, acimut 45°.
- Amanecer, atardecer y noche: el cielo procedural `Sky` **horneado a una
  textura equirectangular** (1024×512, HalfFloat) con un shader de pantalla
  completa que evalúa la fórmula del `Sky` por dirección. De esa textura
  salen tanto el PMREM (IBL) como `luz.equirect` (trazador). El `Sky` no se
  añade a la escena: el fondo es la equirect (`scene.background`).
- Noche: cielo con estrellas (puntos) y resplandor urbano bajo en el
  horizonte, luna como DirectionalLight tenue; el trazador recibe la
  equirect nocturna con una banda cálida en el horizonte.
- El sol es una `DirectionalLight` con `CSM` (3 cascadas, `maxFar` 400,
  `shadowMapSize` 2048 en alta) que sigue la posición del momento.
- Transición: interpolar durante `duracion` los parámetros de luces, niebla,
  exposición y bloom; el fondo/IBL cambia con un fundido de exposición en la
  mitad. Al terminar, emitir `ctx.emit('momento', clave)`.
- Niebla: `THREE.Fog` con el color del momento, near 750, far 2100.

## post.js — cadena de post-procesado

```js
const post = crearPost(ctx, luz);
post.render(dt)              // dibuja la escena (composer) + la capa de cartelas
post.setTamano(w, h)
post.setCalidad(tier)
post.setEnfoque(distancia | null)   // profundidad de campo (Bokeh) solo al
                                    // enfocar una vivienda
post.setVelocidadCamara(v)          // m/s; escala el desenfoque de movimiento
post.setMomento(parametros)         // bloom.strength, threshold, exposición
post.composer
```

Cadena (three/addons/postprocessing, r185): `RenderPass` → `GTAOPass`
(con denoise; radio ~0.6 m; escala de distancia acorde a un edificio de 120 m)
→ `SSRPass` (solo en 'alta'; opacidad 0.35; `maxDistance` 60) →
**`DesenfoqueMovimientoPass`** (propio: `ShaderPass` que reconstruye la
velocidad por píxel reproyectando la profundidad con la matriz
view-projection del fotograma anterior y difumina a lo largo de ella;
intensidad proporcional a `setVelocidadCamara`, 0 con la cámara quieta;
8-12 muestras) → `UnrealBloomPass` → `BokehPass` (desactivado salvo
`setEnfoque`) → `SMAAPass` → `OutputPass`. Después, la pasada de cartelas
(capa 1) sin post, como en `new/js/main.js` (bloque final de `loop`).

## trazador.js — trazado de rayos en reposo

```js
const trazador = crearTrazador(ctx, luz);
trazador.activo               // true si WebGL2 y calidad 'alta'
trazador.invalidar()          // la geometría o los materiales han cambiado:
                              // hay que reconstruir el BVH la próxima vez
trazador.update(dt, { quieta })   // devuelve true si ESTE fotograma lo pintó
                              // el trazador (entonces main no llama a post)
trazador.muestras
trazador.progreso             // 0..1 de la reconstrucción del BVH
```

- `WebGLPathTracer` de three-gpu-pathtracer (bundle en vendor; `xatlas-web`
  es un stub). `renderToCanvas = true`, `tiles` 3×3, `dynamicLowRes` true,
  `minSamples` 3, `bounces` 4, `filterGlossyFactor` 0.5, `renderScale` 1 en
  alta.
- Arranque: cuando `quieta` lleva ≥ 300 ms y no hay transiciones, si está
  invalidado reconstruye con `setSceneAsync(scene, camera)` (mostrar
  `progreso`; mientras, sigue pintando el raster). Solo incluye mallas
  visibles con `MeshStandardMaterial`/`MeshPhysicalMaterial`; excluye
  sprites, líneas, puntos, cartelas (capa 1) y cualquier `ShaderMaterial`.
- Entorno: `luz.equirect` (`pathTracer.setEnvironmentMap` o
  `scene.environment` equirect antes de `setScene`); cuando cambia el
  momento, invalidar solo el entorno (`updateEnvironment`).
- Cada fotograma en reposo: `renderSample()`; el primer resultado se funde
  sobre el raster en 0,3 s (`pathTracer.alpha` o una capa de mezcla) para
  que no salte.
- Cualquier movimiento de cámara o transición → `reset()` y raster.
- El trazador NO soporta planos de recorte: el módulo de cortes entrega
  geometría realmente cortada (CSG), así el trazador ve lo mismo que el
  raster.

## cortes.js — plantas seccionadas por tramo

```js
const cortes = crearCortes(ctx, edificio);
cortes.definicion             // contenido de data/cortes.json
cortes.planta                 // 'all' | 'baja' | 'p1' | 'p2' | 'atico'
cortes.setPlanta(clave, { animar = true })   // devuelve Promise al acabar
cortes.enTransicion
cortes.update(dt)
cortes.alturaCorte(x, z, clave)   // cota de corte en ese punto
```

- `data/cortes.json`: `{ "edificio": "apolo", "offset": 1.2, "plantas": {
  "baja": [ { "x0", "x1", "z0", "z1", "y" }, … ], "p1": […], "p2": […],
  "atico": […] } }`. Cada entrada es un tramo: huella en planta y cota de
  corte absoluta. La versión inicial sale de `SECTIONS` de `app/layout.js`;
  cuando llegue el modelo de SketchUp con los componentes `CORTE_P1…P4`, el
  fichero lo generará un script y este módulo no cambia.
- Semántica: elegir una planta muestra **todo lo que queda por debajo del
  plano de corte de cada tramo** (esa planta y las inferiores) y elimina lo
  de arriba. 'all' = edificio completo, sin cortes.
- Transición (0,8 s): el plano baja desde la cubierta hasta su cota con
  `Material.clippingPlanes` por tramo (`renderer.localClippingEnabled`) y
  tapas por stencil. Al terminar, se sustituye por geometría **realmente
  cortada** con `three-bvh-csg` (`Evaluator`, `SUBTRACTION` contra una caja
  desde la cota de corte hasta +200 m, por tramo), con las caras de la tapa
  en el material `cap` del nivel (gris muy oscuro). Se cachea por planta.
  Mallas enteramente por encima: `visible = false`; enteramente por debajo:
  intactas. Luego `trazador.invalidar()` (lo emite `ctx.emit('geometria')`).
- Lo que queda por debajo de la planta activa se atenúa como hoy: menos
  `envMapIntensity` y color más oscuro en los materiales de las plantas
  inferiores (ver `animateFloors` en `new/js/main.js`), y la losa de la planta
  superior sigue proyectando sombra invisible (`colorWrite=false`).
- El mobiliario (`MOB_`, cuando exista) no se corta.

## edificio.js — carga y estado de un edificio

```js
const edificio = await cargarEdificio(ctx, slot /* de app/promotions.js */);
edificio.grupo                // THREE.Group raíz (nombre = slot.id)
edificio.niveles              // Map(key → { holders, mats, byCat, meshes })
edificio.viviendas            // Map(id → { id, mesh, floorKey, caja: Box3,
                              //   vidrios: Material[], label })
edificio.estados              // { id: 'disponible'|'reservada'|'vendida' }
edificio.setEstados(mapa)
edificio.setVentanas(encendidas)   // enciende el vidrio de disponibles y
                                   // reservadas; vendidas siempre apagadas
edificio.pintar({ hover, seleccionada })
edificio.pickables            // mallas para el raycaster
edificio.cajaDe(id)           // Box3 de la vivienda
edificio.tramoDe(mesh)        // índice de tramo según su centro (SECTIONS)
```

- Reutiliza `loadBIM` y `buildBuilding` de `app/building.js` (o copia y
  mejora lo que necesite). Materiales por categoría como hoy (monocapa con
  grano, vidrio físico con Fresnel, tapas).
- **Vidrio por vivienda:** el GLB trae un solo vidrio por planta. Divide la
  malla de vidrio de cada nivel por vivienda: cada triángulo va a la vivienda
  cuya caja (ampliada 0,6 m) contiene su centroide; el resto queda en el
  vidrio común. Cada vivienda recibe un clon del material de vidrio con
  `emissive` cálido (0xffd9a0) que `setVentanas` enciende (intensidad ~1.4,
  para que el bloom lo recoja) o apaga.
- Estado de demostración: si `data/availability.json` no marca vendidas
  suficientes, no inventes nada aquí; lo decide `visor/main.js`.
- Registra todos los materiales en `luz.aplicarMaterial` si se le pasa `luz`
  (parámetro opcional).

## camara.js — cámara cinematográfica

```js
const camara = crearCamara(ctx);
camara.controles              // CameraControls (camera-controls) ya instalado
camara.volarA({ posicion, objetivo }, { duracion = 1.6, arco = 0.35 })
                              // Promise; curva suave con arco lateral y
                              // frenada; se puede interrumpir
camara.encuadrar(caja /* Box3 */, { azimut, elevacion, margen = 1.15, duracion })
camara.enfocarVivienda(caja, { duracion = 1.4 })   // grande, centrada, orbitable
camara.orbitaAutomatica(activa, { velocidad = 0.05 })
camara.reposoTras(segundos)   // tras N s sin tocar, vuelve al encuadre
                              // 'conjunto' y orbita (emite 'reposo')
camara.quieta                 // true si no hay entrada ni transición ≥ 300 ms
camara.velocidad              // m/s (para el desenfoque de movimiento)
camara.enTransicion
camara.update(dt)
camara.interrumpir()
```

- **Cualquier toque o arrastre interrumpe** la transición en curso y deja
  el control al usuario. Rueda = zoom, izquierdo = orbitar, derecho =
  desplazar; táctil: un dedo orbita, dos dedos zoom y desplazan.
- Límites: no atravesar el suelo (polar máximo 88°), distancia mínima 3 m,
  máxima 900 m. `smoothTime` 0,25.
- Encuadres: `conjunto` (todo el entorno), `edificio` (caja del edificio) y
  por planta (caja de la planta con elevación 40°) los calcula main con
  `encuadrar`.

## main.js (visor) — orquestación y API pública

Crea todo, carga el edificio activo, conecta módulos y expone en
`window.apolo` lo que usa `new/js/shell.js`:

```js
apolo.setFloor(key)            // 'all' | 'baja' | 'p1' | 'p2' | 'atico'
apolo.floor
apolo.setMomento(clave)        // 'amanecer' | 'dia' | 'atardecer' | 'noche'
apolo.momento
apolo.irConjunto() / apolo.irEdificio()
apolo.enfocarVivienda(id) / apolo.volverAPlanta()
apolo.select(id) / apolo.selected / apolo.hover
apolo.units, apolo.unitsById, apolo.estados, apolo.estadoDe(id)
apolo.setCalidad(tier)
apolo.on(evento, fn)           // 'planta', 'momento', 'seleccion', 'reposo',
                               // 'carga' ({ progreso })
apolo.enter()                  // compatibilidad con shell.js
```

Bucle: `camara.update` → `luz.update` → `cortes.update` → hover/picking
(solo con ratón activo; las vendidas son inertes) → si
`trazador.update(dt, { quieta: camara.quieta && !cortes.enTransicion &&
!luz.enTransicion })` devuelve false, `post.render(dt)`.

Estado de demostración: 70 % disponibles y 30 % vendidas, determinista (cada
tercera vivienda por orden de id, empezando por la segunda, es vendida) salvo
que `data/availability.json` traiga otra cosa.

## Cómo probar

- Servidor: `python3 -m http.server 8765` desde la raíz del repositorio
  (normalmente ya está levantado; comprobar con `curl -s -o /dev/null -w
  "%{http_code}" http://127.0.0.1:8765/new/index.html`).
- Playwright está instalado en
  `/tmp/claude-0/-home-user-Your-virtual/6b0c3355-5be8-5bac-9c0a-530da696858f/scratchpad/libs`
  (`playwright-core`), con Chromium en
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` y estos argumentos
  para WebGL2 por software:
  `['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']`.
  Es lento (SwiftShader): usar lienzos de 960×540 y esperar con
  `waitForFunction` a que la página ponga `window.__listo = true`.
- Cada demo escribe en `window.__estado` un objeto con lo que ha comprobado y
  captura a
  `/tmp/claude-0/-home-user-Your-virtual/6b0c3355-5be8-5bac-9c0a-530da696858f/scratchpad/demos/<módulo>-<caso>.png`.
  Mirar la captura (Read) antes de dar el módulo por bueno: el objetivo es la
  imagen, no que el código no falle.
- Mapa de importación para las demos (copiar tal cual):

```html
<script type="importmap">{"imports":{
 "three":"/new/vendor/three/three.module.min.js",
 "three/addons/":"/new/vendor/three/addons/",
 "three/examples/jsm/":"/new/vendor/three/addons/",
 "three-mesh-bvh":"/new/vendor/three-mesh-bvh.js",
 "three-bvh-csg":"/new/vendor/three-bvh-csg.js",
 "three-gpu-pathtracer":"/new/vendor/three-gpu-pathtracer.js",
 "camera-controls":"/new/vendor/camera-controls.js",
 "xatlas-web":"/new/vendor/xatlas-web.js",
 "app/":"/new/js/"
}}</script>
```

Con `<base href="/">` en la página, `assets/…` y `data/…` resuelven a la
raíz del sitio, que es donde viven.

## Modelo de SketchUp (añadido el 9-sep-2026, prevalece sobre lo anterior)

Ya existe el modelo real exportado desde SketchUp, procesado por
`tools/build_serenea.mjs` en `assets/serenea/`. **El visor carga estos
ficheros, no `apolo_levels.glb` ni `entorno_topo.glb`.** Todos comparten el
origen y los ejes del SketchUp (metros, Y arriba): el edificio Apolo ocupa
x 11,2…122,3 · y 0…24,3 · z −39,5…−8,4 (centro 66,7 · 12,1 · −23,9); el
entorno llega hasta ±5 km (costa con ortofoto). Cajas y centros en
`data/serenea_modelo.json`.

| Fichero | Qué es | Nombres de malla |
|---|---|---|
| `entorno.glb` | terreno, costa, calles, vecinos, campo de fútbol, los otros cuatro edificios (volúmenes) | libres |
| `apolo_envolvente.glb` | muros, forjados, carpinterías, escaleras, pilares, **edificio completo** | `<cat>__T<plataforma>__<material>`; cat ∈ envolvente · carpinteria · escalera · pilar |
| `apolo_envolvente.glb` (mismo fichero) | **un vidrio por hueco**, 175 mallas | `vidrio__T<plataforma>__<n>__<xcm>_<ycm>_<zcm>` (centro en centímetros enteros) |
| `apolo_mobiliario.glb` | mobiliario y puertas, unidos por plataforma y franja de 3 m | `mob|puerta__T<plataforma>__Y<franja>__<material>__y<ymin>` |
| `apolo_corte_baja.glb`, `_p1`, `_p2`, `_atico` | la envolvente **ya cortada** por el fondo de los ocho cajones de esa planta (todo lo que queda por debajo), vidrios incluidos | mismos nombres que la envolvente |

`data/cortes.json` trae ahora los **ocho cajones reales por planta**
(`plantas.baja|p1|p2|atico: [{x0,x1,z0,z1,y}]`, y = cota de corte); las
plataformas van de oeste (alto) a este (bajo) y en dos bandas de z. Cotas de
corte de la planta 1: 11,85 · 11,07 · 10,35 · 9,67 · 8,96 · 8,19 · 7,56 ·
6,75; cada planta siguiente suma 3,00 m.

Consecuencias para los módulos:

- **cortes.js**: la vía principal es **cambiar de fichero**: `setPlanta(k)`
  muestra `apolo_corte_<k>.glb` (precargado) y oculta la envolvente completa;
  'all' hace lo contrario. La transición de 0,8 s se hace con los planos de
  recorte por plataforma sobre la envolvente completa (bajando desde la
  cubierta hasta la cota de cada cajón) y al terminar se cambia al fichero
  precortado, que es lo que ve el trazador. El CSG en el navegador queda
  como alternativa para modelos pequeños. **Tapas:** no hay geometría de
  tapa; las mallas cortadas se pintan a doble cara y las caras traseras en
  oscuro (`onBeforeCompile`: `if (!gl_FrontFacing) diffuseColor.rgb =
  vec3(0.05, 0.055, 0.06);`), que es lo que se ve por la boca del corte.
  Mobiliario: al elegir planta se ocultan las mallas de mobiliario cuyo
  `y<ymin>` del nombre queda por encima de la cota de corte de su plataforma.
- **Atenuar las plantas inferiores** ya no va por mallas por planta: se hace
  en el material con un uniforme `yCorte` por plataforma (o global con la
  cota media) que oscurece y quita entorno a los fragmentos con
  `worldY < yCorte − 3.2` (la planta activa es la franja de 3 m bajo el corte).
- **edificio.js**: carga envolvente + mobiliario + las cuatro variantes
  cortadas (en segundo plano, tras la primera imagen). Los vidrios se asignan
  a viviendas por su centro (`xcm,ycm,zcm` del nombre) contra la caja de cada
  vivienda; hasta que el SketchUp traiga grupos `VIV_`, las cajas de vivienda
  salen de `app/layout.js` transformadas al marco nuevo (ver abajo). Materiales:
  el vidrio se sustituye por el vidrio físico del visor (clon por vivienda con
  emisivo); el monocapa y el travertino conservan sus texturas.
- **Marco antiguo → nuevo** (para las envolventes de vivienda de layout.js,
  provisional): el edificio antiguo iba centrado en (0,0) con X a lo largo;
  el nuevo tiene el centro en (66,72, −23,94) y la misma orientación en X.
  Transformación provisional: `x' = x + 66,72`, `z' = z − 23,94`,
  `y' = y + Δ` con Δ = cota de corte de la plataforma − 1,2 − cota del
  forjado antiguo de su tramo. **Comprobar visualmente** y, si no cuadra,
  dejar las envolventes desactivadas y anotarlo: es preferible a cartelas
  flotando en el aire.
- **camara.js / main.js**: encuadres a partir de `serenea_modelo.json`:
  'conjunto' = caja del edificio ampliada ×6 en planta (unos 600 m), no todo
  el entorno de 10 km; 'edificio' = caja de Apolo con elevación 28° desde el
  sur (z positivo mira al edificio desde −z… comprobar con una captura que se
  ve la fachada larga); 'planta' = caja de Apolo hasta la cota de corte.
- **luz.js**: sin cambios; el sol y el CSM cubren la caja de Apolo ± 150 m.
- **post.js / trazador.js**: sin cambios. El trazador incluye la variante
  cortada visible y excluye la completa oculta.
- Peso: envolvente 12 MB, mobiliario 30 MB, cortes 6–12 MB cada uno, entorno
  14 MB. Cargar en este orden: entorno + envolvente (primera imagen), luego
  mobiliario y cortes en segundo plano con `apolo.on('carga')`.

## Contornos reales de vivienda (v6, 9-sep-2026, prevalece sobre lo anterior)

`data/viviendas_serenea.json` trae el contorno exacto de las 166 viviendas
(`viviendas.<id>: { planta, plataforma, poligono: [[x, z], …], y0, y1, area,
supViv, supUtil, entrada, vidrios }`, metros del SketchUp), deducido de
tabiques y puertas del v6 y numerado con los planos comerciales. Cambios:

- **edificio.js**: los prismas de vivienda salen de ese polígono
  (`THREE.Shape` + `ExtrudeGeometry` entre `y0` e `y1`), sin cajas ni
  `layout.js`; la cartela va en el centroide a `y1 + 1,2`; los vidrios se
  asignan por distancia a la huella (≤ 0,45 m) y por cota
  (`y ∈ [y0 − 0,5, y0 + 3,2]`). `edificio.suelos` da el suelo mínimo por
  planta y cajón y `edificio.comprobarPrismas()` contrasta caja y polígono.
- **La planta activa NO es la franja de 3 m bajo el corte**: los planos de
  corte del cliente están a altura de sección (1,3-1,4 m sobre el suelo en
  p1/p2/ático, 1,9-2,0 en baja). cortes.js atenúa por debajo del suelo real
  (`opciones.suelos` / `setSuelos`) y recorta con su plano el mobiliario que
  cruza el corte.
- **luz.js**: `setRealcePlanta(activo)` pone la planta seccionada a plena
  luz (sol ≥ 62°, hemisférica ×1,6, IBL ×1,4; de noche hemisférica ×1,5).
- **main.js**: encuadre de planta con la caja limitada a [suelo mínimo,
  corte máximo], azimut 8°, elevación 50°, margen 1,02; trazador solo en
  'all' y ya convergido (`minSamples` 48, fundido 1,2 s); SSR apagado.
