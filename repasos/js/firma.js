/* ═══════════════════════════════════════════════════════════════
   firma.js — la firma con el dedo

   Dos piezas, con el mismo motor de trazos debajo:

   · lienzoDeFirma(lienzo): el motor, puesto en un lienzo que ya está
     en la página. Es lo que usa el «Conforme de la visita»
     (js/conforme.js): se firma con el dedo EN EL PROPIO RECUADRO del
     documento, sin abrir otra pantalla. Lo que devuelve su firma() es
     lo que js/pdfConforme.js espera en `firmas`.
   · pedirFirma(): una capa a pantalla completa, encima de lo que haya,
     con el nombre de quien firma (se puede corregir), un papel grande
     y «Borrar» y «Aceptar». Devuelve lo mismo que firma().

   Lo que no se ve y hace que funcione en un teléfono:

   · `touch-action: none` en el lienzo. Sin esa regla el navegador toma
     el arrastre por un desplazamiento, mueve la página y corta el
     trazo a los pocos píxeles. De cinturón, para los Safari que no le
     hacen caso, el lienzo frena también su `touchstart` y su
     `touchmove`. Así el dedo que cae DENTRO del lienzo firma y no
     mueve nada, y el que cae fuera desplaza la página como siempre.
   · La palma. Un toque que ya estaba apoyado en el lienzo (la palma, el
     canto de la mano, el pulgar de quien sujeta el móvil) no puede
     dejar sin firmar al dedo que llega después. Mientras el primero no
     se haya movido unos 12 px, el que llega compite con él: manda el
     primero de los dos que se mueva esos 12 px, y lo del otro se
     descarta; si uno se levanta antes, el que estaba quieto desde el
     principio era la palma y se descarta. Un segundo dedo que llega a
     MEDIA firma (el primero ya se ha movido) no pinta nada.
   · Lo que se sale del lienzo no se ve: tampoco se guarda (saldría en
     el PDF).
   · Los trazos se guardan en las medidas que tenía el lienzo al empezar
     a firmar (el «mundo»). Si cambia de tamaño —se gira el teléfono,
     sale o se va el teclado— se rehace y lo firmado se vuelve a pintar
     sin deformar y sin perder nada: si el lienzo crece, nada se mueve;
     si se queda pequeño, lo firmado se encoge para caber, y vuelve a su
     tamaño cuando hay sitio. El mundo solo crece cuando se firma en el
     sitio nuevo: ir a un lienzo grande y volver sin firmar nada deja la
     firma como estaba. Si se gira el teléfono con el dedo apoyado (cambia
     el ancho a media firma), ese trazo se da por acabado al girar: el
     lienzo se ha movido bajo el dedo, y el mundo no debe crecer con él.
   · En la capa, el papel no llega a los bordes de la pantalla, que son
     del gesto de «atrás» del sistema; y un toque que empieza pegado al
     borde se anula. Si aun así el teléfono vuelve atrás con algo ya
     firmado, la capa NO se cierra: se queda como estaba y dice cómo
     salir.
   · En un MÓVIL tumbado la firma no se ve: la casa tapa la app entera
     con su telón («Gira el teléfono…», en css/app.css). Se firma en
     vertical; al volver, lo firmado sigue donde estaba.
   · El lienzo va a la densidad de la pantalla (hasta el triple), y se
     mide el lienzo, no su marco: con el marco el dibujo se corría un
     1 % respecto al dedo.
   ═══════════════════════════════════════════════════════════════ */

import { h, icon } from './ui.js';

/* Lo mínimo para que un garabato cuente como firma, en píxeles de
   pantalla: doce puntos, 150 px de trazo (unos dos centímetros y medio)
   y 70 px de lado mayor. Ni vacía, ni un punto, ni una rayita. */
export const FIRMA_MINIMA = Object.freeze({ puntos: 12, largo: 150, lado: 70 });

const GROSOR = 2.6;        // del trazo, en px de pantalla
const PASO_MINIMO = 1.5;   // puntos más juntos que esto son ruido del dedo
const REJILLA = 1000;      // el ancho de la rejilla en que salen los trazos
const ALTO_MAXIMO = 4000;  // y el alto máximo (una raya de arriba abajo)
const BORDE_DEL_SISTEMA = 16;  // px desde cada lado que son del gesto de «atrás»
const QUIETO = 12;         // px que puede moverse un toque apoyado (la palma) sin contar como firma
const NOMBRE_MAXIMO = 120;
// La imagen pequeña que acompaña a la firma, para enseñarla en pantalla.
const VISTA_PREVIA = Object.freeze({ ancho: 480, alto: 192, margen: 0.08 });

/* Las frases de la firma. Las del lienzo (la invitación, «Borrar» y la
   de la firma corta) las usa también el recuadro del conforme
   (js/conforme.js): se dicen igual en los dos sitios. */
export const FRASES_DE_FIRMA = Object.freeze({
  titulo: 'Firma',
  rotuloNombre: 'Nombre de quien firma',
  huecoNombre: 'Nombre y apellidos',
  aqui: 'Firme aquí con el dedo',
  borrar: 'Borrar',
  aceptar: 'Aceptar',
  cancelar: 'Cancelar',
  corta: 'La firma es demasiado corta. Siga firmando, o toque «Borrar» y repita.',
  sinNombre: 'Escriba arriba el nombre de quien firma.',
  atras: 'Para salir sin firmar, toque la X de arriba.',
});
const FRASES = FRASES_DE_FIRMA;

/**
 * ¿Vale como firma? → { vale, puntos, largo, lado, caja }.
 * `trazos` es [[[x, y], …], …]; `largo` y `lado` salen en sus unidades.
 */
export function medirFirma(trazos) {
  let puntos = 0;
  let largo = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const trazo of Array.isArray(trazos) ? trazos : []) {
    trazo.forEach((p, i) => {
      puntos += 1;
      if (i > 0) largo += Math.hypot(p[0] - trazo[i - 1][0], p[1] - trazo[i - 1][1]);
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    });
  }
  const lado = puntos ? Math.max(x1 - x0, y1 - y0) : 0;
  const vale = puntos >= FIRMA_MINIMA.puntos && largo >= FIRMA_MINIMA.largo && lado >= FIRMA_MINIMA.lado;
  return { vale, puntos, largo, lado, caja: puntos ? { x0, y0, x1, y1 } : null };
}

/**
 * Los trazos, recortados a su caja y llevados a una rejilla de 1000 de
 * ancho (el alto, en proporción): → { trazos, ancho, alto }, con los
 * puntos en números enteros. Es lo que se le pasa al PDF.
 */
export function normalizarFirma(trazos) {
  const { caja } = medirFirma(trazos);
  if (!caja) return { trazos: [], ancho: REJILLA, alto: 0 };
  const ancho = Math.max(1, caja.x1 - caja.x0);
  const alto = Math.max(1, caja.y1 - caja.y0);
  // Una raya casi vertical no puede dar una rejilla de kilómetros de alto.
  const escala = Math.min(REJILLA / ancho, ALTO_MAXIMO / alto);
  return {
    trazos: trazos.filter((trazo) => trazo.length).map((trazo) => trazo.map((p) => [
      Math.round((p[0] - caja.x0) * escala),
      Math.round((p[1] - caja.y0) * escala),
    ])),
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/* Pinta un trazo suave: en vez de unir los puntos con rectas, cada punto
   hace de «tirador» de una curva que va de la mitad del tramo anterior a
   la mitad del siguiente. Es la manera barata de que una firma no salga
   a picos (y la misma cuenta que hace el PDF). */
function pintarTrazo(ctx, trazo) {
  if (!trazo.length) return;
  ctx.beginPath();
  if (trazo.length === 1) {
    // Un punto suelto (el de una «i», el de una rúbrica): un redondel.
    ctx.arc(trazo[0][0], trazo[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(trazo[0][0], trazo[0][1]);
  for (let i = 1; i < trazo.length - 1; i++) {
    ctx.quadraticCurveTo(trazo[i][0], trazo[i][1],
      (trazo[i][0] + trazo[i + 1][0]) / 2, (trazo[i][1] + trazo[i + 1][1]) / 2);
  }
  const ultimo = trazo[trazo.length - 1];
  ctx.lineTo(ultimo[0], ultimo[1]);
  ctx.stroke();
}

/**
 * Una imagen pequeña de la firma (PNG con el fondo transparente, como
 * mucho 480 × 192) para enseñarla en pantalla: → { url, ancho, alto }, con
 * `url` lista para un <img>. null si no hay firma o no se puede pintar.
 * `firma` es lo que devuelven firma() del lienzo, pedirFirma() o normalizarFirma().
 */
export function vistaPreviaDeFirma(firma, { ancho = VISTA_PREVIA.ancho, alto = VISTA_PREVIA.alto } = {}) {
  if (typeof document === 'undefined' || !firma) return null;
  const { caja } = medirFirma(firma.trazos);
  if (!caja) return null;
  try {
    const margenX = VISTA_PREVIA.margen * ancho;
    const margenY = VISTA_PREVIA.margen * alto;
    const suyoAncho = Math.max(1, caja.x1 - caja.x0);
    const suyoAlto = Math.max(1, caja.y1 - caja.y0);
    const escala = Math.min((ancho - 2 * margenX) / suyoAncho, (alto - 2 * margenY) / suyoAlto);
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.round(suyoAncho * escala + 2 * margenX));
    lienzo.height = Math.max(1, Math.round(suyoAlto * escala + 2 * margenY));
    const ctx = lienzo.getContext('2d');
    if (!ctx) return null;
    ctx.translate(margenX - caja.x0 * escala, margenY - caja.y0 * escala);
    ctx.scale(escala, escala);
    ctx.strokeStyle = '#111112';
    ctx.fillStyle = '#111112';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4 / escala;
    for (const trazo of firma.trazos) pintarTrazo(ctx, trazo);
    return { url: lienzo.toDataURL('image/png'), ancho: lienzo.width, alto: lienzo.height };
  } catch {
    return null;
  }
}

const dosCifras = (valor) => (`0${valor}`).slice(-2);

/** El dato de una firma, tal como lo espera js/pdfConforme.js. null si no hay nada firmado. */
function datoDeFirma(trazos, nombre, cuando) {
  const medida = medirFirma(trazos);
  if (!medida.puntos) return null;
  const normal = normalizarFirma(trazos);
  const imagen = vistaPreviaDeFirma(normal);
  return {
    nombre,
    trazos: normal.trazos,
    ancho: normal.ancho,
    alto: normal.alto,
    puntos: medida.puntos,
    largo: Math.round(medida.largo),
    firmadoEn: cuando.toISOString(),
    fecha: `${cuando.getFullYear()}-${dosCifras(cuando.getMonth() + 1)}-${dosCifras(cuando.getDate())}`,
    hora: `${dosCifras(cuando.getHours())}:${dosCifras(cuando.getMinutes())}`,
    vistaPrevia: imagen ? imagen.url : '',
    vistaAncho: imagen ? imagen.ancho : 0,
    vistaAlto: imagen ? imagen.alto : 0,
  };
}

/**
 * El motor de los trazos, puesto en un lienzo dado (un <canvas> que ya
 * está en la página, con su tamaño puesto por la hoja de estilos).
 *
 *   alEmpezar   (evento) → nada. Empieza un trazo: es el momento de
 *               quitar la invitación «Firme aquí», cerrar un teclado…
 *   alCambiar   (medida) → nada. Ha acabado un trazo, se ha descartado
 *               uno (la palma) o se ha borrado todo; `medida` es la de
 *               medirFirma() con lo que queda.
 *
 * → {
 *     medida()              medirFirma() de lo firmado hasta ahora
 *     firma(nombre, cuando) el dato de la firma (lo mismo que contesta
 *                           pedirFirma), o null si no hay nada. `cuando`
 *                           (un Date) es el momento que lleva; si no se
 *                           da, el del final del último trazo.
 *     borrar()              lo deja en blanco (y avisa con alCambiar)
 *     repintar()            vuelve a medir el lienzo y a pintarlo
 *     apagar()              deja de escuchar: al quitar el lienzo de la página
 *   }
 */
export function lienzoDeFirma(lienzo, { alEmpezar = null, alCambiar = null } = {}) {
  // LA regla que hace que esto funcione en un móvil (ver la cabecera).
  // Va también aquí, y no solo en la hoja de estilos, para que la firma
  // no dependa de que la hoja haya llegado entera.
  lienzo.style.touchAction = 'none';
  const ctx = lienzo.getContext('2d');
  /* Los trazos se guardan en las medidas que tenía el lienzo al empezar
     a firmar (el «mundo»). Si el lienzo cambia, se rehace y lo firmado
     se vuelve a pintar: en su sitio si cabe, y encogido para que quepa
     entero, sin deformar, si no (ver repintar). */
  let mundo = null;
  let papel = { ancho: 1, alto: 1 };
  let vista = { escala: 1, dx: 0, dy: 0 };
  let pintado = '';
  const trazos = [];
  /* Los toques que están pintando, por su puntero: { trazo, x0, y0,
     lejos }, con `lejos` lo más que se ha apartado de donde empezó, en
     px de pantalla. Uno, o dos mientras se decide cuál es la palma. */
  const toques = new Map();
  let ultimoTrazo = null;    // cuándo acabó el último trazo
  let apagado = false;

  const avisar = () => { if (typeof alCambiar === 'function') alCambiar(medirFirma(trazos)); };

  const repintar = (aLaFuerza = false) => {
    if (apagado || !ctx) return;
    const densidad = Math.min(window.devicePixelRatio || 1, 3);
    // Se mide el LIENZO, no su marco.
    const ancho = Math.max(1, lienzo.clientWidth);
    const alto = Math.max(1, lienzo.clientHeight);
    const medida = `${ancho}x${alto}@${densidad}`;
    if (!aLaFuerza && medida === pintado) return;
    pintado = medida;
    // Cambia el ANCHO con un dedo apoyado (se gira el móvil a media
    // firma): el lienzo se ha movido bajo el dedo, así que su trazo se da
    // por acabado aquí, como si se hubiera levantado, y lo que el dedo
    // siga moviendo ya no pinta. Se recalcula como sin dedo. Antes el
    // mundo crecía hasta el lienzo de tumbado y ya no encogía: al volver,
    // la firma se veía al 60 % y con dos franjas muertas, arriba y abajo,
    // donde lo firmado se aplastaba contra el borde. Si cambia solo el
    // ALTO (el teclado que se cierra a mitad del trazo), el trazo sigue
    // bajo el dedo: ver más abajo.
    const cortado = toques.size > 0 && ancho !== papel.ancho;
    if (cortado) cortarAlGirar();
    papel = { ancho, alto };
    // Sin nada firmado, el mundo es el lienzo de ahora.
    if (!mundo || !trazos.length) mundo = { ancho, alto };
    lienzo.width = Math.round(ancho * densidad);
    lienzo.height = Math.round(alto * densidad);
    const escala = Math.min(1, ancho / mundo.ancho, alto / mundo.alto);
    if (escala === 1) {
      // El lienzo da para todo lo firmado: NADA se mueve ni cambia de
      // tamaño. Con un dedo firmando, además, el mundo crece hasta el
      // lienzo: es lo que pasa cuando se toca el papel con el teclado del
      // nombre abierto: el teclado se cierra a mitad del trazo, el papel
      // crece, y el trazo tiene que seguir bajo el dedo (centrándolo
      // daba un salto). Sin dedo, el mundo no crece: un lienzo que se
      // agranda y vuelve a su tamaño deja la firma como estaba.
      if (toques.size) mundo = { ancho: Math.max(mundo.ancho, ancho), alto: Math.max(mundo.alto, alto) };
      vista = { escala: 1, dx: 0, dy: 0 };
    } else {
      // El lienzo se ha quedado pequeño: lo firmado se encoge, centrado.
      vista = { escala, dx: (ancho - mundo.ancho * escala) / 2, dy: (alto - mundo.alto * escala) / 2 };
    }
    ctx.setTransform(densidad * escala, 0, 0, densidad * escala, densidad * vista.dx, densidad * vista.dy);
    ctx.strokeStyle = '#111112';
    ctx.fillStyle = '#111112';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = GROSOR;
    for (const trazo of trazos) pintarTrazo(ctx, trazo);
    if (cortado) avisar();
  };

  /** Los toques que pintaban acaban aquí (ver repintar). */
  function cortarAlGirar() {
    // Dos que aún competían (ninguno se ha movido 12 px): no se sabe cuál
    // es la palma, y lo de cada uno es apenas un punto: se quitan los dos.
    const competian = toques.size > 1;
    for (const [id, toque] of toques) {
      if (competian) {
        const donde = trazos.indexOf(toque.trazo);
        if (donde >= 0) trazos.splice(donde, 1);
      }
      try { if (lienzo.hasPointerCapture && lienzo.hasPointerCapture(id)) lienzo.releasePointerCapture(id); } catch { /* da igual */ }
    }
    toques.clear();
    if (!competian) ultimoTrazo = new Date();
  }

  const aMundo = (e) => {
    const caja = lienzo.getBoundingClientRect();
    return [
      (e.clientX - caja.left - vista.dx) / vista.escala,
      (e.clientY - caja.top - vista.dy) / vista.escala,
    ];
  };

  const sumar = (e, trazo) => {
    const p = aMundo(e);
    // Lo que se sale del papel no se ve: tampoco se guarda (saldría en el PDF).
    if (mundo) { p[0] = Math.min(Math.max(p[0], 0), mundo.ancho); p[1] = Math.min(Math.max(p[1], 0), mundo.alto); }
    const anterior = trazo[trazo.length - 1];
    if (anterior && Math.hypot(p[0] - anterior[0], p[1] - anterior[1]) < PASO_MINIMO) return;
    trazo.push(p);
    // Se pinta solo el cachito nuevo: repintar la firma entera a cada
    // punto se nota en un móvil viejo.
    const cuantos = trazo.length;
    if (cuantos < 2 || !ctx) return;
    ctx.beginPath();
    if (cuantos === 2) {
      ctx.moveTo(trazo[0][0], trazo[0][1]);
      ctx.lineTo((trazo[0][0] + p[0]) / 2, (trazo[0][1] + p[1]) / 2);
    } else {
      const a = trazo[cuantos - 3];
      const b = trazo[cuantos - 2];
      ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      ctx.quadraticCurveTo(b[0], b[1], (b[0] + p[0]) / 2, (b[1] + p[1]) / 2);
    }
    ctx.stroke();
  };

  /** Quita un toque y lo que haya pintado (la palma): sus avisos de después ya no cuentan. */
  const descartar = (id) => {
    const toque = toques.get(id);
    if (!toque) return;
    toques.delete(id);
    const donde = trazos.indexOf(toque.trazo);
    if (donde >= 0) trazos.splice(donde, 1);
    try { if (lienzo.hasPointerCapture && lienzo.hasPointerCapture(id)) lienzo.releasePointerCapture(id); } catch { /* da igual */ }
    repintar(true);
    avisar();
  };

  const alApoyar = (e) => {
    if (apagado) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (toques.has(e.pointerId)) return;
    if (toques.size >= 2) return;
    // Un segundo dedo a MEDIA firma (el primero ya se ha movido) no pinta.
    if (toques.size === 1 && [...toques.values()][0].lejos >= QUIETO) return;
    if (typeof alEmpezar === 'function') { try { alEmpezar(e); } catch { /* lo de fuera no para la firma */ } }
    // El mundo es el lienzo en que se empieza a firmar. Si el lienzo ha
    // crecido desde el último trazo (y lo firmado cabe), crece con él:
    // así se puede firmar en el sitio nuevo sin que nada se mueva.
    if (!trazos.length || vista.escala === 1) {
      mundo = trazos.length && mundo
        ? { ancho: Math.max(mundo.ancho, papel.ancho), alto: Math.max(mundo.alto, papel.alto) }
        : { ancho: papel.ancho, alto: papel.alto };
    }
    try { lienzo.setPointerCapture(e.pointerId); } catch { /* hay navegadores que no dejan */ }
    const toque = { trazo: [], x0: e.clientX, y0: e.clientY, lejos: 0 };
    trazos.push(toque.trazo);
    toques.set(e.pointerId, toque);
    sumar(e, toque.trazo);
  };

  const alMover = (e) => {
    const toque = toques.get(e.pointerId);
    if (!toque || apagado) return;
    e.preventDefault();
    // El móvil junta varios movimientos en un solo aviso; aquí se
    // recuperan todos, que es lo que da la curva fina.
    const todos = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const uno of (todos.length ? todos : [e])) {
      sumar(uno, toque.trazo);
      toque.lejos = Math.max(toque.lejos, Math.hypot(uno.clientX - toque.x0, uno.clientY - toque.y0));
    }
    // Dos toques compitiendo: el primero que se mueve de verdad es el que firma.
    if (toques.size > 1 && toque.lejos >= QUIETO) {
      for (const id of [...toques.keys()]) if (id !== e.pointerId) descartar(id);
    }
  };

  const alSoltar = (e) => {
    if (!toques.has(e.pointerId) || apagado) return;
    if (toques.size > 1) {
      // Se levanta uno de los dos sin que ninguno se haya movido: el que
      // estaba apoyado desde el principio era la palma, y se descarta.
      const [primero] = toques.keys();
      descartar(primero);
      if (e.pointerId === primero) return;
    }
    toques.delete(e.pointerId);
    ultimoTrazo = new Date();
    // El trazo acaba donde quedó: se repinta entero para cerrarlo (el
    // último cachito llega solo hasta la mitad del último tramo) y para
    // que un toque suelto deje su punto.
    repintar(true);
    avisar();
  };

  // Cinturón para los Safari que no hacen caso de touch-action (el dedo
  // que empieza en el lienzo no desplaza la página ni la amplía), y para
  // que una pulsación larga no saque el menú de «copiar imagen».
  const frenar = (e) => { if (e.cancelable) e.preventDefault(); };
  const sinMenu = (e) => e.preventDefault();
  const alRedimensionar = () => repintar();

  lienzo.addEventListener('pointerdown', alApoyar);
  lienzo.addEventListener('pointermove', alMover);
  lienzo.addEventListener('pointerup', alSoltar);
  lienzo.addEventListener('pointercancel', alSoltar);
  lienzo.addEventListener('lostpointercapture', alSoltar);
  lienzo.addEventListener('touchstart', frenar, { passive: false });
  lienzo.addEventListener('touchmove', frenar, { passive: false });
  lienzo.addEventListener('contextmenu', sinMenu);
  window.addEventListener('resize', alRedimensionar);
  window.addEventListener('orientationchange', alRedimensionar);
  let vigia = null;
  if (typeof ResizeObserver === 'function') {
    vigia = new ResizeObserver(alRedimensionar);
    vigia.observe(lienzo);
  }
  repintar(true);

  return {
    medida: () => medirFirma(trazos),
    firma: (nombre = '', cuando = null) => datoDeFirma(trazos, nombre, cuando || ultimoTrazo || new Date()),
    borrar: () => {
      for (const id of [...toques.keys()]) {
        try { if (lienzo.hasPointerCapture && lienzo.hasPointerCapture(id)) lienzo.releasePointerCapture(id); } catch { /* da igual */ }
      }
      toques.clear();
      trazos.length = 0;
      ultimoTrazo = null;
      repintar(true);
      avisar();
    },
    repintar: () => repintar(true),
    apagar: () => {
      if (apagado) return;
      apagado = true;
      toques.clear();
      lienzo.removeEventListener('pointerdown', alApoyar);
      lienzo.removeEventListener('pointermove', alMover);
      lienzo.removeEventListener('pointerup', alSoltar);
      lienzo.removeEventListener('pointercancel', alSoltar);
      lienzo.removeEventListener('lostpointercapture', alSoltar);
      lienzo.removeEventListener('touchstart', frenar);
      lienzo.removeEventListener('touchmove', frenar);
      lienzo.removeEventListener('contextmenu', sinMenu);
      window.removeEventListener('resize', alRedimensionar);
      window.removeEventListener('orientationchange', alRedimensionar);
      if (vigia) vigia.disconnect();
    },
  };
}

/* ¿Hay ya un papel abierto? Solo cabe uno: dos a la vez (un doble toque
   en «Firmar») se pisarían el historial y dejarían una capa colgada debajo
   de la otra. Vale desde que se abre hasta que su promesa contesta. */
let abierta = false;

/**
 * Abre el papel a pantalla completa y espera a que firmen.
 *
 *   titulo            lo que se lee arriba («Firma de la parte compradora»)
 *   nombre            el nombre que se propone; quien firma lo puede corregir
 *   comprobarNombre   (nombre) → '' si vale, o la frase de por qué no (por
 *                     ejemplo, que lleva letras que el documento no sabe
 *                     escribir). Se mira al pulsar «Aceptar».
 *   sinHistorial      true para que no toque el historial del navegador
 *
 * → Promise<null | {
 *     nombre,                 el nombre, tal como quedó escrito
 *     trazos, ancho, alto,    el garabato en una rejilla de 1000 de ancho
 *     puntos, largo,          cuántos puntos tiene y cuánto trazo (px)
 *     firmadoEn,              el instante, en ISO («2026-11-17T10:12:31.000Z»)
 *     fecha, hora,            el día y la hora del reloj de este teléfono
 *     vistaPrevia,            una imagen pequeña (data:image/png…) para un <img>
 *     vistaAncho, vistaAlto,
 *   }>
 *
 * null = se cerró sin firmar (la X, la tecla Escape o el botón de atrás
 * sin nada firmado). También contesta null, sin abrir nada, si se pide
 * mientras hay otra firma abierta (un doble toque): la primera sigue.
 *
 * Mientras está abierta pone una entrada en el historial, para que el
 * botón de atrás del teléfono cierre la capa en vez de cambiar la pantalla
 * de debajo. La quita al cerrarse, y la promesa se resuelve DESPUÉS de
 * quitarla: quien la espera puede navegar a continuación sin sorpresas.
 */
export function pedirFirma({ titulo = FRASES.titulo, nombre = '', comprobarNombre = null, sinHistorial = false } = {}) {
  if (typeof document === 'undefined' || abierta) return Promise.resolve(null);
  return new Promise((resolverDeVerdad) => {
    // Al contestar, el sitio queda libre para la firma siguiente.
    const resolver = (valor) => { abierta = false; resolverDeVerdad(valor); };
    const campo = h('input.d-firma-nombre', {
      type: 'text', maxlength: String(NOMBRE_MAXIMO), autocomplete: 'off', autocapitalize: 'words',
      autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', placeholder: FRASES.huecoNombre,
      'aria-label': FRASES.rotuloNombre,
    });
    campo.value = String(nombre || '').replace(/\s+/g, ' ').trim().slice(0, NOMBRE_MAXIMO);
    const lienzo = h('canvas.d-firma-lienzo');
    const papel = h('div.d-firma-papel', null,
      lienzo,
      h('p.d-firma-aqui', { 'aria-hidden': 'true' }, FRASES.aqui),
      h('span.d-firma-raya', { 'aria-hidden': 'true' }),
    );
    const pista = h('p.d-firma-pista', { role: 'status', 'aria-live': 'polite' });
    const botonBorrar = h('button.d-boton-negro.claro.d-firma-borrar', { type: 'button', disabled: true }, FRASES.borrar);
    const botonAceptar = h('button.d-boton-negro.d-firma-aceptar', { type: 'button', disabled: true }, FRASES.aceptar);
    const botonCerrar = h('button.d-firma-x', { type: 'button', 'aria-label': FRASES.cancelar }, icon('x'));
    // Lleva también la clase `d-velo`, la de los velos de la casa: es lo
    // que mira app.js para no repintar la pantalla de debajo ni recargar
    // la app con una versión nueva mientras alguien está firmando.
    const capa = h('div.d-velo.d-firma', { role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('div.d-firma-caja', null,
        h('div.d-firma-arriba', null,
          h('h2.d-firma-titulo', null, titulo),
          h('label.d-firma-campo', null, h('span.d-firma-rotulo', null, FRASES.rotuloNombre), campo),
          botonCerrar,
        ),
        papel,
        pista,
        h('div.d-firma-pie', null, botonBorrar, botonAceptar),
      ),
    );

    let cerrada = false;
    let conEntrada = false;   // ¿está puesta nuestra entrada en el historial?
    let avisado = '';         // la pista que manda hasta que se toque algo
    let motor = null;

    const decir = (frase, falta = false) => {
      pista.textContent = frase;
      pista.classList.toggle('falta', !!frase && falta);
    };

    const alDia = () => {
      if (cerrada || !motor) return;
      const medida = motor.medida();
      botonBorrar.disabled = medida.puntos === 0;
      botonAceptar.disabled = !medida.vale;
      capa.classList.toggle('con-tinta', medida.puntos > 0);
      if (avisado) decir(avisado, true);
      else decir(medida.puntos > 0 && !medida.vale ? FRASES.corta : '', true);
    };

    // Cinturón para los Safari que no hacen caso de touch-action, y para
    // que una pulsación larga no saque el menú de «copiar imagen».
    capa.addEventListener('touchmove', (e) => {
      if (e.target !== campo && e.cancelable) e.preventDefault();
    }, { passive: false });
    capa.addEventListener('contextmenu', (e) => e.preventDefault());
    // Un toque que empieza pegado a un lado de la pantalla es, para el
    // teléfono, el gesto de «atrás»: se anula antes de que lo sea.
    capa.addEventListener('touchstart', (e) => {
      const toque = e.touches && e.touches[0];
      if (!toque || !e.cancelable) return;
      if (toque.clientX < BORDE_DEL_SISTEMA || toque.clientX > window.innerWidth - BORDE_DEL_SISTEMA) e.preventDefault();
    }, { passive: false });

    /* El botón de atrás del teléfono. Con la entrada puesta en el
       historial, «atrás» nos llega a nosotros y no cambia la pantalla de
       debajo: sin nada firmado, cierra; con algo firmado, no se pierde. */
    const ponerEntrada = () => {
      if (sinHistorial) return;
      try {
        history.pushState({ ...(history.state || {}), firmaAbierta: true }, '');
        conEntrada = true;
      } catch { conEntrada = false; }
    };
    const alVolver = () => {
      if (cerrada) return;
      conEntrada = false;
      if (motor && motor.medida().puntos > 0) {
        ponerEntrada();
        avisado = FRASES.atras;
        alDia();
        return;
      }
      cerrar(null);
    };
    // Si la pantalla de debajo cambia de sitio por su cuenta (un aviso que
    // lleva a otra parte), la firma no se queda colgada encima.
    const alCambiarDeSitio = () => {
      if (cerrada) return;
      conEntrada = false;
      cerrar(null);
    };
    const alTeclear = (e) => {
      if (e.key === 'Escape') cerrar(null);
    };

    function cerrar(valor) {
      if (cerrada) return;
      cerrada = true;
      window.removeEventListener('popstate', alVolver);
      window.removeEventListener('hashchange', alCambiarDeSitio);
      document.removeEventListener('keydown', alTeclear);
      if (motor) motor.apagar();
      capa.remove();
      if (!conEntrada) { resolver(valor); return; }
      // Se quita nuestra entrada del historial y solo entonces se contesta.
      conEntrada = false;
      let contestado = false;
      const contestar = () => {
        if (contestado) return;
        contestado = true;
        window.removeEventListener('popstate', contestar);
        resolver(valor);
      };
      window.addEventListener('popstate', contestar);
      setTimeout(contestar, 1000);
      try { history.back(); } catch { contestar(); }
    }

    botonBorrar.addEventListener('click', () => {
      avisado = '';
      if (motor) motor.borrar();
      alDia();
    });
    botonCerrar.addEventListener('click', () => cerrar(null));
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') campo.blur(); });
    campo.addEventListener('input', () => { if (avisado) { avisado = ''; alDia(); } });
    botonAceptar.addEventListener('click', () => {
      if (!motor) return;
      const medida = motor.medida();
      if (!medida.vale) { alDia(); return; }
      const escrito = campo.value.replace(/\s+/g, ' ').trim();
      let pega = escrito ? '' : FRASES.sinNombre;
      if (!pega && typeof comprobarNombre === 'function') {
        try { pega = String(comprobarNombre(escrito) || ''); } catch { pega = ''; }
      }
      if (pega) {
        avisado = pega;
        alDia();
        campo.focus();
        return;
      }
      // En la capa, la firma lleva el momento de «Aceptar».
      cerrar(motor.firma(escrito, new Date()));
    });

    // Lo que estuviera escribiéndose debajo suelta el teclado.
    try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch { /* da igual */ }
    document.body.append(capa);
    // El motor, con el papel ya puesto (lo mide al arrancar).
    motor = lienzoDeFirma(lienzo, {
      alEmpezar: () => {
        // Con el teclado abierto, firmar lo cierra: el papel vuelve a su tamaño.
        if (document.activeElement === campo) campo.blur();
        avisado = '';
        capa.classList.add('con-tinta');
      },
      alCambiar: alDia,
    });
    ponerEntrada();
    window.addEventListener('popstate', alVolver);
    window.addEventListener('hashchange', alCambiarDeSitio);
    document.addEventListener('keydown', alTeclear);
    alDia();
    // Lo último, con el papel ya puesto: si algo de arriba fallara, no se
    // queda el sitio ocupado para siempre.
    abierta = true;
  });
}
