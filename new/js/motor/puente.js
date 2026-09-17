/* ═══════════════════════════════════════════════════════════════
   puente.js — El motor «Unreal»: la misma API `window.apolo` que da
   visor/main.js, pero sin dibujar nada.

   La interfaz (shell.js) no cambia: llama a setFloor, select, setMomento…
   y escucha 'planta', 'seleccion', 'momento', 'carga', 'reposo'. Aquí cada
   llamada se convierte en una orden del protocolo (docs/PROTOCOLO_STREAMING.md)
   que viaja por transporte.js hasta la aplicación de Unreal, y cada evento
   que vuelve actualiza el estado y se reemite por el bus.

   Lo que sigue viviendo en la página, igual que en la web:
   · el catálogo (data/units.json) y los estados (/gestion/api/estado.php con
     caída a data/availability.json). Unreal recibe el mapa ya resuelto con la
     orden `estados` y solo pinta; sin internet, el .exe enseña la última copia
     que viajó con él.
   · el refresco de estados cada minuto, como en el visor.

   Las órdenes se retienen hasta que la aplicación diga `listo`: antes no hay
   nadie escuchando al otro lado.
   ═══════════════════════════════════════════════════════════════ */
import { fetchUnits, fetchAvailability } from 'app/api.js';
import { ACTIVE_BUILDING } from 'app/promotions.js';
import { crearTransporte } from 'app/motor/transporte.js';

const PLANTAS = new Set(['all', 'baja', 'p1', 'p2', 'atico']);
const REFRESCO_ESTADOS_MS = 60_000;
const ESTADOS_VALIDOS = new Set(['disponible', 'reservada', 'vendida']);

/* Los cuatro botones de la web, traducidos a hora local decimal para el sol
   real de Unreal (orden `hora`). Es provisional: el deslizador de órbita solar
   sustituirá los botones y mandará la hora directamente. */
const HORA_DEL_MOMENTO = { manana: 9.5, dia: 13.95, atardecer: 19.25, noche: 22.5 };

const params = new URLSearchParams(location.search);
const transporte = crearTransporte({ simulador: params.get('simulador') === '1' || window.__APOLO_SIMULADOR === true });

const bus = new EventTarget();
const emitir = (evento, datos) => bus.dispatchEvent(new CustomEvent(evento, { detail: datos }));

const apolo = {
  motor: 'unreal',
  floor: 'all', momento: 'dia', selected: null, hover: null, vista: 'conjunto', plano: false,
  units: [], unitsById: new Map(), estados: {}, cargado: false, tiempos: {},
  escaparate: false,
  modulos: { camara: {} }, // shell.js consulta modulos.camara con ?camara=1
  /* `listo` puede llegar antes de que la interfaz se suscriba (el simulador
     contesta en 300 ms): quien se apunte a 'carga' tarde recibe el final. */
  on(evento, fn) {
    bus.addEventListener(evento, (e) => fn(e.detail));
    if (evento === 'carga' && listo) fn({ progreso: 1, etapa: 'listo' });
  },
  enter() { /* compatibilidad con shell.js: no hay portada que atravesar */ },
  estadoDe: (id) => apolo.estados[id] || 'disponible',
};
window.apolo = apolo;

/* ── Envío con retención hasta `listo` ── */
let listo = false;
const pendientes = [];
function enviar(orden, valor = null) {
  const mensaje = { orden, valor };
  if (!listo) { pendientes.push(mensaje); return; }
  transporte.enviar(mensaje);
}

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* Qué encuadre corresponde al estado actual, en las claves del protocolo. */
function vistaActual() {
  if (apolo.vista === 'vivienda' && apolo.selected != null) return 'vivienda';
  if (apolo.plano && apolo.floor !== 'all') return 'plano';
  if (apolo.floor !== 'all') return 'planta';
  return apolo.vista === 'conjunto' ? 'conjunto' : 'edificio';
}
const pedirVista = (vista) => enviar('vista', vista === 'vivienda' ? 'planta' : vista);

/* ── API pública: mismos nombres y mismo comportamiento visible que el visor ── */
Object.assign(apolo, {
  setFloor(clave, { encuadrar = null } = {}) {
    if (!PLANTAS.has(clave)) return Promise.reject(new Error(`apolo: planta desconocida "${clave}"`));
    apolo.escaparate = false;
    if (apolo.selected != null) apolo.select(null);
    apolo.floor = clave;
    apolo.hover = null;
    emitir('planta', clave);
    enviar('planta', clave);
    const mover = encuadrar === null ? (apolo.plano && clave !== 'all') : encuadrar;
    if (mover) pedirVista(apolo.plano && clave !== 'all' ? 'plano' : (clave === 'all' ? 'edificio' : 'planta'));
    return Promise.resolve(true);
  },

  setPlano(activo) {
    apolo.plano = !!activo;
    emitir('plano', apolo.plano);
    if (!apolo.plano) return Promise.resolve(false);
    if (apolo.floor === 'all') return apolo.setFloor('baja', { encuadrar: true });
    apolo.vista = 'plano';
    pedirVista('plano');
    return Promise.resolve(true);
  },

  setMomento(clave) {
    if (!(clave in HORA_DEL_MOMENTO)) return Promise.reject(new Error(`apolo: momento desconocido "${clave}"`));
    apolo.momento = clave;
    enviar('hora', HORA_DEL_MOMENTO[clave]);
    emitir('momento', clave);
    return Promise.resolve(true);
  },

  irConjunto() {
    apolo.vista = 'conjunto';
    if (apolo.floor !== 'all') apolo.setFloor('all', { encuadrar: false });
    else if (apolo.selected != null) apolo.select(null);
    pedirVista('conjunto');
    return Promise.resolve(true);
  },

  irEdificio() {
    apolo.vista = 'edificio';
    if (apolo.floor !== 'all') apolo.setFloor('all', { encuadrar: false });
    else if (apolo.selected != null) apolo.select(null);
    pedirVista('edificio');
    return Promise.resolve(true);
  },

  /* Vendidas: inertes, como en el visor. */
  enfocarVivienda(id) {
    id = id != null ? String(id) : null;
    const u = id != null ? apolo.unitsById.get(id) : null;
    if (!u || apolo.estadoDe(id) === 'vendida') return Promise.resolve(false);
    apolo.escaparate = false;
    const planta = plantaDe(u);
    if (planta && apolo.floor !== planta) apolo.setFloor(planta, { encuadrar: false });
    apolo.vista = 'vivienda';
    apolo.select(id, { enfocar: false });
    enviar('vivienda', id); // la aplicación corta, vuela y enfoca
    return Promise.resolve(true);
  },

  volverAPlanta() {
    if (apolo.selected != null) apolo.select(null);
    apolo.vista = apolo.floor === 'all' ? 'edificio' : apolo.vista;
    pedirVista(vistaActual());
    return Promise.resolve(true);
  },

  /* `avisar: false` cuando el cambio viene de la propia aplicación: no se le
     devuelve como orden lo que ella acaba de contar. */
  select(id, { enfocar = true, avisar = true } = {}) {
    id = id != null ? String(id) : null;
    if (id != null && (!apolo.unitsById.has(id) || apolo.estadoDe(id) === 'vendida')) return;
    if (apolo.selected === id) return;
    apolo.selected = id;
    if (id == null && apolo.vista === 'vivienda') apolo.vista = apolo.floor === 'all' ? 'edificio' : 'planta';
    const u = id != null ? apolo.unitsById.get(id) : null;
    emitir('seleccion', { id, unidad: u || null, estado: id != null ? apolo.estadoDe(id) : null });
    if (id != null && enfocar) apolo.enfocarVivienda(id);
    else if (id == null && avisar) enviar('vivienda', null);
  },

  setHover(id) {
    id = id != null ? String(id) : null;
    if (id === apolo.hover) return;
    apolo.hover = id;
    emitir('hover', id);
    enviar('hover', id);
  },

  recentrar() {
    if (apolo.vista === 'vivienda' && apolo.selected != null) { enviar('vivienda', apolo.selected); return Promise.resolve(true); }
    pedirVista(vistaActual());
    return Promise.resolve(true);
  },

  setCalidad(tier) { return tier; },
});

/* units.json trae la planta con la nomenclatura del listado de precios. */
const PLANTA_DEL_LISTADO = { 'Baja': 'baja', '1ª': 'p1', '2ª': 'p2', 'Ático': 'atico' };
function plantaDe(u) { return PLANTA_DEL_LISTADO[u.planta] || null; }

/* ── Eventos desde la aplicación ── */
transporte.alRecibir(({ evento, valor }) => {
  switch (evento) {
    case 'listo': {
      if (listo) return;
      listo = true;
      apolo.cargado = true;
      /* Estado inicial completo antes que cualquier orden retenida: la
         aplicación arranca con el día, la hora y el mapa de la web. */
      transporte.enviar({ orden: 'fecha', valor: hoyISO() });
      transporte.enviar({ orden: 'hora', valor: HORA_DEL_MOMENTO[apolo.momento] });
      if (apolo.units.length) transporte.enviar({ orden: 'estados', valor: mapaCompleto() });
      while (pendientes.length) transporte.enviar(pendientes.shift());
      emitir('carga', { progreso: 1, etapa: 'listo' });
      emitir('planta', apolo.floor);
      emitir('momento', apolo.momento);
      return;
    }
    case 'vivienda': {
      const id = valor != null ? String(valor) : null;
      if (id != null && (!apolo.unitsById.has(id) || apolo.estadoDe(id) === 'vendida')) return;
      apolo.escaparate = false;
      if (id != null) {
        const planta = plantaDe(apolo.unitsById.get(id));
        if (planta && apolo.floor !== planta) { apolo.floor = planta; emitir('planta', planta); }
        apolo.vista = 'vivienda';
      }
      apolo.select(id, { enfocar: false, avisar: false });
      return;
    }
    case 'hover': {
      const id = valor != null ? String(valor) : null;
      if (id === apolo.hover) return;
      apolo.hover = id;
      emitir('hover', id);
      return;
    }
    case 'planta': {
      if (!PLANTAS.has(valor) || valor === apolo.floor) return;
      if (apolo.selected != null) apolo.select(null);
      apolo.floor = valor;
      emitir('planta', valor);
      return;
    }
    case 'escaparate': {
      apolo.escaparate = !!valor;
      if (!apolo.escaparate) return;
      /* La aplicación ya ha volado al conjunto: la interfaz recoge lo que
         ya no corresponde, como hace con el reposo del visor. */
      apolo.selected = null;
      apolo.floor = 'all';
      apolo.vista = 'conjunto';
      apolo.plano = false;
      emitir('reposo');
      emitir('planta', 'all');
      return;
    }
    case 'error':
      console.warn('[apolo] la aplicación avisa:', valor);
      emitir('error', valor);
      return;
    default:
      /* desconocido: se ignora en silencio, por contrato */
  }
});

/* Cualquier gesto corta el escaparate, y solo se avisa una vez por entrada. */
function cortarEscaparate() {
  if (!apolo.escaparate) return;
  apolo.escaparate = false;
  enviar('escaparate', false);
}
for (const tipo of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(tipo, cortarEscaparate, { passive: true, capture: true });
}

/* ── Datos: catálogo y estados ── */
function mapaCompleto() {
  const mapa = {};
  for (const u of apolo.units) {
    const e = apolo.estados[u.id];
    mapa[u.id] = ESTADOS_VALIDOS.has(e) ? e : 'disponible';
  }
  return mapa;
}

async function cargarDatos() {
  emitir('carga', { progreso: 0, etapa: 'inicio' });
  let units = [];
  try { units = await fetchUnits(); } catch (e) { console.warn('[apolo] sin catálogo:', e?.message || e); }
  apolo.units = units.map((u) => ({ ...u, id: String(u.id) }));
  apolo.unitsById = new Map(apolo.units.map((u) => [u.id, u]));
  emitir('carga', { progreso: 0.4, etapa: 'edificio' });
  let estados = {};
  try { estados = await fetchAvailability(ACTIVE_BUILDING.availability); } catch { estados = {}; }
  apolo.estados = { ...estados };
  emitir('carga', { progreso: 0.7, etapa: 'entorno' });
  if (listo) transporte.enviar({ orden: 'estados', valor: mapaCompleto() });
  vigilarEstados();
}

function vigilarEstados() {
  let firma = JSON.stringify(mapaCompleto());
  setInterval(async () => {
    if (document.hidden) return;
    let nuevos = null;
    try { nuevos = await fetchAvailability(ACTIVE_BUILDING.availability); } catch { return; }
    if (!nuevos || !Object.keys(nuevos).length) return;
    apolo.estados = { ...nuevos };
    const ahora = JSON.stringify(mapaCompleto());
    if (ahora === firma) return;
    firma = ahora;
    enviar('estados', mapaCompleto());
    emitir('estados', apolo.estados);
    if (apolo.selected != null) {
      const id = apolo.selected;
      emitir('seleccion', { id, unidad: apolo.unitsById.get(id) || null, estado: apolo.estadoDe(id) });
    }
  }, REFRESCO_ESTADOS_MS);
}

cargarDatos();
