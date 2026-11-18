# SERENEA · Referentes y flujo del showroom de renders

Versión 1, del 18 de noviembre de 2026, para `showroom.unikdi.com/nuevo/`.

Este documento tiene dos partes:
1. **Referentes**: qué hacen hoy los selectores de viviendas basados en renders y vídeo, y qué conviene copiar.
2. **Revisión del storyboard**: qué pantallas y estados faltan, con prioridad, y qué técnica y duración lleva cada transición.

Acompaña a `PRODUCCION_IMAGENES.md` (las piezas de imagen) y a `DATOS.md` (los datos y el panel).

**Cómo se ha hecho y qué límites tiene.**
- Búsquedas web de noviembre de 2026 con los términos del encargo, en español, inglés y alemán.
- Desde este entorno no se pudieron abrir las webs de los proveedores: la red no resuelve, por ejemplo, `maverickframe.com`, `3destate.pl` ni `render-vision.com`. Por eso las fichas de referentes recogen **lo que cada proveedor declara y publica**, no lo que se ha visto al navegar.
- Lo que no está documentado se marca como «no documentado».
- Los patrones de la parte 2 son práctica habitual del sector y criterio propio. Se señalan como tales.
- **Antes de cerrar el diseño, alguien debería abrir en un móvil y en un ordenador al menos Maverick Frame (demo Olive Ridge), 3D Estate, Streamnow y Hoyt JV.**

---

## 0. Las 10 recomendaciones de más impacto

1. **Cada pantalla tiene su dirección web.** Por ejemplo, `/nuevo/apolo/planta-1/108/salon`. El botón «atrás» del navegador funciona, y el comercial puede mandar una vivienda concreta por WhatsApp con su imagen de vista previa. Lo hacen todos los referentes serios: Maverick Frame da un enlace por vivienda y Render Vision permite compartir.
2. **Un listado con filtros, además del recorrido visual.** Edificio, planta, dormitorios, precio máximo y «solo disponibles». Lo tienen 3D Estate, Streamnow (modo Lista), Engrain, Render Vision y VisEngine. Resuelve tres cosas a la vez:
   - el comprador que ya sabe lo que quiere;
   - el comercial;
   - la accesibilidad, porque es la alternativa a la navegación espacial.
3. **Los vídeos de transición se pueden saltar y no pasan de 5 s en la web.** Un clic durante el vídeo salta al final con un fundido de 200 ms. La segunda vez en la sesión se reproduce más rápido. Si el vídeo no está listo en 300 ms, se sustituye por un acercamiento 2D con fundido.
4. **Primero se selecciona y luego se entra, en táctil.** En el móvil no hay hover. El primer toque resalta el edificio o la planta y abre una hoja inferior con el dato clave y «Entrar»; el segundo toque entra. Las plantas tienen además un **riel de botones** lateral, porque las bandas finas y con saltos son difíciles de acertar con el dedo.
5. **Leyenda de estados con recuento en cada nivel.**
   - En el conjunto: «Apolo · 96 disponibles» (96 es el estado de demostración de `serenea.json`).
   - En el edificio, al lado de cada planta: «Planta 2 · 12».
   - En la planta: Disponible / Reservada / Vendida.

   El velo gris del cliente se respeta, pero el estado nunca se comunica solo con color: la etiqueta lo dice en texto.
6. **«Ver pagos» abre un plan de pagos calculado para esa vivienda.** Muestra reserva, contrato, cuotas durante la obra y entrega, en euros y en %, con el IGIC y el total. Los datos ya están en la hoja `PlanesPago` (`DATOS.md`). Va dentro de la misma ventana, nunca en una ventana encima de otra.
7. **Contacto siempre a mano y con la vivienda ya rellenada.** Formulario corto, teléfono y WhatsApp. Debe aparecer en la ficha, en el 360 y en el listado. Es la razón comercial de toda la web, y en el storyboard no aparece.
8. **El 360 se orienta solo y se ve al instante.** Abre mirando a la vista principal de la estancia (ventana o terraza). Muestra primero una vista previa ligera y luego gana nitidez. Lleva un mini plano con la posición y el cono de visión, y la lista de estancias en chips. Se hace con Photo Sphere Viewer 5, que trae enlaces entre panorámicas, precarga de las contiguas y transición con giro y fundido.
9. **Los edificios sin renders (Zeus, Atenea, Hera y Hermes) se ven «Próximamente» y tienen «Avísame».** En el lanzamiento solo Apolo tiene imagen. El conjunto debe dejar claro qué se vende ya y captar interés por lo demás.
10. **Presupuesto de rendimiento cerrado y precarga por intención.** La primera pantalla pesa como mucho 600 KB en el móvil (800 KB en el ordenador) y se pinta en menos de 2,5 s en 4G. Mientras el usuario mira, se precarga lo más probable: el vídeo de Apolo y, al pasar el ratón o hacer la preselección, la imagen siguiente. Los ficheros llevan nombre con huella y caché de un año, y el estado vivo va sin caché. Este presupuesto es el que fija la guía de Utsubo de 2026 para la tableta de la sala de ventas.

---

## 1. Referentes (2025–2026)

### 1.1 Fichas

Columna «Actividad»:
- **comprobada**: hay una fecha de 2025–2026 en la fuente.
- **activa**: página en línea, sin fecha concreta.

#### 1. Maverick Frame · Selector de viviendas (España e internacional)
- **URL**: https://maverickframe.com/es/servicios/selector-de-viviendas/
  - Guía de 2026: https://maverickframe.com/lead-magnets/roadmap/es/interactive-apartment-selector.pdf
  - Actividad: comprobada (2026).
- **Qué hace bien**: un único modelo 3D alimenta los renders, los planos y el selector, así que plantas, planos y precios nunca se contradicen. Cada vivienda tiene su enlace para que el comercial lo envíe. Hay versión a pantalla completa para la pantalla táctil de la sala de ventas.
- **Navegación**: edificio → planta sobre el render → vivienda → plano y acabados. La demo «Olive Ridge» tiene un bloque de 8 plantas y 14 parcelas.
- **Resaltado**: al pasar el ratón por una vivienda se ven su superficie, su estado y su precio. Al abrirla, la superficie de cada estancia y la comparación con la contigua.
- **Transiciones y móvil**: no documentados.
- **Extras**: cambio de acabados con precio que varía, comparación y modo sala. Presupuesto cerrado por proyecto.
- **Para Serenea**: etiqueta con tres datos al pasar el ratón; superficie por estancia en la ficha; enlace por vivienda; modo sala.

#### 2. 3D Estate · 3D Twin y buscador de viviendas (Polonia)
- **URL**: https://3destate.pl/en/3d-real-estate
  - Vistas: https://3destate.pl/en/interactive-rendering
  - Caso: https://3destate.pl/en/case-study/chapter-london-bridge-case-study-en
  - Actividad: activa; dicen tener más de 400 promotoras clientes.
- **Qué hace bien**:
  - Buscador por criterios: superficie, dormitorios, planta, precio y orientación.
  - Comparador de viviendas.
  - **Vista desde el balcón, la terraza o el jardín de cada vivienda, girable 360°**.
  - En Chapter London Bridge, un buscador 2D por planta sincronizado con el modelo.
- **Navegación**: maqueta giratoria del conjunto → edificio → planta → vivienda → paseo.
- **Extras**:
  - Modos día y noche (paquete superior).
  - Analítica para el promotor: recorrido, tiempo, viviendas más vistas y parámetros de búsqueda.
  - CRM bidireccional.
  - En Greenford Quay (Londres): integración en la web y una app de Unreal Engine 5 aparte para la sala.
- **Para Serenea**: la vista desde cada vivienda (ya cubierta por los 360 de terraza; más adelante, una vista por altura); la analítica de viviendas más vistas.

#### 3. Render Vision · Apartment Selector y 3D Apartment Viewer
- **URL**: https://render-vision.com/apartment-selector
  - Visor: https://render-vision.com/services/3d-apartment-viewer-services/
  - Actividad: activa.
- **Qué hace bien**:
  - La vivienda se elige directamente sobre la fachada.
  - La ficha resume de un vistazo planta, superficie, orientación y disponibilidad.
  - Hay un **comparador lado a lado** de distribución, superficie, planta y precio, sin ir y venir.
  - Ficha descargable en PDF, **favoritos** y **compartir**.
- **Navegación**: exterior → planta → vivienda.
- **Móvil**: dicen que la misma experiencia funciona en el navegador del ordenador, la tableta o el móvil, sin aplicaciones ni complementos.
- **Extras**: vistas desde las ventanas y comparación entre plantas.
- **Para Serenea**: favoritos, comparador (más adelante), PDF por vivienda (las 166 fichas ya existen).

#### 4. Streamnow · Object Finder (Suiza)
- **URL**: https://streamnow.ch/en/loesungen/real-estate-marketing/object-finder/
  - Actividad: activa.
- **Qué hace bien**: tres modos del mismo buscador:
  - **Lista**: tabla de todas las unidades, preparada para ordenador y móvil.
  - **Isometría**: cada unidad situada en el edificio.
  - **Render**: los datos sobre la imagen fotorrealista.
- **Extras**: su «Demand Radar» mide por vivienda el tiempo de visita, los clics y los contactos.
- **Para Serenea**: es la confirmación de que **lista + render** es el par mínimo. El «radar» se puede hacer en pequeño con analítica sin cookies.

#### 5. Planpoint · Selector de plantas para insertar en la web (SaaS)
- **URL**: https://www.getapp.co.uk/software/2104588/planpoint y https://www.softwareadvice.co.uk/software/558552/Planpoint
  - Son fichas de directorio; la web del fabricante no apareció.
  - Actividad: activa.
- **Qué hace bien**:
  - Varios temas visuales: Modern, Overlay, Glass, Elegant, **Brutalist**, Grid y List.
  - Modos de presentación: tabla de plantas apiladas (*stacking plan*), vista 360 del proyecto girando y 3D.
  - Gestión de disponibilidad y precios.
- **Móvil y sala**: aplicación «Superframe» para televisores y tabletas, y aplicación de Windows para pantallas táctiles.
- **Para Serenea**: el *stacking plan* es la mejor vista de inventario para el comercial (plantas en filas, viviendas en celdas con su estado). Encaja con la estética rectilínea que pide el cliente.

#### 6. Scene Engine / RegalScene · Planos maestros interactivos
- **URL**: https://scene-engine-website.pages.dev/blog/interactive-master-plans-property-launches
  - También: https://scene-engine-website.pages.dev/blog/what-is-a-digital-sales-center
  - Actividad: activa.
- **Qué hace bien**:
  - Imagen de zoom profundo con capas SVG encima y puntos calientes en cada zona, edificio o servicio.
  - Editor sin código que importa imágenes del plano, plantas, capas SVG y panorámicas.
  - El plano se puede publicar **antes de que abra la sala de ventas** y capta contactos desde el primer día.
- **Para Serenea**: es exactamente la técnica elegida. Render fijo, capa SVG con la geometría exacta, zoom por teselas y panorámicas, todo sin 3D en tiempo real.

#### 7. VisEngine · Masterplan interactivo (Dubái)
- **URL**: https://visengine.com/interactive-masterplan-application/
  - Casos: https://visengine.com/case-study-sobha-one-interactive-3d-master-plan-as-a-sales-transformation-tool/ y https://visengine.com/portfolio/interactive-map-deyaar/
  - Actividad: activa.
- **Qué hace bien**:
  - Filtra y resalta viviendas por presupuesto, superficie y servicios.
  - Plano por tipología con comparación.
  - **Simula la vista exacta desde la vivienda** según su planta, su orientación y su posición.
  - Vistas 360 desde las ventanas.
  - Rutas y distancias a puntos del entorno.
- **Para Serenea**: la pantalla de ubicación con distancias, y la vista por altura (más adelante).

#### 8. Engrain · SightMap (EE. UU.)
- **URL**: https://engrain.com/sightmap
  - Novedad: https://www.engrain.com/resources/news/engrain-launches-pathfinding-for-sightmap-enabling-navigation-within-apartment-communities
  - Actividad: comprobada (rutas dentro del conjunto, 4 de marzo de 2026).
- **Qué hace bien**:
  - Es el estándar en alquiler residencial de EE. UU.
  - Mapa del conjunto con las viviendas libres y las que cumplen los filtros (tipo de plano, fecha de entrada).
  - Precio y disponibilidad en tiempo real.
  - API para integrarlo en otras webs; se vende integrado con Yardi RentCafe.
- **Navegación**: conjunto → edificio → planta → vivienda, con recorrido a pie entre puntos del conjunto.
- **Móvil**: interfaces adaptables a portátil y móvil.
- **Para Serenea**: los filtros encienden las viviendas que cumplen sobre la propia planta, no solo en una lista aparte.

#### 9. Spherexx · Convert (EE. UU.)
- **URL**: https://www.spherexx.com/product/convert/multifamily/
  - Actividad: activa; la línea de productos aparece en una nota de prensa de 2026.
- **Qué hace bien**:
  - Elección de vivienda por planta, por vista y por servicios cercanos.
  - Plano vectorial con la marca del proyecto.
  - Se adapta a cualquier pantalla.
  - **Declara cumplir WCAG 2.1 AA**.
  - Reserva de visita por el propio usuario.
- **Para Serenea**: la accesibilidad como requisito de producto, y «pedir cita» como acción principal junto al contacto.

#### 10. The Digital Bunch · «Your Next Home» (Polonia)
- **URL**: https://www.thedigitalbunch.com/case-studies/your-next-home-building-immersive-360-real-estate-platform-that-reduced-time-to-contract-by-31-and-increased-qualified-inquiries-by-49
  - Actividad: activa.
- **Qué hace bien**:
  - Tours 360 interactivos.
  - Disponibilidad en tiempo real.
  - Analítica conectada al CRM y herramientas para el agente.
  - Hecho con React y Three.js.
- **Cifras del propio estudio**: 31 % menos de tiempo hasta el contrato y 49 % más de consultas cualificadas. No están verificadas.
- **Para Serenea**: el 360 bien hecho es lo que más convence. Conviene medir qué 360 se abren.

#### 11. Simplex 3D · REALS (EE. UU.)
- **URL**: https://www.multifamilydive.com/press-release/20250708-the-end-of-buying-blind-how-reals-is-redefining-pre-construction-sales/
  - Actividad: comprobada (julio y noviembre de 2025).
- **Qué hace bien**:
  - Panorámicas 360 de la vivienda y del entorno, con arrastrar para mirar.
  - Vistas futuras simuladas antes de construir.
  - Gestión de varias viviendas, edificios y zonas comunes en un mismo sitio.
  - Analítica de qué contenido interesa y de cómo trabaja cada comercial con cada cliente.
- **Para Serenea**: las zonas comunes, con el mismo tratamiento que las viviendas.

#### 12. Webflow + GSAP: Hoyt JV (Praga), Lofty Hradec y Bright Web Studio
- **URL**:
  - https://webflow.com/made-in-webflow/website/hoyt-jv
  - https://webflow.com/made-in-webflow/website/lofty-hradec
  - https://contra.com/p/E6qE6M6Q-interactive-webflow-website-for-a-luxury-residential-complex
  - Actividad: comprobada (Bright Web Studio, junio de 2026).
- **Qué hace bien**:
  - Navegación planta a planta con **transiciones animadas con GSAP**.
  - Filtrado de viviendas y disponibilidad mantenida en un gestor de contenidos.
  - Elección de planta y vivienda sobre la fachada, con estados de vendida o disponible.
  - Ficha propia de cada vivienda.
- **Para Serenea**: es el lenguaje visual que pide el cliente: rectilíneo, fotografía o render a sangre y tipografía grotesca. Además, GSAP es gratuito también para uso comercial desde abril de 2025 (https://webflow.com/blog/gsap-becomes-free).

#### 13. UMC Studios · Sharjah Sustainable City 2 (Emiratos)
- **URL**: https://umc-ssc2-casestudy.pages.dev/
  - Actividad: activa.
- **Qué hace bien**:
  - Masterplan de 1.032 viviendas conectado al inventario vivo.
  - Misma aplicación en la pantalla táctil de la sala y en la tableta del comercial.
- **Ojo**: es tiempo real (motor 3D), justo lo que el cliente descarta. Se cita por el **inventario vivo** y el **modo tableta**, no por la técnica.

#### 14. Utsubo · Guía de webs de promotoras (Japón, mayo de 2026)
- **URL**: https://www.utsubo.com/blog/real-estate-developer-website-guide
  - Actividad: comprobada.
- **Qué aporta**:
  - Trata la web del proyecto como herramienta de preventa, no como folleto.
  - Calcula el coste de una vivienda sin vender en 3.000–8.000 $ al mes.
  - Los niveles altos incluyen cita con el comercial, videollamada y un presupuesto de rendimiento apto para la tableta de la sala.
- **Para Serenea**: el criterio del presupuesto de rendimiento (§5).

**Referentes técnicos de apoyo**, que no son selectores:
- **Photo Sphere Viewer 5** (https://photo-sphere-viewer.js.org/plugins/virtual-tour.html). Visita virtual con nodos y enlaces, precarga opcional de los nodos enlazados y transición con giro, zoom y fundido. Tiene además complementos de puntos (*markers*), mini plano y brújula.
- **Render a House** (https://www.renderahouse.com/docs/en/video-transitions). Transición de cámara entre dos renders del mismo edificio: giro a izquierda o a derecha, o corte seco.
- **Structure Studios** (https://www.structurestudios.com/help/video-mode). Distingue el corte seco del fundido cruzado entre cámaras.
- **Contra, caso de Dubái** (https://contra.com/community/ZnAmdgH5-cinematic-real-estate-web-experience-with). Precarga en memoria los bucles de dron para que el cambio entre puntos sea instantáneo.
- **Window View** (https://hunted.space/product/window-view). Vista desde una ventana a cualquier altura con recorrido solar a lo largo del año y vista compartible por enlace. Es la referencia para el soleamiento (más adelante).
- **Otros que se encontraron y no aportan nada nuevo**:
  - FlatyFind (Karlsruhe), buscador 3D insertable en la web del proyecto: https://www.konii.de/?p=12258
  - ArchiCGI, plataforma desde 5.700 $ con tres años de alojamiento: https://archicgi.com/interactive-real-estate-platform/
  - Habitat Digital (Australia, septiembre de 2025), sala de ventas conectada con el CRM y con lo online: https://theurbandeveloper.com/articles/habitat-digital-immersive-apartment-showroom-digital-sales

### 1.2 Matriz de funciones

Leyenda:
- ✓: declarado por el proveedor.
- —: no documentado. No quiere decir que no lo tenga.

| Referente | Técnica | Filtros | Lista | Comparar | Favoritos | Enlace por vivienda | Vistas / orientación | Modo sala o tableta | Analítica |
|---|---|---|---|---|---|---|---|---|---|
| Maverick Frame | Renders | — | — | ✓ | — | ✓ | — | ✓ | — |
| 3D Estate | 3D y renders | ✓ | ✓ | ✓ | — | — | ✓ vista 360 | ✓ (UE5) | ✓ |
| Render Vision | 3D en el navegador | ✓ | — | ✓ | ✓ | ✓ compartir | ✓ ventanas | — | — |
| Streamnow | Renders e isometría | — | ✓ | — | — | — | — | — | ✓ |
| Planpoint | 2D, 360 y 3D | — | ✓ | — | — | — | — | ✓ | — |
| Scene Engine | Imagen con zoom profundo y SVG | — | — | — | — | — | — | — | ✓ |
| VisEngine | Renders, 3D y VR | ✓ | — | ✓ | — | — | ✓ vista exacta | — | — |
| Engrain SightMap | Mapa vectorial | ✓ | ✓ | — | — | — | ✓ vistas | — | — |
| Spherexx Convert | Plano vectorial | ✓ | — | — | — | — | ✓ vista | — | — |
| REALS | 360 y renders | — | — | — | — | — | ✓ vistas futuras | ✓ | ✓ |
| Webflow (Hoyt JV y otros) | Renders y GSAP | ✓ | — | — | — | ✓ ficha | — | — | — |

Lectura: **filtros + enlace por vivienda + vistas** es lo que se repite. El comparador y los favoritos son frecuentes, pero no universales. Ninguno documenta un plan de pagos dentro del selector. En Dubái es habitual en las fichas de los portales (reparto 20/40/40), así que en Serenea sería un elemento diferenciador.

### 1.3 Patrones del sector

Síntesis de práctica habitual y criterio propio. No se atribuye a un proveedor concreto.

- **Navegación.** Conjunto → edificio → planta → vivienda → 360. Siempre hay migas visibles y un atajo «Viviendas» (listado) que se salta los niveles. Los mejores dejan cambiar de planta sin volver al edificio.
- **Transiciones.**
  - **Vídeo pregrabado** entre una cámara fija y la siguiente, con el último fotograma idéntico a la imagen de destino (corte invisible).
  - **Giro por fotogramas**: secuencia de 36–120 renders para girar el edificio arrastrando. Da sensación de 3D sin serlo, pero multiplica las máscaras: cada fotograma necesita la suya.
  - **Fundido** entre imágenes registradas (planta → planta).
  - **Acercamiento 2D** cuando no hay vídeo.
- **Resaltado.**
  - Relleno plano semitransparente o contorno fino sobre la geometría exacta.
  - El resto, atenuado.
  - Una etiqueta con 2 o 3 datos, anclada al elemento y no al cursor.
  - Estados por velo y texto. Los colores tipo semáforo (verde, ámbar y rojo) son la marca de los selectores de 2015.
- **Móvil.**
  - Hoja inferior no modal sobre la imagen. Según Nielsen Norman Group, el patrón de Google Maps: la imagen sigue moviéndose debajo y no se apilan hojas.
  - Pellizcar para ampliar y arrastrar para mover, en el plano.
  - Riel de plantas en botones.
  - Imágenes recortadas a 9:16 desde una zona segura.
- **Rendimiento.**
  - Imagen de baja resolución al instante y luego la buena.
  - Teselas para las plantas.
  - Vídeo precargado en memoria antes de necesitarlo.
  - Panorámicas multirresolución.

---

## 2. Revisión del storyboard

### 2.1 Lo que está bien resuelto
- La secuencia principal es la correcta y coincide con la de los referentes: conjunto → edificio (Apolo) → planta cenital → zoom hasta una vivienda → ficha → 360 → atrás.
- **Invertir la ficha** (datos a la izquierda, plano a la derecha) es la mejor decisión del boceto: se lee primero el precio y luego el plano.
- Las **chinchetas** con el número de los otros edificios al fondo (viñetas 2 y 8) permiten saltar entre edificios sin volver al conjunto.
- Mantener la columna izquierda cuando se entra al 360 (viñeta 7) conserva el contexto y el precio.

### 2.2 Lo que falta o queda abierto
1. No hay **carga inicial** ni **portada**.
2. No hay **barra de navegación** fija (logo, migas, «Viviendas», contacto, idioma).
3. No se dice cómo se **vuelve** de la planta al edificio ni cómo se **cambia de planta** desde la planta.
4. No hay **ficha de edificio** (cuántas viviendas quedan, desde qué precio, entrega).
5. No hay **leyenda de estados**.
6. No se dice qué pasa con los **edificios sin renders**.
7. «VER PAGOS» no tiene pantalla.
8. No hay **contacto** en ningún sitio.
9. No hay **listado** ni **filtros**.
10. Nada está pensado para **táctil**: todo el boceto depende del hover.
11. No hay estados de **error** ni de **carga** dentro de la web.
12. No hay **zonas comunes**, **ubicación** ni **textos legales**.

### 2.3 Mapa de pantallas propuesto

```
                    ┌──────────────────────────────────────────────┐
 Barra fija:        │ SERENEA   Serenea / Apolo / P1 / 108   Viviendas  Contacto  ES│
                    └──────────────────────────────────────────────┘
 [Carga] ──► [Conjunto = portada] ──► [Edificio + ficha de edificio] ──► [Planta] ──► [Ficha de vivienda] ──► [360]
                │   ▲                     │   ▲   ◄── chinchetas ──►       │  ▲  ▲        │      │               │ ▲
                │   └── atrás ────────────┘   └──── atrás ────────────────┘  │  │        │      └► [Plan de pagos]
                │                                                     cambio de planta │      └► [Contacto]
                ├─► [Edificio «Próximamente»] ─► [Avísame]                      │      └► [Compartir]
                ├─► [Zonas comunes] ─► [360 de zonas comunes]                   │
                └─► [Ubicación y entorno]                                       │
 [Listado + filtros] ───────────── clic en una fila ─────────────► planta con la vivienda centrada ──► ficha
 Transversales: [Error / sin conexión] [404 / vivienda ya vendida] [Aviso legal · Privacidad · Cookies] [Modo sala]
```

---

## 3. Pantallas y estados, por prioridad

**Imprescindible**: sin esto no se debería lanzar. **Recomendable**: alto impacto con poco coste. **Más adelante**: necesita material, datos o decisiones que no hay todavía.

### 3.1 Imprescindible

| # | Pantalla o estado | Contenido y comportamiento | Por qué |
|---|---|---|---|
| I-1 | **Carga inicial** | Fondo liso del color de la marca, logo SERENEA y una línea de progreso de 1 px que mide bytes reales, nunca un porcentaje inventado. En cuanto la imagen del conjunto está decodificada, entra con un fundido. Si pasan más de 4 s: «Conexión lenta: cargando la versión ligera» (sin vídeos). | La primera impresión. Hay que evitar el blanco y el salto de maquetación. |
| I-2 | **Conjunto = portada** | No es una portada aparte: la aérea **es** la portada. Encima, solo la primera vez, una línea: «Residencial Serenea · Las Huesas, Telde — Elige un edificio». Desaparece al primer gesto. Lleva chinchetas 1–5 con el nombre y, para Apolo, su recuento («96 disponibles»). En móvil: chips con los edificios abajo y la imagen desplazable si los cinco no caben en 9:16. | Ir directo al producto. Las intros que bloquean envejecen la web. |
| I-3 | **Estados de un edificio en el conjunto** | Tres estados:<br>• *En venta*: chincheta llena y recuento.<br>• *Próximamente*: chincheta hueca y «Próximamente».<br>• *Agotado*: chincheta tenue y «Vendido». | Zeus, Atenea, Hera y Hermes no tienen modelo 3D todavía. |
| I-4 | **Edificio «Próximamente»** | La imagen disponible (volumen del conjunto o render provisional), el nombre, el número de viviendas, las tipologías previstas si se conocen, y «Avísame cuando salga a la venta» con correo o teléfono y consentimiento. | Convierte un callejón sin salida en un contacto. |
| I-5 | **Edificio + ficha de edificio** | Render a sangre. Columna lateral (escritorio) u hoja asomada (móvil) con:<br>• nombre y número;<br>• viviendas disponibles de cuántas;<br>• dormitorios de 1 a 3;<br>• «desde» el precio;<br>• entrega prevista;<br>• botones «Ver viviendas» (listado filtrado) y «Zonas comunes».<br>Chinchetas de los demás edificios. | Da el resumen comercial antes de bajar a la planta. |
| I-6 | **Selector de planta** (ratón, teclado y táctil) | Máscara exacta de cada planta, con los saltos de nivel (`MSK`). Riel lateral de botones (Ático · 3 · 2 · 1) sincronizado en los dos sentidos con el resaltado de la imagen, cada uno con su recuento de disponibles. Hover, foco o toque resaltan; clic, Intro, segundo toque o «Ver planta» entran. Flechas ↑/↓ en el teclado. | El hover no existe en el móvil. Las bandas son finas y escalonadas. |
| I-7 | **Planta** | • Cenital con mobiliario.<br>• Velo gris sobre las viviendas no disponibles, con su geometría exacta.<br>• **Leyenda con recuento**, por ejemplo «Disponible 12 · Reservada 3 · Vendida 31» (cifras ilustrativas).<br>• Flecha de norte y escala gráfica.<br>• Zoom con botones (+ / − / encajar), rueda, pellizco y doble toque, desde la planta entera hasta una vivienda llenando la pantalla.<br>• Cambio de planta sin salir (riel).<br>• Etiqueta al pasar por encima de una vivienda: «108 · 1 dorm. · 42 m² · 169.000 € + IGIC» (datos reales de `data/units.json`; el 147.000 € del boceto es ilustrativo).<br>• Si no está disponible, solo «Vendida» o «Reservada».<br>• Volver al edificio. | Es el corazón del selector. |
| I-8 | **Ficha de vivienda** | **Escritorio**: ventana sobre la planta, según el boceto.<br>• **Columna izquierda**: imagen (el render fijo de Apolo o, como alternativa, la miniatura de la situación de la vivienda en la planta, que ya existe en `assets/ubicaciones/`), referencia, tipología, dormitorios y baños, planta, orientación, superficie útil por estancia, superficie útil total, construida, terraza, estado.<br>• **Derecha**: «Vivienda 108 · 147.000 € + IGIC · VER PAGOS» y la cenital detallada con las bolitas 360.<br>• **Acciones**: Solicitar información, Descargar ficha (PDF, ya existen 166), Compartir, ⊗.<br>• Flechas de anterior y siguiente vivienda de la misma planta. Esc cierra.<br><br>**Móvil**: hoja a pantalla completa, en este orden: barra (← Planta 1 · 108 · compartir); cenital con bolitas, a todo el ancho; precio, «Ver pagos» y botón fijo abajo «Solicitar información»; superficies en desplegable. La imagen fija de Apolo se quita en móvil. | El boceto la define; aquí se completan las acciones y el móvil. |
| I-9 | **Plan de pagos** | Se abre desde «Ver pagos», **dentro de la ficha**: la columna izquierda pasa a mostrar el plan con «← Vivienda 108». Tabla de cuatro hitos con su % y su importe calculado sobre el precio de esa vivienda, que son los campos de `PlanesPago`:<br>• Reserva.<br>• Firma del contrato privado.<br>• Cuotas durante la obra (n × importe).<br>• Entrega de llaves.<br>Debajo: precio, IGIC (%) e importe, **total con IGIC**, garantía de las cantidades entregadas a cuenta, la nota «Condiciones orientativas; consulte con el equipo comercial» y el botón de contacto. Si la vivienda no tiene plan, no hay botón (ya previsto en `DATOS.md`). | Lo pide el boceto, y es información que el comprador debe tener (§7). |
| I-10 | **360 de estancia** | • Escritorio: ocupa la zona derecha (viñeta 7). Móvil: pantalla completa, y en horizontal si se gira.<br>• Arrastrar para mirar.<br>• Bolitas en los umbrales de las puertas hacia las estancias contiguas.<br>• Nombre de la estancia arriba.<br>• **Mini plano** con la posición y el cono de visión.<br>• **Chips con todas las estancias** de la vivienda.<br>• Volver a la ficha y pantalla completa.<br>• Abre mirando a la vista principal.<br>• Carga: vista previa ligera al instante (≈ 30 KB) y caras multirresolución después.<br>• Sin giro automático ni efecto «pequeño planeta». | El boceto lo pide. Los añadidos evitan que el usuario se pierda. |
| I-11 | **Contacto** | Hoja lateral (escritorio) u hoja inferior (móvil). Nombre, teléfono, correo, vivienda de interés ya rellenada (editable), mensaje opcional y casilla de privacidad. Aparte, casilla opcional de comunicaciones comerciales. Teléfono y WhatsApp como alternativas. Confirmación: «Recibido. Te llamamos en 24 h laborables». Está accesible desde la barra, la ficha, el 360, el listado y «Avísame». | Es el objetivo comercial de la web. |
| I-12 | **Listado + filtros básicos** | • Tabla con: ref., edificio, planta, dormitorios, superficie útil, terraza, orientación, precio y estado.<br>• Filtros: edificio, planta, dormitorios, precio máximo y «Solo disponibles» (activado por defecto).<br>• Orden por precio y superficie.<br>• En móvil, tarjetas en lugar de tabla.<br>• Clic: planta con la vivienda centrada y su ficha abierta.<br>• Con los filtros activos, en la planta se atenúan también las viviendas que no cumplen (patrón de Engrain). | La mitad de los compradores busca por criterio. También es el atajo del comercial y la alternativa accesible. |
| I-13 | **Navegación persistente** | Barra fina con:<br>• logo (lleva al conjunto);<br>• migas (Serenea / Apolo / Planta 1 / 108);<br>• «Viviendas»;<br>• «Contacto»;<br>• idioma (preparado aunque solo haya ES).<br>Dirección web por pantalla con el History API: «atrás» del navegador = atrás de la web. La entrada directa por enlace pinta la planta con la ficha abierta, sin animaciones. | Compartir, volver y orientarse. |
| I-14 | **Errores y casos límite** | • **Vídeo que falla o tarda** → acercamiento 2D con fundido, sin aviso.<br>• **Teselas o 360 que fallan** → «No se ha podido cargar. Reintentar».<br>• **Sin conexión** → franja «Sin conexión. Lo que ya has visto sigue disponible».<br>• **Estado vivo que no responde** → se usa el último estado guardado con «Disponibilidad a fecha …». Si no hay ninguno, se ocultan precios y estados: nunca se enseña como disponible algo que podría estar vendido.<br>• **Enlace a una vivienda vendida** → ficha en solo lectura, con «Esta vivienda ya no está disponible» y 3 parecidas disponibles (misma tipología o mismos dormitorios).<br>• **Ruta inexistente** → 404 sobria con vuelta al conjunto. | Pasará. Con enlaces por WhatsApp, a diario. |
| I-15 | **Accesibilidad básica** | • Cada edificio, planta, vivienda y bolita es un elemento enfocable con nombre accesible («Vivienda 108, 1 dormitorio, 42 metros cuadrados construidos, disponible, 169.000 euros más IGIC»).<br>• Foco visible y Esc para cerrar.<br>• Foco atrapado dentro de la ficha mientras está abierta.<br>• `prefers-reduced-motion`: fundidos de 200 ms en lugar de vídeos y bolitas sin pulso.<br>• Texto siempre sobre fondo liso, nunca suelto sobre el render.<br>• Zonas táctiles de 44 px o más.<br>• El zoom del navegador no se bloquea. | Objetivo WCAG 2.2 AA (§7). |
| I-16 | **Textos legales** | Pie fijo con Aviso legal, Privacidad y Cookies (esta última solo si se usan cookies no técnicas). Junto a renders, plantas y fichas: «Imágenes, mobiliario y vegetación orientativos, no contractuales». La nota del precio y el IGIC va en la ficha y en el plan de pagos. | Obligatorio (§7). |

### 3.2 Recomendable

| # | Pantalla o estado | Contenido | Por qué |
|---|---|---|---|
| R-1 | **Zonas comunes** | Desde el conjunto y la ficha de edificio. Portal, patio, gimnasio y garaje: 360 enlazados y las imágenes fijas de MEMORABLE (`PRODUCCION_IMAGENES.md` ya las prevé). | Las zonas comunes venden casi tanto como la vivienda (REALS). |
| R-2 | **Ubicación y entorno** | Mapa estático con el estilo de la marca, sin mapa de Google embebido para no meter cookies de terceros. Distancias y tiempos a playa, colegios, centro de Telde, Las Palmas y aeropuerto. Botón «Cómo llegar» que abre la aplicación de mapas del usuario. | Pregunta segura del comprador local. |
| R-3 | **Vista previa al compartir** | `index.php` mínimo que escribe en el `<head>` el título, la descripción y la imagen de cada vivienda (cenital o render). WhatsApp y las redes muestran entonces «Vivienda 108 · 1 dorm. · 169.000 € + IGIC» con su imagen. En móvil se comparte con la hoja nativa (Web Share API) y en escritorio se copia el enlace. | El comercial vende por WhatsApp. El servidor ya tiene PHP 7. |
| R-4 | **Favoritos** | Corazón en la etiqueta, la ficha y el listado. Se guardan en el navegador, sin cuenta. Página «Mis favoritas» con «Compartir selección» (un enlace con las referencias) y «Pedir información de estas». | Muy barato. El comprador compara en casa con su pareja. |
| R-5 | **Filtros avanzados** | Superficie (rango), terraza sí o no, orientación, precio (rango) y orden por precio por m². | Afina sin complicar el filtro básico. |
| R-6 | **Modo sala ligero** | Con `?modo=sala` (no es secreto ni da permisos):<br>• pantalla completa y escala de interfaz un 15 % mayor;<br>• sin enlaces externos;<br>• vuelta al conjunto tras 120 s sin uso, con un bucle de atracción;<br>• «Contacto» cambia a «Hablar con el comercial». | Tableta de la oficina y ferias, sin depender del ejecutable de Unreal. |
| R-7 | **Analítica sin cookies** | Eventos: edificio, planta, ficha abierta, 360 abierto, «Ver pagos», contacto, compartir y favorito. Resumen en el panel: «viviendas más vistas esta semana». | Es lo que 3D Estate y Streamnow venden como valor. Sin cookies no hace falta aviso de cookies. |
| R-8 | **Inglés** | Textos en un JSON por idioma desde el primer día. La traducción se hace cuando lo decida el cliente. | Comprador extranjero en Gran Canaria. Si se prepara después, cuesta el doble. |
| R-9 | **Estancias enlazadas plano ↔ tabla** | Al pasar por una fila de superficies («Dormitorio 1 · 11,2 m²»), esa estancia se marca en la cenital. | Lectura inmediata del plano. Necesita los polígonos de cada estancia (pregunta de datos). |
| R-10 | **Ayuda de primer uso** | Una línea contextual la primera vez en cada nivel: «Pulsa una planta», «Pellizca para ampliar», «Pulsa un punto para entrar». Se descarta para siempre. | Sin tutoriales de varias pantallas. |

### 3.3 Más adelante

| # | Pantalla o función | Condición o motivo |
|---|---|---|
| M-1 | **Comparador** de 2 o 3 viviendas lado a lado: plano, superficies, precio, pagos y orientación | Tiene sentido cuando haya varios edificios a la venta. Se apoya en Favoritos. |
| M-2 | **Simulador de hipoteca** | Con aviso de que es orientativo, o como enlace a un banco colaborador. Cuidado con presentar condiciones financieras como oferta. |
| M-3 | **Vistas desde cada altura**: foto de dron por fachada a la cota de cada planta y, en los áticos, desde la terraza | 3D Estate y VisEngine lo venden como diferencial. Los 360 de terraza ya cubren parte. |
| M-4 | **Soleamiento y orientación**: diagrama solar por vivienda con horas de sol en invierno y verano | En Canarias es un argumento de venta. La flecha de norte ya va en I-7. |
| M-5 | **Modo sala sin conexión**: precarga completa en la tableta | Unos 0,5–1 GB con todos los 360. Solo si la oficina no tiene buena conexión. |
| M-6 | **Cita en calendario** o videollamada con el comercial | Según el CRM o la agenda que usen. |
| M-7 | **Personalización de acabados** con precio que cambia (Maverick Frame) | Solo si la promoción ofrece opciones. Multiplica los renders. |
| M-8 | **Reserva en línea** con pago de señal | Necesita contrato, pasarela de pago y revisión jurídica. |
| M-9 | **Giro del edificio por fotogramas** | Solo si se quiere ver Apolo desde varias caras. Cada fotograma necesita su máscara de plantas. |
| M-10 | **Vídeo de «desmontaje» edificio → planta**: la cámara sube y las plantas superiores desaparecen | Muy vistoso, pero son 4 vídeos por edificio. Hasta entonces, acercamiento con fundido (§4). |

---

## 4. Transiciones: técnica y duración

### 4.1 Reglas generales
- **Duraciones base:**
  - micro (hover, foco): **120 ms**;
  - corta (paneles, cambio de planta): **250–300 ms**;
  - media (abrir la ficha): **400–450 ms**;
  - escena sin vídeo: **600–800 ms**;
  - vídeo: **3,5–5 s**.
- **Curvas:**
  - para entrar, desaceleración `cubic-bezier(0.2, 0, 0, 1)`;
  - para salir, aceleración `cubic-bezier(0.3, 0, 1, 1)`;
  - en los vídeos, la cámara arranca y frena dentro del propio render: nada de velocidad constante.
- **Todo se puede interrumpir.** Un clic durante una transición la termina con un fundido de 200 ms. Nunca hay más de un vídeo por acción.
- **Segunda vez, más corto.** En la misma sesión, el mismo vídeo va a 1,5× o se sustituye por un fundido.
- **Corte invisible.** El último fotograma del vídeo es la imagen fija de destino. El cambio se hace con la imagen ya decodificada, para que no haya fotograma negro.
- **Movimiento reducido.** Con `prefers-reduced-motion`, todos los vídeos y acercamientos pasan a fundido de 200 ms.

**Para el orquestador.** `PRODUCCION_IMAGENES.md` fija vídeos de 6–8 s. Para la web propongo un **montaje de 3,5–5 s**, que se puede saltar. El máster de 6–8 s sirve para las piezas de redes y la película. Si solo hay uno, se reproduce a 1,5×, pero el arranque y la frenada quedan peor.

### 4.2 Tabla de transiciones

| # | De → A | Disparador | Técnica | Duración | Respaldo (sin vídeo o con movimiento reducido) | Precarga |
|---|---|---|---|---|---|---|
| T-1 | Carga → Conjunto | Automático | Fundido de la imagen y retirada del logo | 500 ms + 300 ms | Igual | Imagen del conjunto con `preload` y `fetchpriority="high"` |
| T-2 | Resaltado de un edificio | Hover, foco o primer toque | Relleno plano o contorno de la máscara y chincheta un 15 % mayor; etiqueta con nombre y recuento | 120 ms al entrar, 200 ms al salir | Igual | Al hacer hover o preselección, el vídeo de ese edificio |
| T-3 | Conjunto → Edificio | Clic, Intro, segundo toque o «Entrar» | **Vídeo pregrabado** (vuelo y órbita de cámara) con **corte invisible** al render del edificio. Versión 16:9 o 9:16 según la pantalla | **3,5–5 s**; se puede saltar | Si el vídeo no está listo en 300 ms: **acercamiento 2D** (escala 1 → 1,25 centrada en la caja del edificio) y fundido al render, 700 ms | El vídeo de Apolo, en cuanto termina la carga inicial y el navegador está libre |
| T-4 | Edificio → Conjunto | Atrás, migas o logo | Vídeo invertido (fichero aparte, ya previsto) a 1,25×. Las siguientes veces, fundido | ≈ 3 s / 500 ms | Fundido de 500 ms | Ya en caché |
| T-5 | Edificio → otro edificio (chincheta) | Clic en la chincheta | **Opción A (recomendada)**: fundido cruzado directo con desplazamiento lateral del 2 % en el sentido real. **Opción B**: fundido de 300 ms al conjunto y vídeo de entrada del otro edificio | A: **600 ms**. B: ≈ 4,5–5,5 s | Fundido de 300 ms | El render del otro edificio, al hacer hover sobre su chincheta |
| T-6 | Resaltado de una planta | Hover, foco, riel o ↑/↓ | La máscara de la planta (con sus saltos) se resalta, el resto del edificio se atenúa un 15–20 % y la etiqueta se alinea con la planta, junto al riel | 120 ms | Igual | Vista general de esa planta (≤ 300 KB) |
| T-7 | Edificio → Planta | Clic o «Ver planta» | **Acercamiento con fundido**: la banda elegida se acerca (escala 1 → 1,08, 250 ms) y se funde con la cenital, que entra de escala 1,04 a 1 con el velo ya pintado | **700 ms** | Fundido de 200 ms | La vista general en T-6; las teselas, a demanda |
| T-8 | Planta → Planta | Riel o ↑/↓ | Fundido cruzado con desplazamiento vertical de 12–16 px (hacia arriba si la planta es superior). Mantiene el zoom si la huella coincide | **300 ms** | Fundido de 150 ms | Las plantas contiguas, cuando la actual está pintada |
| T-9 | Planta → Edificio | Atrás o migas | Inversa de T-7 | 500 ms | Fundido de 200 ms | En caché |
| T-10 | Zoom en la planta | Rueda, pellizco, + / − o doble toque | Zoom continuo con inercia; los botones animan cada paso | 250 ms por paso | Sin inercia | Teselas por nivel |
| T-11 | Resaltado de una vivienda | Hover o foco | **Disponible**: contorno de 2 px, aclarado leve (velo blanco del 8 %) y etiqueta. **No disponible**: la forma no cambia; etiqueta «Vendida» o «Reservada» | **100 ms** | Igual | Cenital de esa vivienda (150–300 KB) |
| T-12 | Planta → Ficha | Clic o toque en una vivienda disponible | **Escritorio**: la ventana nace del polígono. La cenital escala desde la posición de la vivienda en la planta hasta el panel derecho (técnica FLIP); el fondo recibe un velo liso del 50 % y la columna izquierda entra 16 px. **Móvil**: hoja inferior asomada (ref., dormitorios, m², precio, «Ver vivienda»); al arrastrarla, pantalla completa | **420 ms** · móvil 280 + 300 ms | Fundido de 150 ms | Ya precargada en T-11. En móvil, al tocar |
| T-13 | Ficha → Planta | ⊗, Esc, clic fuera o deslizar hacia abajo | Inversa de T-12. La vivienda marca el contorno una vez | 300 ms | 150 ms | — |
| T-14 | Ficha → ficha contigua | ← / → | Fundido con desplazamiento horizontal de 24 px | 250 ms | Fundido | Las cenitales contiguas al abrir la ficha |
| T-15 | Ficha → Plan de pagos | «Ver pagos» | La columna izquierda empuja hacia un lado y muestra el plan, con «← Vivienda 108». Nunca una ventana sobre otra | 250 ms | Corte | En el JSON |
| T-16 | Ficha → 360 | Clic en una bolita | **Acercamiento a la bolita** (la cenital escala de 1 a 1,5 centrada en el punto, 300 ms) y **fundido** a la vista previa del 360, orientada a la vista principal (300 ms). Después gana nitidez por niveles | **600 ms** + carga | Fundido de 200 ms | Vistas previas ligeras de las estancias de esa vivienda al abrir la ficha (≈ 30 KB cada una) |
| T-17 | 360 → 360 | Bolita en un umbral o chip | **Giro hacia la puerta** (300 ms) y **fundido con un acercamiento del 10 %**. Da sensación de cruzar. Con Photo Sphere Viewer: `rotateTo`, `zoomTo` y `fadeIn` | **600–800 ms** | Fundido de 200 ms sin giro | Nodos enlazados (vista previa) |
| T-18 | 360 → Ficha | ← Atrás | Fundido a la cenital, con la estancia de la que se viene marcada | 300 ms | Igual | En caché |
| T-19 | Listado → Vivienda | Clic en una fila | Planta con la vivienda centrada (zoom de 500 ms) y después T-12 | 500 + 420 ms | Directo a la ficha | Al hacer hover sobre la fila |
| T-20 | Cualquiera → Contacto | Botón | Hoja lateral de 400 px (escritorio) u hoja inferior (móvil) | 300 ms | Corte | — |
| T-21 | Entrada por enlace directo | Carga | Pinta el nivel de fondo (planta) y la ficha abierta, sin animación. Al cerrar, el usuario queda en contexto | — | — | Lo mínimo de esa ruta |

### 4.3 Detalles técnicos de las transiciones

- **Vídeo:**
  - `<video muted playsinline>` con el primer fotograma como cartel.
  - Para garantizar la precarga en iOS, que ignora `preload="auto"`, se descarga el MP4 con `fetch` y se reproduce desde un `Blob`.
  - El fin se detecta con `requestVideoFrameCallback` o `ended`, y la imagen fija de destino ya está decodificada con `img.decode()` antes del cambio.
  - Con `navigator.connection.saveData` o una conexión 2G/3G, no se usan vídeos.
- **Formatos de vídeo:**
  - H.264 en MP4 con `faststart` como base universal, y AV1 como opción.
  - Escritorio: 1920×1080, ≤ 5 MB.
  - Móvil: 1080×1920 recortado de la zona segura, ≤ 3 MB.
  - No se usa `playbackRate` negativo para invertir, porque los navegadores no lo admiten: el vídeo de vuelta es un fichero aparte, como ya prevé `PRODUCCION_IMAGENES.md`.
- **Animación de interfaz:** CSS y Web Animations API para casi todo. GSAP solo si hace falta encadenar línea de tiempo y vídeo; es gratuito.
- **Capas interactivas:** SVG con la geometría de cada máscara, en el mismo sistema de coordenadas que la imagen (`viewBox` = píxeles del máster). Así casan al píxel a cualquier tamaño.

---

## 5. Estados visuales, móvil y rendimiento

### 5.1 Estados de cada elemento interactivo

Tres opciones por elemento para que elija el cliente. Todas son planas y sin degradados. La marcada con ★ es la recomendada.

Esta lista es la exploración previa. Las opciones definitivas, con su código (H, V, R, P, T y L) y la recomendación de cada dirección, son las de `nuevo/estilos/` y la sección 6 de la propuesta al cliente; donde no coincidan, mandan esas. En particular, para las reservadas la propuesta recomienda R2: velo más ligero, borde discontinuo y etiqueta «Reservada».

- **Edificio en el conjunto:**
  - ★ A: contorno blanco de 1,5 px y relleno blanco plano del 20 %; chincheta activa en tinta con el número en blanco.
  - B: el resto del conjunto se atenúa con un velo grafito del 30 % y el edificio queda limpio.
  - C: solo la chincheta crece, con su etiqueta.
- **Planta en el edificio:**
  - ★ A: el resto del edificio se atenúa un 20 %, la planta queda limpia y un filete horizontal de 1 px la une con su etiqueta en el riel.
  - B: banda de relleno plano en el color de acento al 35 %.
  - C: solo el contorno de 2 px.
- **Vivienda en la planta:**
  - *Vendida*: velo gris del 55 %.
  - *Reservada*: ★ el mismo velo con etiqueta «Reservada», o B, un velo más ligero del 35 %.
  - *No a la venta*: como vendida, sin etiqueta.
  - *Disponible*: sin velo; al pasar el ratón, contorno de 2 px y etiqueta.
  - *Seleccionada*: contorno de 3 px y el resto de la planta con un velo extra del 15 %.
  - *Filtrada fuera*: velo del 35 % con un filete discontinuo, para distinguirla de vendida.
- **Bolita 360** (la «onda expansiva» que pide el cliente, sin destello):
  - núcleo sólido de 10–12 px con filete de 1 px;
  - dos anillos planos de 1,5 px que se expanden (escala 1 → 2,6 y opacidad 0,7 → 0) en 1,8 s, desfasados 0,9 s;
  - zona táctil de 44 px;
  - al pasar el ratón o con foco, etiqueta «Salón · 360»;
  - una vez visitada, núcleo hueco;
  - con movimiento reducido, un anillo fijo.
  - El boceto la pinta en rojo; sobre un render cálido el rojo se lee como alarma. Propongo blanco con filete en tinta, o el color de acento de la marca.
- **Foco de teclado**: filete de 2 px separado 2 px, en tinta o blanco según el fondo. Nunca se elimina.
- **Botones**: rectangulares, con radio de 0 a 2 px, filete de 1 px o relleno de tinta. El activo se invierte (tinta ↔ fondo). Sin sombras.

### 5.2 Móvil, pantalla por pantalla
- **Conjunto**:
  - imagen 9:16 desde la zona segura o, si los cinco edificios no caben, desplazable en horizontal con inercia;
  - chips de los edificios abajo;
  - toque = preselección con hoja asomada (nombre, disponibles, desde, «Entrar»).
- **Edificio**: riel vertical de plantas a la derecha, con botones de 44 px y su recuento; hoja asomada con la ficha de edificio.
- **Planta**:
  - lienzo a pantalla completa;
  - gestos: pellizcar, arrastrar y doble toque, con `touch-action: none` solo en el lienzo;
  - riel compacto y leyenda plegable;
  - toque en una disponible = hoja asomada;
  - toque en una no disponible = aviso breve «Vendida».
- **Ficha**: hoja a pantalla completa (I-8), con el botón «Solicitar información» fijo abajo y respetando `env(safe-area-inset-bottom)`.
- **360**:
  - pantalla completa;
  - giroscopio opcional con botón (iOS pide permiso; Photo Sphere Viewer tiene complemento);
  - chips de estancias abajo y mini plano plegable.
- **General**:
  - `100dvh`;
  - nunca dos hojas apiladas;
  - el botón atrás del sistema (Android) cierra primero la hoja y luego cambia de nivel;
  - en horizontal, la ficha vuelve a dos columnas.

### 5.3 Presupuesto de rendimiento
- **Primera pantalla:**
  - HTML, CSS y JS: ≤ 120 KB comprimidos.
  - Imagen del conjunto: ≤ 400 KB en móvil y ≤ 600 KB en escritorio, en AVIF o WebP con JPG de respaldo.
  - Fuentes: 2 pesos en WOFF2, recortados a latín (≤ 60 KB en total).
  - **LCP ≤ 2,5 s en 4G, INP ≤ 200 ms y CLS ≈ 0.**
- **Por pantalla:** ≤ 2 s en 4G, que ya es el criterio de `PRODUCCION_IMAGENES.md`.
- **Orden de precarga:**
  1. Conjunto.
  2. Vídeo de Apolo.
  3. Render de Apolo y su máscara.
  4. Vista general de las plantas.

  Después, por intención (hover o preselección), y con poca red, nada.
- **Caché:**
  - Ficheros con huella en el nombre y `Cache-Control: max-age=31536000, immutable` por `.htaccess`.
  - El JSON de estado vivo, con `no-store` o `max-age` ≤ 30 s.
- **Planta:** pirámide de teselas WebP de 512 px (ya prevista). Visor de teselas propio ligero, u OpenSeadragon si se prefiere una biblioteca probada.
- **360:** Photo Sphere Viewer 5 con un adaptador de teselas. En móvil, caras de 1024–1536 como máximo (límite de textura), como ya fija `PRODUCCION_IMAGENES.md`.
- **Sin marcos pesados.** JavaScript sin framework (ARQUITECTURA D-1). three.js no está en la carga inicial: solo llega con el visor 360, que lo necesita (ARQUITECTURA §8.2).

---

## 6. Antipatrones que hacen que una web así parezca vieja

1. **Degradados, brillos, sombras paralelas y cristal esmerilado**, también en botones y etiquetas. El cliente lo descarta y además fecha la web al momento.
2. **Colores semáforo** (verde, ámbar y rojo) rellenando viviendas sobre el render. Se sustituyen por velo más texto.
3. **Intro que bloquea**: logo animado, música, «Entrar», porcentaje de carga inventado.
4. **Vídeos de transición largos que no se pueden saltar**, y vídeo cada vez que se vuelve atrás.
5. **Chinchetas tipo Google Maps**, iconos que botan y puntos 360 con halo luminoso.
6. **Visor 360 con la piel por defecto** (botonera gris grande, giro automático al entrar, «pequeño planeta», campo de visión de ojo de pez superior a 90°).
7. **Ventanas sobre ventanas**: galerías de luz con fondo negro al 90 % y miniaturas en carrusel.
8. **Carruseles que avanzan solos**, *parallax* y secuestro del desplazamiento.
9. **Información que solo aparece al pasar el ratón**: en el móvil no existe.
10. **Texto suelto sobre el render**, centrado y en párrafos largos, o en mayúsculas espaciadas en exceso.
11. **Capas que no casan con la imagen**: polígonos desplazados unos píxeles o contornos gruesos. Destruye la credibilidad; por eso la geometría sale del modelo.
12. **Imágenes borrosas en pantallas retina** o con artefactos de compresión; planos solo en PDF.
13. **URL que no cambia**: el «atrás» del navegador saca de la web y no se puede compartir nada.
14. **Botón de WhatsApp flotante, chat y aviso de cookies tapando el tercio inferior del móvil a la vez.**
15. **Bloquear el zoom del navegador** (`user-scalable=no`). Además de anticuado, incumple la accesibilidad.
16. **Iconos de estilos mezclados** y tipografías de sistema como respaldo visible. Si la licencia web de Neue Haas Grotesk no llega, el respaldo debe ser una grotesca cercana, elegida a propósito.

---

## 7. Notas legales y de accesibilidad (para revisar con el asesor jurídico)

- **Precio e IGIC.** El RD 515/1989 regula la información en la compraventa de viviendas.
  - Pide informar del **precio total**, que incluye los impuestos, y de la **forma de pago** (medios para las cantidades aplazadas y garantías).
  - La norma habla de IVA; en Canarias el impuesto equivalente es el IGIC.
  - El boceto muestra «147.000 € + IGIC». Propongo mantenerlo en la etiqueta y en la ficha y dar **siempre el total con IGIC en el plan de pagos**. Si el asesor lo pide, se da también en la ficha.
  - Texto consolidado: https://www.boe.es/eli/es/rd/1989/04/21/515/con
- **Imágenes no contractuales.** Es imprescindible, porque hay mobiliario y personas en las cenitales.
- **Aviso legal** (LSSI, art. 10): titular, NIF, domicilio, registro y contacto.
- **Privacidad** (RGPD): información básica junto a cada formulario y casilla de comunicaciones comerciales separada de la de privacidad.
- **Cookies.** Si solo hay almacenamiento técnico o pedido por el usuario (favoritos, idioma) y analítica sin cookies, no hace falta aviso de cookies. Si se instala analítica con cookies, el aviso debe ofrecer «Rechazar» al mismo nivel que «Aceptar».
- **Accesibilidad.** La Ley 11/2023 (Directiva europea de accesibilidad, en vigor desde el 28 de junio de 2025) obliga a ciertos servicios. Las fuentes no se ponen de acuerdo sobre si una web de promoción sin venta en línea entra en ella, ni sobre la versión exacta de WCAG. Recomendación práctica: **diseñar para WCAG 2.2 AA** desde el principio, porque cuesta poco hacerlo al empezar y mucho después.

---

## 8. Preguntas para el cliente

Las preguntas definitivas, numeradas y con la opción recomendada, están en la sección 7 de la propuesta al cliente («Decisiones que necesito»). Esta lista es la de partida.

1. **¿Se distingue «Reservada» de «Vendida»?** Con el mismo velo y una etiqueta distinta (recomendado), o con un velo más claro.
2. **Precio**: ¿«+ IGIC» o IGIC incluido? ¿Se enseña el precio de las reservadas y las vendidas? Propongo que no.
3. **Plan de pagos real**: importe o % de la reserva, % al firmar el contrato, número de cuotas y su periodicidad, % en la entrega y garantía de las cantidades entregadas a cuenta.
4. **Imagen de la columna izquierda de la ficha**: el render fijo de Apolo (boceto) o la miniatura de la situación de la vivienda en la planta (más útil). Se puede tener la segunda en móvil y la primera en escritorio.
5. **Edificios sin renders**: ¿se enseñan como «Próximamente» con «Avísame»?
6. **Contacto**: ¿a qué correo o CRM van los contactos? ¿Hay número de WhatsApp comercial? ¿Horario de respuesta?
7. **Idiomas**: ¿inglés en el lanzamiento? ¿Alemán o nórdicos más adelante?
8. **Transición entre edificios** por la chincheta: opción A (fundido directo de 600 ms) u opción B (pasar por el conjunto, unos 5 s).
9. **Color de las bolitas y de acento**: blanco y tinta, o un color de la marca (¿hay manual de identidad de Serenea?).
10. **Analítica**: ¿se acepta poner aviso de cookies o se prefiere analítica sin cookies?
11. **Tableta en la oficina**: ¿se usará el modo sala además del ejecutable de Unreal?
12. **Zonas comunes y ubicación**: ¿qué puntos de interés y distancias se quieren destacar?
13. **Nombre de las plantas**: el catálogo nuevo (`serenea.json`) dice «Planta 1 · 2 · 3 · Ático», pero `data/units.json` llama «Baja» al nivel 1. ¿Cómo se llama de cara al público el primer nivel de viviendas?

---

## 9. Fuentes

- Maverick Frame, selector de viviendas: https://maverickframe.com/es/servicios/selector-de-viviendas/ · guía de 2026: https://maverickframe.com/lead-magnets/roadmap/es/interactive-apartment-selector.pdf
- 3D Estate: https://3destate.pl/en · https://3destate.pl/en/3d-real-estate · https://3destate.pl/en/interactive-rendering · https://3destate.pl/en/case-study/chapter-london-bridge-case-study-en · https://www.3destate.pl/en/case-study/marketing-software · folleto: https://buildersshow.com/assets/docs/ibs/pressReleases/ExhibitorProductLit_44010_3DTwinpresentation.pdf
- Render Vision: https://render-vision.com/apartment-selector · https://render-vision.com/services/3d-apartment-viewer-services/
- Streamnow Object Finder: https://streamnow.ch/en/loesungen/real-estate-marketing/object-finder/ · https://streamnow.ch/en/loesungen/real-estate-marketing/
- Planpoint: https://www.getapp.co.uk/software/2104588/planpoint · https://www.softwareadvice.co.uk/software/558552/Planpoint · https://sourceforge.net/software/product/Planpoint-Viewer/
- Scene Engine: https://scene-engine-website.pages.dev/blog/interactive-master-plans-property-launches · https://scene-engine-website.pages.dev/blog/what-is-a-digital-sales-center
- VisEngine: https://visengine.com/interactive-masterplan-application/ · https://visengine.com/case-study-sobha-one-interactive-3d-master-plan-as-a-sales-transformation-tool/ · https://visengine.com/portfolio/interactive-map-deyaar/ · https://visengine.com/case-study-interactive-masterplan-uptown-dubai/
- Engrain SightMap: https://engrain.com/sightmap · https://www.prnewswire.com/news-releases/engrain-launches-pathfinding-for-sightmap-enabling-navigation-within-apartment-communities-302703294.html · https://www.yardi.com/news/press-releases/rentcafe-partners-with-engrain-on-interactive-maps/
- Spherexx Convert: https://www.spherexx.com/product/convert/multifamily/ · https://www.spherexx.com/pillars/
- The Digital Bunch: https://www.thedigitalbunch.com/case-studies/your-next-home-building-immersive-360-real-estate-platform-that-reduced-time-to-contract-by-31-and-increased-qualified-inquiries-by-49
- REALS / Simplex 3D: https://www.multifamilydive.com/press-release/20250708-the-end-of-buying-blind-how-reals-is-redefining-pre-construction-sales/
- Webflow: https://webflow.com/made-in-webflow/website/hoyt-jv · https://webflow.com/made-in-webflow/website/lofty-hradec · https://contra.com/p/E6qE6M6Q-interactive-webflow-website-for-a-luxury-residential-complex · GSAP gratuito: https://webflow.com/blog/gsap-becomes-free
- UMC Studios, Sharjah Sustainable City 2: https://umc-ssc2-casestudy.pages.dev/
- Utsubo, guía de 2026: https://www.utsubo.com/blog/real-estate-developer-website-guide
- Habitat Digital: https://theurbandeveloper.com/articles/habitat-digital-immersive-apartment-showroom-digital-sales
- FlatyFind: https://www.konii.de/?p=12258 · ArchiCGI: https://archicgi.com/interactive-real-estate-platform/
- Photo Sphere Viewer: https://photo-sphere-viewer.js.org/plugins/virtual-tour.html · https://photo-sphere-viewer.js.org/plugins/markers.html · https://photo-sphere-viewer.js.org/plugins/plan
- Transiciones: https://www.renderahouse.com/docs/en/video-transitions · https://www.structurestudios.com/help/video-mode · https://contra.com/community/ZnAmdgH5-cinematic-real-estate-web-experience-with
- Hojas inferiores (Nielsen Norman Group): https://www.nngroup.com/articles/bottom-sheet/
- Soleamiento: https://hunted.space/product/window-view · https://shadowmap.org/solutions/shadowmap-studio/real-estate
- Planes de pago en Dubái (portales): https://www.propertyfinder.ae/en/new-projects/lp/dubai
- RD 515/1989: https://www.boe.es/eli/es/rd/1989/04/21/515/con
- Ley 11/2023 (accesibilidad), resúmenes: https://www.fieldfisher.com/es-es/locations/espana/actualidad/accesibilidad-obligatoria-claves-de-la-transposicion-accesibility-act · https://lawwwing.com/eaa-que-es-y-como-afecta-a-tu-web/
