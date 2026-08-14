/* Primera bolita: el panel de la promoción.

   Una barra de avance de tres tramos y, debajo, las últimas tareas
   tocadas. No las últimas actas: lo que dice si la obra se mueve es el
   trabajo, y el acta es solo la carpeta donde estaba. */
import { h, icon, avatar, logoUnik } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, unidad } from '../catalog.js';
import { barraSync, avisoLocal, cabeceraTab, barraAvance, tareaFila } from '../piezas.js';
import { ir } from '../app.js';

export async function render() {
  const activas = PROMOCIONES.filter((p) => p.activa);
  const p = activas[0] || null;
  if (!p) {
    return { tab: 'inicio', contenido: [...cabeceraTab('UNIK'),
      h('p.sub', null, 'No hay ninguna promoción activa.')] };
  }

  const c = await store.resumenPromocion(p.id);
  const recientes = await store.tareasRecientes(12, { promoId: p.id });

  const cta = h('button.cta-negro', { onclick: () => ir('#/viviendas') },
    h('span.grow', null, 'NUEVA LISTA DE REPASOS'),
    h('span.cta-mas', null, icon('plus', 18)),
  );

  // El botón flotante es el mismo botón cuando el de arriba se va de la
  // pantalla: nunca están los dos a la vez.
  const fab = h('button.fab-bola', {
    'aria-label': 'Nueva lista de repasos',
    onclick: () => ir('#/viviendas'),
  }, icon('plus', 22));
  vigilar(cta, fab);

  return {
    tab: 'inicio',
    fab,
    contenido: [
      ...cabeceraTab(p.nombre.toUpperCase()),
      avisoLocal() || barraSync(),
      c.total ? barraAvance(c) : null,
      cta,
      recientes.length
        ? h('div', { style: { marginTop: '22px' } },
            h('p.eyebrow', null, 'Últimas tareas'),
            h('div.stack', { style: { marginTop: '10px', gap: '8px' } },
              recientes.map(({ tarea, unidadId, portada }) =>
                tareaFila(tarea, { portada, donde: unidad(unidadId)?.nombre }))),
          )
        : h('div.vacio-suave', null,
            h('p.sub.center', null, 'Todavía no hay tareas. Crea la primera lista de repaso con el botón de arriba.')),
    ],
  };
}

/**
 * Cambia el botón ancho por la bolita cuando aquel sale de pantalla.
 * Con IntersectionObserver y no escuchando el scroll: el navegador avisa
 * solo cuando cruza el borde, en vez de preguntarlo en cada fotograma
 * mientras se arrastra la lista.
 */
function vigilar(cta, fab) {
  fab.classList.add('oculto');
  requestAnimationFrame(() => {
    const raiz = document.getElementById('screen');
    if (!raiz || !window.IntersectionObserver) { fab.classList.remove('oculto'); return; }
    const obs = new IntersectionObserver(([e]) => {
      fab.classList.toggle('oculto', e.isIntersecting);
    }, { root: raiz, threshold: 0 });
    obs.observe(cta);
    new MutationObserver((_, m) => {
      if (!cta.isConnected) { obs.disconnect(); m.disconnect(); }
    }).observe(document.getElementById('app'), { childList: true, subtree: true });
  });
}
