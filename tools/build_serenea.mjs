/* ═══════════════════════════════════════════════════════════════════════════
   build_serenea.mjs — Del GLB exportado por SketchUp a los ficheros del visor.

   Uso:  node tools/build_serenea.mjs <SERENEA_..._Entrega.glb> [--salida <dir>]
                                      [--sin-cortes] [--mob-generico]

   Entrada: el modelo completo exportado por SketchUp (Archivo → Exportar →
   Modelo 3D → GLB) con el entorno, los cinco edificios y, para Apolo, los
   componentes "CORTE P1" … "CORTE P4", cada uno con ocho cajones cuyo fondo
   marca la cota de corte de cada plataforma. Desde el v6 (9-sep-2026) el
   modelo trae además grupos sueltos de primer nivel (fotovoltaica, áticos
   amueblados, cocinas, acabados, terrazas, personas, cajitas) que se
   reparten entre Apolo y el entorno según dónde caen (ver `repartirExtras`).

   Salida (--salida, por defecto assets/serenea/; data/ siempre en su sitio):
     entorno.glb            terreno, costa, calles, vecinos y los otros cuatro
                            edificios; texturas a 2048 px en WebP
     apolo_envolvente.glb   muros, forjados, carpinterías y vidrios, unidos por
                            material; los vidrios sueltos y nombrados para
                            poder encenderlos por vivienda
     apolo_mobiliario.glb   mobiliario y puertas, simplificados y unidos por
                            plataforma, franja y material; nunca se cortan,
                            solo se ocultan
     apolo_corte_<planta>.glb  la envolvente cortada por el fondo de cada
                            cajón (triángulo a triángulo, sin tapas: las
                            pone el visor); una por planta (baja, p1, p2, atico)
     data/cortes.json       los ocho cajones de cada planta
     data/serenea_modelo.json  cajas, centros y plataformas para los encuadres

   Todo en las coordenadas del propio SketchUp: el origen es el mismo para el
   entorno y para cada edificio, que es lo que permite volcar un edificio
   nuevo sin ubicarlo a mano.

   Nombres de malla (contrato del visor, new/js/visor/CONTRATO.md):
     <cat>__T<plataforma>__<material>                          envolvente y variantes
     vidrio__T<plataforma>__<n>__<xcm>_<ycm>_<zcm>             un vidrio por hueco
     mob|puerta__T<plataforma>__Y<franja>__<material>__y<ymin> mobiliario
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, textureCompress, flatten, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const ENTRADA = argv.find((a) => !a.startsWith('--'));
const SIN_CORTES = argv.includes('--sin-cortes');
const MOB_GENERICO = argv.includes('--mob-generico'); // todo el mobiliario con un solo material, como hasta el v5
const iSalida = argv.indexOf('--salida');
const SALIDA = path.resolve(RAIZ, iSalida >= 0 && argv[iSalida + 1] ? argv[iSalida + 1] : path.join('assets', 'serenea'));
if (!ENTRADA) { console.error('uso: node tools/build_serenea.mjs <modelo.glb> [--salida <dir>] [--sin-cortes] [--mob-generico]'); process.exit(1); }
fs.mkdirSync(SALIDA, { recursive: true });

/* Planta lógica del visor ↔ componente de SketchUp. Las claves son las que
   usa layout.js desde el principio; el número es el que ve el cliente. */
const PLANTAS = [
  { key: 'baja', corte: 'CORTE P1', numero: 1 },
  { key: 'p1', corte: 'CORTE P2', numero: 2 },
  { key: 'p2', corte: 'CORTE P3', numero: 3 },
  { key: 'atico', corte: 'CORTE P4', numero: 4 },
];

/* Simplificación (meshoptimizer, por posiciones: ver `simplificar`). El error
   es absoluto, en metros. El mobiliario se simplifica por clase de familia. */
const SIMPLIFICACION = {
  mob: { ratio: 0.35, error: 0.03 },
  follaje: { ratio: 0.15, error: 0.06 },   // Hoja*, Pinna*, Peciolo, Rama*, Sotobosque, olivo, areca…
  persona: { ratio: 0.3, error: 0.02 },    // Sree
  puerta: { ratio: 0.35, error: 0.02 },
  envolvente: { ratio: 0.5, error: 0.005 }, // solo materiales sin textura (carpintería de aluminio, pavimentos, pintura)
};
const ES_FOLLAJE = /Hoja|Pinna|Peciolo|Rama|Sotobosque|olivo|areca|filodendro|planta|Tronco|arbol|palmera/i;
const ES_PERSONA = /^Sree|persona|people|human/i;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const f2 = (v) => Math.round(v * 100) / 100;

const doc = await io.read(ENTRADA);
const root = doc.getRoot();
const escena = root.listScenes()[0];
const top = escena.listChildren()[0].listChildren();
const nodoApolo = top.find((n) => /APOLO_Central/i.test(n.getName()));
const nodoEntorno = top.find((n) => /Terreno, costa/i.test(n.getName()));
const nodoCortes = top.find((n) => /^APOLO CORTES$/i.test(n.getName()));
if (!nodoApolo || !nodoEntorno) throw new Error('No encuentro Apolo o el entorno en el GLB');
/* Grupos sueltos de primer nivel: todo lo que no es Apolo, el entorno, los
   cajones de corte ni una escena vacía de SketchUp ("01 | Apolo y…"). */
const nodosExtra = top.filter((n) => n !== nodoApolo && n !== nodoEntorno && n !== nodoCortes && (n.getMesh() || n.listChildren().length));
log('leído', path.basename(ENTRADA), `nodos ${root.listNodes().length}, mallas ${root.listMeshes().length}, grupos extra ${nodosExtra.length}`);
for (const n of nodosExtra) log(`   extra: "${n.getName().slice(0, 70)}" (${n.listChildren().length} hijos)`);

/* ─────────────────────────── 1. Cortes ─────────────────────────── */
const RUTA_CORTES = path.join(RAIZ, 'data', 'cortes.json');
let cortes;
if (nodoCortes) {
  cortes = { edificio: 'apolo', origen: path.basename(ENTRADA), plantas: {} };
  for (const P of PLANTAS) {
    const n = nodoCortes.listChildren().find((c) => c.getName().toUpperCase() === P.corte);
    if (!n) throw new Error(`Falta el componente ${P.corte}`);
    cortes.plantas[P.key] = n.listChildren().map((h) => {
      const b = getBounds(h);
      return { x0: f2(b.min[0]), x1: f2(b.max[0]), z0: f2(b.min[2]), z1: f2(b.max[2]), y: f2(b.min[1]) };
    }).sort((a, b) => a.x0 - b.x0 || a.z0 - b.z0);
  }
  if (fs.existsSync(RUTA_CORTES)) {
    const previo = JSON.parse(fs.readFileSync(RUTA_CORTES, 'utf8'));
    const iguales = JSON.stringify(previo.plantas) === JSON.stringify(cortes.plantas);
    log(iguales ? 'cortes: iguales a los de data/cortes.json' : 'AVISO: las cotas o cajones de corte cambian respecto a data/cortes.json');
  }
  fs.writeFileSync(RUTA_CORTES, JSON.stringify(cortes, null, 1));
} else {
  /* Sin componentes de corte en el modelo: valen los guardados de la última
     vez, siempre que Apolo no se haya movido. Se comprueba que su caja
     sigue dentro de la huella de los cajones y se avisa si no. */
  cortes = JSON.parse(fs.readFileSync(RUTA_CORTES, 'utf8'));
  const b = getBounds(nodoApolo);
  const huella = cortes.plantas.baja;
  const hx0 = Math.min(...huella.map((c) => c.x0)), hx1 = Math.max(...huella.map((c) => c.x1));
  const hz0 = Math.min(...huella.map((c) => c.z0)), hz1 = Math.max(...huella.map((c) => c.z1));
  const fuera = b.min[0] < hx0 - 1 || b.max[0] > hx1 + 1 || b.min[2] < hz0 - 1 || b.max[2] > hz1 + 1;
  log(`el modelo no trae CORTE P1..P4: se usan los cortes guardados (${cortes.origen})`);
  if (fuera) log(`AVISO: Apolo (${b.min.map(f2)} … ${b.max.map(f2)}) se sale de la huella de los cortes guardados (${hx0}…${hx1} × ${hz0}…${hz1}). Incluye los componentes de corte en la exportación.`);
}
log('cortes:', PLANTAS.map((P) => `${P.key}: ${cortes.plantas[P.key].map((c) => c.y).join('/')}`).join(' · '));

/* ─────────────────────────── 2. Clasificar Apolo ─────────────────────────── */
/* La jerarquía que llega del DWG es familia → (subcomponentes →) Geom3D. La
   familia (hijo directo del nodo Apolo) dice qué es cada cosa; el material
   que trae no siempre (las puertas vienen con el material del pavimento).

   Regla (9-sep-2026): bajo Apolo son envolvente los Geom3D hijos directos
   del nodo Apolo (muros, forjados, pavimentos del DWG), las carpinterías
   (VEN / Acristalamiento: vidrio y carpintería), los pilares (PIE-), las
   escaleras y cualquier familia cuyos materiales sean todos de obra
   (Monocapa, Hormigón, Pintura interior, Pavimento, Travertino, Gravilla,
   Tarima, Aluminio, Junta, PAMESA…); las puertas (PUE) son 'puerta'; TODO
   lo demás es 'mob'. */
const MATERIAL_OBRA = /Monocapa|Hormig|Pintura interior|Pavimento|Travertino|Gravilla|Tarima|Aluminio|Junta|PAMESA|Lacado|Alicatado|Rodapie|Vinilo|Tierra y acolchado|Acabado_terraza|Acabado_interior/i;
/* Nombres de familia que son obra aunque lleven materiales propios (muros
   de tabiquería, barandillas, celosías, ascensores, suelos, portales). */
const FAMILIA_OBRA = /Muro|Fachada|Forjado|Tabique|Barandilla|Celos[ií]a|Ascensor|Suelo|Pavimento|Revestimiento|Portal|Lama|Acabado/i;
const strip = (s) => s.replace(/-\d+-3D(_\d+)?$/, '').replace(/#\d+(_\d+)?$/, '').replace(/_\d+$/, '').trim();

function categoriaFamilia(nombre, materiales, { directo = false } = {}) {
  const n = nombre;
  if (directo) return 'envolvente';
  if (/PUE[-_]|_PUE_|PCF|Puerta/i.test(n)) return 'puerta';
  if (/Acristalamiento|VEN[-_]|_VEN_/i.test(n)) return 'carpinteria'; // vidrio o carpintería, según el material de cada primitiva
  if (/Escalera/i.test(n)) return 'escalera';
  if (/PIE[-_]/i.test(n)) return 'pilar';
  if (/MOB[-_]|_MOB_/i.test(n)) return 'mob';
  if (FAMILIA_OBRA.test(n)) return 'envolvente';
  const mats = [...materiales].filter((m) => m && !/Vidrio/i.test(m));
  if (mats.length && mats.every((m) => MATERIAL_OBRA.test(m))) return 'envolvente';
  return 'mob';
}
/* Categoría de una primitiva dentro de su familia: en las carpinterías y en
   la obra del DWG, el vidrio va aparte. */
function categoriaPieza(catFamilia, nombreMat) {
  if (catFamilia === 'carpinteria') return /Vidrio/i.test(nombreMat) ? 'vidrio' : 'carpinteria';
  if (catFamilia === 'envolvente' && /Vidrio/i.test(nombreMat)) return 'vidrio';
  return catFamilia;
}
function claseSimplificacion(cat, familia, nombreMat) {
  if (cat === 'puerta') return 'puerta';
  if (cat !== 'mob') return 'envolvente';
  if (ES_PERSONA.test(familia)) return 'persona';
  if (ES_FOLLAJE.test(familia) || /Hoja|Sotobosque|Tronco/i.test(nombreMat)) return 'follaje';
  return 'mob';
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
const trisDe = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
function materialesBajo(nodo) { const s = new Set(); nodo.traverse((n) => { const m = n.getMesh(); if (m) for (const p of m.listPrimitives()) s.add(p.getMaterial()?.getName() || ''); }); return s; }

const piezas = []; // { cat, clase, material, familia, geometria, caja, plataforma, origen }
const familias = new Map(); // nombre → { cat, n, tris }
function anotarFamilia(nombre, cat, tris) { const e = familias.get(nombre) || { cat, n: 0, tris: 0 }; e.n++; e.tris += tris; familias.set(nombre, e); }

/* Vuelca todas las primitivas bajo `nodo` como piezas de Apolo de la
   categoría `catFamilia` (vidrio aparte según material). */
function extraerPiezas(nodo, familia, catFamilia, origen) {
  let tris = 0;
  nodo.traverse((n) => {
    const malla = n.getMesh(); if (!malla) return;
    const mundo = n.getWorldMatrix();
    for (const prim of malla.listPrimitives()) {
      const material = prim.getMaterial();
      const nombreMat = material?.getName() || '';
      // el vidrio suelto (por hueco) solo sale del DWG y de las carpinterías; los extras (FV, acabados) nunca
      const cat = origen === 'extra' && catFamilia === 'envolvente' ? catFamilia : categoriaPieza(catFamilia, nombreMat);
      const g = geometriaDe(prim, mundo); if (!g) continue;
      g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new THREE.Vector3());
      piezas.push({ cat, clase: claseSimplificacion(cat, familia, nombreMat), material, familia, geometria: g, caja: g.boundingBox.clone(), plataforma: plataformaDe(c.x, c.z), origen });
      tris += trisDe(g);
    }
  });
  anotarFamilia(familia, catFamilia, tris);
  return tris;
}

for (const hijo of nodoApolo.listChildren()) {
  const nombre = hijo.getName();
  const directo = /^Geom3D/.test(nombre) && !!hijo.getMesh();
  const familia = directo ? '(DWG: hijos directos de Apolo)' : strip(nombre);
  const cat = categoriaFamilia(nombre, materialesBajo(hijo), { directo });
  extraerPiezas(hijo, familia, cat, 'apolo');
}
const cajaApoloDWG = getBounds(nodoApolo); // la caja "oficial" de Apolo: solo el DWG, como siempre

/* ─────────────────────────── 2b. Grupos sueltos de primer nivel ─────────────────────────── */
/* Se reparten hijo a hijo por su caja: dentro de la caja de Apolo ampliada
   2 m en horizontal (cualquier y) → pieza de Apolo; fuera → entorno. La
   fotovoltaica va por nombre (_APOLO_ frente a _P02_.._P05_). */
const extrasEntorno = []; // piezas (geometría + material) que van al entorno
const MARGEN = 2;
const dentroDeApolo = (b) => {
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  return cx >= cajaApoloDWG.min[0] - MARGEN && cx <= cajaApoloDWG.max[0] + MARGEN && cz >= cajaApoloDWG.min[2] - MARGEN && cz <= cajaApoloDWG.max[2] + MARGEN;
};
function extraerParaEntorno(nodo, familia) {
  let tris = 0;
  nodo.traverse((n) => {
    const malla = n.getMesh(); if (!malla) return;
    const mundo = n.getWorldMatrix();
    for (const prim of malla.listPrimitives()) {
      const g = geometriaDe(prim, mundo); if (!g) continue;
      extrasEntorno.push({ familia, material: prim.getMaterial(), geometria: g, clase: ES_FOLLAJE.test(familia) ? 'follaje' : ES_PERSONA.test(familia) ? 'persona' : 'mob' });
      tris += trisDe(g);
    }
  });
  anotarFamilia(familia, 'entorno', tris);
  return tris;
}
const repartoExtras = {};
for (const grupo of nodosExtra) {
  const nombreGrupo = grupo.getName();
  const cuenta = { apolo: 0, entorno: 0, trisApolo: 0, trisEntorno: 0 };
  /* Sree, Componente#n: el propio nodo es la pieza; los grupos "SERENEA V6 |…" se reparten hijo a hijo. */
  const hijos = /^(Sree|Componente#)/.test(nombreGrupo) ? [grupo] : grupo.listChildren();
  for (const h of hijos) {
    const nombre = h.getName();
    const familia = strip(nombre === 'Geom3D' ? nombreGrupo : nombre) || strip(nombreGrupo);
    const b = getBounds(h);
    if (!isFinite(b.min[0])) continue;
    let destino, cat;
    if (/_FV\b|Fotovoltaica/i.test(nombre + nombreGrupo)) {
      destino = /_APOLO_/i.test(nombre) ? 'apolo' : 'entorno'; cat = 'envolvente';
    } else if (/Acabados de apoyo/i.test(nombreGrupo)) {
      destino = dentroDeApolo(b) ? 'apolo' : 'entorno'; cat = 'envolvente';
    } else {
      destino = dentroDeApolo(b) ? 'apolo' : 'entorno';
      cat = categoriaFamilia(nombre, materialesBajo(h)); // casi siempre 'mob'
      if (cat === 'envolvente' && !/Acabado/i.test(nombre)) cat = 'mob'; // solo los acabados de áticos son obra entre los extras
    }
    if (destino === 'apolo') { cuenta.apolo++; cuenta.trisApolo += extraerPiezas(h, familia, cat, 'extra'); }
    else { cuenta.entorno++; cuenta.trisEntorno += extraerParaEntorno(h, familia); }
  }
  repartoExtras[nombreGrupo] = cuenta;
  log(`   reparto "${nombreGrupo.slice(0, 60)}": ${cuenta.apolo} hijos → Apolo (${Math.round(cuenta.trisApolo)} tris), ${cuenta.entorno} → entorno (${Math.round(cuenta.trisEntorno)} tris)`);
}

/* Resumen por categoría y familias más pesadas, para revisar la clasificación. */
{
  const resumen = {};
  for (const p of piezas) { const e = resumen[p.cat] || (resumen[p.cat] = { n: 0, tris: 0 }); e.n++; e.tris += trisDe(p.geometria); }
  const totalTris = Object.values(resumen).reduce((s, e) => s + e.tris, 0);
  log('Apolo clasificado:', Object.entries(resumen).map(([k, v]) => `${k} ${v.n} piezas/${Math.round(v.tris)} tris (${(100 * v.tris / totalTris).toFixed(1)}%)`).join(' · '));
  log(`extras al entorno: ${extrasEntorno.length} piezas/${Math.round(extrasEntorno.reduce((s, e) => s + trisDe(e.geometria), 0))} tris`);
  log('las 40 familias más pesadas (tris, instancias, categoría, nombre):');
  for (const [k, v] of [...familias].sort((a, b) => b[1].tris - a[1].tris).slice(0, 40)) console.log(`   ${Math.round(v.tris).toString().padStart(8)}  ${String(v.n).padStart(4)}x  ${v.cat.padEnd(11)} ${k.slice(0, 80)}`);
}

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
/* Material por categoría. El mobiliario y las puertas del DWG llegan a veces
   con el material del pavimento (o sin material): eso se corrige aquí; el
   resto conserva su material (telas, roble, cerámica, hojas…). Los
   duplicados "Tela_beige_calido1" se pliegan sobre "Tela_beige_calido". */
const ES_MATERIAL_PRESTADO = /Pavimento|Monocapa|Hormig|Travertino|Gravilla|Tarima|Pintura|Tierra y acolchado|Junta Ivory|PAMESA|Vinilo/i;
function nombreMaterialSalida(d, nombre) {
  if (/1$/.test(nombre) && !/\d\d1$/.test(nombre) && materialPorNombre(d, nombre.slice(0, -1))) return nombre.slice(0, -1);
  return nombre;
}
function materialDeSalida(d, pieza) {
  const nombre = nombreMaterialSalida(d, pieza.material?.getName() || '');
  const generico = (nom, rgb, rug) => materialPorNombre(d, nom) || crearMaterial(d, nom, rgb, rug);
  if (pieza.cat === 'mob') {
    if (MOB_GENERICO || !nombre || ES_MATERIAL_PRESTADO.test(nombre)) return generico('SERENEA | Mobiliario', [0.62, 0.58, 0.52], 0.75);
    return materialPorNombre(d, nombre);
  }
  if (pieza.cat === 'puerta') {
    if (MOB_GENERICO || !nombre || ES_MATERIAL_PRESTADO.test(nombre)) return generico('APOLO | Lacado blanco satinado', [0.93, 0.93, 0.91], 0.35);
    return materialPorNombre(d, nombre);
  }
  if (pieza.cat === 'escalera' || pieza.cat === 'pilar') return generico('APOLO | Hormigon gris claro', [0.72, 0.72, 0.7], 0.85);
  return materialPorNombre(d, nombre) || generico(nombre || 'SERENEA | Genérico', [0.8, 0.8, 0.78], 0.8);
}
const tieneTextura = (m) => !!(m && (m.getBaseColorTexture() || m.getMetallicRoughnessTexture() || m.getNormalTexture()));

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
  if (lista.length === 1) return lista[0];
  const conUV = lista.filter((g) => g.attributes.uv), sinUV = lista.filter((g) => !g.attributes.uv);
  const partes = [];
  if (conUV.length) partes.push(mergeGeometries(conUV, false));
  if (sinUV.length) partes.push(mergeGeometries(sinUV, false));
  if (partes.length === 1) return partes[0];
  for (const p of partes) p.deleteAttribute('uv');
  return mergeGeometries(partes, false);
}

/* ─────────────────────────── 3b. Simplificación ─────────────────────────── */
/* Las mallas de SketchUp llegan con cada cara suelta (vértices repetidos con
   normales distintas), así que un simplificador por vértices no puede
   colapsar nada: todo son bordes. Aquí se unen los vértices por posición
   (generatePositionRemap), se simplifica sobre ese índice con error
   absoluto en metros y se reconstruyen las normales con un ángulo de
   pliegue de 35°. Las UV se toman del vértice canónico: vale para madera y
   telas, no para las fachadas texturizadas, que no se simplifican. 'Prune'
   elimina los fragmentos sueltos más pequeños que el error. */
await MeshoptSimplifier.ready;
const estadisticaSimplificacion = { antes: 0, despues: 0 };
function simplificar(g, { ratio, error }) {
  const posAttr = g.attributes.position;
  const pos = posAttr.array instanceof Float32Array ? posAttr.array : new Float32Array(posAttr.array);
  const nV = posAttr.count;
  const idx0 = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: nV }, (_, i) => i);
  if (idx0.length < 12) return g;
  const q = new Float32Array(nV * 3); // posiciones redondeadas a 0,1 mm para unir vértices
  for (let i = 0; i < nV * 3; i++) q[i] = Math.round(pos[i] * 10000) / 10000;
  const remap = MeshoptSimplifier.generatePositionRemap(q, 3);
  const idx = new Uint32Array(idx0.length); let n = 0;
  for (let i = 0; i < idx0.length; i += 3) {
    const a = remap[idx0[i]], b = remap[idx0[i + 1]], c = remap[idx0[i + 2]];
    if (a === b || b === c || a === c) continue; // degenerado
    idx[n++] = a; idx[n++] = b; idx[n++] = c;
  }
  /* Buffer compacto con solo los vértices canónicos: meshopt marca como
     bloqueado todo vértice que comparte posición con otros (aunque no los
     use ningún triángulo), y con los duplicados de SketchUp no colapsaría
     nada. `orig` guarda el vértice original de cada uno para recuperar la UV. */
  const nuevo = new Int32Array(nV).fill(-1); const orig = []; const indices = new Uint32Array(n);
  for (let i = 0; i < n; i++) { const c = idx[i]; if (nuevo[c] < 0) { nuevo[c] = orig.length; orig.push(c); } indices[i] = nuevo[c]; }
  const posC = new Float32Array(orig.length * 3);
  for (let i = 0; i < orig.length; i++) { posC[i * 3] = pos[orig[i] * 3]; posC[i * 3 + 1] = pos[orig[i] * 3 + 1]; posC[i * 3 + 2] = pos[orig[i] * 3 + 2]; }
  const objetivo = Math.max(3, Math.floor(n * ratio / 3) * 3);
  const [res] = MeshoptSimplifier.simplify(indices, posC, 3, objetivo, error, ['ErrorAbsolute', 'Prune']);
  estadisticaSimplificacion.antes += n / 3; estadisticaSimplificacion.despues += res.length / 3;
  const P = new Float32Array(res.length * 3);
  const uvA = g.attributes.uv; const U = uvA ? new Float32Array(res.length * 2) : null;
  for (let i = 0; i < res.length; i++) {
    const k = res[i], o = orig[k];
    P[i * 3] = posC[k * 3]; P[i * 3 + 1] = posC[k * 3 + 1]; P[i * 3 + 2] = posC[k * 3 + 2];
    if (U) { U[i * 2] = uvA.getX(o); U[i * 2 + 1] = uvA.getY(o); }
  }
  let r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (U) r.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  r = toCreasedNormals(r, THREE.MathUtils.degToRad(35));
  return r;
}
/* Une y simplifica un grupo de piezas: cada clase (mob, follaje, persona…)
   con su ratio; las que no llevan clase se unen tal cual. */
function unirYSimplificar(piezasGrupo, { simplificarEnvolvente = false } = {}) {
  const porClase = new Map();
  for (const p of piezasGrupo) {
    let clase = p.clase;
    if (clase === 'envolvente' && !(simplificarEnvolvente && !tieneTextura(p.material))) clase = null;
    if (!porClase.has(clase)) porClase.set(clase, []);
    porClase.get(clase).push(p.g);
  }
  const partes = [];
  for (const [clase, lista] of porClase) {
    const u = unir(lista);
    partes.push(clase && SIMPLIFICACION[clase] ? simplificar(u, SIMPLIFICACION[clase]) : u);
  }
  return partes.length === 1 ? partes[0] : unir(partes);
}

async function optimizar(d, { texturas = 2048, calidad = 82 } = {}) {
  await d.transform(dedup(), prune(), weld());
  await d.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  if (d.getRoot().listTextures().length) {
    await d.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: calidad, resize: [texturas, texturas] }));
  }
  await MeshoptEncoder.ready;
  d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  return d;
}
const resultados = [];
async function guardar(d, nombre) {
  const ruta = path.join(SALIDA, nombre);
  await io.write(ruta, d);
  const mb = (fs.statSync(ruta).size / 1048576).toFixed(1);
  let tris = 0; for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  const mallas = d.getRoot().listMeshes().length;
  log(`→ ${nombre}: ${mb} MB, ${Math.round(tris)} triángulos, ${mallas} mallas, ${d.getRoot().listMaterials().length} materiales, ${d.getRoot().listTextures().length} texturas`);
  resultados.push({ nombre, mb: +mb, tris: Math.round(tris), mallas });
  return ruta;
}
const nombreVidrio = (p, n) => { const c = p.caja.getCenter(new THREE.Vector3()); return `vidrio__T${p.plataforma}__${n}__${Math.round(c.x * 100)}_${Math.round(c.y * 100)}_${Math.round(c.z * 100)}`; };

/* ─────────────────────────── 4. Envolvente y vidrios ─────────────────────────── */
/* Genera la envolvente (completa o cortada por `planta`): los vidrios sueltos
   y nombrados, el resto unido por categoría, plataforma y material. */
async function construirEnvolvente(nombreFichero, planta = null) {
  const d = documentoVacio(); const esc = d.createScene(nombreFichero.replace('.glb', ''));
  d.getRoot().setDefaultScene(esc);
  const grupos = new Map(); // clave → { material, lista: [{ g, clase, material }] }
  let nVidrio = 0, trisAntes = 0;
  const yMaxCorte = planta ? Math.max(...cortes.plantas[planta].map((c) => c.y)) : Infinity;
  const yMinCorte = planta ? Math.min(...cortes.plantas[planta].map((c) => c.y)) : Infinity;
  estadisticaSimplificacion.antes = estadisticaSimplificacion.despues = 0;
  for (const p of piezas) {
    if (p.cat === 'mob' || p.cat === 'puerta') continue;
    if (p.caja.min.y >= yMaxCorte) continue;                       // entera por encima del corte: fuera
    const g = planta && p.caja.max.y > yMinCorte ? cortarPorPlano(p.geometria, planta) : p.geometria;
    if (!g.attributes.position.count) continue;
    trisAntes += trisDe(g);
    const mat = materialDeSalida(d, p);
    if (p.cat === 'vidrio') { añadirMalla(d, esc, nombreVidrio(p, nVidrio++), [{ g, material: mat }]); continue; }
    const clave = `${p.cat}__T${p.plataforma}__${mat.getName()}`;
    if (!grupos.has(clave)) grupos.set(clave, { material: mat, lista: [] });
    grupos.get(clave).lista.push({ g, clase: 'envolvente', material: mat });
  }
  for (const [clave, { material, lista }] of grupos) añadirMalla(d, esc, clave, [{ g: unirYSimplificar(lista, { simplificarEnvolvente: true }), material }]);
  log(`${nombreFichero}: ${nVidrio} vidrios, ${grupos.size} grupos; ${Math.round(trisAntes)} tris de entrada, simplificación sin textura ${Math.round(estadisticaSimplificacion.antes)} → ${Math.round(estadisticaSimplificacion.despues)}`);
  await optimizar(d, { texturas: 1024 });
  await guardar(d, nombreFichero);
}

/* ─────────────────────────── 6. Corte por plano ─────────────────────────── */
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

await construirEnvolvente('apolo_envolvente.glb');

/* ─────────────────────────── 5. Mobiliario y puertas ─────────────────────────── */
{
  const d = documentoVacio(); const esc = d.createScene('apolo_mobiliario');
  d.getRoot().setDefaultScene(esc);
  const grupos = new Map();
  let trisAntes = 0;
  estadisticaSimplificacion.antes = estadisticaSimplificacion.despues = 0;
  for (const p of piezas) {
    if (p.cat !== 'mob' && p.cat !== 'puerta') continue;
    const mat = materialDeSalida(d, p);
    /* Se agrupa por plataforma y por franja de altura de 3 m: así el visor
       puede ocultar de golpe todo lo que queda por encima de un corte. */
    const franja = Math.floor(p.caja.min.y / 3);
    const clave = `${p.cat}__T${p.plataforma}__Y${franja}__${mat.getName()}`;
    if (!grupos.has(clave)) grupos.set(clave, { material: mat, lista: [], ymin: Infinity });
    const e = grupos.get(clave); e.lista.push({ g: p.geometria, clase: p.clase, material: mat }); e.ymin = Math.min(e.ymin, p.caja.min.y);
    trisAntes += trisDe(p.geometria);
  }
  for (const [clave, { material, lista, ymin }] of grupos) añadirMalla(d, esc, `${clave}__y${ymin.toFixed(2)}`, [{ g: unirYSimplificar(lista), material }]);
  log(`apolo_mobiliario: ${grupos.size} grupos, ${new Set([...grupos.values()].map((g) => g.material.getName())).size} materiales; simplificación ${Math.round(trisAntes)} → ${Math.round(estadisticaSimplificacion.despues)} tris`);
  await optimizar(d, { texturas: 1024, calidad: 80 });
  await guardar(d, 'apolo_mobiliario.glb');
}

/* ─────────────────────────── 6b. Envolvente cortada por planta ─────────────────────────── */
if (!SIN_CORTES) for (const P of PLANTAS) await construirEnvolvente(`apolo_corte_${P.key}.glb`, P.key);

/* ─────────────────────────── 7. Entorno ─────────────────────────── */
{
  const d = cloneDocument(doc);
  const r = d.getRoot(); const esc = r.listScenes()[0];
  const cima = esc.listChildren()[0];
  // solo el terreno/costa/vecinos: fuera Apolo, los cajones de corte y los grupos sueltos (van repartidos)
  for (const n of cima.listChildren()) if (!/Terreno, costa/i.test(n.getName())) n.dispose();
  await d.transform(flatten());
  for (const n of r.listNodes()) if (n.getMesh() && !n.getName()) n.setName('entorno');
  /* Los extras que caen fuera de Apolo (fotovoltaica de P02..P05, plantas y
     muebles de las terrazas vecinas, personas), unidos por material. */
  const grupos = new Map();
  for (const e of extrasEntorno) {
    const nombre = nombreMaterialSalida(d, e.material?.getName() || '');
    const mat = materialPorNombre(d, nombre) || (materialPorNombre(d, 'SERENEA | Genérico') || crearMaterial(d, 'SERENEA | Genérico', [0.8, 0.8, 0.78], 0.8));
    const clave = `extra__${mat.getName()}`;
    if (!grupos.has(clave)) grupos.set(clave, { material: mat, lista: [] });
    grupos.get(clave).lista.push({ g: e.geometria, clase: e.clase, material: mat });
  }
  estadisticaSimplificacion.antes = estadisticaSimplificacion.despues = 0;
  for (const [clave, { material, lista }] of grupos) añadirMalla(d, esc, clave, [{ g: unirYSimplificar(lista), material }]);
  log(`entorno: ${grupos.size} grupos de extras; simplificación ${Math.round(estadisticaSimplificacion.antes)} → ${Math.round(estadisticaSimplificacion.despues)} tris`);
  await optimizar(d, { texturas: 2048, calidad: 80 });
  await guardar(d, 'entorno.glb');
}

/* ─────────────────────────── 8. Modelo: cajas y encuadres ─────────────────────────── */
{
  /* La caja de Apolo es la del DWG (idéntica de un modelo a otro: Apolo no se
     mueve). Los extras que se le suman (personas, fotovoltaica) se apuntan
     aparte para saber si sobresalen. */
  const cajaApolo = new THREE.Box3(new THREE.Vector3(...cajaApoloDWG.min), new THREE.Vector3(...cajaApoloDWG.max));
  const cajaTodo = cajaApolo.clone(); for (const p of piezas) cajaTodo.union(p.caja);
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
  log('modelo:', JSON.stringify(modelo.apolo), '· con extras:', JSON.stringify({ min: cajaTodo.min.toArray().map(f2), max: cajaTodo.max.toArray().map(f2) }));
}
log('resumen:', resultados.map((r) => `${r.nombre} ${r.mb} MB/${r.tris} tris/${r.mallas} mallas`).join(' · '));
log(`total ${resultados.reduce((s, r) => s + r.mb, 0).toFixed(1)} MB en ${SALIDA}`);
log('hecho');
