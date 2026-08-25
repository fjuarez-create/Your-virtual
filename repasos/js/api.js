/* ═══════════════════════════════════════════════════════════════
   api.js — cliente del backend PHP.

   Todo el protocolo es «upsert»: cliente y servidor intercambian
   registros completos con su marca `actualizado`, y gana el más
   reciente. Los borrados viajan como registros con `borrada: true`,
   de modo que un dispositivo que estuvo sin cobertura también se
   entera de lo que se borró mientras tanto.

   La sesión va en una cookie HttpOnly puesta por el servidor: el
   token nunca pasa por JavaScript y las fotos se pueden pedir
   directamente con <img src> sin montar cabeceras.
   ═══════════════════════════════════════════════════════════════ */
const CFG = window.REPASOS_CONFIG || {};
export const API_BASE = (CFG.apiBase || '').replace(/\/?$/, '/');
export const HAY_SERVIDOR = API_BASE !== '/';

export class ApiError extends Error {
  constructor(mensaje, status, codigo) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

async function pedir(ruta, { metodo = 'GET', json, form, crudo, signal } = {}) {
  if (!HAY_SERVIDOR) throw new ApiError('Sin servidor configurado', 0, 'sin-servidor');
  const opciones = { method: metodo, credentials: 'include', signal, headers: {} };
  if (json !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(json);
  } else if (form) {
    opciones.body = form;
  } else if (crudo) {
    // El cuerpo tal cual, sin envolver: así viajan las partes de audio.
    opciones.headers['Content-Type'] = 'application/octet-stream';
    opciones.body = crudo;
  }
  // Mientras se publica una versión el servidor reescribe ficheros
  // unos segundos, y una lectura puede toparse un 404 o un 5xx que un
  // momento después ya no está (le pasó a Fran con la WiFi perfecta).
  // Las LECTURAS se reintentan una vez; un POST no, que repetirlo
  // duplicaría lo hecho.
  for (let intento = 0; ; intento++) {
    const reintentable = metodo === 'GET' && intento === 0;
    let res;
    try {
      res = await fetch(API_BASE + ruta, opciones);
    } catch (e) {
      if (reintentable && e?.name !== 'AbortError') {
        await new Promise((listo) => setTimeout(listo, 1600));
        continue;
      }
      throw new ApiError('Sin conexión con el servidor', 0, 'red');
    }
    if (!res.ok && reintentable && [404, 500, 502, 503, 504].includes(res.status)) {
      await new Promise((listo) => setTimeout(listo, 1600));
      continue;
    }
    const texto = await res.text();
    let datos = null;
    if (texto) {
      try { datos = JSON.parse(texto); } catch { /* respuesta no-JSON */ }
    }
    if (!res.ok) {
      const msg = datos?.error || `Error ${res.status}`;
      throw new ApiError(msg, res.status, datos?.codigo);
    }
    return datos;
  }
}

/* ─── Sesión ──────────────────────────────────────────────────── */
export const entrar = (email, password) =>
  pedir('auth/login', { metodo: 'POST', json: { email, password } });
export const salir = () => pedir('auth/logout', { metodo: 'POST' });
export const yo = () => pedir('auth/me');
export const cambiarPassword = (actual, nueva) =>
  pedir('auth/password', { metodo: 'POST', json: { actual, nueva } });

/* ─── Usuarios (solo administración) ──────────────────────────── */
export const listarUsuarios = () => pedir('usuarios');
export const crearUsuario = (datos) => pedir('usuarios', { metodo: 'POST', json: datos });
export const editarUsuario = (id, datos) =>
  pedir('usuarios/' + encodeURIComponent(id), { metodo: 'PATCH', json: datos });
export const eliminarUsuario = (id) =>
  pedir('usuarios/' + encodeURIComponent(id), { metodo: 'DELETE' });

/* ─── Las estancias de la obra ────────────────────────────────── */
export const leerZonas = () => pedir('config/zonas');
/** Guarda la lista entera; con null se vuelve a la de fábrica. */
export const guardarZonas = (plantas) =>
  pedir('config/zonas', { metodo: 'PUT', json: { plantas } });

/* ─── Foto de perfil ──────────────────────────────────────────── */
/** La versión va en la dirección: al cambiar la foto cambia la URL y
    el navegador deja de servir la anterior desde su caché. */
export function urlAvatar(id, version) {
  if (!HAY_SERVIDOR || !id || !version) return '';
  return `${API_BASE}usuarios/${encodeURIComponent(id)}/avatar?v=${encodeURIComponent(version)}`;
}

export function subirAvatar(id, blob) {
  const form = new FormData();
  form.append('fichero', blob, 'avatar.jpg');
  return pedir(`usuarios/${encodeURIComponent(id)}/avatar`, { metodo: 'POST', form });
}

export const borrarAvatar = (id) =>
  pedir(`usuarios/${encodeURIComponent(id)}/avatar`, { metodo: 'DELETE' });

/* ─── Sincronización ──────────────────────────────────────────── */
export const subirListas = (listas) => pedir('listas', { metodo: 'POST', json: { listas } });
export const subirTareas = (tareas) => pedir('tareas', { metodo: 'POST', json: { tareas } });
export const subirComentarios = (comentarios) =>
  pedir('comentarios', { metodo: 'POST', json: { comentarios } });
export const subirMensajes = (mensajes) =>
  pedir('mensajes', { metodo: 'POST', json: { mensajes } });
export const subirLecturas = (lecturas) =>
  pedir('lecturas', { metodo: 'POST', json: { lecturas } });

/** Sube un medio con su fichero. `alProgreso(0..1)` es opcional. */
export function subirMedio(medio, blob, alProgreso) {
  if (!HAY_SERVIDOR) return Promise.reject(new ApiError('Sin servidor', 0, 'sin-servidor'));
  // XHR en lugar de fetch: es la única forma de conocer el progreso de
  // subida, y un vídeo por 3G tarda lo suficiente como para merecer barra.
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('id', medio.id);
    form.append('tareaId', medio.tareaId);
    if (medio.comentarioId) form.append('comentarioId', medio.comentarioId);
    form.append('tipo', medio.tipo);
    form.append('creado', medio.creado);
    form.append('duracion', String(medio.duracion || 0));
    form.append('ancho', String(medio.ancho || 0));
    form.append('alto', String(medio.alto || 0));
    form.append('fichero', blob, medio.nombre || (medio.id + extension(medio.mime)));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + 'medios');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (alProgreso && e.lengthComputable) alProgreso(e.loaded / e.total);
    };
    xhr.onload = () => {
      let datos = null;
      try { datos = JSON.parse(xhr.responseText); } catch { /* vacío */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(datos);
      else reject(new ApiError(datos?.error || `Error ${xhr.status}`, xhr.status, datos?.codigo));
    };
    xhr.onerror = () => reject(new ApiError('Sin conexión con el servidor', 0, 'red'));
    xhr.send(form);
  });
}

export const borrarMedioRemoto = (id) =>
  pedir('medios/' + encodeURIComponent(id), { metodo: 'DELETE' });

/** Cambios en el servidor desde una marca de tiempo. */
export const cambios = (desde) =>
  pedir('cambios?desde=' + encodeURIComponent(desde || ''));

/** URL pública de un medio ya subido. */
export const urlMedio = (id) => API_BASE + 'medios/' + encodeURIComponent(id) + '/fichero';

/**
 * Pregunta al servidor si puede llamar él solo a un servicio de fuera.
 * Se comprueba desde el móvil porque es donde está quien lo necesita
 * saber, pero lo que se mide es la salida del hosting, no la del móvil.
 */
export const salidaAInternet = () => pedir('diagnostico/salida');

/* ─── La obra: reuniones y encargos ───────────────────────────────
   En pantalla los encargos se llaman «tareas» —las que nacen de una
   reunión—, pero por dentro llevan nombre propio para no chocar con
   las tareas de siempre, que son repasos (ver CLAUDE.md).

   Todo esto va SIEMPRE en línea, sin outbox: el servidor es la única
   verdad y el sello de las 23:59 se decide con su reloj, no con el
   del móvil. */
export const obraEstado = (promoId) =>
  pedir('obra/estado?promo=' + encodeURIComponent(promoId));
export const obraReuniones = (promoId) =>
  pedir('obra/reuniones?promo=' + encodeURIComponent(promoId));
export const empezarReunion = (promoId) =>
  pedir('obra/reuniones', { metodo: 'POST', json: { promoId } });
export const verReunion = (id) =>
  pedir('obra/reuniones/' + encodeURIComponent(id));
/** Cambia asistentes, invitados o el terminada de la reunión. */
export const editarReunion = (id, datos) =>
  pedir('obra/reuniones/' + encodeURIComponent(id), { metodo: 'PATCH', json: datos });
/** Toca la mesa por diferencias: {poner, quitar, invitar, desinvitar}.
    Así dos personas añadiendo a la vez no se pisan la lista. */
export const tocarMesa = (id, deltas) =>
  pedir('obra/reuniones/' + encodeURIComponent(id) + '/mesa', { metodo: 'POST', json: deltas });
export const crearEncargo = (datos) =>
  pedir('obra/encargos', { metodo: 'POST', json: datos });
export const editarEncargo = (id, datos) =>
  pedir('obra/encargos/' + encodeURIComponent(id), { metodo: 'PATCH', json: datos });

/* La grabación de la reunión: el audio sube por PARTES (el móvil rota
   la grabadora cada tanto y cada parte es un fichero completo), la
   transcripción va parte a parte y el acta la redacta la IA como
   propuesta que la DF firma. */
export const empezarGrabacion = (reunionId, mime) =>
  pedir(`obra/reuniones/${encodeURIComponent(reunionId)}/grabaciones`, { metodo: 'POST', json: { mime } });
export const subirParteGrabacion = (id, n, dur, blob) =>
  pedir(`obra/grabaciones/${encodeURIComponent(id)}/parte?n=${n}&dur=${Math.round(dur)}`, { metodo: 'POST', crudo: blob });
export const cerrarGrabacion = (id, duracion) =>
  pedir(`obra/grabaciones/${encodeURIComponent(id)}/cerrar`, { metodo: 'POST', json: { duracion: Math.round(duracion) } });
/** Transcribe UNA parte pendiente; se llama en bucle hasta que `quedan` sea 0. */
export const transcribirGrabacion = (id) =>
  pedir(`obra/grabaciones/${encodeURIComponent(id)}/transcribir`, { metodo: 'POST', json: {} });
export const redactarActa = (reunionId, unidades) =>
  pedir(`obra/reuniones/${encodeURIComponent(reunionId)}/redactar`, { metodo: 'POST', json: { unidades } });
export const aceptarActa = (reunionId, datos) =>
  pedir(`obra/reuniones/${encodeURIComponent(reunionId)}/acta`, { metodo: 'POST', json: datos });
export const urlAudioGrabacion = (id, parte = 0) =>
  `${API_BASE}obra/grabaciones/${encodeURIComponent(id)}/audio?parte=${parte}`;
/** Borra la grabación entera: fila y ficheros. Quién puede, lo dicen
    los ajustes de la obra; el servidor es quien manda. */
export const borrarGrabacion = (id) =>
  pedir('obra/grabaciones/' + encodeURIComponent(id), { metodo: 'DELETE' });

/* Los ajustes de la obra: quién escucha y quién borra los audios. Los
   lee cualquiera (para pintar lo suyo); los guarda solo el admin. */
export const ajustesObra = () => pedir('obra/ajustes');
export const guardarAjustesObra = (datos) =>
  pedir('obra/ajustes', { metodo: 'POST', json: datos });

/* Quién es quién: el mapa manual de cada grabación, el registro de
   voces de la obra y —con la clave de pyannote puesta— las huellas que
   hacen que la app reconozca las voces sola en la reunión siguiente. */
export const listarVoces = (promoId) =>
  pedir('obra/voces?promo=' + encodeURIComponent(promoId));
export const crearVoz = (datos) => pedir('obra/voces', { metodo: 'POST', json: datos });
export const subirMuestraVoz = (id, blob) =>
  pedir(`obra/voces/${encodeURIComponent(id)}/muestra`, { metodo: 'POST', crudo: blob });
export const guardarHablantes = (grabacionId, mapa) =>
  pedir(`obra/grabaciones/${encodeURIComponent(grabacionId)}/hablantes`, { metodo: 'POST', json: { mapa } });
/** Un paso de identificación automática; se llama en bucle hasta quedan 0. */
export const identificarGrabacion = (id) =>
  pedir(`obra/grabaciones/${encodeURIComponent(id)}/identificar`, { metodo: 'POST', json: {} });
export const vocesEstado = () => pedir('obra/voces/clave');
export const vocesPonerClave = (clave) =>
  pedir('obra/voces/clave', { metodo: 'POST', json: { clave } });
export const vocesQuitarClave = () => pedir('obra/voces/clave', { metodo: 'DELETE' });

/* ─── Claude ──────────────────────────────────────────────────────
   La clave vive en el servidor y no vuelve nunca: de aquí solo sale
   si hay una puesta y sus cuatro últimos caracteres, para reconocerla. */
export const claudeEstado = () => pedir('claude/estado');
export const claudePonerClave = (clave) =>
  pedir('claude/clave', { metodo: 'POST', json: { clave } });
export const claudeQuitarClave = () => pedir('claude/clave', { metodo: 'DELETE' });

/**
 * Lo dicho en el recorrido + las fotos → una tarea redactada por marca.
 *
 * `fotos` son las mismas marcas encogidas y en base64: Claude no oye el
 * audio, pero sí ve lo que fotografiaste, así que de una marca de la que
 * no dijiste nada todavía puede salir una tarea.
 */
export const claudeRedactar = (texto, marcas, oficios, fotos, zonas, juntar = true) =>
  pedir('claude/redactar', { metodo: 'POST', json: { texto, marcas, oficios, fotos, zonas, juntar } });

/* ─── El oído ─────────────────────────────────────────────────────
   Otro proveedor, otra clave y otra factura: Claude no oye, así que
   quien pasa el audio a texto es otro. La clave vive en el servidor
   igual que la de Anthropic y de aquí solo salen sus cuatro últimos. */
export const oidoEstado = () => pedir('oido/estado');
export const oidoPonerClave = (clave) =>
  pedir('oido/clave', { metodo: 'POST', json: { clave } });
export const oidoQuitarClave = () => pedir('oido/clave', { metodo: 'DELETE' });

/** La grabación de un recorrido → lo que se dijo, en texto. */
export function oidoTranscribir(blob, duracion) {
  const form = new FormData();
  const mime = blob.type || 'audio/webm';
  form.append('fichero', blob, 'recorrido' + extension(mime));
  form.append('mime', mime);
  form.append('duracion', String(Math.round(duracion || 0)));
  return pedir('oido/transcribir', { metodo: 'POST', form });
}

function extension(mime) {
  // Lo que graba el móvil viene con coletilla —`audio/webm;codecs=opus`—
  // y sin quitarla no encaja con ninguna de la lista.
  const limpio = String(mime || '').split(';')[0].trim().toLowerCase();
  const m = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
    'audio/webm': '.webm', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg', 'audio/wav': '.wav',
  };
  return m[limpio] || '.bin';
}
