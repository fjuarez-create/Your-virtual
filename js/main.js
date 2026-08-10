/* ═══════════════════════════════════════════════════════════════
   main.js — Bootstrap del showroom: escena WebGL, cámara,
   navegación por plantas, selección de viviendas y estados.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FLOOR_DEFS, ROOF_Y, floorOf } from 'app/layout.js';
import { buildBuilding, paintUnits, loadBIM } from 'app/building.js';
import { fetchUnits, fetchAvailability, pollAvailability, sendLead } from 'app/api.js';
import * as UI from 'app/ui.js';
import { ACTIVE_DEV, ACTIVE_BUILDING } from 'app/promotions.js';

const $ = (s) => document.querySelector(s);

/* ─────────────────────────── Estado global ─────────────────────────── */
const app = {
  units: [],
  unitsById: new Map(),
  estados: {},
  filters: { dorms: new Set(), estados: new Set(), orients: new Set(), priceMax: 481000, terraza: false },
  floor: 'all',
  mode: '3d',
  dev: ACTIVE_DEV,
  building: ACTIVE_BUILDING,
  night: false,
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
renderer.toneMappingExposure = 0.85;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd6dde3, 750, 2100);

// ── Cielo físico (hora dorada) ──
const sky = new Sky();
sky.scale.setScalar(4000);
scene.add(sky);
const sunDir = new THREE.Vector3().setFromSphericalCoords(
  1, THREE.MathUtils.degToRad(90 - 44), THREE.MathUtils.degToRad(42)
);
Object.assign(sky.material.uniforms, {});
sky.material.uniforms.turbidity.value = 4.5;
sky.material.uniforms.rayleigh.value = 1.15;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.82;
sky.material.uniforms.sunPosition.value.copy(sunDir);

// IBL: el cielo se convierte en mapa de entorno (reflejos reales en el vidrio)
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.add(sky); // devolver el cielo a la escena principal
  pmrem.dispose();
  scene.environmentIntensity = 0.55;
}

// ── Capa de nubes (billboards suaves) ──
const clouds = new THREE.Group();
{
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  for (const [cx, cy, r, a] of [[128, 140, 100, 0.85], [80, 150, 66, 0.7], [180, 150, 70, 0.7], [128, 120, 55, 0.55]]) {
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, r);
    g.addColorStop(0, `rgba(255,247,238,${a})`);
    g.addColorStop(1, 'rgba(255,247,238,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(cv);
  let cseed = 77;
  const crnd = () => { cseed = (cseed * 1664525 + 1013904223) % 4294967296; return cseed / 4294967296; };
  for (let i = 0; i < 26; i++) {
    const cluster = new THREE.Group();
    const n = 3 + Math.floor(crnd() * 3);
    for (let j = 0; j < n; j++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.55 + crnd() * 0.3 });
      const sp = new THREE.Sprite(mat);
      const w = 90 + crnd() * 150;
      sp.scale.set(w, w * (0.3 + crnd() * 0.18), 1);
      sp.position.set((crnd() - 0.5) * 160, (crnd() - 0.5) * 34, (crnd() - 0.5) * 90);
      cluster.add(sp);
    }
    const a = crnd() * Math.PI * 2;
    const r = 180 + crnd() * 950;
    cluster.position.set(Math.cos(a) * r, 300 + crnd() * 170, Math.sin(a) * r);
    cluster.userData.speed = 2.2 + crnd() * 2.6;
    clouds.add(cluster);
  }
}
scene.add(clouds);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 4200);
camera.position.set(540, 480, 820);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
// Gestos como Google Earth: 1 dedo mueve, 2 dedos zoom+giro;
// ratón: izquierdo mueve, derecho gira, rueda zoom.
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.screenSpacePanning = false; // el arrastre desliza sobre el plano del suelo
controls.panSpeed = 1.15;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 18;
controls.maxDistance = 420;
controls.target.set(0, 40, 0);
controls.enabled = false; // se habilita al terminar la intro

// Luces
const hemi = new THREE.HemisphereLight(0xe3edf8, 0x8b9080, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.5);
sun.position.copy(sunDir).multiplyScalar(180);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa8c4e8, 0.4);
fill.position.set(-90, 60, -70);
scene.add(fill);

// ── Post-procesado: bloom sutil ──
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.14, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

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

/* ─────────────────── Intro cinematográfica ─────────────────── */
const INTRO = {
  curve: new THREE.CatmullRomCurve3([
    new THREE.Vector3(540, 480, 820),
    new THREE.Vector3(300, 330, 560),
    new THREE.Vector3(40, 190, 380),
    new THREE.Vector3(-150, 96, 220),
    new THREE.Vector3(-90, 56, 130),
    new THREE.Vector3(64, 48, 92),
  ], false, 'centripetal', 0.4),
  t0: new THREE.Vector3(0, 140, -60),
  t1: new THREE.Vector3(0, 5, 0),
  dur: 8.5,
};
let intro = null;

function startIntro() {
  intro = { t: 0 };
  camTween = null;
  controls.enabled = false;
  $('#skipIntro').classList.add('show');
  camera.fov = 58;
  camera.updateProjectionMatrix();
}

function finishIntro() {
  intro = null;
  $('#skipIntro').classList.remove('show');
  camera.fov = 46;
  camera.updateProjectionMatrix();
  camera.position.copy(INTRO.curve.points[INTRO.curve.points.length - 1]);
  controls.target.copy(INTRO.t1);
  controls.enabled = true;
  document.querySelectorAll('.hidden-ui').forEach((el) => el.classList.remove('hidden-ui'));
}

function updateIntro(dt) {
  if (!intro) return;
  intro.t += dt / INTRO.dur;
  if (intro.t >= 1) { finishIntro(); return; }
  const e = easeInOut(intro.t);
  camera.position.copy(INTRO.curve.getPoint(e));
  const et = Math.pow(e, 1.35);
  controls.target.lerpVectors(INTRO.t0, INTRO.t1, et);
  camera.lookAt(controls.target);
  camera.fov = 58 - 12 * e;
  camera.updateProjectionMatrix();
}

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

  // El BIM (modelo por defecto) sigue la misma coreografía que las plantas
  if (bim) {
    for (const [bimKey, animKey] of Object.entries(BIM_KEY)) {
      const lvl = bim.levels.get(bimKey);
      const src = animKey === 'roof' ? B.roofGroup : B.floorGroups.get(animKey);
      if (!lvl || !src) continue;
      const dy = src.position.y - src.userData.baseY; // desplazamiento (explosión/aislado)
      const f = src.userData.fade;
      for (const h of lvl.holders) { h.position.y = dy; h.visible = f > 0.02; }
      for (const m of lvl.mats) m.opacity = m.userData.baseOpacity * f;
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
    (floorKey) => floorKey === app.floor // dollhouse en la planta aislada
  );
}

/* ─────────────────────────── Vistas de cámara ─────────────────────────── */
function goOverview(dur = 1.6) {
  // El encuadre crece con la axonometría para abarcar las plantas separadas
  const e = app.explode;
  const [cx, cy, cz] = app.building.camera;
  const [tx, ty, tz] = app.building.center;
  tweenCamera(
    new THREE.Vector3(cx + e * 38, cy + e * 42, cz + e * 48),
    new THREE.Vector3(tx, ty + e * 26, tz),
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

app.setBuilding = (id) => {
  const b = app.dev.buildings.find((x) => x.id === id && x.active);
  if (!b) return;
  app.building = b;
  goOverview(1.4);
};

/* ─────────────────────────── Día / Noche ─────────────────────────── */
function rebuildEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.add(sky);
  pmrem.dispose();
}

app.setNight = (on) => {
  app.night = on;
  const elev = on ? -12 : 44;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(42));
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  sky.material.uniforms.turbidity.value = on ? 8 : 4.5;
  sky.material.uniforms.rayleigh.value = on ? 0.6 : 1.15;
  rebuildEnvironment();
  sun.intensity = on ? 0.0 : 2.5;
  sun.position.copy(sunDir).multiplyScalar(180);
  if (on) sun.position.set(60, 120, -40);
  hemi.color.setHex(on ? 0x223252 : 0xe3edf8);
  hemi.groundColor.setHex(on ? 0x0c1016 : 0x8b9080);
  hemi.intensity = on ? 0.42 : 0.7;
  fill.color.setHex(on ? 0x8fa8d8 : 0xa8c4e8);
  fill.intensity = on ? 0.5 : 0.4;
  renderer.toneMappingExposure = on ? 0.8 : 0.85;
  scene.fog.color.setHex(on ? 0x0b111c : 0xd6dde3);
  bloom.strength = on ? 0.5 : 0.14;
  bloom.threshold = on ? 0.55 : 0.92;
  for (const c of clouds.children) c.visible = !on;
  // las ventanas del BIM se encienden por la noche
  if (bim) {
    for (const [, lvl] of bim.levels) {
      const glass = lvl.byCat?.glass;
      if (glass) {
        glass.emissive.setHex(on ? 0xffd9a0 : 0x000000);
        glass.emissiveIntensity = on ? 0.55 : 0;
      }
    }
  }
  UI.markDayNight(on);
};

/* ──────────── Modelo BIM: siempre cargado, modelo por defecto ──────────── */
function ensureBIM() {
  if (bim) return Promise.resolve(bim);
  if (!bimLoading) {
    bimLoading = loadBIM(scene).then((b) => {
      bim = b;
      b.group.visible = true;
      return b;
    }).catch((e) => { console.error('[apolo] BIM no disponible:', e); bimLoading = null; });
  }
  return bimLoading;
}

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
  if (moved > 8) return; // era un arrastre
  // raycast fresco en la posición exacta del toque (en móvil el hover
  // podía apuntar a una posición antigua y abrir otra vivienda)
  const id = pickAt(e.clientX, e.clientY);
  app.select(id, { focus: false });
});

function pickAt(cx, cy) {
  if (!B) return null;
  const p = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  const hits = raycaster.intersectObjects(B.pickables, false);
  for (const h of hits) {
    if (h.object.parent.userData.fade < 0.6) continue;
    const hid = h.object.userData.unitId;
    if (!app.passesFilters(app.unitsById.get(hid))) continue;
    if (app.estadoDe(hid) === 'vendida') continue;
    return hid;
  }
  return null;
}

function updateHover() {
  if (!B) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(B.pickables, false);
  let id = null;
  for (const h of hits) {
    const g = h.object.parent;
    if (g.userData.fade < 0.6) continue; // planta oculta
    const hid = h.object.userData.unitId;
    if (!app.passesFilters(app.unitsById.get(hid))) continue; // descartada por filtros
    if (app.estadoDe(hid) === 'vendida') continue;            // vendida: inerte
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
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);

  if (camTween) {
    camTween.t += dt / camTween.dur;
    const t = easeInOut(Math.min(camTween.t, 1));
    camera.position.lerpVectors(camTween.p0, camTween.p1, t);
    controls.target.lerpVectors(camTween.t0, camTween.t1, t);
    if (camTween.t >= 1) camTween = null;
  } else if (autoRotate && !intro && app.floor === 'all' && !document.getElementById('hero').classList.contains('gone')) {
    // rotación suave de cortesía mientras está la portada
    const a = 0.018 * dt;
    camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    camera.lookAt(controls.target);
  }

  // deriva lenta de las nubes
  for (const c of clouds.children) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 1150) c.position.x = -1150;
  }

  updateIntro(Math.min(rawDt, 0.6)); // tiempo real: la intro dura lo mismo en cualquier dispositivo
  if (B) animateFloors(dt);
  updateHover();
  updateCompass();
  if (!intro) controls.update();
  composer.render();
}

/* ─────────────────────────── Resize ─────────────────────────── */
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', onResize);
onResize();

/* ─────────────────────────── Arranque ─────────────────────────── */
app.enter = () => {
  $('#hero').classList.add('gone');
  startIntro();
};

/* Vuelta a la portada (selector de promociones) desde la flecha ← */
app.exitToHome = () => {
  app.select(null);
  app.setMode('3d');
  app.setFloor('all');
  $('#filters').classList.remove('open');
  for (const id of ['topbar', 'modeBar', 'compass', 'attrib']) {
    document.getElementById(id)?.classList.add('hidden-ui');
  }
  $('#hero').classList.remove('gone');
  goOverview(1.4);
};

async function boot() {
  try {
    const [units, estados] = await Promise.all([fetchUnits(), fetchAvailability()]);
    app.units = units;
    app.estados = estados;
    app.unitsById = new Map(units.map((u) => [u.id, u]));

    B = buildBuilding(scene, app.unitsById);
    ensureBIM(); // el modelo real es el edificio por defecto
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

  $('#skipIntro').addEventListener('click', finishIntro);

}

loop();
boot();
