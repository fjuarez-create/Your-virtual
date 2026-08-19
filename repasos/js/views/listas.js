/* La ficha de una vivienda, calcada del Figma del rediseño 2026.

   De arriba a abajo: la cabecera con la bola de volver, el nombre de
   la villa y el menú de tres puntos; la tarjeta de avance con su barra
   y la bola roja del PDF; el botón negro de nueva inspección; los
   filtros (estancia, gremio y estado); la lista de repasos en pastilla
   —lo verificado, tachado y al final—; y el chat de la villa con sus
   marcas de leído.

   Aquí no se ordena por inspección a propósito. Quien entra en la
   Villa 04 quiere saber qué queda por hacer en esa casa, no en cuál de
   las tres visitas salió cada cosa. Las actas siguen existiendo —son
   la firma de quién vio qué y cuándo— y viven en el menú de arriba. */
import { h, icon, sheet, toast, avatar, fechaCorta, hora } from '../ui.js';
import { promocion, unidad, oficio, estado as estadoDe, puedeCrearLista } from '../catalog.js';
import * as store from '../store.js';
import {
  tarjetaActa, tarjetaTarea, cuandoTarea, bannerAvance, hojaZonas, hojaFiltroTareas, caraDeGremio,
  avisoLocal, barraSync, menuFlotante, filaMenu, filaMenuFichero, bandeja,
} from '../piezas.js';
import { hojaDePuerta, nombreDeFichero } from '../pdf.js';
import { abrirMensaje } from '../mensajes.js';
import { ir, conFiltros, filtrosDeRuta, anotarFiltros } from '../app.js';

/* Los tramos y sus frases viven en piezas.js, con el anillo: el color
   y la frase tienen que decir lo mismo en toda la app. */

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/viviendas', { reemplazar: true }); return { contenido: [] }; }

  const { actas, tareas } = await store.tareasDeUnidad(unidadId);

  // La foto de cada tarea, para las tarjetas grandes de la lista.
  const portadas = new Map();
  for (const t of tareas) portadas.set(t.id, await store.urlDePortada(t));

  const total = tareas.length;
  const hechas = tareas.filter((t) => t.estado === 'verificada').length;
  const pct = total ? Math.round((100 * hechas) / total) : 0;

  // El filtro llega puesto desde la lista de viviendas; la estancia es
  // un vistazo de dentro de la casa y no viaja en la dirección.
  let { estado, oficio: oficioId } = filtrosDeRuta();
  let estancia = '';

  /* ─── La lista de repasos ───
     Lo que queda por hacer va en la tarjeta grande del diseño: foto,
     quién lo vio, cuándo y en qué habitación. Es lo que se mira
     andando por la casa y necesita decirlo todo sin abrirse.

     Lo verificado baja a su propia lista, en pastilla y de una línea:
     ya está hecho, se comprueba de refilón y no compite por el sitio
     con lo que falta. */
  const listado = h('div.d-lista-tareas');
  const verificados = h('div.d-repasos');
  const bloqueVerificados = h('div', { style: { display: 'none' } },
    h('p.d-epigrafe', null, 'Repasos verificados'), verificados);

  const pintar = () => {
    const visibles = tareas.filter((t) => encaja(t, estado, oficioId, estancia));
    const abiertas = visibles.filter((t) => t.estado !== 'verificada');
    const hechas2 = visibles.filter((t) => t.estado === 'verificada');

    listado.replaceChildren(...abiertas.map((t) => tarjetaTarea({
      cuando: cuandoTarea(t.creado),
      quien: t.creadoPor ? store.persona(t.creadoPor, t.creadoPorNombre) : null,
      titulo: t.texto || 'Sin descripción',
      // Aquí la casa ya la dice el título de la pantalla: los dos
      // chips son la habitación y el oficio, que es lo que distingue
      // un remate de otro dentro de la misma villa.
      chips: [t.zona, oficio(t.oficio)?.nombre],
      oficioObj: oficio(t.oficio),
      foto: portadas.get(t.id) || null,
      alPinchar: () => ir(`#/l/${t.listaId}/t/${t.id}`),
    })));
    if (!abiertas.length) {
      listado.append(h('p', {
        style: { color: 'var(--d-gris)', textAlign: 'center', padding: '24px 0', fontSize: '15px' },
      }, !total
        ? 'Sin repasos todavía. Abre una inspección y ve apuntando.'
        : hechas2.length
          ? 'Nada pendiente con este filtro. Lo verificado está abajo.'
          : 'Ningún repaso encaja con este filtro.'));
    }

    verificados.replaceChildren(...hechas2.map((t) =>
      h('button.d-repaso.hecho', { onclick: () => ir(`#/l/${t.listaId}/t/${t.id}`) },
        h('span.grow', null, t.texto || 'Sin texto'),
        h('span.d-repaso-bola', null, icon('check')),
      )));
    bloqueVerificados.style.display = hechas2.length ? '' : 'none';

    pintarFiltros();
  };

  /* ─── Los filtros: estancia, gremio (con píldoras) y estado ─── */
  const filtros = h('div.d-filtros', { style: { display: 'none' } });
  const pintarFiltros = () => {
    const piezas = [];
    for (const id of oficiosElegidos(oficioId)) {
      const o = oficio(id);
      const cara = caraDeGremio(o, 36);
      cara.classList.add('cara');
      piezas.push(h('span.d-filtro-pildora', null, cara, o.nombre));
    }
    if (estado && estado !== 'todas') {
      piezas.push(h('span.d-filtro-pildora', null, estadoDe(estado)?.plural || estado));
    }
    if (piezas.length) {
      piezas.push(h('button.d-filtro-quitar', {
        'aria-label': 'Quitar los filtros',
        onclick: () => { estado = 'todas'; oficioId = 'todos'; cambio(); },
      }, icon('x')));
    }
    filtros.replaceChildren(...piezas);
    filtros.style.display = piezas.length ? '' : 'none';
    desplegable.classList.toggle('puesto', !!estancia);
    desplegable.querySelector('span').textContent = estancia || 'Seleccionar estancia';
  };
  const cambio = () => { anotarFiltros({ estado, oficio: oficioId }); pintar(); };

  const desplegable = h('button.d-desplegable', {
    onclick: async () => {
      const z = await hojaZonas(estancia);
      if (z !== null) { estancia = z; pintar(); }
    },
  }, h('span', null, 'Seleccionar estancia'), icon('caretAbajo'));

  // La misma hoja «Filtrar tareas» que las listas de la obra, pero sin
  // la vivienda —ya estás dentro de una— y sin la estancia, que está a
  // un dedo en el desplegable de aquí al lado. Y solo los oficios que
  // esta casa tiene: un filtro que lleva a una lista vacía es una
  // promesa rota.
  const bolaFiltros = h('button.d-bola-filtros', {
    'aria-label': 'Filtros',
    onclick: async () => {
      const hay = [...new Set(tareas.map((t) => t.oficio))].filter(Boolean);
      const r = await hojaFiltroTareas({
        oficios: oficiosElegidos(oficioId),
        oficiosLibres: hay.map((id) => oficio(id)).sort((a, b) => a.nombre.localeCompare(b.nombre)),
        conVivienda: false,
      });
      if (!r) return;
      oficioId = r.oficios.length ? r.oficios.join(',') : 'todos';
      cambio();
    },
  }, icon('cursores'));

  /* ─── El chat de la villa ─── */
  const chat = h('div.d-chat');
  let busqueda = '';
  const pintarChat = async () => {
    const mensajes = await store.mensajesDeUnidad(unidadId);
    const quien = store.sesion()?.id || 'local';
    const aguja = busqueda.trim().toLowerCase();

    const tarjetas = [];
    for (const m of mensajes) {
      if (aguja && !`${m.texto} ${m.creadoPorNombre}`.toLowerCase().includes(aguja)) continue;
      const mio = store.esMio(m);
      const leidas = await store.lecturasDe(m.id);
      const nuevo = !mio && !leidas.some((l) => l.usuarioId === quien);
      const tics = mio ? await store.ticsDe(m) : -1;
      tarjetas.push(h('button.d-mensaje', { onclick: () => abrirMensaje(m, pintarChat) },
        avatar(store.persona(m.creadoPor, m.creadoPorNombre), { tam: 48 }),
        h('span.grow', null,
          h('span.d-mensaje-cab', null,
            h('span.d-mensaje-quien', null, m.creadoPorNombre || 'Sin identificar'),
            h('span.d-mensaje-cuando', null, cuandoMensaje(m.creado)),
          ),
          h('span.d-mensaje-pie', null,
            // El tic gris es «enviado»; el doble violeta, «leído». La
            // bolita azul es lo que uno no ha leído todavía.
            tics === 0 ? h('span.tic', null, icon('check')) : null,
            tics >= 1 ? h('span.tics', null, icon('dobleCheck')) : null,
            h('span.d-mensaje-txt', null, m.texto),
            nuevo ? h('span.d-mensaje-bolita', { 'aria-label': 'Sin leer' }) : null,
          ),
        ),
      ));
    }
    chat.replaceChildren(...tarjetas);
    if (!tarjetas.length) {
      chat.append(h('p', {
        style: { color: 'var(--d-gris)', textAlign: 'center', padding: '20px 0', fontSize: '15px' },
      }, aguja ? 'Ningún mensaje dice eso.' : 'Nada escrito todavía. Aquí va lo que hay que contar de esta vivienda y no es una tarea.'));
    }
  };
  await pintarChat();

  const buscador = h('input', { type: 'search', placeholder: 'Buscar un mensaje...' });
  buscador.addEventListener('input', () => { busqueda = buscador.value; pintarChat(); });

  const cajaEscribir = h('input', { type: 'text', placeholder: 'Escribe tu mensaje...', autocapitalize: 'sentences' });
  const mandar = async () => {
    const texto = cajaEscribir.value.trim();
    if (!texto) return;
    await store.escribirMensaje(unidadId, promoId, texto);
    cajaEscribir.value = '';
    botonMandar.disabled = true;
    pintarChat();
  };
  cajaEscribir.addEventListener('keydown', (e) => { if (e.key === 'Enter') mandar(); });
  // Apagado mientras no hay nada escrito, como en toda la app.
  const botonMandar = h('button.d-escribir-mandar',
    { 'aria-label': 'Enviar', disabled: true, onclick: mandar }, icon('avionPapel'));
  cajaEscribir.addEventListener('input', () => { botonMandar.disabled = !cajaEscribir.value.trim(); });

  /* ─── El menú de los tres puntos: el PDF y las actas firmadas ─── */
  const menu = () => sheet((cerrar) => [
    h('h2.title', null, u.nombre),
    h('div.stack', { style: { marginTop: '12px', gap: '8px' } },
      h('button.row', { onclick: () => { cerrar(); descargarVivienda(p, u, tareas); } },
        icon('documento', 20), h('div.grow', null, h('div.row-title', null, 'PDF con lo que queda aquí'))),
    ),
    actas.length ? h('p.eyebrow', { style: { marginTop: '18px' } }, 'Actas de la vivienda') : null,
    actas.length ? h('div.stack', { style: { marginTop: '8px', gap: '8px' } },
      ...actas.map((a) => tarjetaActa(a, { dentroDeVivienda: true, filtros: { estado, oficio: oficioId } }))) : null,
  ]);

  /* ─── Nueva inspección: el menú de tres opciones del diseño ───
     Foto o galería llevan al formulario de nueva tarea con lo
     capturado en la bandeja; el recorrido con IA abre el visor. */
  const nn = String(unidadId).split(':')[1];
  const conFotos = (ficheros) => {
    bandeja.fotos = [...ficheros];
    ir(`#/p/${promoId}/v/${nn}/nueva`);
  };
  const nueva = () => menuFlotante((cerrar) => [
    filaMenuFichero(cerrar, { capture: 'environment' }, 'camera', 'Hacer foto', conFotos),
    filaMenuFichero(cerrar, {}, 'image', 'Seleccionar de galería', conFotos),
    filaMenu('destello', 'Recorrido IA', () => { cerrar(); ir(`#/p/${promoId}/v/${nn}/recorrido`); }),
  ]);

  pintar();

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      h('div.d-cab-dentro', null,
        h('button.d-bola', {
          'aria-label': 'Volver',
          onclick: () => ir(conFiltros('#/viviendas', filtrosDeRuta())),
        }, icon('arrowLeft')),
        h('div.d-titulo', null, u.nombre),
        h('button.d-bola', { 'aria-label': 'Más opciones', onclick: menu }, icon('puntos')),
      ),
      avisoLocal() || barraSync(),

      // El PDF ya no vive aquí: se baja desde los tres puntos de
      // arriba. Esta banda solo informa, y el color lo lleva el anillo.
      bannerAvance(pct, { total }),

      h('p.d-epigrafe', null, 'Lista de repasos'),
      h('div.d-fila-selector', null, desplegable, bolaFiltros),
      filtros,
      listado,

      // El botón va debajo de la lista: se entra en la casa a ver qué
      // hay, y solo cuando ya lo has visto tiene sentido apuntar algo
      // nuevo.
      h('p.d-epigrafe', null, 'Inspecciones'),
      puedeCrearLista(store.sesion())
        ? h('button.d-boton-negro', { onclick: nueva }, icon('plus'), 'Nueva inspección')
        : null,

      bloqueVerificados,

      h('p.d-epigrafe', null, `Mensajes relativos a la ${u.nombre}`),
      h('div.d-filtro-buscar', { style: { margin: '10px 0 12px' } }, icon('search'), buscador),
      chat,
      h('div.d-chat.d-escribir', null,
        cajaEscribir,
        botonMandar,
      ),
    ],
  };
}

/** El cuándo del chat: «Hoy, 10:40» · «Ayer, 17:01» · «Viernes, 18:04» · «12 ago, 11:49». */
function cuandoMensaje(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return `Hoy, ${hora(iso)}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${hora(iso)}`;
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  if (hoy - d < 7 * 24 * 3600 * 1000) return `${dias[d.getDay()]}, ${hora(iso)}`;
  return `${fechaCorta(iso)}, ${hora(iso)}`;
}

function encaja(t, estado, oficioId, estancia) {
  if (estado && estado !== 'todas' && t.estado !== estado) return false;
  const elegidos = oficiosElegidos(oficioId);
  if (elegidos.length && !elegidos.includes(t.oficio)) return false;
  if (estancia && t.zona !== estancia) return false;
  return true;
}

/** El filtro de oficio viaja en la dirección como lista: «pladur,cocinas». */
function oficiosElegidos(oficioId) {
  return oficioId && oficioId !== 'todos' ? String(oficioId).split(',').filter(Boolean) : [];
}

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
