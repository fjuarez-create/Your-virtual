/* Procesa el FBX→GLB de Revit: asigna cada elemento a una planta lógica
   (sotano/baja/p1/p2/atico/cubierta) según los forjados de su tramo,
   fusiona la geometría por planta y exporta apolo_levels.glb + levels.json */
const { NodeIO, getBounds, Document } = require('@gltf-transform/core');
const fs = require('fs');

const BIN = 4; // ancho de bin en X (m)

(async () => {
  const io = new NodeIO();
  const doc = await io.read('apolo_raw.glb');
  const scene = doc.getRoot().listScenes()[0];

  // ── 1. Recoger todos los nodos con malla y sus cajas ──
  const items = [];
  const slabs = [];
  const walk = (node, parentVisible) => {
    const mesh = node.getMesh();
    if (mesh) {
      const b = getBounds(node);
      const it = {
        node, name: node.getName(),
        x0: b.min[0], x1: b.max[0], y0: b.min[1], y1: b.max[1], z0: b.min[2], z1: b.max[2],
      };
      items.push(it);
      if (/^Suelo FOR/.test(it.name)) {
        const area = (it.x1 - it.x0) * (it.z1 - it.z0);
        if (area > 25) slabs.push({ ...it, area });
      }
    }
    node.listChildren().forEach((c) => walk(c));
  };
  scene.listChildren().forEach((c) => walk(c));

  const gx0 = Math.min(...items.map(i => i.x0)), gx1 = Math.max(...items.map(i => i.x1));
  const gz0 = Math.min(...items.map(i => i.z0)), gz1 = Math.max(...items.map(i => i.z1));
  const cx = (gx0 + gx1) / 2, cz = (gz0 + gz1) / 2;
  console.log('bounds x', gx0.toFixed(1), gx1.toFixed(1), 'z', gz0.toFixed(1), gz1.toFixed(1));

  // ── 2. Escaleras de niveles por bin de X ──
  const bins = [];
  for (let x = gx0; x < gx1; x += BIN) {
    const ys = slabs
      .filter(s => Math.min(s.x1, x + BIN) - Math.max(s.x0, x) > 1.2 && s.y1 > -1.6)
      .map(s => s.y1).sort((a, b) => a - b);
    // clustering: fusionar niveles a menos de 1.1 m (pares delante/detrás +0.78)
    const clusters = [];
    for (const y of ys) {
      if (!clusters.length || y - clusters[clusters.length - 1].max > 1.1) {
        clusters.push({ min: y, max: y });
      } else clusters[clusters.length - 1].max = y;
    }
    bins.push({ x0: x, x1: x + BIN, levels: clusters.map(c => c.min) });
  }
  // rellenar bins vacíos con el vecino más cercano
  for (let i = 0; i < bins.length; i++) {
    if (!bins[i].levels.length) {
      const j = bins.findIndex((b, k) => k > i && b.levels.length);
      const p = [...bins.slice(0, i)].reverse().find(b => b.levels.length);
      bins[i].levels = (p || bins[j]).levels;
    }
  }
  bins.forEach(b => console.log('bin', b.x0.toFixed(0).padStart(4), b.levels.map(v => v.toFixed(1)).join(', ')));

  // Escalera lógica por bin: [PB, P1, P2, AT] (+ROOF si hay 5º)
  // El podio de garaje (−0.82) es PB en todo el edificio salvo donde el
  // terreno sube: si el 1er cluster está por debajo de −0.5 lo tratamos como PB.
  const ladderOf = (xc) => {
    const bin = bins[Math.max(0, Math.min(bins.length - 1, Math.floor((xc - gx0) / BIN)))];
    return bin.levels;
  };

  // ── 3. Asignación de elementos a plantas ──
  const BUCKETS = ['sotano', 'baja', 'p1', 'p2', 'atico', 'cubierta'];
  const byBucket = Object.fromEntries(BUCKETS.map(k => [k, []]));
  for (const it of items) {
    const xc = (it.x0 + it.x1) / 2;
    const L = ladderOf(xc); // niveles crecientes
    let bucket;
    if (it.y1 < -1.4) bucket = 'sotano';                       // completamente bajo rasante
    else {
      // índice del mayor nivel ≤ y0 + 0.7 (apoyo del elemento)
      let idx = -1;
      for (let i = 0; i < L.length; i++) if (L[i] <= it.y0 + 0.7) idx = i;
      if (idx < 0) bucket = it.y0 < -1.0 ? 'sotano' : 'baja';
      else {
        // idx 0..n; n≥4 ⇒ el 5º nivel es cubierta
        const names = L.length >= 5
          ? ['baja', 'p1', 'p2', 'atico', 'cubierta']
          : ['baja', 'p1', 'p2', 'atico'];
        bucket = names[Math.min(idx, names.length - 1)];
        // elementos altos que arrancan sobre el último forjado ⇒ cubierta
        if (idx >= names.length - 1 && it.y0 > L[L.length - 1] + 2.0) bucket = 'cubierta';
      }
    }
    byBucket[bucket].push(it);
  }
  BUCKETS.forEach(k => console.log(k, byBucket[k].length, 'elementos'));

  // ── 4. Fusión de geometría por planta (posiciones en mundo, centradas) ──
  const { mat4, vec3, vec4 } = require('gl-matrix');
  const out = new Document();
  const buffer = out.createBuffer();
  const outScene = out.createScene('apolo');
  const mat = out.createMaterial('hormigon').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0);

  for (const bucket of BUCKETS) {
    const pos = [], norm = [], idxArr = [];
    let base = 0;
    for (const it of byBucket[bucket]) {
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
    const pAcc = out.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer);
    const nAcc = out.createAccessor().setType('VEC3').setArray(new Float32Array(norm)).setBuffer(buffer);
    const iAcc = out.createAccessor().setType('SCALAR').setArray(new Uint32Array(idxArr)).setBuffer(buffer);
    const prim = out.createPrimitive().setAttribute('POSITION', pAcc).setAttribute('NORMAL', nAcc).setIndices(iAcc).setMaterial(mat);
    const mesh = out.createMesh(bucket).addPrimitive(prim);
    const node = out.createNode(bucket).setMesh(mesh);
    outScene.addChild(node);
    console.log('mesh', bucket, (pos.length / 3).toLocaleString(), 'vértices');
  }

  await io.write('apolo_levels.glb', out);
  console.log('→ apolo_levels.glb', (fs.statSync('apolo_levels.glb').size / 1e6).toFixed(1), 'MB');

  // ── 5. levels.json: escaleras por bin en coordenadas de la escena ──
  const sections = bins.map(b => ({
    x0: +(b.x0 - cx).toFixed(2), x1: +(b.x1 - cx).toFixed(2),
    levels: b.levels.map(v => +v.toFixed(2)),
  }));
  fs.writeFileSync('levels.json', JSON.stringify({ cx: +cx.toFixed(2), cz: +cz.toFixed(2), sections }, null, 1));
  console.log('→ levels.json');
})();
