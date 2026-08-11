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

  // ── Tapas de corte (por vértices): para cada muro/estructura que llega
  //    al plano de corte de su tramo, se toma la huella exacta de sus
  //    vértices en la banda del corte. Así las tapas caen siempre a la
  //    cota correcta (nada flota), no falta ninguna, y las escaleras que
  //    cruzan el plano se cortan justo donde lo atraviesan. ──
  const sliceFootprint = (it, yLo, yHi) => {
    const world = it.node.getWorldMatrix();
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0;
    for (const prim of it.node.getMesh().listPrimitives()) {
      const P = prim.getAttribute('POSITION');
      if (!P) continue;
      const pv = [0, 0, 0];
      const count = P.getCount();
      for (let i = 0; i < count; i++) {
        P.getElement(i, pv);
        const v = vec4.fromValues(pv[0], pv[1], pv[2], 1);
        vec4.transformMat4(v, v, world);
        if (v[1] < yLo || v[1] > yHi) continue;
        if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0];
        if (v[2] < z0) z0 = v[2]; if (v[2] > z1) z1 = v[2];
        n++;
      }
    }
    return n >= 3 ? { x0, x1, z0, z1 } : null;
  };

  // La altura REAL del corte no es la cota de losa: se deriva del propio
  // modelo como la moda de los topes de muro de cada (planta, tramo).
  const modalTop = (els, lo, hi) => {
    const hist = {};
    for (const it of els) {
      if (it.y1 < lo || it.y1 > hi) continue;
      const key = Math.round(it.y1 * 4) / 4;
      hist[key] = (hist[key] || 0) + 1;
    }
    let best = null, bn = 0;
    for (const [k, n] of Object.entries(hist)) if (n > bn) { bn = n; best = +k; }
    return bn >= 3 ? best : null;
  };

  const capsByBucket = {};
  for (const bucket of ['baja', 'p1', 'p2', 'atico']) {
    const idx = { baja: 0, p1: 1, p2: 2, atico: 3 }[bucket];
    const caps = [];
    for (const S of SECTIONS) {
      const F = S.floors;
      const base = F[idx];
      const els = byBucket[bucket].filter((it) => {
        if (/^(VEN-|Puerta|Suelo)/.test(it.name)) return false;
        const xc = (it.x0 + it.x1) / 2 - cx;
        return xc >= S.x0 && xc < S.x1;
      });
      // moda de remates del tramo: solo para los elementos que cruzan de largo
      const H = modalTop(els, base + 1.9, base + 3.6) ?? base + 2.6;
      for (const it of els) {
        const h = it.y1 - base;
        if (h < 1.9) continue;                        // peto/media altura: no llega al corte
        let yCap, lo, hi;
        if (h <= 3.6) { yCap = it.y1; lo = it.y1 - 0.45; hi = it.y1 + 0.1; } // remata: tapa en SU tope
        else { yCap = H; lo = H - 0.35; hi = H + 0.2; }                      // cruza: tapa en el corte
        const fp = sliceFootprint(it, lo, hi);
        if (!fp) continue;
        const w = fp.x1 - fp.x0, d = fp.z1 - fp.z0;
        if (Math.min(w, d) > 1.4 || Math.min(w, d) < 0.03) continue;
        caps.push({ ...fp, y: yCap });
      }
    }
    capsByBucket[bucket] = caps;
    console.log('caps', bucket, caps.length);
  }

  const catOf = (name) => {
    if (/^(VEN-|Puerta)/.test(name)) return 'glass';
    if (/^(Muro|Fachada|UNIK|ICV)/.test(name)) return 'wall';
    if (/^Suelo/.test(name)) return 'slab';   // losas: techo-sombra de la planta inferior
    return 'struct';
  };

  const out = new Document();
  const buffer = out.createBuffer();
  const outScene = out.createScene('apolo');
  const MATS = {
    struct: out.createMaterial('struct').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0),
    wall: out.createMaterial('wall').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0),
    glass: out.createMaterial('glass').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.2).setMetallicFactor(0),
    cap: out.createMaterial('cap').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.95).setMetallicFactor(0),
    slab: out.createMaterial('slab').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0),
  };

  // caja axis-aligned → posiciones/normales/índices
  const pushBox = (pos, norm, idxArr, x0, y0, z0, x1, y1, z1) => {
    const base = pos.length / 3;
    const v = [
      [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0], // z0
      [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], // z1
    ];
    const faces = [
      [0,3,2,1, 0,0,-1], [4,5,6,7, 0,0,1],
      [0,1,5,4, 0,-1,0], [3,7,6,2, 0,1,0],
      [0,4,7,3, -1,0,0], [1,2,6,5, 1,0,0],
    ];
    for (const [a,b,c,d,nx,ny,nz] of faces) {
      const s0 = pos.length / 3;
      for (const vi of [a,b,c,d]) { pos.push(...v[vi]); norm.push(nx,ny,nz); }
      idxArr.push(s0, s0+1, s0+2, s0, s0+2, s0+3);
    }
  };

  for (const bucket of ['baja', 'p1', 'p2', 'atico']) {
    const caps = capsByBucket[bucket];
    if (!caps.length) continue;
    const pos = [], norm = [], idxArr = [];
    for (const c of caps) pushBox(pos, norm, idxArr, c.x0 - cx, c.y - 0.035, c.z0 - cz, c.x1 - cx, c.y + 0.015, c.z1 - cz);
    const name = `${bucket}__cap`;
    const pAcc = out.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer);
    const nAcc = out.createAccessor().setType('VEC3').setArray(new Float32Array(norm)).setBuffer(buffer);
    const iAcc = out.createAccessor().setType('SCALAR').setArray(new Uint32Array(idxArr)).setBuffer(buffer);
    const prim = out.createPrimitive().setAttribute('POSITION', pAcc).setAttribute('NORMAL', nAcc).setIndices(iAcc).setMaterial(MATS.cap);
    outScene.addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(prim)));
    console.log('mesh', name, caps.length, 'tapas');
  }

  for (const bucket of BUCKETS) for (const cat of ['struct', 'wall', 'glass', 'slab']) {
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
    const prim = out.createPrimitive().setAttribute('POSITION', pAcc).setAttribute('NORMAL', nAcc).setIndices(iAcc).setMaterial(MATS[cat] || MATS.struct);
    const mesh = out.createMesh(name).addPrimitive(prim);
    outScene.addChild(out.createNode(name).setMesh(mesh));
    console.log('mesh', name, (pos.length / 3).toLocaleString(), 'vértices');
  }

  await out.transform(weld(), quantize());
  await io.write('apolo_levels.glb', out);
  console.log('→ apolo_levels.glb', (fs.statSync('apolo_levels.glb').size / 1e6).toFixed(1), 'MB');
})();
