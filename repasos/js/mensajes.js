/* ═══════════════════════════════════════════════════════════════
   mensajes.js — el hilo de una vivienda, con acuse de lectura.

   Un hilo por casa, común a todo el proyecto. No es el hilo de una
   tarea —ese vive dentro de la tarea y habla de un remate concreto—:
   este es para lo que no cabe en ninguna tarea. «Mañana cortan el agua
   en la 07», «el de la piscina viene el jueves».

   Lo que lo distingue de un chat cualquiera es que cada mensaje sabe
   quién lo ha leído:

     bolita azul   lo que uno no ha leído todavía. Cada cual ve la suya.
     un tic        lo ha leído alguien.
     dos tics      lo han leído todos.

   Y se cuenta como leído a los tres segundos de tenerlo abierto, no al
   tocarlo. Abrir y cerrar de rebote no es leer, y en un hilo donde los
   tics deciden si hace falta llamar por teléfono, un acuse falso es
   peor que ninguno.
   ═══════════════════════════════════════════════════════════════ */
import { h, icon, sheet, toast, avatar, confirmSheet, fechaCorta, hora } from './ui.js';
import * as store from './store.js';

/** Lo que hay que estar dentro para que cuente como leído. */
const SEGUNDOS_PARA_LEIDO = 3;

/**
 * El bloque de mensajes de una vivienda, listo para colgar en la ficha.
 *
 * Se devuelve ya pintado y se repinta solo desde dentro: al leer uno, la
 * bolita tiene que desaparecer sin recargar la pantalla entera.
 */
export async function bloqueDeMensajes(unidadId, promoId) {
  const caja = h('div', { style: { marginTop: '26px' } });

  const pintar = async () => {
    const mensajes = await store.mensajesDeUnidad(unidadId);
    const quien = store.sesion()?.id || 'local';

    const filas = [];
    for (const m of mensajes) {
      const mio = store.esMio(m);
      const leidas = await store.lecturasDe(m.id);
      const yaLo = mio || leidas.some((l) => l.usuarioId === quien);
      const tics = mio ? await store.ticsDe(m) : -1;
      filas.push(fila(m, { nuevo: !yaLo, tics, alAbrir: () => abrirMensaje(m, pintar) }));
    }

    caja.replaceChildren(
      h('div.topbar', null,
        h('div.grow', null, h('p.eyebrow', null,
          mensajes.length ? `Mensajes · ${mensajes.length}` : 'Mensajes')),
        h('button.tag', { onclick: () => escribir(unidadId, promoId, pintar) }, 'Escribir'),
      ),
      mensajes.length
        ? h('div.stack', { style: { marginTop: '10px', gap: '8px' } }, filas)
        : h('p.hint', { style: { marginTop: '8px' } },
            'Nada escrito todavía. Aquí va lo que hay que contar de esta vivienda y no es un repaso.'),
    );
  };

  await pintar();
  return caja;
}

/**
 * Una fila del hilo. Enseña las dos primeras líneas y se abre para leer
 * el resto: un mensaje largo dentro de una lista empuja los demás fuera
 * de la pantalla, y el hilo deja de verse de un vistazo.
 *
 * `tics` es -1 en los mensajes de otros. Los tics son para quien
 * escribió: le dicen si ya lo ha visto la gente. En un mensaje ajeno no
 * pintan nada, porque lo que uno quiere saber ahí es si lo ha leído él.
 */
function fila(m, { nuevo, tics, alAbrir }) {
  return h('button.mensaje', { class: nuevo ? 'nuevo' : '', onclick: alAbrir },
    avatar(store.persona(m.creadoPor, m.creadoPorNombre), { tam: 36 }),
    h('div.grow', null,
      h('div.mensaje-cab', null,
        h('span.mensaje-quien', null, (m.creadoPorNombre || '').split(/\s+/)[0]),
        h('span.mensaje-cuando', null, `${fechaCorta(m.creado)} · ${hora(m.creado)}`),
      ),
      h('p.mensaje-txt', null, m.texto),
    ),
    nuevo ? h('span.mensaje-bolita', { 'aria-label': 'Sin leer' }) : null,
    tics >= 0 ? marcaDeTics(tics) : null,
  );
}

/**
 * Los tics. Dos checks solapados y no un icono aparte para cada caso: la
 * diferencia entre uno y dos se lee por el número de marcas, que es como
 * se lee en cualquier mensajería, sin tener que aprender nada.
 */
function marcaDeTics(tics) {
  const caja = h('span.tics', { class: tics === 2 ? 'todos' : '' });
  caja.append(icon('check', 13));
  if (tics === 2) caja.append(icon('check', 13));
  caja.setAttribute('aria-label',
    tics === 2 ? 'Leído por todos' : tics === 1 ? 'Leído por alguien' : 'Sin leer');
  if (tics === 0) caja.classList.add('sin');
  return caja;
}

/**
 * Abrir un mensaje. Cuenta como leído a los tres segundos dentro.
 *
 * El aviso de «leído» sale antes de cumplirse, no después: quien lo
 * tiene delante ve lo que va a pasar y puede salirse si no quería, en
 * vez de descubrir que ha firmado algo al cerrar.
 */
export async function abrirMensaje(m, repintar) {
  const mio = store.esMio(m);
  let reloj = null;
  let marcado = false;

  await sheet((cerrar) => {
    const pie = h('p.hint', { style: { marginTop: '16px' } });

    if (!mio) {
      let quedan = SEGUNDOS_PARA_LEIDO;
      const tic = () => {
        quedan -= 1;
        if (quedan > 0) { pie.textContent = `Se marcará como leído en ${quedan} s.`; return; }
        clearInterval(reloj);
        reloj = null;
        marcado = true;
        pie.textContent = 'Marcado como leído.';
        store.marcarLeido(m.id);
      };
      pie.textContent = `Se marcará como leído en ${quedan} s.`;
      reloj = setInterval(tic, 1000);
    }

    return [
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        avatar(store.persona(m.creadoPor, m.creadoPorNombre), { tam: 44 }),
        h('div.grow', null,
          h('h2.title', { style: { fontSize: '18px' } }, m.creadoPorNombre || 'Sin identificar'),
          h('p.hint', null, `${fechaCorta(m.creado)} a las ${hora(m.creado)}`
            + (m.creadoPorEmpresa ? ` · ${m.creadoPorEmpresa}` : '')),
        ),
      ),
      h('p', {
        style: {
          fontSize: '16px', lineHeight: '1.5', marginTop: '18px', whiteSpace: 'pre-wrap',
        },
      }, m.texto),
      pie,
      mio ? h('button.btn.ghost.full.danger', {
        style: { marginTop: '10px' },
        onclick: async () => {
          if (!await confirmSheet({
            title: '¿Borrar el mensaje?',
            text: 'Desaparece para todos.', ok: 'Borrar', danger: true,
          })) return;
          try { await store.borrarMensaje(m.id); cerrar(true); toast('Mensaje borrado'); }
          catch (e) { toast(e.message, 'err'); }
        },
      }, 'Borrar el mensaje') : null,
      h('button.btn.ink.full', { style: { marginTop: '10px' }, onclick: () => cerrar(true) }, 'Cerrar'),
    ];
  });

  // El reloj se para al cerrar, se haya cumplido o no. Sin esto, salir
  // antes de los tres segundos marcaría el mensaje igual un rato
  // después, con la hoja ya cerrada y sin que nadie lo hubiera leído.
  if (reloj) clearInterval(reloj);
  if (marcado || mio) await repintar();
}

/** Escribir uno nuevo. Sin asunto ni destinatario: lo lee la vivienda. */
function escribir(unidadId, promoId, repintar) {
  return sheet((cerrar) => {
    const area = h('textarea.textarea', {
      rows: 4,
      placeholder: 'Lo que haya que contar de esta vivienda…',
      autocapitalize: 'sentences',
    });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    setTimeout(() => area.focus(), 320);

    return [
      h('h2.title', null, 'Escribir en la vivienda'),
      h('p.sub', null, 'Lo verá todo el equipo del proyecto, y sabrás quién lo ha leído.'),
      area,
      aviso,
      h('button.btn.accent.full', {
        style: { marginTop: '14px' },
        onclick: async () => {
          const texto = area.value.trim();
          if (!texto) {
            aviso.textContent = 'Escribe algo antes de mandarlo.';
            aviso.style.display = 'block';
            return;
          }
          await store.escribirMensaje(unidadId, promoId, texto);
          cerrar(true);
          toast('Mensaje publicado');
          await repintar();
        },
      }, 'Publicar'),
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
}
