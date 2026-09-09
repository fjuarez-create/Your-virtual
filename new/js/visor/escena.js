/* ═══════════════════════════════════════════════════════════════════════════
   escena.js — La base que comparten todos los módulos del visor.

   Un renderer, una escena, una cámara y un pequeño bus de eventos. Aquí no
   hay luz ni post-procesado: eso lo ponen luz.js y post.js sobre este ctx.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

export const CAPAS = { normal: 0, cartelas: 1 };

export function crearEscena(canvas) {
  /* Sin antialias del propio lienzo: el suavizado lo hace el post (SMAA), y
     activarlo aquí duplicaría el coste sin mejorar nada. */
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
    stencil: true, // las tapas de corte por stencil lo necesitan
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* AgX en vez de ACES: ACES empasta la parte alta de la curva, y con un
     edificio blanco eso significa que toda la fachada iluminada acaba en la
     misma nota. */
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 4200);
  camera.position.set(64, 48, 92);
  camera.lookAt(0, 5, 0);

  const bus = new EventTarget();
  const ctx = {
    renderer, scene, camera, canvas, capas: CAPAS,
    calidad: 'alta',
    on(evento, fn) { bus.addEventListener(evento, (e) => fn(e.detail)); },
    emit(evento, datos) { bus.dispatchEvent(new CustomEvent(evento, { detail: datos })); },
    setCalidad(tier) {
      ctx.calidad = tier === 'media' ? 'media' : 'alta';
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ctx.calidad === 'alta' ? 2 : 1.25));
      ctx.emit('calidad', ctx.calidad);
    },
    setTamano(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      ctx.emit('tamano', { w, h });
    },
  };
  ctx.setCalidad('alta');
  return ctx;
}
