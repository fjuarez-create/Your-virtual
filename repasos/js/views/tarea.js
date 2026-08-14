/* Detalle de una tarea: la foto en grande, el texto completo y el resto
   de material de apoyo (más fotos, vídeo y notas de voz). */
import { h, icon, sheet, toast, confirmSheet, openViewer, fechaCorta, hora, pesoLegible } from '../ui.js';
import { ESTADOS, estado, unidad } from '../catalog.js';
import * as store from '../store.js';
import * as media from '../media.js';
import { cabecera } from '../piezas.js';
import { ir, refrescar } from '../app.js';

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
    rail.append(h('button.add', { 'aria-label': 'Añadir material', onclick: () => añadirMaterial(t) }, icon('plus')));
    marcarRail = () => {
      [...rail.querySelectorAll('.m')].forEach((c, i) =>
        c.setAttribute('aria-current', actual && visuales[i]?.id === actual.id ? 'true' : 'false'));
    };
  };
  pintarRail();
  pintarHero();

  /* ─── Estado ─── */
  const chipsEstado = h('div.chips', null,
    ESTADOS.map((e) => h('button.chip', {
      'aria-pressed': t.estado === e.id ? 'true' : 'false',
      onclick: async () => {
        if (t.estado === e.id) return;
        await store.actualizarTarea(t.id, { estado: e.id });
        toast('Marcada como ' + e.nombre.toLowerCase());
        refrescar();
      },
    }, e.nombre)),
  );

  const e = estado(t.estado);

  return {
    sinTabs: true,
    contenido: [
      cabecera(
        `Tarea ${indice + 1} de ${hermanas.length}`,
        u ? `${u.nombre} · ${fechaCorta(lista.creado)}` : '',
        {
          volverA: '#/l/' + listaId,
          acciones: [h('button.icon-btn', {
            'aria-label': 'Opciones', onclick: () => menuTarea(t, listaId),
          }, icon('gear'))],
        },
      ),

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

      h('div', { style: { marginTop: '20px' } },
        h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Estado'),
        chipsEstado,
        t.estado !== 'pendiente' && t.estadoPor
          ? h('p.hint', null, `${e.nombre} por ${t.estadoPor} el ${fechaCorta(t.estadoEn)} a las ${hora(t.estadoEn)}`)
          : null,
      ),

      audios.length ? h('div', { style: { marginTop: '20px' } },
        h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Notas de voz'),
        h('div.stack', null, audios.map((m) => filaAudio(m, t))),
      ) : null,

      h('div', { style: { marginTop: '22px' } },
        h('p.eyebrow', { style: { marginBottom: '10px' } }, 'Añadir material'),
        h('div.btn-row', null,
          h('button.btn', { onclick: () => añadirFoto(t) }, icon('camera'), 'Foto'),
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
    h('button.btn.ghost', { disabled: !anterior, onclick: () => ir(`#/l/${listaId}/t/${anterior.id}`) },
      icon('arrowLeft'), 'Anterior'),
    h('button.btn.ghost', { disabled: !siguiente, onclick: () => ir(`#/l/${listaId}/t/${siguiente.id}`) },
      'Siguiente', icon('arrowRight')),
  );
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

async function añadirFoto(t) {
  const origen = await sheet((cerrar) => [
    h('h2.title', null, 'Añadir foto'),
    h('div.stack', null,
      h('button.row', { onclick: () => cerrar('camara') },
        h('div.row-lead', null, icon('camera', 18)),
        h('div.grow', null, h('div.row-title', null, 'Hacer una foto')),
      ),
      h('button.row', { onclick: () => cerrar('galeria') },
        h('div.row-lead', null, icon('image', 18)),
        h('div.grow', null, h('div.row-title', null, 'Elegir de la galería')),
      ),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
  ]);
  if (!origen) return;
  const ficheros = origen === 'camara' ? await media.hacerFoto() : await media.elegirFotos();
  if (!ficheros.length) return;
  toast('Preparando…');
  for (const f of ficheros) {
    try {
      const img = await media.prepararImagen(f);
      await store.añadirMedio(t.id, { tipo: 'imagen', blob: img.blob, mime: img.mime, ancho: img.ancho, alto: img.alto });
    } catch { toast('No se pudo añadir una de las fotos', 'err'); }
  }
  toast('Foto añadida');
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
    ir('#/l/' + listaId);
  }
}
