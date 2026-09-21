#!/usr/bin/env node
/* Tapas de las plantas seccionadas: la sección de los muros de
   assets/serenea/apolo_envolvente.glb a la cota de corte de cada cajón de
   cada planta (data/cortes.json), como triángulos horizontales. Escribe
   data/tapas_serenea.json. Ver js/visor/tapas.js para el método.

   Uso: node tools/tapas_serenea.mjs [envolvente.glb] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from '../vendor/three/addons/libs/meshopt_decoder.module.js';
import { seccionar, ES_MURO } from '../js/visor/tapas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const glb = process.argv[2] || path.join(raiz, 'assets/serenea/apolo_envolvente.glb');
await MeshoptDecoder.ready;

/* ── lectura del GLB (posiciones cuantizadas + meshopt) ── */
const b = fs.readFileSync(glb); const jl = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + jl).toString());
const cl = b.readUInt32LE(20 + jl); const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + cl);
const vistas = new Map();
function vista(i) {
  if (vistas.has(i)) return vistas.get(i);
  const bv = j.bufferViews[i]; let out;
  const ext = bv.extensions?.EXT_meshopt_compression;
  if (ext) {
    const src = bin.subarray(ext.byteOffset || 0, (ext.byteOffset || 0) + ext.byteLength);
    out = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter);
  } else out = new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
  vistas.set(i, out); return out;
}
const TIPOS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const LEER = { Int8Array: 'getInt8', Uint8Array: 'getUint8', Int16Array: 'getInt16', Uint16Array: 'getUint16', Uint32Array: 'getUint32', Float32Array: 'getFloat32' };
function accesor(i) {
  const a = j.accessors[i]; const bv = j.bufferViews[a.bufferView]; const data = vista(a.bufferView);
  const T = TIPOS[a.componentType]; const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const stride = bv.byteStride || n * T.BYTES_PER_ELEMENT; const out = new T(a.count * n);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[LEER[T.name]]((a.byteOffset || 0) + k * stride + c * T.BYTES_PER_ELEMENT, true);
  return { datos: out, n, normalizado: !!a.normalized, tipo: T };
}
const porMalla = new Map();
function recorrer(ni, esc, tr) {
  const nd = j.nodes[ni]; const s = nd.scale || [1, 1, 1], t = nd.translation || [0, 0, 0];
  if (nd.matrix) throw new Error('nodo con matrix: no previsto');
  const e2 = [esc[0] * s[0], esc[1] * s[1], esc[2] * s[2]], t2 = [tr[0] + esc[0] * t[0], tr[1] + esc[1] * t[1], tr[2] + esc[2] * t[2]];
  if (nd.mesh != null) porMalla.set(nd.mesh, { esc: e2, tr: t2 });
  for (const c of nd.children || []) recorrer(c, e2, t2);
}
for (const r of j.scenes[0].nodes) recorrer(r, [1, 1, 1], [0, 0, 0]);

/* ── triángulos de muro en mundo ── */
const triangulos = []; const porMaterial = new Map();
j.meshes.forEach((m, mi) => {
  const tf = porMalla.get(mi); if (!tf) return;
  for (const p of m.primitives) {
    const nombre = j.materials[p.material]?.name ?? '';
    if (!ES_MURO.test(nombre)) continue;
    const pos = accesor(p.attributes.POSITION); const idx = p.indices != null ? accesor(p.indices).datos : null;
    const norm = pos.normalizado ? (pos.tipo === Int16Array ? 32767 : (pos.tipo === Int8Array ? 127 : 1)) : 1;
    const v = (k) => [(pos.datos[3 * k] / norm) * tf.esc[0] + tf.tr[0], (pos.datos[3 * k + 1] / norm) * tf.esc[1] + tf.tr[1], (pos.datos[3 * k + 2] / norm) * tf.esc[2] + tf.tr[2]];
    const ntri = (idx ? idx.length : pos.datos.length / 3) / 3;
    for (let t = 0; t < ntri; t++) {
      const i0 = idx ? idx[3 * t] : 3 * t, i1 = idx ? idx[3 * t + 1] : 3 * t + 1, i2 = idx ? idx[3 * t + 2] : 3 * t + 2;
      triangulos.push([v(i0), v(i1), v(i2)]);
    }
    porMaterial.set(nombre, (porMaterial.get(nombre) || 0) + ntri);
  }
});
console.log(`muros: ${triangulos.length} triángulos de ${[...porMaterial.keys()].join(' | ')}`);

/* ── secciones ── */
const cortes = JSON.parse(fs.readFileSync(path.join(raiz, 'data/cortes.json'), 'utf8'));
const salida = { origen: path.basename(glb), cortes: cortes.origen, alzar: 0.01, unidad: 'mm', formato: 'por cajón: { y, poligonos: [n, x, z, … ] } en mm', plantas: {} };
const t0 = Date.now();
for (const [clave, cajones] of Object.entries(cortes.plantas)) {
  /* Por cajón: cota y polígonos planos [n, x, z, x, z, …] en milímetros. */
  const cajonesSalida = []; const resumen = []; let nPol = 0;
  for (const [i, c] of cajones.entries()) {
    const stats = {};
    const { poligonos } = seccionar(triangulos, c.y, { rect: { x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1 }, alzar: 0.01, stats });
    const plano = [];
    for (const p of poligonos) { plano.push(p.length); for (const [x, z] of p) plano.push(Math.round(x * 1000), Math.round(z * 1000)); }
    cajonesSalida.push({ y: c.y, poligonos: plano });
    nPol += poligonos.length;
    resumen.push(`c${i}@${c.y.toFixed(2)}: ${stats.segmentos} seg → ${stats.caras} caras, ${stats.pares} pares, ${stats.area.toFixed(1)} m²`);
  }
  salida.plantas[clave] = { cajones: cajonesSalida };
  console.log(`${clave}: ${nPol} polígonos, ${resumen.join(' · ')}`);
}
fs.writeFileSync(path.join(raiz, 'data/tapas_serenea.json'), JSON.stringify(salida));
console.log(`escrito data/tapas_serenea.json (${(fs.statSync(path.join(raiz, 'data/tapas_serenea.json')).size / 1024).toFixed(0)} KB) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
