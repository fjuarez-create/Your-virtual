/* Detalle de una tarea: la foto en grande, el texto completo y el resto
   de material de apoyo (más fotos, vídeo y notas de voz). */
import { h, icon, sheet, toast, confirmSheet, openViewer, fechaCorta, hora, pesoLegible } from '../ui.js';
import {
  ESTADOS, ZONAS, OFICIOS, estado, oficio, unidad, estadosPermitidos, rebotada,
} from '../catalog.js';
import * as store from '../store.js';
import * as media from '../media.js';
import { cabecera } from '../piezas.js';
import { ir, refrescar, conFiltros, filtrosDeRuta } from '../app.js';

export async function render({ listaId, tareaId }) {
  const t = await store.tarea(tareaId);
  if (!t) { toast('La tarea ya no existe', 'err'); ir('#/l/' + listaId, { reemplazar: true }); return { contenido: [] }; }

  const lista = await store.lista(listaId);
  const u = lista ? unidad(lista.unidadId) : null;
  const medios = await store.mediosDeTarea(tareaId);
  const visuales = medios.filter((m) => m.tipo !== 'audio');
  const audios = medios.filter((m) => m.tipo === 'audio');
  const hermanas = await store.tareasDeLista(listaId);
  const indice = hermanas.findIndex((x) => x.id === tareaId);

  const comentarios = await store.comentariosDeTarea(tareaId);
  const mediosPorComentario = new Map();
  for (const c of comentarios) mediosPorComentario.set(c.id, await store.mediosDeComentario(c.id));

  /* ─── Medio principal ─── */
  const hero = h('div.hero-media');
  let actual = visuales.find((m) => m.id === t.portadaId) || visuales[0] || null;

  const pintarHero = () => {
    hero.replaceChildren();
    hero.className = 'hero-media' + (actual ? '' : ' empty');
    if (!actual) {
      hero.append(h('div.center', null, icon('image', 30), h('p.sub', { style: { marginTop: '10px' } }, 'Sin imagen')));
      return;
    }
    const url = store.urlDeMedio(actual);
    if (!url) {
      hero.append(h('div.center', null, icon('cloudOff', 30),
        h('p.sub', { style: { marginTop: '10px', color: 'rgba(255,255,255,.6)' } }, 'Descargando…')));
      return;
    }
    if (actual.tipo === 'video') {
      hero.append(h('video', { src: url, controls: true, playsinline: true, preload: 'metadata' }));
    } else {
      const img = h('img', { src: url, alt: t.texto || 'Foto del repaso', loading: 'eager' });
      hero.append(img);
      hero.onclick = () => openViewer(h('img', { src: url, alt: '' }));
    }
    if (marcarRail) marcarRail();
  };

  /* ─── Carrete ─── */
  let marcarRail = null;
  const rail = h('div.rail');
  const pintarRail = () => {
    rail.replaceChildren();
    for (const m of visuales) {
      const url = store.urlDeMedio(m);
      const celda = h('div.m', {
        role: 'button', tabindex: '0',
        'aria-current': actual && m.id === actual.id ? 'true' : 'false',
        style: url && m.tipo === 'imagen' ? { backgroundImage: `url("${url}")` } : null,
        onclick: () => { actual = m; pintarHero(); },
      }, m.tipo === 'video' ? h('span.k', null, icon('play')) : null);
      if (m.tipo === 'video' && !url) celda.append(h('span.k', null, icon('cloudOff')));
      rail.append(celda);
    }
    // El «+» del carrete va directo a la foto: cuando una tarea no tiene
    // nada, este botón es lo único que hay en pantalla, y lo que se va a
    // añadir es una foto el 95% de las veces. Vídeo y voz siguen abajo,
    // en «Añadir material».
    rail.append(media.botonFichero({
      clase: 'add', etiqueta: 'Añadir una foto',
      accept: 'image/*', multiple: true,
      onElegir: (ficheros) => guardarFotos(t, ficheros),
    }, icon('plus')));
    marcarRail = () => {
      [...rail.querySelectorAll('.m')].forEach((c, i) =>
        c.setAttribute('aria-current', actual && visuales[i]?.id === actual.id ? 'true' : 'false'));
    };
  };
  pintarRail();
  pintarHero();

  /* ─── Estado ─── */
  const yo = store.sesion();
  const permitidos = estadosPermitidos(yo);

  // Mismo alto y mismo redondeo que los filtros del resto de pantallas.
  // Aquí el marcado se rellena en negro y no en el color de marca: no
  // es un filtro, es el estado en el que está la tarea.
  const chipsEstado = h('div.chips.filtro', null,
    permitidos.map((op) => h('button.chip', {
      'aria-pressed': t.estado === op.id ? 'true' : 'false',
      onclick: () => cambiarEstadoTarea(t, op.id),
    }, op.nombre)),
  );

  // Los estados que este usuario no puede poner salen igual, apagados.
  // Esconderlos dejaría al jefe de obra sin ver dónde acaba su trabajo y
  // dónde empieza el nuestro; verlos y no poder pulsarlos lo explica solo.
  for (const op of ESTADOS.filter((x) => !permitidos.some((p) => p.id === x.id))) {
    chipsEstado.append(h('span.chip', {
      'aria-pressed': t.estado === op.id ? 'true' : 'false',
      style: { opacity: '.45', pointerEvents: 'none' },
      title: 'Solo la dirección facultativa y UNIK verifican y rechazan',
    }, op.nombre));
  }

  const e = estado(t.estado);

  return {
    sinTabs: true,
    contenido: [
      cabecera(
        `Tarea ${indice + 1} de ${hermanas.length}`,
        u ? `${u.nombre} · ${fechaCorta(lista.creado)}` : '',
        {
          volverA: conFiltros('#/l/' + listaId, filtrosDeRuta()),
          acciones: [h('button.icon-btn', {
            'aria-label': 'Opciones', onclick: () => menuTarea(t, listaId),
          }, icon('gear'))],
        },
      ),

      rebotada(t) ? avisoRechazo(comentarios) : null,

      hero,
      rail,

      h('div', { style: { marginTop: '18px' } },
        h('div.topbar', null,
          h('div.grow', null, h('p.eyebrow', null, 'Descripción')),
          h('button.tag', { onclick: () => editarTexto(t) }, 'Editar'),
        ),
        h('p', {
          style: { fontSize: '16px', lineHeight: '1.5', letterSpacing: '-0.005em', marginTop: '6px', whiteSpace: 'pre-wrap' },
        }, t.texto || 'Sin descripción.'),
      ),

      // Gremio y estancia juntos: son las dos cosas que sitúan la tarea
      // —quién la arregla y dónde está— y se leen de un golpe.
      h('div', { style: { marginTop: '18px' } },
        h('div.topbar', null,
          h('div.grow', null, h('p.eyebrow', null, 'Gremio y estancia')),
          h('button.tag', { onclick: () => editarEstancia(t) }, 'Cambiar'),
        ),
        h('div.chips', { style: { marginTop: '8px' } },
          h('span.tag', null, oficio(t.oficio).nombre),
          t.zona
            ? h('span.tag', null, t.zona)
            : h('span.tag', { style: { opacity: '.55' } }, 'Sin estancia'),
        ),
      ),

      h('div', { style: { marginTop: '20px' } },
        h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Estado'),
        chipsEstado,
        t.estado !== 'pendiente' && t.estadoPor
          ? h('p.hint', null, `${e.nombre} por ${t.estadoPor} el ${fechaCorta(t.estadoEn)} a las ${hora(t.estadoEn)}`)
          : null,
      ),

      hiloDeTarea(t, comentarios, mediosPorComentario),

      audios.length ? h('div', { style: { marginTop: '20px' } },
        h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Notas de voz'),
        h('div.stack', null, audios.map((m) => filaAudio(m, t))),
      ) : null,

      h('div', { style: { marginTop: '22px' } },
        h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Añadir material'),
        h('div.btn-row', null,
          media.botonFichero({
            clase: 'btn', accept: 'image/*', multiple: true,
            onElegir: (ficheros) => guardarFotos(t, ficheros),
          }, icon('camera'), 'Foto'),
          h('button.btn', { onclick: () => añadirVideo(t) }, icon('video'), 'Vídeo'),
          h('button.btn', { onclick: () => añadirAudio(t) }, icon('mic'), 'Voz'),
        ),
      ),

      h('p.hint', { style: { marginTop: '22px' } },
        `Creada por ${t.creadoPor === 'local' ? t.creadoPorNombre : t.creadoPorNombre} el ${fechaCorta(t.creado)} a las ${hora(t.creado)}.`),

      navegacionHermanas(hermanas, indice, listaId),
    ],
  };
}

/* ─── Piezas ──────────────────────────────────────────────────── */
function filaAudio(m, t) {
  const url = store.urlDeMedio(m);
  return h('div.audio-row', null,
    h('div.row-lead', null, icon('mic', 17)),
    h('div.grow', null,
      url
        ? h('audio', { controls: true, src: url, preload: 'none', style: { width: '100%' } })
        : h('p.sub', null, 'Disponible al recuperar conexión'),
      h('p.hint', { style: { marginTop: '2px' } },
        [media.duracionLegible(m.duracion), pesoLegible(m.tam)].filter(Boolean).join(' · ')),
    ),
    h('button.icon-btn', {
      'aria-label': 'Borrar nota de voz',
      style: { width: '36px', height: '36px', flex: '0 0 36px' },
      onclick: async () => {
        if (!await confirmSheet({ title: '¿Borrar la nota de voz?', ok: 'Borrar', danger: true })) return;
        await store.borrarMedio(m.id);
        refrescar();
      },
    }, icon('trash', 16)),
  );
}

function navegacionHermanas(hermanas, indice, listaId) {
  const anterior = hermanas[indice - 1];
  const siguiente = hermanas[indice + 1];
  if (!anterior && !siguiente) return null;
  return h('div.btn-row', { style: { marginTop: '20px' } },
    h('button.btn.ghost', { disabled: !anterior, onclick: () => ir(conFiltros(`#/l/${listaId}/t/${anterior.id}`, filtrosDeRuta())) },
      icon('arrowLeft'), 'Anterior'),
    h('button.btn.ghost', { disabled: !siguiente, onclick: () => ir(conFiltros(`#/l/${listaId}/t/${siguiente.id}`, filtrosDeRuta())) },
      'Siguiente', icon('arrowRight')),
  );
}

/* ─── Rechazo e hilo ──────────────────────────────────────────── */
/**
 * Cambia el estado. Rechazar no se puede hacer en silencio: quien lo hace
 * tiene que explicar por qué, y puede adjuntar una foto de cómo está la
 * cosa. Eso queda en el hilo y el constructor lo ve nada más abrir la
 * tarea. Los motivos no se pisan: si rebota tres veces, quedan los tres.
 */
async function cambiarEstadoTarea(t, nuevo) {
  if (t.estado === nuevo) return;

  try {
    if (store.exigeExplicacion(t, nuevo)) {
      const nota = await hojaRechazo(t);
      if (!nota) return;
      await store.cambiarEstado(t.id, nuevo, nota);
      toast('Rechazada. La constructora la verá arriba del todo');
      return refrescar();
    }

    await store.cambiarEstado(t.id, nuevo);
    // El nombre visible, no el identificador: al usuario «resuelta» no
    // le dice nada, porque en pantalla eso se llama «Completada».
    toast('Marcada como ' + estado(nuevo).nombre.toLowerCase());
    refrescar();
  } catch (e) {
    toast(e.message, 'err');
  }
}

/** Hoja del rechazo: texto obligatorio y foto opcional. */
function hojaRechazo(t) {
  return sheet((cerrar) => {
    const area = h('textarea.textarea', {
      rows: 4,
      placeholder: 'Qué sigue mal y qué hay que hacer…',
      autocapitalize: 'sentences',
    });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    const previa = h('div.rail', { style: { display: 'none' } });
    let imagen = null;

    // El texto va en su propio <span> porque el label lleva dentro el
    // input escondido: si se reemplazaran los hijos del botón entero,
    // se llevaría por delante el input y el botón dejaría de abrir nada.
    const cara = h('span', {
      style: { display: 'inline-flex', alignItems: 'center', gap: '9px' },
    }, icon('camera'), 'Adjuntar una foto');
    const adjuntar = media.botonFichero({
      clase: 'btn ghost full', accept: 'image/*',
      onElegir: async ([f]) => {
        toast('Preparando la foto…');
        try {
          const img = await media.prepararImagen(f);
          imagen = img;
          previa.replaceChildren(h('div.m', { style: { backgroundImage: `url("${URL.createObjectURL(img.blob)}")` } }));
          previa.style.display = 'flex';
          cara.replaceChildren(icon('check'), document.createTextNode('Foto adjunta · cambiar'));
        } catch { toast('No se pudo leer la foto', 'err'); }
      },
    }, cara);
    adjuntar.style.marginTop = '10px';

    setTimeout(() => area.focus(), 320);

    return [
      h('h2.title', null, 'Rechazar la tarea'),
      h('p.sub', null, 'Explica qué sigue mal: quien la dio por completada verá el aviso y tu explicación, y tendrá que volver a completarla.'),
      area,
      previa,
      adjuntar,
      aviso,
      h('button.btn.accent.full', {
        style: { marginTop: '14px' },
        onclick: () => {
          const texto = area.value.trim();
          if (texto.length < 5) {
            aviso.textContent = 'Escribe al menos una frase explicando el rechazo.';
            aviso.style.display = 'block';
            return;
          }
          cerrar({ texto, imagen });
        },
      }, 'Rechazar'),
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
    ];
  });
}

/**
 * Banda de aviso cuando la tarea viene rechazada.
 *
 * Manda el último motivo, que es lo que hay que arreglar ahora. Los
 * anteriores no se pierden: siguen abajo, en el hilo. Cuando hay más de
 * uno se dice cuántos, porque una tarea que ha rebotado tres veces es un
 * problema distinto de una que rebotó una.
 */
function avisoRechazo(comentarios) {
  const rechazos = comentarios.filter((c) => c.tipo === 'rechazo');
  const ultimo = rechazos[rechazos.length - 1];
  return h('div.alerta', null,
    h('div.alerta-ico', null, icon('rechazo', 20)),
    h('div.grow', null,
      h('p.alerta-titulo', null, rechazos.length > 1
        ? `Rechazada · ${rechazos.length} veces`
        : 'Rechazada'),
      h('p.alerta-texto', null, ultimo
        ? `${ultimo.creadoPorNombre}: «${ultimo.texto}»`
        : 'Se rechazó tras darse por completada.'),
    ),
  );
}

/** Hilo de la tarea: rechazos y notas, en orden. */
function hiloDeTarea(t, comentarios, mediosPorComentario) {
  const bloque = h('div', { style: { marginTop: '24px' } },
    h('div.topbar', null,
      h('div.grow', null, h('p.eyebrow', null, `Hilo${comentarios.length ? ' · ' + comentarios.length : ''}`)),
      h('button.tag', { onclick: () => hojaNota(t) }, 'Añadir nota'),
    ),
  );

  if (!comentarios.length) {
    bloque.append(h('p.hint', { style: { marginTop: '4px' } },
      'Aquí quedan los rechazos y las notas que se vayan añadiendo.'));
    return bloque;
  }

  const hilo = h('div.hilo', { style: { marginTop: '10px' } });
  for (const c of comentarios) {
    const fotos = mediosPorComentario.get(c.id) || [];
    hilo.append(h('div.mensaje', { class: c.tipo === 'rechazo' ? 'rechazo' : '' },
      h('div.mensaje-cab', null,
        c.tipo === 'rechazo' ? h('span.tag.rojo', null, 'Rechazo') : null,
        h('span.mensaje-autor', null, c.creadoPorNombre),
        c.creadoPorEmpresa ? h('span.mensaje-empresa', null, c.creadoPorEmpresa) : null,
        h('span.mensaje-fecha', null, `${fechaCorta(c.creado)} · ${hora(c.creado)}`),
      ),
      c.texto ? h('p.mensaje-texto', null, c.texto) : null,
      fotos.length ? h('div.rail', { style: { marginTop: '9px' } },
        fotos.map((m) => {
          const url = store.urlDeMedio(m);
          return h('div.m', {
            role: 'button', tabindex: '0',
            style: url ? { backgroundImage: `url("${url}")` } : null,
            onclick: () => url && openViewer(h('img', { src: url, alt: '' })),
          });
        }),
      ) : null,
    ));
  }
  bloque.append(hilo);
  return bloque;
}

/** Nota suelta en el hilo, sin cambiar el estado. */
function hojaNota(t) {
  return sheet((cerrar) => {
    const area = h('textarea.textarea', { rows: 4, placeholder: 'Escribe una nota para el hilo…' });
    setTimeout(() => area.focus(), 320);
    return [
      h('h2.title', null, 'Nueva nota'),
      area,
      h('button.btn.accent.full', {
        onclick: async () => {
          const texto = area.value.trim();
          if (!texto) return;
          await store.añadirComentario(t.id, { texto, tipo: 'nota' });
          cerrar(true);
          toast('Nota añadida');
          refrescar();
        },
      }, 'Añadir al hilo'),
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
}

/* ─── Acciones ────────────────────────────────────────────────── */
function editarTexto(t) {
  return sheet((cerrar) => {
    const area = h('textarea.textarea', { rows: 6 });
    area.value = t.texto || '';
    setTimeout(() => area.focus(), 320);
    return [
      h('h2.title', null, 'Descripción de la tarea'),
      area,
      h('button.btn.accent.full', {
        onclick: async () => {
          await store.actualizarTarea(t.id, { texto: area.value.trim() });
          cerrar(true);
          toast('Texto actualizado');
          refrescar();
        },
      }, 'Guardar'),
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
}

/**
 * Gremio y estancia en la misma hoja: se corrigen juntos porque los dos
 * se ponen al vuelo mientras se anda por la casa, y equivocarse en uno
 * suele ir con equivocarse en el otro.
 *
 * El gremio no se puede dejar vacío —de él tiran los filtros— y la
 * estancia sí: se quita volviendo a tocar el chip que está puesto.
 */
function editarEstancia(t) {
  return sheet((cerrar) => {
    let gremio = t.oficio || OFICIOS[0].id;
    let zona = t.zona || '';

    const marcar = (caja, valor) => [...caja.children].forEach((c) =>
      c.setAttribute('aria-pressed', c.dataset.v === valor && valor ? 'true' : 'false'));

    const gremios = h('div.chips.filtro', null,
      ...OFICIOS.map((o) => h('button.chip.accent', {
        'data-v': o.id,
        'aria-pressed': gremio === o.id ? 'true' : 'false',
        onclick: () => { gremio = o.id; marcar(gremios, gremio); },
      }, o.corto)),
    );

    const estancias = h('div.chips.filtro', null,
      ...ZONAS.map((z) => h('button.chip.accent', {
        'data-v': z,
        'aria-pressed': zona === z ? 'true' : 'false',
        onclick: () => { zona = zona === z ? '' : z; marcar(estancias, zona); },
      }, z)),
    );

    return [
      h('h2.title', null, 'Gremio y estancia'),
      h('p.eyebrow', { style: { marginTop: '10px' } }, 'Gremio'),
      gremios,
      h('p.eyebrow', { style: { marginTop: '14px' } }, 'Estancia · opcional'),
      estancias,
      h('button.btn.accent.full', {
        style: { marginTop: '14px' },
        onclick: async () => {
          await store.actualizarTarea(t.id, { oficio: gremio, zona });
          cerrar(true);
          toast(zona ? `Guardado · ${zona}` : 'Guardado');
          refrescar();
        },
      }, 'Guardar'),
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
}

/** Reescala, guarda y repinta. Lo comparten los dos sitios desde los
 *  que se añaden fotos: el «+» del carrete y el botón de abajo. */
async function guardarFotos(t, ficheros) {
  if (!ficheros?.length) return;
  toast('Preparando…');
  let puestas = 0;
  for (const f of ficheros) {
    try {
      const img = await media.prepararImagen(f);
      await store.añadirMedio(t.id, { tipo: 'imagen', blob: img.blob, mime: img.mime, ancho: img.ancho, alto: img.alto });
      puestas++;
    } catch { toast('No se pudo leer una de las fotos', 'err'); }
  }
  if (!puestas) return;
  toast(puestas > 1 ? `${puestas} fotos añadidas` : 'Foto añadida');
  refrescar();
}

async function añadirVideo(t) {
  const origen = await sheet((cerrar) => [
    h('h2.title', null, 'Añadir vídeo'),
    h('p.sub', null, 'Vídeos cortos, de menos de 80 MB. Se suben cuando haya conexión.'),
    h('div.stack', null,
      h('button.row', { onclick: () => cerrar('camara') },
        h('div.row-lead', null, icon('video', 18)),
        h('div.grow', null, h('div.row-title', null, 'Grabar ahora')),
      ),
      h('button.row', { onclick: () => cerrar('galeria') },
        h('div.row-lead', null, icon('image', 18)),
        h('div.grow', null, h('div.row-title', null, 'Elegir uno del carrete')),
      ),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
  ]);
  if (!origen) return;
  const [f] = origen === 'camara' ? await media.grabarVideo() : await media.elegirVideo();
  if (!f) return;
  toast('Preparando el vídeo…');
  const v = await media.prepararVideo(f);
  if (!v) return;
  await store.añadirMedio(t.id, { tipo: 'video', ...v });
  toast('Vídeo añadido');
  refrescar();
}

async function añadirAudio(t) {
  const a = await media.grabarAudio();
  if (!a) return;
  await store.añadirMedio(t.id, { tipo: 'audio', ...a });
  toast('Nota de voz añadida');
  refrescar();
}

async function menuTarea(t, listaId) {
  const visuales = (await store.mediosDeTarea(t.id)).filter((m) => m.tipo !== 'audio');
  const accion = await sheet((cerrar) => [
    h('h2.title', null, 'Tarea'),
    h('div.stack', null,
      h('button.row', { onclick: () => cerrar('texto') },
        h('div.row-lead', null, icon('edit', 18)),
        h('div.grow', null, h('div.row-title', null, 'Editar la descripción')),
      ),
      visuales.length > 1 ? h('button.row', { onclick: () => cerrar('portada') },
        h('div.row-lead', null, icon('image', 18)),
        h('div.grow', null,
          h('div.row-title', null, 'Elegir la foto del listado'),
          h('div.row-sub', null, 'La que se ve sin abrir la tarea'),
        ),
      ) : null,
      visuales.length ? h('button.row.danger', { onclick: () => cerrar('borrar-medio') },
        h('div.row-lead', null, icon('trash', 18)),
        h('div.grow', null, h('div.row-title', null, 'Borrar una foto o vídeo')),
      ) : null,
      h('button.row.danger', { onclick: () => cerrar('borrar') },
        h('div.row-lead', null, icon('trash', 18)),
        h('div.grow', null, h('div.row-title', null, 'Borrar la tarea entera')),
      ),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
  ]);

  if (accion === 'texto') return editarTexto(t);

  if (accion === 'portada' || accion === 'borrar-medio') {
    const elegido = await sheet((cerrar) => [
      h('h2.title', null, accion === 'portada' ? 'Foto del listado' : 'Borrar material'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '9px' } },
        visuales.map((m) => {
          const url = store.urlDeMedio(m);
          return h('button', {
            style: {
              aspectRatio: '1', borderRadius: '13px', overflow: 'hidden',
              background: url && m.tipo === 'imagen' ? `#e7e7e3 url("${url}") center / cover` : 'var(--surface)',
              boxShadow: m.id === t.portadaId ? '0 0 0 2.5px var(--accent)' : 'none',
              display: 'grid', placeItems: 'center',
            },
            onclick: () => cerrar(m.id),
          }, m.tipo === 'video' ? icon('play', 22) : null);
        }),
      ),
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
    ]);
    if (!elegido) return;
    if (accion === 'portada') {
      await store.fijarPortada(t.id, elegido);
      toast('Portada actualizada');
    } else {
      if (!await confirmSheet({ title: '¿Borrar este material?', ok: 'Borrar', danger: true })) return;
      await store.borrarMedio(elegido);
      toast('Material borrado');
    }
    return refrescar();
  }

  if (accion === 'borrar') {
    if (!await confirmSheet({
      title: '¿Borrar la tarea?',
      text: 'Se borrarán también sus fotos, vídeos y notas de voz.',
      ok: 'Borrar', danger: true,
    })) return;
    await store.borrarTarea(t.id);
    toast('Tarea borrada');
    ir(conFiltros('#/l/' + listaId, filtrosDeRuta()));
  }
}
