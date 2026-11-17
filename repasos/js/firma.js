/* ═══════════════════════════════════════════════════════════════
   firma.js — la firma con el dedo

   Una capa a pantalla completa, encima de lo que haya: el nombre de
   quien firma (se puede corregir), un papel grande donde se firma con
   el dedo, con un lápiz o con el ratón, y «Borrar» y «Aceptar».

   La usa el «Conforme de la visita»: lo que devuelve pedirFirma() es
   lo que js/pdfConforme.js espera en `firmas`.

   Lo que no se ve y hace que funcione en un teléfono:

   · `touch-action: none` en el papel. Sin esa regla el navegador toma
     el arrastre por un desplazamiento, mueve la página y corta el
     trazo a los pocos píxeles. De cinturón, se frena también el
     `touchmove` de la capa entera.
   · El papel no llega a los bordes de la pantalla, que son del gesto de
     «atrás» del sistema; y un toque que empieza pegado al borde se
     anula. Si aun así el teléfono vuelve atrás con algo ya firmado, la
     capa NO se cierra: se queda como estaba y dice cómo salir.
   · Los trazos se guardan en las medidas que tenía el papel al empezar
     a firmar. Si la pantalla cambia —se gira el teléfono, sale o se va
     el teclado— el papel se rehace y lo firmado se vuelve a pintar sin
     deformar y sin perder nada: si el papel crece, nada se mueve; si se
     queda pequeño, lo firmado se encoge para caber y vuelve a su tamaño
     cuando hay sitio.
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
const NOMBRE_MAXIMO = 120;
// La imagen pequeña que acompaña a la firma, para enseñarla en pantalla.
const VISTA_PREVIA = Object.freeze({ ancho: 480, alto: 192, margen: 0.08 });

const FRASES = Object.freeze({
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
 * `firma` es lo que devuelve pedirFirma() o normalizarFirma().
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
    // LA regla que hace que esto funcione en un móvil (ver la cabecera).
    // Va también aquí, y no solo en la hoja de estilos, para que la firma
    // no dependa de que la hoja haya llegado entera.
    lienzo.style.touchAction = 'none';

    const ctx = lienzo.getContext('2d');
    /* Los trazos se guardan en las medidas que tenía el papel al empezar
       a firmar (el «mundo»). Si la pantalla cambia, el lienzo se rehace y
       lo firmado se vuelve a pintar: en su sitio si cabe, y encogido para
       que quepa entero, sin deformar, si no (ver repintar). */
    let mundo = null;
    let vista = { escala: 1, dx: 0, dy: 0 };
    let pintado = '';
    const trazos = [];
    let enCurso = null;       // el trazo que se está haciendo
    let dedo = null;          // el puntero que firma; los demás no cuentan
    let cerrada = false;
    let conEntrada = false;   // ¿está puesta nuestra entrada en el historial?
    let avisado = '';         // la pista que manda hasta que se toque algo

    const repintar = (aLaFuerza = false) => {
      if (cerrada || !ctx) return;
      const densidad = Math.min(window.devicePixelRatio || 1, 3);
      // Se mide el LIENZO, no su marco.
      const ancho = Math.max(1, lienzo.clientWidth);
      const alto = Math.max(1, lienzo.clientHeight);
      const medida = `${ancho}x${alto}@${densidad}`;
      if (!aLaFuerza && medida === pintado) return;
      pintado = medida;
      // Sin nada firmado, el mundo es la pantalla de ahora.
      if (!mundo || !trazos.length) mundo = { ancho, alto };
      lienzo.width = Math.round(ancho * densidad);
      lienzo.height = Math.round(alto * densidad);
      const escala = Math.min(1, ancho / mundo.ancho, alto / mundo.alto);
      if (escala === 1) {
        // El papel da para todo lo firmado: NADA se mueve ni cambia de
        // tamaño, y el mundo crece hasta el papel. Es lo que pasa cuando se
        // toca el papel con el teclado del nombre abierto: el teclado se
        // cierra a mitad del trazo, el papel crece, y el trazo tiene que
        // seguir bajo el dedo (centrándolo daba un salto).
        mundo = { ancho: Math.max(mundo.ancho, ancho), alto: Math.max(mundo.alto, alto) };
        vista = { escala: 1, dx: 0, dy: 0 };
      } else {
        // El papel se ha quedado pequeño: lo firmado se encoge, centrado.
        vista = { escala, dx: (ancho - mundo.ancho * escala) / 2, dy: (alto - mundo.alto * escala) / 2 };
      }
      ctx.setTransform(densidad * escala, 0, 0, densidad * escala, densidad * vista.dx, densidad * vista.dy);
      ctx.strokeStyle = '#111112';
      ctx.fillStyle = '#111112';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = GROSOR;
      for (const trazo of trazos) pintarTrazo(ctx, trazo);
    };

    const aMundo = (e) => {
      const caja = lienzo.getBoundingClientRect();
      return [
        (e.clientX - caja.left - vista.dx) / vista.escala,
        (e.clientY - caja.top - vista.dy) / vista.escala,
      ];
    };

    const decir = (frase, falta = false) => {
      pista.textContent = frase;
      pista.classList.toggle('falta', !!frase && falta);
    };

    const alDia = () => {
      const medida = medirFirma(trazos);
      botonBorrar.disabled = medida.puntos === 0;
      botonAceptar.disabled = !medida.vale;
      capa.classList.toggle('con-tinta', medida.puntos > 0);
      if (avisado) decir(avisado, true);
      else decir(medida.puntos > 0 && !medida.vale ? FRASES.corta : '', true);
    };

    const sumar = (e) => {
      const p = aMundo(e);
      // Lo que se sale del papel no se ve: tampoco se guarda (saldría en el PDF).
      if (mundo) { p[0] = Math.min(Math.max(p[0], 0), mundo.ancho); p[1] = Math.min(Math.max(p[1], 0), mundo.alto); }
      const anterior = enCurso[enCurso.length - 1];
      if (anterior && Math.hypot(p[0] - anterior[0], p[1] - anterior[1]) < PASO_MINIMO) return;
      enCurso.push(p);
      // Se pinta solo el cachito nuevo: repintar la firma entera a cada
      // punto se nota en un móvil viejo.
      const cuantos = enCurso.length;
      if (cuantos < 2 || !ctx) return;
      ctx.beginPath();
      if (cuantos === 2) {
        ctx.moveTo(enCurso[0][0], enCurso[0][1]);
        ctx.lineTo((enCurso[0][0] + p[0]) / 2, (enCurso[0][1] + p[1]) / 2);
      } else {
        const a = enCurso[cuantos - 3];
        const b = enCurso[cuantos - 2];
        ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        ctx.quadraticCurveTo(b[0], b[1], (b[0] + p[0]) / 2, (b[1] + p[1]) / 2);
      }
      ctx.stroke();
    };

    lienzo.addEventListener('pointerdown', (e) => {
      if (dedo !== null) return;                 // la palma, un segundo dedo
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      // Con el teclado abierto, firmar lo cierra: el papel vuelve a su tamaño.
      if (document.activeElement === campo) campo.blur();
      dedo = e.pointerId;
      try { lienzo.setPointerCapture(dedo); } catch { /* hay navegadores que no dejan */ }
      avisado = '';
      enCurso = [];
      trazos.push(enCurso);
      sumar(e);
      capa.classList.add('con-tinta');
    });
    lienzo.addEventListener('pointermove', (e) => {
      if (e.pointerId !== dedo || !enCurso) return;
      e.preventDefault();
      // El móvil junta varios movimientos en un solo aviso; aquí se
      // recuperan todos, que es lo que da la curva fina.
      const todos = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const uno of (todos.length ? todos : [e])) sumar(uno);
    });
    const soltar = (e) => {
      if (e.pointerId !== dedo) return;
      dedo = null;
      // El trazo acaba donde quedó: se repinta entero para cerrarlo (el
      // último cachito llega solo hasta la mitad del último tramo) y para
      // que un toque suelto deje su punto.
      enCurso = null;
      repintar(true);
      alDia();
    };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
    lienzo.addEventListener('lostpointercapture', soltar);

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
      if (medirFirma(trazos).puntos > 0) {
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
    const alRedimensionar = () => repintar();
    let vigia = null;

    function cerrar(valor) {
      if (cerrada) return;
      cerrada = true;
      window.removeEventListener('resize', alRedimensionar);
      window.removeEventListener('orientationchange', alRedimensionar);
      window.removeEventListener('popstate', alVolver);
      window.removeEventListener('hashchange', alCambiarDeSitio);
      document.removeEventListener('keydown', alTeclear);
      if (vigia) vigia.disconnect();
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
      trazos.length = 0;
      enCurso = null;
      dedo = null;
      avisado = '';
      repintar(true);
      alDia();
    });
    botonCerrar.addEventListener('click', () => cerrar(null));
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') campo.blur(); });
    campo.addEventListener('input', () => { if (avisado) { avisado = ''; alDia(); } });
    botonAceptar.addEventListener('click', () => {
      const medida = medirFirma(trazos);
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
      const normal = normalizarFirma(trazos);
      const ahora = new Date();
      const imagen = vistaPreviaDeFirma(normal);
      cerrar({
        nombre: escrito,
        trazos: normal.trazos,
        ancho: normal.ancho,
        alto: normal.alto,
        puntos: medida.puntos,
        largo: Math.round(medida.largo),
        firmadoEn: ahora.toISOString(),
        fecha: `${ahora.getFullYear()}-${dosCifras(ahora.getMonth() + 1)}-${dosCifras(ahora.getDate())}`,
        hora: `${dosCifras(ahora.getHours())}:${dosCifras(ahora.getMinutes())}`,
        vistaPrevia: imagen ? imagen.url : '',
        vistaAncho: imagen ? imagen.ancho : 0,
        vistaAlto: imagen ? imagen.alto : 0,
      });
    });

    // Lo que estuviera escribiéndose debajo suelta el teclado.
    try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch { /* da igual */ }
    document.body.append(capa);
    ponerEntrada();
    window.addEventListener('resize', alRedimensionar);
    window.addEventListener('orientationchange', alRedimensionar);
    window.addEventListener('popstate', alVolver);
    window.addEventListener('hashchange', alCambiarDeSitio);
    document.addEventListener('keydown', alTeclear);
    if (typeof ResizeObserver === 'function') {
      vigia = new ResizeObserver(alRedimensionar);
      vigia.observe(lienzo);
    }
    repintar(true);
    alDia();
    // Lo último, con el papel ya puesto: si algo de arriba fallara, no se
    // queda el sitio ocupado para siempre.
    abierta = true;
  });
}
