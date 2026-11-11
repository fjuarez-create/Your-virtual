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

Y una quinta, de noviembre de 2026:

- **Reconocimiento de repasos pendientes**: el documento de una
  vivienda que se firma en la notaría, con lo que queda por terminar.
  NO se le llama «acta» (lo decidió Fran el 9-11-2026), ni en pantalla
  ni en el papel. Por dentro se llama `constancia`: la tabla
  `constancias`, las rutas `constancias/…`, `js/constancia.js` y
  `js/pdfConstancia.js`.

Y una regla sobre una palabra que ya existía:

- **Entregada**: una vivienda está entregada cuando lo apuntan el
  comercial o el administrador («La vivienda se ha entregado», en la
  hoja de fechas). NUNCA se deduce de la fecha de la firma: una firma
  prevista para hoy, o para ayer, no es una vivienda entregada (lo
  decidió Fran el 10-11-2026). Por dentro es el hecho `entregadaEn` de
  la ficha de entrega.

Y una nota sobre las revisiones con el cliente (11-11-2026): cada
vivienda guarda TODAS sus visitas hechas. Por dentro, la cita vigente
son `revision` y `revisadaEn` en la ficha de entrega, y las visitas
anteriores ya hechas van en la lista `visitasHechas`. Deshacer una
marca puesta por error devuelve a la cita la fecha y la hora que tenía
(`revisadaDe`, `revisadaDeHora`).

OJO, la trampa que no hay que pisar: **por dentro, la tabla `tareas`,
la ruta `#/tareas/…` y los nombres de código (`crearTarea`,
`tareaId`…) guardan REPASOS**. Son identificadores que ya viven en
producción y no se renombran (ver la excepción del idioma, arriba).
Al leer código, fíjate en el identificador; al leer pantalla, en la
palabra. Y cuando se construyan las tareas de reunión, su entidad
llevará por dentro un nombre propio que no choque (`encargos`), nunca
`tareas`.

## Una regla del servidor que no se puede olvidar (noviembre de 2026)

Las siete tablas que bajan a los móviles —`listas`, `tareas`,
`comentarios`, `medios`, `mensajes`, `lecturas` y `entregas`— llevan la
columna `recibido`: el número de orden con el que cada fila LLEGÓ al
servidor. La bajada de cambios se guía por ese número y no por
`actualizado`, que lo pone el reloj de cada móvil (lo apuntado sin
cobertura y subido más tarde no les bajaba nunca a quienes ya habían
sincronizado algo más nuevo).

**Toda escritura en una de esas tablas deja la fila con
`recibido = ''`** («pendiente de numerar»). `upsert()` ya lo hace;
quien escriba un `UPDATE` a mano tiene que ponerlo en su `SET`. Si se
olvida, ese cambio no le baja a quien ya pasó por esa fila, y no da
ningún error.

Y la marca de sincronización viaja escrita con «+00:00», no con «Z»:
no es un descuido y no se «arregla». Todo está contado en la cabecera
«La bajada por recepción» de `api/index.php`.

Lo vigila el propio despliegue: `.github/scripts/comprobar-recepcion.mjs`
lee el PHP de la API antes de subir nada y para la publicación si una
escritura en esas tablas no deja `recibido = ''`. No tiene interruptor,
a propósito. Si salta sin razón, su cabecera dice qué falsas alarmas se
le conocen y cómo salir de cada una.

Y dos cosas más que cuelgan de la sincronización:

- **El directorio viaja entero.** La lista de personas va completa en
  cada respuesta de `cambios`, y la app BORRA de cada móvil a quien no
  venga en ella (`acatarDirectorio`, en `js/store.js`): así llegan las
  bajas a los demás. Quien filtre, pagine o recorte esa consulta deja a
  los móviles sin la gente que falte.
- **El taller vive en el mismo origen que la app de verdad**
  (`/taller`), así que el navegador les da a las dos lo mismo de todo
  lo que guarda «por origen». Por eso lo que se sirve desde `/taller/`
  abre su propia base local, `unik-repasos-taller` (`js/db.js`). La de
  la app de verdad se llama `unik-repasos` y NO se renombra nunca: en
  ella está el trabajo sin subir de cada móvil.

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
