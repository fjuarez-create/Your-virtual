/* Carga ambos GLB con el GLTFLoader real del visor, sin GPU. Compara cada
   triángulo conservado con el original y verifica terreno/texturas intactos.
   node tools/validar_recorte.mjs original.glb recorte.glb */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
const raiz = new URL('../', import.meta.url);
registerHooks({ resolve(s, c, next) {
  if (s === 'three') s = new URL('new/vendor/three/three.core.min.js', raiz).href;
  return next(s, c);
}});
const THREE = await import('three');
const { GLTFLoader } = await import('../new/vendor/three/addons/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('../new/vendor/three/addons/libs/meshopt_decoder.module.js');
globalThis.self = globalThis;
// Los bytes de imagen se verifican abajo. Esta prueba no decodifica texturas.
THREE.TextureLoader.prototype.load = function (url, onLoad) {
  const t = new THREE.Texture({ width: 1, height: 1 });
  queueMicrotask(() => onLoad(t)); return t;
};
async function cargar(file) {
  const b = fs.readFileSync(file);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  gltf.scene.updateMatrixWorld(true); return gltf;
}
function primitivos(o) { const m = []; o.traverse(x => { if (x.isMesh) m.push(x); }); return m; }
const v = new THREE.Vector3();
function triangulos(mesh) {
  const g = mesh.geometry, p = g.getAttribute('position'), ids = g.index;
  const res = new Map();
  for (let t = 0; t < (ids?.count || p.count); t += 3) {
    const corners = [];
    for (let j = 0; j < 3; j++) {
      v.fromBufferAttribute(p, ids ? ids.getX(t + j) : t + j);
      // Coordenadas locales exactas: no se permite ni simplificar ni mover.
      corners.push(v.toArray().map(x => x.toPrecision(10)).join(','));
    }
    const k = corners.sort().join(';'); res.set(k, (res.get(k) || 0) + 1);
  }
  return res;
}
const [fuente, destino] = process.argv.slice(2);
const a = await cargar(fuente), b = await cargar(destino);
let comprobados = 0, tris = 0;
for (const nodo of b.scene.children) {
  const origen = await a.parser.getDependency('node', nodo.userData.nodoOrigen);
  assert.ok(origen, 'trazabilidad al nodo original');
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(nodo.matrixWorld.elements[i] - origen.matrixWorld.elements[i]) < 1e-6, 'transformación intacta');
  const originals = primitivos(origen);
  for (const mesh of primitivos(nodo)) {
    const orig = originals.find(m => m.material.name === mesh.material.name);
    assert.ok(orig, 'material original');
    const existentes = triangulos(orig), conservados = triangulos(mesh);
    for (const [k, n] of conservados) assert.ok((existentes.get(k) || 0) >= n, 'ningún triángulo añadido o modificado');
    tris += mesh.geometry.index.count / 3; comprobados++;
  }
}
function imagenes(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20+n)), bin = b.subarray(28+n);
  return (j.images || []).map(i => { const v=j.bufferViews[i.bufferView];return createHash('sha256').update(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)).digest('hex'); });
}
assert.deepEqual(imagenes(destino), imagenes(fuente), 'texturas originales intactas');
const informe = JSON.parse(fs.readFileSync(destino + '.json'));
assert.equal(tris, informe.triangulosDespues);
assert.equal(informe.baseAntes, informe.baseDespues);
for (const [nombre, cuenta] of Object.entries(informe.materiales)) {
  if (cuenta.base) assert.equal(cuenta.antes, cuenta.despues, `base intacta: ${nombre}`);
}
console.log(JSON.stringify({ ok: true, mallasVerificadas: comprobados, triangulosVerificados: tris, terrenoYTexturasIntactos: true }));
