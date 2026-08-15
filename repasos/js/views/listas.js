/* Dentro de una vivienda: todas sus tareas, vengan del acta que vengan.

   Aquí no se ordena por inspección a propósito. Quien entra en la Villa
   04 quiere saber qué queda por hacer en esa casa, no en cuál de las
   tres visitas salió cada cosa. Las actas siguen existiendo —son la
   firma de quién vio qué y cuándo— y se abren desde el pie. */
import { h, icon, toast, emptyState } from '../ui.js';
import { promocion, unidad, FASE_UNICA, puedeCrearLista } from '../catalog.js';
import * as store from '../store.js';
import { cabeceraDentro, fabMas, tareaFila, tarjetaActa, filtroEstado, filtroOficio } from '../piezas.js';
import { ir, conFiltros, filtrosDeRuta, anotarFiltros } from '../app.js';

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/viviendas', { reemplazar: true }); return { contenido: [] }; }

  const { actas, tareas } = await store.tareasDeUnidad(unidadId);
  const portadas = new Map();
  for (const t of tareas) portadas.set(t.id, await store.urlDePortada(t));

  // Sin preguntar nada: ya no hay pre ni post que elegir, así que la
  // hoja que había en medio solo pedía confirmar lo que se acababa de
  // pulsar. Se crea, se avisa y se entra dentro.
  const nueva = async () => {
    const l = await store.crearLista({ unidadId, promoId, fase: FASE_UNICA });
    toast('Acta abierta · se firma con tu nombre y la fecha de hoy');
    ir('#/l/' + l.id);
  };

  const cabecera = cabeceraDentro(u.nombre.toUpperCase(),
    { volverA: conFiltros('#/viviendas', filtrosDeRuta()), sub: p.nombre });

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

  // El filtro llega puesto desde la lista de viviendas: si venías
  // buscando lo abierto de pintura, aquí sigues viendo eso.
  let { estado, oficio: oficioId } = filtrosDeRuta();
  const listado = h('div.stack', { style: { gap: '8px' } });
  const contador = h('p.contador');

  const cambio = () => { anotarFiltros({ estado, oficio: oficioId }); pintar(); };

  const pintar = () => {
    const visibles = tareas.filter((t) => encaja(t, estado, oficioId));
    listado.replaceChildren(...visibles.map((t) =>
      tareaFila(t, { portada: portadas.get(t.id), filtros: { estado, oficio: oficioId } })));
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
    // Aquí se viene a leer una lista. La llamada a la acción a todo lo
    // ancho la partía por la mitad, así que la acción se va al botón
    // redondo de abajo a la derecha, que no ocupa sitio en la lectura.
    // Un acta la abre quien puede darla por buena: al jefe de obra no se
    // le enseña el botón, porque responde a las tareas de un acta y no
    // la convoca.
    fab: puedeCrearLista(store.sesion())
      ? fabMas(nueva, { etiqueta: 'Nueva lista de repasos' })
      : null,
    contenido: [
      ...cabecera,
      filtroEstado((v) => { estado = v; cambio(); }, estado),
      filtroOficio((v) => { oficioId = v; cambio(); }, oficioId),
      contador,
      listado,
      // Las actas, al pie: se consultan cuando hace falta saber quién
      // firmó qué, no cada vez que se entra en la casa.
      pieDeActas(actas, { estado, oficio: oficioId }),
    ],
  };
}

/**
 * Las actas de la vivienda, con la misma tarjeta que la pestaña de
 * ACTAS. Delante van las que tienen algo abierto o por validar; las
 * validadas del todo quedan detrás, bajo su propio epígrafe, pero se
 * ven: son la firma de quién vio qué y cuándo, y a eso se vuelve.
 */
function pieDeActas(actas, filtros = null) {
  if (!actas.length) return null;
  const abiertas = actas.filter((a) => !store.actaTerminada(a.conteo));
  const terminadas = actas.filter((a) => store.actaTerminada(a.conteo));

  return h('div', { style: { marginTop: '26px' } },
    h('p.eyebrow', null, actas.length === 1 ? 'Su acta' : `Sus ${actas.length} actas`),
    abiertas.length
      ? h('div.stack.actas', { style: { marginTop: '10px' } },
          abiertas.map((a) => tarjetaActa(a, { dentroDeVivienda: true, filtros })))
      : null,
    // El epígrafe solo cuando hay de las dos: con todas terminadas
    // sobra, y con ninguna terminada no habría nada debajo.
    terminadas.length
      ? h('div', { style: { marginTop: abiertas.length ? '20px' : '10px' } },
          abiertas.length ? h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Validadas') : null,
          h('div.stack.actas', null, terminadas.map((a) => tarjetaActa(a, { dentroDeVivienda: true, filtros }))),
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

