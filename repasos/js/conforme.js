/* ═══════════════════════════════════════════════════════════════
   conforme.js — «Finalizar la visita»: de la hoja al papel firmado.

   Lo que pasa desde que quien hace la visita de repasos pulsa
   «Finalizar visita» hasta que el «Conforme de la visita» queda
   guardado en la vivienda, con el comprador delante y quizá sin
   cobertura. Cuatro pasos, todos dentro de UNA capa a pantalla completa
   (un velo de la casa, `.d-velo.d-conforme`: mientras está puesta, la
   app ni repinta la pantalla de debajo ni se recarga con una versión
   nueva):

     1. LA HOJA      la fecha de la visita, quién la hace, la fecha
                     orientativa de finalización (una sola, para todos
                     los repasos; no se pide si no hay ninguno), si se
                     han dado los contactos, las observaciones y quién
                     firma. Cada cambio se guarda al momento en el
                     borrador de este móvil: si se cierra, o si el
                     teléfono mata la app, al volver sale como estaba.
     2. EL DOCUMENTO escrito en la pantalla, para que el comprador lo
                     lea ANTES de firmar. Las frases son las del papel:
                     salen de frasesDeConforme() (js/pdfConforme.js) y
                     aquí no se redacta ni se repite ninguna.
     3. LA FIRMA     con el dedo, EN EL PROPIO DOCUMENTO: al final, un
                     recuadro por cada persona de «Quién firma», uno
                     debajo del otro, y se firma ahí mismo (el motor de
                     los trazos es el de js/firma.js, lienzoDeFirma). El
                     dedo que cae dentro de un recuadro firma y no mueve
                     la página; el que cae fuera la desplaza. «Aceptar y
                     guardar» se enciende con la primera firma; si hay
                     una segunda persona y no ha firmado, se pregunta si
                     se guarda sin ella. Quien no firma no figura.
     4. EL PAPEL     se monta el PDF (segundos, sin red), se calcula su
                     huella, se guarda en este móvil (store.guardarConforme,
                     que lo deja en la cola para que suba solo) y se
                     ofrece compartirlo o guardarlo.

   Antes de pedirle la firma a nadie se comprueba TODO lo que el papel o
   el servidor podrían rechazar después: al comprador no se le puede
   pedir que firme dos veces.

   Se puede salir sin firmar en cualquier momento antes de guardar: la
   visita se queda empezada, no hecha, y lo escrito en la hoja, guardado.

   El botón de atrás del teléfono: en el documento vuelve a la hoja (con
   algo firmado, pregunta antes: lo firmado se perdería); en la hoja, la
   cierra; con un calendario o una pregunta abiertos, los cierra;
   mientras se prepara el papel no hace nada.

   En lo que se lee aquí, cada cosa lleva su palabra del diccionario de
   la casa y ninguna otra: «conforme de la visita» y «repasos de la
   visita».
   ═══════════════════════════════════════════════════════════════ */
import { h, icon, toast, confirmar } from './ui.js';
import * as store from './store.js';
import { promocion, unidad } from './catalog.js';
import { hojaFecha, entregarFichero } from './piezas.js';
import * as E from './entregas.js';
import { BOTONES, NO_TIENE, valorDeBoton, diaDeInstante, horaDeInstante } from './posventa.js';
import {
  VARIANTE_CONFORME, TOPES_CONFORME, cargarTipografia, frasesDeConforme, pegasDeConforme,
  medirConforme, pdfConforme, nombreDeConforme,
} from './pdfConforme.js';
import { lienzoDeFirma, FRASES_DE_FIRMA } from './firma.js';
import { refrescar } from './app.js';

/* El tope de lo firmado como dato, medido TAL COMO VIAJA (los octetos
   de su JSON en UTF-8). Es la misma constante que en el servidor
   (api/lib/posventa.php): el móvil lo mide antes de dejar firmar, para
   que un conforme no pueda rechazarse por tamaño después de firmado. */
export const CONFORME_DATOS_MAX = 58000;

/* Lo demás que exige el servidor a lo firmado, para mirarlo antes. */
const TOPES = Object.freeze({ repasos: 200, textoDeRepaso: 4000, nombre: 120, compradores: 160, paginas: 20 });
/* Lo que se reserva, al medir antes de firmar, para lo que aún no se
   sabe del todo (el instante de cada firma y su escritura). */
const RESERVA_DE_FIRMAS = 600;

const FRASES = Object.freeze({
  titulo: 'Finalizar la visita',
  rotuloVisita: 'Fecha de la visita',
  rotuloQuien: 'Quién hace la visita',
  pistaQuien: 'Sale en el documento como «Visita realizada por».',
  rotuloOrientativa: 'Fecha orientativa de finalización',
  elegirDia: 'Elegir un día',
  pistaOrientativa: 'Un día concreto, para todos los repasos. En el documento figura siempre como orientativa.',
  rotuloContactos: 'Se han dado los contactos',
  sinContactos: 'El documento no dirá nada de los contactos.',
  rotuloObservaciones: 'Observaciones',
  huecoObservaciones: 'Opcional. Lo que quieras dejar escrito: el cliente lo firma con el resto.',
  rotuloFirma: 'Quién firma',
  huecoNombre: 'Nombre y apellidos',
  pistaFirma: 'Tal como saldrá escrito junto a la firma.',
  otraFirma: 'Añadir otra firma',
  rotuloSegunda: 'Segunda persona que firma',
  quitarSegunda: 'Quitar la segunda firma',
  verDocumento: 'Ver el documento',
  corregir: 'Corregir',
  aceptarYGuardar: 'Aceptar y guardar',
  soloUnaFirma: (primero) => `¿Guardar el conforme solo con la firma de ${primero}?`,
  noHaFirmado: (segundo) => `${segundo} no ha firmado.`,
  siGuardar: 'Sí, guardar',
  volver: 'Volver',
  segundaCorta: (segundo) => `La firma de ${segundo} es demasiado corta: siga firmando en su recuadro, o toque «Borrar» y repita.`,
  volverConFirmas: '¿Volver a la hoja?',
  seBorranLasFirmas: 'Lo firmado en el documento se borra, y habrá que firmar otra vez.',
  siVolver: 'Volver a la hoja',
  seguirFirmando: 'Seguir en el documento',
  preparando: 'Preparando el conforme…',
  guardado: 'Conforme firmado y guardado',
  notaDeEntrega: 'Compártelo con los compradores: es su copia.',
  reintentar: 'Volver a intentarlo',
  compartir: 'Compartir el PDF',
  faltaQuien: 'Escribe el nombre de quien hace la visita.',
  faltaFirmante: 'Escribe el nombre de quien firma.',
  faltaSegundo: 'Escribe el nombre de la segunda persona que firma, o quítala.',
  visitaFutura: 'La fecha de la visita no puede ser posterior a hoy.',
  demasiado: 'Esta visita lleva demasiado texto para un solo documento. Acorta la descripción de algún repaso o las observaciones y vuelve a intentarlo.',
  demasiadosRepasos: 'Esta visita lleva más repasos de los que caben en un solo documento (200). Haz el conforme con los que hay y apunta el resto en otra visita.',
  compradoresLargos: 'El nombre de los compradores de la ficha es demasiado largo para el documento (160 letras). Se acorta en las fechas de la entrega de la vivienda.',
  dondeCompradores: 'Se corrige en las fechas de la entrega de la vivienda.',
  sinSello: 'Este navegador no deja sellar el documento. Abre la app desde su dirección de siempre (https) y vuelve a intentarlo.',
  hanCambiado: 'Los repasos de la visita han cambiado mientras tanto. Revisa el documento antes de firmar.',
  yaFirmada: 'Esta visita ya tiene su conforme firmado (se ha firmado en otro móvil).',
  noPreparado: 'No se ha podido preparar el documento.',
  noGuardado: 'El documento está hecho, pero no se ha podido guardar en este móvil.',
  quizaSinSitio: 'Puede que el teléfono se haya quedado sin sitio. Libera espacio y toca «Volver a intentarlo». Mientras tanto, «Compartir el PDF» pone el documento a salvo.',
  falloAlPreparar: 'Ha fallado algo al prepararlo. Toca «Volver a intentarlo».',
});

const limpio = (texto) => String(texto || '').replace(/\s+/g, ' ').trim();
const esUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
const octetosDe = (cosa) => new TextEncoder().encode(JSON.stringify(cosa)).length;
const enHex = (octetos) => [...new Uint8Array(octetos)].map((x) => x.toString(16).padStart(2, '0')).join('');
/** «1.000»: las cifras de la cuenta de letras, con su punto. */
const conPunto = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** Un día suelto como lo quiere hojaFecha(), y al revés. */
const paraCalendario = (dia) => E.partes(dia).fecha.toISOString();
const deCalendario = (instante) => E.isoDe(new Date(instante));
/** «lunes 16 de noviembre de 2026»: siempre con su año, que esto se firma. */
const diaEntero = (dia) => `${E.diaSemana(dia)} ${E.fechaLarga(dia, { conAno: true })}`;

/**
 * Lo que la villa TIENE, que es lo que nombra la línea de los
 * contactos: la domótica, la fotovoltaica y los armarios, siempre; la piscina y la
 * climatización, salvo que su botón diga «No tiene».
 */
export function contactosDeVilla(entrega) {
  const tiene = {};
  for (const boton of BOTONES) {
    tiene[boton.clave] = !(boton.admiteNoTiene && valorDeBoton(entrega, boton.clave) === NO_TIENE);
  }
  return tiene;
}

/** «Piscina, climatización, domótica, fotovoltaica y armarios», con lo que la villa tenga. */
function listaDeContactos(tiene) {
  const nombres = BOTONES.filter((b) => tiene[b.clave]).map((b) => b.nombre.toLowerCase());
  if (!nombres.length) return '';
  const frase = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0];
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

/**
 * Cambia lo que hay dentro de un nodo por estos hijos, sin los huecos:
 * a replaceChildren() no se le puede pasar un null (lo escribe, con sus
 * cuatro letras).
 */
function poner(nodo, ...hijos) {
  nodo.replaceChildren(...hijos.flat().filter((hijo) => hijo !== null && hijo !== undefined && hijo !== false));
}

/* EL REPOSO. Los pasos de este recorrido se pintan uno donde estaba el
   otro, y sus botones caen bajo el mismo dedo: con un doble toque en
   «Ver el documento», el segundo pulsaba «Firmar»; con uno en «Aceptar»
   de la primera firma, el segundo contestaba «No firma» a una pregunta
   que nadie había llegado a ver, y el conforme —que no se anula— quedaba
   cerrado con una sola firma; y con un solo firmante cerraba la hoja
   «El PDF está listo» nada más salir. Es la regla de confirmar()
   (js/ui.js): lo recién pintado no atiende hasta pasado un rato de dedo
   quieto, y cada toque que llega a destiempo vuelve a empezar la cuenta.
   reposo() devuelve la pregunta «¿puede pasar este toque?». Hoy la
   guardan «Corregir» y «Aceptar y guardar» del documento (que salen
   donde estaba «Ver el documento») y la hoja «El PDF está listo» (que
   sale bajo «Aceptar y guardar»). La pregunta de la segunda firma es
   un confirmar() de la casa, que trae la suya. */
const REPOSO = 700;
function reposo() {
  let desde = performance.now();
  return () => {
    const ahora = performance.now();
    if (ahora - desde >= REPOSO) return true;
    desde = ahora;
    return false;
  };
}

/** Solo una a la vez: un doble toque en «Finalizar visita» no abre dos capas. */
let abierta = false;

/**
 * Abre «Finalizar la visita» y lleva el recorrido hasta el conforme
 * guardado.
 *
 *   lista     la lista de la visita (fase 'visita'), sin conforme.
 *   entrega   la ficha de entrega de la vivienda (compradores, la cita,
 *             la firma de la escritura y los cinco botones).
 *   repasos   los repasos vivos de la visita, en su orden.
 *
 * Resuelve con { firmado: true, conforme } cuando el papel queda
 * guardado (la pantalla de debajo ya está repintada y la hoja «El PDF
 * está listo», puesta), o con { firmado: false } si se sale sin firmar:
 * la visita sigue empezada y lo escrito queda en el borrador.
 */
export async function finalizarVisita({ lista, entrega, repasos }) {
  if (abierta || typeof document === 'undefined') return { firmado: false };
  abierta = true;
  try {
    return await recorrido({ lista, entrega: entrega || {}, repasos: Array.isArray(repasos) ? repasos : [] });
  } finally {
    abierta = false;
  }
}

async function recorrido({ lista, entrega, repasos: repasosAlAbrir }) {
  const yo = store.sesion();
  const p = promocion(lista.promoId);
  const u = unidad(lista.unidadId);
  const numero = String(lista.unidadId).split(':')[1] || '';
  const tiene = contactosDeVilla(entrega);
  let repasos = repasosAlAbrir;

  /* ─── Lo escrito: el borrador de este móvil, o lo que toca de entrada ─── */
  const guardadoAntes = (await store.leerBorradorConforme(lista.id)) || {};
  const estado = {
    fechaVisita: E.esDia(guardadoAntes.fechaVisita) ? guardadoAntes.fechaVisita
      : (diaDeInstante(lista.creado) || E.hoyIso()),
    realizadaPor: typeof guardadoAntes.realizadaPor === 'string' ? guardadoAntes.realizadaPor : (yo?.nombre || ''),
    fechaOrientativa: E.esDia(guardadoAntes.fechaOrientativa) ? guardadoAntes.fechaOrientativa : '',
    observaciones: typeof guardadoAntes.observaciones === 'string'
      ? guardadoAntes.observaciones.slice(0, TOPES_CONFORME.observaciones) : '',
    contactosDados: guardadoAntes.contactosDados !== false,
    firmantes: Array.isArray(guardadoAntes.firmantes) && guardadoAntes.firmantes.length
      ? guardadoAntes.firmantes.slice(0, TOPES_CONFORME.firmas).map((n) => String(n || ''))
      : [String(entrega.compradores || '')],
  };
  let relojBorrador = 0;
  const guardarBorrador = () => {
    clearTimeout(relojBorrador);
    return store.guardarBorradorConforme(lista.id, {
      fechaVisita: estado.fechaVisita,
      realizadaPor: estado.realizadaPor,
      fechaOrientativa: estado.fechaOrientativa,
      observaciones: estado.observaciones,
      contactosDados: estado.contactosDados,
      firmantes: estado.firmantes.slice(),
    }).catch(() => { /* sin sitio: el borrador no es el papel */ });
  };
  /** Mientras se teclea no se escribe en cada letra: un cuarto de segundo después de la última. */
  const apuntar = () => { clearTimeout(relojBorrador); relojBorrador = setTimeout(guardarBorrador, 250); };

  /* ─── El documento, con lo que hay escrito ─── */
  // La hora de la visita no se pregunta: la de la cita, si la cita es de
  // ese día y tiene hora; si no, la hora en que se empezó la visita.
  const horaDeVisita = () => (entrega.posventa === estado.fechaVisita && /^\d{2}:\d{2}$/.test(entrega.posventaHora || '')
    ? entrega.posventaHora : horaDeInstante(lista.creado));
  // La firma de la escritura solo figura si es de ese día o anterior.
  const escritura = () => (E.esDia(entrega.firma) && entrega.firma <= estado.fechaVisita ? entrega.firma : '');
  const firmantesEscritos = () => estado.firmantes.map(limpio).filter(Boolean);
  /** Lo que se le pasa a js/pdfConforme.js. Sin `firmas`, van los nombres de quien va a firmar. */
  const docDe = (firmas = null) => ({
    sociedad: p?.sociedad || '',
    promocion: p?.nombre || '',
    vivienda: numero,
    fechaVisita: estado.fechaVisita,
    horaVisita: horaDeVisita(),
    compradores: limpio(entrega.compradores),
    fechaEscritura: escritura(),
    realizadaPor: limpio(estado.realizadaPor),
    repasos: repasos.map((t) => ({ texto: t.texto || '' })),
    fechaOrientativa: repasos.length ? estado.fechaOrientativa : '',
    observaciones: estado.observaciones.trim(),
    contactos: { dados: estado.contactosDados, ...tiene },
    firmas: firmas || firmantesEscritos().map((nombre) => ({ nombre })),
    // El día del «En …, a …». El papel firmado lleva el de la firma, no
    // el de la visita; así que antes de firmar se enseña el de HOY, que
    // es el que llevará. Si la visita se empezó otro día, lo que se lee
    // y lo que se firma dicen lo mismo.
    fecha: firmas ? '' : E.hoyIso(),
  });
  /** Lo firmado como dato, tal como viaja al servidor (contrato § 3.5). Los trazos NO van. */
  const datosDe = (doc, firmas, paginas) => ({
    v: 1,
    unidadId: lista.unidadId, promoId: lista.promoId, listaId: lista.id,
    plantilla: VARIANTE_CONFORME,
    sociedad: doc.sociedad, promocion: doc.promocion, vivienda: doc.vivienda,
    fechaVisita: doc.fechaVisita, horaVisita: doc.horaVisita,
    compradores: doc.compradores,
    fechaEscritura: doc.fechaEscritura,
    realizadaPor: doc.realizadaPor, realizadaPorId: esUuid(yo?.id) ? yo.id : null,
    fechaOrientativa: doc.fechaOrientativa,
    observaciones: doc.observaciones,
    contactos: {
      dados: doc.contactos.dados === true, piscina: doc.contactos.piscina === true, clima: doc.contactos.clima === true,
      domotica: doc.contactos.domotica === true, armarios: doc.contactos.armarios === true,
      fotovoltaica: doc.contactos.fotovoltaica === true,
    },
    repasos: repasos.map((t) => ({ id: t.id, texto: t.texto || '' })),
    firmas: firmas.map((f) => ({ nombre: f.nombre, firmadoEn: f.firmadoEn, fecha: f.fecha, hora: f.hora })),
    paginas,
  });
  /**
   * Lo que ni el papel ni el servidor admitirían por tamaño, mirado
   * ANTES de firmar: '' si cabe, o la frase de por qué no.
   */
  const pegaDeTamano = (doc) => {
    if (repasos.length > TOPES.repasos) return FRASES.demasiadosRepasos;
    if (repasos.some((t) => String(t.texto || '').length > TOPES.textoDeRepaso)) return FRASES.demasiado;
    if (medirConforme(doc).paginas > TOPES.paginas) return FRASES.demasiado;
    const relleno = { nombre: 'M'.repeat(TOPES.nombre), firmadoEn: '2026-11-17T10:12:31.000Z', fecha: '2026-11-17', hora: '10:12' };
    const medida = octetosDe(datosDe(doc, [relleno, relleno], TOPES.paginas)) + RESERVA_DE_FIRMAS;
    return medida > CONFORME_DATOS_MAX ? FRASES.demasiado : '';
  };

  // La letra del papel, pedida ya: cuando haga falta estará (va en la
  // caché de la app; si no llegara, el papel sale con la de reserva).
  const letra = cargarTipografia().catch(() => null);

  /* ─── La capa ─── */
  const cuerpo = h('div.d-conforme-cuerpo');
  const pie = h('div.d-conforme-pie');
  const capa = h('div.d-velo.d-conforme', { role: 'dialog', 'aria-modal': 'true', 'aria-label': FRASES.titulo },
    h('div.d-conforme-caja', null, cuerpo, pie));

  let paso = 'hoja';         // 'hoja' · 'documento' · 'preparando' · 'fallo'
  let cerrada = false;
  let preguntando = false;   // hay una pregunta de la casa abierta encima (confirmar)
  let conEntrada = false;    // ¿está puesta nuestra entrada en el historial?
  let recuadros = [];        // los recuadros de firma del documento en pantalla, uno por persona
  let resolver = () => {};
  const promesa = new Promise((listo) => { resolver = listo; });

  const ponerEntrada = () => {
    try {
      history.pushState({ ...(history.state || {}), conformeAbierto: true }, '');
      conEntrada = true;
    } catch { conEntrada = false; }
  };
  const alVolver = () => {
    if (cerrada) return;
    conEntrada = false;
    // Con una pregunta abierta encima, «atrás» contesta que no.
    if (preguntando) {
      const pregunta = [...document.querySelectorAll('.d-menu-velo.confirmar')].pop();
      pregunta?.querySelector('.d-confirmar-x')?.click();
      ponerEntrada();
      return;
    }
    // Con un calendario abierto encima, «atrás» cierra el calendario.
    const calendario = [...document.querySelectorAll('.d-velo.abajo')].pop();
    if (calendario) { calendario.click(); ponerEntrada(); return; }
    // En el documento vuelve a la hoja; con algo firmado, pregunta antes.
    if (paso === 'documento') { ponerEntrada(); corregir(); return; }
    if (paso === 'hoja') { cerrar({ firmado: false }); return; }
    // Preparando el papel, no se sale.
    ponerEntrada();
  };
  // Si la pantalla de debajo cambia de sitio por su cuenta (un aviso que
  // lleva a otra parte), la capa no se queda colgada encima. Con el
  // papel a medio guardar se espera a que acabe.
  const alCambiarDeSitio = () => {
    if (cerrada || paso === 'preparando') return;
    conEntrada = false;
    cerrar({ firmado: false });
  };

  /** Quita la capa y, con su entrada del historial ya fuera, contesta. */
  function cerrar(valor) {
    if (cerrada) return;
    cerrada = true;
    guardarBorradorSiToca(valor);
    apagarRecuadros();
    window.removeEventListener('popstate', alVolver);
    window.removeEventListener('hashchange', alCambiarDeSitio);
    capa.remove();
    if (!conEntrada) { resolver(valor); return; }
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
  /** Al salir sin firmar, lo escrito se queda; con el papel guardado, el borrador ya se ha borrado. */
  function guardarBorradorSiToca(valor) {
    clearTimeout(relojBorrador);
    if (!valor?.firmado) guardarBorrador();
  }

  /* ─── Paso 1 · La hoja ─── */
  let errores = {};          // campo → frase, de la última vez que se pulsó «Ver el documento»
  let aviso = '';            // una frase suelta arriba del documento (los repasos han cambiado…)

  function pintarHoja() {
    paso = 'hoja';
    apagarRecuadros();
    const error = (campo) => (errores[campo] ? h('p.d-conforme-error', { role: 'alert', 'data-error': campo }, errores[campo]) : null);
    const quitarError = (campo, nodo) => {
      if (!errores[campo]) return;
      delete errores[campo];
      nodo?.closest('.d-conforme-fila')?.querySelector(`.d-conforme-error[data-error="${campo}"]`)?.remove();
    };

    /* La fecha de la visita */
    const rotuloVisita = h('span.grow', null, diaEntero(estado.fechaVisita));
    const filaVisita = h('button.d-conforme-dia.puesto', {
      type: 'button', 'data-campo': 'fechaVisita',
      onclick: async () => {
        const v = await hojaFecha(paraCalendario(estado.fechaVisita));
        // Es obligatoria: ni cerrar el calendario ni «Quitar la fecha» la dejan vacía.
        if (!v || cerrada) return;
        estado.fechaVisita = deCalendario(v);
        rotuloVisita.textContent = diaEntero(estado.fechaVisita);
        quitarError('fechaVisita', filaVisita);
        guardarBorrador();
      },
    }, icon('calendario'), rotuloVisita, icon('chevron'));

    /* Quién hace la visita */
    const campoQuien = h('input.d-conforme-campo', {
      type: 'text', maxlength: String(TOPES.nombre), autocomplete: 'off', autocapitalize: 'words',
      autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', placeholder: FRASES.huecoNombre,
      'aria-label': FRASES.rotuloQuien, 'data-campo': 'realizadaPor',
    });
    campoQuien.value = estado.realizadaPor;
    campoQuien.addEventListener('input', () => { estado.realizadaPor = campoQuien.value; quitarError('realizadaPor', campoQuien); apuntar(); });

    /* La fecha orientativa de finalización: solo si hay algún repaso */
    let bloqueOrientativa = null;
    if (repasos.length) {
      const rotulo = h('span.grow', null, estado.fechaOrientativa ? E.fechaLarga(estado.fechaOrientativa, { conAno: true }) : FRASES.elegirDia);
      const fila = h('button.d-conforme-dia', {
        type: 'button', class: estado.fechaOrientativa ? 'puesto' : '', 'data-campo': 'fechaOrientativa',
        onclick: async () => {
          const v = await hojaFecha(estado.fechaOrientativa ? paraCalendario(estado.fechaOrientativa) : null);
          if (v === null || cerrada) return;
          estado.fechaOrientativa = v ? deCalendario(v) : '';
          rotulo.textContent = estado.fechaOrientativa ? E.fechaLarga(estado.fechaOrientativa, { conAno: true }) : FRASES.elegirDia;
          fila.classList.toggle('puesto', !!estado.fechaOrientativa);
          quitarError('fechaOrientativa', fila);
          guardarBorrador();
        },
      }, icon('calendario'), rotulo, icon('chevron'));
      bloqueOrientativa = h('div.d-conforme-fila', null,
        h('p.d-conforme-rotulo', null, FRASES.rotuloOrientativa),
        fila,
        h('p.d-conforme-pista', null, FRASES.pistaOrientativa),
        error('fechaOrientativa'),
      );
    }

    /* Se han dado los contactos */
    const pistaContactos = h('p.d-conforme-pista');
    const interruptor = h('button.d-conforme-interruptor', {
      type: 'button', role: 'switch', 'aria-checked': estado.contactosDados ? 'true' : 'false',
      'data-campo': 'contactos',
      onclick: () => {
        estado.contactosDados = !estado.contactosDados;
        ponerContactos();
        guardarBorrador();
      },
    }, h('span.grow', null, FRASES.rotuloContactos), h('span.d-conforme-palanca', { 'aria-hidden': 'true' }));
    const ponerContactos = () => {
      interruptor.setAttribute('aria-checked', estado.contactosDados ? 'true' : 'false');
      pistaContactos.textContent = estado.contactosDados ? listaDeContactos(tiene) : FRASES.sinContactos;
    };
    ponerContactos();

    /* Observaciones */
    const cuenta = h('p.d-conforme-cuenta', { 'aria-live': 'polite' });
    const cajaObservaciones = h('textarea.d-conforme-campo.alto', {
      rows: 4, maxlength: String(TOPES_CONFORME.observaciones), autocapitalize: 'sentences',
      placeholder: FRASES.huecoObservaciones, 'aria-label': FRASES.rotuloObservaciones, 'data-campo': 'observaciones',
    });
    cajaObservaciones.value = estado.observaciones;
    const ponerCuenta = () => { cuenta.textContent = `${conPunto(cajaObservaciones.value.length)} / ${conPunto(TOPES_CONFORME.observaciones)}`; };
    cajaObservaciones.addEventListener('input', () => {
      // El tope lo pone la caja; por si un pegado se lo saltara, se corta aquí también.
      if (cajaObservaciones.value.length > TOPES_CONFORME.observaciones) {
        cajaObservaciones.value = cajaObservaciones.value.slice(0, TOPES_CONFORME.observaciones);
      }
      estado.observaciones = cajaObservaciones.value;
      ponerCuenta();
      quitarError('observaciones', cajaObservaciones);
      apuntar();
    });
    ponerCuenta();

    /* Quién firma: uno, y si acaso otro */
    const campoDeNombre = (indice, rotulo) => {
      const campo = h('input.d-conforme-campo', {
        type: 'text', maxlength: String(TOPES.nombre), autocomplete: 'off', autocapitalize: 'words',
        autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', placeholder: FRASES.huecoNombre,
        'aria-label': rotulo, 'data-campo': indice ? 'firmante2' : 'firmante1',
      });
      campo.value = estado.firmantes[indice] || '';
      campo.addEventListener('input', () => {
        estado.firmantes[indice] = campo.value;
        quitarError(indice ? 'firmante2' : 'firmante1', campo);
        quitarError('firmas', campo);
        apuntar();
      });
      return campo;
    };
    const zonaSegunda = h('div.d-conforme-segunda');
    const ponerSegunda = () => {
      if (estado.firmantes.length < 2) {
        poner(zonaSegunda, h('button.d-conforme-enlace', {
          type: 'button', 'data-accion': 'otra-firma',
          onclick: () => { estado.firmantes[1] = ''; ponerSegunda(); guardarBorrador(); zonaSegunda.querySelector('input')?.focus(); },
        }, icon('plus'), FRASES.otraFirma));
        return;
      }
      poner(zonaSegunda,
        h('div.d-conforme-con-aspa', null,
          campoDeNombre(1, FRASES.rotuloSegunda),
          h('button.d-conforme-aspa', {
            type: 'button', 'aria-label': FRASES.quitarSegunda,
            onclick: () => { estado.firmantes.length = 1; delete errores.firmante2; ponerSegunda(); guardarBorrador(); },
          }, icon('x'))),
        error('firmante2'),
      );
    };
    ponerSegunda();

    const generales = [errores.repasos, errores.compradores, errores.vivienda].filter(Boolean);
    const cuantos = repasos.length;
    poner(cuerpo,
      h('div.d-conforme-cab', null,
        h('h2.d-conforme-titulo', null, FRASES.titulo),
        h('button.d-conforme-x', { type: 'button', 'aria-label': 'Cerrar sin firmar', onclick: () => cerrar({ firmado: false }) }, icon('x')),
      ),
      h('p.d-conforme-villa', null, `${u?.nombre || 'Vivienda'} · ${cuantos === 0 ? 'ningún repaso anotado'
        : cuantos === 1 ? '1 repaso anotado' : `${cuantos} repasos anotados`}`),
      h('div.d-conforme-fila', null,
        h('p.d-conforme-rotulo', null, FRASES.rotuloVisita), filaVisita, error('fechaVisita')),
      h('div.d-conforme-fila', null,
        h('p.d-conforme-rotulo', null, FRASES.rotuloQuien), campoQuien,
        h('p.d-conforme-pista', null, FRASES.pistaQuien), error('realizadaPor')),
      bloqueOrientativa,
      h('div.d-conforme-fila', null, interruptor, pistaContactos),
      h('div.d-conforme-fila', null,
        h('p.d-conforme-rotulo', null, FRASES.rotuloObservaciones), cajaObservaciones, cuenta, error('observaciones')),
      h('div.d-conforme-fila', null,
        h('p.d-conforme-rotulo', null, FRASES.rotuloFirma), campoDeNombre(0, FRASES.rotuloFirma),
        h('p.d-conforme-pista', null, FRASES.pistaFirma), error('firmante1'), error('firmas'),
        zonaSegunda),
      generales.length ? h('div.d-conforme-aviso.rojo', { role: 'alert', 'data-error': 'general' },
        icon('alert'), h('div.grow', null, generales.map((frase) => h('p', null, frase)))) : null,
    );
    poner(pie, h('button.d-boton-negro', { type: 'button', 'data-accion': 'ver-documento', onclick: verDocumento }, FRASES.verDocumento));
    cuerpo.scrollTop = 0;
    // Con errores, a la vista el primero.
    const primero = cuerpo.querySelector('.d-conforme-error, .d-conforme-aviso.rojo');
    if (primero) primero.scrollIntoView({ block: 'center' });
  }

  /** Lo que le falta a la hoja para poder enseñar el documento: campo → frase. Vacío si nada. */
  function comprobarHoja() {
    const faltas = {};
    // Lo que el documento no puede saber, lo dice la hoja.
    if (!limpio(estado.realizadaPor)) faltas.realizadaPor = FRASES.faltaQuien;
    if (!limpio(estado.firmantes[0])) faltas.firmante1 = FRASES.faltaFirmante;
    if (estado.firmantes.length > 1 && !limpio(estado.firmantes[1])) faltas.firmante2 = FRASES.faltaSegundo;
    if (estado.fechaVisita > E.hoyIso()) faltas.fechaVisita = FRASES.visitaFutura;
    if (limpio(entrega.compradores).length > TOPES.compradores) faltas.compradores = FRASES.compradoresLargos;
    // Lo que exige el documento, lo dice el documento.
    for (const pega of pegasDeConforme(docDe(), { faltaFirmar: true })) {
      const campo = pega.campo === 'compradores' ? 'compradores' : pega.campo;
      if (faltas[campo]) continue;
      faltas[campo] = pega.campo === 'compradores' ? `${pega.frase} ${FRASES.dondeCompradores}` : pega.frase;
    }
    return faltas;
  }

  /** Los repasos de la visita, tal como están AHORA en este móvil (otro móvil pudo tocar la visita). */
  async function repasosDeAhora() {
    try { return await store.tareasDeLista(lista.id); } catch { return repasos; }
  }
  const mismos = (a, b) => a.length === b.length && a.every((t, i) => t.id === b[i].id && (t.texto || '') === (b[i].texto || ''));

  async function verDocumento() {
    await guardarBorrador();
    // Si otro móvil ya la ha firmado, no se le pide la firma a nadie: el
    // documento ni se enseña (y se vuelve a mirar al guardar).
    if (await store.conformeDeLista(lista.id)) {
      if (cerrada) return;
      toast(FRASES.yaFirmada, 'err');
      cerrar({ firmado: false });
      return;
    }
    // Lo que se va a firmar es lo que haya ahora, no lo que había al abrir la hoja.
    const frescos = await repasosDeAhora();
    if (cerrada) return;
    repasos = frescos;
    errores = comprobarHoja();
    if (Object.keys(errores).length) { pintarHoja(); return; }
    aviso = '';
    pintarDocumento();
  }

  /* ─── Paso 2 · El documento en pantalla ─── */
  /**
   * El papel, con las frases de frasesDeConforme().
   *   firmas      las ya hechas, para enseñar el garabato (el papel que no
   *               se ha podido guardar).
   *   recuadroDe  (trozo, n) → el nodo que va en el sitio de la firma n
   *               (0, 1): el recuadro donde se firma. Sin él, el hueco de
   *               siempre, que no se toca.
   */
  function papelDe(doc, firmas = [], recuadroDe = null) {
    const frases = frasesDeConforme(doc);
    let nFirma = 0;
    const hoja = h('div.d-conforme-papel', { 'data-pagina': 'documento' });
    const cuadro = h('div.d-conforme-datos');
    const lista2 = h('ol.d-conforme-repasos');
    const zonaFirmas = h(recuadroDe ? 'div.d-conforme-firmas.con-recuadros' : 'div.d-conforme-firmas');
    for (const trozo of frases.enOrden) {
      switch (trozo.parte) {
        case 'sociedad': hoja.append(h('p.d-conforme-sociedad', null, trozo.texto)); break;
        case 'cabecera': hoja.append(h('p.d-conforme-cabecera', null, trozo.texto)); break;
        case 'titulo': hoja.append(h('h3.d-conforme-papel-titulo', null, trozo.texto)); break;
        case 'subtitulo': hoja.append(h('p.d-conforme-papel-sub', null, trozo.texto), cuadro); break;
        case 'dato': cuadro.append(h('div.d-conforme-dato', null,
          h('span.d-conforme-dato-rotulo', null, trozo.rotulo), h('span.d-conforme-dato-valor', null, trozo.texto))); break;
        case 'epigrafe': hoja.append(h('p.d-conforme-epigrafe', null, trozo.texto)); break;
        case 'repaso':
          if (!lista2.isConnected && !lista2.parentElement) hoja.append(lista2);
          lista2.append(h('li', { value: String(trozo.n) }, trozo.texto));
          break;
        case 'sinRepasos': hoja.append(h('p.d-conforme-parrafo', { 'data-parte': 'sin-repasos' }, trozo.texto)); break;
        case 'fecha': hoja.append(h('div.d-conforme-fecha', { 'data-parte': 'fecha' },
          h('span.d-conforme-fecha-rotulo', null, trozo.rotulo), h('span.d-conforme-fecha-dia', null, trozo.texto))); break;
        case 'aclaracion': hoja.append(h('p.d-conforme-nota', { 'data-parte': 'aclaracion' }, trozo.texto)); break;
        case 'contactos': hoja.append(h('p.d-conforme-parrafo', { 'data-parte': 'contactos' }, trozo.texto)); break;
        case 'observacion': hoja.append(h('p.d-conforme-parrafo', { 'data-parte': 'observacion' }, trozo.texto)); break;
        case 'conformidad': hoja.append(h('p.d-conforme-parrafo.conformidad', { 'data-parte': 'conformidad' }, trozo.texto)); break;
        case 'lugarYFecha': hoja.append(h('p.d-conforme-parrafo', { 'data-parte': 'lugar' }, trozo.texto), zonaFirmas); break;
        case 'firma': {
          const hecha = firmas[nFirma];
          if (recuadroDe) zonaFirmas.append(recuadroDe(trozo, nFirma));
          else {
            zonaFirmas.append(h('div.d-conforme-firma', null,
              h('span.d-conforme-firma-rotulo', null, trozo.rotulo),
              hecha?.vistaPrevia ? h('img.d-conforme-garabato', { src: hecha.vistaPrevia, alt: `Firma de ${trozo.texto}` })
                : h('span.d-conforme-garabato.hueco', { 'aria-hidden': 'true' }),
              h('span.d-conforme-firma-nombre', null, trozo.texto),
              trozo.firmado ? h('span.d-conforme-firma-cuando', null, trozo.firmado) : null,
            ));
          }
          nFirma += 1;
          break;
        }
        default: if (trozo.texto) hoja.append(h('p.d-conforme-parrafo', null, trozo.texto));
      }
    }
    if (!zonaFirmas.parentElement && zonaFirmas.children.length) hoja.append(zonaFirmas);
    return hoja;
  }

  /* ─── Paso 3 · La firma, en el propio documento ─── */
  /** Los recuadros dejan de escuchar: el documento se va de la pantalla. */
  function apagarRecuadros() {
    for (const recuadro of recuadros) recuadro.motor?.apagar();
    recuadros = [];
  }
  /** ¿Hay algo firmado en algún recuadro? */
  const hayFirmado = () => recuadros.some((recuadro) => recuadro.motor && recuadro.motor.medida().puntos > 0);

  /**
   * Un recuadro de firma, como en el papel: el rótulo, el lienzo con su
   * raya y su «Firme aquí con el dedo» (que se va al primer trazo), el
   * nombre debajo, un «Borrar» pequeño que solo se enciende si hay
   * trazos, y el sitio reservado para la frase de la firma corta (si
   * saliera sin sitio, todo lo de debajo daría un salto).
   */
  function recuadroDeFirma(trozo, indice, alCambiar) {
    const lienzo = h('canvas.d-conforme-lienzo', { 'aria-label': `Firma de ${trozo.texto}` });
    const borrar = h('button.d-conforme-borrar', { type: 'button', disabled: true, 'data-accion': 'borrar-firma' }, FRASES_DE_FIRMA.borrar);
    const pista = h('p.d-conforme-firma-pista', { role: 'status', 'aria-live': 'polite' });
    const nodo = h('div.d-conforme-firma.recuadro', { 'data-firma': String(indice + 1) },
      h('span.d-conforme-firma-rotulo', null, trozo.rotulo),
      h('div.d-conforme-recuadro', null,
        h('span.d-conforme-recuadro-raya', { 'aria-hidden': 'true' }),
        h('p.d-conforme-recuadro-aqui', { 'aria-hidden': 'true' }, FRASES_DE_FIRMA.aqui),
        lienzo),
      h('div.d-conforme-firma-bajo', null, h('span.d-conforme-firma-nombre', null, trozo.texto), borrar),
      pista,
    );
    const recuadro = { nodo, lienzo, pista, nombre: trozo.texto, motor: null };
    recuadro.alDia = (medida) => {
      nodo.classList.toggle('con-tinta', medida.puntos > 0);
      borrar.disabled = medida.puntos === 0;
      pista.textContent = medida.puntos > 0 && !medida.vale ? FRASES_DE_FIRMA.corta : '';
      alCambiar();
    };
    // El motor se pone cuando el lienzo ya está en la página (pintarDocumento).
    recuadro.arrancar = () => {
      recuadro.motor = lienzoDeFirma(lienzo, {
        alEmpezar: () => nodo.classList.add('con-tinta'),
        alCambiar: recuadro.alDia,
      });
    };
    borrar.addEventListener('click', () => { recuadro.motor?.borrar(); });
    return recuadro;
  }

  function pintarDocumento() {
    paso = 'documento';
    apagarRecuadros();
    const doc = docDe();
    const noCabe = pegaDeTamano(doc);
    const sinSello = !(globalThis.crypto && globalThis.crypto.subtle) ? FRASES.sinSello : '';
    const impide = noCabe || sinSello;
    // «Corregir» y «Aceptar y guardar» salen donde estaba «Ver el
    // documento» (ver «El reposo»).
    const quieto = reposo();
    const guardar = impide ? null : h('button.d-boton-negro', {
      type: 'button', 'data-accion': 'guardar', disabled: true,
      onclick: () => { if (quieto()) aceptarYGuardar(); },
    }, FRASES.aceptarYGuardar);
    // «Aceptar y guardar», encendido solo con una firma que valga en el PRIMER recuadro.
    const ponerGuardar = () => {
      if (guardar) guardar.disabled = !(recuadros[0]?.motor && recuadros[0].motor.medida().vale);
    };
    // Si el documento no se puede firmar (no cabe, no se puede sellar), no
    // hay recuadros donde firmar: el hueco de siempre y la frase de por qué.
    const nuevos = [];
    const recuadroDe = impide ? null : (trozo, n) => {
      const recuadro = recuadroDeFirma(trozo, n, ponerGuardar);
      nuevos.push(recuadro);
      return recuadro.nodo;
    };
    poner(cuerpo,
      aviso ? h('div.d-conforme-aviso', { role: 'status', 'data-parte': 'aviso' }, icon('alert'), h('div.grow', null, h('p', null, aviso))) : null,
      papelDe(doc, [], recuadroDe),
      impide ? h('div.d-conforme-aviso.rojo', { role: 'alert', 'data-parte': 'no-cabe' }, icon('alert'), h('div.grow', null, h('p', null, impide))) : null,
    );
    poner(pie,
      h('button.d-boton-negro.claro', { type: 'button', 'data-accion': 'corregir', onclick: () => { if (quieto()) corregir(); } }, FRASES.corregir),
      guardar,
    );
    // Ya en la página: los lienzos se pueden medir.
    recuadros = nuevos;
    for (const recuadro of recuadros) recuadro.arrancar();
    ponerGuardar();
    cuerpo.scrollTop = 0;
  }

  /** Una pregunta de la casa (confirmar), encima de la capa. «Atrás» la contesta que no. */
  async function preguntar(opciones) {
    preguntando = true;
    try {
      return await confirmar(opciones);
    } finally {
      preguntando = false;
    }
  }

  /** «Corregir» (o «atrás») en el documento: a la hoja. Con algo firmado, se pregunta antes. */
  async function corregir() {
    if (cerrada || paso !== 'documento' || ocupado || preguntando) return;
    if (hayFirmado()) {
      const si = await preguntar({
        titulo: FRASES.volverConFirmas, texto: FRASES.seBorranLasFirmas,
        ok: FRASES.siVolver, icono: 'edit', conservar: FRASES.seguirFirmando, iconoConservar: 'arrowLeft',
      });
      if (!si || cerrada || paso !== 'documento') return;
    }
    pintarHoja();
  }

  /**
   * Lo que se mira justo antes de guardar: que la visita siga sin
   * conforme (otro móvil pudo firmarla) y que lo que se ha leído y
   * firmado siga siendo lo que hay. Si no, no se guarda: false.
   */
  async function sigueValiendo() {
    if (await store.conformeDeLista(lista.id)) {
      if (!cerrada) { toast(FRASES.yaFirmada, 'err'); cerrar({ firmado: false }); }
      return false;
    }
    const frescos = await repasosDeAhora();
    if (cerrada || paso !== 'documento') return false;
    if (!mismos(frescos, repasos)) {
      // Lo firmado era otro documento: se enseña el de ahora, para leerlo y firmar otra vez.
      repasos = frescos;
      errores = comprobarHoja();
      if (Object.keys(errores).length) { pintarHoja(); return false; }
      aviso = FRASES.hanCambiado;
      pintarDocumento();
      return false;
    }
    return true;
  }

  let ocupado = false;
  async function aceptarYGuardar() {
    if (ocupado || cerrada || paso !== 'documento' || preguntando) return;
    const [primero, segundo] = recuadros;
    if (!primero?.motor || !primero.motor.medida().vale) return;
    ocupado = true;
    try {
      if (!(await sigueValiendo())) return;
      // La segunda persona: si ha empezado a firmar, su firma tiene que
      // valer; si no ha firmado, se pregunta si se guarda sin ella.
      let conSegunda = false;
      if (segundo?.motor) {
        const medida = segundo.motor.medida();
        if (medida.puntos > 0 && !medida.vale) {
          toast(FRASES.segundaCorta(segundo.nombre), 'err');
          segundo.pista.textContent = FRASES_DE_FIRMA.corta;
          segundo.nodo.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
        if (medida.puntos === 0) {
          const si = await preguntar({
            titulo: FRASES.soloUnaFirma(primero.nombre), texto: FRASES.noHaFirmado(segundo.nombre),
            ok: FRASES.siGuardar, icono: 'documento', conservar: FRASES.volver, iconoConservar: 'arrowLeft',
          });
          if (!si || cerrada || paso !== 'documento') return;
          // Mientras se preguntaba, la sincronización ha podido traer algo.
          if (!(await sigueValiendo())) return;
        } else {
          conSegunda = true;
        }
      }
      // Cada firma lleva el momento de su último trazo. Quien no firma no figura.
      const firmas = [primero.motor.firma(primero.nombre)];
      if (conSegunda) firmas.push(segundo.motor.firma(segundo.nombre));
      await montarYGuardar(firmas);
    } finally {
      ocupado = false;
    }
  }

  /* ─── Paso 4 · El papel ─── */
  async function montarYGuardar(firmas) {
    paso = 'preparando';
    apagarRecuadros();
    poner(cuerpo, h('div.d-conforme-centro', { 'data-parte': 'preparando', role: 'status' },
      h('span.d-conforme-rueda', { 'aria-hidden': 'true' }),
      h('h2.d-conforme-titulo', null, FRASES.preparando),
    ));
    poner(pie);
    cuerpo.scrollTop = 0;

    let pdf = null;
    let nombre = '';
    try {
      const doc = docDe(firmas);
      pdf = pdfConforme(doc, { fuente: await letra });
      nombre = nombreDeConforme(doc);
      const datos = datosDe(doc, firmas, medirConforme(doc).paginas);
      if (octetosDe(datos) > CONFORME_DATOS_MAX) throw new Error(FRASES.demasiado);
      const huella = enHex(await crypto.subtle.digest('SHA-256', pdf));
      const conforme = await store.guardarConforme({
        listaId: lista.id, unidadId: lista.unidadId, pdf, nombre, datos, huella,
      });
      const fichero = new File([pdf], nombre, { type: 'application/pdf' });
      cerrar({ firmado: true, conforme, fichero, nombre });
    } catch (e) {
      console.error('No se ha podido preparar o guardar el conforme:', e);
      pintarFallo(firmas, e, pdf, nombre);
    }
  }

  /** El papel no ha salido (o no se ha podido guardar): el documento, con las firmas hechas, y volver a intentarlo. */
  function pintarFallo(firmas, fallo, pdf, nombre) {
    paso = 'fallo';
    apagarRecuadros();
    // El motivo, en español. Las frases de la casa (las de este recorrido,
    // las del papel y las del almacén) se enseñan tal cual; lo que dice el
    // navegador por su cuenta —«The transaction was aborted…», cuando el
    // teléfono se queda sin sitio— no le dice nada a quien lo lee, y va a
    // la consola.
    const deLaCasa = fallo && Object.getPrototypeOf(fallo) === Error.prototype ? limpio(fallo.message) : '';
    const motivo = deLaCasa || (pdf ? FRASES.quizaSinSitio : FRASES.falloAlPreparar);
    poner(cuerpo,
      h('div.d-conforme-aviso.rojo', { role: 'alert', 'data-parte': 'fallo' }, icon('alert'),
        h('div.grow', null,
          h('p', null, pdf ? FRASES.noGuardado : FRASES.noPreparado),
          h('p.d-conforme-detalle', null, motivo))),
      papelDe(docDe(firmas), firmas),
    );
    poner(pie,
      h('button.d-boton-negro', { type: 'button', 'data-accion': 'reintentar', onclick: () => montarYGuardar(firmas) }, FRASES.reintentar),
      // El papel está hecho y firmado: que no se quede sin salir de aquí.
      pdf ? h('button.d-boton-negro.claro', {
        type: 'button', 'data-accion': 'compartir',
        onclick: () => entregarFichero(new File([pdf], nombre || 'Conforme_de_la_visita.pdf', { type: 'application/pdf' }), nombre || 'Conforme_de_la_visita.pdf'),
      }, FRASES.compartir) : null,
      h('button.d-boton-negro.claro', { type: 'button', 'data-accion': 'corregir', onclick: pintarHoja }, FRASES.corregir),
    );
    cuerpo.scrollTop = 0;
  }

  /* ─── En marcha ─── */
  // Lo que estuviera escribiéndose debajo suelta el teclado.
  try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch { /* da igual */ }
  pintarHoja();
  document.body.append(capa);
  ponerEntrada();
  window.addEventListener('popstate', alVolver);
  window.addEventListener('hashchange', alCambiarDeSitio);

  const salida = await promesa;
  if (!salida?.firmado) return { firmado: false };

  // El papel está guardado. La pantalla de debajo pasa a ser la de la
  // visita firmada, y se ofrece el PDF con la hoja de la casa: en el
  // iPhone, compartir solo funciona al calor de un toque recién dado, y
  // ese toque es el de «Compartir» de esa hoja.
  try { await refrescar(); } catch { /* si no se repinta ahora, lo hará la sincronización */ }
  toast(FRASES.guardado, '', { icono: 'documento' });
  try {
    entregarFichero(salida.fichero, salida.nombre, { nota: FRASES.notaDeEntrega });
    // La hoja nace bajo el dedo que acaba de pulsar «Aceptar y guardar»
    // (ver «El reposo»): los toques que le lleguen a destiempo no cuentan,
    // ni para cerrarla ni para pulsar nada de ella.
    const hoja = [...document.querySelectorAll('.d-hoja-acciones')].pop();
    if (hoja) {
      const quieto = reposo();
      const tragar = (e) => {
        if (!hoja.isConnected || quieto()) { document.removeEventListener('click', tragar, true); return; }
        e.stopImmediatePropagation();
        e.preventDefault();
      };
      document.addEventListener('click', tragar, true);
    }
  } catch (e) {
    console.error('No se ha podido ofrecer el PDF:', e);
  }
  return { firmado: true, conforme: salida.conforme };
}
