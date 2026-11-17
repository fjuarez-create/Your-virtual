/* ENTREGADAS — las viviendas ya entregadas (noviembre de 2026).

   Una sección más de la app, al nivel de Inicio / Obra / Viviendas /
   Partes / Entregas: entra por la sexta bola de la cabecera, la del
   apretón de manos. La ve todo el equipo.

   Aquí salen SOLO las viviendas que figuran como entregadas (lo han
   apuntado el comercial o el administrador en la hoja de fechas; una
   firma con la fecha pasada y sin esa marca no sale). De cada una, una
   tarjeta con lo que queda por hacer después de entregarla:

     · la VISITA DE REPASOS con los compradores (su fecha y su hora, o
       que ya está hecha y con el conforme firmado);
     · los REPASOS DE LA VISITA, «5 de 8 terminados» (terminado es
       verificado: que la obra lo dé por hecho no basta);
     · los CUATRO BOTONES —piscina, climatización, domótica y
       armarios—, cada uno con el día de su cita con el instalador;
     · y la caja «Le falta: …», o la marca «Cerrada» cuando no le falta
       nada. «Cerrada» no la pone nadie: se calcula (js/posventa.js).

   Arriba, tres filtros: «Todas», «Con algo pendiente» y «Cerradas». El
   elegido viaja en la dirección (#/entregadas?ver=pendientes), así que
   sobrevive a recargar y a entrar y salir de una ficha.

   Tocar una tarjeta abre la ficha de esa vivienda (views/entregada.js).
   Los botones también se pulsan desde aquí (quien pone fechas), y
   nunca guardan con un toque suelto: abren su hoja. */
import { h, icon } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, unidad, puedePonerFechas } from '../catalog.js';
import { cabecera, avisoLocal, barraSync } from '../piezas.js';
import { ir, anotarRuta, refrescar } from '../app.js';
import * as E from '../entregas.js';
import {
  FILTROS, situacionPosventa, ordenarEntregadas, filtrarEntregadas, cuentaDeEntregadas,
  renglonDeVisita, renglonDeRepasos, fraseDeFalta, compradoresCortos,
} from '../posventa.js';
import { botonesPosventa } from '../piezasPosventa.js';

/** Lo que dice la dirección: #/entregadas?ver=pendientes. Un valor raro, o ninguno, es «Todas». */
function leerRuta() {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  return FILTROS.some((f) => f.id === p.get('ver')) ? p.get('ver') : 'todas';
}

const VACIOS = {
  pendientes: 'No hay ninguna con algo pendiente.',
  cerradas: 'Todavía no hay ninguna cerrada.',
};

export async function render() {
  const p = PROMOCIONES.find((x) => x.activa) || null;
  if (!p) { ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }

  const hoy = E.hoyIso();
  const poneFechas = puedePonerFechas(store.sesion());
  const fichas = ordenarEntregadas(
    [...(await store.posventaDePromo(p.id)).values()].map((f) => ({
      ...f,
      situacion: situacionPosventa({ entrega: f.entrega, visitas: f.visitas, sueltos: f.sueltos, hoy }),
    })),
  );

  let ver = leerRuta();

  /* ─── Una tarjeta por vivienda ─── */
  const fila = (icono, texto, clase = '') => h('div.d-dia-fila', { class: clase }, icon(icono), h('span', null, texto));
  const tarjeta = ({ entrega, situacion }) => {
    const u = unidad(entrega.unidadId);
    const nombre = u?.nombre || entrega.unidadId;
    const nn = String(entrega.unidadId).split(':')[1];
    const abrir = () => ir(`#/entregadas/p/${p.id}/v/${nn}${ver === 'todas' ? '' : `?ver=${ver}`}`);
    const visita = renglonDeVisita(situacion);
    const repasos = renglonDeRepasos(situacion);
    const falta = fraseDeFalta(situacion);
    const entregada = E.diaEntregada(entrega);
    /* Los compradores con el nombre y el primer apellido; enteros, en la ficha y en el conforme. */
    const compradores = compradoresCortos(entrega.compradores);
    return h('div.d-dia-tarjeta.pv-tarjeta', {
      'data-unidad': entrega.unidadId,
      'data-estado': situacion.cerrada ? 'cerrada' : 'pendiente',
      onclick: abrir,
    },
      h('div.d-dia-cab', null,
        h('h2.d-dia-titulo', null, nombre),
        situacion.cerrada ? h('span.d-chip.macizo.pv-chip-cerrada', null, icon('check'), 'Cerrada') : null,
        h('button.pv-abrir', {
          type: 'button', 'aria-label': `Abrir la ${nombre}`,
          onclick: (ev) => { ev.stopPropagation(); abrir(); },
        }, icon('chevron')),
      ),
      fila('key', entregada ? `Entregada el ${E.diaCorto(entregada)}` : 'Entregada'),
      compradores ? fila('users', compradores) : null,
      fila(visita.icono, visita.texto, visita.clase),
      repasos ? fila('listaChecks', repasos) : null,
      h('div.pv-tarjeta-botones', null,
        botonesPosventa(entrega, { puede: poneFechas, alCambiar: refrescar, forma: 'fila' })),
      falta ? h('div.pv-falta', null, h('b', null, 'Le falta: '), falta) : null,
    );
  };

  /* ─── El conmutador, la cuenta y el cuerpo ─── */
  const selector = h('div.d-selector.pv-selector', null, ...FILTROS.map((f) => h('button', {
    type: 'button', 'data-ver': f.id,
    onclick: () => { if (ver !== f.id) { ver = f.id; pintar(); } },
  }, f.rotulo)));
  const cuenta = h('p.pv-cuenta', null, cuentaDeEntregadas(fichas));
  const cuerpo = h('div.pv-lista');

  const pintar = () => {
    anotarRuta(`#/entregadas?ver=${ver}`);
    selector.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.ver === ver ? 'true' : 'false'));
    if (!fichas.length) {
      cuerpo.replaceChildren(h('div.pv-vacio', null,
        h('p.pv-vacio-titulo', null, 'Todavía no hay ninguna vivienda entregada.'),
        h('p.pv-vacio-sub', null, 'Aparecerán aquí cuando el comercial o el administrador apunten la entrega en la hoja de fechas.'),
      ));
      return;
    }
    const visibles = filtrarEntregadas(fichas, ver);
    cuerpo.replaceChildren(...(visibles.length
      ? visibles.map(tarjeta)
      : [h('div.pv-vacio', null, h('p.pv-vacio-titulo', null, VACIOS[ver] || ''))]));
  };
  pintar();

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      cabecera({ seccion: 'entregadas' }),
      h('h1.d-saludo', null, 'Entregadas'),
      avisoLocal() || barraSync(),
      h('div.d-fila-selector', null, selector),
      fichas.length ? cuenta : null,
      cuerpo,
    ],
  };
}
