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

## Otras reglas del diseño

- **ZONA-ESTANCIA**: variable nueva por tarea, solo para ubicar y filtrar
  por estancia dentro de una vivienda. Hoy no existe.
- Al crear una tarea desde la ficha de una vivienda, **la vivienda viene
  rellenada** pero se puede cambiar en el desplegable.
- **Borrar la foto de un acta abre la cámara inmediatamente** para
  reemplazarla: «NO HAY ACTA SIN FOTO, JAMÁS».
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
foto. Pero eso lo decide **cada usuario en su panel**: quien crea tareas
elige si quiere que se le redacten solas o escribirlas él. Es la misma
llamada que la del recorrido con una sola marca y sin transcripción, así
que no hace falta nada nuevo en el servidor.

Que sea opcional no es un capricho: en un recorrido, una llamada cubre
veinte fotos; creando tareas de una en una, cada tarea es una llamada.
Veinte tareas sueltas cuestan bastante más que un recorrido de veinte.

---

## Lo que sigue abierto

- Si la propuesta de texto por IA al crear una tarea desde foto o galería
  **nace encendida o apagada** para un usuario nuevo.
