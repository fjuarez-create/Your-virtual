/* ═══════════════════════════════════════════════════════════════════════════
   post.js — Cadena de post-procesado del visor.

   RenderPass → GTAOPass (con denoise) → SSRPass (solo 'alta') →
   DesenfoqueMovimientoPass (propio) → UnrealBloomPass → BokehPass (solo con
   setEnfoque) → SMAAPass → OutputPass; y después la capa de cartelas (capa 1)
   sin post ni tone mapping, como en new/js/main.js.

   Decisiones donde el contrato deja hueco (o donde seguirlo al pie de la
   letra rompería la imagen):

   · G-buffer compartido. GTAOPass ya dibuja cada fotograma la escena con
     MeshNormalMaterial a un destino con textura de profundidad (24 bits).
     El desenfoque de movimiento y el SSR leen ESA profundidad (y esas
     normales) en vez de volver a dibujar 315.000 triángulos cada uno. Por
     eso GTAO va siempre encendido en ambas calidades (en 'media' con menos
     muestras): si alguien lo apaga, el desenfoque y el SSR se apagan solos.

   · SSRPass tal cual viene en three descarta lo que le llega del compositor:
     vuelve a dibujar la escena a su propio "beauty" y lo saca sin la
     oclusión de GTAO. Aquí se subclasea (SSRPassCompuesto) para que use el
     readBuffer como imagen base y el G-buffer de GTAO; así el orden del
     contrato (GTAO → SSR) conserva la oclusión y se ahorran dos pasadas de
     escena.

   · post.setReflectantes(mallas | null): añadido no contemplado en el
     contrato. Sin él el SSR refleja en todas las superficies (opacidad 0,35
     con Fresnel, como pide el contrato); con una lista de mallas (vidrios,
     suelo) solo reflejan esas, que es lo físicamente razonable para un
     monocapa rugoso y además reduce el coste del ray-march a esos píxeles.

   · Desenfoque de movimiento: la velocidad en pantalla sale de reproyectar
     la posición mundo (reconstruida desde la profundidad) con la matriz
     view-projection del fotograma anterior. La intensidad es
     min(v / VEL_REF, 1) · OBTURADOR, con v de setVelocidadCamara en m/s:
     un vuelo de cámara satura (obturador de 180°, la mitad del
     desplazamiento entre fotogramas) y una órbita lenta apenas se nota.
     La matriz anterior se actualiza en post.render aunque la pasada esté
     desactivada, para que al reactivarse no haya un fotograma con un
     salto enorme.

   · BokehPass dibuja su propia profundidad (empaquetada RGBA) porque su
     shader la espera así; como solo se activa con setEnfoque, ese coste
     extra es puntual y no merece tocar el shader del addon.

   · SMAA va antes de OutputPass como en los ejemplos de three r185 (el
     contrato lo pide así); trabaja sobre el color lineal HDR.

   · Perfiles de oclusión (`post.setOclusion('exterior' | 'interior')`,
     integración del v6). El radio de 2 m con `scale` 2 está pensado para la
     fachada a 40-60 m; dentro de una planta seccionada (cámara a 10-15 m,
     tabiques de 1,3 m y mobiliario por todas partes) esa misma oclusión
     pinta manchas negras en cada rincón (medido: 14 % de píxeles con
     luminancia < 50 en la vivienda enfocada, 0 % sin GTAO). El perfil
     'interior' (radio 0,7 m, grosor 1,5, escala 1, mezcla 0,9) deja solo el
     contacto de muebles y tabiques con el suelo. main lo activa al elegir
     planta y vuelve a 'exterior' en 'all'.

   · Mallas invisibles (revisión). Las pasadas que dibujan la escena con
     `scene.overrideMaterial` (G-buffer de GTAO, profundidad del Bokeh,
     máscara del SSR) ignoran `colorWrite`, el stencil y los planos de
     recorte del material original. cortes.js usa losas "fantasma"
     (colorWrite=false, solo proyectan sombra) y materiales de stencil con
     colorWrite=false: sin más, ese techo invisible oscurecería por AO, se
     reflejaría y desenfocaría. OcultarInvisiblesPass, justo después del
     RenderPass (que sí las necesita para las sombras), las oculta hasta el
     final del fotograma; es el mismo criterio que aplica trazador.js. Los
     planos de recorte por material siguen sin verse en el G-buffer: durante
     los 0,8 s de transición de cortes la oclusión viene de la geometría sin
     recortar (aceptado; es transitorio). Y el G-buffer se dibuja a doble
     cara, porque las mallas cortadas enseñan sus caras traseras.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

/* ───────────────────────── Mallas invisibles ───────────────────────── */

/* Oculta, desde aquí hasta que post.render llame a restaurar(), las mallas
   que solo existen para sombras o stencil (algún material con
   colorWrite=false): no deben entrar en profundidad, normales ni máscaras.
   No dibuja nada ni intercambia buffers. */
class OcultarInvisiblesPass extends Pass {
  constructor(scene) {
    super();
    this.scene = scene;
    this.needsSwap = false;
    this._ocultas = [];
  }

  static esInvisible(o) {
    if (!o.isMesh || !o.visible) return false;
    const m = o.material;
    return Array.isArray(m) ? m.some((x) => x && x.colorWrite === false) : !!m && m.colorWrite === false;
  }

  render() {
    this.restaurar(); // por si un fotograma anterior no llegó a hacerlo
    this.scene.traverse((o) => {
      if (OcultarInvisiblesPass.esInvisible(o)) { o.visible = false; this._ocultas.push(o); }
    });
  }

  restaurar() {
    for (const o of this._ocultas) o.visible = true;
    this._ocultas.length = 0;
  }
}

/* ───────────────────────── Desenfoque de movimiento ───────────────────────── */

/* Velocidad (m/s) a partir de la cual el desenfoque ya no crece más. Un vuelo
   de cámara entre encuadres va a cientos de m/s; una órbita de cortesía a
   ~3 m/s. Con 20 el vuelo satura y la órbita queda en un 15 %. */
const VEL_REF = 20;
/* Fracción del desplazamiento entre fotogramas que se difumina a intensidad
   máxima: un obturador de 180° (la convención del cine) es 0,5; algo más para
   que se lea en pantalla, sin llegar a la estela de 360°. */
const OBTURADOR = 0.65;
/* Tope del vector de velocidad en UV: evita que un tirón del reloj (pestaña
   en segundo plano, carga) arrastre media pantalla. 0,04 son ~77 px a 1080p. */
const VEL_MAX_UV = 0.04;

const DesenfoqueMovimientoShader = {
  name: 'DesenfoqueMovimientoShader',
  defines: { MUESTRAS: 12 },
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    vpInversa: { value: new THREE.Matrix4() },   // (P·V)⁻¹ del fotograma actual
    vpAnterior: { value: new THREE.Matrix4() },  // P·V del fotograma anterior
    intensidad: { value: 0 },
    velMax: { value: VEL_MAX_UV },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform highp sampler2D tDepth;
    uniform mat4 vpInversa;
    uniform mat4 vpAnterior;
    uniform float intensidad;
    uniform float velMax;

    void main() {
      float d = texture2D(tDepth, vUv).x;
      /* De profundidad a mundo y de mundo a la pantalla anterior: la
         diferencia entre ambas posiciones en pantalla es la velocidad. */
      vec4 mundo = vpInversa * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      mundo /= mundo.w;
      vec4 ant = vpAnterior * mundo;
      vec2 vel = vec2(0.0);
      if (ant.w > 0.0) {
        vec2 uvAnt = (ant.xy / ant.w) * 0.5 + 0.5;
        vel = (vUv - uvAnt) * intensidad;
        float l = length(vel);
        if (l > velMax) vel *= velMax / l;
      }
      /* Ruido de gradiente entrelazado: desplaza el patrón de muestreo por
         píxel para que 8-12 muestras no dejen bandas visibles. */
      float ruido = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec4 col = vec4(0.0);
      for (int i = 0; i < MUESTRAS; i++) {
        float t = (float(i) + ruido) / float(MUESTRAS) - 0.5;
        col += texture2D(tDiffuse, vUv + vel * t);
      }
      gl_FragColor = col / float(MUESTRAS);
    }`,
};

export class DesenfoqueMovimientoPass extends ShaderPass {
  constructor(camera, { muestras = 12 } = {}) {
    super(DesenfoqueMovimientoShader);
    this.camera = camera;
    this.velocidad = 0;          // m/s, lo pone setVelocidadCamara
    this._vp = new THREE.Matrix4();
    this._anteriorLista = false;
    this.setMuestras(muestras);
  }

  setMuestras(n) {
    this.material.defines.MUESTRAS = Math.max(4, Math.round(n));
    this.material.needsUpdate = true;
  }

  /** Textura de profundidad del fotograma actual (la del G-buffer de GTAO). */
  setProfundidad(depthTexture) {
    this.uniforms.tDepth.value = depthTexture;
  }

  get intensidad() {
    return Math.min(this.velocidad / VEL_REF, 1) * OBTURADOR;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    /* Con la cámara ya usada por RenderPass sus matrices están al día. */
    this._vp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    if (!this._anteriorLista) this.actualizarAnterior();
    this.uniforms.vpInversa.value.copy(this._vp).invert();
    this.uniforms.intensidad.value = this.intensidad;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }

  /** Guarda la view-projection de este fotograma como "anterior" del siguiente. */
  actualizarAnterior() {
    this._vp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.uniforms.vpAnterior.value.copy(this._vp);
    this._anteriorLista = true;
  }
}

/* ───────────────────────── SSR sobre el compositor ───────────────────────── */

/* SSRPass vuelve a dibujar la escena a su propio beauty y a su propio buffer
   de normales, y saca el resultado ignorando el readBuffer. Esta versión usa
   lo que le llega del compositor (ya con oclusión) y el G-buffer de GTAO. */
class SSRPassCompuesto extends SSRPass {
  constructor(opciones, gbuffer) {
    super(opciones);
    this.gbuffer = gbuffer; // { depthTexture, normalTexture }
    this.setSize(this.width, this.height);
  }

  /* Los destinos beauty (HalfFloat + profundidad), normales y prev del
     SSRPass original no se usan aquí; a resolución completa serían ~90 MB
     a 1440p. Se dejan a 1×1 (no se pueden quitar: el shader de depuración
     y el modo bouncing los referencian). */
  setSize(width, height) {
    super.setSize(width, height);
    this.beautyRenderTarget.setSize(1, 1);
    this.normalRenderTarget.setSize(1, 1);
    this.prevRenderTarget.setSize(1, 1);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.ssrMaterial.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = this.gbuffer.depthTexture;
    u.tNormal.value = this.gbuffer.normalTexture;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    u.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    u.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    u.opacity.value = this.opacity;
    u.maxDistance.value = this.maxDistance;
    u.thickness.value = this.thickness;

    // máscara de superficies reflectantes (solo si hay lista)
    if (this.selective) {
      this._renderMetalness(renderer, this.metalnessOnMaterial, this.metalnessRenderTarget, 0, 0);
    }

    this._renderPass(renderer, this.ssrMaterial, this.ssrRenderTarget);
    if (this.blur) {
      this._renderPass(renderer, this.blurMaterial, this.blurRenderTarget);
      this._renderPass(renderer, this.blurMaterial2, this.blurRenderTarget2);
    }

    const destino = this.renderToScreen ? null : writeBuffer;
    this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.copyMaterial.blending = THREE.NoBlending;
    this._renderPass(renderer, this.copyMaterial, destino);
    this.copyMaterial.uniforms.tDiffuse.value = this.blur ? this.blurRenderTarget2.texture : this.ssrRenderTarget.texture;
    this.copyMaterial.blending = THREE.NormalBlending;
    this._renderPass(renderer, this.copyMaterial, destino);
  }
}

/* ───────────────────────────── crearPost ───────────────────────────── */

/* Perfiles de oclusión (ver cabecera). */
export const PERFILES_AO = {
  exterior: { mezcla: 1.3, gtao: { radius: 2.0, thickness: 4.0, scale: 2.0 } },
  interior: { mezcla: 0.9, gtao: { radius: 0.7, thickness: 1.5, scale: 1.0 } },
};

const CALIDADES = {
  alta:  { aoMuestras: 16, aoDenoise: 16, desenfoqueMuestras: 12, ssr: false, ssrEscala: 0.5 }, // SSR apagado: dejaba la calle como mojada y con manchas
  media: { aoMuestras: 8,  aoDenoise: 8,  desenfoqueMuestras: 8,  ssr: false, ssrEscala: 0.5 },
};

/* `ligero`: cadena mínima para el móvil (ver cabecera del visor). Se quedan
   el render, el bloom y la salida; no se crean la oclusión, los reflejos, el
   desenfoque de movimiento, el bokeh ni el suavizado, que son seis destinos
   de pantalla completa que el navegador del teléfono no puede sostener. */
export function crearPost(ctx, luz, opciones = {}) {
  const { renderer, scene, camera } = ctx;
  const ligero = !!opciones.ligero;
  const tam = new THREE.Vector2();
  renderer.getSize(tam);
  let w = Math.max(1, tam.x), h = Math.max(1, tam.y);
  let ratioActual = 0; // fuerza el primer setSize

  const composer = new EffectComposer(renderer); // HalfFloat: el bloom trabaja en HDR

  const renderPass = new RenderPass(scene, camera);

  /* Oclusión: radio en metros. El contrato sugiere ~0,6 m, pero a 40-60 m de
     distancia (el encuadre habitual) eso son cuatro píxeles y no se ve nada
     (main.js midió 1,5/255 con 0,55). Con 1,6 m aparecen los retranqueos de
     ventana, la junta con el suelo y el bajo de los aleros, y aún no hay
     halos alrededor de cada hueco. `thickness` es la diferencia de
     profundidad hasta la que un vecino cuenta como oclusor: en una fachada
     vista al sesgo, 1 m descartaba casi todas las muestras. */
  const gtao = ligero ? null : new GTAOPass(scene, camera, w, h);
  if (gtao) {
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.normalMaterial.side = THREE.DoubleSide; // caras traseras de las mallas cortadas
  gtao.blendIntensity = PERFILES_AO.exterior.mezcla;
  gtao.updateGtaoMaterial({
    ...PERFILES_AO.exterior.gtao, distanceExponent: 1.0, distanceFallOff: 0.6,
    samples: CALIDADES.alta.aoMuestras, screenSpaceRadius: false,
  });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: CALIDADES.alta.aoDenoise });
  }

  /* El G-buffer de GTAO es la única fuente de profundidad y normales de la
     cadena; ver la cabecera del fichero. */
  const gbuffer = { get depthTexture() { return gtao?.depthTexture; }, get normalTexture() { return gtao?.normalTexture; } };

  const ssr = ligero ? null : new SSRPassCompuesto({ renderer, scene, camera, width: w, height: h, selects: null }, gbuffer);
  if (ssr) {
    ssr.opacity = 0.35;
    ssr.maxDistance = 60;
    ssr.thickness = 0.35;        // metros: grosor que se supone a cada píxel
    ssr.resolutionScale = CALIDADES.alta.ssrEscala;
    ssr.blur = true;
  }

  const desenfoque = ligero ? null : new DesenfoqueMovimientoPass(camera, { muestras: CALIDADES.alta.desenfoqueMuestras });
  if (desenfoque) desenfoque.enabled = false;    // se enciende con velocidad > 0

  const parametrosIniciales = luz?.parametros || { bloom: 0.14, umbral: 0.92, exposicion: 1.0 };
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), parametrosIniciales.bloom, 0.5, parametrosIniciales.umbral);

  /* Bokeh: `focus` en metros; `aperture` es UV por metro fuera de foco
     (0,00025 → a 12 m del foco, 0,003 de UV, ~6 px a 1080p: la vivienda
     enfocada y sus vecinas siguen nítidas; el fondo a 100 m llega al tope). */
  const bokeh = ligero ? null : new BokehPass(scene, camera, { focus: 40, aperture: 0.00025, maxblur: 0.01 });
  if (bokeh) {
    bokeh.enabled = false;
    if (bokeh._materialDepth) bokeh._materialDepth.side = THREE.DoubleSide; // misma razón que el G-buffer
  }

  const smaa = ligero ? null : new SMAAPass();
  const output = new OutputPass();
  const ocultar = new OcultarInvisiblesPass(scene);

  for (const p of [renderPass, ocultar, gtao, ssr, desenfoque, bloom, bokeh, smaa, output]) if (p) composer.addPass(p);
  let activo = true; // false tras dispose: los eventos de ctx no se pueden desregistrar

  const post = {
    composer, gtao, ssr, desenfoque, bloom, bokeh, smaa,
    enfoque: null,
    velocidad: 0,

    render(dt) {
      if (!activo) return;
      /* Sin G-buffer no hay profundidad para nadie (ver cabecera). */
      const conGbuffer = !!gtao?.enabled;
      if (desenfoque) {
        desenfoque.setProfundidad(gtao?.depthTexture);
        desenfoque.enabled = conGbuffer && post.velocidad > 0.01;
      }
      if (ssr) ssr.enabled = conGbuffer && ctx.calidad === 'alta' && post.ssrActivo;
      if (bokeh) bokeh.enabled = post.enfoque != null;
      ocultar.enabled = conGbuffer || !!bokeh?.enabled;

      try {
        composer.render(dt);
      } finally {
        ocultar.restaurar(); // las mallas de sombra vuelven antes de que nadie más mire la escena
      }
      desenfoque?.actualizarAnterior();

      /* Cartelas (capa 1): sin bloom ni tone mapping, siempre por encima. El
         fondo se anula para no repintar el cielo sobre la escena compuesta. */
      const bg = scene.background;
      scene.background = null;
      renderer.autoClear = false;
      renderer.clearDepth();
      camera.layers.set(ctx.capas.cartelas);
      renderer.render(scene, camera);
      camera.layers.set(ctx.capas.normal);
      renderer.autoClear = true;
      scene.background = bg;
    },

    setTamano(nw, nh) {
      if (!activo) return;
      const ratio = renderer.getPixelRatio();
      if (nw === w && nh === h && ratio === ratioActual) return;
      w = nw; h = nh; ratioActual = ratio;
      /* composer.setSize multiplica por el pixel ratio y se lo pasa a cada
         pasada, así todos los destinos intermedios miden lo mismo que el
         lienzo en píxeles de dispositivo. */
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },

    setCalidad(tier) {
      if (!activo) return;
      const c = CALIDADES[tier] || CALIDADES.alta;
      gtao?.updateGtaoMaterial({ samples: c.aoMuestras });
      gtao?.updatePdMaterial({ samples: c.aoDenoise });
      desenfoque?.setMuestras(c.desenfoqueMuestras);
      if (ssr) ssr.resolutionScale = c.ssrEscala;
      post.ssrActivo = c.ssr;
      // el pixel ratio ha podido cambiar (escena.setCalidad): rehacer destinos
      ratioActual = renderer.getPixelRatio();
      composer.setPixelRatio(ratioActual);
      composer.setSize(w, h);
    },

    setEnfoque(distancia) {
      post.enfoque = (typeof distancia === 'number' && distancia > 0) ? distancia : null;
      if (post.enfoque != null && bokeh) bokeh.uniforms.focus.value = post.enfoque;
    },

    setVelocidadCamara(v) {
      post.velocidad = Math.max(0, Number(v) || 0);
      if (desenfoque) desenfoque.velocidad = post.velocidad;
    },

    setMomento(parametros) {
      if (!parametros) return;
      if (parametros.bloom !== undefined) bloom.strength = parametros.bloom;
      if (parametros.umbral !== undefined) bloom.threshold = parametros.umbral;
      if (parametros.exposicion !== undefined) renderer.toneMappingExposure = parametros.exposicion;
    },

    /** Perfil de oclusión: 'exterior' (fachada) o 'interior' (planta seccionada). */
    setOclusion(perfil) {
      const P = PERFILES_AO[perfil] || PERFILES_AO.exterior;
      if (post.oclusion === perfil) return;
      post.oclusion = perfil;
      if (!gtao) return;
      gtao.blendIntensity = P.mezcla;
      gtao.updateGtaoMaterial({ ...P.gtao });
    },

    /** Mallas que reflejan (vidrios, suelo…); null → todas, al 0,35. */
    setReflectantes(mallas) {
      if (ssr) ssr.selects = Array.isArray(mallas) && mallas.length ? mallas : null;
    },

    dispose() {
      if (!activo) return;
      activo = false;
      ocultar.restaurar();
      for (const p of composer.passes) p.dispose?.();
      composer.dispose();
    },
  };
  post.ssrActivo = CALIDADES.alta.ssr;
  post.oclusion = 'exterior';

  ctx.on('tamano', ({ w: nw, h: nh }) => post.setTamano(nw, nh));
  ctx.on('calidad', (tier) => post.setCalidad(tier));
  /* luz.js emite 'momento' al acabar un fundido; entre medias es main quien
     va llamando a setMomento con los parámetros interpolados. */
  ctx.on('momento', () => { if (luz?.parametros) post.setMomento(luz.parametros); });

  post.setCalidad(ctx.calidad);
  post.setMomento(parametrosIniciales);
  return post;
}
