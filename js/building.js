/* ═══════════════════════════════════════════════════════════════
   building.js — Construcción procedural del Edificio Apolo
   (volumen esquemático fiel a plantas, patios y ático del proyecto)
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDING, FLOOR_DEFS, ROOF_Y, PATIOS, SECTIONS, floorYAt, streetYAt, computeLayout } from 'app/layout.js';
import { buildContext } from 'app/context.js';

export const ESTADO_COLORS = {
  disponible: new THREE.Color(0x35d69a),
  reservada:  new THREE.Color(0xf2c04a),
  vendida:    new THREE.Color(0x8d949e), // gris: inactiva, no ensucia
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

/* Etiqueta de vivienda: píldora blanca plana con el número en negro,
   coherente con la UI (solo se muestra en viviendas disponibles). */
function makeLabelSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = 192; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.shadowColor = 'rgba(17,17,18,0.22)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.beginPath();
  ctx.roundRect(20, 16, 152, 60, 30);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#111112';
  ctx.font = '600 32px "Open Sans", "Segoe UI", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 96, 47);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(3.4, 1.7, 1);
  return sp;
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
    for (const m of [slabM, terrM, glassM]) m.userData.baseOpacity = m.opacity;
    return { slabM, terrM, glassM, all: [slabM, terrM, glassM] };
  };

  const floorGroups = new Map();
  const unitMeshes = new Map();
  const pickables = [];

  for (const F of FLOOR_DEFS) {
    const g = new THREE.Group();
    g.name = `floor-${F.key}`;
    g.userData.def = F;
    g.userData.baseY = F.y;
    g.userData.fade = 1;
    g.position.y = F.y;
    const M = mkFloorMats();
    g.userData.fadeMats = M.all;

    // Viviendas (envolventes translúcidas sobre el modelo BIM)
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
      const h = 2.7;
      // cota real del forjado de este tramo, relativa al grupo de planta
      const yBase = floorYAt(r.x, F.level) - F.y + 0.16;
      const geo = new THREE.BoxGeometry(r.w - gap, h, r.d - gap);
      const mat = new THREE.MeshStandardMaterial({
        color: BASE_UNIT.clone(), roughness: 0.55, metalness: 0.0,
        emissive: 0x000000, transparent: true, opacity: 0.3, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(r.x, yBase + h / 2, r.z);
      mesh.userData = { unitId: id, floorKey: F.key };
      g.add(mesh);

      // Etiqueta con el número de vivienda (visible solo si está disponible)
      const sp = makeLabelSprite(id);
      sp.position.set(r.x, yBase + h + 1.6, r.z);
      mesh.userData.label = sp;
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
      const { furn } = buildApartment(u, aw, ad);
      const aptG = new THREE.Group();
      const floorM = new THREE.MeshStandardMaterial({ color: APT.colFloor, roughness: 0.9, transparent: true });
      const furnM = new THREE.MeshStandardMaterial({ color: APT.colWood, roughness: 0.8, transparent: true });
      const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(aw, 0.1, ad), floorM);
      floorMesh.position.y = 0.05;
      floorMesh.receiveShadow = true;
      const furnMesh = new THREE.Mesh(mergeGeometries(furn), furnM);
      furnMesh.position.y = 0.1;
      for (const m of [floorMesh, furnMesh]) m.raycast = () => {};
      aptG.add(floorMesh, furnMesh);
      aptG.position.set(r.x, yBase, r.z);
      aptG.rotation.y = rot;
      aptG.visible = false;
      g.add(aptG);
      mesh.userData.apt = { group: aptG, floorM, furnM };

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
  roofGroup.userData.fadeMats = [];
  scene.add(roofGroup);

  // ─── Patios ajardinados (planta baja) ───
  const gardens = new THREE.Group();
  for (const ct of layout.courts) {
    const lawn = new THREE.Mesh(
      new THREE.BoxGeometry(ct.w - 1.2, 0.16, ct.d - 1.2),
      new THREE.MeshStandardMaterial({ color: 0x4d9a66, roughness: 1 })
    );
    lawn.position.set(ct.x, 0.08, ct.z);
    lawn.receiveShadow = true;
    gardens.add(lawn);
    gardens.add(tree(ct.x - ct.w / 4, ct.z - ct.d / 5, 0.9));
    gardens.add(tree(ct.x + ct.w / 4, ct.z - ct.d / 6, 1.15));
    gardens.add(tree(ct.x - ct.w / 6, ct.z + ct.d / 4, 1.0));
    gardens.add(tree(ct.x + ct.w / 5, ct.z + ct.d / 5, 0.85));
  }
  gardens.position.y = -0.72; // patios sobre el podio del garaje (BIM)
  scene.add(gardens);
  const pbGroup = floorGroups.get('baja');
  pbGroup.userData.gardens = gardens;

  buildContext(scene);

  return { floorGroups, roofGroup, unitMeshes, pickables, layout };
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
        // materiales reales por categoría (el vidrio refleja el entorno)
        const mkMats = () => ({
          struct: Object.assign(new THREE.MeshStandardMaterial({
            color: 0xd8d7d2, roughness: 0.92, metalness: 0.02, transparent: true,
          }), { userData: { baseOpacity: 1 } }),
          wall: Object.assign(new THREE.MeshStandardMaterial({
            color: 0xf1efe8, roughness: 0.8, metalness: 0.0, transparent: true,
          }), { userData: { baseOpacity: 1 } }),
          glass: Object.assign(new THREE.MeshStandardMaterial({
            color: 0x88b4cc, roughness: 0.12, metalness: 0.4, transparent: true,
            opacity: 0.55, envMapIntensity: 1.6, side: THREE.DoubleSide,
          }), { userData: { baseOpacity: 0.55 } }),
        });
        const levels = new Map(); // bucket → { holders: [], mats: [] }
        const meshes = [];
        gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
        for (const o of meshes) {
          const [bucket, cat] = o.name.split('__');
          if (!levels.has(bucket)) levels.set(bucket, { holders: [], mats: [], byCat: mkMats() });
          const L = levels.get(bucket);
          const mat = L.byCat[cat] || L.byCat.struct;
          o.material = mat;
          o.castShadow = cat !== 'glass';
          o.receiveShadow = true;
          o.raycast = () => {}; // sin picking sobre el BIM
          if (!L.mats.includes(mat)) L.mats.push(mat);
          const holder = new THREE.Group();
          holder.name = `bim-${o.name}`;
          holder.add(o);
          if (bucket === 'sotano') holder.visible = false; // bajo rasante
          L.holders.push(holder);
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
    const vendida = estado === 'vendida';
    const dimmed = dimmedDe(id);
    const fade = fadeOf(mesh.userData.floorKey);
    const doll = dollOf(mesh.userData.floorKey);
    const apt = mesh.userData.apt;

    if (apt) {
      apt.group.visible = doll && fade > 0.02 && !dimmed && !vendida;
      if (apt.group.visible) {
        apt.floorM.opacity = fade;
        apt.furnM.opacity = fade;
        tmp.copy(PARQUET).lerp(col, 0.55);
        apt.floorM.color.copy(tmp);
      }
    }

    // Envolvente translúcida sobre el BIM: muy sutil en reposo, el color
    // solo toma cuerpo al pasar el ratón o seleccionar (vista limpia)
    mat.color.copy(col);
    if (vendida) {
      // vendida: gris, casi invisible e inerte
      mat.opacity = 0.04 * fade;
      mat.emissive.setHex(0x000000);
    } else if (dimmed) {
      mat.opacity = 0.03 * fade;
      mat.emissive.setHex(0x000000);
    } else if (id === selectedId) {
      mat.opacity = 0.5 * fade;
      mat.emissive.copy(col).multiplyScalar(0.35);
    } else if (id === hoverId) {
      mat.opacity = 0.38 * fade;
      mat.emissive.copy(col).multiplyScalar(0.22);
    } else {
      mat.opacity = (doll ? 0.16 : 0.1) * fade;
      mat.emissive.setHex(0x000000);
    }

    // Número visible solo en viviendas disponibles (y no filtradas)
    const lb = mesh.userData.label;
    if (lb) lb.visible = estado === 'disponible' && !dimmed && fade > 0.5;
  }
}

