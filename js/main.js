/* ═══════════════════════════════════════════════════════════════
   main.js — Bootstrap del showroom: escena WebGL, cámara,
   navegación por plantas, selección de viviendas y estados.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FLOOR_DEFS, ROOF_Y, floorOf } from './layout.js';
import { buildBuilding, paintUnits, loadBIM } from './building.js';
import { fetchUnits, fetchAvailability, pollAvailability, sendLead } from './api.js';
import * as UI from './ui.js';

const $ = (s) => document.querySelector(s);

/* ─────────────────────────── Estado global ─────────────────────────── */
const app = {
  units: [],
  unitsById: new Map(),
  estados: {},
  filters: { dorms: new Set(), estados: new Set(), orients: new Set(), priceMax: 481000, terraza: false },
  floor: 'all',
  mode: '3d',
  bim: false,
  selected: null,
  hover: null,
  explode: 0,
  sort: null,
  floorOf: (u) => floorOf(u),
  estadoDe: (id) => app.estados[id] || 'disponible',
  passesFilters(u) {
    const f = app.filters;
    if (f.dorms.size && !f.dorms.has(u.dorm)) return false;
    if (f.estados.size && !f.estados.has(app.estadoDe(u.id))) return false;
    if (f.orients.size && !f.orients.has(u.orientacion)) return false;
    if (u.precio > f.priceMax) return false;
    if (f.terraza && !u.terraza) return false;
    return true;
  },
};
window.apolo = app; // depuración

/* ─────────────────────────── Escena ─────────────────────────── */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
{
  // Cielo degradado
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 256;
  const ctx = cv.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#1c2c4f');
  gr.addColorStop(0.55, '#131e38');
  gr.addColorStop(1, '#0a0f1c');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
}
scene.fog = new THREE.Fog(0x0d1424, 260, 520);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 1200);
camera.position.set(120, 95, 155);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 18;
controls.maxDistance = 340;
controls.target.set(0, 5, 0);

// Luces
scene.add(new THREE.HemisphereLight(0xc9d9f7, 0x4a5262, 1.5));
const sun = new THREE.DirectionalLight(0xffe3b3, 2.6);
sun.position.set(85, 110, 55);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9db8e8, 0.9);
fill.position.set(-90, 60, -70);
scene.add(fill);

/* ─────────────────────────── Tween de cámara ─────────────────────────── */
let camTween = null;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function tweenCamera(pos, target, dur = 1.4) {
  camTween = {
    t: 0, dur,
    p0: camera.position.clone(), p1: pos.clone(),
    t0: controls.target.clone(), t1: target.clone(),
  };
}
controls.addEventListener('start', () => { camTween = null; });

/* ─────────────────────────── Construcción ─────────────────────────── */
let B = null;   // { floorGroups, roofGroup, unitMeshes, pickables, layout }
let bim = null; // { group, levels } — modelo Revit (carga diferida)
let bimLoading = null;
const floorAnim = new Map(); // key → { yTarget, fadeTarget }

function allGroups() {
  const out = [...B.floorGroups.entries()].map(([k, g]) => [k, g]);
  out.push(['roof', B.roofGroup]);
  return out;
}

function levelOf(key) {
  if (key === 'roof') return 4;
  return FLOOR_DEFS.find((f) => f.key === key).level;
}

function updateFloorTargets() {
  const selLevel = app.floor === 'all' ? Infinity : FLOOR_DEFS.find((f) => f.key === app.floor).level;
  for (const [key, g] of allGroups()) {
    const lvl = levelOf(key);
    const above = lvl > selLevel;
    const explodeY = lvl * app.explode * 13;
    floorAnim.set(key, {
      yTarget: g.userData.baseY + explodeY + (above ? 34 : 0),
      fadeTarget: above ? 0 : 1,
    });
    const labels = g.children.find?.((c) => c.name === 'labels');
    if (labels) labels.visible = key === app.floor;
  }
  // jardines de patios siguen a la planta baja
}

// Correspondencia niveles BIM ↔ plantas lógicas
const BIM_KEY = { baja: 'baja', p1: 'p1', p2: 'p2', atico: 'atico', cubierta: 'roof' };

function animateFloors(dt) {
  const k = Math.min(1, dt * 4.5);
  let fading = false;
  for (const [key, g] of allGroups()) {
    const a = floorAnim.get(key);
    if (!a) continue;
    g.position.y += (a.yTarget - g.position.y) * k;
    if (Math.abs(a.fadeTarget - g.userData.fade) > 0.002) fading = true;
    const f = g.userData.fade + (a.fadeTarget - g.userData.fade) * k;
    g.userData.fade = f;
    const vis = f > 0.02 && !app.bim;
    g.visible = vis;
    for (const m of g.userData.fadeMats) m.opacity = m.userData.baseOpacity * f;
    if (key === 'baja' && g.userData.gardens) g.userData.gardens.visible = vis;
  }
  if (fading) repaint(); // los materiales de vivienda heredan el fundido de su planta

  // El BIM sigue la misma coreografía que las plantas lógicas
  if (bim) {
    bim.group.visible = app.bim;
    if (app.bim) {
      for (const [bimKey, animKey] of Object.entries(BIM_KEY)) {
        const lvl = bim.levels.get(bimKey);
        const src = animKey === 'roof' ? B.roofGroup : B.floorGroups.get(animKey);
        if (!lvl || !src) continue;
        lvl.mesh.position.y = src.position.y - src.userData.baseY; // mismo desplazamiento (explosión/aislado)
        lvl.mat.opacity = src.userData.fade;
        lvl.mesh.visible = src.userData.fade > 0.02;
      }
    }
  }
}

const fadeOf = (floorKey) => B.floorGroups.get(floorKey)?.userData.fade ?? 1;

function repaint() {
  paintUnits(
    B.unitMeshes,
    app.estadoDe,
    (id) => !app.passesFilters(app.unitsById.get(id)),
    app.selected,
    app.hover,
    fadeOf,
    (floorKey) => floorKey === app.floor && !app.bim // dollhouse en la planta aislada
  );
}

/* ─────────────────────────── Vistas de cámara ─────────────────────────── */
function goOverview(dur = 1.6) {
  // El encuadre crece con la axonometría para abarcar las plantas separadas
  const e = app.explode;
  tweenCamera(
    new THREE.Vector3(64 + e * 38, 48 + e * 42, 92 + e * 48),
    new THREE.Vector3(0, 5 + e * 26, 0),
    dur
  );
}

function goFloor(key, dur = 1.3) {
  const F = FLOOR_DEFS.find((f) => f.key === key);
  const y = F.y + F.level * app.explode * 13;
  tweenCamera(new THREE.Vector3(20, y + 52, 60), new THREE.Vector3(0, y, 0), dur);
}

function goPlano(key, dur = 1.2) {
  const F = FLOOR_DEFS.find((f) => f.key === key);
  const y = F.y + F.level * app.explode * 13;
  tweenCamera(new THREE.Vector3(0, y + 105, 0.5), new THREE.Vector3(0, y, 0), dur);
}

/* ─────────────────────────── Acciones ─────────────────────────── */
app.setFloor = (key) => {
  app.floor = key;
  UI.markFloorButtons(key);
  updateFloorTargets();
  if (key === 'all') {
    if (app.mode === 'plano') { app.mode = '3d'; UI.markModeButtons('3d'); }
    goOverview(1.4);
  } else if (app.mode === 'plano') {
    goPlano(key);
  } else {
    goFloor(key);
  }
  repaint();
};

app.setMode = (mode) => {
  app.mode = mode;
  UI.markModeButtons(mode);
  $('#listado').classList.toggle('open', mode === 'lista');
  if (mode === 'lista') { UI.renderTable(app); return; }
  if (mode === 'plano') {
    if (app.floor === 'all') { app.setFloor('baja'); return; }
    goPlano(app.floor);
  } else if (mode === '3d') {
    if (app.floor === 'all') goOverview(1.2);
    else goFloor(app.floor);
  }
};

let explodeCamTimer = null;
app.setExplode = (v) => {
  app.explode = v;
  updateFloorTargets();
  // Reencuadra suavemente al soltar el deslizador
  clearTimeout(explodeCamTimer);
  explodeCamTimer = setTimeout(() => {
    if (app.floor === 'all') goOverview(1.0);
    else if (app.mode === 'plano') goPlano(app.floor, 1.0);
    else goFloor(app.floor, 1.0);
  }, 260);
};

app.select = (id, opts = {}) => {
  app.selected = id;
  const unit = id ? app.unitsById.get(id) : null;
  UI.renderPanel(app, unit);
  if (unit && opts.focus) {
    const fKey = floorOf(unit);
    if (app.floor !== fKey && app.floor !== 'all') app.setFloor(fKey);
    const mesh = B.unitMeshes.get(id);
    const wp = new THREE.Vector3();
    mesh.getWorldPosition(wp);
    const dir = camera.position.clone().sub(controls.target).normalize();
    tweenCamera(wp.clone().add(dir.multiplyScalar(46)), wp, 1.1);
  }
  repaint();
};

app.onFiltersChanged = () => {
  UI.updateStats(app);
  if ($('#listado').classList.contains('open')) UI.renderTable(app);
  repaint();
};

app.requestInfo = (unit) => { sendLead({ unitId: unit.id }); };

/* ─────────────────────────── Modo BIM ─────────────────────────── */
async function ensureBIM() {
  if (bim) return bim;
  if (!bimLoading) {
    bimLoading = loadBIM(scene).then((b) => { bim = b; return b; })
      .catch((e) => { console.error('[apolo] BIM no disponible:', e); bimLoading = null; });
  }
  return bimLoading;
}

app.toggleBIM = async () => {
  const btn = $('#modoBim');
  if (!bim) {
    btn.classList.add('loading');
    await ensureBIM();
    btn.classList.remove('loading');
    if (!bim) return; // fallo de carga
  }
  app.bim = !app.bim;
  btn.classList.toggle('on', app.bim);
  if (app.bim) {
    app.select(null);
    app.hover = null;
    UI.hideTooltip();
    if (app.mode === 'lista') app.setMode('3d');
  }
};

/* ─────────────────────────── Picking ─────────────────────────── */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
let pointerPx = { x: 0, y: 0 };
let downPos = null;

canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  pointerPx = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return; // era un arrastre de órbita
  if (app.hover) app.select(app.hover, { focus: false });
  else app.select(null);
});

function updateHover() {
  if (!B) return;
  if (app.bim) {
    if (app.hover) { app.hover = null; canvas.style.cursor = 'grab'; repaint(); }
    UI.hideTooltip();
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(B.pickables, false);
  let id = null;
  for (const h of hits) {
    const g = h.object.parent;
    if (g.userData.fade < 0.6) continue; // planta oculta
    const hid = h.object.userData.unitId;
    if (!app.passesFilters(app.unitsById.get(hid))) continue; // descartada por filtros
    id = hid;
    break;
  }
  if (id !== app.hover) {
    app.hover = id;
    canvas.style.cursor = id ? 'pointer' : 'grab';
    repaint();
  }
  if (id) UI.showTooltip(app, app.unitsById.get(id), pointerPx.x, pointerPx.y);
  else UI.hideTooltip();
}

/* ─────────────────────────── Brújula ─────────────────────────── */
const needle = $('#needle');
function updateCompass() {
  const az = controls.getAzimuthalAngle();
  needle.style.transform = `rotate(${(-az * 180) / Math.PI - 45}deg)`;
}

/* ─────────────────────────── Bucle ─────────────────────────── */
const clock = new THREE.Clock();
let autoRotate = true;
controls.addEventListener('start', () => { autoRotate = false; });

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (camTween) {
    camTween.t += dt / camTween.dur;
    const t = easeInOut(Math.min(camTween.t, 1));
    camera.position.lerpVectors(camTween.p0, camTween.p1, t);
    controls.target.lerpVectors(camTween.t0, camTween.t1, t);
    if (camTween.t >= 1) camTween = null;
  } else if (autoRotate && app.floor === 'all' && !document.getElementById('hero').classList.contains('gone')) {
    // rotación suave de cortesía mientras está la portada
    const a = 0.05 * dt;
    camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
  }

  if (B) animateFloors(dt);
  updateHover();
  updateCompass();
  controls.update();
  renderer.render(scene, camera);
}

/* ─────────────────────────── Resize ─────────────────────────── */
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', onResize);
onResize();

/* ─────────────────────────── Arranque ─────────────────────────── */
async function boot() {
  try {
    const [units, estados] = await Promise.all([fetchUnits(), fetchAvailability()]);
    app.units = units;
    app.estados = estados;
    app.unitsById = new Map(units.map((u) => [u.id, u]));

    B = buildBuilding(scene, app.unitsById);
    updateFloorTargets();
    repaint();

    UI.initUI(app);
    UI.updateStats(app);

    // Refresco de disponibilidad (backend-ready)
    pollAvailability((nuevos) => {
      app.estados = nuevos;
      UI.updateStats(app);
      repaint();
      if (app.selected) UI.renderPanel(app, app.unitsById.get(app.selected));
    });

    $('#loader').classList.add('done');
  } catch (err) {
    console.error(err);
    $('#loader').innerHTML = `<p style="color:#e35d5d">Error al cargar los datos: ${err.message}</p>`;
    return;
  }

  $('#btnEnter').addEventListener('click', () => {
    $('#hero').classList.add('gone');
    document.querySelectorAll('.hidden-ui').forEach((el) => el.classList.remove('hidden-ui'));
    goOverview(2.2);
  });

  // Precarga silenciosa del modelo BIM cuando la app ya está en marcha
  setTimeout(ensureBIM, 4000);
}

loop();
boot();
