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
import { h, icon, toast, avatar, fechaCorta, hora, sheet, confirmar } from '../ui.js';
import {
  promocion, unidad, oficio, estado as estadoDe, puedeCrearLista, puedeVerificar, prioridadDe, puedePonerFechas,
  puedeBajarReconocimiento,
} from '../catalog.js';
import * as store from '../store.js';
import {
  cabecera, tarjetaActa, tarjetaTarea, cuandoTarea, cuandoCorto, bannerAvance, bannerMordido,
  hojaZonas, hojaFiltroTareas, caraDeGremio, hojaFecha,
  avisoLocal, barraSync, menuFlotante, menuTarjeta, filaMenu, filaMenuFichero, bandeja,
  entregarFichero,
} from '../piezas.js';
import * as E from '../entregas.js';
import { hojaDeReparto, nombreDeFichero, PROPORCION_FOTO_REPARTO } from '../pdf.js';
import { ordenPdf } from '../ajustesLocales.js';
import { jpegParaPdf } from '../media.js';
import * as api from '../api.js';
import { abrirMensaje } from '../mensajes.js';
import { ir, conFiltros, filtrosDeRuta, anotarFiltros, refrescar } from '../app.js';

/* Los tramos y sus frases viven en piezas.js, con el anillo: el color
   y la frase tienen que decir lo mismo en toda la app. */

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/viviendas', { reemplazar: true }); return { contenido: [] }; }

  const { actas, tareas } = await store.tareasDeUnidad(unidadId);

  // El paseo grabado y todavía sin convertir en tareas, si lo hay: es
  // trabajo ya hecho que hasta ahora no se veía desde ninguna pantalla.
  const pendiente = await store.recorridoPendiente(unidadId);

  // La entrega de esta casa: compradores, revisión con el cliente y
  // firma. La situación sale de ahí y de los repasos post-entrega sin
  // visto bueno (las incidencias).
  const entrega = await store.entregaDeUnidad(unidadId);
  const incidencias = (await store.incidenciasPorUnidad(promoId)).get(unidadId) || 0;

  // La foto de cada tarea, para las tarjetas grandes de la lista.
  const portadas = new Map();
  for (const t of tareas) portadas.set(t.id, await store.urlDePortada(t));

  const total = tareas.length;
  const hechas = tareas.filter((t) => t.estado === 'verificada').length;
  const pct = total ? Math.round((100 * hechas) / total) : 0;

  // El filtro llega puesto desde la lista de viviendas; la estancia es
  // un vistazo de dentro de la casa y no viaja en la dirección.
  let { estado, oficio: oficioId, prioridad } = filtrosDeRuta();
  let estancia = '';

  // La prioridad la cambia la DF tocando el chip de la tarjeta, sin
  // abrir el repaso: así se repasa una villa entera de seguido, que es
  // lo que va a hacer la dirección facultativa con las que ya existen.
  const verifica = puedeVerificar(store.sesion());
  const cambiarPrio = async (t, nueva) => {
    const antes = prioridadDe(t);
    try {
      await store.cambiarPrioridad(t.id, nueva);
      t.prioridad = nueva;
      pintar();
      toast(nueva === 'alta' ? 'Ahora es prioridad alta' : 'Ahora es prioridad media', '',
        { detalle: 'Toca para deshacer', alTocar: () => cambiarPrio(t, antes) });
    } catch (e) {
      toast(e.message, 'err');
    }
  };

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
    const visibles = tareas.filter((t) => encaja(t, estado, oficioId, estancia, prioridad));
    const abiertas = visibles.filter((t) => t.estado !== 'verificada');
    const hechas2 = visibles.filter((t) => t.estado === 'verificada');

    listado.replaceChildren(...abiertas.map((t) => tarjetaTarea({
      cuando: cuandoTarea(t.creado),
      quien: t.creadoPor ? store.persona(t.creadoPor, t.creadoPorNombre) : null,
      titulo: t.texto || 'Sin descripción',
      // Aquí la casa ya la dice el título de la pantalla: los dos
      // chips son la habitación y el oficio, que es lo que distingue
      // un remate de otro dentro de la misma villa. El oficio va en
      // corto: con el chip de prioridad delante, «Puertas de paso y
      // entrada» se metía debajo de la bola de la foto.
      chips: [t.zona, oficio(t.oficio)?.corto || oficio(t.oficio)?.nombre],
      prioridad: prioridadDe(t),
      alCambiarPrioridad: verifica ? (v) => cambiarPrio(t, v) : null,
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
          ? 'Nada por cerrar con este filtro. Lo verificado está abajo.'
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
    if (prioridad && prioridad !== 'todas') {
      piezas.push(h('span.d-filtro-pildora', null, `Prioridad ${prioridad}`));
    }
    if (piezas.length) {
      piezas.push(h('button.d-filtro-quitar', {
        'aria-label': 'Quitar los filtros',
        onclick: () => { estado = 'todas'; oficioId = 'todos'; prioridad = 'todas'; cambio(); },
      }, icon('x')));
    }
    filtros.replaceChildren(...piezas);
    filtros.style.display = piezas.length ? '' : 'none';
    desplegable.classList.toggle('puesto', !!estancia);
    desplegable.querySelector('span').textContent = estancia || 'Seleccionar estancia';
  };
  const cambio = () => { anotarFiltros({ estado, oficio: oficioId, prioridad }); pintar(); };

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
        prioridad,
      });
      if (!r) return;
      oficioId = r.oficios.length ? r.oficios.join(',') : 'todos';
      prioridad = r.prioridad || 'todas';
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
      }, aguja ? 'Ningún mensaje dice eso.' : 'Nada escrito todavía. Aquí va lo que hay que contar de esta vivienda y no es un repaso.'));
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
  const menu = async () => {
    const extra = actas.length ? h('div.d-menu-extra', null,
      h('p.d-epigrafe', null, 'Partes de la vivienda'),
      h('div.stack', { style: { gap: '8px' } },
        ...actas.map((a) => tarjetaActa(a, { dentroDeVivienda: true, filtros: { estado, oficio: oficioId, prioridad } }))),
    ) : null;
    /* Las tres hojas posibles, cada una con su cuenta delante para
       saber qué te llevas antes de tocar. La de los filtros solo sale
       cuando hay filtros puestos: sin ellos sería la misma que la
       primera con otro nombre. */
    const vivas = tareas.filter((t) => t.estado !== 'verificada');
    const hechas9 = tareas.filter((t) => t.estado === 'verificada');
    const conFiltro = vivas.filter((t) => encaja(t, estado, oficioId, estancia, prioridad));
    const hayFiltros = (estado && estado !== 'todas') || oficiosElegidos(oficioId).length > 0 || !!estancia
      || (prioridad && prioridad !== 'todas');
    const fraseFiltros = [
      estancia,
      ...oficiosElegidos(oficioId).map((id) => oficio(id).nombre),
      estado && estado !== 'todas' ? estadoDe(estado)?.plural : '',
      prioridad && prioridad !== 'todas' ? `Prioridad ${prioridad}` : '',
    ].filter(Boolean).join(' · ');

    /* El reconocimiento de repasos pendientes —el papel que se firma
       en la notaría— manda sobre los demás PDF: va en la tarjeta negra,
       arriba del todo. Le sale solo a quien puede descargarlo (DF,
       comercial y administrador) y solo cuando la vivienda tiene fecha
       de revisión o de firma: antes de eso no hay notaría a la vista.
       La ficha de la entrega se lee ahora y no al pintar la pantalla,
       por si una sincronización ha traído fechas entretanto. */
    const cuando = puedeBajarReconocimiento(store.sesion())
      ? cuandoReconocimiento(await store.entregaDeUnidad(unidadId))
      : '';
    const destacada = cuando ? {
      id: 'reconocimiento', icono: 'documento',
      rotulo: 'Reconocimiento de repasos pendientes',
      // Con espacios duros: si la línea no cabe entera, parte por el
      // punto y no deja un «12 nov» colgando solo debajo.
      sub: `Estado de hoy\u00a0· ${cuando.replace(/ /g, '\u00a0')}`,
    } : null;

    const elegido = await menuTarjeta(u.nombre, [
      { id: 'pdf', icono: 'documento', rotulo: 'PDF de repasos por cerrar',
        sub: `${vivas.length} ${vivas.length === 1 ? 'repaso por cerrar' : 'repasos por cerrar'}, con sus fotos` },
      hayFiltros ? { id: 'pdf-filtrado', icono: 'cursores', rotulo: 'PDF con los filtros puestos',
        sub: `${fraseFiltros} · ${conFiltro.length} ${conFiltro.length === 1 ? 'repaso' : 'repasos'}` } : null,
      { id: 'pdf-historico', icono: 'listaChecks', rotulo: 'PDF con todo el histórico',
        sub: `Lo por cerrar primero y las ${hechas9.length} ejecutadas al final` },
    ].filter(Boolean), { extra, destacada });

    if (elegido === 'reconocimiento') bajarReconocimiento(unidadId);
    if (elegido === 'pdf') descargarVivienda(p, u, { tareas: vivas });
    if (elegido === 'pdf-filtrado') descargarVivienda(p, u, { tareas: conFiltro, filtros: fraseFiltros });
    if (elegido === 'pdf-historico') descargarVivienda(p, u, { tareas: vivas, ejecutadas: hechas9, apellido: 'historico' });
  };

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

  /* ─── El aviso de recorrido a medias ───
     Un paseo grabado y sin terminar de repasar no se veía por ninguna
     parte: había que entrar en «Nueva inspección», dejar que se abriera
     la cámara y ver la fila «Repasar el recorrido a medias» en el pop
     up. Trabajo hecho, escondido detrás de una cámara encendida.

     Ahora se dice arriba del todo y con números, que es lo que decide
     si lo retomas ahora o después: cuándo se grabó y cuánto queda. Y
     lleva directo al repaso, sin encender nada. */
  const bannerPendiente = () => {
    const r = store.resumenRecorrido(pendiente);
    if (!r || !r.fotos) return null;
    return bannerMordido({
      // Negro, como todo lo de la IA. El verde se confundía con el
      // banner de tareas verificadas de la portada.
      clase: 'negro',
      rotulo: `Recorrido a medias · ${cuandoCorto(r.creado)}`,
      // Lo que queda por hacer, no lo que se grabó: con dos ya escritas
      // de seis, «6 fotos» miente sobre el rato que falta.
      // El plural va con el total, no con lo hecho: «1 de 4 listas».
      cifra: r.listas
        ? `${r.listas} de ${r.fotos} ${r.fotos === 1 ? 'lista' : 'listas'}`
        : `${r.fotos} ${r.fotos === 1 ? 'foto' : 'fotos'}`,
      icono: 'destello',
      adonde: `#/p/${promoId}/v/${nn}/recorrido/seguir`,
    });
  };

  /* ─── La entrega: la situación de la casa y la hoja de fechas ───
     Debajo del avance, el banner mordido con lo que toca: próxima
     revisión con el cliente (beige), revisada (verde suave), entregada
     (negro) o entregada con incidencias (rojo). Quien pone fechas
     —Ezequiel y el administrador— lo toca y abre la hoja; al resto
     del equipo le lleva al calendario, o al parte post-entrega si ya
     hay uno. */
  const poneFechas = puedePonerFechas(store.sesion());
  const bannerEntrega = () => {
    const sit = E.situacion(entrega, { incidencias });
    if (!sit && !poneFechas) return null;
    const b = bannerMordido(sit ? {
      clase: sit.clase, rotulo: sit.rotulo, cifra: sit.cifra,
      icono: poneFechas ? 'calendario' : sit.icono,
      alPinchar: () => (poneFechas ? hojaFechas() : irALaEntrega(sit)),
    } : {
      clase: 'beige', rotulo: 'Entrega', cifra: 'Sin fechas todavía', icono: 'calendario',
      alPinchar: () => hojaFechas(),
    });
    b.classList.add('entrega');
    b.setAttribute('aria-label', (sit ? sit.aria : 'Entrega sin fechas todavía')
      + (poneFechas ? '. Tocar para poner o cambiar las fechas' : ''));
    if (sit?.sub) {
      b.querySelector('.d-banner-texto').append(
        h('span.d-banner-sub', null, h('span.d-chip', { class: sit.sub.clase }, icon(sit.sub.icono), h('span', null, sit.sub.texto))),
      );
    }
    return b;
  };
  const irALaEntrega = async (sit) => {
    if (['incidencias', 'entregada', 'revisada'].includes(sit.clave)) {
      const parte = await store.partePostDeUnidad(unidadId);
      if (parte) { ir(`#/l/${parte.id}`); return; }
    }
    const dia = sit.clave === 'firma' || sit.clave === 'entregada' || sit.clave === 'incidencias'
      ? entrega.firma
      : sit.clave === 'revisada' && !entrega.revision && entrega.revisadaEn
        ? E.isoDe(new Date(entrega.revisadaEn))   // el día en que se dio por hecha
        : (entrega.revision || entrega.firma || E.hoyIso());
    ir(`#/entregas?vista=dia&fecha=${dia}`);
  };

  /* La hoja de fechas: compradores, revisión (día y hora), firma y
     «la revisión se ha hecho». Cada fila abre lo suyo y vuelve. */
  const hojaFechas = async () => {
    const e = entrega || {};
    const fecha = (iso) => E.fechaConDia(iso, { mayus: true });
    const filas = [
      { id: 'compradores', icono: 'users', rotulo: 'Compradores', sub: e.compradores || 'Sin apuntar' },
      { id: 'revision', icono: 'calendario', rotulo: 'Fecha de la revisión con el cliente',
        sub: e.revision ? `${fecha(e.revision)}${e.revisionHora ? ` · ${e.revisionHora}` : ''}` : 'Sin fecha' },
      { id: 'firma', icono: 'key', rotulo: 'Fecha de la firma', sub: e.firma ? fecha(e.firma) : 'Sin fecha' },
      e.revisadaEn
        ? { id: 'parte', icono: 'periodico', rotulo: 'Abrir el parte post-entrega',
            sub: `Revisión hecha el ${E.fechaLarga(E.isoDe(new Date(e.revisadaEn)))}` }
        : { id: 'hecha', icono: 'check', rotulo: 'La revisión se ha hecho', sub: 'Abre el parte post-entrega' },
      e.revisadaEn ? { id: 'deshacer', icono: 'x', rotulo: 'La revisión no se ha hecho', sub: 'Quita la marca; los partes se quedan' } : null,
    ];
    const elegido = await menuTarjeta(`${u.nombre} · entrega`, filas, {
      extra: h('span.d-menu-nota', null, 'Solo el comercial y el administrador ponen los compradores y las fechas. Al resto del equipo el banner le lleva al calendario de entregas.'),
    });
    if (!elegido) return;
    try {
      if (elegido === 'compradores') {
        const nombres = await hojaCompradores(e.compradores || '');
        if (nombres === null) return;
        await store.fijarEntrega(unidadId, promoId, { compradores: nombres });
        toast(nombres ? 'Compradores apuntados' : 'Compradores borrados');
      } else if (elegido === 'revision') {
        const v = await hojaFecha(e.revision ? E.partes(e.revision).fecha.toISOString() : null);
        if (v === null) return;
        const dia = v ? E.isoDe(new Date(v)) : '';
        let horaNueva = e.revisionHora || '';
        if (dia) {
          // Cerrar la hoja de la hora sin elegir no tira la fecha que
          // se acaba de escoger: se guarda con la hora que hubiera.
          const hh = await hojaHora(horaNueva);
          if (hh !== null) horaNueva = hh;
        }
        await store.fijarEntrega(unidadId, promoId, { revision: dia, revisionHora: dia ? horaNueva : '' });
        toast(dia ? `Revisión el ${E.fechaConDia(dia)}${horaNueva ? ` a las ${horaNueva}` : ''}` : 'Revisión sin fecha', '', { icono: 'calendario' });
      } else if (elegido === 'firma') {
        const v = await hojaFecha(e.firma ? E.partes(e.firma).fecha.toISOString() : null);
        if (v === null) return;
        const dia = v ? E.isoDe(new Date(v)) : '';
        await store.fijarEntrega(unidadId, promoId, { firma: dia });
        toast(dia ? `Firma el ${E.fechaConDia(dia)}` : 'Firma sin fecha', '', { icono: 'key' });
      } else if (elegido === 'hecha') {
        const seguro = await confirmar({
          titulo: '¿La revisión con el cliente se ha hecho?',
          texto: 'Se abre el parte post-entrega para apuntar lo que haya visto el comprador, y al equipo le llega un aviso.',
          ok: 'Sí, se ha hecho', icono: 'check', conservar: 'Todavía no', iconoConservar: 'clock',
        });
        if (!seguro) return;
        const { lista } = await store.marcarRevisionHecha(unidadId, promoId);
        toast('Revisión hecha · parte post-entrega abierto', '', { icono: 'check' });
        ir(`#/l/${lista.id}`);
        return;
      } else if (elegido === 'parte') {
        const parte = await store.partePostDeUnidad(unidadId);
        if (parte) { ir(`#/l/${parte.id}`); return; }
        toast('Esta vivienda no tiene parte post-entrega todavía', 'err');
        return;
      } else if (elegido === 'deshacer') {
        await store.deshacerRevisionHecha(unidadId, promoId);
        toast('La revisión vuelve a estar pendiente');
      }
      refrescar();
    } catch (err) {
      toast(err.message || 'No se ha podido guardar', 'err');
    }
  };

  pintar();

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    // «Nueva inspección» FLOTA sobre la lista con la mecánica del .fab
    // (absoluto, hermano de la pantalla), en la zona del pulgar: se ve
    // nada más entrar y acompaña todo el paseo, tenga la lista dos
    // repasos o cuarenta (lo pidió la DF el primer día). Primero se
    // probó pegado (sticky) dentro del scroll y el iPhone, con el
    // desplazamiento con inercia, lo dejaba flotando a media pantalla
    // partiendo tarjetas (foto de Fran): absoluto y fuera del scroll
    // no puede pasarle. El colchón con-fab de app.css deja libre la
    // caja de escribir del chat al llegar al fondo.
    fab: puedeCrearLista(store.sesion())
      ? h('button.fab.d-fab-negro', { onclick: nueva }, icon('plus'), 'Nueva inspección')
      : null,
    contenido: [
      cabecera({
        // La prioridad se queda en la villa: la lista de viviendas no
        // filtra por ella y llevársela escondida haría que la siguiente
        // villa que se abriera saliera filtrada sin que nadie lo pidiera.
        volver: () => ir(conFiltros('#/viviendas', { ...filtrosDeRuta(), prioridad: 'todas' })),
        titulo: u.nombre,
        menu,
      }),
      avisoLocal() || barraSync(),

      /* Lo primero de todo, por encima del avance: un recorrido a
         medias es lo único de esta pantalla que está esperando a que
         alguien vuelva. El avance de la casa seguirá ahí mañana. */
      bannerPendiente(),

      // El PDF ya no vive aquí: se baja desde los tres puntos de
      // arriba. Esta banda solo informa, y el color lo lleva el anillo.
      bannerAvance(pct, { total }),

      // La entrega: próxima revisión, revisada, entregada o con
      // incidencias. Sale cuando hay fechas (o para quien las pone).
      bannerEntrega(),

      h('p.d-epigrafe', null, 'Lista de repasos'),
      h('div.d-fila-selector', null, desplegable, bolaFiltros),
      filtros,
      listado,

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

function encaja(t, estado, oficioId, estancia, prioridad = 'todas') {
  if (estado && estado !== 'todas' && t.estado !== estado) return false;
  if (prioridad && prioridad !== 'todas' && prioridadDe(t) !== prioridad) return false;
  const elegidos = oficiosElegidos(oficioId);
  if (elegidos.length && !elegidos.includes(t.oficio)) return false;
  if (estancia && t.zona !== estancia) return false;
  return true;
}

/** El filtro de oficio viaja en la dirección como lista: «pladur,cocinas». */
function oficiosElegidos(oficioId) {
  return oficioId && oficioId !== 'todos' ? String(oficioId).split(',').filter(Boolean) : [];
}

/**
 * La segunda línea de la tarjeta del reconocimiento de repasos
 * pendientes: lo próximo de la entrega de esa vivienda.
 *
 *   «firma el jueves 12 nov»      hay firma, hoy o más adelante
 *                                 («firma hoy», «firma mañana»)
 *   «revisión el martes 10 nov»   solo hay revisión, o la revisión es
 *                                 lo siguiente que viene
 *   «firmó el 6 nov»              la firma ya pasó
 *
 * Devuelve '' si la vivienda no tiene ni revisión ni firma: sin fechas
 * la tarjeta no sale.
 */
function cuandoReconocimiento(entrega, hoy = E.hoyIso()) {
  const revision = E.esDia(entrega?.revision) ? entrega.revision : '';
  const firma = E.esDia(entrega?.firma) ? entrega.firma : '';
  if (!revision && !firma) return '';

  // Lo que viene: «hoy», «mañana» o «el jueves 12 nov».
  const viene = (iso) => {
    const n = E.diasHasta(iso, hoy);
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    const banner = E.fechaBanner(iso);   // «Jueves 12 nov»
    return `el ${banner.charAt(0).toLowerCase()}${banner.slice(1)}`;
  };
  // Lo que pasó: «ayer» o «el 6 nov» (con el año si no es el de ahora).
  const paso = (iso) => {
    const corto = cuandoCorto(E.partes(iso).fecha);
    return corto === 'ayer' ? corto : `el ${corto}`;
  };

  if (firma && firma < hoy) return `firmó ${paso(firma)}`;
  const revisionPrimero = revision && revision >= hoy && !entrega.revisadaEn && (!firma || revision < firma);
  if (firma && !revisionPrimero) return `firma ${viene(firma)}`;
  return `revisión ${revision >= hoy ? viene(revision) : paso(revision)}`;
}

/**
 * Descarga el reconocimiento de repasos pendientes de la vivienda. El
 * módulo se pide ahora y no al abrir la app: solo lo usan tres
 * papeles, y casi nunca.
 */
async function bajarReconocimiento(unidadId) {
  try {
    const { descargarReconocimiento } = await import('../constancia.js');
    await descargarReconocimiento({ unidadId });
  } catch (e) {
    console.error('No se pudo abrir la descarga del reconocimiento:', e);
    // Un módulo que no llegó a bajar, hay navegadores que no lo vuelven
    // a pedir hasta que la app se abre de nuevo: por eso se dice.
    toast('No se ha podido abrir la descarga', 'err', { detalle: 'Comprueba la conexión. Si sigue igual, cierra la app y ábrela de nuevo' });
  }
}

/**
 * La foto de portada de una tarea, en bytes listos para el PDF.
 *
 * Primero el Blob local; si no está —otro móvil la hizo y aquí solo
 * llegó la referencia— se pide al servidor. Y si tampoco, la tarea
 * sale sin foto: una hoja sin una foto vale; una hoja que no llega a
 * generarse, no.
 */
async function fotoParaPdf(t) {
  try {
    let blob = null;
    if (t.portadaId) {
      const m = await store.medioPorId(t.portadaId);
      if (m && !m.borrada) {
        if (m.blob instanceof Blob) blob = m.blob;
        else if (m.subido && api.HAY_SERVIDOR) blob = await (await fetch(api.urlMedio(m.id))).blob();
      }
    }
    if (!blob) {
      const [primera] = (await store.mediosDeTarea(t.id)).filter((m) => m.tipo === 'imagen' && !m.borrada);
      if (primera?.blob instanceof Blob) blob = primera.blob;
      else if (primera?.subido && api.HAY_SERVIDOR) blob = await (await fetch(api.urlMedio(primera.id))).blob();
    }
    if (!blob) return null;
    // El recorte con la misma proporción exacta que la caja del papel,
    // casi cuadrada: si no coincidieran, la foto saldría estirada.
    return await jpegParaPdf(blob, { anchoMax: 1000, proporcion: PROPORCION_FOTO_REPARTO });
  } catch { return null; }
}

/* Las tipografías corporativas para incrustar en el PDF: la Neue Haas
   del texto y la Eiko de los titulares. Se piden una vez y se guardan;
   el service worker las tiene en su caché, así que también llegan sin
   cobertura. Si aun así faltaran, la hoja sale en Helvetica: un papel
   con otra letra vale, un papel que no sale no. */
let fuentesPdfGuardadas = null;
async function fuentesPdf() {
  if (fuentesPdfGuardadas) return fuentesPdfGuardadas;
  const pedir = async (ruta) => {
    try {
      const r = await fetch(ruta);
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    } catch { return null; }
  };
  const [haas, eiko] = await Promise.all([
    pedir('assets/fonts/neue-haas-pdf.ttf'),
    pedir('assets/fonts/eiko-pdf.cff'),
  ]);
  fuentesPdfGuardadas = { haas, eiko };
  return fuentesPdfGuardadas;
}

async function descargarVivienda(p, u, { tareas, ejecutadas = [], filtros = '', apellido = '' }) {
  if (!tareas.length && !ejecutadas.length) { toast('Aquí no hay nada que llevarse', 'err'); return; }
  toast('Preparando el PDF con sus fotos…');
  try {
    // Las fotos, una a una y sin prisa: en un móvil de obra treinta
    // recortes JPEG son un par de segundos.
    const fotos = new Map();
    for (const t of tareas) {
      const f = await fotoParaPdf(t);
      if (f) fotos.set(t.id, f);
    }
    const ahora = new Date().toISOString();
    const blob = hojaDeReparto({
      vivienda: u.nombre,
      promocion: p.nombre,
      fecha: fechaCorta(ahora),
      hora: hora(ahora),
      autor: store.sesion()?.nombre || '',
      tareas, ejecutadas, fotos, filtros,
      // Por gremios o por estancias, como lo tenga puesto cada uno en
      // sus ajustes. Es su papel y su forma de repartir el trabajo.
      orden: ordenPdf(store.sesion()),
      fuentes: await fuentesPdf(),
    });
    const nombre = nombreDeFichero(
      [u.nombre, apellido || (filtros ? 'filtrado' : '')].filter(Boolean).join('-'),
      fechaCorta(new Date().toISOString()));
    const fichero = new File([blob], nombre, { type: 'application/pdf' });
    // La entrega va aparte y con su propia hoja: compartir en iOS exige
    // un toque recién dado, no uno de hace varios segundos de fotos.
    entregarFichero(fichero, nombre);
  } catch (e) {
    console.error('No se pudo generar el PDF de la vivienda:', e);
    toast('No se ha podido generar el PDF', 'err', {
      detalle: 'Toca para volver a intentarlo',
      alTocar: () => descargarVivienda(p, u, { tareas, ejecutadas, filtros, apellido }),
    });
  }
}

/* ─── Las dos hojas pequeñas de la entrega ─────────────────────── */
/**
 * Los compradores, a mano: «Juan y Pepe», «Familia Ortega». Resuelve
 * con el texto (vacío para borrarlos) o null si se cierra sin tocar.
 */
function hojaCompradores(actual) {
  return sheet((cerrar) => {
    const campo = h('input', { type: 'text', placeholder: 'Nombres de los compradores', autocapitalize: 'words', value: actual });
    const guardar = h('button.d-boton-negro', { onclick: () => cerrar(campo.value.trim()) }, 'Guardar');
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') cerrar(campo.value.trim()); });
    setTimeout(() => campo.focus(), 350);
    return [
      h('h2.title', null, 'Compradores'),
      h('p.hint', null, 'Como se les llama en la obra: «Juan y Pepe», «Familia Ortega».'),
      h('div.d-hoja-campo', null, campo),
      h('div.d-hoja-botones', null, guardar),
    ];
  }).then((v) => (v === undefined ? null : v));
}

/**
 * La hora de la revisión, con el reloj del propio móvil. Resuelve con
 * «HH:MM», con vacío si se quita la hora, o null si se cierra sin
 * tocar.
 */
function hojaHora(actual) {
  return sheet((cerrar) => {
    const campo = h('input', { type: 'time', value: actual || '' });
    const sinHora = h('button.d-boton-negro.claro', { onclick: () => cerrar('') }, 'Sin hora');
    const guardar = h('button.d-boton-negro', {
      onclick: () => cerrar(/^\d{2}:\d{2}$/.test(campo.value) ? campo.value : ''),
    }, 'Guardar');
    return [
      h('h2.title', null, '¿A qué hora?'),
      h('p.hint', null, 'La hora de la visita con el cliente. Se puede dejar sin hora.'),
      h('div.d-hoja-campo', null, campo),
      h('div.d-hoja-botones', null, sinHora, guardar),
    ];
  }).then((v) => (v === undefined ? null : v));
}
