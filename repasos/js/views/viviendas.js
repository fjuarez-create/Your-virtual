/* Tercera bolita: las viviendas de la promoción, en una columna.

   Aquí no hay fechas: una vivienda acumula tareas de inspecciones
   distintas y la fecha de cualquiera de ellas no diría nada. Lo que
   importa es cuántas tareas tiene y en qué estado están, y eso lo dice
   el color de la fila antes de leer un número. */
import { h, toast, grupoAvatares, desdeHace, diasDesde } from '../ui.js';
import { PROMOCIONES, promocion, unidades } from '../catalog.js';
import * as store from '../store.js';
import { filtroEstado, filtroOficio, cabeceraTab } from '../piezas.js';
import { ir, conFiltros, filtrosDeRuta, anotarFiltros } from '../app.js';

export async function render({ promoId, desdeTab = false }) {
  if (!promoId) {
    const activas = PROMOCIONES.filter((x) => x.activa);
    if (activas.length === 1) promoId = activas[0].id;
    else { ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }
  }
  const p = promocion(promoId);
  if (!p) { toast('Promoción desconocida', 'err'); ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }

  const todas = unidades(promoId);
  const resumen = await store.resumenPorUnidad(promoId);

  // El filtro viene en la dirección, si es que se venía filtrando.
  let { estado, oficio: oficioId } = filtrosDeRuta();
  const lista = h('div.stack.villas');
  const contador = h('p.contador');

  const cambio = () => { anotarFiltros({ estado, oficio: oficioId }); pintar(); };

  const pintar = () => {
    const visibles = todas.filter((u) => encaja(resumen.get(u.id), estado, oficioId));
    lista.replaceChildren(...visibles.map((u) =>
      fila(u, resumen.get(u.id), promoId, { estado, oficio: oficioId })));
    if (!visibles.length) {
      lista.append(h('p.sub.center', { style: { padding: '30px 0' } },
        'Ninguna vivienda encaja con este filtro.'));
    }
    contador.textContent = visibles.length === todas.length
      ? `${todas.length} viviendas`
      : `${visibles.length} de ${todas.length} viviendas`;
  };
  pintar();

  return {
    tab: 'viviendas',
    contenido: [
      ...cabeceraTab('VIVIENDAS'),
      filtroEstado((v) => { estado = v; cambio(); }, estado),
      filtroOficio((v) => { oficioId = v; cambio(); }, oficioId),
      contador,
      lista,
    ],
  };
}

/* Una casa parada más de dos semanas con trabajo abierto ya no es «va
   despacio»: es que se ha caído de la lista de alguien. */
const DIAS_PARADA = 14;

/**
 * Una vivienda, en dos renglones:
 *
 *   [caras]  Villa 01  ▬▬▬▬▬▬▬▬▬▬▬▬▬  70%
 *   qué falta                    hace cuánto
 *
 * Todo en columnas fijas —las caras, el nombre y el porcentaje— para
 * que en cincuenta filas seguidas cada cosa caiga siempre en la misma
 * vertical. La barra es lo único elástico: ocupa lo que sobra.
 *
 * El porcentaje cuenta SOLO lo verificado. Que el jefe de obra dé algo
 * por arreglado no lo termina: lo termina que un arquitecto o la
 * propiedad lo dé por bueno. Si contara lo demás, diría que la
 * promoción va mejor de lo que va, y esa es la única mentira que esta
 * pantalla no se puede permitir.
 *
 * La barra lleva tres tramos, y por eso: el negro es lo verificado, el
 * de marca es lo que el jefe de obra dice que está hecho y espera que
 * vayamos a mirar, y el rojo lo que fuimos a mirar y no valía. Se leen
 * de un vistazo, sin leer una palabra, bajando por la lista.
 *
 * Tres aspectos, y se leen antes que el texto:
 *   apagada — no tiene ninguna tarea todavía
 *   viva    — le queda algo abierto o por validar
 *   hecha   — todas sus tareas están validadas
 */
function fila(u, r, promoId, filtros) {
  const total = r?.total || 0;
  const hechas = r?.hechas || 0;
  const esperando = r?.esperando || 0;
  const rechazadas = r?.rechazadas || 0;
  const pct = total ? Math.round((100 * hechas) / total) : 0;
  const pctEspera = total ? Math.round((100 * esperando) / total) : 0;
  const pctRechazo = total ? Math.round((100 * rechazadas) / total) : 0;
  const terminada = total > 0 && hechas === total;
  const clase = !total ? 'villa apagada' : terminada ? 'villa hecha' : 'villa';

  const gente = (r?.gente || []).map((g) => store.persona(g.id, g.nombre));
  const dias = r?.movimiento ? diasDesde(r.movimiento) : NaN;
  const parada = !terminada && total > 0 && dias >= DIAS_PARADA;

  return h('button', {
    class: clase + (esperando ? ' por-validar' : ''),
    onclick: () => ir(conFiltros(`#/p/${promoId}/v/${u.id.split(':')[1]}`, filtros)),
  },
    h('div.villa-cab', null,
      // Tres como mucho, y sin «+n»: quien pase de ahí se ve igualmente
      // en la cara de sus tareas dentro de la vivienda. El hueco se
      // reserva entero aunque haya una sola, para que el nombre no baile
      // de fila en fila.
      grupoAvatares(gente.slice(0, 3), { tam: 34, max: 3, hueco: 3, vacio: true }),
      h('div.villa-tit', null, u.nombre),
      h('div.villa-barra', null,
        h('i.t-validada', { style: { width: pct + '%' } }),
        h('i.t-validar', { style: { width: pctEspera + '%' } }),
        h('i.t-rechazada', { style: { width: pctRechazo + '%' } }),
      ),
      h('div.villa-pct', null, pct + '%'),
    ),
    h('div.villa-pie', null,
      h('span', null, textoDe(total, hechas, esperando, rechazadas)),
      r?.movimiento
        ? h('span.villa-mov', { class: parada ? 'parada' : '' }, desdeHace(r.movimiento))
        : null,
    ),
  );
}

/**
 * Qué falta en esa casa. Delante lo que espera respuesta NUESTRA —lo
 * que el jefe de obra ha dado por arreglado y hay que ir a verificar—,
 * porque es lo único de esta pantalla sobre lo que quien la mira puede
 * actuar hoy. Lo que depende de la constructora va detrás, y de eso
 * primero lo rechazado: una tarea que ya rebotó una vez pesa más que
 * una que nadie ha tocado todavía.
 */
function textoDe(total, hechas, esperando, rechazadas = 0) {
  if (!total) return 'Sin repasar';
  if (hechas === total) return 'Todo verificado';
  const pendientes = total - hechas - esperando - rechazadas;
  const partes = [];
  if (esperando) partes.push(`${esperando} por verificar`);
  if (rechazadas) partes.push(`${rechazadas} ${rechazadas === 1 ? 'rechazada' : 'rechazadas'}`);
  if (pendientes) partes.push(`${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}`);
  return partes.join(' · ');
}

/**
 * Sin filtros se ven las cincuenta, incluidas las que no tienen nada:
 * la rejilla completa es en sí una información, dice cuánto queda de
 * promoción por pisar. En cuanto se filtra, la lista se recorta a las
 * que cumplen, y una vivienda sin tareas no cumple ninguna de las dos.
 */
function encaja(r, estado, oficioId) {
  const vacio = {
    total: 0, hechas: 0, pendientes: 0, esperando: 0, rechazadas: 0,
    oficios: new Set(), oficiosAbiertos: new Set(),
  };
  const c = r || vacio;
  if (!store.encajaEstado(c, estado)) return false;
  if (oficioId !== 'todos' && !store.oficiosSegun(c, estado).has(oficioId)) return false;
  return true;
}
