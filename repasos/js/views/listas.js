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
  tarjetaActa, hojaZonas, hojaFiltroGremios, caraDeGremio,
  avisoLocal, barraSync,
} from '../piezas.js';
import { hojaDePuerta, nombreDeFichero } from '../pdf.js';
import { abrirMensaje } from '../mensajes.js';
import { ir, conFiltros, filtrosDeRuta, anotarFiltros } from '../app.js';

/* Las frases de la tarjeta de avance, las del diseño, por tramo. */
const FRASES = [
  [30, 'rojo', 'Aún quedan muchos repasos'],
  [70, 'ambar', 'Vamos viendo avances'],
  [101, 'verde', 'Estamos a punto'],
];

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/viviendas', { reemplazar: true }); return { contenido: [] }; }

  const { actas, tareas } = await store.tareasDeUnidad(unidadId);

  const total = tareas.length;
  const hechas = tareas.filter((t) => t.estado === 'verificada').length;
  const pct = total ? Math.round((100 * hechas) / total) : 0;
  const [, piel, frase] = FRASES.find(([tope]) => pct < tope);

  // El filtro llega puesto desde la lista de viviendas; la estancia es
  // un vistazo de dentro de la casa y no viaja en la dirección.
  let { estado, oficio: oficioId } = filtrosDeRuta();
  let estancia = '';

  /* ─── La lista de repasos ─── */
  const listado = h('div.d-repasos');
  const pintar = () => {
    const visibles = tareas
      .filter((t) => encaja(t, estado, oficioId, estancia))
      // Lo verificado al final, tachado, sin sacarlo de la lista: lo
      // que se viene a mirar es lo que queda, lo cerrado se consulta.
      .sort((a, b) => (a.estado === 'verificada' ? 1 : 0) - (b.estado === 'verificada' ? 1 : 0));
    listado.replaceChildren(...visibles.map((t) => {
      const hecho = t.estado === 'verificada';
      return h('button.d-repaso', { class: hecho ? 'hecho' : '', onclick: () => ir(`#/l/${t.listaId}/t/${t.id}`) },
        h('span.grow', null, t.texto || 'Sin texto'),
        h('span.d-repaso-bola', null, hecho ? icon('check') : null),
      );
    }));
    if (!visibles.length) {
      listado.append(h('p.d-epigrafe', {
        style: { color: 'var(--d-gris)', textAlign: 'center', padding: '24px 0', fontSize: '15px' },
      }, total ? 'Ningún repaso encaja con este filtro.' : 'Sin repasos todavía. Abre una inspección y ve apuntando.'));
    }
    pintarFiltros();
  };

  /* ─── Los filtros: estancia, gremio (con píldoras) y estado ─── */
  const filtros = h('div.d-filtros', { style: { display: 'none' } });
  const pintarFiltros = () => {
    const piezas = [];
    if (oficioId && oficioId !== 'todos') {
      const o = oficio(oficioId);
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

  const bolaFiltros = h('button.d-bola-filtros', {
    'aria-label': 'Filtros',
    onclick: async () => {
      const elegido = await hojaFiltroGremios(oficioId);
      if (elegido !== null) { oficioId = elegido; cambio(); }
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
    pintarChat();
  };
  cajaEscribir.addEventListener('keydown', (e) => { if (e.key === 'Enter') mandar(); });

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

  const nueva = () => ir(`#/p/${promoId}/v/${String(unidadId).split(':')[1]}/recorrido`);

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

      h('button.d-avance', { class: piel, onclick: () => descargarVivienda(p, u, tareas) },
        h('span.d-avance-pista', null, h('i', { style: { width: pct + '%' } })),
        h('span.d-avance-cifra', null, `${pct}%`),
        h('span.d-avance-frase', null, total ? frase : 'Sin repasos todavía'),
        h('span.d-avance-pdf', null, icon('documento')),
      ),

      h('p.d-epigrafe', null, 'Inspecciones'),
      puedeCrearLista(store.sesion())
        ? h('button.d-boton-negro', { onclick: nueva }, icon('plus'), 'Nueva inspección')
        : null,

      filtros,
      h('div.d-fila-selector', null, desplegable, bolaFiltros),

      h('p.d-epigrafe', null, 'Lista de repasos'),
      listado,

      h('p.d-epigrafe', null, `Mensajes relativos a la ${u.nombre}`),
      h('div.d-filtro-buscar', { style: { margin: '10px 0 12px' } }, icon('search'), buscador),
      chat,
      h('div.d-chat.d-escribir', null,
        cajaEscribir,
        h('button.d-escribir-mandar', { 'aria-label': 'Enviar', onclick: mandar }, icon('avionPapel')),
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
  if (oficioId && oficioId !== 'todos' && t.oficio !== oficioId) return false;
  if (estancia && t.zona !== estancia) return false;
  return true;
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
