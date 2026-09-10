/* ═══════════════════════════════════════════════════════════════════════════
   modelo.js — El modelo del cliente (SketchUp v6) en el visor clásico.

   Sustituye a lo que había antes: el volumen procedural de building.js, el
   BIM de Revit (apolo_levels.glb), el contexto inventado de context.js, el
   levantamiento de topo.js y las teselas de Google. Ahora el edificio, el
   mobiliario y todo el entorno (terreno, costa, los otros cuatro edificios
   de SERENEA, calles y arbolado) salen del mismo GLB que entrega el cliente,
   con sus materiales, y las viviendas son los prismas exactos medidos sobre
   los tabiques (data/viviendas_serenea.json).

   Lo que NO cambia es el aspecto del visor clásico: la luz, el cielo, la
   oclusión y el bloom siguen siendo los de siempre, que es lo que lo hace
   ligero. Este módulo solo pone geometría en la escena.

   Ficheros (assets/serenea/, los mismos que usa el visor nuevo):
     entorno.glb              terreno, costa, vecinos y los otros edificios
     apolo_envolvente.glb     muros, forjados, carpinterías y vidrios
     apolo_mobiliario.glb     mobiliario y puertas (nunca se cortan)
     apolo_corte_<planta>.glb la envolvente ya cortada por la cota de cada
                              cajón: al elegir planta se cambia el fichero
                              entero, que es más barato que recortar en vivo

   Marco: todo va en las coordenadas del SketchUp dentro de un grupo que se
   desplaza para que el centro de Apolo caiga en el origen de la escena, que
   es donde el visor clásico espera encontrar el edificio.

   Nombres de malla (contrato de tools/build_serenea.mjs):
     <cat>__T<plataforma>__<material>                  envolvente y variantes
     vidrio__T<plat>__<n>__<xcm>_<ycm>_<zcm>           un vidrio por hueco
     mob|puerta__T<plat>__Y<franja>__<mat>__y<ymin>    mobiliario y puertas
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const RUTAS = {
  modelo: 'data/serenea_modelo.json',
  cortes: 'data/cortes.json',
  viviendas: 'data/viviendas_serenea.json',
  entorno: 'assets/serenea/entorno.glb',
  envolvente: 'assets/serenea/apolo_envolvente.glb',
  mobiliario: 'assets/serenea/apolo_mobiliario.glb',
  variantes: {
    baja: 'assets/serenea/apolo_corte_baja.glb',
    p1: 'assets/serenea/apolo_corte_p1.glb',
    p2: 'assets/serenea/apolo_corte_p2.glb',
    atico: 'assets/serenea/apolo_corte_atico.glb',
  },
};

const RE_VIDRIO = /^vidrio__T(\d+)__(\d+)__(-?\d+)_(-?\d+)_(-?\d+)$/;
const RE_MOB = /__y(-?\d+)$/;                 // cota mínima de la pieza, en cm
const ES_VIDRIO = /vidrio/i;
const EMISIVO_VENTANA = 0xffd9a0;
const INTENSIDAD_VENTANA = 1.25;
const DISTANCIA_VIDRIO = 0.45;   // m: hasta dónde se admite un vidrio fuera de la huella
const RANGO_Y_VIDRIO = [-0.5, 3.2];
const COLOR_PRISMA = new THREE.Color(0xe9e7e1);
const EPS = 0.001;

/* ── Geometría de apoyo ────────────────────────────────────────────────── */

function dentroDePoligono(poligono, x, z) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, zi] = poligono[i], [xj, zj] = poligono[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dentro = !dentro;
  }
  return dentro;
}

/* 0 dentro de la huella; fuera, la distancia mínima a sus lados. */
function distanciaAPoligono(poligono, x, z) {
  if (dentroDePoligono(poligono, x, z)) return 0;
  let mejor = Infinity;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [ax, az] = poligono[j], [bx, bz] = poligono[i];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const px = ax + t * dx - x, pz = az + t * dz - z;
    mejor = Math.min(mejor, px * px + pz * pz);
  }
  return Math.sqrt(mejor);
}

/* Centroide por área con signo; si cae fuera (viviendas en L o en U), el
   punto interior más cercano al centro de la caja. Es donde va la cartela. */
function centroideInterior(poligono) {
  let area = 0, cx = 0, cz = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, zi] = poligono[i], [xj, zj] = poligono[j];
    const f = xj * zi - xi * zj;
    area += f; cx += (xj + xi) * f; cz += (zj + zi) * f;
    minX = Math.min(minX, xi); maxX = Math.max(maxX, xi);
    minZ = Math.min(minZ, zi); maxZ = Math.max(maxZ, zi);
  }
  const centroCaja = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  if (Math.abs(area) > 1e-9) {
    cx /= 3 * area; cz /= 3 * area;
    if (dentroDePoligono(poligono, cx, cz)) return [cx, cz];
  }
  let mejor = null, dMejor = Infinity;
  for (let x = minX + 0.125; x < maxX; x += 0.25) for (let z = minZ + 0.125; z < maxZ; z += 0.25) {
    if (!dentroDePoligono(poligono, x, z)) continue;
    const d = (x - centroCaja[0]) ** 2 + (z - centroCaja[1]) ** 2;
    if (d < dMejor) { dMejor = d; mejor = [x, z]; }
  }
  return mejor || centroCaja;
}

/* La Shape va en (x, −z) porque rotateX(−90°) manda (x, s, d) a (x, d, −s);
   la extrusión pasa a +Y y se sube a y0. Así el prisma cae exactamente sobre
   la huella medida, sin holguras. */
function geometriaPrisma(poligono, y0, y1) {
  const forma = new THREE.Shape();
  poligono.forEach(([x, z], i) => (i ? forma.lineTo(x, -z) : forma.moveTo(x, -z)));
  forma.closePath();
  const geo = new THREE.ExtrudeGeometry(forma, { depth: Math.max(0.05, y1 - y0), bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  geo.computeBoundingBox();
  return geo;
}

/* Cartela: caja con rabito y el número, dibujada en la capa 1 (pasada aparte,
   sin bloom y por encima de todo), igual que en el visor de siempre. */
function crearCartela(texto, fondo) {
  const cv = document.createElement('canvas');
  cv.width = 224; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.shadowColor = 'rgba(17,17,18,0.3)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
  ctx.fillStyle = fondo;
  const x0 = 42, y0 = 14, x1 = 182, y1 = 92;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1);
  ctx.lineTo(125, y1); ctx.lineTo(112, y1 + 19); ctx.lineTo(99, y1); ctx.lineTo(x0, y1);
  ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 42px "Open Sans", "Segoe UI", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(texto, 112, 54);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  sp.scale.set(3.4, 1.94, 1);
  sp.layers.set(1);
  return sp;
}

/* Cajón (plataforma) de cortes.json que contiene un punto en planta. */
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

let cargador = null;
function cargarGLB(url, onProgreso) {
  if (!cargador) cargador = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return new Promise((res, rej) => cargador.load(url, res, onProgreso, rej));
}
const leerJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); });

/* ── Materiales ────────────────────────────────────────────────────────── */

/* Vidrio real: reflejo con Fresnel del HDRI y capa especular encima, con el
   tinte verdoso del vidrio flotado. Es el mismo criterio que tenía el visor
   clásico con el BIM; lo que cambia es que ahora hay uno por vivienda para
   poder encender sus ventanas por la noche. */
function crearVidrio() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x2c3b3e, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.42,
    envMapIntensity: 2.4, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.02,
    ior: 1.52, reflectivity: 0.62, emissive: EMISIVO_VENTANA, emissiveIntensity: 0,
  });
  m.userData.baseOpacity = m.opacity;
  return m;
}

/* Los materiales del SketchUp se usan tal cual; solo se les quita el
   alphaTest que GLTFLoader pone a los MASK (las texturas son opacas y el
   `discard` mata el early-z) y se anota su estado de origen. */
function prepararMaterial(m) {
  if (!m || m.userData.preparado) return m;
  m.userData.preparado = true;
  if (m.alphaTest > 0 && !m.transparent) m.alphaTest = 0;
  m.envMapIntensity = m.envMapIntensity ?? 1;
  m.userData.baseEnv = m.envMapIntensity;
  m.userData.baseColor = m.color?.clone();
  m.userData.baseOpacity = m.opacity;
  return m;
}

/* ── Carga ─────────────────────────────────────────────────────────────── */

export async function cargarModelo(scene, unitsById, { estadoDe = () => 'disponible', onProgreso = () => {}, plantasBajoDemanda = false } = {}) {
  onProgreso('Descargando el modelo…', 0);
  const [modelo, definicionCortes, datos, gEntorno, gEnvolvente] = await Promise.all([
    leerJSON(RUTAS.modelo), leerJSON(RUTAS.cortes), leerJSON(RUTAS.viviendas),
    cargarGLB(RUTAS.entorno), cargarGLB(RUTAS.envolvente),
  ]);
  onProgreso('Montando el edificio…', 0.7);

  const centro = modelo.apolo.centro;
  const grupo = new THREE.Group();
  grupo.name = 'serenea';
  grupo.position.set(-centro[0], 0, -centro[2]); // el centro de Apolo, en el origen de la escena
  scene.add(grupo);

  const materiales = new Map();
  const tramos = Object.values(definicionCortes.plantas)[0] || [];

  /* Adopta un GLB: prepara materiales, sombras y quita el picking (que va
     solo por los prismas de vivienda). */
  const adoptar = (raiz, { sombras = true, lejos = false } = {}) => {
    const mallas = [];
    raiz.traverse((o) => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { prepararMaterial(m); if (m?.name) materiales.set(m.name, m); }
      // El terreno lejano no proyecta sombra: el mapa de sombras cubre la
      // parcela, y hacerle sitio a 5 km de costa lo dejaría inservible.
      const cerca = !lejos || (o.geometry.boundingSphere ?? (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere)).radius < 400;
      o.castShadow = sombras && cerca;
      o.receiveShadow = true;
      o.raycast = () => {};
      mallas.push(o);
    });
    return mallas;
  };

  const entorno = gEntorno.scene;
  entorno.name = 'entorno';
  adoptar(entorno, { sombras: false, lejos: true });
  grupo.add(entorno);

  const envolvente = gEnvolvente.scene;
  envolvente.name = 'envolvente';
  const mallasEnvolvente = adoptar(envolvente);
  grupo.add(envolvente);

  /* ── Prismas de vivienda (data/viviendas_serenea.json) ── */
  const viviendas = new Map();
  const unitMeshes = new Map();
  const pickables = [];
  const plantas = new Map();
  const suelos = {};
  for (const [id, d] of Object.entries(datos.viviendas || {})) {
    const u = unitsById.get(id);
    const poligono = d.poligono || [];
    if (!u || poligono.length < 3) continue;
    if (!plantas.has(d.planta)) {
      const g = new THREE.Group(); g.name = 'viviendas-' + d.planta;
      const cartelas = new THREE.Group(); cartelas.name = 'cartelas'; cartelas.visible = false;
      g.add(cartelas); grupo.add(g);
      plantas.set(d.planta, { grupo: g, cartelas });
      suelos[d.planta] = [];
    }
    const P = plantas.get(d.planta);
    /* Por cajón (plataforma), no en una lista suelta: la cámara y los
       encuadres necesitan saber a qué cota está el suelo en cada tramo. */
    const plat = d.plataforma ?? 0;
    suelos[d.planta][plat] = Math.min(suelos[d.planta][plat] ?? Infinity, d.y0);
    const mat = new THREE.MeshStandardMaterial({
      color: COLOR_PRISMA.clone(), roughness: 0.55, metalness: 0, emissive: 0x000000,
      transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometriaPrisma(poligono, d.y0, d.y1), mat);
    mesh.name = 'vivienda-' + id;
    mesh.renderOrder = 50; // por delante de la fachada: el realce se ve desde fuera
    mesh.userData = { unitId: id, floorKey: d.planta };
    P.grupo.add(mesh);
    const centroide = centroideInterior(poligono);
    const label = crearCartela(id, '#24873f');
    label.position.set(centroide[0], d.y1 + 1.3, centroide[1]);
    const labelR = crearCartela(id, '#e0862b');
    labelR.position.copy(label.position);
    label.visible = false; labelR.visible = false;
    P.cartelas.add(label, labelR);
    mesh.userData.label = label; mesh.userData.labelR = labelR;
    const caja = mesh.geometry.boundingBox.clone();
    viviendas.set(id, { id, mesh, floorKey: d.planta, poligono, y0: d.y0, y1: d.y1, caja,
      plataforma: d.plataforma ?? plataformaEn(tramos, centroide[0], centroide[1]),
      unidad: u, vidrio: null, mallasVidrio: [], entrada: d.entrada || null });
    unitMeshes.set(id, mesh);
    pickables.push(mesh);
  }

  /* ── Vidrio por vivienda: el centro que trae el nombre, contra la huella ── */
  const vidrioComun = crearVidrio();
  vidrioComun.name = 'vidrio-comun';
  const vidrio = { total: 0, asignados: 0, comunes: 0, viviendasConVidrio: 0, sinVidrio: [] };
  const candidatas = [...viviendas.values()];
  const vidrioPorNombre = new Map();
  const asignarVidrios = (mallas) => {
    for (const m of mallas) {
      const r = RE_VIDRIO.exec(m.name);
      if (!r) continue;
      const yaVisto = vidrioPorNombre.get(m.name);
      if (yaVisto !== undefined) { m.material = yaVisto || vidrioComun; continue; }
      vidrio.total++;
      const x = +r[3] / 100, y = +r[4] / 100, z = +r[5] / 100;
      let mejor = null, dMejor = Infinity;
      for (const v of candidatas) {
        if (y < v.y0 + RANGO_Y_VIDRIO[0] || y > v.y0 + RANGO_Y_VIDRIO[1]) continue;
        if (x < v.caja.min.x - DISTANCIA_VIDRIO || x > v.caja.max.x + DISTANCIA_VIDRIO
          || z < v.caja.min.z - DISTANCIA_VIDRIO || z > v.caja.max.z + DISTANCIA_VIDRIO) continue;
        const d = distanciaAPoligono(v.poligono, x, z);
        if (d <= DISTANCIA_VIDRIO && d < dMejor) { dMejor = d; mejor = v; }
      }
      if (!mejor) { vidrio.comunes++; vidrioPorNombre.set(m.name, null); m.material = vidrioComun; continue; }
      if (!mejor.vidrio) {
        const mat = crearVidrio();
        mat.name = 'vidrio-' + mejor.id;
        mat.userData.unitId = mejor.id;
        mejor.vidrio = mat;
        vidrio.viviendasConVidrio++;
      }
      m.material = mejor.vidrio;
      mejor.mallasVidrio.push(m);
      vidrioPorNombre.set(m.name, mejor.vidrio);
      vidrio.asignados++;
    }
  };
  asignarVidrios(mallasEnvolvente);
  vidrio.sinVidrio = candidatas.filter((v) => !v.vidrio).map((v) => v.id);

  /* ── Estado ── */
  const variantes = new Map();
  const pendientes = new Map();
  let mobiliario = null;
  const piezasMob = [];   // { mesh, ymin, plataforma }
  let planta = 'all';
  let noche = false;

  const cotasDe = (clave) => (clave === 'all' ? null : definicionCortes.plantas[clave]?.map((t) => t.y) || null);

  function aplicarMobiliario() {
    const cotas = cotasDe(planta);
    for (const p of piezasMob) p.mesh.visible = !cotas || p.ymin < cotas[p.plataforma] - EPS;
  }

  function aplicarPlanta() {
    const enPlanta = planta !== 'all';
    envolvente.visible = !enPlanta;
    for (const [clave, obj] of variantes) obj.visible = enPlanta && clave === planta;
    for (const [clave, P] of plantas) P.cartelas.visible = clave === planta;
    aplicarMobiliario();
  }

  function aplicarNoche() {
    for (const v of viviendas.values()) {
      if (!v.vidrio) continue;
      const encendida = noche && estadoDe(v.id) !== 'vendida';
      v.vidrio.emissiveIntensity = encendida ? INTENSIDAD_VENTANA : 0;
    }
    vidrioComun.emissiveIntensity = 0;
  }

  const caja = new THREE.Box3(
    new THREE.Vector3(modelo.apolo.min[0], modelo.apolo.min[1], modelo.apolo.min[2]),
    new THREE.Vector3(modelo.apolo.max[0], modelo.apolo.max[1], modelo.apolo.max[2])
  ).translate(grupo.position);

  const M = {
    grupo, entorno, envolvente, variantes, viviendas, unitMeshes, pickables, plantas,
    materiales, vidrio, definicionCortes, suelos, caja, centro,
    get planta() { return planta; },
    get mobiliario() { return mobiliario; },

    /* Aislar una planta = cambiar la envolvente entera por la variante ya
       cortada y ocultar el mobiliario que quede por encima del corte. Sin
       elevar plantas ni fundir nada: el corte del cliente manda. */
    setFloor(clave) {
      planta = clave;
      /* Con las plantas bajo demanda (móvil) la variante se pide al elegirla;
         hasta que llega se sigue viendo la envolvente completa. */
      if (clave !== 'all' && !variantes.has(clave)) M.cargarVariante(clave);
      aplicarPlanta();
    },

    /* Una planta cortada, a petición. */
    async cargarVariante(clave) {
      const url = RUTAS.variantes[clave];
      if (!url || variantes.has(clave)) return variantes.get(clave) || null;
      if (pendientes.has(clave)) return pendientes.get(clave);
      const tarea = cargarGLB(url).then((g) => {
        const obj = g.scene;
        obj.name = 'corte-' + clave;
        obj.visible = false;
        asignarVidrios(adoptar(obj));
        variantes.set(clave, obj);
        grupo.add(obj);
        aplicarPlanta();
        aplicarNoche();
        return obj;
      }).catch((e) => { console.warn('[apolo] planta ' + clave + ':', e); return null; })
        .finally(() => pendientes.delete(clave));
      pendientes.set(clave, tarea);
      return tarea;
    },

    setNight(on) { noche = !!on; aplicarNoche(); },
    refrescarEstados() { aplicarNoche(); },

    /* Cota mínima a la que se admite la cámara en un punto: el suelo de la
       planta baja de ese cajón más un metro. El terreno se escalona de oeste
       a este casi cinco metros, así que un número fijo no vale: o dejaba la
       cámara bajo el edificio en el extremo alto o la levantaba de más en el
       bajo. */
    sueloEn(x, z) {
      const s = suelos.baja;
      if (!s || !s.length) return caja.min.y + 1;
      return s[Math.min(plataformaEn(tramos, x - grupo.position.x, z - grupo.position.z), s.length - 1)] + 1;
    },

    /* Cota del suelo y del corte de una planta, para encuadrar la cámara. */
    cotasPlanta(clave) {
      const cotas = cotasDe(clave);
      const s = [...(suelos[clave] || [])].filter(Number.isFinite);
      return {
        suelo: s.length ? Math.min(...s) : (cotas ? Math.min(...cotas) - 3 : caja.min.y),
        corte: cotas ? Math.max(...cotas) : caja.max.y,
      };
    },

    /* Lo pesado llega después de la primera imagen: mobiliario (15 MB) y las
       cuatro variantes (6-11 MB cada una). Mientras no estén, el visor
       funciona con la envolvente completa. */
    async cargarSecundarios(onPaso = () => {}) {
      const gMob = await cargarGLB(RUTAS.mobiliario);
      mobiliario = gMob.scene;
      mobiliario.name = 'mobiliario';
      for (const m of adoptar(mobiliario)) {
        const r = RE_MOB.exec(m.name);
        const cajaM = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox);
        const ymin = r ? +r[1] / 100 : cajaM.min.y;
        const cx = (cajaM.min.x + cajaM.max.x) / 2, cz = (cajaM.min.z + cajaM.max.z) / 2;
        piezasMob.push({ mesh: m, ymin, plataforma: plataformaEn(tramos, cx, cz) });
      }
      grupo.add(mobiliario);
      aplicarMobiliario();
      onPaso('mobiliario');
      /* En el móvil no se descargan las cuatro de golpe: son 35 MB de
         geometría que la tarjeta del teléfono no tiene por qué sostener. */
      if (!plantasBajoDemanda) {
        for (const clave of Object.keys(RUTAS.variantes)) {
          await M.cargarVariante(clave);
          onPaso(clave);
        }
      }
      aplicarPlanta();
    },
  };

  aplicarPlanta();
  aplicarNoche();
  return M;
}
