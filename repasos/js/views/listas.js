/* Dentro de una vivienda: todas sus tareas, vengan del acta que vengan.

   Aquí no se ordena por inspección a propósito. Quien entra en la Villa
   04 quiere saber qué queda por hacer en esa casa, no en cuál de las
   tres visitas salió cada cosa. Las actas siguen existiendo —son la
   firma de quién vio qué y cuándo— y se abren desde el pie. */
import { h, icon, toast, emptyState, avatar, fechaCorta } from '../ui.js';
import { promocion, unidad, FASE_UNICA, puedeCrearLista } from '../catalog.js';
import * as store from '../store.js';
import { cabeceraDentro, fabMas, tareaFila, tarjetaActa, filtroEstado, filtroOficio } from '../piezas.js';
import { hojaDePuerta, nombreDeFichero } from '../pdf.js';
import { ir, conFiltros, filtrosDeRuta, anotarFiltros } from '../app.js';

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/viviendas', { reemplazar: true }); return { contenido: [] }; }

  const { actas, tareas } = await store.tareasDeUnidad(unidadId);
  const portadas = new Map();
  for (const t of tareas) portadas.set(t.id, await store.urlDePortada(t));

  // El «+» abre el recorrido: plantarse en la puerta y recorrer la casa
  // grabando es la manera rápida de levantar veinte tareas de una vez.
  // Desde allí se puede abrir el acta a secas, sin grabar nada, para
  // quien solo quiera apuntar una cosa suelta.
  const nueva = () => ir(`#/p/${promoId}/v/${String(unidadId).split(':')[1]}/recorrido`);

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
  // El filtro por persona no viaja en la dirección: es un vistazo que se
  // da dentro de una casa —«¿qué dejé yo aquí?»— y no algo que se
  // arrastre al volver atrás, como sí pasa con el estado y el gremio.
  let quien = null;
  const listado = h('div.stack', { style: { gap: '8px' } });
  const contador = h('p.contador');

  const cambio = () => { anotarFiltros({ estado, oficio: oficioId }); pintar(); };

  const pintar = () => {
    const visibles = tareas
      .filter((t) => encaja(t, estado, oficioId, quien))
      // Lo verificado al final, sin sacarlo de la lista. Lo que se viene
      // a mirar aquí es lo que queda por hacer; lo cerrado se consulta,
      // y se consulta menos.
      .sort((a, b) => (a.estado === 'verificada' ? 1 : 0) - (b.estado === 'verificada' ? 1 : 0));

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

  /**
   * Las caras de quien tiene trabajo sin verificar en esta casa, para
   * filtrar por persona de un toque.
   *
   * Solo salen si hay más de una: con una sola, el chip no separa nada
   * y ocupa una fila entera para decir algo que ya se sabe.
   */
  // La clave es la misma que compara el filtro, no la del directorio:
  // `store.persona()` devuelve la ficha de la persona para pintar la
  // cara, y su id no tiene por qué ser el que lleva escrito la tarea.
  // Guardarlas separadas es lo que hace que el chip filtre de verdad.
  const gente = [...new Map(tareas
    .filter((t) => t.estado !== 'verificada')
    .map((t) => {
      const clave = t.creadoPor || t.creadoPorNombre;
      return [clave, { clave, ficha: store.persona(t.creadoPor, t.creadoPorNombre) }];
    })).values()];

  const chipsGente = gente.length > 1 ? h('div.chips.caras') : null;
  const pintarCaras = () => {
    if (!chipsGente) return;
    chipsGente.replaceChildren(...gente.map((g) => {
      const puesta = quien === g.clave;
      return h('button.cara', {
        'aria-pressed': puesta ? 'true' : 'false',
        onclick: () => { quien = puesta ? null : g.clave; pintarCaras(); pintar(); },
      }, avatar(g.ficha, { tam: 30 }), h('span', null, (g.ficha?.nombre || '').split(/\s+/)[0]));
    }));
  };
  pintarCaras();
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
      chipsGente,
      contador,
      listado,

      // El PDF de toda la casa, no de un acta: es lo que se manda por
      // WhatsApp cuando alguien pregunta «¿qué queda en la 07?», y ahí
      // el acta de la que salió cada cosa no le importa a nadie.
      //
      // Debajo de la lista y no encima: aquí se viene a leer, y un botón
      // rojo a todo lo ancho antes de los filtros se lee como la acción
      // principal de la pantalla, que no lo es. Compartir se decide
      // cuando ya has mirado.
      h('button.btn.pdf.full', {
        style: { marginTop: '18px' },
        onclick: () => descargarVivienda(p, u, tareas),
      }, icon('documento'), 'PDF con lo que queda aquí'),
      // Las actas, al pie: se consultan cuando hace falta saber quién
      // firmó qué, no cada vez que se entra en la casa.
      pieDeActas(actas, { estado, oficio: oficioId }),
    ],
  };
}

/**
 * Las actas de la vivienda, con la misma tarjeta que la pestaña de
 * ACTAS. Delante van las que tienen algo pendiente o por verificar; las
 * verificadas del todo quedan detrás, bajo su propio epígrafe, pero se
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
          abiertas.length ? h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Verificadas') : null,
          h('div.stack.actas', null, terminadas.map((a) => tarjetaActa(a, { dentroDeVivienda: true, filtros }))),
        )
      : null,
  );
}

/**
 * Aquí lo que se filtra son tareas, no viviendas, así que el chip se
 * compara con el estado tal cual: el valor del filtro ES el id.
 */
function encaja(t, estado, oficioId, quien = null) {
  if (estado !== 'todas' && t.estado !== estado) return false;
  if (oficioId !== 'todos' && (t.oficio || 'general') !== oficioId) return false;
  if (quien && (t.creadoPor || t.creadoPorNombre) !== quien) return false;
  return true;
}

/**
 * El PDF de la vivienda entera, con lo que queda por hacer en el
 * momento de pulsarlo. Sale con lo pendiente, lo completado y lo
 * rechazado; lo verificado no, porque una hoja para llevar a obra tiene
 * que caber en un folio y lo cerrado no es trabajo.
 */
async function descargarVivienda(p, u, tareas) {
  const vivas = tareas.filter((t) => t.estado !== 'verificada');
  if (!vivas.length) { toast('Aquí no queda nada por hacer', 'err'); return; }
  try {
    const blob = hojaDePuerta({
      vivienda: u.nombre,
      promocion: p.nombre,
      fecha: fechaCorta(new Date().toISOString()),
      autor: store.sesion()?.nombre || '',
      tareas: vivas,
    });
    const nombre = nombreDeFichero(u.nombre, fechaCorta(new Date().toISOString()));
    const fichero = new File([blob], nombre, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [fichero] })) {
      await navigator.share({ files: [fichero], title: nombre });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    toast('No se ha podido generar el PDF', 'err');
  }
}

