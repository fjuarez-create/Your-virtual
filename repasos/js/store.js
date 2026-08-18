/* ═══════════════════════════════════════════════════════════════
   store.js — modelo de datos y motor de sincronización.

   Regla de oro: la app nunca espera al servidor. Toda escritura entra
   en IndexedDB y deja un apunte en el outbox; el motor lo sube cuando
   hay red. Los identificadores los genera el cliente (UUID), así que
   subir dos veces el mismo cambio es inofensivo.
   ═══════════════════════════════════════════════════════════════ */
import * as db from './db.js';
import * as api from './api.js';
import { puedeVerificar, hecha, esperandoVisto, rebotada, enObra, OFICIO_POR_DEFECTO, FASE_UNICA } from './catalog.js';

/* ─── Identificadores y sellos de tiempo ──────────────────────── */
export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const ahora = () => new Date().toISOString();

/* ─── Sesión ──────────────────────────────────────────────────── */
let usuario = null;

/** Añade la dirección de la foto, si la persona tiene una puesta. */
function conFoto(u) {
  if (!u) return u;
  return { ...u, avatarUrl: api.urlAvatar(u.id, u.avatar) };
}

export const sesion = () => usuario;
export const esAdmin = () => !!usuario && usuario.rol === 'admin';

export async function cargarSesion() {
  usuario = conFoto(await db.meta.get('usuario')) || null;
  if (api.HAY_SERVIDOR && navigator.onLine) {
    // Se refresca contra el servidor, pero si no contesta seguimos con
    // la sesión guardada: sin cobertura la app tiene que abrir igual.
    try {
      const u = await api.yo();
      usuario = conFoto(u.usuario);
      await db.meta.set('usuario', u.usuario);
    } catch (e) {
      if (e.status === 401) { usuario = null; await db.meta.del('usuario'); }
    }
  }
  return usuario;
}

export async function iniciarSesion(email, password) {
  const r = await api.entrar(email, password);
  usuario = conFoto(r.usuario);
  await db.meta.set('usuario', r.usuario);
  return usuario;
}

export async function iniciarSesionLocal(nombre) {
  usuario = { id: 'local', nombre, email: '', rol: 'admin', local: true };
  await db.meta.set('usuario', usuario);
  return usuario;
}

export async function cerrarSesion() {
  const pend = await db.numPendientes();
  if (api.HAY_SERVIDOR) { try { await api.salir(); } catch { /* da igual */ } }
  usuario = null;
  // Si quedaba trabajo sin subir se conserva: se recupera al volver a entrar.
  if (pend > 0) await db.meta.del('usuario');
  else await db.limpiarTodo();
}

/** Refresca los datos de la sesión tras cambiar la foto o el perfil. */
export async function refrescarSesion() {
  if (!api.HAY_SERVIDOR || usuario?.local) return usuario;
  const r = await api.yo();
  usuario = conFoto(r.usuario);
  await db.meta.set('usuario', r.usuario);
  return usuario;
}

/* ═══════════════════════════════════════════════════════════════
   Mensajes de una vivienda, y quién los ha leído

   Un hilo por casa, común a todo el proyecto. No es el hilo de una
   tarea —ese va dentro de la tarea y habla de un remate concreto—:
   este es para lo que no cabe en ninguna tarea, «mañana no hay agua en
   la 07» o «el de la piscina viene el jueves».

   Las lecturas van en tabla aparte, y ahí está el nudo de todo esto.
   Si fueran una lista dentro del mensaje, dos personas leyéndolo a la
   vez subirían cada una el mensaje entero con su propia lista y la
   última en llegar borraría la lectura de la otra. Siendo filas, cada
   una con su id —mensaje + persona—, dos lecturas simultáneas no se
   pisan: son registros distintos que no se tocan.
   ═══════════════════════════════════════════════════════════════ */
/**
 * ¿Lo escribió quien tiene la sesión abierta?
 *
 * Se compara por id, y por nombre solo cuando no hay id. El servidor
 * guarda `creado_por` únicamente si es un UUID —los identificadores de
 * andar por casa como `local` no pasan el filtro— así que un registro
 * que ha ido y vuelto puede llegar sin autor. Sin este respaldo, quien
 * lo escribió dejaría de reconocer su propio mensaje en cuanto se
 * sincroniza: se vería los tics de otro y no podría borrarlo.
 */
export function esMio(registro) {
  if (!registro || !usuario) return false;
  if (registro.creadoPor) return registro.creadoPor === usuario.id;
  return !!registro.creadoPorNombre && registro.creadoPorNombre === usuario.nombre;
}

export async function mensajesDeUnidad(unidadId) {
  const todos = await db.porIndice('mensajes', 'unidadId', unidadId);
  return todos.filter((m) => !m.borrada).sort((a, b) => a.creado.localeCompare(b.creado));
}

export async function escribirMensaje(unidadId, promoId, texto) {
  const limpio = String(texto || '').trim();
  if (!limpio) return null;
  const m = {
    id: nuevoId(),
    unidadId,
    promoId: promoId || '',
    texto: limpio,
    borrada: false,
    creado: ahora(),
    actualizado: ahora(),
    creadoPor: usuario?.id || 'local',
    creadoPorNombre: usuario?.nombre || 'Sin identificar',
    creadoPorEmpresa: usuario?.empresa || '',
  };
  await db.put('mensajes', m);
  await encolar('mensaje', m.id);
  // Lo que uno escribe lo ha leído: sin esto, el autor se vería una
  // bolita azul en su propio mensaje.
  await marcarLeido(m.id);
  return m;
}

/**
 * Solo lo borra quien lo escribió. No es una regla de permisos, es de
 * conversación: si un tercero puede hacer desaparecer lo que dijiste, el
 * hilo deja de servir para acordarse de nada. El servidor lo comprueba
 * otra vez, porque el navegador no es de fiar.
 */
export async function borrarMensaje(id) {
  const m = await db.get('mensajes', id);
  if (!m) return null;
  if (!esMio(m) && usuario?.rol !== 'admin') {
    throw new Error('Solo quien lo escribió puede borrarlo.');
  }
  const nuevo = { ...m, borrada: true, actualizado: ahora() };
  await db.put('mensajes', nuevo);
  await encolar('mensaje', id);
  return nuevo;
}

/** Todas las lecturas de un mensaje, vengan de quien vengan. */
export async function lecturasDe(mensajeId) {
  return db.porIndice('lecturas', 'mensajeId', mensajeId);
}

/**
 * Deja constancia de que esta persona ha leído este mensaje.
 *
 * El id lo forman mensaje y persona, así que marcarlo dos veces escribe
 * la misma fila: no hay duplicados que limpiar ni contador que pueda
 * descuadrarse. Y como ya existe, la segunda vez ni siquiera se encola.
 */
export async function marcarLeido(mensajeId) {
  const quien = usuario?.id || 'local';
  const id = `${mensajeId}:${quien}`;
  if (await db.get('lecturas', id)) return null;
  const l = { id, mensajeId, usuarioId: quien, creado: ahora(), actualizado: ahora() };
  await db.put('lecturas', l);
  await encolar('lectura', id);
  return l;
}

/**
 * Cuántos mensajes sin leer tiene cada vivienda: un Map de unidad a
 * cuántos. Es la bolita azul del listado.
 *
 * Se lee todo de golpe y se cuenta en memoria en lugar de preguntar
 * vivienda por vivienda. Son cincuenta casas, y cincuenta idas y
 * venidas a IndexedDB se notan al abrir la pantalla.
 */
export async function sinLeerPorUnidad(promoId) {
  const quien = usuario?.id || 'local';
  const mensajes = (await db.getAll('mensajes'))
    .filter((m) => !m.borrada && (!promoId || m.promoId === promoId));
  if (!mensajes.length) return new Map();

  const leidos = new Set((await db.getAll('lecturas'))
    .filter((l) => l.usuarioId === quien)
    .map((l) => l.mensajeId));

  const salida = new Map();
  for (const m of mensajes) {
    if (esMio(m) || leidos.has(m.id)) continue;
    salida.set(m.unidadId, (salida.get(m.unidadId) || 0) + 1);
  }
  return salida;
}

/**
 * Los tics de un mensaje: 0 sin leer por nadie, 1 leído por alguien, 2
 * leído por todos.
 *
 * «Todos» son las personas activas del directorio menos quien lo
 * escribió: nadie espera un tic de sí mismo. Si el directorio todavía no
 * ha bajado, se responde 1 en cuanto haya una lectura en vez de prometer
 * dos que no se pueden comprobar.
 */
export async function ticsDe(mensaje) {
  const leidas = (await lecturasDe(mensaje.id)).filter((l) => l.usuarioId !== mensaje.creadoPor);
  if (!leidas.length) return 0;
  const equipo = [...personas.values()].filter((p) => p.activo !== false && p.id !== mensaje.creadoPor);
  if (!equipo.length) return 1;
  return leidas.length >= equipo.length ? 2 : 1;
}

/* ─── Estado de sincronización (observable simple) ────────────── */
const oyentes = new Set();
export const estadoSync = {
  online: navigator.onLine,
  pendientes: 0,
  sincronizando: false,
  ultimo: null,
  error: null,
  // Sube cada vez que una bajada trae datos nuevos. La pantalla activa
  // lo vigila para repintarse sola: si no, quien acaba de entrar vería
  // ceros hasta cambiar de pantalla.
  revision: 0,
};
export function alCambiarSync(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
function avisar() {
  for (const fn of oyentes) { try { fn(estadoSync); } catch { /* nada */ } }
}
async function refrescarPendientes() {
  estadoSync.pendientes = await db.numPendientes();
  avisar();
}

window.addEventListener('online', () => { estadoSync.online = true; avisar(); sincronizar(); });
window.addEventListener('offline', () => { estadoSync.online = false; avisar(); });

/* ─── Listas de repaso ────────────────────────────────────────── */
export async function listasDeUnidad(unidadId) {
  const todas = await db.porIndice('listas', 'unidadId', unidadId);
  return todas.filter((l) => !l.borrada).sort((a, b) => b.creado.localeCompare(a.creado));
}

export async function lista(id) {
  const l = await db.get('listas', id);
  return l && !l.borrada ? l : null;
}

/**
 * `autor` permite firmar en nombre de otra persona del equipo. Solo lo
 * usa la creación de datos de ejemplo; el trabajo de verdad lo firma
 * siempre quien tiene la sesión abierta.
 */
export async function crearLista({ unidadId, promoId, fase = FASE_UNICA, nombre = '', autor = null }) {
  const quien = autor || usuario;
  const l = {
    id: nuevoId(),
    unidadId, promoId,
    // El campo sigue en el esquema del servidor y en las actas ya
    // firmadas; la app dejó de dividirlas en pre y post.
    fase,
    // Vacío a propósito: el acta se llama como la vivienda hasta que
    // alguien decida ponerle otro nombre, y así renombrar la vivienda
    // no deja actas con un nombre viejo pegado.
    nombre,
    cerrada: false,
    borrada: false,
    creado: ahora(),
    actualizado: ahora(),
    creadoPor: quien?.id || 'local',
    creadoPorNombre: quien?.nombre || 'Sin identificar',
  };
  await db.put('listas', l);
  await encolar('lista', l.id);
  return l;
}

export async function actualizarLista(id, cambios) {
  const l = await db.get('listas', id);
  if (!l) return null;
  const nueva = { ...l, ...cambios, actualizado: ahora() };
  await db.put('listas', nueva);
  await encolar('lista', id);
  return nueva;
}

export async function borrarLista(id) {
  const tareas = await db.porIndice('tareas', 'listaId', id);
  for (const t of tareas) await borrarTarea(t.id);
  return actualizarLista(id, { borrada: true });
}

/* ─── Tareas ──────────────────────────────────────────────────── */
export async function tareasDeLista(listaId) {
  const todas = await db.porIndice('tareas', 'listaId', listaId);
  return todas.filter((t) => !t.borrada).sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

export async function tarea(id) {
  const t = await db.get('tareas', id);
  return t && !t.borrada ? t : null;
}

export async function crearTarea({ listaId, texto, oficio = OFICIO_POR_DEFECTO, zona = '', fechaLimite = null, autor = null }) {
  const hermanas = await tareasDeLista(listaId);
  const quien = autor || usuario;
  const t = {
    id: nuevoId(),
    listaId,
    texto: texto || '',
    oficio: oficio || OFICIO_POR_DEFECTO,
    zona: zona || '',
    fechaLimite: fechaLimite || null,
    estado: 'pendiente',
    orden: hermanas.length ? Math.max(...hermanas.map((x) => x.orden || 0)) + 1 : 1,
    portadaId: null,
    borrada: false,
    creado: ahora(),
    actualizado: ahora(),
    creadoPor: quien?.id || 'local',
    creadoPorNombre: quien?.nombre || 'Sin identificar',
  };
  await db.put('tareas', t);
  await encolar('tarea', t.id);
  return t;
}

export async function actualizarTarea(id, cambios) {
  const t = await db.get('tareas', id);
  if (!t) return null;
  const nueva = { ...t, ...cambios, actualizado: ahora() };
  if (cambios.estado && cambios.estado !== t.estado) {
    nueva.estadoPor = usuario?.nombre || 'Sin identificar';
    nueva.estadoEn = ahora();
  }
  await db.put('tareas', nueva);
  await encolar('tarea', id);
  return nueva;
}

/**
 * Cambia el estado de una tarea dejando constancia de por qué.
 *
 * Rechazar es decir que un arreglo no vale: quien lo hace tiene que
 * explicarlo, y la explicación queda en el hilo de la tarea marcada como
 * rechazo, con su fecha y su firma. Ese hilo es el historial de rechazos:
 * si una tarea rebota tres veces, quedan los tres motivos, y no se pisan
 * unos a otros.
 *
 * La bandera `rechazada` se sigue escribiendo aunque el estado ya lo
 * diga. Es para los móviles que todavía tengan la versión anterior en
 * caché: ellos no conocen el estado `rechazada` y sin la bandera verían
 * la tarea como pendiente y sin la banda roja. Se puede quitar cuando
 * haga tiempo que no queda ninguno.
 *
 * @param {string} nuevo  'pendiente' | 'resuelta' | 'rechazada' | 'verificada'
 * @param {{texto?: string, imagen?: {blob: Blob, mime: string, ancho: number, alto: number}}} nota
 */
export async function cambiarEstado(tareaId, nuevo, nota = {}) {
  const t = await db.get('tareas', tareaId);
  if (!t) return null;
  if (t.estado === nuevo) return t;

  if ((nuevo === 'verificada' || nuevo === 'rechazada') && !puedeVerificar(usuario)) {
    throw new Error('No tienes permiso para verificar ni rechazar tareas.');
  }

  const rechazo = nuevo === 'rechazada';
  const actualizada = await actualizarTarea(tareaId, {
    estado: nuevo,
    rechazada: rechazo,
  });

  // El comentario se crea también cuando solo hay fotos y ningún texto:
  // al completar, el mensaje es opcional y las fotos son la prueba, así
  // que sin él no tendrían de dónde colgar.
  const fotos = nota.imagenes || (nota.imagen ? [nota.imagen] : []);
  if (nota.texto || fotos.length) {
    await añadirComentario(tareaId, {
      texto: nota.texto || '',
      tipo: rechazo ? 'rechazo' : 'nota',
      imagenes: fotos,
    });
  }
  return actualizada;
}

/** Rechazar siempre exige explicación; lo demás, no. */
export function exigeExplicacion(tarea, nuevo) {
  return !!tarea && nuevo === 'rechazada' && tarea.estado !== 'rechazada';
}

/**
 * Dar una tarea por completada exige enseñar la reparación.
 *
 * Es la regla que sostiene todo lo demás: sin foto, «completada» es la
 * palabra de alguien contra la de nadie, y quien tiene que verificarla
 * se planta en la vivienda sin saber qué va a encontrarse. Con una
 * basta para activar el botón; el tope son diez.
 *
 * Solo al entrar en `resuelta`. Verificar y rechazar tienen sus propias
 * reglas, y volver a pendiente no hace falta demostrarlo.
 */
export function exigeFotos(tarea, nuevo) {
  return !!tarea && nuevo === 'resuelta';
}

/* ─── Hilo de la tarea ────────────────────────────────────────── */
export async function comentariosDeTarea(tareaId) {
  const todos = await db.porIndice('comentarios', 'tareaId', tareaId);
  return todos.filter((c) => !c.borrada).sort((a, b) => a.creado.localeCompare(b.creado));
}

/**
 * Una entrada en el hilo de la tarea, con las fotos que la acompañen.
 *
 * Las fotos van colgadas del comentario y no de la tarea a secas, y eso
 * es lo que separa los dos carretes: lo que cuelga de la tarea es el
 * defecto, lo que cuelga de un comentario es lo que pasó después. Y
 * como cada intento de completar trae su propio comentario, las fotos
 * de un intento rechazado se quedan con él: son la prueba de lo que la
 * constructora dijo que estaba arreglado.
 */
export async function añadirComentario(tareaId, { texto, tipo = 'nota', imagen, imagenes }) {
  const c = {
    id: nuevoId(),
    tareaId,
    texto: texto || '',
    tipo,
    borrada: false,
    creado: ahora(),
    actualizado: ahora(),
    creadoPor: usuario?.id || 'local',
    creadoPorNombre: usuario?.nombre || 'Sin identificar',
    creadoPorEmpresa: usuario?.empresa || '',
  };
  await db.put('comentarios', c);
  await encolar('comentario', c.id);

  for (const img of [...(imagenes || []), ...(imagen ? [imagen] : [])]) {
    await añadirMedio(tareaId, {
      tipo: 'imagen',
      blob: img.blob,
      mime: img.mime,
      ancho: img.ancho,
      alto: img.alto,
      comentarioId: c.id,
    });
  }
  return c;
}

export async function borrarComentario(id) {
  const c = await db.get('comentarios', id);
  if (!c) return;
  await db.put('comentarios', { ...c, borrada: true, actualizado: ahora() });
  await encolar('comentario', id);
}

/** Imágenes adjuntas a un comentario concreto. */
export async function mediosDeComentario(comentarioId) {
  const todos = await db.getAll('medios');
  return todos.filter((m) => !m.borrada && m.comentarioId === comentarioId);
}

export async function borrarTarea(id) {
  const medios = await db.porIndice('medios', 'tareaId', id);
  for (const m of medios) await borrarMedio(m.id, { silencioso: true });
  for (const c of await comentariosDeTarea(id)) await borrarComentario(c.id);
  return actualizarTarea(id, { borrada: true });
}

/* ─── Medios ──────────────────────────────────────────────────── */
/** Material de la tarea. Las fotos del hilo no entran aquí: viven en
    su comentario y no deben mezclarse con el carrete de la tarea. */
export async function mediosDeTarea(tareaId) {
  const todos = await db.porIndice('medios', 'tareaId', tareaId);
  return todos.filter((m) => !m.borrada && !m.comentarioId)
    .sort((a, b) => a.creado.localeCompare(b.creado));
}

/**
 * Las fotos de verificación: las que cuelgan de algún comentario, en
 * orden. Son el otro carrete, el de cómo quedó.
 *
 * Se devuelven todas y no solo las del último intento a propósito: si
 * una tarea rebotó dos veces, las fotos de los dos intentos anteriores
 * siguen ahí, y en una discusión de obra eso vale dinero.
 */
export async function fotosDeVerificacion(tareaId) {
  const todos = await db.porIndice('medios', 'tareaId', tareaId);
  return todos.filter((m) => !m.borrada && m.comentarioId && m.tipo === 'imagen')
    .sort((a, b) => a.creado.localeCompare(b.creado));
}

export async function añadirMedio(tareaId, { tipo, blob, mime, ancho, alto, duracion, nombre, comentarioId }) {
  const m = {
    id: nuevoId(),
    tareaId,
    comentarioId: comentarioId || null,
    tipo,                                  // 'imagen' | 'video' | 'audio'
    mime: mime || blob.type || 'application/octet-stream',
    tam: blob.size,
    ancho: ancho || 0,
    alto: alto || 0,
    duracion: duracion || 0,
    nombre: nombre || '',
    blob,
    subido: false,
    borrada: false,
    creado: ahora(),
    actualizado: ahora(),
  };
  await db.put('medios', m);
  // La primera imagen de la tarea es su portada en el listado. Las del
  // hilo nunca lo son: describen la corrección, no el defecto.
  const t = await db.get('tareas', tareaId);
  if (t && !t.portadaId && tipo === 'imagen' && !comentarioId) {
    await db.put('tareas', { ...t, portadaId: m.id, actualizado: ahora() });
    await encolar('tarea', tareaId);
  }
  await encolar('medio', m.id);
  return m;
}

export async function borrarMedio(id, { silencioso = false } = {}) {
  const m = await db.get('medios', id);
  if (!m) return;
  await db.put('medios', { ...m, borrada: true, blob: null, actualizado: ahora() });
  await encolar('medio-borrado', id);
  if (!silencioso) {
    const t = await db.get('tareas', m.tareaId);
    if (t && t.portadaId === id) {
      const resto = (await mediosDeTarea(m.tareaId)).filter((x) => x.tipo === 'imagen');
      await actualizarTarea(t.id, { portadaId: resto[0]?.id || null });
    }
  }
}

/** Marca cuál de las imágenes encabeza la tarea en el listado. */
export async function fijarPortada(tareaId, medioId) {
  return actualizarTarea(tareaId, { portadaId: medioId });
}

/* URL utilizable en <img>/<video>: el blob local si lo hay, si no el
   servidor. Se cachean las URL de objeto para no crear una por pintada. */
const urlsCache = new Map();
export function urlDeMedio(m) {
  if (!m) return '';
  if (m.blob) {
    if (!urlsCache.has(m.id)) urlsCache.set(m.id, URL.createObjectURL(m.blob));
    return urlsCache.get(m.id);
  }
  if (m.subido && api.HAY_SERVIDOR) return api.urlMedio(m.id);
  return '';
}
export async function urlDePortada(tarea) {
  if (!tarea?.portadaId) {
    const [primera] = (await mediosDeTarea(tarea.id)).filter((m) => m.tipo === 'imagen');
    return primera ? urlDeMedio(primera) : '';
  }
  const m = await db.get('medios', tarea.portadaId);
  return m && !m.borrada ? urlDeMedio(m) : '';
}

/* ─── Resúmenes para los selectores ───────────────────────────── */
/** Por unidad: nº de listas y de tareas pendientes. */
/**
 * Cifras por vivienda de una promoción, ya con el criterio de la app:
 * HECHA = verificada. Trae también los oficios que aparecen en sus
 * tareas para poder filtrar la lista de viviendas por gremio.
 */
export async function resumenPorUnidad(promoId) {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada && l.promoId === promoId);
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada);
  const unidadDeLista = new Map(listas.map((l) => [l.id, l.unidadId]));

  const salida = new Map();
  const dame = (unidadId) => {
    if (!salida.has(unidadId)) {
      salida.set(unidadId, {
        listas: 0, total: 0, hechas: 0, pendientes: 0, esperando: 0, rechazadas: 0,
        oficios: new Set(), oficiosAbiertos: new Set(), ultima: null,
        // `movimiento` es la última vez que se tocó algo aquí, no la
        // última acta abierta: una casa con un acta de hace un mes y
        // una tarea resuelta ayer se está moviendo.
        movimiento: null, autores: new Map(), gente: [],
      });
    }
    return salida.get(unidadId);
  };
  const mover = (v, cuando) => { if (cuando && (!v.movimiento || cuando > v.movimiento)) v.movimiento = cuando; };
  const apuntar = (v, id, nombre) => {
    if (!nombre) return;
    const a = v.autores.get(nombre);
    if (a) a.n++;
    else v.autores.set(nombre, { id: id || nombre, nombre, n: 1 });
  };

  for (const l of listas) {
    const v = dame(l.unidadId);
    v.listas++;
    if (!v.ultima || l.creado > v.ultima) v.ultima = l.creado;
    mover(v, l.actualizado || l.creado);
  }
  for (const t of tareas) {
    const unidadId = unidadDeLista.get(t.listaId);
    if (!unidadId) continue;
    const v = dame(unidadId);
    v.total++;
    v.oficios.add(oficioDe(t));
    apuntar(v, t.creadoPor, t.creadoPorNombre);
    mover(v, t.actualizado || t.creado);
    if (hecha(t)) { v.hechas++; continue; }
    v.oficiosAbiertos.add(oficioDe(t));
    if (esperandoVisto(t)) v.esperando++;
    else v.pendientes++;
    // Las rechazadas van ya contadas arriba como pendientes —es trabajo
    // de la constructora igual—; esto es aparte, para poder decir
    // cuántas rebotaron sin sacarlas de donde les toca.
    if (rebotada(t)) v.rechazadas++;
  }

  // Delante quien más ha metido mano: la pila de caras es ornamental,
  // pero si va a decir algo que diga quién lleva el peso de esa casa.
  for (const v of salida.values()) {
    v.gente = [...v.autores.values()]
      .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre))
      .map(({ id, nombre }) => ({ id, nombre }));
    delete v.autores;
  }
  return salida;
}

/**
 * Si un contenedor —una vivienda o un acta— encaja con el filtro de
 * estado. Lo usan las tres pantallas que listan contenedores, para que
 * el mismo chip signifique lo mismo en todas.
 *
 * «Pendientes», «Completadas» y «Rechazadas» preguntan si hay AL MENOS
 * UNA así, porque lo que se busca con ellas es dónde ir. «Verificadas»
 * exige que lo estén TODAS: una vivienda con una sola tarea verificada
 * y nueve pendientes no está verificada, y si apareciera en ese filtro
 * no serviría de nada.
 *
 * Pendiente descuenta las rechazadas aunque el resumen las lleve
 * sumadas: son dos chips distintos y tienen que enseñar cosas
 * distintas, o pedir «pendientes» sacaría casas donde lo único que hay
 * es trabajo rebotado.
 */
export function encajaEstado(c, estado) {
  if (!estado || estado === 'todas') return true;
  if (estado === 'verificada') return c.total > 0 && c.hechas === c.total;
  if (estado === 'resuelta') return c.esperando > 0;
  if (estado === 'rechazada') return (c.rechazadas || 0) > 0;
  return c.pendientes - (c.rechazadas || 0) > 0;
}

/**
 * Los oficios contra los que cruzar el filtro. Buscando lo pendiente,
 * lo completado o lo rechazado solo cuentan los oficios que siguen
 * vivos; en los demás casos, todo lo que haya pasado por ahí. Si no, al
 * pedir «pintura pendiente» saldrían viviendas donde la pintura ya está
 * verificada y lo que queda abierto es de fontanería.
 */
export function oficiosSegun(c, estado) {
  const vivos = estado === 'pendiente' || estado === 'resuelta' || estado === 'rechazada';
  return vivos ? c.oficiosAbiertos : c.oficios;
}

/**
 * Los gremios que de verdad se usan, del más al menos frecuente.
 *
 * Primero cuentan los de esta vivienda —si en la Villa 07 lo que sale
 * siempre es pintura, esa va delante— y detrás se completan con los del
 * resto de la promoción, para que la lista corta esté llena desde el
 * primer repaso de una casa recién empezada. Al final, «General», que
 * es la salida cuando no encaja ninguno.
 */
export async function oficiosMasUsados(unidadId, cuantos = 5) {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada);
  const deAqui = new Set(listas.filter((l) => l.unidadId === unidadId).map((l) => l.id));
  const vivas = new Set(listas.map((l) => l.id));
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada && vivas.has(t.listaId));

  const contar = (lista) => {
    const cuenta = new Map();
    for (const t of lista) {
      const o = t.oficio || OFICIO_POR_DEFECTO;
      cuenta.set(o, (cuenta.get(o) || 0) + 1);
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([o]) => o);
  };

  const orden = [];
  for (const o of [...contar(tareas.filter((t) => deAqui.has(t.listaId))),
    ...contar(tareas), OFICIO_POR_DEFECTO]) {
    if (!orden.includes(o)) orden.push(o);
  }
  return orden.slice(0, cuantos);
}

/* ─── Recorridos ──────────────────────────────────────────────────
   Un recorrido es material de trabajo, no el repaso: vive solo en este
   dispositivo y no viaja al servidor. Cuando se convierte en tareas,
   son las tareas las que se suben; el recorrido se queda de respaldo
   —con el audio dentro— hasta que alguien lo retire. */
export async function guardarRecorrido(rec) {
  await db.put('recorridos', rec);
  return rec;
}

export async function recorridosDeUnidad(unidadId) {
  return db.porIndice('recorridos', 'unidadId', unidadId);
}

/**
 * El recorrido ya es un acta con sus tareas. Se sueltan las fotos —cada
 * una está ya copiada dentro de su tarea, y guardarlas dos veces llena
 * el móvil— y se conserva el audio, que es lo único que no está en
 * ningún otro sitio: es lo que se dijo mientras se andaba.
 */
export async function marcarRecorridoUsado(id, listaId) {
  const r = await db.get('recorridos', id);
  if (!r) return null;
  const nuevo = {
    ...r, usado: true, listaId, usadoEn: ahora(),
    marcas: (r.marcas || []).map(({ blob, ...resto }) => resto),
  };
  await db.put('recorridos', nuevo);
  await barrerRecorridos();
  return nuevo;
}

/**
 * Los recorridos usados no son para siempre. Pasado un mes ya nadie
 * vuelve a oír el audio de un repaso cuyas tareas están en marcha, y en
 * un iPhone que se queda sin sitio el navegador borra la base entera
 * sin preguntar. Se limpia solo, cuando toca.
 */
const VIDA_RECORRIDO = 30 * 24 * 60 * 60 * 1000;

async function barrerRecorridos() {
  const limite = Date.now() - VIDA_RECORRIDO;
  for (const r of await db.getAll('recorridos')) {
    if (r.usado && new Date(r.usadoEn || r.creado).getTime() < limite) {
      await db.borrar('recorridos', r.id);
    }
  }
}

export async function borrarRecorrido(id) {
  return db.borrar('recorridos', id);
}

/** Cuántas actas vivas tiene una promoción. Para el enlace al archivo. */
export async function cuantasActas(promoId = null) {
  return (await db.getAll('listas'))
    .filter((l) => !l.borrada && (!promoId || l.promoId === promoId)).length;
}

/** Conteo de un acta. `hechas` son las verificadas y solo esas. */
export async function contarLista(listaId) {
  return contar(await tareasDeLista(listaId));
}

function contar(tareas) {
  return {
    total: tareas.length,
    hechas: tareas.filter(hecha).length,
    esperando: tareas.filter(esperandoVisto).length,
    // `pendientes` es todo lo que está en el tejado de la constructora,
    // rechazadas incluidas: si contara solo las de estado `pendiente`,
    // las cuatro cifras no sumarían el total y la barra de avance
    // dejaría un hueco sin explicar. `rechazadas` va aparte, como
    // subconjunto, para poder sacarlas en su propio tramo.
    pendientes: tareas.filter(enObra).length,
    rechazadas: tareas.filter(rebotada).length,
    // Dos conjuntos, porque los filtros preguntan cosas distintas:
    // «pintura» a secas es «aquí hubo pintura»; «pendientes + pintura»
    // es «aquí queda pintura por cerrar».
    oficios: new Set(tareas.map(oficioDe)),
    oficiosAbiertos: new Set(tareas.filter((t) => !hecha(t)).map(oficioDe)),
  };
}

const oficioDe = (t) => t.oficio || OFICIO_POR_DEFECTO;

/** Porcentaje de avance, redondeado. Sin tareas, cero. */
export const avance = (c) => (c && c.total ? Math.round((100 * c.hechas) / c.total) : 0);

/**
 * Todas las actas con lo que necesita su tarjeta ya calculado: quién ha
 * participado, cuántas tareas y en qué estado. Se resuelve de una vez y
 * no acta por acta porque con cincuenta villas y varias inspecciones
 * cada una, ir a IndexedDB por cada tarjeta se nota al desplazar.
 */
export async function actasConDatos({ promoId = null } = {}) {
  const listas = (await db.getAll('listas'))
    .filter((l) => !l.borrada && (!promoId || l.promoId === promoId));
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada);

  return fichasDeActa(listas, tareas)
    .sort((a, b) => b.lista.actualizado.localeCompare(a.lista.actualizado));
}

/**
 * Monta lo que pide la tarjeta de un acta: el acta, sus cifras y quién
 * ha participado. Vive aquí, y no en cada pantalla, porque la pestaña
 * de ACTAS y el pie de cada vivienda enseñan la misma tarjeta y tienen
 * que contar exactamente lo mismo. Si una contara distinto de la otra,
 * el porcentaje del anillo cambiaría según por dónde se mire.
 */
function fichasDeActa(listas, tareas) {
  const porLista = new Map();
  for (const t of tareas) {
    if (!porLista.has(t.listaId)) porLista.set(t.listaId, []);
    porLista.get(t.listaId).push(t);
  }
  return listas.map((l) => {
    const suyas = porLista.get(l.id) || [];
    return { lista: l, conteo: contar(suyas), gente: participantes(l, suyas) };
  });
}

/**
 * Un acta está terminada cuando tiene tareas y todas están verificadas.
 * Una sin tareas no lo está: está abierta y vacía, que es otra cosa.
 */
export const actaTerminada = (c) => !!(c && c.total > 0 && c.hechas === c.total);

/**
 * Primero lo que queda por hacer y después lo terminado, cada grupo de
 * lo más reciente a lo más antiguo.
 *
 * Las terminadas no se esconden, se apartan: un acta firmada sigue
 * siendo el documento al que se vuelve cuando alguien pregunta quién
 * vio qué y cuándo. Lo que no puede es estorbar por encima de lo que
 * todavía hay que resolver.
 */
export function ordenarActas(actas) {
  return actas.slice().sort((a, b) => {
    const ta = actaTerminada(a.conteo) ? 1 : 0;
    const tb = actaTerminada(b.conteo) ? 1 : 0;
    if (ta !== tb) return ta - tb;
    return b.lista.creado.localeCompare(a.lista.creado);
  });
}

/**
 * Quién ha tocado un acta: quien la creó y quien haya metido tareas en
 * ella. Se devuelven como fichas ligeras (id y nombre), que es lo que
 * necesita la bolita para su color y sus iniciales.
 */
function participantes(lista, tareas) {
  const vistos = new Map();
  const meter = (id, nombre) => {
    if (!nombre || vistos.has(nombre)) return;
    vistos.set(nombre, { id: id || nombre, nombre });
  };
  meter(lista.creadoPor, lista.creadoPorNombre);
  for (const t of tareas) meter(t.creadoPor, t.creadoPorNombre);
  return [...vistos.values()];
}

/** Cifras de los dos widgets de la portada. */
export async function resumenGeneral() {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada);
  const vivas = new Set(listas.map((l) => l.id));
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada && vivas.has(t.listaId));
  const c = contar(tareas);
  return {
    listas: listas.length,
    viviendas: new Set(listas.map((l) => l.unidadId)).size,
    total: c.total,
    hechas: c.hechas,
    esperando: c.esperando,
    pendientes: c.pendientes,
    rechazadas: c.rechazadas,
    ultima: listas.map((l) => l.creado).sort().pop() || null,
  };
}

/**
 * Verificaciones por día de la última semana, para las barras de la
 * portada. Se cuenta por `estadoEn`, que es cuando alguien dio el visto
 * bueno, no por cuándo se creó la tarea.
 *
 * Los sellos son UTC y el día que le importa a quien mira es el suyo,
 * así que la fecha se parte en local y no cortando la cadena ISO.
 */
export async function verificadasPorDia(dias = 7) {
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada && hecha(t) && t.estadoEn);
  const cuenta = new Map();
  for (const t of tareas) {
    const d = new Date(t.estadoEn);
    if (Number.isNaN(d.getTime())) continue;
    cuenta.set(claveDia(d), (cuenta.get(claveDia(d)) || 0) + 1);
  }

  const INICIALES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const salida = [];
  const hoy = new Date();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
    salida.push({
      inicial: INICIALES[d.getDay()],
      n: cuenta.get(claveDia(d)) || 0,
      hoy: i === 0,
    });
  }
  const total = salida.reduce((a, x) => a + x.n, 0);
  return {
    dias: salida,
    hoy: salida[salida.length - 1].n,
    media: Math.round(total / dias),
    tope: Math.max(1, ...salida.map((x) => x.n)),
  };
}

const claveDia = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Todas las tareas de una vivienda, de todas sus actas juntas. Es lo
 * que se ve al entrar en una villa: allí no importa en qué inspección
 * salió cada cosa, sino qué queda por hacer en esa casa.
 */
export async function tareasDeUnidad(unidadId) {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada && l.unidadId === unidadId);
  const suyas = new Set(listas.map((l) => l.id));
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada && suyas.has(t.listaId));
  // Las fichas se montan antes de ordenar las tareas para que la pila de
  // caras salga igual que en la pestaña de ACTAS, que las recibe tal
  // cual vienen de la base.
  const actas = ordenarActas(fichasDeActa(listas, tareas));
  return {
    actas,
    tareas: tareas.sort((a, b) => b.actualizado.localeCompare(a.actualizado)),
    conteo: contar(tareas),
  };
}

/**
 * Las últimas tareas tocadas de toda la promoción, con la vivienda a la
 * que pertenecen: en un listado mezclado, «rodapié sin sellar» no dice
 * nada si no se sabe de qué villa es.
 */
export async function tareasRecientes(n = 12, { promoId = null } = {}) {
  const listas = (await db.getAll('listas'))
    .filter((l) => !l.borrada && (!promoId || l.promoId === promoId));
  const donde = new Map(listas.map((l) => [l.id, l.unidadId]));
  const tareas = (await db.getAll('tareas'))
    .filter((t) => !t.borrada && donde.has(t.listaId))
    .sort((a, b) => b.actualizado.localeCompare(a.actualizado))
    .slice(0, n);
  return Promise.all(tareas.map(async (t) => ({
    tarea: t,
    unidadId: donde.get(t.listaId),
    portada: await urlDePortada(t),
  })));
}

/** Cifras de toda una promoción, para la barra de la portada. */
export async function resumenPromocion(promoId) {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada && l.promoId === promoId);
  const suyas = new Set(listas.map((l) => l.id));
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada && suyas.has(t.listaId));
  return { ...contar(tareas), listas: listas.length };
}

/**
 * Cuántas tareas se movieron a un estado después de una fecha, para los
 * contadores que acumulan de la portada.
 *
 * Se cuenta, no se lleva un marcador aparte. Un contador guardado se
 * descuadra —una tarea que se borra, un móvil que sube tarde— y no hay
 * manera de saber si el número es verdad; esto se recalcula de cero
 * cada vez que se pinta la pantalla y siempre cuadra con lo que hay.
 *
 * `desde` vacío significa «desde siempre», que es lo que corresponde la
 * primera vez que alguien abre la app.
 */
export async function cuantasDesde(estadoBuscado, desde, { promoId = null } = {}) {
  const listas = (await db.getAll('listas'))
    .filter((l) => !l.borrada && (!promoId || l.promoId === promoId));
  const suyas = new Set(listas.map((l) => l.id));
  return (await db.getAll('tareas')).filter((t) =>
    !t.borrada
    && suyas.has(t.listaId)
    && t.estado === estadoBuscado
    // `estadoEn` es cuándo se puso el estado. Sin él —tareas de antes de
    // que se guardara— vale `actualizado`, que se le parece bastante.
    && (!desde || (t.estadoEn || t.actualizado || '') > desde)).length;
}

/**
 * Todo lo que pinta la home del rediseño, calculado de una vez.
 *
 * El módulo de Brassie necesita tres cosas que no da el resumen normal:
 * la fecha de la última tarea sin verificar, las caras de quienes
 * tienen tareas sin verificar, y el muro de acontecimientos —cada
 * tarea que cambió de estado, con su villa, su fecha y su texto—
 * mezclado con los mensajes generales de la promoción.
 */
export async function datosHome(promoId) {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada && l.promoId === promoId);
  const casaDe = new Map(listas.map((l) => [l.id, l.unidadId]));
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada && casaDe.has(t.listaId));
  const c = contar(tareas);

  const sinVerificar = tareas.filter((t) => !hecha(t));
  const ultimaSinVerificar = sinVerificar.map((t) => t.creado).sort().pop() || null;

  // Una cara por persona con trabajo sin verificar, la más activa antes.
  const cuenta = new Map();
  for (const t of sinVerificar) {
    const clave = t.creadoPor || t.creadoPorNombre;
    const ficha = cuenta.get(clave) || { persona: persona(t.creadoPor, t.creadoPorNombre), n: 0 };
    ficha.n++;
    cuenta.set(clave, ficha);
  }
  const caras = [...cuenta.values()].sort((a, b) => b.n - a.n).map((x) => x.persona);

  // El muro: cada tarea con su último movimiento, más los mensajes
  // generales. El texto de una tarea movida es su último comentario si
  // lo hay —el motivo del rechazo, el parte del completado— y si no,
  // la propia descripción de la tarea.
  const comentarios = (await db.getAll('comentarios')).filter((x) => !x.borrada);
  const ultimoComentario = new Map();
  for (const x of comentarios.sort((a, b) => a.creado.localeCompare(b.creado))) {
    ultimoComentario.set(x.tareaId, x);
  }

  const muro = [];
  for (const t of tareas) {
    const cuando = t.estadoEn || t.actualizado || t.creado;
    const ult = ultimoComentario.get(t.id);
    muro.push({
      tipo: 'tarea',
      tareaId: t.id,
      listaId: t.listaId,
      unidadId: casaDe.get(t.listaId),
      estado: t.estado,
      cuando,
      quien: t.estado !== 'pendiente' && t.estadoPor
        ? t.estadoPor
        : t.creadoPorNombre,
      quienId: t.estado !== 'pendiente' ? null : t.creadoPor,
      texto: ult?.texto || t.texto,
    });
  }
  const generales = (await db.getAll('mensajes'))
    .filter((m) => !m.borrada && m.unidadId === 'general:' + promoId)
    .map((m) => ({
      tipo: 'mensaje',
      unidadId: null,
      estado: '',
      cuando: m.creado,
      quien: m.creadoPorNombre,
      quienId: m.creadoPor,
      texto: m.texto,
    }));

  muro.push(...generales);
  muro.sort((a, b) => (b.cuando || '').localeCompare(a.cuando || ''));

  return {
    conteo: c,
    ultimaSinVerificar,
    caras,
    sinVerificar: sinVerificar.length,
    muro: muro.slice(0, 14),
  };
}

/** Las últimas actas tocadas, para el listado de la portada. */
export async function listasRecientes(n = 15) {
  return (await actasConDatos()).slice(0, n);
}

/* ─── Directorio del equipo ───────────────────────────────────────
   Se guarda en memoria para poder consultarlo sin esperar: pintar una
   bolita no puede ser una operación asíncrona, o cada fila de una lista
   parpadearía al aparecer la cara. */
let personas = new Map();
let personasPorNombre = new Map();

export async function cargarPersonas() {
  const todas = await db.getAll('personas');
  personas = new Map(todas.map((p) => [p.id, p]));
  personasPorNombre = new Map(todas.map((p) => [clavePersona(p.nombre), p]));
  return personas;
}

const clavePersona = (n) => String(n || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Ficha para pintar la bolita de alguien: su foto si la tiene, y si no
 * el nombre para las iniciales. Se busca por identificador y, si no
 * aparece, por nombre: las tareas viejas guardan «local» como autor.
 */
/** El equipo entero, para elegir a quién atribuir algo. */
export function equipo() {
  return [...personas.values()]
    .filter((p) => p.activo !== false)
    .map((p) => ({ ...p, avatarUrl: api.urlAvatar(p.id, p.avatar) }));
}

export function persona(id, nombre) {
  const p = personas.get(id) || personasPorNombre.get(clavePersona(nombre));
  // Quien está usando la app es el caso más frecuente y su ficha ya
  // viene con la foto resuelta desde la sesión.
  if (!p && usuario && (usuario.id === id || clavePersona(usuario.nombre) === clavePersona(nombre))) {
    return usuario;
  }
  if (!p) return { id: id || nombre, nombre };
  return { ...p, avatarUrl: api.urlAvatar(p.id, p.avatar) };
}

/* ─── Outbox ──────────────────────────────────────────────────── */
async function encolar(tipo, id) {
  // Si ya hay un apunte para el mismo registro, no hace falta otro: al
  // subir se lee el estado actual, así que un solo apunte basta.
  const pend = await db.pendientes();
  if (!pend.some((p) => p.tipo === tipo && p.id === id)) {
    await db.encolar({ tipo, id });
  }
  await refrescarPendientes();
  programarSync();
}

let temporizador = null;
function programarSync() {
  if (!api.HAY_SERVIDOR || usuario?.local) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => sincronizar(), 600);
}

let sincronizando = null;

/** Sube lo pendiente y baja lo que haya cambiado en el servidor. */
export async function sincronizar({ forzar = false } = {}) {
  if (!api.HAY_SERVIDOR || usuario?.local || !usuario) return;
  if (!navigator.onLine && !forzar) return;
  if (sincronizando) return sincronizando;

  sincronizando = (async () => {
    estadoSync.sincronizando = true;
    estadoSync.error = null;
    avisar();
    try {
      await empujar();
      await tirar();
      estadoSync.ultimo = ahora();
      await db.meta.set('ultimoSync', estadoSync.ultimo);
    } catch (e) {
      estadoSync.error = e.status === 401 ? 'sesion' : 'red';
      if (e.status === 401) { usuario = null; await db.meta.del('usuario'); location.hash = '#/entrar'; }
    } finally {
      estadoSync.sincronizando = false;
      await refrescarPendientes();
      avisar();
    }
  })();
  try { await sincronizando; } finally { sincronizando = null; }
}

async function empujar() {
  const pend = await db.pendientes();
  for (const item of pend) {
    try {
      if (item.tipo === 'lista') {
        const l = await db.get('listas', item.id);
        if (l) await api.subirListas([sinBlobs(l)]);
      } else if (item.tipo === 'tarea') {
        const t = await db.get('tareas', item.id);
        if (t) await api.subirTareas([sinBlobs(t)]);
      } else if (item.tipo === 'comentario') {
        const c = await db.get('comentarios', item.id);
        if (c) await api.subirComentarios([sinBlobs(c)]);
      } else if (item.tipo === 'medio') {
        const m = await db.get('medios', item.id);
        if (m && !m.borrada && m.blob) {
          await api.subirMedio(m, m.blob);
          const guardado = await db.get('medios', item.id);
          if (guardado) {
            // El vídeo y el audio pesan demasiado para quedarse en el
            // dispositivo una vez a salvo en el servidor; las fotos sí
            // se conservan porque son la vista del listado.
            const soltar = guardado.tipo !== 'imagen';
            await db.put('medios', { ...guardado, subido: true, blob: soltar ? null : guardado.blob });
          }
        } else if (m && !m.blob && !m.borrada) {
          await db.put('medios', { ...m, subido: true });
        }
      } else if (item.tipo === 'mensaje') {
        const m = await db.get('mensajes', item.id);
        if (m) await api.subirMensajes([sinBlobs(m)]);
      } else if (item.tipo === 'lectura') {
        const l = await db.get('lecturas', item.id);
        // El servidor pone el usuario por su cuenta, así que solo hace
        // falta decirle qué mensaje se leyó y cuándo.
        if (l) await api.subirLecturas([{ mensajeId: l.mensajeId, creado: l.creado }]);
      } else if (item.tipo === 'medio-borrado') {
        try { await api.borrarMedioRemoto(item.id); }
        catch (e) { if (e.status !== 404) throw e; }
      }
      await db.desencolar(item.seq);
      await refrescarPendientes();
    } catch (e) {
      if (e.status === 401) throw e;
      // Un registro que el servidor rechaza por malformado bloquearía la
      // cola para siempre: tras varios intentos se aparta y sigue el resto.
      if (e.status >= 400 && e.status < 500 && (item.intentos || 0) >= 2) {
        await db.desencolar(item.seq);
        continue;
      }
      await db.marcarIntento(item);
      throw e;
    }
  }
}

async function tirar() {
  // El servidor devuelve los cambios por tandas; se pide otra mientras
  // diga que quedan más y la marca de tiempo siga avanzando (si no
  // avanzara, pedir otra vez traería exactamente lo mismo).
  for (let vuelta = 0; vuelta < 25; vuelta++) {
    const desde = (await db.meta.get('ultimoSync')) || '';
    const r = await fusionarTanda(desde);
    if (!r || !r.mas || r.ahora === desde) return;
  }
}

async function fusionarTanda(desde) {
  const r = await api.cambios(desde);
  if (!r) return null;

  if (r.personas?.length) {
    // El directorio no se fusiona por marca de tiempo: lo que manda el
    // servidor es la verdad, aquí nadie lo edita desde el dispositivo.
    await db.putVarios('personas', r.personas);
    await cargarPersonas();
  }
  if (r.listas?.length) {
    const fusionadas = [];
    for (const remota of r.listas) {
      const local = await db.get('listas', remota.id);
      if (!local || remota.actualizado >= local.actualizado) fusionadas.push(normalizarLista(remota));
    }
    await db.putVarios('listas', fusionadas);
  }
  if (r.tareas?.length) {
    const fusionadas = [];
    for (const remota of r.tareas) {
      const local = await db.get('tareas', remota.id);
      if (!local || remota.actualizado >= local.actualizado) fusionadas.push(normalizarTarea(remota));
    }
    await db.putVarios('tareas', fusionadas);
  }
  if (r.comentarios?.length) {
    const fusionados = [];
    for (const remoto of r.comentarios) {
      const local = await db.get('comentarios', remoto.id);
      if (!local || remoto.actualizado >= local.actualizado) fusionados.push(normalizarComentario(remoto));
    }
    await db.putVarios('comentarios', fusionados);
  }
  if (r.medios?.length) {
    const fusionados = [];
    for (const remoto of r.medios) {
      const local = await db.get('medios', remoto.id);
      if (local && local.blob && !remoto.borrada) {
        fusionados.push({ ...local, ...normalizarMedio(remoto), blob: local.blob });
      } else if (!local || remoto.actualizado >= local.actualizado) {
        fusionados.push({ ...normalizarMedio(remoto), blob: null });
      }
    }
    await db.putVarios('medios', fusionados);
  }
  if (r.mensajes?.length) {
    const fusionados = [];
    for (const remoto of r.mensajes) {
      const local = await db.get('mensajes', remoto.id);
      if (!local || remoto.actualizado >= local.actualizado) fusionados.push(normalizarMensaje(remoto));
    }
    await db.putVarios('mensajes', fusionados);
  }
  // Las lecturas no se fusionan por fecha: no se editan nunca. Una
  // lectura o está o no está, y la que llega es la misma que la que
  // pudiera haber, así que se escribe y ya.
  if (r.lecturas?.length) await db.putVarios('lecturas', r.lecturas);

  if (r.ahora) await db.meta.set('ultimoSync', r.ahora);

  // La revisión sube al final, con todo ya escrito: si se avisara antes,
  // la pantalla se repintaría con los datos de hace un momento y se
  // quedaría así hasta el siguiente cambio.
  if (r.listas?.length || r.tareas?.length || r.medios?.length || r.comentarios?.length
      || r.mensajes?.length || r.lecturas?.length) {
    estadoSync.revision++;
  }
  return r;
}

// El backend devuelve 0/1 en los booleanos (MySQL); aquí se normalizan
// para que el resto de la app no tenga que pensar en ello.
const bool = (v) => v === true || v === 1 || v === '1';
const normalizarLista = (l) => ({ ...l, cerrada: bool(l.cerrada), borrada: bool(l.borrada) });
const normalizarTarea = (t) => ({
  ...t, orden: Number(t.orden) || 0, borrada: bool(t.borrada), rechazada: bool(t.rechazada),
  zona: typeof t.zona === 'string' ? t.zona : '',
  fechaLimite: t.fechaLimite || null,
});
const normalizarComentario = (c) => ({ ...c, borrada: bool(c.borrada) });
const normalizarMensaje = (m) => ({ ...m, borrada: bool(m.borrada) });
const normalizarMedio = (m) => ({
  ...m, subido: true, borrada: bool(m.borrada),
  tam: Number(m.tam) || 0, ancho: Number(m.ancho) || 0,
  alto: Number(m.alto) || 0, duracion: Number(m.duracion) || 0,
});

function sinBlobs(registro) {
  const { blob, ...resto } = registro;
  return resto;
}

/* Arranque del motor: pendientes al abrir y reintento periódico. */
export async function arrancarSync() {
  // El directorio primero: si se pintara la primera pantalla sin él,
  // las bolitas saldrían con iniciales y cambiarían a foto al segundo.
  await cargarPersonas();
  await refrescarPendientes();
  estadoSync.ultimo = await db.meta.get('ultimoSync');
  avisar();
  sincronizar();
  setInterval(() => { if (navigator.onLine) sincronizar(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) sincronizar();
  });
}
