/* Tercera bolita: las viviendas de la promoción, en una columna.

   Aquí no hay fechas: una vivienda acumula tareas de inspecciones
   distintas y la fecha de cualquiera de ellas no diría nada. Lo que
   importa es cuántas tareas tiene y en qué estado están, y eso lo dice
   el color de la fila antes de leer un número. */
import { h, icon, toast, anillo } from '../ui.js';
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

/**
 * Una vivienda. Tres aspectos, y se leen antes que el texto:
 *   apagada — no tiene ninguna tarea todavía
 *   viva    — le queda algo por verificar
 *   hecha   — todas sus tareas están verificadas
 */
function fila(u, r, promoId) {
  const total = r?.total || 0;
  const hechas = r?.hechas || 0;
  const terminada = total > 0 && hechas === total;
  const clase = !total ? 'villa apagada' : terminada ? 'villa hecha' : 'villa';

  return h('button', {
    class: clase,
    onclick: () => ir(`#/p/${promoId}/v/${u.id.split(':')[1]}`),
  },
    h('span.villa-n', null, u.corto),
    h('div.grow', null,
      h('div.villa-tit', null, u.nombre),
      h('div.villa-sub', null, textoDe(total, hechas, r?.esperando || 0)),
    ),
    total
      ? (terminada
          ? h('span.villa-ok', null, icon('check', 16))
          : anillo(Math.round((100 * hechas) / total), { tam: 42 }))
      : null,
  );
}

function textoDe(total, hechas, esperando) {
  if (!total) return 'Sin tareas';
  if (hechas === total) return `${total} ${total === 1 ? 'tarea' : 'tareas'} · terminada`;
  const quedan = total - hechas;
  return esperando
    ? `${quedan} por verificar · ${esperando} ${esperando === 1 ? 'resuelta' : 'resueltas'}`
    : `${quedan} de ${total} por verificar`;
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
