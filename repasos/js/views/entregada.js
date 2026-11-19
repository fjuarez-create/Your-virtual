/* LA FICHA DE UNA VIVIENDA ENTREGADA — #/entregadas/p/<promo>/v/<nn>

   Lo que queda por hacer en una vivienda después de entregarla, y lo
   que ya se ha hecho. Aquí es donde «queda guardado el PDF dentro de la
   vivienda»: el conforme firmado de cada visita y sus repasos se ven EN
   esta ficha, sin entrar en ninguna otra pantalla.

   De arriba abajo:

     1. LA ENTREGA: cuándo se entregó y a quién; y la caja «Le falta:
        …», o la marca «Cerrada».
     2. VISITA DE REPASOS: la cita con los compradores (día y hora) y el
        botón negro de empezar la visita.
     3. PUESTAS EN MARCHA Y ARMARIOS: los cinco botones, cada uno con
        el día de su cita con el instalador.
     4. CADA VISITA, de la más reciente a la más antigua: la firmada,
        con su conforme en PDF y sus repasos; la que está en curso, con
        la fila para seguir con ella.
     5. Al pie, el recordatorio de que los repasos de antes de la
        entrega no salen aquí.

   Quién puede qué (el servidor lo vuelve a comprobar todo):
     · Verlo, todo el equipo.
     · La fecha, la hora y los cinco botones: el comercial y el
       administrador (puedePonerFechas).
     · Empezar la visita y abrir el PDF firmado: ellos dos y la
       dirección facultativa (puedeHacerVisita). Los demás ven que está
       firmado, cuándo y por quién, y la lista de repasos.
   Quien no puede algo no ve el botón.

   No hay ninguna marca a mano de «la visita se ha hecho»: una visita
   está hecha cuando tiene su conforme firmado, y entonces la cita
   queda hecha sola. Y ningún repaso lleva fecha propia: la única es la
   «Fecha orientativa de finalización» de cada conforme.

   Si la vivienda no figura como entregada (o se le ha quitado la
   marca), no hay ficha: vuelve a la lista. Sus datos no se borran. */
import { h, icon, toast, confirmar } from '../ui.js';
import * as store from '../store.js';
import {
  promocion, unidad, oficio, hecha, esperandoVisto, rebotada, puedePonerFechas, puedeHacerVisita,
} from '../catalog.js';
import { cabecera, avisoLocal, barraSync, menuTarjeta, hojaFecha } from '../piezas.js';
import { ir, refrescar } from '../app.js';
import * as E from '../entregas.js';
import { hojaFechas, hojaHora } from '../hojaEntrega.js';
import {
  FILTROS, situacionPosventa, fraseDeFalta, tarjetaDeCita, avisoDeCita, cuentaDeRepasos,
  diaDeVisita, diaDeConforme, esConforme,
} from '../posventa.js';
import { botonesPosventa, tarjetaConforme, abrirConforme } from '../piezasPosventa.js';

/** Cuántos repasos enseña la ficha de cada visita antes de «Ver los N repasos de la visita». */
const REPASOS_A_LA_VISTA = 4;

/** La pista de la hoja de la hora. */
const PISTA_HORA = 'La hora de la visita de repasos. Se puede dejar sin hora.';

/** «Carpintería · Dormitorio 2»: el oficio y la estancia de un repaso. */
function dondeDe(t) {
  return [oficio(t.oficio)?.nombre, t.zona].filter(Boolean).join(' · ');
}

/** Lo que hay que saber de un repaso que no está ni abierto ni terminado. */
function notaDeEstado(t) {
  if (esperandoVisto(t)) return 'Hecho, por dar por bueno';
  if (rebotada(t)) return 'Rechazado';
  return '';
}

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/entregadas', { reemplazar: true }); return { contenido: [] }; }

  // La lista vuelve con el filtro que tenía puesto.
  const verDeRuta = new URLSearchParams(location.hash.split('?')[1] || '').get('ver');
  const ver = FILTROS.some((f) => f.id === verDeRuta) ? verDeRuta : 'todas';
  const vuelta = `#/entregadas${ver === 'todas' ? '' : `?ver=${ver}`}`;

  const entrega = await store.entregaDeUnidad(unidadId);
  if (!entrega || !entrega.entregadaEn) {
    toast(`La ${u.nombre} no figura como entregada.`);
    ir(vuelta, { reemplazar: true });
    return { contenido: [] };
  }

  const yo = store.sesion();
  const poneFechas = puedePonerFechas(yo);
  const haceVisitas = puedeHacerVisita(yo);
  const hoy = E.hoyIso();
  const nn = String(unidadId).split(':')[1];
  const base = `#/entregadas/p/${promoId}/v/${nn}`;

  const visitas = await store.visitasDeUnidad(unidadId);
  const sueltos = await store.conformesSueltosDeUnidad(unidadId);
  const situacion = situacionPosventa({ entrega, visitas, sueltos, hoy });
  const abiertas = visitas.filter((v) => !esConforme(v.conforme));
  const firmadas = visitas.filter((v) => esConforme(v.conforme));

  const fila = (icono, texto, clase = '') => h('div.d-dia-fila', { class: clase }, icon(icono), h('span', null, texto));
  const guardar = async (accion) => {
    try { await accion(); refrescar(); } catch (err) { toast(err.message || 'No se ha podido guardar', 'err'); }
  };

  /* ═══ 1 · La entrega ═══ */
  const diaEntregada = E.diaEntregada(entrega);
  const falta = fraseDeFalta(situacion);
  const bloqueEntrega = h('div.d-dia-tarjeta.pv-entrega', null,
    fila('key', diaEntregada ? `Entregada el ${E.diaSemana(diaEntregada)} ${E.diaCorto(diaEntregada)}` : 'Entregada'),
    entrega.compradores ? fila('users', entrega.compradores) : null,
    situacion.cerrada
      ? h('div.pv-cerrada', null, h('span.d-chip.macizo.pv-chip-cerrada', null, icon('check'), 'Cerrada'))
      : h('div.pv-falta', null, h('b', null, 'Le falta: '), falta),
  );

  /* ═══ 2 · La visita de repasos: la cita y empezar ═══ */
  const cita = tarjetaDeCita(situacion);

  /** Elegir día y hora y guardar la cita. `otra` es la de otra visita. */
  const ponerFecha = async ({ otra = false } = {}) => {
    const v = await hojaFecha(null);
    if (!v) return;
    const dia = E.isoDe(new Date(v));
    // Cerrar la hoja de la hora sin elegir no tira la fecha: se guarda sin hora.
    const hh = await hojaHora('', PISTA_HORA);
    const hora = hh || '';
    await guardar(async () => {
      await store.fijarPosventa(unidadId, promoId, { dia, hora, otra });
      toast(avisoDeCita(dia, hora), '', { icono: 'calendario' });
    });
  };
  const cambiarFecha = async () => {
    const v = await hojaFecha(E.partes(entrega.posventa).fecha.toISOString());
    if (v === null) return;
    const dia = v ? E.isoDe(new Date(v)) : '';
    if (dia === entrega.posventa) return;
    await guardar(async () => {
      await store.fijarPosventa(unidadId, promoId, { dia, hora: dia ? (entrega.posventaHora || '') : '' });
      toast(avisoDeCita(dia, dia ? (entrega.posventaHora || '') : ''), '', { icono: 'calendario' });
    });
  };
  const cambiarHora = async () => {
    const hh = await hojaHora(entrega.posventaHora || '', PISTA_HORA);
    // Cerrar la hoja tocando fuera no devuelve una hora (ni siquiera
    // vacía): no se toca nada. Quitar la hora es pulsar «Sin hora».
    if (hh == null || hh === (entrega.posventaHora || '')) return;
    await guardar(async () => {
      await store.fijarPosventa(unidadId, promoId, { dia: entrega.posventa, hora: hh });
      toast(avisoDeCita(entrega.posventa, hh), '', { icono: 'reloj' });
    });
  };
  const menuDeCita = async () => {
    const elegido = await menuTarjeta('Visita de repasos', [
      { id: 'fecha', icono: 'calendario', rotulo: 'Cambiar la fecha',
        sub: `${E.fechaConDia(entrega.posventa, { mayus: true })}. Desde el calendario también se puede quitar` },
      { id: 'hora', icono: 'reloj', rotulo: 'Cambiar la hora', sub: entrega.posventaHora || 'Sin hora' },
    ]);
    if (elegido === 'fecha') await cambiarFecha();
    if (elegido === 'hora') await cambiarHora();
  };
  const otraFecha = async () => {
    const ultima = firmadas.length ? diaDeConforme(firmadas[firmadas.length - 1].conforme) : '';
    const seguro = await confirmar({
      titulo: '¿Poner fecha a otra visita?',
      texto: `La visita${ultima ? ` del ${E.fechaConDia(ultima)}` : ''} ya está hecha y firmada. La fecha nueva será la de otra visita, por hacer.`,
      ok: 'Poner otra fecha', icono: 'calendario', conservar: 'Dejarlo como está', iconoConservar: 'check',
    });
    if (seguro) await ponerFecha({ otra: true });
  };

  /* Empezar, seguir o empezar otra. */
  const abrirVisita = (listaId) => ir(`${base}/visita/${listaId}`);
  let empezando = false;
  const empezar = async () => {
    if (empezando) return;
    empezando = true;
    try {
      if (firmadas.length || sueltos.length) {
        const seguro = await confirmar({
          titulo: '¿Empezar otra visita?',
          texto: 'Esta vivienda ya tiene una visita con su conforme firmado. La nueva tendrá su propia lista de repasos y su propio conforme.',
          ok: 'Empezar otra', icono: 'camera', conservar: 'Todavía no', iconoConservar: 'clock',
        });
        if (!seguro) return;
      }
      const lista = await store.empezarVisita(unidadId, promoId);
      abrirVisita(lista.id);
    } catch (err) {
      toast(err.message || 'No se ha podido empezar la visita', 'err');
    } finally {
      empezando = false;
    }
  };
  const botonVisita = !haceVisitas ? null
    : abiertas.length
      ? h('button.d-boton-negro.pv-boton-visita', {
          type: 'button', 'data-accion': 'seguir',
          onclick: () => abrirVisita(abiertas[abiertas.length - 1].lista.id),
        }, icon('camera'), 'Seguir con la visita')
      : h('button.d-boton-negro.pv-boton-visita', { type: 'button', 'data-accion': 'empezar', onclick: empezar },
          icon('camera'), firmadas.length || sueltos.length ? 'Empezar otra visita' : 'Empezar la visita');

  const botonFecha = !poneFechas || cita.caso === 'cita' || cita.caso === 'en-curso' ? null
    : h('button.d-cal-poner.pv-poner-fecha', {
        type: 'button', 'data-accion': cita.caso === 'hecha' ? 'otra-fecha' : 'poner-fecha',
        onclick: () => (cita.caso === 'hecha' ? otraFecha() : ponerFecha()),
      }, icon('calendario'), h('span', null, cita.caso === 'hecha' ? 'Poner fecha a otra visita' : 'Poner fecha a la visita'));

  const bloqueVisita = h('div.d-dia-tarjeta.pv-visita', { 'data-caso': cita.caso },
    h('div.pv-cita', null,
      h('div.pv-cita-texto', null,
        h('div.pv-cita-rotulo', { class: cita.dia ? '' : 'solo' }, cita.rotulo),
        cita.dia ? h('div.pv-cita-dia', null, cita.dia) : null,
      ),
      poneFechas && cita.caso === 'cita'
        ? h('button.d-dia-bola.fechas', { type: 'button', 'aria-label': 'Cambiar la fecha y la hora', onclick: menuDeCita }, icon('calendario'))
        : null,
    ),
    botonFecha,
    botonVisita,
  );

  /* ═══ 3 · Los cinco botones ═══ */
  const bloqueBotones = h('div.d-dia-tarjeta.pv-tarjeta-lista', null,
    botonesPosventa(entrega, { puede: poneFechas, alCambiar: refrescar, forma: 'lista' }));

  /* ═══ 4 · Cada visita, de la más reciente a la más antigua ═══ */
  const filaRepaso = (v, t) => h('button.pv-repaso', {
    type: 'button', class: hecha(t) ? 'hecho' : '', 'data-repaso': t.id,
    onclick: () => ir(`#/l/${v.lista.id}/t/${t.id}`),
  },
    h('span.pv-repaso-bola', null, hecha(t) ? icon('check') : null),
    h('span.pv-repaso-texto', null,
      h('span', null, t.texto || 'Repaso sin descripción'),
      dondeDe(t) ? h('span.pv-repaso-sub', null, dondeDe(t)) : null,
      notaDeEstado(t) ? h('span.pv-repaso-nota', { class: rebotada(t) ? 'rojo' : '' }, notaDeEstado(t)) : null,
    ),
  );
  const epigrafe = (texto, chip) => h('p.d-epigrafe.pv-epigrafe', null, h('span', null, texto), chip);

  const bloqueDeVisita = (v) => {
    const dia = diaDeVisita(v);
    const titulo = dia ? `Visita del ${E.diaCorto(dia)}` : 'Visita de repasos';
    const n = v.repasos.length;
    if (!esConforme(v.conforme)) {
      return [
        epigrafe(titulo, h('span.d-chip.pv-chip-curso', null, icon('camera'), 'En curso')),
        h('div.d-dia-tarjeta.pv-visita-abierta', { 'data-visita': v.lista.id },
          h('div.pv-repasos-cab', null, h('span', null, n === 0 ? 'Todavía no hay ningún repaso apuntado'
            : n === 1 ? '1 repaso apuntado' : `${n} repasos apuntados`)),
          h('button.pv-ver-todos', { type: 'button', onclick: () => abrirVisita(v.lista.id) },
            h('span', null, haceVisitas ? 'Seguir con la visita' : 'Ver los repasos'), icon('chevron')),
        ),
      ];
    }
    const terminados = v.repasos.filter(hecha).length;
    const orientativa = v.conforme.datos?.fechaOrientativa;
    // Primero los que siguen abiertos; los terminados, al final.
    const aLaVista = [...v.repasos.filter((t) => !hecha(t)), ...v.repasos.filter(hecha)].slice(0, REPASOS_A_LA_VISTA);
    return [
      epigrafe(titulo, h('span.d-chip.verde', null, icon('check'), 'Hecha y firmada')),
      tarjetaConforme(v.conforme, { puede: haceVisitas }),
      h('div.d-dia-tarjeta.pv-visita-firmada', { 'data-visita': v.lista.id },
        h('div.pv-repasos-cab', null,
          h('span', null, 'Repasos de la visita'),
          n ? h('span', null, cuentaDeRepasos(terminados, n)) : null),
        n && E.esDia(orientativa)
          ? h('div.pv-orientativa', null, icon('calendario'),
              h('span', null, 'Fecha orientativa de finalización', h('b', null, E.fechaLarga(orientativa, { conAno: true }))))
          : null,
        n ? aLaVista.map((t) => filaRepaso(v, t))
          : h('p.pv-sin-repasos', null, 'En la visita no se anotó ningún repaso.'),
        n ? h('button.pv-ver-todos', { type: 'button', onclick: () => abrirVisita(v.lista.id) },
          h('span', null, n === 1 ? 'Ver el repaso de la visita' : `Ver los ${n} repasos de la visita`), icon('chevron')) : null,
      ),
    ];
  };

  /* Un conforme firmado en este móvil y sin subir cuya visita no está
     viva aquí (la borraron en otro móvil): no puede dejar de verse. */
  const bloqueSuelto = (c) => h('div.d-dia-tarjeta.pv-suelto', { 'data-conforme': c.id },
    fila('documento', 'Conforme firmado · pendiente de subir'),
    h('button.pv-ver-todos', { type: 'button', onclick: () => abrirConforme(c) },
      h('span', null, 'Compartir el PDF'), icon('share')),
  );

  /* ═══ El menú «···» ═══ */
  const menu = async () => {
    const elegido = await menuTarjeta(u.nombre, [
      { id: 'antes', icono: 'casa', rotulo: 'Repasos de antes de la entrega', sub: 'La ficha de siempre, en Viviendas' },
      poneFechas ? { id: 'fechas', icono: 'calendario', rotulo: 'Fechas de la entrega', sub: 'Compradores, firma y la marca de entregada' } : null,
    ]);
    if (elegido === 'antes') ir(`#/p/${promoId}/v/${nn}`);
    if (elegido === 'fechas') hojaFechas({ unidadId, promoId, nombre: u.nombre, entrega, alCambiar: refrescar });
  };

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      cabecera({ volver: () => ir(vuelta), titulo: u.nombre, menu }),
      avisoLocal() || barraSync(),
      bloqueEntrega,
      h('p.d-epigrafe.pv-epigrafe', null, h('span', null, 'Visita de repasos')),
      bloqueVisita,
      h('p.d-epigrafe.pv-epigrafe', null, h('span', null, 'Puestas en marcha y armarios')),
      bloqueBotones,
      ...sueltos.map(bloqueSuelto),
      ...[...visitas].reverse().flatMap(bloqueDeVisita),
      h('p.pv-aviso-antes', null, 'Los repasos de antes de la entrega no salen aquí: siguen en Viviendas.'),
    ],
  };
}
