/* ═══════════════════════════════════════════════════════════════
   store.js — modelo de datos y motor de sincronización.

   Regla de oro: la app nunca espera al servidor. Toda escritura entra
   en IndexedDB y deja un apunte en el outbox; el motor lo sube cuando
   hay red. Los identificadores los genera el cliente (UUID), así que
   subir dos veces el mismo cambio es inofensivo.
   ═══════════════════════════════════════════════════════════════ */
import * as db from './db.js';
import * as api from './api.js';

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
export const sesion = () => usuario;
export const esAdmin = () => !!usuario && usuario.rol === 'admin';

export async function cargarSesion() {
  usuario = (await db.meta.get('usuario')) || null;
  if (api.HAY_SERVIDOR && navigator.onLine) {
    // Se refresca contra el servidor, pero si no contesta seguimos con
    // la sesión guardada: sin cobertura la app tiene que abrir igual.
    try {
      const u = await api.yo();
      usuario = u.usuario;
      await db.meta.set('usuario', usuario);
    } catch (e) {
      if (e.status === 401) { usuario = null; await db.meta.del('usuario'); }
    }
  }
  return usuario;
}

export async function iniciarSesion(email, password) {
  const r = await api.entrar(email, password);
  usuario = r.usuario;
  await db.meta.set('usuario', usuario);
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

export async function crearLista({ unidadId, promoId, fase }) {
  const l = {
    id: nuevoId(),
    unidadId, promoId, fase,
    cerrada: false,
    borrada: false,
    creado: ahora(),
    actualizado: ahora(),
    creadoPor: usuario?.id || 'local',
    creadoPorNombre: usuario?.nombre || 'Sin identificar',
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

export async function crearTarea({ listaId, texto }) {
  const hermanas = await tareasDeLista(listaId);
  const t = {
    id: nuevoId(),
    listaId,
    texto: texto || '',
    estado: 'pendiente',
    orden: hermanas.length ? Math.max(...hermanas.map((x) => x.orden || 0)) + 1 : 1,
    portadaId: null,
    borrada: false,
    creado: ahora(),
    actualizado: ahora(),
    creadoPor: usuario?.id || 'local',
    creadoPorNombre: usuario?.nombre || 'Sin identificar',
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

export async function borrarTarea(id) {
  const medios = await db.porIndice('medios', 'tareaId', id);
  for (const m of medios) await borrarMedio(m.id, { silencioso: true });
  return actualizarTarea(id, { borrada: true });
}

/* ─── Medios ──────────────────────────────────────────────────── */
export async function mediosDeTarea(tareaId) {
  const todos = await db.porIndice('medios', 'tareaId', tareaId);
  return todos.filter((m) => !m.borrada).sort((a, b) => a.creado.localeCompare(b.creado));
}

export async function añadirMedio(tareaId, { tipo, blob, mime, ancho, alto, duracion, nombre }) {
  const m = {
    id: nuevoId(),
    tareaId,
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
  // La primera imagen de la tarea es su portada en el listado.
  const t = await db.get('tareas', tareaId);
  if (t && !t.portadaId && tipo === 'imagen') {
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
export async function resumenPorUnidad(promoId) {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada && l.promoId === promoId);
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada);
  const porLista = new Map();
  for (const t of tareas) {
    const v = porLista.get(t.listaId) || { total: 0, pendientes: 0 };
    v.total++;
    if (t.estado === 'pendiente') v.pendientes++;
    porLista.set(t.listaId, v);
  }
  const salida = new Map();
  for (const l of listas) {
    const v = salida.get(l.unidadId) || { listas: 0, total: 0, pendientes: 0, ultima: null };
    v.listas++;
    const c = porLista.get(l.id) || { total: 0, pendientes: 0 };
    v.total += c.total;
    v.pendientes += c.pendientes;
    if (!v.ultima || l.creado > v.ultima) v.ultima = l.creado;
    salida.set(l.unidadId, v);
  }
  return salida;
}

/** Conteo de una lista concreta. */
export async function contarLista(listaId) {
  const tareas = await tareasDeLista(listaId);
  return {
    total: tareas.length,
    pendientes: tareas.filter((t) => t.estado === 'pendiente').length,
    resueltas: tareas.filter((t) => t.estado === 'resuelta').length,
    verificadas: tareas.filter((t) => t.estado === 'verificada').length,
  };
}

/** Cifras globales para la portada. */
export async function resumenGeneral() {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada);
  const tareas = (await db.getAll('tareas')).filter((t) => !t.borrada);
  const viviendas = new Set(listas.map((l) => l.unidadId));
  return {
    listas: listas.length,
    viviendas: viviendas.size,
    tareas: tareas.length,
    pendientes: tareas.filter((t) => t.estado === 'pendiente').length,
    ultima: listas.map((l) => l.creado).sort().pop() || null,
  };
}

/** Las últimas listas tocadas, para el acceso rápido de la portada. */
export async function listasRecientes(n = 4) {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada);
  return listas.sort((a, b) => b.actualizado.localeCompare(a.actualizado)).slice(0, n);
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
  if (r.ahora) await db.meta.set('ultimoSync', r.ahora);

  // La revisión sube al final, con todo ya escrito: si se avisara antes,
  // la pantalla se repintaría con los datos de hace un momento y se
  // quedaría así hasta el siguiente cambio.
  if (r.listas?.length || r.tareas?.length || r.medios?.length) estadoSync.revision++;
  return r;
}

// El backend devuelve 0/1 en los booleanos (MySQL); aquí se normalizan
// para que el resto de la app no tenga que pensar en ello.
const bool = (v) => v === true || v === 1 || v === '1';
const normalizarLista = (l) => ({ ...l, cerrada: bool(l.cerrada), borrada: bool(l.borrada) });
const normalizarTarea = (t) => ({ ...t, orden: Number(t.orden) || 0, borrada: bool(t.borrada) });
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
  await refrescarPendientes();
  estadoSync.ultimo = await db.meta.get('ultimoSync');
  avisar();
  sincronizar();
  setInterval(() => { if (navigator.onLine) sincronizar(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) sincronizar();
  });
}
