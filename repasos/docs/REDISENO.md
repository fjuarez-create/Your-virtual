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

- Rechazar **obliga a poner el motivo**. Una tarea que rebota sin
  explicación es una llamada de teléfono asegurada.
- El jefe de obra tiene que **ver en su home que hay tareas rechazadas**
  para poder ir al detalle.

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

## Recorrido

Se mantiene tal cual está construido, y **se le añade PAUSAR**: hoy, si
paras, se acaba. Alguien que graba mientras anda por una villa recibe
una llamada, y sin pausa pierde el recorrido entero.

---

## Lo que sigue abierto

- **RECHAZADA: ¿estado o marca?** El diseño la lista como el cuarto
  estado, pero la instrucción hablada fue «vuelve a pendiente y el jefe
  de obra ve que hay una rechazada». Son dos modelos distintos y hay que
  elegir uno antes de escribir nada.
- Si al rechazar se **conservan las fotos de verificación** que se
  subieron en el intento anterior.
- Si un verificador puede **editar una tarea ya verificada**.
