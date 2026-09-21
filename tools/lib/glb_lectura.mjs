/* Lectura de los GLB del pipeline (posiciones cuantizadas Int16 normalizadas
   con escala y traslación por nodo, meshopt): triángulos en coordenadas de
   mundo con su material. Sin three: el GLTFLoader necesita DOM. */
import fs from 'node:fs';
import { MeshoptDecoder } from '../../vendor/three/addons/libs/meshopt_decoder.module.js';

const TIPOS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const LEER = { Int8Array: 'getInt8', Uint8Array: 'getUint8', Int16Array: 'getInt16', Uint16Array: 'getUint16', Uint32Array: 'getUint32', Float32Array: 'getFloat32' };

export async function abrirGLB(ruta) {
  await MeshoptDecoder.ready;
  const b = fs.readFileSync(ruta);
  const jl = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + jl).toString());
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
    if (nd.mesh != null) porMalla.set(nd.mesh, { esc: e2, tr: t2, nombre: nd.name || '' });
    for (const c of nd.children || []) recorrer(c, e2, t2);
  }
  for (const r of j.scenes[0].nodes) recorrer(r, [1, 1, 1], [0, 0, 0]);

  /* Triángulos [[x,y,z]×3] de las primitivas cuyo material cumple `filtro`
     (fn(nombre) → bool). Con `porPrimitiva` devuelve { material, nodo, triangulos }. */
  function triangulos(filtro = () => true, { porPrimitiva = false } = {}) {
    const salida = [];
    j.meshes.forEach((m, mi) => {
      const tf = porMalla.get(mi); if (!tf) return;
      for (const p of m.primitives) {
        const nombre = j.materials[p.material]?.name ?? '';
        if (!filtro(nombre)) continue;
        const pos = accesor(p.attributes.POSITION); const idx = p.indices != null ? accesor(p.indices).datos : null;
        const norm = pos.normalizado ? (pos.tipo === Int16Array ? 32767 : (pos.tipo === Int8Array ? 127 : 1)) : 1;
        const v = (k) => [(pos.datos[3 * k] / norm) * tf.esc[0] + tf.tr[0], (pos.datos[3 * k + 1] / norm) * tf.esc[1] + tf.tr[1], (pos.datos[3 * k + 2] / norm) * tf.esc[2] + tf.tr[2]];
        const ntri = (idx ? idx.length : pos.datos.length / 3) / 3;
        const lista = porPrimitiva ? [] : salida;
        for (let t = 0; t < ntri; t++) {
          const i0 = idx ? idx[3 * t] : 3 * t, i1 = idx ? idx[3 * t + 1] : 3 * t + 1, i2 = idx ? idx[3 * t + 2] : 3 * t + 2;
          lista.push([v(i0), v(i1), v(i2)]);
        }
        if (porPrimitiva) salida.push({ material: nombre, nodo: tf.nombre, triangulos: lista });
      }
    });
    return salida;
  }
  return { json: j, triangulos, materiales: j.materials.map((m) => m.name) };
}
