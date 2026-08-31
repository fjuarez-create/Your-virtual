# Cómo se trabaja en este repositorio

## El idioma es el español. Todo.

No solo el código: **todo lo que Fran lee**.

- Las frases que se escriben entre paso y paso mientras se trabaja.
- El rótulo de cada comando que aparece en su pantalla.
- Los mensajes de commit.
- El código: nombres de variables, de funciones y de ficheros.
- Los comentarios.
- Los textos de la propia app.

Fran no lee inglés con comodidad. Un rótulo en inglés encima de un
comando que está tocando su aplicación en producción no le dice qué está
pasando, que es justo para lo que está ahí.

La única excepción son las palabras que no tienen traducción de verdad
en el oficio —`commit`, `push`, `outbox`— y los identificadores que ya
están escritos en datos de producción y no se pueden renombrar sin
migrar la base entera.

## El diccionario de la casa (decidido por Fran, agosto de 2026)

En pantalla, cuatro palabras con dueño fijo:

- **Repaso**: lo de una vivienda, con su circuito de verificación por
  la DF (pendiente → completado → verificado/rechazado).
- **Tarea**: SOLO lo que sale de una reunión de obra, con responsable
  y fecha límite.
- **Parte**: el papeleo de repasos — el del día y el de cada vivienda.
- **Acta**: SOLO el documento de una reunión de obra.

OJO, la trampa que no hay que pisar: **por dentro, la tabla `tareas`,
la ruta `#/tareas/…` y los nombres de código (`crearTarea`,
`tareaId`…) guardan REPASOS**. Son identificadores que ya viven en
producción y no se renombran (ver la excepción del idioma, arriba).
Al leer código, fíjate en el identificador; al leer pantalla, en la
palabra. Y cuando se construyan las tareas de reunión, su entidad
llevará por dentro un nombre propio que no choque (`encargos`), nunca
`tareas`.

## Lo que no se hace nunca

- **No se cambia la contraseña de Fran** (f.juarez@unikdi.com). Lo ha
  dicho más de una vez y va en serio.
- **No se pegan credenciales en la conversación**: ni claves de API, ni
  el host del FTP, ni contraseñas. Esos datos van de su bloc de notas a
  los secretos de GitHub sin pasar por el chat.

## Cómo se entrega

Fran no abre un Codespace ni ejecuta nada. Se le publica y se le
despliega todo, y se comprueba que el despliegue sale en verde antes de
decirle que está hecho.

Los mensajes terminan con la dirección de la app: https://repasos.unikdi.com
