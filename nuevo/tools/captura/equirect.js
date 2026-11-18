/* ═══════════════════════════════════════════════════════════════════════════
   equirect.js — Panorámica 360 exacta desde la escena: CubeCamera de 6 caras
   → equirectangular 2:1 con un sombreador de reproyección propio, y pases
   auxiliares con la MISMA cámara (profundidad, normales, segmentación).

   Convención de la equirectangular (la que escribe el JSON de la toma):
   · Rumbo β en grados, horario visto desde arriba, desde el norte del
     modelo (−z del SketchUp): 0 = −z, 90 = +x, 180 = +z, 270 = −x.
   · Columna: u = 0,5 + (β − rumbo)/360, con `rumbo` el rumbo del centro de
     la imagen. La costura (u = 0 ≡ 1) queda a rumbo + 180.
   · Fila: v = 0,5 − φ/180, φ la elevación en grados (fila de arriba = cenit).
   · Dirección de un píxel: (sin β·cos φ, sin φ, −cos β·cos φ), mundo three.
   Con la cámara nivelada (sin alabeo ni cabeceo) las verticales del mundo
   son columnas exactas de la imagen: es la propia proyección, no un ajuste.

   Pases (todos con el mismo cubo de caras de `cara` px y la misma
   reproyección; solo cambia lo que se pinta en el cubo):
   · color: materiales del modelo, HDR en un cubo de medio flotante, tono y
     sRGB al reproyectar, `muestras`² submuestras por píxel (suavizado).
   · profundidad: distancia RADIAL a la cámara en mm, empaquetada en 24 bits
     (R·65536 + G·256 + B) en un cubo de 8 bits leído al píxel más cercano.
     Exacta al milímetro; procesar360.py la pasa a PNG de 16 bits.
   · normales: normal de MUNDO de la cara visible (la de los vértices,
     orientada como la cara geométrica), RGB = n·0,5 + 0,5.
   · id: color plano por clase (CLASES), sin conversión ni mezcla.
   En los pases auxiliares el vidrio es opaco (es la superficie que se ve) y
   no hay fondo: un píxel negro es una dirección que no toca geometría.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* Clases de segmentación. Donde existe, el color es el de ADE20K (el que
   usan los ControlNet de segmentación): muro, suelo, techo, ventana,
   puerta, armario/cocina, edificio, cielo. Los demás son propios. */
export const CLASES = [
  { id: 0, clave: 'vacio', nombre: 'Sin geometría', color: [0, 0, 0] },
  { id: 1, clave: 'muro', nombre: 'Muro, tabique, pilar, rodapié', color: [120, 120, 120], ade20k: 'wall' },
  { id: 2, clave: 'suelo', nombre: 'Suelo', color: [80, 50, 50], ade20k: 'floor' },
  { id: 3, clave: 'techo', nombre: 'Techo', color: [120, 120, 80], ade20k: 'ceiling' },
  { id: 4, clave: 'vidrio', nombre: 'Vidrio / ventana', color: [230, 230, 230], ade20k: 'windowpane' },
  { id: 5, clave: 'carpinteria', nombre: 'Carpintería de ventana (aluminio)', color: [255, 160, 20] },
  { id: 6, clave: 'puerta', nombre: 'Puerta (hoja, marco y herrajes)', color: [8, 255, 51], ade20k: 'door' },
  { id: 7, clave: 'mobiliario', nombre: 'Mobiliario suelto (sofá, mesa, sillas, textiles, lámparas, plantas)', color: [11, 102, 255] },
  { id: 8, clave: 'mueble_fijo', nombre: 'Cocina y armarios', color: [224, 5, 255], ade20k: 'cabinet' },
  { id: 9, clave: 'sanitarios', nombre: 'Baño: sanitarios, mueble, espejo, mampara', color: [0, 200, 200] },
  { id: 10, clave: 'exterior', nombre: 'Entorno exterior', color: [180, 120, 120], ade20k: 'building' },
];
const CLASE = Object.fromEntries(CLASES.map((c) => [c.clave, c]));

/* ── Reproyección cubo → equirectangular ── */
const VERT_QUAD = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const DIRECCION = `
uniform vec2 uTam;
uniform vec2 uDesp;                 // desplazamiento de la franja (px, y hacia arriba)
uniform float uRumbo;
const float PI = 3.14159265358979;
vec2 pixel() { return gl_FragCoord.xy + uDesp; }
vec3 direccion(vec2 px) {           // px en píxeles del lienzo, y hacia ARRIBA (gl_FragCoord)
  float beta = (px.x / uTam.x - 0.5) * 2.0 * PI + uRumbo;
  float phi = (px.y / uTam.y - 0.5) * PI;
  return vec3(sin(beta) * cos(phi), sin(phi), -cos(beta) * cos(phi));
}`;
const FRAG_COLOR = `
uniform samplerCube uCubo;
uniform int uMuestras;
${DIRECCION}
void main() {
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 8; j++) {
    if (j >= uMuestras) break;
    for (int i = 0; i < 8; i++) {
      if (i >= uMuestras) break;
      vec2 o = (vec2(float(i), float(j)) + 0.5) / float(uMuestras) - 0.5;
      acc += textureCube(uCubo, direccion(pixel() + o)).rgb;
    }
  }
  gl_FragColor = vec4(acc / float(uMuestras * uMuestras), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/* Pases de datos: una muestra en el centro del píxel, filtro NEAREST, los
   bytes del cubo pasan tal cual (ShaderMaterial sin conversión de color). */
const FRAG_DATOS = `
uniform samplerCube uCubo;
${DIRECCION}
void main() { gl_FragColor = vec4(textureCube(uCubo, direccion(pixel())).rgb, 1.0); }`;

/* ── Materiales de los pases ── */
const VERT_PASE = `
varying vec3 vMundo;
varying vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vMundo = w.xyz;
  vNormal = transpose(inverse(mat3(modelMatrix))) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
/* Normal de la cara geométrica, orientada hacia la cámara. */
const NORMAL_CARA = `
vec3 normalCara(vec3 cam) {
  vec3 n = normalize(cross(dFdx(vMundo), dFdy(vMundo)));
  return dot(n, cam - vMundo) < 0.0 ? -n : n;
}`;
const FRAG_PROFUNDIDAD = `
uniform vec3 uCam;
varying vec3 vMundo;
varying vec3 vNormal;
void main() {
  float mm = floor(length(vMundo - uCam) * 1000.0 + 0.5);
  mm = min(mm, 16777215.0);
  float r = floor(mm / 65536.0);
  float g = floor((mm - r * 65536.0) / 256.0);
  float b = mm - r * 65536.0 - g * 256.0;
  gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
}`;
const FRAG_NORMAL = `
uniform vec3 uCam;
varying vec3 vMundo;
varying vec3 vNormal;
${NORMAL_CARA}
void main() {
  vec3 g = normalCara(uCam);
  vec3 n = vNormal;
  n = dot(n, n) > 1e-6 ? normalize(n) : g;
  if (dot(n, g) < 0.0) n = -n;
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}`;
/* uModo 0: color fijo; 1: por orientación (suelo si mira arriba, techo si
   mira abajo, muro si no), para la envolvente, que trae juntos forjados,
   techos y muros en las mismas mallas. */
const FRAG_ID = `
uniform vec3 uCam;
uniform vec3 uColor;
uniform vec3 uSuelo;
uniform vec3 uTecho;
uniform int uModo;
varying vec3 vMundo;
varying vec3 vNormal;
${NORMAL_CARA}
void main() {
  vec3 c = uColor;
  if (uModo == 1) {
    vec3 n = normalCara(uCam);
    if (n.y > 0.7) c = uSuelo; else if (n.y < -0.7) c = uTecho;
  }
  gl_FragColor = vec4(c / 255.0, 1.0);
}`;

export function crearEquirect({ renderer, scene, canvas }) {
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadEscena = new THREE.Scene();
  const quad = new THREE.Mesh(quadGeo);
  quad.frustumCulled = false;
  quadEscena.add(quad);

  const cubos = {};
  function cubo(tipo, cara) {
    const k = `${tipo}|${cara}`;
    if (cubos[k]) return cubos[k];
    const datos = tipo !== 'color';
    const rt = new THREE.WebGLCubeRenderTarget(cara, {
      type: datos ? THREE.UnsignedByteType : THREE.HalfFloatType,
      minFilter: datos ? THREE.NearestFilter : THREE.LinearFilter,
      magFilter: datos ? THREE.NearestFilter : THREE.LinearFilter,
      generateMipmaps: false, depthBuffer: true,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;
    cubos[k] = rt;
    return rt;
  }

  const materialesPase = {
    profundidad: new THREE.ShaderMaterial({ uniforms: { uCam: { value: new THREE.Vector3() } }, vertexShader: VERT_PASE, fragmentShader: FRAG_PROFUNDIDAD, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    normal: new THREE.ShaderMaterial({ uniforms: { uCam: { value: new THREE.Vector3() } }, vertexShader: VERT_PASE, fragmentShader: FRAG_NORMAL, side: THREE.DoubleSide, toneMapped: false, fog: false }),
  };
  const materialesId = new Map();
  const uCamId = { value: new THREE.Vector3() };
  function materialId(clave, porOrientacion) {
    const k = `${clave}|${porOrientacion ? 1 : 0}`;
    let m = materialesId.get(k);
    if (!m) {
      m = new THREE.ShaderMaterial({
        uniforms: {
          uCam: uCamId,
          uColor: { value: new THREE.Vector3(...CLASE[clave].color) },
          uSuelo: { value: new THREE.Vector3(...CLASE.suelo.color) },
          uTecho: { value: new THREE.Vector3(...CLASE.techo.color) },
          uModo: { value: porOrientacion ? 1 : 0 },
        },
        vertexShader: VERT_PASE, fragmentShader: FRAG_ID, side: THREE.DoubleSide, toneMapped: false, fog: false,
      });
      materialesId.set(k, m);
    }
    return m;
  }

  /* Material de cada malla para un pase (null = color: los del modelo). */
  function asignadorDe(tipo, posicion, clasificar) {
    if (tipo === 'profundidad' || tipo === 'normal') {
      materialesPase[tipo].uniforms.uCam.value.copy(posicion);
      return () => materialesPase[tipo];
    }
    if (tipo === 'id') {
      uCamId.value.copy(posicion);
      return (o) => {
        const c = clasificar(o);
        return c ? materialId(c.clase, c.porOrientacion) : null;
      };
    }
    return null;
  }

  /* Ejecuta fn con los materiales del pase puestos. `asignar(o)` devuelve el
     material de cada malla (o null para ocultarla); sin `asignar`, todo
     queda como está (pase de color). En los pases de datos no hay fondo ni
     niebla y el lienzo se limpia a negro (= clase «vacío», profundidad 0). */
  function conAsignacion(asignar, fn) {
    const guardados = [], ocultos = [];
    const bg = scene.background, fog = scene.fog;
    const clear = renderer.getClearColor(new THREE.Color()), alfa = renderer.getClearAlpha();
    const tm = renderer.toneMapping;
    if (asignar) {
      scene.traverse((o) => {
        if ((o.isPoints || o.isSprite || o.isLine) && o.visible) { o.visible = false; ocultos.push(o); return; }
        if (!o.isMesh || !o.visible) return;
        guardados.push([o, o.material]);
        const m = asignar(o);
        if (m === null) { o.visible = false; ocultos.push(o); } else o.material = m;
      });
      scene.background = null; scene.fog = null;
      renderer.setClearColor(0x000000, 1);
    }
    try {
      renderer.shadowMap.needsUpdate = true;
      return fn();
    } finally {
      for (const [o, m] of guardados) o.material = m;
      for (const o of ocultos) o.visible = true;
      scene.background = bg; scene.fog = fog;
      renderer.setClearColor(clear, alfa);
      renderer.toneMapping = tm;
    }
  }

  /* Dibuja el cubo desde `posicion`. */
  function renderCubo(tipo, posicion, { cara, cerca = 0.05, lejos = 4000, asignar = null } = {}) {
    const rt = cubo(tipo, cara);
    const cam = new THREE.CubeCamera(cerca, lejos, rt);
    cam.position.copy(posicion);
    scene.add(cam);
    cam.updateMatrixWorld(true);
    try {
      conAsignacion(asignar, () => cam.update(renderer, scene));
    } finally {
      scene.remove(cam);
    }
    return rt;
  }

  /* Vista plana (perspectiva) desde la misma posición, con el mismo pase:
     es la referencia contra la que se comprueba la reproyección. Dirección
     por rumbo y elevación con la misma convención que la equirectangular. */
  function vistaPlana(tipo, posicion, { rumbo = 0, elevacion = 0, fov = 70, ancho = 1200, alto = 800, clasificar } = {}) {
    const b = THREE.MathUtils.degToRad(rumbo), e = THREE.MathUtils.degToRad(elevacion);
    const dir = new THREE.Vector3(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e));
    const cam = new THREE.PerspectiveCamera(fov, ancho / alto, 0.05, 4000);
    cam.position.copy(posicion);
    cam.up.set(0, 1, 0);
    cam.lookAt(posicion.clone().add(dir));
    cam.updateMatrixWorld(true);
    canvas.style.width = `${ancho}px`; canvas.style.height = `${alto}px`;
    renderer.setPixelRatio(1);
    renderer.setSize(ancho, alto, false);
    return conAsignacion(asignadorDe(tipo, posicion, clasificar), () => {
      if (tipo !== 'color') renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
      return canvas.toDataURL('image/png');
    });
  }

  /* Reproyecta el cubo a una equirectangular de ancho × ancho/2 y la
     devuelve como PNG (data URL). Si el lienzo WebGL no admite el tamaño
     entero (Chromium reduce el búfer de dibujo en silencio por encima de unos
     33 Mpx: un 8192×4096 sale a 8145×4072 y la imagen queda RECORTADA), o si
     se pide `franja`, se dibuja por franjas horizontales y se componen en un
     lienzo 2D (copia exacta de bytes: el lienzo WebGL es opaco). Cada franja
     comprueba su búfer de dibujo antes de leerla. */
  function reproyectar(rt, { ancho, rumbo = 0, color = false, muestras = 3, franja = 0 }) {
    const alto = ancho / 2;
    const gl = renderer.getContext();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uCubo: { value: rt.texture },
        uTam: { value: new THREE.Vector2(ancho, alto) },
        uDesp: { value: new THREE.Vector2(0, 0) },
        uRumbo: { value: THREE.MathUtils.degToRad(rumbo) },
        uMuestras: { value: muestras },
      },
      vertexShader: VERT_QUAD,
      fragmentShader: color ? FRAG_COLOR : FRAG_DATOS,
      depthTest: false, depthWrite: false, toneMapped: color,
    });
    quad.material = mat;
    renderer.setRenderTarget(null);
    renderer.setPixelRatio(1);
    const dibujar = (w, h) => {
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      renderer.setSize(w, h, false);
      return gl.drawingBufferWidth === w && gl.drawingBufferHeight === h;
    };
    try {
      if (!franja && dibujar(ancho, alto)) {
        renderer.render(quadEscena, quadCam);
        return canvas.toDataURL('image/png');
      }
      const paso = franja || 1024;
      const lienzo = document.createElement('canvas');
      lienzo.width = ancho; lienzo.height = alto;
      const c2 = lienzo.getContext('2d', { alpha: false });
      c2.imageSmoothingEnabled = false;
      for (let y0 = 0; y0 < alto; y0 += paso) {          // y0: fila de arriba de la franja
        const h = Math.min(paso, alto - y0);
        if (!dibujar(ancho, h)) throw new Error(`búfer de dibujo ${gl.drawingBufferWidth}×${gl.drawingBufferHeight} para una franja de ${ancho}×${h}`);
        mat.uniforms.uDesp.value.set(0, alto - y0 - h);
        renderer.render(quadEscena, quadCam);
        c2.drawImage(canvas, 0, y0);
      }
      return lienzo.toDataURL('image/png');
    } finally {
      mat.dispose();
    }
  }

  function pase(tipo, posicion, { cara = 2048, ancho = 4096, rumbo = 0, muestras = 3, franja = 0, clasificar } = {}) {
    const asignar = asignadorDe(tipo, posicion, clasificar);
    const t0 = performance.now();
    const rt = renderCubo(tipo, posicion, { cara, asignar });
    const t1 = performance.now();
    const url = reproyectar(rt, { ancho, rumbo, color: tipo === 'color', muestras, franja });
    return { url, tiempos: { cubo: Math.round(t1 - t0), reproyeccion: Math.round(performance.now() - t1) } };
  }

  function liberar() {
    for (const rt of Object.values(cubos)) rt.dispose();
    for (const m of [...Object.values(materialesPase), ...materialesId.values()]) m.dispose();
  }

  return { pase, vistaPlana, renderCubo, reproyectar, liberar, CLASES };
}
