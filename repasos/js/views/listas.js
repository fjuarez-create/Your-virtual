/* Dentro de una vivienda: todas sus tareas, vengan del acta que vengan.

   Aquí no se ordena por inspección a propósito. Quien entra en la Villa
   04 quiere saber qué queda por hacer en esa casa, no en cuál de las
   tres visitas salió cada cosa. Las actas siguen existiendo —son la
   firma de quién vio qué y cuándo— y se abren desde el pie. */
import { h, icon, sheet, toast, emptyState, fechaCorta } from '../ui.js';
import { promocion, unidad, FASES, hecha, esperandoVisto } from '../catalog.js';
import * as store from '../store.js';
import { cabeceraDentro, barraAvance, tareaFila, filtroEstado, filtroOficio } from '../piezas.js';
import { ir } from '../app.js';

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/viviendas', { reemplazar: true }); return { contenido: [] }; }

  const { listas, tareas, conteo } = await store.tareasDeUnidad(unidadId);
  const portadas = new Map();
  for (const t of tareas) portadas.set(t.id, await store.urlDePortada(t));

  const nueva = async () => {
    const faseId = await elegirFase();
    if (!faseId) return;
    const l = await store.crearLista({ unidadId, promoId, fase: faseId });
    ir('#/l/' + l.id);
  };

  const cabecera = cabeceraDentro(u.nombre.toUpperCase(), { volverA: '#/viviendas', sub: p.nombre });

  if (!tareas.length) {
    return {
      sinTabs: true,
      contenido: [
        ...cabecera,
        emptyState('camera', 'Sin tareas todavía',
          `Crea la primera lista de repaso de ${u.nombre.toLowerCase()} y ve añadiendo lo que encuentres mientras la recorres.`,
          h('button.btn.ink', { onclick: nueva }, icon('plus'), 'Nueva lista de repaso')),
      ],
    };
  }

  let estado = 'todas';
  let oficioId = 'todos';
  const listado = h('div.stack', { style: { gap: '8px' } });
  const contador = h('p.contador');

  const pintar = () => {
    const visibles = tareas.filter((t) => encaja(t, estado, oficioId));
    listado.replaceChildren(...visibles.map((t) => tareaFila(t, { portada: portadas.get(t.id) })));
    if (!visibles.length) {
      listado.append(h('p.sub.center', { style: { padding: '30px 0' } },
        'Ninguna tarea encaja con este filtro.'));
    }
    contador.textContent = visibles.length === tareas.length
      ? `${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}`
      : `${visibles.length} de ${tareas.length} tareas`;
  };
  pintar();

  return {
    sinTabs: true,
    fab: h('button.fab', { onclick: nueva }, icon('plus'), 'Nueva lista'),
    contenido: [
      ...cabecera,
      barraAvance(conteo),
      filtroEstado((v) => { estado = v; pintar(); }),
      filtroOficio((v) => { oficioId = v; pintar(); }),
      contador,
      listado,
      // Las actas, al pie: se consultan cuando hace falta saber quién
      // firmó qué, no cada vez que se entra en la casa.
      h('div', { style: { marginTop: '26px' } },
        h('p.eyebrow', null, listas.length === 1 ? 'Su acta' : `Sus ${listas.length} actas`),
        h('div.stack', { style: { marginTop: '10px' } },
          listas
            .slice()
            .sort((a, b) => b.creado.localeCompare(a.creado))
            .map((l) => h('button.row', { onclick: () => ir('#/l/' + l.id) },
              h('div.row-lead', null, icon('clipboard', 18)),
              h('div.grow', null,
                h('div.row-title', null, l.nombre || `Acta de ${fechaCorta(l.creado)}`),
                h('div.row-sub', null, `${l.creadoPorNombre} · ${fechaCorta(l.creado)}`),
              ),
            )),
        ),
      ),
    ],
  };
}

/** Mismos criterios que en las pantallas de actas y viviendas. */
function encaja(t, estado, oficioId) {
  if (estado === 'pendientes' && hecha(t)) return false;
  if (estado === 'terminadas' && !hecha(t)) return false;
  if (oficioId !== 'todos' && (t.oficio || 'general') !== oficioId) return false;
  return true;
}

function elegirFase() {
  return sheet((cerrar) => [
    h('h2.title', null, 'Nueva lista de repaso'),
    h('p.sub', null, 'Se firma con la fecha de hoy y tu nombre.'),
    h('div.stack', { style: { marginTop: '6px' } },
      FASES.map((f) => h('button.row', { onclick: () => cerrar(f.id) },
        h('div.row-lead', null, f.corto.toUpperCase()),
        h('div.grow', null,
          h('div.row-title', null, f.nombre),
          h('div.row-sub', null, f.id === 'pre'
            ? 'Antes de entregar la vivienda'
            : 'Con el cliente ya dentro'),
        ),
      )),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
  ]);
}
