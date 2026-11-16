/* LA VISITA DE REPASOS — #/entregadas/p/<promo>/v/<nn>/visita/<listaId>

   EN CONSTRUCCIÓN. Este módulo es solo el hueco: deja puesta la
   dirección a la que lleva la ficha de una vivienda entregada
   («Empezar la visita», «Seguir con la visita», «Ver los N repasos de
   la visita») para que la app arranque entera. La pantalla de verdad
   —apuntar foto a foto, finalizar, el documento, la firma con el dedo
   y, una vez firmada, el PDF con su lista de repasos— se escribe
   encima de este fichero, con esta misma dirección y estos mismos
   parámetros.

   Lo que recibe: { promoId, unidadId, listaId }. La lista es una de
   fase 'visita' (esListaDeVisita, en js/catalog.js). Si no existe, está
   borrada o no es de visita, vuelve a la ficha de la vivienda. */
import { h } from '../ui.js';
import * as store from '../store.js';
import { unidad, esListaDeVisita } from '../catalog.js';
import { cabecera, avisoLocal, barraSync } from '../piezas.js';
import { ir } from '../app.js';

export async function render({ promoId, unidadId, listaId }) {
  const nn = String(unidadId).split(':')[1];
  const ficha = `#/entregadas/p/${promoId}/v/${nn}`;
  const lista = await store.lista(listaId);
  if (!lista || !esListaDeVisita(lista) || lista.unidadId !== unidadId) {
    ir(ficha, { reemplazar: true });
    return { contenido: [] };
  }
  const u = unidad(unidadId);
  const repasos = await store.tareasDeLista(listaId);
  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      cabecera({ volver: () => ir(ficha), titulo: 'Visita de repasos' }),
      avisoLocal() || barraSync(),
      h('div.d-dia-tarjeta.pv-en-construccion', null,
        h('p.pv-vacio-titulo', null, 'Esta pantalla está en construcción.'),
        h('p.pv-vacio-sub', null, `${u?.nombre || 'La vivienda'} · ${repasos.length === 1 ? '1 repaso apuntado' : `${repasos.length} repasos apuntados`} en esta visita.`),
      ),
    ],
  };
}
