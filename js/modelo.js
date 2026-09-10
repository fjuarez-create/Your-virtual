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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { limitarMaterial } from 'app/texturas.js';

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
const RE_PLATAFORMA = /__T(\d+)__/;           // cajón al que pertenece la pieza
const ES_VIDRIO = /vidrio/i;
const EMISIVO_VENTANA = 0xffd9a0;
const INTENSIDAD_VENTANA = 1.25;
const DISTANCIA_VIDRIO = 0.45;   // m: hasta dónde se admite un vidrio fuera de la huella
const RANGO_Y_VIDRIO = [-0.5, 3.2];
const COLOR_PRISMA = new THREE.Color(0xe9e7e1);
const EPS = 0.001;
/* Entorno lejano: más allá de este radio (en planta, desde el centro
   geométrico de la parcela de Apolo) nada recibe sombra y las texturas bajan
   a TEXTURA_LEJOS. El pueblo llega a cinco kilómetros y se estaba dibujando
   con la misma ortofoto que el suelo que se pisa. */
const RADIO_VISION = 200;        // m: círculo de visita, la cámara no sale de ahí
const REJILLA_PASO = 1.5;        // m de lado de la casilla del mapa de alturas
const HOLGURA_SUELO = 1.5;       // m que la cámara guarda por encima de lo que tenga debajo
const RADIO_CERCA = 200;
const TEXTURA_LEJOS = 512;

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
  /* Sin anisotropía ni mipmaps: la cartela es un billboard que se ve casi
     siempre al mismo tamaño, así que la pirámide de mipmaps solo era memoria.
     Son 332 lienzos (166 viviendas × verde y naranja) y cada mip cuesta. */
  tex.anisotropy = 1;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
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

/* ── Fusión del entorno ──────────────────────────────────────────────────
   El entorno del cliente son más de dos mil mallas (una por trozo de terreno,
   acera, bordillo, edificio vecino…). Cada una es una llamada de dibujo, y en
   un teléfono eso pesa más que los triángulos. Se fusionan por material, que
   deja unas noventa: la imagen es idéntica y el trabajo por fotograma cae a
   una vigésima parte. Las posiciones se pasan a coordenadas de mundo porque
   cada malla trae su propia matriz (y el GLB las cuantiza a enteros). */
function geometriaEnMundo(mesh, conUV) {
  const g = mesh.geometry;
  const salida = new THREE.BufferGeometry();
  const pos = g.attributes.position;
  const posiciones = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    posiciones[i * 3] = v.x; posiciones[i * 3 + 1] = v.y; posiciones[i * 3 + 2] = v.z;
  }
  salida.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  const normal = g.attributes.normal;
  const normales = new Float32Array(pos.count * 3);
  const m3 = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for (let i = 0; i < pos.count; i++) {
    if (normal) v.fromBufferAttribute(normal, i).applyMatrix3(m3); else v.set(0, 1, 0);
    if (!Number.isFinite(v.x + v.y + v.z) || v.lengthSq() < 1e-8) v.set(0, 1, 0); else v.normalize();
    normales[i * 3] = v.x; normales[i * 3 + 1] = v.y; normales[i * 3 + 2] = v.z;
  }
  salida.setAttribute('normal', new THREE.BufferAttribute(normales, 3));
  if (conUV) {
    const uv = g.attributes.uv;
    const uvs = new Float32Array(pos.count * 2);
    if (uv) for (let i = 0; i < pos.count; i++) { uvs[i * 2] = uv.getX(i); uvs[i * 2 + 1] = uv.getY(i); }
    salida.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  const idx = g.index;
  const indices = idx ? Array.from(idx.array) : Array.from({ length: pos.count }, (_, i) => i);
  salida.setIndex(indices);
  return salida;
}

/* ── Mapa de alturas ──
   Rejilla en planta con la cota más alta que hay debajo de cada casilla:
   terreno, calles, vecinos y la envolvente de Apolo. Es el suelo que la
   cámara no atraviesa. Como un pájaro: por un patio interior se baja (encima
   del patio lo más alto es su propio pavimento), pero un muro es una casilla
   a la altura de la cubierta y no se pasa. Cada triángulo se muestrea por su
   plano en el centro de la casilla, acotado a su propio alto: el terreno
   queda a su cota real y los paños verticales, a la de su borde superior. */
const alturas = { x0: 0, z0: 0, paso: REJILLA_PASO, n: 0, datos: null };

function rejillaVacia(cx, cz, radio) {
  const n = Math.max(8, Math.ceil((radio * 2) / REJILLA_PASO) + 2);
  alturas.n = n;
  alturas.x0 = cx - (n * REJILLA_PASO) / 2;
  alturas.z0 = cz - (n * REJILLA_PASO) / 2;
  alturas.datos = new Float32Array(n * n).fill(-Infinity);
}

function marcarGeometria(g, matriz) {
  const pos = g.getAttribute('position');
  if (!pos) return;
  const idx = g.index;
  const cuenta = idx ? idx.count : pos.count;
  const { n, x0, z0, paso, datos } = alturas;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < cuenta; t += 3) {
    const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    if (matriz) { a.applyMatrix4(matriz); b.applyMatrix4(matriz); c.applyMatrix4(matriz); }
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
    const minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
    let i0 = Math.floor((minX - x0) / paso), i1 = Math.floor((maxX - x0) / paso);
    let j0 = Math.floor((minZ - z0) / paso), j1 = Math.floor((maxZ - z0) / paso);
    if (i1 < 0 || j1 < 0 || i0 >= n || j0 >= n) continue;
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(n - 1, i1); j1 = Math.min(n - 1, j1);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 40000) continue;
    const minY = Math.min(a.y, b.y, c.y), maxY = Math.max(a.y, b.y, c.y);
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const plano = Math.abs(ny) > 1e-6;
    const d = nx * a.x + ny * a.y + nz * a.z;
    for (let j = j0; j <= j1; j++) {
      const cz = z0 + (j + 0.5) * paso;
      for (let i = i0; i <= i1; i++) {
        const cx = x0 + (i + 0.5) * paso;
        let y = maxY;
        if (plano) {
          y = (d - nx * cx - nz * cz) / ny;
          if (!(y >= minY)) y = minY; else if (y > maxY) y = maxY;
        }
        const k = j * n + i;
        if (y > datos[k]) datos[k] = y;
      }
    }
  }
}

function alturaEn(x, z) {
  const { n, x0, z0, paso, datos } = alturas;
  if (!datos) return -Infinity;
  const i = Math.floor((x - x0) / paso), j = Math.floor((z - z0) / paso);
  if (i < 0 || j < 0 || i >= n || j >= n) return -Infinity;
  return datos[j * n + i];
}

/* Reparte los triángulos de una geometría según su centroide caiga dentro o
   fuera del radio, medido en planta desde (cx, cz). Devuelve [dentro, fuera]
   con los vértices compactados; cualquiera de los dos puede ser null. */
function partirPorRadio(g, cx, cz, radio) {
  const pos = g.getAttribute('position');
  const idx = g.index;
  const tri = idx.count / 3;
  const r2 = radio * radio;
  const marca = new Uint8Array(tri);
  const ia = idx.array, pa = pos.array;
  let dentro = 0;
  for (let t = 0; t < tri; t++) {
    const a = ia[t * 3] * 3, b = ia[t * 3 + 1] * 3, c = ia[t * 3 + 2] * 3;
    const x = (pa[a] + pa[b] + pa[c]) / 3 - cx;
    const z = (pa[a + 2] + pa[b + 2] + pa[c + 2]) / 3 - cz;
    if (x * x + z * z <= r2) { marca[t] = 1; dentro++; }
  }
  if (dentro === tri) return [g, null];
  if (dentro === 0) return [null, g];
  return [extraerTriangulos(g, marca, 1, dentro), extraerTriangulos(g, marca, 0, tri - dentro)];
}

function extraerTriangulos(g, marca, valor, cuenta) {
  const idx = g.index.array;
  const nombres = ['position', 'normal', 'uv'].filter((n) => g.getAttribute(n));
  const mapa = new Int32Array(g.getAttribute('position').count).fill(-1);
  const indice = new Uint32Array(cuenta * 3);
  let v = 0, k = 0;
  for (let t = 0; t < marca.length; t++) {
    if (marca[t] !== valor) continue;
    for (let j = 0; j < 3; j++) {
      const orig = idx[t * 3 + j];
      if (mapa[orig] < 0) mapa[orig] = v++;
      indice[k++] = mapa[orig];
    }
  }
  const salida = new THREE.BufferGeometry();
  for (const nombre of nombres) {
    const atr = g.getAttribute(nombre);
    const n = atr.itemSize;
    const datos = new Float32Array(v * n);
    for (let i = 0; i < mapa.length; i++) {
      const d = mapa[i];
      if (d < 0) continue;
      for (let j = 0; j < n; j++) datos[d * n + j] = atr.array[i * n + j];
    }
    salida.setAttribute(nombre, new THREE.BufferAttribute(datos, n));
  }
  salida.setIndex(new THREE.BufferAttribute(indice, 1));
  return salida;
}

/* Copia reducida de una textura en un lienzo. La original no se toca: la
   sigue usando la mitad cercana del entorno. */
const reducidas = new Map();
function reducirTextura(tex, maxLado) {
  if (!tex || tex.isCompressedTexture) return tex;
  const img = tex.image;
  const w = img?.width | 0, h = img?.height | 0;
  if (!w || !h || Math.max(w, h) <= maxLado) return tex;
  if (reducidas.has(tex)) return reducidas.get(tex);
  const k = maxLado / Math.max(w, h);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(w * k));
  lienzo.height = Math.max(1, Math.round(h * k));
  const g2d = lienzo.getContext('2d');
  if (!g2d) return tex;
  g2d.imageSmoothingEnabled = true;
  g2d.imageSmoothingQuality = 'high';
  try { g2d.drawImage(img, 0, 0, lienzo.width, lienzo.height); } catch (e) { return tex; }
  const t = new THREE.Texture(lienzo);
  t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.colorSpace = tex.colorSpace; t.flipY = tex.flipY;
  t.premultiplyAlpha = tex.premultiplyAlpha;
  t.offset.copy(tex.offset); t.repeat.copy(tex.repeat);
  t.center.copy(tex.center); t.rotation = tex.rotation;
  t.channel = tex.channel;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  reducidas.set(tex, t);
  return t;
}

const MAPAS_LEJOS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
function materialLejano(mat) {
  const m = mat.clone();
  m.name = `${mat.name || 'entorno'}_lejos`;
  for (const clave of MAPAS_LEJOS) if (m[clave]) m[clave] = reducirTextura(m[clave], TEXTURA_LEJOS);
  return m;
}

function fusionarPorMaterial(raiz, centro) {
  raiz.updateMatrixWorld(true);
  const porMaterial = new Map();
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!porMaterial.has(m)) porMaterial.set(m, []);
    porMaterial.get(m).push(o);
  });
  const grupo = new THREE.Group();
  grupo.name = raiz.name;
  let mallas = 0;
  for (const [material, lista] of porMaterial) {
    const conUV = !!material.map;
    const cerca = [], lejos = [];
    for (const o of lista) {
      const g = geometriaEnMundo(o, conUV);
      const [dentro, fuera] = partirPorRadio(g, centro[0], centro[1], RADIO_CERCA);
      if (dentro) cerca.push(dentro);
      if (fuera) lejos.push(fuera);
      if (dentro !== g && fuera !== g) g.dispose();
    }
    const añadir = (geos, lejano) => {
      if (!geos.length) return;
      const fusionada = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!fusionada) { for (const g of geos) g.dispose(); return; }
      for (const g of geos) if (g !== fusionada) g.dispose();
      fusionada.computeBoundingBox(); fusionada.computeBoundingSphere();
      const mesh = new THREE.Mesh(fusionada, lejano ? materialLejano(material) : material);
      mesh.name = `entorno_${material.name || mallas}${lejano ? '_lejos' : ''}`;
      mesh.userData.lejos = lejano;
      grupo.add(mesh);
      mallas++;
    };
    añadir(cerca, false);
    añadir(lejos, true);
  }
  raiz.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  grupo.userData.mallas = mallas;
  return grupo;
}

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
  m.userData.sinTraseras = true;   // por dentro se vería opaco
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

export async function cargarModelo(scene, unitsById, { estadoDe = () => 'disponible', onProgreso = () => {}, plantasBajoDemanda = false, texturaMax = 0 } = {}) {
  onProgreso('Descargando el modelo…', 0);
  const [modelo, definicionCortes, datos, gEntorno, gEnvolvente] = await Promise.all([
    leerJSON(RUTAS.modelo), leerJSON(RUTAS.cortes), leerJSON(RUTAS.viviendas),
    cargarGLB(RUTAS.entorno), cargarGLB(RUTAS.envolvente),
  ]);
  onProgreso('Montando el edificio…', 0.7);

  const centro = modelo.apolo.centro;
  /* Centro geométrico de la parcela (la unión de los ocho cajones): es la
     referencia del radio que separa el entorno cercano del lejano. */
  const cajones = modelo.plataformas || [];
  const centroParcela = cajones.length
    ? [(Math.min(...cajones.map((c) => c.x0)) + Math.max(...cajones.map((c) => c.x1))) / 2,
       (Math.min(...cajones.map((c) => c.z0)) + Math.max(...cajones.map((c) => c.z1))) / 2]
    : [centro[0], centro[2]];
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
      for (const m of ms) { limitarMaterial(m, texturaMax); prepararMaterial(m); if (m?.name) materiales.set(m.name, m); }
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

  const bruto = gEntorno.scene;
  bruto.name = 'entorno';
  adoptar(bruto, { sombras: false, lejos: true });
  const entorno = fusionarPorMaterial(bruto, [centroParcela[0], centroParcela[1]]);
  for (const o of entorno.children) { o.castShadow = false; o.receiveShadow = !o.userData.lejos; o.raycast = () => {}; }
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

  /* ── Recorte del mobiliario ──
     La envolvente llega ya cortada del pipeline, pero el mobiliario y las
     puertas no: son los mismos ficheros para las cuatro plantas, así que
     cortarlos ahí obligaría a guardar cuatro copias. Se cortan aquí, en la
     tarjeta: un plano horizontal por cajón, a la cota de corte de la planta
     activa. Sin él, una puerta de 2,1 m o un armario de 2,2 m asomaban
     enteros por encima del corte, que es justo lo que no debe pasar.
     Los planos están siempre puestos (con la cota en el infinito cuando no
     se corta) para que el programa del material no se recompile al cambiar
     de planta. */
  const planosCorte = Array.from({ length: 8 }, () => new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6));
  const materialesRecortados = new Map();
  function materialRecortado(material, plataforma) {
    if (!material) return material;
    const clave = material.uuid + '|' + plataforma;
    let c = materialesRecortados.get(clave);
    if (!c) {
      c = material.clone();          // las texturas se comparten: no ocupa más en la tarjeta
      c.clippingPlanes = [planosCorte[Math.min(plataforma, planosCorte.length - 1)]];
      c.clipShadows = true;
      materialesRecortados.set(clave, c);
    }
    return c;
  }

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
    for (let i = 0; i < planosCorte.length; i++) {
      planosCorte[i].constant = cotas ? cotas[Math.min(i, cotas.length - 1)] : 1e6;
    }
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

  /* Mapa de alturas en coordenadas de escena (el grupo ya lleva su
     desplazamiento). Los prismas de vivienda y los muebles no cuentan: no son
     muro. Se levanta una sola vez, con la envolvente y el entorno ya puestos. */
  const centroAmbito = { x: centroParcela[0] - centro[0], z: centroParcela[1] - centro[2] };
  grupo.updateMatrixWorld(true);
  rejillaVacia(centroAmbito.x, centroAmbito.z, RADIO_VISION + 20);
  grupo.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData?.unitId !== undefined || o.userData?.lejos) return;
    marcarGeometria(o.geometry, o.matrixWorld);
  });

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

    /* Cota mínima a la que se admite la cámara en un punto: lo más alto que
       hay debajo (terreno, calle, vecino o la propia envolvente), más la
       holgura. Con una planta aislada, dentro de la huella de Apolo el techo
       pasa a ser la cota de corte, que es lo que deja bajar a ras del
       seccionado sin meterse en los muros de abajo. */
    sueloEn(x, z) {
      let y = alturaEn(x, z);
      if (planta !== 'all' && x >= caja.min.x && x <= caja.max.x && z >= caja.min.z && z <= caja.max.z) {
        const cotas = cotasDe(planta);
        if (cotas) y = Math.min(y, Math.max(...cotas));
      }
      if (!Number.isFinite(y)) {
        const s = (suelos.baja || []).filter(Number.isFinite);
        y = s.length ? Math.min(...s) : caja.min.y;
      }
      return y + HOLGURA_SUELO;
    },

    /* Círculo de visita, en coordenadas de escena. */
    ambito: { x: centroAmbito.x, z: centroAmbito.z, radio: RADIO_VISION },

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
        const rp = RE_PLATAFORMA.exec(m.name);
        // el cajón viene en el nombre (contrato del pipeline); si no, por posición
        const plataforma = rp ? Math.min(+rp[1], planosCorte.length - 1) : plataformaEn(tramos, cx, cz);
        m.material = Array.isArray(m.material)
          ? m.material.map((x) => materialRecortado(x, plataforma))
          : materialRecortado(m.material, plataforma);
        piezasMob.push({ mesh: m, ymin, plataforma });
      }
      /* El mobiliario no proyecta sombra (ver la nota del visor nuevo): son
         1.400 mallas por cascada del mapa de sombras. */
      mobiliario.traverse((o) => { if (o.isMesh) o.castShadow = false; });
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
