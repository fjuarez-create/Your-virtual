/* ═══════════════════════════════════════════════════════════════
   store.js — modelo de datos y motor de sincronización.

   Regla de oro: la app nunca espera al servidor. Toda escritura entra
   en IndexedDB y deja un apunte en el outbox; el motor lo sube cuando
   hay red. Los identificadores los genera el cliente (UUID), así que
   subir dos veces el mismo cambio es inofensivo.
   ═══════════════════════════════════════════════════════════════ */
import * as db from './db.js';
import * as api from './api.js';
import { puedeVerificar, hecha, esperandoVisto, OFICIO_POR_DEFECTO } from './catalog.js';

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
export async function crearLista({ unidadId, promoId, fase, nombre = '', autor = null }) {
  const quien = autor || usuario;
  const l = {
    id: nuevoId(),
    unidadId, promoId, fase,
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

export async function crearTarea({ listaId, texto, oficio = OFICIO_POR_DEFECTO, autor = null }) {
  const hermanas = await tareasDeLista(listaId);
  const quien = autor || usuario;
  const t = {
    id: nuevoId(),
    listaId,
    texto: texto || '',
    oficio: oficio || OFICIO_POR_DEFECTO,
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
 * Devolver a pendiente algo que estaba resuelto es un rechazo: quien lo
 * hace tiene que explicarlo, y la tarea queda marcada para que el
 * constructor lo vea sin tener que abrirla. Es el hilo de la tarea.
 *
 * @param {string} nuevo  'pendiente' | 'resuelta' | 'verificada'
 * @param {{texto?: string, imagen?: {blob: Blob, mime: string, ancho: number, alto: number}}} nota
 */
export async function cambiarEstado(tareaId, nuevo, nota = {}) {
  const t = await db.get('tareas', tareaId);
  if (!t) return null;
  if (t.estado === nuevo) return t;

  if (nuevo === 'verificada' && !puedeVerificar(usuario)) {
    throw new Error('No tienes permiso para verificar tareas.');
  }

  const rechazo = t.estado === 'resuelta' && nuevo === 'pendiente';
  const cambios = { estado: nuevo };
  if (rechazo) cambios.rechazada = true;
  else if (nuevo !== 'pendiente') cambios.rechazada = false;

  const actualizada = await actualizarTarea(tareaId, cambios);

  if (nota.texto || nota.imagen) {
    await añadirComentario(tareaId, {
      texto: nota.texto || '',
      tipo: rechazo ? 'rechazo' : 'nota',
      imagen: nota.imagen,
    });
  }
  return actualizada;
}

/** ¿Devolver esta tarea a pendiente exige explicación? */
export function exigeExplicacion(tarea, nuevo) {
  return !!tarea && tarea.estado === 'resuelta' && nuevo === 'pendiente';
}

/* ─── Hilo de la tarea ────────────────────────────────────────── */
export async function comentariosDeTarea(tareaId) {
  const todos = await db.porIndice('comentarios', 'tareaId', tareaId);
  return todos.filter((c) => !c.borrada).sort((a, b) => a.creado.localeCompare(b.creado));
}

export async function añadirComentario(tareaId, { texto, tipo = 'nota', imagen }) {
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

  if (imagen) {
    await añadirMedio(tareaId, {
      tipo: 'imagen',
      blob: imagen.blob,
      mime: imagen.mime,
      ancho: imagen.ancho,
      alto: imagen.alto,
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
        listas: 0, total: 0, hechas: 0, pendientes: 0, esperando: 0,
        oficios: new Set(), oficiosAbiertos: new Set(), ultima: null,
      });
    }
    return salida.get(unidadId);
  };

  for (const l of listas) {
    const v = dame(l.unidadId);
    v.listas++;
    if (!v.ultima || l.creado > v.ultima) v.ultima = l.creado;
  }
  for (const t of tareas) {
    const unidadId = unidadDeLista.get(t.listaId);
    if (!unidadId) continue;
    const v = dame(unidadId);
    v.total++;
    v.oficios.add(oficioDe(t));
    if (hecha(t)) { v.hechas++; continue; }
    v.oficiosAbiertos.add(oficioDe(t));
    if (esperandoVisto(t)) v.esperando++;
    else v.pendientes++;
  }
  return salida;
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
    pendientes: tareas.filter((t) => t.estado === 'pendiente').length,
    // Dos conjuntos, porque los filtros preguntan cosas distintas:
    // «pintura» a secas es «aquí hubo pintura»; «pendientes + pintura»
    // es «aquí queda pintura por verificar».
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
  if (r.ahora) await db.meta.set('ultimoSync', r.ahora);

  // La revisión sube al final, con todo ya escrito: si se avisara antes,
  // la pantalla se repintaría con los datos de hace un momento y se
  // quedaría así hasta el siguiente cambio.
  if (r.listas?.length || r.tareas?.length || r.medios?.length || r.comentarios?.length) {
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
});
const normalizarComentario = (c) => ({ ...c, borrada: bool(c.borrada) });
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
