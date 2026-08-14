/* Historial: todas las inspecciones, de todas las viviendas, en orden
   inverso. Es la vista para responder «¿qué se repasó esta semana?». */
import { h, icon, emptyState, fechaCorta } from '../ui.js';
import * as store from '../store.js';
import { FASES } from '../catalog.js';
import { filaLista, barraSync } from '../piezas.js';
import { ir } from '../app.js';
import * as db from '../db.js';

export async function render() {
  const todas = (await db.getAll('listas')).filter((l) => !l.borrada)
    .sort((a, b) => b.creado.localeCompare(a.creado));

  if (!todas.length) {
    return {
      tab: 'historial',
      contenido: [
        h('h1.display', null, 'Historial'),
        emptyState('clock', 'Todavía no hay inspecciones',
          'Cuando crees tu primera lista de repaso aparecerá aquí, con su fecha y quién la hizo.',
          h('button.btn.accent', { onclick: () => ir('#/promociones') }, icon('plus'), 'Nuevo repaso')),
      ],
    };
  }

  const conteos = new Map();
  for (const l of todas) conteos.set(l.id, await store.contarLista(l.id));

  let filtro = 'todas';
  const contenedor = h('div');

  const pintar = () => {
    const visibles = todas.filter((l) => filtro === 'todas' || l.fase === filtro);
    contenedor.replaceChildren();
    if (!visibles.length) {
      contenedor.append(h('p.sub', { style: { padding: '26px 0', textAlign: 'center' } }, 'Nada en esta fase todavía.'));
      return;
    }
    // Agrupadas por día: es como se recuerdan las visitas a obra.
    let diaAnterior = '';
    for (const l of visibles) {
      const dia = fechaCorta(l.creado);
      if (dia !== diaAnterior) {
        diaAnterior = dia;
        contenedor.append(h('p.eyebrow', { style: { margin: '20px 0 10px' } }, dia));
      }
      contenedor.append(h('div', { style: { marginBottom: '9px' } },
        filaLista(l, conteos.get(l.id), { mostrarVivienda: true })));
    }
  };

  const chips = h('div.chips', null,
    ...[['todas', 'Todas'], ...FASES.map((f) => [f.id, f.nombre])].map(([id, txt]) =>
      h('button.chip.accent', {
        'aria-pressed': id === filtro ? 'true' : 'false',
        onclick: (ev) => {
          filtro = id;
          [...chips.children].forEach((c) => c.setAttribute('aria-pressed', c === ev.currentTarget ? 'true' : 'false'));
          pintar();
        },
      }, txt)),
  );

  pintar();

  const viviendas = new Set(todas.map((l) => l.unidadId)).size;

  return {
    tab: 'historial',
    contenido: [
      h('h1.display', null, 'Historial'),
      h('p.sub', null, `${todas.length} ${todas.length === 1 ? 'inspección' : 'inspecciones'} en ${viviendas} ${viviendas === 1 ? 'vivienda' : 'viviendas'}.`),
      barraSync(),
      chips,
      contenedor,
    ],
  };
}
