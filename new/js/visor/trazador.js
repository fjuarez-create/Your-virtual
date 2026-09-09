/* ═══════════════════════════════════════════════════════════════════════════
   trazador.js — Trazado de rayos progresivo en reposo (three-gpu-pathtracer).

   Cuando la cámara se queda quieta ≥ 300 ms y no hay transiciones, el
   WebGLPathTracer acumula muestras sobre una copia FILTRADA de la escena y
   el resultado se funde sobre el raster en 0,3 s. Cualquier movimiento
   vuelve al raster y reinicia la acumulación.

   Decisiones donde el contrato deja hueco (o donde me aparto de él):

   · BVH en un worker propio. `setSceneAsync` exige `setBVHWorker`, y los
     workers de three-mesh-bvh no vienen en el vendor. Además Chromium no
     resuelve import maps dentro de un worker, así que el worker se fabrica
     en caliente: se descarga el texto de `three-mesh-bvh.js`, se reescribe
     `from "three"` a la URL absoluta que da `import.meta.resolve('three')`
     y se carga como Blob de módulo. El worker construye el BVH (con
     progreso) y devuelve raíces + búfer indirecto, que se deserializan con
     el MeshBVH del vendor: el trazador solo lee `_roots`, `_indirectBuffer`,
     `indirect` y `geometry`, así que le vale. Si el worker no se puede crear
     (sin fetch, política CSP…), se cae a `setScene` síncrono, que bloquea
     el hilo un par de segundos pero funciona. La fusión de geometrías previa
     al BVH (StaticGeometryGenerator) sigue siendo síncrona: es lo que hay.

   · `dynamicLowRes` apagado por defecto (el contrato lo pide encendido).
     Con esa opción la biblioteca sustituye el raster por un trazado a 1/4
     de resolución y una muestra —pixelado y ruidoso— durante las primeras
     muestras y el fundido, y solo pinta el raster mientras compila. Con
     ella apagada hace exactamente lo que pide el punto (4) del contrato:
     dibuja el raster debajo (vía `rasterizeSceneCallback`) y el trazado
     encima con la opacidad creciente de su material de mezcla. Se puede
     encender con `opciones.bajaResDinamica`.

   · Raster debajo del fundido: `trazador.setRaster(fn)`. main debe pasar
     `(dt) => post.render(dt)` para que el fundido arranque desde la misma
     imagen con post-procesado; sin él se usa `renderer.render(scene, camera)`
     de la escena real (con cielo, nubes y cartelas, pero sin post).

   · Cartelas: en reposo el fotograma lo pinta el trazador y post no corre,
     así que este módulo repite la pasada de la capa 1 (sin tone mapping ni
     post, como en new/js/main.js) encima del trazado. `opciones.cartelas`
     la desactiva.

   · `luz` se lee como un objeto plano `{ equirect, envMapIntensity?, sol? }`
     para no acoplarse a luz.js (que se escribe en paralelo):
     - `equirect`: DataTexture equirectangular con `image.data` (Float o
       Half). Sin ella no hay cielo en el trazado; se usa como fondo y como
       entorno de la escena filtrada.
     - `envMapIntensity`: si falta, `scene.environmentIntensity`.
     - `sol`: la DirectionalLight que se copia al trazado (solo esa, para no
       contar tres veces las cascadas del CSM). Si falta, se toma la primera
       DirectionalLight visible de la escena. `opciones.factorSol` la escala
       (0 = el sol sale solo del disco de la equirect).

   · Filtro de mallas: `traverseVisible` de la escena, solo `Mesh` (no
     sprites, puntos, líneas ni InstancedMesh, que el generador no
     transforma), solo capa 0, solo MeshStandard/MeshPhysical (con material
     múltiple, todos), y se descartan los materiales con `colorWrite=false`
     (losas fantasma de cortes) y los transparentes con opacidad < 0,02
     (envolventes de vivienda y tapas apagadas): el trazador no tiene
     "invisible pero proyecta sombra", y un material transparente al 0 % solo
     engorda el BVH. Los clones comparten geometría y material: la escena
     filtrada no cuesta memoria.

   · Teselas por fotograma: cada `renderSample()` pinta UNA tesela (1/9 de
     muestra). Para converger en 1-3 s en una RTX se pintan 3 por fotograma
     en 'alta' (una fila) y 1 en 'media'; `opciones.teselasPorFotograma`.

   · `invalidar()` reinicia el trazado en el acto (lo que hay en pantalla ya
     no corresponde a la escena) y reconstruye en la próxima pausa. Se
     suscribe también a `ctx.on('geometria')`, que es lo que emite cortes.js.

   · Geometrías cuantizadas. Los GLB de Revit llevan KHR_mesh_quantization
     (posiciones Int16 normalizadas y escala en el nodo). El generador del
     trazador clona cada atributo conservando tipo y normalización y escribe
     las coordenadas de MUNDO en ese Int16: el edificio queda cuantizado a
     enteros (metros) y el tipo del atributo fusionado depende del orden por
     uuid, así que el BVH ni coincide con la textura de posiciones ni es
     determinista (medido: imagen negra con el worker, geometría de escalera
     con el camino síncrono). `geometriaFlotante()` entrega al trazador una
     copia con posición/normal/tangente en Float32 (índice y demás atributos
     compartidos), cacheada por geometría.

   · Al cambiar `luz.equirect` o `envMapIntensity` (momento del día) solo se
     llama a `updateEnvironment()`: la tabla de muestreo se recalcula en CPU
     (unos 50-100 ms con 2048×1024) y no se toca el BVH. El sol también se
     resincroniza en 'momento' y al entrar en reposo (dirección, color e
     intensidad de `luz.sol`) con `updateLights()`, que solo reescribe la
     textura de luces: luz.js mueve el sol con cada momento y sin esto el
     trazado conservaría las sombras del momento en que se construyó el BVH.

   · `actualizarMateriales()` (hueco del contrato): hover, selección o
     ventanas encendidas cambian color/emisivo de materiales ya conocidos
     por el trazador; `updateMaterials()` los vuelve a subir sin tocar el
     BVH (milisegundos frente a segundos de `invalidar()`). Se suscribe
     también a `ctx.on('materiales')` por si edificio.js lo emite.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { MeshBVH } from 'three-mesh-bvh';

const CALIDADES = {
  alta:  { renderScale: 1,    bounces: 4, teselasPorFotograma: 3 },
  media: { renderScale: 0.75, bounces: 3, teselasPorFotograma: 1 },
};
const ESPERA_REPOSO = 0.3;  // s quieta antes de arrancar
const FUNDIDO_MS = 700;     // raster → trazado (largo, para que el grano no salte a la vista)

/* ── Worker de BVH ─────────────────────────────────────────────────────── */

/* Cuerpo del worker. Se serializa con toString(), así que no puede cerrar
   sobre nada del módulo: recibe las clases por parámetro. */
function cuerpoWorker(MeshBVH, BufferGeometry, BufferAttribute) {
  self.onmessage = (e) => {
    const { id, position, index, groups, drawRange, opciones } = e.data;
    try {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(position, 3));
      if (index) g.setIndex(new BufferAttribute(index, 1));
      for (const gr of groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
      g.setDrawRange(drawRange.start, drawRange.count);
      let ultimo = -1;
      const t0 = performance.now();
      const bvh = new MeshBVH(g, {
        ...opciones,
        // solo se avisa cada 1 %: con 400k triángulos el callback se llama decenas de miles de veces
        onProgress: (p) => { if (p - ultimo >= 0.01 || p >= 1) { ultimo = p; self.postMessage({ id, progreso: p }); } },
      });
      const ser = MeshBVH.serialize(bvh, { cloneBuffers: false });
      const transferibles = [...ser.roots];
      if (ser.indirectBuffer) transferibles.push(ser.indirectBuffer.buffer);
      self.postMessage({ id, roots: ser.roots, indirectBuffer: ser.indirectBuffer || null, ms: performance.now() - t0 }, transferibles);
    } catch (err) {
      self.postMessage({ id, error: String((err && err.message) || err) });
    }
  };
  self.postMessage({ listo: true });
}

export async function crearWorkerBVH() {
  const urlThree = import.meta.resolve('three');
  const urlBVH = import.meta.resolve('three-mesh-bvh');
  const texto = await (await fetch(urlBVH)).text();
  const reescrito = texto.replace(/from\s*["']three["']/g, `from"${urlThree}"`);
  const alias = reescrito.match(/export\s*\{[^}]*?\b(\w+) as MeshBVH\b/)?.[1];
  if (!alias) throw new Error('trazador: no encuentro MeshBVH en el bundle de three-mesh-bvh');
  const fuente = `import { BufferGeometry as BG_, BufferAttribute as BA_ } from "${urlThree}";\n${reescrito}\n;(${cuerpoWorker.toString()})(${alias}, BG_, BA_);`;
  const url = URL.createObjectURL(new Blob([fuente], { type: 'text/javascript' }));
  const worker = new Worker(url, { type: 'module' });
  await new Promise((ok, ko) => {
    worker.onmessage = (e) => { if (e.data?.listo) ok(); };
    worker.onerror = (e) => ko(new Error(e.message || 'el worker de BVH no arranca'));
  });
  URL.revokeObjectURL(url);
  return worker;
}

/* Adaptador con la interfaz que espera PathTracingSceneGenerator.setBVHWorker:
   generate(geometry, opciones) → Promise<MeshBVH>. */
export function crearAdaptadorBVH(worker) {
  let contador = 0;
  return {
    generate(geometry, opciones = {}) {
      return new Promise((ok, ko) => {
        const id = ++contador;
        const { onProgress, maxLeafTris, targetLeafSize, strategy, indirect } = opciones;
        // copias, no transferencias: el generador sigue usando los búferes originales
        const position = geometry.attributes.position.array.slice();
        const index = geometry.index ? geometry.index.array.slice() : null;
        worker.onmessage = (e) => {
          if (e.data.id !== id) return;
          if (e.data.progreso !== undefined) { onProgress?.(e.data.progreso); return; }
          if (e.data.error) { ko(new Error(e.data.error)); return; }
          const bvh = MeshBVH.deserialize(
            { version: 1, roots: e.data.roots, index: null, indirectBuffer: e.data.indirectBuffer },
            geometry, { setIndex: false, indirect: !!e.data.indirectBuffer },
          );
          bvh.userData = { ms: e.data.ms };
          ok(bvh);
        };
        worker.onerror = (e) => ko(new Error(e.message || 'fallo en el worker de BVH'));
        worker.postMessage({
          id, position, index,
          groups: geometry.groups.map((g) => ({ start: g.start, count: g.count, materialIndex: g.materialIndex })),
          drawRange: { start: geometry.drawRange.start, count: geometry.drawRange.count },
          opciones: { strategy: strategy ?? 2, targetLeafSize: maxLeafTris ?? targetLeafSize ?? 1, indirect: indirect ?? true, verbose: false },
        }, [position.buffer, ...(index ? [index.buffer] : [])]);
      });
    },
    dispose() { worker.terminate(); },
  };
}

/* ── Geometría en coma flotante ────────────────────────────────────────── */

const cacheFlotante = new WeakMap();
const necesitaFlotante = (a) => !!a && (!(a.array instanceof Float32Array) || a.normalized);

/* Devuelve la misma geometría si ya es Float32, o una copia con posición,
   normal y tangente desquantizadas (getComponent aplica la normalización).
   El índice y el resto de atributos se comparten: no se duplican. */
export function geometriaFlotante(geo) {
  const { position, normal, tangent } = geo.attributes;
  if (!necesitaFlotante(position) && !necesitaFlotante(normal) && !necesitaFlotante(tangent)) return geo;
  let g = cacheFlotante.get(geo);
  if (g) return g;
  g = new THREE.BufferGeometry();
  g.name = geo.name;
  if (geo.index) g.setIndex(geo.index);
  for (const [k, a] of Object.entries(geo.attributes)) {
    if ((k === 'position' || k === 'normal' || k === 'tangent') && necesitaFlotante(a)) {
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
      g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
    } else {
      g.setAttribute(k, a);
    }
  }
  g.groups = geo.groups;
  g.drawRange = geo.drawRange;
  g.boundingBox = geo.boundingBox;
  g.boundingSphere = geo.boundingSphere;
  cacheFlotante.set(geo, g);
  return g;
}

/* ── Módulo ────────────────────────────────────────────────────────────── */

export function crearTrazador(ctx, luz, opciones = {}) {
  const { renderer, scene, camera } = ctx;
  const conf = {
    bajaResDinamica: false,
    cartelas: true,
    factorSol: 1,
    teselasPorFotograma: null, // null → según calidad
    enMedia: false,            // permitir el trazador también en calidad 'media'
    sinWorker: false,          // depuración: BVH síncrono en el hilo principal
    ...opciones,
  };

  const pt = new WebGLPathTracer(renderer);
  pt.renderToCanvas = true;
  pt.rasterizeScene = true;
  pt.dynamicLowRes = conf.bajaResDinamica;
  pt.minSamples = 12;   // con menos muestras la imagen es grano puro y se nota el cambio
  pt.fadeDuration = FUNDIDO_MS;
  pt.renderDelay = 0;          // la espera de 300 ms ya la pone este módulo
  pt.tiles.set(3, 3);
  pt.bounces = 4;
  pt.filterGlossyFactor = 0.5;
  pt.renderScale = 1;
  pt.textureSize.set(1024, 1024);

  /* La escena filtrada es una Scene de verdad porque el trazador lee de
     ella background/environment y sus intensidades. Sus hijos son clones
     ligeros (misma geometría, mismo material) con la matriz de mundo del
     original congelada. */
  const escenaTrazado = new THREE.Scene();
  escenaTrazado.name = 'trazado';

  let pintarRaster = (/* dt */) => renderer.render(scene, camera);
  let dtActual = 0;
  pt.rasterizeSceneCallback = () => pintarRaster(dtActual);

  const estado = {
    invalidado: true, construyendo: false, listo: false, enReposo: false,
    tQuieta: 0, entorno: null, entornoIntensidad: null,
    adaptador: null, workerFallido: false,
    dispuesto: false, firmaSol: '',
  };

  const trazador = {
    activo: false,
    muestras: 0,
    progreso: 0,
    pt,
    escena: escenaTrazado,
    ultimaConstruccion: null,   // { mallas, excluidas, triangulos, msTotal, msBVH, modo }
    setRaster(fn) { pintarRaster = fn || ((/* dt */) => renderer.render(scene, camera)); },
    invalidar() {
      if (estado.dispuesto) return;
      estado.invalidado = true;
      trazador.progreso = 0;
      if (estado.enReposo) { pt.reset(); estado.enReposo = false; }
    },
    /* Materiales cambiados (hover, selección, ventanas): re-subir sus
       propiedades sin reconstruir el BVH. Solo tiene sentido con escena
       construida; si hay una construcción en curso, esta ya los leerá. */
    actualizarMateriales() {
      if (!estado.listo || estado.construyendo || estado.dispuesto) return;
      pt.updateMaterials(); // hace reset()
    },
    setCalidad(tier) {
      if (estado.dispuesto) return;
      const c = CALIDADES[tier] || CALIDADES.alta;
      pt.renderScale = c.renderScale;
      pt.bounces = c.bounces;
      trazador.activo = renderer.capabilities.isWebGL2 && (tier === 'alta' || conf.enMedia);
      if (!trazador.activo) trazador.invalidar();
    },
    update(dt, { quieta = false } = {}) {
      dtActual = dt;
      if (!trazador.activo || estado.dispuesto) return false;
      if (!quieta) {
        if (estado.enReposo) { pt.reset(); estado.enReposo = false; }
        estado.tQuieta = 0;
        return false;
      }
      estado.tQuieta += dt;
      if (!estado.enReposo && estado.tQuieta < ESPERA_REPOSO) return false;
      if (estado.invalidado && !estado.construyendo) reconstruir();
      if (estado.construyendo || !estado.listo) return false; // raster mientras se construye
      if (!estado.enReposo) {
        estado.enReposo = true;
        pt.updateCamera();          // lee la matriz actual y reinicia la acumulación
        sincronizarEntorno();
        sincronizarSol();
      }
      const n = conf.teselasPorFotograma ?? (CALIDADES[ctx.calidad] || CALIDADES.alta).teselasPorFotograma;
      for (let i = 0; i < n; i++) pt.renderSample();
      trazador.muestras = pt.samples;
      if (conf.cartelas) pintarCartelas();
      return true;
    },
    dispose() {
      /* ctx.on no tiene baja: los manejadores siguen vivos, así que se
         marcan como inertes con la bandera y se apaga el módulo. */
      estado.dispuesto = true;
      trazador.activo = false;
      estado.enReposo = false;
      pt.dispose();
      pt._lowResPathTracer?.dispose?.(); // la biblioteca no lo libera en su dispose()
      estado.adaptador?.dispose();
      estado.adaptador = null;
      escenaTrazado.clear();
    },
  };

  /* ── Escena filtrada ── */
  function materialValido(m) {
    return !!m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)
      && m.visible !== false && m.colorWrite !== false
      && !(m.transparent && m.opacity < 0.02);
  }

  function construirEscenaFiltrada() {
    escenaTrazado.clear();
    scene.updateMatrixWorld(true);
    const mascaraNormal = 1 << (ctx.capas?.normal ?? 0);
    let mallas = 0, excluidas = 0, triangulos = 0;
    scene.traverseVisible((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isBatchedMesh) return;
      if (!(o.layers.mask & mascaraNormal)) return;
      const geo = o.geometry;
      if (!geo?.attributes?.position) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.every(materialValido)) { excluidas++; return; }
      const clon = new THREE.Mesh(geometriaFlotante(geo), o.material);
      clon.name = o.name;
      clon.matrixAutoUpdate = false;
      clon.matrix.copy(o.matrixWorld);
      escenaTrazado.add(clon);
      mallas++;
      triangulos += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    });

    // El sol: una sola DirectionalLight, sea la que da luz o la primera visible.
    if (conf.factorSol > 0) {
      const sol = new THREE.DirectionalLight(0xffffff, 0);
      sol.name = 'sol_trazado';
      sol.target.position.set(0, 0, 0);
      escenaTrazado.add(sol, sol.target);
      estado.firmaSol = '';
      sincronizarSol(true);
    }
    sincronizarEntorno(true);
    return { mallas, excluidas, triangulos: Math.round(triangulos) };
  }

  function fuenteSol() {
    let fuente = luz?.sol || null;
    if (!fuente) scene.traverseVisible((o) => { if (!fuente && o.isDirectionalLight && o.intensity > 0) fuente = o; });
    return fuente;
  }

  /* Copia dirección, color e intensidad del sol real al del trazado. La
     dirección sale de matrixWorld − target.matrixWorld, que es lo que lee la
     biblioteca (vale para el CSM: sus luces siguen a la cámara, pero la
     resta es siempre la dirección al sol). Con `soloCopiar` no se toca el
     trazador (la construcción posterior ya leerá las luces). */
  function sincronizarSol(soloCopiar = false) {
    const sol = escenaTrazado.getObjectByName('sol_trazado');
    if (!sol) return false;
    const fuente = fuenteSol();
    const _p = new THREE.Vector3(), _t = new THREE.Vector3();
    if (fuente) {
      fuente.updateWorldMatrix(true, false);
      fuente.target.updateWorldMatrix(true, false);
      _p.setFromMatrixPosition(fuente.matrixWorld).sub(_t.setFromMatrixPosition(fuente.target.matrixWorld)).normalize();
    }
    const intensidad = fuente && fuente.visible ? fuente.intensity * conf.factorSol : 0;
    const firma = fuente
      ? `${_p.x.toFixed(4)},${_p.y.toFixed(4)},${_p.z.toFixed(4)}|${fuente.color.getHex()}|${intensidad.toFixed(4)}`
      : 'sin';
    if (firma === estado.firmaSol) return false;
    estado.firmaSol = firma;
    if (fuente) {
      sol.position.copy(_p).multiplyScalar(1000);
      sol.color.copy(fuente.color);
    }
    sol.intensity = intensidad;
    sol.visible = intensidad > 0; // la biblioteca ignora luces invisibles: sin sol (noche) no hay que contarlo
    sol.updateMatrixWorld(true);
    if (!soloCopiar && estado.listo && !estado.construyendo) pt.updateLights(); // reescribe la textura de luces y hace reset()
    return true;
  }

  function equirectActual() {
    const eq = luz?.equirect;
    if (eq?.isDataTexture && eq.image?.data) return eq;
    const fondo = scene.background;
    if (fondo?.isDataTexture && fondo.image?.data) return fondo;
    return null;
  }

  /* Copia fondo/entorno de la escena real a la filtrada. Devuelve true si
     algo cambió respecto a lo último que vio el trazador. */
  function sincronizarEntorno(soloCopiar = false) {
    const eq = equirectActual();
    const intensidad = luz?.envMapIntensity ?? scene.environmentIntensity ?? 1;
    escenaTrazado.background = eq;
    escenaTrazado.environment = eq;
    escenaTrazado.environmentIntensity = intensidad;
    escenaTrazado.backgroundIntensity = scene.backgroundIntensity ?? 1;
    escenaTrazado.backgroundBlurriness = scene.backgroundBlurriness ?? 0;
    escenaTrazado.backgroundRotation.copy(scene.backgroundRotation);
    escenaTrazado.environmentRotation.copy(scene.environmentRotation);
    const cambio = eq !== estado.entorno || intensidad !== estado.entornoIntensidad;
    estado.entorno = eq;
    estado.entornoIntensidad = intensidad;
    if (cambio && !soloCopiar && estado.listo) pt.updateEnvironment();
    return cambio;
  }

  /* ── Reconstrucción del BVH ── */
  async function reconstruir() {
    estado.construyendo = true;
    estado.invalidado = false;
    estado.listo = false;
    trazador.progreso = 0;
    const t0 = performance.now();
    const resumen = construirEscenaFiltrada();
    let modo = 'worker';
    try {
      if (!estado.adaptador && !estado.workerFallido && !conf.sinWorker) {
        try {
          estado.adaptador = crearAdaptadorBVH(await crearWorkerBVH());
          pt.setBVHWorker(estado.adaptador);
        } catch (err) {
          console.warn('trazador: sin worker de BVH, se construye en el hilo principal', err);
          estado.workerFallido = true;
        }
      }
      let resultado;
      if (estado.adaptador) {
        resultado = await pt.setSceneAsync(escenaTrazado, camera, { onProgress: (p) => { trazador.progreso = p; } });
      } else {
        modo = 'sincrono';
        resultado = pt.setScene(escenaTrazado, camera);
      }
      trazador.ultimaConstruccion = {
        ...resumen, modo,
        msTotal: Math.round(performance.now() - t0),
        msBVH: Math.round(resultado?.bvh?.userData?.ms ?? 0),
        luces: resultado?.lights?.length ?? 0,
      };
      estado.listo = true;
      trazador.progreso = 1;
    } catch (err) {
      console.error('trazador: no se pudo construir la escena', err);
      trazador.activo = false; // mejor raster para siempre que un fotograma roto
      estado.invalidado = true; // si alguien reactiva con setCalidad('alta'), que vuelva a intentarlo
    } finally {
      estado.construyendo = false;
      estado.enReposo = false; // la siguiente llamada en reposo fija cámara y entorno
    }
  }

  /* Pasada de cartelas (capa 1) sin post ni tone mapping, encima del trazado. */
  function pintarCartelas() {
    const capa = ctx.capas?.cartelas ?? 1;
    const fondo = scene.background;
    const auto = renderer.autoClear;
    scene.background = null;
    renderer.autoClear = false;
    renderer.clearDepth();
    camera.layers.set(capa);
    renderer.render(scene, camera);
    camera.layers.set(ctx.capas?.normal ?? 0);
    renderer.autoClear = auto;
    scene.background = fondo;
  }

  ctx.on('calidad', (tier) => trazador.setCalidad(tier));
  ctx.on('tamano', () => { if (estado.enReposo) { pt.reset(); estado.enReposo = false; } });
  ctx.on('geometria', () => { if (!estado.dispuesto) trazador.invalidar(); });
  ctx.on('materiales', () => trazador.actualizarMateriales());
  /* Al acabar la transición del momento cambian el cielo Y el sol. Si el
     trazador está en reposo mostrando imagen, ambos reinician la acumulación
     (updateEnvironment/updateLights hacen reset); si está construyendo, la
     entrada en reposo posterior ya los sincroniza. */
  ctx.on('momento', () => { if (estado.listo && !estado.dispuesto) { sincronizarEntorno(); sincronizarSol(); } });
  trazador.setCalidad(ctx.calidad);

  return trazador;
}
