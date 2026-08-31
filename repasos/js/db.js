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

/* Los almacenes que la app necesita para funcionar. La versión numérica
   de la base ya no se fija aquí: se abre la que el navegador tenga
   apuntada y solo se sube —a la siguiente— si falta algún almacén.

   El porqué: Safari en el iPhone, si el sistema mata la app justo a
   media actualización de la base, a veces deja grabado un número de
   versión disparatado. Con una versión fija en el código, desde ese
   momento toda apertura falla («existe una versión mayor») y la app no
   arranca nunca más. Abriendo sin exigir número, ese estado se cura
   solo. */
const ALMACENES = ['meta', 'personas', 'listas', 'tareas', 'medios',
  'comentarios', 'recorridos', 'mensajes', 'lecturas', 'outbox'];

let dbPromise = null;

function abrirCon(version) {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(NOMBRE, version) : indexedDB.open(NOMBRE);
    req.onupgradeneeded = () => crearAlmacenes(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function abrir() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    let db = await abrirCon();
    const faltan = ALMACENES.filter((n) => !db.objectStoreNames.contains(n));
    if (faltan.length) {
      const siguiente = db.version + 1;
      const habiaAlgo = db.objectStoreNames.length > 0;
      db.close();
      try {
        db = await abrirCon(siguiente);
      } catch (e) {
        // Ni siquiera se deja subir (versión corrupta al límite). Si la
        // base no tenía ningún almacén nuestro, no hay nada que perder:
        // se tira y se crea de cero. Si tenía algo, mejor no tocar nada
        // y que el fallo llegue a la pantalla de arranque.
        if (habiaAlgo) throw e;
        await borrarBase();
        db = await abrirCon();
      }
    }
    // Si otra pestaña necesita subir la versión, esta suelta la base
    // para no bloquearla; la siguiente operación la reabre.
    db.onversionchange = () => { db.close(); dbPromise = null; };
    return db;
  })();
  // Un fallo de apertura no se queda pegado: el siguiente intento
  // (el botón de reintentar) parte de cero.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/** Borra la base local entera. Solo para el rescate de emergencia. */
export function borrarBase() {
  dbPromise = null;
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(NOMBRE);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

function crearAlmacenes(db) {
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
  // Versión 5: los mensajes de una vivienda y quién los ha leído.
  //
  // Las lecturas van en su propia tabla y no como una lista dentro
  // del mensaje. Si fueran un campo del mensaje, dos personas
  // leyéndolo a la vez subirían cada una su copia entera y la última
  // en llegar borraría la lectura de la otra. Cada lectura es una
  // fila con su propio identificador —mensaje + persona— así que dos
  // que lleguen a la vez no se pisan: son filas distintas.
  if (!db.objectStoreNames.contains('mensajes')) {
    db.createObjectStore('mensajes', { keyPath: 'id' }).createIndex('unidadId', 'unidadId');
  }
  if (!db.objectStoreNames.contains('lecturas')) {
    db.createObjectStore('lecturas', { keyPath: 'id' }).createIndex('mensajeId', 'mensajeId');
  }
  if (!db.objectStoreNames.contains('outbox')) {
    db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
  }
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
