/* ═══════════════════════════════════════════════════════════════
   main.js — Bootstrap del showroom: escena WebGL, cámara,
   navegación por plantas, selección de viviendas y estados.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FLOOR_DEFS, floorOf } from 'app/layout.js';
import { paintUnits } from 'app/building.js';
import { cargarModelo } from 'app/modelo.js';
import { fetchUnits, fetchAvailability, pollAvailability, sendLead } from 'app/api.js';
import * as UI from 'app/ui.js';
import { ACTIVE_DEV, ACTIVE_BUILDING } from 'app/promotions.js';

const $ = (s) => document.querySelector(s);

/* ── Móvil ──
   El navegador del teléfono trabaja con una fracción de la memoria de vídeo
   de un ordenador y cierra la pestaña sin avisar en cuanto se pasa. Aquí eso
   se traduce en no pedir multimuestreo (dos destinos de pantalla completa
   con cuatro muestras cada uno) y en limitar la densidad de píxeles. Se puede
   forzar en cualquier equipo con ?movil=1 y desactivar con ?movil=0. */
const MOVIL = (() => {
  const q = new URLSearchParams(location.search).get('movil');
  if (q === '1') return true;
  if (q === '0') return false;
  const ua = navigator.userAgent || '';
  const tactil = (navigator.maxTouchPoints || 0) > 1;
  return /iPhone|iPad|iPod|Android/i.test(ua)
    || (tactil && /Macintosh/.test(ua))                       // iPad reciente
    || (tactil && Math.min(screen.width, screen.height) < 900);
})();

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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOVIL ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
/* Los planos de recorte del mobiliario (modelo.js) van por material. */
renderer.localClippingEnabled = true;
/* AgX en vez de ACES: ACES empasta la parte alta de la curva, y con un
   edificio blanco monocapa eso significa que toda la fachada iluminada acaba
   en la misma nota. Medido: el rango tonal de la fachada cabía en 14 niveles
   de 255, cuando en una foto real recorre más de cien. */
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd6dde3, 750, 2100);

// ── Cielo físico (hora dorada) ──
const sky = new Sky();
sky.name = 'cielo';
sky.scale.setScalar(4000);
scene.add(sky);
const sunDir = new THREE.Vector3().setFromSphericalCoords(
  1, THREE.MathUtils.degToRad(90 - 44), THREE.MathUtils.degToRad(42)
);
Object.assign(sky.material.uniforms, {});
sky.material.uniforms.turbidity.value = 3.0;
sky.material.uniforms.rayleigh.value = 1.05;
sky.material.uniforms.mieCoefficient.value = 0.003;
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
  scene.environmentIntensity = 0.3;
}

// ── Capa de nubes (billboards suaves, cúmulos algodonosos) ──
const clouds = new THREE.Group();
clouds.name = 'nubes';
{
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  // varios lóbulos con base más plana: silueta de cúmulo
  for (const [cx, cy, r, a] of [
    [128, 152, 92, 0.92], [84, 148, 60, 0.8], [174, 146, 62, 0.8],
    [110, 118, 46, 0.62], [152, 116, 44, 0.6], [66, 164, 36, 0.5], [190, 166, 38, 0.5],
  ]) {
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    g.addColorStop(0, `rgba(255,250,244,${a})`);
    g.addColorStop(0.55, `rgba(255,250,244,${a * 0.55})`);
    g.addColorStop(1, 'rgba(255,250,244,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(cv);
  let cseed = 77;
  const crnd = () => { cseed = (cseed * 1664525 + 1013904223) % 4294967296; return cseed / 4294967296; };
  for (let i = 0; i < 16; i++) {
    const cluster = new THREE.Group();
    const n = 3 + Math.floor(crnd() * 3);
    for (let j = 0; j < n; j++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.5 + crnd() * 0.28 });
      mat.userData.baseOp = mat.opacity;
      const sp = new THREE.Sprite(mat);
      const w = 80 + crnd() * 140;
      sp.scale.set(w, w * (0.3 + crnd() * 0.16), 1);
      sp.position.set((crnd() - 0.5) * 160, (crnd() - 0.5) * 30, (crnd() - 0.5) * 90);
      cluster.add(sp);
    }
    const a = crnd() * Math.PI * 2;
    const r = 200 + crnd() * 950;
    cluster.position.set(Math.cos(a) * r, 300 + crnd() * 170, Math.sin(a) * r);
    cluster.userData.speed = 2.2 + crnd() * 2.6;
    clouds.add(cluster);
  }
}
scene.add(clouds);

// ── Cielo nocturno: estrellas y luna (visibles solo de noche) ──
const nightSky = new THREE.Group();
nightSky.name = 'cielo_noche';
nightSky.visible = false;
{
  let nseed = 991;
  const nrnd = () => { nseed = (nseed * 1664525 + 1013904223) % 4294967296; return nseed / 4294967296; };
  // textura de disco suave para las estrellas
  const scv = document.createElement('canvas');
  scv.width = scv.height = 32;
  const sctx = scv.getContext('2d');
  const sg = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  sg.addColorStop(0, 'rgba(255,255,255,1)');
  sg.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  sctx.fillStyle = sg;
  sctx.fillRect(0, 0, 32, 32);
  const starTex = new THREE.CanvasTexture(scv);
  // dos capas de estrellas (tenues numerosas + brillantes escasas)
  const starLayer = (count, size, opacity) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const az = nrnd() * Math.PI * 2;
      const el = Math.asin(0.03 + nrnd() * 0.96);
      const R = 3400;
      pos[i * 3] = R * Math.cos(el) * Math.cos(az);
      pos[i * 3 + 1] = R * Math.sin(el);
      pos[i * 3 + 2] = R * Math.cos(el) * Math.sin(az);
      const t = nrnd(); // blancas, algunas azuladas y alguna cálida
      c.setHSL(t < 0.12 ? 0.09 : 0.6, t < 0.12 ? 0.5 : 0.25, 0.78 + nrnd() * 0.22);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size, map: starTex, transparent: true, opacity,
      vertexColors: true, depthWrite: false, sizeAttenuation: false, fog: false,
      blending: THREE.AdditiveBlending });
    return new THREE.Points(g, m);
  };
  nightSky.add(starLayer(2100, 2.1, 0.75));
  nightSky.add(starLayer(320, 3.8, 0.95));

  // luna: disco con sombreado de limbo, "mares" tenues y halo
  const mcv = document.createElement('canvas');
  mcv.width = mcv.height = 256;
  const mctx = mcv.getContext('2d');
  const halo = mctx.createRadialGradient(128, 128, 34, 128, 128, 126);
  halo.addColorStop(0, 'rgba(205,220,255,0.36)');
  halo.addColorStop(0.5, 'rgba(205,220,255,0.1)');
  halo.addColorStop(1, 'rgba(205,220,255,0)');
  mctx.fillStyle = halo;
  mctx.fillRect(0, 0, 256, 256);
  const disc = mctx.createRadialGradient(116, 116, 8, 128, 128, 44);
  disc.addColorStop(0, '#fbfcfd');
  disc.addColorStop(0.8, '#e8edf2');
  disc.addColorStop(1, '#c9d2dc');
  mctx.fillStyle = disc;
  mctx.beginPath();
  mctx.arc(128, 128, 43, 0, Math.PI * 2);
  mctx.fill();
  mctx.globalAlpha = 0.14;
  mctx.fillStyle = '#7b8798';
  for (const [mx, my, mr] of [[112, 116, 13], [140, 132, 10], [122, 146, 8], [146, 108, 6], [104, 138, 5]]) {
    mctx.beginPath();
    mctx.arc(mx, my, mr, 0, Math.PI * 2);
    mctx.fill();
  }
  mctx.globalAlpha = 1;
  const moonTex = new THREE.CanvasTexture(mcv);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true,
    depthWrite: false, fog: false }));
  moon.scale.set(330, 330, 1);
  moon.position.set(950, 2350, -700); // alineada con la luz nocturna
  nightSky.add(moon);
}
scene.add(nightSky);

/* El plano cercano a 0,5 m contra un lejano de 4.200 daba una relación de
   8.400:1, y en esa escala el buffer de profundidad pierde tanta precisión que
   la oclusión ambiental —que reconstruye posiciones a partir de él— no llegaba
   a resolver nada. La cámara nunca se acerca a menos de 18 m (minDistance), así
   que subirlo a 2 m no recorta nada y multiplica por cuatro la precisión. */
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 2, 4200);
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
controls.target.set(0, 9, 0);
controls.enabled = false; // se habilita al terminar la intro

// Luces
/* El relleno ambiental estaba tan alto que llenaba todas las sombras y dejaba
   la fachada sin modelado. Bajarlo y subir el sol devuelve el contraste: es el
   sol quien tiene que dibujar el volumen, no la luz de relleno. */
const hemi = new THREE.HemisphereLight(0xe3edf8, 0x8b9080, 0.28);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
sun.position.copy(sunDir).multiplyScalar(180);
sun.castShadow = true;
// El mapa de sombra se ciñe al edificio en vez de cubrir 240 m: con 4096 px
// sobre 150 m se pasa de 12 cm por texel a menos de 4, que es lo que hace
// falta para que se resuelva el canto de un antepecho o el retranqueo de una
// ventana. Fuera de esa caja no hay nada que proyecte sombra que importe.
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
sun.shadow.camera.far = 340;
sun.shadow.bias = -0.00018;
sun.shadow.normalBias = 0.045;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa8c4e8, 0.15);
fill.position.set(-90, 60, -70);
scene.add(fill);

/* ── Post-procesado ──
   El búfer intermedio del compositor se crea sin multimuestreo, así que el
   antialias:true del lienzo no llegaba a aplicarse y todos los cantos salían
   dentados. Pedirle muestras al destino lo devuelve. */
const composer = new EffectComposer(renderer);
composer.renderTarget1.samples = MOVIL ? 0 : 4;
composer.renderTarget2.samples = MOVIL ? 0 : 4;
composer.addPass(new RenderPass(scene, camera));

/* Oclusión ambiental: oscurece esquinas, retranqueos de ventana, encuentros de
   forjado y bajos de balcón. Es lo que más separa "bien sombreado" de
   "renderizado"; sin ella todo flota en una luz plana. */
/* La oclusión cuesta, así que no se le carga a un móvil de gama media: se
   activa en pantallas de tablet para arriba. Se puede forzar o desactivar con
   ?ao=1 / ?ao=0 para comparar. */
const qsAO = new URLSearchParams(location.search).get('ao');
const usarAO = qsAO === '1' || (qsAO !== '0' && Math.min(screen.width, screen.height) >= 700);

const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.enabled = usarAO;
gtao.output = GTAOPass.OUTPUT.Default;
/* El radio va en metros y marca hasta dónde busca oclusión. Con 0,55 m solo
   veía las juntas; a escala de edificio lo que ensombrece son los retranqueos
   de ventana, los vuelos de balcón y los patios, que son de metros. */
/* Ajustado midiendo, no a ojo: con radio 0,55 la diferencia con el AO apagado
   era de 1,5 sobre 255 —invisible—, y con 2,4 aparecían halos oscuros rodeando
   cada ventana, que leen como contorno sucio y no como sombra. Este es el
   punto intermedio. */
gtao.blendIntensity = 1.2;
gtao.updateGtaoMaterial({
  radius: 2.0,
  distanceExponent: 1.5,
  thickness: 1.8,
  scale: 1.55,
  samples: 24,
});
// filtrado más ancho: funde el ruido del muestreo sin comerse el contacto
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3.5, radius: 8, samples: 16 });
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.14, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ── Entorno ──
   El entorno ya no se inventa ni se descarga de Google: viene en el propio
   modelo del cliente (assets/serenea/entorno.glb), con el terreno, la costa,
   las calles y los otros cuatro edificios de SERENEA. El botón del globo, que
   encendía las teselas, deja de tener sentido. */
$('#envToggle')?.remove();
$('#envAttr')?.remove();
$('#attrib')?.remove();

// asas de depuración
app.THREE = THREE;
app.cam = camera;
app.ctl = controls;
app.renderer = renderer;
app.scene = scene;
app.composer = composer;

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
    new THREE.Vector3(560, 500, 840),
    new THREE.Vector3(320, 350, 580),
    new THREE.Vector3(60, 210, 400),
    new THREE.Vector3(-150, 110, 240),
    new THREE.Vector3(-70, 70, 120),
    new THREE.Vector3(65, 91, 93),
  ], false, 'centripetal', 0.4),
  t0: new THREE.Vector3(0, 150, -60),
  t1: new THREE.Vector3(0, 9, 0),
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

/* ─────────────────────────── Construcción ───────────────────────────
   El edificio es el modelo del cliente (modelo.js). Aislar una planta ya no
   eleva las de arriba ni las funde: se cambia la envolvente por la variante
   que trae el corte del proyecto, que es lo que el cliente valida en obra. */
let M = null;   // modelo v6: envolvente, entorno, mobiliario, variantes y prismas
let B = null;   // { unitMeshes, pickables } — lo que consume la interfaz

const fadeOf = () => 1;

function repaint() {
  if (!B) return;
  paintUnits(
    B.unitMeshes,
    app.estadoDe,
    (id) => !app.passesFilters(app.unitsById.get(id)),
    app.selected,
    app.hover,
    fadeOf,
    () => false
  );
}

/* ─────────────────────────── Vistas de cámara ───────────────────────────
   Las cotas salen del modelo (modelo.js: cotasPlanta), no de una tabla: cada
   planta se corta a la altura que marca el proyecto y el terreno se escalona,
   así que el encuadre de la planta 1 no está a la misma cota en los dos
   extremos del edificio. La distancia se calcula para que la barra de 111 m
   llene el ancho en 16:9. */
const LARGO = 111;   // eje X del edificio, en metros

function distanciaParaLargo(margen = 1.06) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * Math.max(camera.aspect, 1);
  return ((LARGO / 2) * margen) / tanH;
}

function goOverview(dur = 1.6) {
  const [cx, cy, cz] = app.building.camera;
  const [tx, ty, tz] = app.building.center;
  tweenCamera(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(tx, ty, tz), dur);
}

/* Al sur de Apolo, pegado, va uno de los edificios propuestos de SERENEA, tan
   largo y tan alto como él. Desde el sur bajo tapa media planta, así que la
   vista de planta mira desde muy arriba (unos 63°) y con el objetivo corrido
   HACIA_NORTE metros al norte: la cámara queda justo encima del vecino y la
   planta ocupa el fotograma entero. */
const HACIA_NORTE = 4;

function goFloor(key, dur = 1.3) {
  const { suelo, corte } = M ? M.cotasPlanta(key) : { suelo: 0, corte: 12 };
  const y = (suelo + corte) / 2;
  const d = distanciaParaLargo(1.07); // un poco de aire: con 1,0 los testeros quedaban justo en el borde
  tweenCamera(
    new THREE.Vector3(5, y + d * 0.86, d * 0.50 - HACIA_NORTE),
    new THREE.Vector3(0, y, -HACIA_NORTE),
    dur
  );
}

function goPlano(key, dur = 1.2) {
  const { corte } = M ? M.cotasPlanta(key) : { corte: 12 };
  const d = distanciaParaLargo(1.02);
  tweenCamera(new THREE.Vector3(0, corte + d, 0.5), new THREE.Vector3(0, corte - 1.5, 0), dur);
}

/* ─────────────────────────── Acciones ─────────────────────────── */
app.setFloor = (key) => {
  app.floor = key;
  UI.markFloorButtons(key);
  if (M) M.setFloor(key);
  if (app.selected && key !== 'all' && app.unitsById.get(app.selected)
    && floorOf(app.unitsById.get(app.selected)) !== key) app.select(null);
  if (key === 'all') {
    if (app.mode === 'plano') { app.mode = '3d'; UI.markModeButtons('3d'); }
    goOverview(1.4);
  } else if (app.mode === 'plano') {
    goPlano(key);
  } else {
    goFloor(key);
  }
  if ($('#listado').classList.contains('open')) UI.renderTable(app);
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

/* La axonometría (plantas separadas en el aire) era propia del volumen
   esquemático; con el modelo real las plantas se ven por su corte. */
app.setExplode = () => {};

app.recent = []; // últimas vistas: solo en memoria (un refresco lo deja a cero)

app.select = (id, opts = {}) => {
  app.selected = id;
  const unit = id ? app.unitsById.get(id) : null;
  if (unit) {
    app.recent = [id, ...app.recent.filter((r) => r !== id)].slice(0, 6);
    UI.renderRecent(app);
  }
  UI.renderPanel(app, unit);
  if (unit && opts.focus) {
    const fKey = floorOf(unit);
    if (app.floor !== fKey && app.floor !== 'all') app.setFloor(fKey);
    const mesh = B.unitMeshes.get(id);
    const caja = new THREE.Box3().setFromObject(mesh);
    const wp = caja.getCenter(new THREE.Vector3());
    const radio = Math.max(caja.max.x - caja.min.x, caja.max.z - caja.min.z) / 2;
    const dir = camera.position.clone().sub(controls.target).normalize();
    // la vivienda llena el encuadre: distancia según su tamaño, no fija
    const d = Math.max(22, (radio * 2.4) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    tweenCamera(wp.clone().add(dir.multiplyScalar(d)), wp, 1.1);
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

/* ──────────── Cielo diurno HDRI (fotografía real, CC0 Poly Haven) ────────────
   De día se usa un HDRI despejado con nubecillas (aristea_wreck_puresky);
   su sol (elev. 47°, az. 45°) coincide con la luz de la escena (44°/48°),
   así que las sombras casan sin rotación. De noche se mantiene el cielo
   procedural (estrellas + luna): los HDRI nocturnos a pie de suelo traen
   focos y vegetación que no encajan en el entorno urbano.
   El shader Sky actúa de respaldo mientras carga o si falla. */
const HDRI_DAY = { url: 'assets/sky_day.hdr', envInt: 0.3 };
function loadDayHDRI() {
  if (HDRI_DAY.ready) return Promise.resolve(HDRI_DAY);
  if (!HDRI_DAY.loading) {
    HDRI_DAY.loading = new Promise((resolve) => {
      new RGBELoader().load(HDRI_DAY.url, (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(renderer);
        HDRI_DAY.tex = tex;
        HDRI_DAY.env = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose();
        HDRI_DAY.ready = true;
        resolve(HDRI_DAY);
      }, undefined, () => resolve(null));
    });
  }
  return HDRI_DAY.loading;
}
function applyDaySky() {
  if (!HDRI_DAY.ready) {
    loadDayHDRI().then((ok) => { if (ok && !app.night) applyDaySky(); });
    return;
  }
  scene.background = HDRI_DAY.tex;
  scene.backgroundIntensity = 1.0;
  scene.environment = HDRI_DAY.env;
  scene.environmentIntensity = HDRI_DAY.envInt;
  sky.visible = false;
}
loadDayHDRI().then(() => { if (!app.night) applyDaySky(); });

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
  sky.material.uniforms.turbidity.value = on ? 8 : 3.0;
  sky.material.uniforms.rayleigh.value = on ? 0.6 : 1.05;
  if (on) {
    // noche procedural: cúpula oscura del shader + estrellas y luna
    sky.visible = true;
    scene.background = null;
    scene.backgroundIntensity = 1;
    rebuildEnvironment();
    scene.environmentIntensity = 0.4;
  } else {
    applyDaySky();
    if (!HDRI_DAY.ready) { sky.visible = true; scene.background = null; rebuildEnvironment(); scene.environmentIntensity = 0.3; }
  }
  // de noche, la "luz solar" pasa a ser luz de luna fría y tenue
  sun.intensity = on ? 0.35 : 3.0;
  sun.color.setHex(on ? 0xbfd1ff : 0xfff1dc);
  sun.position.copy(sunDir).multiplyScalar(180);
  if (on) sun.position.set(60, 150, -45); // misma dirección que la luna
  hemi.color.setHex(on ? 0x223252 : 0xe3edf8);
  hemi.groundColor.setHex(on ? 0x0c1016 : 0x8b9080);
  hemi.intensity = on ? 0.42 : 0.28;
  fill.color.setHex(on ? 0x8fa8d8 : 0xa8c4e8);
  fill.intensity = on ? 0.5 : 0.15;
  renderer.toneMappingExposure = on ? 1.05 : 1.0;
  scene.fog.color.setHex(on ? 0x0b111c : 0xd6dde3);
  bloom.strength = on ? 0.5 : 0.14;
  bloom.threshold = on ? 0.72 : 0.92;
  // cielo nocturno: estrellas + luna, y nubes escasas teñidas de noche
  nightSky.visible = on;
  clouds.children.forEach((cluster, i) => {
    cluster.visible = !on || i % 2 === 0;
    for (const sp of cluster.children) {
      const m = sp.material;
      m.opacity = (m.userData.baseOp ?? m.opacity) * (on ? 0.3 : 1);
      m.color.setHex(on ? 0x55617c : 0xffffff);
    }
  });
  // Ventanas: se encienden las de las viviendas que siguen a la venta; las
  // vendidas se quedan a oscuras, como en el visor nuevo.
  if (M) M.setNight(on);
  UI.markDayNight(on);
};

/* ─────────────────────────── Picking ─────────────────────────── */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
let pointerPx = { x: 0, y: 0 };
let downPos = null;

let mouseActive = false; // solo el ratón habilita el hover/tooltip
canvas.addEventListener('pointermove', (e) => {
  // el hover (y su ventanita) es solo para ratón: en táctil el toque
  // abre directamente la ficha, sin tooltip previo
  if (e.pointerType !== 'mouse') { mouseActive = false; return; }
  mouseActive = true;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  pointerPx = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerleave', () => { mouseActive = false; });
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

/* Una vivienda es señalable si pasa los filtros, no está vendida y, con una
   planta aislada, es de esa planta (las demás no se ven). */
function senalable(id) {
  if (!id) return false;
  if (app.floor !== 'all') {
    const u = app.unitsById.get(id);
    if (!u || floorOf(u) !== app.floor) return false;
  }
  if (!app.passesFilters(app.unitsById.get(id))) return false;
  return app.estadoDe(id) !== 'vendida';
}

function pickAt(cx, cy) {
  if (!B) return null;
  const p = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  for (const h of raycaster.intersectObjects(B.pickables, false)) {
    const hid = h.object.userData.unitId;
    if (senalable(hid)) return hid;
  }
  return null;
}

function updateHover() {
  if (!B) return;
  if (!mouseActive) {
    // sin ratón (táctil o fuera del lienzo): nunca hover ni tooltip
    if (app.hover) { app.hover = null; repaint(); }
    UI.hideTooltip();
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  let id = null;
  for (const h of raycaster.intersectObjects(B.pickables, false)) {
    const hid = h.object.userData.unitId;
    if (senalable(hid)) { id = hid; break; }
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

/* La cámara no baja nunca del suelo del edificio: ni por debajo de los
   forjados ni bajo la calle. El límite lo da el modelo en cada punto, porque
   el terreno se escalona casi cinco metros de un testero al otro. */
const MARGEN_VOLUMEN = 0.6;   // m de holgura fuera de la fachada y sobre el techo

function limitarSuelo() {
  if (!M) return;
  const p = camera.position;
  const yMin = M.sueloEn(p.x, p.z);
  if (p.y < yMin) p.y = yMin;
  const yMinObjetivo = M.sueloEn(controls.target.x, controls.target.z) - 2.5;
  if (controls.target.y < yMinObjetivo) controls.target.y = yMinObjetivo;

  /* Tampoco se atraviesan los muros: si la cámara entra en la huella del
     edificio por debajo de lo que se está viendo (la cubierta con el edificio
     completo, la cota de corte con una planta aislada), se la devuelve fuera
     por el lado más cercano. Como en un videojuego: el que mira no atraviesa
     paredes ni se mete debajo del proyecto. */
  const caja = M.caja;
  const techo = (M.planta === 'all' ? caja.max.y : M.cotasPlanta(M.planta).corte) + MARGEN_VOLUMEN;
  const minX = caja.min.x + MARGEN_VOLUMEN, maxX = caja.max.x - MARGEN_VOLUMEN;
  const minZ = caja.min.z + MARGEN_VOLUMEN, maxZ = caja.max.z - MARGEN_VOLUMEN;
  if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ || p.y >= techo) return;
  const salidas = [
    [p.x - minX, 'x', minX], [maxX - p.x, 'x', maxX],
    [p.z - minZ, 'z', minZ], [maxZ - p.z, 'z', maxZ],
    [techo - p.y, 'y', techo],
  ].sort((a, b) => a[0] - b[0]);
  p[salidas[0][1]] = salidas[0][2];
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
  updateHover();
  updateCompass();
  if (!intro) controls.update();
  limitarSuelo();
  composer.render();
  // pasada de cartelas (capa 1): sin bloom ni tone mapping, siempre visibles.
  // El fondo se anula durante la pasada para no repintar el cielo encima
  // de la escena ya compuesta.
  const bg = scene.background;
  scene.background = null;
  renderer.autoClear = false;
  renderer.clearDepth();
  camera.layers.set(1);
  renderer.render(scene, camera);
  camera.layers.set(0);
  renderer.autoClear = true;
  scene.background = bg;
}

/* ─────────────────────────── Resize ───────────────────────────
   La medida la manda la caja CSS del lienzo (#scene llena #app), no
   `innerHeight` ni `visualViewport`: en el navegador del móvil esas dos dan
   una altura menor mientras están las barras, y `setSize` escribía ese alto
   en el estilo del lienzo. Resultado: el 3D ocupaba un tercio de la pantalla
   y el resto quedaba en negro. Con `setSize(w, h, false)` el estilo no se
   toca y un ResizeObserver avisa de cualquier cambio de tamaño, venga de
   donde venga (giro, barras que aparecen, teclado, split view). */
const tam = { w: 0, h: 0 };

function onResize() {
  const w = Math.max(1, canvas.clientWidth || Math.round(window.visualViewport?.width || innerWidth));
  const h = Math.max(1, canvas.clientHeight || Math.round(window.visualViewport?.height || innerHeight));
  if (w === tam.w && h === tam.h) return;
  tam.w = w; tam.h = h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  gtao.setSize(w, h);
}

if (typeof ResizeObserver === 'function') new ResizeObserver(onResize).observe(canvas);
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
window.addEventListener('pageshow', onResize);
window.visualViewport?.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('scroll', onResize);
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
  for (const id of ['topbar', 'modeBar', 'compass', 'attrib', 'recentDock']) {
    document.getElementById(id)?.classList.add('hidden-ui');
  }
  app.recent = [];
  UI.renderRecent(app);
  $('#hero').classList.remove('gone');
  goOverview(1.4);
};

async function boot() {
  try {
    const [units, estados] = await Promise.all([fetchUnits(), fetchAvailability()]);
    app.units = units;
    app.estados = estados;
    app.unitsById = new Map(units.map((u) => [u.id, u]));

    const paso = $('#loader')?.querySelector('p');
    M = await cargarModelo(scene, app.unitsById, {
      estadoDe: app.estadoDe,
      plantasBajoDemanda: MOVIL,
      onProgreso: (texto) => { if (paso) paso.textContent = texto; },
    });
    app.modelo = M;
    B = { unitMeshes: M.unitMeshes, pickables: M.pickables };
    M.setFloor(app.floor);
    M.setNight(app.night);
    repaint();
    /* Mobiliario y plantas cortadas: 40 MB que llegan después de la primera
       imagen, para que el showroom se pueda enseñar mientras terminan. */
    M.cargarSecundarios().then(() => { M.setFloor(app.floor); repaint(); })
      .catch((e) => console.warn('[apolo] secundarios:', e));

    UI.initUI(app);
    UI.updateStats(app);

    // Refresco de disponibilidad (backend-ready)
    pollAvailability((nuevos) => {
      app.estados = nuevos;
      UI.updateStats(app);
      M?.refrescarEstados();
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
