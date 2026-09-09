/* ═══════════════════════════════════════════════════════════════════════════
   edificio.js — Carga y estado de un edificio.

   Un edificio son tres cosas superpuestas en el mismo grupo: el modelo de
   Revit por plantas (loadBIM de app/building.js, con sus materiales de grano
   y su vidrio físico), las envolventes translúcidas de vivienda que salen de
   app/layout.js (invisibles en reposo; solo realce de hover y selección, y
   lo único que ve el raycaster) y las cartelas de cada vivienda (capa 1).

   La novedad frente al visor actual es el VIDRIO POR VIVIENDA: el GLB trae
   un solo vidrio por planta, así que hasta ahora las ventanas se encendían
   todas a la vez. Aquí la malla de vidrio de cada nivel se reparte por
   viviendas triángulo a triángulo (cada uno va a la vivienda cuya caja,
   ampliada 0,6 m, contiene su centroide) y cada vivienda recibe un clon del
   material de vidrio con emisivo cálido que `setVentanas` enciende o apaga
   según su estado comercial. Lo que no cae en ninguna caja (portales,
   escaleras, cerramientos comunes) queda en el vidrio común de la planta.

   Decisiones donde el contrato deja hueco (documentadas aquí):

   · Firma: `cargarEdificio(ctx, slot, opciones)`. El tercer parámetro puede
     ser directamente el objeto `luz` (si trae `aplicarMaterial`) o un objeto
     de opciones `{ luz, unitsById, estados, url }`. Con `luz`, todos los
     materiales (BIM, clones de vidrio y envolventes) se registran en
     `luz.aplicarMaterial`.
   · Datos: se cargan `slot.units` y `slot.availability` con fetch (las rutas
     de app/promotions.js). Si `availability` falla, `estados` queda vacío y
     todo cuenta como 'disponible'. El módulo no inventa el reparto 70/30:
     eso lo hace visor/main.js (o la demo) con `setEstados`.
   · `buildBuilding` se copia en parte en vez de importarse: además de las
     envolventes añade jardines, árboles y el contexto inventado de
     app/context.js, que en el visor nuevo sobran (el entorno lo trae
     entorno_topo.glb). Las envolventes y cartelas se construyen aquí con la
     misma geometría (computeLayout, floorYAt, gap 0,34 m, alto 2,7 m) para
     que las cajas coincidan con las del visor actual.
   · Cuando dos cajas ampliadas contienen el mismo centroide (viviendas
     vecinas, la ampliación se solapa en la medianera) gana la caja SIN
     ampliar más cercana al centroide. La ampliación es de 0,6 m en x e y y
     de 1,2 m en z (ver AMPLIACION_CAJA): la fachada noreste del BIM queda
     fuera de las cajas esquemáticas de layout.js por unos 0,8 m. Lo que
     sigue sin vivienda pasa por una segunda pasada con 3,6 m en z
     (RESCATE_CAJA, por los áticos sin retranqueo real); el resto es común.
   · Cada malla de vidrio de Revit se reparte entre TODAS las viviendas, no
     solo las de su planta homónima: el edificio se escalona con el terreno y
     los niveles de Revit no coinciden con las plantas lógicas de layout.js
     en todos los tramos (la 'baja' del oeste está a la cota del 'p1' de
     Revit). Una vivienda puede recibir así vidrio de dos niveles; por eso
     `vidrios` es una lista de materiales (uno por malla de origen).
   · Las mallas de vidrio por vivienda se construyen en el sistema local de la
     malla original (posiciones Int16 normalizadas → Float32 con los mismos
     valores) y copian su transformación, así no se pierde precisión con la
     cuantización del GLB. Cada una cuelga de su propio `holder`
     (`bim-<planta>__glass__<id>`) y se añade a `nivel.holders`,
     `nivel.meshes` y `nivel.mats`, para que cortes.js las corte y atenúe como
     al resto. El vidrio común se queda en la malla original (con lo que
     sobra); si no sobra nada, la malla se oculta.
   · `Material.clone()` copia `userData` pasándolo por JSON, y `baseColor`
     (un THREE.Color que usa cortes.js) se convertiría en un objeto plano; los
     clones reciben un userData nuevo con `baseOpacity`, `baseEnv` y
     `baseColor` correctos.
   · El vidrio común no se enciende nunca: lo que no es vivienda no tiene
     estado comercial y encenderlo confundiría la lectura de disponibles.
   · `pintar` sigue paintUnits (envolvente invisible en reposo, realce al
     pasar el ratón o seleccionar; vendidas inertes) con el añadido de que
     el realce se dibuja SIN prueba de profundidad: la envolvente está dentro
     de los muros y, con la fachada opaca, solo se vería por las ventanas.
     En reposo la envolvente es `visible = false`, no solo opacidad 0
     (revisión): las pasadas de post.js que dibujan la escena con
     `scene.overrideMaterial` (G-buffer de GTAO, profundidad de SSR y Bokeh)
     ignoran la opacidad y verían 166 cajas sólidas, algunas fuera del BIM
     (áticos del este, baja del oeste) → halos de oclusión y reflejos de
     cajas que no existen. El Raycaster de three no filtra por `visible`
     (solo por layers), así que `pickables` sigue funcionando; main NO debe
     descartar candidatos por `visible`.
     Las cartelas se muestran por planta con `setCartelas(clave | null)`
     (extra fuera del contrato; por defecto ocultas), verde en disponibles y
     ámbar en reservadas, como hoy.
   · `tramoDe(mesh)` devuelve el índice de SECTIONS (app/layout.js) que
     contiene la x del centro de la caja de la malla, o null si no cae en
     ninguno; cortes.js ya tiene su propio respaldo para ese caso.
   · Extras: `edificio.vidrio` (recuento de triángulos asignados, rescatados
     y comunes por nivel, y ms del reparto), `edificio.units` / `edificio.unitsById`, `edificio.estadoDe(id)`,
     `edificio.caja` (Box3 del BIM visible: sin el sótano, que loadBIM oculta),
     `edificio.ventanas` (booleano) y `edificio.destruir()` (revisión): saca el
     grupo de la escena y libera geometrías, materiales y texturas de cartela,
     para cambiar de promoción sin acumular GPU.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { loadBIM, ESTADO_COLORS } from 'app/building.js';
import { FLOOR_DEFS, SECTIONS, floorYAt, computeLayout } from 'app/layout.js';

/* Margen de la caja al asignar vidrio: 0,6 m como pide el contrato en x e y;
   en z (la normal de las fachadas largas) 1,2 m, porque la caja de layout.js
   es esquemática (edificio de 30 m de fondo centrado en z = 0) y la fachada
   noreste del BIM queda a z ≈ −15,6, unos 0,8 m fuera del margen de 0,6.
   Como manda la caja SIN ampliar más cercana, el margen mayor solo actúa
   cuando ninguna vivienda contiene el triángulo con el margen corto. */
export const AMPLIACION_CAJA = new THREE.Vector3(0.6, 0.6, 1.2);
/* Segunda pasada ("rescate") para lo que la primera deja sin vivienda: la
   misma caja pero con 3,6 m de margen en z. layout.js retranquea el ático
   3,2 m respecto a la fachada y en el BIM buena parte de los áticos tienen
   sus ventanas en el plano de fachada (z ≈ 13,5…15): sin esta pasada esos
   áticos no se encienden nunca. Solo actúa sobre triángulos que ninguna caja
   reclamó con el margen corto, y sigue mandando la caja más cercana. */
export const RESCATE_CAJA = new THREE.Vector3(0.6, 0.6, 3.6);
export const EMISIVO_VENTANA = 0xffd9a0; // luz cálida de interior
export const INTENSIDAD_VENTANA = 1.4;   // por encima de 1 para que el bloom lo recoja

const COLOR_BASE_VIVIENDA = new THREE.Color(0xe9e7e1);
const ALTO_ENVOLVENTE = 2.7;
const HUECO_ENVOLVENTE = 0.34;

/* Cartela de vivienda (copia de makeLabelSprite de app/building.js, que no
   está exportada): caja con rabito y el número en blanco, fuera del tone
   mapping y en la capa 1 para dibujarse tras el post. */
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

/* Envolventes translúcidas y cartelas de todas las viviendas, con la misma
   geometría que buildBuilding. Devuelve Map(id → registro de vivienda). */
function crearEnvolventes(grupo, unitsById, capaCartelas) {
  const layout = computeLayout(unitsById);
  const viviendas = new Map();
  const plantas = new Map();
  for (const F of FLOOR_DEFS) {
    const g = new THREE.Group();
    g.name = `viviendas-${F.key}`;
    g.position.y = F.y;
    const cartelas = new THREE.Group();
    cartelas.name = 'cartelas';
    cartelas.visible = false;
    g.add(cartelas);
    const filas = [F.rows.ne, F.rows.sw, F.rows.inN, F.rows.inS];
    for (const ids of filas) for (const id of ids) {
      const u = unitsById.get(id);
      const r = layout.rects.get(id);
      if (!u || !r) continue;
      // cota real del forjado de este tramo, relativa al grupo de planta
      const yBase = floorYAt(r.x, F.level) - F.y + 0.16;
      const geo = new THREE.BoxGeometry(r.w - HUECO_ENVOLVENTE, ALTO_ENVOLVENTE, r.d - HUECO_ENVOLVENTE);
      const mat = new THREE.MeshStandardMaterial({
        color: COLOR_BASE_VIVIENDA.clone(), roughness: 0.55, metalness: 0,
        emissive: 0x000000, transparent: true, opacity: 0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `vivienda-${id}`;
      mesh.position.set(r.x, yBase + ALTO_ENVOLVENTE / 2, r.z);
      mesh.userData = { unitId: id, floorKey: F.key };
      mesh.renderOrder = 50; // tras el vidrio: el realce se ve a través de la fachada
      g.add(mesh);
      const label = crearCartela(id, '#24873f', capaCartelas);
      label.position.set(r.x, yBase + ALTO_ENVOLVENTE + 2.1, r.z);
      const labelR = crearCartela(id, '#e0862b', capaCartelas);
      labelR.position.copy(label.position);
      label.visible = false; labelR.visible = false;
      cartelas.add(label, labelR);
      mesh.userData.label = label;
      mesh.userData.labelR = labelR;
      viviendas.set(id, { id, mesh, floorKey: F.key, unidad: u, caja: null, vidrios: [], vidrio: null,
        label, labelR, triangulos: 0 });
    }
    grupo.add(g);
    plantas.set(F.key, { grupo: g, cartelas });
  }
  return { viviendas, plantas, layout };
}

/* Reparte los triángulos de la malla de vidrio de un nivel entre las
   viviendas de esa planta. Devuelve { asignados, comunes } en triángulos. */
function repartirVidrio(nivel, clave, vidrioMesh, viviendasPlanta, byCat, luz) {
  const geo = vidrioMesh.geometry;
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const idx = geo.index;
  const nTri = (idx ? idx.count : pos.count) / 3;
  vidrioMesh.updateMatrixWorld(true);
  const mW = vidrioMesh.matrixWorld;

  const candidatas = viviendasPlanta.map((v) => ({
    v, ampliada: v.caja.clone().expandByVector(AMPLIACION_CAJA),
    rescate: v.caja.clone().expandByVector(RESCATE_CAJA), tris: [],
  }));
  const comunes = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), centro = new THREE.Vector3();
  const vertice = (i) => (idx ? idx.getX(i) : i);
  const centroide = (t) => {
    a.fromBufferAttribute(pos, vertice(t * 3)); b.fromBufferAttribute(pos, vertice(t * 3 + 1));
    c.fromBufferAttribute(pos, vertice(t * 3 + 2));
    return centro.copy(a).add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(mW);
  };
  const masCercana = (punto, caja) => {
    let mejor = null, dMejor = Infinity;
    for (const cand of candidatas) {
      if (!cand[caja].containsPoint(punto)) continue;
      const d = cand.v.caja.distanceToPoint(punto); // 0 si está dentro de la caja sin ampliar
      if (d < dMejor) { dMejor = d; mejor = cand; }
    }
    return mejor;
  };
  const pendientes = [];
  for (let t = 0; t < nTri; t++) {
    const mejor = masCercana(centroide(t), 'ampliada');
    if (mejor) mejor.tris.push(vertice(t * 3), vertice(t * 3 + 1), vertice(t * 3 + 2));
    else pendientes.push(t);
  }
  let rescatados = 0;
  for (const t of pendientes) {
    const mejor = masCercana(centroide(t), 'rescate');
    if (mejor) { mejor.tris.push(vertice(t * 3), vertice(t * 3 + 1), vertice(t * 3 + 2)); rescatados++; }
    else comunes.push(vertice(t * 3), vertice(t * 3 + 1), vertice(t * 3 + 2));
  }

  /* Geometría Float32 no indexada en el sistema local de la malla (ver cabecera). */
  const construir = (indices) => {
    const n = indices.length;
    const p = new Float32Array(n * 3);
    const nn = nor ? new Float32Array(n * 3) : null;
    for (let k = 0; k < n; k++) {
      const i = indices[k];
      p[k * 3] = pos.getX(i); p[k * 3 + 1] = pos.getY(i); p[k * 3 + 2] = pos.getZ(i);
      if (nn) { nn[k * 3] = nor.getX(i); nn[k * 3 + 1] = nor.getY(i); nn[k * 3 + 2] = nor.getZ(i); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (nn) g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    else g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  };

  let asignados = 0;
  for (const cand of candidatas) {
    if (!cand.tris.length) continue;
    const mat = byCat.glass.clone();
    mat.name = `glass-${cand.v.id}`;
    mat.emissive.setHex(EMISIVO_VENTANA);
    mat.emissiveIntensity = 0;
    mat.userData = { baseOpacity: byCat.glass.userData.baseOpacity ?? mat.opacity,
      baseEnv: byCat.glass.envMapIntensity ?? 1, baseColor: mat.color.clone(), unitId: cand.v.id };
    if (luz) luz.aplicarMaterial(mat);
    const mesh = new THREE.Mesh(construir(cand.tris), mat);
    mesh.name = `${clave}__glass__${cand.v.id}`;
    mesh.position.copy(vidrioMesh.position);
    mesh.quaternion.copy(vidrioMesh.quaternion);
    mesh.scale.copy(vidrioMesh.scale);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.raycast = () => {}; // el picking va por las envolventes
    const holder = new THREE.Group();
    holder.name = `bim-${mesh.name}`;
    holder.visible = vidrioMesh.parent.visible; // loadBIM oculta el sótano por holder
    holder.add(mesh);
    vidrioMesh.parent.parent.add(holder);
    nivel.holders.push(holder);
    nivel.meshes.push(mesh);
    nivel.mats.push(mat);
    cand.v.vidrios.push(mat);
    cand.v.vidrio = cand.v.vidrio || mesh; // el primero; los demás van en vidrios[]
    cand.v.triangulos += cand.tris.length / 3;
    asignados += cand.tris.length / 3;
  }

  /* Lo que sobra se queda en la malla original, con el material común. Si no
     sobra nada, la malla y su holder se retiran del nivel: una geometría vacía
     acabaría en la lista que cortes.js pasa al CSG y en un Box3 vacío. */
  const viejo = vidrioMesh.geometry;
  if (comunes.length) vidrioMesh.geometry = construir(comunes);
  else {
    const holder = vidrioMesh.parent;
    holder.parent?.remove(holder);
    nivel.holders.splice(nivel.holders.indexOf(holder), 1);
    nivel.meshes.splice(nivel.meshes.indexOf(vidrioMesh), 1);
    vidrioMesh.geometry = new THREE.BufferGeometry();
  }
  viejo.dispose();
  return { asignados, comunes: comunes.length / 3, rescatados };
}

/* Box3 de lo que se ve: Box3.setFromObject no distingue holders ocultos y el
   sótano de loadBIM hundiría la caja (encuadres y cortes la usan). */
function cajaVisible(objeto) {
  const caja = new THREE.Box3();
  objeto.traverseVisible((o) => { if (o.isMesh) caja.expandByObject(o); });
  return caja;
}

export async function cargarEdificio(ctx, slot, opciones = {}) {
  const luz = typeof opciones.aplicarMaterial === 'function' ? opciones : (opciones.luz || null);
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
  const [units, disponibilidad, bim] = await Promise.all([
    opciones.unitsById ? null : cargarJSON(slot.units || 'data/units.json', false),
    opciones.estados ? null : cargarJSON(slot.availability || 'data/availability.json', true),
    loadBIM(scene, opciones.url || slot.bim || 'assets/apolo_levels.glb'),
  ]);
  const unitsById = opciones.unitsById || new Map(units.map((u) => [u.id, u]));
  const listaUnits = units || [...unitsById.values()];
  const estados = Object.assign({}, opciones.estados || disponibilidad || {});

  /* loadBIM cuelga el grupo de la escena oculto; aquí pasa al grupo del
     edificio y se muestra: es el modelo por defecto, no una capa opcional. */
  grupo.add(bim.group);
  bim.group.visible = true;

  /* ── Envolventes y cartelas ── */
  const { viviendas, plantas } = crearEnvolventes(grupo, unitsById, capaCartelas);
  scene.updateMatrixWorld(true);
  for (const v of viviendas.values()) v.caja = new THREE.Box3().setFromObject(v.mesh);

  /* ── Niveles: la lista de mallas por nivel es lo que consumen cortes.js
     y el trazador; byCat/mats/holders son los de loadBIM ── */
  const niveles = new Map();
  for (const [clave, L] of bim.levels) {
    const meshes = L.holders.map((h) => h.children[0]).filter((m) => m?.isMesh);
    niveles.set(clave, { holders: L.holders, mats: L.mats, byCat: L.byCat, meshes });
  }

  /* ── Vidrio por vivienda ── */
  const vidrio = { asignados: 0, comunes: 0, rescatados: 0, ms: 0, porNivel: {} };
  const tVidrio = performance.now();
  for (const [clave, nivel] of niveles) {
    const glass = nivel.byCat.glass;
    const vidrioMesh = nivel.meshes.find((m) => m.material === glass);
    if (!vidrioMesh) continue;
    glass.emissive.setHex(EMISIVO_VENTANA);
    glass.emissiveIntensity = 0;
    /* Candidatas: TODAS las viviendas, no solo las de la planta homónima. El
       terreno cae de oeste a este y el edificio se escalona: la planta lógica
       'baja' de un tramo del oeste está a la cota del nivel 'p1' de Revit, y
       el pipeline reparte el vidrio por nivel de Revit. Las cajas ya llevan la
       cota real de cada tramo (floorYAt), así que la posición decide. */
    const r = repartirVidrio(nivel, clave, vidrioMesh, [...viviendas.values()], nivel.byCat, luz);
    vidrio.asignados += r.asignados; vidrio.comunes += r.comunes; vidrio.rescatados += r.rescatados;
    vidrio.porNivel[clave] = r;
  }
  vidrio.ms = Math.round(performance.now() - tVidrio);

  /* ── Registro en luz (CSM y transiciones de envMapIntensity) ── */
  if (luz) {
    for (const nivel of niveles.values()) for (const m of Object.values(nivel.byCat)) luz.aplicarMaterial(m);
    for (const v of viviendas.values()) luz.aplicarMaterial(v.mesh.material);
  }

  const pickables = [...viviendas.values()].map((v) => v.mesh);
  let ultimo = { hover: null, seleccionada: null, atenuada: null };
  let cartelasDe = null;

  const edificio = {
    grupo, niveles, viviendas, estados, pickables, vidrio, units: listaUnits, unitsById,
    ventanas: false,
    caja: cajaVisible(bim.group),
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

    tramoDe(mesh) {
      const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      const i = SECTIONS.findIndex((s) => c.x >= s.x0 && c.x < s.x1);
      return i >= 0 ? i : null;
    },

    /* Saca el edificio de la escena y libera lo que creó (geometrías del GLB
       y del reparto, materiales por nivel y por vivienda, texturas de las
       cartelas). Los materiales quedan registrados en luz.materiales si se
       pasó luz: no hay API para darlos de baja, pero un material sin malla
       no cuesta nada más que la entrada en el Set. */
    destruir() {
      scene.remove(grupo);
      const materiales = new Set();
      grupo.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (!m) return;
        for (const x of Array.isArray(m) ? m : [m]) materiales.add(x);
      });
      for (const m of materiales) { m.map?.dispose(); m.dispose(); }
      viviendas.clear();
      pickables.length = 0;
    },
  };
  edificio.pintar(ultimo);
  return edificio;
}
