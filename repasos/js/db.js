/* ═══════════════════════════════════════════════════════════════
   db.js — almacén local (IndexedDB).

   La app escribe SIEMPRE aquí primero y responde al instante; la
   sincronización con el servidor va detrás. Es lo que permite que una
   arquitecta recorra una villa sin cobertura y no pierda el trabajo.

   Almacenes:
     meta         clave/valor (sesión, última sincronización…)
     listas       listas de repaso            índice: unidadId
     tareas       tareas de cada lista        índice: listaId
     medios       fotos, vídeos y audios      índice: tareaId
     comentarios  hilo de cada tarea          índice: tareaId
     recorridos   grabaciones de un paseo por una vivienda
     outbox       cambios pendientes de subir (orden de llegada)
   ═══════════════════════════════════════════════════════════════ */
const NOMBRE = 'unik-repasos';
const VERSION = 4;

let dbPromise = null;

export function abrir() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      // El equipo: nombre y versión de la foto de cada uno, para
      // que las bolitas de las tareas enseñen la cara y no las
      // iniciales de quien tiene foto puesta.
      if (!db.objectStoreNames.contains('personas')) {
        db.createObjectStore('personas', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('listas')) {
        db.createObjectStore('listas', { keyPath: 'id' }).createIndex('unidadId', 'unidadId');
      }
      if (!db.objectStoreNames.contains('tareas')) {
        db.createObjectStore('tareas', { keyPath: 'id' }).createIndex('listaId', 'listaId');
      }
      if (!db.objectStoreNames.contains('medios')) {
        db.createObjectStore('medios', { keyPath: 'id' }).createIndex('tareaId', 'tareaId');
      }
      // Versión 2: el hilo de una tarea (rechazos y notas).
      if (!db.objectStoreNames.contains('comentarios')) {
        db.createObjectStore('comentarios', { keyPath: 'id' }).createIndex('tareaId', 'tareaId');
      }
      // Versión 4: el recorrido de una vivienda. Vive solo en el
      // dispositivo hasta que se convierte en tareas: es material de
      // trabajo, no el repaso en sí.
      if (!db.objectStoreNames.contains('recorridos')) {
        db.createObjectStore('recorridos', { keyPath: 'id' }).createIndex('unidadId', 'unidadId');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function pedir(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function almacen(nombre, modo = 'readonly') {
  const db = await abrir();
  return db.transaction(nombre, modo).objectStore(nombre);
}

export async function get(store, key) {
  return pedir((await almacen(store)).get(key));
}
export async function getAll(store) {
  return pedir((await almacen(store)).getAll());
}
export async function porIndice(store, indice, valor) {
  const s = await almacen(store);
  return pedir(s.index(indice).getAll(valor));
}
export async function put(store, valor, key) {
  const s = await almacen(store, 'readwrite');
  const r = await pedir(key === undefined ? s.put(valor) : s.put(valor, key));
  return r;
}
export async function putVarios(store, valores) {
  if (!valores.length) return;
  const db = await abrir();
  const tx = db.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  for (const v of valores) s.put(v);
  await new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}
export async function borrar(store, key) {
  return pedir((await almacen(store, 'readwrite')).delete(key));
}
export async function vaciar(store) {
  return pedir((await almacen(store, 'readwrite')).clear());
}

/* ─── Meta (clave/valor) ──────────────────────────────────────── */
export const meta = {
  get: (k) => get('meta', k),
  set: (k, v) => put('meta', v, k),
  del: (k) => borrar('meta', k),
};

/* ─── Outbox ──────────────────────────────────────────────────── */
export async function encolar(op) {
  await put('outbox', { ...op, ts: Date.now(), intentos: 0 });
}
export async function pendientes() {
  const items = await getAll('outbox');
  return items.sort((a, b) => a.seq - b.seq);
}
export async function desencolar(seq) {
  await borrar('outbox', seq);
}
export async function marcarIntento(item) {
  await put('outbox', { ...item, intentos: (item.intentos || 0) + 1, ultimo: Date.now() });
}
export async function numPendientes() {
  const db = await abrir();
  return pedir(db.transaction('outbox').objectStore('outbox').count());
}

/** Borra todo el contenido local (cierre de sesión). */
export async function limpiarTodo() {
  for (const s of ['meta', 'listas', 'tareas', 'medios', 'comentarios', 'personas', 'recorridos', 'outbox']) await vaciar(s);
}
