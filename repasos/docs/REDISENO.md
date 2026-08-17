# Rediseño 2026 — decisiones cerradas

Lo que se decidió al revisar el diseño de Figma (`UNIK repasos`, archivo
`VlGqIJA4ZR7e8vmvELKPsB`) contra lo que había construido. Esto no es el
diseño: es la lista de reglas que el diseño no dice o que cambian
respecto a lo que funciona hoy, con quién decidió qué.

Se escribe aquí porque son las decisiones de las que cuelga el resto, y
porque discutirlas dos veces sale caro.

---

## Estados de una tarea

**Cuatro**, no tres. En pantalla se llaman como en el diseño; por dentro
se conservan los identificadores que ya hay escritos en las tareas de
producción.

| En pantalla | Identificador | Quién lo pone |
| --- | --- | --- |
| PENDIENTE | `pendiente` | quien abre el acta |
| COMPLETADA | `resuelta` | el completador |
| RECHAZADA | `rechazada` *(nuevo)* | el verificador |
| VERIFICADA | `verificada` | el verificador |

**El identificador de COMPLETADA sigue siendo `resuelta`.** No es
descuido: renombrarlo obliga a migrar la base, la API y todos los
móviles a la vez, y un teléfono con la versión vieja en caché empezaría
a mandar un estado que el servidor ya no reconoce. La app ya separa el
id del nombre de pantalla a propósito. Decisión de Fran: «cómo lo pongas
en la base de datos me importa tres pimientos».

Para los porcentajes, **todo lo que no sea `verificada` cuenta como
pendiente**. Una vivienda con todas sus tareas verificadas es
TERMINADA; si no, INACABADA.

### Rechazar

`rechazada` es un **estado de verdad**, no una marca encima de
`pendiente`. Lo dice la nota de la home: el banner rojo lleva a «las
tareas que están en estado de RECHAZADAS y que esperan una reacción del
jefe de obra, y pasarla de nuevo, una vez subsanado el error en obra, **a
COMPLETADA**».

Así que el ciclo de una tarea rebotada es:

    RECHAZADA → COMPLETADA → (VERIFICADA | RECHAZADA otra vez)

y no vuelve a PENDIENTE. Cuenta como no verificada en todos los
porcentajes, igual que pendiente.

- Rechazar **obliga a poner el motivo**, y el motivo va en **campo
  propio**, no en el hilo de comentarios. Se guarda **uno por cada
  rechazo**, con su fecha y quién lo firmó: en pantalla manda el último,
  que es lo que hay que arreglar ahora, y los anteriores quedan debajo.
  Un campo que se sobrescribe borraría por qué rebotó la primera vez, que
  es justo lo que se quiere conservar.
- Las **fotos de verificación del intento rechazado se conservan**. Son
  la prueba de lo que la constructora dijo que estaba arreglado, y en una
  discusión de obra eso vale dinero.
- El jefe de obra **ve en su home un contador de rechazadas** y entra
  desde ahí al listado filtrado.

Un **verificador puede editar una tarea aunque ya esté verificada**. El
permiso manda sobre el estado.

## La home

Dos homes distintas: **técnicos y propiedad** (arquitectos y UNIK) y
**personal de constructora**.

- El título cambia según el día de la semana (lunes y viernes tienen su
  propio texto).
- **«Pendiente de revisión por la DF»** — beige `#DEDDD8`, con el total
  de tareas en COMPLETADA.
- **«Tareas revisadas por la DF»** — verde, y su gemelo **rojo** con las
  rechazadas. Los dos son **contadores que se acumulan hasta que pinchas
  en ellos**: al pinchar, entras al listado filtrado por ese estado y el
  contador se pone a cero.
- **Módulo de promoción (Brassie)** — fecha de la última tarea no
  verificada, caras de quien tiene tareas sin verificar, número de tareas
  no verificadas, pastilla `verificadas / total histórico`, pastilla con
  el porcentaje redondeado sin decimales, y un círculo de avance.
- **Comentarios y feedback**, con tres colores: rojo rechazada, verde
  verificada, beige completada sin resolver todavía.

El contador que «se acumula salvo que pinches» es **estado nuevo que hoy
no existe**: hay que guardar, por usuario, cuándo miró por última vez
cada uno de los dos banners.

## Mensajería con acuse de lectura

Lo más grande de todo el rediseño, y lo que más trabajo tiene detrás.

En la ficha de cada vivienda hay un **listado de mensajes** entre todos
los usuarios del proyecto, y cada mensaje sabe **quién lo ha leído y
quién no**:

- **Bolita azul** en los que uno no ha leído. Cada usuario ve la suya.
- Se abre en un modal y **cuenta como leído a los tres segundos** dentro.
- **Un tic** cuando lo ha leído una persona, **dos** cuando los han leído
  todos.

Esto no es pantalla: es **una tabla nueva** —quién leyó qué y cuándo— que
además tiene que **sincronizarse entre dispositivos**, porque los dos
tics de uno dependen de lo que hayan leído los demás.

Que los tics y las bolitas **lleguen con retraso está aceptado**: las
lecturas se apuntan en el móvil y viajan cuando hay señal. En Brassie hay
cobertura el 95% del tiempo, así que el retraso será raro y corto.

## Ficha de una vivienda

- **Botón de PDF** con el listado de repasos al momento de pulsarlo, para
  mandar por WhatsApp o adjuntar en un correo.
- **Chips con la cara de cada persona** que tenga tareas sin verificar;
  sirven para filtrar por quién.
- Las **verificadas van siempre al final**, en gris claro, tachadas y con
  su check.
- La descripción de cada tarea ocupa **dos líneas como mucho** y se corta
  con puntos suspensivos.
- La **flecha de atrás conserva los filtros** que estuvieran aplicados.
- **Nueva inspección desde una vivienda** llega con esa vivienda ya
  seleccionada.
- El widget de avance usa la misma banda de color que la home según el
  porcentaje.

La home del **jefe de obra** es el mismo panel que la de técnicos, con una
sola diferencia: el título es siempre `A por los repasos pendientes! 💪🏼`,
sin las frases que cambian por día de la semana.

## Gremios

Cada gremio pasa a tener **imagen** y **empresa**, y **una empresa como
mucho**. Hoy el catálogo solo tiene identificador y nombre, así que son
dos campos nuevos en los quince.

Las **imágenes salen del propio Figma**, las mismas que hay puestas ahí.
La **empresa puede quedarse vacía**: no es obligatoria, y un gremio sin
empresa asignada tiene que verse bien igual.

Los filtros —por ahora **solo por gremio**— admiten varios a la vez y
suman: salen las viviendas en las que **alguno** de los gremios elegidos
tenga trabajo pendiente.

## Al cerrar un recorrido

Modal con la foto y el nombre de quien creó la lista, y una frase que
**cambia según cuántas tareas salieron**, para no ver siempre la misma:

| Tareas | Frase |
| --- | --- |
| 1 | Una y bien cazada. |
| 2–5 | Todo validado. Ni una se escapó. |
| 6–10 | Buen repaso. Hay trabajo por delante. |
| 11–15 | Repaso serio. El jefe de obra te recordará. |
| más de 15 | «N remates. Esto ya era personal.», con N el número real |

## Al completar una tarea

Vuelve a la pantalla de donde se venía —normalmente el detalle de la
vivienda— con un modal «Excelente, [nombre]» y una de estas ocho frases,
rotando:

1. Otro remate menos. Así se hace.
2. Bien resuelto. A por el siguiente.
3. Un remate menos. Seguimos.
4. Resuelto. Como tiene que ser.
5. Bien. La lista sigue bajando.
6. Uno menos dando guerra.
7. Un problema menos en obra.
8. Otro frente oficialmente cerrado.

## Otras reglas del diseño

- **ZONA-ESTANCIA**: variable nueva por tarea, solo para ubicar y filtrar
  por estancia dentro de una vivienda. Hoy no existe. Lista cerrada:
  salón, cocina, lavadero, aseo, baño secundario, baño principal, sótano,
  pasillo, escalera, distribuidor, entrada, dormitorio 1, dormitorio 2,
  dormitorio principal, vestidor, acceso exterior, jardín, fachada,
  cubierta.
- Al crear una tarea desde la ficha de una vivienda, **la vivienda viene
  rellenada** pero se puede cambiar en el desplegable.
- **Borrar la foto de un acta abre la cámara inmediatamente** para
  reemplazarla: «NO HAY ACTA SIN FOTO, JAMÁS». El menú de borrar ofrece
  ELIMINAR IMAGEN o una «X» que vuelve sin tocar nada; si se elimina, hay
  que sacar otra o elegirla de la galería antes de seguir.
- El selector **Finalizadas** enseña las viviendas sin ninguna tarea por
  verificar: contador con X igual a Y, chip verde oscuro con el fueguito
  al 100% y el círculo de avance entero en verde oscuro.
- Las **fotos de verificación** se ven en carrusel, con zoom y scroll
  horizontal, cada una con su papelera y confirmación al borrar. **Con
  una sola foto ya se activa DAR POR COMPLETADA.**
- Al completar, **escribir un mensaje es opcional**; si se escribe,
  aparece en las dos homes y en las tres pantallas de detalle de
  vivienda.
- El menú del **cerebrito** durante un recorrido ofrece FINALIZAR
  RECORRIDO, PAUSAR, y una «X» que cierra el menú y sigue grabando.

## Roles

Dos, y hoy solo existe uno (`verifica`).

- **COMPLETADOR** — marca una tarea como completada y sube las fotos de
  la reparación. Por ahora **cualquier usuario con sesión** lo es.
- **VERIFICADOR** — verifica, rechaza y **es el único que puede editar
  una tarea**. Arquitectos y la gente de UNIK; lo asigna quien
  administra.

## Fotos

Son **dos conjuntos distintos y no se mezclan**:

- **Fotos de la tarea** — el defecto. Obligatorias al crearla.
- **Fotos de verificación** — la reparación. **Obligatorias para poder
  dar la tarea por completada**: sin ellas el botón está desactivado.
  Basta con una para activar el botón.

**Diez y diez**: máximo diez elementos en cada conjunto. El diseño decía
diez en uno y treinta en el otro; se unifica en diez, que sobra para las
dos cosas.

## Recorrido

Se mantiene tal cual está construido, y **se le añade PAUSAR**: hoy, si
paras, se acaba. Alguien que graba mientras anda por una villa recibe
una llamada, y sin pausa pierde el recorrido entero.

Lo demás del diseño coincide con lo construido —tocar en cualquier sitio
de la pantalla saca un fotograma, menos en el botón del cerebro; la caja
de descripción tiene el alto justo de lo escrito— salvo tres cosas:

- **Falta ZONA.** El diseño enseña cada ficha como
  `FOTO + zona + oficio + descripción`, y lo que se publicó esta noche no
  tiene zona. Es el mismo campo ZONA-ESTANCIA de las tareas a mano.
- **El título de la lista** es `Nueva lista - [nombre de la vivienda]`,
  no «RECORRIDO DE 0:48» como está ahora.
- En la pantalla de validar, **la flecha de volver y el menú de los tres
  puntos van desactivados**: de ahí se sale creando las tareas o
  descartándolas, no por la puerta de atrás. El recorrido sigue guardado
  en el móvil por si se cierra la app, así que no se pierde nada.

Entrar a una inspección nueva ofrece tres caminos: **hacer foto,
elegir de la galería, o recorrido con IA**.

En los dos primeros, la IA **también propone el texto** a partir de la
foto. Eso lo decide **cada usuario en su panel**: nace **encendido para
todos** y quien no lo quiera lo apaga. Es la misma llamada que la del
recorrido con una sola marca y sin transcripción, así que no hace falta
nada nuevo en el servidor.

Que sea opcional no es un capricho: en un recorrido, una llamada cubre
veinte fotos; creando tareas de una en una, cada tarea es una llamada.
Veinte tareas sueltas cuestan bastante más que un recorrido de veinte.

---

## Lo que sigue abierto

Nada. Las treinta y dos notas del diseño están leídas y todas las
preguntas que salieron de ellas están decididas arriba.

Lo que falta para poder implementar no son decisiones, son datos: **qué
empresa lleva cada gremio** (el campo admite quedarse vacío) y **bajar
del Figma las quince imágenes** de los gremios.
