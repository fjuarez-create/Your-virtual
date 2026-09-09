/* ═══════════════════════════════════════════════════════════════════════════
   main.js (visor) — Orquestación de los módulos y API pública `window.apolo`.

   Crea el ctx (escena.js), la luz, el post, el trazador, el edificio activo
   de app/promotions.js (modelo de SketchUp de assets/serenea/), los cortes y
   la cámara; carga el entorno y expone en `window.apolo` lo que usa
   new/js/shell.js. Aquí no hay nada de render propio: el bucle solo llama a
   los módulos en el orden del contrato.

   Decisiones donde el contrato deja hueco (documentadas aquí):

   · Carga: primero entorno.glb + apolo_envolvente.glb (primera imagen);
     después, con el evento 'carga' (`secundaria: true`), el mobiliario y las
     cuatro variantes cortadas por edificio.cargarSecundarios, que main
     registra en cortes.js según llegan. Los cielos de los otros momentos se
     hornean 2,5 s después de la primera imagen.
   · Entorno (assets/serenea/entorno.glb, 1.442 mallas sin nombre): se
     fusionan por material en unas 35 mallas Float32 en coordenadas de mundo
     (fusionarEntorno): 1.442 llamadas de dibujo por cada una de las cinco
     pasadas que lo dibujan (tres cascadas de sombra, G-buffer y color) eran
     demasiadas para nada. Los materiales son los del GLB con dos retoques:
     sin alphaTest (las texturas son opacas) y sin la metalicidad 0,5 con que
     SketchUp exporta lo que no tiene material PBR (césped y asfalto
     metálicos). El mar lleva rugosidad baja para reflejar el cielo; el
     vidrio de los vecinos, el mismo vidrio físico del edificio. La
     conversión a Float32 sanea de paso las normales nulas o no finitas
     (una sola produce un píxel NaN que el bloom extiende a todo el
     fotograma: pantalla transparente, ya sufrido con entorno_topo.glb). Con
     este entorno no hacía falta quitar triángulos degenerados (probado).
   · Niebla y far: el terreno llega a 5 km, así que la cámara ve hasta 9 km y
     la niebla de luz.js (que nace con 750-2100 m) se estira a 1.400-5.200 m
     para que el borde del terreno se funda con el cielo en vez de cortarse.
     El cielo nocturno de luz.js (estrellas a 3.400 m, luna a 3.000 m) se
     escala ×2,4 para que quede detrás del terreno lejano.
   · Sombras: el CSM reparte sus cascadas hasta maxFar, y un valor fijo o no
     llega al edificio desde 'conjunto' o resulta grueso dentro de una
     vivienda. Cada fotograma se pide a luz.setAlcanceSombras la distancia
     cámara-edificio + 250 m (redondeada a 50 m, entre 300 y 1.200) para que
     las cascadas cubran Apolo ± 150 m desde cualquier encuadre.
   · Encuadres (data/serenea_modelo.json vía edificio.caja), medidos con
     capturas: 'conjunto' = caja de Apolo ampliada a 600 m de lado, desde el
     suroeste (azimut −60°) y elevación 16°: con 22° el horizonte quedaba en
     el borde superior sin cielo, y el mar está al este (x ≥ 580 m, cota
     −71), así que hay que mirar hacia allí. 'edificio' = caja de Apolo,
     elevación 24°, azimut 55° (desde el sureste): Apolo tiene pegado al
     sur otro volumen de SERENEA tan alto como él (z 40…76) que desde el sur
     franco tapa la fachada; desde el sureste se ve entera la fachada larga
     sur con sus ventanas y el testero este. 'planta' = caja de Apolo hasta
     la cota media de corte de esa planta, 42° y azimut 12°: con el eje largo
     casi horizontal en pantalla la planta llena el ancho (con 55° ocupaba
     menos de la mitad del cuadro).
     'conjunto' y 'edificio' devuelven el edificio completo.
   · Realce de hover y selección (revisado en el control de calidad): se
     dibuja SIEMPRE la envolvente translúcida de edificio.pintar y, además,
     se tiñe el emisivo del vidrio de la vivienda con el color de su estado.
     La envolvente solo existe en el raster, así que con hover o con una
     vivienda enfocada (bokeh, también raster) el trazador no arranca: ver
     `quieta` en el bucle. Tampoco arranca mientras cortes.provisional (el
     recorte por planos a la espera de la variante precortada: el trazador
     no entiende de planos y vería el edificio entero).
   · Enfoque de vivienda: elevación 36°, azimut 22° si la vivienda está en
     la mitad sur del edificio (fachada principal) y 158° si está en la norte.
   · Picking: solo con ratón, sobre edificio.pickables sin filtrar por
     `visible`, saltando las viviendas de otras plantas; una vendida tapa el
     rayo (inerte). Un clic sin arrastre (< 6 px) selecciona.
   · Estado de demostración: si availability.json marca menos del 20 % de
     vendidas, cada tercera vivienda por orden de id (empezando por la
     segunda) pasa a vendida; las reservadas del fichero se conservan.
   · Trazador: recibe un objeto luz envuelto con `equirectSinSol` como
     entorno y una intensidad de entorno calibrada por momento (IBL_TRAZADO).
   · Reposo: camara.reposoTras(120) solo emite; aquí se vuela a 'conjunto'
     y se enciende la órbita al llegar.
   · post.setMomento durante el fundido de luz se llama con bloom y umbral
     interpolados pero SIN exposición: luz.js escribe la exposición.
   · Pixel ratio: limitado a 1,5 (1,25 en 'media').
   · Extras fuera del contrato, para el shell y las pruebas:
     apolo.recentrar(), apolo.vista, apolo.cargado, evento 'trazado',
     apolo.modulos y apolo.tiempos (ms de carga de cada fichero).
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crearEscena } from 'app/visor/escena.js';
import { crearLuz, MOMENTOS } from 'app/visor/luz.js';
import { crearPost } from 'app/visor/post.js';
import { crearTrazador } from 'app/visor/trazador.js';
import { cargarEdificio, crearVidrioFisico, EMISIVO_VENTANA, INTENSIDAD_VENTANA } from 'app/visor/edificio.js';
import { crearCortes } from 'app/visor/cortes.js';
import { crearCamara } from 'app/visor/camara.js';
import { ACTIVE_BUILDING } from 'app/promotions.js';
import { FLOOR_DEFS } from 'app/layout.js';
import { ESTADO_COLORS } from 'app/building.js';

/* ── Constantes ── */
const PLANTAS = FLOOR_DEFS.filter((f) => f.key !== 'cubierta');
const CLAVES_PLANTA = new Set(['all', ...PLANTAS.map((f) => f.key)]);
const NIVEL_DE = new Map(PLANTAS.map((f, i) => [f.key, i]));
const RUTA_ENTORNO = 'assets/serenea/entorno.glb';
const AZIMUT = { conjunto: -60, edificio: 55, planta: 12 };
const ELEVACION = { conjunto: 16, edificio: 24, planta: 42 };
const MARGEN = { conjunto: 1.05, edificio: 1.1, planta: 1.04 };
const LADO_CONJUNTO = 600;        // m de lado del encuadre 'conjunto'
const REPOSO_S = 120;
const CAMARA_FAR = 9000;          // el entorno llega a 5 km
const NIEBLA = { near: 1400, far: 5200 };
const ESCALA_CIELO_NOCHE = 2.4;   // estrellas y luna detrás del terreno lejano
const SOMBRAS = { margen: 250, min: 300, max: 1200, paso: 50 };
const DPR_MAX = { alta: 1.5, media: 1.25 };
const IBL_TRAZADO = { dia: 0.5, amanecer: 0.75, atardecer: 0.8, noche: 1.6 };
const REALCE = { hover: 0.9, seleccion: 1.4 }; // intensidad emisiva del vidrio teñido
const ELEVACION_VIVIENDA = 36;    // ver cabecera: la vivienda centrada y vista desde arriba
const AZIMUT_VIVIENDA = { sur: 22, norte: 158 };

/* ── Escena base ── */
const canvas = document.getElementById('scene');
const ctx = crearEscena(canvas);
const { renderer, scene, camera } = ctx;
camera.far = CAMARA_FAR;
camera.updateProjectionMatrix();

function aplicarDPR(tier) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_MAX[tier] || DPR_MAX.alta));
}
aplicarDPR(ctx.calidad);

function redimensionar() {
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  ctx.setTamano(w, h);
}
redimensionar();
window.addEventListener('resize', redimensionar);
canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // botón derecho = desplazar

/* ── Bus público ── */
const bus = new EventTarget();
const emitir = (evento, datos) => bus.dispatchEvent(new CustomEvent(evento, { detail: datos }));

const apolo = {
  floor: 'all', momento: 'dia', selected: null, hover: null, vista: 'conjunto',
  units: [], unitsById: new Map(), estados: {}, cargado: false, tiempos: {},
  on(evento, fn) { bus.addEventListener(evento, (e) => fn(e.detail)); },
  enter() { /* compatibilidad con shell.js: no hay portada que atravesar */ },
  estadoDe: (id) => apolo.estados[id] || 'disponible',
};
window.apolo = apolo;

/* ── Módulos ── */
const luz = crearLuz(ctx);
scene.fog.near = NIEBLA.near;
scene.fog.far = NIEBLA.far;
luz.cieloNoche.scale.setScalar(ESCALA_CIELO_NOCHE);
const post = crearPost(ctx, luz);
const camara = crearCamara(ctx);
const luzTrazado = {
  get equirect() { return luz.equirectSinSol || luz.equirect; },
  get sol() { return luz.sol; },
  get envMapIntensity() { return IBL_TRAZADO[luz.momento] ?? luz.actual.ibl; },
};
const trazador = crearTrazador(ctx, luzTrazado);
trazador.setRaster((dt) => post.render(dt));

let edificio = null, cortes = null, entorno = null;
let cargando = true;
apolo.modulos = { ctx, luz, post, camara, trazador, get edificio() { return edificio; }, get cortes() { return cortes; }, get entorno() { return entorno; } };

/* ── Entorno ── */
const cargadorGLB = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
function cargarGLB(url, onProgreso) {
  return new Promise((ok, ko) => cargadorGLB.load(url, ok, (xhr) => {
    if (onProgreso && xhr.lengthComputable && xhr.total > 0) onProgreso(xhr.loaded / xhr.total);
  }, ko));
}

/* Geometría Float32 en coordenadas de mundo (las posiciones del GLB vienen
   cuantizadas a Int16 con la escala en el nodo) con las normales saneadas:
   ver cabecera. Sin índice se genera uno, porque mergeGeometries exige que
   todas lo tengan o ninguna. */
function geometriaMundo(mesh, { conUV }) {
  const g = mesh.geometry;
  const salida = new THREE.BufferGeometry();
  for (const nombre of ['position', 'normal', 'uv']) {
    if (nombre === 'uv' && !conUV) continue;
    const atr = g.getAttribute(nombre);
    const n = nombre === 'uv' ? 2 : 3;
    const cuenta = g.getAttribute('position').count;
    const datos = new Float32Array(cuenta * n);
    if (atr) {
      for (let i = 0; i < cuenta; i++) {
        datos[i * n] = atr.getX(i); datos[i * n + 1] = atr.getY(i);
        if (n === 3) datos[i * n + 2] = atr.getZ(i);
      }
    }
    salida.setAttribute(nombre, new THREE.BufferAttribute(datos, n));
  }
  const idx = g.index;
  const ind = new Uint32Array(idx ? idx.count : salida.getAttribute('position').count);
  for (let i = 0; i < ind.length; i++) ind[i] = idx ? idx.getX(i) : i;
  salida.setIndex(new THREE.BufferAttribute(ind, 1));
  salida.applyMatrix4(mesh.matrixWorld);
  if (!g.getAttribute('normal')) salida.computeVertexNormals();
  const nor = salida.getAttribute('normal');
  let nulas = 0;
  for (let i = 0; i < nor.count; i++) {
    const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i);
    if (!Number.isFinite(x + y + z) || x * x + y * y + z * z < 1e-6) { nor.setXYZ(i, 0, 1, 0); nulas++; }
  }
  salida.userData.normalesNulas = nulas;
  return salida;
}

/* Retoques a los materiales del entorno (ver cabecera). Devuelve el material
   que se usará; el vidrio se sustituye por el físico del edificio. */
function materialEntorno(m) {
  const nombre = m.name || '';
  if (/vidrio|^glass$/i.test(nombre)) {
    // el edificio se carga en paralelo: el entorno lleva su propio vidrio físico
    m.dispose();
    const vidrio = crearVidrioFisico();
    vidrio.name = `entorno_${nombre}`;
    luz.aplicarMaterial(vidrio);
    return vidrio;
  }
  m.alphaTest = 0;
  m.transparent = false;
  m.depthWrite = true;
  m.envMapIntensity = 1;
  const exportado = Math.abs(m.metalness - 0.5) < 1e-3 && Math.abs(m.roughness - 0.5) < 1e-3; // sin PBR en SketchUp
  if (nombre === 'mar_atlantico_costa') { m.roughness = 0.18; m.metalness = 0; }
  else if (nombre === 'metal') { m.roughness = 0.45; m.metalness = 0.7; }
  else if (/^ortho$|^PNOA_/.test(nombre)) { m.roughness = 1; m.metalness = 0; }
  else if (exportado) { m.roughness = 0.9; m.metalness = 0; }
  m.name = nombre;
  luz.aplicarMaterial(m);
  return m;
}

async function cargarEntorno(onProgreso) {
  const t0 = performance.now();
  const gltf = await cargarGLB(RUTA_ENTORNO, onProgreso);
  const tCarga = performance.now();
  gltf.scene.updateMatrixWorld(true);
  const grupo = new THREE.Group();
  grupo.name = 'entorno';
  const porMaterial = new Map();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!porMaterial.has(m)) porMaterial.set(m, []);
    porMaterial.get(m).push(o);
  });
  let mallas = 0, triangulos = 0, normalesNulas = 0;
  for (const [material, lista] of porMaterial) {
    const conUV = !!material.map;
    const geometrias = lista.map((o) => geometriaMundo(o, { conUV }));
    const fusionada = geometrias.length === 1 ? geometrias[0] : mergeGeometries(geometrias, false);
    if (!fusionada) { console.warn('[apolo] entorno: no se pudo fusionar', material.name); continue; }
    for (const g of geometrias) { normalesNulas += g.userData.normalesNulas || 0; if (g !== fusionada) g.dispose(); }
    fusionada.computeBoundingBox(); fusionada.computeBoundingSphere();
    const mat = materialEntorno(material);
    const mesh = new THREE.Mesh(fusionada, mat);
    mesh.name = `entorno_${material.name}`;
    const terreno = /^ortho$|^PNOA_|mar_atlantico/.test(material.name);
    mesh.castShadow = !terreno; // 330 k triángulos en tres cascadas por un relieve que no hace sombra
    mesh.receiveShadow = true;
    mesh.raycast = () => {}; // el picking va solo por las envolventes de vivienda
    grupo.add(mesh);
    mallas++;
    triangulos += fusionada.index.count / 3;
  }
  for (const o of gltf.scene.children) o.traverse((x) => x.geometry?.dispose());
  scene.add(grupo);
  scene.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(grupo);
  apolo.tiempos.entorno = { descargaMs: Math.round(tCarga - t0), fusionMs: Math.round(performance.now() - tCarga), mallas, mallasOrigen: [...porMaterial.values()].reduce((s, l) => s + l.length, 0), triangulos: Math.round(triangulos), normalesNulas };
  return { grupo, caja };
}

/* ── Estado de demostración 70/30 ── */
function estadosDemostracion(ed) {
  const ids = ed.units.map((u) => u.id).sort();
  const vendidas = ids.filter((id) => ed.estadoDe(id) === 'vendida').length;
  if (vendidas >= ids.length * 0.2) return null; // el fichero ya trae ventas reales
  const mapa = {};
  ids.forEach((id, i) => {
    mapa[id] = i % 3 === 1 ? 'vendida' : (ed.estados[id] === 'reservada' ? 'reservada' : 'disponible');
  });
  return mapa;
}

/* ── Encuadres ── */
function cajaConjunto() {
  const caja = edificio.caja.clone();
  const centro = caja.getCenter(new THREE.Vector3());
  caja.min.x = centro.x - LADO_CONJUNTO / 2; caja.max.x = centro.x + LADO_CONJUNTO / 2;
  caja.min.z = centro.z - LADO_CONJUNTO / 2; caja.max.z = centro.z + LADO_CONJUNTO / 2;
  caja.min.y = Math.min(caja.min.y, entorno ? Math.max(entorno.caja.min.y, caja.min.y - 30) : caja.min.y);
  return caja;
}
function cajaPlanta(clave) {
  const caja = edificio.caja.clone();
  const tramos = cortes?.definicion?.plantas?.[clave];
  if (tramos) caja.max.y = Math.min(caja.max.y, tramos.reduce((s, t) => s + t.y, 0) / tramos.length);
  return caja;
}
function encuadrarVista(vista, { duracion = 1.6 } = {}) {
  const cambia = apolo.vista !== vista;
  apolo.vista = vista;
  if (cambia && edificio) repintar(); // las cartelas vecinas dependen de la vista
  if (vista === 'conjunto') return camara.encuadrar(cajaConjunto(), { azimut: AZIMUT.conjunto, elevacion: ELEVACION.conjunto, margen: MARGEN.conjunto, duracion });
  if (vista === 'planta') return camara.encuadrar(cajaPlanta(apolo.floor), { azimut: AZIMUT.planta, elevacion: ELEVACION.planta, margen: MARGEN.planta, duracion });
  return camara.encuadrar(edificio.caja, { azimut: AZIMUT.edificio, elevacion: ELEVACION.edificio, margen: MARGEN.edificio, duracion });
}

/* ── Realce de viviendas (ver cabecera) ── */
const tenidas = new Set();
function restaurarVidrios(v) {
  const on = edificio.ventanas && edificio.estadoDe(v.id) !== 'vendida';
  for (const m of v.vidrios) {
    m.emissive.setHex(EMISIVO_VENTANA);
    m.emissiveIntensity = on ? INTENSIDAD_VENTANA : 0;
  }
}
function tenirVidrios(v, intensidad) {
  const col = ESTADO_COLORS[edificio.estadoDe(v.id)] || ESTADO_COLORS.disponible;
  for (const m of v.vidrios) { m.emissive.copy(col); m.emissiveIntensity = intensidad; }
  tenidas.add(v);
}
const atenuada = (id) => {
  if (apolo.floor === 'all') return false;
  const v = edificio.viviendas.get(id);
  return !v || NIVEL_DE.get(v.floorKey) !== NIVEL_DE.get(apolo.floor);
};
function repintar() {
  if (!edificio) return;
  for (const v of tenidas) restaurarVidrios(v);
  tenidas.clear();
  const hover = edificio.viviendas.get(apolo.hover);
  const sel = edificio.viviendas.get(apolo.selected);
  if (hover && hover !== sel && !atenuada(hover.id)) tenirVidrios(hover, REALCE.hover);
  if (sel && !atenuada(sel.id)) tenirVidrios(sel, REALCE.seleccion);
  edificio.pintar({ hover: hover?.id ?? null, seleccionada: sel?.id ?? null, atenuada });
  /* Con una vivienda enfocada la cámara está a 10 m: las cartelas vecinas,
     de 3,2 m, taparían media pantalla. Solo queda la suya. */
  if (apolo.vista === 'vivienda' && sel) {
    for (const v of edificio.viviendas.values()) if (v !== sel) { v.label.visible = false; v.labelR.visible = false; }
  }
  trazador.actualizarMateriales();
}

/* ── Picking ── */
const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2(-2, -2);
let ratonActivo = false;
let bajada = null;
const ndc = (cx, cy, destino) => {
  const r = canvas.getBoundingClientRect();
  return destino.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
};
/* Las viviendas de otras plantas no cuentan (las de arriba ya no existen y
   las de abajo quedan bajo la losa); la primera de la planta activa que
   cruza el rayo decide: si es vendida, tapa lo que hay detrás. */
function pickEn(p) {
  if (!edificio) return null;
  raycaster.setFromCamera(p, camera);
  for (const h of raycaster.intersectObjects(edificio.pickables, false)) {
    const id = h.object.userData.unitId;
    if (!id) continue;
    if (apolo.floor !== 'all' && edificio.viviendas.get(id)?.floorKey !== apolo.floor) continue;
    return apolo.estadoDe(id) === 'vendida' ? null : id;
  }
  return null;
}
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') { ratonActivo = false; return; }
  ratonActivo = true;
  ndc(e.clientX, e.clientY, puntero);
});
canvas.addEventListener('pointerleave', () => { ratonActivo = false; });
canvas.addEventListener('pointerdown', (e) => {
  alEntradaUsuario();
  bajada = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
});
canvas.addEventListener('pointerup', (e) => {
  if (!bajada) return;
  const movido = Math.hypot(e.clientX - bajada.x, e.clientY - bajada.y);
  bajada = null;
  if (movido > 6) return; // era un arrastre
  const id = pickEn(ndc(e.clientX, e.clientY, new THREE.Vector2()));
  if (id) apolo.enfocarVivienda(id);
  else if (apolo.selected) apolo.select(null);
});
canvas.addEventListener('wheel', alEntradaUsuario, { passive: true });
canvas.addEventListener('touchstart', alEntradaUsuario, { passive: true });

function actualizarHover() {
  if (!edificio) return;
  const id = ratonActivo ? pickEn(puntero) : null;
  if (id === apolo.hover) return;
  apolo.hover = id;
  canvas.style.cursor = id ? 'pointer' : '';
  repintar();
  emitir('hover', id);
}

/* ── Reposo ──
   `entradas` cuenta los gestos del usuario sobre el lienzo; las llamadas de
   la API (setFloor, enfocarVivienda…) solo apagan el estado de reposo. Así
   el vuelo a 'conjunto' del propio reposo, que pasa por setFloor('all'),
   no se confunde con una intervención del usuario y la órbita arranca. */
let enReposo = false;
let entradas = 0;
function salirDelReposo() { enReposo = false; }
function alEntradaUsuario() { entradas++; enReposo = false; }
ctx.on('reposo', async () => {
  if (enReposo || cargando) return;
  const antes = entradas;
  emitir('reposo');
  const llego = await apolo.irConjunto({ duracion: 2.4 });
  if (llego && entradas === antes) {
    enReposo = true; // hasta el próximo gesto: los 'reposo' periódicos no repiten el vuelo
    camara.orbitaAutomatica(true, { velocidad: 0.05 });
  }
});

/* ── Superficies que reflejan (SSR): vidrios, asfalto y mar ── */
function actualizarReflectantes() {
  const lista = [];
  scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.isMeshPhysicalMaterial && m.transparent) lista.push(o);
    else if (o.name === 'entorno_asphalt' || o.name === 'entorno_mar_atlantico_costa') lista.push(o);
  });
  post.setReflectantes(lista);
}

/* ── Alcance de las sombras según la distancia al edificio (ver cabecera) ── */
let alcanceSombras = 0;
const centroEdificio = new THREE.Vector3();
function ajustarSombras() {
  const d = camera.position.distanceTo(centroEdificio);
  const deseado = THREE.MathUtils.clamp(Math.round((d + SOMBRAS.margen) / SOMBRAS.paso) * SOMBRAS.paso, SOMBRAS.min, SOMBRAS.max);
  if (deseado === alcanceSombras) return;
  alcanceSombras = deseado;
  luz.setAlcanceSombras(deseado);
}

/* ── API pública ── */
Object.assign(apolo, {
  setFloor(clave, { encuadrar = true, duracion = 1.6 } = {}) {
    if (!CLAVES_PLANTA.has(clave)) return Promise.reject(new Error(`apolo: planta desconocida "${clave}"`));
    if (!edificio) return Promise.resolve(false);
    salirDelReposo();
    if (apolo.selected) apolo.select(null);
    post.setEnfoque(null);
    apolo.floor = clave;
    edificio.setCartelas(clave === 'all' ? null : clave);
    apolo.hover = null;
    repintar();
    emitir('planta', clave);
    materialesEnMovimientoHasta = reloj.elapsedTime + 1.8; // rampa de atenuación de cortes
    const corte = cortes.setPlanta(clave);
    if (encuadrar) encuadrarVista(clave === 'all' ? 'edificio' : 'planta', { duracion });
    return corte;
  },

  setMomento(clave, { duracion = 1.6 } = {}) {
    if (!MOMENTOS[clave]) return Promise.reject(new Error(`apolo: momento desconocido "${clave}"`));
    apolo.momento = clave;
    // las ventanas cambian al arrancar el fundido; el bajón de exposición lo tapa
    if (edificio) { edificio.setVentanas(MOMENTOS[clave].luces); repintar(); }
    return luz.setMomento(clave, { duracion });
  },

  /* `vista` se fija ANTES de setFloor: el evento 'planta' que este emite lo
     lee el shell para decidir qué botón del raíl marcar. */
  irConjunto({ duracion = 1.6 } = {}) {
    if (!edificio) return Promise.resolve(false);
    apolo.vista = 'conjunto';
    if (apolo.floor !== 'all') apolo.setFloor('all', { encuadrar: false });
    else if (apolo.selected) apolo.select(null);
    post.setEnfoque(null);
    return encuadrarVista('conjunto', { duracion });
  },

  irEdificio({ duracion = 1.6 } = {}) {
    if (!edificio) return Promise.resolve(false);
    apolo.vista = 'edificio';
    if (apolo.floor !== 'all') apolo.setFloor('all', { encuadrar: false });
    else if (apolo.selected) apolo.select(null);
    post.setEnfoque(null);
    return encuadrarVista('edificio', { duracion });
  },

  /* Vivienda disponible o reservada: cortes en su planta, vuelo hasta ella y
     profundidad de campo al llegar. Vendidas: inertes. */
  enfocarVivienda(id, { duracion = 1.4 } = {}) {
    const v = edificio?.viviendas.get(id);
    if (!v || apolo.estadoDe(id) === 'vendida') return Promise.resolve(false);
    salirDelReposo();
    if (apolo.floor !== v.floorKey) apolo.setFloor(v.floorKey, { encuadrar: false });
    apolo.vista = 'vivienda';
    apolo.select(id, { enfocar: false });
    repintar(); // select no repinta si ya estaba seleccionada: las cartelas vecinas deben irse igual
    /* Acimut según la mitad del edificio: la fachada principal mira al sur
       (+z); desde la fachada opuesta la vivienda se vería a través del
       edificio. */
    const centro = v.caja.getCenter(new THREE.Vector3());
    const azimut = centro.z >= centroEdificio.z ? AZIMUT_VIVIENDA.sur : AZIMUT_VIVIENDA.norte;
    return camara.enfocarVivienda(v.caja, { duracion, azimut, elevacion: ELEVACION_VIVIENDA }).then((llego) => {
      if (llego && apolo.selected === id) post.setEnfoque(camara.distanciaObjetivo);
      return llego;
    });
  },

  volverAPlanta({ duracion = 1.4 } = {}) {
    if (!edificio) return Promise.resolve(false);
    post.setEnfoque(null);
    if (apolo.selected) apolo.select(null);
    return encuadrarVista(apolo.floor === 'all' ? 'edificio' : 'planta', { duracion });
  },

  select(id, { enfocar = true } = {}) {
    if (!edificio) return;
    if (id != null && (!edificio.viviendas.has(id) || apolo.estadoDe(id) === 'vendida')) return;
    if (id == null) post.setEnfoque(null);
    if (apolo.selected === id) return;
    apolo.selected = id;
    repintar();
    const u = id != null ? apolo.unitsById.get(id) : null;
    emitir('seleccion', { id, unidad: u || null, estado: id != null ? apolo.estadoDe(id) : null });
    if (id != null && enfocar) apolo.enfocarVivienda(id);
  },

  recentrar({ duracion = 1.2 } = {}) {
    if (apolo.vista === 'vivienda' && apolo.selected) return apolo.enfocarVivienda(apolo.selected, { duracion });
    if (apolo.vista === 'conjunto') return apolo.irConjunto({ duracion });
    return encuadrarVista(apolo.floor === 'all' ? 'edificio' : 'planta', { duracion });
  },

  setCalidad(tier) {
    ctx.setCalidad(tier);
    aplicarDPR(ctx.calidad);
    // el post lee el pixel ratio al redimensionar: forzar el paso
    ctx.setTamano(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    return ctx.calidad;
  },
});

/* ── Eventos de los módulos ── */
ctx.on('momento', (clave) => {
  apolo.momento = clave;
  emitir('momento', clave);
  trazador.actualizarMateriales(); // las ventanas cambiaron de emisivo
});
ctx.on('geometria', () => actualizarReflectantes());

/* ── Bucle ── */
const reloj = new THREE.Clock();
let materialesEnMovimientoHasta = 0;   // hasta cuándo cortes sigue atenuando materiales
let materialesPendientes = false;
const ultimoTrazado = { activo: null, progreso: -1, muestras: -1, pintando: null };
function fotograma() {
  requestAnimationFrame(fotograma);
  const dt = Math.min(reloj.getDelta(), 0.1);
  const t = reloj.elapsedTime;
  camara.update(dt);
  if (edificio) ajustarSombras();
  luz.update(dt);
  cortes?.update(dt);
  actualizarHover();

  post.setVelocidadCamara(camara.velocidad);
  if (luz.enTransicion) post.setMomento({ bloom: luz.actual.bloom, umbral: luz.actual.umbral });
  if (apolo.vista === 'vivienda' && post.enfoque != null) post.setEnfoque(camara.distanciaObjetivo);

  /* La atenuación de plantas de cortes cambia los materiales durante ~1,5 s
     tras setPlanta; cuando termina, el trazador vuelve a subirlos una vez. */
  if (t < materialesEnMovimientoHasta) materialesPendientes = true;
  else if (materialesPendientes) { materialesPendientes = false; trazador.actualizarMateriales(); }

  /* Hover y vivienda enfocada se realzan con la envolvente y el bokeh, que
     solo existen en el raster: ahí no se cede el fotograma al trazador. */
  const quieta = !cargando && camara.quieta && !cortes?.enTransicion && !cortes?.provisional && !luz.enTransicion
    && t >= materialesEnMovimientoHasta && apolo.hover == null && apolo.vista !== 'vivienda';
  const pintado = trazador.update(dt, { quieta });
  if (!pintado) post.render(dt);
  informarTrazado(pintado);
}
function informarTrazado(pintando) {
  const progreso = Math.round(trazador.progreso * 100) / 100;
  const muestras = Math.floor(trazador.muestras);
  if (pintando === ultimoTrazado.pintando && progreso === ultimoTrazado.progreso
    && muestras === ultimoTrazado.muestras && trazador.activo === ultimoTrazado.activo) return;
  Object.assign(ultimoTrazado, { pintando, progreso, muestras, activo: trazador.activo });
  emitir('trazado', { ...ultimoTrazado });
}

/* ── Carga ── */
const progreso = { luz: 0, edificio: 0, entorno: 0 };
const PESOS = { luz: 0.1, edificio: 0.45, entorno: 0.45 };
function avanzar(etapa, valor) {
  progreso[etapa] = Math.max(progreso[etapa], valor);
  const total = Object.keys(PESOS).reduce((s, k) => s + PESOS[k] * progreso[k], 0);
  emitir('carga', { progreso: Math.min(1, total), etapa: valor >= 1 ? etapa : `${etapa}…` });
}

async function arrancar() {
  const t0 = performance.now();
  emitir('carga', { progreso: 0, etapa: 'inicio' });
  fotograma(); // el cielo ya se ve mientras llega el edificio
  await luz.listo;
  avanzar('luz', 1);

  const [ed, ent] = await Promise.all([
    cargarEdificio(ctx, ACTIVE_BUILDING, { luz, onProgreso: (f) => avanzar('edificio', f) }).then((e) => { avanzar('edificio', 1); return e; }),
    cargarEntorno((f) => avanzar('entorno', f)).then((e) => { avanzar('entorno', 1); return e; })
      .catch((err) => { console.warn('[apolo] sin entorno:', err); avanzar('entorno', 1); return null; }),
  ]);
  edificio = ed;
  entorno = ent;
  edificio.caja.getCenter(centroEdificio);
  apolo.units = edificio.units;
  apolo.unitsById = edificio.unitsById;
  apolo.estados = edificio.estados;
  const demo = estadosDemostracion(edificio);
  if (demo) edificio.setEstados(demo);
  edificio.setVentanas(MOMENTOS[apolo.momento].luces);

  /* Modelo de SketchUp: sin CSG ni tapas (superficies abiertas), variantes
     precortadas cuando lleguen, caras traseras oscuras y atenuación por cota. */
  cortes = crearCortes(ctx, edificio, {
    luz, definicion: edificio.definicionCortes,
    csg: false, tapasCSG: false, tapasStencil: false, carasOscuras: true, atenuacionPorCota: true,
  });
  cortes.preparar(); // los hooks de material se añaden antes del primer fotograma con edificio
  actualizarReflectantes();
  repintar();

  // la cámara toma el objetivo antes del primer fotograma con edificio
  encuadrarVista('conjunto', { duracion: 0 });
  ajustarSombras();
  camara.reposoTras(REPOSO_S);
  cargando = false;
  apolo.cargado = true;
  apolo.tiempos.primeraImagenMs = Math.round(performance.now() - t0);
  apolo.tiempos.vidrio = edificio.vidrio;
  emitir('carga', { progreso: 1, etapa: 'listo' });
  emitir('planta', apolo.floor);
  emitir('momento', apolo.momento);

  /* Segundo plano tras la primera imagen: mobiliario y variantes cortadas
     (se registran en cortes según llegan), y los otros tres cielos. */
  edificio.cargarSecundarios({
    onProgreso: (f, etapa) => emitir('carga', { progreso: f, etapa, secundaria: true }),
    alMobiliario: (objeto) => { cortes.registrarMobiliario(objeto); ctx.emit('geometria', { mobiliario: true }); },
    alVariante: (clave, objeto) => cortes.registrarVariante(clave, objeto),
  }).then((tiempos) => {
    apolo.tiempos.secundarios = tiempos;
    emitir('carga', { progreso: 1, etapa: 'secundarios', secundaria: true });
  }).catch((e) => console.warn('[apolo] carga secundaria:', e));
  setTimeout(async () => {
    try { await luz.precalentar(); } catch (e) { console.warn('[apolo] precalentar luz:', e); }
  }, 2500);
}

arrancar().catch((err) => {
  console.error('[apolo] no se pudo arrancar el visor:', err);
  emitir('carga', { progreso: 1, etapa: 'error', error: String(err?.message || err) });
});
