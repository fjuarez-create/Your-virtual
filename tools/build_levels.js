/* Reasignación escrupulosa de plantas: anclada a las cotas reales de los
   alzados (SECTIONS de js/layout.js) y por punto medio del elemento. */
const { NodeIO, getBounds, Document } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, quantize } = require('@gltf-transform/functions');
const { mat4, vec4 } = require('gl-matrix');
const fs = require('fs');

// Cotas reales por tramo (coordenadas de escena, X centrado)
const SECTIONS = [
  { x0: -60, x1: -31, floors: [-0.8, 2.1, 4.9, 7.7] },
  { x0: -31, x1: 3.6, floors: [-0.8, 2.7, 6.3, 9.3] },
  { x0: 3.6, x1: 31.6, floors: [-0.8, 1.3, 4.9, 7.9] },
  { x0: 31.6, x1: 60, floors: [-0.1, 3.5, 6.5, 9.5] },
];
const MARGIN = 0.4;   // tolerancia sobre la cota de forjado (punto medio)
const BUCKETS = ['sotano', 'baja', 'p1', 'p2', 'atico', 'cubierta'];

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('apolo_raw.glb');
  const scene = doc.getRoot().listScenes()[0];

  const items = [];
  const walk = (node) => {
    if (node.getMesh()) {
      const b = getBounds(node);
      items.push({ node, name: node.getName(),
        x0: b.min[0], x1: b.max[0], y0: b.min[1], y1: b.max[1], z0: b.min[2], z1: b.max[2] });
    }
    node.listChildren().forEach(walk);
  };
  scene.listChildren().forEach(walk);

  const gx0 = Math.min(...items.map(i => i.x0)), gx1 = Math.max(...items.map(i => i.x1));
  const gz0 = Math.min(...items.map(i => i.z0)), gz1 = Math.max(...items.map(i => i.z1));
  const cx = (gx0 + gx1) / 2, cz = (gz0 + gz1) / 2;
  console.log('cx', cx.toFixed(2), 'cz', cz.toFixed(2));

  // tramo por solape máximo en X (coordenadas centradas)
  const sectionOf = (it) => {
    let best = SECTIONS[0], bo = -1;
    for (const S of SECTIONS) {
      const o = Math.min(it.x1 - cx, S.x1) - Math.max(it.x0 - cx, S.x0);
      if (o > bo) { bo = o; best = S; }
    }
    return best;
  };

  const byBucket = Object.fromEntries(BUCKETS.map(k => [k, []]));
  for (const it of items) {
    const F = sectionOf(it).floors;
    const mid = (it.y0 + it.y1) / 2;
    let bucket;
    if (it.y1 < F[0] - 0.25) bucket = 'sotano';                 // bajo la losa de baja
    else if (it.y0 > F[3] + 2.2) bucket = 'cubierta';           // casetones sobre el ático
    else {
      let idx = 0;
      for (let i = 0; i < 4; i++) if (F[i] <= mid + MARGIN) idx = i;
      if (mid + MARGIN < F[0]) bucket = 'sotano';
      else bucket = ['baja', 'p1', 'p2', 'atico'][idx];
    }
    byBucket[bucket].push(it);
  }
  BUCKETS.forEach(k => console.log(k.padEnd(9), byBucket[k].length, 'elementos'));

  const catOf = (name) => {
    if (/^(VEN-|Puerta)/.test(name)) return 'glass';
    if (/^(Muro|Fachada|UNIK|ICV)/.test(name)) return 'wall';
    return 'struct';
  };

  const out = new Document();
  const buffer = out.createBuffer();
  const outScene = out.createScene('apolo');
  const MATS = {
    struct: out.createMaterial('struct').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0),
    wall: out.createMaterial('wall').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0),
    glass: out.createMaterial('glass').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.2).setMetallicFactor(0),
  };

  for (const bucket of BUCKETS) for (const cat of ['struct', 'wall', 'glass']) {
    const pos = [], norm = [], idxArr = [];
    let base = 0;
    for (const it of byBucket[bucket]) {
      if (catOf(it.name) !== cat) continue;
      const world = it.node.getWorldMatrix();
      const nrmMat = mat4.create();
      mat4.invert(nrmMat, world); mat4.transpose(nrmMat, nrmMat);
      for (const prim of it.node.getMesh().listPrimitives()) {
        const P = prim.getAttribute('POSITION'); if (!P) continue;
        const N = prim.getAttribute('NORMAL');
        const I = prim.getIndices();
        const n = P.getCount();
        const pv = [0, 0, 0], nv = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          P.getElement(i, pv);
          const v = vec4.fromValues(pv[0], pv[1], pv[2], 1);
          vec4.transformMat4(v, v, world);
          pos.push(v[0] - cx, v[1], v[2] - cz);
          if (N) {
            N.getElement(i, nv);
            const w = vec4.fromValues(nv[0], nv[1], nv[2], 0);
            vec4.transformMat4(w, w, nrmMat);
            const l = Math.hypot(w[0], w[1], w[2]) || 1;
            norm.push(w[0] / l, w[1] / l, w[2] / l);
          } else norm.push(0, 1, 0);
        }
        if (I) { const c = I.getCount(); for (let i = 0; i < c; i++) idxArr.push(base + I.getScalar(i)); }
        else for (let i = 0; i < n; i++) idxArr.push(base + i);
        base += n;
      }
    }
    if (!pos.length) continue;
    const name = `${bucket}__${cat}`;
    const pAcc = out.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer);
    const nAcc = out.createAccessor().setType('VEC3').setArray(new Float32Array(norm)).setBuffer(buffer);
    const iAcc = out.createAccessor().setType('SCALAR').setArray(new Uint32Array(idxArr)).setBuffer(buffer);
    const prim = out.createPrimitive().setAttribute('POSITION', pAcc).setAttribute('NORMAL', nAcc).setIndices(iAcc).setMaterial(MATS[cat]);
    const mesh = out.createMesh(name).addPrimitive(prim);
    outScene.addChild(out.createNode(name).setMesh(mesh));
    console.log('mesh', name, (pos.length / 3).toLocaleString(), 'vértices');
  }

  await out.transform(weld(), quantize());
  await io.write('apolo_levels.glb', out);
  console.log('→ apolo_levels.glb', (fs.statSync('apolo_levels.glb').size / 1e6).toFixed(1), 'MB');
})();
