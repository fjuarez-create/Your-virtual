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
     entregas     la ficha de entrega de cada vivienda   índice: promoId
     outbox       cambios pendientes de subir (orden de llegada)
   ═══════════════════════════════════════════════════════════════ */
/* El nombre de la base. La app de verdad vive en la raíz del dominio y
   el taller —la rama de pruebas— en /taller, en el MISMO origen; e
   IndexedDB va por origen, no por carpeta. Con un solo nombre, las dos
   leían y escribían la misma base: lo apuntado sin cobertura en la app
   de verdad se lo llevaba el taller en cuanto se abría en el mismo
   navegador —lo subía a SU servidor y vaciaba la cola—, y el servidor
   de verdad no lo recibía nunca (visto en noviembre de 2026). Y no era
   solo la cola: aquí van también la marca de la bajada y el directorio,
   que son de UN servidor. Con la marca del taller, la app de verdad
   preguntaba «desde» un punto que no era suyo y se saltaba lo que
   había llegado entre medias; y desde que el directorio se acata al
   pie de la letra (acatarDirectorio, en store.js), el de cada servidor
   habría borrado a la gente del otro. Por eso el taller tiene su base
   aparte.

   La de la app de verdad NO cambia de nombre, ni puede cambiar: en
   ella está el trabajo sin subir de cada móvil. Solo se aparta lo que
   se sirve desde /taller, que es un banco de pruebas y empieza de cero
   sin perder nada. OJO: quien la aparta es el código que corre EN el
   taller. Mientras el taller publicado no lleve este fichero, sigue
   abriendo la base de la app de verdad.

   Y con las barras que la ruta traiga delante: por «//taller/» —un
   enlace mal escrito— el servidor sirve el taller igual, y mirando
   «/taller/» tal cual el taller abría ahí la base de la app de verdad
   y le quitaba la sesión. */
const EN_EL_TALLER = /^\/+taller\//.test(new URL('..', import.meta.url).pathname);
const NOMBRE = EN_EL_TALLER ? 'unik-repasos-taller' : 'unik-repasos';

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
  'comentarios', 'recorridos', 'mensajes', 'lecturas', 'entregas', 'outbox'];

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
      // Un almacén nuevo en una base que ya tenía datos: lo que va en
      // él ya existe en el servidor desde ANTES de que este móvil
      // supiera guardarlo. La marca de sincronización va por delante
      // de esas filas y, si se dejara, no se pedirían nunca (le pasó a
      // Andrea en noviembre de 2026 con las entregas: la app vieja
      // sincronizó tras el despliegue, tiró lo que no conocía y
      // adelantó la marca; la nueva se encontró el almacén vacío). Se
      // borra la marca y la siguiente sincronización baja todo otra
      // vez: lo repetido se funde sin daño.
      if (habiaAlgo) {
        await new Promise((resolve) => {
          const tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').delete('ultimoSync');
          tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
        });
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
  // Noviembre de 2026: la ficha de entrega de cada vivienda (los
  // compradores, la revisión con el cliente y la firma). Una por casa,
  // con la clave de la casa.
  if (!db.objectStoreNames.contains('entregas')) {
    db.createObjectStore('entregas', { keyPath: 'id' }).createIndex('promoId', 'promoId');
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
  for (const s of ['meta', 'listas', 'tareas', 'medios', 'comentarios', 'personas', 'recorridos', 'entregas', 'outbox']) await vaciar(s);
}
