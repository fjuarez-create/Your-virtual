/* ═══════════════════════════════════════════════════════════════════════════
   edificio.js — Carga y estado de un edificio (modelo de SketchUp).

   Un edificio son cuatro cosas en el mismo grupo: la envolvente completa
   (assets/serenea/apolo_envolvente.glb: muros, forjados, carpinterías,
   escaleras, pilares y un vidrio por hueco), el mobiliario y las cuatro
   variantes ya cortadas por planta (que llegan en segundo plano con
   `cargarSecundarios`), las envolventes translúcidas de vivienda que salen
   de app/layout.js (invisibles en reposo; solo realce de hover y selección,
   y lo único que ve el raycaster) y las cartelas de cada vivienda (capa 1).

   Decisiones donde el contrato deja hueco (documentadas aquí):

   · Firma: `cargarEdificio(ctx, slot, opciones)`. El tercer parámetro puede
     ser directamente el objeto `luz` (si trae `aplicarMaterial`) o un objeto
     de opciones `{ luz, unitsById, estados, rutas, onProgreso }`. Con `luz`,
     todos los materiales se registran en `luz.aplicarMaterial`.
   · Materiales por NOMBRE, compartidos entre ficheros: cada GLB trae sus
     propias instancias de material y sus propias texturas (18 en cada uno).
     El primer fichero que trae un nombre fija el material del visor; los
     siguientes (variantes cortadas, mobiliario) adoptan ese mismo material y
     liberan sus texturas. Así hay un solo programa por material, el emisivo
     de las ventanas y la atenuación de cortes.js llegan a las variantes sin
     hacer nada, y la GPU no guarda cinco copias de la ortofoto del monocapa.
     El monocapa y el travertino conservan las texturas del SketchUp;
     'APOLO | Vidrio claro' se sustituye por el vidrio físico del visor
     (el de app/building.js: Fresnel, clearcoat, tinte de flotado). El
     alphaTest que GLTFLoader pone a los materiales MASK se quita: las
     texturas son opacas y el `discard` mata el early-z.
   · Vidrio por vivienda: el pipeline ya trae un vidrio por hueco con el
     centro en el nombre (`vidrio__T<plataforma>__<n>__<xcm>_<ycm>_<zcm>`).
     Cada uno va a la vivienda cuya caja ampliada 0,6 m contiene su centro
     (si varias, la más cercana sin ampliar) y recibe el clon de vidrio de
     esa vivienda (emisivo cálido que `setVentanas` enciende o apaga). Las
     variantes cortadas traen las mismas mallas con el mismo nombre, así que
     el mismo registro por nombre les asigna el mismo material. Lo que no
     cae en ninguna caja (portales, testeros) queda con el vidrio común, que
     no se enciende nunca.
   · Marco antiguo → nuevo (provisional hasta que el SketchUp traiga grupos
     VIV_): las cajas de layout.js van centradas en (0,0); aquí
     x' = x + 66,72 · z' = z − 23,94 (sin espejo: comprobado con dos datos
     medibles, ver MARCO) e y' = cota de corte de la plataforma que contiene
     (x', z') en la planta de la vivienda (data/cortes.json) − 1,25 como
     suelo, con 3,0 m de alto. Medido: 153 de los 175 vidrios caen en una
     caja (87 %); los 22 restantes están en el testero este entre las dos
     filas. El espejo en x daría 159 pero invierte la pendiente del terreno
     (SECTIONS.street de layout.js cae hacia +x, igual que las plataformas
     de cortes.json) y desplaza los patios: los vidrios interiores caen en
     x = 29,8/42,3 · 60,6/73,1 · 91,4/103,9, que son los bordes de los
     patios de layout.js trasladados sin espejo. La fila 'sw' queda en la
     banda de z alta (−18,8…−6,8), que es el sur del SketchUp (fachada
     principal); la 'ne' en la banda baja.
   · `Material.clone()` copia `userData` pasándolo por JSON; los clones de
     vidrio reciben un userData nuevo con `baseOpacity`, `baseEnv`,
     `baseColor` y `unitId` correctos.
   · `pintar` sigue paintUnits (envolvente invisible en reposo, realce al
     pasar el ratón o seleccionar; vendidas inertes) SIN prueba de
     profundidad: la envolvente está dentro de los muros. En reposo es
     `visible = false`, no solo opacidad 0: las pasadas de post.js con
     `scene.overrideMaterial` (G-buffer de GTAO, profundidad de SSR y Bokeh)
     ignoran la opacidad y verían 166 cajas sólidas. El Raycaster de three no
     filtra por `visible`, así que `pickables` sigue funcionando.
     Las cartelas se muestran por planta con `setCartelas(clave | null)`.
   · `niveles` tiene un único nivel ('apolo') con todas las mallas de la
     envolvente completa: cortes.js lo consume para la transición por planos
     y para registrar los materiales; las plantas ya no son mallas aparte.
   · `cargarSecundarios({ onProgreso, alMobiliario, alVariante })` descarga en
     serie el mobiliario y las cuatro variantes (peso: 33 + 4×(5-12) MB),
     adopta los materiales, cuelga cada objeto del grupo (variantes ocultas)
     y avisa por callback para que main las registre en cortes.js.
   · Extras: `edificio.vidrio` (recuento de la asignación), `edificio.units`
     / `unitsById`, `estadoDe(id)`, `edificio.caja` (Box3 de la envolvente),
     `edificio.ventanas`, `edificio.definicionCortes` (data/cortes.json ya
     cargado, para pasárselo a cortes.js sin pedirlo dos veces),
     `edificio.materiales` (Map nombre → material), `edificio.variantes`
     (Map clave → Object3D), `edificio.mobiliario` y `edificio.destruir()`.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ESTADO_COLORS } from 'app/building.js';
import { FLOOR_DEFS, computeLayout } from 'app/layout.js';

export const AMPLIACION_CAJA = 0.6;      // margen de la caja al asignar vidrio (contrato)
export const EMISIVO_VENTANA = 0xffd9a0; // luz cálida de interior
export const INTENSIDAD_VENTANA = 1.4;   // por encima de 1 para que el bloom lo recoja

/* Transformación del marco de layout.js al del SketchUp (ver cabecera). */
export const MARCO = { dx: 66.72, dz: -23.94, sx: 1, sz: 1, bajoCorte: 1.25, alto: 3.0 };

export const RUTAS = {
  envolvente: 'assets/serenea/apolo_envolvente.glb',
  mobiliario: 'assets/serenea/apolo_mobiliario.glb',
  cortes: 'data/cortes.json',
  variantes: {
    baja: 'assets/serenea/apolo_corte_baja.glb',
    p1: 'assets/serenea/apolo_corte_p1.glb',
    p2: 'assets/serenea/apolo_corte_p2.glb',
    atico: 'assets/serenea/apolo_corte_atico.glb',
  },
};

const COLOR_BASE_VIVIENDA = new THREE.Color(0xe9e7e1);
const HUECO_ENVOLVENTE = 0.34;
const RE_VIDRIO = /^vidrio__T(\d+)__(\d+)__(-?\d+)_(-?\d+)_(-?\d+)$/;
const ES_MATERIAL_VIDRIO = /vidrio/i;

/* Un solo cargador para todo el módulo: el decodificador meshopt se
   inicializa una vez. */
let cargador = null;
function cargadorGLB() {
  if (!cargador) cargador = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return cargador;
}
function cargarGLB(url, onProgreso) {
  return new Promise((ok, ko) => cargadorGLB().load(url, ok, (xhr) => {
    if (onProgreso && xhr.lengthComputable && xhr.total > 0) onProgreso(xhr.loaded / xhr.total);
  }, ko));
}

/* Vidrio de verdad (app/building.js): reflejo con Fresnel del entorno y una
   capa especular encima; el tinte verdoso es el del vidrio flotado real. */
export function crearVidrioFisico() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x2c3b3e, roughness: 0.045, metalness: 0, transparent: true,
    opacity: 0.42, envMapIntensity: 2.6, side: THREE.DoubleSide,
    clearcoat: 1, clearcoatRoughness: 0.02,
    ior: 1.52, reflectivity: 0.62, specularIntensity: 1,
    emissive: EMISIVO_VENTANA, emissiveIntensity: 0,
  });
  m.userData = { baseOpacity: 0.42, baseEnv: 2.6, baseColor: m.color.clone(), sinTraseras: true };
  return m;
}

/* Cartela de vivienda (copia de makeLabelSprite de app/building.js): caja con
   rabito y el número en blanco, fuera del tone mapping y en la capa 1. */
function crearCartela(texto, fondo, capa) {
  const cv = document.createElement('canvas');
  cv.width = 224; cv.height = 128;
  const c2 = cv.getContext('2d');
  c2.shadowColor = 'rgba(17,17,18,0.3)';
  c2.shadowBlur = 10;
  c2.shadowOffsetY = 5;
  c2.fillStyle = fondo;
  const x0 = 42, y0 = 14, x1 = 182, y1 = 92;
  c2.beginPath();
  c2.moveTo(x0, y0); c2.lineTo(x1, y0); c2.lineTo(x1, y1);
  c2.lineTo(125, y1); c2.lineTo(112, y1 + 19); c2.lineTo(99, y1);
  c2.lineTo(x0, y1); c2.closePath();
  c2.fill();
  c2.shadowColor = 'transparent';
  c2.fillStyle = '#ffffff';
  c2.font = '700 42px "Open Sans", "Segoe UI", sans-serif';
  c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillText(texto, 112, 54);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(3.2, 1.83, 1);
  sp.layers.set(capa);
  return sp;
}

/* Plataforma (cajón de cortes.json) que contiene un punto en planta; fuera
   de toda huella, la más cercana. */
function plataformaEn(tramos, x, z) {
  let i = tramos.findIndex((t) => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1);
  if (i >= 0) return i;
  let mejor = Infinity;
  tramos.forEach((t, k) => {
    const dx = Math.max(t.x0 - x, 0, x - t.x1), dz = Math.max(t.z0 - z, 0, z - t.z1);
    const d = dx * dx + dz * dz;
    if (d < mejor) { mejor = d; i = k; }
  });
  return Math.max(0, i);
}

/* Envolventes translúcidas y cartelas de todas las viviendas, en el marco del
   SketchUp (ver MARCO). Devuelve Map(id → registro de vivienda). */
function crearEnvolventes(grupo, unitsById, capaCartelas, definicionCortes) {
  const layout = computeLayout(unitsById);
  const viviendas = new Map();
  const plantas = new Map();
  const tramos = Object.values(definicionCortes.plantas)[0] || [];
  for (const F of FLOOR_DEFS) {
    const cotas = definicionCortes.plantas[F.key];
    if (!cotas) continue;
    const g = new THREE.Group();
    g.name = `viviendas-${F.key}`;
    const cartelas = new THREE.Group();
    cartelas.name = 'cartelas';
    cartelas.visible = false;
    g.add(cartelas);
    const filas = [F.rows.ne, F.rows.sw, F.rows.inN, F.rows.inS];
    for (const ids of filas) for (const id of ids) {
      const u = unitsById.get(id);
      const r = layout.rects.get(id);
      if (!u || !r) continue;
      const x = MARCO.dx + MARCO.sx * r.x;
      const z = MARCO.dz + MARCO.sz * r.z;
      const plataforma = plataformaEn(tramos, x, z);
      const yBase = cotas[plataforma].y - MARCO.bajoCorte;
      const geo = new THREE.BoxGeometry(r.w - HUECO_ENVOLVENTE, MARCO.alto, r.d - HUECO_ENVOLVENTE);
      const mat = new THREE.MeshStandardMaterial({
        color: COLOR_BASE_VIVIENDA.clone(), roughness: 0.55, metalness: 0,
        emissive: 0x000000, transparent: true, opacity: 0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `vivienda-${id}`;
      mesh.position.set(x, yBase + MARCO.alto / 2, z);
      mesh.userData = { unitId: id, floorKey: F.key, plataforma };
      mesh.renderOrder = 50; // tras el vidrio: el realce se ve a través de la fachada
      g.add(mesh);
      const label = crearCartela(id, '#24873f', capaCartelas);
      label.position.set(x, yBase + MARCO.alto + 2.1, z);
      const labelR = crearCartela(id, '#e0862b', capaCartelas);
      labelR.position.copy(label.position);
      label.visible = false; labelR.visible = false;
      cartelas.add(label, labelR);
      mesh.userData.label = label;
      mesh.userData.labelR = labelR;
      viviendas.set(id, { id, mesh, floorKey: F.key, plataforma, unidad: u, caja: null, vidrios: [], vidrio: null,
        mallasVidrio: [], label, labelR });
    }
    grupo.add(g);
    plantas.set(F.key, { grupo: g, cartelas });
  }
  return { viviendas, plantas, layout };
}

/* Box3 de las mallas visibles de un objeto (Box3.setFromObject no distingue
   nodos ocultos). */
function cajaVisible(objeto) {
  const caja = new THREE.Box3();
  objeto.updateMatrixWorld(true);
  objeto.traverseVisible((o) => { if (o.isMesh) caja.expandByObject(o); });
  return caja;
}

export async function cargarEdificio(ctx, slot, opciones = {}) {
  const luz = typeof opciones.aplicarMaterial === 'function' ? opciones : (opciones.luz || null);
  const rutas = { ...RUTAS, ...(slot.modelo || {}), ...(opciones.rutas || {}) };
  const onProgreso = opciones.onProgreso || (() => {});
  const { scene } = ctx;
  const capaCartelas = ctx.capas?.cartelas ?? 1;

  const grupo = new THREE.Group();
  grupo.name = slot.id;
  scene.add(grupo);

  /* ── Datos y modelo, en paralelo ── */
  const cargarJSON = async (url, tolerante) => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return await r.json();
    } catch (e) {
      if (!tolerante) throw e;
      console.warn('[edificio] sin disponibilidad, todo cuenta como disponible:', e.message);
      return {};
    }
  };
  const [units, disponibilidad, definicionCortes, gltf] = await Promise.all([
    opciones.unitsById ? null : cargarJSON(slot.units || 'data/units.json', false),
    opciones.estados ? null : cargarJSON(slot.availability || 'data/availability.json', true),
    opciones.definicionCortes || cargarJSON(rutas.cortes, false),
    cargarGLB(rutas.envolvente, onProgreso),
  ]);
  onProgreso(1);
  const unitsById = opciones.unitsById || new Map(units.map((u) => [u.id, u]));
  const listaUnits = units || [...unitsById.values()];
  const estados = Object.assign({}, opciones.estados || disponibilidad || {});

  /* ── Registro de materiales por nombre (ver cabecera) ── */
  const materiales = new Map();          // nombre → material del visor
  const vidrioPorMalla = new Map();      // nombre de malla de vidrio → material de su vivienda
  const texturasDe = (m) => [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap, m.alphaMap].filter(Boolean);
  function materialDe(m) {
    const nombre = m.name || 'sin_nombre';
    let r = materiales.get(nombre);
    if (r) {
      if (r !== m) { for (const t of texturasDe(m)) if (!texturasDe(r).includes(t)) t.dispose(); m.dispose(); }
      return r;
    }
    if (ES_MATERIAL_VIDRIO.test(nombre)) {
      r = crearVidrioFisico();
      m.dispose();
    } else {
      r = m;
      r.alphaTest = 0;
      if (!(r.transparent && r.opacity < 1)) { r.transparent = false; r.depthWrite = true; }
      r.side = THREE.FrontSide; // cortes.js lo pasa a doble cara con las traseras oscuras
      r.envMapIntensity = 1;
      r.userData = { baseOpacity: r.opacity, baseEnv: 1, baseColor: r.color.clone() };
    }
    r.name = nombre;
    if (luz) luz.aplicarMaterial(r);
    materiales.set(nombre, r);
    return r;
  }
  /* Da a todas las mallas de un objeto los materiales del registro (y a los
     vidrios ya asignados, el de su vivienda) y las banderas del visor. */
  function adoptar(raiz, { mobiliario = false } = {}) {
    const mallas = [];
    raiz.traverse((o) => {
      if (!o.isMesh) return;
      mallas.push(o);
      const deVivienda = vidrioPorMalla.get(o.name);
      if (deVivienda) o.material = deVivienda;
      else if (Array.isArray(o.material)) o.material = o.material.map(materialDe);
      else o.material = materialDe(o.material);
      const esVidrio = ES_MATERIAL_VIDRIO.test(o.material.name) || !!deVivienda;
      o.castShadow = !esVidrio;
      o.receiveShadow = true;
      o.raycast = () => {}; // el picking va solo por las envolventes de vivienda
      o.userData.mobiliario = mobiliario;
    });
    return mallas;
  }

  const envolvente = gltf.scene;
  envolvente.name = 'envolvente';
  const mallasEnvolvente = adoptar(envolvente);
  grupo.add(envolvente);

  /* ── Envolventes y cartelas ── */
  const { viviendas, plantas } = crearEnvolventes(grupo, unitsById, capaCartelas, definicionCortes);
  scene.updateMatrixWorld(true);
  for (const v of viviendas.values()) v.caja = new THREE.Box3().setFromObject(v.mesh);

  /* ── Vidrio por vivienda: el centro del nombre contra las cajas ── */
  const vidrioBase = [...materiales.values()].find((m) => ES_MATERIAL_VIDRIO.test(m.name)) || null;
  const vidrio = { total: 0, asignados: 0, comunes: 0, viviendasConVidrio: 0, ms: 0 };
  const tVidrio = performance.now();
  const candidatas = [...viviendas.values()].map((v) => ({ v, ampliada: v.caja.clone().expandByScalar(AMPLIACION_CAJA) }));
  const centro = new THREE.Vector3();
  for (const m of mallasEnvolvente) {
    const r = RE_VIDRIO.exec(m.name);
    if (!r) continue;
    vidrio.total++;
    centro.set(+r[3] / 100, +r[4] / 100, +r[5] / 100);
    let mejor = null, dMejor = Infinity;
    for (const c of candidatas) {
      if (!c.ampliada.containsPoint(centro)) continue;
      const d = c.v.caja.distanceToPoint(centro); // 0 si está dentro de la caja sin ampliar
      if (d < dMejor) { dMejor = d; mejor = c.v; }
    }
    if (!mejor) { vidrio.comunes++; continue; }
    if (!mejor.vidrio) {
      const mat = vidrioBase ? vidrioBase.clone() : crearVidrioFisico();
      mat.name = `vidrio-${mejor.id}`;
      mat.emissive.setHex(EMISIVO_VENTANA);
      mat.emissiveIntensity = 0;
      mat.userData = { baseOpacity: mat.opacity, baseEnv: mat.envMapIntensity, baseColor: mat.color.clone(), unitId: mejor.id, sinTraseras: true };
      if (luz) luz.aplicarMaterial(mat);
      mejor.vidrio = mat;
      mejor.vidrios.push(mat);
      vidrio.viviendasConVidrio++;
    }
    m.material = mejor.vidrio;
    mejor.mallasVidrio.push(m);
    vidrioPorMalla.set(m.name, mejor.vidrio);
    vidrio.asignados++;
  }
  vidrio.ms = Math.round(performance.now() - tVidrio);

  /* ── Registro en luz: envolventes de vivienda (los materiales del modelo
     ya pasaron por materialDe) ── */
  if (luz) for (const v of viviendas.values()) luz.aplicarMaterial(v.mesh.material);

  /* ── Nivel único para cortes.js ── */
  const matsNivel = () => [...new Set([...materiales.values(), ...[...viviendas.values()].map((v) => v.vidrio).filter(Boolean)])];
  const nivel = { holders: [], mats: matsNivel(), byCat: { glass: vidrioBase }, meshes: mallasEnvolvente };
  const niveles = new Map([['apolo', nivel]]);

  const pickables = [...viviendas.values()].map((v) => v.mesh);
  let ultimo = { hover: null, seleccionada: null, atenuada: null };
  let cartelasDe = null;

  const edificio = {
    grupo, envolvente, niveles, viviendas, estados, pickables, vidrio, units: listaUnits, unitsById,
    materiales, definicionCortes, rutas,
    variantes: new Map(),
    mobiliario: null,
    ventanas: false,
    caja: cajaVisible(envolvente),
    estadoDe: (id) => estados[id] || 'disponible',
    cajaDe: (id) => viviendas.get(id)?.caja ?? null,

    setEstados(mapa) {
      for (const k of Object.keys(estados)) delete estados[k];
      Object.assign(estados, mapa || {});
      edificio.setVentanas(edificio.ventanas);
      edificio.pintar(ultimo);
    },

    /* Enciende el interior de disponibles y reservadas; una vendida es de
       alguien y su ventana no cuenta la historia comercial. */
    setVentanas(encendidas) {
      edificio.ventanas = !!encendidas;
      for (const v of viviendas.values()) {
        const on = edificio.ventanas && edificio.estadoDe(v.id) !== 'vendida';
        for (const m of v.vidrios) m.emissiveIntensity = on ? INTENSIDAD_VENTANA : 0;
      }
    },

    pintar({ hover = null, seleccionada = null, atenuada = null } = {}) {
      ultimo = { hover, seleccionada, atenuada };
      for (const v of viviendas.values()) {
        const estado = edificio.estadoDe(v.id);
        const col = ESTADO_COLORS[estado] || ESTADO_COLORS.disponible;
        const mat = v.mesh.material;
        const vendida = estado === 'vendida';
        const dim = atenuada ? !!atenuada(v.id) : false;
        mat.color.copy(col);
        if (v.id === seleccionada && !vendida && !dim) {
          mat.opacity = 0.45;
          mat.emissive.copy(col).multiplyScalar(0.35);
        } else if (v.id === hover && !vendida && !dim) {
          mat.opacity = 0.32;
          mat.emissive.copy(col).multiplyScalar(0.2);
        } else {
          mat.opacity = 0;
          mat.emissive.setHex(0x000000);
        }
        mat.depthTest = false; // realce visible a través de los muros
        v.mesh.visible = mat.opacity > 0; // en reposo no se dibuja (ver cabecera: G-buffer del post)
        const marcable = !dim && cartelasDe === v.floorKey;
        v.label.visible = marcable && estado === 'disponible';
        v.labelR.visible = marcable && estado === 'reservada';
      }
    },

    /* Cartelas de una planta ('baja' | 'p1' | 'p2' | 'atico') o ninguna. */
    setCartelas(clave) {
      cartelasDe = plantas.has(clave) ? clave : null;
      for (const [k, p] of plantas) p.cartelas.visible = k === cartelasDe;
      edificio.pintar(ultimo);
    },

    /* El SketchUp nombra la plataforma en cada malla (`__T<n>__`) y
       cortes.js la lee de ahí; no hay tramos de SECTIONS que consultar. */
    tramoDe() { return null; },

    /* Mobiliario y variantes cortadas, en serie y en segundo plano (ver
       cabecera). `onProgreso(fraccion, etapa)` va de 0 a 1 sobre los cinco
       ficheros; `alMobiliario(objeto)` y `alVariante(clave, objeto)` avisan
       cuando cada uno está en la escena. */
    async cargarSecundarios({ onProgreso: avisar = () => {}, alMobiliario = () => {}, alVariante = () => {} } = {}) {
      const tareas = [{ etapa: 'mobiliario', url: rutas.mobiliario }, ...Object.entries(rutas.variantes).map(([clave, url]) => ({ etapa: `corte_${clave}`, clave, url }))];
      const tiempos = {};
      for (const [i, t] of tareas.entries()) {
        const t0 = performance.now();
        let g;
        try {
          g = await cargarGLB(t.url, (f) => avisar((i + f) / tareas.length, t.etapa));
        } catch (e) {
          console.warn(`[edificio] no se pudo cargar ${t.url}:`, e);
          avisar((i + 1) / tareas.length, t.etapa);
          continue;
        }
        const objeto = g.scene;
        objeto.name = t.etapa;
        if (t.clave) {
          adoptar(objeto);
          objeto.visible = false;
          grupo.add(objeto);
          edificio.variantes.set(t.clave, objeto);
          alVariante(t.clave, objeto);
        } else {
          adoptar(objeto, { mobiliario: true });
          grupo.add(objeto);
          edificio.mobiliario = objeto;
          alMobiliario(objeto);
        }
        nivel.mats = matsNivel();
        tiempos[t.etapa] = Math.round(performance.now() - t0);
        avisar((i + 1) / tareas.length, t.etapa);
      }
      return tiempos;
    },

    /* Saca el edificio de la escena y libera lo que creó (geometrías,
       materiales, texturas). Los materiales quedan registrados en
       luz.materiales si se pasó luz: no hay API para darlos de baja, pero un
       material sin malla no cuesta nada más que la entrada en el Set. */
    destruir() {
      scene.remove(grupo);
      const mats = new Set();
      grupo.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (!m) return;
        for (const x of Array.isArray(m) ? m : [m]) mats.add(x);
      });
      for (const m of mats) { for (const t of texturasDe(m)) t.dispose(); m.dispose(); }
      viviendas.clear();
      pickables.length = 0;
      materiales.clear();
      vidrioPorMalla.clear();
      edificio.variantes.clear();
      edificio.mobiliario = null;
    },
  };
  edificio.pintar(ultimo);
  return edificio;
}
