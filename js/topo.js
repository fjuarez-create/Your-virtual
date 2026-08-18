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

/* Lo urbanizado y nada más: la calle y sus aceras. El terreno natural, las
   edificaciones colindantes, los muros, las arquetas y el arbolado se quedan
   fuera salvo que se pidan con ?topo=todo. Como el GLB trae cada familia en su
   propia malla, esto se decide aquí y no hace falta regenerar nada. */
const URBANIZADO = new Set(['asfalto', 'acera', 'bordillo', 'podotactil', 'marca_vial']);

export function topoPedido() {
  const v = new URLSearchParams(location.search).get('topo');
  return v === '1' || v === 'todo';
}

export function topoCompleto() {
  return new URLSearchParams(location.search).get('topo') === 'todo';
}

export function cargarTopo(scene, { todo = false, url = 'assets/entorno_topo.glb' } = {}) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const grupo = gltf.scene;
      grupo.name = 'topo';
      grupo.position.y = BASE_Y;

      const porMaterial = [];
      const fuera = [];
      grupo.traverse((o) => {
        if (!o.isMesh) return;
        if (!todo && !URBANIZADO.has(o.name)) {
          o.visible = false;
          fuera.push(o.name);
          return;
        }
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
      resolve({ grupo, porMaterial, fuera });
    }, undefined, reject);
  });
}

/* Lo único que sobrevive al aislamiento, además de las luces: el propio
   levantamiento y el cielo. El entorno de Google se respeta tal cual esté,
   porque lo enciende y lo apaga su botón. */
const RESPETADOS = new Set(['topo', 'cielo', 'nubes', 'cielo_noche', 'entorno']);

/* Aparta todo lo que no sea el levantamiento.

   Va por lista blanca y no por lista negra a propósito: el edificio, sus
   plantas, los jardines y el contexto inventado cuelgan de la escena por
   caminos distintos, y enumerarlos uno a uno dejaba fuera al que se añadía
   después. Aquí basta con no estar en la lista para desaparecer. */
export function aislarTopo(scene) {
  for (const o of scene.children) {
    if (o.isLight || o.isCamera || RESPETADOS.has(o.name)) continue;
    o.visible = false;
  }
  // las cartelas viven en la capa 1 y se dibujan en una pasada aparte
  scene.traverse((o) => { if (o.isSprite) o.visible = false; });
}
