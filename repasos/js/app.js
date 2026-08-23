/* ═══════════════════════════════════════════════════════════════
   app.js — arranque, enrutado por hash y armazón de la app.

   Cada vista es un módulo que exporta `render(params)` y devuelve
   { contenido, tab, fab, sinTabs }. Aquí solo se monta el armazón:
   zona desplazable, botón de acción y barra inferior.
   ═══════════════════════════════════════════════════════════════ */
import { h, icon, toast, arrancarOndas } from './ui.js';
import * as store from './store.js';
import * as api from './api.js';
import { borrarBase } from './db.js';
import { hayFotosSinMandar } from './pendientes.js';
import { fijarPlantas } from './catalog.js';

/* ─── Rutas ───────────────────────────────────────────────────── */
const RUTAS = [
  { patron: /^\/?$/,                          vista: () => import('./views/inicio.js'),       params: () => ({}) },
  { patron: /^\/entrar$/,                     vista: () => import('./views/entrar.js'),       params: () => ({}) },
  { patron: /^\/viviendas$/,                  vista: () => import('./views/viviendas.js'),    params: () => ({ desdeTab: true }) },
  { patron: /^\/promociones$/,                vista: () => import('./views/promociones.js'),  params: () => ({}) },
  { patron: /^\/p\/([^/]+)$/,                 vista: () => import('./views/viviendas.js'),    params: (m) => ({ promoId: m[1] }) },
  { patron: /^\/p\/([^/]+)\/v\/([^/]+)$/,     vista: () => import('./views/listas.js'),       params: (m) => ({ promoId: m[1], unidadId: `${m[1]}:${m[2]}` }) },
  { patron: /^\/p\/([^/]+)\/v\/([^/]+)\/nueva$/, vista: () => import('./views/nuevaTarea.js'), params: (m) => ({ promoId: m[1], unidadId: `${m[1]}:${m[2]}` }) },
  { patron: /^\/p\/([^/]+)\/v\/([^/]+)\/recorrido$/, vista: () => import('./views/recorrido.js'), params: (m) => ({ promoId: m[1], unidadId: `${m[1]}:${m[2]}` }) },
  /* La misma pantalla, entrando por la puerta de atrás: al repaso de un
     paseo ya grabado, sin abrir la cámara. Es lo que hace el aviso de
     «recorrido a medias» de la ficha de la vivienda, donde ya se ha
     decidido que lo que toca es terminar lo de antes y no grabar más. */
  { patron: /^\/p\/([^/]+)\/v\/([^/]+)\/recorrido\/seguir$/, vista: () => import('./views/recorrido.js'), params: (m) => ({ promoId: m[1], unidadId: `${m[1]}:${m[2]}`, seguir: true }) },
  { patron: /^\/l\/([^/]+)$/,                 vista: () => import('./views/tareas.js'),       params: (m) => ({ listaId: m[1] }) },
  { patron: /^\/l\/([^/]+)\/t\/([^/]+)$/,     vista: () => import('./views/tarea.js'),        params: (m) => ({ listaId: m[1], tareaId: m[2] }) },
  { patron: /^\/tareas\/([^/]+)$/,           vista: () => import('./views/tareasEstado.js'), params: (m) => ({ estadoId: m[1] }) },
  { patron: /^\/listas$/,                     vista: () => import('./views/historial.js'),    params: () => ({}) },
  { patron: /^\/acta\/(\d{4}-\d{2}-\d{2})$/,   vista: () => import('./views/acta.js'),         params: (m) => ({ fecha: m[1] }) },
  { patron: /^\/ajustes$/,                    vista: () => import('./views/ajustes.js'),      params: () => ({}) },
  { patron: /^\/usuarios$/,                   vista: () => import('./views/usuarios.js'),     params: () => ({}) },
  { patron: /^\/estancias$/,                  vista: () => import('./views/estancias.js'),    params: () => ({}) },
];

/**
 * Dos destinos, y un tercero solo para quien administra.
 *
 * Las actas NO están aquí, y es a propósito. Una vivienda es un sitio:
 * hay cincuenta y habrá cincuenta siempre. Un acta es un hecho: hay
 * nueve hoy y habrá cuatrocientas en un año. Una barra de pestañas
 * guarda sitios, no archivos que crecen sin techo. Y nadie busca un
 * acta sin saber de qué casa es, así que el camino natural pasa por la
 * vivienda; el archivo completo se abre desde la portada.
 */
const TABS = [
  { id: 'inicio', ruta: '#/', icono: 'inicio', etiqueta: 'Inicio' },
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

/* ─── Los filtros viajan en la dirección ──────────────────────────
   Si estás mirando lo que hay abierto de pintura y entras en una
   vivienda, lo que quieres ver es lo abierto de pintura de esa casa, no
   empezar de cero. Van en la propia dirección y no en una variable
   suelta por dos motivos: al volver atrás la pantalla anterior se
   recupera tal y como la dejaste, y un enlace copiado lleva puesto lo
   que estabas mirando. */

/** Lee el filtro de la dirección actual. */
export function filtrosDeRuta() {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  return { estado: p.get('estado') || 'todas', oficio: p.get('oficio') || 'todos' };
}

/** Pega el filtro a una ruta. Lo que no filtra no se escribe. */
export function conFiltros(ruta, { estado = 'todas', oficio = 'todos' } = {}) {
  const p = new URLSearchParams();
  if (estado && estado !== 'todas') p.set('estado', estado);
  if (oficio && oficio !== 'todos') p.set('oficio', oficio);
  const q = p.toString();
  return q ? `${ruta}?${q}` : ruta;
}

/**
 * Deja el filtro escrito en la dirección sin repintar la pantalla ni
 * ensuciar el historial: es el mismo sitio mirado de otra manera, no un
 * sitio nuevo. `replaceState` cambia la dirección sin disparar
 * `hashchange`, que es justo lo que hace falta.
 */
export function anotarFiltros(filtros) {
  const base = location.hash.split('?')[0] || '#/';
  history.replaceState(history.state, '', conFiltros(base, filtros));
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
const ANCHO_BOLITA = 72;   // 65 + 10 %
const HUECO_BOLITA = 8;

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

/* Lo que hay que soltar al abandonar la pantalla actual —la cámara del
   recorrido, por ejemplo—. Si no se llamara, el piloto de la cámara se
   quedaría encendido y la batería se iría sin explicación. */
let limpiarVista = null;

function pintar({ contenido, tab, fab, sinTabs, clase, alSalir = null }) {
  if (limpiarVista) { try { limpiarVista(); } catch { /* daba igual */ } }
  limpiarVista = alSalir;
  // `clase` la pone la pantalla que necesita un fondo o un ritmo
  // propios (la de entrada, por ejemplo, que no es una lista).
  const screen = h('div.screen', {
    id: 'screen',
    class: [sinTabs ? 'no-tabs' : '', clase || ''].filter(Boolean).join(' '),
  });
  const nodos = Array.isArray(contenido) ? contenido : [contenido];
  for (const n of nodos) if (n) screen.append(n);

  // Si es la MISMA pantalla que ya estaba —un repintado, no un cambio
  // de sitio— se conserva por dónde iba. Al borrar una nota de voz en
  // una tarea larga, o cuando la sincronización trae algo de otro
  // móvil, la pantalla se rehace: devolverla al principio deja a quien
  // está trabajando buscando otra vez dónde estaba.
  const anterior = app.querySelector('.screen');
  if (rutaPintada !== rutaActual) alturaPintada = 0;
  // La ruedecita de «cargando» no cuenta: mide cero y borraría la
  // altura de la pantalla de verdad que estaba debajo.
  else if (anterior && !anterior.classList.contains('cargando')) alturaPintada = anterior.scrollTop;
  rutaPintada = rutaActual;

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
  screen.scrollTop = alturaPintada;
}
/* La ruta de lo que hay pintado ahora mismo, y por dónde iba: sirven
   para distinguir un repintado de un cambio de pantalla. */
let rutaPintada = null;
let alturaPintada = 0;

function cargando() {
  pintar({
    contenido: h('div', { style: { display: 'grid', placeItems: 'center', minHeight: '50vh' } }, h('div.spin')),
    sinTabs: true,
    clase: 'cargando',
  });
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

  /* Cambiar de pantalla es EL momento de poner la versión que espere:
     lo de antes ya se cerró, lo de después aún no existe, y la recarga
     cae donde iba a pintarse una pantalla de todas formas. La pantalla
     se pinta abajo igual, por si el relevo no llegara a recargar. */
  relevoSilencioso();

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
    // Si lo que ha fallado es traer el código de la pantalla, no hay
    // nada que explicarle a nadie: se recarga y ya. Pasa cuando la
    // versión del móvil y la del servidor no coinciden a mitad de
    // sesión, y una recarga las pone de acuerdo.
    if (esFalloDeCodigo(e) && puedeRecargarse()) { location.reload(); return; }
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

/**
 * ¿El fallo es de traer el código de una pantalla?
 *
 * Las pantallas se piden en el momento de abrirlas, no al arrancar. Si
 * entre medias ha entrado un despliegue y algo queda descuadrado, lo
 * que salta es esto: un módulo que no llega, o que llega y no trae lo
 * que otro esperaba de él —«Importing binding name … is not found»—.
 * No es un fallo de la obra ni de los datos: es código a medio
 * cambiar, y se arregla solo recargando.
 */
function esFalloDeCodigo(e) {
  const m = String(e?.message || e || '');
  // Cada navegador lo cuenta con sus palabras, y hay que reconocerlas
  // todas: la de Safari es la que vio Fran en el iPhone, la de Chrome
  // es la que sale al probarlo aquí, y la de Firefox por si acaso. La
  // última es cuando el servidor devuelve una página en vez de un
  // fichero de código, que también acaba en «algo ha fallado».
  return /importing binding name/i.test(m)                 // Safari
    || /does not provide an export named/i.test(m)          // Chrome
    || /doesn't provide an export named/i.test(m)           // Firefox
    || /dynamically imported module/i.test(m)               // los tres
    || /module script/i.test(m)
    || /unexpected token ['"‘]?</i.test(m);                 // llegó HTML
}

/**
 * Recargar sí, pero una vez.
 *
 * Si el problema no fuera la versión sino algo que se repite, recargar
 * en bucle dejaría la aplicación dando vueltas para siempre y sin
 * decir nada. Con esto, el segundo intento en el mismo minuto ya
 * enseña la pantalla de error, que al menos se puede leer y contar.
 */
function puedeRecargarse() {
  const ahora = Date.now();
  const ultima = Number(sessionStorage.getItem('recarga-por-codigo') || 0);
  if (ahora - ultima < 60000) return false;
  sessionStorage.setItem('recarga-por-codigo', String(ahora));
  return true;
}

/** Desliza la bolita hasta la sección indicada sin rehacer la cápsula. */
function moverBolita(nav, activo) {
  const tabs = tabsVisibles();
  const indice = Math.max(0, tabs.findIndex((t) => t.id === activo));
  const marca = nav.querySelector('.marca');
  if (marca) {
    const destino = indice * (ANCHO_BOLITA + HUECO_BOLITA);
    const salto = Math.abs(parseFloat(marca.style.getPropertyValue('--x') || 0) - destino);
    marca.style.setProperty('--x', `${destino}px`);
    // Estirar y encoger: mientras viaja se alarga en la dirección de la
    // marcha y se aplana un poco, y al llegar recupera la forma. Es lo
    // que hace que se lea como una gota que se desplaza y no como un
    // cuadrado que cambia de sitio. Cuanto más largo el salto, más se
    // estira; si no se mueve, no pasa nada.
    if (salto > 1) {
      clearTimeout(moverBolita.reloj);
      marca.style.setProperty('--sx', String(1 + Math.min(0.34, salto / 520)));
      marca.style.setProperty('--sy', String(1 - Math.min(0.14, salto / 1300)));
      moverBolita.reloj = setTimeout(() => {
        marca.style.setProperty('--sx', '1');
        marca.style.setProperty('--sy', '1');
      }, 170);
    }
  }
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
  // El directorio del equipo antes de pintar: si no, la primera
  // pantalla saldría con iniciales y las caras aparecerían al
  // navegar, que se lee como un fallo.
  await store.cargarPersonas();
  // Las estancias de la obra: primero la copia del móvil —la app abre
  // igual sin cobertura— y por detrás las del servidor, por si el
  // administrador las cambió desde otro dispositivo. Sin nada guardado
  // se queda la lista de fábrica.
  try { fijarPlantas(await store.zonasLocales()); } catch { /* con la de fábrica vale */ }
  if (api.HAY_SERVIDOR && navigator.onLine) {
    api.leerZonas().then(async (r) => {
      fijarPlantas(r.plantas);
      await store.guardarZonasLocales(r.plantas);
    }).catch(() => { /* sin servidor se sigue con lo local */ });
  }
  // Que iOS trate nuestro almacén como intocable: sin esto, con el
  // disco justo puede purgar IndexedDB y llevarse fotos sin subir.
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* no lo soporta */ }
  window.addEventListener('hashchange', enrutar);
  // Cuando la purga de tareas sin fotografía actúa (ver store.js), el
  // almacén lo deja dicho y aquí se le pone la banda.
  window.addEventListener('purga-sin-foto', (e) => {
    const n = e.detail?.borradas || 0;
    if (n) {
      toast(`${n} ${n === 1 ? 'tarea sin fotografía borrada' : 'tareas sin fotografía borradas'} para siempre`,
        '', { icono: 'trash' });
    }
  });
  // La onda del dedo de los botones anchos. Se engancha una sola vez a
  // todo el documento, así que vale también para los botones que se
  // creen después, y antes de pintar para que valga desde el primero.
  arrancarOndas();
  await enrutar();
  quitarPantallaDeArranque();
  vigilarDatosNuevos();
  store.arrancarSync();
  registrarServiceWorker();
}

/**
 * Retira la pantalla de arranque de la app de iPhone en cuanto hay algo
 * que enseñar. Quien sabe hacerlo es la función que deja puesta el
 * index; aquí solo se decide CUÁNDO: al pintar la primera pantalla, o
 * al pintar el error si el arranque se cae. Una pantalla de error se
 * puede leer; un logotipo parado no dice nada.
 *
 * En el navegador no hay pantalla de arranque y esto no hace nada.
 */
let arranqueRetirado = false;
function quitarPantallaDeArranque() {
  if (arranqueRetirado) return;
  arranqueRetirado = true;
  try {
    if (window.retirarArranqueNativo) window.retirarArranqueNativo();
    else window.Capacitor?.Plugins?.SplashScreen?.hide?.({ fadeOutDuration: 200 });
  } catch { /* fuera de la app de iPhone no hay nada que quitar */ }
}

/* La red de seguridad, por si el arranque se quedara esperando al
   servidor: una obra sin cobertura, el hosting caído. A los seis
   segundos se enseña lo que haya debajo, aunque sea la ruedecita, en
   vez de dejar el logotipo congelado sin explicación. */
setTimeout(quitarPantallaDeArranque, 6000);

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
    // El recorrido se queda fuera del repintado pase lo que pase:
    // repintar mientras se graba tira por tierra el paseo entero, y en
    // la pantalla de repaso se llevaría por delante los textos escritos.
    // La ruta además del DOM: mientras el recorrido se está montando,
    // la pantalla vieja sigue puesta y el selector solo no lo ve.
    const ocupado = document.querySelector('.sheet, .viewer.on, .informe, .pantalla-recorrido, .d-visor, .d-hoja-acciones, .d-menu-velo, .d-velo')
      || location.hash.includes('/recorrido')
      || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (ocupado) return;
    vista = e.revision;
    refrescar();
  });
}

async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  let registro;
  try {
    // «updateViaCache: none»: al comprobar si hay versión nueva, que no
    // se conforme con la copia que el navegador tenga guardada de este
    // mismo fichero. Si lo hiciera, podría no enterarse en horas.
    registro = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
  } catch { return; /* sin caché offline, pero la app funciona */ }

  // Si el relevo toma el mando —porque lo ha pedido esta pantalla o
  // porque lo ha pedido otra pestaña— hay que recargar. Lo que queda en
  // memoria es de la versión anterior, y a partir de ese momento todo
  // lo que se pida vendrá de la caché nueva: la mezcla otra vez. Se
  // engancha una sola vez, aquí, y no dentro de ningún manejador.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (saltandoVersion) location.reload();
    else if (!hayAlgoAMedias()) location.reload();
    // Con algo a medias no se recarga: lo que haya en pantalla vale más
    // que la versión nueva, y si algo se descuadra el enrutador ya
    // recarga solo al fallar (ver esFalloDeCodigo).
  });

  /* La versión nueva no se anuncia: se pone sola.

     Antes salía un rótulo —«Hay una versión nueva. Se pone al cerrar y
     abrir la app»— cada vez que se desplegaba un cambio, y no le servía
     a nadie: el que lo leía creía que tenía que hacer algo, y no había
     nada que hacer. Ahora el relevo entra solo en el primer momento en
     que no rompe nada: al cambiar de pantalla, al volver a la app tras
     un rato fuera, o aquí mismo si ya estaba esperando al arrancar.
     Entre pantalla y pantalla la recarga ni se ve: la pantalla nueva
     iba a pintarse igual. */
  /* Recién arrancados es EL momento de poner la versión que espere: la
     página está limpia —sin fetches colgados que bloqueen la activación
     (ver relevoSilencioso)— y el salto entra a la primera. La recarga
     que lo remata cae dentro del propio arranque y no se distingue de
     una carga algo más lenta. */
  if (registro.waiting && navigator.serviceWorker.controller && !hayAlgoAMedias()) {
    aplicarVersionEsperando(registro);
  } else if (!registro.waiting) {
    // Ciclo completado (o nada que poner): la próxima versión que
    // llegue puede volver a empezar el suyo.
    sessionStorage.removeItem('relevo-ciclo');
  }
  // Al descubrirse una versión a mitad de sesión no se hace nada: le
  // quitaría la pantalla de delante a quien está leyendo. El siguiente
  // cambio de pantalla, que es cuestión de segundos, la pone.

  aplicarAlVolver();
}

/* Cada versión tiene UN intento de ciclo por sesión y tramo de diez
   minutos: si algo saliera mal no se puede entrar en un bucle de
   recargas, que es lo único peor que quedarse con la versión vieja. */
const RATO_ENTRE_CICLOS = 10 * 60 * 1000;

/**
 * Pone la versión que espera, si la hay y no rompe nada. Sin avisos.
 *
 * No la pone en caliente, y no por gusto: el salto en caliente se
 * probó y es traicionero. La activación del relevo espera a que el
 * worker viejo termine TODO lo que tenga entre manos, y basta un fetch
 * colgado de la sesión —una foto a medio traer, una petición que no
 * contesta— para que el salto se quede bloqueado sin error ninguno:
 * en las pruebas el mismo mensaje entraba con la página recién
 * cargada y se perdía tras pasear por dos pantallas.
 *
 * Así que se hace al revés, determinista: aquí solo se RECARGA. La
 * recarga mata cualquier fetch colgado, y nada más arrancar —página
 * limpia— el arranque pone el relevo y remata con su propia recarga
 * (ver registrarServiceWorker). Dos cargas seguidas en una frontera
 * donde iba a pintarse una pantalla nueva de todas formas: se siente
 * como una carga algo más lenta, no como un salto.
 */
async function relevoSilencioso() {
  if (!navigator.serviceWorker?.controller) return false;
  // Lo que haya a medias se mira ANTES del hueco asíncrono: es el
  // estado del momento en que se decidió saltar, no el de después.
  if (hayAlgoAMedias()) return false;
  const registro = await versionEsperando();
  if (!registro) return false;
  const ultimo = Number(sessionStorage.getItem('relevo-ciclo') || 0);
  if (Date.now() - ultimo < RATO_ENTRE_CICLOS) return false;
  sessionStorage.setItem('relevo-ciclo', String(Date.now()));
  location.reload();
  return true;
}

/* Cuánto tiene que estar guardada la aplicación para que al volver se
   considere una vuelta y no un vistazo al reloj. */
const RATO_FUERA = 5 * 60 * 1000;

/**
 * Aplica la versión que esté esperando cuando se vuelve a la app tras
 * un rato fuera y no hay nada a medias.
 *
 * Hace falta porque el iPhone no cierra las aplicaciones: las deja
 * vivas en segundo plano días enteros. Sin esto, quien no cierre la app
 * a mano se quedaría con la versión de hace un mes y con un aviso que
 * no sabe cómo quitarse.
 *
 * Y solo cuando no hay nada a medias, porque recargar es empezar de
 * cero: si hay una hoja abierta, un texto a medio escribir, una foto
 * hecha y sin mandar o un recorrido grabando, se deja para la próxima.
 */
function aplicarAlVolver() {
  let escondidaDesde = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { escondidaDesde = Date.now(); return; }
    if (!navigator.serviceWorker.controller) return;
    if (Date.now() - escondidaDesde < RATO_FUERA) return;
    // Preguntar por una versión nueva, que si no nadie pregunta. El
    // navegador lo hace al abrir una página, y dentro de la app del
    // iPhone solo hay UNA: la del arranque. Sin esto, una app que se
    // queda cinco días en segundo plano no se enteraría de tres
    // despliegues seguidos.
    try {
      await (await navigator.serviceWorker.getRegistration())?.update();
    } catch { /* sin red: otra vez será */ }
    // Con algo a medias, relevoSilencioso no hace nada ni avisa: el
    // siguiente cambio de pantalla la pondrá sin que se note.
    relevoSilencioso();
  });
}

/* Que la recarga por cambio de mando no dude cuando es esta pantalla la
   que lo ha pedido. */
let saltandoVersion = false;

/**
 * Le dice al relevo que tome el mando. La recarga viene después.
 *
 * Con reintentos, y no por gusto: el navegador PARA el service worker
 * que espera al poco de instalarlo, y un mensaje mandado a un worker
 * parado puede perderse sin error ninguno. Se vio en las pruebas:
 * mandado a los cuatro segundos de instalarse funcionaba siempre, y a
 * los quince ya no llegaba nunca. Así que se manda, se espera un
 * momento, y se comprueba que el salto ha prendido —que ya no hay
 * nadie esperando—; si no, otra vez. Resuelve dice más que promete.
 */
export async function aplicarVersionEsperando(registro) {
  if (!registro?.waiting) return false;
  saltandoVersion = true;
  for (let intento = 0; intento < 6; intento++) {
    registro.waiting?.postMessage({ tipo: 'saltar-espera' });
    await new Promise((r) => setTimeout(r, 700));
    const fresco = await navigator.serviceWorker.getRegistration().catch(() => null);
    if (!fresco?.waiting) return true;   // ya está tomando el mando
    registro = fresco;
  }
  saltandoVersion = false;
  return false;
}

/**
 * ¿Hay una versión esperando? La usa Ajustes para enseñar el botón de
 * ponerla, que es la salida a mano para quien nunca cierra la app.
 */
export async function versionEsperando() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const r = await navigator.serviceWorker.getRegistration();
    return r?.waiting ? r : null;
  } catch { return null; }
}

/** ¿Hay algo empezado que una recarga se llevaría por delante? */
function hayAlgoAMedias() {
  if (hayFotosSinMandar()) return true;
  if (document.querySelector('.sheet, .viewer.on, .informe, .pantalla-recorrido, .d-visor, .d-menu-velo, .d-velo, .d-hoja-acciones')) return true;
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return true;
  if (location.hash.includes('/recorrido')) return true;
  // La pantalla de nueva tarea lleva fotos en memoria —las de la
  // bandeja, recién hechas y sin guardar aún— que una recarga tiraría.
  if (location.hash.includes('/nueva')) return true;
  return false;
}

/**
 * El pellizco no encoge la app.
 *
 * En Android basta con `minimum-scale=1` en el <meta>, pero Safari en
 * iOS se salta esa clave —y también `user-scalable`— cuando la app se
 * abre en una pestaña, así que allí hay que cortar el gesto a mano.
 * `gesturestart` y compañía son eventos propios de Safari y solo saltan
 * con dos dedos: el desplazamiento normal y el carrete de fotos, que se
 * arrastra de lado con un dedo, siguen funcionando igual.
 */
for (const gesto of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(gesto, (e) => e.preventDefault(), { passive: false });
}

// Un fallo no capturado no debe dejar la pantalla en blanco sin explicación.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason instanceof api.ApiError && e.reason.codigo === 'red') return;
  console.error('Fallo no capturado:', e.reason);
});

arrancar().catch((e) => {
  console.error(e);
  quitarPantallaDeArranque();
  app.replaceChildren(h('div.screen.no-tabs', null,
    h('h1.display', null, 'No arranca'),
    h('p.sub', null, e?.message || 'Error desconocido al iniciar la aplicación.'),
    h('button.btn.ink', { onclick: () => location.reload() }, 'Reintentar'),
    h('p.sub', { style: { marginTop: '24px' } },
      'Si reintentar no lo arregla, esto vacía la copia local de este ' +
      'dispositivo y descarga la app de nuevo. Lo ya sincronizado se ' +
      'recupera del servidor al entrar.'),
    h('button.btn', { onclick: rescateLocal }, 'Vaciar la copia local y entrar de nuevo'),
  ));
});

/* El rescate de emergencia: tira la base local, las cachés y el service
   worker, y recarga. Es el botón de «apagar y encender» para cuando el
   almacenamiento del navegador queda en un estado que ni el arranque
   tolerante sabe curar. */
async function rescateLocal() {
  const seguro = confirm(
    'Se borra la copia local de este dispositivo (lo pendiente de subir se pierde). '
    + 'Lo ya sincronizado se recupera del servidor. ¿Seguir?');
  if (!seguro) return;
  try {
    const registros = await (navigator.serviceWorker?.getRegistrations?.() ?? []);
    await Promise.all([...registros].map((r) => r.unregister().catch(() => {})));
    const nombres = await (window.caches?.keys?.() ?? []);
    await Promise.all([...nombres].map((n) => caches.delete(n).catch(() => {})));
    await borrarBase();
  } finally {
    location.reload();
  }
}

export { toast };
