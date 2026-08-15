/* Dentro de una vivienda: todas sus tareas, vengan del acta que vengan.

   Aquí no se ordena por inspección a propósito. Quien entra en la Villa
   04 quiere saber qué queda por hacer en esa casa, no en cuál de las
   tres visitas salió cada cosa. Las actas siguen existiendo —son la
   firma de quién vio qué y cuándo— y se abren desde el pie. */
import { h, icon, sheet, toast, emptyState } from '../ui.js';
import { promocion, unidad, FASES, puedeCrearLista } from '../catalog.js';
import * as store from '../store.js';
import { cabeceraDentro, ctaNuevaLista, tareaFila, tarjetaActa, filtroEstado, filtroOficio } from '../piezas.js';
import { ir } from '../app.js';

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/viviendas', { reemplazar: true }); return { contenido: [] }; }

  const { actas, tareas } = await store.tareasDeUnidad(unidadId);
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
          actas.length
            ? `Ya hay un acta abierta en ${u.nombre.toLowerCase()}, pero todavía sin tareas dentro. Ábrela y ve añadiendo lo que encuentres.`
            : `Crea la primera lista de repaso de ${u.nombre.toLowerCase()} y ve añadiendo lo que encuentres mientras la recorres.`,
          puedeCrearLista(store.sesion())
            ? h('button.btn.ink', { onclick: nueva }, icon('plus'), 'Nueva lista de repaso')
            : null),
        // Un acta recién creada aún no tiene tareas. Si no se enseñara
        // aquí, quedaría invisible desde su propia vivienda.
        pieDeActas(actas),
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
    // Sin botón flotante: la llamada a la acción negra hace lo mismo y
    // está siempre a la vista, igual que en la pestaña de ACTAS.
    fab: null,
    contenido: [
      ...cabecera,
      filtroEstado((v) => { estado = v; pintar(); }),
      filtroOficio((v) => { oficioId = v; pintar(); }),
      contador,
      // Un acta la abre quien puede darla por buena. Al jefe de obra no
      // se le enseña el botón: responde a las tareas de un acta, no la
      // convoca.
      puedeCrearLista(store.sesion()) ? ctaNuevaLista(nueva) : null,
      listado,
      // Las actas, al pie: se consultan cuando hace falta saber quién
      // firmó qué, no cada vez que se entra en la casa.
      pieDeActas(actas),
    ],
  };
}

/**
 * Las actas de la vivienda, con la misma tarjeta que la pestaña de
 * ACTAS. Delante van las que tienen algo abierto o por validar; las
 * validadas del todo quedan detrás, bajo su propio epígrafe, pero se
 * ven: son la firma de quién vio qué y cuándo, y a eso se vuelve.
 */
function pieDeActas(actas) {
  if (!actas.length) return null;
  const abiertas = actas.filter((a) => !store.actaTerminada(a.conteo));
  const terminadas = actas.filter((a) => store.actaTerminada(a.conteo));

  return h('div', { style: { marginTop: '26px' } },
    h('p.eyebrow', null, actas.length === 1 ? 'Su acta' : `Sus ${actas.length} actas`),
    abiertas.length
      ? h('div.stack.actas', { style: { marginTop: '10px' } },
          abiertas.map((a) => tarjetaActa(a, { dentroDeVivienda: true })))
      : null,
    // El epígrafe solo cuando hay de las dos: con todas terminadas
    // sobra, y con ninguna terminada no habría nada debajo.
    terminadas.length
      ? h('div', { style: { marginTop: abiertas.length ? '20px' : '10px' } },
          abiertas.length ? h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Validadas') : null,
          h('div.stack.actas', null, terminadas.map((a) => tarjetaActa(a, { dentroDeVivienda: true }))),
        )
      : null,
  );
}

/**
 * Aquí lo que se filtra son tareas, no viviendas, así que el chip se
 * compara con el estado tal cual: el valor del filtro ES el id.
 */
function encaja(t, estado, oficioId) {
  if (estado !== 'todas' && t.estado !== estado) return false;
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
