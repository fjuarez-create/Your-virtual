# Captura BIM: imágenes provisionales y capas que casan al píxel

Herramienta de trabajo (no se publica para el público) que saca del modelo
de SketchUp, con el motor del visor 3D, las imágenes fijas del showroom
nuevo y, **con la misma cámara y al mismo tamaño**, las máscaras de las que
salen los polígonos interactivos:

| Vista | Imagen | Capa interactiva |
|---|---|---|
| Conjunto (vista aérea, fotograma 1 del storyboard) | `conjunto.{jpg,webp}` | `conjunto.json`: contorno de Apolo y de los otros 4 edificios SERENEA |
| Edificio Apolo de 3/4, dron bajo (fotograma 2) | `edificio.{jpg,webp}` | `edificio-plantas.json`: un juego de polígonos por planta lógica (1 a 4) |
| Planta 2 cenital ortográfica con mobiliario (fotogramas 3 y 4) | `planta-2.{jpg,webp}` | `planta-2-viviendas.json`: las 46 viviendas del nivel 2 |
| Vivienda 238 cenital (fotograma 6) | `vivienda-238.{jpg,webp}` y `vivienda-238-aislada.*` | `vivienda-238.json`: contorno, estancias y un punto por estancia |

Todo se escribe en `nuevo/estilos/img/`. Cada imagen va en JPG y WebP de
≤ 350 kB, a tamaño completo (2400 px de ancho como máximo) y en versión móvil
de 1200 px con sufijo `-m`. Son **marcadores provisionales**: la receta es la
que se aplicará a los renders definitivos (ver «Con los renders definitivos»).

## Receta

Desde la raíz del repositorio:

```bash
# 0) una vez: OpenCV para trazar contornos
pip install opencv-python-headless

# 1) servidor estático en la RAÍZ (la página importa /vendor, /js/visor y /assets)
python3 -m http.server 8793 --bind 127.0.0.1 &
SERVIDOR=$!

# 2) capturas en bruto (PNG sin pérdidas + máscaras + cámara) a una carpeta de trabajo
node nuevo/tools/captura/capturar.mjs --salida /tmp/captura-brutos
#    --solo conjunto,edificio   para repetir solo algunas vistas
#    --vistas otro.json         para otro juego de vistas

# 3) imágenes optimizadas, JSON y PNG de comprobación
python3 nuevo/tools/captura/procesar.py --brutos /tmp/captura-brutos \
        --comprobacion /tmp/captura-comprobacion

# 4) apagar el servidor
kill $SERVIDOR
```

En este contenedor (Chromium sin GPU, WebGL por SwiftShader) el paso 2 tarda
unos 3 minutos para las cuatro vistas y el 3, medio minuto. Playwright se
busca como `require('playwright')` y, si no, en `/opt/node-tools/node_modules`.
Chromium arranca con `--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader --ignore-gpu-blocklist`.

Mirar SIEMPRE los PNG de comprobación (`*-comprobacion.png` y sus `-zoomN`,
ampliados al píxel) antes de dar nada por bueno, y el bloque `verificacion`
de cada JSON.

## Piezas

- `index.html` + `captura.js`: la página. Reutiliza el visor tal cual
  (`js/visor/escena.js` renderer AgX, `luz.js` cielo horneado y sol en
  cascada del momento «Mediodía», `post.js` GTAO + SSR + bloom + SMAA +
  grado, `materiales.js`, `texturas.js`, el vidrio físico de `edificio.js` y
  las tapas de `tapas.js`). Tres modos por carga de página:
  - `?modo=exterior`: `entorno.glb` + `apolo_envolvente.glb`, cámara en perspectiva;
  - `?modo=planta&planta=p1`: `apolo_corte_p1.glb` + mobiliario (lo de su
    planta, recortado con el plano de corte de cada cajón) + poché de
    `data/tapas_serenea.json`, sin entorno, fondo liso y cámara ortográfica
    cenital (norte = −z del SketchUp arriba). Claves de planta: nivel 1 =
    `baja`, 2 = `p1`, 3 = `p2`, 4 = `atico`;
  - `?modo=interior360&vivienda=238`: panorámica 360 exacta desde dentro de
    una vivienda (ver «360 exacto desde el BIM», más abajo).
  Expone `window.captura` (cámaras, `renderizar`, `mascaraPlantas`,
  `mascaraEdificios`, `mascaraViviendas`, `seccion`, `mobiliarioEn` y, en
  interior360, `camaraInterior`, `luzInterior`, `puertasInterior`,
  `panoramica360`, `vistaPlana360`).
- `equirect.js`: cubo de 6 caras → equirectangular, pases y leyenda.
- `vistas.json`: las vistas, con la cámara exacta. Cámara exterior por pose
  (`azimut` desde +z hacia +x, 0° = sur; `elevacion`; `distancia`;
  `objetivo`; `fov` vertical en grados), la misma convención que el visor.
  Cenital por `x0`, `z0` (esquina superior izquierda en metros) y `s`
  (píxeles por metro).
- `capturar.mjs`: conduce la página con Playwright y guarda, por vista,
  `<n>.png`, sus máscaras y `<n>-camara.json` (matrices de proyección y
  vista, transformación, límites de nivel, datos de estancias).
- `procesar.py`: máscaras → polígonos, afín → viviendas, sección →
  estancias, exportación JPG/WebP y comprobación.

## Por qué casan al píxel

1. **Una cámara, un tamaño, una geometría.** La imagen y sus máscaras se
   dibujan seguidas en la misma página, con la misma matriz de proyección y
   el mismo lienzo. Las máscaras se pintan con `renderer.render` directo,
   sin post, sin tono, sin niebla y sin suavizado, con materiales planos de
   color exacto (ShaderMaterial sin conversión de color): cada píxel es un
   color puro. Lo que tapa al edificio en la imagen (árboles, vecinos) lo
   tapa también en la máscara, porque la profundidad es la misma.
2. **Plantas lógicas sin dibujarlas a mano.** En la máscara de plantas cada
   fragmento del edificio se colorea por su cota en el mundo: pertenece a la
   planta cuyo suelo (el mínimo de las viviendas de esa planta en su cajón,
   de `data/viviendas_serenea.json`, −0,15 m para que el canto del forjado
   vaya con la planta que pisa) tiene por debajo. Cada uno de los 8 cajones
   tiene sus cotas, así que los saltos de nivel del edificio salen solos y
   una planta puede tener varios polígonos. Zócalo y cubierta (más de 2,95 m
   por encima del suelo del ático) no son de ninguna planta.
3. **Afín exacta en las cenitales.** Con cámara ortográfica cenital,
   `px = s·x − s·x0` y `py = s·z − s·z0` es literalmente la cuenta que hace
   la GPU. Se comprueba pintando los prismas de las viviendas (color = índice)
   con la misma cámara y comparando píxel a píxel con los polígonos
   proyectados a mano con la misma regla de centro de píxel.
4. **Contornos a subpíxel.** Las máscaras se trazan ampliadas ×4 (el
   contorno pasa a 1/8 px del borde real del píxel, no por su centro) y se
   simplifican con Douglas-Peucker a 0,8–1 px.

### Lo medido en esta tanda (18-nov-2026)

- Planta 2: de 860.591 píxeles de vivienda, **19 distintos** entre la máscara
  de la GPU y los polígonos de la afín (2·10⁻⁵), todos con el centro a
  ≤ 0,02 px del borde (empates); cada píxel de borde de la GPU tiene el
  borde analítico a menos de 1,02 px de su centro.
- Vivienda 238: de 2.175.048 píxeles, **20 distintos**, todos empates a
  0,00 px del borde.
- Edificio: simplificación de los polígonos de planta con desviación media
  del borde de 0,34 px (IoU 0,987–0,990, bandas largas y finas); la silueta
  de la máscara de plantas y la de edificios difieren en 1 píxel de 485.200.
  Contraste de la imagen a través del borde de la máscara: máximo en
  desfase 0 px (edificio y conjunto).
- Contorno de las viviendas frente a lo que se ve: el polígono de
  `data/viviendas_serenea.json` va por la cara interior del muro con 0–5 cm
  de holgura (0–1 px en `planta-2` a 20 px/m, 0–9 px en la vivienda a
  180 px/m) y algún diente de 5 cm en los encuentros: es la rejilla de 5 cm
  con que se dedujo del modelo, no la cámara.

## Formato de los JSON

Coordenadas en **píxeles de la imagen de escritorio**, origen arriba a la
izquierda, continuas (el centro del primer píxel es 0,5). Para la versión
`-m` basta un `<svg viewBox="0 0 ancho alto">` encima de la imagen (o
multiplicar por `versiones.movil.escala`). Todos llevan `provisional: true`,
`camara`, `versiones` (nombres y tamaños de cada fichero) y `verificacion`.

- `edificio-plantas.json`: `{ ancho, alto, chincheta, plantas: [{ nivel,
  clave, nombre, poligonos: [[[x, y], …], …], huecos, caja, areaPx }] }`.
  `huecos` son agujeros interiores (dibujar exteriores y huecos en el mismo
  `<path>` con `fill-rule="evenodd"`).
- `planta-2-viviendas.json`: `{ ancho, alto, fondo, transformacion: { a, b,
  c, d, pxPorMetro }, viviendas: [{ id, estado, dormitorios, puntos,
  centroide }] }`. `estado` es la semilla de `data/availability.json`, solo
  para maquetas. `centroide` es el centroide si cae holgado dentro; si no,
  el punto más alejado del borde.
- `vivienda-<id>.json`: `{ ancho, alto, id, referencia, contorno,
  superficies, estancias: [{ nombre, x, y, tipo, superficieFicha,
  superficieMedida, poligono, metodo, estimada }], sinPunto: […] }`.
  Estancias separadas con la sección horizontal del modelo a +1,0 m del
  suelo (tabiques y hojas de puerta: el modelo trae las puertas cerradas),
  tipo por el mobiliario que contienen y nombre de la ficha comercial
  (`assets/fichas/<id>.pdf`, con `pdftotext`). El punto de cada estancia es
  el suelo libre más holgado (lejos de tabiques y muebles); el
  salón-comedor-cocina lleva dos, «Salón - comedor» y «Cocina» (delante de la
  encimera). El distribuidor va en `sinPunto`.
- `conjunto.json`: `{ edificios: [{ id, numero | numeroProbable,
  nombre | nombreProbable, poligonos, chincheta, mundo }] }`. Los otros
  cuatro edificios salen del entorno (acabados SERENEA), separados en planta;
  su número es una deducción del storyboard **por confirmar**.

## Otra vista, otra vivienda, otra planta

Añadir una entrada a `vistas.json`. Para otra vivienda, copiar la de
`vivienda-238` con su caja (polígono de `data/viviendas_serenea.json` ± 0,6 m,
`s` = 180) y `"estancias": {"id": "<id>", "alturas": [1.0]}`. Para otra
planta, una vista `planta-3` con `"planta": "p2"` (nivel 3) y la lista de
sus viviendas en `viviendas`. `procesar.py` procesa todas las vistas
`planta-*` y `vivienda-*` que encuentre en la carpeta de brutos
(`--vivienda 238,301` para limitarlo).

## Con los renders definitivos

La regla es la misma: **imagen y máscara con la misma cámara**. Tres vías,
de mejor a peor:

1. **Pedir las máscaras al estudio** (MEMORABLE u otro) en el mismo render:
   pases de ID (Cryptomatte, Multimatte / Material ID / Object ID) con un
   color plano por planta lógica (y, en las cenitales, por vivienda). Con
   ese PNG, `procesar.py` traza los polígonos igual que hoy.
2. **Repetir aquí su cámara.** Que el estudio entregue, en el marco del
   SketchUp (metros, Y arriba), la posición de cámara, el punto al que mira
   (o la rotación), la distancia focal y el ancho de sensor (o el campo de
   visión), la resolución y el desplazamiento de lente (*shift*) si lo usan.
   FOV vertical para `vistas.json`: `2·atan((ancho_sensor / aspecto) / (2·focal))`.
   Con la cámara clavada salen aquí las máscaras del modelo. El *shift*
   vertical (perspectiva de dos puntos, muy habitual en arquitectura) aún no
   está implementado: habría que añadirlo a la proyección (`setViewOffset`).
3. **Cenitales:** render ortográfico con la caja exacta (`x0`, `z0`, px/m) y
   norte arriba; la afín es la misma y los polígonos no cambian.

Una imagen generada o retocada con IA (Nano Banana, Veo, Weave…) a partir
de estas capturas no garantiza la geometría: hay que volver a superponer los
polígonos (los PNG de comprobación) y, si se mueve, retrazar.

## 360 exacto desde el BIM (`?modo=interior360`)

Base estructural para la pasada de IA de los 360. Es una equirectangular 2:1
dibujada desde el modelo con la cámara del punto 360 de la estancia. Con la
**misma cámara** salen además tres pases que fijan la geometría:
profundidad, normales y segmentación. La IA pondrá la luz y los acabados.
Estos pases dicen dónde está cada muro, ventana, puerta y mueble, y después
sirven para comprobar que la IA no los ha movido (`comparar360.py`).

### Receta

Desde la raíz del repositorio:

```bash
python3 -m http.server 8793 --bind 127.0.0.1 &
SERVIDOR=$!
node nuevo/tools/captura/capturar360.mjs --salida /tmp/brutos-360 \
     --vivienda 238 --estancia "Salón - comedor" --nombre base-238-salon \
     --altura 1.6 --cara 2048 --ancho 4096 --muestras 3 --master 8192 --cara-master 3072
python3 nuevo/tools/captura/procesar360.py --brutos /tmp/brutos-360 --nombre base-238-salon \
     --salida /tmp/base-360 --jpg nuevo/estilos/img/360/base-238-salon.jpg \
     --json-web nuevo/estilos/img/360/base-238-salon.json
kill $SERVIDOR
```

Tiempos medidos el 18-nov-2026 en este contenedor (4 CPU, WebGL por
SwiftShader):

| Paso | Tiempo |
|---|---|
| Carga de la página: envolvente, mobiliario, entorno y cielo | 1,5 s |
| Color 4096×2048 (cubo de 2048 + reproyección con 3×3 submuestras) | ≈ 100 s |
| Profundidad, normales e id | 5–8 s cada uno |
| Máster de color 8192×4096 (cubo de 3072, 2×2 submuestras, por franjas) | ≈ 200 s |
| Vistas planas de referencia y ventana de cerca | ≈ 50 s |
| **Total de `capturar360.mjs`** | **≈ 6 min** |
| `procesar360.py` | 17 s |

Dos ejecuciones seguidas dan PNG idénticos byte a byte (0 píxeles distintos
en los cuatro pases).

### Piezas

- `captura.js`, modo `interior360` (`&vivienda=<id>`, `&entorno=0` para
  quitar el entorno). Carga lo que hace falta para que la estancia esté
  completa:
  - `apolo_envolvente.glb` entero. Los cortes de planta no sirven aquí: para
    el nivel 2 es `apolo_corte_p1.glb`, que tiene los muros cortados a
    +1,41 m y no tiene techo. La envolvente trae los muros y los vidrios a
    altura completa y los forjados. El techo es la cara inferior del forjado
    del nivel 3.
  - El mobiliario de la misma plataforma que arranca en esa planta (cota
    mínima entre el suelo −0,3 m y el suelo +2,7 m), sin personas (`Sree_*`).
  - `entorno.glb`, para lo que se ve por las ventanas.
  - Los pilares llevan pintura interior: el modelo los trae en hormigón visto
    y dentro de la vivienda van enlucidos.

  Sin `luz.js` ni `post.js`, porque el CSM y las pasadas de pantalla van
  atadas a una sola cámara en perspectiva. La luz es neutra a propósito:
  - IBL de degradado acromático (cenit 1,0, horizonte 0,8, nadir 0,5). Con el
    HDR como IBL, cada muro cogía el tinte de su trozo de cielo.
  - Un relleno direccional sin sombra, para que cada paño de muro tenga un
    tono distinto según hacia dónde mira.
  - El sol de la hora maestra con una sombra direccional de 4096 px: brújula
    241°, altura 28°, norte a 12,55° (PRODUCCION_IMAGENES §2).
  - `sky_day.hdr` solo de fondo, tono Neutral.
  - Vidrio casi transparente en color y opaco en los pases.
- `equirect.js` hace el `CubeCamera` de 6 caras y la reproyección a
  equirectangular con un sombreador propio: N×N submuestras por píxel en
  color y una muestra al vecino más cercano en los pases de datos. También
  dibuja los materiales de los pases, la leyenda (`CLASES`) y la vista plana
  de referencia.
  - Si el lienzo WebGL no admite el tamaño pedido, reproyecta por franjas y
    las compone en un lienzo 2D. Chromium reduce el búfer por encima de unos
    33 Mpx sin avisar: un 8192×4096 sale a 8145×4072 y **recortado**.
  - Cada franja comprueba su búfer. La composición es exacta: id por franjas
    frente a entero, 0 píxeles distintos; color, diferencia máxima de 1
    nivel.
- `capturar360.mjs` calcula la cámara y las direcciones de comprobación
  desde el modelo:
  - ventana: el centro del vidrio que está en el contorno de la estancia;
  - cocina: el centroide de la encimera dentro de la estancia;
  - entrada: el hueco de puerta más cercano a `entrada` de
    `viviendas_serenea.json`;
  - pasillo: el hueco que toca a la vez la estancia y el distribuidor.

  Después guarda los pases, las vistas planas y una toma auxiliar de la
  ventana de cerca.
- `procesar360.py` convierte la profundidad empaquetada a 16 bit, mide las
  comprobaciones y escribe el JSON, las imágenes de `comprobacion/` y el JPG.
- `comparar360.py` comprueba una panorámica retocada (IA) contra los pases
  del BIM (ver más abajo).

### Cámara

- Punto: el `(x, y)` de la estancia en `vivienda-<id>.json`, llevado al
  mundo con su transformación: `x = (px − c)/a`, `z = (py − d)/b`.
  - En la 238, «Salón - comedor» está en px (695,2; 794,3), que es el punto
    (14,862; −14,937) del modelo.
  - El suelo terminado es el primer impacto hacia abajo en la envolvente (el
    vinílico, cota 12,6597). Cámara a **+1,60 m** (`--altura`): y = 14,2597.
  - PRODUCCION_IMAGENES §2 dice 1,50 m. Aquí va 1,60 porque así se encargó.
- `camaraInterior()` comprueba que el punto cae dentro del polígono de la
  estancia (a 0,825 m de su borde) y de la vivienda. Las distancias libres
  se miden después en la propia panorámica (ver comprobaciones).

### Convención (la de `<n>.json`)

- **Rumbo β** en grados: horario visto desde arriba, desde el norte del
  modelo (−z). 0 = −z, 90 = +x, 180 = +z, 270 = −x. Rumbo de brújula = β −
  12,55.
- **Columna:** `u = 0,5 + (β − rumboCentro)/360`. Con `rumboCentro` = 0, el
  centro de la imagen mira al norte del modelo (la cocina en la 238) y la
  costura queda a 180°, sobre el tabique liso del dormitorio.
- **Fila:** `v = 0,5 − φ/180`, φ la elevación. Arriba está el cenit.
- **En Photo Sphere Viewer:** `yaw = β − rumboCentro` (comprobado con
  capturas). La vista principal se guarda aparte, en `rumboPrincipal`
  (311,13° en la 238, hacia la ventana).

### Ficheros

| Fichero | Qué es |
|---|---|
| `<n>.png` | color 4096×2048, 8 bit sRGB |
| `<n>-8k.png` | máster de color 8192×4096 |
| `<n>-depth.png` | profundidad 16 bit, cerca = claro: `v = 65535·(1 − d/dmax)`, `d` = distancia **radial** a la cámara; `dmax` en el JSON (6,0 m en la 238); 0 = sin geometría |
| `<n>-depth-mm.png` | la misma distancia en mm, 16 bit (métrica) |
| `<n>-normal.png` | normal de mundo de la cara visible, `RGB = n·0,5 + 0,5` (R = +x este, G = +y arriba, B = +z sur) |
| `<n>-id.png` | segmentación en colores planos exactos |
| `<n>.json` | cámara, luz, convención, leyenda, direcciones, huecos de puerta, vidrios, tiempos y todas las comprobaciones |
| `nuevo/estilos/img/360/<n>.jpg` + `.json` | versión web (4096×2048, calidad 82, progresivo: 293 kB) y su JSON reducido |

Leyenda del id (colores de ADE20K donde existe la clase, los de los
ControlNet de segmentación):

| Clase | Color | ADE20K |
|---|---|---|
| muro (tabique, pilar, rodapié) | 120,120,120 | wall |
| suelo | 80,50,50 | floor |
| techo | 120,120,80 | ceiling |
| vidrio | 230,230,230 | windowpane |
| carpintería de ventana | 255,160,20 | — |
| puerta (hoja, marco, herraje) | 8,255,51 | door |
| mobiliario suelto | 11,102,255 | — |
| cocina y armarios | 224,5,255 | cabinet |
| sanitarios | 0,200,200 | — |
| entorno exterior | 180,120,120 | building |
| sin geometría | 0,0,0 | — |

En la envolvente, suelo, techo y muro se separan por la orientación de la
cara (`|n_y| > 0,7`), porque forjados y muros vienen en las mismas mallas.

### Comprobaciones medidas (238, salón)

- **Estancia cerrada.** 0 de 8.388.608 píxeles sin geometría y 0 colores
  fuera de la leyenda.
- **Costura.** Diferencia media entre la primera y la última columna: 0,22
  niveles, frente a una mediana de 0,30 entre dos columnas vecinas
  cualesquiera. El id coincide en el 100 % de las filas y la profundidad
  difiere 0 mm. En el máster 8K, 0,14.
- **Polos.**
  - La fila del cenit es 100 % techo, a 0,901 m, con desviación de color 0.
  - La del nadir es 100 % suelo, a 1,600 m.
  - Ni huecos ni estrellas en las 8 primeras ni en las 8 últimas filas.
- **Alturas medidas en la panorámica.**
  - Cámara a 1,600 m del suelo y altura libre de 2,501 m.
  - Techo plano: cota 15,1597–15,1613 m (percentiles 1–99).
  - Suelo plano: 12,6590–12,6605 m.
- **Verticales.**
  - 4 aristas verticales de muro (esquinas y mochetas, de 212 a 622 filas
    cada una): desviación de su columna ≤ 0,06 px y recorrido ≤ 1,5 px.
  - Bordes de vidrio y de puerta: 77–100 % de las filas a ±1 px de la
    columna mediana. Las que se salen son la manilla, el travesaño y el
    respaldo del sofá, que corta el pie de la ventana: no son verticales.
- **Reproyección frente a vistas planas.** Cuatro vistas en perspectiva
  directa (fov 75°, 1200×800: ventana, cocina, entrada, pasillo) frente a las
  mismas remuestreadas de la equirectangular:
  - color: PSNR de 41,2 a 51,0 dB;
  - id: 99,81–99,88 % de píxeles iguales, y el 99,2–100 % de los distintos
    están a 1 px de un borde;
  - desplazamiento por correlación de fase: ≤ 0,07 px.
- **Distancias libres** (radiales, desde la cámara):
  - muro: 0,865 m (el tabique del dormitorio, al sur);
  - mobiliario: 1,07 m (una silla);
  - cocina: 3,28 m;
  - puerta: 1,51 m;
  - vidrio: 4,03 m.

  Cumple las reglas de ≥ 0,6 m del mobiliario y ≥ 1,0 m del vidrio.
- **Ventana del salón**, medida de cerca (toma auxiliar a 1,25 m del vidrio;
  desde el punto 360, el sofá tapa su pie):
  - hueco con carpintería de 0,79 m de ancho, de +0,16 a +2,35 m;
  - vidrio de 0,60 m, de +0,25 a +2,20 m, en dos hojas con travesaño a
    +1,00/+1,10;
  - techo a +2,50 m, así que el dintel es de 0,15 m.

  En altura es prácticamente suelo-techo. En anchura es una ventana
  estrecha, y es la única ventana de la estancia.

### Visor 360 de comprobación

Photo Sphere Viewer 5.15.1 con three 0.185.1 (ARQUITECTURA §8), instalado
con npm en una carpeta de trabajo, con una página mínima. Playwright saca
capturas con `visor.rotate({ yaw, pitch })` hacia la ventana, la cocina, la
entrada, el pasillo, el techo y el suelo. Hay que mirarlas siempre antes de
dar nada por bueno.

### Para la pasada de IA y después

- Pases como guía: `-depth.png` (cerca = claro, el formato de los ControlNet
  de profundidad), `-normal.png` e `-id.png` (segmentación con colores de
  ADE20K).
  - Si la herramienta no trabaja en equirectangular, se pasa a 6 caras con
    `ffmpeg -vf v360=e:c6x1` y se vuelve con `v360=c6x1:e`.
  - La costura y los polos son los puntos donde la IA suele romper: mirarlos.
- `comparar360.py` compara la panorámica nueva con los bordes del BIM:
  bordes entre clases del id, pliegues de normal de más de 20° y saltos de
  profundidad de más del 4 %. Da:
  - la recuperación de bordes a 2 y 4 px, por par de clases;
  - los bordes **inventados** sobre paños lisos de muro y techo (una ventana
    o un hueco que no existen), con su rumbo;
  - una imagen de control: verde, hay borde; rojo, falta; magenta,
    inventado.

  ```bash
  python3 nuevo/tools/captura/comparar360.py --id base-238-salon-id.png \
          --leyenda base-238-salon.json --nueva ia.jpg --salida control.jpg
  ```

  Se calibra con la base contra sí misma: 0 bordes inventados, y los pares
  muro/techo, muro/suelo, muro/carpintería y vidrio/carpintería al 100 %.
  Los blancos sobre blancos (puerta lacada sobre muro, frentes de cocina)
  apenas tienen contraste en la base y salen bajos ya de partida.

  Prueba con una copia manipulada (ventana borrada y otra pintada en el
  muro de la cocina):
  - vidrio/carpintería y muro/carpintería caen de 1,00 a 0,00;
  - la ventana falsa sale como manchas inventadas a 351°.
- Otra estancia: `--estancia "Dormitorio principal" --nombre
  base-238-dormitorio`. Otra vivienda necesita antes su `vivienda-<id>.json`
  (`procesar.py`).

## Limitaciones conocidas

- Calidad de captura en tiempo real (three.js por CPU), no de render: el
  entorno es la maqueta del visor (ortofoto estirada en los taludes del
  primer término, vecinos en volumen gris) y el interior se ve plano.
- La tipografía Neue Haas Grotesk no interviene aquí.
- Los números 2–5 de los otros edificios y el nombre «Hera» del 4 son una
  deducción del storyboard: confirmar con el cliente.
- 360 base (`interior360`):
  - Luz de captura en tiempo real: sin rebotes ni oclusión ambiental, y los
    materiales son los del modelo, así que se ve plano.
  - La vista por la ventana es la maqueta de `entorno.glb`.
  - El sol de la hora maestra no entra en el salón de la 238. Lo tapa el
    edificio vecino del oeste, a unos 4 m. Sin el entorno (`&entorno=0`),
    la mancha de sol cae en el extremo de la cocina.
  - La puerta de entrada no se ve desde el punto 360 del salón: la tapa el
    bloque del baño secundario.
  - **La geometría del BIM no coincide con el plano comercial de la 238**
    (`assets/planos/238.png`). En el BIM, la fachada del salón es recta y
    tiene una sola ventana estrecha junto a la cocina. En el plano
    comercial, la fachada de la cocina va retranqueada unos 0,6 m y hay un
    ventanal de unos 1,3 m más al sur. Ver
    `comprobacion/bim-vs-ficha-238.jpg`. Hay que decidir qué vale antes de
    vender con estos 360.

