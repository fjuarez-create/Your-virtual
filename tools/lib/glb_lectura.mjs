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
  /* Matriz de mundo por nodo (4×4, columnas como en glTF). Los GLB del
     pipeline traen escala+traslación; los de SketchUp, `matrix`. Una malla
     instanciada en varios nodos se registra una vez por nodo. */
  const mul = (A, B) => { const C = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) C[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]; return C; };
  const local = (nd) => {
    if (nd.matrix) return nd.matrix;
    const s = nd.scale || [1, 1, 1], t = nd.translation || [0, 0, 0], q = nd.rotation || [0, 0, 0, 1];
    const [x, y, z, w] = q; const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return [(1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
            2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
            2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
            t[0], t[1], t[2], 1];
  };
  const instancias = []; // { mesh, M, nombre, ruta }
  function recorrer(ni, M, ruta) {
    const nd = j.nodes[ni]; const M2 = mul(M, local(nd)); const r2 = nd.name ? [...ruta, nd.name] : ruta;
    if (nd.mesh != null) instancias.push({ mesh: nd.mesh, M: M2, nombre: nd.name || '', ruta: r2 });
    for (const c of nd.children || []) recorrer(c, M2, r2);
  }
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of j.scenes[0].nodes) recorrer(r, I4, []);

  /* Triángulos [[x,y,z]×3] de las primitivas cuyo material cumple `filtro`
     (fn(nombre) → bool). Con `porPrimitiva` devuelve { material, nodo, triangulos }. */
  function triangulos(filtro = () => true, { porPrimitiva = false, conUV = false } = {}) {
    const salida = [];
    for (const inst of instancias) {
      const m = j.meshes[inst.mesh]; const M = inst.M; const tf = inst;
      for (const p of m.primitives) {
        const nombre = j.materials[p.material]?.name ?? '';
        if (!filtro(nombre, inst)) continue;
        const pos = accesor(p.attributes.POSITION); const idx = p.indices != null ? accesor(p.indices).datos : null;
        const norm = pos.normalizado ? (pos.tipo === Int16Array ? 32767 : (pos.tipo === Int8Array ? 127 : 1)) : 1;
        const v = (k) => { const x = pos.datos[3 * k] / norm, y = pos.datos[3 * k + 1] / norm, z = pos.datos[3 * k + 2] / norm; return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; };
        const ntri = (idx ? idx.length : pos.datos.length / 3) / 3;
        const lista = porPrimitiva ? [] : salida;
        const uvA = conUV && p.attributes.TEXCOORD_0 != null ? accesor(p.attributes.TEXCOORD_0) : null;
        const uvs = uvA ? [] : null;
        const normUV = uvA && uvA.normalizado ? (uvA.tipo === Int16Array ? 32767 : uvA.tipo === Uint16Array ? 65535 : uvA.tipo === Int8Array ? 127 : uvA.tipo === Uint8Array ? 255 : 1) : 1;
        const uvDe = (k) => [uvA.datos[2 * k] / normUV, uvA.datos[2 * k + 1] / normUV];
        for (let t = 0; t < ntri; t++) {
          const i0 = idx ? idx[3 * t] : 3 * t, i1 = idx ? idx[3 * t + 1] : 3 * t + 1, i2 = idx ? idx[3 * t + 2] : 3 * t + 2;
          lista.push([v(i0), v(i1), v(i2)]);
          if (uvs) uvs.push([uvDe(i0), uvDe(i1), uvDe(i2)]);
        }
        if (porPrimitiva) salida.push({ material: nombre, nodo: tf.nombre, ruta: tf.ruta, triangulos: lista, uvs });
      }
    }
    return salida;
  }
  return { json: j, triangulos, materiales: j.materials.map((m) => m.name) };
}
