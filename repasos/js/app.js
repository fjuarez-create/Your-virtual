/* ═══════════════════════════════════════════════════════════════
   app.js — arranque, enrutado por hash y armazón de la app.

   Cada vista es un módulo que exporta `render(params)` y devuelve
   { contenido, tab, fab, sinTabs }. Aquí solo se monta el armazón:
   zona desplazable, botón de acción y barra inferior.
   ═══════════════════════════════════════════════════════════════ */
import { h, icon, toast } from './ui.js';
import * as store from './store.js';
import * as api from './api.js';

/* ─── Rutas ───────────────────────────────────────────────────── */
const RUTAS = [
  { patron: /^\/?$/,                          vista: () => import('./views/inicio.js'),       params: () => ({}) },
  { patron: /^\/entrar$/,                     vista: () => import('./views/entrar.js'),       params: () => ({}) },
  { patron: /^\/viviendas$/,                  vista: () => import('./views/viviendas.js'),    params: () => ({ desdeTab: true }) },
  { patron: /^\/promociones$/,                vista: () => import('./views/promociones.js'),  params: () => ({}) },
  { patron: /^\/p\/([^/]+)$/,                 vista: () => import('./views/viviendas.js'),    params: (m) => ({ promoId: m[1] }) },
  { patron: /^\/p\/([^/]+)\/v\/([^/]+)$/,     vista: () => import('./views/listas.js'),       params: (m) => ({ promoId: m[1], unidadId: `${m[1]}:${m[2]}` }) },
  { patron: /^\/l\/([^/]+)$/,                 vista: () => import('./views/tareas.js'),       params: (m) => ({ listaId: m[1] }) },
  { patron: /^\/l\/([^/]+)\/t\/([^/]+)$/,     vista: () => import('./views/tarea.js'),        params: (m) => ({ listaId: m[1], tareaId: m[2] }) },
  { patron: /^\/listas$/,                     vista: () => import('./views/historial.js'),    params: () => ({}) },
  { patron: /^\/ajustes$/,                    vista: () => import('./views/ajustes.js'),      params: () => ({}) },
  { patron: /^\/usuarios$/,                   vista: () => import('./views/usuarios.js'),     params: () => ({}) },
];

/**
 * Tres destinos, y un cuarto solo para quien administra. Los iconos
 * de inicio y viviendas son deliberadamente distintos: uno es una
 * retícula de resumen y el otro una casa, sin parecido posible.
 */
const TABS = [
  { id: 'inicio', ruta: '#/', icono: 'inicio', etiqueta: 'Inicio' },
  { id: 'listas', ruta: '#/listas', icono: 'listas', etiqueta: 'Repasos' },
  { id: 'viviendas', ruta: '#/viviendas', icono: 'viviendas', etiqueta: 'Viviendas' },
  { id: 'ajustes', ruta: '#/ajustes', icono: 'gear', etiqueta: 'Ajustes', soloAdmin: true },
];

/** Los que ve el usuario actual. */
function tabsVisibles() {
  return TABS.filter((t) => !t.soloAdmin || store.esAdmin());
}

export function ir(ruta, { reemplazar = false } = {}) {
  if (reemplazar) location.replace(ruta);
  else location.hash = ruta;
}

/** Vuelve atrás sin salirse de la app si se entró por enlace directo. */
export function atras(porDefecto = '#/') {
  if (history.length > 1 && document.referrer !== '' || history.state?.dentro) history.back();
  else ir(porDefecto, { reemplazar: true });
}

/* ─── Armazón ─────────────────────────────────────────────────── */
const app = document.getElementById('app');
let rutaActual = '';

/**
 * La cápsula con las bolitas. Hereda del conmutador del showroom: un
 * contenedor oscuro con los botones dentro, en vez de botones sueltos.
 * El activo no cambia de color de golpe: hay una bolita blanca que se
 * desliza por detrás hasta su sitio.
 */
const ANCHO_BOLITA = 52;
const HUECO_BOLITA = 6;

function barraInferior(activo) {
  const tabs = tabsVisibles();
  const indice = Math.max(0, tabs.findIndex((t) => t.id === activo));

  const marca = h('span.marca', {
    style: { '--x': `${indice * (ANCHO_BOLITA + HUECO_BOLITA)}px` },
  });

  const nav = h('nav.tabbar', { role: 'navigation', 'aria-label': 'Secciones' },
    marca,
    tabs.map((t) => h('button', {
      'aria-current': t.id === activo ? 'true' : null,
      'aria-label': t.etiqueta,
      title: t.etiqueta,
      onclick: () => ir(t.ruta),
    }, icon(t.icono))),
  );

  // La bolita no debe recorrer la barra al aparecer la pantalla: solo
  // cuando se cambia de sección estando ya dentro. La primera pintada
  // la coloca sin transición.
  if (barraPrevia === null) nav.classList.add('sin-animar');
  requestAnimationFrame(() => nav.classList.remove('sin-animar'));
  barraPrevia = activo;

  return nav;
}
let barraPrevia = null;

function pintar({ contenido, tab, fab, sinTabs, clase }) {
  // `clase` la pone la pantalla que necesita un fondo o un ritmo
  // propios (la de entrada, por ejemplo, que no es una lista).
  const screen = h('div.screen', {
    id: 'screen',
    class: [sinTabs ? 'no-tabs' : '', clase || ''].filter(Boolean).join(' '),
  });
  const nodos = Array.isArray(contenido) ? contenido : [contenido];
  for (const n of nodos) if (n) screen.append(n);

  // Se conservan los nodos flotantes (aviso, hoja, visor) entre pantallas.
  // La cápsula también, si seguimos en una sección con botonera: así la
  // bolita se desliza hasta la nueva en vez de reaparecer de cero.
  const barraViva = sinTabs ? null : app.querySelector('.tabbar');
  [...app.children].forEach((n) => {
    if (n === barraViva) return;
    if (!n.matches('.toast, .veil, .sheet, .viewer')) n.remove();
  });
  app.prepend(screen);
  if (fab) screen.after(fab);
  if (!sinTabs) {
    if (barraViva) moverBolita(barraViva, tab);
    else { barraPrevia = null; app.append(barraInferior(tab)); }
  } else {
    barraPrevia = null;
  }
  // El aviso flotante se coloca según lo que haya debajo (ver app.css).
  app.classList.toggle('con-fab', !!fab);
  app.classList.toggle('sin-tabs', !!sinTabs);
  screen.scrollTop = 0;
}

function cargando() {
  pintar({ contenido: h('div', { style: { display: 'grid', placeItems: 'center', minHeight: '50vh' } }, h('div.spin')), sinTabs: true });
}

async function enrutar() {
  const hash = location.hash.replace(/^#/, '') || '/';
  if (hash === rutaActual) return;
  rutaActual = hash;

  const [ruta] = hash.split('?');
  const encontrada = RUTAS.find((r) => r.patron.test(ruta));

  // Sin sesión solo se puede estar en la pantalla de entrada.
  const hayUsuario = !!store.sesion();
  if (!hayUsuario && ruta !== '/entrar') return ir('#/entrar', { reemplazar: true });
  if (hayUsuario && ruta === '/entrar') return ir('#/', { reemplazar: true });

  if (!encontrada) {
    pintar({
      contenido: [
        h('h1.display', null, 'Aquí no hay nada'),
        h('p.sub', null, 'La dirección no corresponde a ninguna pantalla.'),
        h('button.btn.ink', { onclick: () => ir('#/') }, 'Volver al inicio'),
      ],
      tab: 'inicio',
    });
    return;
  }

  const temporizador = setTimeout(cargando, 180);
  try {
    const modulo = await encontrada.vista();
    const m = ruta.match(encontrada.patron);
    const salida = await modulo.render(encontrada.params(m));
    clearTimeout(temporizador);
    pintar(salida);
  } catch (e) {
    clearTimeout(temporizador);
    console.error(e);
    pintar({
      contenido: [
        h('h1.display', null, 'Algo ha fallado'),
        h('p.sub', null, e?.message || 'No se ha podido abrir la pantalla.'),
        h('button.btn.ink', { onclick: () => location.reload() }, 'Reintentar'),
      ],
      sinTabs: true,
    });
  }
}

/** Desliza la bolita hasta la sección indicada sin rehacer la cápsula. */
function moverBolita(nav, activo) {
  const tabs = tabsVisibles();
  const indice = Math.max(0, tabs.findIndex((t) => t.id === activo));
  nav.querySelector('.marca')?.style.setProperty('--x', `${indice * (ANCHO_BOLITA + HUECO_BOLITA)}px`);
  [...nav.querySelectorAll('button')].forEach((b, i) => {
    if (i === indice) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
}

/** Fuerza el repintado de la pantalla actual (tras crear o borrar algo). */
export function refrescar() {
  rutaActual = '';
  return enrutar();
}

/* ─── Arranque ────────────────────────────────────────────────── */
async function arrancar() {
  await store.cargarSesion();
  window.addEventListener('hashchange', enrutar);
  await enrutar();
  vigilarDatosNuevos();
  store.arrancarSync();
  registrarServiceWorker();
}

/**
 * Cuando la sincronización trae datos de otro dispositivo, la pantalla
 * activa se repinta sola. Se deja en paz si hay una hoja abierta, el
 * visor a pantalla completa, el informe, o si se está escribiendo: nada
 * peor que perder el texto de una tarea a medio teclear.
 */
function vigilarDatosNuevos() {
  let vista = store.estadoSync.revision;
  store.alCambiarSync((e) => {
    if (e.revision === vista) return;
    const ocupado = document.querySelector('.sheet, .viewer.on, .informe')
      || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (ocupado) return;
    vista = e.revision;
    refrescar();
  });
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin caché offline */ });
}

// Un fallo no capturado no debe dejar la pantalla en blanco sin explicación.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason instanceof api.ApiError && e.reason.codigo === 'red') return;
  console.error('Fallo no capturado:', e.reason);
});

arrancar().catch((e) => {
  console.error(e);
  app.replaceChildren(h('div.screen.no-tabs', null,
    h('h1.display', null, 'No arranca'),
    h('p.sub', null, e?.message || 'Error desconocido al iniciar la aplicación.'),
    h('button.btn.ink', { onclick: () => location.reload() }, 'Reintentar'),
  ));
});

export { toast };
