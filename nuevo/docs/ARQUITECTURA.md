# SERENEA · Arquitectura técnica de /nuevo

Versión 1, del 18 de noviembre de 2026, para `https://showroom.unikdi.com/nuevo/`.

Este documento fija **cómo se construye** el showroom de renders: carpetas, datos, escenas con capas interactivas, vídeo, 360, rutas, panel de gestión, rendimiento y riesgos. Va con estos documentos:

- `DATOS.md`: el Excel, el catálogo `serenea.json` y sus reglas.
- `PRODUCCION_IMAGENES.md`: las piezas de imagen y vídeo y sus resoluciones.
- `REFERENTES_Y_FLUJO.md`: pantallas, estados y transiciones.
- `nuevo/tools/captura/LEEME.md`: cómo salen del BIM las imágenes y los polígonos que casan al píxel.

Si dos documentos se contradicen, en lo técnico manda este y en lo visual, `REFERENTES_Y_FLUJO.md`. Lo que está en otro documento se cita, no se repite.

Versiones de terceros comprobadas el 18-nov-2026 en el registro de npm (salvo donde se indica).

---

## 0. Decisiones, en una tabla

| # | Decisión | Descartado | Por qué |
|---|---|---|---|
| D-1 | **HTML + CSS + módulos ES nativos, sin compilación ni framework** | React, Vue, Preact, Svelte, Vite | Pocas pantallas, mucho control directo del DOM (vídeo, FLIP, SVG, zoom). Es lo que ya hace el repositorio. Cero dependencias en tiempo de compilación. |
| D-2 | **Tres capas de datos con un solo escritor cada una**: catálogo (Excel → panel), estado vivo (panel) y escenas (canal de producción, en git) | Mezclar geometría y negocio en el Excel | El cliente nunca toca polígonos y el canal de producción nunca toca precios. |
| D-3 | **El panel nuevo sustituye al antiguo como único escritor y conserva `/gestion/api/estado.php` sin tocar una línea**: en cada guardado reescribe `gestion/datos/estado.json` en el formato de siempre | Ampliar el panel antiguo; cambiar el endpoint | El ejecutable de Unreal y el visor antiguo siguen igual, sin recompilar. Detalle en §4.7. |
| D-4 | **Escena = render fijo + SVG en el espacio de píxeles del máster** dentro de un mismo «lienzo». `viewBox` = caja del encuadre en píxeles del máster | Coordenadas en %, canvas, CSS `object-fit` con SVG suelto | Casan al píxel a cualquier tamaño y recorte. El foco no tiene por qué estar centrado. |
| D-5 | **Polígonos por máscara de la misma cámara** (ya funciona en `tools/captura/`: IoU 0,987–0,990, desviación media del borde 0,34 px). En las cenitales, transformación afín exacta | Dibujarlos a mano | Exactitud medible. El editor manual queda como plan B (§5.4). |
| D-6 | **Encuadres como recortes del mismo máster** (16:9 y 9:16) y colocación por punto focal y zona segura | Una imagen distinta, con su máscara, por dispositivo | Un solo juego de polígonos sirve para todos los recortes. |
| D-7 | **Vídeo MP4 H.264 de base, AV1 y HEVC opcionales.** Se descarga entero a memoria antes de poder pulsar; vuelta en fichero aparte; fundido 2D de respaldo | Vídeo en *streaming*, `playbackRate` negativo | En iOS, `preload` no garantiza nada. Con el fichero en memoria, el arranque es inmediato y el corte, invisible. |
| D-8 | **Photo Sphere Viewer 5.15.1** con VirtualTour, Markers, Gyroscope y CubemapTilesAdapter. Cubo multirresolución en teselas WebP de 512 px | Pannellum 2.5.7, Marzipano 0.10.2 (archivado) | Mantenido, MIT, ESM, transiciones con giro y fundido, precarga de nodos contiguos. Comparativa en §8. |
| D-9 | **Rutas reales con el History API** (`/nuevo/apolo/planta-2/238`), servidas por un `index.php` mínimo que escribe Open Graph por vivienda. Modo de respaldo `?r=` si el hosting no admite `FallbackResource` | Rutas con `#` | WhatsApp y las redes no envían el `#` al servidor: sin ruta real no hay vista previa por vivienda. |
| D-10 | **Acceso al panel por `/nuevo/#g=<clave>`.** El fragmento nunca llega al servidor. Clave personal de 256 bits; en el servidor solo se guarda su huella SHA-256; se compara con `hash_equals` y viaja en una cabecera propia | `?g=` en la consulta; usuario y contraseña | No aparece ninguna pantalla de inicio de sesión. La clave no queda en los registros del hosting ni en el `Referer`. Sin cookies no hay CSRF. |
| D-11 | **Binarios de `media/` fuera de git** (≈ 1–1,5 GB solo para Apolo), en paquetes adjuntos a *releases* de GitHub y con un despliegue propio que compara tamaños | Meterlos en la rama de trabajo | El repositorio se seguiría clonando en minutos, y cada push no volvería a subir un giga por FTP. |
| D-12 | **El código va en una carpeta versionada por commit** (`app/<sha8>/`) | Confiar en las cabeceras de caché del hosting | No se sabe si Plesk aplica las cabeceras del `.htaccess` a los ficheros estáticos (§14). Con la carpeta versionada, la caché no puede servir una mezcla de versiones. |

---

## 1. Principios

1. **Lo que se ve es lo que se pulsa.** Cada forma interactiva sale de la misma cámara que su imagen y se comprueba con números (IoU, desviación del borde), no a ojo.
2. **Nada depende de un único fichero, un único navegador o una única cabecera.** Cada pieza crítica tiene respaldo:
   - vídeo → fundido;
   - estado vivo → copia local con fecha;
   - rutas reales → `?r=`;
   - caché → nombres con huella.
3. **La web pública no carga lo que no enseña.** No hay three.js hasta el 360, ni SheetJS fuera del panel, ni vídeo con poca red.
4. **PHP solo donde hace falta**: el armazón de la página (Open Graph) y la API del panel. Todo PHP 5.6.
5. **Un solo escritor por dato** (D-2) y **cada escritura**:
   - es atómica;
   - queda registrada;
   - deja copia de la versión anterior.

---

## 2. Carpetas

### 2.1 `nuevo/` (lo que hay y lo que se añade)

```
nuevo/
├── index.php            armazón de la página (sustituye al index.html provisional): metas, OG, CSP, enlaces de precarga
├── .htaccess            DirectoryIndex, FallbackResource, tipos MIME, caché (si el hosting la aplica)
├── app/                 código del front (en el servidor queda en app/<sha8>/, ver §3.3)
├── data/                catálogo base y esquemas (en git, público)
│   ├── serenea.json         catálogo generado del Excel (DATOS.md)
│   ├── tipologias.json      tipologías, variantes, transformaciones
│   ├── esquema_plantilla.json  reglas del Excel, compartidas por Python y el panel
│   ├── escenas/             NUEVO: geometría y medios de cada escena (JSON, en git), §4.3
│   └── fuentes/             privado (.htaccess)
├── media/               NUEVO contenido: binarios con huella en el nombre (FUERA de git, §2.4)
├── gestion/             PHP 5.6: API del panel
│   ├── lib.php
│   ├── accesos.php          huellas de las claves personales (en git: huellas, nunca claves)
│   ├── api/                 serenea.php (público), sesion.php, cambios.php, catalogo.php, historial.php, restaurar.php, evento.php, contacto.php
│   └── datos/               SOLO en el servidor: estado vivo, catálogo importado, registro, copias, intentos (.htaccess: denegado)
├── estilos/             página de propuestas de diseño (temporal; se retira al lanzar)
├── docs/ tools/ plantilla/   no se publican (el deploy los excluye)
```

### 2.2 `nuevo/app/`

```
app/
├── acceso.js              script clásico de < 1 KB en el <head>: lee #g=, lo pasa a sessionStorage y limpia la barra (§10.1)
├── inicio.js              entrada: arranque, datos, rutas, primera escena
├── nucleo/
│   ├── rutas.js           análisis y escritura de URLs, historial, enlaces profundos (§9)
│   ├── almacen.js         estado de la aplicación: un objeto y suscriptores, sin dependencias
│   ├── datos.js           pide api/serenea.php y guarda la última copia buena en localStorage
│   ├── medios.js          elige el fichero: encuadre, ancho, formato (AVIF/WebP), códec de vídeo
│   ├── precarga.js        cola con prioridades (crítico, probable, especulativo); se cancela al navegar
│   ├── red.js             estimación de la velocidad con las propias descargas (Safari no tiene Network Information)
│   ├── i18n.js · formato.js   textos por clave e Intl (precios, m², fechas)
│   ├── a11y.js            anuncios en región viva, foco al cambiar de escena
│   ├── analitica.js       eventos agregados sin cookies (§11.2)
│   └── errores.js         errores de JS al servidor (agregados) y recarga si falta un módulo tras un despliegue
├── escena/
│   ├── lienzo.js          la pieza central: imagen + vídeo + SVG en el mismo sistema (§5.1)
│   ├── encuadre.js        cálculo de escala y posición por foco y zona segura (§6.2); pura, con pruebas
│   ├── capas.js           dibuja polígonos, velos y chinchetas a partir del JSON de escena
│   ├── zoom.js            rueda, pellizco, arrastre, doble toque, botones; con inercia
│   ├── teselas.js         pirámide de teselas de la planta, solo las visibles
│   ├── video.js           descarga a memoria, reproducción, corte invisible (§7)
│   └── transicion.js      director de escena: decide la transición entre dos rutas y la hace interrumpible
├── pantallas/             conjunto, edificio, planta, ficha, pagos, recorrido360, listado, contacto, avisame, no-encontrada
├── componentes/           barra, migas, riel, hoja (inferior), dialogo, leyenda, bolita, etiqueta, aviso
├── gestion/               SOLO se importa con una clave válida (import() dinámico)
│   ├── gestion.js · sesion.js · edicion.js
│   ├── importar.js · validar.js · diferencias.js   Excel → validación → vista previa
│   ├── exportar.js · historial.js
├── estilos/               tokens.css · base.css · escena.css · componentes.css · pantallas.css · gestion.css
├── i18n/                  es.json · en.json · de.json
├── fuentes/               WOFF2 con licencia web, recortadas a latín (§11.5)
└── vendor/                terceros, versión exacta en la ruta, con licencia
    ├── three/0.185.1/                     three.core.min.js, three.module.min.js
    ├── photo-sphere-viewer/5.15.1/        core, markers-plugin, virtual-tour-plugin, gyroscope-plugin, cubemap-adapter, cubemap-tiles-adapter
    ├── xlsx/0.20.3/                       SheetJS (solo panel)
    ├── exceljs/4.4.0/                     ExcelJS (solo panel, exportación con formato)
    └── LICENCIAS/
```

Reglas del código:

- **Entre módulos, rutas relativas.** Los datos, los medios y la API se piden con `url('data/…')` desde la base que escribe `index.php` (`<meta name="app-base" content="/nuevo/">`), nunca con `../`. Así el código funciona igual en `app/` (desarrollo) que en `app/<sha8>/` (servidor).
- **Sin especificadores sueltos.** Photo Sphere Viewer importa `"three"` y `"@photo-sphere-viewer/core"`. Al copiarlo a `vendor/` (script `nuevo/tools/vendor.sh`, que se ejecuta una vez por versión) se reescriben esas importaciones a rutas relativas. Con eso **no hace falta un mapa de importación** (`importmap`): ni script en línea (lo que simplifica la CSP) ni el requisito de Safari 16.4.
- **`/nuevo` no usa nada de la raíz del sitio.** Hoy el `index.html` provisional tira de `../assets/fonts` y `../assets/icono`, y la raíz la publica otra rama con otro workflow. Si allí actualizan three.js a la r187, se rompería Photo Sphere Viewer, que exige `^0.185.1`. Por eso three.js, las fuentes y el favicon se copian dentro de `nuevo/`.

### 2.3 `nuevo/data/escenas/` (en git) y `nuevo/media/` (fuera de git)

Las escenas (JSON pequeños, 3–10 KB comprimidos) se versionan con el código. Los binarios a los que apuntan van con huella en el nombre:

```
media/
├── conjunto/   CJ-EXT-01.h.2560.3f9a2c1d.avif   ·   CJ-EXT-01.v.1080.a01b77e2.webp   …
├── apolo/
│   ├── exterior/   AP-EXT-01.{h|v}.{ancho}.{huella}.{avif|webp|jpg}
│   ├── video/      AP-VID-01.{h|v}.{alto}.{h264|av1|hevc}.{huella}.mp4   ·   AP-VID-01.{h|v}.ini.{huella}.webp (cartel)
│   ├── plantas/    P2.resumen.{ancho}.{huella}.webp   ·   P2.t.{huella}/{nivel}/{col}_{fila}.webp
│   ├── viviendas/  238.cenital.{ancho}.{huella}.{avif|webp}   ·   238.og.{huella}.jpg
│   └── 360/        {código de panorámica}.{huella}/previa.webp · {cara}{nivel}_{col}_{fila}.webp
├── comunes/    zonas comunes
└── marca/      logotipos en SVG
```

- Los códigos son los de la nomenclatura de `PRODUCCION_IMAGENES.md` §2.9.
- La huella son los 8 primeros caracteres hex del SHA-256 del contenido. En las carpetas de teselas es la del máster más los parámetros.
- Un fichero que cambia cambia de nombre, así que **se puede cachear un año sin riesgo**, se apliquen o no las cabeceras.
- Lo escribe el canal de medios (`nuevo/tools/medios/`, por construir). Ese canal genera los derivados, el JSON de escena con los nombres finales y el paquete para subir.

### 2.4 Publicación (cambios que hay que hacer fuera de `nuevo/`)

Volumen estimado de los derivados web **solo de Apolo**:

| Pieza | Volumen |
|---|---|
| Imágenes fijas | ≈ 25 MB |
| Vídeos | ≈ 35 MB |
| Teselas de planta | ≈ 40 MB |
| Cenitales | ≈ 80 MB |
| Imágenes OG | ≈ 20 MB |
| 360 (≈ 320: 285 interiores y 34 de terraza, unos 3 MB cada uno) | ≈ 0,7–1,1 GB |

El deploy actual hace `mirror --transfer-all --delete` de `nuevo/` entero en cada push. Con los medios dentro, subiría un giga en cada commit. Propuesta para el orquestador:

1. En `.github/scripts/ftp-deploy.sh`, parte `nuevo`, añadir `--exclude ^media/` junto a `--exclude ^gestion/datos/`. El código ya no toca los medios.
2. Nueva parte `medios`: `mirror -R --ignore-time --no-perms publish/nuevo/media nuevo/media`, que compara por tamaño y es suficiente porque los nombres llevan huella. **Sin `--delete`**: la limpieza se hace a mano con una opción `limpiar`.
3. Nuevo workflow `deploy-medios-nuevo.yml`, que se lanza al publicar una *release* `medios-*` o a mano:
   - descarga los adjuntos con `gh release download` y el `GITHUB_TOKEN`, sin secretos nuevos;
   - los descomprime en `publish/nuevo/media`;
   - llama a `ftp-deploy.sh medios`.

   Cada adjunto admite hasta 2 GB y no cuenta en el tamaño del repositorio. Alternativa: una rama huérfana `medios`, peor porque `git clone` la descarga por defecto.
4. En «Preparar carpeta de publicación» de `deploy-nuevo.yml`:
   - mover `publish/nuevo/app` a `publish/nuevo/app/<sha8>/`;
   - sellar `__BUILD__` también en `*.php`, porque `index.php` lleva la constante (§3.3).
5. En `check-nuevo`, comprobar también `nuevo/index.php`, `nuevo/gestion/lib.php` y `nuevo/gestion/api/serenea.php`.
6. Opcional, recomendado: `copia-datos-nuevo.yml`, programado a diario. Descarga por FTP `nuevo/gestion/datos/` (sin `intentos.json`) y lo guarda como artefacto del workflow durante 90 días. Es la copia fuera del servidor (§10.5).
7. Guardián PHP: ver §10.8.

---

## 3. Front sin compilación

### 3.1 Por qué

- La interfaz son unas diez pantallas con poca lógica de formularios y mucha coreografía: vídeo, fundidos, FLIP, zoom y capas SVG. Un framework con DOM virtual no ayuda en eso y obliga a esquivarlo a menudo.
- Sin compilación no hay `node_modules` que mantener. El código que se depura es el que se publica, y cualquier sesión puede retomarlo con un servidor estático. Es la línea del repositorio: el visor de la raíz es JavaScript sin framework.
- Para pintar se usa un ayudante ``html`…` `` de ~40 líneas que escapa siempre el texto (las cadenas del catálogo vienen del Excel) y devuelve un `DocumentFragment`. El estado vive en `almacen.js`: un objeto, `get/set/suscribir`.

### 3.2 Navegadores

Objetivo: los dos últimos años de Safari (iOS 16.4 o posterior), Chrome, Edge, Firefox y Samsung Internet. Lo que se usa y desde cuándo está:

| Función | Desde |
|---|---|
| Módulos ES | iOS 11 |
| `<dialog>` | iOS 15.4 |
| `requestVideoFrameCallback` | Safari 15.4 / Firefox 132 |
| AVIF | iOS 16 |
| WebP | iOS 14 |
| `100dvh` | iOS 15.4 |
| `img.decode()` | Safari 11.1 |

Lo que falte se detecta y tiene alternativa:

- sin `rVFC`, se usa el evento `playing`;
- sin AVIF, WebP;
- con un navegador más antiguo, la web funciona sin vídeos ni 360, con imágenes y fundidos, y en el 360 se ve la previa plana.

### 3.3 Caché y versiones

- **HTML** (`index.php`): `Cache-Control: no-cache`. Lo pone PHP, así que se aplica seguro.
- **Código**: en el servidor vive en `app/<sha8>/`, y `index.php` apunta a esa carpeta con una constante que sella el deploy:

  ```php
  $build = '__BUILD__';
  $app = (strpos($build, '__') === 0) ? 'app/' : 'app/' . $build . '/';
  ```

  En desarrollo no hay sello y se sirve `app/`.
- **Visitante con la página abierta durante un despliegue.** Su próximo `import()` diferido (el 360, por ejemplo) pedirá un módulo que ya no existe. `errores.js` captura ese fallo y recarga en la misma ruta. Como el estado está en la URL, el usuario no pierde nada.
- **Medios**: nombres con huella, por tanto inmutables.
- **Datos**: `api/serenea.php` con `ETag` y `no-cache`, que responde `304` si no ha cambiado.

---

## 4. Modelo de datos

### 4.1 Jerarquía y claves

```
Promoción (serenea)
 └─ Edificio (apolo, zeus, atenea, hera, hermes)                 clave: id
     ├─ Escena «edificio» (una por cámara)                       clave: <edificio>/edificio
     └─ Planta (P1…P4 → ruta planta-1 … atico)                   clave: (edificio, código)
         ├─ Escena «planta» (cenital + teselas)                  clave: <edificio>/<código>
         └─ Vivienda (101…436, única en la promoción)            clave: id
             ├─ Escena «vivienda» (cenital detallada + contorno + estancias)
             └─ Estancia (SCC, D1, B1, TE…)                      clave: (vivienda, código)
                 └─ Punto 360 (salon, cocina, dormitorio-1, terraza-2…)   clave: (vivienda, punto)
                     └─ Panorámica (por tipología, ventana y espejo)       clave: código de panorámica
                         └─ Enlaces (yaw, pitch → otra panorámica)
```

- Los identificadores de vivienda son los de siempre: `101`…`436` en Apolo, con prefijo en los demás edificios (DATOS.md). **No se renumeran nunca**, porque son la clave en el Excel, el catálogo, las escenas, `estado.php` y las mallas de Unreal.
- Rutas legibles:
  - planta: `slug(nombre)` → `planta-1`, `planta-2`, `planta-3`, `atico`;
  - punto 360: derivado del código de estancia → `SCC` = `salon` (y `cocina` si tiene dos puntos), `EST` = `estudio`, `D1` = `dormitorio-1`, `B1` = `bano-1`, `TE` = `terraza` (y `terraza-2`).

### 4.2 Tres capas, tres escritores

| Capa | Qué contiene | Quién la escribe | Dónde vive | Cómo llega a la web |
|---|---|---|---|---|
| **Catálogo** | Edificios, plantas, viviendas, superficies, estancias, planes de pago, textos | El Excel, importado en el panel (o `excel_a_json.py` en local) | `nuevo/gestion/datos/catalogo.json` (servidor); de base, `nuevo/data/serenea.json` (git) | `api/serenea.php`, unido al estado vivo |
| **Estado vivo** | Por vivienda: `estado`, `precio`, `visible` | Solo el panel nuevo | `nuevo/gestion/datos/estado.json` + puente a `gestion/datos/estado.json` | `api/serenea.php` y, para Unreal, `/gestion/api/estado.php` |
| **Escenas** | Cámaras, encuadres, nombres de los ficheros, polígonos, chinchetas, puntos, panorámicas, enlaces, transiciones | El canal de producción (`tools/captura`, `tools/medios`) | `nuevo/data/escenas/*.json` (git) + `nuevo/media/` | Estáticos, por escena y a demanda |

Cómo se unen: por `id` de edificio, (edificio, código de planta), `id` de vivienda y (vivienda, código de estancia).

**Reglas de unión** (las aplica el front y las avisa el panel):
- **Vivienda en el catálogo sin geometría en la escena**: sale en el listado, pero no en la planta. El panel avisa «sin polígono».
- **Polígono sin vivienda en el catálogo**: no se dibuja y se anota en la consola de desarrollo.
- **Bolita 360**: solo donde el Excel dice `Tiene 360` **y** existe la panorámica. Si no coinciden, el panel lo avisa.
- **Edificio sin escena** (Zeus, Atenea, Hera y Hermes hoy): se presenta «Próximamente» (REFERENTES I-3/I-4).

### 4.3 Escena (JSON en `data/escenas/`)

Coordenadas: **píxeles del máster**, origen arriba a la izquierda, continuas (el centro del primer píxel es 0,5), igual que los JSON de `tools/captura`. Polígonos como `d` de SVG con un decimal: es más compacto y se pinta directamente. Los agujeros van en el mismo `d` y se pintan con `fill-rule="evenodd"`.

```json
{
  "esquema": 1,
  "id": "apolo/edificio",
  "tipo": "imagen",
  "camara": "AP-C01",
  "master": { "ancho": 5120, "alto": 2880 },
  "fondo": "#e8e4dc",
  "foco": [2610, 1480],
  "zonaSegura": [700, 520, 4420, 2480],
  "encuadres": [
    { "id": "h", "caja": [0, 0, 5120, 2880],
      "imagen": { "avif": { "1280": "media/apolo/exterior/AP-EXT-01.h.1280.1c2d3e4f.avif",
                            "2560": "…", "3840": "…" },
                  "webp": { "1280": "…", "2560": "…", "3840": "…" } } },
    { "id": "v", "caja": [1750, 0, 1620, 2880],
      "imagen": { "avif": { "720": "…", "1080": "…", "1620": "…" }, "webp": { "…": "…" } } }
  ],
  "capas": {
    "plantas": [
      { "planta": "P1", "d": "M1012.4 1980.1L…Z", "etiqueta": [4510, 1990] },
      { "planta": "P4", "d": "M…Z M…Z", "etiqueta": [4510, 1410] }
    ],
    "chinchetas": [ { "edificio": "hera", "x": 402, "y": 1210 } ]
  },
  "verificacion": { "metodo": "mascara-misma-camara", "iou": [0.987, 0.990], "desviacionBordePx": 0.34 }
}
```

- **Planta** (`apolo/P2`):
  - `tipo: "planta"`;
  - `transformacion: { a, b, c, d, pxPorMetro }` (la de `planta-2-viviendas.json`);
  - `norte` (ángulo) y `escala` (px/m);
  - `teselas: { base, niveles: [{ pxPorMetro: 25 }, { 50 }, { 100 }], tam: 512 }`;
  - `capas.viviendas: [{ id, d, ancla }]`, donde `ancla` es el punto de la etiqueta: el centroide, o el punto más alejado del borde si el centroide cae fuera.

  La planta 3 de Apolo **reutiliza los ficheros de imagen de la planta 2** (`PRODUCCION_IMAGENES.md` §1.1) y tiene sus propias claves de vivienda.
- **Vivienda** (`apolo/v/238`):
  - `tipo: "vivienda"`, imagen cenital;
  - `contorno`, `estancias: [{ codigo, d }]` (para R-9) y `puntos: [{ punto, estancia, x, y, panoramica, espejo, rumbo }]`.

  El canal ya resuelve las transformaciones de `tipologias.json` (giro y espejo), así que **el front nunca calcula espejos**.
- **Transiciones** (`data/escenas/transiciones.json`):

  ```json
  { "de": "conjunto", "a": "apolo/edificio",
    "video": { "h": { "h264": "…", "av1": "…", "hevc": "…", "cartel": "…", "fps": 25, "duracion": 4.6 },
               "v": { "…": "…" } },
    "vuelta": "apolo/edificio→conjunto" }
  ```

  La vuelta es otra entrada con su propio fichero.

### 4.4 Panorámicas y puntos (`data/escenas/<edificio>/panoramicas.json`)

```json
{ "codigo": "SER-AP-360-2D-08-N2-SCC",
  "teselas": "media/apolo/360/SER-AP-360-2D-08-N2-SCC.7a1b2c3d/",
  "niveles": [ { "cara": 512, "teselas": 1 }, { "cara": 1024, "teselas": 2 }, { "cara": 2048, "teselas": 4 } ],
  "previa": "previa.webp",
  "rumbo": { "yaw": 1.92, "pitch": -0.05 },
  "norte": 0.31,
  "camaraBIM": [73.4, 6.1, -14.2],
  "enlaces": [ { "a": "SER-AP-360-2D-08-N2-D1", "yaw": -2.40, "pitch": -0.32, "etiqueta": "D1" } ],
  "espejo": "SER-AP-360-2D-08-N2-SCC-E" }
```

- **Origen de los ángulos**: los *yaw* y *pitch* salen del BIM, desde la posición de la cámara hasta el centro de cada puerta (`PRODUCCION_IMAGENES.md` §2.5). La versión espejada es otro juego de teselas con `yaw' = −yaw`.
- **`norte`** sirve para orientar el cono de visión del mini plano.
- **Recorrido de una vivienda**: es la lista de sus `puntos` (§4.3). Cada punto apunta a una panorámica.
- **Enlaces que se ven**: solo los que llevan a estancias de esa misma vivienda. Al montar el recorrido, el front los filtra por los códigos de estancia.

### 4.5 Documento público: `GET /nuevo/gestion/api/serenea.php`

- **Forma**: la de `serenea.json` (`DATOS.md`), con el estado vivo ya aplicado, más un bloque `vivo: { sello, actualizado }`.
- **Generación**: se calcula **al guardar**, no al pedirlo. El PHP escribe `datos/publico.json` y el endpoint solo hace `readfile` con su `ETag`.
- **Respuesta**: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-cache` y `304` si nada ha cambiado.
- **Lo que no publica**:
  - notas internas;
  - en las viviendas con `visible: false`, el precio y el plan de pagos.
- **Peso**: hoy, 149 KB sin espacios y **7 KB comprimido** para 166 viviendas. Para las 307 de la promoción serán unos 15 KB. Se pide entero al arrancar; no compensa trocearlo.
- **Respaldo en el front**:
  - si el endpoint falla, `localStorage['serenea.datos']` con su fecha y el aviso «Disponibilidad a fecha …»;
  - si tampoco hay copia, `data/serenea.json`, **sin estados ni precios** (REFERENTES I-14: nunca se enseña como disponible algo que podría estar vendido).

### 4.6 Contrato con el panel

- **Qué edita el panel en contexto**: `estado` (`disponible` | `reservada` | `vendida` | `no-a-la-venta`), `precio` (euros enteros sin impuestos, o `null`) y `visible`. Nada más.
- **Qué cambia la importación del Excel**: el catálogo entero. Respeta el estado vivo salvo que se marque «Aplicar también estados y precios del Excel» (`DATOS.md`).
- **Qué no toca nunca**: las escenas. Un polígono mal puesto se corrige en el canal de producción, no en el panel.
- **Validación**: toda escritura la valida también el servidor, aunque el navegador ya lo haya hecho (§10.4).

### 4.7 Convivencia con `/gestion` y `/gestion/api/estado.php` (recomendación)

**Recomendación: el panel nuevo sustituye al antiguo como único escritor, y el endpoint se conserva intacto.** Es lo que ya propone `DATOS.md` y aquí se concreta la mecánica:

```
 panel nuevo (/nuevo/#g=…) ──► nuevo/gestion/datos/estado.json   (4 estados, precio, visible)
            │                        │
            │                        ├─► nuevo/gestion/datos/publico.json ──► /nuevo/gestion/api/serenea.php ──► web nueva
            │                        │
            └── puente, en el mismo guardado ──► gestion/datos/estado.json ──► /gestion/api/estado.php (SIN CAMBIOS)
                                                                                 ├─► visor de la raíz
                                                                                 └─► ejecutable de Unreal
```

1. **Puente.** En cada guardado, el PHP nuevo reescribe `../../gestion/datos/estado.json`:
   - mismo formato: `actualizado`, `sello` (12 caracteres hex del SHA-256 del mapa ordenado), `total`, `viviendas`;
   - escritura atómica (temporal + `rename`), como hace `lib.php`;
   - **solo las viviendas de Apolo** (las del edificio `apolo` del catálogo; no se lee nada de la raíz del sitio);
   - `no-a-la-venta` se publica como `vendida`, para que el ejecutable no la ofrezca.

   `estado.php` lee el `sello` guardado y no lo recalcula, así que no hace falta reproducir byte a byte la función antigua: basta con que el sello cambie cuando cambia el contenido. El `ETag` y el `304` del ejecutable siguen funcionando igual.
2. **Reconciliación mientras convivan los dos paneles.**
   - El panel nuevo anota el sello que escribió (`datos/puente.json`).
   - Si, al leer o antes de guardar, el sello de `gestion/datos/estado.json` es otro, alguien ha guardado desde el panel antiguo. Esos tres estados se incorporan al estado vivo con autor «panel antiguo», quedan en el registro y después se aplica lo nuevo.
   - Así no se pierde ninguna venta apuntada en la transición.
3. **Primera carga.** Los estados de partida se toman **leyendo directamente** `gestion/datos/estado.json` en el servidor, no por HTTP. Es la opción por defecto en la primera importación (`DATOS.md`).
4. **Retirada del panel antiguo**, cuando el nuevo esté probado. En su rama, `gestion/index.php` pasa a solo lectura con «Este panel se ha trasladado» y un enlace. Lo decide el orquestador porque es código de la otra rama.
5. **Si el puente no puede escribir** (por ejemplo, por permisos de `gestion/datos/`), el guardado del panel nuevo se completa igual, pero aparece en rojo «La oficina no recibirá este cambio: el puente con /gestion ha fallado» y queda en el registro. Nunca falla en silencio.
6. **Equipos de la oficina.** El panel nuevo lee `gestion/datos/equipos.json` y muestra «Oficina · ventas-01 · visto hace 4 min · al día / con datos de ayer».
7. **Si Unreal llega a necesitar precios**, no se toca `estado.php`: se le ofrece `/nuevo/gestion/api/serenea.php`, que ya los publica.

---

## 5. Escenas por imagen y capas SVG

### 5.1 El lienzo

Cada escena se pinta en un `lienzo`: un elemento con exactamente la **proporción del encuadre** que se esté usando. Dentro van tres capas, que lo rellenan entero:

```html
<div class="lienzo" style="left:…px; top:…px; width:…px; height:…px">   <!-- caja del encuadre en px de pantalla -->
  <img class="lienzo__imagen" alt="" decoding="async">                   <!-- object-fit: fill (misma proporción) -->
  <video class="lienzo__video" muted playsinline disablepictureinpicture hidden></video>
  <svg class="lienzo__capas" viewBox="1750 0 1620 2880" preserveAspectRatio="none">  <!-- viewBox = caja del encuadre en px del máster -->
    <g class="viviendas">
      <a href="/nuevo/apolo/planta-2/238/" class="viv estado-disponible" aria-label="Vivienda 238, 2 dormitorios, 61,4 m² útiles, disponible, 189.000 € más IGIC">
        <path d="M…Z" />
      </a>
    </g>
  </svg>
</div>
```
*(Las cifras del `aria-label` son ilustrativas.)*

- **`viewBox` = caja del encuadre en píxeles del máster.** El recorte vertical de un render apaisado no necesita polígonos nuevos: cambia el `viewBox`, no la geometría.
- **`preserveAspectRatio="none"`.** Imagen, vídeo y SVG tienen la misma proporción y rellenan la misma caja, así que la correspondencia es idéntica en las tres capas, incluso con el redondeo de subpíxel.

  Lo que **no** se hace es poner `object-fit: cover` a la imagen y un SVG con `xMidYMid slice` encima. Coinciden solo con el foco centrado; un `object-position` del 30 % ya no tiene equivalente en SVG.
- **La caja se coloca en píxeles de maquetación** (`left`, `top`, `width` y `height`), no con `transform: scale()`. Con `scale()` el navegador rasteriza el SVG y el texto al tamaño de antes y queda borroso.

  Durante el zoom y las animaciones sí se usa `transform`, con `will-change`. Al terminar, se consolida en la maquetación y se pinta nítido.
- **Grosor de línea**: `vector-effect: non-scaling-stroke`, para que no cambie con el zoom.
- **Puntería**:
  - `pointer-events: all` en los `path` y relleno transparente;
  - para llevar un puntero a coordenadas del máster, `svg.getScreenCTM().inverse()`, sin cuentas propias;
  - cada forma es un `<a href>` real: se enfoca con el tabulador, se abre en otra pestaña con el clic central, la leen los lectores de pantalla y no hace falta JavaScript para entender el enlace.

### 5.2 Cómo se obtienen los polígonos con exactitud

La regla es **imagen y máscara con la misma cámara, al mismo tamaño y de la misma geometría**. `tools/captura/` ya lo hace con el BIM y lo mide (`LEEME.md`, «Lo medido»):

| Escena | Método | Exactitud medida |
|---|---|---|
| Conjunto y edificio (perspectiva) | Máscara por planta lógica: cada fragmento se clasifica por su cota y se usan las cotas de los 8 cajones (los saltos de nivel salen solos). Contornos trazados ×4 y simplificados con Douglas-Peucker | IoU 0,987–0,990; desviación media del borde 0,34 px; contraste máximo en desfase 0 |
| Planta (ortográfica cenital) | **Transformación afín exacta**: `px = s·x − s·x0`, `py = s·z − s·z0`. Es la cuenta que hace la GPU. Polígonos de `data/viviendas_serenea.json` | 19 píxeles distintos de 860.591 (2·10⁻⁵), todos empates de borde |
| Vivienda cenital | La misma afín a 180 px/m. Las estancias salen de la sección a +1,0 m | 20 píxeles distintos de 2.175.048 |

**Con los renders definitivos** (D5 o el estudio), por orden de preferencia (`LEEME.md`, «Con los renders definitivos»):

1. **Pase de ID en el mismo render**: Material ID, Object ID o Cryptomatte, con un color plano por planta lógica y, en las cenitales, por vivienda. `procesar.py` lo traza igual que hoy.
2. **Cámara replicada.** El estudio entrega:
   - posición, objetivo, focal, ancho de sensor, resolución y *shift*;
   - todo en el marco del SketchUp.

   La máscara sale de la captura three.js y **se acepta solo con IoU ≥ 0,98 y desviación media ≤ 1 px** frente a la silueta del render (PRODUCCION §2.7).

   **Pendiente técnico:** el *shift* vertical (perspectiva de dos puntos, muy habitual en arquitectura) no está implementado en la captura. Hay que añadirlo con `camera.setViewOffset` antes de los renders definitivos del edificio.
3. **Ortográficas** con caja exacta (`x0`, `z0`, px/m) y norte arriba. La afín no cambia.

**Marcas de registro: el seguro cuando no se conocen los parámetros exactos** (D5 no siempre deja leer el ancho exacto de una ortográfica, y una imagen retocada puede haberse movido).

- En una pasada aparte con la misma cámara, se colocan cubos pequeños de color puro en coordenadas conocidas del BIM, fuera del edificio: 4 en una cenital, 8 o más en una perspectiva.
- Cenital: los centroides de las marcas dan la afín por mínimos cuadrados. Residuo aceptable: ≤ 0,5 px.
- Perspectiva: dan la cámara por PnP con OpenCV `solvePnP` y la focal libre. Residuo aceptable: ≤ 1 px.
- Con esa cámara se proyectan las máscaras del BIM.
- Coste: una pasada de render más por cámara. Se recomienda **exigirla en todas las cámaras**.

**Una imagen generada o retocada con IA** a partir de un render (Weave, Nano Banana, Veo) no conserva la geometría con garantías. Hay que volver a superponer los polígonos (PNG de comprobación de `procesar.py`) y, si se ha movido, retrazar. Nunca se publica sin esa comprobación.

**Limpieza.** Los polígonos de `viviendas_serenea.json` llevan dientes de 5 cm (la rejilla con que se dedujeron). En las vistas de planta se simplifican con Douglas-Peucker a 0,8–1 px y regularización ortogonal. En la cenital de vivienda (180–200 px/m, un diente = 9–10 px) se usa el contorno de la sección del muro, como ya hace `procesar.py`.

### 5.3 Estados, foco y accesibilidad de las formas

- Clases por estado: `estado-disponible | reservada | vendida | no-a-la-venta`, más `.seleccionada`, `.filtrada` y `:focus-visible`. Los valores visuales están en REFERENTES §5.1.
- El velo gris es **el propio `path`** con `fill` gris semitransparente, así que tiene exactamente la geometría de la vivienda, como pide el cliente.
- El estado no se transmite solo con color: la etiqueta («Vendida», «Reservada») y el `aria-label` lo dicen en texto.
- **Navegación con teclado**:
  - el tabulador recorre las viviendas por filas de la imagen, de arriba abajo y de izquierda a derecha;
  - las flechas saltan a la vecina más cercana en esa dirección;
  - en el edificio, ↑/↓ cambian de planta, en sincronía con el riel.

### 5.4 Plan B: editor manual de polígonos

Para piezas sin máscara posible (una foto real, un render de IA aprobado o el ajuste fino de un borde), herramienta de trabajo en `nuevo/tools/editor-poligonos/`. No se publica.

- **Entrada**: la imagen y su JSON de escena.
- **Edición**:
  - arrastrar vértices, añadir y quitar puntos, crear huecos;
  - asignar un `id` del catálogo, con lista desplegable de las viviendas de esa planta;
  - ajuste magnético al borde de la imagen, por gradiente, opcional.
- **Comprobación**: superposición al 50 %, lupa ×4 y lista de viviendas del catálogo sin polígono.
- **Salida**: el mismo JSON, con `verificacion.metodo: "manual"` y la fecha.

Variante para el 360: un clic sobre la panorámica da *yaw* y *pitch* (evento `click` de Photo Sphere Viewer), para colocar o corregir enlaces.

---

## 6. Encuadre adaptable

### 6.1 Encuadres por pieza

Cada máster se publica en **dos encuadres**, que son recortes del mismo máster (PRODUCCION §2.6):

- **`h`**: 16:9 completo, para escritorio y tableta apaisada.
- **`v`**: 9:16 desde la zona segura, para móvil vertical. Por ejemplo, de 5120×2880 sale un recorte de 1620×2880 que se sirve a 1080×1920.

Los vídeos se recortan igual, así que el último fotograma del vídeo `v` coincide con el recorte `v` de la imagen fija. Para otras proporciones (4:3 del iPad, 21:9 de los monitores panorámicos, móvil apaisado) se elige el encuadre de proporción más cercana, con `|ln(aspecto) − ln(W/H)|` mínimo, y se coloca con el algoritmo de abajo.

### 6.2 Algoritmo (`escena/encuadre.js`, función pura con pruebas)

```
Entrada:
  área visible W×H en px CSS
  márgenes de la interfaz (columna lateral, barra, hoja inferior)  → área útil U
  encuadre: caja (cx, cy, cw, ch), foco F, zona segura S, todo en px del máster
  zoom z ≥ 1

s_cubrir = max(W / cw, H / ch)                 # la imagen cubre toda el área visible
s_segura = min(U.w / S.w, U.h / S.h)           # la zona segura cabe en el área útil
s_ajuste = min(W / cw, H / ch)                 # la imagen cabe entera
s = clamp(min(s_cubrir, s_segura), s_ajuste, ∞) · z

# colocar el foco en el centro del área útil
tx = U.cx − s·(F.x − cx)
ty = U.cy − s·(F.y − cy)

# sin bandas vacías mientras la imagen sea mayor que el área visible
si cw·s ≥ W:  tx = clamp(tx, W − cw·s, 0)  si no: tx = (W − cw·s)/2
si ch·s ≥ H:  ty = clamp(ty, H − ch·s, 0)  si no: ty = (H − ch·s)/2

# prioridad a la zona segura frente al foco
desplazar tx, ty lo mínimo para que S quede dentro de U, siempre que el paso anterior lo permita

Salida: caja del lienzo (tx, ty, cw·s, ch·s) y el ancho de imagen necesario = cw·s·devicePixelRatio
```

- Si `s_segura < s_cubrir` quedan bandas. Se pintan con `fondo`, el color liso de los bordes del render. Por eso los renders se encargan con sangrado generoso alrededor de la zona segura.
- **El ancho que devuelve el algoritmo decide el fichero**: se elige el escalón ≥ ese ancho, con un máximo de 2560 px en móvil. Lo elige JavaScript, no `srcset`, para que la precarga y la pantalla pidan **el mismo fichero** y la imagen esté decodificada (`img.decode()`) antes del cambio.

### 6.3 Por pantalla

| Pantalla | Escritorio | Móvil vertical |
|---|---|---|
| Conjunto | Encuadre `h`, foco en el centro del conjunto, zona segura = los cinco edificios | Encuadre `v` con foco en Apolo. Si los cinco edificios no caben, **paneo horizontal** con inercia dentro de los límites, chips de edificio abajo |
| Edificio | `h` con la columna de la ficha del edificio a un lado: el foco se centra en el área útil, no en la pantalla | `v` si existe el recorte 9:16 del edificio; si no, el `h` a 3:4 con paneo. **El riel de plantas es el selector principal**: las bandas de planta miden 15–30 px a ese tamaño |
| Planta | Encaje completo en el área útil + zoom | **Dos opciones para el cliente**: (a) norte arriba, encaje a lo ancho y zoom; (b) **planta girada 90°** para que la huella alargada de Apolo (≈ 3,2:1) llene la pantalla vertical, con la flecha de norte girada. El giro es una propiedad del encuadre (`giro: 90`) que aplica la misma transformación a imagen y SVG |
| Ficha (cenital de vivienda) | Encaje completo en el panel derecho | Ancho completo, zoom con pellizco |
| 360 | Zona derecha de la ficha (viñeta 7) | Pantalla completa |

### 6.4 Zoom y teselas de la planta

- Hay un **resumen** de la planta completa: ≤ 2400 px de ancho en móvil y ≤ 4096 px en escritorio. Encima se colocan las **teselas** de 512 px en los niveles 25, 50 y 100 px/m, y 200 px/m si se aprueba el coste (PRODUCCION §2.6).
- `teselas.js` calcula el nivel por la escala en píxeles de dispositivo y pide solo las teselas visibles más un anillo de margen. Las coloca como `<img>` en coordenadas del máster dentro del lienzo, así que se mueven con la imagen y con el SVG.
- Lleva caché LRU: 60 teselas en móvil y 200 en escritorio.
- **Zoom máximo**: una vivienda llenando el área útil (viñeta 4 del storyboard). Con 100 px/m, una vivienda de 10 m ocupa 1000 px de imagen, que es nitidez de sobra en escritorio a DPR 1 y aceptable a DPR 2. El detalle fino lo da la cenital de la ficha.
- **Gestos**: rueda (con Ctrl en trackpad), pellizco, arrastre, doble toque, `+ / − / encajar` y teclado `+ −` y flechas.
  - `touch-action: none` **solo en el lienzo de la planta**; el zoom del navegador no se bloquea en ningún sitio.
- **OpenSeadragon 6.1.1** (BSD-3, mantenido) queda como plan B si el visor propio de teselas da problemas. No es la primera opción porque tiene su propio sistema de coordenadas y obligaría a sincronizar a mano el SVG, el vídeo y las transiciones.

---

## 7. Transiciones de vídeo

### 7.1 Codificación (`tools/medios/video.sh`)

A partir del máster ProRes o H.265 de 4K y 25 fps (PRODUCCION §2.6). En cada encuadre `h` y `v`:

```sh
# H.264, base universal
ffmpeg -i master.mov -vf "crop=…,scale=1920:1080:flags=lanczos,format=yuv420p" \
  -c:v libx264 -profile:v high -level:v 4.1 -preset slow -crf 21 -g 25 -bf 2 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -an -movflags +faststart AP-VID-01.h.1080.h264.mp4

# AV1 (Chrome, Firefox, Android; Safari solo con decodificador por hardware)
ffmpeg -i master.mov -vf "…" -c:v libsvtav1 -crf 34 -preset 6 -g 50 -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -an -movflags +faststart AP-VID-01.h.1080.av1.mp4

# HEVC opcional (Safari): -tag:v hvc1 es imprescindible para que Safari lo reproduzca en MP4
ffmpeg -i master.mov -vf "…" -c:v libx265 -crf 24 -preset slow -tag:v hvc1 -pix_fmt yuv420p … AP-VID-01.h.1080.hevc.mp4

# Vuelta: fichero aparte, invirtiendo los fotogramas (playbackRate negativo no existe en los navegadores)
ffmpeg -i master.mov -vf "reverse,…" … AP-VID-02.h.1080.h264.mp4

# Cartel = primer fotograma EXACTO del fichero codificado (no del máster: misma compresión y color)
ffmpeg -i AP-VID-01.h.1080.h264.mp4 -frames:v 1 -c:v libwebp -quality 90 AP-VID-01.h.ini.webp
```

Este contenedor tiene libx264, libx265, libsvtav1 y libaom.

- **Sin pista de audio.**
- **Tamaños orientativos para 4–5 s**:

  | Variante | H.264 | AV1 |
  |---|---|---|
  | 1080p (`h`) | 4–5 MB | 2,5–3 MB |
  | 1080×1920 (`v`) | ≤ 3 MB (más una de 720×1280 para «red lenta») | — |
- **Control de calidad automático**:
  - el último fotograma decodificado frente a la imagen fija de destino al mismo tamaño debe dar SSIM ≥ 0,95 y desfase ≤ 2 px (PRODUCCION §2.7);
  - el primero, frente a la imagen de origen, igual.

### 7.2 Elección del fichero (`medios.js`)

```js
const prueba = (codecs) => navigator.mediaCapabilities?.decodingInfo({
  type: 'file', video: { contentType: `video/mp4; codecs="${codecs}"`, width: 1920, height: 1080, bitrate: 6e6, framerate: 25 } });
// 1.º AV1 si es «smooth» y «powerEfficient»; 2.º HEVC con las mismas condiciones (Safari); 3.º H.264 siempre.
```

Se decide una vez por sesión y se guarda. El encuadre (`h`/`v`) sigue al de la imagen fija.

### 7.3 Reproducción (`escena/video.js`)

1. **Precarga** (§12): `fetch` del MP4 completo → `Blob` → `URL.createObjectURL` → `video.src`, `video.load()`.
   - En iOS, `preload="auto"` solo baja los metadatos; con el fichero en memoria, el arranque es inmediato y no dependemos de que el servidor atienda peticiones por rangos.
   - Además, la descarga propia da un progreso real.
2. **Al pulsar**: `video.play()` se llama **de forma síncrona dentro del manejador del clic o del toque**.
   - En el modo de bajo consumo de iOS, Safari bloquea la reproducción automática incluso de un vídeo silenciado, y la promesa de `play()` se rechaza con `NotAllowedError`.
   - Hay informes de que en ese modo ni el gesto la garantiza. Por eso existe el paso 5.
3. **Mostrar el vídeo solo cuando su primer fotograma está en pantalla**, con `requestVideoFrameCallback` (o, si no lo hay, `playing` más un `requestAnimationFrame`).
   - Hasta entonces se ve la imagen fija de origen, que es ese mismo fotograma: el cambio no se nota.
   - El atributo `poster` (el cartel) cubre el caso de un elemento que se muestra antes de decodificar.
4. **Final**:
   - con `rVFC`, cuando `mediaTime ≥ duración − 1/fps`, o con `ended`;
   - la imagen fija de destino, **ya decodificada** con `img.decode()`, entra encima con un fundido de 120–150 ms. El fundido tapa la pequeña diferencia de color entre el vídeo BT.709 y la imagen sRGB, que algunos navegadores (Safari sobre todo) dejan ver;
   - después se oculta el vídeo, se pausa y se deja preparado.
5. **Respaldo** (REFERENTES T-3). Se recurre a él:
   - si el vídeo no está listo en 300 ms;
   - si `play()` se rechaza;
   - con `prefers-reduced-motion`;
   - con `saveData` o red lenta.

   Entonces la caja del edificio se acerca en 2D (escala 1 → 1,25, centrada) y funde con la imagen fija de destino: 700 ms, sin aviso.
6. **Se puede interrumpir**: un toque durante el vídeo lo para y funde en 200 ms al destino. La segunda vez en la sesión va a 1,5×.
7. **Más de un vídeo a la vez, nunca.** Hay como mucho dos elementos `<video>` en la página: el que suena y el siguiente.

### 7.4 Límites de iOS Safari y cómo se respetan

| Límite | Medida |
|---|---|
| Reproducción automática (bajo consumo, ahorro de datos) | `play()` en el gesto, detección del rechazo y respaldo 2D (punto 5) |
| `preload` ignorado | Descarga a `Blob` (punto 1) |
| Memoria por pestaña: Safari cierra la pestaña sin aviso si la pestaña pasa de la memoria del sistema, mucho antes en un iPhone de 3–4 GB | LRU de imágenes decodificadas (8 grandes en móvil, 20 en escritorio), como mucho 3 vídeos en memoria (≈ 15 MB) y `URL.revokeObjectURL` al salir. El 360 se destruye (`viewer.destroy()`) al cerrarlo. Ninguna imagen de más de 16 MP en móvil |
| Contextos WebGL limitados (unos 16) | Un solo visor 360 vivo |
| Decodificación AV1 solo con hardware (A17 Pro, M3 o posterior) | `mediaCapabilities`; H.264 siempre disponible |
| HEVC en MP4 solo con la etiqueta `hvc1` | `-tag:v hvc1` |
| Color del vídeo frente a la imagen | BT.709 etiquetado, fundido final de 120–150 ms, prueba en un iPhone real antes de dar por buena cada pieza |
| Pantalla completa del vídeo | `playsinline`, `disablepictureinpicture`, sin `controls` |

---

## 8. Visor 360

### 8.1 Comparativa (comprobado el 18-nov-2026)

| | **Photo Sphere Viewer** | Pannellum | Marzipano |
|---|---|---|---|
| Versión actual | **5.15.1** (2-ago-2026; 5.15.0 el 26-jul) | 2.5.7 (19-feb-2026; la anterior, 2.5.6, es de nov-2019) | 0.10.2 (jun-2022). **Repositorio archivado el 20-abr-2026** (solo lectura) |
| Licencia | MIT | MIT | Apache-2.0 |
| Peso comprimido (gzip -9, medido) | Núcleo 45,2 KB + Markers 16,8 + VirtualTour 10,6 + Gyroscope 3,5 + Cubemap 3,1 + CubemapTiles 5,3 ≈ **85 KB** + CSS 4 KB, **más three.js 0.185.1 ≈ 188 KB** → **≈ 275 KB** | **≈ 21 KB** (JS 18,0 + CSS 2,6), WebGL propio | ≈ 51 KB |
| Multirresolución | Cubo o equirectangular en teselas, por niveles, con base borrosa mientras llegan | Cubo multirresolución (su `generate.py`, necesita Hugin) | Cubo multirresolución, excelente |
| Visitas (enlaces entre panorámicas) | VirtualTour: nodos, enlaces, **precarga de nodos contiguos**, transición con **fundido y giro** | Escenas con puntos; transición solo con fundido | Escenas con capas; transiciones a mano |
| Puntos personalizados | Markers: HTML, SVG o imagen, con eventos | Puntos HTML con CSS propio | Puntos HTML |
| Móvil y giroscopio | Plugin Gyroscope, con la petición de permiso de iOS en un botón | Orientación del dispositivo básica | A mano |
| Módulos ES | Sí | No (script global) | No (CommonJS/UMD) |
| Mantenimiento | Activo, versiones mensuales en 2026 | Esporádico | Ninguno |

### 8.2 Elección: Photo Sphere Viewer 5.15.1

- **Por qué:** es el único de los tres mantenido de verdad, en ESM, y trae de serie lo que pide el boceto: bolitas que llevan a otra estancia, fundido con giro y precarga de la siguiente.
- **Peso:** los 275 KB de three.js incluidos **solo se descargan al entrar en un 360**. Con buena red se precargan (`<link rel="modulepreload">`) al abrir la ficha.
- **Versiones:** three.js va fijado a 0.185.1, el que exige la versión `^0.185.1` de Photo Sphere Viewer, en `app/vendor/three/0.185.1/`. Las actualizaciones se hacen en pareja y con pruebas.
- **Plan B:** Pannellum, si el peso de three.js fuera un problema, a cambio de transiciones más pobres y de restilizar su interfaz.

**Configuración:**

```js
const visor = new Viewer({
  container,
  adapter: [CubemapTilesAdapter, { baseBlur: true, showErrorTile: false }],
  navbar: false,                    // controles propios, con el estilo del showroom
  keyboard: 'always',               // flechas y +/− también sin pantalla completa
  defaultZoomLvl: 30, minFov: 40, maxFov: 90,
  plugins: [
    [MarkersPlugin, {}],
    [VirtualTourPlugin, {
      renderMode: '2d',             // enlaces como elementos HTML (nuestra bolita), no flechas 3D
      arrowStyle: { element: () => crearBolita() },   // el mismo componente que en la cenital
      dataMode: 'client', preload: true,
      transitionOptions: { effect: 'fade', rotation: true, speed: '20rpm', showLoader: false },
    }],
    [GyroscopePlugin, { touchmove: true }],   // se activa con un botón; iOS pide permiso
  ],
});
```

- **Nodos**: los puntos de la vivienda actual, cada uno con su panorámica (la espejada si toca) y sus enlaces filtrados a esa vivienda (§4.4).
- **Al entrar**: se abre mirando al `rumbo` de la panorámica, que es la vista principal.
- **Mini plano**: el cono de visión se actualiza con el evento `position-updated` y el `norte` de la panorámica.

### 8.3 Formato y teselado (`tools/medios/panoramica.py`)

1. **Máster**: equirectangular de 8192×4096, PNG de 16 bit (PRODUCCION §2.6). 6K (6144×3072) basta para baños y dormitorios pequeños, si se quiere ahorrar render.
2. **Paso a cubo** con `ffmpeg -vf v360=e:c6x1` (o con numpy): caras de 2048 px. La cara ideal de un 8K son 8192/π ≈ 2608 px; 2048 es un submuestreo ligero que ahorra un 38 % de píxeles sin pérdida visible a FOV ≥ 40°.
3. **Niveles**:

   | Cara | Teselas por cara | Teselas en total |
   |---|---|---|
   | 512 | 1 | 6 |
   | 1024 | 2×2 | 24 |
   | 2048 | 4×4 | 96 |

   Todas en **WebP** q≈80: decodifica más rápido que AVIF y hay cientos de teselas.
4. **Previa**: tira cúbica de 6×256 px (≈ 30 KB), para la base borrosa instantánea y las transiciones.
5. **Espejo**: la panorámica volteada en horizontal se genera aparte (`…-E`), con `yaw` invertido.

   Voltear en el navegador escalando la malla a −1 toca la parte interna de Photo Sphere Viewer y descuadra los puntos. Se deja como optimización probada para después: ahorraría la mitad del espacio de los espejados.
6. **En móvil**: Photo Sphere Viewer solo pide el nivel que necesita según el zoom y solo las teselas visibles. Con el nivel de 1024 (24 teselas, ≈ 25 MB de textura) ya se ve bien; el de 2048 solo se pide al acercar. Peso orientativo por 360 y visita: 0,5–1,5 MB.

Lo de las vistas exteriores a través de las ventanas lo trata `PRODUCCION_IMAGENES.md`. Un 360 por tipología enseña unas vistas que no son las de cada vivienda, así que debe llevar el rótulo «Vistas exteriores orientativas».

---

## 9. Rutas y estado

### 9.1 Direcciones

| Pantalla | Ruta |
|---|---|
| Conjunto | `/nuevo/` |
| Edificio | `/nuevo/apolo/` |
| Planta | `/nuevo/apolo/planta-2/` |
| Ficha de vivienda | `/nuevo/apolo/planta-2/238/` |
| Plan de pagos | `/nuevo/apolo/planta-2/238/pagos` |
| 360 | `/nuevo/apolo/planta-2/238/salon` |
| Listado | `/nuevo/viviendas?edificio=apolo&dorm=2&max=250000&disponibles=1` |
| Zonas comunes | `/nuevo/apolo/zonas-comunes/gimnasio` |
| Otro idioma | `/nuevo/en/apolo/planta-2/238/` (prefijo de idioma; el español va sin prefijo) |

- **La clave es el `id` de vivienda.** Si el segmento de planta no corresponde (por un cambio de datos), el router corrige la URL con `replaceState`.
- El contacto, compartir y los avisos son **estados de interfaz**, no rutas. Sí guardan una entrada de historial para que «atrás» los cierre (§9.2).
- **Modo de consulta** (respaldo, §9.3): la misma ruta va en `?r=apolo/planta-2/238`. El router entiende las dos formas desde el principio. Una constante de `index.php` dice cuál escribe al navegar y al compartir.

### 9.2 Historial

- **Bajar un nivel** (entrar en un edificio, una planta o una ficha) hace `pushState`.
- **Volver con la interfaz** (⊗, «← Planta», migas): si la entrada anterior es la del nivel padre, `history.back()`, para no amontonar historial. Si no, `pushState` del padre.
- **Atrás del navegador** (`popstate`): el director de escena compara la ruta anterior con la nueva y hace la transición inversa (vídeo de vuelta, FLIP inverso o fundido). Las transiciones se pueden cortar: un segundo «atrás» durante una transición la cancela (`AbortController`) y salta.
- **Enlace profundo** (alguien abre `/nuevo/apolo/planta-2/238/` desde WhatsApp):
  1. se pinta la planta y encima la ficha abierta, sin animación (REFERENTES T-21);
  2. se hace `replaceState(planta)` + `pushState(ficha)`. Así el primer «atrás» lleva a la planta, no fuera de la web.
- **Hojas y diálogos en móvil**: al abrirse empujan una entrada `{hoja: true}`. El botón atrás del sistema (Android) o el gesto de iOS cierran primero la hoja y después cambian de nivel.
- `history.scrollRestoration = 'manual'`. **El foco va al encabezado de la escena nueva** y la región viva anuncia, por ejemplo, «Apolo, planta 2: 12 viviendas disponibles».

### 9.3 Servidor: `index.php`

**Por qué PHP.** El armazón es PHP porque el servidor necesita saber qué ruta se pide para escribir sus metas: Open Graph, título, `canonical`, `hreflang` y JSON-LD. Es un fichero pequeño, PHP 5.6, que:

1. Deduce la ruta de `REQUEST_URI`, con la base sacada de `SCRIPT_NAME`, o de `?r=`.
2. **Si la ruta tiene extensión** (`.webp`, `.js`, `.json`…) responde `404` y termina.
   Así un fichero que falte no devuelve el HTML de la página con un 200, que es la trampa clásica de `FallbackResource`.
3. Lee `gestion/datos/publico.json` con tolerancia a fallos: si no puede, sigue con `data/serenea.json` sin precios. Resuelve el `id` **contra el catálogo**: nunca se escribe en la página nada de la URL que no haya salido del catálogo.
4. Escribe:
   - el `<head>` con los metas, escapados con `htmlspecialchars`;
   - la CSP y las demás cabeceras de §13;
   - `<link rel="preload" as="image">` de la imagen de la primera escena, **dos veces**: una con `media="(orientation: portrait)"` (encuadre `v`) y otra con `media="(orientation: landscape)"` (encuadre `h`), cada una con `type="image/avif"`, para que el navegador sin AVIF no la descargue. Cada enlace apunta al fichero que `medios.js` elegirá para un dispositivo típico de esa orientación (la regla de escalones es la misma en PHP y en JS; si no coincide, se paga una descarga doble, no un error);
   - `<link rel="preload" as="fetch" crossorigin>` de `api/serenea.php`;
   - `<link rel="modulepreload">` de los módulos del núcleo.
5. Escribe un `<main>` con el contenido textual de la ruta (h1, datos de la vivienda o lista de enlaces a edificios, plantas y viviendas). La aplicación lo sustituye al arrancar. Sirve a los buscadores, a los lectores de pantalla antes de cargar el JS y a quien navega sin JavaScript. Es el mismo contenido que ve el usuario: no es *cloaking*.

En `.htaccess`, para que las rutas reales lleguen a `index.php`, cada directiva dentro de su `IfModule`, como en el resto del repositorio:

```apache
DirectoryIndex index.php index.html
<IfModule mod_dir.c>
  FallbackResource /nuevo/index.php
</IfModule>
```

**Sin verificar en el hosting.** Hay que comprobarlo antes de dar por buenas las rutas reales (§14). Si `FallbackResource` no funciona:

- se prueba `mod_rewrite` con `RewriteCond %{REQUEST_FILENAME} !-f` y `!-d`;
- si tampoco, se pasa al modo `?r=`, que funciona seguro porque `DirectoryIndex` ya está probado con el panel antiguo.

Cuando `index.php` sea el armazón, sobra el `index.html` provisional (o se invierte el orden de `DirectoryIndex`, como arriba).

### 9.4 Open Graph por vivienda

Con la ruta `/nuevo/apolo/planta-2/238/`, `index.php` escribe:

```html
<title>Vivienda 238 · Apolo · Residencial Serenea</title>
<meta property="og:title" content="Vivienda 238 · Apolo · Residencial Serenea">
<meta property="og:description" content="2 dormitorios · 1 baño · 61,4 m² útiles · Planta 2 · 189.000 € + IGIC">
<meta property="og:image" content="https://showroom.unikdi.com/nuevo/media/apolo/viviendas/238.og.5e6f7a8b.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="https://showroom.unikdi.com/nuevo/apolo/planta-2/238/">
<meta property="og:type" content="website"><meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="https://showroom.unikdi.com/nuevo/apolo/planta-2/238/">
```
*(Cifras ilustrativas.)*

- **La imagen OG** (1200×630, JPG ≤ 300 KB, para que WhatsApp la enseñe siempre) es la cenital de la vivienda sobre una banda lisa con la marca. Se genera en el canal de medios.
- **La imagen no lleva el precio.** El precio va en el texto, que se escribe al pedir la página. Si cambia el precio, la imagen sigue valiendo.
  WhatsApp y las redes guardan en caché la vista previa de cada URL durante días, así que un enlace ya compartido puede enseñar el precio anterior. Es inevitable y conviene saberlo.
- **Vendida, reservada o no visible**: descripción sin precio («Vendida»).
- **Edificio y planta**: lo mismo, con su render.
- **Ruta desconocida**: los metas del conjunto y `404`.
- **Por qué hace falta PHP.** Los rastreadores de WhatsApp, Facebook, LinkedIn y X no ejecutan JavaScript: leen el HTML que da el servidor. Solo con un HTML estático todas las viviendas compartirían la misma vista previa.
- **Compartir**: en móvil, con la Web Share API; en escritorio, copiando el enlace.

### 9.5 Estado de la aplicación

`almacen.js` guarda `{ ruta, datos, filtros, favoritos, ui: { hoja, dialogo }, gestion: { usuario, rol } }`.

- **Qué es la verdad**:
  - la URL lo es de la ruta y de los filtros;
  - `localStorage` lo es solo de las comodidades: favoritos, ayuda ya vista, última copia de los datos;
  - nada de lo que importa vive solo en el navegador.
- **Cambio de ruta**: cada cambio pasa por `transicion.js`, que es una pequeña máquina de estados. Hay una transición en curso como mucho, se puede cancelar, y la pantalla de destino se monta antes de empezar a animar.

---

## 10. Panel de gestión sin inicio de sesión visible

### 10.1 Acceso

```
https://showroom.unikdi.com/nuevo/#g=EJEMPLO_no_es_una_clave_real_0123456789abcd
```

1. **`app/acceso.js`**, script clásico en el `<head>` de menos de 1 KB, se ejecuta antes que cualquier otro script:
   - si el fragmento trae `g=`, lo guarda en `sessionStorage['serenea.g']`;
   - lo quita de la barra con `history.replaceState(null, '', location.pathname + location.search)`.
2. **`inicio.js`**: si hay clave en `sessionStorage`, llama a `POST gestion/api/sesion.php` con la cabecera `X-Serenea-Clave: <clave>`.
   - Si responde `200 {usuario, rol}` → `import('./gestion/gestion.js')`: aparece una barra fina «Gestión · Fran · Salir» y las herramientas de edición.
   - Si responde `401` → se borra la clave sin decir nada. El visitante sigue viendo la web pública, sin ninguna pista de que exista un panel.
3. **«Salir»** borra la clave. Cerrar la pestaña, también (es `sessionStorage`).

**Por qué en el fragmento (`#g=`) y no en la consulta (`?g=`).**

- El fragmento **no se envía nunca al servidor**: no queda en los registros de acceso de Plesk, ni en el `Referer` hacia otro sitio, ni en ningún intermediario.
- Con `?g=` la clave quedaría escrita en los registros del hosting en cada uso.
- Las dos son «un parámetro en la URL», que es lo que pide el cliente.
- Si aun así se prefiere `?g=`, `index.php` lo aceptaría, respondería `Referrer-Policy: no-referrer` y lo sacaría de la barra igual. Pero la clave ya habría quedado en el registro.

**El público no descarga nada del panel.** `app/gestion/*`, SheetJS y ExcelJS se cargan solo con una clave válida. Aunque alguien leyera ese código, sin clave no puede escribir.

### 10.2 Claves personales

- **Una por persona**: el cliente (rol `admin`) y el director comercial (rol `editor`). Las dos pueden cambiar estado, precio y visibilidad.
  - Importar el Excel, restaurar versiones y gestionar accesos: propuesta, solo `admin` (a confirmar con el cliente).
- **Generación** con `nuevo/tools/clave.php` (o `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`) → 43 caracteres base64url, 256 bits.
- **En el servidor solo se guarda la huella**: `hash('sha256', $clave)`.
  - Con 256 bits aleatorios no hace falta `password_hash`: no hay diccionario ni fuerza bruta posibles.
  - Así la comprobación es instantánea en cada petición.
- **Dónde**: `nuevo/gestion/accesos.php`, en git (solo huellas). Es un fichero PHP que hace `return array(...)`, así que aunque fallara el `.htaccess` no se puede leer por URL:

  ```php
  <?php return array(
    array('id' => 'fran',     'nombre' => 'Fran',               'rol' => 'admin',  'huella' => '9c1f…(64 hex)', 'alta' => '2026-11-20'),
    array('id' => 'director', 'nombre' => 'Director comercial', 'rol' => 'editor', 'huella' => '…',              'alta' => '2026-11-20'),
  );
  ```

  Si existe `datos/accesos.php`, manda sobre el del repositorio. Lo escribe el panel cuando el `admin` regenera o revoca la clave de alguien, sin necesidad de desplegar.
- **Comprobación**:
  - formato (`^[A-Za-z0-9_-]{43}$`) antes de nada;
  - `hash_equals($u['huella'], hash('sha256', $clave))` **contra todos los usuarios**, sin salir al primer acierto, para que el tiempo no dependa de cuál coincide;
  - `hash_equals` existe desde PHP 5.6 y `lib.php` ya trae su sustituto.
- **Entrega de las claves**: en mano o por un canal privado, **nunca** en el repositorio, en un correo sin cifrar ni en este chat de trabajo.
  - El cliente las guarda en su gestor de contraseñas o como marcador.
  - Quien tiene el enlace tiene la llave: no se reenvía.
  - Si se filtra, el `admin` la regenera en un minuto y el registro dice qué se hizo con ella.
- **Limitación de intentos** (`datos/intentos.json`):
  - 5 fallos por IP en 15 min → `429` durante 15 min;
  - 50 fallos globales en una hora → bloqueo general de 15 min;
  - 300 ms de espera en cada fallo.

  Con claves de 256 bits es sobre todo higiene: el registro de fallos dice si alguien está probando.

### 10.3 API (`nuevo/gestion/api/`, PHP 5.6)

| Método y ruta | Acceso | Qué hace |
|---|---|---|
| `GET serenea.php` | Público | Documento público (§4.5), `ETag` y `304` |
| `POST sesion.php` | Clave | Devuelve `{usuario, rol, sello}` o `401` |
| `POST cambios.php` | Clave | `{base, cambios: [{id, estado?, precio?, visible?}]}` → aplica, publica y devuelve `{sello}`; `409` si hay conflicto |
| `POST catalogo.php` | `admin` | `{base, catalogo, aplicarEstados, eliminarAusentes, origen: {fichero, sha256}}` → importación (§10.7) |
| `GET historial.php?vivienda=&desde=` | Clave | Entradas del registro y versiones disponibles |
| `POST restaurar.php` | `admin` | `{version}` → crea una versión **nueva** igual a aquella (nunca destructivo) |
| `GET equipos.php` | Clave | Equipos de la oficina (lee `gestion/datos/equipos.json`) |
| `POST evento.php` | Público | Analítica agregada (§11.2); 204 |
| `POST contacto.php` | Público | Formulario de contacto y «Avísame»: correo al equipo comercial con `mail()` del hosting, campo trampa, tiempo mínimo y límite por IP. Las solicitudes se guardan cifradas o no se guardan (decisión legal, REFERENTES §7) |

Cabeceras de todas, puestas por PHP:

- `Content-Type: application/json; charset=utf-8`;
- `Cache-Control: no-store` (salvo `serenea.php`, que va con `no-cache`);
- `X-Robots-Tag: noindex, nofollow`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`.

En las escrituras, además:

- sin CORS;
- se rechaza un `Origin` que no sea el propio dominio;
- la cabecera propia `X-Serenea-Clave` obliga a una petición previa (*preflight*) desde cualquier otro origen, que el servidor no autoriza.

No hay cookies, así que no hay CSRF. `Authorization` no se usa porque PHP en CGI o FPM la pierde a menudo.

### 10.4 Escritura segura

Cada escritura sigue el mismo camino (`lib.php → guardar()`):

1. **Bloqueo**: `flock(LOCK_EX)` sobre `datos/.bloqueo`, que ordena las peticiones simultáneas.
2. **Leer el estado actual y comprobar la base** (concurrencia optimista).
   - Si `base` no coincide con el sello actual y los cambios tocan viviendas modificadas desde esa base → `409` con el estado actual. El panel enseña «Fran cambió la 238 hace 2 min» y deja reintentar.
   - Si tocan otras viviendas, se aplica sin molestar.
3. **Validar en el servidor**, aunque el navegador ya lo haya hecho:
   - que el id exista en el catálogo;
   - que el estado esté en la lista;
   - precio entero entre 10.000 y 5.000.000, o `null`;
   - `visible` booleano;
   - en el catálogo: versión del esquema, ids únicos, referencias, estructura y tamaño máximo (2 MB).
4. **Reconciliar el puente** (§4.7, punto 2).
5. **Escribir de forma atómica** (temporal + `rename`): `estado.json`, `catalogo.json` (si es una importación), `publico.json`, la copia de la versión y el puente.
6. **Anotar** en el registro.
7. **Soltar el bloqueo** y devolver el sello nuevo.

### 10.5 Registro y copias

- **Registro**: `datos/registro/AAAA-MM.jsonl`, una línea por acción, añadida con `LOCK_EX`:

  ```json
  {"t":"2026-11-20T10:42:13+00:00","quien":"director","accion":"cambios","cambios":[{"id":"238","campo":"estado","antes":"disponible","despues":"reservada"}],"sello":{"antes":"1ae8e124a7de","despues":"7c90b21f3d55"},"ip":"a41f…(huella truncada)"}
  ```

  También se anotan las importaciones (fichero, sha256, resumen de diferencias), las restauraciones, los cambios de acceso y los fallos de acceso agregados.
- **Copias**: `datos/versiones/`.
  - `estado-<AAAAMMDD-HHMMSS>-<sello>.json` en cada escritura (≈ 10 KB);
  - `catalogo-<…>.json` en cada importación (≈ 150 KB);
  - retención: todo lo de los últimos 90 días y, como mucho, 1000 ficheros; las más antiguas se podan en cada escritura;
  - desde el panel: «Historial» → ver diferencias → «Restaurar».
- **Copia fuera del servidor**: el workflow diario `copia-datos-nuevo.yml` (§2.4), con los secretos FTP que ya existen, sin secretos nuevos.

### 10.6 Edición en contexto

En modo gestión, la web pública es el panel:

- **En la planta**, todas las viviendas responden, también las vendidas. Al pulsar una se abre un editor junto a ella con:
  - estado (4 botones);
  - precio (campo con formato «189.000 €»; se escribe sin puntos);
  - visible (interruptor).

  «Guardar» la guarda al momento, con «Deshacer» durante 10 s. El velo y el recuento se repintan con el estado nuevo, así que lo que ve el editor es lo que verá el público.
- **«Lista de gestión»**: el listado (I-12) con celdas editables y filtros, para cambios en bloque, con «Guardar N cambios».
- **Indicadores**:
  - sello y hora de la última publicación;
  - estado del puente con la oficina (§4.7);
  - quién cambió qué por última vez en cada vivienda (al pasar el ratón).
- **Cabeceras**: el modo gestión no cambia ninguna cabecera del HTML. La web sigue siendo pública y la de siempre; lo que se protege es la API.

### 10.7 Importación y exportación del Excel

**Importación** (reglas en `DATOS.md`):

1. Se elige el `.xlsx`. **SheetJS 0.20.3** lo lee en el navegador; importado en diferido, solo para `admin`.
   - No vale la 0.18.5 de npm, que tiene un fallo de seguridad conocido con ficheros manipulados.
   - La 0.20.3 se publica en `cdn.sheetjs.com`, inaccesible desde este contenedor. Se copia una vez a `app/vendor/xlsx/0.20.3/` desde un equipo con acceso, con su licencia Apache-2.0 y anotando su SHA-256.
2. `validar.js` aplica `data/esquema_plantilla.json`: errores y avisos por hoja, fila y clave.
3. **Diferencias con lo publicado** (`diferencias.js`):
   - viviendas nuevas y viviendas que desaparecen;
   - cambios de superficie, estancias, estado y precio;
   - avisos de geometría que falta (§4.2).
4. **Opciones**, desmarcadas por defecto:
   - «Aplicar también estados y precios del Excel»;
   - «Quitar las viviendas que ya no están en el Excel» (con la lista).
5. «Publicar» → `catalogo.php` (§10.3–10.4) → «Publicado · sello …».

**Paridad Python–navegador.** Una prueba automática (`nuevo/tools/pruebas/paridad.mjs`, Node con SheetJS) pasa por `validar.js` y por `excel_a_json.py` el Excel de Apolo y una batería de Excel rotos a propósito, y exige el mismo JSON y los mismos mensajes. Si no coinciden, el error es del panel: `excel_a_json.py` es la referencia, como dice `DATOS.md`.

**Exportación** («Descargar Excel»):

- **ExcelJS 4.4.0** (MIT; última versión estable, de octubre de 2023), importado en diferido.
- Genera el libro con el mismo esquema: cabeceras con comentario, desplegables (validación de datos), formatos de m², € y %, y la hoja `Listas`. Lleva los datos vigentes y se puede volver a importar tal cual.
- Por qué no SheetJS: su edición gratuita no escribe estilos ni validaciones de datos, así que el Excel exportado perdería los desplegables.
- Nombre: `SERENEA_Showroom_<AAAA-MM-DD>_<sello>.xlsx`.

### 10.8 PHP 5.6

Reglas del repositorio, las de `gestion/lib.php`:

- sin `??`;
- sin tipos escalares ni de retorno;
- sin funciones flecha;
- `bytes_aleatorios()` en lugar de `random_bytes`;
- `dato()` para leer con valor por defecto;
- escritura atómica.

**Huecos del guardián.** `comprobar-php56.sh` no detecta otras construcciones de PHP 7.0 o posterior que el panel nuevo podría usar sin darse cuenta:

| Construcción | Desde |
|---|---|
| `dirname($ruta, 2)` | 7.0 (en 5.6 se escribe `dirname(dirname(…))`) |
| `<=>` | 7.0 |
| `intdiv`, `random_int`, `yield from`, `new class` | 7.0 |
| `use A\{B, C}` | 7.0 |
| `catch (A \| B $e)` | 7.1 |
| `array_key_first`, `is_countable`, `JSON_THROW_ON_ERROR` | 7.3 |

Propuesta para el orquestador, porque es fuera de `nuevo/`: añadir esos patrones y, mejor aún, ejecutar en el workflow `php -l` y las pruebas del panel **con PHP 5.6 y 7.0 de verdad**: `docker run --rm -v "$PWD":/w -w /w php:5.6-cli php -l …`. Los ejecutores de GitHub traen Docker. Es la comprobación definitiva, y el guardián queda como primer filtro rápido.

En local, el PHP del contenedor es la 8.3. Sirve con `php -S 127.0.0.1:8080 -t nuevo nuevo/tools/servidor.php` (un enrutador que imita `FallbackResource`), pero no prueba la compatibilidad con 5.6.

---

## 11. SEO, analítica, accesibilidad e idiomas

### 11.1 SEO

- **Durante el desarrollo**: `noindex, nofollow` (ya en `.htaccess` y, más fiable, en las cabeceras que pone `index.php`).
- **Al lanzar**:
  - se quita el `noindex`;
  - `canonical` por ruta y `hreflang` cuando haya otro idioma;
  - el contenido textual del servidor (§9.3);
  - JSON-LD por vivienda (`Apartment` con `offers`: `price`, `priceCurrency`, `availability` `InStock`/`SoldOut`) y por promoción (`ApartmentComplex`);
  - `sitemap.php` con edificios, plantas y viviendas visibles, dado de alta en Search Console.

  `robots.txt` solo puede vivir en la raíz del dominio, que publica la otra rama.
- **Decisión pendiente del cliente**: ¿la dirección definitiva será `/nuevo/` o la raíz? Si cambia, hacen falta redirecciones 301 de cada ruta y cambia el `canonical`. Hay que decidirlo antes de abrir la web al público y antes de que se compartan enlaces.

### 11.2 Analítica respetuosa

- **Recomendado: medición propia agregada.**
  - `analitica.js` manda eventos con `navigator.sendBeacon` a `evento.php`: edificio, planta, ficha, 360, «Ver pagos», contacto, compartir, favorito y errores de JS.
  - `evento.php` solo **suma contadores por día, evento y vivienda** en `datos/metricas/AAAA-MM.json`.
  - No guarda la IP, ni cookies, ni identificadores, ni huella del navegador.
  - El panel enseña «Viviendas más vistas esta semana» y el embudo conjunto → ficha → contacto.
  - Sin cookies ni identificadores no hace falta aviso de cookies (revisarlo con el asesor, REFERENTES §7).
- **Matomo autoalojado no cabe**: la versión 5 exige PHP 7.2.5 y el hosting tiene la 7.0.
- **Si se quiere un servicio**: Plausible (de pago) o Umami. Los dos funcionan sin cookies y son un único script.

### 11.3 Accesibilidad (objetivo WCAG 2.2 AA; detalle en REFERENTES I-15)

- **Formas interactivas**: son enlaces SVG con nombre accesible completo (§5.1, §5.3).
- **Ficha y diálogos**: con `<dialog>` y `showModal()`, que atrapa el foco y cierra con Esc.
- **Anuncios**: región viva para los cambios de escena y de filtro.
- **Listado**: es la alternativa equivalente a la navegación espacial. Tabla con `<th scope>` y orden accesible.
- **Contraste**:
  - texto siempre sobre fondo liso, nunca suelto sobre el render;
  - 4,5:1 en el texto, 3:1 en los bordes de las formas y en el foco.
- **Movimiento**: con `prefers-reduced-motion` no hay vídeos, las bolitas no laten y los fundidos son de 200 ms.
- **Medios**: los vídeos llevan `aria-hidden` porque no dan información. Cada 360 tiene texto alternativo y la lista de estancias como botones.
- **Táctil y zoom**: zonas de 44 px o más y zoom del navegador libre.
- **Pruebas automáticas**: axe-core en las pruebas de Playwright, más pruebas a mano con VoiceOver (iPhone) y NVDA.

### 11.4 Idiomas (preparado para ES, EN y DE; se lanza en español)

- **Textos de la interfaz** en `app/i18n/<idioma>.json`, con claves y variables:

  ```js
  t('ficha.precio', { precio })
  ```

  Ningún texto fijo en el código. Se carga solo el idioma activo.
- **Números y fechas** con `Intl`:
  - precio: `Intl.NumberFormat(idioma, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })` da «189.000 €» en `es-ES` y en `de-DE`, y «€189,000» en `en-GB`;
  - superficies con dos decimales y la coma o el punto de cada idioma.
- **Textos del catálogo**: los nombres de estancia se traducen por su `tipo` (diccionario fijo). Los textos libres (texto de edificio, aviso legal) tendrán más adelante columnas por idioma en el Excel («Texto breve (EN)»).
  `serenea.json` los guardará como `{ es, en, de }` sin romper el esquema 1: el texto simple se entiende como `es`.
- **Rutas**: prefijo `/en/` o `/de/`, con `hreflang` y `og:locale` en `index.php`, y `lang` en `<html>`.
  Los nombres de las rutas (`planta-2`, `atico`) no se traducen. Así un enlace se puede pasar de un idioma a otro con solo cambiar el prefijo.
- **Diseño**: componentes flexibles para el alemán (palabras largas): `hyphens: auto` con `lang="de"` y nada de anchos fijos en botones.
- **Aviso fiscal**: «+ IGIC» lleva aclaración en inglés y alemán («+ IGIC, impuesto canario»).

### 11.5 Tipografía

- **La licencia del fichero de Neue Haas Grotesk del repositorio es «Personal Use Only»**: sirve para las maquetas, no para la web pública.
- **Opciones para el lanzamiento**:
  - Adobe Fonts, si tienen Creative Cloud: incluye Neue Haas Grotesk Display y Text y se sirve desde `use.typekit.net`;
  - licencia web de Monotype para alojarla aquí. Así se cumple el «nada de la raíz» y no se depende de un tercero.
- **Con fichero propio**: WOFF2, recortado a latín ampliado, 2 pesos (≤ 60 KB en total), `font-display: swap`.
- **Respaldo**: la pila de respaldo (Arimo OFL, ya en `estilos/fuentes/`, o Helvetica) lleva `size-adjust` y `ascent-override` calibrados. Así el cambio de fuente no mueve la maquetación (CLS ≈ 0).

---

## 12. Rendimiento

### 12.1 Presupuesto por pantalla (comprimido, primera visita)

| Pantalla | Crítico (antes de pintar) | Después, si la red lo permite |
|---|---|---|
| **Conjunto** (primera) | HTML ≤ 15 KB · CSS ≤ 25 KB · JS del núcleo ≤ 60 KB · fuentes ≤ 60 KB · datos ≈ 8–15 KB · imagen ≤ 400 KB (móvil, AVIF 1080×1920) / ≤ 600 KB (escritorio, AVIF 2560) · capas ≤ 5 KB → **≤ 0,6 MB móvil / ≤ 0,8 MB escritorio** | Vídeo de entrada a Apolo (≤ 3 MB móvil / ≤ 5 MB escritorio), imagen y capas de Apolo |
| **Edificio** | Imagen ≤ 400/600 KB + capas ≤ 10 KB + módulo ≤ 10 KB (o nada, si ya se precargó) | Resúmenes de las plantas (≤ 150 KB cada uno en móvil), vídeo de vuelta |
| **Planta** | Resumen ≤ 300 KB + capas ≤ 10 KB | Teselas a demanda (30–60 KB cada una), cenital de la vivienda señalada, plantas contiguas |
| **Ficha** | Cenital ≤ 250 KB (móvil 1080 px) / ≤ 350 KB (escritorio 2×) | Previas 360 de sus estancias (≈ 30 KB cada una), módulos del 360 (≈ 275 KB, una vez), cenitales de las viviendas vecinas |
| **360** | Módulos (si no se precargaron) + previa 30 KB + nivel 1024 visible ≈ 300–600 KB | Previas de los nodos enlazados, teselas de 2048 al acercar |
| **Panel** (solo gestión) | Módulos de gestión ≈ 40 KB | SheetJS (≈ 300 KB) y ExcelJS (≈ 250 KB), solo al importar o exportar |

### 12.2 Precarga escalonada (`nucleo/precarga.js`)

**Tres prioridades:**

| Prioridad | Qué | Cuándo |
|---|---|---|
| Crítico | Lo de la pantalla actual | Ya |
| Probable | El siguiente paso más probable | Al terminar de pintar y quedar libre el navegador |
| Especulativo | Lo que el usuario está señalando | Al pasar el ratón, al enfocar o con la preselección táctil |

**Reglas:**

- Como mucho 2 descargas en segundo plano a la vez. Las especulativas se cancelan (`AbortController`) al navegar a otra rama.
- **Red**:
  - `navigator.connection` (Chrome y Android): con `saveData` o `effectiveType` 2G/3G, nada de vídeo ni de precarga especulativa;
  - **Safari no tiene esa API**: `red.js` estima la velocidad con la descarga de la primera imagen (bytes entre tiempo). Por debajo de 4 Mbit/s se usa el modo ligero, sin vídeos;
  - si la primera imagen tarda más de 4 s: aviso «Conexión lenta: versión ligera» (REFERENTES I-1).
- **Orden en la primera visita**:
  1. conjunto;
  2. vídeo de Apolo;
  3. imagen y capas de Apolo;
  4. resúmenes de las plantas (REFERENTES §5.3).

  Al pasar el ratón por otro edificio, su vídeo pasa por delante.
- **Imágenes**: se precargan **decodificadas** (`img.decode()`) en el LRU de §7.4. Una imagen descargada pero sin decodificar provoca un tirón al mostrarse, y lo que se busca es el corte invisible.

### 12.3 Objetivos en iPhone y cómo se miden

| Dispositivo de referencia | Para qué |
|---|---|
| iPhone SE (2.ª generación, A13, 3 GB) | Gama baja |
| iPhone 13 (A15, 4 GB) | Gama media |
| iPhone 15 Pro (A17 Pro, AV1) | Gama alta |

Todos con iOS 17 o posterior, en 4G real y en wifi.

| Métrica | Objetivo |
|---|---|
| LCP del conjunto en 4G, primera visita | ≤ 2,5 s (gama media), ≤ 3 s (SE) |
| INP | ≤ 200 ms; objetivo interno 100 ms |
| CLS | < 0,05 |
| Del toque al primer fotograma del vídeo (precargado) | ≤ 100 ms |
| Respaldo si el vídeo no está | Empieza en ≤ 300 ms |
| Zoom y arrastre en la planta | 60 fps sostenidos: solo se anima `transform` y `opacity` |
| De la bolita a la previa nítida del 360 | ≤ 600 ms con la previa precargada; ≤ 1,5 s en 4G sin ella |
| Sesión larga: 15 min, 30 viviendas y 20 panorámicas | Sin cierres de pestaña; memoria estable (Web Inspector → Timelines → Memory) |

**Cómo se miden:**

- **WebPageTest** con un iPhone real, o **Lighthouse** con perfil móvil, para LCP, INP y CLS.
- **Web Inspector de Safari** conectado al iPhone, para la memoria y los fotogramas.
- **Playwright** en CI con Chromium (WebKit no está instalado en el contenedor) en 390×844 y 1440×900:
  - capturas de pantalla;
  - comprobación de que cada polígono cae sobre su vivienda (píxel bajo el centroide frente a la máscara);
  - presupuesto de bytes por pantalla, que falla si se supera.

---

## 13. Seguridad del front y cabeceras (las pone `index.php`, así que se aplican seguro)

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
  media-src 'self' blob:; connect-src 'self'; font-src 'self'; worker-src 'self' blob:; frame-ancestors 'self';
  base-uri 'self'; form-action 'self'; object-src 'none'
Referrer-Policy: strict-origin-when-cross-origin      (no-referrer en la API)
X-Content-Type-Options: nosniff
Permissions-Policy: accelerometer=(self), gyroscope=(self), magnetometer=(self), camera=(), microphone=(), geolocation=()
Cache-Control: no-cache
```

- **Sin scripts en línea**, porque `acceso.js` es un fichero. El JSON-LD (`<script type="application/ld+json">`) es un bloque de datos que no se ejecuta, así que la CSP no lo bloquea.
- **Estilos dinámicos solo por CSSOM** (`el.style.left = …`), nunca con `style="…"` dentro de las plantillas: con `style-src 'self'` la CSP bloquea los atributos `style` del marcado. El `style` del ejemplo de §5.1 es solo ilustrativo. Photo Sphere Viewer también aplica sus estilos por CSSOM.
- **Fuentes de Adobe**: si se eligen, se añaden `use.typekit.net` y `p.typekit.net` a `style-src`, `font-src` y `connect-src`.
- **Escapado**: todo texto del catálogo se pinta escapado (§3.1). Nunca `innerHTML` con datos.

---

## 14. Comprobaciones en el hosting antes de construir encima

Desde este contenedor no hay salida a `showroom.unikdi.com`; se hacen con un paso nuevo en `diagnostico-panel.yml` o en un workflow `diagnostico-nuevo.yml`. Hay que comprobarlas con ficheros de prueba en `nuevo/` antes de depender de ellas:

| # | Qué | Cómo | Si falla |
|---|---|---|---|
| H-1 | `FallbackResource` en `.htaccess` | `curl -sI /nuevo/apolo/planta-2/238/` → 200 con el HTML de `index.php` | Probar `mod_rewrite`; si tampoco, modo `?r=` (§9.3) |
| H-2 | ¿Aplica Apache las cabeceras del `.htaccess` a los estáticos, o los sirve nginx directamente («procesamiento inteligente de estáticos» de Plesk)? | `curl -sI /nuevo/estilos/img/conjunto.webp`: ¿lleva el `X-Robots-Tag` que ya pone `nuevo/.htaccess`? ¿Qué dice `Server`? | Las cabeceras de caché y MIME van en Plesk → «Configuración de Apache y nginx» → directivas adicionales de nginx (lo hace el cliente o quien administre Plesk). La corrección no depende de ellas (D-12) |
| H-3 | Tipos MIME: `image/avif`, `image/webp`, `video/mp4`, `text/javascript` en `.js` | `curl -sI` de cada tipo | `AddType` en `.htaccess` (si Apache sirve) o en nginx. Un módulo ES servido como `text/plain` no se ejecuta |
| H-4 | Peticiones por rangos en MP4 | `curl -sI -r 0-1 …mp4` → `206` | La descarga a `Blob` lo evita (§7.3), pero conviene que funcione |
| H-5 | HTTP/2 y compresión (gzip o brotli) en JSON, JS, CSS y SVG | `curl -sI --http2 -H 'Accept-Encoding: br, gzip'` | Activar en Plesk; sin HTTP/2, las teselas van más despacio |
| H-6 | Que PHP de `/nuevo/gestion` pueda escribir en `/gestion/datos/` (puente) | Un `diagnostico.php` en `nuevo/gestion/` (con clave) que intente escribir y borrar un fichero de prueba | Ajustar permisos en Plesk (`gestion/datos` con escritura para el usuario de PHP) |
| H-7 | `mail()` del hosting (contacto) | Envío de prueba a una dirección del cliente | SMTP autenticado del dominio |
| H-8 | Transferencia y espacio del plan de hosting | Panel de Plesk | Con ≈ 1,5 GB de medios y campañas, valorar una CDN delante (§15, R-7) |

---

## 15. Riesgos técnicos y mitigación

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-1 | **Los polígonos no casan con los renders definitivos**: otra cámara, *shift* o retoque con IA | Media | Alto | Pase de ID o marcas de registro obligatorios en cada cámara (§5.2); aceptación con IoU ≥ 0,98 y ≤ 1 px; PNG de comprobación; *shift* en la captura antes de los renders del edificio; editor manual como último recurso |
| R-2 | **Salto visible al final del vídeo**: color BT.709 frente a sRGB, compresión, deriva de la IA | Media | Medio | Imagen de destino del mismo render que el vídeo, fundido final de 120–150 ms, SSIM ≥ 0,95 y desfase ≤ 2 px automáticos, prueba en iPhone real |
| R-3 | **iOS no reproduce** (bajo consumo) o tarda | Alta en una parte de las visitas | Bajo | `play()` en el gesto, respaldo 2D en 300 ms; el respaldo es una experiencia completa, no un error |
| R-4 | **Cierre de la pestaña por memoria en iPhone** | Media | Alto | LRU de imágenes y vídeos, revocar los `Blob`, destruir el 360, límites por dispositivo, prueba de sesión larga en el iPhone SE |
| R-5 | **El hosting no admite rutas reales o ignora las cabeceras** | Media | Medio | H-1/H-2 antes de construir; modo `?r=`; carpeta de código versionada y medios con huella (D-12) |
| R-6 | **Un giga de medios en el deploy y en git** | Alta si no se cambia | Alto | Medios fuera de git, en adjuntos de *releases* y despliegue por tamaño (§2.4) |
| R-7 | **Ancho de banda del hosting** en una campaña: 1–3 MB por visita, 5–10 MB con 360 | Media | Medio | Caché inmutable, nada de vídeo con poca red, previas ligeras. Si hace falta, CDN delante del dominio: Cloudflare gratuito (exige cambiar los DNS) o una de pago por uso |
| R-8 | **Dos paneles escribiendo a la vez** durante la transición | Alta en la transición | Alto | Reconciliación del puente (§4.7), concurrencia optimista, retirar el panel antiguo en cuanto el nuevo esté probado |
| R-9 | **Filtración de una clave** (reenviada o capturada en pantalla) | Baja | Medio | Claves personales, revocables en un minuto, registro de quién hizo qué, copias para deshacer, la clave sale de la barra al instante |
| R-10 | **El puente no escribe** (permisos) y la oficina enseña datos viejos | Media | Medio | H-6, aviso rojo en el panel, equipos con su sello en el panel |
| R-11 | **El validador del navegador y el de Python discrepan** | Media | Medio | Prueba de paridad en CI (§10.7) |
| R-12 | **Construcciones de PHP 7 se cuelan en un hosting con 7.0** | Media | Alto: un 500 en blanco en todo el panel | Guardián ampliado y `php -l` y pruebas con `php:5.6-cli` y `php:7.0-cli` en Docker (§10.8) |
| R-13 | **Licencia de Neue Haas Grotesk** | Segura sin acción | Legal | Adobe Fonts o Monotype antes de abrir al público; respaldo métrico mientras tanto |
| R-14 | **SheetJS 0.20.3 no se puede descargar desde aquí**; la 0.18.5 de npm tiene un fallo conocido | Alta | Bajo | Copiarla una vez desde un equipo con acceso a `cdn.sheetjs.com` y anotar su SHA-256 |
| R-15 | **three.js y Photo Sphere Viewer van en pareja** (`^0.185.1`) | Baja | Medio | Copia propia en `nuevo/app/vendor/`, nada de la raíz; se actualizan juntos y con pruebas |
| R-16 | **Vista previa de WhatsApp con un precio viejo** | Media | Bajo | Precio solo en el texto, no en la imagen; asumir la caché de WhatsApp |
| R-17 | **Vistas exteriores de un 360 por tipología** que no son las de cada vivienda; espejado de la panorámica | Segura | Bajo | Rótulo «Vistas exteriores orientativas», según `PRODUCCION_IMAGENES.md` |
| R-18 | **Contenido duplicado** con la web de la raíz, y la URL definitiva sin decidir | Media | Medio | `noindex` hasta el lanzamiento, `canonical`, decidir pronto `/nuevo` o la raíz y preparar las 301 |
| R-19 | **Rendimiento en Android de gama baja**: decodificación AVIF, SVG grandes | Baja | Medio | WebP en las teselas, AVIF solo en las imágenes grandes y únicas, SVG con decenas de formas, no miles |

---

## 16. Lo que hace falta del cliente

1. **Licencia web de la tipografía**: ¿tienen Adobe Creative Cloud (Adobe Fonts) o se compra la licencia de Monotype?
2. **Personas con acceso al panel** y su rol: nombre del director comercial. Confirmar que importar, restaurar y gestionar accesos es solo suyo.
3. **Retirada del panel antiguo**: visto bueno para dejar `/gestion` en solo lectura cuando el nuevo esté probado. El endpoint de la oficina no cambia.
4. **Plesk**, o quien lo administre: acceso para las comprobaciones H-2, H-5, H-6 y H-8 si fallan. Eso puede requerir tocar las directivas de nginx o los permisos de `gestion/datos`.
5. **URL definitiva**: ¿la web nueva se queda en `/nuevo/` o sustituirá a la raíz al lanzar?
6. **Al estudio que haga los renders** (Memorable u otro): pase de ID o marcas de registro en cada cámara, datos de cámara (focal, sensor, *shift*) y ortográficas con caja exacta (§5.2). Sin esto no se garantiza el «exactamente de la geometría de la vivienda».
7. **Destino del formulario de contacto**: dirección de correo, CRM si lo hay, teléfono y WhatsApp comerciales, y textos legales (REFERENTES §7).
8. **Analítica**: ¿basta la medición propia sin cookies o quieren un servicio externo?
9. **Planta en el móvil**: ¿norte arriba con zoom o planta girada 90° a pantalla completa (§6.3)?
10. **Idiomas**: ¿se traducirá al inglés y al alemán, y quién traduce?
