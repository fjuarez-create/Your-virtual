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

  // Aquí no hay botón de crear: esta pantalla es para mirar, y crear
  // empieza eligiendo vivienda, que es la tercera bolita.
  return {
    tab: 'inicio',
    contenido: [
      ...cabeceraTab(p.nombre.toUpperCase()),
      avisoLocal() || barraSync(),
      c.total ? barraAvance(c) : null,
      recientes.length
        ? h('div', { style: { marginTop: '22px' } },
            h('p.eyebrow', null, 'Actividad reciente'),
            h('div.stack', { style: { marginTop: '10px', gap: '8px' } },
              recientes.map(({ tarea, unidadId, portada }) =>
                tareaFila(tarea, { portada, donde: unidad(unidadId)?.nombre }))),
          )
        : h('div.vacio-suave', null,
            h('p.sub.center', null, 'Todavía no hay tareas. Entra en Viviendas y crea la primera lista de repaso.')),
    ],
  };
}
