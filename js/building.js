/* ═══════════════════════════════════════════════════════════════
   building.js — Construcción procedural del Edificio Apolo
   (volumen esquemático fiel a plantas, patios y ático del proyecto)
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

/* Cartela de vivienda: caja cuadrada (sin radios) con rabito hacia la
   vivienda y el número en blanco. Verde intenso si está libre; amarillo
   anaranjado intenso si está reservada. */
function makeLabelSprite(text, bg = '#00a36c') {
  const cv = document.createElement('canvas');
  cv.width = 224; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.shadowColor = 'rgba(17,17,18,0.3)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = bg;
  const x0 = 42, y0 = 14, x1 = 182, y1 = 92;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(125, y1);           // rabito centrado
  ctx.lineTo(112, y1 + 19);
  ctx.lineTo(99, y1);
  ctx.lineTo(x0, y1);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 42px "Open Sans", "Segoe UI", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 112, 54);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(3.2, 1.83, 1);
  return sp;
}

/* Destello suave (pequeño sol) sobre cada vivienda: verde si está libre,
   amarillo si está reservada. La textura es neutra y el color lo pone
   el material. */
const FLARE_TEX = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // destellos en cruz, muy sutiles
  const ray = ctx.createLinearGradient(0, 64, 128, 64);
  ray.addColorStop(0, 'rgba(255,255,255,0)');
  ray.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  ray.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ray;
  ctx.fillRect(0, 62, 128, 4);
  const ray2 = ctx.createLinearGradient(64, 0, 64, 128);
  ray2.addColorStop(0, 'rgba(255,255,255,0)');
  ray2.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  ray2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ray2;
  ctx.fillRect(62, 0, 4, 128);
  return cv;
})();
function makeFlareSprite() {
  const tex = new THREE.CanvasTexture(FLARE_TEX);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.85 });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.6, 1.6, 1);
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
  const flares = [];
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

      // Cartelas (verde libre / amarilla reservada) + destello
      const sp = makeLabelSprite(id, '#00a36c');
      sp.position.set(r.x, yBase + h + 2.1, r.z);
      mesh.userData.label = sp;
      labels.add(sp);
      const spR = makeLabelSprite(id, '#f39200');
      spR.position.copy(sp.position);
      mesh.userData.labelR = spR;
      labels.add(spR);
      const flare = makeFlareSprite();
      flare.position.set(r.x, yBase + h + 0.45, r.z);
      flare.userData.phase = (r.x * 7.13 + r.z * 3.71) % (Math.PI * 2);
      mesh.userData.flare = flare;
      flares.push(flare);
      labels.add(flare);

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

  return { floorGroups, roofGroup, unitMeshes, pickables, layout, flares };
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
        const mkWall = () => {
          const m = new THREE.MeshStandardMaterial({
            color: 0xf1efe8, roughness: 0.8, metalness: 0.0, transparent: true,
          });
          m.userData.baseOpacity = 1;
          // Corte estilo pocito: cuando uCut→1 (planta aislada), SOLO las
          // caras horizontales superiores del muro (la superficie donde se
          // practica el corte) se oscurecen a antracita.
          m.userData.uCut = { value: 0 };
          m.onBeforeCompile = (sh) => {
            sh.uniforms.uCut = m.userData.uCut;
            sh.vertexShader = sh.vertexShader
              .replace('#include <common>', '#include <common>\nvarying vec3 vWNormal;')
              .replace('#include <defaultnormal_vertex>',
                '#include <defaultnormal_vertex>\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);');
            sh.fragmentShader = sh.fragmentShader
              .replace('#include <common>', '#include <common>\nvarying vec3 vWNormal;\nuniform float uCut;')
              .replace('#include <color_fragment>',
                '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.048, 0.056), uCut * smoothstep(0.55, 0.85, vWNormal.y));');
          };
          return m;
        };
        const mkMats = () => ({
          struct: Object.assign(new THREE.MeshStandardMaterial({
            color: 0xd8d7d2, roughness: 0.92, metalness: 0.02, transparent: true,
          }), { userData: { baseOpacity: 1 } }),
          wall: mkWall(),
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


export function paintUnits(unitMeshes, estadoDe, dimmedDe, selectedId, hoverId, fadeOf = () => 1, dollOf = () => false) {
  for (const [id, mesh] of unitMeshes) {
    const estado = estadoDe(id);
    const col = ESTADO_COLORS[estado] || ESTADO_COLORS.disponible;
    const mat = mesh.material;
    const vendida = estado === 'vendida';
    const dimmed = dimmedDe(id);
    const fade = fadeOf(mesh.userData.floorKey);
    // Envolvente: invisible en reposo (nada de prismas de color);
    // solo aparece como realce al pasar el ratón o al seleccionar
    mat.color.copy(col);
    if (id === selectedId && !vendida && !dimmed) {
      mat.opacity = 0.45 * fade;
      mat.emissive.copy(col).multiplyScalar(0.35);
    } else if (id === hoverId && !vendida && !dimmed) {
      mat.opacity = 0.32 * fade;
      mat.emissive.copy(col).multiplyScalar(0.2);
    } else {
      mat.opacity = 0;
      mat.emissive.setHex(0x000000);
    }

    // Cartelas: verde en disponibles, amarilla en reservadas; destello a juego
    const markable = !dimmed && fade > 0.5;
    if (mesh.userData.label) mesh.userData.label.visible = markable && estado === 'disponible';
    if (mesh.userData.labelR) mesh.userData.labelR.visible = markable && estado === 'reservada';
    if (mesh.userData.flare) {
      const f = mesh.userData.flare;
      f.visible = markable && (estado === 'disponible' || estado === 'reservada');
      if (f.visible) f.material.color.setHex(estado === 'reservada' ? 0xf39200 : 0x00a36c);
    }
  }
}

