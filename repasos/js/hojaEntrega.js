/* LA HOJA DE FECHAS de una vivienda: compradores, revisión con el
   cliente (día y hora), firma, «la revisión se ha hecho» y «la
   vivienda se ha entregado». Cada fila abre lo suyo y vuelve.

   Se abre desde dos sitios, y por eso vive aparte:
     · la ficha de la villa, tocando el banner «Entrega»;
     · el calendario de entregas, desde la tarjeta de cada visita o
       con «Poner fechas a una vivienda» (lo pidió el comercial en
       noviembre de 2026: el calendario solo dejaba mirar).

   Solo la abren el comercial y el administrador: quien llama lo
   comprueba con puedePonerFechas(), y store.fijarEntrega() y el
   servidor lo vuelven a comprobar.

   ENTREGADA no lo decide la fecha de la firma (decisión de Fran,
   10-11-2026): una cosa es que la firma sea hoy y otra que la vivienda
   ya se haya entregado. Lo apuntan aquí el comercial o el
   administrador, y se puede deshacer.

   LAS VISITAS. Una vivienda puede tener varias visitas con el cliente.
   Las filas de la revisión hablan de la cita VIGENTE; las que ya se
   hicieron antes salen en «Visitas ya hechas», con quién apuntó cada
   una, y desde ahí se quita la que se hubiera apuntado por error.
   Las preguntas de marcar y de deshacer dicen lo que va a pasar de
   verdad: si la cita se trae a hoy, si al deshacer vuelve a su fecha
   y si al equipo le llega un aviso. */
import { h, toast, sheet, confirmar } from './ui.js';
import * as store from './store.js';
import { unidades } from './catalog.js';
import { menuTarjeta, hojaFecha } from './piezas.js';
import { ir } from './app.js';
import * as E from './entregas.js';

/**
 * Abre la hoja de una vivienda. `entrega` es su ficha tal como la tiene
 * quien llama (o null si aún no hay). `alCambiar` se llama cuando algo
 * se ha guardado, para que la pantalla de debajo se repinte.
 */
export async function hojaFechas({ unidadId, promoId, nombre, entrega = null, alCambiar = () => {} }) {
  const e = entrega || {};
  const fecha = (iso) => E.fechaConDia(iso, { mayus: true });
  const diaEntrega = E.diaDeEntrega(e);
  // La cita vigente, si ya está hecha; lo que vuelve si se deshace; y
  // las visitas de antes (el historial).
  const marcada = E.visitaMarcada(e);
  const hecha = !!marcada?.vigente;
  const vuelve = hecha ? E.citaQueVuelve(e) : null;
  const anteriores = E.todasLasVisitas(e).filter((v) => !v.vigente);
  const filas = [
    { id: 'compradores', icono: 'users', rotulo: 'Compradores', sub: e.compradores || 'Sin apuntar' },
    { id: 'revision', icono: 'calendario', rotulo: 'Fecha de la revisión con el cliente',
      sub: e.revision ? `${fecha(e.revision)}${e.revisionHora ? ` · ${e.revisionHora}` : ''}` : 'Sin fecha' },
    { id: 'firma', icono: 'key', rotulo: 'Fecha de la firma',
      sub: e.firma ? `${fecha(e.firma)}${e.firmaHora ? ` · ${e.firmaHora}` : ''}` : 'Sin fecha' },
    // «Hecha» es la revisión que hay puesta ahora: una cita nueva en una
    // vivienda que ya tuvo otra visita vuelve a estar por hacer.
    hecha
      ? { id: 'parte', icono: 'periodico', rotulo: 'Abrir el parte post-entrega',
          sub: `Revisión hecha el ${E.fechaLarga(marcada.dia)}` }
      // Si la vivienda ya tiene otras visitas hechas, se dice de cuál
      // se habla: la hoja también se abre desde la tarjeta de una de
      // las de antes, y ahí «la revisión» podría parecer aquella.
      : { id: 'hecha', icono: 'check', rotulo: 'La revisión se ha hecho',
          sub: anteriores.length && E.esDia(e.revision)
            ? `La del ${E.diaCorto(e.revision).replace(/ /g, ' ')}; abre el parte post-entrega`
            : 'Abre el parte post-entrega' },
    hecha ? { id: 'deshacer', icono: 'x', rotulo: 'La revisión no se ha hecho',
      // En corto y con espacios duros, para que la hora no se quede
      // colgando sola en una segunda línea.
      sub: vuelve
        ? `Quita la marca; la cita vuelve al ${E.diaCorto(vuelve.dia).replace(/ /g, ' ')}${vuelve.hora ? ` · ${vuelve.hora}` : ''}`
        : 'Quita la marca; los partes se quedan' } : null,
    // Las visitas que ya se hicieron antes de la cita que hay ahora.
    anteriores.length
      ? { id: 'visitas', icono: 'listaChecks', rotulo: 'Visitas ya hechas', sub: enumerar(anteriores.map((v) => E.diaCorto(v.dia))) }
      : null,
    e.entregadaEn
      ? { id: 'no-entregada', icono: 'x', rotulo: 'La vivienda no se ha entregado',
          sub: `Quita la marca de entregada${diaEntrega ? ` (${E.fechaLarga(diaEntrega)})` : ''}` }
      : { id: 'entregada', icono: 'key', rotulo: 'La vivienda se ha entregado', sub: 'Firmada y con las llaves entregadas' },
  ];
  const elegido = await menuTarjeta(`${nombre} · entrega`, filas, {
    extra: h('span.d-menu-nota', null, 'Solo el comercial y el administrador ponen los compradores y las fechas, y dicen cuándo una vivienda se ha entregado.'),
  });
  if (!elegido) return;
  try {
    if (elegido === 'compradores') {
      const nombres = await hojaCompradores(e.compradores || '');
      if (nombres === null) return;
      await store.fijarEntrega(unidadId, promoId, { compradores: nombres });
      toast(nombres ? 'Compradores apuntados' : 'Compradores borrados');
    } else if (elegido === 'revision') {
      const v = await hojaFecha(e.revision ? E.partes(e.revision).fecha.toISOString() : null);
      if (v === null) return;
      const dia = v ? E.isoDe(new Date(v)) : '';
      let horaNueva = e.revisionHora || '';
      if (dia) {
        // Cerrar la hoja de la hora sin elegir no tira la fecha que
        // se acaba de escoger: se guarda con la hora que hubiera.
        const hh = await hojaHora(horaNueva);
        if (hh !== null) horaNueva = hh;
      }
      const guardada = await store.fijarEntrega(unidadId, promoId, { revision: dia, revisionHora: dia ? horaNueva : '' });
      // Una fecha nueva y posterior sobre una visita ya hecha es otra
      // cita: la visita hecha no se pierde, pasa a «Visitas ya hechas».
      // Se dice, que si no parece que la marca ha desaparecido.
      const archivada = hecha && !guardada.revisadaEn ? marcada : null;
      // Y al revés: ponerle a una cita pendiente el día de una visita
      // que ya figura como hecha es devolverle su fecha (se le había
      // puesto otra por error). Esa visita vuelve a ser la revisión de
      // la ficha, hecha; también se dice, que la cita deja de estar
      // pendiente sin que nadie haya pulsado «se ha hecho».
      const devuelta = !hecha && !!guardada.revisadaEn && anteriores.some((v) => v.dia === dia);
      toast(dia ? `Revisión el ${E.fechaConDia(dia)}${horaNueva ? ` a las ${horaNueva}` : ''}` : 'Revisión sin fecha', '', {
        icono: 'calendario',
        detalle: archivada ? `La visita del ${E.fechaLarga(archivada.dia)} sigue como hecha`
          : devuelta ? 'Ese día ya figuraba una visita hecha: la revisión queda como hecha' : '',
      });
    } else if (elegido === 'firma') {
      const v = await hojaFecha(e.firma ? E.partes(e.firma).fecha.toISOString() : null);
      if (v === null) return;
      const dia = v ? E.isoDe(new Date(v)) : '';
      let horaNueva = e.firmaHora || '';
      if (dia) {
        // Igual que en la revisión: cerrar la hoja de la hora sin
        // elegir no tira la fecha que se acaba de escoger.
        const hh = await hojaHora(horaNueva, 'La hora de la cita en la notaría. Se puede dejar sin hora.');
        if (hh !== null) horaNueva = hh;
      }
      await store.fijarEntrega(unidadId, promoId, { firma: dia, firmaHora: dia ? horaNueva : '' });
      toast(dia ? `Firma el ${E.fechaConDia(dia)}${horaNueva ? ` a las ${horaNueva}` : ''}` : 'Firma sin fecha', '', { icono: 'key' });
    } else if (elegido === 'hecha') {
      // La pregunta cuenta lo que va a pasar con ESTA ficha:
      //  · una cita de más adelante que se da por hecha hoy es una
      //    visita que se adelantó: queda con fecha de hoy (y, si fue un
      //    error, deshacerlo le devuelve la que tenía);
      //  · una cita de un día ya pasado queda apuntada en su día;
      //  · si la vivienda ya tenía otra visita hecha, esa no se pierde;
      //  · y el parte: el que ya tenga la vivienda, o uno nuevo.
      const hoy = E.hoyIso();
      const prevista = E.esDia(e.revision) ? e.revision : '';
      const frases = [];
      if (prevista > hoy) {
        frases.push(`Estaba prevista para el ${E.fechaConDia(prevista)}${e.revisionHora ? ` a las ${e.revisionHora}` : ''}: quedará apuntada con fecha de hoy. Si es un error, «La revisión no se ha hecho» le devuelve esa fecha.`);
      } else if (prevista && prevista < hoy) {
        frases.push(`Queda apuntada en su día, el ${E.fechaConDia(prevista)}.`);
      }
      // De las visitas de antes se dice que siguen como están. Menos de
      // la que cayera el mismo día en que va a quedar apuntada esta (lo
      // puede dejar así un móvil con la app anterior): es la misma
      // visita, y decirlo sería hablar dos veces de ella.
      const quedaEn = prevista && prevista < hoy ? prevista : hoy;
      const otras = anteriores.filter((v) => v.dia !== quedaEn);
      if (otras.length) {
        frases.push(otras.length === 1
          ? `La visita del ${E.fechaLarga(otras[0].dia)} sigue como hecha.`
          : 'Las visitas ya hechas de antes siguen como están.');
      }
      frases.push((await store.partePostDeUnidad(unidadId))
        ? 'Lo que haya visto el comprador se apunta en el parte post-entrega que ya tiene la vivienda, y al equipo le llega un aviso.'
        : 'Se abre el parte post-entrega para apuntar lo que haya visto el comprador, y al equipo le llega un aviso.');
      const seguro = await confirmar({
        titulo: '¿La revisión con el cliente se ha hecho?',
        texto: frases.join(' '),
        ok: 'Sí, se ha hecho', icono: 'check', conservar: 'Todavía no', iconoConservar: 'clock',
      });
      if (!seguro) return;
      const { lista } = await store.marcarRevisionHecha(unidadId, promoId);
      toast('Revisión hecha · parte post-entrega abierto', '', { icono: 'check' });
      ir(`#/l/${lista.id}`);
      return;
    } else if (elegido === 'parte') {
      const parte = await store.partePostDeUnidad(unidadId);
      if (parte) { ir(`#/l/${parte.id}`); return; }
      toast('Esta vivienda no tiene parte post-entrega todavía', 'err');
      return;
    } else if (elegido === 'deshacer') {
      // Deshacer también pregunta: la hoja nace justo donde estaba el
      // dedo, y un segundo toque sin querer quitaba la marca en el acto.
      // Y dice con qué fecha queda la revisión: la que tenía antes de
      // darla por hecha, si al marcarla se trajo a hoy (entonces el
      // servidor avisa al equipo de esa cita); si no, la que tiene.
      const queda = vuelve
        ? `La revisión con el cliente vuelve a estar pendiente para el ${E.fechaConDia(vuelve.dia)}${vuelve.hora ? ` a las ${vuelve.hora}` : ''}, que es la fecha que tenía antes de darla por hecha, y al equipo le llega el aviso de esa cita.`
        : E.esDia(e.revision)
          ? `La revisión con el cliente vuelve a estar pendiente, con la fecha que tiene puesta: el ${E.fechaConDia(e.revision)}${e.revisionHora ? ` a las ${e.revisionHora}` : ''}.`
          : 'La revisión con el cliente deja de figurar como hecha y, como no tiene fecha puesta, la vivienda queda sin revisión.';
      const seguro = await confirmar({
        titulo: `¿Quitar la marca de revisión hecha de la ${nombre}?`,
        texto: `${queda} Los partes que haya abiertos se quedan${anteriores.length ? ', y las visitas ya hechas de antes también' : ''}.`,
        ok: 'Sí, quitarla', icono: 'x', conservar: 'Dejarla como está', iconoConservar: 'check',
      });
      if (!seguro) return;
      await store.deshacerRevisionHecha(unidadId, promoId);
      toast(vuelve ? `La revisión vuelve al ${E.fechaConDia(vuelve.dia)}${vuelve.hora ? ` a las ${vuelve.hora}` : ''}`
        : E.esDia(e.revision) ? 'La revisión vuelve a estar pendiente' : 'La vivienda queda sin revisión');
    } else if (elegido === 'visitas') {
      // La lista de las visitas ya hechas, con quién apuntó cada una.
      // Tocar una es para quitarla (se archivó o se marcó por error), y
      // antes se pregunta, como en todo lo que deshace algo.
      const dia = await hojaVisitas(nombre, anteriores);
      if (!dia) return;
      const unica = anteriores.length === 1 && !hecha;
      const seguro = await confirmar({
        titulo: `¿Quitar la visita del ${E.fechaLarga(dia)} de la ${nombre}?`,
        texto: 'Deja de figurar como hecha en el calendario y en la actividad de la portada. '
          + (E.esDia(e.revision) ? 'La fecha de revisión que hay puesta ahora no cambia, y los partes que haya abiertos se quedan.' : 'Los partes que haya abiertos se quedan.')
          + (unica ? ' Era la única visita hecha de la vivienda: los partes que se abran a partir de ahora ya no serán post-entrega.' : ''),
        ok: 'Sí, quitarla', icono: 'x', conservar: 'Dejarla como está', iconoConservar: 'check',
      });
      if (!seguro) return;
      await store.quitarVisitaHecha(unidadId, promoId, dia);
      toast(`Visita del ${E.fechaLarga(dia)} quitada`);
    } else if (elegido === 'entregada') {
      const seguro = await confirmar({
        titulo: `¿La ${nombre} se ha entregado?`,
        texto: e.compradores
          ? `Queda como entregada a ${e.compradores}, y al equipo le llega un aviso. Se puede deshacer.`
          : 'Queda como entregada, y al equipo le llega un aviso. Se puede deshacer.',
        ok: 'Sí, se ha entregado', icono: 'key', conservar: 'Todavía no', iconoConservar: 'clock',
      });
      if (!seguro) return;
      await store.marcarEntregada(unidadId, promoId);
      toast(`${nombre} entregada`, '', { icono: 'key' });
    } else if (elegido === 'no-entregada') {
      const seguro = await confirmar({
        titulo: `¿Quitar la marca de entregada de la ${nombre}?`,
        texto: 'La vivienda vuelve a estar sin entregar. Se puede volver a marcar cuando toque.',
        ok: 'Sí, quitarla', icono: 'x', conservar: 'Dejarla como está', iconoConservar: 'key',
      });
      if (!seguro) return;
      await store.deshacerEntregada(unidadId, promoId);
      toast('La vivienda vuelve a estar sin entregar');
    }
    alCambiar();
  } catch (err) {
    toast(err.message || 'No se ha podido guardar', 'err');
  }
}

/**
 * Desde el calendario, para poner fechas a una vivienda que ese día no
 * tiene nada: se elige la villa y se abre su hoja. Las que ya tienen
 * ficha van primero, con lo que se sabe de ellas.
 */
export async function hojaFechasDeOtra({ promoId, entregas = [], alCambiar = () => {} }) {
  const fichaDe = new Map(entregas.filter((x) => x && !x.borrada).map((x) => [x.unidadId, x]));
  const resumen = (x) => {
    if (!x) return 'Sin fechas todavía';
    const trozos = [];
    if (x.compradores) trozos.push(x.compradores);
    if (x.entregadaEn) trozos.push('entregada');
    else if (x.firma) trozos.push(`firma el ${E.fechaLarga(x.firma)}`);
    else if (x.revision) trozos.push(`revisión el ${E.fechaLarga(x.revision)}`);
    else {
      // Sin cita ni firma, pero con visitas ya hechas: la última.
      const ultima = E.todasLasVisitas(x).pop();
      if (ultima) trozos.push(`revisada el ${E.fechaLarga(ultima.dia)}`);
    }
    return trozos.join(' · ') || 'Sin fechas todavía';
  };
  const todas = unidades(promoId);
  const filas = [...todas.filter((u) => fichaDe.has(u.id)), ...todas.filter((u) => !fichaDe.has(u.id))]
    .map((u) => ({ id: u.id, icono: 'casa', rotulo: u.nombre, sub: resumen(fichaDe.get(u.id)) }));
  const unidadId = await menuTarjeta('¿De qué vivienda?', filas);
  if (!unidadId) return;
  const u = todas.find((x) => x.id === unidadId);
  await hojaFechas({ unidadId, promoId, nombre: u?.nombre || unidadId, entrega: fichaDe.get(unidadId) || null, alCambiar });
}

/* ─── Las visitas ya hechas ────────────────────────────────────── */
/** «6 nov» · «6 nov y 12 nov» · «6 nov, 12 nov y 20 nov». */
function enumerar(trozos) {
  return trozos.length > 1 ? `${trozos.slice(0, -1).join(', ')} y ${trozos[trozos.length - 1]}` : trozos[0] || '';
}

/**
 * La lista de las visitas ya hechas de una vivienda: el día de cada
 * una y quién la dio por hecha. Resuelve con el día de la que se toque
 * (para quitarla; quien llama pregunta antes) o null si se cierra.
 */
function hojaVisitas(nombre, visitas) {
  const filas = visitas.map((v) => {
    const pila = String(v.porNombre || '').trim().split(/\s+/)[0];
    const apuntada = E.diaDeMarca(v.hechaEn);
    return {
      id: v.dia, icono: 'check', rotulo: E.fechaConDia(v.dia, { mayus: true }),
      sub: pila
        ? `${pila} la dio por hecha${apuntada ? ` el ${E.diaCorto(apuntada)}` : ''}`
        : (apuntada ? `Dada por hecha el ${E.diaCorto(apuntada)}` : 'Dada por hecha'),
    };
  });
  return menuTarjeta(`${nombre} · visitas ya hechas`, filas, {
    extra: h('span.d-menu-nota', null, visitas.length === 1
      ? 'Si se apuntó por error, tócala para quitarla. Antes de quitarla se pregunta.'
      : 'Si alguna se apuntó por error, tócala para quitarla. Antes de quitarla se pregunta.'),
  });
}

/* ─── Las dos hojas pequeñas de la entrega ─────────────────────── */
/**
 * Los compradores, a mano: «Juan y Pepe», «Familia Ortega». Resuelve
 * con el texto (vacío para borrarlos) o null si se cierra sin tocar.
 */
function hojaCompradores(actual) {
  return sheet((cerrar) => {
    const campo = h('input', { type: 'text', placeholder: 'Nombres de los compradores', autocapitalize: 'words', value: actual });
    const guardar = h('button.d-boton-negro', { onclick: () => cerrar(campo.value.trim()) }, 'Guardar');
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') cerrar(campo.value.trim()); });
    setTimeout(() => campo.focus(), 350);
    return [
      h('h2.title', null, 'Compradores'),
      h('p.hint', null, 'Como se les llama en la obra: «Juan y Pepe», «Familia Ortega».'),
      h('div.d-hoja-campo', null, campo),
      h('div.d-hoja-botones', null, guardar),
    ];
  }).then((v) => (v === undefined ? null : v));
}

/**
 * La hora de la revisión o de la firma, con el reloj del propio móvil.
 * Resuelve con «HH:MM», con vacío si se quita la hora, o null si se
 * cierra sin tocar.
 */
function hojaHora(actual, pista = 'La hora de la visita con el cliente. Se puede dejar sin hora.') {
  return sheet((cerrar) => {
    const campo = h('input', { type: 'time', value: actual || '' });
    const sinHora = h('button.d-boton-negro.claro', { onclick: () => cerrar('') }, 'Sin hora');
    const guardar = h('button.d-boton-negro', {
      onclick: () => cerrar(/^\d{2}:\d{2}$/.test(campo.value) ? campo.value : ''),
    }, 'Guardar');
    return [
      h('h2.title', null, '¿A qué hora?'),
      h('p.hint', null, pista),
      h('div.d-hoja-campo', null, campo),
      h('div.d-hoja-botones', null, sinHora, guardar),
    ];
  }).then((v) => (v === undefined ? null : v));
}
