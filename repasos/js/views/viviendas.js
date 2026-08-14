/* Rejilla de viviendas de una promoción. El color dice de un vistazo
   cuáles tienen repaso pendiente sin necesidad de entrar en ninguna. */
import { h, icon, toast } from '../ui.js';
import { promocion, unidades } from '../catalog.js';
import * as store from '../store.js';
import { cabecera } from '../piezas.js';
import { ir } from '../app.js';

export async function render({ promoId }) {
  const p = promocion(promoId);
  if (!p) { toast('Promoción desconocida', 'err'); ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }

  const lista = unidades(promoId);
  const resumen = await store.resumenPorUnidad(promoId);

  let filtro = 'todas';
  const rejilla = h('div.grid-units');
  const contador = h('p.sub');

  const pintar = () => {
    rejilla.replaceChildren();
    let visibles = 0;
    for (const u of lista) {
      const r = resumen.get(u.id);
      const pendientes = r?.pendientes || 0;
      const tieneListas = !!r?.listas;
      if (filtro === 'pendientes' && !pendientes) continue;
      if (filtro === 'sin' && tieneListas) continue;
      visibles++;

      const clase = pendientes ? 'unit has-open' : tieneListas ? 'unit has-done' : 'unit';
      rejilla.append(h('button', {
        class: clase,
        'aria-label': `${u.nombre}${pendientes ? `, ${pendientes} pendientes` : tieneListas ? ', repasada' : ''}`,
        onclick: () => ir(`#/p/${promoId}/v/${u.id.split(':')[1]}`),
      },
        u.corto,
        pendientes ? h('span.pip', null, String(pendientes)) : null,
        !pendientes && tieneListas ? h('span.pip', null, icon('check', 10)) : null,
      ));
    }
    if (!visibles) {
      rejilla.append(h('p.sub', { style: { gridColumn: '1 / -1', padding: '24px 0', textAlign: 'center' } },
        filtro === 'pendientes' ? 'No queda ninguna vivienda con tareas pendientes.' : 'Todas las viviendas tienen ya algún repaso.'));
    }
    contador.textContent = `${visibles} de ${lista.length} viviendas`;
  };

  const chips = h('div.chips', null,
    ...[['todas', 'Todas'], ['pendientes', 'Con pendientes'], ['sin', 'Sin repasar']].map(([id, txt]) =>
      h('button.chip.accent', {
        'aria-pressed': id === filtro ? 'true' : 'false',
        onclick: (e) => {
          filtro = id;
          [...chips.children].forEach((c) => c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false'));
          pintar();
        },
      }, txt)),
  );

  pintar();

  return {
    tab: 'promociones',
    contenido: [
      cabecera(p.nombre, p.ubicacion, { volverA: '#/promociones' }),
      h('h1.display', { style: { marginTop: '10px' } }, 'Viviendas'),
      chips,
      contador,
      rejilla,
      leyenda(),
    ],
  };
}

function leyenda() {
  const punto = (color, borde) => h('span', {
    style: {
      width: '11px', height: '11px', borderRadius: '4px', display: 'inline-block',
      background: color, boxShadow: borde ? 'inset 0 0 0 1px var(--line)' : 'none', flex: '0 0 11px',
    },
  });
  const item = (nodo, texto) => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px' } }, nodo, texto);
  return h('div', {
    style: { display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--muted)', marginTop: '18px' },
  },
    item(punto('var(--accent)'), 'Con pendientes'),
    item(punto('var(--ink)'), 'Repasada'),
    item(punto('var(--surface)', true), 'Sin repasos'),
  );
}
