/* ═══════════════════════════════════════════════════════════════
   building.js — Estado comercial de las viviendas.

   Lo que había aquí (el volumen procedural del Apolo y la carga del BIM de
   Revit) lo sustituye modelo.js, que trae el modelo del cliente. De este
   módulo solo queda el pintado: qué color lleva cada vivienda según su
   estado y cuándo se ve su cartela.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* Vendida: la vivienda se apaga de verdad. El prisma no pinta un velo gris
   encima (eso se ve como una caja negra semitransparente en cuanto la cámara
   baja) sino que MULTIPLICA lo que hay detrás por LUZ_VENDIDA: a esa vivienda
   solo le entra ese tanto por uno de la luz que le entra a una disponible.
   Se dibuja solo la cara de entrada, que en un prisma convexo visto desde
   fuera es una y solo una por píxel; con las dos caras multiplicaría dos
   veces y quedaría negra. El color va en espacio lineal a propósito: es un
   factor de luz, no un color de pintura. */
/* Factor LINEAL, antes del mapeo de tonos: no es el tanto por uno que se ve
   en pantalla. Con 0,3 la vivienda apenas se oscurecía, porque la curva de
   tono comprime las luces altas y se comía el efecto (medido: la pantalla
   solo bajaba a un 75 %). Con 0,1 la pantalla baja a un 56 %, que es lo que
   se lee como "solo entra un tercio de la luz": se ven los muebles, pero la
   vivienda está claramente apagada, y nunca sale negra. */
export const LUZ_VENDIDA = 0.1;

function crearMaterialApagado() {
  const m = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, depthWrite: false, depthTest: true, premultipliedAlpha: true,
    side: THREE.FrontSide, blending: THREE.MultiplyBlending, toneMapped: false, fog: false,
  });
  m.color.setRGB(LUZ_VENDIDA, LUZ_VENDIDA, LUZ_VENDIDA, THREE.LinearSRGBColorSpace);
  m.name = 'vivienda_apagada';
  return m;
}

export const ESTADO_COLORS = {
  disponible: new THREE.Color(0x35d69a),
  reservada:  new THREE.Color(0xf2c04a),
  vendida:    new THREE.Color(0x8d949e), // gris: inactiva, no ensucia
};

/**
 * Aplica el estado comercial a los prismas de vivienda.
 * estadoDe: (id) => 'disponible'|'reservada'|'vendida'
 * dimmedDe: (id) => boolean (no pasa los filtros)
 */
export function paintUnits(unitMeshes, estadoDe, dimmedDe, selectedId, hoverId, fadeOf = () => 1, dollOf = () => false, enPlantaVista = () => true) {
  for (const [id, mesh] of unitMeshes) {
    const estado = estadoDe(id);
    const col = ESTADO_COLORS[estado] || ESTADO_COLORS.disponible;
    if (!mesh.userData.matRealce) mesh.userData.matRealce = mesh.material;
    const mat = mesh.userData.matRealce;
    const vendida = estado === 'vendida';
    const dimmed = dimmedDe(id);
    const fade = fadeOf(mesh.userData.floorKey);
    /* Vendida y con su planta aislada: se apaga. Solo la planta que se está
       mirando: en cenital, con las cuatro puestas, los prismas de arriba se
       apilan sobre el de abajo y cada uno vuelve a multiplicar, de modo que
       la vivienda sale negra. Uno por rayo y ya. */
    if (vendida && enPlantaVista(mesh.userData.floorKey)) {
      if (!mesh.userData.matApagada) mesh.userData.matApagada = crearMaterialApagado();
      mesh.material = mesh.userData.matApagada;
      mesh.visible = true;
      mesh.renderOrder = 20;
      if (mesh.userData.label) mesh.userData.label.visible = false;
      if (mesh.userData.labelR) mesh.userData.labelR.visible = false;
      continue;
    }
    mesh.material = mat;
    mesh.renderOrder = 50;
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
    /* En reposo el prisma se apaga de verdad (visible = false), no solo con
       opacidad 0: la pasada de oclusión ambiental sustituye el material de
       toda la escena para leer profundidad, así que 166 prismas "invisibles"
       taparían el edificio entero en el búfer de profundidad. El Raycaster de
       three no mira la visibilidad, de modo que el ratón los sigue
       encontrando igual. */
    mesh.visible = mat.opacity > 0;

    // Cartelas: verde en disponibles, amarilla en reservadas
    const markable = !dimmed && fade > 0.5;
    if (mesh.userData.label) mesh.userData.label.visible = markable && estado === 'disponible';
    if (mesh.userData.labelR) mesh.userData.labelR.visible = markable && estado === 'reservada';
  }
}

