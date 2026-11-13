/* ═══════════════════════════════════════════════════════════════
   entregas.js — lo que las pantallas necesitan saber de una entrega.

   Aquí no hay DOM: solo fechas en español, la SITUACIÓN de una
   vivienda (próxima revisión, revisada, entregada, con incidencias)
   y los HITOS que pinta el calendario, repartidos por día. Lo usan
   el calendario (#/entregas), la ficha de la vivienda y la portada,
   y los tres tienen que contar lo mismo.

   Las fechas de una entrega son días sueltos, «2026-11-18», sin hora
   ni zona horaria. El «hoy» es el del móvil.
   ═══════════════════════════════════════════════════════════════ */
import { unidad } from './catalog.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ─── Días sueltos ───────────────────────────────────────────── */
const dos = (n) => String(n).padStart(2, '0');

/** Un Date (hora local) → «2026-11-18». */
export function isoDe(d) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** «2026-11-18» → { a, m, d, fecha } (la fecha a mediodía, que no baila con el horario de verano). */
export function partes(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return { a, m, d, fecha: new Date(a, m - 1, d, 12) };
}

/** ¿Es un día suelto bien escrito y que exista? */
export function esDia(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
  const { a, m, d, fecha } = partes(iso);
  return fecha.getFullYear() === a && fecha.getMonth() === m - 1 && fecha.getDate() === d;
}

/** Hoy, en el calendario del móvil. */
export const hoyIso = () => isoDe(new Date());

export function sumarDias(iso, n) {
  const d = partes(iso).fecha;
  d.setDate(d.getDate() + n);
  return isoDe(d);
}

/** El lunes de la semana de ese día. */
export function lunesDe(iso) {
  const d = partes(iso).fecha;
  return sumarDias(iso, -((d.getDay() + 6) % 7));
}

/** Los siete días de la semana de ese día, de lunes a domingo. */
export function semanaDe(iso) {
  const lunes = lunesDe(iso);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/** Días enteros desde `desde` hasta ese día (negativo si ya pasó). */
export function diasHasta(iso, desde = hoyIso()) {
  return Math.round((partes(iso).fecha - partes(desde).fecha) / 86400000);
}

/* ─── En español ─────────────────────────────────────────────── */
const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** «miércoles» · «Miércoles». */
export function diaSemana(iso, { mayus = false } = {}) {
  const nombre = DIAS[partes(iso).fecha.getDay()];
  return mayus ? mayuscula(nombre) : nombre;
}

/** «18 de noviembre» · «18 de noviembre de 2025» si no es de este año. */
export function fechaLarga(iso, { conAno = false } = {}) {
  const { a, m, d } = partes(iso);
  const corta = `${d} de ${MESES[m - 1]}`;
  return conAno || a !== new Date().getFullYear() ? `${corta} de ${a}` : corta;
}

/** «miércoles 18 de noviembre». */
export function fechaConDia(iso, { mayus = false } = {}) {
  return `${diaSemana(iso, { mayus })} ${fechaLarga(iso)}`;
}

/** «Jueves 12 nov»: la cifra grande del banner. */
export function fechaBanner(iso) {
  const { m, d } = partes(iso);
  return `${diaSemana(iso, { mayus: true })} ${d} ${MESES_CORTOS[m - 1]}`;
}

/** «6 nov» · «6 nov 2025» si no es de este año: para las listas apretadas. */
export function diaCorto(iso) {
  const { a, m, d } = partes(iso);
  return `${d} ${MESES_CORTOS[m - 1]}${a !== new Date().getFullYear() ? ` ${a}` : ''}`;
}

/** «Noviembre 2026». */
export function mesTitulo(iso) {
  const { a, m } = partes(iso);
  return `${mayuscula(MESES[m - 1])} ${a}`;
}

/** «9 – 15 noviembre» · «30 noviembre – 6 diciembre». */
export function semanaTitulo(iso) {
  const dias = semanaDe(iso);
  const p1 = partes(dias[0]);
  const p7 = partes(dias[6]);
  if (p1.m === p7.m) return `${p1.d} – ${p7.d} ${MESES[p1.m - 1]}`;
  return `${p1.d} ${MESES[p1.m - 1]} – ${p7.d} ${MESES[p7.m - 1]}`;
}

/** «hoy» · «mañana» · «ayer» · «en 6 días» · «hace 3 días». */
export function relativo(iso, desde = hoyIso()) {
  const n = diasHasta(iso, desde);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

/** «Esta semana» · «Semana que viene» · «Semana pasada» · «». */
export function semanaRelativa(iso, desde = hoyIso()) {
  const n = Math.round((partes(lunesDe(iso)).fecha - partes(lunesDe(desde)).fecha) / (7 * 86400000));
  if (n === 0) return 'Esta semana';
  if (n === 1) return 'Semana que viene';
  if (n === -1) return 'Semana pasada';
  return '';
}

/* ─── La situación de una vivienda ───────────────────────────── */
/**
 * Lo que dice el banner de la ficha, en orden de prioridad:
 *
 *   incidencias   entregada y con repasos del parte post-entrega sin
 *                 verificar (rojo)
 *   entregada     entregada, sin incidencias (negro)
 *   revisada      la revisión con el cliente ya se hizo (verde suave)
 *   revision      hay revisión fijada y aún no se ha hecho (beige)
 *   firma         solo hay firma (beige)
 *   sin-fechas    la ficha está vacía (solo la ve quien pone fechas)
 *
 * ENTREGADA es lo que han apuntado el comercial o el administrador
 * (`entregadaEn`), nunca lo que diga la fecha de la firma: una firma
 * prevista para hoy, o para ayer, no es una vivienda entregada hasta
 * que alguien lo dice (Fran, 10-11-2026).
 *
 * `incidencias` es el número de repasos del parte post-entrega sin
 * visto bueno. Devuelve null si no hay nada que decir.
 */
export function situacion(entrega, { incidencias = 0, hoy = hoyIso() } = {}) {
  const e = entrega || {};
  const horaFirma = e.firmaHora ? ` · ${e.firmaHora}` : '';
  const chipFirma = e.firma ? { icono: 'key', texto: `Firma el ${fechaConDia(e.firma)}${horaFirma}`, clase: 'negro' } : null;

  if (e.entregadaEn) {
    const dia = diaEntregada(e);
    if (incidencias > 0) {
      return {
        clave: 'incidencias', clase: 'rojo', icono: 'periodico',
        rotulo: 'Entregada con incidencias',
        cifra: `${incidencias} por resolver`,
        sub: { icono: 'key', texto: `Entregada el ${fechaConDia(dia)}`, clase: '' },
        aria: `Entregada el ${fechaConDia(dia)} con ${incidencias} ${incidencias === 1 ? 'repaso' : 'repasos'} del parte post-entrega sin verificar`,
      };
    }
    return {
      clave: 'entregada', clase: 'negro', icono: 'periodico',
      rotulo: 'Entregada', cifra: fechaBanner(dia),
      sub: { icono: 'check', texto: 'Sin incidencias', clase: '' },
      aria: `Entregada el ${fechaConDia(dia)}, sin incidencias`,
    };
  }
  // Manda la cita vigente: hecha (verde) o por hacer (beige).
  const marcada = visitaMarcada(e);
  if (marcada?.vigente) {
    return {
      clave: 'revisada', clase: 'verde-suave', icono: 'check',
      rotulo: 'Revisada con el cliente', cifra: fechaBanner(marcada.dia),
      sub: chipFirma, dia: marcada.dia,
      aria: `Revisada con el cliente el ${fechaConDia(marcada.dia)}${e.firma ? ` · firma el ${fechaConDia(e.firma)}` : ''}`,
    };
  }
  if (e.revision) {
    return {
      clave: 'revision', clase: 'beige', icono: 'calendario',
      rotulo: e.revision < hoy ? 'Revisión con el cliente' : 'Próxima revisión con el cliente',
      cifra: fechaBanner(e.revision) + (e.revisionHora ? ` · ${e.revisionHora}` : ''),
      sub: chipFirma,
      aria: `Revisión con el cliente el ${fechaConDia(e.revision)}${e.revisionHora ? ` a las ${e.revisionHora}` : ''}${e.firma ? ` · firma el ${fechaConDia(e.firma)}` : ''}`,
    };
  }
  if (e.firma) {
    return {
      clave: 'firma', clase: 'beige', icono: 'key',
      rotulo: 'Firma y entrega de llaves', cifra: fechaBanner(e.firma) + horaFirma,
      sub: e.compradores ? { icono: 'users', texto: e.compradores, clase: '' } : null,
      aria: `Firma el ${fechaConDia(e.firma)}${e.firmaHora ? ` a las ${e.firmaHora}` : ''}`,
    };
  }
  // Ni cita vigente ni firma, pero la vivienda ya tuvo visitas con el
  // cliente: se dice la última.
  const ultima = todasLasVisitas(e).pop();
  if (ultima) {
    return {
      clave: 'revisada', clase: 'verde-suave', icono: 'check',
      rotulo: 'Revisada con el cliente', cifra: fechaBanner(ultima.dia),
      sub: null, dia: ultima.dia,
      aria: `Revisada con el cliente el ${fechaConDia(ultima.dia)}`,
    };
  }
  return null;
}

/**
 * ¿Está hecha la revisión que figura en la ficha? La marca «hecha»
 * (`revisadaEn`) vale para la cita que había cuando se puso. Si después
 * alguien fija una fecha de revisión NUEVA y posterior a aquel día, es
 * otra cita y está pendiente. Lo vio el comercial el 10-11-2026: puso
 * una revisión en dos villas que ya tenían hecha la visita de cortesía
 * y le salían en verde, como hechas. Corregir la fecha de una visita ya
 * hecha (ponerla en su día, o antes) no la deshace.
 *
 * Es la misma regla que entrega_revision_hecha() en api/lib/entregas.php:
 * si se toca una, se toca la otra.
 */
export function revisionHecha(entrega) {
  const e = entrega || {};
  if (!e.revisadaEn) return false;
  if (!e.revision) return true;
  const marcada = e.revisadaFijadaEn || e.revisadaEn;
  const d = new Date(e.revisadaEn);
  if (Number.isNaN(d.getTime())) return true;
  return !((e.revisionFijadaEn || '') > marcada && e.revision > isoDe(d));
}

/* ─── Las visitas ya hechas ──────────────────────────────────── */
/* Una vivienda puede tener varias visitas con el cliente: la de
   cortesía, otra antes de firmar… La ficha guarda la cita VIGENTE
   (`revision`, y `revisadaEn` si ya se hizo) y, aparte, el HISTORIAL de
   las anteriores (`visitasHechas`: una lista de { dia, hechaEn, por,
   porNombre }). Al fijar una cita nueva sobre una visita ya hecha, esa
   visita pasa al historial (lo hace store.fijarEntrega).

   Queda un caso de antes de que existiera el historial, y que un móvil
   con la app anterior en caché todavía puede dejar: la marca de una
   visita vieja con una cita nueva encima, sin archivar («el estado
   antiguo»). revisionHecha() lo reconoce, y aquí esa visita se cuenta
   como una más de las hechas, en su día. */

/** Cuántas visitas guarda el historial como mucho (el servidor, igual). */
const TOPE_VISITAS = 30;

/** El día, en el calendario del móvil, de una marca ISO; '' si no se deja leer. */
export function diaDeMarca(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : isoDe(d);
}

/**
 * El historial de una ficha, saneado: solo visitas con un día que
 * exista, una por día (de dos, la primera) y ordenadas por día. Una
 * ficha guardada por la app anterior no trae la lista: sale vacío.
 */
export function visitasDe(entrega) {
  const lista = Array.isArray(entrega?.visitasHechas) ? entrega.visitasHechas : [];
  const porDia = new Map();
  for (const v of lista) {
    if (!v || !esDia(v.dia) || porDia.has(v.dia)) continue;
    porDia.set(v.dia, {
      dia: v.dia,
      hechaEn: typeof v.hechaEn === 'string' ? v.hechaEn : '',
      por: typeof v.por === 'string' && v.por ? v.por : null,
      porNombre: typeof v.porNombre === 'string' ? v.porNombre : '',
    });
  }
  return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)).slice(-TOPE_VISITAS);
}

/**
 * La visita que lleva la MARCA de la ficha (`revisadaEn`), o null si no
 * hay marca. Lo normal es que sea la cita vigente, ya hecha (`vigente`
 * a true): su día es el de la revisión, o el de la marca si la revisión
 * no tiene fecha. En una ficha en el estado antiguo la marca es de una
 * visita anterior a la cita que hay puesta (`vigente` a false) y su día
 * es el de la marca. Lleva quién la dio por hecha y cuándo se apuntó.
 */
export function visitaMarcada(entrega) {
  const e = entrega || {};
  if (!e.revisadaEn) return null;
  const vigente = revisionHecha(e);
  const dia = vigente && esDia(e.revision) ? e.revision : diaDeMarca(e.revisadaEn);
  if (!esDia(dia)) return null;
  return {
    dia, vigente,
    hechaEn: e.revisadaFijadaEn || e.revisadaEn,
    por: e.revisadaPor || null,
    porNombre: e.revisadaPorNombre || '',
  };
}

/**
 * Todas las visitas hechas de una vivienda, por día: las del historial
 * y la que lleve la marca. Una por día: si coinciden, manda la de la
 * marca. Es lo que pintan el calendario y el muro de la portada.
 */
export function todasLasVisitas(entrega) {
  const marcada = visitaMarcada(entrega);
  const todas = visitasDe(entrega)
    .filter((v) => !marcada || v.dia !== marcada.dia)
    .map((v) => ({ ...v, vigente: false }));
  if (marcada) todas.push(marcada);
  return todas.sort((a, b) => a.dia.localeCompare(b.dia));
}

/** ¿Tiene la vivienda alguna visita hecha, la vigente o una del historial? */
export function hayVisitaHecha(entrega) {
  return !!entrega?.revisadaEn || visitasDe(entrega).length > 0;
}

/**
 * La cita que vuelve si se deshace «la revisión se ha hecho»: cuando la
 * cita era para más adelante y al darla por hecha se movió a hoy, la
 * ficha guarda la fecha y la hora que tenía (`revisadaDe`,
 * `revisadaDeHora`). Devuelve { dia, hora }, o null si no se movió.
 *
 * Solo se le hace caso a una fecha que no sea anterior al día de la
 * marca: la que se apunta al mover la cita es siempre posterior, y una
 * anterior solo puede ser un resto que un móvil con la app anterior
 * devolvió al servidor sin saber qué era.
 */
export function citaQueVuelve(entrega) {
  const e = entrega || {};
  if (!e.revisadaEn || !esDia(e.revisadaDe)) return null;
  const marca = diaDeMarca(e.revisadaEn);
  if (marca && e.revisadaDe < marca) return null;
  return { dia: e.revisadaDe, hora: e.revisadaDeHora || '' };
}

/** El día en que se apuntó la entrega («2026-11-10»), o '' si no está entregada. */
export function diaDeEntrega(entrega) {
  const cuando = entrega?.entregadaEn;
  if (!cuando) return '';
  const d = new Date(cuando);
  return Number.isNaN(d.getTime()) ? '' : isoDe(d);
}

/**
 * El día que cuenta como el de la entrega: el de la firma, salvo que la
 * firma tenga puesto un día POSTERIOR a aquel en que se apuntó la
 * entrega (la notaría se adelantó y nadie corrigió la fecha): entonces,
 * el día en que se apuntó. Una vivienda no puede salir entregada en una
 * fecha que todavía no ha llegado.
 */
export function diaEntregada(entrega) {
  const firma = esDia(entrega?.firma) ? entrega.firma : '';
  const apuntada = diaDeEntrega(entrega);
  // Una marca que no se deja leer como fecha: mejor la firma que nada.
  if (!apuntada) return entrega?.entregadaEn ? firma : '';
  // El tope es el día en que se PUSO la marca (su sello), no solo el día
  // que lleva: a las que firmaron antes del 10-11-2026 la marca se les
  // puso ese día con la fecha de su firma, y corregirles después la
  // firma a otro día ya pasado tiene que mover también el «Entregada».
  const sello = new Date(entrega.entregadaFijadaEn || entrega.entregadaEn);
  const puesta = Number.isNaN(sello.getTime()) ? apuntada : isoDe(sello);
  const tope = puesta > apuntada ? puesta : apuntada;
  return firma && firma <= tope ? firma : apuntada;
}

/* ─── Los hitos del calendario ───────────────────────────────── */
/**
 * Los tipos de hito, con sus palabras. `chip` es la clase del
 * mini-chip del calendario: la firma y lo entregado van en negro,
 * la revisión pendiente en beige, la hecha en verde suave y las
 * incidencias en rojo.
 */
export const HITOS = {
  revision:   { chip: 'revision',  corto: 'revisión',        largo: 'Revisión con el cliente' },
  revisada:   { chip: 'revisada',  corto: 'revisión hecha',  largo: 'Revisión hecha' },
  firma:      { chip: 'firma',     corto: 'firma',           largo: 'Firma / entrega' },
  entregada:  { chip: 'firma',     corto: 'entregada',       largo: 'Entregada' },
  incidencia: { chip: 'incidencia', corto: 'con incidencias', largo: 'Entregada con incidencias' },
};
const ORDEN_HITO = { revisada: 0, revision: 1, firma: 2, entregada: 3, incidencia: 3 };

/**
 * Los hitos de todas las entregas: uno por la revisión prevista, uno
 * por cada visita ya hecha (la vigente y las del historial, cada una
 * en su día) y uno por firma o entrega. `incidencias` es el mapa
 * unidadId → repasos post-entrega sin verificar.
 *
 * Los de «revisión hecha» llevan en `visita` quién la dio por hecha y
 * cuándo se apuntó, para el pie de la tarjeta del día. Una villa no
 * sale dos veces como revisada el mismo día.
 *
 * La firma es «entregada» solo si alguien lo ha apuntado. Una firma
 * con la fecha ya pasada y sin esa marca sigue siendo una firma, y
 * lleva `sinConfirmar` para que quien pone fechas vea que le falta
 * decir si se entregó.
 */
export function hitosDe(entregas, { incidencias = new Map(), hoy = hoyIso() } = {}) {
  const hitos = [];
  for (const e of entregas) {
    if (!e || e.borrada) continue;
    const u = unidad(e.unidadId);
    const base = {
      unidadId: e.unidadId, villa: u?.corto || e.unidadId.split(':')[1] || '', nombre: u?.nombre || e.unidadId,
      compradores: e.compradores || '', entrega: e, hora: '',
    };
    // La cita vigente, si aún está por hacer; y después todas las
    // visitas hechas: la vigente si ya se hizo y las del historial (y,
    // en una ficha en el estado antiguo, la que lleva la marca).
    if (e.revision && !revisionHecha(e)) {
      hitos.push({ ...base, dia: e.revision, tipo: 'revision', hora: e.revisionHora || '' });
    }
    for (const visita of todasLasVisitas(e)) {
      hitos.push({ ...base, dia: visita.dia, tipo: 'revisada', visita });
    }
    if (e.entregadaEn) {
      const n = incidencias.get(e.unidadId) || 0;
      hitos.push({ ...base, dia: diaEntregada(e), tipo: n > 0 ? 'incidencia' : 'entregada', incidencias: n });
    } else if (e.firma) {
      hitos.push({ ...base, dia: e.firma, tipo: 'firma', hora: e.firmaHora || '', incidencias: 0, sinConfirmar: e.firma < hoy });
    }
  }
  return hitos;
}

/** Los hitos repartidos por día, ordenados dentro de cada día. */
export function porDia(hitos) {
  const por = new Map();
  for (const h of hitos) {
    if (!por.has(h.dia)) por.set(h.dia, []);
    por.get(h.dia).push(h);
  }
  for (const lista of por.values()) {
    lista.sort((a, b) => (a.hora || '').localeCompare(b.hora || '')
      || ORDEN_HITO[a.tipo] - ORDEN_HITO[b.tipo] || a.villa.localeCompare(b.villa));
  }
  return por;
}

/** Los hitos entre dos días, ambos incluidos. */
export function hitosEntre(hitos, desde, hasta) {
  return hitos.filter((h) => h.dia >= desde && h.dia <= hasta);
}

/**
 * Qué semana cuenta la portada: hasta el jueves, la que está en
 * marcha; viernes, sábado y domingo ya miran a la que viene. Devuelve
 * { desde, hasta, rotulo }.
 */
export function semanaDePortada(hoy = hoyIso()) {
  const diaSem = partes(hoy).fecha.getDay();   // 0 domingo … 6 sábado
  const queViene = diaSem === 0 || diaSem >= 5;
  const lunes = queViene ? sumarDias(lunesDe(hoy), 7) : lunesDe(hoy);
  return {
    desde: lunes,
    hasta: sumarDias(lunes, 6),
    rotulo: queViene ? 'Entregas y revisiones la semana que viene' : 'Entregas y revisiones esta semana',
  };
}
