/* ═══════════════════════════════════════════════════════════════════════════
   captura.js — Imágenes provisionales desde el modelo BIM, con sus máscaras.

   Para qué: el showroom nuevo (/nuevo) trabaja con IMÁGENES fijas y con
   capas interactivas encima (plantas del edificio, viviendas de la planta,
   estancias de la vivienda). Esta página produce, desde el mismo modelo de
   SketchUp que usa el visor 3D, la imagen y, con la MISMA cámara y el MISMO
   tamaño, las máscaras planas de las que salen los polígonos. Mismo motor,
   misma matriz de proyección, mismo rasterizado: lo que dice la máscara cae
   exactamente sobre lo que se ve. La receta es la de los renders
   definitivos: misma cámara → máscara → polígonos.

   Se reutiliza el visor (js/visor): escena.js (renderer AgX), luz.js (cielo
   horneado, sol en cascada, IBL del momento 'dia'), post.js (GTAO, SSR,
   bloom, SMAA, grado), materiales.js (color y acabado reales), texturas.js,
   tapas.js (poché de los muros cortados) y el vidrio físico de edificio.js.

   Tres modos, uno por carga de página (?modo=…):
   · exterior: entorno.glb + apolo_envolvente.glb, cámara en perspectiva.
   · planta:   apolo_corte_<planta>.glb + mobiliario recortado + tapas, sin
               entorno, cámara ORTOGRÁFICA cenital (norte = −z arriba).
   · interior360 (&vivienda=238): apolo_envolvente.glb ENTERO (muros, techos
               y vidrios a altura completa) + el mobiliario de la planta y
               plataforma de la vivienda + entorno (lo que se ve por las
               ventanas), luz propia (cielo HDR como IBL + sol con sombra
               única, sin CSM ni post) y panorámica 360 exacta con
               equirect.js: color, profundidad, normales y segmentación desde
               el punto 360 de una estancia de vivienda-<id>.json.

   La conduce capturar.mjs (Playwright) por `window.captura`. Ver LEEME.md.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { crearEscena } from 'app/visor/escena.js';
import { crearLuz, MOMENTOS } from 'app/visor/luz.js';
import { crearPost } from 'app/visor/post.js';
import { ajustarMaterial, asignarMapa } from 'app/visor/materiales.js';
import { limitarMaterial } from 'app/visor/texturas.js';
import { crearVidrioFisico } from 'app/visor/edificio.js';
import { triangularPoligonos } from 'app/visor/tapas.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { crearEquirect, CLASES } from './equirect.js';

const q = new URLSearchParams(location.search);
const MODO = ['planta', 'interior360'].includes(q.get('modo')) ? q.get('modo') : 'exterior';
const INTERIOR = MODO === 'interior360';
const VIVIENDA = q.get('vivienda') || '238';
const PLANTA = ['baja', 'p1', 'p2', 'atico'].includes(q.get('planta')) ? q.get('planta') : 'p1';
const TEXTURA_MAX = 2048;          // fotos fijas: sin el tope de 1024 del visor
const RUTAS = {
  entorno: 'assets/serenea/entorno.glb',
  envolvente: 'assets/serenea/apolo_envolvente.glb',
  mobiliario: 'assets/serenea/apolo_mobiliario.glb',
  corte: (k) => `assets/serenea/apolo_corte_${k}.glb`,
  cortes: 'data/cortes.json',
  viviendas: 'data/viviendas_serenea.json',
  tapas: 'data/tapas_serenea.json',
  cielo: 'assets/sky_day.hdr',
  vivienda: (id) => `nuevo/estilos/img/vivienda-${id}.json`,
};
const ORDEN_PLANTAS = ['baja', 'p1', 'p2', 'atico'];
const NIEBLA = { near: 1900, far: 6800 };   // la de main.js
const ES_VIDRIO = /vidrio|^glass$/i;

/* ── Escena ── */
const canvas = document.getElementById('lienzo');
const ctx = crearEscena(canvas);
const { renderer, scene } = ctx;
let camara;
if (MODO === 'planta') {
  /* La cámara se cambia ANTES de crear la luz y el post: el CSM y las
     pasadas de post leen ctx.camera al construirse. */
  camara = new THREE.OrthographicCamera(-50, 50, 20, -20, 0.1, 400);
  ctx.camera = camara;
} else {
  camara = ctx.camera;
  camara.far = 9000;
  camara.updateProjectionMatrix();
}
renderer.setPixelRatio(1);

const estado = { modo: MODO, planta: PLANTA, etapa: 'inicio', tiempos: {}, avisos: [] };
const ms = (t0) => Math.round(performance.now() - t0);

function tamano(w, h) {
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  renderer.setPixelRatio(1);
  ctx.setTamano(w, h);   // renderer + post + CSM (evento 'tamano')
}
tamano(+q.get('ancho') || 1280, +q.get('alto') || 720);

/* En interior360 no hay luz.js ni post.js: el CSM y las pasadas de pantalla
   dependen de UNA cámara en perspectiva, y aquí se dibujan seis caras de
   cubo. La luz del interior la pone prepararLuzInterior(). */
const luz = INTERIOR ? null : crearLuz(ctx);
if (luz) {
  scene.fog.near = NIEBLA.near;
  scene.fog.far = NIEBLA.far;
}
const post = INTERIOR ? null : crearPost(ctx, luz);
post?.setGrado(MOMENTOS.dia.grado);

/* ── Carga ── */
const cargador = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cargarGLB = (url) => new Promise((ok, ko) => cargador.load(url, ok, undefined, ko));
const cargarJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });

/* Normales nulas → (0,1,0): un NaN se lo lleva el bloom a todo el fotograma
   (ver la cabecera de edificio.js). */
function sanearNormales(g) {
  const n = g.getAttribute('normal');
  if (!n) { g.computeVertexNormals(); return 0; }
  let k = 0;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    if (!Number.isFinite(x + y + z) || x * x + y * y + z * z < 1e-4) { n.setXYZ(i, 0, 1, 0); k++; }
  }
  if (k) n.needsUpdate = true;
  return k;
}

/* Un material del visor por nombre (como edificio.js): el primer fichero que
   lo trae lo fija y los demás lo adoptan. */
const materiales = new Map();
let vidrio = null;
function vidrioFisico() {
  if (!vidrio) {
    vidrio = INTERIOR ? crearVidrioInterior() : crearVidrioFisico();
    vidrio.name = INTERIOR ? 'vidrio_interior' : 'vidrio_fisico';
    luz?.aplicarMaterial(vidrio);
  }
  return vidrio;
}
function materialEdificio(m) {
  const nombre = m.name || 'sin_nombre';
  let r = materiales.get(nombre);
  if (r) return r;
  if (ES_VIDRIO.test(nombre)) r = vidrioFisico();
  else {
    r = m;
    limitarMaterial(r, TEXTURA_MAX);
    r.alphaTest = 0;
    if (!(r.transparent && r.opacity < 1)) { r.transparent = false; r.depthWrite = true; }
    r.side = THREE.FrontSide;
    r.envMapIntensity = 1;
    r.userData = { baseOpacity: r.opacity, baseEnv: 1, baseColor: r.color?.clone?.() };
    ajustarMaterial(r);
    luz?.aplicarMaterial(r);
    /* Dentro de la vivienda una cara invertida del SketchUp sería un hueco. */
    if (INTERIOR) r.side = THREE.DoubleSide;
  }
  materiales.set(nombre, r);
  return r;
}

/* Caras traseras en gris claro mate (copia de oscurecerTraseras de cortes.js):
   por la boca del corte se ve la cara interior del muro. */
const COLOR_TRASERA = 'vec3(0.74, 0.72, 0.68)';
function traserasClaras(material) {
  if (!material || material.userData.carasOscuras || material === vidrio) return;
  material.userData.carasOscuras = true;
  material.side = THREE.DoubleSide;
  const previo = material.onBeforeCompile;
  const clavePrevia = material.customProgramCacheKey?.bind(material);
  const textoPrevio = previo ? previo.toString() : '';
  material.onBeforeCompile = function (shader, r) {
    if (previo) previo.call(this, shader, r);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = ${COLOR_TRASERA};`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  if (!gl_FrontFacing) roughnessFactor = 1.0;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  if (!gl_FrontFacing) metalnessFactor = 0.0;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  if (!gl_FrontFacing) { reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0); }');
  };
  material.customProgramCacheKey = () => `${clavePrevia ? clavePrevia() : ''}|${textoPrevio}|traseras`;
  material.needsUpdate = true;
}

/* Entorno (como cargarEntorno/materialEntorno de main.js, sin fusionar: para
   una foto fija las llamadas de dibujo no importan). Las texturas
   procedurales (asfalto, acera, césped, tierra) necesitan UV en planta: se
   hornea la geometría a coordenadas de mundo y la UV es (x, z) en metros. */
function materialEntorno(m) {
  const nombre = m.name || '';
  let r = materiales.get(`entorno|${nombre}`);
  if (r) return r;
  if (ES_VIDRIO.test(nombre)) r = vidrioFisico();
  else {
    r = m;
    asignarMapa(r);
    limitarMaterial(r, TEXTURA_MAX);
    r.alphaTest = 0; r.transparent = false; r.depthWrite = true;
    r.envMapIntensity = /^ortho|^PNOA_|asphalt|curb|EXT_Tierra|industry/i.test(nombre) ? 0.42 : 0.85;
    if (nombre === 'mar_atlantico_costa') { r.roughness = 0.18; r.metalness = 0; r.envMapIntensity = 1; }
    else if (nombre === 'metal') { r.roughness = 0.45; r.metalness = 0.7; }
    else if (/^ortho$|^PNOA_/.test(nombre)) { r.roughness = 1; r.metalness = 0; }
    ajustarMaterial(r);
    luz?.aplicarMaterial(r);
  }
  materiales.set(`entorno|${nombre}`, r);
  return r;
}
function hornearMundoConUV(mesh) {
  const g = mesh.geometry.clone();
  for (const nombre of Object.keys(g.attributes)) {
    const a = g.getAttribute(nombre);
    if (a.normalized || !(a.array instanceof Float32Array)) {
      const n = a.itemSize, datos = new Float32Array(a.count * n);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) datos[i * n + k] = a.getComponent(i, k);
      g.setAttribute(nombre, new THREE.BufferAttribute(datos, n));
    }
  }
  g.applyMatrix4(mesh.matrixWorld);
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getZ(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = g;
  mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
}

const grupos = { entorno: null, edificio: null, mobiliario: null, tapas: null, prismas: null };
const mallasEdificio = [];
const mallasEntorno = [];
let datos = { cortes: null, viviendas: null };

async function cargarExterior() {
  let t0 = performance.now();
  const [ent, env] = await Promise.all([cargarGLB(RUTAS.entorno), cargarGLB(RUTAS.envolvente)]);
  estado.tiempos.descarga = ms(t0);
  t0 = performance.now();
  ent.scene.updateMatrixWorld(true);
  const listaEnt = [];
  ent.scene.traverse((o) => { if (o.isMesh) listaEnt.push(o); });
  for (const o of listaEnt) {
    sanearNormales(o.geometry);
    o.material = Array.isArray(o.material) ? o.material.map(materialEntorno) : materialEntorno(o.material);
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.userData?.uvMundo) hornearMundoConUV(o);
    o.castShadow = !ES_VIDRIO.test(m?.name || '');
    o.receiveShadow = true;
    mallasEntorno.push(o);
  }
  grupos.entorno = ent.scene; grupos.entorno.name = 'entorno';
  scene.add(grupos.entorno);
  adoptarEdificio(env.scene, { mobiliario: false });
  grupos.edificio = env.scene; grupos.edificio.name = 'edificio';
  scene.add(grupos.edificio);
  estado.tiempos.preparar = ms(t0);
}

function adoptarEdificio(raiz, { mobiliario }) {
  raiz.updateMatrixWorld(true);
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    sanearNormales(o.geometry);
    o.material = Array.isArray(o.material) ? o.material.map(materialEdificio) : materialEdificio(o.material);
    const esVidrio = (Array.isArray(o.material) ? o.material[0] : o.material) === vidrio;
    o.castShadow = !esVidrio;
    o.receiveShadow = true;
    o.userData.mobiliario = mobiliario;
    mallasEdificio.push(o);
  });
}

/* Plataforma de una malla por su nombre (`…__T<n>__…`). */
const plataformaDe = (nombre) => { const r = /__T(\d+)__/.exec(nombre); return r ? +r[1] : -1; };
/* Cota mínima del nombre del mobiliario (`…__y<ymin>`, ver cortes.js).
   GLTFLoader sanea los nombres de nodo y les quita los puntos: sin punto,
   el valor va en centímetros. */
const yminDe = (nombre) => {
  const r = /__y(-?\d+)(?:\.(\d+))?$/.exec(nombre);
  if (!r) return NaN;
  return r[2] != null ? parseFloat(`${r[1]}.${r[2]}`) : parseInt(r[1], 10) / 100;
};

async function cargarPlanta() {
  let t0 = performance.now();
  const [corte, mob, cortes, viviendas, tapas] = await Promise.all([
    cargarGLB(RUTAS.corte(PLANTA)), cargarGLB(RUTAS.mobiliario),
    cargarJSON(RUTAS.cortes), cargarJSON(RUTAS.viviendas), cargarJSON(RUTAS.tapas),
  ]);
  estado.tiempos.descarga = ms(t0);
  t0 = performance.now();
  datos = { cortes, viviendas: viviendas.viviendas };
  adoptarEdificio(corte.scene, { mobiliario: false });
  grupos.edificio = corte.scene; grupos.edificio.name = 'edificio';
  scene.add(grupos.edificio);

  /* Mobiliario: se queda lo que empieza por debajo del corte de su
     plataforma y por encima del corte de la planta de abajo (lo de las
     plantas inferiores queda bajo el forjado: no se ve y solo cuesta), y se
     recorta con el plano del corte de su plataforma (el mismo Plane para
     toda la plataforma: post.js lo respeta en el G-buffer). */
  const iPlanta = ORDEN_PLANTAS.indexOf(PLANTA);
  const cajones = cortes.plantas[PLANTA];
  const inferior = iPlanta > 0 ? cortes.plantas[ORDEN_PLANTAS[iPlanta - 1]] : null;
  const planos = cajones.map((c) => new THREE.Plane(new THREE.Vector3(0, -1, 0), c.y));
  const clones = new Map();
  const recortado = (m, p) => {
    const clave = `${m.uuid}|${p}`;
    let c = clones.get(clave);
    if (!c) {
      c = m.clone();
      c.name = m.name;
      c.clippingPlanes = [planos[p]];
      c.clipShadows = true;
      c.userData = { ...m.userData };
      luz.aplicarMaterial(c);
      clones.set(clave, c);
    }
    return c;
  };
  mob.scene.updateMatrixWorld(true);
  const quitar = [];
  let visibles = 0;
  mob.scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = plataformaDe(o.name), y = yminDe(o.name);
    if (p < 0 || !Number.isFinite(y) || y >= cajones[p].y || (inferior && y < inferior[p].y - 0.3)) { quitar.push(o); return; }
    visibles++;
  });
  for (const o of quitar) o.parent.remove(o);
  adoptarEdificio(mob.scene, { mobiliario: true });
  mob.scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = plataformaDe(o.name);
    o.material = Array.isArray(o.material) ? o.material.map((m) => recortado(m, p)) : recortado(o.material, p);
  });
  grupos.mobiliario = mob.scene; grupos.mobiliario.name = 'mobiliario';
  scene.add(grupos.mobiliario);
  estado.mobiliario = { visibles, descartadas: quitar.length };

  /* Caras traseras claras en todo lo cortado y en el mobiliario recortado. */
  for (const m of new Set([...materiales.values(), ...clones.values()])) traserasClaras(m);

  /* Tapas (poché) de los muros cortados, precalculadas por tools/tapas_serenea.mjs. */
  const materialTapa = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: new THREE.Color(0.045, 0.0425, 0.040), roughness: 1, metalness: 0, name: 'tapa_corte',
  });
  luz.aplicarMaterial(materialTapa);
  const escala = tapas.unidad === 'mm' ? 0.001 : 1;
  const trozos = []; let total = 0;
  for (const c of tapas.plantas[PLANTA].cajones) {
    const polis = []; const a = c.poligonos;
    for (let i = 0; i < a.length;) {
      const n = a[i++]; const poli = [];
      for (let k = 0; k < n; k++, i += 2) poli.push([a[i] * escala, a[i + 1] * escala]);
      polis.push(poli);
    }
    const { posiciones } = triangularPoligonos(polis, c.y + (tapas.alzar ?? 0.01));
    trozos.push(posiciones); total += posiciones.length;
  }
  const pos = new Float32Array(total); let o = 0;
  for (const t of trozos) { pos.set(t, o); o += t.length; }
  const gt = new THREE.BufferGeometry();
  gt.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length); for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  gt.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  grupos.tapas = new THREE.Mesh(gt, materialTapa);
  grupos.tapas.name = `tapas-${PLANTA}`;
  grupos.tapas.castShadow = false; grupos.tapas.receiveShadow = false;
  scene.add(grupos.tapas);
  estado.tapas = { triangulos: total / 9 };
  estado.tiempos.preparar = ms(t0);
}

/* ── Cámara ── */
const info = { tipo: null };

function camaraPerspectiva({ ancho, alto, posicion, objetivo, fov = 45, cerca = 0.5, lejos = 9000, arriba = [0, 1, 0] }) {
  if (MODO !== 'exterior') throw new Error('perspectiva solo en modo exterior');
  tamano(ancho, alto);
  camara.fov = fov; camara.near = cerca; camara.far = lejos;
  camara.aspect = ancho / alto;
  camara.position.set(...posicion);
  camara.up.set(...arriba);
  camara.lookAt(...objetivo);
  camara.updateProjectionMatrix();
  camara.updateMatrixWorld(true);
  Object.assign(info, { tipo: 'perspectiva', ancho, alto, posicion, objetivo, fov, cerca, lejos, arriba });
  return describirCamara();
}

/* Cenital ortográfica: x a la derecha, −z (norte) arriba. La imagen cubre
   [x0, x0 + ancho/s] × [z0, z0 + alto/s] con s píxeles por metro, y la
   transformación de [x, z] a píxeles (origen arriba a la izquierda, y hacia
   abajo, coordenadas continuas: el centro del primer píxel es 0,5) es
   px = s·x − s·x0, py = s·z − s·z0. Exacta: es la misma cuenta que hace la
   GPU con esta matriz ortográfica (se comprueba con mascaraViviendas). */
function camaraCenital({ x0, z0, s, ancho, alto, y = 40, cerca = 0.5, lejos = 120, sombras = 60 }) {
  if (MODO !== 'planta') throw new Error('cenital solo en modo planta');
  tamano(ancho, alto);
  const W = ancho / s, H = alto / s;
  const cx = x0 + W / 2, cz = z0 + H / 2;
  camara.left = -W / 2; camara.right = W / 2; camara.top = H / 2; camara.bottom = -H / 2;
  camara.near = cerca; camara.far = lejos;
  camara.position.set(cx, y, cz);
  camara.up.set(0, 0, -1);
  camara.lookAt(cx, 0, cz);
  camara.updateProjectionMatrix();
  camara.updateMatrixWorld(true);
  luz.setAlcanceSombras(sombras);
  Object.assign(info, { tipo: 'ortografica', ancho, alto, x0, z0, s, y, cerca, lejos });
  return describirCamara();
}

function describirCamara() {
  camara.updateMatrixWorld(true);
  const d = { ...info };
  d.proyeccion = camara.projectionMatrix.toArray();
  d.vista = camara.matrixWorldInverse.toArray();
  if (info.tipo === 'ortografica') {
    d.transformacion = {
      descripcion: 'px = a·x + c ; py = b·z + d  (x, z en metros del SketchUp; píxeles con origen arriba a la izquierda)',
      a: info.s, b: info.s, c: -info.s * info.x0, d: -info.s * info.z0,
      matriz: [[info.s, 0, -info.s * info.x0], [0, info.s, -info.s * info.z0]],
    };
  }
  return d;
}

/* Proyección de puntos del mundo a píxeles con la cámara actual. */
function proyectar(puntos) {
  camara.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  return puntos.map(([x, y, z]) => {
    v.set(x, y, z).project(camara);
    return [(v.x + 1) / 2 * info.ancho, (1 - v.y) / 2 * info.alto, v.z];
  });
}

/* ── Luz ── */
/* Sol con elevación y acimut en grados (0° = sur, 270° = oeste, como luz.js).
   Solo cambia la dirección del sol de la escena: el cielo de fondo no se
   vuelve a hornear (en planta no hay cielo). */
function setSol({ elev, azim }) {
  const e = THREE.MathUtils.degToRad(elev), a = THREE.MathUtils.degToRad(azim);
  /* misma convención que direccionDe() de luz.js */
  luz.direccionSol.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).normalize();
  luz.setRealcePlanta(MODO === 'planta', { duracion: 0 }); // reaplica el estado con la dirección nueva
}

/* ── Render ── */
function avanzar(n) {
  for (let i = 0; i < n; i++) {
    luz.update(1 / 30);
    renderer.shadowMap.needsUpdate = true;
    post.render(1 / 30);
  }
}

function renderizar({ fotogramas = 3, formato = 'image/png' } = {}) {
  const t0 = performance.now();
  avanzar(fotogramas);
  const url = canvas.toDataURL(formato);
  estado.tiempos.ultimoRender = ms(t0);
  return url;
}

/* ── Máscaras ──
   Se dibujan con renderer.render directo (sin post, sin tono, sin niebla,
   sin suavizado) y materiales planos: cada píxel es exactamente un color.
   La cámara, el tamaño y la geometría (y por tanto la profundidad que
   decide qué tapa a qué) son los de la imagen. */
const VERT_MUNDO = `
varying vec3 vMundo;
#include <clipping_planes_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vMundo = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const FRAG_PLANTAS = `
uniform vec4 uCajon[8];      // x0, x1, z0, z1
uniform vec4 uLimiteA[8];    // suelo de los niveles 1, 2, 3, 4
uniform float uTecho[8];     // por encima: cubierta, sin nivel
varying vec3 vMundo;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  int c = 0; float mejor = 1e9;
  for (int i = 0; i < 8; i++) {
    vec4 k = uCajon[i];
    float dx = max(max(k.x - vMundo.x, 0.0), vMundo.x - k.y);
    float dz = max(max(k.z - vMundo.z, 0.0), vMundo.z - k.w);
    float d = dx * dx + dz * dz;
    if (d < mejor) { mejor = d; c = i; }
  }
  vec4 L = uLimiteA[c];
  float y = vMundo.y;
  vec3 col = vec3(1.0);                       // edificio sin nivel (zócalo, cubierta)
  if (y >= L.x && y < L.y) col = vec3(1.0, 0.0, 0.0);
  else if (y >= L.y && y < L.z) col = vec3(0.0, 1.0, 0.0);
  else if (y >= L.z && y < L.w) col = vec3(0.0, 0.0, 1.0);
  else if (y >= L.w && y < uTecho[c]) col = vec3(1.0, 1.0, 0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

/* Límites de nivel por cajón: suelo mínimo de las viviendas de esa planta y
   cajón (data/viviendas_serenea.json) menos `bajo` (para que el canto del
   forjado vaya con la planta que pisa encima); si un cajón no tiene
   viviendas en una planta, su corte menos la altura de sección típica. */
function limitesDeNivel({ cortes, viviendas }, { bajo = 0.15, techoSobreAtico = 2.95 } = {}) {
  const cajones = cortes.plantas.baja;
  const seccion = { baja: 1.95, p1: 1.38, p2: 1.38, atico: 1.40 };
  const min = {};
  for (const v of Object.values(viviendas)) {
    const k = `${v.planta}|${v.plataforma}`;
    min[k] = Math.min(min[k] ?? Infinity, v.y0);
  }
  return cajones.map((c, p) => {
    const suelos = ORDEN_PLANTAS.map((k) => (Number.isFinite(min[`${k}|${p}`]) ? min[`${k}|${p}`] : cortes.plantas[k][p].y - seccion[k]) - bajo);
    return { cajon: [c.x0, c.x1, c.z0, c.z1], suelos, techo: suelos[3] + techoSobreAtico };
  });
}

function conMateriales(asignar, fn) {
  const guardados = [];
  const ocultos = [];
  scene.traverse((o) => {
    if ((o.isPoints || o.isSprite || o.isLine) && o.visible) { o.visible = false; ocultos.push(o); return; }
    if (!o.isMesh) return;
    guardados.push([o, o.material]);
    const m = asignar(o);
    if (m === null) { o.visible = false; ocultos.push(o); } else o.material = m;
  });
  const bg = scene.background, fog = scene.fog, tm = renderer.toneMapping;
  const clear = renderer.getClearColor(new THREE.Color()), alfa = renderer.getClearAlpha();
  scene.background = null; scene.fog = null;
  renderer.setClearColor(0x000000, 1);
  try { return fn(); } finally {
    for (const [o, m] of guardados) o.material = m;
    for (const o of ocultos) o.visible = true;
    scene.background = bg; scene.fog = fog; renderer.toneMapping = tm;
    renderer.setClearColor(clear, alfa);
  }
}

function renderMascara() {
  renderer.setRenderTarget(null);
  renderer.render(scene, camara);
  return canvas.toDataURL('image/png');
}

/* Máscara por plantas lógicas: nivel 1 rojo, 2 verde, 3 azul, 4 amarillo,
   resto del edificio blanco, entorno y cielo negros. */
async function mascaraPlantas(opciones = {}) {
  if (!datos.cortes) datos = { cortes: await cargarJSON(RUTAS.cortes), viviendas: (await cargarJSON(RUTAS.viviendas)).viviendas };
  const lim = limitesDeNivel(datos, opciones);
  const uniforms = {
    uCajon: { value: lim.map((l) => new THREE.Vector4(...l.cajon)) },
    uLimiteA: { value: lim.map((l) => new THREE.Vector4(...l.suelos)) },
    uTecho: { value: lim.map((l) => l.techo) },
  };
  const porLado = new Map();
  const deEdificio = (lado) => {
    let m = porLado.get(`e${lado}`);
    if (!m) { m = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT_MUNDO, fragmentShader: FRAG_PLANTAS, side: lado, toneMapped: false, fog: false }); porLado.set(`e${lado}`, m); }
    return m;
  };
  const negro = (lado) => {
    let m = porLado.get(`n${lado}`);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: 0x000000, side: lado, toneMapped: false, fog: false }); porLado.set(`n${lado}`, m); }
    return m;
  };
  const edificio = new Set(mallasEdificio);
  const url = conMateriales((o) => {
    const orig = Array.isArray(o.material) ? o.material[0] : o.material;
    const lado = orig?.side ?? THREE.FrontSide;
    return edificio.has(o) && !o.userData.mobiliario ? deEdificio(lado) : negro(lado);
  }, renderMascara);
  for (const m of porLado.values()) m.dispose();
  return { url, limites: lim };
}

/* Máscara de edificios: Apolo en rojo puro; cada uno de los otros edificios
   SERENEA en verde con su número en el azul (B = n), y el resto, negro.
   Los otros edificios son lo del entorno que lleva materiales 'APOLO …' (el
   entorno los trae modelados con los mismos acabados), pero sus mallas están
   fusionadas por material y una misma malla puede abarcar dos edificios: se
   separan EN PLANTA. Los vértices de esas mallas se marcan en una rejilla de
   1 m, se engorda una celda y cada mancha conexa de al menos `huellaMin` m²
   es un edificio; el sombreador mira en qué mancha cae cada fragmento.
   Colores sin conversión (ShaderMaterial): el byte que sale es el pedido. */
function mascaraEdificios({ huellaMin = 150, paso = 1 } = {}) {
  const edificio = new Set(mallasEdificio);
  const candidatas = new Set(mallasEntorno.filter((o) => /^APOLO/.test((Array.isArray(o.material) ? o.material[0] : o.material)?.name || '')));
  /* Cada triángulo se muestrea en su plano cada medio metro (aristas e
     interior): un paño de fachada marca toda su traza y una cubierta, toda
     su huella. */
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const pts = [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const o of candidatas) {
    const g = o.geometry, pos = g.getAttribute('position'), idx = g.index;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(o.matrixWorld);
      const lado = Math.max(Math.hypot(b.x - a.x, b.z - a.z), Math.hypot(c.x - a.x, c.z - a.z), Math.hypot(c.x - b.x, c.z - b.z));
      const k = Math.min(400, Math.max(1, Math.ceil(lado / (paso / 2))));
      for (let i = 0; i <= k; i++) {
        for (let j = 0; j <= k - i; j++) {
          const u = i / k, w = j / k;
          const x = a.x + u * (b.x - a.x) + w * (c.x - a.x), z = a.z + u * (b.z - a.z) + w * (c.z - a.z);
          pts.push(x, z);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
      }
    }
  }
  x0 -= 2; z0 -= 2;
  const W = Math.ceil((x1 - x0) / paso) + 3, H = Math.ceil((z1 - z0) / paso) + 3;
  const ocupada = new Uint8Array(W * H);
  for (let i = 0; i < pts.length; i += 2) {
    const ci = Math.floor((pts[i] - x0) / paso), cj = Math.floor((pts[i + 1] - z0) / paso);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) ocupada[(cj + dj) * W + ci + di] = 1;
  }
  const etiqueta = new Int32Array(W * H);
  const manchas = [];
  for (let k = 0; k < W * H; k++) {
    if (!ocupada[k] || etiqueta[k]) continue;
    const id = manchas.length + 1, pila = [k];
    const m = { id, celdas: 0, i0: Infinity, i1: -Infinity, j0: Infinity, j1: -Infinity };
    etiqueta[k] = id;
    while (pila.length) {
      const c = pila.pop(), ci = c % W, cj = (c - ci) / W;
      m.celdas++; m.i0 = Math.min(m.i0, ci); m.i1 = Math.max(m.i1, ci); m.j0 = Math.min(m.j0, cj); m.j1 = Math.max(m.j1, cj);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni;
        if (ocupada[n] && !etiqueta[n]) { etiqueta[n] = id; pila.push(n); }
      }
    }
    manchas.push(m);
  }
  const buenas = manchas.filter((m) => m.celdas * paso * paso >= huellaMin).sort((a, b) => a.i0 - b.i0);
  const numero = new Map(buenas.map((m, k) => [m.id, k + 1]));
  const rejilla = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) rejilla[k] = numero.get(etiqueta[k]) || 0;
  const tex = new THREE.DataTexture(rejilla, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const mats = new Map();
  const material = (tipo, lado) => {
    const k = `${tipo}|${lado}`;
    let m = mats.get(k);
    if (!m) {
      m = new THREE.ShaderMaterial({
        uniforms: { uTipo: { value: tipo }, uRejilla: { value: tex }, uOrigen: { value: new THREE.Vector2(x0, z0) }, uTam: { value: new THREE.Vector2(W * paso, H * paso) } },
        vertexShader: 'varying vec3 vMundo; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vMundo = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform int uTipo; uniform sampler2D uRejilla; uniform vec2 uOrigen; uniform vec2 uTam; varying vec3 vMundo;
          void main() {
            if (uTipo == 1) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
            if (uTipo == 0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
            vec2 uv = (vMundo.xz - uOrigen) / uTam;
            float n = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 0.0 : texture2D(uRejilla, uv).r;
            gl_FragColor = n > 0.0 ? vec4(0.0, 1.0, n, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
          }`,
        side: lado, toneMapped: false, fog: false,
      });
      mats.set(k, m);
    }
    return m;
  };
  const url = conMateriales((o) => {
    const orig = Array.isArray(o.material) ? o.material[0] : o.material;
    const lado = orig?.side ?? THREE.FrontSide;
    return material(edificio.has(o) ? 1 : candidatas.has(o) ? 2 : 0, lado);
  }, renderMascara);
  for (const m of mats.values()) m.dispose();
  tex.dispose();
  return {
    url,
    grupos: buenas.map((m, k) => ({
      grupo: k + 1, huellaM2: Math.round(m.celdas * paso * paso),
      caja: { x0: +(x0 + m.i0 * paso).toFixed(1), x1: +(x0 + (m.i1 + 1) * paso).toFixed(1), z0: +(z0 + m.j0 * paso).toFixed(1), z1: +(z0 + (m.j1 + 1) * paso).toFixed(1) },
    })),
  };
}

/* Máscara de viviendas: el prisma de cada vivienda pedida, con su índice
   codificado en el color (r = índice + 1), sin nada más en la escena. En la
   cenital ortográfica el prisma visto desde arriba ES su polígono: sirve para
   comprobar al píxel la transformación afín calculada a mano. */
function mascaraViviendas(ids) {
  const g = new THREE.Group();
  const mats = [];
  ids.forEach((id, i) => {
    const v = datos.viviendas[id];
    if (!v) return;
    const forma = new THREE.Shape(v.poligono.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(forma, { depth: Math.max(0.05, v.y1 - v.y0), bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, v.y0, 0);
    /* ShaderMaterial sin conversión de color ni tono: el byte rojo que sale
       es exactamente i + 1. */
    const m = new THREE.ShaderMaterial({
      uniforms: { uId: { value: (i + 1) / 255 } },
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uId; void main() { gl_FragColor = vec4(uId, 0.0, 0.0, 1.0); }',
      side: THREE.DoubleSide, toneMapped: false, fog: false,
    });
    mats.push(m);
    g.add(new THREE.Mesh(geo, m));
  });
  scene.add(g);
  try {
    return conMateriales((o) => (o.parent === g ? o.material : null), renderMascara);
  } finally {
    scene.remove(g);
    g.traverse((o) => o.geometry?.dispose());
    mats.forEach((m) => m.dispose());
  }
}

/* ── Datos para las estancias ── */
/* Sección horizontal a la cota y: segmentos [x0, z0, x1, z1] de los
   triángulos del edificio (muros, carpinterías, pilares) y de las PUERTAS
   del mobiliario que la cruzan, dentro del rectángulo pedido. Con ellos
   procesar.py separa las estancias de una vivienda. */
function seccion({ y, x0, x1, z0, z1, conPuertas = true }) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const segs = [];
  for (const o of mallasEdificio) {
    if (o.userData.mobiliario && !(conPuertas && /^puerta__/.test(o.name))) continue;
    const g = o.geometry, pos = g.getAttribute('position');
    if (!g.boundingBox) g.computeBoundingBox();
    const caja = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
    if (caja.max.y < y || caja.min.y > y || caja.max.x < x0 || caja.min.x > x1 || caja.max.z < z0 || caja.min.z > z1) continue;
    const idx = g.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(o.matrixWorld);
      const p = [];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        if ((u.y > y) === (v.y > y)) continue;
        const k = (y - u.y) / (v.y - u.y);
        p.push([u.x + (v.x - u.x) * k, u.z + (v.z - u.z) * k]);
      }
      if (p.length !== 2) continue;
      const mx = (p[0][0] + p[1][0]) / 2, mz = (p[0][1] + p[1][1]) / 2;
      if (mx < x0 || mx > x1 || mz < z0 || mz > z1) continue;
      segs.push([+p[0][0].toFixed(3), +p[0][1].toFixed(3), +p[1][0].toFixed(3), +p[1][1].toFixed(3), /^puerta__/.test(o.name) ? 1 : 0]);
    }
  }
  return segs;
}

/* Mobiliario dentro de un polígono: por material, área en planta y
   centroide de los triángulos cuyo centro cae dentro y entre y0 e y1. Sirve
   para situar la cocina, el sofá, la cama o el inodoro. */
function mobiliarioEn({ poligono, y0, y1, triangulos = false }) {
  const dentro = (x, z) => {
    let r = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [xi, zi] = poligono[i], [xj, zj] = poligono[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r;
    }
    return r;
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const acc = {};
  const tris = [], indiceMaterial = new Map();
  for (const o of mallasEdificio) {
    if (!o.userData.mobiliario) continue;
    const g = o.geometry, pos = g.getAttribute('position');
    const idx = g.index, n = idx ? idx.count : pos.count;
    const nombre = (Array.isArray(o.material) ? o.material[0] : o.material).name;
    for (let t = 0; t < n; t += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(o.matrixWorld);
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
      if (cy < y0 || cy > y1 || !dentro(cx, cz)) continue;
      const ar = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2 + 1e-6;
      const e = acc[nombre] || (acc[nombre] = { area: 0, sx: 0, sz: 0, ymax: -Infinity, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
      e.area += ar; e.sx += cx * ar; e.sz += cz * ar; e.ymax = Math.max(e.ymax, a.y, b.y, c.y);
      e.x0 = Math.min(e.x0, a.x, b.x, c.x); e.x1 = Math.max(e.x1, a.x, b.x, c.x);
      e.z0 = Math.min(e.z0, a.z, b.z, c.z); e.z1 = Math.max(e.z1, a.z, b.z, c.z);
      if (triangulos) {
        if (!indiceMaterial.has(nombre)) indiceMaterial.set(nombre, indiceMaterial.size);
        /* en centímetros enteros: [material, xa, za, xb, zb, xc, zc, ymax] */
        tris.push([indiceMaterial.get(nombre), ...[a.x, a.z, b.x, b.z, c.x, c.z].map((v) => Math.round(v * 100)), Math.round(Math.max(a.y, b.y, c.y) * 100)]);
      }
    }
  }
  const out = {};
  for (const [k, e] of Object.entries(acc)) {
    out[k] = { area: +e.area.toFixed(3), x: +(e.sx / e.area).toFixed(3), z: +(e.sz / e.area).toFixed(3), ymax: +e.ymax.toFixed(2), caja: [e.x0, e.x1, e.z0, e.z1].map((v) => +v.toFixed(2)) };
  }
  if (triangulos) return { materiales: out, nombres: [...indiceMaterial.keys()], triangulos: tris };
  return out;
}

/* ══ Interior 360 ════════════════════════════════════════════════════════
   La vivienda completa desde dentro: la envolvente ENTERA (los cortes de
   planta tienen los muros a 1,4 m y sin techo), el mobiliario de su planta y
   plataforma (sin las personas del modelo: los 360 van sin personas,
   PRODUCCION_IMAGENES §2.4) y el entorno para lo que se ve por las ventanas.
   Luz neutra a propósito (la pondrá la pasada de IA): el cielo HDR del visor
   como IBL sin oclusión, más un sol de tarde con UNA sombra direccional que
   cubre la vivienda y lo que la tapa. Sin post: seis caras de cubo. */
const interior = { vivienda: null, ficha: null, sol: null, dirSol: new THREE.Vector3(), camara: null, equirect: null, personas: 0 };

/* Vidrio casi transparente: desde dentro tiene que verse lo de fuera. */
function crearVidrioInterior() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xf2f6f6, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16,
    envMapIntensity: 0.6, side: THREE.DoubleSide, depthWrite: false,
  });
  m.userData = { baseOpacity: m.opacity, baseEnv: 0.6 };
  return m;
}

const mallasMobiliario = new Set();
const conjuntoEntorno = new Set();

async function cargarInterior() {
  let t0 = performance.now();
  const sinEntorno = q.get('entorno') === '0';
  const [env, mob, ent, viviendas, ficha, cielo] = await Promise.all([
    cargarGLB(RUTAS.envolvente), cargarGLB(RUTAS.mobiliario), sinEntorno ? null : cargarGLB(RUTAS.entorno),
    cargarJSON(RUTAS.viviendas), cargarJSON(RUTAS.vivienda(VIVIENDA)), new HDRLoader().loadAsync(RUTAS.cielo),
  ]);
  estado.tiempos.descarga = ms(t0);
  t0 = performance.now();
  const v = viviendas.viviendas[VIVIENDA];
  if (!v) throw new Error(`vivienda ${VIVIENDA} no está en ${RUTAS.viviendas}`);
  datos = { cortes: null, viviendas: viviendas.viviendas };
  interior.vivienda = { id: VIVIENDA, ...v };
  interior.ficha = ficha;

  adoptarEdificio(env.scene, { mobiliario: false });
  grupos.edificio = env.scene; grupos.edificio.name = 'edificio';
  scene.add(grupos.edificio);

  /* Mobiliario de la misma plataforma que arranca en su planta: cota mínima
     entre el suelo −0,3 m y el suelo +2,7 m (por encima empieza la planta de
     arriba, cuyo forjado es el techo). */
  mob.scene.updateMatrixWorld(true);
  const quitar = [];
  let visibles = 0;
  mob.scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = plataformaDe(o.name), y = yminDe(o.name);
    const nombre = (Array.isArray(o.material) ? o.material[0] : o.material)?.name || '';
    if (p !== v.plataforma || !(y >= v.y0 - 0.3 && y < v.y0 + 2.7)) { quitar.push(o); return; }
    if (/^Sree_/.test(nombre)) { interior.personas++; quitar.push(o); return; }
    visibles++;
  });
  for (const o of quitar) o.parent.remove(o);
  adoptarEdificio(mob.scene, { mobiliario: true });
  mob.scene.traverse((o) => { if (o.isMesh) mallasMobiliario.add(o); });
  grupos.mobiliario = mob.scene; grupos.mobiliario.name = 'mobiliario';
  scene.add(grupos.mobiliario);
  estado.mobiliario = { visibles, descartadas: quitar.length, personasQuitadas: interior.personas };

  if (ent) {
    ent.scene.updateMatrixWorld(true);
    ent.scene.traverse((o) => {
      if (!o.isMesh) return;
      sanearNormales(o.geometry);
      o.material = Array.isArray(o.material) ? o.material.map(materialEntorno) : materialEntorno(o.material);
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m?.userData?.uvMundo) hornearMundoConUV(o);
      o.castShadow = !ES_VIDRIO.test(m?.name || '');
      o.receiveShadow = true;
      mallasEntorno.push(o);
      conjuntoEntorno.add(o);
    });
    grupos.entorno = ent.scene; grupos.entorno.name = 'entorno';
    scene.add(grupos.entorno);
  }

  /* Pilares: el modelo los trae en hormigón visto, pero dentro de la
     vivienda van enlucidos y pintados: pintura interior, como los muros. */
  const pintura = materiales.get('APOLO V6 | Pintura interior blanca mate');
  if (pintura) for (const o of mallasEdificio) if (/^pilar__/.test(o.name)) o.material = pintura;

  /* Cielo: la foto HDR del mediodía del visor, SOLO de fondo (lo que se ve
     por las ventanas). La IBL es neutra a propósito: un degradado acromático
     (cenit 1,0 → horizonte 0,8 → nadir 0,5). Con el HDR como IBL cada muro
     cogía el tinte de su trozo de cielo (el que mira al norte salía azul). */
  cielo.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = cielo;
  const W = 64, H = 32, gris = new Float32Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const y = Math.sin(((j + 0.5) / H - 0.5) * Math.PI);    // fila 0 = abajo (flipY false)
    const l = y >= 0 ? 0.8 + 0.2 * y : 0.8 + 0.3 * y;
    for (let i = 0; i < W; i++) gris.set([l, l, l, 1], (j * W + i) * 4);
  }
  const neutro = new THREE.DataTexture(gris, W, H, THREE.RGBAFormat, THREE.FloatType);
  neutro.mapping = THREE.EquirectangularReflectionMapping;
  neutro.colorSpace = THREE.LinearSRGBColorSpace;
  neutro.magFilter = neutro.minFilter = THREE.LinearFilter;
  neutro.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(neutro).texture;
  pmrem.dispose();
  scene.fog = null;
  renderer.toneMapping = THREE.NeutralToneMapping;
  luzInterior({});
  interior.equirect = crearEquirect({ renderer, scene, canvas });
  estado.tiempos.preparar = ms(t0);
}

/* Sol por elevación y rumbo de brújula; `norte` = giro horario del norte
   real respecto al −z del modelo (PRODUCCION_IMAGENES §2: 12,55°; tarde de
   octubre hacia las 17:15 = 241° / 28°). Con el entorno puesto, el edificio
   vecino del oeste lo tapa a esa hora: no entra sol (es la geometría real).
   `relleno`: luz direccional SIN sombra (atraviesa el forjado) que solo
   sirve para que cada paño de muro tenga un tono distinto según hacia dónde
   mira; sin ella los muros blancos se funden entre sí. */
function luzInterior({ elev = 28, brujula = 241, norte = 12.55, sol = 2.6, ibl = 0.95, fondo = 1.0, exposicion = 1.0, color = 0xfff0dc,
  relleno = 0.55, rellenoRumbo = 215, rellenoElev = 40 }) {
  if (!interior.relleno) {
    interior.relleno = new THREE.DirectionalLight(0xffffff, relleno);
    interior.relleno.name = 'relleno_interior';
    interior.relleno.castShadow = false;
    scene.add(interior.relleno, interior.relleno.target);
  }
  {
    const b = THREE.MathUtils.degToRad(rellenoRumbo), e = THREE.MathUtils.degToRad(rellenoElev);
    interior.relleno.intensity = relleno;
    interior.relleno.position.set(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)).multiplyScalar(100);
    interior.relleno.target.position.set(0, 0, 0);
    interior.relleno.updateMatrixWorld(true); interior.relleno.target.updateMatrixWorld(true);
  }
  if (!interior.sol) {
    const s = new THREE.DirectionalLight(color, sol);
    s.name = 'sol_interior';
    s.castShadow = true;
    s.shadow.mapSize.set(4096, 4096);
    Object.assign(s.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 320 });
    s.shadow.camera.updateProjectionMatrix();
    s.shadow.bias = -0.0002;
    s.shadow.normalBias = 0.025;
    scene.add(s, s.target);
    interior.sol = s;
  }
  const b = THREE.MathUtils.degToRad(brujula + norte), e = THREE.MathUtils.degToRad(elev);
  interior.dirSol.set(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e));
  interior.sol.color.set(color);
  interior.sol.intensity = sol;
  scene.environmentIntensity = ibl;
  scene.backgroundIntensity = fondo;
  renderer.toneMappingExposure = exposicion;
  interior.luz = { elev, brujula, norte, sol, ibl, fondo, exposicion, rumboModelo: brujula + norte, direccion: interior.dirSol.toArray().map((x) => +x.toFixed(4)), relleno, rellenoRumbo, rellenoElev };
  if (interior.camara) apuntarSol(interior.camara.vector);
  return interior.luz;
}
function apuntarSol(centro) {
  const s = interior.sol;
  s.target.position.copy(centro);
  s.position.copy(centro).addScaledVector(interior.dirSol, 150);
  s.target.updateMatrixWorld(true);
  s.updateMatrixWorld(true);
  s.shadow.camera.updateProjectionMatrix();
}

/* Clase de segmentación de cada malla (ver CLASES en equirect.js). */
function clasificarInterior(o) {
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  const nm = m?.name || '';
  if (conjuntoEntorno.has(o)) return { clase: 'exterior' };
  if (mallasMobiliario.has(o)) {
    if (/^puerta__/.test(o.name)) return { clase: 'puerta' };
    if (/sanitarios|^Mueble_blanco_satinado|^Junta_mueble_blanco|^Banda_retroiluminada|^Espejo_plata|mampara/i.test(nm)) return { clase: 'sanitarios' };
    if (/^V4_|^Casco_blanco_roto|^Frente_blanco_roto_mate|^Junta_y_zocalo|^Tirador_metal|^Lavadora/.test(nm)) return { clase: 'mueble_fijo' };
    return { clase: 'mobiliario' };
  }
  if (m === vidrio || /^vidrio__/.test(o.name)) return { clase: 'vidrio' };
  if (/^carpinteria__/.test(o.name) || /Aluminio/i.test(nm)) return { clase: 'carpinteria' };
  if (/Rodapie/i.test(nm)) return { clase: 'muro' };
  return { clase: 'muro', porOrientacion: true };
}

function dentroDe(poligono, x, z) {
  let r = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, zi] = poligono[i], [xj, zj] = poligono[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r;
  }
  return r;
}
function distanciaABorde(poligono, x, z) {
  let d = Infinity;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [ax, az] = poligono[j], [bx, bz] = poligono[i];
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return d;
}

/* Primer impacto de un rayo vertical, con lo que toca. */
function rayoVertical(x, y, z, sentido, filtro) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, sentido, 0), 0, 6);
  const objetos = mallasEdificio.filter((o) => filtro(o) && o.visible);
  const hit = ray.intersectObjects(objetos, false)[0];
  if (!hit) return null;
  const c = clasificarInterior(hit.object);
  return { y: +hit.point.y.toFixed(4), distancia: +hit.distance.toFixed(4), malla: hit.object.name, material: (Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material).name, clase: c.clase };
}

/* Punto 360 de una estancia: el (x, y) en píxeles de vivienda-<id>.json →
   mundo con su transformación (px = a·x + c, py = b·z + d), a `altura` m
   sobre el suelo terminado (el primer impacto hacia abajo en la envolvente,
   es decir, el vinílico; se informa también de lo que haya encima, p. ej.
   una alfombra). `desplazamiento` [dx, dz] en metros por si hay que moverlo. */
function camaraInterior({ estancia = 'Salón - comedor', altura = 1.6, desplazamiento = [0, 0], posicion = null } = {}) {
  const f = interior.ficha, T = f.transformacion;
  const e = f.estancias.find((s) => s.nombre === estancia);
  if (!e) throw new Error(`estancia "${estancia}" no está en vivienda-${VIVIENDA}.json`);
  const conPoligono = e.poligono ? e : f.estancias.find((s) => s.poligono && s.estanciaFicha && s.estanciaFicha === e.estanciaFicha);
  const aMundo = ([px, py]) => [(px - T.c) / T.a, (py - T.d) / T.b];
  const poli = conPoligono ? conPoligono.poligono.map(aMundo) : null;
  let [x, z] = aMundo([e.x, e.y]);
  x += desplazamiento[0]; z += desplazamiento[1];
  if (posicion) [x, , z] = posicion;
  const v = interior.vivienda;
  const sueloEnv = rayoVertical(x, v.y0 + 1.0, z, -1, (o) => !mallasMobiliario.has(o) && !conjuntoEntorno.has(o) && o.material !== vidrio);
  const sueloTodo = rayoVertical(x, v.y0 + 1.0, z, -1, (o) => !conjuntoEntorno.has(o));
  const techo = rayoVertical(x, v.y0 + 1.0, z, 1, (o) => !conjuntoEntorno.has(o));
  const suelo = sueloEnv ? sueloEnv.y : v.y0;
  const y = posicion ? posicion[1] : suelo + altura;
  const vector = new THREE.Vector3(x, y, z);
  interior.camara = {
    vivienda: VIVIENDA, estancia, poligonoEstancia: conPoligono?.nombre ?? null,
    puntoPx: [e.x, e.y], desplazamiento, posicion: [x, y, z].map((n) => +n.toFixed(4)), vector,
    alturaSobreSuelo: +(y - suelo).toFixed(4), sueloTerminado: suelo, sueloVivienda: v.y0,
    impactoAbajoEnvolvente: sueloEnv, impactoAbajo: sueloTodo, impactoArriba: techo,
    alturaLibre: techo && sueloEnv ? +(techo.y - sueloEnv.y).toFixed(4) : null,
    dentroDeEstancia: poli ? dentroDe(poli, x, z) : null,
    distanciaAlBordeEstancia: poli ? +distanciaABorde(poli, x, z).toFixed(3) : null,
    dentroDeVivienda: dentroDe(v.poligono, x, z),
  };
  apuntarSol(vector);
  const { vector: _, ...json } = interior.camara;
  return json;
}

/* Puertas del mobiliario de la vivienda (para los enlaces del 360 y para
   orientar las vistas de comprobación). Los vértices de las piezas lacadas
   se agrupan por proximidad en planta (rejilla de 10 cm): salen los dos
   marcos de cada hueco por separado (la hoja cerrada solo tiene vértices en
   sus esquinas), así que se emparejan marcos alineados a 0,6–1,0 m y el
   centro del hueco es el punto medio. Devuelve { piezas, vanos }. */
function puertasInterior({ margen = 0.4 } = {}) {
  const v = interior.vivienda;
  const xs = v.poligono.map((p) => p[0]), zs = v.poligono.map((p) => p[1]);
  const caja = { x0: Math.min(...xs) - margen, x1: Math.max(...xs) + margen, z0: Math.min(...zs) - margen, z1: Math.max(...zs) + margen };
  const a = new THREE.Vector3();
  const pts = [];
  for (const o of mallasMobiliario) {
    if (!/^puerta__/.test(o.name) || !/lacado/i.test((Array.isArray(o.material) ? o.material[0] : o.material).name)) continue;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (a.x >= caja.x0 && a.x <= caja.x1 && a.z >= caja.z0 && a.z <= caja.z1 && a.y >= v.y0 - 0.1 && a.y <= v.y0 + 2.6) pts.push([a.x, a.y, a.z]);
    }
  }
  /* Agrupa los vértices en hojas por proximidad en planta (rejilla de 10 cm). */
  const celda = new Map();
  for (const p of pts) {
    const k = `${Math.floor(p[0] / 0.1)}|${Math.floor(p[2] / 0.1)}`;
    if (!celda.has(k)) celda.set(k, []);
    celda.get(k).push(p);
  }
  const visto = new Set(), grupos = [];
  for (const k of celda.keys()) {
    if (visto.has(k)) continue;
    const pila = [k], g = [];
    visto.add(k);
    while (pila.length) {
      const c = pila.pop();
      g.push(...celda.get(c));
      const [i, j] = c.split('|').map(Number);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const n = `${i + di}|${j + dj}`;
        if (celda.has(n) && !visto.has(n)) { visto.add(n); pila.push(n); }
      }
    }
    const xs2 = g.map((p) => p[0]), ys2 = g.map((p) => p[1]), zs2 = g.map((p) => p[2]);
    const r = (n) => +n.toFixed(3);
    grupos.push({ centro: [r((Math.min(...xs2) + Math.max(...xs2)) / 2), r((Math.min(...ys2) + Math.max(...ys2)) / 2), r((Math.min(...zs2) + Math.max(...zs2)) / 2)], caja: [Math.min(...xs2), Math.max(...xs2), Math.min(...ys2), Math.max(...ys2), Math.min(...zs2), Math.max(...zs2)].map(r), vertices: g.length });
  }
  const piezas = grupos.filter((g) => g.caja[3] - g.caja[2] > 1.5);
  const vanos = [], usadas = new Set();
  const r3 = (n) => +n.toFixed(3);
  for (let i = 0; i < piezas.length; i++) {
    for (let j = i + 1; j < piezas.length; j++) {
      if (usadas.has(i) || usadas.has(j)) continue;
      const a = piezas[i].centro, b = piezas[j].centro;
      const dx = Math.abs(a[0] - b[0]), dz = Math.abs(a[2] - b[2]);
      const enX = dz < 0.06 && dx > 0.6 && dx < 1.0, enZ = dx < 0.06 && dz > 0.6 && dz < 1.0;
      if (!enX && !enZ) continue;
      usadas.add(i); usadas.add(j);
      vanos.push({ centro: [r3((a[0] + b[0]) / 2), r3(Math.min(piezas[i].caja[2], piezas[j].caja[2])), r3((a[2] + b[2]) / 2)], muro: enX ? 'paralelo a x' : 'paralelo a z', luz: r3(enX ? dx : dz), alto: r3(Math.max(piezas[i].caja[3], piezas[j].caja[3]) - Math.min(piezas[i].caja[2], piezas[j].caja[2])), piezas: [i, j] });
    }
  }
  /* Piezas sin pareja con muchos vértices (la puerta de entrada, con su
     herraje, sale de una pieza): también son huecos. */
  piezas.forEach((g, i) => { if (!usadas.has(i) && g.vertices > 200) vanos.push({ centro: [g.centro[0], g.caja[2], g.centro[2]], muro: null, luz: null, alto: r3(g.caja[3] - g.caja[2]), piezas: [i] }); });
  return { piezas, vanos };
}

function panoramica360(tipo, { cara = 2048, ancho = 4096, rumbo = 0, muestras = 3, franja = 0 } = {}) {
  if (!interior.camara) throw new Error('falta camaraInterior()');
  const t0 = performance.now();
  const r = interior.equirect.pase(tipo, interior.camara.vector, { cara, ancho, rumbo, muestras, franja, clasificar: clasificarInterior });
  estado.tiempos[`360-${tipo}`] = ms(t0);
  return r;
}
function vistaPlana360(tipo, opciones = {}) {
  if (!interior.camara) throw new Error('falta camaraInterior()');
  return interior.equirect.vistaPlana(tipo, interior.camara.vector, { ...opciones, clasificar: clasificarInterior });
}

/* ── Arranque ── */
window.captura = {
  estado, info,
  tamano, camaraPerspectiva, camaraCenital, describirCamara, proyectar, setSol,
  renderizar, mascaraPlantas, mascaraEdificios, mascaraViviendas, seccion, mobiliarioEn,
  /* interior360 */
  camaraInterior, luzInterior, puertasInterior, panoramica360, vistaPlana360, CLASES,
  get interior() { const { vector, ...c } = interior.camara || {}; return { camara: interior.camara ? c : null, luz: interior.luz, personasQuitadas: interior.personas }; },
  /* Fondo liso: hex sRGB o [r, g, b] lineales (pasa por el tono y el grado,
     así que el color final se mide en la imagen; ver procesar.py). */
  setFondo(valor) { scene.background = Array.isArray(valor) ? new THREE.Color().setRGB(...valor, THREE.LinearSRGBColorSpace) : new THREE.Color(valor); },
  setAlcanceSombras: (m) => luz.setAlcanceSombras(m),
  setOclusion: (p) => post.setOclusion(p),
  setReflejos(activo) { post.ssrActivo = !!activo; },
  modulos: { THREE, ctx, luz, post, scene, camara },
};

(async () => {
  try {
    const t0 = performance.now();
    estado.etapa = 'luz';
    if (luz) await luz.listo;
    estado.etapa = 'modelos';
    if (MODO === 'exterior') await cargarExterior();
    else if (MODO === 'planta') await cargarPlanta();
    else await cargarInterior();
    if (vidrio && post) post.setReflectantes?.(mallasEdificio.filter((o) => o.material === vidrio));
    if (MODO === 'planta') {
      post.setOclusion('interior');
      luz.setRealcePlanta(true, { duracion: 0 });
    }
    estado.etapa = 'compilar';
    renderer.compile(scene, camara);
    if (!INTERIOR) avanzar(1);
    estado.tiempos.total = ms(t0);
    estado.mallas = { edificio: mallasEdificio.length, entorno: mallasEntorno.length };
    estado.etapa = 'listo';
    window.__listo = true;
  } catch (e) {
    console.error(e);
    estado.etapa = 'error';
    estado.error = String(e && e.stack || e);
    window.__listo = true;
  }
})();
