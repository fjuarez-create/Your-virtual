# Estudio del motor 3D para el digital twin de SERENEA

Fecha: 9 de septiembre de 2026. Alcance: qué motor, plataforma o combinación
da el nivel de realismo de la app de Kunkun Visual y de los renders de D5,
con cortes de sección en un edificio escalonado, sin cuotas mensuales,
publicado en `showroom.unikdi.com/new` y mantenido re-exportando desde
SketchUp. El análisis del vídeo y la especificación funcional están en
`docs/REFERENCIA_KUNKUN.md`.

## 1. Resumen en diez líneas

1. **No existe un SaaS ni un producto de catálogo** que dé el realismo de
   Kunkun con cortes por tramo, sin cuota y alojado en tu Plesk. Todo lo que
   se parece a la referencia es Unreal Engine 5 hecho a medida y servido por
   streaming de pago, o software de escritorio que no se publica como web.
2. **La app de Kunkun (KLAY)** está hecha, según su propia web, con Unreal
   Engine 5 y pixel streaming de Arcware (servicio en la nube cobrado por
   minuto). Se vende como proyecto y servicio gestionado, no como software.
3. **Recomendación:** seguir con el **visor web propio en Three.js** que ya
   está en `/new`, subiéndole el realismo (luz horneada por momento del día,
   cielos HDRI, sombras del sol, oclusión, bloom, refinado por trazado de
   rayos cuando la cámara se detiene, personas y coches de bibliotecas libres)
   y resolviendo el corte escalonado con un plano de corte por tramo. Cumple
   las cuatro restricciones y lo construyo, pruebo y despliego yo de principio
   a fin.
4. **Complemento sin coste:** en la pantalla de la oficina, **D5 Render 3.1**
   (que ya pagáis) trae desde julio "Interactive Presentation" y "Pixel
   Streaming" en red local: la escena real de D5, con su realismo, navegable
   en un navegador de la oficina. Es el "modo cine" con calidad Kunkun.
5. **Alternativa** si algún día queréis exactamente la app de Kunkun: Unreal
   Engine 5 como aplicación en el PC de la oficina con pixel streaming
   autoalojado (gratis, licencia MIT) en la red local. Exige un desarrollador
   o estudio con Unreal, y 1.850 USD por puesto y año si alguien de UNIK abre
   el editor. Yo no puedo compilar ni probar Unreal desde aquí.
6. **D5 no puede alimentar el visor** con geometría: no exporta mallas en
   ningún formato. Sí aporta renders, vídeo, panorámicas y, desde D5 3.0, una
   nube de puntos tipo "Gaussian splat" (.ply) que se puede probar como
   entorno fotorrealista dentro del visor web. Los modelos de SketchUp
   exportados a GLB tienen que estar en el servidor.
7. **Pipeline:** SketchUp Pro exporta GLB de forma nativa (2024+). Un script
   comprueba el origen, lee los planos de corte con nombre, divide por tramo,
   comprime y sube por FTP. Re-exportar y volcar, como pedías.
8. **Coste de la vía recomendada:** 0 € en licencias. Solo hace falta que el
   PC de la oficina tenga una GPU NVIDIA decente (la misma que ya usa D5).
9. **Esfuerzo:** visor funcional completo en 3 a 5 semanas de sesiones;
   realismo en 2 a 3 semanas más; modo cine D5 lo montáis vosotros en un día
   con la receta que os doy.
10. **Advertencia honesta:** un visor web llega a un 4 sobre 5 de realismo,
    no al 5 de Unreal en movimiento. El 5 lo da D5 en la pantalla de la
    oficina. Las dos cosas juntas cubren el vídeo de Kunkun.

## 2. Respuestas a tus tres preguntas

**a) ¿Puede el sistema alimentarse de lo que crea D5 Render, o hace falta
tener los modelos de SketchUp en el servidor?**

Hacen falta los modelos de SketchUp (exportados a GLB) en el servidor. D5
Render, también en las versiones 3.0 (enero de 2026) y 3.1 (15 de julio de
2026), no exporta mallas ni escenas en ningún formato: ni glTF, ni FBX, ni
OBJ. Las peticiones llevan años abiertas en su foro oficial. Su proyecto
`.drs` solo lo abre D5 y sus personas, coches y vegetación son ficheros
cifrados con licencia de uso dentro de D5. D5 consume SketchUp por LiveSync;
el camino inverso no existe.

Lo que sí sale de D5 y sí aprovechamos:

- Renders JPG y vídeo MP4: alimentan la galería y el reproductor, alojados
  en tu Plesk.
- Panorámicas 360 equirectangulares: se pueden mostrar dentro del visor
  propio con un visor JavaScript libre.
- **D5 3.1 Interactive Presentation + Pixel Streaming (red local):** la
  escena viva de D5 en un navegador de la oficina, con diapositivas por
  planta, disparadores 3D (pulsar un objeto cambia visibilidad, materiales,
  luz, clima o cámara) y momento del día. Ver §8.
- **XR Tour (D5 3.0, plan Pro):** convierte la escena en un "Gaussian
  splat", una nube de millones de puntos con color y transparencia que
  reproduce una foto 3D del render. El manual dice que el `.ply` se puede
  descargar. Cargado en Three.js con la librería Spark, daría un entorno de
  500 m fotorrealista "congelado" alrededor del edificio en malla. Es
  experimental: una iluminación por splat, sin cortes ni ventanas
  conmutables, peso alto y procesado en la nube de D5 con créditos.

**b) ¿Qué motor da el mejor realismo con cortes de sección en edificio
escalonado y sin cuota?**

Con las cuatro restricciones a la vez, el visor web propio en Three.js. Es la
única opción con corte por tramo verificado en el código del motor, coste
cero, publicación estática en Plesk y mantenimiento por re-exportación. Si se
relaja la restricción "web en Plesk" y se acepta una aplicación en el PC de la
oficina, el máximo realismo es Unreal Engine 5 (o D5 3.1 con su Pixel
Streaming local, que además ya lo tenéis).

**c) ¿Cuál es el pipeline SketchUp → visor más sencillo de mantener?**

SketchUp Pro → Archivo → Exportar → Modelo 3D → GLB → script en el PC de la
oficina → FTP. Detalle en §7. Los planos de sección nativos de SketchUp no
viajan en el GLB (el formato glTF no tiene ninguna extensión de sección), por
eso los cortes van como caras con nombre `CORTE_P1_01`.

## 3. Qué es la app de Kunkun por dentro

La página de producto de Kunkun Interactive describe KLAY como "plataforma
inmobiliaria interactiva basada en navegador construida sobre Unreal Engine
5 y tecnología Pixel Streaming de Arcware", instalada en galerías de venta.
Traducido:

- El 3D no corre en el navegador: corre en un servidor con GPU en la nube de
  Arcware, que envía vídeo al navegador y recibe el ratón. Arcware cobra una
  cuota mensual más minutos de streaming (plan Lite 10 €/mes + 0,15 €/min;
  Core 89 €/mes, datos de 2026 según comparativas; su web no se pudo abrir).
- El modelado, la escena de Unreal y la app los hace el estudio. No hay
  "subir mi SketchUp y que se actualice".
- Todo lo que hace que el vídeo se vea así (iluminación global Lumen,
  desenfoque de movimiento, vegetación y personas de Quixel) es de Unreal.

Ese mismo resultado se puede tener **sin Arcware**: Unreal en un PC con GPU
en la oficina y el pixel streaming autoalojado de Epic (repositorio
EpicGamesExt/PixelStreamingInfrastructure, licencia MIT, servidor de
señalización en Node que corre en el mismo PC). Lo que no se puede es
publicarlo en un Plesk compartido: hace falta la GPU encendida donde corra la
app.

## 4. Matriz de opciones

Puntuación 1 a 5 en seis criterios. Total sobre 30. R realismo · C cortes por
tramo · S pipeline desde SketchUp · € sin cuota · H encaje con Plesk o PC de
oficina · M mantenimiento por re-exportación.

| Opción | R | C | S | € | H | M | Total | Veredicto |
|---|---|---|---|---|---|---|---|---|
| Three.js ampliado (visor actual en `/new`) | 4 | 5 | 5 | 5 | 5 | 4 | 28 | **Recomendada** para la web |
| Three.js + D5 3.1 modo cine en la oficina | 5 | 5 | 5 | 4 | 5 | 4 | 28 | **Recomendada** como paquete |
| Babylon.js 9 | 4 | 4 | 5 | 5 | 5 | 3 | 26 | Válida, pero obliga a reescribir sin ganar realismo |
| Three.js + splat XR Tour de D5 (Spark) | 5 | 5 | 3 | 4 | 5 | 3 | 25 | Fase experimental |
| D5 3.1 Interactive Presentation + Pixel Streaming LAN, solo | 5 | 3 | 5 | 3 | 2 | 3 | 21 | Complemento, no es web ni tiene datos |
| UE5 + Pixel Streaming autoalojado en LAN + Datasmith Runtime | 5 | 5 | 3 | 2 | 3 | 2 | 20 | **Alternativa** si se acepta app local y perfil Unreal |
| UE5 en Arcware / Vagon / Eagle (nube) | 5 | 5 | 3 | 1 | 4 | 2 | 20 | Descartada: cuota mensual y por minuto |
| PlayCanvas | 4 | 2 | 4 | 3 | 4 | 3 | 20 | Sin planos de corte; editor privado de pago |
| Trimble Connect (visor de SketchUp) | 2 | 3 | 5 | 4 | 1 | 5 | 20 | Visor técnico en nube de Trimble, sin realismo |
| 3DVista Virtual Tour PRO (499 € pago único) | 3 | 2 | 3 | 5 | 5 | 2 | 20 | Visor de producto, sin cielo ni hora del día |
| UE5 aplicación local (.exe) | 5 | 5 | 3 | 2 | 2 | 2 | 19 | Igual que la alternativa, sin navegador ni tablet |
| Twinmotion Presenter (ejecutable) | 4 | 2 | 5 | 3 | 2 | 3 | 19 | Buen demostrador, sin lógica programable |
| Shapespark (licencia perpetua) | 3 | 2 | 4 | 3 | 4 | 3 | 19 | Sin planos de corte ni hora del día; precio de la perpetua no leído |
| That Open / xeokit (visores BIM) | 2 | 4 | 2 | 4 | 5 | 2 | 19 | Estética de CAD; pipeline IFC más frágil |
| Godot 4 web | 2 | 2 | 3 | 5 | 5 | 2 | 19 | Techo visual más bajo de la familia web |
| Needle Engine | 4 | 3 | 2 | 1 | 5 | 2 | 17 | Uso comercial exige suscripción |
| Unity 6 Web | 4 | 3 | 2 | 2 | 4 | 2 | 17 | Cada cambio exige abrir Unity y recompilar |
| D5 Spatial/XR Tour publicado en D5 Cloud | 4 | 1 | 4 | 3 | 2 | 2 | 16 | Foto 3D congelada en la nube de D5 |
| Encargo a estudio (KLAY, Chameleon, Viseni…) | 5 | 4 | 1 | 2 | 2 | 1 | 15 | Se compra el aspecto; cada cambio pasa por el estudio |
| Enscape Web / EXE Standalone | 3 | 1 | 5 | 1 | 1 | 3 | 14 | Suscripción obligatoria; visor en la nube de Chaos |
| SaaS inmobiliarios (Urbania 3D, Vinode, Web3D, Habiteo, Flatfinder) | 3 | 1 | 1 | 1 | 1 | 3 | 10 | Cuota anual, nube ajena, casi todos pre-renderizados |

## 5. Las familias, una a una

**Motores web (Three.js, Babylon.js, PlayCanvas, Needle, Unity Web, Godot).**
Three.js y Babylon.js están al mismo nivel en 2026 y ambos son gratuitos. La
diferencia práctica es que el visor ya existe en Three.js, que su versión
r186 (8 de septiembre de 2026) trae planos de corte por material, tapas de
sección por stencil con ejemplo oficial, sombras en cascada, oclusión,
reflejos, bloom, profundidad de campo y desenfoque de movimiento, y que tiene
un trazador de rayos progresivo (three-gpu-pathtracer, MIT) para refinar la
imagen cuando la cámara se para. Babylon limita a 6 planos de corte y no trae
tapas. PlayCanvas y Unity necesitan su editor (de pago para proyectos
privados o por encima de un umbral de ingresos). Needle exige licencia para
uso comercial. Godot en web no tiene reflejos ni oclusión.

**Unreal Engine 5 y Twinmotion.** Es la tecnología del vídeo. Licencia:
gratis para empresas que facturan menos de 1 M USD al año; 1.850 USD por
puesto y año por encima, para usos no-juego como el vuestro. Ejecutar la app
empaquetada no consume puesto. Importa SketchUp con Datasmith (plugin gratuito,
SketchUp Pro 2019 a 2026) conservando jerarquía y nombres. No tiene "plano de
sección" de serie: se programa (material que descarta píxeles por encima de
una cota, una cota por tramo) o se ocultan actores por tramo. Datasmith
Runtime (plugin oficial, todavía marcado beta) permite que la app cargue un
`.udatasmith` nuevo sin recompilar: es lo que haría posibles vuestros cinco
slots. Twinmotion (gratis por debajo de 1 M USD, 445 USD por puesto y año por
encima) da un ejecutable "Presenter" con cubos de sección y hora del día,
pero no permite programar la lógica de viviendas.

**Renderizadores archviz (D5, Enscape, Lumion, Chaos Vantage).** Todos son
escritorio. Enscape exporta un "Web Standalone" que vive en la nube de Chaos
y exige suscripción (unos 575 USD/año). Lumion y Vantage no tienen salida
interactiva utilizable. D5 es el único con una vía interactiva local sin
coste añadido (3.1, ver §8).

**SaaS y estudios inmobiliarios.** Se localizaron unos veinte (KLAY, Urbania
3D, Vinode, Web3D, SmartPixel, LiveSite, DisplaySweet, Habiteo, Flatfinder,
Snaploader, Viseni…). Todos cobran por proyecto más renovación anual o
suscripción, alojan en su nube, y la mayoría enseña plantas como imágenes
pre-renderizadas, no como 3D navegable. Ninguno acepta "sube tu SketchUp y
se actualiza".

**Visores BIM (That Open, xeokit, Autodesk APS, Speckle, Trimble Connect,
Bentley).** Tienen planos de sección y aislamiento por planta, pero su
aspecto es de CAD (2 sobre 5), casi todos cortan de forma global (no por
tramo), y xeokit es AGPL (obliga a publicar el código o pagar licencia).
Sirven para comprobar un modelo, no para vender.

**Shapespark y 3DVista.** Los dos productos de catálogo más cercanos a
"exportar y subir por FTP". Shapespark hornea la luz y tiene licencia
perpetua con hosting propio, pero no tiene planos de corte, la hora del día
son escenas separadas y no hay control de luces por vivienda. 3DVista (499 €
pago único) es un visor de tours con modelos GLB, sin cielo ni corte.

## 6. Cómo se resuelven los cortes escalonados

El problema: en Apolo, la "planta 2" tiene el forjado a cuatro cotas
distintas (una por tramo), y los tramos se escalonan también en sentido
transversal. Un único plano horizontal corta bien un tramo y mal los otros
tres.

La solución en el visor web, verificada en el código de Three.js r186:

1. Cada tramo del edificio lleva sus mallas con **su propio plano de corte**
   (`Material.clippingPlanes`, con `localClippingEnabled`). Cuatro tramos,
   cuatro alturas a la vez. No hay límite de planos.
2. La altura y la huella de cada plano se leen del propio modelo: las caras
   `CORTE_P2_01` … `CORTE_P2_04` que dibujáis en SketchUp a 1,10 a 1,50 m
   sobre cada forjado. Nada que configurar a mano en el visor.
3. Las **tapas de corte** (el relleno que hace que el muro cortado se vea
   macizo y no hueco) se dibujan con la técnica de stencil del ejemplo
   oficial `webgl_clipping_stencil`. Se fija la versión de Three.js para que
   una actualización no las rompa.
4. Lo que queda **por encima** del plano desaparece del todo; lo de abajo se
   atenúa (menos luz de entorno y color), como ya hace la versión actual.
5. La cámara hace el **giro cinematográfico** mientras el plano baja desde la
   cubierta hasta su cota, con desenfoque de movimiento en el tramo rápido.
6. El mobiliario (`MOB_`) queda **excluido** del corte y se dibuja entero.

Para los otros cuatro edificios, que serán más sencillos (dos o tres niveles
en el mismo sentido), basta con dibujar las mismas caras `CORTE_`.

En D5 (modo cine) el corte se hace ocultando el grupo de cada tramo superior
con un disparador, que respeta el escalonamiento sin planos. En Unreal se
programaría igual que en Three.js (material con cota por tramo).

## 7. Pipeline SketchUp → visor

1. **Convención de modelado** (una vez, ya escrita en
   `docs/REFERENCIA_KUNKUN.md` §5): origen común, un grupo por planta y
   tramo, caras `CORTE_Pn_mm`, un grupo `VIV_101` por vivienda con su vidrio
   `VID_`, materiales con prefijo, sin tags ocultos (el exportador los omite
   sin avisar), sin coches ni personas de SketchUp.
2. **Exportar:** Archivo → Exportar → Modelo 3D → "GLTF Binary File (*.glb)".
   SketchUp Pro 2024 en adelante lo trae de serie, con "conservar origen del
   dibujo" activado y materiales PBR. El exportador no tiene opciones, así
   que **hay que hacer una exportación de prueba** de Apolo para confirmar
   que los nombres de grupos llegan como nodos y las texturas viajan. Si no,
   el plan B es exportar Collada (DAE, conserva jerarquía) y convertir en
   Blender.
3. **Procesar** en el PC de la oficina con un script Node (`tools/`): comprueba
   el origen (marcadores `ORIGEN` y `NORTE`) y aborta con mensaje si no
   coincide; lee las caras `CORTE_` y escribe `cortes.json`; separa por planta
   y tramo; genera las tapas; instancia el mobiliario repetido; comprime con
   meshopt y texturas KTX2 (objetivo: menos de 5 MB por planta). Es la
   evolución del `tools/build_levels.js` que ya existe.
4. **Subir por FTP** a `assets/<edificio>/` y dar de alta el slot en el
   catálogo. Re-exportar es repetir 2 a 4: minutos.
5. **Opcional, para el realismo (Apolo y entorno):** abrir el `.skp` en
   Blender con el importador libre de RedHalo, hornear la luz indirecta por
   momento del día con Cycles (gratis) y exportar el GLB con los mapas de luz.
   Este paso hay que repetirlo si cambia la geometría (de minutos a pocas
   horas de GPU), y es lo que separa el 3 del 4 sobre 5.

Coste de licencias: 0 €. SketchUp Pro ya lo pagáis.

## 8. Modo cine con D5 3.1 en la oficina

D5 Render 3.1 (15 de julio de 2026) añade dos cosas que encajan con la
comercializadora:

- **Interactive Presentation:** diapositivas con acceso a la escena viva.
  Cada diapositiva guarda cámara, momento del día, clima, materiales y
  visibilidad. Los **disparadores 3D** permiten pulsar un objeto o un hotspot
  para cambiar visibilidad, materiales, luz o cámara. Con los grupos por
  planta y tramo de SketchUp, una diapositiva por planta oculta los tramos
  superiores; cuatro diapositivas cambian el momento del día; un disparador
  de material enciende o apaga el vidrio de una vivienda; los hotspots se
  ponen solo en las disponibles.
- **Pixel Streaming:** el PC con D5 emite la presentación en vivo a un
  navegador de la misma red local. Genera un enlace de editor (con control)
  y otro de solo visualización; caducan al parar la emisión.

Lo que da: el realismo de vuestros renders, en movimiento, en la pantalla o
tablet de la oficina, con la licencia que ya pagáis. Lo que no da: no es web
pública, no hay login, no lee la disponibilidad de ningún dato (cada cambio
se edita en D5), y exige D5 abierto en el PC. La presentación interactiva no se exporta fuera de D5: la petición sigue
abierta desde julio de 2026. Por eso es complemento y no núcleo.

Queda por confirmar en vuestro D5: si el streaming exige plan Pro (lo tenéis)
y cuántos espectadores admite.

## 9. La alternativa Unreal, para dejarla clara

Tendría sentido si queréis exactamente el vídeo de Kunkun en la oficina y
estáis dispuestos a: (1) contratar un perfil o estudio con Unreal, porque no
puedo compilar ni probar Unreal desde este entorno; (2) asumir 1.850 USD por
puesto y año si alguien de UNIK abre el editor (0 € si el estudio que lo
hace factura menos de 1 M USD y vosotros solo ejecutáis la app); (3) aceptar
que la web en Plesk seguiría siendo el visor Three.js, porque Unreal no se
publica como web sin GPU. Orden de magnitud de mercado para un encargo así:
10.000 a 30.000 USD (cifras de guías de 2026, no confirmadas con presupuestos).

Si se hiciera, la arquitectura correcta es: app empaquetada en el PC de la
oficina, pixel streaming autoalojado (MIT) para verla en navegador o tablet
en la red local, Datasmith Runtime para cargar los `.udatasmith` de los cinco
slots sin recompilar, y disponibilidad leída de un JSON en vuestro Plesk.

## 10. Plan por fases

| Fase | Qué | Quién | Duración | Coste |
|---|---|---|---|---|
| 0 · Pruebas | Exportación GLB de prueba de Apolo; convención de nombres; logo; renders; confirmar 70/30; comprobar la GPU del PC de la oficina | UNIK + yo | 1 semana | 0 € (PC nuevo si hace falta: 1.500 a 3.500 €) |
| 1 · Visor funcional | Todo lo del dictado: conjunto, edificio, plantas con corte por tramo y giro, viviendas 70/30 con luces, clic y órbita, volver a la planta, 4 momentos, renders, vídeo, 5 slots, modo reposo, despliegue por FTP | Yo | 3 a 5 semanas | 0 € |
| 2 · Realismo web | Luz horneada por momento del día, HDRI, sombras del sol, oclusión, bloom, refinado por trazado de rayos al parar, personas y coches libres, puntos de interés | Yo (+ Blender en vuestro PC) | 2 a 3 semanas | 0 € |
| 3 · Modo cine | Presentación interactiva en D5 3.1 y streaming local en la pantalla de la oficina, con receta paso a paso | UNIK con mi guía | 1 a 2 días | 0 € (D5 Pro ya pagado) |
| 4 · Gestión | Login, panel de disponibilidad (PHP + JSON en Plesk), selector de edificio, gestor de renders | Yo | 2 a 3 semanas | 0 € |
| 5 · Experimental | Splat XR Tour de D5 como entorno fotorrealista con Spark | Yo | 1 semana | créditos de D5 Cloud |

## 11. Riesgos

- El exportador GLB de SketchUp no tiene opciones y no está confirmado con
  una exportación real que conserve nombres de grupo y texturas. Se prueba en
  la fase 0; plan B por Collada y Blender.
- El techo web es 4 sobre 5. Si comparáis la web con D5 en movimiento, la
  web pierde. El modo cine cubre ese hueco en la oficina.
- Cada cambio de geometría obliga a rehornear la luz para mantener el 4. Sin
  rehornear, el edificio queda en 3. Se automatiza con un script de Blender.
- Las tapas de sección por stencil se rompen a veces al actualizar Three.js.
  Se fija la versión y se prueba con capturas automáticas de cada planta.
- Personas y vegetación: Quixel Megascans es gratis solo dentro de Unreal;
  para web hay que usar bibliotecas CC0 (Poly Haven, Kenney) o comprar por
  asset (0,99 a 24,99 USD en Fab, pago único).
- El entorno de 500 m más 166 viviendas con luz horneada puede pesar decenas
  de MB. Se resuelve con compresión, instancias y carga por slot, y se prueba
  en el PC real, no solo aquí.
- D5 Pixel Streaming: solo en red local, enlaces que caducan, D5 abierto.
  Si D5 cambia condiciones, se pierde el complemento, no el sistema.

## 12. Lo que debes comprobar tú en la web oficial

El proxy de este entorno bloqueó casi todos los dominios de fabricantes, así
que estas cifras vienen de extractos de buscador, GitHub y npm, no de las
páginas abiertas. Antes de basar una compra en ellas:

- SketchUp: help.sketchup.com, "Working with GLTF files", y una exportación
  real de Apolo.
- D5: docs.d5render.com y d5render.com/posts/d5-3-1-design-presentation. Si
  Pixel Streaming exige Pro o Teams, número de espectadores, y si el `.ply`
  del XR Tour se descarga sin marca y con licencia para alojarlo fuera.
- Precios D5 2026: Pro 38 USD/mes o 360 USD/año; Teams 75 USD/puesto/mes.
- Unreal: unrealengine.com/license, 1.850 USD por puesto y año y umbral de
  1 M USD por grupo empresarial. Twinmotion: twinmotion.com/license, 445 USD
  por puesto y año (dato de 2024, citado como vigente en 2026).
- Arcware: arcware.com/pricing (10 €/mes + 0,15 €/min o 89 €/mes), solo si
  algún día queréis acceso remoto público.
- Shapespark: shapespark.com/pricing-perpetual, importe de la perpetua.
- Hardware: si el PC que ejecuta D5 puede estar en la oficina, no hace falta
  otro. Si no, un PC con GPU NVIDIA con codificador NVENC (2.469 a 3.500 € un
  equipo con RTX 5080 en septiembre de 2026).

## 13. Método y limitaciones

Ocho barridos en paralelo (SaaS inmobiliario, Unreal, renderizadores, motores
web, visores BIM, pipeline SketchUp, iluminación por momentos del día,
estudios y mercado), unas 60 opciones documentadas y 31 afirmaciones clave
sometidas a un verificador que intentó refutarlas con fuentes primarias y con
el encaje real del proyecto. Después, dos informes de decisión con enfoques
distintos (realismo primero; coste cero primero) y contraste con datos que
comprobé directamente (D5 3.1, exportación GLB de SketchUp, licencia de
Unreal, precios de Twinmotion, Spark, three-gpu-pathtracer).

Limitación principal: la red de este entorno bloquea los dominios de casi
todos los fabricantes; las fuentes abiertas de verdad fueron GitHub, npm y
espejos de documentación. Por eso la sección 12 existe.

## 14. Fuentes principales

- Kunkun Interactive, KLAY: kunkuninteractive.com/digitaltwin ·
  kunkunvisual.com/realestatedigitaltwin
- D5 3.1: d5render.com/posts/d5-3-1-design-presentation ·
  d5render.com/posts/interactive-3d-presentation-d5-step-by-step ·
  architosh.com/2026/07/d5-render-3-1-the-future-of-architectural-design-reviews
- D5 XR Tour y exportación: docs.d5render.com/user-guide/d5-virtual-tour/xr-tour ·
  forum.d5render.com/t/glb-and-gltf-export-support/29472 ·
  forum.d5render.com/t/export-model-from-d5-to-fbx/8407
- SketchUp GLB: help.sketchup.com/en/sketchup/working-gltf-files ·
  github.com/SketchUp/ruby-api-stubs (Model#export, exporter_options.md)
- Three.js: threejs.org/examples/webgl_clipping_stencil.html ·
  threejs.org/docs/#api/en/materials/Material.clippingPlanes ·
  github.com/gkjohnson/three-gpu-pathtracer
- Spark (splats en Three.js): sparkjs.dev · github.com/sparkjsdev/spark
- Unreal: unrealengine.com/license · unrealengine.com/eula/unreal ·
  github.com/EpicGamesExt/PixelStreamingInfrastructure ·
  dev.epicgames.com/documentation/unreal-engine/datasmith-runtime
- Twinmotion: twinmotion.com/license · visualizee.ai/blog/twinmotion-pricing
- Shapespark: shapespark.com/pricing-perpetual ·
  help.shapespark.com (Can I host scenes on my own server)
- Arcware: arcware.com/pricing · vagon.io/blog/best-pixel-streaming-platforms
- That Open, xeokit, Speckle: github.com/ThatOpen/engine_components ·
  github.com/xeokit/xeokit-sdk · github.com/specklesystems/speckle-server
- Blender desde SketchUp: github.com/RedHaloStudio/Sketchup_Importer ·
  github.com/Naxela/The_Lightmapper
