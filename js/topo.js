/* ───────────────────────────────────────────────────────────────────────────
   Modo de revisión del levantamiento topográfico.

   Carga assets/entorno_topo.glb —el entorno reconstruido a partir del DWG del
   topógrafo— y esconde todo lo demás: el edificio, el contexto inventado y las
   cartelas. Sirve para mirar solo el terreno, las aceras, los bordillos y el
   arbolado, y decidir si la reconstrucción vale.

   Se activa con ?topo=1 y no aparece por ningún otro camino, de modo que un
   cliente que abra el showroom nunca se lo encuentra.
   ─────────────────────────────────────────────────────────────────────────── */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// El GLB trae el terreno con cota 0 en el centro de la parcela; la planta baja
// del edificio está a -0,8, así que el conjunto baja para que casen.
const BASE_Y = -0.8;

export function topoPedido() {
  return new URLSearchParams(location.search).get('topo') === '1';
}

export function cargarTopo(scene, url = 'assets/entorno_topo.glb') {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const grupo = gltf.scene;
      grupo.name = 'topo';
      grupo.position.y = BASE_Y;

      const porMaterial = [];
      grupo.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        // Las mallas vienen de polígonos planos triangulados y sin normales,
        // así que hay que calcularlas o todo saldría con sombreado plano y sin
        // relieve. El terreno además se suaviza para que la pendiente lea
        // continua en vez de facetada.
        const g = o.geometry;
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        if (Array.isArray(o.material)) o.material = o.material[0];
        o.material.flatShading = o.name !== 'terreno';
        o.material.needsUpdate = true;
        porMaterial.push(`${o.name}: ${(g.getIndex()?.count ?? 0) / 3} tri`);
      });

      scene.add(grupo);
      resolve({ grupo, porMaterial });
    }, undefined, reject);
  });
}

/** Aparta todo lo que no sea el levantamiento. */
export function aislarTopo(scene, bimGroup, buildGroups) {
  if (scene.userData.contexto) scene.userData.contexto.visible = false;
  if (bimGroup) bimGroup.visible = false;
  for (const g of buildGroups) if (g) g.visible = false;
  // las cartelas viven en la capa 1 y se dibujan en una pasada aparte
  scene.traverse((o) => { if (o.isSprite) o.visible = false; });
}
