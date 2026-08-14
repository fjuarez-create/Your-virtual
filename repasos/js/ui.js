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
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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
   Trazo de 1.8, extremos redondeados: pesa lo mismo que el texto
   en negrita y no ensucia las píldoras grises. */
const PATHS = {
  chevron: 'M9 5l7 7-7 7',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  arrowLeft: 'M19 12H5M11 19l-7-7 7-7',
  home: 'M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  building: 'M4 21V6a1 1 0 011-1h6a1 1 0 011 1v15M12 21V10a1 1 0 011-1h6a1 1 0 011 1v11M3 21h18M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.5 2',
  gear: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  camera: 'M3 8.5A1.5 1.5 0 014.5 7h2.2a1 1 0 00.83-.45l.94-1.4A1 1 0 019.3 4.7h5.4a1 1 0 01.83.45l.94 1.4a1 1 0 00.83.45h2.2A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z M12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  image: 'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z M3 16l4.5-4.5a1.5 1.5 0 012.1 0L14 16 M14.5 13.5l1.9-1.9a1.5 1.5 0 012.1 0L21 14.2 M9 9.5a1 1 0 100-2 1 1 0 000 2z',
  video: 'M3.5 6.5h11a1 1 0 011 1v9a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9a1 1 0 011-1z M15.5 10.5l4-2.4a.6.6 0 01.9.5v6.8a.6.6 0 01-.9.5l-4-2.4z',
  mic: 'M12 3.5a2.6 2.6 0 012.6 2.6v5.4a2.6 2.6 0 11-5.2 0V6.1A2.6 2.6 0 0112 3.5z M5.5 11a6.5 6.5 0 0013 0 M12 17.5V21 M9 21h6',
  plus: 'M12 5v14M5 12h14',
  check: 'M4.5 12.5l5 5 10-11',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16 M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2 M6 7l.9 12a1 1 0 001 .9h8.2a1 1 0 001-.9L18 7 M10 11v5M14 11v5',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8z M4.5 20.5a7.5 7.5 0 0115 0',
  users: 'M9.5 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z M2.5 20a7 7 0 0114 0 M16 5a3.5 3.5 0 010 7 M17 14.2a7 7 0 014.5 5.8',
  logout: 'M15 4.5h3.5a1 1 0 011 1v13a1 1 0 01-1 1H15 M11 8l4 4-4 4 M15 12H3.5',
  cloud: 'M7 18.5A4 4 0 016.6 10.6a5.5 5.5 0 0110.6-1.1A3.8 3.8 0 0117 18.5z',
  cloudOff: 'M3 3l18 18 M7 18.5A4 4 0 016.6 10.6a5.4 5.4 0 011-1.9 M10.6 6.1a5.5 5.5 0 016.6 3.4A3.8 3.8 0 0119 17.4 M9 18.5h8',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14z M20.5 20.5l-4.4-4.4',
  edit: 'M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17z M14.5 6.5l3 3',
  play: 'M8 5.5l11 6.5-11 6.5z',
  list: 'M4.5 7h15M4.5 12h15M4.5 17h9',
  clipboard: 'M9 4.5h6a1 1 0 011 1V7H8V5.5a1 1 0 011-1z M8 6H6a1 1 0 00-1 1v12.5a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2 M8.5 12h7M8.5 16h4',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17.2v.1',
  stop: 'M7.5 7.5h9v9h-9z',
  key: 'M14.5 4a5.5 5.5 0 015 7.9L20 13l-2 2-2-1-2 2-2-1-2 2H6v-3l5.6-5.6A5.5 5.5 0 0114.5 4z M16.5 8.2v.1',
  download: 'M12 4v11 M8 11.5l4 4 4-4 M4.5 19.5h15',
  refresh: 'M20 12a8 8 0 11-2.6-5.9 M20 3.5V8h-4.5',
  share: 'M12 3.5v12 M8.5 7l3.5-3.5L15.5 7 M5.5 12.5v7a1 1 0 001 1h11a1 1 0 001-1v-7',
  copy: 'M9 9.5A1.5 1.5 0 0110.5 8h8A1.5 1.5 0 0120 9.5v9a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 019 18.5z M15.5 5.5A1.5 1.5 0 0014 4H5.5A1.5 1.5 0 004 5.5V14a1.5 1.5 0 001.5 1.5',
  documento: 'M6 3.5h7l5 5V20a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5a1 1 0 011-1z M13 3.5V8a1 1 0 001 1h4 M8.5 13.5h7 M8.5 17h4',
  hilo: 'M20.5 12a7.5 7.5 0 01-10.9 6.7L4.5 20l1.3-5A7.5 7.5 0 1120.5 12z',
  rechazo: 'M12 21a9 9 0 100-18 9 9 0 000 18z M15 9l-6 6 M9 9l6 6',
};

export function icon(name, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (size) { svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
  for (const d of (PATHS[name] || '').split(' M').map((p, i) => (i ? 'M' + p : p))) {
    if (!d.trim()) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
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

/** Confirmación con dos botones. Resuelve a true/false. */
export function confirmSheet({ title, text, ok = 'Confirmar', danger = false }) {
  return sheet((close) => [
    h('h2.title', null, title),
    text && h('p.sub', null, text),
    h('div.btn-row', null,
      h('button.btn.ghost', { onclick: () => close(false) }, 'Cancelar'),
      h('button.btn', { class: danger ? 'danger' : 'ink', onclick: () => close(true) }, ok),
    ),
  ]).then((v) => v === true);
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
