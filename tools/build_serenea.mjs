/* ═══════════════════════════════════════════════════════════════════════════
   build_serenea.mjs — Del GLB exportado por SketchUp a los ficheros del visor.

   Uso:  node tools/build_serenea.mjs <SERENEA_..._cortes.glb> [--sin-cortes]

   Entrada: el modelo completo exportado por SketchUp (Archivo → Exportar →
   Modelo 3D → GLB) con el entorno, los cinco edificios y, para Apolo, los
   componentes "CORTE P1" … "CORTE P4", cada uno con ocho cajones cuyo fondo
   marca la cota de corte de cada plataforma.

   Salida (assets/serenea/ y data/):
     entorno.glb            terreno, costa, calles, vecinos y los otros cuatro
                            edificios; texturas a 2048 px en WebP
     apolo_envolvente.glb   muros, forjados, carpinterías y vidrios, unidos por
                            material; los vidrios sueltos y nombrados para
                            poder encenderlos por vivienda
     apolo_mobiliario.glb   mobiliario y puertas, simplificados y unidos por
                            plataforma; nunca se cortan, solo se ocultan
     apolo_corte_<planta>.glb  la envolvente cortada por el fondo de cada
                            cajón (triángulo a triángulo, sin tapas: las
                            pone el visor); una por planta (baja, p1, p2, atico)
     data/cortes.json       los ocho cajones de cada planta
     data/serenea_modelo.json  cajas, centros y plataformas para los encuadres

   Todo en las coordenadas del propio SketchUp: el origen es el mismo para el
   entorno y para cada edificio, que es lo que permite volcar un edificio
   nuevo sin ubicarlo a mano.
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, Document, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, textureCompress, simplify, flatten, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import sharp from 'sharp';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = process.argv[2];
const SIN_CORTES = process.argv.includes('--sin-cortes');
if (!ENTRADA) { console.error('uso: node tools/build_serenea.mjs <modelo.glb>'); process.exit(1); }
const SALIDA = path.join(RAIZ, 'assets', 'serenea');
fs.mkdirSync(SALIDA, { recursive: true });

/* Planta lógica del visor ↔ componente de SketchUp. Las claves son las que
   usa layout.js desde el principio; el número es el que ve el cliente. */
const PLANTAS = [
  { key: 'baja', corte: 'CORTE P1', numero: 1 },
  { key: 'p1', corte: 'CORTE P2', numero: 2 },
  { key: 'p2', corte: 'CORTE P3', numero: 3 },
  { key: 'atico', corte: 'CORTE P4', numero: 4 },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const doc = await io.read(ENTRADA);
const root = doc.getRoot();
const escena = root.listScenes()[0];
const top = escena.listChildren()[0].listChildren();
const nodoApolo = top.find((n) => /APOLO_Central/i.test(n.getName()));
const nodoEntorno = top.find((n) => /Terreno, costa/i.test(n.getName()));
const nodoCortes = top.find((n) => /^APOLO CORTES$/i.test(n.getName()));
if (!nodoApolo || !nodoEntorno || !nodoCortes) throw new Error('No encuentro Apolo, el entorno o los cortes en el GLB');
log('leído', ENTRADA, `nodos ${root.listNodes().length}, mallas ${root.listMeshes().length}`);

/* ─────────────────────────── 1. Cortes ─────────────────────────── */
const f2 = (v) => Math.round(v * 100) / 100;
const cortes = { edificio: 'apolo', origen: path.basename(ENTRADA), plantas: {} };
for (const P of PLANTAS) {
  const n = nodoCortes.listChildren().find((c) => c.getName().toUpperCase() === P.corte);
  if (!n) throw new Error(`Falta el componente ${P.corte}`);
  cortes.plantas[P.key] = n.listChildren().map((h) => {
    const b = getBounds(h);
    return { x0: f2(b.min[0]), x1: f2(b.max[0]), z0: f2(b.min[2]), z1: f2(b.max[2]), y: f2(b.min[1]) };
  }).sort((a, b) => a.x0 - b.x0 || a.z0 - b.z0);
}
fs.writeFileSync(path.join(RAIZ, 'data', 'cortes.json'), JSON.stringify(cortes, null, 1));
log('cortes:', PLANTAS.map((P) => `${P.key}: ${cortes.plantas[P.key].map((c) => c.y).join('/')}`).join(' · '));

/* ─────────────────────────── 2. Clasificar Apolo ─────────────────────────── */
/* La jerarquía que llega del DWG es familia → Geom3D. La familia dice qué es
   cada cosa; el material que trae no siempre (las sillas vienen con el
   material del pavimento). Se clasifica por el nombre de la familia y se
   corrige el material por categoría. */
function categoriaDe(nombreFamilia, material) {
  const n = nombreFamilia;
  if (/MOB[-_]|_MOB_/i.test(n)) return 'mob';
  if (/PUE[-_]|_PUE_/i.test(n)) return 'puerta';
  if (/Acristalamiento|VEN-X/i.test(n)) return /Vidrio/i.test(material) ? 'vidrio' : 'carpinteria';
  if (/VEN[-_]|_VEN_/i.test(n)) return /Vidrio/i.test(material) ? 'vidrio' : 'carpinteria';
  if (/Escalera/i.test(n)) return 'escalera';
  if (/PIE[-_]/i.test(n)) return 'pilar';
  if (/Vidrio/i.test(material)) return 'vidrio';
  return 'envolvente';
}

const cajonesPorPlanta = cortes.plantas.baja; // misma huella en todas las plantas
function plataformaDe(cx, cz) {
  let i = cajonesPorPlanta.findIndex((c) => cx >= c.x0 && cx < c.x1 && cz >= c.z0 && cz < c.z1);
  if (i < 0) { // fuera de la huella: la más cercana
    let mejor = Infinity;
    cajonesPorPlanta.forEach((c, k) => {
      const dx = Math.max(c.x0 - cx, 0, cx - c.x1), dz = Math.max(c.z0 - cz, 0, cz - c.z1);
      const d = dx * dx + dz * dz; if (d < mejor) { mejor = d; i = k; }
    });
  }
  return i;
}

/* Extrae cada primitiva como BufferGeometry de three en coordenadas de mundo. */
function geometriaDe(prim, matrizMundo) {
  const g = new THREE.BufferGeometry();
  const P = prim.getAttribute('POSITION'); if (!P) return null;
  const pos = new Float32Array(P.getArray());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const N = prim.getAttribute('NORMAL'); if (N) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N.getArray()), 3));
  const U = prim.getAttribute('TEXCOORD_0'); if (U) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U.getArray()), 2));
  const I = prim.getIndices(); if (I) g.setIndex(new THREE.BufferAttribute(new Uint32Array(I.getArray()), 1));
  const m = new THREE.Matrix4().fromArray(matrizMundo);
  g.applyMatrix4(m);
  if (!N) g.computeVertexNormals();
  return g;
}

const piezas = []; // { cat, material, familia, geometria, caja, plataforma }
nodoApolo.traverse((n) => {
  const malla = n.getMesh(); if (!malla) return;
  let padre = n; while (padre && /^Geom3D/.test(padre.getName())) padre = padre.getParentNode();
  const familia = padre ? padre.getName() : '';
  const mundo = n.getWorldMatrix();
  for (const prim of malla.listPrimitives()) {
    const material = prim.getMaterial();
    const nombreMat = material?.getName() || '';
    const cat = categoriaDe(familia, nombreMat);
    const g = geometriaDe(prim, mundo); if (!g) continue;
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    piezas.push({ cat, material, familia, geometria: g, caja: g.boundingBox.clone(), plataforma: plataformaDe(c.x, c.z) });
  }
});
const resumen = {};
for (const p of piezas) { const e = resumen[p.cat] || (resumen[p.cat] = { n: 0, tris: 0 }); e.n++; e.tris += (p.geometria.index ? p.geometria.index.count : p.geometria.attributes.position.count) / 3; }
log('Apolo clasificado:', Object.entries(resumen).map(([k, v]) => `${k} ${v.n} piezas/${Math.round(v.tris)} tris`).join(' · '));

/* ─────────────────────────── 3. Materiales de salida ─────────────────────────── */
/* Los documentos de salida nacen como copia del original para conservar
   materiales y texturas; después se vacían de nodos y se rellenan con las
   mallas nuevas. prune() retira lo que quede sin usar. */
function documentoVacio() {
  const d = cloneDocument(doc);
  const r = d.getRoot();
  for (const n of r.listNodes()) n.dispose();
  for (const m of r.listMeshes()) m.dispose();
  for (const s of r.listScenes()) s.dispose();
  for (const c of r.listCameras()) c.dispose();
  return d;
}
function materialPorNombre(d, nombre) { return d.getRoot().listMaterials().find((m) => m.getName() === nombre); }
function crearMaterial(d, nombre, rgb, rugosidad, metal = 0) {
  return d.createMaterial(nombre).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(rugosidad).setMetallicFactor(metal);
}
/* Material por categoría: el mobiliario y las puertas llegan con el material
   del pavimento, que es lo que se corrige aquí. */
function materialDeSalida(d, pieza) {
  const nombre = pieza.material?.getName() || '';
  if (pieza.cat === 'mob') return materialPorNombre(d, 'SERENEA | Mobiliario') || crearMaterial(d, 'SERENEA | Mobiliario', [0.62, 0.58, 0.52], 0.75);
  if (pieza.cat === 'puerta') return materialPorNombre(d, 'APOLO | Lacado blanco satinado') || crearMaterial(d, 'APOLO | Lacado blanco satinado', [0.93, 0.93, 0.91], 0.35);
  if (pieza.cat === 'escalera' || pieza.cat === 'pilar') return materialPorNombre(d, 'APOLO | Hormigon gris claro') || crearMaterial(d, 'APOLO | Hormigon gris claro', [0.72, 0.72, 0.7], 0.85);
  return materialPorNombre(d, nombre) || crearMaterial(d, nombre || 'SERENEA | Genérico', [0.8, 0.8, 0.78], 0.8);
}
function materialTapa(d) { return materialPorNombre(d, 'SERENEA | Tapa de corte') || crearMaterial(d, 'SERENEA | Tapa de corte', [0.06, 0.065, 0.075], 0.95); }

/* BufferGeometry de three → primitiva glTF. */
function primitivaDesde(d, g, material) {
  const buffer = d.getRoot().listBuffers()[0] || d.createBuffer();
  const prim = d.createPrimitive().setMaterial(material);
  const pos = d.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.position.array)).setBuffer(buffer);
  prim.setAttribute('POSITION', pos);
  if (g.attributes.normal) prim.setAttribute('NORMAL', d.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.normal.array)).setBuffer(buffer));
  if (g.attributes.uv) prim.setAttribute('TEXCOORD_0', d.createAccessor().setType('VEC2').setArray(new Float32Array(g.attributes.uv.array)).setBuffer(buffer));
  if (g.index) prim.setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.index.array)).setBuffer(buffer));
  return prim;
}
function añadirMalla(d, escenaSalida, nombre, geometrias) {
  const malla = d.createMesh(nombre);
  for (const { g, material } of geometrias) if (g && g.attributes.position.count) malla.addPrimitive(primitivaDesde(d, g, material));
  if (!malla.listPrimitives().length) { malla.dispose(); return null; }
  const nodo = d.createNode(nombre).setMesh(malla);
  escenaSalida.addChild(nodo);
  return nodo;
}

/* Une geometrías compatibles (misma disposición de atributos). */
function unir(lista) {
  /* mergeGeometries exige que todas las piezas sean indexadas o ninguna: las
     cortadas no lo son, así que se desindexan todas; weld() vuelve a indexar
     al optimizar. */
  lista = lista.map((g) => (g.index ? g.toNonIndexed() : g));
  const conUV = lista.filter((g) => g.attributes.uv), sinUV = lista.filter((g) => !g.attributes.uv);
  const partes = [];
  if (conUV.length) partes.push(mergeGeometries(conUV, false));
  if (sinUV.length) partes.push(mergeGeometries(sinUV, false));
  if (partes.length === 1) return partes[0];
  for (const p of partes) p.deleteAttribute('uv');
  return mergeGeometries(partes, false);
}

async function optimizar(d, { texturas = 2048, simplificar = null } = {}) {
  await d.transform(dedup(), prune(), weld());
  // simplify necesita mallas indexadas: por eso weld() va antes
  if (simplificar) { await MeshoptSimplifier.ready; await d.transform(simplify({ simplifier: MeshoptSimplifier, ratio: simplificar, error: 0.02, lockBorder: false })); }
  await d.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  if (d.getRoot().listTextures().length) {
    await d.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [texturas, texturas] }));
  }
  await MeshoptEncoder.ready;
  d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  return d;
}
async function guardar(d, nombre) {
  const ruta = path.join(SALIDA, nombre);
  await io.write(ruta, d);
  const mb = (fs.statSync(ruta).size / 1048576).toFixed(1);
  let tris = 0; for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  log(`→ ${nombre}: ${mb} MB, ${Math.round(tris)} triángulos, ${d.getRoot().listMeshes().length} mallas`);
  return ruta;
}

/* ─────────────────────────── 4. Envolvente y vidrios ─────────────────────────── */
{
  const d = documentoVacio(); const esc = d.createScene('apolo');
  d.getRoot().setDefaultScene(esc);
  const grupos = new Map(); // clave → { material, lista }
  let nVidrio = 0;
  for (const p of piezas) {
    if (p.cat === 'mob' || p.cat === 'puerta') continue;
    if (p.cat === 'vidrio') {
      /* Cada vidrio, suelto y con su centro en el nombre: es lo que permite
         asignarlo a una vivienda y encenderlo por separado. */
      const c = p.caja.getCenter(new THREE.Vector3());
      añadirMalla(d, esc, `vidrio__T${p.plataforma}__${nVidrio++}__${Math.round(c.x*100)}_${Math.round(c.y*100)}_${Math.round(c.z*100)}`, [{ g: p.geometria, material: materialDeSalida(d, p) }]);
      continue;
    }
    const mat = materialDeSalida(d, p);
    const clave = `${p.cat}__T${p.plataforma}__${mat.getName()}`;
    if (!grupos.has(clave)) grupos.set(clave, { material: mat, lista: [] });
    grupos.get(clave).lista.push(p.geometria);
  }
  for (const [clave, { material, lista }] of grupos) añadirMalla(d, esc, clave, [{ g: unir(lista), material }]);
  await optimizar(d, { texturas: 1024 });
  await guardar(d, 'apolo_envolvente.glb');
}

/* ─────────────────────────── 5. Mobiliario y puertas ─────────────────────────── */
{
  const d = documentoVacio(); const esc = d.createScene('apolo_mobiliario');
  d.getRoot().setDefaultScene(esc);
  const grupos = new Map();
  for (const p of piezas) {
    if (p.cat !== 'mob' && p.cat !== 'puerta') continue;
    const mat = materialDeSalida(d, p);
    /* Se agrupa por plataforma y por franja de altura de 3 m: así el visor
       puede ocultar de golpe todo lo que queda por encima de un corte. */
    const franja = Math.floor(p.caja.min.y / 3);
    const clave = `${p.cat}__T${p.plataforma}__Y${franja}__${mat.getName()}`;
    if (!grupos.has(clave)) grupos.set(clave, { material: mat, lista: [], ymin: Infinity });
    const e = grupos.get(clave); e.lista.push(p.geometria); e.ymin = Math.min(e.ymin, p.caja.min.y);
  }
  for (const [clave, { material, lista, ymin }] of grupos) añadirMalla(d, esc, `${clave}__y${ymin.toFixed(2)}`, [{ g: unir(lista), material }]);
  await optimizar(d, { texturas: 1024, simplificar: 0.3 });
  await guardar(d, 'apolo_mobiliario.glb');
}

/* ─────────────────────────── 6. Envolvente cortada por planta ─────────────────────────── */
/* Corte exacto por el plano de cada plataforma: cada triángulo se parte por
   el plano y se conserva la parte que queda por debajo del fondo del cajón.
   No se generan tapas: las mallas que llegan del DWG son superficies
   abiertas y un CSG sobre ellas inventa tapas gigantes. La tapa la pone el
   visor pintando oscuras las caras traseras de la envolvente cortada, que
   es lo que se ve por la boca del corte. */
function cortarPorPlano(g, planta) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const idx = g.index ? g.index.array : null;
  const n = idx ? idx.length : pos.count;
  const P = [], N = [], U = [];
  const v = (i) => { const k = idx ? idx[i] : i; return { p: [pos.getX(k), pos.getY(k), pos.getZ(k)], n: nor ? [nor.getX(k), nor.getY(k), nor.getZ(k)] : [0, 1, 0], u: uv ? [uv.getX(k), uv.getY(k)] : [0, 0] }; };
  const push = (a) => { P.push(...a.p); N.push(...a.n); U.push(...a.u); };
  const mezcla = (a, b, t) => ({ p: a.p.map((x, i) => x + (b.p[i] - x) * t), n: a.n.map((x, i) => x + (b.n[i] - x) * t), u: a.u.map((x, i) => x + (b.u[i] - x) * t) });
  for (let i = 0; i < n; i += 3) {
    const t = [v(i), v(i + 1), v(i + 2)];
    const cx = (t[0].p[0] + t[1].p[0] + t[2].p[0]) / 3, cz = (t[0].p[2] + t[1].p[2] + t[2].p[2]) / 3;
    const yc = cortes.plantas[planta][plataformaDe(cx, cz)].y;
    const arriba = t.map((a) => a.p[1] > yc);
    const cuantos = arriba.filter(Boolean).length;
    if (cuantos === 0) { t.forEach(push); continue; }
    if (cuantos === 3) continue;
    // ordenar para que los de abajo vayan primero, conservando el sentido de giro
    let orden = [0, 1, 2];
    while (arriba[orden[0]] || (cuantos === 1 && arriba[orden[1]])) orden = [orden[1], orden[2], orden[0]];
    const [a, b, c] = orden.map((k) => t[k]);
    const corte = (p, q) => mezcla(p, q, (yc - p.p[1]) / (q.p[1] - p.p[1]));
    if (cuantos === 1) { // a, b abajo; c arriba → cuadrilátero a, b, bc, ac
      const bc = corte(b, c), ac = corte(a, c);
      push(a); push(b); push(bc); push(a); push(bc); push(ac);
    } else { // a abajo; b, c arriba → triángulo a, ab, ac
      const ab = corte(a, b), ac = corte(a, c);
      push(a); push(ab); push(ac);
    }
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  r.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (uv) r.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return r;
}
if (!SIN_CORTES) {
  for (const P of PLANTAS) {
    const d = documentoVacio(); const esc = d.createScene(`apolo_corte_${P.key}`);
    d.getRoot().setDefaultScene(esc);
    const yMaxCorte = Math.max(...cortes.plantas[P.key].map((c) => c.y));
    const yMinCorte = Math.min(...cortes.plantas[P.key].map((c) => c.y));
    const grupos = new Map();
    let nVidrio = 0;
    for (const p of piezas) {
      if (p.cat === 'mob' || p.cat === 'puerta') continue;
      const mat = materialDeSalida(d, p);
      if (p.caja.min.y >= yMaxCorte) continue;                       // entera por encima: fuera
      const g = p.caja.max.y > yMinCorte ? cortarPorPlano(p.geometria, P.key) : p.geometria;
      if (!g.attributes.position.count) continue;
      if (p.cat === 'vidrio') {
        const c = p.caja.getCenter(new THREE.Vector3());
        añadirMalla(d, esc, `vidrio__T${p.plataforma}__${nVidrio++}__${Math.round(c.x*100)}_${Math.round(c.y*100)}_${Math.round(c.z*100)}`, [{ g, material: mat }]);
      } else {
        const clave = `${p.cat}__T${p.plataforma}__${mat.getName()}`;
        if (!grupos.has(clave)) grupos.set(clave, { material: mat, lista: [] });
        grupos.get(clave).lista.push(g);
      }
    }
    for (const [clave, { material, lista }] of grupos) añadirMalla(d, esc, clave, [{ g: unir(lista), material }]);
    await optimizar(d, { texturas: 1024 });
    await guardar(d, `apolo_corte_${P.key}.glb`);
  }
}

/* ─────────────────────────── 7. Entorno ─────────────────────────── */
{
  const d = cloneDocument(doc);
  const r = d.getRoot(); const esc = r.listScenes()[0];
  const cima = esc.listChildren()[0];
  for (const n of cima.listChildren()) {
    // fuera Apolo (va aparte), los cajones de corte, las figuras de SketchUp y las escenas vacías
    if (/APOLO_Central|APOLO CORTES|^Sree/i.test(n.getName()) || (!n.getMesh() && !n.listChildren().length)) n.dispose();
  }
  await d.transform(flatten());
  // nombres legibles: el del grupo del que cuelga cada malla
  for (const n of r.listNodes()) if (n.getMesh() && !n.getName()) n.setName('entorno');
  await optimizar(d, { texturas: 2048 });
  await guardar(d, 'entorno.glb');
}

/* ─────────────────────────── 8. Modelo: cajas y encuadres ─────────────────────────── */
{
  const cajaApolo = new THREE.Box3(); for (const p of piezas) cajaApolo.union(p.caja);
  const be = getBounds(nodoEntorno);
  const modelo = {
    origen: path.basename(ENTRADA),
    unidades: 'metros',
    apolo: { min: cajaApolo.min.toArray().map(f2), max: cajaApolo.max.toArray().map(f2), centro: cajaApolo.getCenter(new THREE.Vector3()).toArray().map(f2) },
    entorno: { min: be.min.map(f2), max: be.max.map(f2) },
    plataformas: cajonesPorPlanta.map((c, i) => ({ indice: i, x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1 })),
    plantas: PLANTAS.map((P) => ({ key: P.key, numero: P.numero, cortes: cortes.plantas[P.key].map((c) => c.y) })),
  };
  fs.writeFileSync(path.join(RAIZ, 'data', 'serenea_modelo.json'), JSON.stringify(modelo, null, 1));
  log('modelo:', JSON.stringify(modelo.apolo));
}
log('hecho');
