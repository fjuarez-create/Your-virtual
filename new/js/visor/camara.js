/* ═══════════════════════════════════════════════════════════════════════════
   camara.js — Cámara cinematográfica sobre camera-controls.

   camera-controls pone la interacción (orbitar, desplazar, zoom, inercia,
   táctil); este módulo pone encima los vuelos con curva propia, los
   encuadres calculados con el fov real, los límites físicos y la señal de
   "quieta" que necesita el trazador.

   Decisiones donde el contrato calla (CONTRATO.md § camara.js):
   - `azimut` y `elevacion` se dan en GRADOS. azimut 0 = cámara en +z del
     objetivo mirando hacia −z (convención de camera-controls, y la del
     contrato: "desde el sur"); crece hacia +x. elevacion = ángulo sobre el
     horizonte (90 = cenital).
   - `volarA` devuelve una Promise que resuelve a `true` si el vuelo termina y
     a `false` si se interrumpe. No rechaza nunca: una interrupción es un
     hecho normal, no un error, y así main no necesita try/catch.
   - Un vuelo no se amortigua dentro de camera-controls: cada fotograma se
     aplica `setLookAt(..., false)`. La suavidad la da la curva de easing, y
     así la interrupción deja la cámara exactamente donde se ve, sin colas.
   - El tiempo del módulo es la suma de los `dt` que recibe `update` (no
     `performance.now()`): así `quieta` y `reposoTras` son deterministas en
     pruebas con tiempo virtual y no dependen de la cadencia real de dibujo.
   - Suelo: `y ≥ 1.5` se garantiza recortando cada fotograma el ángulo polar
     máximo a partir de la altura del objetivo y la distancia, de modo que la
     inercia de camera-controls respeta el límite sin saltos.
   - `reposoTras(segundos, { encuadre, velocidad })`: al cumplirse el plazo
     emite `ctx.emit('reposo')`. Si main ha dado `encuadre` ({ posicion,
     objetivo }), vuela allí y activa la órbita; si no, solo emite y deja que
     main decida (este módulo no sabe cuál es el encuadre 'conjunto').
   - Un vuelo pedido desde fuera (`volarA`, `encuadrar`, `enfocarVivienda`)
     cuenta como actividad del usuario: apaga la órbita automática, sale del
     reposo y reinicia su plazo. Si no, un botón del shell pulsado durante
     la órbita de reposo dejaría la cámara girando al llegar (y `quieta`
     nunca volvería a ser true). El vuelo propio del reposo no pasa por ahí.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import CameraControls from 'camera-controls';

/* install() enlaza las clases de THREE que usa camera-controls; con un mapa
   de importación solo hay un THREE, pero se protege igualmente porque main
   puede crear más de una cámara (p. ej. demos con dos lienzos). */
let instalado = false;
function instalar() {
  if (instalado) return;
  CameraControls.install({ THREE });
  instalado = true;
}

const SUELO = 1.5;                             // altura mínima de la cámara (m) si nadie dice otra cosa
const POLAR_MAX = THREE.MathUtils.degToRad(88); // no mirar desde debajo del horizonte
const POLAR_MIN = 0.02;                        // evita la singularidad cenital
const DIST_MIN = 3, DIST_MAX = 900;
const QUIETA_TRAS = 0.3;                       // s sin movimiento para declarar reposo
const grados = THREE.MathUtils.degToRad;

/* Entrada y salida suaves (cúbica): la cámara arranca sin tirón y frena al
   llegar, que es lo que hace creíble un plano de cámara real. */
const suavizar = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function crearCamara(ctx) {
  instalar();
  const { camera, canvas } = ctx;
  const controles = new CameraControls(camera, canvas);

  // ── Interacción según el contrato ──
  controles.mouseButtons.left = CameraControls.ACTION.ROTATE;
  controles.mouseButtons.right = CameraControls.ACTION.TRUCK;
  controles.mouseButtons.middle = CameraControls.ACTION.DOLLY;
  controles.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  controles.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
  controles.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
  controles.touches.three = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
  controles.smoothTime = 0.25;
  controles.draggingSmoothTime = 0.12;
  controles.minDistance = DIST_MIN;
  controles.maxDistance = DIST_MAX;
  controles.minPolarAngle = POLAR_MIN;
  controles.maxPolarAngle = POLAR_MAX;
  controles.dollyToCursor = true;   // la rueda acerca hacia donde se mira, como en cualquier visor CAD
  controles.dollySpeed = 0.8;
  controles.truckSpeed = 1.6;

  // ── Estado ──
  let reloj = 0;                 // tiempo del módulo (s)
  let vuelo = null;              // { p0, p1, t0, t1, lateral, amplitud, duracion, t, resolver }
  let ultimoMovimiento = -1;     // instante (reloj) del último cambio de cámara
  let ultimaEntrada = 0;         // instante (reloj) de la última acción del usuario
  let usuarioActivo = false;     // entre controlstart y controlend
  let velocidad = 0;             // m/s entre fotogramas
  let progreso = 0;              // 0..1 del vuelo en curso
  let salto = false;             // la cámara acaba de teletransportarse (velocidad = 0)
  const orbita = { activa: false, velocidad: 0.05 };
  const reposo = { segundos: 0, encuadre: null, velocidad: 0.05, enReposo: false };
  const posAnterior = camera.position.clone();

  // temporales para no crear vectores por fotograma
  const _pos = new THREE.Vector3(), _obj = new THREE.Vector3(), _tmp = new THREE.Vector3();

  const marcarMovimiento = () => { ultimoMovimiento = reloj; };

  /* Cualquier gesto del usuario: corta el vuelo, apaga la órbita automática
     y reinicia el plazo de reposo. Se escucha en fase de captura para llegar
     ANTES que camera-controls: si el vuelo siguiera vivo un fotograma más,
     pisaría con setLookAt lo que el usuario acaba de empezar a arrastrar. */
  const alEntrada = () => {
    ultimaEntrada = reloj;
    reposo.enReposo = false;
    orbita.activa = false;
    interrumpir();
  };
  const opcionesEscucha = { capture: true, passive: true };
  canvas.addEventListener('pointerdown', alEntrada, opcionesEscucha);
  canvas.addEventListener('wheel', alEntrada, opcionesEscucha);
  canvas.addEventListener('touchstart', alEntrada, opcionesEscucha);
  controles.addEventListener('controlstart', () => { usuarioActivo = true; alEntrada(); marcarMovimiento(); });
  /* 'control' también interrumpe: cubre el caso de un vuelo que arranca con
     el botón ya pulsado (p. ej. el reposo se cumple mientras el usuario
     sujeta el ratón sin moverlo y luego arrastra). Solo lo emite la entrada
     del usuario, nunca rotate()/setLookAt(), así que no corta vuelos propios. */
  controles.addEventListener('control', () => { ultimaEntrada = reloj; marcarMovimiento(); interrumpir(); });
  controles.addEventListener('controlend', () => { usuarioActivo = false; ultimaEntrada = reloj; });
  controles.addEventListener('update', marcarMovimiento);

  function interrumpir() {
    if (!vuelo) return;
    const { resolver } = vuelo;
    vuelo = null;
    progreso = 0;
    /* El último setLookAt(false) ya dejó actual = final: la cámara se queda
       donde está sin cola de amortiguación. */
    resolver(false);
  }

  /* Vuelo pedido por main: es actividad, no reposo (ver cabecera). */
  function volarA(destino, opciones) {
    orbita.activa = false;
    reposo.enReposo = false;
    ultimaEntrada = reloj;
    return iniciarVuelo(destino, opciones);
  }

  function iniciarVuelo({ posicion, objetivo }, { duracion = 1.6, arco = 0.35, deReposo = false } = {}) {
    interrumpir();
    const p1 = new THREE.Vector3().copy(posicion);
    const t1 = new THREE.Vector3().copy(objetivo);
    if (!(duracion > 0)) {
      controles.setLookAt(p1.x, p1.y, p1.z, t1.x, t1.y, t1.z, false);
      /* Un salto no es movimiento: si se midiera como velocidad, el
         desenfoque de movimiento pintaría un fogonazo en el primer fotograma. */
      salto = true;
      marcarMovimiento();
      return Promise.resolve(true);
    }
    const p0 = camera.position.clone();
    const t0 = controles.getTarget(new THREE.Vector3(), false);
    const desplazamiento = _tmp.subVectors(p1, p0);
    const distancia = desplazamiento.length();

    /* Arco lateral: perpendicular horizontal al desplazamiento, con amplitud
       proporcional a la distancia recorrida. El lado se elige para que el
       arco abombe hacia FUERA (alejándose de lo que se mira): así la cámara
       rodea el edificio en vez de cruzarlo por dentro. */
    const lateral = new THREE.Vector3(-desplazamiento.z, 0, desplazamiento.x);
    if (lateral.lengthSq() < 1e-6) {
      // vuelo vertical o nulo: se usa la derecha de la cámara, en horizontal
      lateral.setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
      if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
    }
    lateral.normalize();
    const fuera = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5)
      .sub(new THREE.Vector3().addVectors(t0, t1).multiplyScalar(0.5)).setY(0);
    if (fuera.dot(lateral) < 0) lateral.negate();

    return new Promise((resolver) => {
      vuelo = { p0, p1, t0, t1, lateral, amplitud: arco * distancia, duracion, t: 0, resolver, deReposo };
      progreso = 0;
      marcarMovimiento();
    });
  }

  /* Distancia mínima a la que la caja entera cabe en el encuadre, con margen,
     para una dirección de vista dada. Se proyectan las ocho esquinas sobre
     los ejes de la cámara y se exige que cada una quede dentro del cono del
     fov vertical y del horizontal (el aspecto importa: una barra de 112 m se
     encuadra por el ancho en 16:9 y por el alto en vertical). */
  function distanciaParaCaja(caja, direccion, margen) {
    const centro = caja.getCenter(new THREE.Vector3());
    const adelante = direccion.clone().negate();
    const derecha = new THREE.Vector3().crossVectors(adelante, new THREE.Vector3(0, 1, 0));
    if (derecha.lengthSq() < 1e-6) derecha.set(1, 0, 0); // vista cenital
    derecha.normalize();
    const arriba = new THREE.Vector3().crossVectors(derecha, adelante).normalize();
    const tanV = Math.tan(grados(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    let dist = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? caja.max.x : caja.min.x, i & 2 ? caja.max.y : caja.min.y, i & 4 ? caja.max.z : caja.min.z).sub(centro);
      const f = v.dot(adelante);           // profundidad relativa al centro
      const r = Math.abs(v.dot(derecha)) * margen;
      const u = Math.abs(v.dot(arriba)) * margen;
      // la esquina está a profundidad (dist + f); cabe si r ≤ tanH·(dist+f)
      dist = Math.max(dist, r / tanH - f, u / tanV - f);
    }
    return { centro, dist: THREE.MathUtils.clamp(dist, DIST_MIN, DIST_MAX) };
  }

  /* Cota mínima admitida en un punto (ver limitarSuelo). */
  let sueloDe = null;
  function sueloEn(x, z) {
    if (!sueloDe) return SUELO;
    const v = sueloDe(x, z);
    return Number.isFinite(v) ? v : SUELO;
  }

  function encuadrar(caja, { azimut, elevacion, margen = 1.15, duracion = 1.6, arco = 0.35 } = {}) {
    const az = azimut !== undefined ? grados(azimut) : controles.azimuthAngle;
    const polar = elevacion !== undefined
      ? THREE.MathUtils.clamp(Math.PI / 2 - grados(elevacion), POLAR_MIN, POLAR_MAX)
      : controles.polarAngle;
    // dirección del objetivo hacia la cámara (esférica de camera-controls)
    const direccion = new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));
    const { centro, dist } = distanciaParaCaja(caja, direccion, margen);
    const posicion = direccion.multiplyScalar(dist).add(centro);
    const yMin = sueloEn(posicion.x, posicion.z);
    if (posicion.y < yMin) posicion.y = yMin;
    return volarA({ posicion, objetivo: centro }, { duracion, arco });
  }

  /* Vivienda: margen justo para que llene el encuadre, elevación baja para
     leerla como un espacio y no como una tapa, y el acimut actual para que el
     vuelo sea corto y el usuario no pierda la referencia. El objetivo queda en
     el centro de la vivienda: orbitar después gira alrededor de ella. */
  function enfocarVivienda(caja, { duracion = 1.4, elevacion = 24, azimut, margen = 1.08 } = {}) {
    return encuadrar(caja, { azimut, elevacion, margen, duracion, arco: 0.3 });
  }

  function orbitaAutomatica(activa, { velocidad = 0.05 } = {}) {
    orbita.activa = !!activa;
    orbita.velocidad = velocidad;
  }

  function reposoTras(segundos, { encuadre = null, velocidad = 0.05 } = {}) {
    reposo.segundos = segundos > 0 ? segundos : 0;
    reposo.encuadre = encuadre;
    reposo.velocidad = velocidad;
    reposo.enReposo = false;
    ultimaEntrada = reloj;
  }

  /* Recorte del polar para no bajar del suelo: la cámara está a
     y = objetivo.y + d·cos(polar), luego cos(polar) ≥ (suelo − objetivo.y)/d.
     El suelo no es un número fijo: main lo fija con la cota real del terreno
     en cada punto (`setSuelo`), porque el de SERENEA se escalona casi cinco
     metros de un testero al otro y con un valor único la cámara se metía bajo
     el edificio en el extremo alto. */
  function limitarSuelo() {
    const oy = controles.getTarget(_tmp, true).y;
    const d = Math.max(controles.distance, DIST_MIN);
    const cosMin = (sueloEn(camera.position.x, camera.position.z) - oy) / d;
    let polarMax = POLAR_MAX;
    if (cosMin > -1) polarMax = Math.min(POLAR_MAX, Math.acos(Math.min(1, cosMin)));
    controles.maxPolarAngle = Math.max(POLAR_MIN, polarMax);
  }

  function update(dt) {
    if (!(dt > 0)) dt = 0;
    reloj += dt;

    if (vuelo) {
      vuelo.t += dt;
      const u = Math.min(1, vuelo.t / vuelo.duracion);
      const s = suavizar(u);
      _pos.lerpVectors(vuelo.p0, vuelo.p1, s).addScaledVector(vuelo.lateral, vuelo.amplitud * Math.sin(Math.PI * s));
      _obj.lerpVectors(vuelo.t0, vuelo.t1, s);
      controles.setLookAt(_pos.x, _pos.y, _pos.z, _obj.x, _obj.y, _obj.z, false);
      progreso = u;
      marcarMovimiento();
      /* El plazo de reposo cuenta desde que la cámara se para, no desde que
         main pidió el vuelo: si no, con vuelos largos el reposo saltaría
         nada más llegar. El vuelo del propio reposo no reinicia el plazo. */
      if (!vuelo.deReposo) ultimaEntrada = reloj;
      if (u >= 1) {
        const { resolver, deReposo } = vuelo;
        vuelo = null;
        /* La órbita de reposo se enciende aquí, en el mismo update, y no en
           un .then(): así no depende de que haya una microtarea entre
           fotogramas (con tiempo virtual o lotes de update no la habría). */
        if (deReposo && reposo.enReposo) orbitaAutomatica(true, { velocidad: reposo.velocidad });
        resolver(true);
      }
    } else if (orbita.activa && !usuarioActivo && dt > 0) {
      controles.rotate(orbita.velocidad * dt, 0, false);
      marcarMovimiento();
    }

    limitarSuelo();
    if (controles.update(dt)) marcarMovimiento();
    if (usuarioActivo) marcarMovimiento();

    if (salto) {
      salto = false;
      velocidad = 0;
    } else if (dt > 0) {
      velocidad = posAnterior.distanceTo(camera.position) / dt;
      if (velocidad > 1e-4) marcarMovimiento();
    }
    posAnterior.copy(camera.position);

    /* reposo: N s sin que el usuario toque nada. No se dispara con el botón
       pulsado (usuarioActivo): el vuelo pisaría el arrastre que venga después. */
    if (reposo.segundos > 0 && !reposo.enReposo && !vuelo && !usuarioActivo && reloj - ultimaEntrada >= reposo.segundos) {
      reposo.enReposo = true;
      ctx.emit('reposo');
      if (reposo.encuadre) iniciarVuelo(reposo.encuadre, { duracion: 2.4, arco: 0.3, deReposo: true });
    }
  }

  function destruir() {
    canvas.removeEventListener('pointerdown', alEntrada, opcionesEscucha);
    canvas.removeEventListener('wheel', alEntrada, opcionesEscucha);
    canvas.removeEventListener('touchstart', alEntrada, opcionesEscucha);
    interrumpir();
    controles.dispose();
  }

  return {
    controles,
    volarA, encuadrar, enfocarVivienda, orbitaAutomatica, reposoTras, update, interrumpir, destruir,
    /** Cota mínima de la cámara en cada punto: fn(x, z) → y mínima. */
    setSuelo(fn) { sueloDe = typeof fn === 'function' ? fn : null; },
    get quieta() { return !vuelo && !usuarioActivo && !orbita.activa && reloj - ultimoMovimiento >= QUIETA_TRAS; },
    get velocidad() { return velocidad; },
    get enTransicion() { return !!vuelo; },
    get progreso() { return progreso; },
    get enReposo() { return reposo.enReposo; },
    /* distancia cámara-objetivo, para post.setEnfoque al enfocar una vivienda */
    get distanciaObjetivo() { return controles.distance; },
    get objetivo() { return controles.getTarget(new THREE.Vector3(), false); },
  };
}
