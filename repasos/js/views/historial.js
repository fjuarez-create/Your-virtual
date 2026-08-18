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
import { ir, filtrosDeRuta, anotarFiltros } from '../app.js';

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

  let { estado, oficio: oficioId } = filtrosDeRuta();
  const lista = h('div.stack.actas');
  const contador = h('p.contador');

  const pintar = () => {
    const visibles = actas.filter((a) => encaja(a, estado, oficioId));
    lista.replaceChildren(...visibles.map((a) =>
      tarjetaActa(a, { filtros: { estado, oficio: oficioId } })));
    if (!visibles.length) {
      lista.append(h('p.sub.center', { style: { padding: '30px 0' } },
        'Ninguna acta encaja con este filtro.'));
    }
    contador.textContent = visibles.length === actas.length
      ? `${actas.length} ${actas.length === 1 ? 'acta' : 'actas'}`
      : `${visibles.length} de ${actas.length} actas`;
  };
  const cambio = () => { anotarFiltros({ estado, oficio: oficioId }); pintar(); };
  pintar();

  return {
    sinTabs: true,
    contenido: [
      ...cabeceraDentro('ACTAS', { volverA: '#/', sub: p.nombre }),
      filtroEstado((v) => { estado = v; cambio(); }, estado),
      filtroOficio((v) => { oficioId = v; cambio(); }, oficioId),
      contador,
      cta,
      lista,
    ],
  };
}

/**
 * Los dos filtros se cruzan, con el criterio común del almacén salvo en
 * «Verificadas», que aquí es más estricto: un acta verificada es la que
 * lo está ENTERA. Una vivienda es un sitio donde uno busca dónde ir, y
 * le vale con que haya algo verificado; un acta es un documento, y o
 * está cerrada o no lo está. Además este chip es la única forma que hay
 * en esta pantalla de encontrar las actas ya firmadas del todo: las
 * viviendas tienen para eso el conmutador «Finalizadas», y las actas no
 * tienen conmutador ninguno.
 */
function encaja({ conteo }, estado, oficioId) {
  if (estado === 'verificada') {
    if (!store.actaTerminada(conteo)) return false;
  } else if (!store.encajaEstado(conteo, estado)) return false;
  if (oficioId !== 'todos' && !store.oficiosSegun(conteo, estado).has(oficioId)) return false;
  return true;
}
