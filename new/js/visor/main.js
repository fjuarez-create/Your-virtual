/* ═══════════════════════════════════════════════════════════════════════════
   main.js (visor) — Orquestación de los módulos y API pública `window.apolo`.

   Crea el ctx (escena.js), la luz, el post, el trazador, el edificio activo
   de app/promotions.js (modelo de SketchUp de assets/serenea/), los cortes y
   la cámara; carga el entorno y expone en `window.apolo` lo que usa
   new/js/shell.js. Aquí no hay nada de render propio: el bucle solo llama a
   los módulos en el orden del contrato.

   Decisiones donde el contrato deja hueco (documentadas aquí):

   · Carga: primero entorno.glb + apolo_envolvente.glb (primera imagen);
     después, con el evento 'carga' (`secundaria: true`), el mobiliario y las
     cuatro variantes cortadas por edificio.cargarSecundarios, que main
     registra en cortes.js según llegan. Los cielos de los otros momentos se
     hornean 2,5 s después de la primera imagen.
   · Entorno (assets/serenea/entorno.glb, 1.442 mallas sin nombre): se
     fusionan por material en unas 35 mallas Float32 en coordenadas de mundo
     (fusionarEntorno): 1.442 llamadas de dibujo por cada una de las cinco
     pasadas que lo dibujan (tres cascadas de sombra, G-buffer y color) eran
     demasiadas para nada. Los materiales son los del GLB con dos retoques:
     sin alphaTest (las texturas son opacas) y sin la metalicidad 0,5 con que
     SketchUp exporta lo que no tiene material PBR (césped y asfalto
     metálicos). El mar lleva rugosidad baja para reflejar el cielo; el
     vidrio de los vecinos, el mismo vidrio físico del edificio. La
     conversión a Float32 sanea de paso las normales nulas o no finitas
     (una sola produce un píxel NaN que el bloom extiende a todo el
     fotograma: pantalla transparente, ya sufrido con entorno_topo.glb). Con
     este entorno no hacía falta quitar triángulos degenerados (probado).
   · Niebla y far: el terreno llega a 5 km, así que la cámara ve hasta 9 km y
     la niebla de luz.js (que nace con 750-2100 m) se estira a 1.400-5.200 m
     para que el borde del terreno se funda con el cielo en vez de cortarse.
     El cielo nocturno de luz.js (estrellas a 3.400 m, luna a 3.000 m) se
     escala ×2,4 para que quede detrás del terreno lejano.
   · Sombras: el CSM reparte sus cascadas hasta maxFar, y un valor fijo o no
     llega al edificio desde 'conjunto' o resulta grueso dentro de una
     vivienda. Cada fotograma se pide a luz.setAlcanceSombras la distancia
     cámara-edificio + 250 m (redondeada a 50 m, entre 300 y 1.200) para que
     las cascadas cubran Apolo ± 150 m desde cualquier encuadre.
   · Encuadres: 'conjunto' y 'edificio' son POSE (ver POSE, más abajo), no
     cajas encajadas. El protagonista es la FACHADA NOROESTE, que es la de
     las dos capturas que marcó el cliente: el campo de fútbol abajo a la
     izquierda, la calle con los coches delante de la fachada larga y el
     pueblo al fondo. Los ángulos se sacaron midiendo el horizonte de sus
     capturas (la línea del horizonte cae sobre el centro del fotograma
     tanto como grados tenga la elevación) y comparando renders contra
     ellas. Desde el sur no valen: Apolo tiene pegado otro volumen de
     SERENEA tan alto como él que tapa la fachada.
     'planta' = huella de Apolo limitada en Y a [suelo mínimo de la planta,
     corte máximo de la planta] (edificio.suelos y cortes.json; no la caja
     entera del edificio, que alejaba la cámara), elevación 50°, azimut 8° y
     margen 1,02: con el eje largo (111 m) casi horizontal en pantalla la
     planta llena el ancho en 16:9 (medido en captura: ≥ 85 % del ancho).
     La caja se alarga PLANTA_HACIA_NORTE m hacia el norte (−z) para que el
     centro del encuadre quede algo al norte del edificio: así la planta
     baja en el fotograma y el bloque vecino del sur, blanco y a 50 m de la
     cámara, deja de ocupar el cuarto inferior de la imagen; el ancho no
     cambia (solo el eje largo cuenta en 16:9).
     'conjunto' y 'edificio' devuelven el edificio completo.
   · Planta seccionada a plena luz (integración del v6): al elegir una planta
     se llama a luz.setRealcePlanta(true) (sol a ≥ 62°, hemisférica ×1,6 e
     IBL ×1,4; de noche solo la hemisférica ×1,5) y en 'all' se restaura.
     Con el sol alto y tabiques de 1,3 m las sombras sobre la planta son
     cortas y suaves. post.setOclusion('interior') rebaja la oclusión
     (la de fachada pintaba manchas negras dentro). cortes.js recibe en
     `suelos` el y0 mínimo de las
     viviendas de cada planta y cajón (edificio.suelos) para atenuar solo lo
     que queda bajo el suelo real, no "el corte − 3 m".
   · Trazador solo en 'all': con una planta seccionada el raster (planos de
     recorte del mobiliario, realce de luz) es la imagen definitiva y el
     trazado no aporta; además solo asoma ya convergido (minSamples 48,
     fundido 1,2 s en trazador.js). SSR apagado en post.js.
   · Realce de hover y selección (revisado en el control de calidad): se
     dibuja SIEMPRE la envolvente translúcida de edificio.pintar y, además,
     se tiñe el emisivo del vidrio de la vivienda con el color de su estado.
     La envolvente solo existe en el raster, así que con hover o con una
     vivienda enfocada (bokeh, también raster) el trazador no arranca: ver
     `quieta` en el bucle. Tampoco arranca mientras cortes.provisional (el
     recorte por planos a la espera de la variante precortada: el trazador
     no entiende de planos y vería el edificio entero).
   · Enfoque de vivienda: elevación 36°, azimut 22° si la vivienda está en
     la mitad sur del edificio (fachada principal) y 158° si está en la norte.
   · Picking: solo con ratón, sobre edificio.pickables sin filtrar por
     `visible`, saltando las viviendas de otras plantas; una vendida tapa el
     rayo (inerte). Un clic sin arrastre (< 6 px) selecciona.
   · Estado de demostración: si availability.json marca menos del 20 % de
     vendidas, cada tercera vivienda por orden de id (empezando por la
     segunda) pasa a vendida; las reservadas del fichero se conservan.
   · Trazador: recibe un objeto luz envuelto con `equirectSinSol` como
     entorno y una intensidad de entorno calibrada por momento (IBL_TRAZADO).
   · Reposo: camara.reposoTras(120) solo emite; aquí se vuela a 'conjunto'
     y se enciende la órbita al llegar.
   · post.setMomento durante el fundido de luz se llama con bloom y umbral
     interpolados pero SIN exposición: luz.js escribe la exposición.
   · Pixel ratio: limitado a 1,5 (1,25 en 'media').
   · Extras fuera del contrato, para el shell y las pruebas:
     apolo.recentrar(), apolo.vista, apolo.cargado, evento 'trazado',
     apolo.modulos y apolo.tiempos (ms de carga de cada fichero).
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crearEscena } from 'app/visor/escena.js';
import { crearLuz, MOMENTOS } from 'app/visor/luz.js';
import { crearPost } from 'app/visor/post.js';
import { crearTrazador } from 'app/visor/trazador.js';
import { cargarEdificio, crearVidrioFisico, EMISIVO_VENTANA, INTENSIDAD_VENTANA } from 'app/visor/edificio.js';
import { crearCortes } from 'app/visor/cortes.js';
import { crearCamara } from 'app/visor/camara.js';
import { limitarMaterial, megapixeles } from 'app/visor/texturas.js';
import { ajustarMaterial, asignarMapa } from 'app/visor/materiales.js';
import { ACTIVE_BUILDING } from 'app/promotions.js';
import { FLOOR_DEFS } from 'app/layout.js';
import { ESTADO_COLORS } from 'app/building.js';

/* ── Constantes ── */
const PLANTAS = FLOOR_DEFS.filter((f) => f.key !== 'cubierta');
const CLAVES_PLANTA = new Set(['all', ...PLANTAS.map((f) => f.key)]);
const NIVEL_DE = new Map(PLANTAS.map((f, i) => [f.key, i]));
const RUTA_ENTORNO = 'assets/serenea/entorno.glb';
/* Encuadres de conjunto y edificio: el protagonista es la fachada NOROESTE,
   que es la que enseñan las dos capturas que marcó el cliente (el campo de
   fútbol abajo a la izquierda, la calle con los coches delante de la fachada
   larga y el pueblo al fondo). No se calculan encajando una caja: se guardan
   como POSE exacta —acimut, elevación, distancia y objetivo— porque el
   cliente los dictó mirando el visor, y una caja los reinventa en cuanto
   cambia el modelo. `?camara=1` los lee en pantalla: colocar la cámara y
   pulsar el botón de recentrar imprime estos cuatro números.
   La distancia sólo se corrige en pantallas más estrechas que 16:9 (móvil en
   vertical), donde con la distancia dictada el edificio se saldría por los
   lados; en apaisado y en escritorio es literalmente la del cliente. */
const POSE = {
  conjunto: { azimut: 230, elevacion: 10, distancia: 120, objetivo: [66.7, 12, -23.9] },
  edificio: { azimut: 236, elevacion: 17, distancia: 75, objetivo: [53, 10, -32] },
};
const ASPECTO_POSE = 16 / 9;      // por debajo de esto la pose se aleja para no recortar
const RETIRO_MAX = 2.6;           // tope del alejamiento en vertical
const AZIMUT = { planta: 8, plano: 0 };
const ELEVACION = { planta: 50, plano: 88 };
const MARGEN = { planta: 1.02, plano: 1.03 };
/* Entorno lejano: más allá de este radio (en planta, desde el centro
   geométrico de la parcela de Apolo) nada proyecta ni recibe sombra y las
   texturas bajan a TEXTURA_LEJOS. El pueblo entero entraba en las cascadas
   del CSM y se dibujaba dos o tres veces por fotograma sin que se notara. */
const RADIO_VISION = 200;         // m: círculo de visita, la cámara no sale de ahí
const REJILLA_PASO = 1.5;         // m de lado de la casilla del mapa de alturas
const HOLGURA_SUELO = 1.5;        // m que la cámara guarda por encima de lo que tenga debajo
const RADIO_CERCA = 200;          // m
const TEXTURA_LEJOS = 512;        // lado máximo de las texturas del entorno lejano
const RUTA_MODELO = 'data/serenea_modelo.json';
const PLANTA_HACIA_NORTE = 22;    // m que se alarga la caja de planta hacia −z (ver cabecera)
const REPOSO_S = 120;
const CAMARA_FAR = 9000;          // el entorno llega a 5 km
/* La bruma empieza más lejos y se cierra más despacio: con 1400/5200 el
   pueblo del fondo salía casi blanco y toda la imagen se leía lavada. */
const NIEBLA = { near: 1900, far: 6800 };
const ESCALA_CIELO_NOCHE = 2.4;   // estrellas y luna detrás del terreno lejano
const SOMBRAS = { margen: 250, min: 300, max: 1200, paso: 50 };
/* Nivel de luces del momento para edificio.setLuces (0 día · 1 atardecer ·
   2 noche): al atardecer la vivienda libre también se enciende, pero poco. */
const NIVEL_LUCES = { manana: 0, dia: 0, atardecer: 1, noche: 2 };
/* El tope del móvil estaba en 1: en un iPhone con densidad 3 eso es un
   lienzo a un tercio de lado y un antepecho de un píxel. 1,35 son un 82 %
   más de píxeles que pintar y, con el FXAA que ahora sí se
   monta en móvil (ver post.js), el diente de sierra desaparece. El visor
   clásico lleva 1,5 en el mismo teléfono desde hace meses, así que el margen
   existe; se deja por debajo porque esta cadena tiene cuatro pasadas más, y
   quien vigila que no se pase es `vigilarFluidez`. */
const DPR_MAX = { alta: 1.6, media: 1.3, movil: 1.35 };

/* ── Móvil ──
   El teléfono no puede con esta cadena: el trazador de caminos sube a la
   tarjeta un árbol de toda la escena (cientos de megas) y el post encadena
   seis destinos de pantalla completa. El navegador cierra la pestaña sin
   avisar ("no se puede abrir esta página"). En móvil se renuncia al trazado
   y a las pasadas caras: quedan el raster con sombras, el bloom y la salida,
   que es justo lo que enseña el visor clásico. ?movil=1 / ?movil=0 fuerzan
   el modo en cualquier equipo. */
const MOVIL = (() => {
  const q = new URLSearchParams(location.search).get('movil');
  if (q === '1') return true;
  if (q === '0') return false;
  const ua = navigator.userAgent || '';
  const tactil = (navigator.maxTouchPoints || 0) > 1;
  return /iPhone|iPad|iPod|Android/i.test(ua)
    || (tactil && /Macintosh/.test(ua))
    || (tactil && Math.min(screen.width, screen.height) < 900);
})();
/* Techo de textura. El entorno trae diez imágenes de 2048² y el edificio
   diecinueve de 1024²: con sus mipmaps, casi 400 MB de memoria de GPU. El
   teléfono no los tiene y Safari responde tirando el contexto de WebGL, que
   es el parpadeo y el negro que se veían. A 512 el conjunto baja a unos
   40 MB y a esta distancia no se nota; en escritorio basta con 1024 para el
   entorno, que es una ortofoto vista desde más de cien metros. */
const TEXTURA_MAX = MOVIL ? 512 : 1024;
const IBL_TRAZADO = { dia: 0.5, manana: 0.7, atardecer: 0.8, noche: 1.6 };
const REALCE = { hover: 0.9, seleccion: 1.4 }; // intensidad emisiva del vidrio teñido
const ELEVACION_VIVIENDA = 36;    // ver cabecera: la vivienda centrada y vista desde arriba
const AZIMUT_VIVIENDA = { sur: 22, norte: 158 };

/* ── Escena base ── */
const canvas = document.getElementById('scene');
const ctx = crearEscena(canvas);
const { renderer, scene, camera } = ctx;
camera.far = CAMARA_FAR;
camera.updateProjectionMatrix();

function aplicarDPR(tier) {
  const tope = MOVIL ? DPR_MAX.movil : (DPR_MAX[tier] || DPR_MAX.alta);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tope));
}
aplicarDPR(ctx.calidad);

/* ── Por qué el redimensionado va con retardo ──
   `ctx.setTamano` acaba en `composer.setSize`, que DESTRUYE y vuelve a crear
   todos los destinos de pantalla completa de la cadena de post. En iOS, al
   plegarse la barra de direcciones el alto cambia en cada fotograma de la
   animación, así que se estaban recreando en cada uno: parpadeo, fotogramas
   en negro y un tirón al soltar. Se aplica una sola vez, cuando el tamaño
   lleva un cuarto de segundo quieto; mientras tanto la imagen se estira un
   poco, que no se nota. El primer ajuste y el giro de pantalla van directos.
   El ResizeObserver cubre lo que no avisa por `resize` (barras, teclado,
   vista dividida). */
const ESPERA_TAM = 250;
let plazoTam = null;
const tamAplicado = { w: 0, h: 0 };

function aplicarTamano() {
  plazoTam = null;
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  if (w === tamAplicado.w && h === tamAplicado.h) return;
  tamAplicado.w = w; tamAplicado.h = h;
  ctx.setTamano(w, h);
}

function redimensionar({ inmediato = false } = {}) {
  if (plazoTam) { clearTimeout(plazoTam); plazoTam = null; }
  if (inmediato || tamAplicado.w === 0) { aplicarTamano(); return; }
  plazoTam = setTimeout(aplicarTamano, ESPERA_TAM);
}
redimensionar({ inmediato: true });
window.addEventListener('resize', () => redimensionar());
window.addEventListener('orientationchange', () => redimensionar({ inmediato: true }));
window.addEventListener('pageshow', () => redimensionar({ inmediato: true }));
window.visualViewport?.addEventListener('resize', () => redimensionar());
window.visualViewport?.addEventListener('scroll', () => redimensionar());
if (typeof ResizeObserver === 'function') new ResizeObserver(() => redimensionar()).observe(canvas);
canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // botón derecho = desplazar

/* ── Bus público ── */
const bus = new EventTarget();
const emitir = (evento, datos) => bus.dispatchEvent(new CustomEvent(evento, { detail: datos }));

const apolo = {
  floor: 'all', momento: 'dia', selected: null, hover: null, vista: 'conjunto', plano: false,
  units: [], unitsById: new Map(), estados: {}, cargado: false, tiempos: {},
  on(evento, fn) { bus.addEventListener(evento, (e) => fn(e.detail)); },
  enter() { /* compatibilidad con shell.js: no hay portada que atravesar */ },
  estadoDe: (id) => apolo.estados[id] || 'disponible',
};
window.apolo = apolo;

/* ── Módulos ── */
/* La calidad se baja ANTES de crear la luz: el CSM lee ctx.calidad en su
   constructor para decidir cuántas cascadas monta. Estando después, el móvil
   arrancaba con tres cascadas en vez de dos y se redibujaba toda la geometría
   que proyecta sombra una vez de más en cada fotograma. */
if (MOVIL) ctx.setCalidad('media');
const luz = crearLuz(ctx);
scene.fog.near = NIEBLA.near;
scene.fog.far = NIEBLA.far;
luz.cieloNoche.scale.setScalar(ESCALA_CIELO_NOCHE);
if (MOVIL) aplicarDPR('movil'); // setCalidad reajusta el DPR: se vuelve a bajar
const post = crearPost(ctx, luz, { ligero: MOVIL });
const camara = crearCamara(ctx);
const luzTrazado = {
  get equirect() { return luz.equirectSinSol || luz.equirect; },
  get sol() { return luz.sol; },
  get envMapIntensity() { return IBL_TRAZADO[luz.momento] ?? luz.actual.ibl; },
};
/* En móvil ni se construye: crear el trazador ya reserva memoria de vídeo. */
const trazador = MOVIL ? {
  activo: false, muestras: 0, progreso: 0,
  setRaster() {}, actualizarMateriales() {}, invalidar() {},
  update() { return false; }, setCalidad() {}, dispose() {},
} : crearTrazador(ctx, luzTrazado);
trazador.setRaster((dt) => post.render(dt));

let edificio = null, cortes = null, entorno = null;
let cargando = true;
apolo.modulos = { ctx, luz, post, camara, trazador, get edificio() { return edificio; }, get cortes() { return cortes; }, get entorno() { return entorno; } };

/* ── Entorno ── */
/* De noche el barrio se enciende un poco: sin esto el pueblo y la costa
   quedaban como un decorado apagado. No son farolas de verdad, es un emisivo
   cálido muy bajo; por debajo del umbral del bloom, para que no florezca.

   Se enciende SOLO LA FACHADA DE LOS EDIFICIOS VECINOS, que es de donde sale
   la luz de una ciudad. Antes se encendía todo el entorno menos el terreno, y
   eso ponía emisivo naranja sobre la hoja de las palmeras, el arbolado, el
   césped, los coches y las aceras: de noche el barrio entero parecía de
   cobre, con las palmeras doradas. Una hoja no emite luz. */
const materialesEntorno = [];
const SE_ENCIENDE = /^edificacion|^industry$|^V6_Monocapa_contexto$/i;
const EMISIVO_PUEBLO = new THREE.Color(0xffc08a);
const EMISIVO_PUEBLO_MAX = 0.075;
function encenderEntorno(fraccionNoche) {
  const f = Math.max(0, Math.min(1, fraccionNoche || 0));
  for (const m of materialesEntorno) {
    if (!m.emissive) continue;
    if (!SE_ENCIENDE.test(m.name || '')) { m.emissiveIntensity = 0; continue; }
    m.emissive.copy(EMISIVO_PUEBLO);
    m.emissiveIntensity = EMISIVO_PUEBLO_MAX * f;
  }
}

const cargadorGLB = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
function cargarGLB(url, onProgreso) {
  return new Promise((ok, ko) => cargadorGLB.load(url, ok, (xhr) => {
    if (onProgreso && xhr.lengthComputable && xhr.total > 0) onProgreso(xhr.loaded / xhr.total);
  }, ko));
}

/* Geometría Float32 en coordenadas de mundo (las posiciones del GLB vienen
   cuantizadas a Int16 con la escala en el nodo) con las normales saneadas:
   ver cabecera. Sin índice se genera uno, porque mergeGeometries exige que
   todas lo tengan o ninguna. */
function geometriaMundo(mesh, { conUV, uvMundo }) {
  const g = mesh.geometry;
  const salida = new THREE.BufferGeometry();
  for (const nombre of ['position', 'normal', 'uv']) {
    if (nombre === 'uv' && !conUV) continue;
    const atr = g.getAttribute(nombre);
    const n = nombre === 'uv' ? 2 : 3;
    const cuenta = g.getAttribute('position').count;
    const datos = new Float32Array(cuenta * n);
    if (atr) {
      for (let i = 0; i < cuenta; i++) {
        datos[i * n] = atr.getX(i); datos[i * n + 1] = atr.getY(i);
        if (n === 3) datos[i * n + 2] = atr.getZ(i);
      }
    }
    salida.setAttribute(nombre, new THREE.BufferAttribute(datos, n));
  }
  const idx = g.index;
  const ind = new Uint32Array(idx ? idx.count : salida.getAttribute('position').count);
  for (let i = 0; i < ind.length; i++) ind[i] = idx ? idx.getX(i) : i;
  salida.setIndex(new THREE.BufferAttribute(ind, 1));
  salida.applyMatrix4(mesh.matrixWorld);
  /* Proyección en planta para las texturas procedurales: la UV es la posición
     en el mundo en metros, y el `repeat` de la textura dice cuánto mide la
     baldosa. Así la calzada y el césped se texturizan igual sin depender de
     cómo despiezara el SketchUp (que no trae UV en esas mallas). */
  if (uvMundo) {
    const pos = salida.getAttribute('position');
    const uv = salida.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
    uv.needsUpdate = true;
  }
  if (!g.getAttribute('normal')) salida.computeVertexNormals();
  const nor = salida.getAttribute('normal');
  let nulas = 0;
  for (let i = 0; i < nor.count; i++) {
    const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i);
    if (!Number.isFinite(x + y + z) || x * x + y * y + z * z < 1e-6) { nor.setXYZ(i, 0, 1, 0); nulas++; }
  }
  salida.userData.normalesNulas = nulas;
  return salida;
}

/* ── Mapa de alturas ──
   Rejilla en planta con la cota más alta que hay debajo de cada casilla:
   terreno, calles, edificios vecinos y la envolvente de Apolo. Es el suelo
   que la cámara no atraviesa. Se comporta como un pájaro: por un patio
   interior se baja (encima del patio lo más alto es su propio pavimento),
   pero una pared es una casilla a la altura de la cubierta y no se pasa.
   Los triángulos se muestrean por su plano en el centro de cada casilla,
   acotado al alto del propio triángulo: así el terreno queda a su cota real
   y los paños verticales, a la de su borde superior. */
const alturas = { x0: 0, z0: 0, paso: REJILLA_PASO, n: 0, datos: null };

function rejillaVacia(centro, radio) {
  const n = Math.max(8, Math.ceil((radio * 2) / REJILLA_PASO) + 2);
  alturas.n = n;
  alturas.x0 = centro.x - (n * REJILLA_PASO) / 2;
  alturas.z0 = centro.y - (n * REJILLA_PASO) / 2;
  alturas.datos = new Float32Array(n * n).fill(-Infinity);
}

function marcarGeometria(g, matriz) {
  const pos = g.getAttribute('position');
  if (!pos) return;
  const idx = g.index;
  const cuenta = idx ? idx.count : pos.count;
  const { n, x0, z0, paso, datos } = alturas;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < cuenta; t += 3) {
    const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    if (matriz) { a.applyMatrix4(matriz); b.applyMatrix4(matriz); c.applyMatrix4(matriz); }
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
    const minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
    let i0 = Math.floor((minX - x0) / paso), i1 = Math.floor((maxX - x0) / paso);
    let j0 = Math.floor((minZ - z0) / paso), j1 = Math.floor((maxZ - z0) / paso);
    if (i1 < 0 || j1 < 0 || i0 >= n || j0 >= n) continue;
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(n - 1, i1); j1 = Math.min(n - 1, j1);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 40000) continue;   // triángulo descomunal: no es geometría de visita
    const minY = Math.min(a.y, b.y, c.y), maxY = Math.max(a.y, b.y, c.y);
    // plano del triángulo: ny·y = d − nx·x − nz·z
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const plano = Math.abs(ny) > 1e-6;
    const d = nx * a.x + ny * a.y + nz * a.z;
    for (let j = j0; j <= j1; j++) {
      const cz = z0 + (j + 0.5) * paso;
      for (let i = i0; i <= i1; i++) {
        const cx = x0 + (i + 0.5) * paso;
        let y = maxY;
        if (plano) {
          y = (d - nx * cx - nz * cz) / ny;
          if (!(y >= minY)) y = minY;
          else if (y > maxY) y = maxY;
        }
        const k = j * n + i;
        if (y > datos[k]) datos[k] = y;
      }
    }
  }
}

/* Cota del mapa en un punto (la casilla, sin interpolar: interpolar suavizaría
   justo los bordes de los muros, que es donde interesa que no ceda). */
function alturaEn(x, z) {
  const { n, x0, z0, paso, datos } = alturas;
  if (!datos) return -Infinity;
  const i = Math.floor((x - x0) / paso), j = Math.floor((z - z0) / paso);
  if (i < 0 || j < 0 || i >= n || j >= n) return -Infinity;
  return datos[j * n + i];
}

/* ── Entorno lejano ──
   Reparte los triángulos de una geometría en dos según su centroide caiga
   dentro o fuera del radio (medido en planta desde el centro de la parcela).
   Los vértices se compactan, así que ninguna de las dos mitades arrastra la
   otra. Devuelve [dentro, fuera]; cualquiera de los dos puede ser null (y
   entonces el otro es la geometría original, sin copiar). */
function partirPorRadio(g, cx, cz, radio) {
  const pos = g.getAttribute('position');
  const idx = g.index;
  const tri = idx.count / 3;
  const r2 = radio * radio;
  const marca = new Uint8Array(tri);
  const ia = idx.array, pa = pos.array;
  let dentro = 0;
  for (let t = 0; t < tri; t++) {
    const a = ia[t * 3] * 3, b = ia[t * 3 + 1] * 3, c = ia[t * 3 + 2] * 3;
    const x = (pa[a] + pa[b] + pa[c]) / 3 - cx;
    const z = (pa[a + 2] + pa[b + 2] + pa[c + 2]) / 3 - cz;
    if (x * x + z * z <= r2) { marca[t] = 1; dentro++; }
  }
  if (dentro === tri) return [g, null];
  if (dentro === 0) return [null, g];
  return [extraerTriangulos(g, marca, 1, dentro), extraerTriangulos(g, marca, 0, tri - dentro)];
}

function extraerTriangulos(g, marca, valor, cuenta) {
  const idx = g.index.array;
  const nombres = ['position', 'normal', 'uv'].filter((n) => g.getAttribute(n));
  const mapa = new Int32Array(g.getAttribute('position').count).fill(-1);
  const indice = new Uint32Array(cuenta * 3);
  let v = 0, k = 0;
  for (let t = 0; t < marca.length; t++) {
    if (marca[t] !== valor) continue;
    for (let j = 0; j < 3; j++) {
      const orig = idx[t * 3 + j];
      if (mapa[orig] < 0) mapa[orig] = v++;
      indice[k++] = mapa[orig];
    }
  }
  const salida = new THREE.BufferGeometry();
  for (const nombre of nombres) {
    const atr = g.getAttribute(nombre);
    const n = atr.itemSize;
    const datos = new Float32Array(v * n);
    for (let i = 0; i < mapa.length; i++) {
      const d = mapa[i];
      if (d < 0) continue;
      for (let j = 0; j < n; j++) datos[d * n + j] = atr.array[i * n + j];
    }
    salida.setAttribute(nombre, new THREE.BufferAttribute(datos, n));
  }
  salida.setIndex(new THREE.BufferAttribute(indice, 1));
  return salida;
}

/* Copia reducida de una textura, dibujándola en un lienzo del tamaño pedido.
   No se toca la original: la mitad cercana del entorno la sigue usando a
   plena resolución. Las comprimidas y las que ya son pequeñas se devuelven
   tal cual. */
const reducidas = new Map();
function reducirTextura(tex, maxLado) {
  if (!tex || tex.isCompressedTexture) return tex;
  const img = tex.image;
  const w = img?.width | 0, h = img?.height | 0;
  if (!w || !h || Math.max(w, h) <= maxLado) return tex;
  const cacheada = reducidas.get(tex);
  if (cacheada) return cacheada;
  const k = maxLado / Math.max(w, h);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(w * k));
  lienzo.height = Math.max(1, Math.round(h * k));
  const g2d = lienzo.getContext('2d');
  if (!g2d) return tex;
  g2d.imageSmoothingEnabled = true;
  g2d.imageSmoothingQuality = 'high';
  try { g2d.drawImage(img, 0, 0, lienzo.width, lienzo.height); } catch (e) { return tex; }
  const t = new THREE.Texture(lienzo);
  t.name = `${tex.name || 'tex'}_${lienzo.width}`;
  t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.colorSpace = tex.colorSpace; t.flipY = tex.flipY;
  t.premultiplyAlpha = tex.premultiplyAlpha;
  t.offset.copy(tex.offset); t.repeat.copy(tex.repeat);
  t.center.copy(tex.center); t.rotation = tex.rotation;
  t.channel = tex.channel;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  reducidas.set(tex, t);
  return t;
}

const MAPAS_LEJOS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
function materialLejano(mat) {
  const m = mat.clone();
  m.name = `${mat.name || 'entorno'}_lejos`;
  for (const clave of MAPAS_LEJOS) if (m[clave]) m[clave] = reducirTextura(m[clave], TEXTURA_LEJOS);
  luz.aplicarMaterial(m);
  return m;
}

/* Centro geométrico de la parcela (la unión de los ocho cajones), que es lo
   que separa el entorno cercano del lejano. Si el fichero no llega se usa el
   centro del edificio del contrato. */
let centroParcelaXZ = new THREE.Vector2(66.72, -23.94);
async function centroParcela() {
  try {
    const r = await fetch(RUTA_MODELO);
    if (!r.ok) throw new Error(`${RUTA_MODELO}: ${r.status}`);
    const d = await r.json();
    const p = d.plataformas || [];
    if (!p.length) return new THREE.Vector2(d.apolo.centro[0], d.apolo.centro[2]);
    const x0 = Math.min(...p.map((c) => c.x0)), x1 = Math.max(...p.map((c) => c.x1));
    const z0 = Math.min(...p.map((c) => c.z0)), z1 = Math.max(...p.map((c) => c.z1));
    return new THREE.Vector2((x0 + x1) / 2, (z0 + z1) / 2);
  } catch (e) {
    console.warn('[apolo] sin parcela, se usa el centro del edificio:', e.message);
    return new THREE.Vector2(66.72, -23.94);
  }
}

/* Retoques a los materiales del entorno (ver cabecera). Devuelve el material
   que se usará; el vidrio se sustituye por el físico del edificio. */
function materialEntorno(m) {
  const nombre = m.name || '';
  limitarMaterial(m, TEXTURA_MAX);
  if (/vidrio|^glass$/i.test(nombre)) {
    // el edificio se carga en paralelo: el entorno lleva su propio vidrio físico
    m.dispose();
    const vidrio = crearVidrioFisico();
    vidrio.name = `entorno_${nombre}`;
    luz.aplicarMaterial(vidrio);
    return vidrio;
  }
  m.alphaTest = 0;
  m.transparent = false;
  m.depthWrite = true;
  /* Reflejo del cielo por tipo de superficie. Todo a 1 teñía de AZUL lo
     horizontal: una calzada ve el hemisferio entero, y medido salía
     91,110,130 contra los 60,63,75 neutros del render del estudio. El suelo,
     el asfalto y la ortofoto reflejan poco; lo vertical, algo más. */
  m.envMapIntensity = /^ortho|^PNOA_|asphalt|curb|EXT_Tierra|industry/i.test(nombre) ? 0.42 : 0.85;
  if (nombre === 'mar_atlantico_costa') { m.roughness = 0.18; m.metalness = 0; m.envMapIntensity = 1; }
  else if (nombre === 'metal') { m.roughness = 0.45; m.metalness = 0.7; }
  else if (/^ortho$|^PNOA_/.test(nombre)) { m.roughness = 1; m.metalness = 0; }
  m.name = nombre;
  /* Al final, para que su envMapIntensity no lo pise el 1 de arriba. */
  ajustarMaterial(m);   // metalness del exportador y color real (ver materiales.js)
  luz.aplicarMaterial(m);
  return m;
}

async function cargarEntorno(onProgreso) {
  const t0 = performance.now();
  const [gltf, centro] = await Promise.all([cargarGLB(RUTA_ENTORNO, onProgreso), centroParcela()]);
  centroParcelaXZ = centro;
  const tCarga = performance.now();
  gltf.scene.updateMatrixWorld(true);
  const grupo = new THREE.Group();
  grupo.name = 'entorno';
  const porMaterial = new Map();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!porMaterial.has(m)) porMaterial.set(m, []);
    porMaterial.get(m).push(o);
  });
  let mallas = 0, triangulos = 0, normalesNulas = 0, trisLejos = 0;
  /* Antes de fusionar: el asfalto, la acera, la tierra y el césped llevan
     textura procedural, y `conUV` se decide mirando `material.map`. Si la
     textura se asignara después (en `materialEntorno`), la malla fusionada se
     habría quedado sin UV. Ver materiales.js. */
  for (const material of porMaterial.keys()) asignarMapa(material);
  for (const [material, lista] of porMaterial) {
    const conUV = !!material.map;
    const uvMundo = !!material.userData?.uvMundo;
    const cerca = [], lejos = [];
    for (const o of lista) {
      const g = geometriaMundo(o, { conUV, uvMundo });
      normalesNulas += g.userData.normalesNulas || 0;
      const [dentro, fuera] = partirPorRadio(g, centro.x, centro.y, RADIO_CERCA);
      if (dentro) cerca.push(dentro);
      if (fuera) lejos.push(fuera);
      if (dentro !== g && fuera !== g) g.dispose();
    }
    const mat = materialEntorno(material);
    materialesEntorno.push(mat);
    // el relieve son 330 k triángulos en tres cascadas por una sombra que no se ve
    const terreno = /^ortho$|^PNOA_|mar_atlantico/.test(material.name);
    /* La hoja de los árboles son 540 k triángulos que, multiplicados por las
       cascadas del mapa de sombras, es el bloque más caro del fotograma. En el
       teléfono no proyectan: a esta distancia la sombra de una copa es ruido.
       En escritorio se quedan. */
    const vegetacion = /^EXT_Hoja/.test(material.name);
    const añadir = (geometrias, lejano) => {
      if (!geometrias.length) return;
      const fusionada = geometrias.length === 1 ? geometrias[0] : mergeGeometries(geometrias, false);
      if (!fusionada) { console.warn('[apolo] entorno: no se pudo fusionar', material.name); return; }
      for (const g of geometrias) if (g !== fusionada) g.dispose();
      fusionada.computeBoundingBox(); fusionada.computeBoundingSphere();
      const suyo = lejano ? materialLejano(mat) : mat;
      if (lejano) materialesEntorno.push(suyo);
      const mesh = new THREE.Mesh(fusionada, suyo);
      mesh.name = `entorno_${material.name}${lejano ? '_lejos' : ''}`;
      mesh.castShadow = !terreno && !lejano && !(MOVIL && vegetacion);
      mesh.receiveShadow = !lejano;
      mesh.raycast = () => {}; // el picking va solo por las envolventes de vivienda
      grupo.add(mesh);
      mallas++;
      const t = fusionada.index.count / 3;
      triangulos += t;
      if (lejano) trisLejos += t;
    };
    añadir(cerca, false);
    añadir(lejos, true);
  }
  for (const o of gltf.scene.children) o.traverse((x) => x.geometry?.dispose());
  scene.add(grupo);
  scene.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(grupo);
  apolo.tiempos.entorno = { descargaMs: Math.round(tCarga - t0), fusionMs: Math.round(performance.now() - tCarga), mallas, mallasOrigen: [...porMaterial.values()].reduce((s, l) => s + l.length, 0), triangulos: Math.round(triangulos), trisLejos: Math.round(trisLejos), normalesNulas, centro: [centro.x, centro.y], radioCerca: RADIO_CERCA };
  return { grupo, caja };
}

/* ── Estado de demostración 70/30 ── */
function estadosDemostracion(ed) {
  const ids = ed.units.map((u) => u.id).sort();
  const vendidas = ids.filter((id) => ed.estadoDe(id) === 'vendida').length;
  if (vendidas >= ids.length * 0.2) return null; // el fichero ya trae ventas reales
  const mapa = {};
  ids.forEach((id, i) => {
    mapa[id] = i % 3 === 1 ? 'vendida' : (ed.estados[id] === 'reservada' ? 'reservada' : 'disponible');
  });
  return mapa;
}

/* ── Encuadres ── */
function volarAPose(pose, duracion) {
  const aspecto = camera.aspect || ASPECTO_POSE;
  const retiro = Math.min(RETIRO_MAX, Math.max(1, ASPECTO_POSE / aspecto));
  const polar = THREE.MathUtils.degToRad(90 - pose.elevacion);
  const az = THREE.MathUtils.degToRad(pose.azimut);
  const objetivo = new THREE.Vector3(...pose.objetivo);
  const dir = new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));
  const posicion = dir.clone().multiplyScalar(distanciaDentroDelAmbito(objetivo, dir, pose.distancia * retiro)).add(objetivo);
  return camara.volarA({ posicion, objetivo }, { duracion, arco: 0.3 });
}

/* La corrección por pantalla estrecha no puede sacar la cámara del ámbito:
   antes de alejarse se corta la distancia en el borde del círculo. */
function distanciaDentroDelAmbito(objetivo, dir, distancia) {
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-6) return distancia;
  const ox = objetivo.x - centroParcelaXZ.x, oz = objetivo.z - centroParcelaXZ.y;
  const radio = RADIO_VISION * 0.98;
  const b = 2 * (ox * dir.x + oz * dir.z);
  const c = ox * ox + oz * oz - radio * radio;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return distancia;
  return Math.min(distancia, (-b + Math.sqrt(disc)) / (2 * a));
}
/* Con una planta aislada la cámara puede bajar hasta la cota de corte; con
   el edificio entero, el techo es la cubierta y manda el mapa de alturas. */
function actualizarVolumen() {
  if (!edificio) return;
  const tramos = edificio.definicionCortes?.plantas?.[apolo.floor];
  corteActual = apolo.floor === 'all' || !tramos ? Infinity : Math.max(...tramos.map((t) => t.y));
}

/* Cota mínima admitida para la cámara en un punto: lo más alto que hay
   debajo, más la holgura. Con una planta aislada, dentro de la huella de
   Apolo el techo deja de ser la cubierta y pasa a ser la cota de corte, que
   es lo que permite bajar a ras del seccionado sin meterse en los muros de
   debajo. Fuera de la huella manda siempre el mapa. */
let corteActual = Infinity;
function sueloTerreno(x, z) {
  let y = alturaEn(x, z);
  const caja = edificio?.caja;
  if (caja && Number.isFinite(corteActual)
      && x >= caja.min.x && x <= caja.max.x && z >= caja.min.z && z <= caja.max.z) {
    y = Math.min(y, corteActual);
  }
  if (!Number.isFinite(y)) {
    const suelos = (edificio?.suelos?.baja || []).filter(Number.isFinite);
    y = suelos.length ? Math.min(...suelos) : 0;
  }
  return y + HOLGURA_SUELO;
}

function cajaPlanta(clave) {
  const caja = edificio.caja.clone();
  const tramos = cortes?.definicion?.plantas?.[clave];
  const suelos = (edificio.suelos?.[clave] || []).filter(Number.isFinite);
  if (tramos) caja.max.y = Math.min(caja.max.y, Math.max(...tramos.map((t) => t.y)));
  if (suelos.length) caja.min.y = Math.max(caja.min.y, Math.min(...suelos));
  else if (tramos) caja.min.y = Math.max(caja.min.y, caja.max.y - 3);
  caja.min.z -= PLANTA_HACIA_NORTE; // el bloque vecino del sur fuera del cuarto inferior (ver cabecera)
  return caja;
}
/* Vista cenital de la planta activa: la cámara justo encima, con la fuga que
   ya tiene la cámara (no se toca el fov). Es el cuarto botón del raíl. */
function cajaPlano(clave) {
  const caja = cajaPlanta(clave);
  caja.min.z -= 2; caja.max.z += 2;   // un respiro arriba y abajo del fotograma
  return caja;
}

function encuadrarVista(vista, { duracion = 1.6 } = {}) {
  const cambia = apolo.vista !== vista;
  apolo.vista = vista;
  if (cambia && edificio) repintar(); // las cartelas vecinas dependen de la vista
  if (vista === 'conjunto') return volarAPose(POSE.conjunto, duracion);
  if (vista === 'planta') return camara.encuadrar(cajaPlanta(apolo.floor), { azimut: AZIMUT.planta, elevacion: ELEVACION.planta, margen: MARGEN.planta, duracion });
  /* En vertical la barra de 111 m no cabe a lo ancho: se gira el plano 90°
     para que el eje largo caiga en el alto del móvil. Si no, la cámara se iba
     a 300 m para encajarla y el plano quedaba diminuto (y fuera del ámbito). */
  if (vista === 'plano') return camara.encuadrar(cajaPlano(apolo.floor), { azimut: camera.aspect < 1.2 ? 90 : AZIMUT.plano, elevacion: ELEVACION.plano, margen: MARGEN.plano, duracion });
  return volarAPose(POSE.edificio, duracion);
}

/* ── Realce de viviendas (ver cabecera) ── */
const tenidas = new Set();
/* `edificio.ventanas` es ahora el FACTOR del momento (0 apagadas, 1 tarde,
   2,4 noche), no un booleano: si aquí se restaurase con 1 fijo, cada vez que
   el ratón pasara por una vivienda de noche se le apagaría la luz. */
function restaurarVidrios(v) {
  const f = edificio.estadoDe(v.id) === 'vendida' ? 0 : (+edificio.ventanas || 0);
  for (const m of v.vidrios) {
    m.emissive.setHex(EMISIVO_VENTANA);
    m.emissiveIntensity = INTENSIDAD_VENTANA * f;
  }
}
/* El realce se suma a la luz del momento en vez de sustituirla: de noche una
   vivienda señalada tiene que verse encendida Y marcada. */
function tenirVidrios(v, intensidad) {
  const col = ESTADO_COLORS[edificio.estadoDe(v.id)] || ESTADO_COLORS.disponible;
  const f = Math.max(1, +edificio.ventanas || 0);
  for (const m of v.vidrios) { m.emissive.copy(col); m.emissiveIntensity = intensidad * f; }
  tenidas.add(v);
}
const atenuada = (id) => {
  if (apolo.floor === 'all') return false;
  const v = edificio.viviendas.get(id);
  return !v || NIVEL_DE.get(v.floorKey) !== NIVEL_DE.get(apolo.floor);
};
function repintar() {
  if (!edificio) return;
  /* Las cartelas solo existen con una planta aislada: si no hay ninguna, post
     se salta la pasada de capa 1 entera. */
  post.cartelas = apolo.floor !== 'all';
  for (const v of tenidas) restaurarVidrios(v);
  tenidas.clear();
  const hover = edificio.viviendas.get(apolo.hover);
  const sel = edificio.viviendas.get(apolo.selected);
  if (hover && hover !== sel && !atenuada(hover.id)) tenirVidrios(hover, REALCE.hover);
  if (sel && !atenuada(sel.id)) tenirVidrios(sel, REALCE.seleccion);
  edificio.pintar({ hover: hover?.id ?? null, seleccionada: sel?.id ?? null, atenuada });
  /* Con una vivienda enfocada la cámara está a 10 m: las cartelas vecinas,
     de 3,2 m, taparían media pantalla. Solo queda la suya. */
  if (apolo.vista === 'vivienda' && sel) {
    for (const v of edificio.viviendas.values()) if (v !== sel) { v.label.visible = false; v.labelR.visible = false; }
  }
  trazador.actualizarMateriales();
}

/* ── Picking ── */
const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2(-2, -2);
let ratonActivo = false;
let bajada = null;
const ndc = (cx, cy, destino) => {
  const r = canvas.getBoundingClientRect();
  return destino.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
};
/* Las viviendas de otras plantas no cuentan (las de arriba ya no existen y
   las de abajo quedan bajo la losa); la primera de la planta activa que
   cruza el rayo decide: si es vendida, tapa lo que hay detrás. */
function pickEn(p) {
  if (!edificio) return null;
  raycaster.setFromCamera(p, camera);
  for (const h of raycaster.intersectObjects(edificio.pickables, false)) {
    const id = h.object.userData.unitId;
    if (!id) continue;
    if (apolo.floor !== 'all' && edificio.viviendas.get(id)?.floorKey !== apolo.floor) continue;
    return apolo.estadoDe(id) === 'vendida' ? null : id;
  }
  return null;
}
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') { ratonActivo = false; return; }
  ratonActivo = true;
  ndc(e.clientX, e.clientY, puntero);
});
canvas.addEventListener('pointerleave', () => { ratonActivo = false; });
canvas.addEventListener('pointerdown', (e) => {
  alEntradaUsuario();
  bajada = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
});
canvas.addEventListener('pointerup', (e) => {
  if (!bajada) return;
  const movido = Math.hypot(e.clientX - bajada.x, e.clientY - bajada.y);
  bajada = null;
  if (movido > 6) return; // era un arrastre
  const id = pickEn(ndc(e.clientX, e.clientY, new THREE.Vector2()));
  if (id) apolo.enfocarVivienda(id);
  else if (apolo.selected) apolo.select(null);
});
canvas.addEventListener('wheel', alEntradaUsuario, { passive: true });
canvas.addEventListener('touchstart', alEntradaUsuario, { passive: true });

function actualizarHover() {
  if (!edificio) return;
  const id = ratonActivo ? pickEn(puntero) : null;
  if (id === apolo.hover) return;
  apolo.hover = id;
  canvas.style.cursor = id ? 'pointer' : '';
  repintar();
  emitir('hover', id);
}

/* ── Reposo ──
   `entradas` cuenta los gestos del usuario sobre el lienzo; las llamadas de
   la API (setFloor, enfocarVivienda…) solo apagan el estado de reposo. Así
   el vuelo a 'conjunto' del propio reposo, que pasa por setFloor('all'),
   no se confunde con una intervención del usuario y la órbita arranca. */
let enReposo = false;
let entradas = 0;
function salirDelReposo() { enReposo = false; }
function alEntradaUsuario() { entradas++; enReposo = false; }
ctx.on('reposo', async () => {
  if (enReposo || cargando) return;
  const antes = entradas;
  emitir('reposo');
  const llego = await apolo.irConjunto({ duracion: 2.4 });
  if (llego && entradas === antes) {
    enReposo = true; // hasta el próximo gesto: los 'reposo' periódicos no repiten el vuelo
    camara.orbitaAutomatica(true, { velocidad: 0.05 });
  }
});

/* ── Superficies que reflejan (SSR): vidrios, asfalto y mar ── */
function actualizarReflectantes() {
  const lista = [];
  scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.isMeshPhysicalMaterial && m.transparent) lista.push(o);
    else if (o.name === 'entorno_asphalt' || o.name === 'entorno_mar_atlantico_costa') lista.push(o);
  });
  post.setReflectantes(lista);
}

/* ── Alcance de las sombras según la distancia al edificio (ver cabecera) ── */
let alcanceSombras = 0;
const centroEdificio = new THREE.Vector3();
function ajustarSombras() {
  const d = camera.position.distanceTo(centroEdificio);
  const deseado = THREE.MathUtils.clamp(Math.round((d + SOMBRAS.margen) / SOMBRAS.paso) * SOMBRAS.paso, SOMBRAS.min, SOMBRAS.max);
  if (deseado === alcanceSombras) return;
  alcanceSombras = deseado;
  luz.setAlcanceSombras(deseado);
}

/* ── API pública ── */
Object.assign(apolo, {
  /** Cota mínima admitida para la cámara en un punto (diagnóstico). */
  sueloDebug: (x, z) => sueloTerreno(x, z),
  /* Cortar NO mueve la cámara: el comercial se coloca donde quiere y va
     pasando plantas desde ahí. Solo el modo plano (el cuarto botón del raíl)
     lleva la cámara al cenital. `encuadrar` fuerza uno u otro si hace falta. */
  setFloor(clave, { encuadrar = null, duracion = 1.6 } = {}) {
    if (!CLAVES_PLANTA.has(clave)) return Promise.reject(new Error(`apolo: planta desconocida "${clave}"`));
    if (!edificio) return Promise.resolve(false);
    salirDelReposo();
    if (apolo.selected) apolo.select(null);
    post.setEnfoque(null);
    apolo.floor = clave;
    /* En el móvil la planta cortada y el mobiliario se piden al elegir planta
       (ver cargarSecundarios): con el edificio cerrado no se ve ni uno ni
       otro, y son 1.403 mallas y 51 MB que el teléfono se ahorra hasta que
       hacen falta. */
    if (MOVIL && clave !== 'all') {
      if (!edificio.variantes.has(clave)) edificio.cargarVariante(clave, (k, objeto) => cortes?.registrarVariante(k, objeto));
      if (!edificio.mobiliario) edificio.cargarMobiliario();
    }
    ensuciarSombras();
    luz.setRealcePlanta(clave !== 'all');
    post.setOclusion(clave === 'all' ? 'exterior' : 'interior');
    edificio.setCartelas(clave === 'all' ? null : clave);
    apolo.hover = null;
    repintar();
    emitir('planta', clave);
    materialesEnMovimientoHasta = reloj.elapsedTime + 1.8; // rampa de atenuación de cortes
    const corte = cortes.setPlanta(clave);
    actualizarVolumen();
    const mover = encuadrar === null ? (apolo.plano && clave !== 'all') : encuadrar;
    if (mover) encuadrarVista(apolo.plano && clave !== 'all' ? 'plano' : (clave === 'all' ? 'edificio' : 'planta'), { duracion });
    return corte;
  },

  /* Cuarto botón del raíl: la misma barra de plantas, pero mirando el modelo
     desde arriba. Al apagarlo la cámara se queda donde esté. */
  setPlano(activo, { duracion = 1.6 } = {}) {
    apolo.plano = !!activo;
    emitir('plano', apolo.plano);
    if (!apolo.plano) return Promise.resolve(false);
    if (apolo.floor === 'all') return apolo.setFloor('baja', { encuadrar: true, duracion });
    apolo.vista = 'plano';
    return encuadrarVista('plano', { duracion });
  },

  setMomento(clave, { duracion = 1.6 } = {}) {
    if (!MOMENTOS[clave]) return Promise.reject(new Error(`apolo: momento desconocido "${clave}"`));
    apolo.momento = clave;
    // las ventanas cambian al arrancar el fundido; el bajón de exposición lo tapa
    ensuciarSombras();
    post.setGrado(MOMENTOS[clave].grado);
    if (edificio) { edificio.setVentanas(MOMENTOS[clave].ventana ?? (MOMENTOS[clave].luces ? 1 : 0)); edificio.setLuces(NIVEL_LUCES[clave] ?? 0); repintar(); }
    /* El techo que el corte se lleva, devuelto solo en la cuenta de la luz
       (ver cortes.setInterior): cada momento dice cuánto sol tapa y cuánta luz
       interior pone. */
    cortes?.setInterior(MOMENTOS[clave].interior);
    encenderEntorno(MOMENTOS[clave].noche);
    return luz.setMomento(clave, { duracion });
  },

  /* `vista` se fija ANTES de setFloor: el evento 'planta' que este emite lo
     lee el shell para decidir qué botón del raíl marcar. */
  irConjunto({ duracion = 1.6 } = {}) {
    if (!edificio) return Promise.resolve(false);
    apolo.vista = 'conjunto';
    if (apolo.floor !== 'all') apolo.setFloor('all', { encuadrar: false });
    else if (apolo.selected) apolo.select(null);
    post.setEnfoque(null);
    return encuadrarVista('conjunto', { duracion });
  },

  irEdificio({ duracion = 1.6 } = {}) {
    if (!edificio) return Promise.resolve(false);
    apolo.vista = 'edificio';
    if (apolo.floor !== 'all') apolo.setFloor('all', { encuadrar: false });
    else if (apolo.selected) apolo.select(null);
    post.setEnfoque(null);
    return encuadrarVista('edificio', { duracion });
  },

  /* Vivienda disponible o reservada: cortes en su planta, vuelo hasta ella y
     profundidad de campo al llegar. Vendidas: inertes. */
  enfocarVivienda(id, { duracion = 1.4 } = {}) {
    const v = edificio?.viviendas.get(id);
    if (!v || apolo.estadoDe(id) === 'vendida') return Promise.resolve(false);
    salirDelReposo();
    if (apolo.floor !== v.floorKey) apolo.setFloor(v.floorKey, { encuadrar: false });
    apolo.vista = 'vivienda';
    apolo.select(id, { enfocar: false });
    repintar(); // select no repinta si ya estaba seleccionada: las cartelas vecinas deben irse igual
    /* Acimut según la mitad del edificio: la fachada principal mira al sur
       (+z); desde la fachada opuesta la vivienda se vería a través del
       edificio. */
    const centro = v.caja.getCenter(new THREE.Vector3());
    const azimut = centro.z >= centroEdificio.z ? AZIMUT_VIVIENDA.sur : AZIMUT_VIVIENDA.norte;
    return camara.enfocarVivienda(v.caja, { duracion, azimut, elevacion: ELEVACION_VIVIENDA }).then((llego) => {
      if (llego && apolo.selected === id) {
        post.setEnfoque(camara.distanciaObjetivo);
        /* Ya se está dentro: el prisma de color y la cartela sobran y tapan
           justo lo que se ha venido a ver. */
        edificio.setViviendaAbierta(id);
      }
      return llego;
    });
  },

  volverAPlanta({ duracion = 1.4 } = {}) {
    if (!edificio) return Promise.resolve(false);
    post.setEnfoque(null);
    edificio.setViviendaAbierta(null);
    if (apolo.selected) apolo.select(null);
    return encuadrarVista(apolo.plano && apolo.floor !== 'all' ? 'plano'
      : (apolo.floor === 'all' ? 'edificio' : 'planta'), { duracion });
  },

  select(id, { enfocar = true } = {}) {
    if (!edificio) return;
    if (id != null && (!edificio.viviendas.has(id) || apolo.estadoDe(id) === 'vendida')) return;
    if (id == null) post.setEnfoque(null);
    if (id !== apolo.selected) edificio.setViviendaAbierta(null); // otra vivienda: vuelve el prisma
    if (apolo.selected === id) return;
    apolo.selected = id;
    repintar();
    const u = id != null ? apolo.unitsById.get(id) : null;
    emitir('seleccion', { id, unidad: u || null, estado: id != null ? apolo.estadoDe(id) : null });
    if (id != null && enfocar) apolo.enfocarVivienda(id);
  },

  recentrar({ duracion = 1.2 } = {}) {
    if (apolo.vista === 'vivienda' && apolo.selected) return apolo.enfocarVivienda(apolo.selected, { duracion });
    if (apolo.vista === 'conjunto') return apolo.irConjunto({ duracion });
    return encuadrarVista(apolo.floor === 'all' ? 'edificio' : 'planta', { duracion });
  },

  setCalidad(tier) {
    ctx.setCalidad(tier);
    aplicarDPR(ctx.calidad);
    // el post lee el pixel ratio al redimensionar: forzar el paso
    ctx.setTamano(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    return ctx.calidad;
  },
});

/* ── Eventos de los módulos ── */
ctx.on('momento', (clave) => {
  apolo.momento = clave;
  emitir('momento', clave);
  trazador.actualizarMateriales(); // las ventanas cambiaron de emisivo
});
ctx.on('geometria', () => actualizarReflectantes());

/* ── Bucle ── */
const reloj = new THREE.Clock();
let materialesEnMovimientoHasta = 0;   // hasta cuándo cortes sigue atenuando materiales
let materialesPendientes = false;
const ultimoTrazado = { activo: null, progreso: -1, muestras: -1, pintando: null };
/* ── Sombras solo cuando hacen falta ──
   El mapa de sombras vuelve a dibujar toda la geometría que proyecta, una vez
   por cascada: en móvil son dos pasadas de ~1,3 M de triángulos, y hasta ahora
   se repetían en CADA fotograma aunque la cámara estuviera parada y el sol
   quieto. Con las cascadas cubriendo el frustum de la cámara, la sombra solo
   cambia si la cámara se mueve, si cambia la luz o si entra o sale geometría.
   `pendientes` da un par de fotogramas de margen tras esos cambios, que es
   cuando three termina de subir lo nuevo. */
let sombrasPendientes = 3;
const ensuciarSombras = () => { sombrasPendientes = 3; };

/* ── Válvula de seguridad del DPR ──
   Subir la resolución del móvil quita el pixelado pero cuesta píxeles, y el
   parque de iPhones no es uno solo. Esto mide el fotograma de verdad y, si en
   una ventana de 120 se pasa de 38 ms de mediana (por debajo de 26 fps),
   baja el DPR un escalón. Es de una sola dirección: nunca lo vuelve a subir,
   para que no oscile entre dos resoluciones a cada giro de cámara. */
const FLUIDEZ = { tope: 38, ventana: 120, dpr: [1.35, 1.1, 0.9] };
let fluidezEscalon = 0;
let fluidezMuestras = [];
function vigilarFluidez(ms) {
  if (!MOVIL || fluidezEscalon >= FLUIDEZ.dpr.length - 1) return;
  if (ms <= 0 || ms > 500) return;             // pestaña oculta o tirón de carga
  fluidezMuestras.push(ms);
  if (fluidezMuestras.length < FLUIDEZ.ventana) return;
  const mediana = fluidezMuestras.slice().sort((a, b) => a - b)[fluidezMuestras.length >> 1];
  fluidezMuestras = [];
  if (mediana <= FLUIDEZ.tope) return;
  fluidezEscalon += 1;
  DPR_MAX.movil = FLUIDEZ.dpr[fluidezEscalon];
  aplicarDPR(ctx.calidad);
  ctx.setTamano(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  apolo.tiempos.dprMovil = DPR_MAX.movil;
}
ctx.on('geometria', ensuciarSombras);
ctx.on('calidad', ensuciarSombras);

function fotograma() {
  requestAnimationFrame(fotograma);
  const dt = Math.min(reloj.getDelta(), 0.1);
  const t = reloj.elapsedTime;
  vigilarFluidez(dt * 1000);
  camara.update(dt);
  if (edificio) ajustarSombras();
  /* `luz.realce > 0` estaba aquí de cuando el realce SUBÍA EL SOL a 62°: con
     el sol quieto (ver REALCE en luz.js) el realce solo cambia intensidades, y
     el mapa de sombras es de profundidad, no le afecta ni una. Dejarlo obligaba
     a redibujar toda la geometría que proyecta, una vez por cascada y en CADA
     fotograma, durante todo el rato que se está mirando una planta —que es
     justo cuando ahora el mobiliario también proyecta—. Lo que de verdad
     ensucia la sombra ya está cubierto: cámara, fundido de luz, transición del
     corte y el aviso de 'geometria'. */
  const sombraViva = camara.velocidad > 0.01 || !camara.quieta || luz.enTransicion
    || cortes?.enTransicion || sombrasPendientes > 0;
  renderer.shadowMap.needsUpdate = sombraViva;
  if (sombrasPendientes > 0) sombrasPendientes--;
  luz.update(dt);
  cortes?.update(dt);
  actualizarHover();

  post.setVelocidadCamara(camara.velocidad);
  if (luz.enTransicion) post.setMomento({ bloom: luz.actual.bloom, umbral: luz.actual.umbral, bloomRadio: luz.actual.bloomRadio });
  if (apolo.vista === 'vivienda' && post.enfoque != null) post.setEnfoque(camara.distanciaObjetivo);

  /* La atenuación de plantas de cortes cambia los materiales durante ~1,5 s
     tras setPlanta; cuando termina, el trazador vuelve a subirlos una vez. */
  if (t < materialesEnMovimientoHasta) materialesPendientes = true;
  else if (materialesPendientes) { materialesPendientes = false; trazador.actualizarMateriales(); }

  /* Hover y vivienda enfocada se realzan con la envolvente y el bokeh, que
     solo existen en el raster: ahí no se cede el fotograma al trazador. */
  const quieta = !cargando && apolo.floor === 'all' && camara.quieta && !cortes?.enTransicion && !cortes?.provisional
    && !luz.enTransicion && luz.realce === 0 && t >= materialesEnMovimientoHasta && apolo.hover == null && apolo.vista !== 'vivienda';
  const pintado = trazador.update(dt, { quieta });
  if (!pintado) post.render(dt);
  informarTrazado(pintado);
}
function informarTrazado(pintando) {
  const progreso = Math.round(trazador.progreso * 100) / 100;
  const muestras = Math.floor(trazador.muestras);
  if (pintando === ultimoTrazado.pintando && progreso === ultimoTrazado.progreso
    && muestras === ultimoTrazado.muestras && trazador.activo === ultimoTrazado.activo) return;
  Object.assign(ultimoTrazado, { pintando, progreso, muestras, activo: trazador.activo });
  emitir('trazado', { ...ultimoTrazado });
}

/* Levanta el mapa de alturas con lo que hay dentro del ámbito: el entorno
   cercano (terreno, calles, vecinos) y la envolvente de Apolo. El mobiliario
   y las cartelas no cuentan: son de dentro. */
function construirAlturas() {
  const t0 = performance.now();
  rejillaVacia(centroParcelaXZ, RADIO_VISION + 20);
  let mallas = 0;
  /* Solo el entorno cercano y el edificio: ni el cielo de noche ni ninguna
     otra malla auxiliar de la escena, que taparían el mapa entero. */
  for (const raiz of [entorno?.grupo, edificio?.grupo]) {
    if (!raiz) continue;
    raiz.updateMatrixWorld(true);
    raiz.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.userData?.unitId !== undefined) return;
      if (/_lejos$/.test(o.name || '')) return;               // fuera del ámbito por definición
      if (o.userData?.mobiliario) return;                     // muebles: son de dentro, no son muro
      marcarGeometria(o.geometry, o.matrixWorld);
      mallas++;
    });
  }
  apolo.tiempos.alturas = { ms: Math.round(performance.now() - t0), mallas, casillas: alturas.n * alturas.n, paso: REJILLA_PASO };
}

/* ── Carga ── */
const progreso = { luz: 0, edificio: 0, entorno: 0 };
const PESOS = { luz: 0.1, edificio: 0.45, entorno: 0.45 };
function avanzar(etapa, valor) {
  progreso[etapa] = Math.max(progreso[etapa], valor);
  const total = Object.keys(PESOS).reduce((s, k) => s + PESOS[k] * progreso[k], 0);
  emitir('carga', { progreso: Math.min(1, total), etapa: valor >= 1 ? etapa : `${etapa}…` });
}

async function arrancar() {
  const t0 = performance.now();
  emitir('carga', { progreso: 0, etapa: 'inicio' });
  fotograma(); // el cielo ya se ve mientras llega el edificio
  await luz.listo;
  avanzar('luz', 1);

  const [ed, ent] = await Promise.all([
    cargarEdificio(ctx, ACTIVE_BUILDING, { luz, texturaMax: TEXTURA_MAX, onProgreso: (f) => avanzar('edificio', f) }).then((e) => { avanzar('edificio', 1); return e; }),
    cargarEntorno((f) => avanzar('entorno', f)).then((e) => { avanzar('entorno', 1); return e; })
      .catch((err) => { console.warn('[apolo] sin entorno:', err); avanzar('entorno', 1); return null; }),
  ]);
  edificio = ed;
  entorno = ent;
  edificio.caja.getCenter(centroEdificio);
  apolo.units = edificio.units;
  apolo.unitsById = edificio.unitsById;
  apolo.estados = edificio.estados;
  const demo = estadosDemostracion(edificio);
  if (demo) edificio.setEstados(demo);
  post.setGrado(MOMENTOS[apolo.momento].grado);
  edificio.setVentanas(MOMENTOS[apolo.momento].ventana ?? (MOMENTOS[apolo.momento].luces ? 1 : 0));
  edificio.setLuces(NIVEL_LUCES[apolo.momento] ?? 0);

  /* Modelo de SketchUp: sin CSG ni tapas (superficies abiertas), variantes
     precortadas cuando lleguen, caras traseras oscuras y atenuación por cota. */
  /* La cámara no baja del suelo del edificio: el terreno se escalona casi
     cinco metros de un testero al otro, así que el límite se toma del cajón
     que le corresponde a cada punto. */
  construirAlturas();
  camara.setSuelo(sueloTerreno);
  camara.setAmbito({ x: centroParcelaXZ.x, z: centroParcelaXZ.y, radio: RADIO_VISION });
  actualizarVolumen();

  cortes = crearCortes(ctx, edificio, {
    luz, definicion: edificio.definicionCortes, suelos: edificio.suelos,
    csg: false, tapasCSG: false, tapasStencil: false, carasOscuras: true, atenuacionPorCota: true,
    /* Sombra de mobiliario solo en la planta seccionada, y no en el móvil
       (ver cortes.proyectaMobiliario). */
    sombraMobiliario: !MOVIL,
  });
  cortes.setInterior(MOMENTOS[apolo.momento].interior);
  cortes.preparar(); // los hooks de material se añaden antes del primer fotograma con edificio
  actualizarReflectantes();
  repintar();

  // la cámara toma el objetivo antes del primer fotograma con edificio
  encuadrarVista('conjunto', { duracion: 0 });
  ajustarSombras();
  camara.reposoTras(REPOSO_S);
  cargando = false;
  apolo.cargado = true;
  apolo.tiempos.primeraImagenMs = Math.round(performance.now() - t0);
  apolo.tiempos.vidrio = edificio.vidrio;
  emitir('carga', { progreso: 1, etapa: 'listo' });
  emitir('planta', apolo.floor);
  emitir('momento', apolo.momento);

  /* Segundo plano tras la primera imagen: mobiliario y variantes cortadas
     (se registran en cortes según llegan), y los otros tres cielos. */
  edificio.cargarSecundarios({
    /* En el móvil las cuatro plantas cortadas (35 MB de geometría) no se
       descargan de entrada: cada una llega cuando se elige, y mientras tanto
       cortes.js recorta por planos. */
    plantas: MOVIL ? [] : null,
    mobiliario: !MOVIL,
    onProgreso: (f, etapa) => emitir('carga', { progreso: f, etapa, secundaria: true }),
    alMobiliario: (objeto) => { cortes.registrarMobiliario(objeto); ctx.emit('geometria', { mobiliario: true }); },
    alVariante: (clave, objeto) => cortes.registrarVariante(clave, objeto),
  }).then((tiempos) => {
    apolo.tiempos.secundarios = tiempos;
    emitir('carga', { progreso: 1, etapa: 'secundarios', secundaria: true });
  }).catch((e) => console.warn('[apolo] carga secundaria:', e));
  setTimeout(async () => {
    if (MOVIL) return;   // cuatro horneados de cielo y cuatro PMREM bloquean el hilo del teléfono
    try { await luz.precalentar(); } catch (e) { console.warn('[apolo] precalentar luz:', e); }
  }, 2500);
}

arrancar().catch((err) => {
  console.error('[apolo] no se pudo arrancar el visor:', err);
  emitir('carga', { progreso: 1, etapa: 'error', error: String(err?.message || err) });
});
