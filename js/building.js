/* ═══════════════════════════════════════════════════════════════
   building.js — Construcción procedural del Edificio Apolo
   (volumen esquemático fiel a plantas, patios y ático del proyecto)
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BUILDING, FLOOR_DEFS, ROOF_Y, computeLayout } from './layout.js';

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

    const ids = [...F.rows.ne, ...F.rows.sw, ...F.rows.inN, ...F.rows.inS];
    for (const id of ids) {
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

// ─── Entorno: parcela, calles, edificación colindante ───
function buildContext(scene) {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(420, 72),
    new THREE.MeshStandardMaterial({ color: 0x1a2438, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  ground.receiveShadow = true;
  scene.add(ground);

  // Parcela
  const parcel = new THREE.Mesh(
    new THREE.BoxGeometry(BUILDING.length + 26, 0.3, BUILDING.depth + 26),
    new THREE.MeshStandardMaterial({ color: 0x243049, roughness: 1 })
  );
  parcel.position.y = -0.15;
  parcel.receiveShadow = true;
  scene.add(parcel);

  // Calles
  const streetMat = new THREE.MeshStandardMaterial({ color: 0x2e3c5c, roughness: 1 });
  const mkStreet = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), streetMat);
    m.position.set(x, -0.16, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  mkStreet(240, 12, 0, BUILDING.depth / 2 + 22);    // SO — C/ Numancia
  mkStreet(240, 12, 0, -BUILDING.depth / 2 - 22);   // NE — C/ Sagunto
  mkStreet(12, 120, -BUILDING.length / 2 - 22, 0);  // O  — C/ Íñigo López de Mendoza

  const t1 = groundText('Calle Numancia', 52);
  t1.position.set(0, 0.02, BUILDING.depth / 2 + 22);
  scene.add(t1);
  const t2 = groundText('Calle Sagunto', 52);
  t2.position.set(0, 0.02, -BUILDING.depth / 2 - 22);
  t2.rotation.z = Math.PI;
  scene.add(t2);
  const t3 = groundText('C/ Íñigo López de Mendoza', 62);
  t3.position.set(-BUILDING.length / 2 - 22, 0.02, 0);
  t3.rotation.z = Math.PI / 2;
  scene.add(t3);

  // Edificación vecina (volúmenes fantasma)
  const ghostMat = new THREE.MeshStandardMaterial({
    color: 0x2a3555, roughness: 1, transparent: true, opacity: 0.9,
  });
  const ghosts = [
    [70, 9, 26, -60, 42], [50, 6, 22, 30, 46], [40, 12, 24, 108, 40],
    [56, 7, 24, -60, -46], [44, 10, 22, 20, -50], [38, 5, 20, 96, -44],
    [26, 8, 30, -92, 6], [30, 6, 26, 98, 2],
  ];
  for (const [w, h, d, x, z] of ghosts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ghostMat);
    m.position.set(x, h / 2 - 0.3, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
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

export function paintUnits(unitMeshes, estadoDe, dimmedDe, selectedId, hoverId, fadeOf = () => 1) {
  const tmp = new THREE.Color();
  for (const [id, mesh] of unitMeshes) {
    const estado = estadoDe(id);
    const col = ESTADO_COLORS[estado] || ESTADO_COLORS.disponible;
    const mat = mesh.material;
    const dimmed = dimmedDe(id);
    const fade = fadeOf(mesh.userData.floorKey);
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
      tmp.copy(BASE_UNIT).lerp(col, 0.52);
      mat.color.copy(tmp);
      mat.opacity = fade;
      mat.emissive.setHex(0x000000);
    }
  }
}
