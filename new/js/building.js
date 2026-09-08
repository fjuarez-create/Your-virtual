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
function makeLabelSprite(text, bg = '#24873f') {
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
  tex.colorSpace = THREE.SRGBColorSpace;
  // fuera del tone mapping de la escena: el color se pinta EXACTO,
  // como si la cartela fuera una capa de interfaz
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(3.2, 1.83, 1);
  // capa 1: las cartelas se dibujan en una pasada aparte, tras el
  // post-procesado (sin bloom/glowing) y por encima de toda la geometría
  sp.layers.set(1);
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
/* Grano procedural para los paramentos.

   El BIM llega sin coordenadas UV, así que no se pueden mapear texturas por el
   camino habitual. En su lugar el ruido se calcula en el fragmento a partir de
   la posición en el mundo: vale igual en cualquier cara, no consume memoria de
   textura y no depende de cómo se hayan desplegado las mallas. Es lo que rompe
   el aspecto de plástico del material liso, que es justo lo que delata a un
   render de tiempo real frente a uno de V-Ray.

   escala = repeticiones por metro; fuerza = cuánto varía la rugosidad. */
function grain(material, escala, fuerza) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrainScale = { value: escala };
    shader.uniforms.uGrainAmount = { value: fuerza };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec3 vGrainPos;',
        'uniform float uGrainScale;',
        'uniform float uGrainAmount;',
        'float hash13(vec3 p) {',
        '  p = fract(p * 0.1031);',
        '  p += dot(p, p.zyx + 31.32);',
        '  return fract((p.x + p.y) * p.z);',
        '}',
        'float ruido(vec3 p) {',
        '  vec3 i = floor(p), f = fract(p);',
        '  f = f * f * (3.0 - 2.0 * f);',
        '  float a = mix(hash13(i), hash13(i + vec3(1,0,0)), f.x);',
        '  float b = mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x);',
        '  float c = mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x);',
        '  float d = mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x);',
        '  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);',
        '}',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'diffuseColor.rgb *= 0.965 + ruido(vGrainPos * uGrainScale * 0.35) * 0.07;',
      ].join('\n'))
      .replace('#include <roughnessmap_fragment>', [
        '#include <roughnessmap_fragment>',
        'float g = ruido(vGrainPos * uGrainScale) * 0.65',
        '        + ruido(vGrainPos * uGrainScale * 3.7) * 0.35;',
        'roughnessFactor = clamp(roughnessFactor + (g - 0.5) * uGrainAmount, 0.05, 1.0);',
      ].join('\n'));
  };
  // Sin esto, three reutilizaría el mismo programa para materiales con grano distinto.
  material.customProgramCacheKey = () => 'grain-' + escala + '-' + fuerza;
  return material;
}

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

      // Cartelas (verde libre / amarilla reservada) + destello
      const sp = makeLabelSprite(id, '#24873f');
      sp.position.set(r.x, yBase + h + 2.1, r.z);
      mesh.userData.label = sp;
      labels.add(sp);
      const spR = makeLabelSprite(id, '#e0862b');
      spR.position.copy(sp.position);
      mesh.userData.labelR = spR;
      labels.add(spR);
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

  scene.userData.contexto = buildContext(scene);

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
        // materiales reales por categoría (el vidrio refleja el entorno).
        // "cap" son las tapas de corte generadas en el pipeline: la huella
        // exacta de cada muro/tabique/pilar cortado, en negro, rellenando
        // las cámaras de la tabiquería seca. Solo se muestran (opacity>0)
        // cuando su planta está aislada.
        const mkMats = () => ({
          struct: Object.assign(grain(new THREE.MeshStandardMaterial({
            color: 0xc9c5bd, roughness: 0.9, metalness: 0, transparent: true,
            envMapIntensity: 1.0,
          }), 26, 0.16), { userData: { baseOpacity: 1 } }),
          // Monocapa blanco: blanco cálido, nada de blanco puro, con el grano
          // fino del mortero proyectado desde el shader.
          wall: Object.assign(grain(new THREE.MeshStandardMaterial({
            color: 0xdcd8d0, roughness: 0.82, metalness: 0, transparent: true,
            envMapIntensity: 1.15,
          }), 62, 0.2), { userData: { baseOpacity: 1 } }),
          // Vidrio de verdad: reflejo con Fresnel del entorno HDRI y una capa
          // especular encima. El tinte verdoso es el del vidrio flotado real,
          // no un azul de maqueta.
          glass: Object.assign(new THREE.MeshPhysicalMaterial({
            color: 0x2c3b3e, roughness: 0.045, metalness: 0, transparent: true,
            opacity: 0.42, envMapIntensity: 2.6, side: THREE.DoubleSide,
            clearcoat: 1, clearcoatRoughness: 0.02,
            ior: 1.52, reflectivity: 0.62, specularIntensity: 1,
          }), { userData: { baseOpacity: 0.42 } }),
          cap: Object.assign(new THREE.MeshStandardMaterial({
            color: 0x0e1013, roughness: 0.95, metalness: 0, transparent: true, opacity: 0,
          }), { userData: { baseOpacity: 1 } }),
          slab: Object.assign(grain(new THREE.MeshStandardMaterial({
            color: 0xc9c5bd, roughness: 0.9, metalness: 0, transparent: true,
            envMapIntensity: 1.0,
          }), 26, 0.16), { userData: { baseOpacity: 1 } }),
        });
        // se guarda la intensidad de entorno de origen para poder bajarla al
        // aislar una planta (ver el techo de animateFloors)
        const recordarEnv = (mats) => {
          for (const m of Object.values(mats)) {
            m.userData.baseEnv = m.envMapIntensity ?? 1;
            m.userData.baseColor = m.color.clone();
          }
          return mats;
        };
        const levels = new Map(); // bucket → { holders: [], mats: [] }
        const meshes = [];
        gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
        for (const o of meshes) {
          const [bucket, cat] = o.name.split('__');
          if (!levels.has(bucket)) levels.set(bucket, { holders: [], mats: [], byCat: recordarEnv(mkMats(bucket)) });
          const L = levels.get(bucket);
          const mat = L.byCat[cat] || L.byCat.struct;
          o.material = mat;
          o.castShadow = cat !== 'glass' && cat !== 'cap';
          o.receiveShadow = true;
          o.raycast = () => {}; // sin picking sobre el BIM
          // las tapas no siguen el fundido general: su opacidad la
          // gobierna el aislamiento de planta (animateFloors)
          if (cat !== 'cap' && !L.mats.includes(mat)) L.mats.push(mat);
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

    // Cartelas: verde en disponibles, amarilla en reservadas
    const markable = !dimmed && fade > 0.5;
    if (mesh.userData.label) mesh.userData.label.visible = markable && estado === 'disponible';
    if (mesh.userData.labelR) mesh.userData.labelR.visible = markable && estado === 'reservada';
  }
}

