/* El archivo de actas de la promoción, entero y en orden.

   Misma cabecera que Inicio y Viviendas —la cara a la izquierda y la
   cápsula de bolitas a la derecha, con la suya encendida—, el titular
   en el mismo sitio, y el filtro de una sola fila: el desplegable con
   el estado a la izquierda y la bola del embudo a la derecha para los
   oficios. Antes esto eran cinco chips y un selector aparte, que
   ocupaban media pantalla antes de enseñar la primera acta.

   Un acta se busca casi siempre sabiendo de qué vivienda es, y para eso
   está el pie de cada vivienda. Aquí se viene a otra cosa: a recorrer
   lo firmado de toda la promoción, que es consulta de despacho y no de
   obra.

   Mientras solo haya una promoción activa se entra directo a la suya y
   no se pierde un toque en elegirla. En cuanto haya dos, el selector
   vuelve por su cuenta desde el catálogo. */
import { h, icon, emptyState } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, ESTADOS, estado, oficio, puedeCrearLista } from '../catalog.js';
import {
  tarjetaActa, ctaNuevaLista, cabDiseno, menuFlotante, filaMenu, hojaOficios,
  avisoLocal, barraSync,
} from '../piezas.js';
import { ir, filtrosDeRuta, anotarFiltros } from '../app.js';

/* «Todas» delante, y detrás los cuatro estados de siempre. */
const VISTAS = [{ id: 'todas', rotulo: 'Todas' },
  ...ESTADOS.map((e) => ({ id: e.id, rotulo: e.plural }))];

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
      clase: 'pantalla-diseno',
      contenido: [
        cabDiseno('listas'),
        h('h1.d-saludo', null, 'Actas'),
        emptyState('clipboard', 'Todavía no hay actas',
          'Cuando crees la primera lista de repaso aparecerá aquí, con su fecha y quién la hizo.',
          puedeCrearLista(store.sesion())
            ? h('button.btn.ink', { onclick: () => ir('#/viviendas') }, icon('plus'), 'Nueva lista de repasos')
            : null),
      ],
    };
  }

  let { estado: vista, oficio: oficioId } = filtrosDeRuta();
  if (!VISTAS.some((v) => v.id === vista)) vista = 'todas';

  const lista = h('div.stack.actas');
  const contador = h('p.d-epigrafe');
  const filtros = h('div.d-filtros-tareas');
  const cuantos = h('p.d-cuantos-filtros');

  /* ─── El desplegable del estado y la bola de los oficios ─── */
  const selector = h('button.d-selector-estado', {
    onclick: () => menuFlotante((cerrar) => VISTAS.map((v) => filaMenu(
      v.id === vista ? 'check' : 'listaChecks',
      `${v.rotulo} (${cuantasHay(actas, v.id, oficioId)})`,
      () => { cerrar(); vista = v.id; cambio(); },
    )), { conX: true }),
  }, h('span'), icon('caretAbajo'));

  const bolaFiltros = h('button.d-bola-embudo', {
    'aria-label': 'Filtrar por oficio',
    onclick: async () => {
      const elegidos = await hojaOficios(oficiosElegidos(oficioId), { multiple: true, conTodos: true });
      if (elegidos === null) return;
      oficioId = elegidos.length ? elegidos.join(',') : 'todos';
      cambio();
    },
  }, icon('cursores'));

  const pintar = () => {
    const visibles = actas.filter((a) => encaja(a, vista, oficioId));
    lista.replaceChildren(...visibles.map((a) =>
      tarjetaActa(a, { filtros: { estado: vista, oficio: oficioId } })));
    if (!visibles.length) {
      lista.append(h('p.sub.center', { style: { padding: '30px 0' } },
        'Ninguna acta encaja con este filtro.'));
    }

    selector.querySelector('span').textContent =
      `${VISTAS.find((v) => v.id === vista).rotulo} (${visibles.length})`;
    contador.textContent = visibles.length === actas.length
      ? `${actas.length} ${actas.length === 1 ? 'acta' : 'actas'}`
      : `${visibles.length} de ${actas.length} actas`;

    // Las pastillas de lo que hay puesto, con su única X. Los oficios
    // viven ahora dentro de la bola, así que sin esto no habría manera
    // de saber que hay un filtro puesto sin abrirla.
    const piezas = [];
    if (vista !== 'todas') piezas.push(h('span.pastilla', null, estado(vista).plural));
    for (const id of oficiosElegidos(oficioId)) piezas.push(h('span.pastilla', null, oficio(id).nombre));
    if (piezas.length) {
      piezas.push(h('button.quitar', {
        'aria-label': 'Quitar los filtros',
        onclick: () => { vista = 'todas'; oficioId = 'todos'; cambio(); },
      }, icon('x')));
    }
    filtros.replaceChildren(...piezas);
    filtros.style.display = piezas.length ? '' : 'none';
    const n = piezas.length - 1;
    cuantos.textContent = piezas.length ? `Has aplicado ${n} ${n === 1 ? 'filtro' : 'filtros'}` : '';
    cuantos.style.display = piezas.length ? '' : 'none';
  };
  const cambio = () => { anotarFiltros({ estado: vista, oficio: oficioId }); pintar(); };
  pintar();

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      cabDiseno('listas'),
      h('h1.d-saludo', null, 'Actas'),
      avisoLocal() || barraSync(),
      h('div.d-fila-filtro', null, selector, bolaFiltros),
      filtros,
      cuantos,
      contador,
      cta,
      lista,
    ],
  };
}

/** Cuántas actas quedarían en cada opción del desplegable. */
function cuantasHay(actas, vista, oficioId) {
  return actas.filter((a) => encaja(a, vista, oficioId)).length;
}

/** El filtro de oficio viaja en la dirección como lista: «pladur,cocinas». */
function oficiosElegidos(oficioId) {
  return oficioId && oficioId !== 'todos' ? String(oficioId).split(',').filter(Boolean) : [];
}

/**
 * Los dos filtros se cruzan, con el criterio común del almacén salvo en
 * «Verificadas», que aquí es más estricto: un acta verificada es la que
 * lo está ENTERA. Una vivienda es un sitio donde uno busca dónde ir, y
 * le vale con que haya algo verificado; un acta es un documento, y o
 * está cerrada o no lo está. Además esta opción es la única forma que
 * hay en esta pantalla de encontrar las actas ya firmadas del todo: las
 * viviendas tienen para eso el conmutador «Finalizadas», y las actas no
 * tienen conmutador ninguno.
 */
function encaja({ conteo }, vista, oficioId) {
  if (vista === 'verificada') {
    if (!store.actaTerminada(conteo)) return false;
  } else if (!store.encajaEstado(conteo, vista)) return false;
  const elegidos = oficiosElegidos(oficioId);
  if (elegidos.length && !elegidos.some((id) => store.oficiosSegun(conteo, vista).has(id))) return false;
  return true;
}
