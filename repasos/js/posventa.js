/* ═══════════════════════════════════════════════════════════════
   posventa.js — las reglas de la sección «Postventa» (por dentro,
   #/entregadas: así se llamaba en pantalla hasta el 17-11-2026).

   Aquí no hay pantalla ni almacén: solo lo que hay que saber de una
   vivienda YA ENTREGADA para pintarla, y las frases con que se dice.
   Lo usan la lista (#/entregadas), la ficha de cada vivienda y la
   pantalla de la visita, y las tres tienen que contar lo mismo. Se
   prueba en node, sin navegador.

   El vocabulario, que es de la casa:

     VISITA DE REPASOS   la cita con los compradores después de entregar.
                         La cita vive en la ficha de entrega (el hecho
                         `posventa`, con su hora); la visita hecha con la
                         app es una lista con fase 'visita'.
     REPASOS DE LA VISITA  lo que se apunta en ella. Ninguno lleva fecha
                         propia. Cuentan como TERMINADOS cuando están
                         verificados, no cuando la obra los da por hechos.
     CONFORME DE LA VISITA  el papel que firma el comprador con el dedo:
                         una fila de `medios` de tipo 'documento' colgada
                         de la lista de la visita, con lo firmado en
                         `datos`.
     LOS CINCO BOTONES   piscina, climatización, domótica, fotovoltaica
                         y armarios. Cada uno guarda el día de la CITA con el
                         instalador (casi siempre un día que aún no ha
                         llegado), o «no tiene» en los dos primeros.
     CERRADA             no se guarda en ningún sitio: se calcula aquí,
                         cada vez, con lo que el móvil tiene bajado.

   Dos trampas de nombres. `posventa` en la ficha de ENTREGA es el día
   de la cita; `posventa` en una PERSONA es la bandera del chip
   «Postventa» (un sí o un no). Y las «visitas» de la ficha de entrega
   (`visitasHechas`) son las revisiones de ANTES de entregar: aquí no se
   tocan.
   ═══════════════════════════════════════════════════════════════ */
import { hecha, OFICIOS, OFICIO_POR_DEFECTO, ZONAS } from './catalog.js';
import * as E from './entregas.js';

/** El icono de la bolita de la cabecera: el apretón de manos (elegido mirando la lámina A, opción 4). */
export const ICONO_ENTREGADAS = 'apreton';

/** El valor de un botón cuando la villa no tiene eso (solo piscina y climatización). */
export const NO_TIENE = 'no-tiene';

/** Cómo se dice el día de un botón: es una cita, no el día en que se apuntó. */
export const ROTULO_DIA_BOTON = 'cita el';

/**
 * Los cinco botones, en su orden fijo. `clave` es el nombre del hecho
 * en la ficha de entrega (igual en el servidor); `icono`, su dibujo en
 * js/iconos.js; `conQuien` monta la pregunta de la hoja y `queNoTiene`
 * el botón de «no tiene» de los dos que lo admiten.
 */
export const BOTONES = [
  { clave: 'piscina', nombre: 'Piscina', icono: 'piscina', admiteNoTiene: true,
    conQuien: 'con la empresa de la piscina', queNoTiene: 'Esta villa no tiene piscina', queSiTiene: 'Sí tiene piscina' },
  { clave: 'clima', nombre: 'Climatización', icono: 'copo', admiteNoTiene: true,
    conQuien: 'con la empresa de la climatización', queNoTiene: 'Esta villa no tiene climatización', queSiTiene: 'Sí tiene climatización' },
  { clave: 'domotica', nombre: 'Domótica', icono: 'casaOnda', admiteNoTiene: false,
    conQuien: 'con la empresa de la domótica' },
  // La quinta (17-11-2026), entre la domótica y los armarios. Como esos
  // dos, la tienen todas las villas: no admite «no tiene».
  { clave: 'fotovoltaica', nombre: 'Fotovoltaica', icono: 'panelSolar', admiteNoTiene: false,
    conQuien: 'con la empresa de la fotovoltaica' },
  { clave: 'armarios', nombre: 'Armarios', icono: 'armario', admiteNoTiene: false,
    conQuien: 'con el montador de los armarios' },
];

/** El sello de cada hecho nuevo de la ficha (cuándo se tocó por última vez). */
export const SELLO_DE_HECHO = {
  posventa: 'posventaFijadaEn',
  piscina: 'piscinaFijadaEn',
  clima: 'climaFijadoEn',
  domotica: 'domoticaFijadaEn',
  fotovoltaica: 'fotovoltaicaFijadaEn',
  armarios: 'armariosFijadosEn',
};

/** Los tres filtros de la lista, tal como viajan en la dirección (`?ver=`). */
export const FILTROS = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'pendientes', rotulo: 'Con algo pendiente' },
  { id: 'cerradas', rotulo: 'Cerradas' },
];

/* ─── Fechas, como se dicen en esta sección ──────────────────── */
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** «jue 19 nov»: el día de la tarjeta. */
export function diaConSemana(iso) {
  if (!E.esDia(iso)) return '';
  return `${DIAS_CORTOS[E.partes(iso).fecha.getDay()]} ${E.diaCorto(iso)}`;
}

/** El día, en el calendario del móvil, de un instante ISO; '' si no se deja leer. */
export function diaDeInstante(iso) {
  return E.diaDeMarca(iso);
}

/** «11:12», en el reloj del móvil, de un instante ISO; '' si no se deja leer. */
export function horaDeInstante(iso) {
  const d = new Date(iso || '');
  if (!iso || Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ─── Los botones ────────────────────────────────────────────── */
/**
 * Lo que dice un botón en la ficha, saneado: '' (sin cita), un día que
 * exista, o NO_TIENE si ese botón lo admite. Cualquier otra cosa —lo
 * que pudiera dejar un servidor a medias o una mano— vale por ''.
 */
export function valorDeBoton(entrega, clave) {
  const boton = BOTONES.find((b) => b.clave === clave);
  const v = entrega?.[clave] || '';
  if (!boton || !v) return '';
  if (v === NO_TIENE) return boton.admiteNoTiene ? NO_TIENE : '';
  return E.esDia(v) ? v : '';
}

/** ¿Está resuelto? Con cita (aunque el día no haya llegado) o con «no tiene». */
export function botonResuelto(entrega, clave) {
  return valorDeBoton(entrega, clave) !== '';
}

/** El estado de un botón para pintarlo: 'no' (sin cita), 'si' (con cita) o 'nt' (no tiene). */
export function estadoDeBoton(valor) {
  return valor === NO_TIENE ? 'nt' : valor ? 'si' : 'no';
}

/** Lo que se lee debajo de la bolita en la tarjeta: «26 nov», «No tiene» o nada. */
export function pieDeBoton(valor) {
  if (valor === NO_TIENE) return 'No tiene';
  return valor ? E.diaCorto(valor) : '';
}

/** Lo que se lee a la derecha en la fila de la ficha: «cita el 26 nov», «sin cita» o «No tiene». */
export function filaDeBoton(valor) {
  if (valor === NO_TIENE) return 'No tiene';
  return valor ? `${ROTULO_DIA_BOTON} ${E.diaCorto(valor)}` : 'sin cita';
}

/** Lo que oye quien no ve: «Piscina: cita el 26 de noviembre», «Piscina: sin cita», «Piscina: no tiene». */
export function ariaDeBoton(boton, valor) {
  if (valor === NO_TIENE) return `${boton.nombre}: no tiene`;
  return valor ? `${boton.nombre}: ${ROTULO_DIA_BOTON} ${E.fechaLarga(valor)}` : `${boton.nombre}: sin cita`;
}

/* ─── El conforme ────────────────────────────────────────────── */
/** ¿Es esta fila de `medios` un conforme firmado y vivo? */
export function esConforme(medio) {
  return !!medio && !medio.borrada && medio.tipo === 'documento';
}

/** Quién firmó: «Lucía Roca» · «Lucía Roca y Daniel Vera» · '' si el dato no lo trae. */
export function firmantesDe(conforme) {
  const nombres = (Array.isArray(conforme?.datos?.firmas) ? conforme.datos.firmas : [])
    .map((f) => String(f?.nombre || '').trim()).filter(Boolean);
  if (nombres.length > 1) return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  return nombres[0] || '';
}

/**
 * Cuándo se firmó: { dia, hora }. Manda lo que quedó escrito en el
 * papel (la fecha y la hora de la primera firma); si el dato no lo
 * trae, el instante en que se guardó, en el reloj de este móvil.
 */
export function firmadoEl(conforme) {
  const primera = Array.isArray(conforme?.datos?.firmas) ? conforme.datos.firmas[0] : null;
  const dia = E.esDia(primera?.fecha) ? primera.fecha : diaDeInstante(conforme?.creado);
  const hora = /^\d{2}:\d{2}$/.test(primera?.hora || '') ? primera.hora : horaDeInstante(conforme?.creado);
  return { dia, hora };
}

/** El día de la visita que dice un conforme (el del papel; si no, el de la firma). */
export function diaDeConforme(conforme) {
  const d = conforme?.datos?.fechaVisita;
  return E.esDia(d) ? d : firmadoEl(conforme).dia;
}

/** El día en que se empezó una visita (el de `creado` de su lista, en el reloj del móvil). */
export function diaDeVisita(visita) {
  if (visita?.conforme) return diaDeConforme(visita.conforme);
  return diaDeInstante(visita?.lista?.creado);
}

/** «Firmado el lunes 16 de noviembre a las 11:12 por Lucía Roca»: lo que ve quien no abre el papel. */
export function fraseDeFirma(conforme) {
  const { dia, hora } = firmadoEl(conforme);
  const quien = firmantesDe(conforme);
  return `Firmado${dia ? ` el ${E.fechaConDia(dia)}` : ''}${hora ? ` a las ${hora}` : ''}${quien ? ` por ${quien}` : ''}`;
}

/** ¿Figura este repaso en el papel que firmó el comprador? Si no, es un «añadido después de la firma». */
export function estaEnElConforme(conforme, repasoId) {
  const lista = conforme?.datos?.repasos;
  if (!Array.isArray(lista)) return true;   // un conforme sin su dato no acusa a nadie
  return lista.some((r) => r?.id === repasoId);
}

/* ─── La cita de la visita ───────────────────────────────────── */
/**
 * ¿Está por hacer la cita de la visita de repasos? Hay cita y, DESPUÉS
 * de fijarla, no se ha firmado ningún conforme en esa vivienda. Así la
 * cita queda hecha sola en cuanto se firma —la recoja quien la
 * recoja; la dirección facultativa no puede escribir en la ficha— y
 * ponerle una fecha nueva abre una cita nueva. No hay marca a mano de
 * «la visita se ha hecho».
 *
 * `conformes` son las filas de conforme de esa vivienda (las de sus
 * visitas y las sueltas que este móvil tenga sin subir).
 */
export function citaPendiente(entrega, conformes = []) {
  const dia = entrega?.posventa || '';
  if (!E.esDia(dia)) return false;
  const fijada = entrega.posventaFijadaEn || '';
  return !conformes.some((c) => esConforme(c) && String(c.creado || '') > fijada);
}

/* ─── La situación de una vivienda entregada ─────────────────── */
/**
 * Todo lo que la lista y la ficha necesitan saber de una vivienda
 * entregada, calculado de una vez.
 *
 *   entrega   su ficha de entrega.
 *   visitas   [{ lista, repasos: [repaso…], conforme: medio | null }],
 *             las de sus listas de visita VIVAS (store.visitasDeUnidad).
 *   sueltos   conformes firmados en este móvil y todavía sin subir cuya
 *             lista no está viva aquí (alguien la borró en otro móvil;
 *             volverá cuando el conforme suba). Cuentan como firmados.
 *   hoy       «2026-11-17», el día del móvil.
 *
 * Devuelve:
 *   cerrada   las cinco condiciones a la vez (ver abajo).
 *   falta     las frases de lo que le falta, en su orden.
 *   visita    { estado, dia, hora }: 'en-curso' | 'prevista' |
 *             'sin-confirmar' | 'firmada' | 'sin-fecha'.
 *   cita      { pendiente, dia, hora, pasada }: la cita de la ficha.
 *   botones   [{ clave, nombre, icono, valor, resuelto }], los cinco.
 *   repasos   { total, terminados, porCerrar } de TODAS sus visitas.
 *   abiertas, firmadas   cuántas visitas hay de cada clase.
 *
 * CERRADA es: (1) hay al menos un conforme firmado; (2) no queda
 * ninguna visita empezada y sin firmar; (3) no hay cita por hacer;
 * (4) los cinco botones están resueltos; y (5) todos los repasos de
 * sus visitas están verificados. Los repasos de antes de la entrega no
 * cuentan para nada.
 */
export function situacionPosventa({ entrega, visitas = [], sueltos = [], hoy = E.hoyIso() } = {}) {
  const e = entrega || {};
  const lasVisitas = (visitas || []).filter((v) => v && v.lista);
  const firmadas = lasVisitas.filter((v) => esConforme(v.conforme));
  const abiertas = lasVisitas.filter((v) => !esConforme(v.conforme));
  const conformes = [...firmadas.map((v) => v.conforme), ...(sueltos || []).filter(esConforme)];

  /* La cita. */
  const pendiente = citaPendiente(e, conformes);
  const cita = {
    pendiente,
    dia: pendiente ? e.posventa : '',
    hora: pendiente && /^\d{2}:\d{2}$/.test(e.posventaHora || '') ? e.posventaHora : '',
    pasada: pendiente && e.posventa < hoy,
  };

  /* Los cinco botones. */
  const botones = BOTONES.map((b) => {
    const valor = valorDeBoton(e, b.clave);
    return { clave: b.clave, nombre: b.nombre, icono: b.icono, valor, resuelto: valor !== '' };
  });

  /* Los repasos de todas las visitas: terminado es VERIFICADO. */
  const todos = lasVisitas.flatMap((v) => (v.repasos || []).filter((t) => t && !t.borrada));
  const terminados = todos.filter(hecha).length;
  const repasos = { total: todos.length, terminados, porCerrar: todos.length - terminados };

  /* El estado de la visita, por este orden de preferencia. */
  const porCreado = (a, b) => String(a || '').localeCompare(String(b || ''));
  let visita;
  if (abiertas.length) {
    const ultima = [...abiertas].sort((a, b) => porCreado(a.lista.creado, b.lista.creado)).pop();
    visita = { estado: 'en-curso', dia: diaDeInstante(ultima.lista.creado), hora: '' };
  } else if (pendiente) {
    visita = { estado: cita.pasada ? 'sin-confirmar' : 'prevista', dia: cita.dia, hora: cita.hora };
  } else if (conformes.length) {
    const ultimo = [...conformes].sort((a, b) => porCreado(a.creado, b.creado)).pop();
    visita = { estado: 'firmada', dia: diaDeConforme(ultimo), hora: '' };
  } else {
    visita = { estado: 'sin-fecha', dia: '', hora: '' };
  }

  /* Lo que le falta, en su orden. Con una visita empezada no se dice
     además «hacer la visita»: se está haciendo, y lo que falta es
     acabarla y firmar. */
  const falta = [];
  if (abiertas.length) falta.push('finalizar la visita y firmar el conforme');
  else if (pendiente) falta.push('hacer la visita');
  else if (!conformes.length) falta.push('poner fecha a la visita');
  if (repasos.porCerrar > 0) {
    falta.push(repasos.porCerrar === 1 ? '1 repaso de la visita' : `${repasos.porCerrar} repasos de la visita`);
  }
  const sinResolver = botones.filter((b) => !b.resuelto);
  if (sinResolver.length === botones.length) falta.push('los cinco botones');
  else for (const b of sinResolver) falta.push(b.nombre.toLowerCase());

  const cerrada = conformes.length > 0 && abiertas.length === 0 && !pendiente
    && sinResolver.length === 0 && repasos.porCerrar === 0;

  return {
    cerrada, falta, visita, cita, botones, repasos,
    abiertas: abiertas.length, firmadas: conformes.length,
  };
}

/* ─── Las frases de la tarjeta y de la ficha ─────────────────── */
/** El renglón de la visita en la tarjeta de la lista: { texto, clase, icono }. */
export function renglonDeVisita(situacion) {
  const { estado, dia, hora } = situacion.visita;
  if (estado === 'en-curso') {
    return { icono: 'camera', clase: '', texto: `Visita en curso${dia ? ` · empezada el ${E.diaCorto(dia)}` : ''}` };
  }
  if (estado === 'prevista') {
    return { icono: 'calendario', clase: '', texto: `Visita de repasos: ${diaConSemana(dia)}${hora ? ` · ${hora}` : ''}` };
  }
  if (estado === 'sin-confirmar') {
    return { icono: 'calendario', clase: '', texto: `Visita de repasos: ${diaConSemana(dia)} · sin confirmar` };
  }
  if (estado === 'firmada') {
    return { icono: 'check', clase: 'hecha', texto: `Visita hecha${dia ? ` el ${E.diaCorto(dia)}` : ''} · conforme firmado` };
  }
  return { icono: 'calendario', clase: 'suave', texto: 'Visita de repasos: sin fecha' };
}

/** «Repasos de la visita: 5 de 8 terminados», o '' si ninguna visita tiene repasos. */
export function renglonDeRepasos(situacion) {
  const { total, terminados } = situacion.repasos;
  return total ? `Repasos de la visita: ${cuentaDeRepasos(terminados, total)}` : '';
}

/** «5 de 8 terminados» · «1 de 1 terminado». */
export function cuentaDeRepasos(terminados, total) {
  return `${terminados} de ${total} ${total === 1 ? 'terminado' : 'terminados'}`;
}

/** Lo que va detrás de «Le falta: », o '' si no le falta nada. */
export function fraseDeFalta(situacion) {
  return situacion.falta.join(' · ');
}

/**
 * La tarjeta «Visita de repasos» de la ficha: el rótulo gris y, debajo,
 * el día en grande. `caso` dice qué se le ofrece a quien pone fechas:
 * 'sin-fecha' (poner fecha), 'cita' (cambiarla), 'en-curso' (nada: se
 * está haciendo) o 'hecha' (poner fecha a otra).
 */
export function tarjetaDeCita(situacion) {
  const { cita } = situacion;
  if (cita.pendiente) {
    return {
      caso: 'cita',
      rotulo: cita.pasada ? 'Visita prevista' : 'Próxima visita',
      dia: `${E.fechaBanner(cita.dia)}${cita.pasada ? ' · sin confirmar' : (cita.hora ? ` · ${cita.hora}` : '')}`,
    };
  }
  if (situacion.abiertas) {
    const dia = situacion.visita.dia;
    return { caso: 'en-curso', rotulo: 'Visita en curso', dia: dia ? `Empezada el ${E.diaCorto(dia)}` : 'Empezada' };
  }
  if (situacion.firmadas) return { caso: 'hecha', rotulo: 'Sin otra visita prevista', dia: '' };
  return { caso: 'sin-fecha', rotulo: 'Sin fecha', dia: '' };
}

/* ─── Lo que pinta el calendario ─────────────────────────────── */
/**
 * Las visitas de repasos que pintan el calendario (#/entregas) y la
 * portada, a partir de lo que devuelve store.posventaDePromo (un mapa
 * unidadId → { entrega, visitas, sueltos }; basta con conRepasos: false).
 *
 * Devuelve un mapa unidadId → { cita, hechas }, solo con las viviendas
 * que tienen algo:
 *
 *   cita    la visita prevista mientras esté por hacer (citaPendiente):
 *           { dia, hora, fijadaEn, por, porNombre }, o null.
 *   hechas  una por conforme firmado (los de sus visitas y los sueltos
 *           de este móvil), en el día de la visita que dice el papel:
 *           [{ dia, conformeId, listaId, horaFirma, diaFirma, firmantes,
 *           realizadaPor, realizadaPorId, firmadaEn }]. Una visita
 *           empezada y sin firmar no está hecha y no sale.
 *
 * No escribe nada ni decide colores: eso es de js/entregas.js.
 */
export function visitasDelCalendario(fichas) {
  const salida = new Map();
  for (const [unidadId, ficha] of fichas || []) {
    const e = ficha?.entrega || {};
    const conformes = [
      ...(ficha?.visitas || []).map((v) => v?.conforme).filter(esConforme),
      ...(ficha?.sueltos || []).filter(esConforme),
    ];
    const cita = citaPendiente(e, conformes) ? {
      dia: e.posventa,
      hora: /^\d{2}:\d{2}$/.test(e.posventaHora || '') ? e.posventaHora : '',
      fijadaEn: e.posventaFijadaEn || '',
      por: e.posventaPor || null,
      porNombre: e.posventaPorNombre || '',
    } : null;
    const hechas = conformes.map((c) => {
      const firmado = firmadoEl(c);
      return {
        dia: diaDeConforme(c),
        conformeId: c.id,
        listaId: c.tareaId || '',
        horaFirma: firmado.hora,
        diaFirma: firmado.dia,
        firmantes: firmantesDe(c),
        realizadaPor: String(c.datos?.realizadaPor || ''),
        realizadaPorId: c.datos?.realizadaPorId || null,
        firmadaEn: String(c.creado || ''),
      };
    }).filter((v) => E.esDia(v.dia))
      .sort((a, b) => a.dia.localeCompare(b.dia) || a.firmadaEn.localeCompare(b.firmadaEn));
    if (cita || hechas.length) salida.set(unidadId, { cita, hechas });
  }
  return salida;
}

/** «Visita de repasos el viernes 20 de noviembre a las 10:30»: el aviso al guardar la cita. */
export function avisoDeCita(dia, hora = '') {
  if (!dia) return 'Visita de repasos sin fecha';
  return `Visita de repasos el ${E.fechaConDia(dia)}${hora ? ` a las ${hora}` : ''}`;
}

/* ─── La lista ───────────────────────────────────────────────── */
/**
 * El orden de la lista. `fichas` son [{ entrega, situacion }].
 *
 * Primero las que tienen algo pendiente: arriba las que tienen una
 * visita en curso, después las que tienen cita por hacer (de la más
 * próxima a la más lejana) y debajo las demás, de la que lleva más
 * tiempo entregada a la que menos. Al final las cerradas, de la
 * entregada más reciente a la más antigua.
 */
export function ordenarEntregadas(fichas) {
  const tramo = (f) => {
    if (f.situacion.cerrada) return 3;
    if (f.situacion.abiertas) return 0;
    return f.situacion.cita.pendiente ? 1 : 2;
  };
  const entregada = (f) => E.diaEntregada(f.entrega) || '';
  const villa = (f) => String(f.entrega?.unidadId || '');
  return [...fichas].sort((a, b) => {
    const ta = tramo(a);
    const tb = tramo(b);
    if (ta !== tb) return ta - tb;
    if (ta === 1) {
      const ca = `${a.situacion.cita.dia} ${a.situacion.cita.hora || '99:99'}`;
      const cb = `${b.situacion.cita.dia} ${b.situacion.cita.hora || '99:99'}`;
      if (ca !== cb) return ca.localeCompare(cb);
    }
    const ea = entregada(a);
    const eb = entregada(b);
    if (ea !== eb) return ta === 3 ? eb.localeCompare(ea) : ea.localeCompare(eb);
    return villa(a).localeCompare(villa(b), 'es', { numeric: true });
  });
}

/** Las de un filtro: 'todas', 'pendientes' (no cerradas) o 'cerradas'. */
export function filtrarEntregadas(fichas, ver) {
  if (ver === 'pendientes') return fichas.filter((f) => !f.situacion.cerrada);
  if (ver === 'cerradas') return fichas.filter((f) => f.situacion.cerrada);
  return fichas;
}

/** La línea de la cuenta: «9 viviendas entregadas · 6 con algo pendiente». Cuenta siempre el total. */
export function cuentaDeEntregadas(fichas) {
  const total = fichas.length;
  if (!total) return '';
  const pendientes = fichas.filter((f) => !f.situacion.cerrada).length;
  const cuantas = total === 1 ? '1 vivienda entregada' : `${total} viviendas entregadas`;
  if (!pendientes) return `${cuantas} · ${total === 1 ? 'cerrada' : 'todas cerradas'}`;
  return `${cuantas} · ${pendientes} con algo pendiente`;
}

/**
 * Lo que avisa la pregunta de quitar la marca de «entregada» cuando la
 * vivienda tiene algo de esta sección ('' si no tiene nada).
 */
export function avisoAlDesmarcar(entrega, visitas = [], sueltos = []) {
  const hayConforme = visitas.some((v) => esConforme(v?.conforme)) || sueltos.some(esConforme);
  const hayVisita = visitas.length > 0 || E.esDia(entrega?.posventa);
  const hayBotones = BOTONES.some((b) => botonResuelto(entrega, b.clave));
  if (!hayConforme && !hayVisita && !hayBotones) return '';
  const que = hayConforme ? 'Tiene una visita de repasos con su conforme firmado.'
    : hayVisita ? 'Tiene una visita de repasos apuntada.'
      : 'Tiene citas apuntadas en Postventa.';
  return `${que} Dejará de verse en Postventa hasta que se vuelva a marcar; no se borra nada.`;
}

/* ─── Los compradores, acortados (la tarjeta de la lista) ───

   La ficha de entrega guarda a los compradores en un texto libre que
   escribe el comercial: «Nombre Apellido1 Apellido2 y Nombre Apellido1
   Apellido2», a veces una sociedad. En la tarjeta de #/entregadas se
   enseñan con el nombre y el PRIMER apellido de cada persona; la ficha
   de la vivienda y el conforme siguen con el texto entero.

   Cuando duda, no recorta: es mejor ver un apellido de más que perder
   el primero. Por eso una sociedad, o una persona con algo que no
   parece un nombre (cifras, paréntesis, emojis), salen tal cual. */

/** Lo que va pegado al apellido que le sigue: «de la Fuente», «San Martín», «van der Berg». */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'da', 'das', 'do', 'dos',
  'di', 'du', 'van', 'von', 'der', 'san', 'santa']);

/* Lo que delata que el texto no es una persona. Se comparan sin puntos
   y en minúsculas, como palabras sueltas: «S.L.» y «sl» son lo mismo. */
const MARCAS_DE_SOCIEDAD = ['sl', 'slu', 'sll', 'slp', 'sa', 'sau', 'sal', 'scoop', 'coop',
  'cooperativa', 'cb', 'scp', 'srl', 'sas', 'sarl', 'spa', 'sprl', 'bvba', 'sociedad', 'limitada',
  'anonima', 'herederos', 'herencia', 'yacente', 'sucesores', 'comunidad', 'hermanos', 'hnos',
  'hijos', 'cia', 'compania', 'ltd', 'ltda', 'limited', 'gmbh', 'gbr', 'kg', 'ag', 'inc', 'llc',
  'llp', 'plc', 'corp', 'co', 'bv', 'nv', 'aps', 'oy', 'fundacion', 'asociacion', 'holding',
  'inversiones', 'grupo', 'trust', 'ab', 'as', 'a/s', 'sci', 'slne', 'inmobiliaria', 'promociones'];
const RE_SOCIEDAD = new RegExp(`(^|[^\\p{L}\\p{N}])(${MARCAS_DE_SOCIEDAD.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'u');
/* «S. L.», «S. A. U.»: con espacios entre las letras, que la lista de arriba no ve. */
const RE_SOCIEDAD_SUELTA = /(^|[^\p{L}])s\s*\.\s*(l|a|coop)\s*\.?(\s*u\s*\.?)?($|[^\p{L}])/u;

/* La segunda palabra de un nombre de la Virgen: «María del Carmen», «María del Pino».
   Solo detrás de María o Mari: «Antonio del Pino» lleva un apellido. */
const NOMBRES_MARIANOS = new Set(['carmen', 'pilar', 'mar', 'rosario', 'rocio', 'angeles',
  'dolores', 'mercedes', 'consuelo', 'pino', 'cristo', 'jesus', 'paz', 'luz', 'socorro',
  'remedios', 'candelaria', 'nieves', 'olvido', 'asuncion', 'concepcion', 'esperanza', 'valle',
  'fatima', 'lourdes', 'gracia', 'gloria', 'sagrario', 'loreto', 'milagros', 'salud', 'soledad',
  'amparo', 'montana', 'carmelo']);

/* Nombres compuestos de los que la segunda palabra casi nunca es apellido.
   Solo deciden con TRES palabras: «José Luis Pérez» se queda entero. */
const NOMBRES_COMPUESTOS = new Set(['jose luis', 'jose maria', 'jose antonio', 'jose manuel',
  'jose ramon', 'jose carlos', 'jose miguel', 'jose angel', 'jose ignacio', 'jose javier',
  'jose juan', 'jose francisco', 'jose enrique', 'jose vicente', 'jose alberto', 'jose pablo',
  'jose david', 'jose andres', 'jose rafael', 'jose fernando', 'jose joaquin', 'juan carlos',
  'juan jose', 'juan antonio', 'juan manuel', 'juan luis', 'juan pablo', 'juan francisco',
  'juan miguel', 'juan ramon', 'juan andres', 'juan ignacio', 'juan alberto', 'juan diego',
  'juan cruz', 'juan bautista', 'juan pedro', 'miguel angel', 'francisco javier',
  'francisco jose', 'luis miguel', 'luis alberto', 'luis fernando', 'pedro jose', 'pedro pablo',
  'carlos alberto', 'jesus maria', 'maria jose', 'maria jesus', 'maria teresa', 'maria isabel',
  'maria luisa', 'maria elena', 'maria angeles', 'maria dolores', 'maria victoria',
  'maria eugenia', 'maria antonia', 'maria cristina', 'maria pilar', 'maria rosa', 'maria carmen',
  'maria paz', 'maria luz', 'maria lourdes', 'maria candelaria', 'maria nieves', 'maria mar',
  'maria inmaculada', 'maria auxiliadora', 'maria soledad', 'maria esther', 'maria fernanda',
  'maria belen', 'mari carmen', 'mari paz', 'mari luz', 'ana maria', 'ana isabel',
  'ana belen', 'ana rosa', 'rosa maria', 'rosa ana', 'eva maria', 'ana lucia',
  'ana cristina', 'luz maria', 'pilar maria']);

/* Segundas palabras que casi siempre son nombre y no apellido. Con TRES
   palabras, si la segunda es una de estas, la persona se queda entera:
   «Mari Cruz Toro», «Hans Peter Müller». */
const SEGUNDOS_NOMBRES = new Set([...NOMBRES_COMPUESTOS].map((n) => n.split(' ')[1]).concat([
  'angeles', 'cruz', 'pino', 'jesus', 'manuel', 'jose', 'luis', 'antonio', 'peter', 'michael',
  'jane', 'pierre', 'marie', 'ann', 'anne', 'maria', 'john', 'paul', 'james', 'louise', 'mary',
  'erik']));

/* Tratamientos delante del nombre: no cuentan como palabra («D. Juan Pérez» se queda entero). */
const TRATAMIENTOS = new Set(['d', 'dna', 'dª', 'don', 'dona', 'sr', 'sra', 'srta', 'mr', 'mrs',
  'ms', 'dr', 'dra']);

/** En minúsculas y sin tildes ni puntos, para comparar: «Mª.» → «maria». */
function llano(palabra) {
  return palabra.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\.$/, '').replace(/^mª$/, 'maria').replace(/^ma$/, 'maria');
}

/** ¿Parece una palabra de un nombre? Letras, y por dentro guion, apóstrofo o punto. */
function esPalabraDeNombre(palabra) {
  return /^[\p{L}\p{M}][\p{L}\p{M}'’.\-]*$/u.test(palabra);
}

/** Las palabras, en grupos: cada apellido con las partículas que lleva delante. */
function agruparPalabras(palabras) {
  const grupos = [];
  let pendientes = [];
  for (const p of palabras) {
    if (PARTICULAS.has(p.toLowerCase())) { pendientes.push(p); continue; }
    grupos.push([...pendientes, p].join(' '));
    pendientes = [];
  }
  if (pendientes.length) {
    if (grupos.length) grupos[grupos.length - 1] += ` ${pendientes.join(' ')}`;
    else grupos.push(pendientes.join(' '));
  }
  return grupos;
}

/** Una persona con su nombre y su primer apellido. Si no lo tiene claro, la deja como viene. */
function personaCorta(persona) {
  const palabras = persona.split(' ').filter(Boolean);
  if (!palabras.length || !palabras.every(esPalabraDeNombre)) return palabras.join(' ');
  const todos = agruparPalabras(palabras);
  const tratamiento = todos.length > 1 && TRATAMIENTOS.has(llano(todos[0])) ? todos[0] : null;
  const grupos = tratamiento ? todos.slice(1) : todos;
  const unir = (g) => (tratamiento ? [tratamiento, ...g] : g).join(' ');
  if (grupos.length <= 2) return unir(grupos);
  const primero = grupos[0].split(' ');
  const segundo = grupos[1].split(' ');
  let enElNombre = 1;
  if (primero.length === 1 && segundo.length > 1 && ['maria', 'mari'].includes(llano(primero[0]))
      && NOMBRES_MARIANOS.has(llano(segundo[segundo.length - 1]))) enElNombre = 2;
  else if (grupos.length === 3 && primero.length === 1 && segundo.length === 1
      && SEGUNDOS_NOMBRES.has(llano(segundo[0]))) enElNombre = 2;
  if (grupos.length - enElNombre <= 1) return unir(grupos);
  return unir(grupos.slice(0, -1));
}

/** ¿El texto es de una sociedad (o de algo que no es una persona)? */
export function esSociedad(texto) {
  const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return RE_SOCIEDAD_SUELTA.test(t) || RE_SOCIEDAD.test(t.replace(/[.·]/g, ''));
}

/**
 * Los compradores de la ficha de entrega, con el nombre y el primer
 * apellido de cada persona: «Nombre Apellido1 Apellido2 y Nombre
 * Apellido1 Apellido2» → «Nombre Apellido1 y Nombre Apellido1». Una
 * sociedad sale tal cual. Nunca lanza:
 * lo que no es texto (null, un objeto) da ''.
 */
export function compradoresCortos(texto) {
  if (typeof texto !== 'string' && typeof texto !== 'number') return '';
  const entero = String(texto).replace(/\s+/g, ' ').trim();
  if (!entero) return '';
  if (esSociedad(entero)) return entero;
  const personas = String(texto)
    .split(/[\n\r,;\/&]|\s(?:y|e|and|und|och|og|et|-|–)(?=\s)/iu)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(personaCorta)
    .filter(Boolean);
  if (!personas.length) return entero;
  if (personas.length === 1) return personas[0];
  const ultima = personas[personas.length - 1];
  /* «e» delante del sonido «i» («Ana Pérez e Inés Gómez»), y en mayúscula si todo viene en mayúsculas. */
  let y = /^h?[ií](?![aeouáéóú])/iu.test(ultima) ? 'e' : 'y';
  if (!/\p{Ll}/u.test(entero)) y = y.toUpperCase();
  return `${personas.slice(0, -1).join(', ')} ${y} ${ultima}`;
}

/* ─── Los dos desplegables del repaso de la visita ───────────────
   En la visita de repasos el oficio y la estancia no se eligen con
   chips sino en dos desplegables (en el iPhone salen como rueda): con
   chips eran «una lista enorme» en la que había que buscar con el
   comprador delante (lo pidió la casa el 17-11-2026). Aquí está solo el
   ORDEN de las dos listas y con qué nace cada una; el dibujo está en
   js/piezasPosventa.js. Los repasos de siempre siguen con sus chips.

     OFICIO     «General» el primero y los demás por orden alfabético.
                Nace con el que propone la IA al describir la foto; si
                la IA no contesta, tarda, falla o no hay cobertura,
                «General». Se cambia en el desplegable.
     ESTANCIA   opcional: «Sin estancia» la primera (y la que viene
                puesta) y las de la obra por orden alfabético, con los
                números en su sitio. La IA NO la elige: si la propone,
                no se usa; quien apunta la escribe en el texto o la
                elige aquí. */

/* El orden de las dos listas. `numeric` pone los números en su sitio
   («Dormitorio 2» antes que «Dormitorio 10», y los dos antes que
   «Dormitorio suite»); `base` no distingue mayúsculas ni tildes. */
const ALFABETO = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Lo que dice la primera opción de la estancia, la que viene puesta. */
export const SIN_ESTANCIA = 'Sin estancia';

/** Las opciones del oficio, [{ valor, texto }]: «General» la primera y las demás por orden alfabético del nombre. */
export function oficiosDelDesplegable(oficios = OFICIOS) {
  const primero = oficios.filter((o) => o.id === OFICIO_POR_DEFECTO);
  const resto = oficios.filter((o) => o.id !== OFICIO_POR_DEFECTO)
    .sort((a, b) => ALFABETO.compare(a.nombre, b.nombre));
  return [...primero, ...resto].map((o) => ({ valor: o.id, texto: o.nombre }));
}

/**
 * Las opciones de la estancia, [{ valor, texto }]: «Sin estancia» (valor
 * '') la primera y las de la obra (Ajustes → Estancias de la obra) por
 * orden alfabético. La que ya lleve el repaso sale aunque se haya
 * quitado de la lista, para que corregir el oficio no se la lleve.
 */
export function estanciasDelDesplegable(zonas = ZONAS, actual = '') {
  const unicas = [...new Set([...zonas, actual].map((z) => String(z ?? '').trim()).filter(Boolean))];
  unicas.sort((a, b) => ALFABETO.compare(a, b));
  return [{ valor: '', texto: SIN_ESTANCIA }, ...unicas.map((z) => ({ valor: z, texto: z }))];
}

/** El oficio con el que nace (o se corrige) un repaso de la visita: el propuesto si es uno de la lista; si no, «General». */
export function oficioDeLaVisita(propuesto, oficios = OFICIOS) {
  return oficios.some((o) => o.id === propuesto) ? propuesto : OFICIO_POR_DEFECTO;
}
