/* Selector de promoción. Las que aún no tienen repasos abiertos salen
   deshabilitadas, igual que el showroom hace con los edificios sin BIM. */
import { h, icon } from '../ui.js';
import { PROMOCIONES } from '../catalog.js';
import { unidades } from '../catalog.js';
import * as store from '../store.js';
import { chevron, cabecera } from '../piezas.js';
import { ir } from '../app.js';

export async function render() {
  const filas = [];
  for (const p of PROMOCIONES) {
    const total = unidades(p.id).length;
    let sub = p.ubicacion || '';
    if (p.activa) {
      const resumen = await store.resumenPorUnidad(p.id);
      let pendientes = 0;
      let conListas = 0;
      for (const v of resumen.values()) { pendientes += v.pendientes; conListas++; }
      const partes = [total ? `${total} viviendas` : p.ubicacion];
      if (conListas) partes.push(`${conListas} con repasos`);
      if (pendientes) partes.push(`${pendientes} pendientes`);
      sub = partes.filter(Boolean).join(' · ');
    }

    filas.push(h('button.row', {
      disabled: !p.activa,
      style: p.activa ? null : { opacity: '0.5' },
      onclick: () => p.activa && ir('#/p/' + p.id),
    },
      h('div.row-lead', {
        style: p.activa ? { background: 'var(--accent)', color: 'var(--on-accent)' } : null,
      }, icon('building', 19)),
      h('div.grow', null,
        h('div.row-title', null, p.nombre),
        h('div.row-sub', null, p.activa ? sub : 'Próximamente'),
      ),
      p.activa ? chevron() : h('span.tag', null, 'En preparación'),
    ));
  }

  return {
    sinTabs: true,
    contenido: [
      cabecera('Promociones', 'Elige el desarrollo', { volverA: '#/' }),
      h('h1.display', { style: { marginTop: '10px' } }, 'Promociones'),
      h('p.sub', { style: { marginTop: '10px', marginBottom: '8px' } },
        'Elige el desarrollo cuyas viviendas vas a repasar.'),
      h('div.stack', null, filas),
    ],
  };
}
