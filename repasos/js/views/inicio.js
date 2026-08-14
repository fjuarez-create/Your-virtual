/* Portada: saludo, cifras del estado de los repasos, acceso directo a
   crear uno nuevo y las últimas listas tocadas. */
import { h, icon, saludo, avatar } from '../ui.js';
import * as store from '../store.js';
import { barraSync, avisoLocal, filaLista } from '../piezas.js';
import { ir } from '../app.js';

export async function render() {
  const u = store.sesion();
  const resumen = await store.resumenGeneral();
  const recientes = await store.listasRecientes(4);

  const conteos = new Map();
  for (const l of recientes) conteos.set(l.id, await store.contarLista(l.id));

  const nombreCorto = (u?.nombre || '').split(/\s+/)[0] || '';

  return {
    tab: 'inicio',
    contenido: [
      h('div.topbar', null,
        h('div.grow', null, h('p.eyebrow', null, 'UNIK repasos')),
        avatar(u, { onclick: () => ir('#/ajustes') }),
      ),

      h('h1.display', null, saludo() + ',', h('br'), h('span.thin', null, nombreCorto)),

      avisoLocal() || barraSync(),

      // Panel negro con las cifras, como el bloque de estadísticas de la referencia.
      h('div.card-ink', null,
        h('p.eyebrow', null, 'Estado de los repasos'),
        h('div.stats', { style: { marginTop: '16px' } },
          h('div', null,
            h('div.n', null, String(resumen.viviendas)),
            h('div.l', null, resumen.viviendas === 1 ? 'Vivienda' : 'Viviendas'),
          ),
          h('div', null,
            h('div.n', null, String(resumen.listas)),
            h('div.l', null, resumen.listas === 1 ? 'Inspección' : 'Inspecciones'),
          ),
          h('div', null,
            h('div.n', { class: resumen.pendientes ? 'accent' : '' }, String(resumen.pendientes)),
            h('div.l', null, 'Pendientes'),
          ),
        ),
        resumen.tareas > 0 && h('div', { style: { marginTop: '18px' } },
          h('div.bar', null, h('i', {
            style: { width: Math.round(100 * (resumen.tareas - resumen.pendientes) / resumen.tareas) + '%' },
          })),
          h('p.sub', { style: { marginTop: '9px', fontSize: '12px' } },
            `${resumen.tareas - resumen.pendientes} de ${resumen.tareas} tareas cerradas`),
        ),
      ),

      h('button.cta', { onclick: () => ir('#/viviendas') },
        h('div.grow', null,
          h('div.cta-title', null, 'Nuevo repaso'),
          h('div.cta-sub', null, 'Elige promoción y vivienda'),
        ),
        h('span.knob', null, icon('arrowRight')),
      ),

      recientes.length ? h('div', { style: { marginTop: '24px' } },
        h('div.topbar', null,
          h('div.grow', null, h('p.eyebrow', null, 'Últimas inspecciones')),
          h('button.tag', { onclick: () => ir('#/listas') }, 'Ver todas'),
        ),
        h('div.stack', { style: { marginTop: '10px' } },
          recientes.map((l) => filaLista(l, conteos.get(l.id), { mostrarVivienda: true })),
        ),
      ) : bienvenida(),
    ],
  };
}

function bienvenida() {
  return h('div', { style: { marginTop: '22px' } },
    h('p.eyebrow', null, 'Cómo funciona'),
    h('div.stack', { style: { marginTop: '10px' } },
      paso('1', 'Elige la vivienda', 'Promoción, después la villa que vas a repasar.'),
      paso('2', 'Crea la lista', 'Pre-entrega o post-entrega, con la fecha de hoy y tu nombre.'),
      paso('3', 'Foto y texto', 'Una tarea por remate. Puedes añadir más fotos, vídeo o una nota de voz.'),
    ),
  );
}

function paso(n, titulo, texto) {
  return h('div.row', { style: { alignItems: 'flex-start' } },
    h('div.row-lead', null, n),
    h('div.grow', null,
      h('div.row-title', null, titulo),
      h('div.row-sub', { style: { whiteSpace: 'normal', marginTop: '3px' } }, texto),
    ),
  );
}
