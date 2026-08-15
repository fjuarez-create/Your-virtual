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

async function pedir(ruta, { metodo = 'GET', json, form, signal } = {}) {
  if (!HAY_SERVIDOR) throw new ApiError('Sin servidor configurado', 0, 'sin-servidor');
  const opciones = { method: metodo, credentials: 'include', signal, headers: {} };
  if (json !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(json);
  } else if (form) {
    opciones.body = form;
  }
  let res;
  try {
    res = await fetch(API_BASE + ruta, opciones);
  } catch (e) {
    throw new ApiError('Sin conexión con el servidor', 0, 'red');
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
export const claudeRedactar = (texto, marcas, oficios, fotos) =>
  pedir('claude/redactar', { metodo: 'POST', json: { texto, marcas, oficios, fotos } });

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
