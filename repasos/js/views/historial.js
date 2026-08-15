/* El archivo de actas de la promoción, entero y en orden.

   Ya no es una bolita: se entra desde la portada. Un acta se busca
   sabiendo de qué vivienda es —siempre—, y para eso está el pie de
   cada vivienda. Aquí se viene a otra cosa: a recorrer lo firmado de
   toda la promoción, que es una consulta de despacho y no de obra.

   Mientras solo haya una promoción activa se entra directo a la suya y
   no se pierde un toque en elegirla. En cuanto haya dos, el selector
   vuelve por su cuenta desde el catálogo. */
import { h, icon, emptyState } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, puedeCrearLista } from '../catalog.js';
import { tarjetaActa, ctaNuevaLista, filtroEstado, filtroOficio, cabeceraDentro } from '../piezas.js';
import { ir } from '../app.js';

export async function render() {
  const activas = PROMOCIONES.filter((p) => p.activa);
  const p = activas.length === 1 ? activas[0] : null;
  if (!p) { ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }

  const actas = await store.actasConDatos({ promoId: p.id });

  // Desde aquí no se sabe de qué vivienda es, así que primero hay que
  // elegirla. Dentro de una vivienda, el mismo botón la crea directamente.
  const cta = puedeCrearLista(store.sesion()) ? ctaNuevaLista(() => ir('#/viviendas')) : null;

  if (!actas.length) {
    return {
      sinTabs: true,
      contenido: [
        ...cabeceraDentro('ACTAS', { volverA: '#/', sub: p.nombre }),
        emptyState('clipboard', 'Todavía no hay actas',
          'Cuando crees la primera lista de repaso aparecerá aquí, con su fecha y quién la hizo.',
          puedeCrearLista(store.sesion())
            ? h('button.btn.ink', { onclick: () => ir('#/viviendas') }, icon('plus'), 'Nueva lista de repasos')
            : null),
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
    sinTabs: true,
    contenido: [
      ...cabeceraDentro('ACTAS', { volverA: '#/', sub: p.nombre }),
      filtroEstado((v) => { estado = v; pintar(); }),
      filtroOficio((v) => { oficioId = v; pintar(); }),
      contador,
      cta,
      lista,
    ],
  };
}

/** Los dos filtros se cruzan, con el criterio común del almacén. */
function encaja({ conteo }, estado, oficioId) {
  if (!store.encajaEstado(conteo, estado)) return false;
  if (oficioId !== 'todos' && !store.oficiosSegun(conteo, estado).has(oficioId)) return false;
  return true;
}
