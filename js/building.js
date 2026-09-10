/* ═══════════════════════════════════════════════════════════════
   building.js — Estado comercial de las viviendas.

   Lo que había aquí (el volumen procedural del Apolo y la carga del BIM de
   Revit) lo sustituye modelo.js, que trae el modelo del cliente. De este
   módulo solo queda el pintado: qué color lleva cada vivienda según su
   estado y cuándo se ve su cartela.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

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

