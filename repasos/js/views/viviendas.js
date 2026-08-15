/* Tercera bolita: las viviendas de la promoción, en una columna.

   Aquí no hay fechas: una vivienda acumula tareas de inspecciones
   distintas y la fecha de cualquiera de ellas no diría nada. Lo que
   importa es cuántas tareas tiene y en qué estado están, y eso lo dice
   el color de la fila antes de leer un número. */
import { h, toast, grupoAvatares, desdeHace, diasDesde } from '../ui.js';
import { PROMOCIONES, promocion, unidades } from '../catalog.js';
import * as store from '../store.js';
import { filtroEstado, filtroOficio, cabeceraTab } from '../piezas.js';
import { ir } from '../app.js';

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

  let estado = 'todas';
  let oficioId = 'todos';
  const lista = h('div.stack.villas');
  const contador = h('p.contador');

  const pintar = () => {
    const visibles = todas.filter((u) => encaja(resumen.get(u.id), estado, oficioId));
    lista.replaceChildren(...visibles.map((u) => fila(u, resumen.get(u.id), promoId)));
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
      filtroEstado((v) => { estado = v; pintar(); }),
      filtroOficio((v) => { oficioId = v; pintar(); }),
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
 * El porcentaje cuenta SOLO lo validado. Que el jefe de obra dé algo
 * por arreglado no lo termina: lo termina que un arquitecto o la
 * propiedad lo dé por bueno. Si contara lo demás, diría que la
 * promoción va mejor de lo que va, y esa es la única mentira que esta
 * pantalla no se puede permitir.
 *
 * La barra sí lleva dos tramos, y por eso: el negro es lo validado y el
 * de marca es lo que el jefe de obra dice que está hecho y espera que
 * vayamos a mirar. Ese segundo tramo es la respuesta visual a «¿dónde
 * tengo cosas que validar?»: se ve de un vistazo, sin leer, bajando por
 * la lista.
 *
 * Tres aspectos, y se leen antes que el texto:
 *   apagada — no tiene ninguna tarea todavía
 *   viva    — le queda algo abierto o por validar
 *   hecha   — todas sus tareas están validadas
 */
function fila(u, r, promoId) {
  const total = r?.total || 0;
  const hechas = r?.hechas || 0;
  const esperando = r?.esperando || 0;
  const pct = total ? Math.round((100 * hechas) / total) : 0;
  const pctEspera = total ? Math.round((100 * esperando) / total) : 0;
  const terminada = total > 0 && hechas === total;
  const clase = !total ? 'villa apagada' : terminada ? 'villa hecha' : 'villa';

  const gente = (r?.gente || []).map((g) => store.persona(g.id, g.nombre));
  const dias = r?.movimiento ? diasDesde(r.movimiento) : NaN;
  const parada = !terminada && total > 0 && dias >= DIAS_PARADA;

  return h('button', {
    class: clase + (esperando ? ' por-validar' : ''),
    onclick: () => ir(`#/p/${promoId}/v/${u.id.split(':')[1]}`),
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
      ),
      h('div.villa-pct', null, pct + '%'),
    ),
    h('div.villa-pie', null,
      h('span', null, textoDe(total, hechas, esperando)),
      r?.movimiento
        ? h('span.villa-mov', { class: parada ? 'parada' : '' }, desdeHace(r.movimiento))
        : null,
    ),
  );
}

/**
 * Qué falta en esa casa. Delante lo que espera respuesta NUESTRA —lo
 * que el jefe de obra ha dado por arreglado y hay que ir a validar—,
 * porque es lo único de esta pantalla sobre lo que quien la mira puede
 * actuar hoy. Lo abierto depende de la constructora y va detrás.
 */
function textoDe(total, hechas, esperando) {
  if (!total) return 'Sin repasar';
  if (hechas === total) return 'Todo validado';
  const abiertas = total - hechas - esperando;
  const partes = [];
  if (esperando) partes.push(`${esperando} por validar`);
  if (abiertas) partes.push(`${abiertas} ${abiertas === 1 ? 'abierta' : 'abiertas'}`);
  return partes.join(' · ');
}

/**
 * Sin filtros se ven las cincuenta, incluidas las que no tienen nada:
 * la rejilla completa es en sí una información, dice cuánto queda de
 * promoción por pisar. En cuanto se filtra, la lista se recorta a las
 * que cumplen, y una vivienda sin tareas no cumple ninguna de las dos.
 */
function encaja(r, estado, oficioId) {
  const vacio = { total: 0, hechas: 0, pendientes: 0, esperando: 0, oficios: new Set(), oficiosAbiertos: new Set() };
  const c = r || vacio;
  if (!store.encajaEstado(c, estado)) return false;
  if (oficioId !== 'todos' && !store.oficiosSegun(c, estado).has(oficioId)) return false;
  return true;
}
