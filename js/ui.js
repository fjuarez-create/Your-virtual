/* ═══════════════════════════════════════════════════════════════
   ui.js — Interfaz DOM: filtros, panel de detalle, listado,
   tooltip, selector de plantas y estadísticas.
   ═══════════════════════════════════════════════════════════════ */
import { FLOOR_DEFS, plantaNum } from 'app/layout.js';
import { DEVELOPMENTS } from 'app/promotions.js';

/** Inserta separadores invisibles (U+2060) para que los detectores de
    direcciones de iOS/Chrome no conviertan "Vivienda 116" en un enlace
    a Google Maps. Visualmente idéntico. */
export const nd = (v) => String(v).split('').join('⁠');

export const fmtEUR = (n) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const fmtM2 = (n) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

const $ = (s) => document.querySelector(s);

export function initUI(app) {
  // ── Tarjetas de promoción en la portada ──
  const cards = $('#promoCards');
  for (const dev of DEVELOPMENTS) {
    const b = document.createElement('button');
    b.className = 'promo-card';
    b.innerHTML = `
      <span class="pc-name">${dev.name}</span>
      <span class="pc-loc">${dev.location}</span>
      <span class="pc-meta">${dev.tagline}</span>
      <span class="pc-go">Explorar <i>→</i></span>`;
    b.addEventListener('click', () => app.enter(dev));
    cards.appendChild(b);
  }

  // ── Marca + volver + selector de edificio (desplegable propio) ──
  $('#brandName').textContent = app.dev.name;
  $('#backHome').addEventListener('click', () => app.exitToHome());
  const bldSel = $('#bldSel');
  const bldBtn = $('#bldBtn');
  const bldMenu = $('#bldMenu');
  const closeBld = () => { bldSel.classList.remove('open'); bldBtn.setAttribute('aria-expanded', 'false'); };
  const refreshBld = () => {
    $('#bldLabel').textContent = `Edificio ${app.building.name}`;
    bldMenu.querySelectorAll('.bld-item').forEach((i) =>
      i.classList.toggle('sel', i.dataset.id === app.building.id));
  };
  for (const bld of app.dev.buildings) {
    const o = document.createElement('button');
    o.className = 'bld-item';
    o.dataset.id = bld.id;
    o.disabled = !bld.active;
    o.setAttribute('role', 'option');
    o.innerHTML = `<svg><use href="#i-check"/></svg>
      <span>Edificio ${bld.name}${bld.active ? '' : ' · próximamente'}</span>`;
    o.addEventListener('click', () => { app.setBuilding(bld.id); refreshBld(); closeBld(); });
    bldMenu.appendChild(o);
  }
  refreshBld();
  bldBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = bldSel.classList.toggle('open');
    bldBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('pointerdown', (e) => { if (!bldSel.contains(e.target)) closeBld(); });

  // ── Día / noche (switch) ──
  $('#dnToggle').addEventListener('click', () => app.setNight(!app.night));

  // ── Selector de plantas ──
  const wrap = $('#floorBtns');
  for (const F of FLOOR_DEFS) {
    const b = document.createElement('button');
    b.className = 'floor-btn';
    b.dataset.floor = F.key;
    b.innerHTML = `<span class="fb-short">${F.short}</span>`;
    b.addEventListener('click', () => app.setFloor(F.key));
    wrap.appendChild(b);
  }
  $('.floor-all').addEventListener('click', () => app.setFloor('all'));

  // ── Modos ──
  $('#modo3d').addEventListener('click', () => app.setMode('3d'));
  $('#modoPlano').addEventListener('click', () => app.setMode('plano'));
  $('#modoLista').addEventListener('click', () => app.setMode('lista'));

  // ── Axonometría (control retirado de la UI; se conserva por si vuelve) ──
  const exR = $('#explodeRange');
  if (exR) exR.addEventListener('input', (e) => app.setExplode(e.target.value / 100));

  // ── Filtros ──
  $('#filtersToggle').addEventListener('click', () => $('#filters').classList.toggle('open'));
  const bindChips = (sel, attr, set) => {
    $(sel).querySelectorAll('.chip').forEach((c) =>
      c.addEventListener('click', () => {
        const v = attr === 'dorm' ? +c.dataset[attr] : c.dataset[attr];
        c.classList.toggle('on') ? set.add(v) : set.delete(v);
        app.onFiltersChanged();
      })
    );
  };
  bindChips('#chipsDorm', 'dorm', app.filters.dorms);
  bindChips('#chipsEstado', 'estado', app.filters.estados);
  bindChips('#chipsOrient', 'orient', app.filters.orients);
  $('#chipTerraza').addEventListener('click', (e) => {
    app.filters.terraza = e.currentTarget.classList.toggle('on');
    app.onFiltersChanged();
  });
  const priceMax = $('#priceMax');
  priceMax.addEventListener('input', () => {
    app.filters.priceMax = +priceMax.value;
    $('#priceMaxLabel').textContent = fmtEUR(app.filters.priceMax);
    app.onFiltersChanged();
  });
  $('#priceMaxLabel').textContent = fmtEUR(+priceMax.value);
  $('#filtersApply').addEventListener('click', () => $('#filters').classList.remove('open'));
  $('#filtersReset').addEventListener('click', () => {
    app.filters.dorms.clear(); app.filters.estados.clear(); app.filters.orients.clear();
    app.filters.terraza = false; app.filters.priceMax = +priceMax.max;
    priceMax.value = priceMax.max;
    $('#priceMaxLabel').textContent = fmtEUR(+priceMax.max);
    document.querySelectorAll('#filtersBody .chip.on').forEach((c) => c.classList.remove('on'));
    app.onFiltersChanged();
  });

  // ── Panel / listado / lightbox ──
  $('#panelClose').addEventListener('click', () => app.select(null));
  $('#listClose').addEventListener('click', () => app.setMode('3d'));
  $('#lbClose').addEventListener('click', () => $('#lightbox').classList.remove('open'));
  $('#lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') $('#lightbox').classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('#lightbox').classList.remove('open');
      $('#listado').classList.remove('open');
      app.select(null);
    }
  });

  // ── Ordenación del listado ──
  document.querySelectorAll('#unitsTable th').forEach((th) =>
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      app.sort = app.sort?.k === k ? { k, dir: -app.sort.dir } : { k, dir: 1 };
      renderTable(app);
    })
  );
}

export function markDayNight(night) {
  const t = $('#dnToggle');
  t.classList.toggle('night', night);
  t.setAttribute('aria-checked', night ? 'true' : 'false');
}

export function markFloorButtons(floorKey) {
  document.querySelectorAll('#floorNav .floor-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.floor === floorKey)
  );
}

export function markModeButtons(mode) {
  $('#modo3d').classList.toggle('active', mode === '3d');
  $('#modoPlano').classList.toggle('active', mode === 'plano');
  $('#modoLista').classList.toggle('active', mode === 'lista');
}

export function updateStats(app) {
  const passing = app.units.filter((u) => app.passesFilters(u)).length;
  const active = app.filters.dorms.size || app.filters.estados.size || app.filters.orients.size ||
    app.filters.terraza || app.filters.priceMax < 481000;
  const fc = $('#filterCount');
  fc.textContent = active ? String(passing) : '';
  fc.classList.toggle('show', !!active);
}

// ── Tooltip ──
export function showTooltip(app, unit, x, y) {
  const tt = $('#tooltip');
  const estado = app.estadoDe(unit.id);
  tt.innerHTML = `
    <div class="tt-head">
      <span class="tt-id">Viv.&#8288; ${nd(unit.id)}</span>
      <span class="tt-estado" style="color:var(--${estado === 'disponible' ? 'disp' : estado === 'reservada' ? 'res' : 'ven'})">${estado}</span>
    </div>
    <div class="tt-row">Planta ${plantaNum(unit)} · ${unit.dorm}D · ${unit.orientacion}</div>
    <div class="tt-row">${fmtM2(unit.supTotal)}${unit.terraza ? ` (terraza ${fmtM2(unit.terraza)})` : ''}</div>
    <div class="tt-precio">${fmtEUR(unit.precio)}</div>`;
  const px = Math.min(x, window.innerWidth - 220);
  tt.style.left = px + 'px';
  tt.style.top = Math.max(y, 70) + 'px';
  tt.classList.add('show');
}
export function hideTooltip() { $('#tooltip').classList.remove('show'); }

// ── Panel de detalle ──
export function renderPanel(app, unit) {
  const panel = $('#panel');
  if (!unit) { panel.classList.remove('open'); return; }
  const estado = app.estadoDe(unit.id);
  const F = FLOOR_DEFS.find((f) => f.key === app.floorOf(unit));
  const ppm2 = unit.precio / unit.supTotal;
  const disponible = estado === 'disponible';
  $('#panelBody').innerHTML = `
    <p class="p-kicker">${app.dev.name} · Edificio&#8288; ${app.building.name}</p>
    <h2 class="p-title">Vivienda&#8288; <b>${nd(unit.id)}</b></h2>
    <p class="p-sub">${F.label} · ${unit.orientacion}</p>
    <span class="badge ${estado}">${estado}</span>
    <div class="p-price">${fmtEUR(unit.precio)}
      <small>${fmtEUR(Math.round(ppm2))}/m² · IGIC no incluido</small>
    </div>
    <div class="spec-grid">
      <div class="spec"><b>${unit.dorm}</b><span>Dormitorio${unit.dorm > 1 ? 's' : ''}</span></div>
      <div class="spec"><b>${fmtM2(unit.supViv)}</b><span>Sup. vivienda</span></div>
      <div class="spec"><b>${unit.terraza ? fmtM2(unit.terraza) : '—'}</b><span>Terraza</span></div>
      <div class="spec"><b>${fmtM2(unit.supTotal)}</b><span>Sup. total</span></div>
    </div>
    <div class="p-section">
      <h3>Plano de planta</h3>
      <a class="plan-thumb" data-plan="${F.plan}" data-cap="${F.planLabel} — Vivienda ${unit.id}">
        <img src="${F.plan}" alt="${F.planLabel}">
      </a>
    </div>
    <div class="p-section">
      <h3>Imágenes</h3>
      <div class="render-ph"><span>Render ${unit.dorm}D · ${unit.orientacion} — próximamente</span></div>
      <p class="p-note">Coloca los renders definitivos en <code>assets/renders/</code> (ver README).</p>
    </div>
    <div class="p-ctas">
      <button class="btn-primary" id="ctaLead" ${disponible ? '' : 'disabled'}>
        ${disponible ? 'Solicitar información' : estado === 'reservada' ? 'Vivienda reservada' : 'Vivienda vendida'}
      </button>
      <a class="btn-ghost" href="assets/APOLO_Fichas_Comerciales.pdf" target="_blank" rel="noopener">Descargar planos (PDF)</a>
    </div>
    <p class="p-note">Plaza de garaje: 15.000 € · Trastero: 2.000 € (opcionales, sujetos a disponibilidad).
    Precios sin IGIC ni gastos de compraventa. Documento informativo, no contractual.</p>`;

  $('#panelBody .plan-thumb').addEventListener('click', (e) => {
    const el = e.currentTarget;
    $('#lbImg').src = el.dataset.plan;
    $('#lbCap').textContent = el.dataset.cap;
    $('#lightbox').classList.add('open');
  });
  const cta = $('#ctaLead');
  if (cta && disponible) cta.addEventListener('click', () => app.requestInfo(unit));
  panel.classList.add('open');
}

// ── Listado (solo viviendas disponibles, a pantalla completa) ──
export function renderTable(app) {
  const tbody = $('#unitsTable tbody');
  let rows = app.units.filter((u) => app.estadoDe(u.id) === 'disponible' && app.passesFilters(u) &&
    (app.floor === 'all' || app.floorOf(u) === app.floor));
  if (app.sort) {
    const { k, dir } = app.sort;
    rows = [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
  }
  $('#listCount').textContent = `${rows.length}`;
  tbody.innerHTML = rows.map((u) => `
    <tr data-id="${u.id}">
      <td class="u-id">${nd(u.id)}</td>
      <td>${plantaNum(u)}</td>
      <td>${u.dorm}D</td>
      <td>${fmtM2(u.supTotal)}${u.terraza ? ' <em class="u-terr">terraza</em>' : ''}</td>
      <td class="u-precio">${fmtEUR(u.precio)}</td>
    </tr>`).join('');
  tbody.querySelectorAll('tr').forEach((tr) =>
    tr.addEventListener('click', () => {
      app.setMode('3d');
      app.select(tr.dataset.id, { focus: true });
    })
  );
}
