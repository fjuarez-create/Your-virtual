import { TRAZADOS, LIENZO } from './iconos.js';

/* ═══════════════════════════════════════════════════════════════
   ui.js — piezas de interfaz compartidas: creación de nodos,
   iconos, avisos, hojas inferiores y visor a pantalla completa.
   Sin dependencias; todo se construye con DOM.
   ═══════════════════════════════════════════════════════════════ */

/** Crea un elemento. h('div.row', {onclick}, hijos…) */
export function h(spec, props = null, ...children) {
  const [tagPart, ...classes] = String(spec).split('.');
  const el = document.createElement(tagPart || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
      else if (k === 'style' && typeof v === 'object') {
        // Object.assign ignora en silencio las propiedades personalizadas
        // (--x y compañía): esas hay que ponerlas con setProperty.
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, val);
          else el.style[prop] = val;
        }
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  add(el, children);
  return el;
}

function add(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

/* ─── Iconos ────────────────────────────────────────────────────
   Phosphor Icons, peso «regular», embebidos en js/iconos.js. Son
   trazados rellenos sobre un lienzo de 256, no trazos: de ahí que
   aquí no se toque stroke-width, solo el color. */
export function icon(nombre, tam) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', LIENZO);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (tam) { svg.style.width = tam + 'px'; svg.style.height = tam + 'px'; }
  const d = TRAZADOS[nombre];
  if (d) svg.innerHTML = d;
  return svg;
}

/* ─── Avatar ────────────────────────────────────────────────────
   Foto si la hay; si no, las iniciales sobre un color estable para
   esa persona. Estable y no aleatorio a propósito: si cambiara en
   cada pantalla dejaría de servir para reconocer a nadie. */
/* Pardos, arenas, piedras y grises: la familia del acento. Se
   distinguen entre sí por tono y por claridad, no solo por claridad,
   para que dos bolitas juntas no parezcan la misma con otra luz. */
const PALETA_AVATAR = [
  '#9b8f7f', // taupe (el de la marca)
  '#6e6558', // tierra tostada
  '#b3a08a', // arena
  '#5f6560', // piedra verdosa
  '#8d8a95', // gris lila
  '#a8927c', // caramelo apagado
  '#767f7a', // salvia oscura
  '#c0b6a6', // lino
  '#7d7f8c', // pizarra
  '#8f7f6e', // topo
  '#9aa08e', // oliva claro
  '#5c5b57', // grafito cálido
];

/**
 * El equipo lleva su color escrito. Nueve personas repartidas por un
 * hash sobre doce colores chocan casi seguro (cumpleaños), y el encargo
 * era que fuesen todos distintos; así que a quien ya está se le asigna
 * a mano y el hash queda de reserva para quien entre después.
 *
 * La clave es el nombre y no el identificador porque el nombre es el
 * único dato de una persona que la app conoce siempre: en una tarea
 * sincronizada viaja quién la creó y cómo se llama, nunca su ficha.
 */
const COLOR_DEL_EQUIPO = {
  'francisco juarez del dago': '#9b8f7f',
  'alba garcia': '#6e6558',
  'felix j bordes': '#b3a08a',
  'felipe remacha': '#5f6560',
  'tomas bordes': '#8d8a95',
  'andrea garcia': '#a8927c',
  'fran acien': '#767f7a',
  'juanjo arguelles': '#7d7f8c',
  'sofia santana': '#8f7f6e',
};

/** Minúsculas, sin tildes y sin signos, para que «Félix J. Bordes» y
    «Felix J Bordes» sean la misma persona. */
function clave(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Luminancia relativa, para decidir si el texto va en tinta o en blanco. */
function luminancia(hex) {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

/**
 * Color de una persona: siempre el mismo, en cualquier dispositivo y sin
 * consultar nada. Acepta la ficha entera o solo un nombre.
 */
export function colorDe(persona) {
  const nombre = typeof persona === 'string' ? persona : persona?.nombre;
  const escrito = COLOR_DEL_EQUIPO[clave(nombre)];
  if (escrito) return escrito;

  const texto = clave(nombre) || String(persona?.id || persona || '');
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return PALETA_AVATAR[h % PALETA_AVATAR.length];
}

/**
 * Bolita de una persona. `usuario` necesita id, nombre y, si tiene
 * foto, `avatar` (la marca de tiempo que sirve para refrescar la caché).
 */
export function avatar(usuario, { tam = 44, radio = '50%', onclick, etiqueta } = {}) {
  const fondo = colorDe(usuario);
  const nodo = h(onclick ? 'button.avatar' : 'div.avatar', {
    style: {
      width: tam + 'px', height: tam + 'px', flex: `0 0 ${tam}px`,
      borderRadius: radio,
      background: fondo,
      color: luminancia(fondo) > 0.42 ? '#111112' : '#ffffff',
      fontSize: Math.round(tam * 0.34) + 'px',
    },
    // «Cuenta de X» solo si se puede pulsar; en un listado la bolita
    // informa de quién creó la tarea, no lleva a ninguna cuenta.
    'aria-label': etiqueta
      || (onclick
        ? (usuario?.nombre ? `Cuenta de ${usuario.nombre}` : 'Cuenta')
        : (usuario?.nombre || '')),
    onclick,
  }, iniciales(usuario?.nombre));

  if (usuario?.avatarUrl) {
    const img = h('img', {
      src: usuario.avatarUrl, alt: '',
      style: { width: '100%', height: '100%', objectFit: 'cover', opacity: '0' },
    });
    // La foto entra con un fundido: si falla, se quedan las iniciales.
    img.addEventListener('load', () => {
      img.style.transition = 'opacity var(--mov-medio) var(--sal-estandar)';
      img.style.opacity = '1';
      nodo.classList.add('con-foto');
    });
    img.addEventListener('error', () => img.remove());
    nodo.append(img);
  }
  return nodo;
}

/**
 * Varias personas en una sola bolita: las que han tocado esto. Se
 * apilan solapadas, la primera delante. Pasado el tope se resume con
 * «+n», que es cuando dejarían de leerse las iniciales.
 *
 * `hueco` reserva sitio para ese número de bolitas aunque no las haya.
 * En un listado sirve para que el texto de al lado empiece siempre en
 * el mismo punto: si el hueco creciera con la gente, los nombres
 * bailarían de fila en fila y no habría manera de recorrerlos con la
 * vista. En una tarjeta suelta no hace falta y se deja a cero.
 *
 * `vacio` pinta una bolita apagada cuando no hay nadie, para que la
 * fila no se quede coja. Es un disco liso, sin cara y sin iniciales, y
 * eso es deliberado: en una app cuyo objeto es dejar constancia de
 * quién vio qué, una cara inventada acabaría leyéndose como una
 * persona de verdad.
 */
export function grupoAvatares(gente = [], { tam = 38, max = 3, hueco = 0, vacio = false, solape } = {}) {
  const lista = gente.slice(0, max);
  const resto = gente.length - lista.length;
  // De cada bolita tapada asoma una cuarta parte. No se trata de
  // reconocer la cara —para eso está el nombre— sino de ver de un
  // vistazo cuánta gente hay detrás de esto; apretadas ocupan poco y
  // dejan sitio al texto. Las tarjetas del rediseño piden otro aire y
  // pasan su propio solape en píxeles.
  solape = solape ?? Math.round(tam * 0.75);

  const paso = tam - solape;
  const piezas = lista.length + (resto > 0 ? 1 : 0);
  const anchoPila = piezas ? tam + (piezas - 1) * paso : 0;
  const anchoHueco = hueco ? tam + (hueco - 1) * paso : 0;

  const caja = h('div.avatares', {
    // El alto va atado al tamaño de la bolita: si se dejara fijo en el
    // CSS, una pila pequeña seguiría reservando el alto de una grande y
    // engordaría la fila sin que se vea por qué.
    style: { width: Math.max(anchoPila, anchoHueco) + 'px', height: tam + 'px' },
    'aria-label': gente.length ? gente.map((p) => p.nombre).join(', ') : 'Sin nadie todavía',
  });

  lista.forEach((p, i) => {
    const b = avatar(p, { tam });
    b.classList.add('apilado');
    b.style.left = `${i * paso}px`;
    // El primero delante: si no, el último taparía al que creó el acta.
    b.style.zIndex = String(lista.length - i);
    caja.append(b);
  });

  if (!lista.length && vacio) {
    caja.append(h('div.avatar.apilado.vacia', {
      style: { width: tam + 'px', height: tam + 'px', flex: `0 0 ${tam}px`, left: '0' },
      'aria-hidden': 'true',
    }));
  }

  if (resto > 0) {
    caja.append(h('div.avatar.apilado.mas', {
      style: {
        width: tam + 'px', height: tam + 'px', flex: `0 0 ${tam}px`,
        left: `${lista.length * paso}px`,
        fontSize: Math.round(tam * 0.32) + 'px',
      },
    }, '+' + resto));
  }
  return caja;
}

/**
 * Anillo de avance. Se dibuja al entrar en pantalla en lugar de
 * aparecer lleno: el recorrido es la información, y verlo crecer dice
 * de un vistazo si la villa va bien o va justa.
 */
export function anillo(pct, { tam = 46, grosor = 4, etiqueta = true } = {}) {
  const valor = Math.max(0, Math.min(100, Math.round(pct || 0)));
  const r = (tam - grosor) / 2;
  const vuelta = 2 * Math.PI * r;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${tam} ${tam}`);
  svg.setAttribute('width', tam);
  svg.setAttribute('height', tam);
  svg.setAttribute('aria-hidden', 'true');

  const aro = (color, extra = {}) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', tam / 2); c.setAttribute('cy', tam / 2); c.setAttribute('r', r);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', color);
    c.setAttribute('stroke-width', grosor);
    c.setAttribute('stroke-linecap', 'round');
    for (const [k, v] of Object.entries(extra)) c.setAttribute(k, v);
    return c;
  };

  svg.append(aro('var(--anillo-fondo, rgba(17,17,18,.10))'));
  const activo = aro('var(--anillo-color, var(--accent))', {
    'stroke-dasharray': vuelta,
    'stroke-dashoffset': vuelta,
    transform: `rotate(-90 ${tam / 2} ${tam / 2})`,
  });
  activo.style.transition = 'stroke-dashoffset var(--mov-largo) var(--sal-estandar)';
  svg.append(activo);

  const caja = h('div.anillo', { style: { width: tam + 'px', height: tam + 'px' } }, svg);
  if (etiqueta) caja.append(h('span.anillo-n', null, valor + '%'));

  // Se anima cuando entra en pantalla, no al construirse: en una lista
  // larga, animar cincuenta anillos a la vez fuera de la vista es tirar
  // trabajo, y además el efecto se lo pierde quien no está mirando.
  const arrancar = () => { activo.setAttribute('stroke-dashoffset', String(vuelta * (1 - valor / 100))); };
  if (window.IntersectionObserver && !prefiereQuieto()) {
    const obs = new IntersectionObserver((e) => {
      if (e[0].isIntersecting) { arrancar(); obs.disconnect(); }
    }, { threshold: 0.4 });
    requestAnimationFrame(() => obs.observe(caja));
  } else {
    activo.style.transition = 'none';
    arrancar();
  }
  return caja;
}

const prefiereQuieto = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * El logotipo de UNIK. El fichero es blanco sobre transparente y aquí
 * se usa como máscara: el dibujo lo pone el canal alfa y el color lo
 * pone el CSS, así que el mismo fichero sirve en negro sobre el fondo
 * claro de la entrada y en blanco sobre una superficie oscura.
 */
export function logoUnik({ alto = 26, color } = {}) {
  return h('span.logo-unik', {
    style: { height: alto + 'px', width: Math.round(alto * 4.126) + 'px', ...(color ? { background: color } : {}) },
    role: 'img',
    'aria-label': 'UNIK',
  });
}

/* ─── Avisos ──────────────────────────────────────────────────── */
let toastEl, toastTimer;
export function toast(message, kind = '') {
  if (!toastEl) {
    toastEl = h('div.toast', { role: 'status', 'aria-live': 'polite' });
    document.getElementById('app').append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = 'toast on' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast' + (kind ? ' ' + kind : ''); }, 2800);
}

/* ─── Hoja inferior ───────────────────────────────────────────── */
/**
 * Abre una hoja modal. `build(close)` devuelve el contenido.
 * Devuelve una promesa que resuelve con lo que se pase a close().
 */
export function sheet(build) {
  const app = document.getElementById('app');
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      veil.classList.remove('on');
      panel.classList.remove('on');
      setTimeout(() => { veil.remove(); panel.remove(); }, 320);
      resolve(value);
    };
    const veil = h('div.veil', { onclick: () => finish(undefined) });
    const panel = h('div.sheet', { role: 'dialog', 'aria-modal': 'true' },
      h('div.grab'),
      build(finish),
    );
    app.append(veil, panel);
    requestAnimationFrame(() => { veil.classList.add('on'); panel.classList.add('on'); });
  });
}

/**
 * «¿Seguro?», con el velo borroso y la tarjeta del diseño de ahora.
 *
 * Resuelve a true SOLO si se pulsa el botón de confirmar. Cerrar por la
 * X, tocar fuera o darle a Cancelar valen todos que no, que es lo único
 * razonable cuando detrás hay un borrado.
 *
 * El texto tiene que decir QUÉ se pierde y cuánto: «se borran 14 fotos
 * y 6:12 de grabación» frena la mano; «esta acción no se puede
 * deshacer», a secas, ya no lo lee nadie.
 *
 * El botón de confirmar va arriba, donde cae el pulgar, y el de
 * cancelar debajo: si te vas a equivocar, que sea hacia atrás.
 */
export function confirmar({
  titulo = '',
  texto = '',
  ok = 'Eliminar',
  icono = 'trash',
  conservar = 'Conservar',
  iconoConservar = 'corazon',
} = {}) {
  return new Promise((resolver) => {
    const cerrar = (valor) => { velo.remove(); resolver(valor); };

    const fila = (rotulo, ico, valor) => h('button.d-confirmar-fila', {
      onclick: () => cerrar(valor),
    }, icon(ico), h('span', null, rotulo));

    const tarjeta = h('div.d-confirmar-tarjeta', { role: 'dialog', 'aria-modal': 'true' },
      /* Título y explicación solo cuando hacen falta. Para «Eliminar
         imagen» sobra todo: el propio rótulo ya lo dice. Pero cuando lo
         que se va es media hora de trabajo, hay que decir CUÁNTO se
         pierde —«3 fotos y 6:12 de grabación»—, que es lo único que
         frena la mano de verdad. */
      titulo ? h('p.d-confirmar-titulo', null, titulo) : null,
      texto ? h('p.d-confirmar-texto', null, texto) : null,
      fila(ok, icono, true),
      fila(conservar, iconoConservar, false),
    );

    // La X va suelta debajo de la tarjeta, no dentro: es la salida sin
    // hacer nada, y separarla de las dos opciones deja claro que no es
    // una tercera.
    const velo = h('div.d-menu-velo.confirmar', {
      onclick: (e) => { if (e.target === velo) cerrar(false); },
    },
      tarjeta,
      h('button.d-confirmar-x', { 'aria-label': 'Cerrar', onclick: () => cerrar(false) }, icon('x')),
    );
    document.body.append(velo);
  });
}

/* El nombre viejo, con los rótulos en inglés que quedaron de antes.
   Lo llaman quince sitios de la app, así que renombrarlos todos es una
   tarea aparte; mientras tanto, con esto los quince preguntan ya con la
   tarjeta de ahora. La pregunta no cambia: solo cómo se ve.

   `danger` decide el par de filas. Un borrado se responde «Eliminar» o
   «Conservar», que es la pareja natural: la vuelta atrás no es
   «cancelar» —eso suena a deshacer el gesto—, es quedarse con lo que
   hay. Lo que no borra nada se responde sí o no, y ahí «Cancelar» es
   la palabra correcta. */
export function confirmSheet({ title, text, ok = 'Confirmar', danger = false }) {
  return confirmar({
    titulo: title,
    texto: text,
    ok,
    icono: danger ? 'trash' : 'check',
    conservar: danger ? 'Conservar' : 'Cancelar',
    iconoConservar: danger ? 'corazon' : 'x',
  });
}

/* ─── Visor a pantalla completa ───────────────────────────────── */
let viewerEl;
export function openViewer(node) {
  const app = document.getElementById('app');
  if (!viewerEl) {
    viewerEl = h('div.viewer', { onclick: (e) => { if (e.target === viewerEl) closeViewer(); } },
      h('button.close', { 'aria-label': 'Cerrar', onclick: closeViewer }, icon('x')),
    );
    app.append(viewerEl);
  }
  viewerEl.querySelectorAll(':scope > :not(.close)').forEach((n) => n.remove());
  viewerEl.append(node);
  viewerEl.classList.add('on');
}
export function closeViewer() {
  if (!viewerEl) return;
  viewerEl.classList.remove('on');
  viewerEl.querySelectorAll('video, audio').forEach((v) => v.pause());
  setTimeout(() => {
    if (viewerEl && !viewerEl.classList.contains('on')) {
      viewerEl.querySelectorAll(':scope > :not(.close)').forEach((n) => n.remove());
    }
  }, 260);
}

/* ─── Utilidades de formato ───────────────────────────────────── */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fechaLarga(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
export function fechaCorta(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
export function hora(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/**
 * «Hoy», «Ayer» o la fecha. Se comparan días del calendario local, no
 * horas transcurridas: algo de anoche a las 23:50 es «ayer» aunque haga
 * media hora, que es como lo diría cualquiera en la obra.
 */
export function fechaRelativa(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const soloDia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((soloDia(new Date()) - soloDia(d)) / 86400000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return fechaCorta(iso);
}
/** Días enteros transcurridos. Negativo si la fecha está por venir. */
export function diasDesde(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  const soloDia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((soloDia(new Date()) - soloDia(d)) / 86400000);
}

/**
 * «Hoy», «Hace 3 días», «Hace 2 semanas». Antigüedad y no fecha: en un
 * listado de cincuenta casas lo que se busca no es qué día fue, sino
 * cuáles llevan paradas.
 */
export function desdeHace(iso) {
  const dias = diasDesde(iso);
  if (Number.isNaN(dias)) return '';
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  if (dias < 14) return 'Hace 1 semana';
  if (dias < 60) return `Hace ${Math.floor(dias / 7)} semanas`;
  return `Hace ${Math.floor(dias / 30)} meses`;
}

export function iniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase();
}
export function pesoLegible(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
}
export function saludo() {
  const hh = new Date().getHours();
  if (hh < 6) return 'Buenas noches';
  if (hh < 14) return 'Buenos días';
  if (hh < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Estado vacío reutilizable. */
export function emptyState(iconName, title, text, action) {
  return h('div.empty-state', null,
    h('div.ico', null, icon(iconName)),
    h('h3', null, title),
    text && h('p.sub', null, text),
    action && h('div', { style: { marginTop: '20px' } }, action),
  );
}

/* ═══════════════════════════════════════════════════════════════
   QUE SE NOTE QUE SE PULSA — la onda de los botones anchos.
   ═══════════════════════════════════════════════════════════════ */

/**
 * La onda que sale de donde has puesto el dedo, solo en los botones de
 * ancho completo.
 *
 * En un botón ancho el cambio de tono es igual en toda la pastilla: te
 * dice que se ha pulsado algo, pero no *dónde*. Con el pulgar tapando
 * media pantalla eso es información que falta, y la onda la da. Es para
 * lo que se inventó, y no de adorno.
 *
 * En las bolas de 55 px no se pone, y es a propósito: ahí la ola
 * recorre 27 px, no se lee como movimiento y solo hace ruido. Las bolas
 * y las tarjetas se quedan con el cambio de tono, que es lo que les
 * pega. La regla, para no tener que pensarla cada vez: todo lo que se
 * toca cambia de tono; solo lo ancho y lo que decide algo lleva además
 * la onda.
 *
 * Cuatro cosas la salvan de parecer barata, y las cuatro están puestas:
 *   · blanco al 13 %, nunca una sombra oscura: el negro no oscurece más
 *     y lo que sale es una mancha sucia;
 *   · recortada por la pastilla —el overflow lo pone el CSS—, que si no
 *     la ola asoma por las esquinas redondeadas;
 *   · 300 ms, no los 550 largos de Android: estos botones navegan o
 *     descargan, y una ola creciendo cuando la pantalla ya ha cambiado
 *     se ve rota;
 *   · arranca al apoyar el dedo, no al soltarlo, que si no llega tarde
 *     siempre.
 *
 * Se engancha una sola vez a todo el documento, así que vale también
 * para los botones que nazcan después.
 */
/* Quién lleva onda. Hoy, los botones negros de ancho completo y nadie
   más: Guardar tarea, Nueva inspección, Bajar el acta en PDF, Rechazar
   tarea y los del recorrido. Sumar otro es añadirlo a esta línea. */
const CON_ONDA = '.d-boton-negro';

export function arrancarOndas() {
  document.addEventListener('pointerdown', (e) => {
    const boton = e.target?.closest?.(CON_ONDA);
    if (!boton || boton.disabled) return;

    const caja = boton.getBoundingClientRect();
    const x = e.clientX - caja.left;
    const y = e.clientY - caja.top;
    // El radio llega hasta la esquina más lejana: así la ola cubre la
    // pastilla entera venga el dedo de donde venga.
    const radio = Math.max(
      Math.hypot(x, y), Math.hypot(caja.width - x, y),
      Math.hypot(x, caja.height - y), Math.hypot(caja.width - x, caja.height - y),
    );

    const onda = h('span.d-onda', {
      style: {
        left: `${x}px`, top: `${y}px`,
        width: `${radio * 2}px`, height: `${radio * 2}px`,
      },
    });
    boton.append(onda);
    onda.addEventListener('animationend', () => onda.remove(), { once: true });
    // Cinturón por si la animación no llega a correr —pestaña en
    // segundo plano, movimiento reducido—: que no se queden ondas
    // pegadas dentro del botón para siempre.
    setTimeout(() => onda.remove(), 700);
  }, { passive: true });
}

/**
 * Deja que la onda arranque antes de ponerse a trabajar.
 *
 * El botón de bajar el acta fabrica el PDF entero de una sentada y sin
 * soltar el hilo. Si la ola sale y acto seguido el móvil se pone a ello,
 * se queda congelada a medias y parece que la app se ha colgado. Con dos
 * fotogramas de margen la animación ya está corriendo cuando empieza el
 * trabajo, y lo que se ve es una ola normal.
 */
export function trasLaOnda(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}
