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
  if (revisionHecha(e)) {
    const dia = e.revision || isoDe(new Date(e.revisadaEn));
    return {
      clave: 'revisada', clase: 'verde-suave', icono: 'check',
      rotulo: 'Revisada con el cliente', cifra: fechaBanner(dia),
      sub: chipFirma,
      aria: `Revisada con el cliente el ${fechaConDia(dia)}${e.firma ? ` · firma el ${fechaConDia(e.firma)}` : ''}`,
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
  const apuntada = diaDeEntrega(entrega);
  if (!apuntada) return '';
  const firma = esDia(entrega?.firma) ? entrega.firma : '';
  return firma && firma <= apuntada ? firma : apuntada;
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
 * Los hitos de todas las entregas: uno por revisión (hecha o
 * prevista) y uno por firma o entrega. `incidencias` es el mapa
 * unidadId → repasos post-entrega sin verificar.
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
    const hecha = revisionHecha(e);
    if (e.revision) {
      hitos.push({ ...base, dia: e.revision, tipo: hecha ? 'revisada' : 'revision', hora: hecha ? '' : (e.revisionHora || '') });
      // Una cita nueva en una vivienda que ya tuvo otra revisión hecha:
      // aquella sigue en su día, y la nueva sale como prevista.
      if (!hecha && e.revisadaEn) {
        const antes = isoDe(new Date(e.revisadaEn));
        if (esDia(antes) && antes !== e.revision) hitos.push({ ...base, dia: antes, tipo: 'revisada' });
      }
    } else if (e.revisadaEn) {
      hitos.push({ ...base, dia: isoDe(new Date(e.revisadaEn)), tipo: 'revisada' });
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
