/* ═══════════════════════════════════════════════════════════════
   context.js — Entorno real de la parcela (Las Huesas, Telde):

   · C/ Íñigo López de Mendoza al NORTE (fachada larga, con el
     campo de fútbol Las Huesas enfrente)
   · C/ Sagunto al OESTE (testero alto) · C/ Numancia al ESTE
     (testero bajo) — como en los alzados
   · Hilera de adosados existente al SUR
   · Rasante en RAMPA CONTINUA: pendiente longitudinal O→E (~2,9 m,
     +81,3 → +75,8 según secciones) y transversal N→S. El edificio
     se escalona; la acera acompaña la pendiente sin escalones.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/** Rasante continua: pendiente longitudinal O→E + transversal N→S,
    fundida con el llano (-0.42) lejos de la parcela. */
export function terrainY(x, z) {
  const slopeX = 2.55 - 2.9 * clamp01((x + 60) / 120); // O alto → E bajo
  const slopeZ = -0.0095 * z;                          // N alto → S bajo
  const core = smooth(1 - (Math.abs(x) - 85) / 90) * smooth(1 - (Math.abs(z) - 45) / 80);
  return (slopeX + slopeZ) * core + -0.42 * (1 - core);
}

// zonas reservadas (sin manzanas genéricas): [x0, x1, z0, z1]
const RESERVED = [
  [-300, 300, -170, 60],   // parcela, calles, campo y solares próximos
  [-80, 80, 60, 110],      // adosados del sur
];
const inReserved = (x, z, m = 0) =>
  RESERVED.some(([x0, x1, z0, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);

/** Cinta inclinada que sigue el terreno (acera/calzada en rampa).
    Con carve=true, el terreno se rebaja bajo la huella del edificio
    hasta la cota del podio (la parcela está excavada). */
function ribbon(x0, x1, z0, z1, lift, mat, segsX = 36, segsZ = 2, carve = false, tex = null, texScale = 4) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, segsX, segsZ);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    let y = terrainY(x, z) + lift;
    if (carve) {
      const inside = smooth(1 - (Math.abs(x) - 52) / 10) * smooth(1 - (Math.abs(z) - 13) / 6);
      y = y * (1 - inside) + -0.95 * inside;
    }
    pos.setY(i, y);
  }
  g.computeVertexNormals();
  let useMat = mat;
  if (tex) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set((x1 - x0) / texScale, (z1 - z0) / texScale);
    useMat = mat.clone();
    useMat.map = t;
  }
  const m = new THREE.Mesh(g, useMat);
  m.position.set(cx, 0, cz);
  m.receiveShadow = true;
  return m;
}

function makeAsphaltTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#606267';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 84 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.16 + Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSidewalkTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#c3beb2';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    const v = 168 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},0.25)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
  }
  ctx.strokeStyle = 'rgba(120,115,105,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ── Imagen satélite real (Esri World Imagery) proyectada sobre la
      rasante. Calibrable sin tocar código:
        window.APOLO_GEO = { lat, lon, bearing }  o por URL:
        ?lat=27.97&lon=-15.39&bearing=70
      Al cargar la primera tesela se oculta el suelo procedural. ── */
function addSatellite(scene, fallback) {
  const qs = new URLSearchParams(location.search);
  const GEO = Object.assign(
    { lat: 27.9741, lon: -15.3894, bearing: 70, zoom: 18, span: 9, enabled: true },
    window.APOLO_GEO || {},
    qs.get('lat') ? { lat: +qs.get('lat') } : {},
    qs.get('lon') ? { lon: +qs.get('lon') } : {},
    qs.get('bearing') ? { bearing: +qs.get('bearing') } : {},
    qs.get('sat') === '0' ? { enabled: false } : {}
  );
  if (!GEO.enabled) return;
  const n = 2 ** GEO.zoom;
  const latR = (GEO.lat * Math.PI) / 180;
  const xt = ((GEO.lon + 180) / 360) * n;
  const yt = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const tileM = (Math.cos(latR) * 2 * Math.PI * 6378137) / n; // metros por tesela
  const S = GEO.span;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S * 256;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const size = S * tileM;
  const geo = new THREE.PlaneGeometry(size, size, 110, 110);
  geo.rotateX(-Math.PI / 2);
  const rot = THREE.MathUtils.degToRad(GEO.bearing - 90); // alinear la calle con +X
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const wx = x * cosR + z * sinR, wz = -x * sinR + z * cosR;
    pos.setY(i, terrainY(wx, wz) - 0.16);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  mesh.rotation.y = rot;
  mesh.receiveShadow = true;
  mesh.visible = false;
  scene.add(mesh);

  let first = true;
  const tx0 = xt - S / 2, ty0 = yt - S / 2;
  for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
    const tx = Math.floor(tx0) + i, ty = Math.floor(ty0) + j;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, (tx - tx0) * 256, (ty - ty0) * 256);
      tex.needsUpdate = true;
      mesh.visible = true;
      if (first) { first = false; if (fallback) fallback.visible = false; }
    };
    img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${GEO.zoom}/${ty}/${tx}`;
  }
}

function groundText(text, w = 46) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(248,250,253,0.62)';
  ctx.font = '500 58px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.letterSpacing = '14px';
  ctx.fillText(text.toUpperCase(), 512, 64);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w / 8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ─── Campo de fútbol Las Huesas (al norte, cruzando Íñigo López) ───
function footballField() {
  const g = new THREE.Group();
  const W = 100, H = 62;
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 640;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#3e7a46';
  ctx.fillRect(0, 0, 1024, 640);
  for (let i = 0; i < 10; i += 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(i * 102.4, 0, 102.4, 640);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, 944, 560);
  ctx.beginPath(); ctx.moveTo(512, 40); ctx.lineTo(512, 600); ctx.stroke();
  ctx.beginPath(); ctx.arc(512, 320, 72, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(40, 190, 130, 260);
  ctx.strokeRect(854, 190, 130, 260);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  g.add(pitch);
  const goalMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 });
  for (const sx of [-1, 1]) {
    const goal = new THREE.Group();
    const post = new THREE.BoxGeometry(0.12, 2.4, 0.12);
    const bar = new THREE.BoxGeometry(0.12, 0.12, 7.3);
    const p1 = new THREE.Mesh(post, goalMat); p1.position.set(0, 1.2, -3.6);
    const p2 = new THREE.Mesh(post, goalMat); p2.position.set(0, 1.2, 3.6);
    const b = new THREE.Mesh(bar, goalMat); b.position.set(0, 2.4, 0);
    goal.add(p1, p2, b);
    goal.position.set(sx * (W / 2 - 4.2), 0, 0);
    g.add(goal);
  }
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0xadb8bd, transparent: true, opacity: 0.38, roughness: 0.6,
  });
  const mkFence = (w, d, x, z) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), fenceMat);
    f.position.set(x, 1.5, z);
    g.add(f);
  };
  mkFence(W + 6, 0.1, 0, -H / 2 - 3);
  mkFence(W + 6, 0.1, 0, H / 2 + 3);
  mkFence(0.1, H + 6, -W / 2 - 3, 0);
  mkFence(0.1, H + 6, W / 2 + 3, 0);
  return g;
}

export function buildContext(scene) {
  let seed = 20260810;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  // ── Suelo llano lejano ──
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(950, 80),
    new THREE.MeshStandardMaterial({ color: 0x9c9884, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.46;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Terreno en rampa alrededor de la parcela (fallback si no hay satélite) ──
  const fallback = new THREE.Group();
  scene.add(fallback);
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0xa89e88, roughness: 1 });
  fallback.add(ribbon(-190, 190, -60, 110, -0.06, dirtMat, 96, 32, true));
  addSatellite(scene, fallback);

  // ── Aceras y calzadas en rampa continua ──
  const sidewalkTex = makeSidewalkTex();
  const asphaltTex = makeAsphaltTex();
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  // acera norte (Íñigo López de Mendoza) y sur
  scene.add(ribbon(-64, 64, -20.8, -16.6, 0.1, sidewalkMat, 36, 2, false, sidewalkTex, 3.2));
  scene.add(ribbon(-64, 64, 16.6, 20.8, 0.1, sidewalkMat, 36, 2, false, sidewalkTex, 3.2));
  // calzada Íñigo López de Mendoza (norte, larga)
  scene.add(ribbon(-260, 260, -31.5, -21, 0.02, asphaltMat, 90, 2, false, asphaltTex, 7));
  // vial de servicio sur (entre parcela y adosados)
  scene.add(ribbon(-90, 90, 21, 29.5, 0.02, asphaltMat, 48, 2, false, asphaltTex, 7));
  // testeros: C/ Sagunto (oeste) y C/ Numancia (este)
  scene.add(ribbon(-72, -62, -140, 130, 0.02, asphaltMat, 4, 60, false, asphaltTex, 7));
  scene.add(ribbon(62, 72, -140, 130, 0.02, asphaltMat, 4, 60, false, asphaltTex, 7));
  // aceras de testeros
  scene.add(ribbon(-61.8, -58, -30, 25, 0.1, sidewalkMat, 3, 20, false, sidewalkTex, 3.2));
  scene.add(ribbon(58, 61.8, -30, 25, 0.1, sidewalkMat, 3, 20, false, sidewalkTex, 3.2));

  const t1 = groundText('C/ Íñigo López de Mendoza', 58);
  t1.position.set(0, terrainY(0, -26) + 0.12, -26);
  scene.add(t1);
  const t2 = groundText('Calle Sagunto', 40);
  t2.position.set(-67, terrainY(-67, -15) + 0.12, -15);
  t2.rotation.z = Math.PI / 2;
  scene.add(t2);
  const t3 = groundText('Calle Numancia', 40);
  t3.position.set(67, terrainY(67, -15) + 0.12, -15);
  t3.rotation.z = -Math.PI / 2;
  scene.add(t3);

  // ── Campo de fútbol Las Huesas al norte ──
  const field = footballField();
  field.position.set(-8, -0.3, -72);
  scene.add(field);

  // ── Adosados existentes al sur (cubiertas claras, 2 plantas) ──
  {
    const rowMat = new THREE.MeshStandardMaterial({ color: 0xd8d1c0, roughness: 0.95 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.8 });
    const patioMat = new THREE.MeshStandardMaterial({ color: 0xcdc4b0, roughness: 1 });
    for (let i = 0; i < 13; i++) {
      const x = -54 + i * 9;
      const y = terrainY(x, 38);
      const casa = new THREE.Mesh(new THREE.BoxGeometry(8.4, 5.8, 11.5), rowMat);
      casa.position.set(x, y + 2.9, 38);
      casa.castShadow = casa.receiveShadow = true;
      scene.add(casa);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.5, 6), roofMat);
      roof.position.set(x, y + 6.0, 35.8);
      scene.add(roof);
      const patio = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, 5), patioMat);
      patio.position.set(x, y + 0.4, 48);
      scene.add(patio);
    }
  }

  // ── Solares de tierra con arbolitos (zonas verdes del plano) ──
  const lotMat = new THREE.MeshStandardMaterial({ color: 0xb0a488, roughness: 1 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x6a835a, roughness: 1 });
  const lots = [
    [-160, -95, -55, 40],   // O de Sagunto (grande)
    [80, 150, -50, 30],     // E de Numancia
    [95, 190, -110, -60],   // NE, cruzando Mendoza
    [-190, -80, -130, -75], // NO, junto al campo
  ];
  const treeSpots = [];
  for (const [x0, x1, z0, z1] of lots) {
    const lot = ribbon(x0, x1, z0, z1, -0.02, lotMat, 12, 6);
    fallback.add(lot);
    // manchas de verde + arbolitos (los garabatos verdes del plano)
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const gx = x0 + 8 + rnd() * (x1 - x0 - 16);
      const gz = z0 + 8 + rnd() * (z1 - z0 - 16);
      const patch = new THREE.Mesh(new THREE.CylinderGeometry(4 + rnd() * 5, 4 + rnd() * 5, 0.1, 9), greenMat);
      patch.position.set(gx, terrainY(gx, gz) + 0.05, gz);
      scene.add(patch);
      const nt = 2 + Math.floor(rnd() * 3);
      for (let t = 0; t < nt; t++) {
        treeSpots.push([gx + (rnd() - 0.5) * 8, gz + (rnd() - 0.5) * 8, 0.9 + rnd() * 1.3]);
      }
    }
  }

  // ── Barrio genérico (al sur y lejos), bajo y simplificado ──
  const palette = [0xe9e4d8, 0xded5c2, 0xd3c3ab, 0xcbb49a, 0xd8d2c4, 0xc9beb0, 0xd9825f];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const cityMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const houses = [];
  const greens = [];
  const GRID = 58;
  for (let gx = -750; gx <= 750; gx += GRID) {
    for (let gz = -750; gz <= 750; gz += GRID) {
      if (inReserved(gx, gz, 20)) continue;
      if (gx * gx + gz * gz > 780 * 780) continue;
      // el casco está sobre todo al S-SE (como en el plano)
      const density = gz > 40 ? 0.95 : 0.55;
      if (rnd() > density) { if (rnd() < 0.5) greens.push([gx, gz]); continue; }
      if (rnd() < 0.16) { greens.push([gx, gz]); continue; }
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const bw = 11 + rnd() * 13, bd = 10 + rnd() * 12;
        const bh = rnd() < 0.05 ? 11 + rnd() * 5 : 3.2 + rnd() * 5.2;
        houses.push({
          x: gx + (rnd() - 0.5) * (GRID - bw - 12),
          z: gz + (rnd() - 0.5) * (GRID - bd - 12),
          bw, bd, bh, c: palette[Math.floor(rnd() * palette.length)],
        });
      }
    }
  }
  const city = new THREE.InstancedMesh(boxGeo, cityMat, houses.length);
  houses.forEach((it, i) => {
    m4.makeScale(it.bw, it.bh, it.bd);
    m4.setPosition(it.x, -0.35, it.z);
    city.setMatrixAt(i, m4);
    city.setColorAt(i, col.setHex(it.c));
  });
  city.castShadow = city.receiveShadow = true;
  scene.add(city);

  // solares verdes del barrio
  const lotGeo = new THREE.CylinderGeometry(1, 1, 0.12, 10);
  const lotsIM = new THREE.InstancedMesh(lotGeo, greenMat, greens.length);
  greens.forEach(([gx, gz], i) => {
    m4.makeScale(15 + rnd() * 9, 1, 12 + rnd() * 7);
    m4.setPosition(gx, -0.38, gz);
    lotsIM.setMatrixAt(i, m4);
    lotsIM.setColorAt(i, col.setHSL(0.25 + rnd() * 0.07, 0.3, 0.32 + rnd() * 0.08));
  });
  lotsIM.receiveShadow = true;
  scene.add(lotsIM);

  // ── Arbolado (copas redondas) ──
  for (const [gx, gz] of greens) {
    const n = 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) treeSpots.push([gx + (rnd() - 0.5) * 20, gz + (rnd() - 0.5) * 15, 1 + rnd() * 1.6]);
  }
  for (let i = 0; i < 240; i++) {
    const a = rnd() * Math.PI * 2, r = 120 + rnd() * 600;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inReserved(x, z, 4)) continue;
    treeSpots.push([x, z, 1.2 + rnd() * 1.7]);
  }
  const treeGeo = new THREE.IcosahedronGeometry(1, 1);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x5b8a54, roughness: 1, flatShading: true });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeSpots.length);
  treeSpots.forEach(([x, z, s], i) => {
    m4.makeScale(s, s * 1.15, s);
    m4.setPosition(x, terrainY(x, z) + s, z);
    trees.setMatrixAt(i, m4);
    trees.setColorAt(i, col.setHSL(0.27 + rnd() * 0.07, 0.38, 0.3 + rnd() * 0.12));
  });
  trees.castShadow = true;
  scene.add(trees);

  // ── Palmeras (tronco + corona de frondas) ──
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 1 });
  const frondParts = [];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.ConeGeometry(0.55, 3.0, 4);
    f.scale(1, 1, 0.28);
    f.rotateX(Math.PI / 2 + 0.55);
    f.rotateY((i / 7) * Math.PI * 2);
    f.translate(0, 1.0, 0);
    frondParts.push(f);
  }
  const crownGeo = mergeGeometries(frondParts);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x4f7d3f, roughness: 0.9, flatShading: true });

  const palmSpots = [];
  // alineación en la acera norte (Íñigo López de Mendoza)
  for (let x = -56; x <= 56; x += 13.5) {
    palmSpots.push([x, -19.6, 4.4 + rnd() * 1.6]);
  }
  // algunas entre la calle y la valla del campo
  for (let i = 0; i < 8; i++) palmSpots.push([-64 + rnd() * 120, -35.5 + rnd() * 2.2, 4 + rnd() * 2.5]);
  for (let i = 0; i < 55; i++) {
    const a = rnd() * Math.PI * 2, r = 130 + rnd() * 520;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inReserved(x, z, 2)) continue;
    palmSpots.push([x, z, 3.6 + rnd() * 3.2]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  palmSpots.forEach(([x, z, h], i) => {
    const y = terrainY(x, z);
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, h, 1));
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, y + h - 0.4, z), q, new THREE.Vector3(1.1, 1, 1.1));
    crowns.setMatrixAt(i, m4);
  });
  trunks.castShadow = crowns.castShadow = true;
  scene.add(trunks, crowns);

  // ── Medianías al O-S y mar al NE ──
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x86795f, roughness: 1 });
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (0.62 + rnd() * 0.75);
    const r = 1050 + rnd() * 320;
    const h = 45 + rnd() * 75;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(280 + rnd() * 260, h, 6), hillMat);
    hill.position.set(Math.cos(a) * r, h / 2 - 22, Math.abs(Math.sin(a)) * r * 0.8);
    hill.rotation.y = rnd() * Math.PI;
    scene.add(hill);
  }
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 900),
    new THREE.MeshStandardMaterial({ color: 0x4f7a95, roughness: 0.3, metalness: 0.1 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(250, -3, -1250);
  scene.add(sea);
}
