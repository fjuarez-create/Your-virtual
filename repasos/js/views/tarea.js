/* Detalle de una tarea: la foto en grande, el texto completo y el resto
   de material de apoyo (más fotos, vídeo y notas de voz). */
import { h, icon, sheet, toast, confirmSheet, openViewer, fechaCorta, hora, pesoLegible } from '../ui.js';
import {
  ESTADOS, ZONAS, OFICIOS, estado, oficio, unidad, estadosPermitidos, rebotada, puedeVerificar,
  TOPE_FOTOS_TAREA, TOPE_FOTOS_VERIFICACION,
} from '../catalog.js';
import * as store from '../store.js';
import * as media from '../media.js';
import { ctaAccion, hojaBienHecho, hojaFotoAcciones, caraDeGremio } from '../piezas.js';
import { alCompletar, nombreCorto } from '../frases.js';
import { ir, refrescar, conFiltros, filtrosDeRuta } from '../app.js';

export async function render({ listaId, tareaId }) {
  const t = await store.tarea(tareaId);
  if (!t) { toast('La tarea ya no existe', 'err'); ir('#/l/' + listaId, { reemplazar: true }); return { contenido: [] }; }

  const lista = await store.lista(listaId);
  const u = lista ? unidad(lista.unidadId) : null;
  const rutaVilla = lista && u
    ? conFiltros(`#/p/${lista.promoId}/v/${String(lista.unidadId).split(':')[1]}`, filtrosDeRuta())
    : '#/viviendas';
  const medios = await store.mediosDeTarea(tareaId);
  const visuales = medios.filter((m) => m.tipo !== 'audio');
  const audios = medios.filter((m) => m.tipo === 'audio');
  const hermanas = await store.tareasDeLista(listaId);
  const indice = hermanas.findIndex((x) => x.id === tareaId);

  const arregladas = await store.fotosDeVerificacion(tareaId);
  const comentarios = await store.comentariosDeTarea(tareaId);
  const mediosPorComentario = new Map();
  for (const c of comentarios) mediosPorComentario.set(c.id, await store.mediosDeComentario(c.id));

  const yo = store.sesion();
  const permitidos = estadosPermitidos(yo);
  // Un verificador puede editar una tarea aunque ya esté verificada: el
  // permiso manda sobre el estado.
  const edita = puedeVerificar(yo);
  const e = estado(t.estado);

  /* ─── La foto grande y sus miniaturas ─── */
  let actual = visuales.find((m) => m.id === t.portadaId) || visuales[0] || null;
  const hero = h('div.d-foto');
  const pintarHero = () => {
    hero.replaceChildren();
    if (!actual) {
      hero.append(h('div', { style: { display: 'grid', placeItems: 'center', height: '100%', color: 'var(--d-gris)' } },
        h('div', { style: { textAlign: 'center' } }, icon('image', 30), h('p', { style: { marginTop: '8px', fontSize: '14px' } }, 'Sin imagen'))));
      return;
    }
    const url = store.urlDeMedio(actual);
    if (!url) {
      hero.append(h('div', { style: { display: 'grid', placeItems: 'center', height: '100%', color: 'var(--d-gris)' } }, icon('cloudOff', 30)));
      return;
    }
    if (actual.tipo === 'video') {
      hero.append(h('video', { src: url, controls: true, playsinline: true, preload: 'metadata' }));
    } else {
      hero.append(h('img', { src: url, alt: t.texto || 'Foto del repaso', loading: 'eager' }));
      hero.onclick = () => openViewer(h('img', { src: url, alt: '' }));
    }
  };
  pintarHero();

  const minis = h('div.d-minis', { style: { marginTop: '12px' } });
  const pintarMinis = () => {
    minis.replaceChildren(...visuales.map((m) => {
      const url = store.urlDeMedio(m);
      return h('div.d-mini', {
        role: 'button', tabindex: '0',
        'aria-current': actual && m.id === actual.id ? 'true' : 'false',
        style: url && m.tipo === 'imagen' ? { backgroundImage: `url("${url}")` } : null,
        onclick: () => { actual = m; pintarHero(); pintarMinis(); },
      }, m.tipo === 'video' ? h('span.k', null, icon('play')) : null);
    }));
    // El «+» del carrete: añadir otra foto del defecto por la hoja del
    // diseño (hacer foto o galería).
    minis.append(h('button.d-mini', {
      'aria-label': 'Añadir una foto',
      style: { display: 'grid', placeItems: 'center', color: 'var(--d-gris)', background: '#fff' },
      onclick: () => hojaFotoAcciones((ficheros) => guardarFotos(t, ficheros)),
    }, icon('plus')));
  };
  pintarMinis();

  /* ─── Completar la tarea, como lo dibuja el diseño ─── */
  const puedeCompletar = permitidos.some((op) => op.id === 'resuelta')
    && (t.estado === 'pendiente' || t.estado === 'rechazada');

  const fotosNuevas = [];
  const minisParte = h('div.d-minis', { style: { display: 'none' } });
  const darBtn = h('button.d-boton-negro', { disabled: true }, 'Dar por completada');
  const pintarParte = () => {
    minisParte.replaceChildren(...fotosNuevas.map((img, i) => {
      const url = URL.createObjectURL(img.blob);
      return h('div.d-mini', {
        style: { backgroundImage: `url("${url}")` },
        role: 'button', 'aria-label': 'Ver la foto',
        onclick: (ev) => { if (ev.target.closest('.d-foto-papelera')) return; openViewer(h('img', { src: url, alt: '' })); },
      }, h('button.d-foto-papelera', {
        'aria-label': 'Quitar esta foto',
        onclick: async () => {
          if (!await confirmSheet({
            title: '¿Quitar esta foto?',
            text: 'Se quita de este parte. Todavía no se ha subido nada.',
            ok: 'Quitarla', danger: true,
          })) return;
          fotosNuevas.splice(i, 1);
          pintarParte();
        },
      }, icon('trash')));
    }));
    minisParte.style.display = fotosNuevas.length ? 'flex' : 'none';
    darBtn.disabled = !fotosNuevas.length;
  };
  const meterFotos = async (ficheros) => {
    const hueco = TOPE_FOTOS_VERIFICACION - fotosNuevas.length;
    if (hueco <= 0) { toast('Diez fotos es el tope', 'err'); return; }
    toast('Preparando…');
    let fallos = 0;
    for (const fich of [...ficheros].slice(0, hueco)) {
      try { fotosNuevas.push(await media.prepararImagen(fich)); } catch { fallos++; }
    }
    if (fallos) toast(`${fallos} ${fallos === 1 ? 'foto no se pudo leer' : 'fotos no se pudieron leer'}`, 'err');
    pintarParte();
  };

  // La caja de mensaje: el avión manda una nota al hilo; el texto que
  // quede escrito al dar por completada viaja además con el parte.
  const cajaMensaje = h('input', { type: 'text', placeholder: 'Escribe un mensaje...', autocapitalize: 'sentences' });
  const mandarNota = h('button.d-escribir-mandar', {
    'aria-label': 'Enviar', disabled: true,
    onclick: async () => {
      const texto = cajaMensaje.value.trim();
      if (!texto) return;
      await store.añadirComentario(t.id, { texto, tipo: 'nota' });
      cajaMensaje.value = '';
      toast('Añadido al hilo');
      refrescar();
    },
  }, icon('avionPapel'));
  cajaMensaje.addEventListener('input', () => { mandarNota.disabled = !cajaMensaje.value.trim(); });
  cajaMensaje.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') mandarNota.click(); });

  darBtn.addEventListener('click', async () => {
    if (!fotosNuevas.length) return;
    try {
      await store.cambiarEstado(t.id, 'resuelta', { texto: cajaMensaje.value.trim(), imagenes: fotosNuevas });
      await hojaBienHecho({
        titulo: `Excelente${nombreCorto(yo) ? ', ' + nombreCorto(yo) : ''}`,
        frase: alCompletar(),
        usuario: yo,
        boton: u ? `Volver a ${u.nombre}` : 'Volver a la vivienda',
      });
      ir(rutaVilla);
    } catch (err) { toast(err.message, 'err'); }
  });

  const seccionCompletar = puedeCompletar ? [
    h('p.d-epigrafe', null, edita ? 'Completar tarea' : 'Comentar o completar'),
    h('div.d-escribir.d-chat', { style: { marginTop: '0' } },
      cajaMensaje, mandarNota),
    h('button.d-fantasma', {
      onclick: () => hojaFotoAcciones(meterFotos),
    }, icon('plus'), 'Añadir fotos de verificación'),
    minisParte,
    darBtn,
  ] : [];

  /* ─── El estado, para quien verifica ─── */
  const chipsEstado = edita ? h('div.chips.filtro', null,
    permitidos.map((op) => h('button.chip', {
      'aria-pressed': t.estado === op.id ? 'true' : 'false',
      onclick: () => cambiarEstadoTarea(t, op.id, listaId),
    }, op.nombre)),
  ) : null;

  /* ─── El chip del gremio y la pastilla de la estancia ─── */
  const o = oficio(t.oficio);
  const caraGremio = caraDeGremio(o, 36);
  const abrirEdicion = edita ? () => editarEstancia(t) : null;

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      h('div.d-cab-dentro', null,
        h('button.d-bola', { 'aria-label': 'Volver', onclick: () => ir(rutaVilla) }, icon('arrowLeft')),
        h('div.d-titulo', null, u ? u.nombre : `Tarea ${indice + 1}`),
        h('button.d-bola', { 'aria-label': 'Más opciones', onclick: () => menuTarea(t, listaId) }, icon('puntos')),
      ),

      rebotada(t) ? avisoRechazo(comentarios) : null,

      hero,
      minis,

      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' } },
        h(abrirEdicion ? 'button.d-chip-gremio' : 'span.d-chip-gremio', { onclick: abrirEdicion },
          caraGremio, o.nombre),
        h(abrirEdicion ? 'button.d-pastilla' : 'span.d-pastilla', { onclick: abrirEdicion },
          t.zona || 'Sin estancia'),
      ),

      h('div.d-pastilla.ancha', { style: { marginTop: '8px' } },
        h('span', null, fechaLarga(t.fechaLimite || t.creado)), icon('calendario')),

      h(edita ? 'button.d-caja' : 'div.d-caja', {
        style: { marginTop: '8px' },
        onclick: edita ? () => editarTexto(t) : null,
      }, t.texto || 'Sin descripción.'),

      t.estado !== 'pendiente' && t.estadoPor
        ? h('p', { style: { fontSize: '14px', color: 'var(--d-gris)', margin: '10px 2px 0' } },
            `${e.nombre} por ${t.estadoPor} el ${fechaCorta(t.estadoEn)} a las ${hora(t.estadoEn)}`)
        : null,

      ...seccionCompletar,

      chipsEstado ? h('p.d-epigrafe', null, 'Estado') : null,
      chipsEstado,

      arregladas.length ? h('p.d-epigrafe', null, `Cómo ha quedado · ${arregladas.length}`) : null,
      arregladas.length ? h('div.d-minis', null, arregladas.map((m) => {
        const url = store.urlDeMedio(m);
        return h('div.d-mini', {
          style: { backgroundImage: url ? `url("${url}")` : '' },
          role: 'button', 'aria-label': 'Ver la foto del arreglo',
          onclick: () => (url ? openViewer(h('img', { src: url, alt: '' })) : null),
        });
      })) : null,

      hiloDeTarea(t, comentarios, mediosPorComentario),

      audios.length ? h('div', { style: { marginTop: '20px' } },
        h('p.d-epigrafe', null, 'Notas de voz'),
        h('div.stack', null, audios.map((m) => filaAudio(m, t))),
      ) : null,

      h('div', { style: { marginTop: '20px' } },
        h('p.d-epigrafe', null, 'Añadir material'),
        h('div.btn-row', { style: { marginTop: '10px' } },
          media.botonFichero({
            clase: 'btn', accept: 'image/*', multiple: true,
            onElegir: (ficheros) => guardarFotos(t, ficheros),
          }, icon('camera'), 'Foto'),
          h('button.btn', { onclick: () => añadirVideo(t) }, icon('video'), 'Vídeo'),
          h('button.btn', { onclick: () => añadirAudio(t) }, icon('mic'), 'Voz'),
        ),
      ),

      h('p', { style: { fontSize: '14px', color: 'var(--d-gris)', marginTop: '20px' } },
        `Creada por ${t.creadoPorNombre} el ${fechaCorta(t.creado)} a las ${hora(t.creado)}.`),

      navegacionHermanas(hermanas, indice, listaId),
    ],
  };
}

/** La fecha del diseño: «19 noviembre, 2026». */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLarga(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]}, ${d.getFullYear()}`;
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
async function cambiarEstadoTarea(t, nuevo, listaId) {
  if (t.estado === nuevo) return;

  try {
    if (store.exigeExplicacion(t, nuevo)) {
      const nota = await hojaRechazo(t);
      if (!nota) return;
      await store.cambiarEstado(t.id, nuevo, nota);
      toast('Rechazada. La constructora la verá arriba del todo');
      return refrescar();
    }

    if (store.exigeFotos(t, nuevo)) {
      const parte = await hojaCompletar(t);
      if (!parte) return;
      await store.cambiarEstado(t.id, nuevo, parte);
      const yo = store.sesion();
      await hojaBienHecho({
        titulo: `Excelente${nombreCorto(yo) ? ', ' + nombreCorto(yo) : ''}`,
        frase: alCompletar(),
        usuario: yo,
        boton: 'Volver a la vivienda',
      });
      // Al terminar se sale de la tarea: el sitio del que se viene es
      // el detalle de la vivienda, y quedarse mirando la que ya está
      // hecha no ayuda a hacer la siguiente.
      ir(conFiltros('#/l/' + listaId, filtrosDeRuta()));
      return;
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

/**
 * Hoja de dar por completada: fotos obligatorias y mensaje opcional.
 *
 * Es la regla más dura de la app y la que menos discusión tiene: sin
 * enseñar la reparación no se puede decir que está arreglada. Con una
 * foto ya se activa el botón —no hay que documentar una obra, hay que
 * demostrar un remate— y caben diez.
 *
 * Las fotos de aquí no se mezclan con las de la tarea: aquellas son el
 * defecto y estas son cómo quedó. Van colgadas del comentario que
 * genera este parte, así que si la tarea rebota y se vuelve a
 * completar, las de este intento se quedan donde están.
 */
function hojaCompletar(t) {
  return sheet((cerrar) => {
    const fotos = [];

    const carrete = h('div.rail');
    const aviso = h('p.hint');
    const dar = ctaAccion('DAR POR COMPLETADA', { icono: 'check' });

    const mensaje = h('textarea.textarea', {
      rows: 2, autocapitalize: 'sentences',
      placeholder: 'Algo que contar sobre el arreglo… (opcional)',
    });

    const pintar = () => {
      carrete.replaceChildren(...fotos.map((img, i) => {
        const url = URL.createObjectURL(img.blob);
        const quitar = h('button.rail-x', {
          'aria-label': 'Quitar esta foto',
          onclick: async () => {
            if (!await confirmSheet({
              title: '¿Quitar esta foto?',
              text: 'Se quita de este parte. Todavía no se ha subido nada.',
              ok: 'Quitarla', danger: true,
            })) return;
            fotos.splice(i, 1);
            pintar();
          },
        }, icon('x', 13));
        return h('div.m', {
          style: { backgroundImage: `url("${url}")`, position: 'relative' },
          role: 'button', 'aria-label': 'Ver la foto',
          onclick: (e) => { if (e.target !== quitar && !quitar.contains(e.target)) openViewer(h('img', { src: url, alt: '' })); },
        }, quitar);
      }));
      carrete.style.display = fotos.length ? 'flex' : 'none';

      dar.disabled = !fotos.length;
      aviso.className = 'hint';
      aviso.textContent = !fotos.length
        ? 'Haz al menos una foto del arreglo para poder darla por completada.'
        : `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'} de ${TOPE_FOTOS_VERIFICACION}.`;
    };

    const meter = async (ficheros) => {
      const hueco = TOPE_FOTOS_VERIFICACION - fotos.length;
      if (hueco <= 0) { toast(`Diez fotos es el tope`, 'err'); return; }
      toast('Preparando…');
      let fallos = 0;
      for (const f of [...ficheros].slice(0, hueco)) {
        try { fotos.push(await media.prepararImagen(f)); } catch { fallos++; }
      }
      if (fallos) toast(`${fallos} ${fallos === 1 ? 'foto no se pudo leer' : 'fotos no se pudieron leer'}`, 'err');
      pintar();
    };

    // Cámara y galería por separado, como en el resto de la app: en obra
    // casi siempre es la cámara, pero a veces la foto ya está hecha.
    const hacer = media.botonFichero({
      clase: 'btn accent grow', accept: 'image/*', capture: 'environment', multiple: true,
      onElegir: meter,
    }, icon('camera'), 'Hacer foto');
    const elegir = media.botonFichero({
      clase: 'btn grow', accept: 'image/*', multiple: true, onElegir: meter,
    }, icon('image'), 'Galería');

    dar.addEventListener('click', () => {
      if (!fotos.length) return;
      cerrar({ texto: mensaje.value.trim(), imagenes: fotos });
    });

    pintar();

    return [
      h('h2.title', null, 'Dar por completada'),
      h('p.sub', null, 'Enseña cómo ha quedado. Sin foto del arreglo no se puede completar: quien venga a verificarla tiene que saber qué va a encontrarse.'),
      carrete,
      h('div.btn-row', { style: { marginTop: '12px' } }, hacer, elegir),
      h('p.eyebrow', { style: { marginTop: '16px' } }, 'Mensaje · opcional'),
      mensaje,
      aviso,
      dar,
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
    ];
  });
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

  // El tope se cuenta contra lo que ya hay guardado, no contra lo que
  // se acaba de elegir: si no, tres tandas de cinco pasarían de diez
  // sin que nadie lo notara.
  const yaHay = (await store.mediosDeTarea(t.id)).filter((m) => m.tipo === 'imagen').length;
  const hueco = TOPE_FOTOS_TAREA - yaHay;
  if (hueco <= 0) {
    toast(`Esta tarea ya tiene ${TOPE_FOTOS_TAREA} fotos`, 'err');
    return;
  }
  if (ficheros.length > hueco) {
    toast(`Caben ${hueco} ${hueco === 1 ? 'foto más' : 'fotos más'}: se guardan esas`);
  }

  toast('Preparando…');
  let puestas = 0;
  for (const f of [...ficheros].slice(0, hueco)) {
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

/**
 * No hay tarea sin foto, jamás.
 *
 * Si al borrar material la tarea se queda sin ninguna imagen, no se
 * sigue adelante como si nada: se pide otra ahí mismo, sin volver a la
 * pantalla. Una tarea sin foto es una frase suelta que nadie puede
 * comprobar, y la que la escribió ya no está delante del defecto.
 *
 * Se puede salir sin poner ninguna —bloquear la pantalla sería peor—
 * pero se dice claramente qué queda mal.
 */
async function reponerFoto(t) {
  const quedan = (await store.mediosDeTarea(t.id)).filter((m) => m.tipo === 'imagen');
  if (quedan.length) return;

  const origen = await sheet((cerrar) => [
    h('h2.title', null, 'Esta tarea se ha quedado sin foto'),
    h('p.sub', null, 'Una tarea sin foto no se puede comprobar en obra. Saca otra ahora o elige una de la galería.'),
    h('div.stack', { style: { marginTop: '14px' } },
      media.botonFichero({
        clase: 'row', accept: 'image/*', capture: 'environment',
        onElegir: (fs) => cerrar(fs),
      }, h('div.row-lead', null, icon('camera', 18)),
        h('div.grow', null, h('div.row-title', null, 'Hacer una foto'))),
      media.botonFichero({
        clase: 'row', accept: 'image/*', multiple: true,
        onElegir: (fs) => cerrar(fs),
      }, h('div.row-lead', null, icon('image', 18)),
        h('div.grow', null, h('div.row-title', null, 'Elegir de la galería'))),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Ahora no'),
  ]);

  if (!origen?.length) {
    toast('La tarea se queda sin foto. Añádele una en cuanto puedas.', 'err');
    return;
  }
  await guardarFotos(t, origen);
}

async function menuTarea(t, listaId) {
  const visuales = (await store.mediosDeTarea(t.id)).filter((m) => m.tipo !== 'audio');
  // Editar y borrar son del verificador. Cambiar la portada y quitar
  // material siguen siendo de todos: eso es mantenimiento del carrete,
  // no cambiar lo que dice el acta.
  const edita = puedeVerificar(store.sesion());
  const accion = await sheet((cerrar) => [
    h('h2.title', null, 'Tarea'),
    h('div.stack', null,
      edita ? h('button.row', { onclick: () => cerrar('texto') },
        h('div.row-lead', null, icon('edit', 18)),
        h('div.grow', null, h('div.row-title', null, 'Editar la descripción')),
      ) : null,
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
      edita ? h('button.row.danger', { onclick: () => cerrar('borrar') },
        h('div.row-lead', null, icon('trash', 18)),
        h('div.grow', null, h('div.row-title', null, 'Borrar la tarea entera')),
      ) : null,
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
      await reponerFoto(t);
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
