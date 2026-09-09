/* ═══════════════════════════════════════════════════════════════════════════
   main.js (visor) — Orquestación de los módulos y API pública `window.apolo`.

   Crea el ctx (escena.js), la luz, el post, el trazador, el edificio activo
   de app/promotions.js, los cortes y la cámara; carga el entorno topográfico
   y expone en `window.apolo` lo que usa new/js/shell.js. Aquí no hay nada de
   render propio: el bucle solo llama a los módulos en el orden del contrato.

   Decisiones donde el contrato deja hueco (documentadas aquí):

   · Entorno: mientras no llegue el modelo de SketchUp se carga
     `assets/entorno_topo.glb` entero (terreno, calles, vecinos, arbolado)
     con los materiales de las demos y `luz.aplicarMaterial`. Cota −0,8 como
     en app/topo.js (la cota 0 del GLB es la parcela). Sus mallas se
     reconstruyen sin triángulos degenerados y con normales calculadas en
     CPU (ver limpiarGeometria): 383 triángulos de área cero en acera y
     asfalto producían píxeles NaN que el bloom extendía a toda la imagen
     (fotograma entero transparente). Debajo va un disco de terreno de 3 km
     para que el conjunto no flote sobre el cielo.
   · Definición de cortes: `data/cortes.json` ya está en coordenadas del
     SketchUp, así que para apolo_levels.glb la definición se deriva aquí de
     SECTIONS (cota de forjado + offset 1,2, misma receta que el JSON de la
     demo de cortes). Cuando el visor cargue assets/serenea/, bastará con
     pasar `url: 'data/cortes.json'`.
   · Encuadres: azimut 34,8° para todos (el de la cámara (64,48,92) → (0,5,0)
     del visor actual, medido en planta); 'conjunto' con elevación 35° sobre
     la caja del entorno (recortada a ±260 m del edificio para que el
     terreno lejano no aleje la cámara), 'edificio' con 28° sobre
     edificio.caja, planta con 42° sobre la caja del edificio recortada a la
     cota de corte más alta de esa planta. Las vistas 'conjunto' y
     'edificio' devuelven el edificio completo ('all'): ver un edificio
     seccionado desde 300 m no dice nada.
   · Realce de hover y selección: se tiñe el EMISIVO del vidrio de la
     vivienda con el color de su estado (verde/ámbar) en vez de dibujar la
     envolvente translúcida. Razón: la envolvente solo existe en el raster,
     y en reposo pinta el trazador, así que el realce desaparecería en cuanto
     el ratón se parase; el emisivo sí llega al trazado con
     `trazador.actualizarMateriales()` (milisegundos, sin BVH). Las viviendas
     sin vidrio asignado (áticos del este, baja del oeste) caen a la
     envolvente de edificio.pintar, que al menos se ve en raster.
   · Picking: solo con ratón (pointerType 'mouse'), sobre edificio.pickables
     sin filtrar por `visible` (las envolventes son invisibles en reposo y
     el Raycaster no lo mira), descartando vendidas y, con una planta activa,
     las viviendas de otras plantas (las de arriba ya no existen y las de
     abajo quedan bajo la losa). Un clic sin arrastre (< 6 px) selecciona.
   · Estado de demostración: si availability.json marca menos del 20 % de
     vendidas, cada tercera vivienda por orden de id (empezando por la
     segunda) pasa a vendida; las reservadas del fichero se conservan.
   · Trazador: recibe un objeto luz envuelto con `equirectSinSol` como
     entorno (evita contar dos veces el sol horneado; con el HDR de día no
     hay variante y se usa la foto) y una intensidad de entorno calibrada
     por momento (IBL_TRAZADO), porque el raster suma hemisférica y relleno
     que el trazado no tiene. Los valores de amanecer/atardecer/noche son
     una estimación a partir del 0,5 medido de día: afinar en GPU real.
   · Reposo: camara.reposoTras(120) solo emite; aquí se vuela a 'conjunto'
     y se enciende la órbita al llegar. La órbita es movimiento, así que el
     trazador no corre en reposo de órbita (sí cuando la cámara se para).
   · post.setMomento durante el fundido de luz se llama con bloom y umbral
     interpolados pero SIN exposición: luz.js escribe la exposición cada
     fotograma (con el bajón del fundido) y pisarla desde aquí la rompería.
   · Pixel ratio: escena.js permite DPR 2 en 'alta'; toda la cadena de post
     se cuadruplicaría en pantallas HiDPI, así que se limita a 1,5 (1,25 en
     'media').
   · Extras fuera del contrato, para el shell y las pruebas:
     apolo.recentrar(), apolo.vista ('conjunto'|'edificio'|'planta'|
     'vivienda'), apolo.cargado, evento 'trazado' ({ activo, progreso,
     muestras, pintando }) y apolo.modulos (los módulos, para depurar).
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { crearEscena } from 'app/visor/escena.js';
import { crearLuz, MOMENTOS } from 'app/visor/luz.js';
import { crearPost } from 'app/visor/post.js';
import { crearTrazador } from 'app/visor/trazador.js';
import { cargarEdificio, EMISIVO_VENTANA, INTENSIDAD_VENTANA } from 'app/visor/edificio.js';
import { crearCortes } from 'app/visor/cortes.js';
import { crearCamara } from 'app/visor/camara.js';
import { ACTIVE_BUILDING } from 'app/promotions.js';
import { SECTIONS, FLOOR_DEFS } from 'app/layout.js';
import { ESTADO_COLORS } from 'app/building.js';

/* ── Constantes ── */
const PLANTAS = FLOOR_DEFS.filter((f) => f.key !== 'cubierta');
const CLAVES_PLANTA = new Set(['all', ...PLANTAS.map((f) => f.key)]);
const NIVEL_DE = new Map(PLANTAS.map((f, i) => [f.key, i]));
const AZIMUT_BASE = THREE.MathUtils.radToDeg(Math.atan2(64, 92)); // encuadre del visor actual
const ELEVACION = { conjunto: 35, edificio: 28, planta: 42 };
const RADIO_CONJUNTO = 260;       // m alrededor del edificio que entran en 'conjunto'
const REPOSO_S = 120;
const OFFSET_CORTE = 1.2;         // sobre el forjado, como data/cortes.json
const COTA_ENTORNO = -0.8;        // app/topo.js: la cota 0 del GLB es la parcela
const DPR_MAX = { alta: 1.5, media: 1.25 };
const IBL_TRAZADO = { dia: 0.5, amanecer: 0.75, atardecer: 0.8, noche: 1.6 };
const REALCE = { hover: 0.9, seleccion: 1.4 }; // intensidad emisiva del vidrio teñido
const COLOR_ENTORNO = {
  terreno: 0x6b6f5c, acera: 0x9a968c, podotactil: 0xb0a89a, asfalto: 0x3a3b3d, bordillo: 0xa6a29c,
  marca_vial: 0xd9d9d0, edificacion: 0xb9b3a8, muro: 0x8f8a80, arqueta: 0x6a6a6a, tronco: 0x4a3a2a, copa: 0x3f6a34,
};

/* ── Escena base ── */
const canvas = document.getElementById('scene');
const ctx = crearEscena(canvas);
const { renderer, scene, camera } = ctx;

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
  units: [], unitsById: new Map(), estados: {}, cargado: false,
  on(evento, fn) { bus.addEventListener(evento, (e) => fn(e.detail)); },
  enter() { /* compatibilidad con shell.js: no hay portada que atravesar */ },
  estadoDe: (id) => apolo.estados[id] || 'disponible',
};
window.apolo = apolo;

/* ── Módulos ── */
const luz = crearLuz(ctx);
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

/* ── Definición de cortes para apolo_levels.glb (ver cabecera) ── */
function definicionCortes() {
  const plantas = {};
  for (const F of PLANTAS) {
    plantas[F.key] = SECTIONS.map((s) => ({ x0: s.x0, x1: s.x1, z0: -45, z1: 45, y: s.floors[F.level] + OFFSET_CORTE }));
  }
  return { edificio: 'apolo', offset: OFFSET_CORTE, plantas };
}

/* El levantamiento trae triángulos degenerados (área cero). Con ellos, tanto
   computeVertexNormals (normal (0,0,0) → `normalize()` = NaN en el shader)
   como el flatShading (normal por derivadas dFdx/dFdy de un triángulo sin
   área → NaN) producen píxeles NaN, y basta UNO para que el desenfoque del
   bloom lo extienda a todo el fotograma (medido: imagen entera transparente
   en el encuadre 'edificio'). Aquí se quitan esos triángulos, se calculan
   las normales en CPU (por cara si se quiere facetado, sin flatShading) y se
   sustituye cualquier normal nula o no finita por (0,1,0). */
function limpiarGeometria(geometria, { facetada }) {
  const pos = geometria.getAttribute('position');
  const uv = geometria.getAttribute('uv');
  const idx = geometria.index;
  const nTri = (idx ? idx.count : pos.count) / 3;
  const v = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const validos = [];
  for (let t = 0; t < nTri; t++) {
    a.fromBufferAttribute(pos, v(t, 0)); b.fromBufferAttribute(pos, v(t, 1)); c.fromBufferAttribute(pos, v(t, 2));
    const area2 = b.sub(a).cross(c.sub(a)).lengthSq();
    if (Number.isFinite(area2) && area2 > 1e-10) validos.push(t);
  }
  let g;
  if (facetada) {
    // no indexada: cada cara con sus tres vértices y su normal propia
    const p = new Float32Array(validos.length * 9);
    const u = uv ? new Float32Array(validos.length * 6) : null;
    validos.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const j = v(t, k);
        p.set([pos.getX(j), pos.getY(j), pos.getZ(j)], i * 9 + k * 3);
        if (u) u.set([uv.getX(j), uv.getY(j)], i * 6 + k * 2);
      }
    });
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (u) g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  } else {
    g = geometria.clone();
    const ind = new Uint32Array(validos.length * 3);
    validos.forEach((t, i) => { ind[i * 3] = v(t, 0); ind[i * 3 + 1] = v(t, 1); ind[i * 3 + 2] = v(t, 2); });
    g.setIndex(new THREE.BufferAttribute(ind, 1));
  }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    if (!Number.isFinite(x + y + z) || x * x + y * y + z * z < 1e-6) n.setXYZ(i, 0, 1, 0);
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.triangulosQuitados = nTri - validos.length;
  return g;
}

/* ── Entorno topográfico ── */
async function cargarEntorno() {
  const gltf = await new Promise((ok, ko) => new GLTFLoader().load('assets/entorno_topo.glb', ok, undefined, ko));
  const grupo = gltf.scene;
  grupo.name = 'entorno';
  grupo.position.y = COTA_ENTORNO;
  grupo.traverse((o) => {
    if (!o.isMesh) return;
    // sin normales en el GLB y con triángulos degenerados: ver limpiarGeometria
    const original = o.geometry;
    o.geometry = limpiarGeometria(original, { facetada: o.name !== 'terreno' }); // el terreno se lee continuo; el resto, facetado
    original.dispose();
    o.material = new THREE.MeshStandardMaterial({
      color: COLOR_ENTORNO[o.name] ?? 0x888888, roughness: 0.95, metalness: 0,
    });
    o.material.name = `entorno_${o.name}`;
    luz.aplicarMaterial(o.material);
    o.castShadow = true;
    o.receiveShadow = true;
    o.raycast = () => {}; // el picking va solo por las envolventes de vivienda
  });
  scene.add(grupo);
  scene.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(grupo);
  /* El levantamiento es una franja de 280×160 m y la equirect es una esfera
     completa: sin nada debajo, el conjunto flota sobre cielo. Un disco de
     terreno a la cota más baja del levantamiento, con su mismo color y la
     niebla de luz.js, le da horizonte hasta que llegue el entorno de 10 km
     del SketchUp. No entra en la caja del encuadre 'conjunto'. */
  const suelo = new THREE.Mesh(
    new THREE.CircleGeometry(3000, 96),
    new THREE.MeshStandardMaterial({ color: COLOR_ENTORNO.terreno, roughness: 1, metalness: 0 }));
  suelo.name = 'suelo_lejano';
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.set((caja.min.x + caja.max.x) / 2, caja.min.y - 0.05, (caja.min.z + caja.max.z) / 2);
  suelo.receiveShadow = true;
  suelo.raycast = () => {};
  luz.aplicarMaterial(suelo.material);
  scene.add(suelo);
  return { grupo, suelo, caja };
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
  if (entorno) {
    const centro = edificio.caja.getCenter(new THREE.Vector3());
    const tope = new THREE.Box3(
      new THREE.Vector3(centro.x - RADIO_CONJUNTO, -Infinity, centro.z - RADIO_CONJUNTO),
      new THREE.Vector3(centro.x + RADIO_CONJUNTO, Infinity, centro.z + RADIO_CONJUNTO));
    caja.union(entorno.caja.clone().intersect(tope));
  }
  return caja;
}
function cajaPlanta(clave) {
  const caja = edificio.caja.clone();
  const tramos = cortes?.definicion?.plantas?.[clave];
  if (tramos) caja.max.y = Math.min(caja.max.y, Math.max(...tramos.map((t) => t.y)));
  return caja;
}
function encuadrarVista(vista, { duracion = 1.6 } = {}) {
  const cambia = apolo.vista !== vista;
  apolo.vista = vista;
  if (cambia && edificio) repintar(); // las cartelas vecinas dependen de la vista
  const op = { azimut: AZIMUT_BASE, duracion };
  if (vista === 'conjunto') return camara.encuadrar(cajaConjunto(), { ...op, elevacion: ELEVACION.conjunto, margen: 1.05 });
  if (vista === 'planta') return camara.encuadrar(cajaPlanta(apolo.floor), { ...op, elevacion: ELEVACION.planta });
  return camara.encuadrar(edificio.caja, { ...op, elevacion: ELEVACION.edificio });
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
  edificio.pintar({
    hover: hover && !hover.vidrios.length ? hover.id : null,
    seleccionada: sel && !sel.vidrios.length ? sel.id : null,
    atenuada,
  });
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
function elegible(id) {
  if (!id || apolo.estadoDe(id) === 'vendida') return false;
  if (apolo.floor === 'all') return true;
  return edificio.viviendas.get(id)?.floorKey === apolo.floor;
}
function pickEn(p) {
  if (!edificio) return null;
  raycaster.setFromCamera(p, camera);
  for (const h of raycaster.intersectObjects(edificio.pickables, false)) {
    const id = h.object.userData.unitId;
    if (elegible(id)) return id;
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

/* ── Superficies que reflejan (SSR): vidrios y asfalto, no el monocapa ── */
function actualizarReflectantes() {
  const lista = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.isMeshPhysicalMaterial && m.transparent) lista.push(o);
    else if (o.name === 'asfalto') lista.push(o);
  });
  post.setReflectantes(lista);
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

  irConjunto({ duracion = 1.6 } = {}) {
    if (!edificio) return Promise.resolve(false);
    if (apolo.floor !== 'all') apolo.setFloor('all', { encuadrar: false });
    else if (apolo.selected) apolo.select(null);
    post.setEnfoque(null);
    return encuadrarVista('conjunto', { duracion });
  },

  irEdificio({ duracion = 1.6 } = {}) {
    if (!edificio) return Promise.resolve(false);
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
    /* Acimut según la fila: la fachada principal (SO) mira a +z, la trasera
       (NE) a −z; desde la fachada opuesta la vivienda se vería a través del
       edificio. */
    const centro = v.caja.getCenter(new THREE.Vector3());
    const azimut = centro.z >= 0 ? 22 : 158;
    return camara.enfocarVivienda(v.caja, { duracion, azimut }).then((llego) => {
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
  luz.update(dt);
  cortes?.update(dt);
  actualizarHover();

  post.setVelocidadCamara(camara.velocidad);
  if (luz.enTransicion) post.setMomento({ bloom: luz.actual.bloom, umbral: luz.actual.umbral });
  if (apolo.vista === 'vivienda' && post.enfoque != null) post.setEnfoque(camara.distanciaObjetivo);

  /* La atenuación de plantas de cortes cambia color/envMapIntensity durante
     ~1,5 s tras setPlanta; cuando termina, el trazador vuelve a subir los
     materiales una sola vez. */
  if (t < materialesEnMovimientoHasta) materialesPendientes = true;
  else if (materialesPendientes) { materialesPendientes = false; trazador.actualizarMateriales(); }

  const quieta = !cargando && camara.quieta && !cortes?.enTransicion && !luz.enTransicion && t >= materialesEnMovimientoHasta;
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
const PESOS = { luz: 0.1, edificio: 0.55, entorno: 0.35 };
function avanzar(etapa, valor) {
  progreso[etapa] = valor;
  const total = Object.keys(PESOS).reduce((s, k) => s + PESOS[k] * progreso[k], 0);
  emitir('carga', { progreso: Math.min(1, total), etapa });
}

async function arrancar() {
  emitir('carga', { progreso: 0, etapa: 'inicio' });
  fotograma(); // el cielo ya se ve mientras llega el edificio
  await luz.listo;
  avanzar('luz', 1);

  const [ed, ent] = await Promise.all([
    cargarEdificio(ctx, ACTIVE_BUILDING, { luz }).then((e) => { avanzar('edificio', 1); return e; }),
    cargarEntorno().then((e) => { avanzar('entorno', 1); return e; })
      .catch((err) => { console.warn('[apolo] sin entorno topográfico:', err); avanzar('entorno', 1); return null; }),
  ]);
  edificio = ed;
  entorno = ent;
  apolo.units = edificio.units;
  apolo.unitsById = edificio.unitsById;
  apolo.estados = edificio.estados;
  const demo = estadosDemostracion(edificio);
  if (demo) edificio.setEstados(demo);
  edificio.setVentanas(MOMENTOS[apolo.momento].luces);

  cortes = crearCortes(ctx, edificio, { luz, definicion: definicionCortes() });
  actualizarReflectantes();
  repintar();

  // la cámara toma el objetivo antes del primer fotograma con edificio
  encuadrarVista('conjunto', { duracion: 0 });
  camara.reposoTras(REPOSO_S);
  cargando = false;
  apolo.cargado = true;
  emitir('carga', { progreso: 1, etapa: 'listo' });
  emitir('planta', apolo.floor);
  emitir('momento', apolo.momento);

  /* Trabajo en segundo plano tras la primera imagen: los otros tres cielos
     (horneado + PMREM) y el CSG de las cuatro plantas, para que el primer
     cambio de momento o de planta no lo pague el usuario. */
  setTimeout(async () => {
    try { await luz.precalentar(); } catch (e) { console.warn('[apolo] precalentar luz:', e); }
    for (const F of PLANTAS) {
      try { await cortes.precalcular(F.key); } catch (e) { console.warn('[apolo] precalcular cortes:', e); }
    }
  }, 2500);
}

arrancar().catch((err) => {
  console.error('[apolo] no se pudo arrancar el visor:', err);
  emitir('carga', { progreso: 1, etapa: 'error', error: String(err?.message || err) });
});
