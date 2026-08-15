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
      ...cabeceraTab('VVDAS.'),
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
 * Una vivienda. Arriba, quién ha trabajado aquí y el porcentaje; en
 * medio, la barra; abajo, qué queda y desde cuándo no se toca.
 *
 * El porcentaje cuenta SOLO lo verificado. Que la subcontrata dé algo
 * por resuelto no lo termina: lo termina que un arquitecto lo dé por
 * bueno. Si la barra contara los «resuelta», diría que la promoción va
 * mejor de lo que va, que es la única mentira que esta pantalla no se
 * puede permitir.
 *
 * Tres aspectos, y se leen antes que el texto:
 *   apagada — no tiene ninguna tarea todavía
 *   viva    — le queda algo por verificar
 *   hecha   — todas sus tareas están verificadas
 */
function fila(u, r, promoId) {
  const total = r?.total || 0;
  const hechas = r?.hechas || 0;
  const pct = total ? Math.round((100 * hechas) / total) : 0;
  const terminada = total > 0 && hechas === total;
  const clase = !total ? 'villa apagada' : terminada ? 'villa hecha' : 'villa';

  const gente = (r?.gente || []).map((g) => store.persona(g.id, g.nombre));
  const dias = r?.movimiento ? diasDesde(r.movimiento) : NaN;
  const parada = !terminada && total > 0 && dias >= DIAS_PARADA;

  return h('button', {
    class: clase,
    onclick: () => ir(`#/p/${promoId}/v/${u.id.split(':')[1]}`),
  },
    h('div.villa-cab', null,
      // El hueco se reserva siempre, haya gente o no: son cincuenta
      // filas seguidas y los nombres tienen que caer en la misma
      // vertical para poder recorrerlos de un vistazo.
      // Hueco para cinco piezas: cuatro caras y el «+n». Es lo más ancho
      // que puede llegar a ser la pila, así que reservándolo el nombre
      // no se mueve nunca.
      grupoAvatares(gente, { tam: 34, max: 4, hueco: 5 }),
      h('div.villa-tit', null, u.nombre),
      h('div.villa-pct', null, pct + '%'),
    ),
    h('div.villa-barra', null, h('i', { style: { width: pct + '%' } })),
    h('div.villa-pie', null,
      h('span', null, textoDe(total, hechas, r?.esperando || 0)),
      r?.movimiento
        ? h('span.villa-mov', { class: parada ? 'parada' : '' }, desdeHace(r.movimiento))
        : null,
    ),
  );
}

/**
 * Lo que queda, partido en las dos colas que se atascan por motivos
 * distintos: lo que nadie ha arreglado todavía y lo que está arreglado
 * esperando que alguien vaya a darlo por bueno.
 */
function textoDe(total, hechas, esperando) {
  if (!total) return 'Sin repasar todavía';
  if (hechas === total) return 'Todo verificado';
  const porResolver = total - hechas - esperando;
  const partes = [];
  if (porResolver) partes.push(`${porResolver} por resolver`);
  if (esperando) partes.push(`${esperando} por verificar`);
  return partes.join(' · ');
}

/**
 * Sin filtros se ven las cincuenta, incluidas las que no tienen nada:
 * la rejilla completa es en sí una información, dice cuánto queda de
 * promoción por pisar. En cuanto se filtra, la lista se recorta a las
 * que cumplen, y una vivienda sin tareas no cumple ninguna de las dos.
 */
function encaja(r, estado, oficioId) {
  const total = r?.total || 0;
  const terminada = total > 0 && r.hechas === total;
  if (estado === 'pendientes' && (!total || terminada)) return false;
  if (estado === 'terminadas' && !terminada) return false;
  if (oficioId !== 'todos') {
    if (!total) return false;
    const donde = estado === 'pendientes' ? r.oficiosAbiertos : r.oficios;
    if (!donde.has(oficioId)) return false;
  }
  return true;
}
