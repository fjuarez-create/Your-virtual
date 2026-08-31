/* La lista de las 50 villas, calcada del Figma del rediseño 2026.

   Arriba la misma cabecera que la home (aquí la bola activa es la
   casa), el titular grande, el conmutador Inacabadas/Finalizadas con
   la bola de filtros al lado, y una tarjeta blanca con mordisco por
   vivienda: el cuándo, las caras, el nombre, los dos chips y el
   anillo de avance asomando por la esquina.

   El porcentaje cuenta SOLO lo verificado. Que el jefe de obra dé algo
   por arreglado no lo termina: lo termina que un arquitecto o la
   propiedad lo dé por bueno. Si contara lo demás, diría que la
   promoción va mejor de lo que va, y esa es la única mentira que esta
   pantalla no se puede permitir. */
import { h, icon, toast } from '../ui.js';
import { PROMOCIONES, promocion, unidades, oficio, estado } from '../catalog.js';
import * as store from '../store.js';
import {
  cabecera, tarjetaVilla, cuandoVilla, hojaOficios, caraDeGremio,
  avisoLocal, barraSync,
} from '../piezas.js';
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

  // Los filtros vienen en la dirección, si es que se venía filtrando
  // (los banners de la home mandan aquí con el estado ya puesto).
  let { estado: filtroEstado, oficio: oficioId } = filtrosDeRuta();
  // Y el conmutador: inacabadas de serie, que es donde está el trabajo.
  let vista = 'inacabadas';

  const epigrafe = h('p.d-epigrafe');
  const lista = h('div.d-villas');
  const filtros = h('div.d-filtros', { style: { display: 'none' } });

  const terminada = (r) => (r?.total || 0) > 0 && r.hechas === r.total;

  const pintar = () => {
    // Primero el conmutador, luego los filtros de encima.
    const delConmutador = todas.filter((u) =>
      vista === 'finalizadas' ? terminada(resumen.get(u.id)) : !terminada(resumen.get(u.id)));
    const visibles = delConmutador.filter((u) => encaja(resumen.get(u.id), filtroEstado, oficioId));

    lista.replaceChildren(...visibles.map((u) => {
      const r = resumen.get(u.id) || {};
      const total = r.total || 0;
      const hechas = r.hechas || 0;
      return tarjetaVilla({
        titulo: u.nombre,
        cuando: cuandoVilla(r.movimiento),
        caras: (r.gente || []).map((g) => store.persona(g.id, g.nombre)),
        hechas,
        total,
        pct: total ? Math.round((100 * hechas) / total) : 0,
        alPinchar: () => ir(conFiltros(`#/p/${promoId}/v/${u.id.split(':')[1]}`,
          { estado: filtroEstado, oficio: oficioId })),
      });
    }));
    if (!visibles.length) {
      lista.append(h('p.d-epigrafe', { style: { color: 'var(--d-gris)', textAlign: 'center', padding: '30px 0' } },
        'Ninguna vivienda encaja aquí.'));
    }

    const n = visibles.length;
    epigrafe.textContent = vista === 'finalizadas'
      ? `${n} ${n === 1 ? 'vivienda lista' : 'viviendas listas'} para entregar`
      : `${n} ${n === 1 ? 'vivienda' : 'viviendas'} con repasos por cerrar`;

    pintarFiltros();
    conmutador.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.vista === vista ? 'true' : 'false'));
  };

  /* ─── Las píldoras de los filtros aplicados, con su única X ─── */
  const pintarFiltros = () => {
    const piezas = [];
    for (const id of oficiosElegidos(oficioId)) {
      const o = oficio(id);
      piezas.push(h('span.d-filtro-pildora', null, conCara(o), o.nombre));
    }
    if (filtroEstado && filtroEstado !== 'todas') {
      const e = estado(filtroEstado);
      piezas.push(h('span.d-filtro-pildora', null, e?.nombre || filtroEstado));
    }
    if (piezas.length) {
      piezas.push(h('button.d-filtro-quitar', {
        'aria-label': 'Quitar los filtros',
        onclick: () => { filtroEstado = 'todas'; oficioId = 'todos'; cambio(); },
      }, icon('x')));
    }
    filtros.replaceChildren(...piezas);
    filtros.style.display = piezas.length ? '' : 'none';
    aplicados.textContent = piezas.length
      ? `Has aplicado ${piezas.length - 1} ${piezas.length === 2 ? 'filtro' : 'filtros'}`
      : '';
    aplicados.style.display = piezas.length ? '' : 'none';
  };
  const conCara = (o) => {
    const cara = caraDeGremio(o, 36);
    cara.classList.add('cara');
    return cara;
  };

  const cambio = () => { anotarFiltros({ estado: filtroEstado, oficio: oficioId }); pintar(); };

  /* ─── El conmutador y la bola de filtros ─── */
  const conmutador = h('div.d-selector', null,
    h('button', { 'data-vista': 'inacabadas', onclick: () => { vista = 'inacabadas'; pintar(); } }, 'Inacabadas'),
    h('button', { 'data-vista': 'finalizadas', onclick: () => { vista = 'finalizadas'; pintar(); } }, 'Finalizadas'),
  );
  const bolaFiltros = h('button.d-bola-filtros', {
    'aria-label': 'Filtros',
    onclick: async () => {
      const elegidos = await hojaOficios(oficiosElegidos(oficioId), { multiple: true, conTodos: true });
      if (elegidos === null) return;
      oficioId = elegidos.length ? elegidos.join(',') : 'todos';
      cambio();
    },
  }, icon('cursores'));

  const aplicados = h('p.d-epigrafe', { style: { display: 'none' } });

  pintar();

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      cabecera({ seccion: 'viviendas' }),
      h('h1.d-saludo', null, 'Repasos de viviendas'),
      avisoLocal() || barraSync(),
      h('div.d-fila-selector', null, conmutador, bolaFiltros),
      aplicados,
      filtros,
      epigrafe,
      lista,
    ],
  };
}

/**
 * Con filtros, la lista se recorta a las que cumplen; una vivienda sin
 * tareas no cumple ninguno.
 */
function encaja(r, filtroEstado, oficioId) {
  const vacio = {
    total: 0, hechas: 0, pendientes: 0, esperando: 0, rechazadas: 0,
    oficios: new Set(), oficiosAbiertos: new Set(), oficiosVerificados: new Set(),
  };
  const c = r || vacio;
  if (!store.encajaEstado(c, filtroEstado)) return false;
  const elegidos = oficiosElegidos(oficioId);
  if (elegidos.length && !elegidos.some((id) => store.oficiosSegun(c, filtroEstado).has(id))) return false;
  return true;
}

/** El filtro de oficio viaja en la dirección como lista: «pladur,cocinas». */
function oficiosElegidos(oficioId) {
  return oficioId && oficioId !== 'todos' ? String(oficioId).split(',').filter(Boolean) : [];
}
