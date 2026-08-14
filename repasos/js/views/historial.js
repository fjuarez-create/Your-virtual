/* Segunda bolita: las actas de la promoción.

   Mientras solo haya una promoción activa se entra directo a la suya y
   no se pierde un toque en elegirla. En cuanto haya dos, el selector
   vuelve por su cuenta desde el catálogo. */
import { h, icon, emptyState } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES } from '../catalog.js';
import { tarjetaActa, filtroEstado, filtroOficio, cabeceraTab } from '../piezas.js';
import { ir } from '../app.js';

export async function render() {
  const activas = PROMOCIONES.filter((p) => p.activa);
  const p = activas.length === 1 ? activas[0] : null;
  if (!p) { ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }

  const actas = await store.actasConDatos({ promoId: p.id });

  const cta = h('button.cta-negro', { onclick: () => ir('#/viviendas') },
    h('span.grow', null, 'NUEVA LISTA DE REPASOS'),
    h('span.cta-mas', null, icon('plus', 18)),
  );

  if (!actas.length) {
    return {
      tab: 'listas',
      contenido: [
        ...cabeceraTab('ACTAS'),
        emptyState('clipboard', 'Todavía no hay actas',
          'Cuando crees la primera lista de repaso aparecerá aquí, con su fecha y quién la hizo.',
          h('button.btn.ink', { onclick: () => ir('#/viviendas') }, icon('plus'), 'Nueva lista de repasos')),
      ],
    };
  }

  let estado = 'todas';
  let oficioId = 'todos';
  const lista = h('div.stack.actas');
  const contador = h('p.contador');

  const pintar = () => {
    const visibles = actas.filter((a) => encaja(a, estado, oficioId));
    lista.replaceChildren(...visibles.map((a) => tarjetaActa(a)));
    if (!visibles.length) {
      lista.append(h('p.sub.center', { style: { padding: '30px 0' } },
        'Ninguna acta encaja con este filtro.'));
    }
    contador.textContent = visibles.length === actas.length
      ? `${actas.length} ${actas.length === 1 ? 'acta' : 'actas'}`
      : `${visibles.length} de ${actas.length} actas`;
  };
  pintar();

  return {
    tab: 'listas',
    fab: null,
    contenido: [
      ...cabeceraTab('ACTAS'),
      filtroEstado((v) => { estado = v; pintar(); }),
      filtroOficio((v) => { oficioId = v; pintar(); }),
      contador,
      cta,
      lista,
    ],
  };
}

/**
 * Los dos filtros se cruzan: «pendientes» + «pintura» deja solo las
 * actas que tienen algo de pintura sin verificar. Por eso el conteo
 * guarda los oficios de las tareas que aún no están hechas y no los de
 * todas: si no, un acta terminada de pintura seguiría saliendo al
 * buscar pintura pendiente.
 */
function encaja({ conteo }, estado, oficioId) {
  const terminada = conteo.total > 0 && conteo.hechas === conteo.total;
  if (estado === 'pendientes' && (terminada || conteo.total === 0)) return false;
  if (estado === 'terminadas' && !terminada) return false;
  if (oficioId !== 'todos') {
    // Con «pendientes» se mira solo lo que queda abierto; en los demás
    // casos, todo lo que haya pasado por el acta.
    const donde = estado === 'pendientes' ? conteo.oficiosAbiertos : conteo.oficios;
    if (!donde.has(oficioId)) return false;
  }
  return true;
}
