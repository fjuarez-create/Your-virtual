# SERENEA · Producción de imágenes del showroom

Biblia de producción v1, del 18 de noviembre de 2026, para el showroom de renders de `showroom.unikdi.com/nuevo/`.

Acompañan a este documento:
- `nuevo/plantilla/SERENEA_Produccion_Imagenes_v1.xlsx`: control de producción, con una fila por pieza.
- `nuevo/tools/crear_produccion_imagenes.py`: el script que genera esa hoja a partir de `nuevo/data/tipologias.json` y `nuevo/data/serenea.json`.

---

## 0. Lo que condiciona la imagen

1. **Qué se vende.** Residencial Serenea, en Las Huesas (Telde), tiene 5 edificios y unas 307 viviendas:
   - Apolo: 166.
   - Zeus: 26.
   - Atenea: 30.
   - Hera: 22.
   - Hermes: 63.

   Son pisos de 1 a 3 dormitorios en preventa, de 121.000 a 505.000 €, con un público local de primera vivienda e inversión.
2. **Orientaciones de Apolo.** Hay viviendas al suroeste (calle principal), al noreste y al jardín interior (patios de 12 m). Las terrazas grandes están en los áticos: 24 de los 36 tienen entre 18 y 60 m². Hay además 6 terrazas de unos 12 m² en la planta 1 y 36 balcones de unos 3 m² en las plantas 2, 3 y ático.
3. **Regla de ventanas del cliente.**
   - Planta 1: antepecho pintado de blanco.
   - Plantas 2, 3 y ático: suelo-techo.

   La memoria de calidades dice suelo-techo en todo el edificio y hay que corregirla (§6).
4. **Materiales de la memoria y del modelo.**
   - Fachada blanca con zócalo tipo travertino.
   - Aluminio anodizado plata.
   - Suelo vinílico de madera cálida.
   - Paredes blancas mate y puertas lacadas en blanco.
   - Cocina «preparada para instalación», es decir, no incluida.
   - Gimnasio comunitario y jardines.
5. **Canal.** Web pública en móvil y ordenador, con imágenes que cambian por clic y vídeos cortos de transición. La geometría de cada imagen tiene que casar al píxel con las capas interactivas (plantas, viviendas, velos grises y puntos 360).

**Supuestos declarados.**
- Se trabaja con el modelo SketchUp `SERENEA_Apolo_17.09.26.skp`, que ya lleva mobiliario interior (`assets/serenea/apolo_mobiliario.glb`).
- La empresa ya tiene licencia de **D5 Render Pro** (estudio del 9-sep).
- Los otros cuatro edificios todavía no tienen modelo 3D.

---

## 1. Matriz de piezas por pantalla

### 1.1 Qué pieza alimenta cada pantalla

| Pantalla (storyboard) | Pieza | Origen | Interacción encima |
|---|---|---|---|
| 1 · Conjunto | Aérea maestra `CJ-EXT-01` (tarde dorada) + máscara de los 5 edificios `CJ-MSK-01` | Render D5 desde una cámara fija | Hover y clic por edificio, chinchetas 1–5 |
| 1 → 2 | Vídeo `xx-VID-01` conjunto → edificio, 6–8 s | Vuelo de cámara renderizado en D5 (alternativa: IA con primer y último fotograma) | Ninguna; termina en corte invisible sobre `xx-EXT-01` |
| 2 · Edificio | Render en primer plano `xx-EXT-01` + máscara de plantas `xx-MSK-01` | Render D5 desde una cámara fija | Hover por planta (con los saltos de tramo), clic en la planta |
| 2 → 1 | Vídeo `xx-VID-02` edificio → conjunto | Inversión de `VID-01` (ffmpeg) | — |
| 3 · Planta | Render cenital ortográfico de la planta con mobiliario, sin personas (`PLA-Nn-A`) + polígonos de viviendas | Render D5 en mosaico a 200 px/m | Velo gris en las no disponibles, clic en las disponibles, zoom |
| 4 · Zoom máximo | La misma planta a 200 px/m (pirámide de teselas) | Derivado | — |
| 6 · Ficha de vivienda | Cenital detallada de la vivienda (`CEN-xxx`) con una mujer en el sofá y un hombre cocinando + puntos 360 (`HOT`) | Recorte automático del pase con personas `PLA-Nn-B` | Bolitas de onda en cada estancia principal y en la terraza |
| 7 · 360 | Panorámica de la estancia (`360-…`, `36T-…`) con enlaces a las estancias contiguas | Render D5 equirectangular de 8K | Mirar alrededor y bolitas hacia otras estancias |
| Panel izquierdo («Render APOLO fijo») | Memorable CAM11 FRONTAL (`AP-EXT-02`) | Existente | — |
| Zonas comunes (pantalla nueva) | 360 de portal, patio, gimnasio y garaje + imágenes fijas de Memorable | D5 + existente | Enlaces entre 360 |

Decisiones de esta matriz:
- **Una sola hora del día** para todo el showroom: la tarde dorada (§2.2). Hacer día y atardecer duplicaría los exteriores y todos los vídeos sin aportar venta. Como portada opcional queda una aérea en hora azul (`CJ-EXT-02`), sin máscaras.
- **El vídeo de vuelta es el de ida invertido**, así que no se genera dos veces. Solo se rehace si el plano lleva personas o coches en movimiento.
- **Cenitales de vivienda por recorte.** No se renderiza una imagen por vivienda: se renderiza cada planta entera a 200 px/m en teselas y se recortan las 166 viviendas por script. Así:
  - la planta y la ficha casan siempre;
  - cada vivienda tiene su imagen real, sin volteos;
  - coste extra cero.
- **La planta 3 reutiliza la imagen de la planta 2**: las fichas muestran plantas 2 y 3 idénticas. Los estados se pintan encima, no en la imagen.

### 1.2 Recuento de Apolo (real, con las 43 tipologías)

| Pieza | Nº | Cómo se cuenta | Qué se reutiliza |
|---|---|---|---|
| Aérea del conjunto (provisional, con volúmenes) | 1 | Cámara `CJ-C01` | Se rehace en la fase 3 con los cinco modelos |
| Exterior de Apolo en primer plano | 1 | Cámara `AP-C01` | — |
| Imagen fija del panel | 1 | Memorable CAM11 | Existente |
| Máscaras e ID | 6 | Conjunto, plantas del edificio y 4 juegos de polígonos de planta | Los polígonos salen del GLB, sin render |
| Vídeos de transición | 2 | 1 renderizado + 1 invertido | — |
| Renders de planta | 3 plantas únicas × 2 pases × 6 teselas = **36** | P1, P2 (= P3) y ático, sin y con personas | P3 = P2 |
| Cenitales de vivienda | **166** | Una por vivienda, recorte | Todas salen de los 36 renders |
| Juegos de hotspots y enlaces | **72** | Uno por variante de plano (`tipologias.json`) | Las viviendas giradas o espejadas heredan los puntos transformados |
| 360 interiores | **285** | 223 (tipología × nivel × salón/estudio y dormitorios) + 17 (espejadas con vista a calle) + 45 (baños: cada baño, una vez por tipología) | Viviendas iguales en el mismo nivel; espejadas al jardín interior, volteadas; baños en todos los niveles |
| 360 de terraza | **34** | 30 viviendas con terraza o patio de 10 m² o más; 2 puntos si pasan de 40 m² (405, 409, 427, 431) | Ninguna: la vista exterior es lo que se vende |
| Zonas comunes | 4 360 + 4 imágenes existentes | Portal, patio, gimnasio, garaje (opcional) | Memorable CAM05, CAM06, CAM09 y CAM13 |

**Renders de GPU en Apolo: unos 360, más 1 vídeo.** Las demás filas son datos o derivados que se generan por script.

Por qué 285 y no los 200 de la primera estimación de datos:
- La vista por la ventana cambia con la altura, así que las plantas 2 y 3 llevan cada una su toma.
- Una vivienda espejada que da a calle no se puede voltear, porque la calle saldría invertida.

Con render propio, la diferencia es tiempo de máquina (una noche), no dinero. Alternativas más baratas, si el cliente acepta vistas orientativas:

| Criterio | 360 interiores | 360 de terraza | Riesgo |
|---|---|---|---|
| Recomendado (vista real por nivel) | 285 | 34 | Ninguno |
| Por tipología y tipo de ventana (P2 = P3) | 200 | 23 | Vista de la planta 2 mostrada en la 3 |
| Por familia de plano | 118 | 23 | Estancia de otras medidas: solo orientativa |

**Regla de ventanas.** Todas las tomas de planta 1 llevan ventana con antepecho blanco y las demás, suelo-techo. Es geometría: tiene que estar así en el modelo (§3). Una vivienda de planta 1 nunca comparte 360 con una de planta 2.

### 1.3 Estimación del resto del conjunto

Fuente: Pricing v.07, contando variantes por planta y superficie. En Apolo, este método da 71 variantes frente a las 72 reales.

| Edificio (nº) | Viviendas | Variantes de plano | 360 interiores | 360 de terraza | Renders de planta | Requisito previo |
|---|---|---|---|---|---|---|
| Zeus (2) | 26 | 18 | 71 | 5 | 6 | Modelo 3D |
| Atenea (3) | 30 | 11 | 43 | 8 | 6 | Modelo 3D |
| Hera (4) | 22 | 15 | 60 | 5 | 6 | Modelo 3D (no hay ni planos en Drive) |
| Hermes (5) | 63 | 12 | 46 | 14 | 6 | Modelo 3D |
| **Total** | **141** | **56** | **220** | **32** | **24** | |

Cada edificio lleva además:
- su exterior en primer plano;
- la máscara de plantas;
- las dos transiciones;
- dos 360 de zonas comunes;
- los recortes de vivienda.

El conjunto definitivo (`CJ-EXT-01` y `CJ-MSK-01`) y la nueva transición de Apolo se hacen cuando estén los cinco modelos.

**Total de Residencial Serenea:**
- unos **650 renders de GPU**;
- 5 vuelos de cámara;
- 307 cenitales recortadas;
- 128 juegos de hotspots.

---

## 2. Reglas de continuidad

### 2.1 Cámaras

- **Todas las cámaras se definen una sola vez, por script**, como escenas con nombre del SketchUp, y se guardan en `nuevo/data/camaras_produccion.json`. Ese fichero contiene: posición, objetivo, vertical, FOV, tipo, resolución y, en las ortográficas, `x0`, `z0` y px/m. Usa el mismo marco que las capturas de `nuevo/estilos/img/*.json`: metros del GLB, Y arriba.
- **Cámaras bloqueadas.** Una vez aprobada, una cámara no se toca. Si hay que moverla, cambia de código y se regeneran su render, su máscara y sus dos vídeos.

| Tipo | Altura | Focal (equiv. 35 mm) | Proporción | Reglas |
|---|---|---|---|---|
| Aérea del conjunto `CJ-C01` | Dron a unos 120 m | 35 mm | 16:9 | Axonométrica a 3/4, los cinco edificios enteros, verticales rectas, norte calibrado. Composición abierta para las chinchetas |
| Edificio `xx-C01` | 1,60 m (peatón) a 6 m | 24–35 mm | 16:9 | Perspectiva a dos puntos con desplazamiento de lente, sin inclinar. Otro edificio visible al fondo (storyboard). Zona segura central de 9:16 para móvil |
| Planta (ortográfica) | Cenital, norte arriba | — | La de la huella | Corte a 1,40 m sobre el suelo de cada tramo, con la cara de corte en gris grafito liso. Sin profundidad de campo, viñeteado ni destellos, para que las teselas empalmen |
| 360 interior | 1,50 m (baño: 1,40 m) | Equirectangular | 2:1 | Cámara nivelada, a 0,6 m o más del mobiliario y a 1,0 m o más del vidrio. En la estancia, desplazada hacia la vista principal |
| 360 de terraza | 1,50 m | Equirectangular | 2:1 | A 1,0 m o más de la barandilla. Con 40 m² o más, dos puntos (sala exterior y vista) |

### 2.2 Hora y luz (una sola para todo)

- **Hora maestra:** tarde de mediados de octubre, hacia las 17:15 hora local. Sol a **acimut ≈ 241° y altura ≈ 28°** (calculado para Telde, 28° N), referido al norte calibrado del modelo: 12,55° horario desde +Y del SketchUp.
  - Ilumina la fachada suroeste, que es la principal.
  - Coincide con la luz dorada de los fotogramas IA que el cliente ya ha aprobado.
- **Cielo:** físico de D5, limpio, con nubes bajas de alisio al norte. Nada de HDRI de otros climas.
- **Exposición** manual y fija por familia:
  - exterior;
  - interior con sol (suroeste);
  - interior sin sol (noreste y jardín interior).

  Nunca automática. Las ventanas no se queman.
- **Excepción documentada, las cenitales:** mismo acimut con el sol a 70° de altura, para que las sombras no tapen las estancias. Las sombras caen siempre hacia el mismo lado.
- Las viviendas al noreste no tienen sol directo a esa hora. Es correcto y no se «arregla».

### 2.3 Materiales (paleta nombrada, siempre con las mismas palabras)

- **Arquitectura:**
  - monocapa blanco (fachada);
  - travertino marfil (zócalo);
  - aluminio anodizado plata;
  - vidrio plata neutro;
  - gres Pamesa Wells Ivory 120×60 en zonas comunes;
  - gravilla gris claro.
- **Interior:**
  - suelo vinílico de roble claro en tablas anchas;
  - pared blanco mate;
  - puertas lacadas en blanco;
  - porcelánico gran formato marfil en las zonas de agua;
  - sanitarios blancos murales.
- **Estilismo, la línea Serenea actual** (fotograma IA del salón y `apolo_mobiliario`):
  - textiles: lino marfil, beige cálido, greige, bouclé crema y cojines terracota;
  - maderas: roble claro;
  - metales: bronce oscuro;
  - piedra: mesitas de travertino;
  - plantas: olivo en jarrón cerámico y una planta de interior grande;
  - cortinas de lino translúcidas;
  - cuadros: láminas abstractas negro y terracota;
  - luz: lámpara negra articulada.
- **Cocina:** la propuesta orientativa del modelo. Frentes lisos crema, encimera clara veteada, placa y horno negros.
- **Prohibido:** televisores encendidos, comida, objetos de marca, saturación, cielos dramáticos, vegetación no canaria, abedules, arces y césped inglés.
- **Vegetación exterior:** palmera canaria, drago, buganvilla, strelitzia, olivo, aloe y gramíneas.

### 2.4 Personas

- **Solo en la cenital de vivienda (pase B):** una mujer de unos 35 años sentada en el sofá leyendo y un hombre de unos 38 cocinando de pie en la encimera.
- Son siempre los mismos dos recursos 3D de D5, con el mismo vestuario:
  - ella: jersey de lino crudo y pantalón arena;
  - él: camisa blanca remangada y pantalón greige.
- No tapan ningún punto 360, ningún rótulo ni el acceso.
- En las viviendas de un dormitorio sin sofá grande o en los estudios, solo la mujer.
- **Sin personas** en la planta general, los 360 y los exteriores de edificio. En los exteriores, como mucho dos figuras lejanas de espaldas. Las personas en un 360 molestan al girar la vista.

### 2.5 Hotspots y enlaces (datos, no imágenes)

- **Posición en la cenital:** la proyección en planta de la cámara 360 de cada estancia, en px de la cenital (`px = a·x + c; py = b·z + d`, el mismo marco que `vivienda-238.json`).
- **Enlaces dentro del 360:** se calculan por script desde la posición de cada cámara y el centro de cada puerta del modelo (nodos `puerta__…` del GLB). Cada uno se guarda como *yaw*/*pitch* en el equirectangular.
- La bolita va en el suelo, en el umbral de la puerta. Cada 360 enlaza con sus estancias contiguas y con el salón; de media, 2–3 enlaces.
- Las viviendas giradas o espejadas heredan los puntos con su transformación de `tipologias.json`. El *yaw* de un 360 volteado se invierte.

### 2.6 Resoluciones y derivadas

| Pieza | Máster | Escritorio | Móvil | Peso orientativo |
|---|---|---|---|---|
| Exterior y aérea | 5120×2880, PNG de 16 bit | 2560×1440 y 3840×2160 (AVIF/WebP + JPG de respaldo) | Recorte 9:16 de la zona segura: 1620×2880 → 1080×1920 | 250–600 KB |
| Máscara | Misma rejilla que el máster: PNG indexado + JSON de polígonos | Escala en el JSON | Recorte y escala en el JSON | 10–80 KB |
| Vídeo de transición | 3840×2160, 25 fps, 6–8 s, ProRes o H.265 | 1920×1080, H.264 (CRF 23) + AV1; fotograma de cartel = primer fotograma | 1080×1920 recortado de la zona segura | ≤ 5 MB escritorio, ≤ 3 MB móvil |
| Planta | 200 px/m en teselas de 8000×4000 con solape de 64 px | Pirámide de teselas WebP de 512 px (25/50/100/200 px/m) | Vista general ≤ 4096 px de ancho | — |
| Cenital de vivienda | Unos 1600×2200 (200 px/m) | 2× y 1× AVIF/WebP | 1080 px de ancho | 150–300 KB |
| 360 | **8192×4096 (2:1)**, PNG de 16 bit | Cubo multirresolución: caras de 512, 1024 y 2048 | Caras de 1024–1536 como máximo (límite de textura de los móviles) + vista previa ligera (tira cúbica de 6×256 px, ≈ 30 KB; ARQUITECTURA §8.3) | 1,5–4 MB por 360 |

Los 16K no aportan en web y con una gráfica de 12 GB dan problemas de memoria. Se renderiza a 8K.

### 2.7 Máscaras e ID desde la misma cámara

1. **Exteriores.**
   - Se duplica la escena de D5 con los grupos por edificio o por planta y tramo en colores planos.
   - Se renderiza con la **misma cámara** el pase Material ID o un render emisivo. Ese pase es la máscara.
   - Se contrasta con la captura three.js del GLB (`nuevo/tools/captura/`): IoU ≥ 0,98 y desviación media del borde ≤ 1 px. La captura provisional ya da 0,987 y 0,34 px.
   - Si la corrección automática a dos puntos de D5 descentra la imagen, manda el pase de D5.
2. **Plantas y cenitales:** polígonos de `data/viviendas_serenea.json` con la transformación exacta de la ortográfica. No necesitan render.
3. **Vídeos:**
   - El último fotograma tiene que coincidir con el render del edificio: SSIM ≥ 0,95 a 1080p y desfase ≤ 2 px (correlación de fase).
   - Los 6–10 últimos fotogramas se funden con la imagen fija, que es el fondo de la pantalla siguiente. Así el corte es invisible.
   - Si un vídeo de IA no cumple, se repite. Se puede ajustar la deriva de los últimos fotogramas con una homografía, pero no más de 4 px.

### 2.8 Gestión de color

- En D5:
  - mapeo de tonos y exposición fijos en la escena plantilla;
  - sin LUT ni filtros dentro de D5;
  - sin exposición ni balance automáticos;
  - salida sRGB en PNG de 16 bit.
- Un solo etalonado para todo, con `SERENEA_LUT_v1.cube` en DaVinci o Photoshop:
  - contraste medio;
  - negros con detalle;
  - blancos sin recortar;
  - saturación contenida;
  - madera y piel naturales;
  - grano fino.
- Lo que sale de la IA pasa por la misma LUT. Nunca se le pide a la IA que «etalone».
- Una cámara de control con carta de gris y la paleta de materiales se renderiza en cada tanda. Si cambia, se para la tanda.
- La entrega va en sRGB con su perfil ICC incrustado.

### 2.9 Nomenclatura de ficheros

`SER-{edificio}-{tipo}-{identificador}_{resolución}_v{NN}.{ext}`. Es el mismo código de la hoja de control.

- **Edificio:**
  - `CJ` conjunto;
  - `AP` Apolo;
  - `ZE` Zeus;
  - `AT` Atenea;
  - `HE` Hera;
  - `HM` Hermes. Hoy Hera y Hermes comparten el prefijo `SE-HE` en el Pricing y se propone `SE-HM` para Hermes.
- **Tipo:** `EXT`, `MSK`, `VID`, `PLA`, `CEN`, `HOT`, `360`, `36T`, `ZC`, `REF`, `MOD`.
- **Ejemplos:**
  - `SER-AP-360-2D-08-N2-SCC_8K_v01.png`
  - `SER-AP-360-2D-08-N2-SCC-E_8K_v01.png` (espejada)
  - `SER-AP-PLA-N2-B-T3_200ppm_v01.png`
  - `SER-AP-CEN-238_2x_v01.webp`
  - `SER-AP-VID-01_4K_v01.mov`
- **Derivadas:** sufijo `_d` (escritorio), `_m` (móvil) y `_t` (miniatura). Los JSON de máscara llevan el mismo nombre que su imagen.

### 2.10 Qué NO puede ser IA

**Tiene que salir del BIM con motor de render** cualquier imagen cuya geometría case con una capa interactiva o enseñe superficie vendida:
- las plantas y las cenitales de vivienda;
- todos los 360;
- el exterior de cada edificio;
- la aérea del conjunto;
- sus máscaras.

La IA no puede mover ni un tabique, una ventana, una barandilla, un número de plantas ni la escala. En España la publicidad vincula al promotor.

**La IA solo puede:**
1. Hacer los vídeos de transición con primer y último fotograma fijados, cuando no se puedan renderizar en D5 (§4, ruta C).
2. Ambientar sin tocar geometría, siempre fuera de la máscara del producto:
   - cielo lejano;
   - ciudad y montaña de fondo;
   - vegetación del primer término de la calle.
3. Ser el plan B para las dos personas de la cenital si el recurso 3D no convence.
4. Reescalar con modelos fieles (Topaz CGI o Magnific Precision), nunca creativos.
5. Hacer piezas de redes y anuncios.

**Método obligatorio para editar con IA una imagen técnica:**
- Se recorta la zona, se edita el recorte y se reinserta por script con máscara.
- El script comprueba que fuera de la máscara la diferencia es cero.
- Si no lo es, se descarta.

### 2.11 Prompts base (Weave: Nano Banana Pro y Veo 3.1)

**A. Personas en la cenital (plan B, sobre un recorte de unos 1024 px alrededor del sofá o de la cocina).**

> Edit only this crop of a top-down orthographic architectural render of an apartment. Keep every wall, floor board, furniture piece, shadow direction and line exactly as in the reference; do not move or resize anything. Add one woman in her mid-thirties seen from directly above, sitting on the sofa and reading a book, natural chestnut hair tied back, raw-linen jumper and sand trousers, correct scale for a 1:1 top view, soft contact shadow falling towards the upper right as in the rest of the image. Photographic CGI, natural colours, medium contrast, no text, no extra objects.

- Variante «cocina»: un hombre de unos 38 años, de pie, cocinando en la encimera; camisa blanca remangada, pantalón greige, sartén sobre la placa.
- Variante «sin libro»: ella sentada mirando hacia la ventana.

**B. Ambientación exterior (solo fuera de la máscara del edificio).**

> Keep the building, its windows, railings, travertine base and every architectural line exactly as in the reference image; change only the area outside the building mask. Mid-October afternoon in Telde, Gran Canaria: warm low sun from the west-southwest, clean sky with a few low trade-wind clouds to the north, distant hills softly hazed. Canary Island palms and bougainvillea along the pavement, one or two people far away walking away from camera. Natural colours, no HDR look, no oversaturation, no text. 16:9.

- Variantes: «sin personas»; «nubes de alisio más presentes al fondo».

**C. Transición conjunto → edificio (Veo 3.1 Image to Video, con primer y último fotograma).**

> Slow, steady aerial camera move from the first frame to the last frame: the camera descends and glides towards Building Apolo, ending exactly on the street-level composition of the last frame. Architecture locked and unchanged from the references: same buildings, same number of floors, same windows and railings. Warm late-afternoon light from the west-southwest, constant throughout. No people, no traffic, no birds. No camera shake, no zoom pulses, no structural change, no added objects, no text. 16:9, 8 seconds.

- Ajustes: modelo Standard, 4K y sin audio en el definitivo; Fast a 1080p para las pruebas.
- Alternativa: Kling First & Last Frame (O1 Pro, 10 s) con el mismo texto.

**Lista negativa común:** people close to camera, faces, text, logos, extra floors, bent verticals, melting railings, flickering windows, lens flare, oversaturated sky, snow, deciduous trees, lawn.

**Revisión de cada resultado:**
1. Número de plantas, huecos y barandillas idénticos.
2. Último fotograma dentro de la tolerancia del §2.7.
3. El sol no cambia de lado.
4. Nada aparece ni desaparece.
5. Nada de texto.

Como máximo 3 generaciones por plano. Si no sale, se cambia el fotograma de partida o el movimiento.

---

## 3. Rutas posibles, coste y plazo

Los precios de licencias están verificados en noviembre de 2026 en fuentes de terceros que coinciden; hay que confirmarlos en la web oficial antes de comprar. Los precios de estudio son **órdenes de magnitud de mercado**, no presupuestos.

### A. Estudio Memorable (ya hizo los 16 renders de Apolo)

- **Ventajas:**
  - Nivel de acabado alto y probado.
  - Ya tiene la escena de Apolo montada.
  - Cero carga interna.
- **Inconvenientes:**
  - Precio por pieza: todas las variantes y 360 se cobran.
  - Cada cambio pasa por el estudio.
  - Hay que exigirles los datos de cámara y un pase de ID por cámara para que las máscaras casen.
- **Orden de magnitud para Apolo** (exterior 600–1.200 €, planta amueblada 400–800 €, 360 a 250–450 € por volumen, vuelo 1.500–3.000 €):
  - con el criterio recomendado, **85.000–105.000 €**;
  - con 360 por familia, **45.000–55.000 €**.
  - Plazo: 12–16 semanas.
- **Resto del conjunto:** otros 65.000–80.000 €.

### B. Render propio desde el BIM (recomendada para todo lo que tiene geometría)

| Motor | Licencia | Encaje |
|---|---|---|
| **D5 Render Pro** | **Ya contratado** (~360 $/año) | 360 de 8K (16K reportado), proyección paralela vía LiveSync, canales Material ID, AO y alfa, vídeo 4K por fotogramas clave, importa SketchUp y GLB. **El elegido** |
| Twinmotion | 445 $/puesto/año (UNIK supera 1 M$ de facturación) | Muy parecido a D5; no aporta nada que justifique cambiar |
| Enscape | ~575–670 $/año | Bueno en interiores, más flojo en exteriores y vídeo |
| Lumion Pro | ~1.149 $/año | Caro y sin ventaja para esto |
| V-Ray Solo / Corona Solo | ~540 $/año / desde ~414 $/año | Techo de realismo más alto, pero render lento y curva larga. Solo si el artista lo domina |
| Unreal 5.8 (*path tracer* + Movie Render Queue) | Ya instalado y con MCP | Automatizable por script desde una sesión de Claude en el PC de Fran, pero frágil (`docs/UNREAL_ESTADO.md`). Alternativa si colocar cientos de cámaras en D5 resulta lento |

- **Coste de licencias: 0 €.**
- **Equipo:** el PC de Fran (i9, 64 GB, gráfica de 12 GB) basta para 8K.
- **Lo que no se puede automatizar desde aquí:** D5 no tiene API. Hace falta una persona que trabaje en D5, Fran o un artista 3D, para:
  - lookdev;
  - estilismo por tipología;
  - lanzar las tandas;
  - revisar.

| Concepto | Apolo | Resto del conjunto |
|---|---|---|
| Horas de artista 3D (D5) | ≈ 140 h: preparación 24, estilismo de 43 tipologías 43, cámaras y revisión 8, exteriores y vuelo 12, plantas 8, tandas de 360 20, zonas comunes 8, correcciones 15 | ≈ 260 h modelando desde los PDF, o ≈ 140 h si el estudio entrega SketchUp o Revit |
| Coste a 30–45 €/h (freelance) | **4.200–6.300 €** | **4.200–11.700 €** |
| Tiempo de GPU | ≈ 24 h (unos 360 renders × 4 min) + 1 h de vuelo | ≈ 20 h |
| Plazo | Piloto 2 semanas + 5–6 semanas | 6–8 semanas desde que llegan los modelos |

- **Lo que hace Claude:**
  - cámaras por script;
  - máscaras y polígonos;
  - recortes;
  - hotspots y enlaces;
  - derivadas;
  - control de calidad automático (IoU, SSIM, diferencia fuera de máscara);
  - nomenclatura;
  - integración en la web.

### C. IA vía Figma Weave (ya conectado)

- **Modelos útiles:**
  - Veo 3.1 Image to Video, con primer y último fotograma, 4K, 4–8 s, unos 90 créditos por prueba en Fast 1080p;
  - Kling First & Last Frame, unos 55 créditos;
  - Seedance 2.5, con primer y último fotograma, 4K, hasta 30 s, unos 280 créditos;
  - Nano Banana Pro, 4K, unos 11 créditos;
  - Topaz CGI, unos 19 créditos;
  - Magnific Precision, unos 18 créditos.
- **No hay ningún modelo de 360 o equirectangular.**
- **Uso previsto:**
  - transiciones si un vuelo de D5 no es viable;
  - ambientación;
  - personas de plan B;
  - reescalado;
  - piezas de redes.
- **Coste estimado:**
  - Apolo: unos 3.000 créditos;
  - conjunto: unos 6.000–9.000 créditos;
  - equivale a **70–150 $** (entre 0,011 y 0,016 $ por crédito según terceros).
- **Comprobar el saldo de Weave del cliente.**
- **No sirve** para plantas, cenitales ni 360: inventa geometría y no casa con las capas.

### D. Higgsfield y similares

- 19–129 $/mes, con créditos que caducan.
- Agrega los mismos modelos (Kling, Seedance, Veo, Nano Banana) que ya da Weave. Ninguno genera un 360 fiel al modelo.
- **No aporta nada para este proyecto. No contratarlo.**

### Recomendación

**B + C, reutilizando A:**
1. Todo lo que tiene geometría se hace en **D5 Render Pro**, sobre el SketchUp de Apolo y luego los otros cuatro modelos: plantas, cenitales, 360, exteriores, aérea y vuelos de cámara.
2. Weave queda para las transiciones de reserva, la ambientación sin tocar geometría, el reescalado y las redes.
3. Los 16 renders de Memorable se reutilizan en el panel izquierdo, las galerías y las zonas comunes.
4. Si el cliente quiere el máximo nivel en los cinco exteriores de edificio y en la aérea, se puede encargar **solo eso** a Memorable (unos 4.000–8.000 € de mercado). Requisito: que entreguen la cámara y el pase de ID.

**Qué tendría que contratar el cliente:**
1. **Un artista 3D freelance con D5**, unas 140 h para Apolo (4.200–6.300 €), salvo que lo haga Fran.
2. Créditos de Weave si el saldo no llega (menos de 150 $).
3. Ajeno a las imágenes, pero necesario antes de publicar: la licencia web de Neue Haas Grotesk.

No hace falta comprar ninguna licencia de render ni contratar Higgsfield.

---

## 4. Calendario por fases

| Fase | Fechas | Contenido | Sale |
|---|---|---|---|
| Decisiones | 18–22 nov 2026 | Ruta, hora maestra, criterio de 360 (285 / 200 / 118), artista 3D, material del cliente (§5) | Encargo cerrado |
| 0 · Preparación | 23–27 nov | Auditoría del SketchUp (mobiliario de las 43 tipologías, antepecho de la planta 1), lookdev en D5, LUT, recursos de las dos personas, cámaras por script, prueba de máscara (IoU) | Escena plantilla y `camaras_produccion.json` |
| 1 · Piloto | 30 nov – 11 dic | **Planta 2 de Apolo completa:** render en mosaico (2 pases) + 46 cenitales recortadas + polígonos. **Tipologías 2D-08 y 1D-01 enteras** (62 viviendas, el 37 % de Apolo): 28 360 interiores en todos sus niveles, incluidas las espejadas a calle y la ventana con antepecho, + la terraza de la 107. Exterior de Apolo, su máscara de plantas y la transición provisional desde el conjunto | El recorrido completo funcionando en `/nuevo/` |
| Validación | 14–18 dic | Revisión del cliente con comentarios numerados; ajuste de luz, estilismo y personas; se congela la biblia v1.0 | Biblia v1.0 |
| 2 · Apolo completo | 11–29 ene 2027 (las tandas nocturnas pueden empezar del 21 dic al 8 ene) | Plantas 1 y ático, 41 tipologías restantes (257 360 interiores), 33 terrazas, zonas comunes, 166 cenitales | Apolo cerrado |
| 3 · Conjunto | Unas 6–8 semanas desde que llegan los modelos y termina la fase 2 (con modelos el 15 ene, hacia el 26 mar) | Zeus, Atenea, Hera y Hermes; aérea definitiva; transiciones de los cinco | Residencial Serenea completo |

Criterios para aprobar el piloto:
- Máscaras con IoU ≥ 0,98.
- Corte invisible al final del vídeo.
- 360 sin costuras y con enlaces correctos.
- Cenitales legibles en un móvil de 375 px.
- Tiempo de carga por pantalla ≤ 2 s en 4G, la primera ≤ 2,5 s (piezas de ≤ 600 KB y vídeo ≤ 3 MB en el móvil y ≤ 5 MB en el ordenador).

---

## 5. Lo que necesitamos del cliente

1. **Referencias de decoración** (moodboard) y los renders orientativos de **ventanas suelo-techo** que anunció. Si no llegan, se toma como referencia el fotograma IA del salón (17-nov) y la paleta del §2.3.
2. **Regla de la planta 1:**
   - altura del antepecho [●] cm;
   - carpintería;
   - si el SketchUp ya lo refleja.

   Y corregir la memoria de calidades, que dice suelo-techo en todos los salones y dormitorios.
3. **Modelos 3D de Zeus, Atenea, Hera y Hermes:** SketchUp o Revit del estudio de arquitectura (GADAP), como mínimo con envolvente y distribución. De Hera no hay ni planos en Drive.
4. **Confirmar el modelo de Apolo** que vale (`SERENEA_Apolo_17.09.26.skp`) y que su mobiliario es el definitivo.
5. **Cocina:** se muestra amueblada como propuesta orientativa, con leyenda, porque la memoria dice que se entrega «preparada». Hace falta confirmarlo.
6. **Personas:** aprobar la pareja de la cenital (mujer en el sofá, hombre cocinando) y su vestuario.
7. **Hora maestra:** aprobar la tarde dorada única y decidir si se hace la portada en hora azul.
8. **Criterio de 360:** 285 recomendados, 200 o 118.
9. **Quién hace el trabajo en D5:** Fran o un freelance. Confirmar también la licencia D5 Pro (versión 3.x) y el modelo exacto de la gráfica.
10. **Memorable:** permiso de uso web de los 16 renders y, si se les encarga algo más, cámaras y pases de ID.
11. **Weave:** plan y saldo de créditos.
12. **Zonas comunes de cada edificio** (qué tiene cada uno: portal, patio, gimnasio, piscina…).
13. **Puntos de vista de cada edificio** en primer plano: desde qué calle o esquina, y qué otro edificio debe verse al fondo con su chincheta.
14. **Datos comerciales:**
    - prefijo de Hermes (`SE-HM`);
    - cifras de los áticos de Zeus, Atenea, Hera y Hermes, que en el Pricing v.07 parecen desplazadas de columna;
    - IGIC;
    - planes de pago (hoy solo existe el esquema del EVI: 10 % + 10 % + 80 %).
15. **Leyenda legal** en la web: «Imágenes orientativas, no contractuales. Mobiliario y cocina no incluidos salvo indicación en la memoria de calidades».

---

## 6. Riesgos y decisiones abiertas

1. **Memoria contra imagen.** Si la planta 1 sale con antepecho y la memoria dice suelo-techo, la publicidad contradice el contrato. Hay que alinearlas antes de publicar.
2. **Dependencia de una persona en D5.** Sin artista 3D no hay producción. Alternativas:
   - Unreal *path tracer* automatizado (frágil);
   - Memorable (caro).
3. **Proyección paralela de D5:** hay casos de ruido en vistas cenitales. Se valida en la fase 0. Si falla:
   - cámara perspectiva con FOV mínimo desde muy alto;
   - o render de planta en Unreal o Twinmotion.
4. **Otros cuatro edificios sin modelo:** la fase 3 no tiene fecha mientras no lleguen.
5. **Volteos:** los baños y las estancias al jardín interior se voltean. Si el cliente no lo acepta, se renderizan aparte (unos 15 360 más).
6. **Planta 3 igual a planta 2:** si el estilismo cambia entre plantas, son 12 teselas más.
