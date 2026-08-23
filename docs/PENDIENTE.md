
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
