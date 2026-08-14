/* Listas de repaso de una vivienda: crear una nueva o abrir la de una
   inspección anterior para confirmar lo que ya se corrigió. */
import { h, icon, sheet, toast, emptyState, fechaCorta } from '../ui.js';
import { promocion, unidad, FASES } from '../catalog.js';
import * as store from '../store.js';
import { cabecera, filaLista } from '../piezas.js';
import { ir } from '../app.js';

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }

  const listas = await store.listasDeUnidad(unidadId);
  const conteos = new Map();
  let pendientesTotal = 0;
  for (const l of listas) {
    const c = await store.contarLista(l.id);
    conteos.set(l.id, c);
    pendientesTotal += c.pendientes;
  }

  const nueva = async () => {
    const faseId = await elegirFase();
    if (!faseId) return;
    const l = await store.crearLista({ unidadId, promoId, fase: faseId });
    ir('#/l/' + l.id);
  };

  const contenido = [
    cabecera(u.nombre, p.nombre, { volverA: '#/p/' + promoId }),
    h('h1.display', { style: { marginTop: '10px' } }, 'Repasos'),
  ];

  if (listas.length) {
    contenido.push(
      h('div.card-ink', null,
        h('p.eyebrow', null, u.nombre),
        h('div.stats', { style: { marginTop: '16px' } },
          h('div', null,
            h('div.n', null, String(listas.length)),
            h('div.l', null, listas.length === 1 ? 'Inspección' : 'Inspecciones'),
          ),
          h('div', null,
            h('div.n', { class: pendientesTotal ? 'accent' : '' }, String(pendientesTotal)),
            h('div.l', null, 'Pendientes'),
          ),
          h('div', null,
            h('div.n', null, fechaCorta(listas[0].creado).replace(/ \d{4}$/, '')),
            h('div.l', null, 'Última'),
          ),
        ),
      ),
      h('button.cta', { onclick: nueva },
        h('div.grow', null,
          h('div.cta-title', null, 'Nueva lista de repaso'),
          h('div.cta-sub', null, 'Inspección de hoy, ' + fechaCorta(new Date().toISOString())),
        ),
        h('span.knob', null, icon('plus')),
      ),
      h('p.eyebrow', { style: { marginTop: '22px' } }, 'Inspecciones anteriores'),
      h('div.stack', null, listas.map((l) => filaLista(l, conteos.get(l.id)))),
    );
  } else {
    contenido.push(
      emptyState('clipboard', 'Sin repasos todavía',
        `Crea la primera lista de ${u.nombre.toLowerCase()} y ve añadiendo lo que encuentres mientras la recorres.`,
        h('button.btn.accent', { onclick: nueva }, icon('plus'), 'Nueva lista de repaso')),
    );
  }

  return { tab: 'promociones', contenido };
}

/** Hoja para elegir pre-entrega o post-entrega. */
function elegirFase() {
  return sheet((cerrar) => [
    h('h2.title', null, 'Nueva lista de repaso'),
    h('p.sub', null, 'Se firmará con tu nombre y la fecha de hoy.'),
    h('div.stack', { style: { marginTop: '6px' } },
      FASES.map((f) => h('button.row', { onclick: () => cerrar(f.id) },
        h('div.row-lead', null, f.corto),
        h('div.grow', null,
          h('div.row-title', null, f.nombre),
          h('div.row-sub', null, f.id === 'pre'
            ? 'Antes de entregar la vivienda al cliente'
            : 'Después de la entrega, con el cliente dentro'),
        ),
      )),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
  ]);
}
