/* ───────────────────────────────────────────────────────────────────────────
   Entorno lejano: teselas fotorrealistas 3D de Google.

   Lo cercano —aceras, viales colindantes y urbanización— vendrá modelado a
   mano en el BIM; esto cubre el resto del barrio, que sería absurdo inventar.
   Las teselas se geo-referencian para que el centro de la parcela caiga en el
   origen de la escena, de modo que el edificio no se mueve de donde está y
   todo lo demás se coloca a su alrededor.

   Las mallas de Google vienen sin iluminar (KHR_materials_unlit) y sin Draco,
   así que no hacen falta decodificadores ni entran en el cálculo de luces.
   ─────────────────────────────────────────────────────────────────────────── */
import * as THREE from 'three';
import {
  TilesRenderer,
  GoogleCloudAuthPlugin,
  ReorientationPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
} from '3d-tiles-renderer';

const D2R = Math.PI / 180;

/* Todo lo que hay que tocar para recolocar el entorno vive aquí. */
export const SITE = {
  lat: 27.986703,       // centro de la parcela
  lon: -15.395572,
  ground: 77.9,         // cota del terreno (Elevation API de Google)

  // Giro que alinea el eje largo del edificio con su rumbo real. El plugin
  // deja el tileset con +X al oeste y +Z al norte, así que el ángulo sale de
  // 90 + rumbo. El rumbo (70°) es el mismo que ya usa context.js para orientar
  // C/ Íñigo López de Mendoza, de modo que lo modelado y lo de Google
  // comparten orientación por construcción.
  bearingDeg: 70,
  get azimuthDeg() { return 90 + this.bearingDeg; },

  baseY: -0.8,          // cota de la planta 1 en la escena

  // Hueco circular en las teselas alrededor de la parcela: dentro mandará la
  // urbanización modelada a mano, fuera manda Google. De momento va a 0 y se
  // muestra el mundo real completo, porque el contexto que hay hoy está
  // inventado y se aparta entero al encender esta capa. Cuando llegue el BIM
  // de aceras y viales colindantes, este radio pasa a ~120 m.
  holeRadius: 0,

  // Cuanto más alto, menos teselas y menos detalle. 6 es el valor por defecto
  // de la librería; se sube un poco para aliviar tablets y móviles.
  errorTarget: 8,
};

/* Recorta un disco alrededor del origen descartando fragmentos. Se aplica
   sobre el material de cada malla que llega, sin tocar la geometría. */
function punchHole(material, radius) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHoleRadius = { value: radius };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vWorldXZ;\nvoid main() {')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {',
        'uniform float uHoleRadius;\nvarying vec2 vWorldXZ;\nvoid main() {')
      .replace('#include <dithering_fragment>',
        'if (length(vWorldXZ) < uHoleRadius) discard;\n#include <dithering_fragment>');
  };
  material.needsUpdate = true;
}

/**
 * Monta la capa de entorno. Devuelve null si no hay clave de Maps, para que la
 * aplicación siga funcionando igual sin ella.
 */
export function createEnvironment({ scene, camera, renderer, apiKey, onError }) {
  if (!apiKey || apiKey.startsWith('__')) return null;

  const group = new THREE.Group();
  group.name = 'entorno';
  group.position.y = SITE.baseY;
  group.visible = false;
  scene.add(group);

  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  tiles.registerPlugin(new ReorientationPlugin({
    lat: SITE.lat * D2R,
    lon: SITE.lon * D2R,
    height: SITE.ground,
    azimuth: SITE.azimuthDeg * D2R,
  }));

  tiles.errorTarget = SITE.errorTarget;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  group.add(tiles.group);

  let tilesLoaded = 0;
  tiles.addEventListener('load-model', ({ scene: tileScene }) => {
    tilesLoaded++;
    tileScene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      o.renderOrder = -1;              // el entorno se pinta antes que el edificio
      if (SITE.holeRadius > 0) punchHole(o.material, SITE.holeRadius);
    });
  });
  tiles.addEventListener('load-error', (e) => onError && onError(e));

  let enabled = false;

  return {
    group,
    tiles,
    get loaded() { return tilesLoaded; },
    get enabled() { return enabled; },

    setEnabled(v) {
      enabled = !!v;
      group.visible = enabled;
    },

    /* Se llama en cada fotograma. Con el entorno apagado no hace nada, así que
       no consume ni red ni memoria mientras no se pide. */
    update() {
      if (!enabled) return;
      camera.updateMatrixWorld();
      tiles.setResolutionFromRenderer(camera, renderer);
      tiles.update();
    },

    dispose() {
      tiles.dispose();
      scene.remove(group);
    },
  };
}
