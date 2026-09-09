/* ═══════════════════════════════════════════════════════════════════════════
   cortes.js — Plantas seccionadas por tramo.

   Elegir una planta muestra todo lo que queda por debajo del plano de corte
   de cada tramo (la planta y las inferiores) y elimina lo de arriba. Dos
   mecanismos, uno detrás del otro:

   (a) Transición (0,8 s): el plano baja desde la cubierta hasta su cota. Se
       hace con `Material.clippingPlanes` (renderer.localClippingEnabled ya
       está a true) y tapas por stencil, siguiendo el ejemplo
       webgl_clipping_stencil de three: para cada tramo, las caras traseras
       incrementan el stencil y las delanteras lo decrementan (sin color ni
       profundidad); donde queda distinto de cero el rayo está DENTRO de un
       sólido, y ahí se pinta un rectángulo oscuro a la cota del corte.
   (b) Al terminar, geometría realmente cortada con three-bvh-csg: cada malla
       que cruza el plano se resta contra un "cortador" (Brush) que va de la
       cota de corte hasta +200 m con la huella del tramo. Con `useGroups`,
       las caras nuevas de la tapa reciben el material `cap` del nivel. Las
       mallas enteramente por encima se ocultan; las de debajo quedan
       intactas. El trazador de rayos no entiende de planos de recorte, y
       por eso hace falta geometría de verdad: al terminar se emite
       ctx.emit('geometria') para que reconstruya su BVH.

   Decisiones donde el contrato deja hueco (documentadas aquí):

   · `crearCortes(ctx, edificio, opciones)` es síncrono como pide el
     contrato; `data/cortes.json` se carga con fetch y `cortes.listo` es la
     Promise de esa carga. `setPlanta` espera a `listo` por su cuenta. Se
     puede pasar `opciones.definicion` (el JSON ya cargado) o `opciones.url`.
   · Las mallas del edificio de Revit vienen por planta y categoría, y cada
     una abarca los CUATRO tramos (x de -55 a 55). Un solo plano por malla
     no puede cortarlas escalonadas, así que durante la transición cada
     malla que cruza el corte se dibuja una vez por tramo con un clon del
     material que lleva los planos laterales de la huella y el horizontal
     (x ≥ x0, x ≤ x1, z ≥ z0, z ≤ z1, y ≤ cota): rebanadas disjuntas que
     juntas son la malla escalonada. Si una malla
     cae en un solo tramo (modelo de SketchUp, mobiliario…) lleva un único
     plano, que es lo que describe el contrato. `edificio.tramoDe(mesh)` se
     usa como tramo principal de respaldo cuando la caja de la malla no
     toca ningún tramo.
   · El stencil de las tapas cuenta caras recortadas SOLO por el plano
     horizontal del tramo (no por los planos x): así el volumen contado es
     cerrado y la paridad es exacta; el rectángulo de la tapa ya se limita a
     la huella del tramo. Un stencil por tramo, y se limpia tras cada tapa.
   · El cortador del CSG no son N cajas sueltas sino UN solo Brush: la unión
     exacta de las cajas de todos los tramos (ver geometriaCortador), con las
     caras teseladas. Una evaluación por malla en vez de N, sin caras
     coplanarias entre cajas vecinas y sin el coste cuadrático del partidor
     de triángulos. Vale para cualquier partición rectangular de la huella
     (los 4 tramos en x de SECTIONS o los 4×2 del SketchUp).
   · Las posiciones del GLB vienen cuantizadas (Int16 + escala en el nodo).
     three-bvh-csg construye el resultado con el MISMO tipo de array que la
     entrada, así que se cortarían a enteros. Por eso cada malla se pasa a
     Float32 en coordenadas de mundo antes de convertirla en Brush; el
     resultado va a la escena con matriz identidad.
   · Mallas cuyo material es `byCat.cap` (las tapas del pipeline, a cotas
     fijas) se ocultan siempre: las tapas las genera este módulo.
   · Atenuación "como hoy": las plantas ESTRICTAMENTE inferiores a la
     activa bajan envMapIntensity un 75 % y el color un 40 % (animateFloors);
     la planta activa queda con su color para que sea la que destaca. La
     losa del nivel superior sigue proyectando sombra invisible
     (colorWrite=false, depthWrite=false) para que el interior seccionado no
     quede bañado por el sol.
   · `alturaCorte(x, z, 'all')` devuelve la cota de la cubierta (finita, útil
     para encuadrar), no Infinity.
   · El orden de los niveles (para saber cuál está debajo de cuál) sale de
     la cota mínima de las mallas de cada nivel, no de sus nombres.
   · Extras no contemplados: `cortes.precalcular(clave)` calcula y guarda el
     CSG de una planta sin aplicarlo, una malla por macrotarea (para calentar
     la caché en reposo sin congelar el visor: el CSG completo de una planta
     de apolo_levels cuesta 1-4 s); `cortes.tiempos` guarda las medidas (ms,
     mallas, triángulos, detalle por malla) por planta.
   · Revisión (contrato del 9-sep, modelo de SketchUp), decisiones añadidas:
     - Vía principal "cambiar de fichero": `cortes.variantes` es un Map
       (clave → Object3D ya en la escena, p. ej. apolo_corte_<k>.glb) que
       puede llegar en `opciones.variantes`, en `edificio.variantes` o
       rellenarse más tarde. Si hay variante para la planta, al terminar la
       transición se muestra ella, se oculta la envolvente entera y NO se
       hace CSG; 'all' oculta todas las variantes. El trazador ve solo lo
       visible. La transición sigue siendo por planos sobre la envolvente.
     - Mobiliario: `MOB_*` (contrato antiguo) y `mob__|puerta__…__y<ymin>`
       (SketchUp) nunca se cortan; se ocultan cuando su ymin queda por
       encima de la cota de corte de su plataforma (`__T<n>__` del nombre,
       si no, la huella que contiene su centro). Puede venir en los niveles
       del edificio o aparte en `opciones.mobiliario` (Object3D o lista).
     - `opciones.carasOscuras`: pinta las mallas del edificio a doble cara
       con las caras traseras en gris muy oscuro (onBeforeCompile encadenado
       con el que ya tuviera el material, p. ej. grano o CSM), que es lo que
       se ve por la boca del corte en modelos sin tapas. Apagado por defecto.
     - Planos de recorte por tramo: cinco (x ≥ x0, x ≤ x1, z ≥ z0, z ≤ z1,
       y ≤ cota); los cuatro laterales solo para mallas que abarcan varios
       tramos. Con solo los dos de x, una partición en z (los 4×2 del
       SketchUp) dibujaba la rebanada de la banda vecina a la cota equivocada.
     - El evaluador CSG pide `uv` cuando la malla lo trae (los materiales con
       textura del SketchUp lo necesitan); el cortador lleva un uv nulo.
     - `cortes.dispose()` deshace todo: clones, stencil, tapas, CSG, brushes,
       y devuelve visibilidad y color a las mallas del edificio.
     - `setPlanta` con la planta ya aplicada y sin transición en curso no
       vuelve a aplicar nada ni emite 'geometria' (evita reconstruir el BVH
       del trazador sin motivo).
   · Modelos de superficies abiertas (SketchUp): tanto el stencil como la
     clasificación del CSG suponen sólidos cerrados con normales hacia
     fuera; con caras sueltas las tapas salen donde no deben (probado con
     assets/serenea/apolo_envolvente.glb). Para esos modelos,
     `opciones.tapasCSG = false` y `opciones.tapasStencil = false` cortan sin
     tapas; el corte en sí (qué queda y qué se va) es correcto igualmente.
   · Integración del modelo de SketchUp (9-sep), añadidos:
     - `opciones.csg = false`: nunca se calcula CSG. Si al terminar la
       transición la variante precortada de esa planta aún no ha llegado
       (se descargan en segundo plano), el recorte por planos se queda en
       su cota final (`cortes.provisional = true`) y en cuanto main llama a
       `registrarVariante(clave, objeto)` se cambia al fichero. El trazador
       no entiende de planos de recorte, así que main no lo arranca mientras
       `provisional` sea true.
     - `registrarMobiliario(objeto)`: el mobiliario llega después de la
       primera imagen; se registra tarde y se le aplica la visibilidad de la
       planta actual. Si `preparar()` aún no ha corrido, espera en cola.
     - `opciones.atenuacionPorCota`: la atenuación de las plantas inferiores
       ya no va por niveles (el SketchUp es un solo nivel) sino en el shader:
       un uniforme con la cota de corte de cada cajón (rejilla de hasta 4
       columnas × 2 filas derivada de las huellas) y un `uAtenuacion` que
       sube a 1 al elegir planta; los fragmentos con worldY < cota − 3,2
       (la planta activa es la franja de 3 m bajo el corte) pierden un 40 %
       de color y un 75 % de entorno. Los uniformes son objetos compartidos
       entre todos los materiales y sus clones: se actualizan una vez.
     - Las caras traseras oscuras van además sin especular (rugosidad 1,
       metalicidad 0 y reflejos a cero) y se saltan los materiales con
       `userData.sinTraseras` (el vidrio: por dentro se vería negro).
     - `preparar()` es público para que main registre los materiales antes
       del primer fotograma con edificio (los hooks recompilan el shader).
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

export const DURACION = 0.8;
const TECHO_CORTADOR = 200;   // el cortador sube hasta aquí: nada del edificio llega
const EPS = 1e-3;
const ORDEN_STENCIL = 1000;   // renderOrder base de las pasadas de stencil y tapas
const CELDA_CORTADOR = 1.5;   // m; teselado del cortador (ver geometriaCortador)

const suavizar = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* Geometría Float32 en coordenadas de mundo (ver cabecera: cuantización). */
function geometriaMundo(mesh) {
  const g = mesh.geometry;
  const salida = new THREE.BufferGeometry();
  for (const nombre of ['position', 'normal', 'uv']) {
    const atr = g.getAttribute(nombre);
    if (!atr) continue;
    const n = nombre === 'uv' ? 2 : 3;
    const datos = new Float32Array(atr.count * n);
    for (let i = 0; i < atr.count; i++) {
      datos[i * n] = atr.getX(i); datos[i * n + 1] = atr.getY(i);
      if (n === 3) datos[i * n + 2] = atr.getZ(i);
    }
    salida.setAttribute(nombre, new THREE.BufferAttribute(datos, n));
  }
  if (g.index) salida.setIndex(g.index.clone());
  salida.applyMatrix4(mesh.matrixWorld);
  if (!salida.getAttribute('normal')) salida.computeVertexNormals();
  return salida;
}

/* Cortador CSG: la unión de las cajas "desde la cota de corte hasta +200 m
   con la huella del tramo" de todos los tramos, emitida como UNA sola
   superficie cerrada con todas sus caras teseladas en celdas de `celda`
   metros. Dos razones para no usar cajas sueltas ni un ExtrudeGeometry:
   · three-bvh-csg parte cada triángulo del cortador contra todos los
     triángulos del edificio que lo atraviesan; una tapa de 30×90 m es un solo
     triángulo cruzado por miles de muros y el partidor se vuelve cuadrático
     (medido en p1__wall: 10-58 s por caja; 1-5 s con celdas de 1,5 m).
   · Restar caja a caja cuesta una evaluación por tramo y por malla, y las
     cajas vecinas comparten caras coplanarias, que es donde un CSG falla.
   Los tramos son rectángulos que no se solapan (una partición en x y z);
   por cada uno: la tapa a su cota (normal −y), y en cada arista un escalón
   hasta la cota del vecino si este corta más alto, o una cara exterior hasta
   el techo donde no hay vecino. Las caras se emiten sueltas (uniones en T
   entre rejillas vecinas): three-bvh-csg clasifica por rayos contra la
   orientación de las caras, no por conectividad, así que lo que importa es
   que todas las normales apunten hacia fuera del sólido. */
export function geometriaCortador(tramos, { celda = 1.5, gruesa = 4, techo = TECHO_CORTADOR, fino = 24 } = {}) {
  const R = tramos.map((t) => ({ ...t }));
  const pos = [], nor = [];
  // valores de a a b en pasos de `paso` hasta a+fino, y de ahí un solo tramo hasta b
  const reticula = (a, b, finoHasta = Infinity, paso = celda) => {
    if (finoHasta <= 0 || b - a < 1e-9) return [a, b];
    const v = [a];
    const tope = Math.min(b, a + finoHasta);
    const n = Math.max(1, Math.ceil((tope - a) / paso));
    for (let i = 1; i <= n; i++) v.push(a + (tope - a) * i / n);
    if (tope < b - 1e-9) v.push(b);
    return v;
  };
  // cara plana: origen + u·s + v·t, con u×v = normal exterior; (su, sv) son cotas ABSOLUTAS a lo largo de u y v
  const cara = (origen, u, v, su, sv, normal) => {
    const P = (a, b) => [origen[0] + u[0] * a + v[0] * b, origen[1] + u[1] * a + v[1] * b, origen[2] + u[2] * a + v[2] * b];
    for (let i = 0; i < su.length - 1; i++) for (let j = 0; j < sv.length - 1; j++) {
      const p00 = P(su[i], sv[j]), p10 = P(su[i + 1], sv[j]), p11 = P(su[i + 1], sv[j + 1]), p01 = P(su[i], sv[j + 1]);
      pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      for (let k = 0; k < 6; k++) nor.push(...normal);
    }
  };
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  /* Aristas de un rectángulo: posición fija (x o z), eje libre (z o x),
     normal exterior y los ejes (u, v) con u×v = normal para las caras
     verticales levantadas sobre ella. */
  const ARISTAS = [
    { fija: 'x', valor: (r) => r.x0, vecino: (q) => q.x1, libre: 'z', normal: [-1, 0, 0], ejes: (o, s, y) => cara(o, Z, Y, s, y, [-1, 0, 0]) },
    { fija: 'x', valor: (r) => r.x1, vecino: (q) => q.x0, libre: 'z', normal: [1, 0, 0], ejes: (o, s, y) => cara(o, Y, Z, y, s, [1, 0, 0]) },
    { fija: 'z', valor: (r) => r.z0, vecino: (q) => q.z1, libre: 'x', normal: [0, 0, -1], ejes: (o, s, y) => cara(o, Y, X, y, s, [0, 0, -1]) },
    { fija: 'z', valor: (r) => r.z1, vecino: (q) => q.z0, libre: 'x', normal: [0, 0, 1], ejes: (o, s, y) => cara(o, X, Y, s, y, [0, 0, 1]) },
  ];
  for (const r of R) {
    cara([0, r.y, 0], X, Z, reticula(r.x0, r.x1), reticula(r.z0, r.z1), [0, -1, 0]);        // tapa: fina, es la que cruza los muros
    cara([0, techo, 0], X, [0, 0, -1], [r.x0, r.x1], [-r.z1, -r.z0], [0, 1, 0]);             // techo: nada lo cruza
    for (const A of ARISTAS) {
      const [a, b] = A.libre === 'z' ? [r.z0, r.z1] : [r.x0, r.x1];
      const origen = A.fija === 'x' ? [A.valor(r), 0, 0] : [0, 0, A.valor(r)];
      let libres = [[a, b]]; // partes de la arista sin vecino
      for (const q of R) {
        if (q === r || Math.abs(A.vecino(q) - A.valor(r)) > 1e-6) continue;
        const [qa, qb] = A.libre === 'z' ? [q.z0, q.z1] : [q.x0, q.x1];
        const oa = Math.max(a, qa), ob = Math.min(b, qb);
        if (ob - oa < 1e-6) continue;
        // escalón: el sólido está de este lado (corta más bajo) entre las dos cotas
        if (q.y > r.y + 1e-6) A.ejes(origen, reticula(oa, ob), reticula(r.y, q.y));
        libres = libres.flatMap(([la, lb]) => {
          const out = [];
          if (oa > la + 1e-6) out.push([la, Math.min(oa, lb)]);
          if (ob < lb - 1e-6) out.push([Math.max(ob, la), lb]);
          return out.filter(([p0, p1]) => p1 - p0 > 1e-6);
        });
      }
      for (const [la, lb] of libres) A.ejes(origen, reticula(la, lb, Infinity, gruesa), reticula(r.y, techo, fino, gruesa)); // cara exterior
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  // uv nulo: el evaluador exige en ambos brushes los atributos que se le piden
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  return g;
}

/* Quita de un resultado CSG los grupos que llevan el material de tapa (para
   modelos de superficies abiertas, donde la clasificación dentro/fuera no es
   fiable y las tapas salen donde no deben). */
function sinTapas(geometria, material, cap) {
  const mats = Array.isArray(material) ? material : [material];
  const grupos = geometria.groups.filter((g) => mats[g.materialIndex] !== cap);
  if (grupos.length === geometria.groups.length) return [geometria, material];
  const idx = geometria.index;
  const total = grupos.reduce((n, g) => n + g.count, 0);
  const nuevoIdx = new (total > 65535 ? Uint32Array : Uint16Array)(total);
  let k = 0;
  for (const g of grupos) for (let i = 0; i < g.count; i++) nuevoIdx[k++] = idx ? idx.getX(g.start + i) : g.start + i;
  const salida = new THREE.BufferGeometry();
  for (const nombre of Object.keys(geometria.attributes)) salida.setAttribute(nombre, geometria.getAttribute(nombre));
  salida.setIndex(new THREE.BufferAttribute(nuevoIdx, 1));
  let inicio = 0;
  for (const g of grupos) { salida.addGroup(inicio, g.count, g.materialIndex); inicio += g.count; }
  return [salida, material];
}

function triangulosDe(geometria) {
  return Math.round((geometria.index ? geometria.index.count : geometria.getAttribute('position').count) / 3);
}

/* Clon de material que conserva lo que Material.clone() pierde: el hook del
   grano de building.js y el de CSM (luz.js), y la clave de caché del
   programa. Sin esto el clon saldría sin sombras en cascada y sin grano. */
function clonarMaterial(origen) {
  const c = origen.clone();
  if (origen.onBeforeCompile) c.onBeforeCompile = origen.onBeforeCompile;
  if (origen.customProgramCacheKey) c.customProgramCacheKey = origen.customProgramCacheKey;
  if (origen.defines) c.defines = { ...origen.defines };
  c.userData = origen.userData; // comparte baseColor/baseEnv
  return c;
}

/* Mobiliario: 'MOB_*' del contrato antiguo o 'mob__|puerta__…__y<ymin>' del
   SketchUp (tools/build_serenea.mjs). ymin es la cota mínima de la pieza; si
   el nombre no la trae, la de su caja. */
const esMobiliario = (mesh) => /^MOB_/.test(mesh.name) || /^(mob|puerta)__/.test(mesh.name);
function yminMobiliario(mesh, caja) {
  /* GLTFLoader sanea los nombres de nodo y les quita los puntos
     (PropertyBinding.sanitizeNodeName): '__y9.06' llega como '__y906'. El
     pipeline escribe siempre dos decimales (toFixed(2)), así que sin punto el
     valor va en centímetros. */
  const m = /__y(-?\d+)(?:\.(\d+))?$/.exec(mesh.name);
  if (!m) return caja.min.y;
  return m[2] != null ? parseFloat(`${m[1]}.${m[2]}`) : parseInt(m[1], 10) / 100;
}

/* Caras traseras en gris muy oscuro (contrato del 9-sep): lo que se ve por la
   boca del corte en modelos sin tapas. Se encadena con el onBeforeCompile que
   ya tenga el material (grano, CSM) y se distingue en la clave del programa. */
const COLOR_TRASERA = 'vec3(0.05, 0.055, 0.06)';
function oscurecerTraseras(material) {
  if (!material || material.userData.carasOscuras || material.userData.sinTraseras) return;
  material.userData.carasOscuras = true;
  material.side = THREE.DoubleSide;
  const previo = material.onBeforeCompile;
  const clavePrevia = material.customProgramCacheKey?.bind(material);
  const textoPrevio = previo ? previo.toString() : '';
  material.onBeforeCompile = function (shader, r) {
    if (previo) previo.call(this, shader, r);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>',
        `#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = ${COLOR_TRASERA};`)
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n  if (!gl_FrontFacing) roughnessFactor = 1.0;')
      .replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\n  if (!gl_FrontFacing) metalnessFactor = 0.0;')
      .replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n  if (!gl_FrontFacing) { reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0); }');
  };
  /* three usa el texto de onBeforeCompile como clave del programa; con el
     envoltorio todas serían iguales, así que se añade el texto del hook
     interior (grano, CSM…) para no compartir shader entre materiales
     distintos. */
  material.customProgramCacheKey = () => `${clavePrevia ? clavePrevia() : ''}|${textoPrevio}|traseras`;
  material.needsUpdate = true;
}

/* Atenuación de las plantas inferiores en el shader (ver cabecera). Los
   uniformes se crean por instancia de cortes y se comparten entre todos los
   materiales que pasan por aquí. */
const GLSL_ATENUACION = /* glsl */`
  varying vec3 vPosMundoCorte;
  uniform float uCortes[8];
  uniform vec3 uBordesX;
  uniform float uBordeZ;
  uniform float uFilasZ;
  uniform float uAtenuacion;
  float atenuacionCorte(vec3 p) {
    float col = step(uBordesX.x, p.x) + step(uBordesX.y, p.x) + step(uBordesX.z, p.x);
    float fila = uFilasZ > 1.5 ? step(uBordeZ, p.z) : 0.0;
    float cota = uCortes[int(col * uFilasZ + fila)];
    return uAtenuacion * (1.0 - smoothstep(cota - 3.4, cota - 3.0, p.y));
  }`;
function crearUniformesAtenuacion() {
  return {
    uCortes: { value: new Float32Array(8).fill(1e6) },
    uBordesX: { value: new THREE.Vector3(1e9, 1e9, 1e9) },
    uBordeZ: { value: 1e9 },
    uFilasZ: { value: 1 },
    uAtenuacion: { value: 0 },
  };
}
function atenuarPorCota(material, uniformes) {
  if (!material || material.userData.atenuacionCorte || !material.isMeshStandardMaterial) return;
  material.userData.atenuacionCorte = true;
  const previo = material.onBeforeCompile;
  const clavePrevia = material.customProgramCacheKey?.bind(material);
  const textoPrevio = previo ? previo.toString() : '';
  material.onBeforeCompile = function (shader, r) {
    if (previo) previo.call(this, shader, r);
    Object.assign(shader.uniforms, uniformes); // los mismos objetos: un cambio llega a todos los programas
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n  varying vec3 vPosMundoCorte;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vPosMundoCorte = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_ATENUACION}`)
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n  float atCorte = atenuacionCorte(vPosMundoCorte);\n  diffuseColor.rgb *= 1.0 - 0.4 * atCorte;')
      .replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n  reflectedLight.indirectSpecular *= 1.0 - 0.75 * atCorte;\n  reflectedLight.indirectDiffuse *= 1.0 - 0.25 * atCorte;');
  };
  material.customProgramCacheKey = () => `${clavePrevia ? clavePrevia() : ''}|${textoPrevio}|atenuacion`;
  material.needsUpdate = true;
}

const aMapa = (v) => (v instanceof Map ? new Map(v) : new Map(Object.entries(v || {})));

export function crearCortes(ctx, edificio, opciones = {}) {
  const { url = 'data/cortes.json', luz = null, tapasCSG = true, tapasStencil = true, carasOscuras = false,
    csg = true, atenuacionPorCota = false } = opciones;
  const { scene } = ctx;
  const uniformesAtenuacion = crearUniformesAtenuacion();
  const atenCota = { valor: 0, objetivo: 0 };
  let celdas = [];                 // [{ indice de uniforme, tramo }] de la rejilla de atenuación

  const grupo = new THREE.Group();
  grupo.name = 'cortes';
  scene.add(grupo);

  const evaluador = new Evaluator();
  evaluador.useGroups = true;
  evaluador.attributes = ['position', 'normal']; // se ajusta por malla: uv solo si la trae (el evaluador exige que existan)

  /* ── Estado ── */
  const cortes = {
    definicion: opciones.definicion || null,
    planta: 'all',
    enTransicion: false,
    provisional: false,  // recorte por planos a la espera de la variante precortada (ver cabecera)
    listo: null,
    tiempos: {},
    grupo,
    tramos: [],          // huellas (x0, x1, z0, z1) comunes a todas las plantas
    techo: 30,           // cota de la cubierta + margen: de aquí baja el plano
    alturas: [],         // cota actual del plano por tramo (durante la transición)
    variantes: aMapa(opciones.variantes || edificio.variantes), // clave → Object3D precortado (puede rellenarse después)
  };
  let aplicada = null;             // última planta aplicada de verdad (aplicarFinal)
  const mobiliarioPendiente = [];  // registrado antes de preparar()

  let piezas = [];                 // una por malla del edificio
  const nivelDeClave = new Map();  // clave → { clave, nivel, mats, minY }
  let nivelesOrdenados = [];       // de abajo arriba
  const cache = new Map();         // clave planta → Map(mesh → Mesh cortada | null)
  const cortadores = new Map();    // clave planta → Brush
  let cortadasActivas = [];        // mallas CSG visibles ahora mismo
  let preparado = false;
  const atenuacion = new Map();    // clave nivel → { valor, objetivo }
  const fantasmas = [];            // losas del nivel superior que solo proyectan sombra
  const trans = { activa: false, t: 0, desde: [], hasta: [], resolver: null, clave: null };

  // Planos por tramo: [x ≥ x0, x ≤ x1, z ≥ z0, z ≤ z1, y ≤ cota]. Un fragmento
  // se descarta cuando queda en el lado negativo de CUALQUIERA de ellos.
  const HORIZONTAL = 4;
  const planos = [];
  const tapas = [];                // rectángulos de tapa por stencil, por tramo
  const matsEstencil = [];         // [trasera, delantera] por tramo
  const matTapa = new THREE.MeshStandardMaterial({
    color: 0x0e1013, roughness: 0.95, metalness: 0,
    stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
  });
  if (luz) luz.aplicarMaterial(matTapa);

  /* ── Definición ── */
  function fijarDefinicion(def) {
    cortes.definicion = def;
    const primera = Object.values(def.plantas)[0] || [];
    cortes.tramos = primera.map((t) => ({ x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1 }));
    cortes.alturas = cortes.tramos.map(() => cortes.techo);
    // planos, materiales de stencil y tapas por tramo
    for (const [i, t] of cortes.tramos.entries()) {
      planos[i] = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -t.x0),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), t.x1),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -t.z0),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), t.z1),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), cortes.techo),
      ];
      const base = { depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true,
        stencilFunc: THREE.AlwaysStencilFunc, clippingPlanes: [planos[i][HORIZONTAL]] };
      matsEstencil[i] = [
        new THREE.MeshBasicMaterial({ ...base, side: THREE.BackSide,
          stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp }),
        new THREE.MeshBasicMaterial({ ...base, side: THREE.FrontSide,
          stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp }),
      ];
      const tapa = new THREE.Mesh(new THREE.PlaneGeometry(t.x1 - t.x0, t.z1 - t.z0), matTapa);
      tapa.rotation.x = -Math.PI / 2;
      tapa.position.set((t.x0 + t.x1) / 2, cortes.techo, (t.z0 + t.z1) / 2);
      tapa.renderOrder = ORDEN_STENCIL + i * 2 + 1;
      tapa.receiveShadow = true;
      tapa.visible = false;
      tapa.name = `tapa-${i}`;
      // el stencil del tramo siguiente parte de cero
      tapa.onAfterRender = (renderer) => renderer.clearStencil();
      tapas[i] = tapa;
      grupo.add(tapa);
    }
    /* Rejilla de la atenuación por cota: columnas por los x0 distintos y
       filas por los z0 distintos de las huellas (hasta 4 × 2; si hay más,
       todas las celdas llevan la media). */
    const bordes = (clave) => [...new Set(cortes.tramos.map((t) => t[clave]))].sort((a, b) => a - b);
    const xs = bordes('x0'), zs = bordes('z0');
    const cabe = xs.length <= 4 && zs.length <= 2;
    const u = uniformesAtenuacion;
    u.uBordesX.value.set(cabe && xs[1] != null ? xs[1] : 1e9, cabe && xs[2] != null ? xs[2] : 1e9, cabe && xs[3] != null ? xs[3] : 1e9);
    u.uBordeZ.value = cabe && zs[1] != null ? zs[1] : 1e9;
    u.uFilasZ.value = cabe ? zs.length : 1;
    celdas = [];
    if (cabe) {
      for (const [c, x0] of xs.entries()) for (const [f, z0] of zs.entries()) {
        const tramo = cortes.tramos.findIndex((t) => t.x0 === x0 && t.z0 === z0);
        if (tramo >= 0) celdas.push({ indice: c * zs.length + f, tramo });
      }
    } else celdas = cortes.tramos.map((_, i) => ({ indice: 0, tramo: i, media: true }));
    actualizarUniformesCorte();
  }
  function actualizarUniformesCorte() {
    const v = uniformesAtenuacion.uCortes.value;
    if (celdas.length && celdas[0].media) {
      v.fill(cortes.alturas.reduce((s, h) => s + h, 0) / Math.max(1, cortes.alturas.length));
      return;
    }
    for (const c of celdas) v[c.indice] = cortes.alturas[c.tramo] ?? cortes.techo;
  }
  if (cortes.definicion) {
    fijarDefinicion(cortes.definicion);
    cortes.listo = Promise.resolve(cortes.definicion);
  } else {
    cortes.listo = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`cortes: no se pudo cargar ${url} (${r.status})`);
      return r.json();
    }).then((def) => { fijarDefinicion(def); return def; });
  }

  const cotasDe = (clave) => (clave === 'all' ? null : cortes.definicion?.plantas?.[clave]?.map((t) => t.y) ?? null);

  function tramoEn(x, z) {
    const T = cortes.tramos;
    let i = T.findIndex((t) => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1);
    if (i >= 0) return i;
    // fuera de toda huella: el tramo más cercano
    let mejor = Infinity;
    T.forEach((t, k) => {
      const dx = Math.max(t.x0 - x, 0, x - t.x1), dz = Math.max(t.z0 - z, 0, z - t.z1);
      const d = dx * dx + dz * dz;
      if (d < mejor) { mejor = d; i = k; }
    });
    return Math.max(0, i);
  }

  /* ── Registro de las mallas del edificio ── */
  function preparar() {
    if (preparado || !cortes.definicion) return;
    preparado = true;
    scene.updateMatrixWorld(true);
    piezas = [];
    let techo = -Infinity;
    for (const [clave, nivel] of edificio.niveles) {
      const byCat = nivel.byCat || {};
      // las tapas del CSG viven en el material cap del nivel: tiene que verse
      if (byCat.cap) {
        // building.js lo crea transparent con opacity 0; como transparente iría
        // a la pasada de transparencias y pisaría el vidrio ya fundido
        Object.assign(byCat.cap, { opacity: 1, transparent: false, depthWrite: true, needsUpdate: true });
        if (luz) luz.aplicarMaterial(byCat.cap);
      }
      const mats = (nivel.mats?.length ? nivel.mats : Object.values(byCat).filter((m) => m && m !== byCat.cap));
      for (const m of mats) prepararMaterial(m);
      const info = { clave, nivel, mats, minY: Infinity };
      nivelDeClave.set(clave, info);
      atenuacion.set(clave, { valor: 0, objetivo: 0 });
      for (const mesh of nivel.meshes || []) {
        if (!mesh?.isMesh) continue;
        const caja = new THREE.Box3().setFromObject(mesh);
        const esTapa = mesh.material === byCat.cap;
        const esMob = esMobiliario(mesh);
        if (esTapa) mesh.visible = false;
        const centro = caja.getCenter(new THREE.Vector3());
        const porNombre = /__T(\d+)__/.exec(mesh.name);
        let tramos = cortes.tramos.map((t, i) => i).filter((i) => {
          const t = cortes.tramos[i];
          return caja.max.x > t.x0 + EPS && caja.min.x < t.x1 - EPS && caja.max.z > t.z0 + EPS && caja.min.z < t.z1 - EPS;
        });
        const principal = (porNombre && cortes.tramos[+porNombre[1]] ? +porNombre[1] : null)
          ?? (typeof edificio.tramoDe === 'function' ? edificio.tramoDe(mesh) : null) ?? tramoEn(centro.x, centro.z);
        if (!tramos.length) tramos = [principal];
        const esLosa = mesh.material === byCat.slab || /__slab$/.test(mesh.name);
        piezas.push({ mesh, clave, nivel: info, caja, tramos, principal, esTapa, esMob, esLosa, ymin: yminMobiliario(mesh, caja),
          visibleBase: mesh.visible, clones: new Map(), estencil: new Map(), brush: null });
        if (!esTapa && !esMob) { techo = Math.max(techo, caja.max.y); info.minY = Math.min(info.minY, caja.min.y); }
      }
    }
    nivelesOrdenados = [...nivelDeClave.values()].sort((a, b) => a.minY - b.minY).map((n) => n.clave);
    if (techo > -Infinity) cortes.techo = techo + 1;
    cortes.alturas = cortes.tramos.map(() => cortes.techo);
    for (const [i, t] of cortes.tramos.entries()) { planos[i][HORIZONTAL].constant = cortes.techo; tapas[i].position.y = cortes.techo; }
    actualizarUniformesCorte();
    // mobiliario aparte (opciones.mobiliario y registrarMobiliario): nunca se corta, solo se oculta por cota
    for (const mob of [opciones.mobiliario, ...mobiliarioPendiente]) if (mob) registrarPiezasMobiliario(mob);
    mobiliarioPendiente.length = 0;
  }

  /* Color y entorno de referencia (atenuación por niveles), caras traseras
     oscuras y atenuación por cota, según las opciones. Idempotente. */
  function prepararMaterial(m) {
    if (!m || !m.color) return;
    if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
    if (m.userData.baseEnv == null) m.userData.baseEnv = m.envMapIntensity ?? 1;
    if (carasOscuras) oscurecerTraseras(m);
    if (atenuacionPorCota) atenuarPorCota(m, uniformesAtenuacion);
  }
  function materialesDe(objeto) {
    const mats = new Set();
    objeto.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m); });
    return mats;
  }

  function registrarPiezasMobiliario(mob) {
    const listaMob = Array.isArray(mob) ? mob : [];
    if (mob && !Array.isArray(mob) && mob.traverse) mob.traverse((o) => { if (o.isMesh) listaMob.push(o); });
    const nuevas = [];
    for (const mesh of listaMob) {
      if (piezas.some((p) => p.mesh === mesh)) continue;
      mesh.updateMatrixWorld(true);
      const caja = new THREE.Box3().setFromObject(mesh);
      const centro = caja.getCenter(new THREE.Vector3());
      const porNombre = /__T(\d+)__/.exec(mesh.name);
      const principal = (porNombre && cortes.tramos[+porNombre[1]] ? +porNombre[1] : null) ?? tramoEn(centro.x, centro.z);
      const p = { mesh, clave: null, nivel: null, caja, tramos: [principal], principal, esTapa: false, esMob: true, esLosa: false,
        ymin: yminMobiliario(mesh, caja), visibleBase: mesh.visible, clones: new Map(), estencil: new Map(), brush: null };
      piezas.push(p);
      nuevas.push(p);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) prepararMaterial(m);
    }
    return nuevas;
  }

  /* ── Transición: clones recortados y stencil ── */
  function clonDe(pieza, i) {
    let clon = pieza.clones.get(i);
    if (clon) return clon;
    const mat = clonarMaterial(pieza.mesh.material);
    // un solo tramo → un solo plano (el del contrato); varios → tres planos por rebanada
    mat.clippingPlanes = pieza.tramos.length > 1 ? planos[i] : [planos[i][HORIZONTAL]];
    mat.clipShadows = true;
    clon = new THREE.Mesh(pieza.mesh.geometry, mat);
    clon.name = `${pieza.mesh.name}__clip${i}`;
    clon.matrixAutoUpdate = false;
    clon.castShadow = pieza.mesh.castShadow;
    clon.receiveShadow = pieza.mesh.receiveShadow;
    clon.raycast = () => {};
    clon.layers.mask = pieza.mesh.layers.mask;
    clon.visible = false;
    if (luz) luz.aplicarMaterial(mat);
    grupo.add(clon);
    pieza.clones.set(i, clon);
    return clon;
  }
  function estencilDe(pieza, i) {
    let par = pieza.estencil.get(i);
    if (par) return par;
    par = matsEstencil[i].map((m) => {
      const s = new THREE.Mesh(pieza.mesh.geometry, m);
      s.matrixAutoUpdate = false;
      s.renderOrder = ORDEN_STENCIL + i * 2;
      s.raycast = () => {};
      s.castShadow = false; s.receiveShadow = false;
      s.visible = false;
      grupo.add(s);
      return s;
    });
    pieza.estencil.set(i, par);
    return par;
  }
  function sincronizarClon(clon, pieza) {
    clon.matrix.copy(pieza.mesh.matrixWorld);
    clon.matrixWorld.copy(pieza.mesh.matrixWorld);
    const m = clon.material, o = pieza.mesh.material;
    if (m.color && o.color) m.color.copy(o.color);
    if (o.envMapIntensity != null) m.envMapIntensity = o.envMapIntensity;
    if (o.opacity != null) m.opacity = o.opacity;
    if (o.emissiveIntensity != null && m.emissiveIntensity != null) m.emissiveIntensity = o.emissiveIntensity;
  }

  function aplicarRecorte() {
    const h = cortes.alturas;
    for (const [i, t] of cortes.tramos.entries()) {
      planos[i][HORIZONTAL].constant = h[i];
      tapas[i].position.y = h[i];
    }
    const cruzan = cortes.tramos.map(() => false);
    for (const p of piezas) {
      if (p.esTapa || !p.visibleBase) continue;
      if (p.esMob) { p.mesh.visible = p.ymin < h[p.principal] - EPS; continue; }
      const hs = p.tramos.map((i) => h[i]);
      const min = Math.min(...hs), max = Math.max(...hs);
      let modo;
      if (p.caja.max.y <= min + EPS) modo = 'debajo';
      else if (p.caja.min.y >= max - EPS) modo = 'encima';
      else modo = 'cruza';
      p.mesh.visible = modo === 'debajo';
      for (const i of p.tramos) {
        const necesita = modo === 'cruza';
        const clon = necesita ? clonDe(p, i) : p.clones.get(i);
        if (clon) { clon.visible = necesita; if (necesita) sincronizarClon(clon, p); }
        // stencil solo para las mallas que de verdad atraviesan el plano de ese tramo
        const corta = tapasStencil && necesita && p.caja.min.y < h[i] - EPS && p.caja.max.y > h[i] + EPS;
        const par = corta ? estencilDe(p, i) : p.estencil.get(i);
        if (par) for (const s of par) { s.visible = corta; if (corta) { s.matrix.copy(p.mesh.matrixWorld); s.matrixWorld.copy(p.mesh.matrixWorld); } }
        if (corta) cruzan[i] = true;
      }
    }
    for (const [i, tapa] of tapas.entries()) tapa.visible = cruzan[i] && h[i] < cortes.techo - EPS;
  }

  function ocultarTransitorios() {
    for (const p of piezas) {
      for (const c of p.clones.values()) c.visible = false;
      for (const par of p.estencil.values()) for (const s of par) s.visible = false;
    }
    for (const t of tapas) t.visible = false;
  }

  /* ── CSG ── */
  function cortadorDe(clave) {
    let b = cortadores.get(clave);
    if (b) return b;
    b = new Brush(geometriaCortador(cortes.definicion.plantas[clave], { celda: CELDA_CORTADOR }));
    b.updateMatrixWorld(true);
    cortadores.set(clave, b);
    return b;
  }

  function cortarMalla(pieza, clave, detalle) {
    const tA = performance.now();
    if (!pieza.brush) {
      pieza.brush = new Brush(geometriaMundo(pieza.mesh), pieza.mesh.material);
      pieza.brush.updateMatrixWorld(true);
      pieza.brush.prepareGeometry(); // BVH + semiaristas: se calcula una vez por malla y sirve para todas las plantas
    }
    const tB = performance.now();
    pieza.brush.material = pieza.mesh.material;
    const cap = pieza.nivel.nivel.byCat?.cap || matTapa;
    const cortador = cortadorDe(clave);
    cortador.material = cap; // con useGroups, las caras nuevas heredan el material del cortador
    evaluador.attributes = pieza.brush.geometry.hasAttribute('uv') ? ['position', 'normal', 'uv'] : ['position', 'normal'];
    const resultado = evaluador.evaluate(pieza.brush, cortador, SUBTRACTION);
    if (detalle) detalle.push({ malla: pieza.mesh.name, preparacionMs: Math.round(tB - tA), csgMs: Math.round(performance.now() - tB),
      triangulos: triangulosDe(pieza.mesh.geometry) });
    let geometria = resultado.geometry, material = resultado.material;
    if (!tapasCSG) [geometria, material] = sinTapas(geometria, material, cap);
    const pos = geometria.getAttribute('position');
    if (!pos || pos.count === 0) return null;
    const m = new THREE.Mesh(geometria, material);
    m.name = `${pieza.mesh.name}__corte-${clave}`;
    m.castShadow = pieza.mesh.castShadow;
    m.receiveShadow = pieza.mesh.receiveShadow;
    m.raycast = pieza.mesh.raycast;
    m.layers.mask = pieza.mesh.layers.mask;
    m.visible = false;
    grupo.add(m);
    return m;
  }

  /* Piezas que cruzan el corte de una planta (las demás quedan intactas u
     ocultas sin CSG). */
  function piezasQueCruzan(clave) {
    const cotas = cotasDe(clave);
    return piezas.filter((p) => {
      if (p.esTapa || p.esMob || !p.visibleBase) return false;
      const hs = p.tramos.map((i) => cotas[i]);
      return !(p.caja.max.y <= Math.min(...hs) + EPS || p.caja.min.y >= Math.max(...hs) - EPS);
    });
  }
  const parciales = new Map(); // clave → { mapa, detalle, ms } a medio calcular (precalcular asíncrono)
  function parcialDe(clave) {
    if (!parciales.has(clave)) parciales.set(clave, { mapa: new Map(), detalle: [], ms: 0 });
    return parciales.get(clave);
  }
  function cortarPieza(p, clave, parcial) {
    if (parcial.mapa.has(p.mesh)) return;
    const t0 = performance.now();
    parcial.mapa.set(p.mesh, cortarMalla(p, clave, parcial.detalle));
    parcial.ms += performance.now() - t0;
  }
  function cerrarCalculo(clave, parcial) {
    let triEntrada = 0, triSalida = 0;
    for (const [mesh, cortada] of parcial.mapa) {
      triEntrada += triangulosDe(mesh.geometry);
      if (cortada) triSalida += triangulosDe(cortada.geometry);
    }
    cortes.tiempos[clave] = { csgMs: Math.round(parcial.ms), mallas: parcial.mapa.size, triangulosEntrada: triEntrada,
      triangulosSalida: triSalida, detalle: parcial.detalle };
    cache.set(clave, parcial.mapa);
    parciales.delete(clave);
    return parcial.mapa;
  }
  function calcular(clave) {
    preparar();
    if (cache.has(clave)) return cache.get(clave);
    const parcial = parcialDe(clave);
    for (const p of piezasQueCruzan(clave)) cortarPieza(p, clave, parcial);
    return cerrarCalculo(clave, parcial);
  }

  /* ── Estado final de una planta ── */
  function fantasmasPara(clave) {
    for (const f of fantasmas) f.visible = false;
    if (clave === 'all') return;
    const k = nivelesOrdenados.indexOf(clave);
    const superior = k >= 0 ? nivelesOrdenados[k + 1] : null;
    if (!superior) return;
    for (const p of piezas) {
      if (p.clave !== superior || !p.esLosa || p.esTapa) continue;
      if (!p.fantasma) {
        p.fantasma = new THREE.Mesh(p.mesh.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
        p.fantasma.name = `${p.mesh.name}__fantasma`;
        p.fantasma.matrixAutoUpdate = false;
        p.fantasma.castShadow = true;
        p.fantasma.receiveShadow = false;
        p.fantasma.raycast = () => {};
        grupo.add(p.fantasma);
        fantasmas.push(p.fantasma);
      }
      p.fantasma.matrix.copy(p.mesh.matrixWorld);
      p.fantasma.matrixWorld.copy(p.mesh.matrixWorld);
      p.fantasma.visible = true;
    }
  }

  function aplicarFinal(clave) {
    preparar();
    for (const m of cortadasActivas) m.visible = false;
    cortadasActivas = [];
    const cotas = cotasDe(clave);
    // vía principal del contrato: fichero precortado si lo hay; si no, CSG
    const variante = cotas ? cortes.variantes.get(clave) : null;
    for (const [k, v] of cortes.variantes) if (v) v.visible = v === variante;
    cortes.alturas = cotas ? cotas.slice() : cortes.tramos.map(() => cortes.techo);
    actualizarUniformesCorte();
    /* Sin CSG y sin variante todavía: el recorte por planos se queda en su
       cota final hasta que registrarVariante traiga el fichero. */
    cortes.provisional = !!(cotas && !variante && !csg);
    if (cortes.provisional) {
      for (const p of piezas) if (!p.esTapa && !p.esMob) p.mesh.visible = p.visibleBase;
      aplicarRecorte();
      fantasmasPara(clave);
      aplicada = clave;
      ctx.emit('geometria', { planta: clave });
      return;
    }
    ocultarTransitorios();
    const mapa = cotas && !variante ? calcular(clave) : null;
    for (const p of piezas) {
      if (p.esTapa) { p.mesh.visible = false; continue; }
      if (!p.visibleBase) continue;
      if (p.esMob) { p.mesh.visible = !cotas || p.ymin < cotas[p.principal] - EPS; continue; }
      if (!cotas) { p.mesh.visible = true; continue; }
      if (variante) { p.mesh.visible = false; continue; }
      if (mapa.has(p.mesh)) {
        p.mesh.visible = false;
        const c = mapa.get(p.mesh);
        if (c) { c.visible = true; cortadasActivas.push(c); }
        continue;
      }
      const hs = p.tramos.map((i) => cotas[i]);
      p.mesh.visible = p.caja.max.y <= Math.min(...hs) + EPS; // si no, entera por encima
    }
    fantasmasPara(clave);
    aplicada = clave;
    ctx.emit('geometria', { planta: clave });
  }

  function fijarObjetivosAtenuacion(clave) {
    atenCota.objetivo = clave !== 'all' ? 1 : 0;
    const k = nivelesOrdenados.indexOf(clave);
    for (const [nivel, a] of atenuacion) {
      const j = nivelesOrdenados.indexOf(nivel);
      a.objetivo = !atenuacionPorCota && clave !== 'all' && k >= 0 && j < k ? 1 : 0;
    }
  }

  function terminarTransicion() {
    trans.activa = false;
    cortes.enTransicion = false;
    aplicarFinal(trans.clave);
    const r = trans.resolver; trans.resolver = null;
    if (r) r(trans.clave);
  }

  /* ── API ── */
  Object.assign(cortes, {
    setPlanta(clave, { animar = true, duracion = DURACION } = {}) {
      if (clave !== 'all' && !cortes.definicion) {
        return cortes.listo.then(() => cortes.setPlanta(clave, { animar, duracion }));
      }
      if (clave !== 'all' && !cortes.definicion.plantas[clave]) {
        return Promise.reject(new Error(`cortes: planta desconocida "${clave}"`));
      }
      preparar();
      const anterior = cortes.planta;
      cortes.planta = clave;
      fijarObjetivosAtenuacion(clave);
      // una transición nueva interrumpe la anterior: se parte de lo que se ve ahora
      if (trans.activa && trans.resolver) { const r = trans.resolver; trans.resolver = null; r(anterior); }
      const hasta = cotasDe(clave) || cortes.tramos.map(() => cortes.techo);
      if (clave === anterior && clave === aplicada && !trans.activa) return Promise.resolve(clave);
      if (!animar || duracion <= 0 || (clave === anterior && !trans.activa)) {
        trans.activa = false;
        cortes.enTransicion = false;
        aplicarFinal(clave);
        return Promise.resolve(clave);
      }
      return new Promise((resolver) => {
        trans.activa = true; trans.t = 0; trans.duracion = duracion; trans.clave = clave;
        trans.desde = cortes.alturas.slice();
        trans.hasta = hasta;
        trans.resolver = resolver;
        cortes.enTransicion = true;
        cortes.provisional = false;
        // durante la transición manda el recorte: fuera la geometría CSG
        for (const m of cortadasActivas) m.visible = false;
        cortadasActivas = [];
        for (const v of cortes.variantes.values()) if (v) v.visible = false;
        for (const p of piezas) if (!p.esTapa && !p.esMob) p.mesh.visible = p.visibleBase;
        fantasmasPara(clave);
        aplicarRecorte();
      });
    },

    /* Deshace todo lo que el módulo ha puesto en la escena y devuelve las
       mallas del edificio a su estado (visibilidad, color, envMapIntensity).
       Las variantes precortadas no son suyas: solo las deja ocultas. */
    dispose() {
      trans.activa = false; cortes.enTransicion = false;
      if (trans.resolver) { const r = trans.resolver; trans.resolver = null; r(cortes.planta); }
      for (const p of piezas) {
        p.mesh.visible = p.visibleBase;
        for (const c of p.clones.values()) c.material.dispose();
        p.brush?.geometry.dispose();
        p.fantasma?.material.dispose();
      }
      for (const mapa of [...cache.values(), ...[...parciales.values()].map((x) => x.mapa)]) {
        for (const m of mapa.values()) m?.geometry.dispose();
      }
      for (const b of cortadores.values()) b.geometry.dispose();
      for (const t of tapas) t.geometry.dispose();
      for (const par of matsEstencil) for (const m of par) m.dispose();
      matTapa.dispose();
      for (const [clave, a] of atenuacion) {
        for (const m of nivelDeClave.get(clave)?.mats || []) {
          if (m.userData.baseColor && m.color) m.color.copy(m.userData.baseColor);
          if (m.userData.baseEnv != null && m.envMapIntensity != null) m.envMapIntensity = m.userData.baseEnv;
        }
        a.valor = a.objetivo = 0;
      }
      for (const v of cortes.variantes.values()) if (v) v.visible = false;
      uniformesAtenuacion.uAtenuacion.value = 0;
      atenCota.valor = atenCota.objetivo = 0;
      grupo.clear();
      scene.remove(grupo);
      cache.clear(); parciales.clear(); cortadores.clear(); piezas = []; fantasmas.length = 0;
      preparado = false; aplicada = null; cortes.planta = 'all'; cortes.provisional = false;
    },

    /* Variante precortada que llega tarde (segundo plano): si es la planta
       que se está viendo de forma provisional, se cambia al fichero ya. */
    registrarVariante(clave, objeto) {
      if (!objeto) return;
      for (const m of materialesDe(objeto)) prepararMaterial(m);
      objeto.visible = false;
      cortes.variantes.set(clave, objeto);
      if (aplicada === clave && !trans.activa) aplicarFinal(clave);
    },

    registrarMobiliario(objeto) {
      if (!objeto) return;
      if (!preparado) { mobiliarioPendiente.push(objeto); return; }
      const nuevas = registrarPiezasMobiliario(objeto);
      const h = cortes.alturas;
      for (const p of nuevas) p.mesh.visible = p.visibleBase && p.ymin < h[p.principal] - EPS;
    },

    preparar,

    update(dt) {
      if (!preparado) return;
      // atenuación de las plantas inferiores, con la misma rampa que animateFloors
      const k = Math.min(1, dt * 4.5);
      if (atenuacionPorCota) {
        if (atenCota.valor !== atenCota.objetivo) {
          atenCota.valor = Math.abs(atenCota.objetivo - atenCota.valor) < 0.002 ? atenCota.objetivo : atenCota.valor + (atenCota.objetivo - atenCota.valor) * k;
          uniformesAtenuacion.uAtenuacion.value = atenCota.valor;
        }
        if (trans.activa) actualizarUniformesCorte();
      }
      for (const [clave, a] of atenuacion) {
        if (a.valor === a.objetivo) continue;
        a.valor = Math.abs(a.objetivo - a.valor) < 0.002 ? a.objetivo : a.valor + (a.objetivo - a.valor) * k;
        for (const m of nivelDeClave.get(clave).mats) {
          if (m.userData.baseEnv != null && m.envMapIntensity != null) m.envMapIntensity = m.userData.baseEnv * (1 - 0.75 * a.valor);
          if (m.userData.baseColor && m.color) m.color.copy(m.userData.baseColor).multiplyScalar(1 - 0.4 * a.valor);
        }
      }
      if (!trans.activa) return;
      trans.t += dt;
      const s = suavizar(Math.min(1, trans.t / trans.duracion));
      cortes.alturas = trans.desde.map((d, i) => d + (trans.hasta[i] - d) * s);
      aplicarRecorte();
      if (trans.t >= trans.duracion) terminarTransicion();
    },

    alturaCorte(x, z, clave = cortes.planta) {
      if (clave === 'all' || !cortes.definicion) return cortes.techo;
      const T = cortes.definicion.plantas[clave];
      if (!T) return cortes.techo;
      return T[tramoEn(x, z)]?.y ?? cortes.techo;
    },

    /* Calienta la caché de una planta sin aplicarla. Con `asincrono` corta
       una malla por macrotarea para no congelar el visor; si mientras tanto
       alguien pide esa planta, calcular() termina lo que falte de golpe. */
    async precalcular(clave, { asincrono = true } = {}) {
      if (clave === 'all') return null;
      await cortes.listo;
      if (!cortes.definicion.plantas[clave]) return null;
      preparar();
      if (!cache.has(clave)) {
        if (!asincrono) calcular(clave);
        else {
          const parcial = parcialDe(clave);
          for (const p of piezasQueCruzan(clave)) {
            if (cache.has(clave)) break;
            cortarPieza(p, clave, parcial);
            await new Promise((r) => setTimeout(r, 0));
          }
          if (!cache.has(clave)) cerrarCalculo(clave, parcial);
        }
      }
      return cortes.tiempos[clave];
    },

    tramoEn,
  });

  return cortes;
}
