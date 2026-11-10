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
   administrador, y se puede deshacer. */
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
  const hecha = E.revisionHecha(e);
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
          sub: `Revisión hecha el ${E.fechaLarga(E.isoDe(new Date(e.revisadaEn)))}` }
      : { id: 'hecha', icono: 'check', rotulo: 'La revisión se ha hecho', sub: 'Abre el parte post-entrega' },
    hecha ? { id: 'deshacer', icono: 'x', rotulo: 'La revisión no se ha hecho', sub: 'Quita la marca; los partes se quedan' } : null,
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
      await store.fijarEntrega(unidadId, promoId, { revision: dia, revisionHora: dia ? horaNueva : '' });
      toast(dia ? `Revisión el ${E.fechaConDia(dia)}${horaNueva ? ` a las ${horaNueva}` : ''}` : 'Revisión sin fecha', '', { icono: 'calendario' });
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
      // Una cita prevista para más adelante que se da por hecha hoy
      // es una visita que se adelantó: queda con fecha de hoy. Se dice
      // antes, porque deshacerlo después no devuelve la fecha que tenía.
      const adelantada = E.esDia(e.revision) && e.revision > E.hoyIso();
      const seguro = await confirmar({
        titulo: '¿La revisión con el cliente se ha hecho?',
        texto: (adelantada
          ? `Estaba prevista para el ${E.fechaConDia(e.revision)}${e.revisionHora ? ` a las ${e.revisionHora}` : ''}: quedará apuntada con fecha de hoy. `
          : '') + 'Se abre el parte post-entrega para apuntar lo que haya visto el comprador, y al equipo le llega un aviso.',
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
      const seguro = await confirmar({
        titulo: `¿Quitar la marca de revisión hecha de la ${nombre}?`,
        texto: 'La revisión con el cliente vuelve a estar pendiente, con la fecha que tiene ahora puesta. Los partes que haya abiertos se quedan.',
        ok: 'Sí, quitarla', icono: 'x', conservar: 'Dejarla como está', iconoConservar: 'check',
      });
      if (!seguro) return;
      await store.deshacerRevisionHecha(unidadId, promoId);
      toast('La revisión vuelve a estar pendiente');
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
