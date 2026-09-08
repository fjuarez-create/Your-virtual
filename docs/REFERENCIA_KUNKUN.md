# Referencia de diseño: la app de Kunkun Visual

Análisis del vídeo de referencia (39 s, 1920×1080, 25 fps) y especificación
funcional cerrada del digital twin de SERENEA a partir del dictado del 8 de
septiembre de 2026. Este documento fija *qué* se construye y *con qué aspecto*;
la elección del motor está en `docs/ESTUDIO_MOTOR_3D.md`.

## 1. Qué pasa en el vídeo, segundo a segundo

| Tramo | Qué se ve |
|---|---|
| 0–9 s | Vuelo orbital lento sobre un plan maestro completo (torres, centro comercial, ría, puentes, rotondas). La cámara gira sola alrededor de la torre protagonista, que lleva un marcador circular con el logo del promotor. Sobre otros edificios flotan iconos de puntos de interés (hospital, colegio, mezquita, comercio). |
| 9–12 s | El usuario abre el selector de momento del día (arriba a la derecha). Se despliega en vertical: **Daylight**, **Sunrise**, **Sunset** (y noche). Las etiquetas aparecen a la izquierda del icono, en mayúsculas espaciadas. |
| 12–16 s | Elige *Sunset*: la luz pasa a rasante y cálida, las sombras se alargan, las carreteras muestran estelas de tráfico (amarillas y azules). El cambio es un fundido de un par de segundos, no un corte. |
| 16–19 s | Pulsa el botón rombo (*enfocar edificio*). La cámara hace un viaje rápido con desenfoque de movimiento y frena suave al llegar. Aparece un rótulo grande abajo a la izquierda: **FLOOR LEVEL VIEWER — Browse the Apartment, level by level**, que se desvanece solo. |
| 19–23 s | Pulsa el botón de plantas apiladas. Junto a la barra se abre el panel **UNIT FLOOR LEVEL**: rejilla de 3 columnas con un botón redondo por planta (6, 7, 8 … 33; faltan 12, 13 y 14, típico de mercados asiáticos). |
| 23–27 s | Elige la planta 7. Giro cinematográfico con desenfoque radial; la torre queda **seccionada** justo por encima de esa planta. Lo de arriba desaparece del todo; lo de abajo se queda en penumbra para que la planta activa domine. |
| 27–39 s | Cambia entre plantas 7, 8, 9, 10 y 15. En cada una, las viviendas se ven como **volúmenes translúcidos** de colores (blanco-cian, morado, naranja: tres estados) con un icono flotante sobre cada una para entrar. Abajo a la derecha hay un icono de peatón (modo paseo en primera persona). El resto del edificio y del entorno sigue vivo y fotorrealista. |

## 2. Lenguaje visual que hay que reproducir

**Interfaz de cristal sobre el 3D a pantalla completa.** No hay cabecera ni
marcos: la escena ocupa todo y la interfaz es una lámina translúcida encima.

**Barra lateral izquierda (~100 px).** Franja oscura al 25–40 % de opacidad
con desenfoque de fondo (`backdrop-filter`), sin borde duro: se funde con la
imagen por el lado izquierdo. Esto es lo que da ese efecto "al ácido": el
color de la barra es el color de la escena que hay detrás, desenfocado y
saturado, de modo que cambia al mover la cámara. De arriba abajo:

1. Un botón pequeño con tres puntos (menú). **Queda en espera** hasta la fase
   de acceso; ahí irá el selector de edificio y el cierre de sesión.
2. El logotipo, en trazo fino blanco (el de UNIK que llegará con fondo
   transparente; hay una versión provisional en `assets/logo_unik.png`).
3. Un grupo de botones cuadrados de 44 px con esquinas redondeadas, borde
   fino blanco al 15 %, icono de línea blanco. El activo se invierte: fondo
   blanco, icono negro. Al pasar el ratón aparece la etiqueta a la derecha.
4. Al fondo, otro grupo (recentrar, ayuda, cerrar).

**Paneles flotantes.** Mismo cristal, esquinas de 16 px, título en mayúsculas
de 9–10 px con espaciado de 0,18 em y una línea fina debajo. Los botones de
planta son redondos, de 34 px, con el activo invertido a blanco.

**Selector de momento del día.** Arriba a la derecha: un botón principal y,
al abrirlo, tres o cuatro botones más pequeños que caen en vertical con su
etiqueta a la izquierda.

**Tipografía.** Una grotesca fina y ancha (Inter, Neue Haas o similar), casi
siempre en mayúsculas con mucho espaciado. Nunca hay texto grande salvo los
rótulos de transición.

**Movimiento.** Todo transita: la cámara nunca salta (viajes de 1–2 s con
aceleración y frenada suaves y desenfoque de movimiento en los tramos
rápidos), la luz cambia en fundido, los paneles se deslizan y desvanecen, los
volúmenes de vivienda se encienden en fundido. El vídeo mantiene un giro
orbital automático y lento cuando el usuario no toca nada.

**Realismo.** Iluminación global real (los patios y los soportales reciben luz
rebotada, no negro), sombras suaves de sol rasante, vegetación y agua con
volumen, coches, mobiliario urbano, estelas de tráfico, personas. Con todos
los indicios (desenfoque de movimiento radial, ghosting del antialiasing
temporal, iluminación indirecta dinámica al cambiar de hora) es una
aplicación hecha con **Unreal Engine 5** (Lumen + Nanite), no un visor web.

## 3. Correspondencia con los botones de SERENEA

| Vídeo | SERENEA (dictado) | Estado en `/new` |
|---|---|---|
| Tres puntos | Menú: selector de edificio y cerrar sesión. **Fase 2.** | Sin poner, a propósito |
| Logo | Logotipo UNIK (llega el definitivo) | Provisional |
| Mapa | **Conjunto**: vuelve al encuadre inicial del entorno completo | Existe |
| Rombo | **Edificio**: enfoca Apolo | Existe (mismo encuadre que Conjunto: falta el viaje propio) |
| Plantas apiladas | **Plantas**: abre el panel 1-2-3-4 y secciona | Existe el panel; el corte usa las plantas pre-divididas del BIM |
| (no está en el vídeo) | **Renders**: galería con visor grande y tiras | Existe, sin renders cargados aún |
| (no está en el vídeo) | **Vídeo**: reproductor propio, fichero en el servidor | Existe, sin vídeo aún |
| Diana (abajo) | **Recentrar** | Existe |
| Sol (arriba dcha.) | Amanecer · Mediodía · Atardecer · Noche | Existe |

## 4. Especificación funcional cerrada (fase 1)

**Navegación.** Órbita, zoom y desplazamiento libres, con ratón y táctil,
como en SketchUp. Giro automático lento cuando nadie toca; **cualquier toque o
arrastre lo interrumpe** y la animación nunca le quita el control al usuario.

**Conjunto.** Encuadre inicial: el entorno completo (círculo de 500 m de
diámetro, 250 m de radio, centrado en el eje del terreno) con los cinco
edificios que existan en ese momento.

**Edificio.** Viaje cinematográfico hasta Apolo, con desenfoque de movimiento
y frenada suave.

**Plantas.** Panel con las plantas 1, 2, 3 y 4. Al elegir una, giro
cinematográfico y **corte de sección** a la altura de esa planta. Como los
forjados de una misma planta están a cotas distintas en cada tramo, el corte
se hace **por tramo**: cada tramo tiene su propia altura de corte. Lo que
queda por encima desaparece; lo de abajo se atenúa.

**Viviendas.** En la planta seccionada, cada vivienda se ve como un volumen
translúcido. Disponible: se puede pasar el ratón (resalta) y pulsar.
**Vendida: no reacciona ni al ratón ni al clic**. Al pulsar una disponible,
la cámara la enfoca y la deja lo más grande posible en el centro; se puede
orbitar sobre ella. Un botón discreto **vuelve a su planta** sin pasar por el
conjunto.

**Luces en las ventanas.** En todos los momentos del día, y sobre todo de
atardecer y de noche, las viviendas **disponibles tienen la luz encendida**
y las **vendidas apagada**, visibles desde el exterior. Para ello cada
vivienda tiene que traer su propio vidrio identificado (ver §5). Estado de
demostración de fase 1: **70 % disponible, 30 % vendida**.

**Momento del día.** Cuatro estados con fundido: amanecer, mediodía,
atardecer, noche. Cambia la posición y el color del sol, el cielo, la niebla,
las luces urbanas y las ventanas.

**Renders.** Galería a pantalla completa con imagen grande y tiras. Se
alimenta de `assets/renders/` y de un `data/renders.json` (título, fichero,
orden). Un gestor de renders (subir, ordenar, borrar) llega con el backend de
la fase 2; hasta entonces se gestiona por FTP.

**Vídeo.** Reproductor propio con el `.mp4` alojado en el servidor
(`assets/video/promocion.mp4`), sin YouTube ni servicios externos. Mientras
no exista, un vídeo de muestra.

**Sin acceso ni gestión** en esta fase: todas las funciones de login,
selector de edificio, altas de edificios y cambio de disponibilidad quedan
para la fase 2, pero la estructura de datos ya las contempla.

## 5. Reglas de modelado en SketchUp (para que el sistema no adivine nada)

**Un origen para todo.** El modelo del entorno y el de cada edificio
comparten ejes: mismo origen, X e Y iguales, Z la cota real. Un edificio
bien colocado en su `.skp` cae solo en su sitio en el visor, sin mover nada.
El visor comprueba al cargar que el origen coincide y avisa si no.

**Cinco cajitas.** El sistema tiene cinco *slots* (Apolo, Hera, Atenea, Zeus,
Hermes). Un slot vacío no existe en pantalla; se llena volcando el fichero
exportado del `.skp`. Volver a exportar sustituye al anterior.

**Planos de corte con nombre.** En cada edificio, un grupo por planta y
tramo con una cara horizontal a la altura de corte, nombrado
`CORTE_P1_01`, `CORTE_P1_02`, … `CORTE_P4_03`. El visor lee de cada uno su
altura y su huella, y solo enseña lo que queda por debajo en esa huella. En
Apolo los cortes ya se conocen (se heredan de `data/levels.json`); en los
siguientes edificios bastará con dibujar estas caras. Los *section planes*
nativos de SketchUp no viajan en la exportación: tiene que ser geometría.

**Una vivienda, un grupo.** Cada vivienda va en un grupo o componente
llamado con su código (`VIV_101` … `VIV_436`), que contiene al menos su
vidrio (`VID_…`) y su volumen de suelo a techo. Con eso el visor enciende o
apaga la luz de esa vivienda, la hace seleccionable o inerte y sabe dónde
enfocar.

**Materiales con nombre.** `VID_` vidrio, `MURO_`, `FORJ_`, `CUB_`, `MOB_`
mobiliario (excluido del corte), `JAR_` jardinería, `URB_` urbanización. Los
detalles están en `docs/ENTREGA_BIM.md`, que sigue vigente.

**Lo que no debe venir.** Cotas, textos, escenas, capas ocultas, componentes
de coches y personas de SketchUp (los pone el visor con sus propias
bibliotecas, que son mucho más ligeras y realistas).

## 6. Funciones que propongo añadir (no estaban en el dictado)

- **Puntos de interés en el entorno**, como los iconos flotantes del vídeo:
  playa, colegio, centro de salud, comercio, autopista. Baratos y muy
  vendedores.
- **Ficha de vivienda** al enfocarla: tipología, dormitorios, superficies,
  precio, plano y PDF (ya existe en la versión anterior; se rediseña en
  cristal).
- **Modo reposo**: si nadie toca la pantalla en dos minutos, vuelve al
  conjunto y gira solo. Es lo que se ve desde la calle en una comercializadora.
- **Enviar al cliente**: botón que manda la ficha de la vivienda por correo o
  WhatsApp (sin backend: `mailto:`/enlace). Útil en la mesa de ventas.
- **Idioma** español/inglés/alemán: buena parte de los compradores en Canarias
  no es hispanohablante.
- **Modo paseo** en primera persona (el peatón del vídeo). Segunda fase: exige
  interiores modelados.
- **Captura de pantalla** con un clic para adjuntar a un correo.

## 7. Lo que hace falta de tu parte para arrancar la fase 1

1. Logotipo UNIK en PNG o SVG con fondo transparente.
2. El `.skp` del entorno (500 m) y el de Apolo, con las reglas del §5, o al
   menos exportados a glTF/GLB desde SketchUp (menú Archivo → Exportar → 3D).
3. Los renders actuales de la promoción (JPG, 2500 px de ancho es suficiente).
4. Confirmación del reparto 70/30 de demostración, o la lista real de
   vendidas si prefieres verla ya.
