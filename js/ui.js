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
  // ── CTA por promoción en la portada ──
  const cards = $('#promoCards');
  for (const dev of DEVELOPMENTS) {
    const b = document.createElement('button');
    b.className = 'promo-cta';
    b.textContent = dev.name;
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
  const disponible = estado === 'disponible';
  $('#panelBody').innerHTML = `
    <h2 class="p-title">Vivienda&#8288; <b>${nd(unit.id)}</b></h2>
    <p class="p-sub">${F.label} · ${unit.orientacion}</p>
    <span class="badge ${estado}">${estado}</span>
    <div class="p-price">${fmtEUR(unit.precio)}
      <small>IGIC no incluido</small>
    </div>
    <div class="spec-grid">
      <div class="spec"><b>${unit.dorm}</b><span>Dormitorio${unit.dorm > 1 ? 's' : ''}</span></div>
      <div class="spec"><b>${fmtM2(unit.supViv)}</b><span>Sup. vivienda</span></div>
      <div class="spec"><b>${unit.terraza ? fmtM2(unit.terraza) : '—'}</b><span>Terraza</span></div>
      <div class="spec"><b>${fmtM2(unit.supTotal)}</b><span>Sup. total</span></div>
    </div>
    <div class="equip">
      ${unit.terraza ? '<span><svg><use href="#i-terr"/></svg>Terraza</span>' : ''}
      <span><svg><use href="#i-car"/></svg>Garaje opcional</span>
      <span><svg><use href="#i-store"/></svg>Trastero opcional</span>
      <span><svg><use href="#i-gym"/></svg>Gimnasio</span>
    </div>
    <div class="p-section">
      <h3>Plano de la vivienda</h3>
      <a class="plan-thumb" data-plan="assets/planos/${unit.id}.png" data-cap="Vivienda ${unit.id} — Plano">
        <img src="assets/planos/${unit.id}.png" alt="Plano de la vivienda ${unit.id}">
      </a>
    </div>
    <div class="p-section">
      <h3>Ubicación en planta</h3>
      <a class="plan-thumb" data-plan="assets/ubicaciones/${unit.id}.png" data-cap="Vivienda ${unit.id} — Ubicación en ${F.label}">
        <img src="assets/ubicaciones/${unit.id}.png" alt="Ubicación de la vivienda ${unit.id} en la planta">
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
      <a class="btn-ghost" href="assets/fichas/${unit.id}.pdf" download="Ficha_Vivienda_${unit.id}.pdf">Descargar ficha en PDF</a>
    </div>
    <p class="p-note">Plaza de garaje: 15.000 € · Trastero: 2.000 € (opcionales, sujetos a disponibilidad).
    Precios sin IGIC ni gastos de compraventa. Documento informativo, no contractual.</p>`;

  document.querySelectorAll('#panelBody .plan-thumb').forEach((el) => {
    el.addEventListener('click', () => {
      $('#lbImg').src = el.dataset.plan;
      $('#lbCap').textContent = el.dataset.cap;
      $('#lightbox').classList.add('open');
    });
    // respaldo si falta el plano individual: se usa el de la planta
    const img = el.querySelector('img');
    img.addEventListener('error', () => {
      img.onerror = null;
      img.src = F.plan;
      el.dataset.plan = F.plan;
      el.dataset.cap = `${F.planLabel} — Vivienda ${unit.id}`;
    }, { once: true });
  });
  const cta = $('#ctaLead');
  if (cta && disponible) cta.addEventListener('click', () => app.requestInfo(unit));
  panel.classList.add('open');
}

// ── Listado: tarjetas con plano, datos y equipamiento ──
export function renderTable(app) {
  const list = $('#unitsList');
  const rows = app.units.filter((u) => app.estadoDe(u.id) === 'disponible' && app.passesFilters(u) &&
    (app.floor === 'all' || app.floorOf(u) === app.floor));
  list.innerHTML = rows.map((u) => {
    const F = FLOOR_DEFS.find((f) => f.key === app.floorOf(u));
    return `
    <button class="u-card" data-id="${u.id}">
      <img class="u-plan" src="assets/planos/${u.id}.png" data-fb="${F.plan}" alt="Plano vivienda" loading="lazy">
      <div class="u-info">
        <p class="u-title">${u.dorm}D&ensp;|&ensp;${fmtM2(u.supTotal)}</p>
        <p class="u-line">SE-AP-⁠${nd(u.id)}</p>
        <p class="u-line">Planta ${plantaNum(u)} · ${u.orientacion}</p>
        <p class="u-price">${fmtEUR(u.precio)}</p>
      </div>
      <div class="u-icons">
        ${u.terraza ? '<span title="Terraza"><svg><use href="#i-terr"/></svg></span>' : ''}
        <span title="Plaza de garaje opcional"><svg><use href="#i-car"/></svg></span>
        <span title="Trastero opcional"><svg><use href="#i-store"/></svg></span>
        <span title="Gimnasio"><svg><use href="#i-gym"/></svg></span>
      </div>
    </button>`;
  }).join('');
  list.querySelectorAll('.u-card').forEach((c) =>
    c.addEventListener('click', () => {
      app.setMode('3d');
      app.select(c.dataset.id, { focus: true });
    })
  );
  // respaldo: si falta el plano individual, se muestra el de la planta
  list.querySelectorAll('.u-plan').forEach((img) =>
    img.addEventListener('error', () => { img.onerror = null; img.src = img.dataset.fb; }, { once: true })
  );
}
