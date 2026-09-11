/* ═══════════════════════════════════════════════════════════════════════════
   edificio.js — Carga y estado de un edificio (modelo v6 de SketchUp).

   Un edificio son cuatro cosas en el mismo grupo: la envolvente completa
   (assets/serenea/apolo_envolvente.glb: muros, forjados, carpinterías,
   escaleras, pilares y un vidrio por hueco), el mobiliario y las cuatro
   variantes ya cortadas por planta (que llegan en segundo plano con
   `cargarSecundarios`), los PRISMAS translúcidos de vivienda que salen del
   contorno exacto de data/viviendas_serenea.json (invisibles en reposo; solo
   realce de hover y selección, y lo único que ve el raycaster) y las
   cartelas de cada vivienda (capa 1).

   Decisiones donde el contrato deja hueco (documentadas aquí):

   · Firma: `cargarEdificio(ctx, slot, opciones)`. El tercer parámetro puede
     ser directamente el objeto `luz` (si trae `aplicarMaterial`) o un objeto
     de opciones `{ luz, unitsById, estados, rutas, onProgreso }`. Con `luz`,
     todos los materiales se registran en `luz.aplicarMaterial`.
   · Materiales por NOMBRE, compartidos entre ficheros: cada GLB trae sus
     propias instancias de material y sus propias texturas. El primer fichero
     que trae un nombre fija el material del visor; los siguientes (variantes
     cortadas, mobiliario) adoptan ese mismo material y liberan sus texturas.
     Así hay un solo programa por material, el emisivo de las ventanas y la
     atenuación de cortes.js llegan a las variantes sin hacer nada, y la GPU
     no guarda cinco copias de la ortofoto del monocapa. El monocapa y el
     travertino conservan las texturas del SketchUp; 'APOLO | Vidrio claro'
     se sustituye por el vidrio físico del visor (Fresnel, clearcoat, tinte
     de flotado). El alphaTest que GLTFLoader pone a los materiales MASK se
     quita: las texturas son opacas y el `discard` mata el early-z.
   · Prismas de vivienda (data/viviendas_serenea.json, RUTAS.viviendas): por
     vivienda, `poligono` es el contorno exacto en planta [[x, z], …] en
     metros del SketchUp, deducido de tabiques y puertas del v6 y numerado
     con los planos comerciales; `y0` es la cota real del suelo e `y1` =
     min(y0 + 2,7, corte − 0,15). El prisma es una THREE.Shape con el
     polígono (en (x, −z), para que al girar −90° en X la extrusión vaya en
     +Y y z conserve el signo) extruida y1 − y0 sin bisel, y la geometría se
     hornea en coordenadas de mundo (rotateX + translate): el mesh queda con
     matriz identidad y su caja se puede contrastar con el polígono
     (`edificio.comprobarPrismas()`, usado en las pruebas). Bien encajados:
     el contorno ya está en la cara del tabique, sin holgura ni caja. Nota:
     en p1/p2/ático el corte del cliente está solo 1,3-1,4 m sobre el suelo
     (altura de sección arquitectónica), así que los prismas miden ≈ 1,2 m;
     en baja, 1,8-2,5 m. La caja del registro (`caja`) es la huella del
     polígono × [y0, y0 + 2,7], para encuadrar la cámara.
   · Cartela en el centroide del polígono (área con signo; si cae fuera, el
     punto interior más cercano al centro de la caja) a y1 + 1,2 m. Tamaño
     CONSTANTE en pantalla (`sizeAttenuation: false`, CARTELA_PX de alto para
     un lienzo de 720 px; escala con la altura del lienzo): con 3,2 m de
     ancho en mundo, desde el encuadre de planta (cámara a ~150 m) el número
     medía 26×12 px y no se leía; y en la vivienda enfocada (cámara a 10 m)
     tapaba media pantalla. La escala se calcula con el fov de la cámara.
   · Cajas de encuadre (`caja`) que se solapan: las viviendas en L o en U
     (426/427 y 405/407 del ático, 4,7 y 2,1 m² de caja común) comparten
     caja sin compartir superficie (solape real de polígonos: 0 m²,
     rasterizado a 5 cm). No es un defecto: el picking y el realce van por
     el mesh del polígono, y la caja solo sirve para encuadrar la cámara.
   · Vidrio por vivienda: el pipeline trae un vidrio por hueco con el centro
     en el nombre (`vidrio__T<plataforma>__<n>__<xcm>_<ycm>_<zcm>`). Se asigna
     POR POLÍGONO, no por caja: cada vidrio va a la vivienda cuya huella
     queda a ≤ 0,45 m de su centro (dentro, o cerca del borde: los vidrios
     están en el plano de fachada) y cuyo suelo cumple y ∈ [y0 − 0,5,
     y0 + 3,2]; si hay varias, la más cercana. Recibe el clon de vidrio de
     esa vivienda (emisivo cálido que `setVentanas` enciende o apaga). Las
     variantes cortadas traen las mismas mallas con el mismo nombre, así que
     el mismo registro por nombre les asigna el mismo material. Lo que no
     cae en ninguna huella (portales, zonas comunes) queda con el vidrio
     común, que no se enciende nunca. `edificio.vidrio` guarda el recuento
     (total, asignados, comunes, viviendasConVidrio, sinVidrio).
   · Normales nulas: los GLB del v6 traen decenas de miles de vértices con
     normal (0,0,0) (29 k en la envolvente, 11 k en el mobiliario, 13 k en
     cada variante: caras degeneradas del SketchUp). `normalize()` de un
     vector nulo es NaN, y un solo píxel NaN se extiende con el bloom a todo
     el fotograma (pantalla negra en planta, manchas negras en vivienda:
     medido con un render a Float32). `adoptar` sanea cada geometría al
     cargarla, como hace main.js con el entorno: normal nula o no finita →
     (0, 1, 0). El recuento queda en `edificio.saneado.normalesNulas`.
   · `Material.clone()` copia `userData` pasándolo por JSON; los clones de
     vidrio reciben un userData nuevo con `baseOpacity`, `baseEnv`,
     `baseColor` y `unitId` correctos.
   · `pintar` sigue paintUnits (prisma invisible en reposo, realce al pasar
     el ratón o seleccionar; vendidas inertes) SIN prueba de profundidad: el
     prisma está dentro de los tabiques. En reposo es `visible = false`, no
     solo opacidad 0: las pasadas de post.js con `scene.overrideMaterial`
     (G-buffer de GTAO, profundidad de SSR y Bokeh) ignoran la opacidad y
     verían 166 prismas sólidos. El Raycaster de three no filtra por
     `visible`, así que `pickables` sigue funcionando.
     Las cartelas se muestran por planta con `setCartelas(clave | null)`.
   · `niveles` tiene un único nivel ('apolo') con todas las mallas de la
     envolvente completa: cortes.js lo consume para la transición por planos
     y para registrar los materiales; las plantas ya no son mallas aparte.
   · `cargarSecundarios({ onProgreso, alMobiliario, alVariante })` descarga en
     serie el mobiliario y las cuatro variantes, adopta los materiales,
     cuelga cada objeto del grupo (variantes ocultas) y avisa por callback
     para que main las registre en cortes.js.
   · Extras: `edificio.suelos` (cota mínima de suelo por planta y
     plataforma, para que cortes.js atenúe solo lo que queda bajo el suelo
     de la planta activa), `edificio.units` / `unitsById`, `estadoDe(id)`,
     `edificio.caja` (Box3 de la envolvente), `edificio.ventanas`,
     `edificio.definicionCortes` (data/cortes.json ya cargado),
     `edificio.materiales` (Map nombre → material), `edificio.variantes`
     (Map clave → Object3D), `edificio.mobiliario` y `edificio.destruir()`.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { limitarMaterial } from 'app/visor/texturas.js';
import { ajustarMaterial } from 'app/visor/materiales.js';
import { ESTADO_COLORS } from 'app/building.js';

export const DISTANCIA_VIDRIO = 0.45;    // m del centro del vidrio a la huella de la vivienda (ver cabecera)
export const RANGO_Y_VIDRIO = [-0.5, 3.2]; // y del vidrio respecto al suelo de la vivienda
export const ALTURA_VIVIENDA = 2.7;      // m; alto de la caja de encuadre
export const ALTURA_CARTELA = 1.2;       // m sobre y1
/* Estor bajado de las vendidas (ver setVentanas): cuánto se oscurece el
   vidrio, cuánto reflejo pierde y cuánto se cierra. */
export const ESTOR = { color: 0.35, reflejo: 0.25, opacidad: 0.3 };
/* Vendida: la vivienda se apaga de verdad. El prisma no pinta un velo gris
   encima —eso se veía como una caja negra semitransparente en cuanto la
   cámara bajaba— sino que MULTIPLICA lo que hay detrás por LUZ_VENDIDA, así
   que a esa vivienda solo le entra ese tanto por uno de la luz que le entra a
   una disponible: persianas bajadas y luces apagadas, sin caja. Se dibuja
   solo la cara de entrada (FrontSide), que en un prisma convexo visto desde
   fuera es una y solo una por píxel: si no, cada cara volvería a multiplicar
   y la vivienda quedaría negra. El color va en espacio lineal a propósito:
   es un factor de luz, no un color de pintura. */
/* Factor LINEAL, antes del mapeo de tonos: no es el tanto por uno que se ve
   en pantalla. Con 0,3 la vivienda apenas se oscurecía, porque la curva de
   tono comprime las luces altas y se comía el efecto (medido: la pantalla
   solo bajaba a un 75 %). Con 0,1 la pantalla baja a un 56 %, que es lo que
   se lee como "solo entra un tercio de la luz": se ven los muebles, pero la
   vivienda está claramente apagada, y nunca sale negra. */
export const LUZ_VENDIDA = 0.1;
/* De noche la escena ya está oscura de por sí y el factor cae en el pie de la
   curva de tono, donde resta el doble: con 0,55 la vendida salía negra plana.
   0,82 con un pelo de tinte frío (a una vivienda apagada solo le entra luna)
   basta, porque el contraste no lo pone ella sino la encendida de al lado:
   2,35 contra 0,82 es más de paso y medio, que se lee de inmediato. */
export const LUZ_VENDIDA_NOCHE = [0.80, 0.84, 0.95];
/* Y al revés: de noche, la vivienda LIBRE o RESERVADA se enciende. El mismo
   prisma multiplicativo, pero con un factor mayor que uno y cálido, así que
   el interior sube de luz y se tiñe de bombilla. Es un solo dibujo por
   vivienda y no hace falta ninguna luz de verdad en la escena: cien luces
   puntuales no las mueve ningún teléfono. */
/* Subido a petición del cliente: en la planta seccionada de noche la vendida
   estaba bien pero la libre se quedaba corta y no se leía que estuviera
   habitada. Se sube AQUÍ y no en el ambiente de la escena a propósito: este
   prisma es por vivienda, así que la vendida —que es la que el cliente da por
   buena— no se entera, y no hay que compensar nada. El vidrio no entra: se
   dibuja antes y con profundidad, así que el prisma no lo multiplica y la
   ventana no gana ni un punto de destello. */
export const LUZ_ENCENDIDA = [2.35, 2.02, 1.55];
/* Al atardecer la vivienda libre también se enciende, pero de lejos: fuera
   todavía hay luz y una bombilla a tope de día se ve falsa. Lo justo para que
   el interior deje de ser una cueva. */
export const LUZ_ENCENDIDA_ATARDECER = [1.45, 1.30, 1.14];
export const CARTELA_PX = 34;            // alto del sprite de la cartela en px para un lienzo de 720 px (ver cabecera)
export const EMISIVO_VENTANA = 0xffd9a0; // luz cálida de interior
export const INTENSIDAD_VENTANA = 1.4;   // por encima de 1 para que el bloom lo recoja

export const RUTAS = {
  envolvente: 'assets/serenea/apolo_envolvente.glb',
  mobiliario: 'assets/serenea/apolo_mobiliario.glb',
  cortes: 'data/cortes.json',
  viviendas: 'data/viviendas_serenea.json',
  variantes: {
    baja: 'assets/serenea/apolo_corte_baja.glb',
    p1: 'assets/serenea/apolo_corte_p1.glb',
    p2: 'assets/serenea/apolo_corte_p2.glb',
    atico: 'assets/serenea/apolo_corte_atico.glb',
  },
};

const COLOR_BASE_VIVIENDA = new THREE.Color(0xe9e7e1);
/* Un material por estado, compartido por las 166 viviendas: son idénticos,
   y así hay un programa en vez de ciento sesenta y seis. El color va en
   espacio lineal a propósito: es un factor de luz, no un color de pintura, y
   por encima de uno enciende en vez de apagar (el destino es medio flotante,
   así que admite valores mayores que uno sin recortar). */
const materialesLuz = new Map();
function materialLuz(nombre, r, g, b) {
  let m = materialesLuz.get(nombre);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, depthWrite: false, depthTest: true, premultipliedAlpha: true,
    side: THREE.FrontSide, blending: THREE.MultiplyBlending, toneMapped: false, fog: false,
  });
  m.color.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  m.name = nombre;
  materialesLuz.set(nombre, m);
  return m;
}
const matApagada = (noche) => (noche
  ? materialLuz('vivienda_apagada_noche', ...LUZ_VENDIDA_NOCHE)
  : materialLuz('vivienda_apagada', LUZ_VENDIDA, LUZ_VENDIDA, LUZ_VENDIDA));
const matEncendida = (nivel) => (nivel >= 2
  ? materialLuz('vivienda_encendida', ...LUZ_ENCENDIDA)
  : materialLuz('vivienda_encendida_atardecer', ...LUZ_ENCENDIDA_ATARDECER));
const ORDEN_PLANTAS = ['baja', 'p1', 'p2', 'atico'];
const RE_VIDRIO = /^vidrio__T(\d+)__(\d+)__(-?\d+)_(-?\d+)_(-?\d+)$/;
const ES_MATERIAL_VIDRIO = /vidrio/i;

/* Un solo cargador para todo el módulo: el decodificador meshopt se
   inicializa una vez. */
let cargador = null;
function cargadorGLB() {
  if (!cargador) cargador = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return cargador;
}
function cargarGLB(url, onProgreso) {
  return new Promise((ok, ko) => cargadorGLB().load(url, ok, (xhr) => {
    if (onProgreso && xhr.lengthComputable && xhr.total > 0) onProgreso(xhr.loaded / xhr.total);
  }, ko));
}

/* Vidrio de verdad (app/building.js): reflejo con Fresnel del entorno y una
   capa especular encima; el tinte verdoso es el del vidrio flotado real. */
export function crearVidrioFisico() {
  /* El tinte del vidrio sube de 0x2c3b3e a 0x3f5054 y la opacidad de 0,42 a
     0,52: en un material transparente three multiplica TODO el sombreado por el
     alfa, reflejo incluido, así que un vidrio muy transparente y muy oscuro no
     refleja el cielo, solo deja ver lo que tiene detrás. Con el paño de fondo
     en penumbra, el resultado era un paño NEGRO. Más cuerpo y más reflejo: el
     vidrio se lee como vidrio. */
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x3f5054, roughness: 0.045, metalness: 0, transparent: true,
    opacity: 0.52, envMapIntensity: 3.0, side: THREE.DoubleSide,
    clearcoat: 1, clearcoatRoughness: 0.02,
    ior: 1.52, reflectivity: 0.62, specularIntensity: 1,
    emissive: EMISIVO_VENTANA, emissiveIntensity: 0,
  });
  m.userData = { baseOpacity: m.opacity, baseEnv: m.envMapIntensity, baseColor: m.color.clone(), sinTraseras: true };
  return m;
}

/* Cartela de vivienda (copia de makeLabelSprite de app/building.js): caja con
   rabito y el número en blanco, fuera del tone mapping y en la capa 1.
   Tamaño constante en pantalla (ver cabecera): con sizeAttenuation=false el
   sprite mide `escala / tan(fov/2)` del alto del lienzo (en NDC, sobre 2),
   así que CARTELA_PX px a 720 px son escalaY = CARTELA_PX/720 · 2 · tan(fov/2). */
function crearCartela(texto, fondo, capa, fovGrados = 45) {
  /* Píldora con esquinas redondeadas y rabito corto, del tamaño de un botón
     del menú: la cartela de antes (caja recta, 42 px en negrita) pesaba
     demasiado sobre el modelo y tapaba la vivienda de al lado. */
  /* El lienzo se dibuja a escala reducida pero con las MISMAS coordenadas:
     `scale` se encarga. Son 332 cartelas (dos por vivienda) y a 224×128 eran
     38 MB de lienzos retenidos; a 0,7 son 19. En pantalla la cartela mide unos
     40 px de alto, así que 90 texels siguen sobrando. */
  const K = 0.7;
  const cv = document.createElement('canvas');
  cv.width = Math.round(224 * K); cv.height = Math.round(128 * K);
  const c2 = cv.getContext('2d');
  c2.scale(K, K);
  const x0 = 56, y0 = 26, x1 = 168, y1 = 88, r = 16, rabo = 10;
  c2.shadowColor = 'rgba(17,17,18,0.28)';
  c2.shadowBlur = 8;
  c2.shadowOffsetY = 3;
  c2.fillStyle = fondo;
  c2.beginPath();
  c2.moveTo(x0 + r, y0);
  c2.lineTo(x1 - r, y0); c2.quadraticCurveTo(x1, y0, x1, y0 + r);
  c2.lineTo(x1, y1 - r); c2.quadraticCurveTo(x1, y1, x1 - r, y1);
  c2.lineTo(112 + rabo, y1); c2.lineTo(112, y1 + rabo); c2.lineTo(112 - rabo, y1);
  c2.lineTo(x0 + r, y1); c2.quadraticCurveTo(x0, y1, x0, y1 - r);
  c2.lineTo(x0, y0 + r); c2.quadraticCurveTo(x0, y0, x0 + r, y0);
  c2.closePath();
  c2.fill();
  c2.shadowColor = 'transparent';
  c2.fillStyle = '#ffffff';
  c2.font = '600 34px "Open Sans", "Segoe UI", sans-serif';
  c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillText(texto, 112, 58);
  const tex = new THREE.CanvasTexture(cv);
  /* Sin anisotropía ni mipmaps: la cartela tiene tamaño constante en pantalla
     (sizeAttenuation false), así que la pirámide de mipmaps solo era memoria.
     Son 332 lienzos, dos por vivienda. */
  tex.anisotropy = 1;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false, sizeAttenuation: false });
  const sp = new THREE.Sprite(mat);
  const escalaY = (CARTELA_PX / 720) * 2 * Math.tan(THREE.MathUtils.degToRad(fovGrados) / 2);
  sp.scale.set(escalaY * cv.width / cv.height, escalaY, 1);
  sp.layers.set(capa);
  return sp;
}

/* ── Geometría en planta ─────────────────────────────────────────────────── */

/* Polígono sin vértices repetidos consecutivos (el último igual al primero
   también sobra): earcut los tolera, pero la distancia a segmentos no. */
function limpiarPoligono(poligono) {
  const out = [];
  for (const [x, z] of poligono) {
    const u = out[out.length - 1];
    if (u && Math.abs(u[0] - x) < 1e-6 && Math.abs(u[1] - z) < 1e-6) continue;
    out.push([x, z]);
  }
  if (out.length > 1) {
    const [x0, z0] = out[0], [xn, zn] = out[out.length - 1];
    if (Math.abs(x0 - xn) < 1e-6 && Math.abs(z0 - zn) < 1e-6) out.pop();
  }
  return out;
}

export function dentroDePoligono(poligono, x, z) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, zi] = poligono[i], [xj, zj] = poligono[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dentro = !dentro;
  }
  return dentro;
}

/* Distancia de un punto a la huella: 0 dentro; fuera, la mínima a sus lados. */
export function distanciaAPoligono(poligono, x, z) {
  if (dentroDePoligono(poligono, x, z)) return 0;
  let mejor = Infinity;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [ax, az] = poligono[j], [bx, bz] = poligono[i];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const px = ax + t * dx - x, pz = az + t * dz - z;
    mejor = Math.min(mejor, px * px + pz * pz);
  }
  return Math.sqrt(mejor);
}

/* Centroide por área con signo; si cae fuera (viviendas en L o en U), el
   punto interior más cercano al centro de la caja, buscado en una rejilla de
   0,25 m. */
export function centroideInterior(poligono) {
  let area = 0, cx = 0, cz = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, zi] = poligono[i], [xj, zj] = poligono[j];
    const f = xj * zi - xi * zj;
    area += f; cx += (xj + xi) * f; cz += (zj + zi) * f;
    minX = Math.min(minX, xi); maxX = Math.max(maxX, xi); minZ = Math.min(minZ, zi); maxZ = Math.max(maxZ, zi);
  }
  const centroCaja = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  if (Math.abs(area) > 1e-9) {
    cx /= 3 * area; cz /= 3 * area;
    if (dentroDePoligono(poligono, cx, cz)) return { punto: [cx, cz], area: Math.abs(area) / 2, exterior: false };
  }
  const paso = 0.25;
  let mejor = null, dMejor = Infinity;
  for (let x = minX + paso / 2; x < maxX; x += paso) for (let z = minZ + paso / 2; z < maxZ; z += paso) {
    if (!dentroDePoligono(poligono, x, z)) continue;
    const d = (x - centroCaja[0]) ** 2 + (z - centroCaja[1]) ** 2;
    if (d < dMejor) { dMejor = d; mejor = [x, z]; }
  }
  return { punto: mejor || centroCaja, area: Math.abs(area) / 2, exterior: true };
}

/* Prisma de una vivienda en coordenadas de mundo: la Shape va en (x, −z)
   porque rotateX(−90°) manda (x, s, d) a (x, d, −s); la extrusión (0…y1−y0)
   pasa a +Y y se sube a y0. */
export function geometriaPrisma(poligono, y0, y1) {
  const forma = new THREE.Shape();
  poligono.forEach(([x, z], i) => (i ? forma.lineTo(x, -z) : forma.moveTo(x, -z)));
  forma.closePath();
  const geo = new THREE.ExtrudeGeometry(forma, { depth: Math.max(0.05, y1 - y0), bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  geo.computeBoundingBox();
  return geo;
}

/* Prismas translúcidos y cartelas de todas las viviendas a partir de
   data/viviendas_serenea.json (ver cabecera). Devuelve Map(id → registro),
   los grupos por planta y la cota mínima de suelo por planta y plataforma. */
function crearPrismas(grupo, unitsById, capaCartelas, datosViviendas, fovCamara = 45) {
  const viviendas = new Map();
  const plantas = new Map();
  const suelos = {};
  const entradas = Object.entries(datosViviendas?.viviendas || {});
  const claves = [...new Set([...ORDEN_PLANTAS, ...entradas.map(([, v]) => v.planta)])];
  for (const clave of claves) {
    const g = new THREE.Group();
    g.name = `viviendas-${clave}`;
    const cartelas = new THREE.Group();
    cartelas.name = 'cartelas';
    cartelas.visible = false;
    g.add(cartelas);
    grupo.add(g);
    plantas.set(clave, { grupo: g, cartelas });
    suelos[clave] = [];
  }
  for (const [id, d] of entradas) {
    const poligono = limpiarPoligono(d.poligono || []);
    if (poligono.length < 3) { console.warn('[edificio] vivienda sin contorno válido:', id); continue; }
    const plataforma = d.plataforma ?? 0;
    const { y0, y1 } = d;
    const P = plantas.get(d.planta);
    const s = suelos[d.planta];
    s[plataforma] = s[plataforma] == null ? y0 : Math.min(s[plataforma], y0);
    const geo = geometriaPrisma(poligono, y0, y1);
    const mat = new THREE.MeshStandardMaterial({
      color: COLOR_BASE_VIVIENDA.clone(), roughness: 0.55, metalness: 0,
      emissive: 0x000000, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `vivienda-${id}`;
    mesh.userData = { unitId: id, floorKey: d.planta, plataforma, matRealce: mat };
    mesh.renderOrder = 50; // tras el vidrio: el realce se ve a través de la fachada
    P.grupo.add(mesh);
    const { punto: centroide, exterior } = centroideInterior(poligono);
    const label = crearCartela(id, '#24873f', capaCartelas, fovCamara);
    label.position.set(centroide[0], y1 + ALTURA_CARTELA, centroide[1]);
    const labelR = crearCartela(id, '#e0862b', capaCartelas, fovCamara);
    labelR.position.copy(label.position);
    label.visible = false; labelR.visible = false;
    P.cartelas.add(label, labelR);
    mesh.userData.label = label;
    mesh.userData.labelR = labelR;
    const bb = geo.boundingBox;
    const caja = new THREE.Box3(new THREE.Vector3(bb.min.x, y0, bb.min.z), new THREE.Vector3(bb.max.x, y0 + ALTURA_VIVIENDA, bb.max.z));
    viviendas.set(id, { id, mesh, floorKey: d.planta, plataforma, unidad: unitsById.get(id) || null, caja, poligono, y0, y1,
      entrada: d.entrada || null, centroide, centroideExterior: exterior, area: d.area, supViv: d.supViv, supUtil: d.supUtil,
      vidrios: [], vidrio: null, mallasVidrio: [], label, labelR });
  }
  return { viviendas, plantas, suelos };
}

/* Box3 de las mallas visibles de un objeto (Box3.setFromObject no distingue
   nodos ocultos). */
function cajaVisible(objeto) {
  const caja = new THREE.Box3();
  objeto.updateMatrixWorld(true);
  objeto.traverseVisible((o) => { if (o.isMesh) caja.expandByObject(o); });
  return caja;
}

export async function cargarEdificio(ctx, slot, opciones = {}) {
  const luz = typeof opciones.aplicarMaterial === 'function' ? opciones : (opciones.luz || null);
  /* Techo de textura: ver texturas.js. Se aplica al registrar cada material,
     antes de que la malla llegue a dibujarse, así que la imagen grande no
     sube nunca a la tarjeta. */
  const texturaMax = opciones.texturaMax || 0;
  const rutas = { ...RUTAS, ...(slot.modelo || {}), ...(opciones.rutas || {}) };
  const onProgreso = opciones.onProgreso || (() => {});
  const { scene } = ctx;
  const capaCartelas = ctx.capas?.cartelas ?? 1;

  const grupo = new THREE.Group();
  grupo.name = slot.id;
  scene.add(grupo);

  /* ── Datos y modelo, en paralelo ── */
  const cargarJSON = async (url, tolerante) => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return await r.json();
    } catch (e) {
      if (!tolerante) throw e;
      console.warn('[edificio] sin disponibilidad, todo cuenta como disponible:', e.message);
      return {};
    }
  };
  const [units, disponibilidad, definicionCortes, datosViviendas, gltf] = await Promise.all([
    opciones.unitsById ? null : cargarJSON(slot.units || 'data/units.json', false),
    opciones.estados ? null : cargarJSON(slot.availability || 'data/availability.json', true),
    opciones.definicionCortes || cargarJSON(rutas.cortes, false),
    opciones.viviendas || cargarJSON(rutas.viviendas, false),
    cargarGLB(rutas.envolvente, onProgreso),
  ]);
  onProgreso(1);
  const unitsById = opciones.unitsById || new Map(units.map((u) => [u.id, u]));
  const listaUnits = units || [...unitsById.values()];
  const estados = Object.assign({}, opciones.estados || disponibilidad || {});

  /* ── Registro de materiales por nombre (ver cabecera) ── */
  const materiales = new Map();          // nombre → material del visor
  const vidrioPorMalla = new Map();      // nombre de malla de vidrio → material de su vivienda
  const texturasDe = (m) => [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap, m.alphaMap].filter(Boolean);
  function materialDe(m) {
    const nombre = m.name || 'sin_nombre';
    let r = materiales.get(nombre);
    if (r) {
      if (r !== m) { for (const t of texturasDe(m)) if (!texturasDe(r).includes(t)) t.dispose(); m.dispose(); }
      return r;
    }
    if (ES_MATERIAL_VIDRIO.test(nombre)) {
      r = crearVidrioFisico();
      m.dispose();
    } else {
      r = m;
      limitarMaterial(r, texturaMax);
      r.alphaTest = 0;
      if (!(r.transparent && r.opacity < 1)) { r.transparent = false; r.depthWrite = true; }
      r.side = THREE.FrontSide; // cortes.js lo pasa a doble cara con las traseras oscuras
      r.envMapIntensity = 1;
      r.userData = { baseOpacity: r.opacity, baseEnv: 1, baseColor: r.color.clone() };
      /* Al final, para que ni el envMapIntensity ni el baseColor de arriba
         pisen el ajuste (ver materiales.js). */
      ajustarMaterial(r);
    }
    r.name = nombre;
    if (luz) luz.aplicarMaterial(r);
    materiales.set(nombre, r);
    return r;
  }
  /* Normales nulas o no finitas → (0, 1, 0) (ver cabecera). Las normales
     del GLB vienen normalizadas en Int8; setXYZ codifica de vuelta. */
  const saneado = { normalesNulas: 0, geometrias: 0 };
  const geometriasSaneadas = new WeakSet();
  function sanearNormales(geometria) {
    if (geometriasSaneadas.has(geometria)) return;
    geometriasSaneadas.add(geometria);
    saneado.geometrias++;
    const nor = geometria.getAttribute('normal');
    if (!nor) { geometria.computeVertexNormals(); return; }
    let nulas = 0;
    for (let i = 0; i < nor.count; i++) {
      const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i);
      if (!Number.isFinite(x + y + z) || x * x + y * y + z * z < 1e-4) { nor.setXYZ(i, 0, 1, 0); nulas++; }
    }
    if (nulas) { nor.needsUpdate = true; saneado.normalesNulas += nulas; }
  }
  /* Da a todas las mallas de un objeto los materiales del registro (y a los
     vidrios ya asignados, el de su vivienda) y las banderas del visor. */
  function adoptar(raiz, { mobiliario = false } = {}) {
    const mallas = [];
    raiz.traverse((o) => {
      if (!o.isMesh) return;
      mallas.push(o);
      sanearNormales(o.geometry);
      const deVivienda = vidrioPorMalla.get(o.name);
      if (deVivienda) o.material = deVivienda;
      else if (Array.isArray(o.material)) o.material = o.material.map(materialDe);
      else o.material = materialDe(o.material);
      const esVidrio = ES_MATERIAL_VIDRIO.test(o.material.name) || !!deVivienda;
      /* El mobiliario no proyecta sombra: son 1.400 mallas que había que
         volver a dibujar en cada cascada del mapa de sombras, y sus sombras,
         dentro de una vivienda vista desde arriba, no se distinguen. Es el
         cambio que más alivia al teléfono sin tocar el aspecto. */
      o.castShadow = !esVidrio && !mobiliario;
      o.receiveShadow = true;
      o.raycast = () => {}; // el picking va solo por las envolventes de vivienda
      o.userData.mobiliario = mobiliario;
    });
    return mallas;
  }

  const envolvente = gltf.scene;
  envolvente.name = 'envolvente';
  const mallasEnvolvente = adoptar(envolvente);
  grupo.add(envolvente);

  /* ── Prismas y cartelas ── */
  const { viviendas, plantas, suelos } = crearPrismas(grupo, unitsById, capaCartelas, datosViviendas, ctx.camera?.fov ?? 45);
  scene.updateMatrixWorld(true);

  /* ── Vidrio por vivienda: el centro del nombre contra las huellas ── */
  const vidrioBase = [...materiales.values()].find((m) => ES_MATERIAL_VIDRIO.test(m.name)) || null;
  const vidrio = { total: 0, asignados: 0, comunes: 0, viviendasConVidrio: 0, sinVidrio: [], ms: 0 };
  const tVidrio = performance.now();
  const candidatas = [...viviendas.values()];
  for (const m of mallasEnvolvente) {
    const r = RE_VIDRIO.exec(m.name);
    if (!r) continue;
    vidrio.total++;
    const x = +r[3] / 100, y = +r[4] / 100, z = +r[5] / 100;
    let mejor = null, dMejor = Infinity;
    for (const v of candidatas) {
      if (y < v.y0 + RANGO_Y_VIDRIO[0] || y > v.y0 + RANGO_Y_VIDRIO[1]) continue;
      // criba barata por caja ampliada antes de la distancia exacta
      if (x < v.caja.min.x - DISTANCIA_VIDRIO || x > v.caja.max.x + DISTANCIA_VIDRIO || z < v.caja.min.z - DISTANCIA_VIDRIO || z > v.caja.max.z + DISTANCIA_VIDRIO) continue;
      const d = distanciaAPoligono(v.poligono, x, z);
      if (d <= DISTANCIA_VIDRIO && d < dMejor) { dMejor = d; mejor = v; }
    }
    if (!mejor) { vidrio.comunes++; continue; }
    if (!mejor.vidrio) {
      const mat = vidrioBase ? vidrioBase.clone() : crearVidrioFisico();
      mat.name = `vidrio-${mejor.id}`;
      mat.emissive.setHex(EMISIVO_VENTANA);
      mat.emissiveIntensity = 0;
      mat.userData = { baseOpacity: mat.opacity, baseEnv: mat.envMapIntensity, baseColor: mat.color.clone(), unitId: mejor.id, sinTraseras: true };
      if (luz) luz.aplicarMaterial(mat);
      mejor.vidrio = mat;
      mejor.vidrios.push(mat);
      vidrio.viviendasConVidrio++;
    }
    m.material = mejor.vidrio;
    mejor.mallasVidrio.push(m);
    vidrioPorMalla.set(m.name, mejor.vidrio);
    vidrio.asignados++;
  }
  vidrio.sinVidrio = candidatas.filter((v) => !v.vidrios.length).map((v) => v.id);
  if (vidrio.sinVidrio.length) console.warn('[edificio] viviendas sin vidrio asignado:', vidrio.sinVidrio.join(' '));
  vidrio.ms = Math.round(performance.now() - tVidrio);

  /* ── Registro en luz: envolventes de vivienda (los materiales del modelo
     ya pasaron por materialDe) ── */
  if (luz) for (const v of viviendas.values()) luz.aplicarMaterial(v.mesh.material);

  /* ── Nivel único para cortes.js ── */
  const matsNivel = () => [...new Set([...materiales.values(), ...[...viviendas.values()].map((v) => v.vidrio).filter(Boolean)])];
  const nivel = { holders: [], mats: matsNivel(), byCat: { glass: vidrioBase }, meshes: mallasEnvolvente };
  const niveles = new Map([['apolo', nivel]]);

  const pickables = [...viviendas.values()].map((v) => v.mesh);
  let ultimo = { hover: null, seleccionada: null, atenuada: null };
  let cartelasDe = null;
  let luces = 0;                   // 0 de día · 1 al atardecer · 2 de noche
  /* Vivienda "abierta": ya se ha entrado a verla por dentro, así que no lleva
     ni prisma ni cartela; estorbarían justo lo que se ha ido a ver. */
  let abierta = null;

  const edificio = {
    grupo, envolvente, niveles, viviendas, estados, pickables, vidrio, units: listaUnits, unitsById,
    materiales, definicionCortes, rutas, suelos, datosViviendas, saneado,
    variantes: new Map(),
    mobiliario: null,
    ventanas: false,
    caja: cajaVisible(envolvente),
    estadoDe: (id) => estados[id] || 'disponible',
    cajaDe: (id) => viviendas.get(id)?.caja ?? null,

    /* Contraste de cada prisma con su polígono: caja del mesh (en mundo)
       frente a los min/max del polígono y a [y0, y1]. Devuelve el mayor
       desvío en metros y las viviendas que superan `tolerancia`. */
    comprobarPrismas(tolerancia = 0.01) {
      let maxDesvio = 0;
      const malas = [];
      const caja = new THREE.Box3();
      for (const v of viviendas.values()) {
        caja.setFromObject(v.mesh);
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const [x, z] of v.poligono) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
        const d = Math.max(Math.abs(caja.min.x - minX), Math.abs(caja.max.x - maxX), Math.abs(caja.min.z - minZ), Math.abs(caja.max.z - maxZ),
          Math.abs(caja.min.y - v.y0), Math.abs(caja.max.y - v.y1));
        maxDesvio = Math.max(maxDesvio, d);
        if (d > tolerancia) malas.push({ id: v.id, desvio: +d.toFixed(3) });
      }
      return { viviendas: viviendas.size, maxDesvio: +maxDesvio.toFixed(4), malas };
    },

    setEstados(mapa) {
      for (const k of Object.keys(estados)) delete estados[k];
      Object.assign(estados, mapa || {});
      edificio.setVentanas(edificio.ventanas);
      edificio.pintar(ultimo);
    },

    /* Enciende el interior de disponibles y reservadas; una vendida es de
       alguien y su ventana no cuenta la historia comercial. Además, la
       vendida baja el estor: su vidrio se oscurece y pierde reflejo, de modo
       que se lee como ocupada y no como un fallo del visor (antes solo se
       distinguía por no tener cartela, y parecía que no se podía pinchar). */
    /* `factor` es cuánto se encienden las ventanas: 0 apagadas, 1 la luz de
       atardecer, 2,4 la de noche. Antes era un booleano y la ventana nocturna
       se quedaba en 0,43 de luminancia, por debajo del umbral del bloom: un
       cristal encendido y uno apagado se distinguían apenas. De noche además
       se CIERRA el cristal (más opaco, más rugoso, menos reflejo) para que se
       lea como una ventana con luz dentro y no como un agujero. */
    setVentanas(factor) {
      const f = factor === true ? 1 : (factor === false ? 0 : (+factor || 0));
      edificio.ventanas = f;
      const cerrado = f > 1.5;   // de noche
      for (const v of viviendas.values()) {
        const vendida = edificio.estadoDe(v.id) === 'vendida';
        const on = f > 0 && !vendida;
        for (const m of v.vidrios) {
          m.emissiveIntensity = on ? INTENSIDAD_VENTANA * f : 0;
          const base = m.userData.baseColor;
          if (base) m.color.copy(base).multiplyScalar(vendida ? ESTOR.color : 1);
          if (m.userData.baseEnv !== undefined) {
            m.envMapIntensity = m.userData.baseEnv * (vendida ? ESTOR.reflejo : (on && cerrado ? 0.3 : 1));
          }
          if (m.userData.baseOpacity !== undefined) {
            const extra = vendida ? ESTOR.opacidad : (on && cerrado ? 0.32 : 0);
            m.opacity = Math.min(1, m.userData.baseOpacity + extra);
          }
          m.roughness = vendida ? 0.35 : (on && cerrado ? 0.12 : 0.05);
        }
      }
    },

    pintar({ hover = null, seleccionada = null, atenuada = null } = {}) {
      ultimo = { hover, seleccionada, atenuada };
      for (const v of viviendas.values()) {
        const estado = edificio.estadoDe(v.id);
        const col = ESTADO_COLORS[estado] || ESTADO_COLORS.disponible;
        const mat = v.mesh.userData.matRealce;
        const vendida = estado === 'vendida';
        const dim = atenuada ? !!atenuada(v.id) : false;
        mat.color.copy(col);
        /* Más ligeros que antes: el verde y el naranja tapaban la vivienda
           que querían señalar. Y la vivienda ya abierta no lleva prisma: se
           ha entrado a verla por dentro. */
        /* Solo la planta que se está mirando lleva prisma de luz. En cenital,
           con las cuatro plantas puestas, los prismas de las de arriba se
           apilaban sobre el de abajo y cada uno volvía a multiplicar: la
           vivienda salía negra. Uno por rayo y ya. */
        const enPlanta = cartelasDe === v.floorKey;
        if (vendida && v.id !== abierta) {
          v.mesh.material = matApagada(luces >= 2);
          v.mesh.visible = enPlanta;
          v.mesh.renderOrder = 20;           // antes que el realce, después de lo opaco
          v.label.visible = false;
          v.labelR.visible = false;
          continue;
        }
        /* De noche y al atardecer, la vivienda libre o reservada se enciende: el
           mismo prisma multiplicativo con un factor mayor que uno y cálido (más
           corto al atardecer, que fuera aún hay luz). El realce del
           ratón NO la apaga (antes le quitaba el prisma y la vivienda se
           apagaba justo al señalarla): ese aviso lo da el vidrio teñido. */
        if (luces > 0 && enPlanta && v.id !== abierta && !dim) {
          v.mesh.material = matEncendida(luces);
          v.mesh.visible = true;
          v.mesh.renderOrder = 20;
          const marcable = !dim && v.id !== abierta;
          v.label.visible = marcable && estado === 'disponible';
          v.labelR.visible = marcable && estado === 'reservada';
          continue;
        }
        v.mesh.material = v.mesh.userData.matRealce;
        mat.depthTest = false;
        v.mesh.renderOrder = 50;
        if (v.id === abierta) {
          mat.opacity = 0;
          mat.emissive.setHex(0x000000);
        } else if (v.id === seleccionada && !vendida && !dim) {
          mat.opacity = 0.26;
          mat.emissive.copy(col).multiplyScalar(0.22);
        } else if (v.id === hover && !vendida && !dim) {
          mat.opacity = 0.18;
          mat.emissive.copy(col).multiplyScalar(0.14);
        } else {
          mat.opacity = 0;
          mat.emissive.setHex(0x000000);
        }
        v.mesh.visible = mat.opacity > 0; // en reposo no se dibuja (ver cabecera: G-buffer del post)
        const marcable = !dim && cartelasDe === v.floorKey && v.id !== abierta;
        v.label.visible = marcable && estado === 'disponible';
        v.labelR.visible = marcable && estado === 'reservada';
      }
    },

    /* Nivel de luces de la escena: 0 de día, 1 al atardecer, 2 de noche.
       Cambia el prisma de luz de cada vivienda —la vendida se apaga (más
       suave de noche, que ya está oscuro) y la libre o reservada se enciende
       con una bombilla tenue al atardecer y plena de noche—. `setNoche` se
       queda como atajo del nivel 2. */
    setLuces(nivel) {
      const n = Math.max(0, Math.min(2, Math.round(+nivel || 0)));
      if (luces === n) return;
      luces = n;
      edificio.pintar(ultimo);
    },
    setNoche(activa) { edificio.setLuces(activa ? 2 : 0); },

    /* La vivienda que se está visitando por dentro (o null). */
    setViviendaAbierta(id) {
      if (abierta === id) return;
      abierta = id;
      edificio.pintar(ultimo);
    },

    /* Cartelas de una planta ('baja' | 'p1' | 'p2' | 'atico') o ninguna. */
    setCartelas(clave) {
      cartelasDe = plantas.has(clave) ? clave : null;
      for (const [k, p] of plantas) p.cartelas.visible = k === cartelasDe;
      edificio.pintar(ultimo);
    },

    /* El SketchUp nombra la plataforma en cada malla (`__T<n>__`) y
       cortes.js la lee de ahí; no hay tramos de SECTIONS que consultar. */
    tramoDe() { return null; },

    /* Mobiliario y variantes cortadas, en serie y en segundo plano (ver
       cabecera). `onProgreso(fraccion, etapa)` va de 0 a 1 sobre los cinco
       ficheros; `alMobiliario(objeto)` y `alVariante(clave, objeto)` avisan
       cuando cada uno está en la escena. */
    /* `plantas`: qué variantes cortadas se descargan ahora. null = todas
       (escritorio); una lista vacía deja solo el mobiliario y las plantas se
       piden luego con `cargarVariante`, que es lo que hace el móvil para no
       tener 35 MB de geometría en la tarjeta desde el primer momento.
       Mientras una variante no está, cortes.js recorta por planos igual. */
    /* Una variante cortada, a petición (ver cargarSecundarios). Devuelve el
       objeto ya colgado del grupo, o null si no se pudo. */
    async cargarVariante(clave, alVariante) {
      if (edificio.variantes.has(clave)) return edificio.variantes.get(clave);
      const url = rutas.variantes[clave];
      if (!url) return null;
      if (edificio._pendientes?.has(clave)) return edificio._pendientes.get(clave);
      edificio._pendientes = edificio._pendientes || new Map();
      const tarea = (async () => {
        try {
          const g = await cargarGLB(url);
          const objeto = g.scene;
          objeto.name = `corte_${clave}`;
          adoptar(objeto);
          objeto.visible = false;
          grupo.add(objeto);
          edificio.variantes.set(clave, objeto);
          nivel.mats = matsNivel();
          (alVariante || edificio._alVariante || (() => {}))(clave, objeto);
          return objeto;
        } catch (e) {
          console.warn(`[edificio] no se pudo cargar ${url}:`, e);
          return null;
        } finally {
          edificio._pendientes.delete(clave);
        }
      })();
      edificio._pendientes.set(clave, tarea);
      return tarea;
    },

    async cargarSecundarios({ onProgreso: avisar = () => {}, alMobiliario = () => {}, alVariante = () => {}, plantas = null, mobiliario = true } = {}) {
      const claves = plantas === null ? Object.keys(rutas.variantes) : plantas.filter((k) => rutas.variantes[k]);
      /* El mobiliario son 1.403 mallas y 16 MB: dentro del edificio cerrado no
         se ve nada de él, así que en el teléfono no se descarga hasta que se
         aísla una planta, que es cuando aparece. */
      edificio._alMobiliario = alMobiliario;
      const tareas = [...(mobiliario ? [{ etapa: 'mobiliario', url: rutas.mobiliario }] : []), ...claves.map((clave) => ({ etapa: `corte_${clave}`, clave, url: rutas.variantes[clave] }))];
      const tiempos = {};
      edificio._alVariante = alVariante;
      for (const [i, t] of tareas.entries()) {
        const t0 = performance.now();
        let g;
        try {
          g = await cargarGLB(t.url, (f) => avisar((i + f) / tareas.length, t.etapa));
        } catch (e) {
          console.warn(`[edificio] no se pudo cargar ${t.url}:`, e);
          avisar((i + 1) / tareas.length, t.etapa);
          continue;
        }
        const objeto = g.scene;
        objeto.name = t.etapa;
        if (t.clave) {
          adoptar(objeto);
          objeto.visible = false;
          grupo.add(objeto);
          edificio.variantes.set(t.clave, objeto);
          alVariante(t.clave, objeto);
        } else {
          adoptar(objeto, { mobiliario: true });
          grupo.add(objeto);
          edificio.mobiliario = objeto;
          alMobiliario(objeto);
        }
        nivel.mats = matsNivel();
        tiempos[t.etapa] = Math.round(performance.now() - t0);
        avisar((i + 1) / tareas.length, t.etapa);
      }
      return tiempos;
    },

    /* Mobiliario a la carta (móvil): se pide la primera vez que hace falta. */
    async cargarMobiliario() {
      if (edificio.mobiliario || edificio._mobEnCurso) return edificio.mobiliario;
      edificio._mobEnCurso = (async () => {
        try {
          const g = await cargarGLB(rutas.mobiliario);
          const objeto = g.scene;
          objeto.name = 'mobiliario';
          adoptar(objeto, { mobiliario: true });
          grupo.add(objeto);
          edificio.mobiliario = objeto;
          nivel.mats = matsNivel();
          edificio._alMobiliario?.(objeto);
          return objeto;
        } catch (e) {
          console.warn('[edificio] no se pudo cargar el mobiliario:', e);
          return null;
        } finally {
          edificio._mobEnCurso = null;
        }
      })();
      return edificio._mobEnCurso;
    },

    /* Saca el edificio de la escena y libera lo que creó (geometrías,
       materiales, texturas). Los materiales quedan registrados en
       luz.materiales si se pasó luz: no hay API para darlos de baja, pero un
       material sin malla no cuesta nada más que la entrada en el Set. */
    destruir() {
      scene.remove(grupo);
      const mats = new Set();
      grupo.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (!m) return;
        for (const x of Array.isArray(m) ? m : [m]) mats.add(x);
      });
      for (const m of mats) { for (const t of texturasDe(m)) t.dispose(); m.dispose(); }
      viviendas.clear();
      pickables.length = 0;
      materiales.clear();
      vidrioPorMalla.clear();
      edificio.variantes.clear();
      edificio.mobiliario = null;
    },
  };
  edificio.pintar(ultimo);
  return edificio;
}
