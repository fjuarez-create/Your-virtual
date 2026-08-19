/* La ficha de una tarea, calcada del Figma.

   El título dice el estado —«Tarea pendiente»— y no de qué casa es:
   quien abre esto viene de una lista donde ya sabía la casa, y lo que
   necesita saber al entrar es si esto está por hacer, hecho o dado por
   bueno. La casa sigue ahí, en su chip.

   Abajo, lo que cada uno puede hacer. La obra completa; la dirección
   facultativa verifica o rechaza. Nunca los dos botones a la vez para
   la misma persona: si quien arregla es quien da por bueno, el
   porcentaje de la obra deja de significar nada. */
import { h, icon, sheet, toast, confirmSheet, openViewer, fechaCorta, hora, pesoLegible } from '../ui.js';
import {
  ZONAS, OFICIOS, estado, oficio, unidad, rebotada, puedeVerificar, imagenDeOficio,
  TOPE_FOTOS_TAREA, TOPE_FOTOS_VERIFICACION,
} from '../catalog.js';
import * as store from '../store.js';
import * as media from '../media.js';
import { hojaBienHecho, hojaFotoAcciones, cuandoTarea } from '../piezas.js';
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
  const verifica = puedeVerificar(yo);
  const e = estado(t.estado);

  /* ─── Quién puede tocar qué ───
     La obra completa y la dirección facultativa verifica: son dos
     manos distintas a propósito, porque si quien arregla es quien da
     por bueno, el porcentaje de la obra no dice nada. La DF puede
     verificar también una tarea que sigue pendiente —si ve el remate
     hecho, no tiene sentido dejarla ensuciando la lista esperando a
     que alguien la marque—. */
  const puedeCompletar = !verifica && (t.estado === 'pendiente' || t.estado === 'rechazada');
  const puedeVerificarla = verifica && t.estado !== 'verificada';
  const puedeRechazarla = verifica && t.estado === 'resuelta';
  // Editar y borrar, solo quien la creó y el superadministrador.
  const suya = store.esMio(t) || store.esAdmin();

  /* ─── Las fotos del remate: una grande, o las dos apiladas ─── */
  const caja = h('div.d-fotos-tarea');
  const pintarFotos = () => {
    // Ninguna tarea sin foto. Las viejas, creadas antes de que fuera
    // obligatoria, enseñan la del oficio con su letrero: rellena el
    // hueco y a la vez dice lo que es, para que nadie la confunda con
    // el remate ni la use como prueba de nada.
    if (!visuales.length) {
      const ruta = imagenDeOficio(t.oficio);
      caja.replaceChildren(
        h('div.d-foto-tarea.generica', ruta ? { style: { backgroundImage: `url("${ruta}")` } } : null,
          ruta ? null : icon('image', 30)),
        h('p.d-foto-aviso', null, 'Esta tarea se creó sin foto. La imagen es del oficio, no del remate.'),
      );
      return;
    }
    caja.replaceChildren(...visuales.map((m) => {
      const url = store.urlDeMedio(m);
      if (!url) {
        return h('div.d-foto-tarea', { style: { display: 'grid', placeItems: 'center', color: 'var(--d-gris)' } },
          icon('cloudOff', 30));
      }
      if (m.tipo === 'video') {
        return h('div.d-foto-tarea', null,
          h('video', { src: url, controls: true, playsinline: true, preload: 'metadata' }));
      }
      return h('div.d-foto-tarea', {
        onclick: (ev) => { if (ev.target.closest('.d-foto-papelera')) return; openViewer(h('img', { src: url, alt: '' })); },
      },
        h('img', { src: url, alt: t.texto || 'Foto del remate', loading: 'eager' }),
        suya ? h('button.d-foto-papelera', {
          'aria-label': 'Borrar esta foto',
          onclick: async () => {
            if (!await confirmSheet({ title: '¿Borrar esta foto?', ok: 'Borrar', danger: true })) return;
            await store.borrarMedio(m.id);
            refrescar();
          },
        }, icon('trash')) : null,
      );
    }));
  };
  pintarFotos();

  /* ─── La fila de chips: casa, estancia, oficio y la fecha ─── */
  const o = oficio(t.oficio);
  const chips = h('div.d-chips-tarea', null,
    u ? h('span.d-chip.tarea', null, u.nombre) : null,
    t.zona ? h('span.d-chip.tarea', null, t.zona) : null,
    h('span.d-chip.tarea', null, o.nombre),
    // La fecha límite solo si la hay, y solo para mirarla.
    t.fechaLimite ? h('span.d-chip.tarea.fecha', null, icon('calendario'), diaYMes(t.fechaLimite)) : null,
  );

  /* ─── Las fotos que se hacen para completar o verificar ─── */
  const fotosNuevas = [];
  const carrete = h('div.d-carrusel', { style: { display: 'none' } });
  const botonFoto = h('button.d-fantasma', {
    onclick: () => hojaFotoAcciones(meterFotos),
  }, icon('plus'), 'Añadir foto para completar tarea');
  const accion = h('button.d-boton-negro', { disabled: true },
    puedeVerificarla ? 'Verificar tarea' : 'Dar por completada');
  if (puedeVerificarla) accion.classList.add('verde');

  const pintarCarrete = () => {
    carrete.replaceChildren(...fotosNuevas.map((img, i) => {
      const url = URL.createObjectURL(img.blob);
      return h('div.celda', {
        style: { backgroundImage: `url("${url}")` },
        role: 'button', 'aria-label': 'Ver la foto',
        onclick: (ev) => { if (ev.target.closest('.d-foto-papelera')) return; openViewer(h('img', { src: url, alt: '' })); },
      }, h('button.d-foto-papelera', {
        'aria-label': 'Quitar esta foto',
        onclick: () => { fotosNuevas.splice(i, 1); pintarCarrete(); },
      }, icon('trash')));
    }));
    carrete.style.display = fotosNuevas.length ? 'flex' : 'none';
    botonFoto.replaceChildren(icon('plus'), document.createTextNode(
      fotosNuevas.length ? 'Añadir más fotos (opcional)' : (puedeVerificarla
        ? 'Añadir foto para verificar tarea'
        : 'Añadir foto para completar tarea')));
    // Sin foto no se completa ni se verifica: es la prueba, no un adorno.
    accion.disabled = !fotosNuevas.length;
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
    pintarCarrete();
  };
  pintarCarrete();

  /* ─── La caja de mensaje ─── */
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

  /**
   * Completar o verificar. Las dos exigen foto y las dos sacan de la
   * tarea al terminar: verificar es trabajo en cadena —vas bajando por
   * la lista— y quedarse dentro de la que ya está hecha obliga a dar
   * atrás una y otra vez.
   */
  accion.addEventListener('click', async () => {
    if (!fotosNuevas.length) return;
    const destino = puedeVerificarla ? 'verificada' : 'resuelta';
    accion.disabled = true;
    try {
      await store.cambiarEstado(t.id, destino, { texto: cajaMensaje.value.trim(), imagenes: fotosNuevas });
      if (destino === 'verificada') {
        toast('Verificada');
        volverALaLista();
        return;
      }
      await hojaBienHecho({
        titulo: `Excelente${nombreCorto(yo) ? ', ' + nombreCorto(yo) : ''}`,
        frase: alCompletar(),
        usuario: yo,
        boton: u ? `Volver a ${u.nombre}` : 'Volver a la vivienda',
      });
      ir(rutaVilla);
    } catch (err) { toast(err.message, 'err'); accion.disabled = false; }
  });

  const rechazar = h('button.d-boton-negro.rojo', { disabled: true }, 'Rechazar tarea');
  rechazar.addEventListener('click', async () => {
    const nota = await hojaRechazo(t);
    if (!nota) return;
    try {
      await store.cambiarEstado(t.id, 'rechazada', nota);
      toast('Rechazada. La constructora la verá arriba del todo');
      volverALaLista();
    } catch (err) { toast(err.message, 'err'); }
  });
  // Rechazar no exige foto —el motivo escrito es lo obligatorio—, así
  // que su botón está vivo desde el principio.
  rechazar.disabled = false;

  /**
   * De vuelta a la lista de la que se venía. Si se entró desde una de
   * las listas de la obra, allí; si se entró desde la vivienda, a la
   * vivienda.
   */
  const volverALaLista = () => {
    const desde = sessionStorage.getItem('lista-tareas-desde');
    ir(desde && desde.startsWith('#/tareas/') ? desde : rutaVilla);
  };

  const bloqueAccion = [];
  if (puedeCompletar || puedeVerificarla) {
    bloqueAccion.push(
      h('p.d-epigrafe', null, puedeVerificarla ? 'Verificar tarea' : 'Completar tarea'),
      h('div.d-escribir.d-chat', { style: { marginTop: '0' } }, cajaMensaje, mandarNota),
      botonFoto,
      carrete,
      accion,
    );
  }
  if (puedeRechazarla) bloqueAccion.push(rechazar);

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      h('div.d-cab-dentro', null,
        h('button.d-bola', { 'aria-label': 'Volver', onclick: () => ir(rutaVilla) }, icon('arrowLeft')),
        // El título dice en qué estado está la tarea, que es lo que
        // hay que saber al abrirla; de qué casa es ya lo dice su chip.
        h('div.d-titulo', null, `Tarea ${e.nombre.toLowerCase()}`),
        h('button.d-bola', { 'aria-label': 'Más opciones', onclick: () => menuTarea(t, listaId, suya) }, icon('puntos')),
      ),

      h('p.d-creada', null,
        `Creada por ${t.creadoPorNombre || 'alguien'}, ${cuandoTarea(t.creado).toLowerCase()}`),

      rebotada(t) ? avisoRechazo(comentarios) : null,

      caja,
      chips,

      h('p.d-epigrafe', null, 'Descripción'),
      h('div.d-caja', null, t.texto || 'Sin descripción.'),

      t.estado !== 'pendiente' && t.estadoPor
        ? h('p', { style: { fontSize: '14px', color: 'var(--d-gris)', margin: '10px 2px 0' } },
            `${e.nombre} por ${t.estadoPor} el ${fechaCorta(t.estadoEn)} a las ${hora(t.estadoEn)}`)
        : null,

      ...bloqueAccion,

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

      navegacionHermanas(hermanas, indice, listaId),
    ],
  };
}

/**
 * La fecha del chip: «19 ago». El año solo cuando no es este, que es
 * cuando aporta algo; con él siempre, los cuatro chips no caben en una
 * línea y la fila se parte.
 */
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function diaYMes(iso) {
  const d = new Date(iso);
  const corto = `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? corto : `${corto} ${d.getFullYear()}`;
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

/**
 * Nota suelta en el hilo, sin cambiar el estado.
 *
 * Es el único sitio de la app donde se puede adjuntar una imagen del
 * carrete. Las fotos que cambian el estado de una tarea —completar,
 * verificar— se hacen con la cámara en el momento, porque son la
 * prueba de que alguien estuvo delante. Pero un plano, un correo o el
 * detalle de otro día tienen que poder entrar en algún lado, y su
 * sitio es la conversación, donde nadie los confunde con el remate.
 */
function hojaNota(t) {
  return sheet((cerrar) => {
    const area = h('textarea.textarea', { rows: 4, placeholder: 'Escribe una nota para el hilo…' });
    const previa = h('div.rail', { style: { display: 'none' } });
    const imagenes = [];

    const pintar = () => {
      previa.replaceChildren(...imagenes.map((img, i) => {
        const url = URL.createObjectURL(img.blob);
        const quitar = h('button.rail-x', {
          'aria-label': 'Quitar esta imagen',
          onclick: () => { imagenes.splice(i, 1); pintar(); },
        }, icon('x', 13));
        return h('div.m', { style: { backgroundImage: `url("${url}")` } }, quitar);
      }));
      previa.style.display = imagenes.length ? 'flex' : 'none';
    };

    const adjuntar = media.botonFichero({
      clase: 'btn ghost full', accept: 'image/*', multiple: true,
      onElegir: async (ficheros) => {
        toast('Preparando…');
        for (const f of [...ficheros].slice(0, 4)) {
          try { imagenes.push(await media.prepararImagen(f)); } catch { toast('No se pudo leer una imagen', 'err'); }
        }
        pintar();
      },
    }, icon('image'), 'Adjuntar del carrete');
    adjuntar.style.marginTop = '10px';

    setTimeout(() => area.focus(), 320);
    return [
      h('h2.title', null, 'Nueva nota'),
      area,
      previa,
      adjuntar,
      h('button.btn.accent.full', {
        style: { marginTop: '14px' },
        onclick: async () => {
          const texto = area.value.trim();
          if (!texto && !imagenes.length) return;
          await store.añadirComentario(t.id, { texto, tipo: 'nota', imagenes });
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

async function menuTarea(t, listaId, suya) {
  const visuales = (await store.mediosDeTarea(t.id)).filter((m) => m.tipo !== 'audio');
  // Editar y borrar son de quien la creó y del superadministrador. Lo
  // que uno escribió no lo cambia otro: una tarea es lo que alguien
  // dijo haber visto, y si un tercero la reescribe deja de serlo.
  const edita = suya;
  const accion = await sheet((cerrar) => [
    h('h2.title', null, 'Tarea'),
    h('div.stack', null,
      edita ? h('button.row', { onclick: () => cerrar('texto') },
        h('div.row-lead', null, icon('edit', 18)),
        h('div.grow', null, h('div.row-title', null, 'Editar la descripción')),
      ) : null,
      edita ? h('button.row', { onclick: () => cerrar('estancia') },
        h('div.row-lead', null, icon('casa', 18)),
        h('div.grow', null, h('div.row-title', null, 'Cambiar la estancia o el oficio')),
      ) : null,
      // La voz y el vídeo viven aquí, en el menú, y no en la pantalla:
      // la ficha del diseño es la foto del remate y lo que hay que
      // hacer con ella. Pero un remate que se explica mejor hablando
      // —o moviendo la cámara por la grieta— tiene que poder grabarse
      // sin salir de la tarea.
      h('button.row', { onclick: () => cerrar('voz') },
        h('div.row-lead', null, icon('mic', 18)),
        h('div.grow', null,
          h('div.row-title', null, 'Grabar una nota de voz'),
          h('div.row-sub', null, 'Se oye al final de la tarea'),
        ),
      ),
      h('button.row', { onclick: () => cerrar('video') },
        h('div.row-lead', null, icon('video', 18)),
        h('div.grow', null, h('div.row-title', null, 'Añadir un vídeo')),
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
      edita ? h('button.row.danger', { onclick: () => cerrar('borrar') },
        h('div.row-lead', null, icon('trash', 18)),
        h('div.grow', null, h('div.row-title', null, 'Borrar la tarea entera')),
      ) : null,
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
  ]);

  if (accion === 'texto') return editarTexto(t);
  if (accion === 'estancia') return editarEstancia(t);
  if (accion === 'voz') return añadirAudio(t);
  if (accion === 'video') return añadirVideo(t);

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
