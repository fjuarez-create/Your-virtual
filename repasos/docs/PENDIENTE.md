# Lo apartado a propósito

Cosas que Fran decidió dejar para más adelante, con su condición para
retomarlas. Este fichero existe para que ninguna se pierda por el
camino ni se saque antes de tiempo.

## Notificaciones push

**No proponerlas antes del 30 de agosto de 2026**, y solo cuando Fran
vuelva a preguntar por posibles mejoras (decidido el 23 de agosto de
2026).

Hoy nadie se entera de un repaso nuevo hasta abrir la app. Es la mejora
que más cambiaría el día a día del equipo y también la más cara: toca
servidor, y en iPhone obliga a recompilar el envoltorio y volver a
pasar por la revisión de Apple.

## El detalle de los dos selectores

Elegir oficio va con casillas y botón «Seleccionar»; elegir estancia va
a toque directo. Se queda así por decisión de Fran (23 de agosto de
2026): una cosa es elegir varios para filtrar y otra elegir uno para un
formulario.

## Las voces de las reuniones (agosto 2026)

- La capa acústica es pyannoteAI (api.pyannote.ai, precision-2), elegida
  tras investigación contrastada: es el único autoservicio con huellas
  de voz persistentes entre ficheros verificado (leído en su SDK).
  Speechmatics queda de suplente declarado; los clips se guardan
  SIEMPRE para poder re-enrolar en otro proveedor.
- Para activarla: cuenta en pyannote.ai (prueba de 30 días con 150 h),
  clave en Ajustes → Servidor → «Clave de pyannote». Sin clave, la
  pantalla de «¿quién es quién?» pregunta en cada reunión y no se
  rompe nada.
- RGPD: la huella de voz es dato biométrico (art. 9). Antes de enrolar
  a nadie: avisar, apuntar la conformidad, y pedir a pyannote el DPA
  con la lista de subprocesadores (la inferencia GPU puede salir de la
  UE fuera del plan Enterprise). La huella vive solo en nuestra base:
  borrar a alguien es borrar su fila y su clip.
- El audio de reuniones se borra solo a los 30 días (decisión de Fran);
  transcripción y acta se quedan.
- Fran ya pegó la clave de pyannote en el TALLER (agosto 2026). Al
  hacer el volcado grande a la app real habrá que pegarla una vez en
  los Ajustes de producción: las claves no viajan entre entornos.

## Bordes conocidos del conducto de audio (agosto 2026)

- **Si el conducto cruza las 23:59**, el acta de ese día ya está
  sellada y la propuesta no se puede escribir: la transcripción queda
  guardada, pero las tareas hay que apuntarlas a mano en la reunión
  siguiente. La fila lo dice con su motivo. Si llegara a molestar, se
  puede dar una prórroga de cortesía al sello para actas que ya
  estaban en el horno.
- **Reintentar** repite la parte que falló. Si el fallo llegó DESPUÉS
  de que OpenAI hiciera su trabajo (un corte al recibir la respuesta),
  esa parte se paga dos veces. Es raro y barato; arreglarlo del todo
  pediría guardar la respuesta antes de contestar al móvil.
- **El servicio de voces con cola larga**: a los ~7 minutos el
  conducto sigue adelante sin nombres y avisa; las voces se ponen a
  mano y quedan aprendidas igual.
