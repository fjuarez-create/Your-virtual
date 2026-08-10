/* ═══════════════════════════════════════════════════════════════
   ui.js — Interfaz DOM: filtros, panel de detalle, listado,
   tooltip, selector de plantas y estadísticas.
   ═══════════════════════════════════════════════════════════════ */
import { FLOOR_DEFS } from './layout.js';
import { DEVELOPMENTS } from './promotions.js';

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

  // ── Marca + selector de edificio ──
  $('#brandName').textContent = app.dev.name;
  $('#brandLoc').textContent = app.dev.location;
  const sel = $('#buildingSelect');
  for (const bld of app.dev.buildings) {
    const o = document.createElement('option');
    o.value = bld.id;
    o.textContent = `Edificio ${bld.name}${bld.active ? '' : ' · próximamente'}`;
    o.disabled = !bld.active;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => app.setBuilding(sel.value));

  // ── Día / noche ──
  $('#dnDay').addEventListener('click', () => app.setNight(false));
  $('#dnNight').addEventListener('click', () => app.setNight(true));

  // ── Selector de plantas ──
  const wrap = $('#floorBtns');
  for (const F of FLOOR_DEFS) {
    const b = document.createElement('button');
    b.className = 'floor-btn';
    b.dataset.floor = F.key;
    b.innerHTML = `<span class="fb-name">${F.label}</span><span class="fb-sub"></span>`;
    b.addEventListener('click', () => app.setFloor(F.key));
    wrap.appendChild(b);
  }
  $('.floor-all').addEventListener('click', () => app.setFloor('all'));

  // ── Modos ──
  $('#modo3d').addEventListener('click', () => app.setMode('3d'));
  $('#modoPlano').addEventListener('click', () => app.setMode('plano'));
  $('#modoLista').addEventListener('click', () => app.setMode('lista'));

  // ── Axonometría ──
  $('#explodeRange').addEventListener('input', (e) => app.setExplode(e.target.value / 100));

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
  $('#dnDay').classList.toggle('on', !night);
  $('#dnNight').classList.toggle('on', night);
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
  const disp = app.units.filter((u) => app.estadoDe(u.id) === 'disponible');
  const min = disp.length ? Math.min(...disp.map((u) => u.precio)) : 0;
  $('#topStats').innerHTML = `
    <div class="stat"><b>${app.units.length}</b><span>Viviendas</span></div>
    <div class="stat avail"><b>${disp.length}</b><span>Disponibles</span></div>
    <div class="stat"><b>${min ? 'desde ' + fmtEUR(min) : '—'}</b><span>Precio</span></div>
    <div class="stat"><b>1 · 2 · 3</b><span>Dormitorios</span></div>`;

  // nº de disponibles por planta en el selector
  for (const F of FLOOR_DEFS) {
    const btn = document.querySelector(`.floor-btn[data-floor="${F.key}"] .fb-sub`);
    if (!btn) continue;
    const n = app.units.filter((u) => app.floorOf(u) === F.key && app.estadoDe(u.id) === 'disponible').length;
    btn.textContent = `${n} disponibles`;
  }

  const passing = app.units.filter((u) => app.passesFilters(u)).length;
  const active = app.filters.dorms.size || app.filters.estados.size || app.filters.orients.size ||
    app.filters.terraza || app.filters.priceMax < 481000;
  $('#filterCount').textContent = active ? `${passing}/${app.units.length}` : '';
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
    <div class="tt-row">${unit.planta} · ${unit.dorm}D · ${unit.orientacion}</div>
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

// ── Listado ──
export function renderTable(app) {
  const tbody = $('#unitsTable tbody');
  let rows = app.units.filter((u) => app.passesFilters(u));
  if (app.sort) {
    const { k, dir } = app.sort;
    rows = [...rows].sort((a, b) => {
      const va = k === 'estado' ? app.estadoDe(a.id) : a[k];
      const vb = k === 'estado' ? app.estadoDe(b.id) : b[k];
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    });
  }
  $('#listCount').textContent = `${rows.length} viviendas`;
  tbody.innerHTML = rows.map((u) => {
    const e = app.estadoDe(u.id);
    return `<tr data-id="${u.id}">
      <td class="u-id">${nd(u.id)}</td><td>${u.planta}</td><td>${u.dorm}D</td>
      <td>${u.orientacion}</td><td>${fmtM2(u.supViv)}</td>
      <td>${u.terraza ? fmtM2(u.terraza) : '—'}</td><td>${fmtM2(u.supTotal)}</td>
      <td><strong>${fmtEUR(u.precio)}</strong></td>
      <td><span class="tag ${e}">${e}</span></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('tr').forEach((tr) =>
    tr.addEventListener('click', () => {
      app.setMode('3d');
      app.select(tr.dataset.id, { focus: true });
    })
  );
}
