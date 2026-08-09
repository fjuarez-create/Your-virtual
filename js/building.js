/* ═══════════════════════════════════════════════════════════════
   building.js — Construcción procedural del Edificio Apolo
   (volumen esquemático fiel a plantas, patios y ático del proyecto)
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDING, FLOOR_DEFS, ROOF_Y, PATIOS, computeLayout } from './layout.js';

export const ESTADO_COLORS = {
  disponible: new THREE.Color(0x35d69a),
  reservada:  new THREE.Color(0xf2b93b),
  vendida:    new THREE.Color(0xe35d5d),
};
const BASE_UNIT = new THREE.Color(0xe9e7e1);
const DIM_COLOR = new THREE.Color(0x3a4356);

// ─── Forma exterior con chaflanes + huecos de patios ───
function outerShape() {
  const { length: L, depth: D, chamfer: c } = BUILDING;
  const hl = L / 2, hd = D / 2;
  const s = new THREE.Shape();
  s.moveTo(-hl + c, -hd);
  s.lineTo(hl - c, -hd);  s.lineTo(hl, -hd + c);
  s.lineTo(hl, hd - c);   s.lineTo(hl - c, hd);
  s.lineTo(-hl + c, hd);  s.lineTo(-hl, hd - c);
  s.lineTo(-hl, -hd + c); s.closePath();
  return s;
}

function slabGeometry(courts, depthY) {
  const shape = outerShape();
  for (const ct of courts) {
    const hw = ct.w / 2, hd = ct.d / 2;
    const hole = new THREE.Path();
    hole.moveTo(ct.x - hw, ct.z - hd);
    hole.lineTo(ct.x + hw, ct.z - hd);
    hole.lineTo(ct.x + hw, ct.z + hd);
    hole.lineTo(ct.x - hw, ct.z + hd);
    hole.closePath();
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: depthY, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // el shape estaba en XY(→XZ), extrusión en -Y
  return g;
}

function makeLabelSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(10,15,28,0.85)';
  const r = 14;
  ctx.beginPath();
  ctx.roundRect(8, 6, 112, 52, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217,180,92,0.8)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '700 30px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(4.6, 2.3, 1);
  return sp;
}

function groundText(text, w = 46) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(200,214,236,0.5)';
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

function tree(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.1 * s, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 1 })
  );
  trunk.position.y = 0.55 * s;
  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.85 * s, 1),
    new THREE.MeshStandardMaterial({ color: 0x3f8f5f, roughness: 0.9, flatShading: true })
  );
  crown.position.y = 1.6 * s;
  crown.scale.y = 1.15;
  g.add(trunk, crown);
  g.position.set(x, 0, z);
  return g;
}

/* ═══════════════════════════════════════════════════════════════
   Vivienda "dollhouse": suelo, muros en corte y mobiliario,
   generados según el esquema real de las fichas comerciales:
   baño junto a la entrada (lado pasillo), cocina abierta con
   barra en la zona de acceso, salón-comedor central y dormitorios
   con armario hacia la fachada.
   ═══════════════════════════════════════════════════════════════ */
const APT = {
  wallPerim: 0.13, wallPart: 0.09,
  hPerim: 1.6, hFacade: 0.85, hPart: 1.35,
  colWall: 0xf2efe8, colFloor: 0xd9c9a8, colWood: 0xbfa887, colSoft: 0x93a3b8,
};

function boxAt(list, cx, cz, w, d, h, y0 = 0) {
  if (w < 0.04 || d < 0.04 || h < 0.02) return;
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, y0 + h / 2, cz);
  list.push(g);
}

/**
 * Genera la vivienda en coordenadas locales:
 * x ∈ [-w/2, w/2], z ∈ [-d/2 (pasillo/acceso), +d/2 (fachada)].
 */
function buildApartment(u, w, d) {
  const walls = [], furn = [];
  const hw = w / 2, hd = d / 2;
  const t = APT.wallPerim, p = APT.wallPart;

  // ── Perímetro (fachada más baja para ver el interior) ──
  boxAt(walls, 0, -hd + t / 2, w, t, APT.hPerim);              // trasera (acceso)
  boxAt(walls, 0, hd - t / 2, w, t, APT.hFacade);              // fachada
  boxAt(walls, -hw + t / 2, 0, t, d - 2 * t, APT.hPerim);      // lateral izq
  boxAt(walls, hw - t / 2, 0, t, d - 2 * t, APT.hPerim);       // lateral dcha

  // ── Banda de acceso: baño + cocina ──
  const bb = Math.min(2.0, d * 0.30);            // fondo banda acceso
  const bw = Math.min(2.15, w * 0.38);           // ancho baño
  const zBack = -hd + bb;
  // muro del baño (con hueco de puerta hacia el interior)
  boxAt(walls, -hw + bw, -hd + bb / 2, p, bb, APT.hPart);           // vertical
  boxAt(walls, -hw + (bw - 0.8) / 2, zBack, bw - 0.8, p, APT.hPart); // horizontal con hueco a la dcha
  // aparatos del baño
  boxAt(furn, -hw + 0.42, -hd + 0.5, 0.55, 0.42, 0.42);        // inodoro
  boxAt(furn, -hw + bw - 0.55, -hd + 0.55, 0.85, 0.85, 0.12);  // plato de ducha
  boxAt(furn, -hw + 0.45, -hd + bb - 0.35, 0.62, 0.45, 0.8);   // lavabo
  // cocina: barra en la pared trasera
  const kx0 = -hw + bw + 0.5, kx1 = Math.min(kx0 + 2.9, hw - 0.4);
  if (kx1 - kx0 > 1.0) boxAt(furn, (kx0 + kx1) / 2, -hd + t + 0.32, kx1 - kx0, 0.6, 0.92);

  // ── Dormitorios en fachada ──
  const fb = Math.max(2.2, Math.min(3.1, (d - bb) * 0.55));    // fondo dormitorios
  const zPart = hd - fb;                                       // línea de tabique
  const maxFacade = Math.max(1, Math.floor((w - 2.5) / 2.75));
  const nFacade = Math.min(u.dorm, maxFacade);
  const bedW = Math.min(3.3, Math.max(2.55, (w - 2.5) / nFacade));
  for (let i = 0; i < nFacade; i++) {
    const x0 = -hw + i * bedW, x1 = x0 + bedW;
    // tabique horizontal (hueco de puerta de 0.75 junto al borde dcho)
    boxAt(walls, (x0 + x1 - 0.85) / 2, zPart, x1 - x0 - 0.85, p, APT.hPart);
    // tabique vertical entre dormitorios / con el salón
    boxAt(walls, x1, zPart + fb / 2, p, fb, APT.hPart);
    // cama contra la fachada + armario contra el tabique
    const bedD = Math.min(1.9, fb - 0.7);
    boxAt(furn, x0 + bedW / 2, hd - t - bedD / 2 - 0.12, Math.min(1.4, bedW - 1.0), bedD, 0.45);
    boxAt(furn, x0 + bedW / 2 - 0.2, zPart + 0.34, Math.min(1.5, bedW - 1.2), 0.55, 1.15);
  }

  // ── Salón-comedor ──
  const lx0 = -hw + nFacade * bedW, lx1 = hw;                  // zona de salón en fachada
  const lw = lx1 - lx0;
  if (lw > 1.6) {
    boxAt(furn, lx0 + lw / 2, hd - 1.15, Math.min(1.95, lw - 0.7), 0.8, 0.42);   // sofá
    boxAt(furn, lx0 + lw / 2, hd - 2.05, Math.min(0.95, lw - 1.2), 0.5, 0.2);    // mesa baja
  }
  // mesa de comedor en zona central
  if (d - bb - fb > 1.6) boxAt(furn, 0.4, (zBack + zPart) / 2, 1.25, 0.8, 0.55);

  // dormitorio extra (3D o anchura escasa): junto al baño
  const rest = u.dorm - nFacade;
  if (rest > 0) {
    const rw = Math.min(2.9, w - bw - 1.2);
    boxAt(walls, hw - rw, -hd + bb / 2 + 0.4, p, bb + 0.8, APT.hPart);
    boxAt(walls, hw - rw / 2 - 0.45, zBack + 0.8, rw - 0.9, p, APT.hPart);
    boxAt(furn, hw - rw / 2, -hd + 1.15, Math.min(1.35, rw - 0.9), 1.85, 0.45);
  }
  return { walls, furn };
}

/**
 * Construye toda la escena. Devuelve:
 * { floorGroups, roofGroup, unitMeshes, pickables, layout }
 */
export function buildBuilding(scene, unitsById) {
  const layout = computeLayout(unitsById);
  const { slab } = BUILDING;

  // Materiales por planta (clonados para poder fundir cada planta por separado)
  const mkFloorMats = () => {
    const slabM = new THREE.MeshStandardMaterial({
      color: 0xcfd3d8, roughness: 0.85, metalness: 0.05, transparent: true, opacity: 1,
    });
    const terrM = new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.95, transparent: true, opacity: 1 });
    const glassM = new THREE.MeshStandardMaterial({
      color: 0x9fc4d8, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.22,
    });
    const edgeM = new THREE.LineBasicMaterial({ color: 0x0a0f1c, transparent: true, opacity: 0.28 });
    for (const m of [slabM, terrM, glassM, edgeM]) m.userData.baseOpacity = m.opacity;
    return { slabM, terrM, glassM, edgeM, all: [slabM, terrM, glassM, edgeM] };
  };

  const floorGroups = new Map();
  const unitMeshes = new Map();
  const pickables = [];

  const slabGeo = slabGeometry(layout.courts, slab);

  for (const F of FLOOR_DEFS) {
    const g = new THREE.Group();
    g.name = `floor-${F.key}`;
    g.userData.def = F;
    g.userData.baseY = F.y;
    g.userData.fade = 1;
    g.position.y = F.y;
    const M = mkFloorMats();
    g.userData.fadeMats = M.all;

    // Forjado
    const slabMesh = new THREE.Mesh(slabGeo, M.slabM);
    slabMesh.position.y = slab;
    slabMesh.castShadow = slabMesh.receiveShadow = true;
    g.add(slabMesh);

    // Viviendas
    const labels = new THREE.Group();
    labels.name = 'labels';
    labels.visible = false;
    g.add(labels);

    const rowsSpec = [['ne', F.rows.ne], ['sw', F.rows.sw], ['in', F.rows.inN], ['in', F.rows.inS]];
    for (const [rowType, ids] of rowsSpec) for (const id of ids) {
      const u = unitsById.get(id);
      const r = layout.rects.get(id);
      if (!u || !r) continue;
      const gap = 0.34;
      const h = F.h - slab - 0.22;
      const geo = new THREE.BoxGeometry(r.w - gap, h, r.d - gap);
      const mat = new THREE.MeshStandardMaterial({
        color: BASE_UNIT.clone(), roughness: 0.65, metalness: 0.05,
        emissive: 0x000000, transparent: true, opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(r.x, slab + h / 2, r.z);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { unitId: id, floorKey: F.key };
      g.add(mesh);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edgeM);
      edges.position.copy(mesh.position);
      edges.raycast = () => {};
      g.add(edges);

      // Terraza de ático
      if (r.terrace) {
        const t = r.terrace;
        const tSlab = new THREE.Mesh(new THREE.BoxGeometry(t.w - gap, 0.14, t.d - 0.2), M.terrM);
        tSlab.position.set(t.x, slab + 0.1, t.z);
        tSlab.receiveShadow = true;
        tSlab.raycast = () => {};
        g.add(tSlab);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(t.w - gap, 1.05, t.d - 0.2), M.glassM);
        rail.position.set(t.x, slab + 0.7, t.z);
        rail.raycast = () => {};
        g.add(rail);
      }

      // Etiqueta con el número de vivienda
      const sp = makeLabelSprite(id);
      sp.position.set(r.x, slab + h + 1.3, r.z);
      labels.add(sp);

      // ── Vivienda dollhouse (visible al aislar la planta) ──
      let rot = 0;
      let aw = r.w - gap, ad = r.d - gap;
      if (rowType === 'ne') rot = Math.PI;
      else if (rowType === 'in') {
        // la fachada mira al patio más próximo
        const P = PATIOS.reduce((a, b) => (Math.abs(b.x - r.x) < Math.abs(a.x - r.x) ? b : a));
        rot = P.x > r.x ? Math.PI / 2 : -Math.PI / 2;
        aw = r.d - gap; ad = r.w - gap;
      }
      const { walls, furn } = buildApartment(u, aw, ad);
      const aptG = new THREE.Group();
      const floorM = new THREE.MeshStandardMaterial({ color: APT.colFloor, roughness: 0.9, transparent: true });
      const wallM = new THREE.MeshStandardMaterial({ color: APT.colWall, roughness: 0.85, transparent: true });
      const furnM = new THREE.MeshStandardMaterial({ color: APT.colWood, roughness: 0.8, transparent: true });
      const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(aw, 0.1, ad), floorM);
      floorMesh.position.y = 0.05;
      floorMesh.receiveShadow = true;
      const wallMesh = new THREE.Mesh(mergeGeometries(walls), wallM);
      wallMesh.position.y = 0.1;
      const furnMesh = new THREE.Mesh(mergeGeometries(furn), furnM);
      furnMesh.position.y = 0.1;
      for (const m of [floorMesh, wallMesh, furnMesh]) m.raycast = () => {};
      aptG.add(floorMesh, wallMesh, furnMesh);
      aptG.position.set(r.x, slab, r.z);
      aptG.rotation.y = rot;
      aptG.visible = false;
      g.add(aptG);
      mesh.userData.apt = { group: aptG, floorM, wallM, furnM };

      unitMeshes.set(id, mesh);
      pickables.push(mesh);
    }

    scene.add(g);
    floorGroups.set(F.key, g);
  }

  // ─── Cubierta ───
  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof';
  roofGroup.userData.baseY = ROOF_Y;
  roofGroup.userData.fade = 1;
  roofGroup.position.y = ROOF_Y;
  const RM = mkFloorMats();
  const matCore = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, roughness: 0.9, transparent: true, opacity: 1 });
  matCore.userData.baseOpacity = 1;
  RM.all.push(matCore);
  roofGroup.userData.fadeMats = RM.all;
  const roofMesh = new THREE.Mesh(slabGeo, RM.slabM);
  roofMesh.position.y = slab;
  roofMesh.castShadow = roofMesh.receiveShadow = true;
  roofGroup.add(roofMesh);
  // casetones de escalera
  [-38, -12, 14, 40].forEach((x) => {
    const core = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 4.4), matCore);
    core.position.set(x, slab + 1.1, -1.5);
    core.castShadow = true;
    roofGroup.add(core);
  });
  scene.add(roofGroup);

  // ─── Patios ajardinados (planta baja) ───
  const gardens = new THREE.Group();
  for (const ct of layout.courts) {
    const lawn = new THREE.Mesh(
      new THREE.BoxGeometry(ct.w - 1.2, 0.16, ct.d - 1.2),
      new THREE.MeshStandardMaterial({ color: 0x4d9a66, roughness: 1 })
    );
    lawn.position.set(ct.x, BUILDING.slab + 0.08, ct.z);
    lawn.receiveShadow = true;
    gardens.add(lawn);
    gardens.add(tree(ct.x - ct.w / 4, ct.z - ct.d / 5, 0.9));
    gardens.add(tree(ct.x + ct.w / 4, ct.z - ct.d / 6, 1.15));
    gardens.add(tree(ct.x - ct.w / 6, ct.z + ct.d / 4, 1.0));
    gardens.add(tree(ct.x + ct.w / 5, ct.z + ct.d / 5, 0.85));
  }
  gardens.position.y = 0;
  scene.add(gardens);
  const pbGroup = floorGroups.get('baja');
  pbGroup.userData.gardens = gardens;

  buildContext(scene);

  return { floorGroups, roofGroup, unitMeshes, pickables, layout };
}

// ─── Entorno: ciudad de maqueta a la luz del atardecer ───
function buildContext(scene) {
  // Generador determinista
  let seed = 20260809;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(950, 80),
    new THREE.MeshStandardMaterial({ color: 0xa39b89, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  scene.add(ground);

  // Parcela y calles con nombre
  const parcel = new THREE.Mesh(
    new THREE.BoxGeometry(BUILDING.length + 26, 0.3, BUILDING.depth + 26),
    new THREE.MeshStandardMaterial({ color: 0x8b8574, roughness: 1 })
  );
  parcel.position.y = -0.15;
  parcel.receiveShadow = true;
  scene.add(parcel);

  const streetMat = new THREE.MeshStandardMaterial({ color: 0x5b5b60, roughness: 1 });
  const mkStreet = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), streetMat);
    m.position.set(x, -0.18, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  mkStreet(1200, 12, 0, BUILDING.depth / 2 + 22);    // SO — C/ Numancia
  mkStreet(1200, 12, 0, -BUILDING.depth / 2 - 22);   // NE — C/ Sagunto
  mkStreet(12, 1200, -BUILDING.length / 2 - 22, 0);  // O  — C/ Íñigo López de Mendoza
  mkStreet(12, 1200, BUILDING.length / 2 + 22, 0);   // E

  const t1 = groundText('Calle Numancia', 52);
  t1.position.set(0, 0.06, BUILDING.depth / 2 + 22);
  scene.add(t1);
  const t2 = groundText('Calle Sagunto', 52);
  t2.position.set(0, 0.06, -BUILDING.depth / 2 - 22);
  t2.rotation.z = Math.PI;
  scene.add(t2);
  const t3 = groundText('C/ Íñigo López de Mendoza', 62);
  t3.position.set(-BUILDING.length / 2 - 22, 0.06, 0);
  t3.rotation.z = Math.PI / 2;
  scene.add(t3);

  // ── Manzanas de la ciudad (instanciadas: 1 draw call) ──
  const palette = [0xe6dfd0, 0xd9cdb4, 0xcbb59a, 0xc2a184, 0xbdb6a6, 0xd4c8b0];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const cityMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const items = [];
  const GRID = 58;
  for (let gx = -750; gx <= 750; gx += GRID) {
    for (let gz = -750; gz <= 750; gz += GRID) {
      // hueco para nuestra parcela y sus calles
      if (Math.abs(gx) < 110 && Math.abs(gz) < 60) continue;
      const r2 = gx * gx + gz * gz;
      if (r2 > 800 * 800) continue;
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const bw = 13 + rnd() * 16, bd = 12 + rnd() * 14;
        const tall = rnd() < 0.07;
        const bh = tall ? 16 + rnd() * 14 : 3.5 + rnd() * 8.5;
        const x = gx + (rnd() - 0.5) * (GRID - bw - 10);
        const z = gz + (rnd() - 0.5) * (GRID - bd - 10);
        items.push({ x, z, bw, bd, bh, c: palette[Math.floor(rnd() * palette.length)] });
      }
    }
  }
  const city = new THREE.InstancedMesh(boxGeo, cityMat, items.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  items.forEach((it, i) => {
    m4.makeScale(it.bw, it.bh, it.bd);
    m4.setPosition(it.x, -0.3, it.z);
    city.setMatrixAt(i, m4);
    city.setColorAt(i, col.setHex(it.c));
  });
  city.castShadow = city.receiveShadow = true;
  scene.add(city);

  // ── Arbolado urbano ──
  const treeGeo = new THREE.IcosahedronGeometry(1, 1);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x5b8a54, roughness: 1, flatShading: true });
  const nTrees = 420;
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, nTrees);
  for (let i = 0; i < nTrees; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 90 + rnd() * 640;
    const s = 1.6 + rnd() * 1.8;
    m4.makeScale(s, s * 1.2, s);
    m4.setPosition(Math.cos(a) * r, s, Math.sin(a) * r);
    trees.setMatrixAt(i, m4);
    trees.setColorAt(i, col.setHSL(0.29 + rnd() * 0.06, 0.35, 0.32 + rnd() * 0.12));
  }
  scene.add(trees);

  // ── Relieve lejano (medianías de Gran Canaria) ──
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x8d7d67, roughness: 1 });
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (0.62 + rnd() * 0.75); // arco oeste-sur (interior de la isla)
    const r = 1050 + rnd() * 320;
    const h = 45 + rnd() * 75;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(280 + rnd() * 260, h, 6), hillMat);
    hill.position.set(Math.cos(a) * r, h / 2 - 22, Math.abs(Math.sin(a)) * r * 0.8);
    hill.rotation.y = rnd() * Math.PI;
    scene.add(hill);
  }
  // ── Mar al noreste ──
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 900),
    new THREE.MeshStandardMaterial({ color: 0x4d7488, roughness: 0.35, metalness: 0.1 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(250, -2.5, -1250);
  scene.add(sea);
}

/**
 * Aplica el estado comercial a los materiales de las viviendas.
 * estadoDe: (id) => 'disponible'|'reservada'|'vendida'
 * dimmedDe: (id) => boolean (no pasa los filtros)
 */
/**
 * Carga el modelo BIM real (Revit → glTF, fusionado por plantas).
 * Devuelve { group, levels: Map<key, {mesh, mat}> } donde key ∈
 * sotano|baja|p1|p2|atico|cubierta.
 */
export function loadBIM(scene, url = 'assets/apolo_levels.glb') {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        const group = new THREE.Group();
        group.name = 'bim';
        group.visible = false;
        const levels = new Map();
        const meshes = [];
        gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
        for (const o of meshes) {
          const key = o.name;
          const mat = new THREE.MeshStandardMaterial({
            color: key === 'sotano' ? 0xb8bcc4 : 0xe9e7e1,
            roughness: 0.88, metalness: 0.02,
            transparent: true, opacity: 1,
            side: THREE.DoubleSide,
          });
          mat.userData.baseOpacity = 1;
          o.material = mat;
          o.castShadow = o.receiveShadow = true;
          o.raycast = () => {}; // sin picking sobre el BIM
          // Envoltorio animable que preserva la transformación del nodo
          // (la cuantización del GLB guarda ahí su escala/offset)
          const holder = new THREE.Group();
          holder.name = `bim-${key}`;
          holder.add(o);
          if (key === 'sotano') holder.visible = false; // bajo rasante
          levels.set(key, { mesh: holder, mat });
          group.add(holder);
        }
        scene.add(group);
        resolve({ group, levels });
      },
      undefined,
      reject
    );
  });
}

const PARQUET = new THREE.Color(0xd9c9a8);

export function paintUnits(unitMeshes, estadoDe, dimmedDe, selectedId, hoverId, fadeOf = () => 1, dollOf = () => false) {
  const tmp = new THREE.Color();
  for (const [id, mesh] of unitMeshes) {
    const estado = estadoDe(id);
    const col = ESTADO_COLORS[estado] || ESTADO_COLORS.disponible;
    const mat = mesh.material;
    const dimmed = dimmedDe(id);
    const fade = fadeOf(mesh.userData.floorKey);
    const doll = dollOf(mesh.userData.floorKey);
    const apt = mesh.userData.apt;

    if (apt) apt.group.visible = doll && fade > 0.02;

    if (doll && apt) {
      // La caja pasa a ser una envolvente de cristal; el estado se
      // muestra en el suelo de la vivienda y en el brillo al interactuar.
      mat.color.copy(col);
      mat.emissive.copy(col).multiplyScalar(id === selectedId ? 0.5 : id === hoverId ? 0.3 : 0);
      mat.opacity = (dimmed ? 0.02 : id === selectedId ? 0.26 : id === hoverId ? 0.16 : 0.05) * fade;
      const o = dimmed ? 0.12 : 1;
      apt.floorM.opacity = o * fade;
      apt.wallM.opacity = o * fade;
      apt.furnM.opacity = o * fade;
      tmp.copy(PARQUET).lerp(col, dimmed ? 0.08 : 0.58);
      apt.floorM.color.copy(tmp);
      continue;
    }

    if (dimmed) {
      mat.color.copy(DIM_COLOR);
      mat.opacity = 0.16 * fade;
      mat.emissive.setHex(0x000000);
    } else if (id === selectedId) {
      mat.color.copy(col);
      mat.opacity = fade;
      mat.emissive.copy(col).multiplyScalar(0.45);
    } else if (id === hoverId) {
      mat.color.copy(col);
      mat.opacity = fade;
      mat.emissive.copy(col).multiplyScalar(0.25);
    } else {
      tmp.copy(BASE_UNIT).lerp(col, 0.62);
      mat.color.copy(tmp);
      mat.opacity = fade;
      mat.emissive.setHex(0x000000);
    }
  }
}
