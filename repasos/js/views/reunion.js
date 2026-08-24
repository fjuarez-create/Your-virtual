/* LA REUNIÓN DE UN DÍA — en marcha si es la de hoy, acta si ya pasó.

   De arriba a abajo: quién está en la mesa, la grabación (el panel
   calcado de las notas de voz del iPhone, y después su conducto:
   transcribir por partes, poner nombre a las voces, redactar), la
   propuesta de acta de la IA cuando existe —para revisarla y
   firmarla—, las tareas de esta reunión, el arrastre de pendientes y
   el botón de terminar.

   El acta se sella sola a las 23:59 del día, en el servidor. Hasta
   entonces la DF y el administrador pueden añadir y corregir; después,
   lo único que sigue vivo es tachar tareas como hechas.

   Del diccionario de la casa: lo que la IA propone y lo que se firma
   son TAREAS de reunión (encargos por dentro), nunca repasos. */
import { h, icon, toast, hora, avatar, sheet } from '../ui.js';
import * as api from '../api.js';
import * as store from '../store.js';
import { puedeVerificar, unidades, unidad } from '../catalog.js';
import { cabecera, avisoLocal, barraSync, menuFlotante, filaMenu } from '../piezas.js';
import { grabarAudio } from '../media.js';
import { fechaDeActa, diaDeLaSemana } from './historial.js';
import {
  filaEncargo, tacharEncargo, hojaEncargo, hojaDatosDeTarea, avisarDeError, subDeEncargo, pedirNombre,
} from '../piezasObra.js';
import { empezarGrabadora, hayGrabacionEnMarcha } from '../grabadora.js';
import { ir, refrescar } from '../app.js';

/* ─── Estado que sobrevive a los repintados ───
   El conducto de una grabación (transcribiendo, poniendo voces…) y el
   borrador de la propuesta en edición viven aquí, a nivel de módulo:
   cada refrescar() repinta la vista, pero esto no se olvida. */
const CONDUCTO = new Map();    // grabacionId → { fase, detalle, avance }
const FALLIDAS = new Map();    // grabacionId → por qué se quedó a medias
const REDACTANDO = new Set();  // reunionId, para el botón de reserva
const BORRADOR = new Map();    // reunionId → { sello, resumen, tareas }

/* Un conducto vivo y solo uno en toda la app: dos a la vez sobre la
   misma reunión escribirían —y pagarían— dos actas. */
let CONDUCTO_VIVO = null;

/* Cuántas vueltas lleva dada cada grabación en esta sesión. Es el
   freno de emergencia: si por lo que sea el conducto no consigue
   avanzar, a la tercera se planta y lo dice, en vez de encadenar
   llamadas a la IA que cuestan dinero de verdad. */
const VUELTAS = new Map();
const TOPE_VUELTAS = 3;

export async function render({ reunionId }) {
  let datos = null;
  let error = null;
  try {
    datos = await api.verReunion(reunionId);
  } catch (e) {
    if (e.status === 404) { toast('Reunión desconocida', 'err'); ir('#/obra', { reemplazar: true }); return { contenido: [] }; }
    error = e.codigo === 'red'
      ? 'Las reuniones de obra se llevan en directo con el servidor: hace falta cobertura para verlas.'
      : e.message;
  }

  if (error) {
    return { sinTabs: true, clase: 'pantalla-diseno', contenido: [
      cabecera({ volver: '#/obra', titulo: '' }),
      h('p.d-epigrafe', null, 'Sin conexión'),
      h('p.d-nota-pie', { style: { whiteSpace: 'normal' } }, error),
      h('button.d-fantasma', { style: { marginTop: '14px' }, onclick: () => refrescar() }, 'Volver a intentarlo'),
    ] };
  }

  const { reunion: r, encargos, arrastre, grabaciones, resumen, propuesta } = datos;
  const esHoy = r.fecha === datos.hoy;
  const abierta = !r.sellada;
  const df = puedeVerificar(store.sesion());
  const edita = df && abierta;

  // El registro de voces solo hace falta si hay algo transcrito.
  let voces = [];
  let hayServicioVoces = false;
  if (grabaciones.some((g) => g.partes.some((p) => p.dicho.length))) {
    try {
      const rv = await api.listarVoces(r.promoId);
      voces = rv.voces;
      hayServicioVoces = rv.servicio.hay;
    } catch { /* sin registro no se rompe nada */ }
  }

  /* ─── El audio se exprime solo ───
     Nada más parar la grabadora, sin que nadie pulse: se transcribe,
     se reconocen las voces y se propone el acta con sus tareas. El
     audio no se quiere para nada más, así que cuanto antes se le
     saquen las tareas, mejor.

     Arranca UNA grabación cada vez; al terminar, el repintado coge la
     siguiente. Si algo falla, queda apuntado en FALLIDAS y la fila
     ofrece reintentar en vez de volver a intentarlo en bucle. */
  const necesitaActa = !r.actaFirmada && !propuesta;
  if (df && (abierta || datos.actaEnCortesia) && !CONDUCTO_VIVO && !REDACTANDO.has(r.id)) {
    const g = grabaciones.find((x) => !x.audioBorrado && !FALLIDAS.has(x.id)
      // Sin un byte de audio no hay nada que exprimir: una grabación
      // vacía nunca cambia de estado y volvería a cogerse en cada
      // repintado, encadenando actas pagadas.
      && x.partes.some((p) => p.tam > 0)
      && (x.estado === 'lista'
        // Transcrita pero sin acta: solo cuando no se está grabando
        // otro rato, porque entonces el acta espera a propósito y
        // relanzar el conducto sería dar vueltas en balde.
        || (x.estado === 'transcrita' && necesitaActa && !hayGrabacionEnMarcha())));
    if (g) setTimeout(() => conducir(g, r), 0);
  }

  const tachar = async (e) => { if (await tacharEncargo(e)) refrescar(); };
  const abrir = edita
    ? async (e) => { if (await hojaEncargo({ reunionId: r.id, promoId: r.promoId, encargo: e })) refrescar(); }
    : null;

  const contenido = [
    // El título viaja en la propia cabecera, junto a la flecha: la
    // regla de la casa desde agosto de 2026 es que si hay flecha, el
    // título va arriba, como en la ficha de una villa.
    cabecera({
      volver: '#/obra',
      titulo: esHoy ? 'Reunión de hoy' : `Acta · ${diaDeLaSemana(r.fecha)} ${Number(r.fecha.slice(8, 10))}`,
    }),
    h('p.d-nota-pie', { style: { margin: '0 6px' } },
      `${diaDeLaSemana(r.fecha, { mayuscula: true })}, ${fechaDeActa(r.fecha, { conAno: true })}`
      + ` · empezada a las ${hora(r.empezada)} h`
      + (r.terminada ? ` · terminada a las ${hora(r.terminada)} h` : '')),
    avisoLocal() || barraSync(),

    /* ─── La mesa ─── */
    h('p.d-epigrafe', null, 'Asistentes'),
    h('div.d-mesa', null,
      (r.asistentes || []).map((id) => avatar(store.persona(id), { tam: 48 })),
      (r.invitados || []).map((n) => h('span.d-invitado', null, `${n} (invitado)`)),
      edita
        ? h('button.d-mesa-mas', {
            'aria-label': 'Añadir asistentes',
            onclick: async () => { if (await hojaMesa(r)) refrescar(); },
          }, icon('plus'))
        : null,
      !edita && !(r.asistentes || []).length && !(r.invitados || []).length
        ? h('p.d-nota-pie', { style: { margin: '0' } }, 'Sin asistentes apuntados.')
        : null,
    ),
  ];

  /* ─── La grabación ─── */
  if (edita || grabaciones.length) {
    contenido.push(h('p.d-epigrafe', null, 'La grabación'));

    if (edita && !hayGrabacionEnMarcha() && !grabaciones.some((g) => g.estado === 'grabando')) {
      // El micro va en el botón, no de adorno a la izquierda: dos
      // micros en la misma fila se estorbaban. Lo del borrado a los
      // 30 días se cuenta en la página de privacidad, no aquí.
      contenido.push(h('div.d-grab-quieta', null,
        h('div.grow', null,
          h('div.d-grab-quieta-titulo', null, grabaciones.length ? 'Grabar otro rato' : 'Sin grabar todavía'),
          h('div.d-grab-quieta-sub', null, 'Se transcribirá automáticamente al parar.'),
        ),
        h('button.d-grab-quieta-boton', {
          'aria-label': 'Grabar',
          onclick: async () => {
            await empezarGrabadora({
              reunionId: r.id,
              titulo: esHoy ? 'Reunión de hoy' : `Reunión del ${Number(r.fecha.slice(8, 10))}`,
              // El conducto arranca aquí mismo, no al repintar: la
              // grabadora se pliega y se para desde cualquier
              // pantalla, y el audio no puede quedarse esperando a
              // que alguien vuelva a abrir la reunión.
              alTerminar: (grabacion) => { if (grabacion) conducir(grabacion, r); },
            });
            refrescar();
          },
        }, icon('mic')),
      ));
    }

    for (const g of grabaciones) {
      contenido.push(tarjetaGrabacion(g, { edita, promoId: r.promoId }));
    }
  }

  /* ─── ¿Quién es quién? ─── */
  const conVoces = grabaciones.filter((g) => g.estado === 'transcrita' && g.partes.some((p) => p.dicho.length));
  if (edita && conVoces.length) {
    for (const g of conVoces) {
      const bloque = bloqueQuienEsQuien(g, { reunion: r, voces, hayServicioVoces });
      if (bloque) {
        contenido.push(h('p.d-epigrafe', null, '¿Quién es quién?'), ...bloque);
      }
    }
  }

  /* ─── La propuesta del acta ───
     La firma vale con el acta abierta y también en la prórroga de
     cortesía (hasta las 00:45, si la transcripción estaba en el horno
     al cruzar la medianoche): lo decide el servidor, aquí solo se
     enseña. */
  const hayTranscrito = grabaciones.some((g) => g.estado === 'transcrita');
  const puedeFirmar = df && (abierta || datos.actaEnCortesia);
  if (puedeFirmar && propuesta) {
    contenido.push(...bloquePropuesta(r, propuesta));
  } else if (edita && hayTranscrito && !propuesta && !CONDUCTO.size) {
    const redactando = REDACTANDO.has(r.id);
    const boton = h('button.d-boton-negro', {
      style: { marginTop: '18px' },
      disabled: !!redactando,
      onclick: async () => {
        REDACTANDO.add(r.id);
        refrescar();
        try {
          await api.redactarActa(r.id, unidades(r.promoId).map((u) => ({ id: u.id, nombre: u.nombre })));
          BORRADOR.delete(r.id);
          toast('Propuesta de acta lista: revísala');
        } catch (e) { avisarDeError(e); } finally {
          REDACTANDO.delete(r.id);
          refrescar();
        }
      },
    }, icon('edit'), redactando ? 'Escribiendo el acta…'
      : r.actaFirmada ? 'Volver a proponer el acta' : 'Proponer el acta con la IA');
    contenido.push(boton,
      h('p.d-nota-pie', null, r.actaFirmada
        ? 'El acta de esta reunión ya está firmada. Si has grabado algo más, aquí se '
          + 'vuelve a proponer con todo lo que hay.'
        : 'La IA lee la transcripción y propone el resumen y las tareas, con responsable '
          + 'cuando quedó claro. Nada se crea hasta que tú lo firmes.'));
  }

  /* ─── El acta ya firmada ─── */
  if (resumen) {
    contenido.push(
      h('p.d-epigrafe', null, 'El acta'),
      h('div.d-acta-prosa', null, resumen),
    );
  }

  /* ─── Las tareas de esta reunión ─── */
  contenido.push(
    h('p.d-epigrafe', null, 'Tareas de esta reunión'),
    encargos.length
      ? h('div', null, encargos.map((e) => filaEncargo(e, { alTachar: tachar, alAbrir: abrir })))
      : h('p.d-nota-pie', null, CONDUCTO.size
          ? 'Todavía ninguna. En un momento las propone la IA de lo que se habló.'
          : edita
            ? 'Todavía ninguna. Lo que se acuerde, apúntalo aquí: con responsable y fecha no se pierde.'
            : 'Esta reunión no dejó tareas apuntadas.'),
    edita
      ? h('button.d-fantasma', {
          style: { marginTop: '8px' },
          onclick: async () => { if (await hojaEncargo({ reunionId: r.id, promoId: r.promoId })) refrescar(); },
        }, icon('plus'), 'Apuntar una tarea')
      : null,
  );

  /* ─── El arrastre ─── */
  if (arrastre.length) {
    contenido.push(
      h('p.d-epigrafe', null, 'Pendientes de reuniones anteriores'),
      h('div', null, arrastre.map((e) => filaEncargo(e, { alTachar: tachar, origen: true }))),
      h('p.d-nota-pie', null, 'Lo que se tache aquí queda tachado también en su acta de origen.'),
    );
  }

  /* ─── Terminar y el sello ─── */
  if (edita && !r.terminada) {
    const terminar = h('button.d-boton-negro', {
      style: { marginTop: '24px' },
      onclick: async () => {
        if (hayGrabacionEnMarcha()) { toast('Para antes la grabación', 'err'); return; }
        terminar.disabled = true;
        try {
          await api.editarReunion(r.id, { terminada: true });
          toast('Reunión terminada');
          refrescar();
        } catch (e) { terminar.disabled = false; avisarDeError(e); }
      },
    }, icon('check'), 'Terminar la reunión');
    contenido.push(terminar);
  }
  contenido.push(h('p.d-nota-pie', null, abierta
    ? 'El acta se sella sola a las 23:59: hasta entonces la dirección facultativa y el administrador '
      + 'pueden añadir o corregir, aunque la reunión esté terminada. Tachar lo hecho se puede siempre.'
    : 'Acta sellada: se cerró sola a las 23:59 de ese día. Lo pendiente se arrastra a las reuniones '
      + 'siguientes, y tacharlo como hecho se puede siempre.'));

  return { sinTabs: true, clase: 'pantalla-diseno', contenido };
}

/* ═══ El conducto: transcribir → voces → acta, sin pulsar nada ═══
   En cuanto una grabación se cierra, esto arranca solo: el audio no
   se quiere para otra cosa, así que cuanto antes se le saquen las
   tareas, mejor. Un hosting compartido no tiene trabajadores de
   fondo, de modo que el móvil pide un paso corto cada vez y va
   contando por dónde va en la propia fila de la grabación.

   Si la app se cierra a la mitad, al volver a entrar se retoma donde
   se quedó: los pasos ya hechos no se repiten. */
async function conducir(g, r) {
  if (CONDUCTO_VIVO || CONDUCTO.has(g.id)) return;

  // El freno de emergencia, antes de nada: tres vueltas sin llegar a
  // buen puerto y esta grabación se queda quieta hasta que alguien
  // pulse «Reintentar».
  const vueltas = (VUELTAS.get(g.id) || 0) + 1;
  VUELTAS.set(g.id, vueltas);
  if (vueltas > TOPE_VUELTAS) {
    FALLIDAS.set(g.id, 'no consigue avanzar; pruébalo tú');
    repintarSi(r);
    return;
  }
  CONDUCTO_VIVO = g.id;

  const partes = Math.max(1, g.partes.filter((p) => p.tam > 0).length);
  const min = Math.max(1, Math.round(g.duracion / 60));
  const marcar = (fase, detalle, avance) => {
    CONDUCTO.set(g.id, { fase, detalle, avance });
    repintarSi(r);
  };
  marcar('transcribiendo', `Transcribiendo la parte 1 de ${partes} · ${min} min de reunión`, 0.06);

  try {
    /* 1 · El texto, parte a parte. */
    let quedan = 1;
    while (quedan > 0) {
      const res = await api.transcribirGrabacion(g.id);
      quedan = res.quedan;
      const hechas = partes - quedan;
      marcar('transcribiendo',
        quedan
          ? `Transcribiendo la parte ${Math.min(hechas + 1, partes)} de ${partes} · ${min} min de reunión`
          : `${min} min de reunión, palabra por palabra`,
        0.06 + 0.56 * (hechas / partes));
    }

    /* 2 · Quién habla en cada tramo, si hay huellas que comparar. */
    marcar('voces', 'Reconociendo las voces de la mesa…', 0.68);
    // Tope de unos siete minutos: si el servicio de voces se atasca,
    // el acta sale igual y las voces se ponen a mano. Vale más un
    // acta sin nombres que una pantalla congelada.
    let vocesHechas = false;
    for (let paso = 0; paso < 60; paso++) {
      const res = await api.identificarGrabacion(g.id);
      if (!res.disponible || res.quedan === 0) { vocesHechas = true; break; }
      await new Promise((listo) => setTimeout(listo, res.paso === 'en-cola' ? 8000 : 1500));
    }
    if (!vocesHechas) {
      toast('Las voces tardan; el acta sale igual y se ponen a mano');
    }

    /* 3 · El acta y sus tareas.
       No se reescribe lo que ya está firmado, y si se está grabando
       otro rato se espera: la propone el conducto de esa grabación,
       ya con todo dentro. */
    const fresco = await api.verReunion(r.id).catch(() => null);
    const firmada = fresco ? !!fresco.reunion.actaFirmada : true;
    if (!firmada && !hayGrabacionEnMarcha()) {
      marcar('redactando', 'Escribiendo el acta y sus tareas…', 0.86);
      await api.redactarActa(r.id, unidades(r.promoId).map((u) => ({ id: u.id, nombre: u.nombre })));
      BORRADOR.delete(r.id);
      toast('Acta propuesta: repásala y fírmala');
    } else {
      toast('Grabación transcrita');
    }
  } catch (e) {
    // Se apunta el motivo y NO se reintenta solo: un fallo en bucle
    // gasta dinero de verdad. La fila ofrece reintentar a mano.
    FALLIDAS.set(g.id, motivoDe(e));
    avisarDeError(e);
  } finally {
    CONDUCTO.delete(g.id);
    CONDUCTO_VIVO = null;
    repintarSi(r);
  }
}

/**
 * Repinta solo si se sigue mirando esta reunión. El conducto puede
 * terminar con Fran en otra pantalla —apuntando un repaso con fotos
 * sin guardar, por ejemplo— y un repintado ahí se llevaría por
 * delante lo que estuviera a medias.
 */
function repintarSi(r) {
  if (location.hash.startsWith(`#/obra/r/${r.id}`)) refrescar();
}

/** Por qué se quedó a medias, en una línea que quepa en la fila. */
function motivoDe(e) {
  const porCodigo = {
    'sin-clave': 'falta una clave de IA en Ajustes → Servidor',
    'clave-mala': 'la clave de IA no vale',
    'sin-cupo': 'la cuenta de IA se quedó sin cupo',
    'red': 'sin conexión con el servidor',
    'sellada': 'el acta de ese día ya está sellada',
    'audio-borrado': 'el audio ya se borró (30 días)',
  };
  return porCodigo[e?.codigo] || e?.message || 'no se pudo terminar';
}

/* ─── La tarjeta de una grabación ─── */
function tarjetaGrabacion(g, { edita, promoId }) {
  const enConducto = CONDUCTO.get(g.id);
  const fallo = FALLIDAS.get(g.id);
  const min = Math.max(1, Math.round(g.duracion / 60));

  /* Exprimiendo: la fila entera se pone a trabajar. El micro deja su
     sitio al girito, el título dice lo que está pasando, la línea de
     debajo por dónde va y la barra cuánto lleva. Aquí no hay nada que
     pulsar, que era justo el problema de antes. */
  if (enConducto) {
    return h('div.d-encargo', null,
      h('div.d-grab-fila-icono', null, h('span.d-giro')),
      h('div.grow', null,
        h('div.d-encargo-texto', null, 'Exprimiendo el audio…'),
        h('div.d-encargo-sub', { style: { whiteSpace: 'normal' } }, enConducto.detalle),
        h('div.d-barra-fina', null,
          h('i', { style: { width: `${Math.round(Math.min(1, enConducto.avance) * 100)}%` } })),
      ),
    );
  }

  const sub = [`${min} min`];
  let chip = null;
  let accion = null;

  if (fallo) {
    // Se quedó a medias y se dice por qué: reintentar es volver a
    // soltar el conducto, que sigue por donde iba.
    sub.push(fallo);
    chip = h('span.d-chip.rojo', null, 'a medias');
    if (edita) {
      accion = h('button.d-chip.ambar', {
        onclick: () => { FALLIDAS.delete(g.id); VUELTAS.delete(g.id); refrescar(); },
      }, 'Reintentar');
    }
  } else if (g.estado === 'grabando') {
    chip = h('span.d-chip.ambar', null, 'grabando');
    if (edita && !hayGrabacionEnMarcha()) {
      // Una grabación que quedó abierta de una sesión anterior: se
      // cierra y el conducto la coge en el siguiente repintado.
      accion = h('button.d-chip', {
        onclick: async () => {
          try { await api.cerrarGrabacion(g.id, g.duracion); refrescar(); } catch (e) { avisarDeError(e); }
        },
      }, 'Cerrar');
    }
  } else if (g.estado === 'lista') {
    chip = h('span.d-chip.ambar', null, edita ? 'en cola' : 'sin transcribir');
  } else if (g.estado === 'transcrita') {
    chip = h('span.d-chip.verde', null, 'transcrita');
  }
  if (g.audioBorrado) {
    sub.push('audio borrado a los 30 días');
  }

  const partes = g.partes.filter((p) => p.tam > 0);
  const cuerpo = h('div.d-encargo', null,
    h('div.d-grab-fila-icono', null, icon('mic', 20)),
    h('div.grow', null,
      h('div.d-encargo-texto', null, `Grabación de las ${hora(g.creado)} h`),
      h('div.d-encargo-sub', { style: fallo ? { whiteSpace: 'normal' } : null }, sub.join(' · ')),
    ),
    accion, chip,
  );

  if (g.audioBorrado || !partes.length) return cuerpo;

  // Tocar la fila despliega el audio, parte a parte.
  let abierto = false;
  const caja = h('div');
  cuerpo.querySelector('.grow').style.cursor = 'pointer';
  cuerpo.querySelector('.grow').addEventListener('click', () => {
    abierto = !abierto;
    caja.replaceChildren(...(abierto
      ? partes.map((p) => h('audio', {
          controls: true, preload: 'none',
          src: api.urlAudioGrabacion(g.id, p.n),
          style: { width: '100%', marginTop: '8px' },
        }))
      : []));
  });
  return h('div', null, cuerpo, caja);
}

/* ─── ¿Quién es quién?: las voces de una grabación ─── */

/** Las voces que se oyen: una fila por hablante y parte, con lo que dijo. */
function vocesDeGrabacion(g) {
  const filas = [];
  for (const p of g.partes) {
    const porVoz = new Map();
    for (const seg of p.dicho) {
      const v = porVoz.get(seg.h) || { parte: p.n, h: seg.h, segundos: 0, mejor: null, frase: '' };
      v.segundos += Math.max(0, seg.fin - seg.ini);
      if (!v.mejor || (seg.fin - seg.ini) > (v.mejor.fin - v.mejor.ini)) v.mejor = seg;
      if (!v.frase && seg.texto.length > 25) v.frase = seg.texto;
      porVoz.set(seg.h, v);
    }
    for (const v of porVoz.values()) {
      v.frase = v.frase || v.mejor?.texto || '';
      filas.push(v);
    }
  }
  filas.sort((a, b) => b.segundos - a.segundos);
  return filas;
}

let sonando = null;   // el <audio> de escucha de voz, uno como mucho

function escucharTramo(grabacionId, parte, seg) {
  if (sonando) { sonando.pause(); sonando = null; }
  const a = new Audio(api.urlAudioGrabacion(grabacionId, parte));
  const desde = Math.max(0, seg.ini);
  const hasta = Math.min(seg.fin, desde + 7);   // siete segundos bastan para reconocer a alguien
  a.addEventListener('loadedmetadata', () => { a.currentTime = desde; a.play().catch(() => {}); });
  a.addEventListener('timeupdate', () => { if (a.currentTime >= hasta) { a.pause(); } });
  a.load();
  sonando = a;
}

function bloqueQuienEsQuien(g, { reunion, voces, hayServicioVoces }) {
  const filas = vocesDeGrabacion(g);
  if (!filas.length) return null;

  const mapa = { ...(g.hablantes?.mapa || {}) };
  const nodos = [];

  for (const v of filas) {
    const etiqueta = `${v.parte}:${v.h}`;
    const puesto = mapa[etiqueta];
    const min = Math.max(1, Math.round(v.segundos / 60));

    const elegir = () => menuFlotante((cerrarMenu) => [
      ...(reunion.asistentes || []).map((id) => {
        const p = store.persona(id);
        return filaMenu(null, p.nombre || 'Alguien', () => {
          cerrarMenu();
          asignar(etiqueta, { personaId: id, nombre: p.nombre || '' });
        });
      }),
      ...(reunion.invitados || []).map((n) => filaMenu(null, `${n} (invitado)`, () => {
        cerrarMenu();
        asignar(etiqueta, { personaId: null, nombre: n });
      })),
      filaMenu(null, 'Otra persona…', async () => {
        cerrarMenu();
        const nombre = await pedirNombre('¿Quién es esta voz?', '');
        if (nombre) asignar(etiqueta, { personaId: null, nombre });
      }),
      puesto ? filaMenu(null, 'Dejarla sin nombre', () => { cerrarMenu(); asignar(etiqueta, null); }) : null,
    ].filter(Boolean), { conX: true });

    const asignar = async (et, quien) => {
      if (quien === null) delete mapa[et];
      else mapa[et] = { ...quien, auto: false };
      try {
        await api.guardarHablantes(g.id, mapa);
        // Si el nombre es de alguien del equipo, su voz queda apuntada
        // en el registro; la huella se aprende con su clip de 15 s.
        if (quien) {
          await api.crearVoz({
            promoId: reunion.promoId,
            personaId: quien.personaId,
            personaNombre: quien.nombre,
            muestraGrabacionId: g.id,
            muestraParte: v.parte,
            muestraDesde: v.mejor?.ini || 0,
            muestraHasta: v.mejor?.fin || 0,
          });
        }
        refrescar();
      } catch (e) { avisarDeError(e); }
    };

    nodos.push(h('div.d-encargo', null,
      h('button.d-encargo-bola', {
        'aria-label': 'Escuchar esta voz',
        style: { color: 'var(--d-beige-tinta)', borderColor: '#c9c4bb' },
        onclick: () => v.mejor && escucharTramo(g.id, v.parte, v.mejor),
      }, icon('mic', 18)),
      h('div.grow', null,
        h('div.d-encargo-texto', null, puesto?.nombre
          ? puesto.nombre + (puesto.auto ? ' · reconocida' : '')
          : `Voz ${v.h}${g.partes.length > 1 ? ` (parte ${v.parte + 1})` : ''}`),
        h('div.d-encargo-sub', null, `${min} min hablando · «${v.frase.slice(0, 70)}${v.frase.length > 70 ? '…' : ''}»`),
      ),
      h('button.d-chip', { class: puesto ? 'verde' : 'ambar', onclick: elegir },
        puesto ? 'cambiar' : 'asignar'),
    ));
  }

  // El aprendizaje: para cada persona asignada sin huella, su clip.
  const sinHuella = [];
  const vistos = new Set();
  for (const et of Object.keys(mapa)) {
    const quien = mapa[et];
    const clavePersona = quien.personaId || quien.nombre;
    if (vistos.has(clavePersona)) continue;
    vistos.add(clavePersona);
    const voz = voces.find((x) => (quien.personaId && x.personaId === quien.personaId)
      || (!quien.personaId && x.personaNombre === quien.nombre));
    if (!voz || (!voz.conHuella && !voz.enrolando)) {
      sinHuella.push({ quien, voz });
    }
  }
  if (sinHuella.length) {
    nodos.push(h('p.d-nota-pie', null, hayServicioVoces
      ? 'Para que la app reconozca sola a alguien en la próxima reunión, graba su huella: quince segundos hablando, con su permiso.'
      : 'Las huellas de voz están sin activar (Ajustes → Clave de pyannote): de momento se pregunta en cada reunión.'));
    for (const { quien } of sinHuella) {
      nodos.push(h('button.d-fantasma', {
        style: { marginTop: '8px' },
        onclick: async () => {
          const clip = await grabarAudio();
          if (!clip) return;
          try {
            const rv = await api.crearVoz({ promoId: reunion.promoId, personaId: quien.personaId, personaNombre: quien.nombre });
            const rs = await api.subirMuestraVoz(rv.voz.id, clip.blob);
            toast(rs.enrolando
              ? `La voz de ${quien.nombre} se está aprendiendo`
              : `Clip de ${quien.nombre} guardado; se enrolará al activar las huellas`);
            refrescar();
          } catch (e) { avisarDeError(e); }
        },
      }, icon('mic'), `Aprender la voz de ${quien.nombre}`));
    }
  }

  return nodos;
}

/* ─── La propuesta del acta: revisar y firmar ─── */
function bloquePropuesta(r, propuesta) {
  // El borrador local sobrevive a los repintados; si el servidor trae
  // una propuesta más nueva (re-redactada), el borrador viejo se tira.
  let borrador = BORRADOR.get(r.id);
  if (!borrador || borrador.sello !== propuesta.redactada) {
    borrador = {
      sello: propuesta.redactada,
      resumen: propuesta.resumen,
      tareas: propuesta.tareas.map((t) => ({ ...t })),
    };
    BORRADOR.set(r.id, borrador);
  }

  const area = h('textarea.d-area', { rows: 6, style: { marginTop: '0' } });
  area.value = borrador.resumen;
  area.addEventListener('input', () => { borrador.resumen = area.value; });

  const lista = h('div');
  const pintarTareas = () => {
    lista.replaceChildren(...borrador.tareas.map((t, i) => {
      const dudas = [];
      if (!t.responsableNombre) dudas.push('sin responsable');
      if (!t.seguro) dudas.push('revísala');
      return h('div.d-encargo', null,
        h('button.d-encargo-bola', {
          'aria-label': 'Quitar esta tarea de la propuesta',
          style: { color: 'var(--d-gris)', borderColor: '#c9c4bb' },
          onclick: () => { borrador.tareas.splice(i, 1); pintarTareas(); pintarFirma(); },
        }, icon('x', 16)),
        h('button.grow', {
          onclick: async () => {
            const salida = await hojaDatosDeTarea({
              promoId: r.promoId,
              valores: t,
              titulo: 'Revisar la tarea propuesta',
              botonTexto: 'Así está bien',
              conBorrar: true,
              textoBorrar: 'Quitarla de la propuesta',
            });
            if (!salida) return;
            if (salida.borrar) borrador.tareas.splice(i, 1);
            else borrador.tareas[i] = { ...t, ...salida.valores, seguro: true };
            pintarTareas();
            pintarFirma();
          },
        },
          h('div.d-encargo-texto', null, t.texto),
          h('div.d-encargo-sub', null, subDeEncargo({
            general: t.general, unidadId: t.unidadId,
            responsableNombre: t.responsableNombre, fechaLimite: t.fechaLimite,
          })),
        ),
        dudas.length ? h('span.d-chip.ambar', null, dudas.join(' · ')) : null,
      );
    }));
  };
  pintarTareas();

  const firmar = h('button.d-boton-negro', {
    style: { marginTop: '16px' },
    onclick: async () => {
      firmar.disabled = true;
      try {
        const res = await api.aceptarActa(r.id, { resumen: borrador.resumen.trim(), tareas: borrador.tareas });
        BORRADOR.delete(r.id);
        toast(res.encargos.length === 1
          ? 'Acta firmada: una tarea creada'
          : `Acta firmada: ${res.encargos.length} tareas creadas`);
        refrescar();
      } catch (e) { firmar.disabled = false; avisarDeError(e); }
    },
  });
  const pintarFirma = () => {
    const n = borrador.tareas.length;
    firmar.replaceChildren(icon('check'),
      n === 0 ? 'Firmar el acta (sin tareas)' : n === 1 ? 'Firmar el acta · 1 tarea' : `Firmar el acta · ${n} tareas`);
  };
  pintarFirma();

  return [
    h('p.d-epigrafe', null, 'La propuesta del acta'),
    h('p.d-nota-pie', { style: { margin: '0 6px 10px' } },
      'La ha escrito la IA a partir de la grabación. Toca una tarea para corregirla, '
      + 'el redondel para quitarla, y firma: solo entonces se crean.'),
    area,
    lista,
    firmar,
  ];
}

/* ─── La hoja de la mesa (asistentes e invitados) ─── */
function hojaMesa(r) {
  return sheet((cerrar) => {
    const dentro = new Set(r.asistentes || []);
    const invitados = [...(r.invitados || [])];

    const listaEquipo = h('div.stack');
    const listaInvitados = h('div.stack');

    const pintar = () => {
      listaEquipo.replaceChildren(...store.equipo().map((p) => h('button.row', {
        onclick: () => { if (dentro.has(p.id)) dentro.delete(p.id); else dentro.add(p.id); pintar(); },
      },
        avatar(p, { tam: 34 }),
        h('div.grow', null, h('div.row-title', null, p.nombre)),
        dentro.has(p.id) ? icon('check', 20) : h('span', { style: { width: '20px' } }),
      )));
      listaInvitados.replaceChildren(
        ...invitados.map((n, i) => h('div.row', null,
          h('div.grow', null, h('div.row-title', null, n)),
          h('button.icon-btn', {
            'aria-label': `Quitar a ${n}`,
            onclick: () => { invitados.splice(i, 1); pintar(); },
          }, icon('x', 18)),
        )),
      );
    };
    pintar();

    const caja = h('input.input', { type: 'text', placeholder: 'Invitado de fuera (nombre y empresa)…', maxlength: 80 });
    const meter = () => {
      const n = caja.value.trim();
      if (!n) return;
      if (!invitados.includes(n)) invitados.push(n);
      caja.value = '';
      pintar();
    };
    caja.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') meter(); });

    const guardar = h('button.d-boton-negro', {
      onclick: async () => {
        meter();   // lo que quede escrito en la caja también cuenta
        guardar.disabled = true;
        try {
          await api.editarReunion(r.id, { asistentes: [...dentro], invitados });
          cerrar(true);
        } catch (e) { guardar.disabled = false; avisarDeError(e); }
      },
    }, 'Guardar la mesa');

    return [
      h('h2.title', null, 'Asistentes'),
      h('p.hint', { style: { whiteSpace: 'normal' } }, 'Los del equipo llevan cuenta y cara; los de fuera se apuntan a mano.'),
      listaEquipo,
      h('p.eyebrow', { style: { marginTop: '14px' } }, 'Invitados'),
      listaInvitados,
      h('div', { style: { display: 'flex', gap: '8px' } },
        caja,
        h('button.btn.accent', { onclick: meter }, 'Añadir'),
      ),
      guardar,
    ];
  });
}
