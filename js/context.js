/* ═══════════════════════════════════════════════════════════════
   context.js — Entorno urbano de Las Huesas (Telde):
   rasante en pendiente con aceras escalonadas siguiendo los
   portales, campo de fútbol junto a la parcela, parque con
   palmeras, barrio residencial bajo y vegetación en los solares.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDING, SECTIONS, streetYAt } from './layout.js';

// zonas reservadas (sin manzanas de relleno): [x0, x1, z0, z1]
const RESERVED = [
  [-135, 135, -70, 70],   // parcela + calles perimetrales
  [-45, 80, -145, -72],   // campo de fútbol
  [-215, -120, -55, 55],  // parque
];

function inReserved(x, z, m = 0) {
  return RESERVED.some(([x0, x1, z0, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);
}

function groundText(text, w = 46) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(245,248,252,0.6)';
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

// ─── Campo de fútbol con marcaje pintado ───
function footballField() {
  const g = new THREE.Group();
  const W = 100, H = 62;
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 640;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#3e7a46';
  ctx.fillRect(0, 0, 1024, 640);
  // bandas de siega
  for (let i = 0; i < 10; i++) {
    if (i % 2) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(i * 102.4, 0, 102.4, 640);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, 944, 560);
  ctx.beginPath(); ctx.moveTo(512, 40); ctx.lineTo(512, 600); ctx.stroke();
  ctx.beginPath(); ctx.arc(512, 320, 72, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(40, 190, 130, 260);  // área izq
  ctx.strokeRect(854, 190, 130, 260); // área dcha
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  g.add(pitch);
  // porterías
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
  // valla perimetral ligera
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0xadb8bd, transparent: true, opacity: 0.4, roughness: 0.6,
  });
  const mkFence = (w, d, x, z) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), fenceMat);
    f.position.set(x, 1.2, z);
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
  const vS = new THREE.Vector3();

  // ── Suelo general ──
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(950, 80),
    new THREE.MeshStandardMaterial({ color: 0x8e9077, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.45;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Explanada de la parcela + aceras escalonadas por tramos ──
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 1 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb9b4a9, roughness: 0.95 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x84807a, roughness: 1 });
  const D2 = BUILDING.depth / 2;
  for (const sec of SECTIONS) {
    const w = sec.x1 - sec.x0, cx = (sec.x0 + sec.x1) / 2;
    // explanada bajo el edificio (del sótano a la rasante del tramo)
    const apron = new THREE.Mesh(new THREE.BoxGeometry(w, sec.street + 1.6, BUILDING.depth + 9), apronMat);
    apron.position.set(cx, (sec.street + 1.6) / 2 - 1.5, 0);
    apron.receiveShadow = true;
    scene.add(apron);
    // aceras SO y NE siguiendo la rasante del tramo
    for (const sz of [1, -1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 3.6), sidewalkMat);
      sw.position.set(cx, sec.street + 0.02, sz * (D2 + 6.4));
      sw.castShadow = sw.receiveShadow = true;
      scene.add(sw);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, 0.35), curbMat);
      curb.position.set(cx, sec.street - 0.05, sz * (D2 + 8.3));
      scene.add(curb);
    }
  }

  // ── Calles en pendiente junto al edificio, planas a lo lejos ──
  const streetMat = new THREE.MeshStandardMaterial({ color: 0x5f6166, roughness: 1 });
  const mkStreetSeg = (w, d, x, z, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, d), streetMat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  // tramos frente al edificio a la cota de cada sección
  for (const sec of SECTIONS) {
    const w = sec.x1 - sec.x0, cx = (sec.x0 + sec.x1) / 2;
    mkStreetSeg(w, 9.5, cx, D2 + 13, sec.street - 0.14);   // Numancia
    mkStreetSeg(w, 9.5, cx, -(D2 + 13), sec.street - 0.14); // Sagunto
  }
  // prolongaciones planas
  mkStreetSeg(1100, 9.5, -60 - 550, D2 + 13, SECTIONS[0].street - 0.14);
  mkStreetSeg(1100, 9.5, 60 + 550, D2 + 13, SECTIONS[3].street - 0.14);
  mkStreetSeg(1100, 9.5, -60 - 550, -(D2 + 13), SECTIONS[0].street - 0.14);
  mkStreetSeg(1100, 9.5, 60 + 550, -(D2 + 13), SECTIONS[3].street - 0.14);
  // transversales O y E
  mkStreetSeg(10, 1200, -66, 0, SECTIONS[0].street - 0.14);
  mkStreetSeg(10, 1200, 66, 0, SECTIONS[3].street - 0.14);

  const t1 = groundText('Calle Numancia', 46);
  t1.position.set(0, streetYAt(0) + 0.02, D2 + 13);
  scene.add(t1);
  const t2 = groundText('Calle Sagunto', 46);
  t2.position.set(0, streetYAt(0) + 0.02, -(D2 + 13));
  t2.rotation.z = Math.PI;
  scene.add(t2);
  const t3 = groundText('C/ Íñigo López de Mendoza', 56);
  t3.position.set(-66, SECTIONS[0].street + 0.02, 0);
  t3.rotation.z = Math.PI / 2;
  scene.add(t3);

  // ── Campo de fútbol junto a la parcela (al NE, cruzando Sagunto) ──
  const field = footballField();
  field.position.set(16, -0.28, -108);
  scene.add(field);

  // ── Parque al oeste ──
  const park = new THREE.Mesh(
    new THREE.PlaneGeometry(92, 106),
    new THREE.MeshStandardMaterial({ color: 0x557a4b, roughness: 1 })
  );
  park.rotation.x = -Math.PI / 2;
  park.position.set(-166, -0.32, 0);
  park.receiveShadow = true;
  scene.add(park);
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xc7bda9, roughness: 1 });
  const path1 = new THREE.Mesh(new THREE.BoxGeometry(88, 0.1, 3), pathMat);
  path1.position.set(-166, -0.26, 0);
  scene.add(path1);
  const path2 = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 100), pathMat);
  path2.position.set(-166, -0.26, 0);
  scene.add(path2);

  // ── Barrio residencial bajo y simplificado ──
  const palette = [0xe9e4d8, 0xded5c2, 0xd3c3ab, 0xcbb49a, 0xd8d2c4, 0xc9beb0];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const cityMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const houses = [];
  const greens = [];
  const GRID = 62;
  for (let gx = -750; gx <= 750; gx += GRID) {
    for (let gz = -750; gz <= 750; gz += GRID) {
      if (inReserved(gx, gz, 18)) continue;
      if (gx * gx + gz * gz > 780 * 780) continue;
      if (rnd() < 0.2) { greens.push([gx, gz]); continue; } // solar con vegetación
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const bw = 11 + rnd() * 13, bd = 10 + rnd() * 12;
        const bh = rnd() < 0.06 ? 12 + rnd() * 6 : 3.2 + rnd() * 5.4; // 1-3 plantas
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

  // ── Solares verdes ──
  const lotGeo = new THREE.CylinderGeometry(1, 1, 0.12, 10);
  const lotMat = new THREE.MeshStandardMaterial({ color: 0x5f7d4e, roughness: 1 });
  const lots = new THREE.InstancedMesh(lotGeo, lotMat, greens.length);
  greens.forEach(([gx, gz], i) => {
    m4.makeScale(16 + rnd() * 9, 1, 13 + rnd() * 7);
    m4.setPosition(gx, -0.36, gz);
    lots.setMatrixAt(i, m4);
    lots.setColorAt(i, col.setHSL(0.26 + rnd() * 0.06, 0.32, 0.3 + rnd() * 0.08));
  });
  lots.receiveShadow = true;
  scene.add(lots);

  // ── Arbolado: copas redondas (árboles y arbustos) ──
  const treeGeo = new THREE.IcosahedronGeometry(1, 1);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x5b8a54, roughness: 1, flatShading: true });
  const treeSpots = [];
  // en solares
  for (const [gx, gz] of greens) {
    const n = 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) treeSpots.push([gx + (rnd() - 0.5) * 22, gz + (rnd() - 0.5) * 16, 1.1 + rnd() * 1.6]);
  }
  // dispersos por el barrio
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = 95 + rnd() * 620;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inReserved(x, z, 4)) continue;
    treeSpots.push([x, z, 1.3 + rnd() * 1.7]);
  }
  // en el parque
  for (let i = 0; i < 26; i++) treeSpots.push([-166 + (rnd() - 0.5) * 80, (rnd() - 0.5) * 92, 1.5 + rnd() * 1.6]);
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeSpots.length);
  treeSpots.forEach(([x, z, s], i) => {
    m4.makeScale(s, s * 1.15, s);
    m4.setPosition(x, s, z);
    trees.setMatrixAt(i, m4);
    trees.setColorAt(i, col.setHSL(0.27 + rnd() * 0.07, 0.38, 0.3 + rnd() * 0.12));
  });
  trees.castShadow = true;
  scene.add(trees);

  // ── Palmeras (canarias): tronco + corona de frondas ──
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
  // hileras en las calles del edificio (a cota de acera)
  for (let x = -52; x <= 52; x += 14.5) {
    palmSpots.push([x, D2 + 8.6, streetYAt(x) + 0.05, 4.6 + rnd() * 1.4]);
    palmSpots.push([x + 7, -(D2 + 8.6), streetYAt(x + 7) + 0.05, 4.4 + rnd() * 1.6]);
  }
  // parque y campo
  for (let i = 0; i < 22; i++) palmSpots.push([-166 + (rnd() - 0.5) * 84, (rnd() - 0.5) * 96, -0.3, 4 + rnd() * 3]);
  for (let i = 0; i < 8; i++) palmSpots.push([-42 + rnd() * 130, -140 + rnd() * 6, -0.3, 4 + rnd() * 2.5]);
  // salpicadas por el barrio
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = 110 + rnd() * 560;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inReserved(x, z, 2)) continue;
    palmSpots.push([x, z, -0.35, 3.6 + rnd() * 3.4]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  palmSpots.forEach(([x, z, y, h], i) => {
    q.setFromAxisAngle(vS.set(0, 1, 0), rnd() * Math.PI * 2);
    m4.compose(vS.clone().set(x, y, z), q, new THREE.Vector3(1, h, 1));
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
