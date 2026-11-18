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
  las tapas de `tapas.js`). Dos modos por carga de página:
  - `?modo=exterior`: `entorno.glb` + `apolo_envolvente.glb`, cámara en perspectiva;
  - `?modo=planta&planta=p1`: `apolo_corte_p1.glb` + mobiliario (lo de su
    planta, recortado con el plano de corte de cada cajón) + poché de
    `data/tapas_serenea.json`, sin entorno, fondo liso y cámara ortográfica
    cenital (norte = −z del SketchUp arriba). Claves de planta: nivel 1 =
    `baja`, 2 = `p1`, 3 = `p2`, 4 = `atico`.
  Expone `window.captura` (cámaras, `renderizar`, `mascaraPlantas`,
  `mascaraEdificios`, `mascaraViviendas`, `seccion`, `mobiliarioEn`).
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

## Limitaciones conocidas

- Calidad de captura en tiempo real (three.js por CPU), no de render: el
  entorno es la maqueta del visor (ortofoto estirada en los taludes del
  primer término, vecinos en volumen gris) y el interior se ve plano.
- La tipografía Neue Haas Grotesk no interviene aquí.
- Los números 2–5 de los otros edificios y el nombre «Hera» del 4 son una
  deducción del storyboard: confirmar con el cliente.
