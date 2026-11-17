/* LA VISITA DE REPASOS — #/entregadas/p/<promo>/v/<nn>/visita/<listaId>

   La pantalla de UNA visita de repasos de una vivienda ya entregada. Es
   la misma dirección en sus dos momentos:

     ABIERTA    (todavía sin conforme): se apunta foto a foto con el
                sistema de siempre —la foto, la descripción que propone
                la IA y que se corrige, el oficio y la estancia— y, al
                acabar, «Finalizar visita» lleva a la hoja, al documento
                en pantalla y a la firma con el dedo (js/conforme.js).
                Si el comprador no quiere firmar, se sale y la visita se
                queda como está: empezada, no hecha.
     FIRMADA    (con su conforme): el papel guardado, cuándo se firmó y
                quién, si ha subido ya, la fecha orientativa de
                finalización, las observaciones y los repasos, cada uno
                con su estado. Desde aquí se entra en cada repaso para
                completarlo, darlo por bueno o rechazarlo.

   Quién puede qué (el servidor lo vuelve a comprobar todo):
     · Verla, todo el equipo.
     · Apuntar repasos, finalizar y recoger la firma: el administrador,
       el comercial y la dirección facultativa (puedeHacerVisita).
     · Borrar una visita ABIERTA: quien la empezó, o el administrador.
     · Una visita firmada no se borra, y su conforme tampoco.
   Quien no puede algo no ve el botón.

   Ningún repaso lleva fecha propia: la única fecha es la «Fecha
   orientativa de finalización» del conforme. Y aquí no se lee nunca
   «acta» ni «tarea»: es el «Conforme de la visita» y son los «repasos
   de la visita».

   Si la lista no existe, está borrada, no es de visita o es de otra
   vivienda, vuelve a la ficha de la vivienda. */
import { h, icon, toast, confirmar } from '../ui.js';
import * as store from '../store.js';
import { unidad, oficio, hecha, esperandoVisto, rebotada, esListaDeVisita, puedeHacerVisita } from '../catalog.js';
import { cabecera, avisoLocal, barraSync, menuTarjeta } from '../piezas.js';
import { ir, refrescar } from '../app.js';
import * as E from '../entregas.js';
import { esConforme, firmadoEl, firmantesDe, estaEnElConforme, cuentaDeRepasos, diaDeInstante } from '../posventa.js';
import { tarjetaConforme, abrirConforme } from '../piezasPosventa.js';
import { finalizarVisita } from '../conforme.js';
import { nuevaTarea } from './tareas.js';

/** «Carpintería · Dormitorio 2»: el oficio y la estancia de un repaso. */
function dondeDe(t) {
  return [oficio(t.oficio)?.nombre, t.zona].filter(Boolean).join(' · ');
}

/** El chip del estado de un repaso, como se dice en esta sección. */
function chipDeEstado(t) {
  if (hecha(t)) return h('span.d-chip.verde', null, icon('check'), 'Verificado');
  if (esperandoVisto(t)) return h('span.d-chip.ambar', null, 'Hecho, por dar por bueno');
  if (rebotada(t)) return h('span.d-chip.rojo', null, 'Rechazado');
  return h('span.d-chip', null, 'Pendiente');
}

export async function render({ promoId, unidadId, listaId }) {
  const nn = String(unidadId).split(':')[1];
  const ficha = `#/entregadas/p/${promoId}/v/${nn}`;
  const lista = await store.lista(listaId);
  if (!lista || !esListaDeVisita(lista) || lista.unidadId !== unidadId) {
    ir(ficha, { reemplazar: true });
    return { contenido: [] };
  }

  const u = unidad(unidadId);
  const yo = store.sesion();
  const haceVisitas = puedeHacerVisita(yo);
  const repasos = await store.tareasDeLista(listaId);
  const conforme = await store.conformeDeLista(listaId);
  const firmada = esConforme(conforme);
  const portadas = new Map();
  for (const t of repasos) portadas.set(t.id, await store.urlDePortada(t));

  /** La tarjeta de un repaso: su foto, su texto y dónde es. En la visita firmada, además, su estado. */
  const tarjeta = (t, n) => {
    const url = portadas.get(t.id);
    const fuera = firmada && !estaEnElConforme(conforme, t.id);
    return h('button.vr-repaso', {
      type: 'button', 'data-repaso': t.id, class: firmada && hecha(t) ? 'hecho' : '',
      onclick: () => ir(`#/l/${listaId}/t/${t.id}`),
    },
      url ? h('span.vr-foto', { style: { backgroundImage: `url("${url}")` } }, h('span.vr-numero', null, String(n)))
        : h('span.vr-foto.vacia', null, icon('image'), h('span.vr-numero', null, String(n))),
      h('span.vr-texto', null,
        h('span.vr-que', null, t.texto || 'Repaso sin descripción'),
        dondeDe(t) ? h('span.vr-donde', null, dondeDe(t)) : null,
        firmada ? h('span.vr-chips', null,
          chipDeEstado(t),
          // No está en el papel que firmó el comprador, y se dice.
          fuera ? h('span.vr-fuera', null, 'añadido después de la firma') : null) : null,
      ),
      icon('chevron'),
    );
  };
  const listado = repasos.length ? h('div.vr-lista', null, repasos.map((t, i) => tarjeta(t, i + 1))) : null;

  /* ═══ La visita FIRMADA ═══ */
  if (firmada) {
    const { dia, hora } = firmadoEl(conforme);
    const quien = firmantesDe(conforme);
    const franja = h('div.vr-franja', { 'data-conforme': conforme.id },
      icon('check'),
      h('span', null, `Conforme firmado${dia ? ` el ${E.diaSemana(dia)} ${E.fechaLarga(dia, { conAno: true })}` : ''}${hora ? ` a las ${hora}` : ''}${quien ? ` · ${quien}` : ''}`),
    );

    /* Si ha subido ya, o qué le pasa. */
    const compartir = (c) => h('button.vr-compartir', { type: 'button', 'data-accion': 'compartir', onclick: () => abrirConforme(c) },
      icon('share'), 'Compartir el PDF');
    const rechazo = (c, encabezado, motivo = '') => h('div.vr-rechazado', { role: 'alert', 'data-conforme': c.id },
      h('p.vr-rechazado-titulo', null, encabezado),
      h('p.vr-rechazado-motivo', null, motivo || c.rechazado?.mensaje || 'El servidor no ha admitido el conforme.'),
      haceVisitas ? compartir(c)
        : h('p.vr-rechazado-nota', null, 'Para ponerlo a salvo tiene que entrar en este móvil quien hizo la visita.'),
    );
    let subida = null;
    if (conforme.subido === false) {
      if (conforme.rechazado) {
        subida = rechazo(conforme, 'No se ha podido guardar en el servidor:');
      } else {
        const intentos = Number(conforme.intentos) || 0;
        subida = h('p.vr-subida', { 'data-estado': 'pendiente' },
          !haceVisitas ? 'Pendiente de subir. Lo enviará quien hace visitas cuando entre en este móvil.'
            : intentos > 0 ? `Pendiente de subir · ${intentos} ${intentos === 1 ? 'intento' : 'intentos'}`
              : 'Pendiente de subir. Se enviará cuando haya cobertura.');
      }
    }
    // Otro conforme de esta misma visita firmado en ESTE móvil (dos
    // móviles en la misma visita): el servidor se queda con uno, y el
    // otro sigue aquí, con su PDF.
    const deMas = (await store.conformesDeMasDeLista(listaId)).filter((c) => c.subido === false);

    /* Mientras el conforme no ha subido, la pantalla se pone al día sola
       en cuanto cambia su suerte (sube, el servidor lo rechaza, suma un
       intento). La app ya repinta cuando la sincronización trae algo,
       pero NO mientras hay una hoja abierta —y aquí la hay nada más
       firmar: «El PDF está listo»—, y al cerrarla nadie avisaba: se
       quedaba diciendo «Pendiente de subir» con el papel ya arriba. */
    let vigia = 0;
    if (conforme.subido === false && !conforme.rechazado) {
      const pintado = `${conforme.id}|${conforme.intentos || 0}`;
      vigia = setInterval(async () => {
        if (document.querySelector('.sheet, .viewer.on, .d-hoja-acciones, .d-menu-velo, .d-velo')) return;
        const ahora = await store.conformeDeLista(listaId);
        if (!ahora) return;
        const visto = ahora.subido === false && !ahora.rechazado ? `${ahora.id}|${ahora.intentos || 0}` : 'otra cosa';
        if (visto !== pintado) { clearInterval(vigia); refrescar(); }
      }, 1500);
    }

    const datos = conforme.datos || {};
    const terminados = repasos.filter(hecha).length;
    const orientativa = E.esDia(datos.fechaOrientativa) && Array.isArray(datos.repasos) && datos.repasos.length
      ? datos.fechaOrientativa : '';
    const observaciones = typeof datos.observaciones === 'string' ? datos.observaciones.trim() : '';

    return {
      sinTabs: true,
      clase: 'pantalla-diseno',
      alSalir: () => clearInterval(vigia),
      contenido: [
        cabecera({ volver: () => ir(ficha), titulo: 'Visita de repasos' }),
        avisoLocal() || barraSync(),
        h('p.vr-sub', null, u?.nombre || 'La vivienda'),
        franja,
        subida,
        tarjetaConforme(conforme, { puede: haceVisitas }),
        ...deMas.map((c) => (c.rechazado
          ? rechazo(c, 'En este móvil hay otro conforme firmado de esta visita, y el servidor no lo ha admitido:')
          : rechazo(c, 'En este móvil hay otro conforme firmado de esta visita, todavía sin subir.',
            'La visita ya tiene su conforme en el servidor, así que este no se va a admitir. Su PDF sigue aquí.'))),
        orientativa ? h('div.vr-orientativa', null, icon('calendario'),
          h('span', null, 'Fecha orientativa de finalización: ', h('b', null, E.fechaLarga(orientativa, { conAno: true })))) : null,
        observaciones ? h('p.d-epigrafe.vr-epigrafe', null, 'Observaciones') : null,
        observaciones ? h('div.d-caja.vr-observaciones', null, observaciones) : null,
        h('p.d-epigrafe.vr-epigrafe', null, repasos.length
          ? `Repasos de la visita · ${cuentaDeRepasos(terminados, repasos.length)}` : 'Repasos de la visita'),
        listado || h('div.vr-vacio', null, 'En la visita no se anotó ningún repaso.'),
      ],
    };
  }

  /* ═══ La visita ABIERTA ═══ */
  const empezada = diaDeInstante(lista.creado);

  let ocupado = false;
  /** Apuntar un repaso: la foto, la descripción y guardar (js/views/tareas.js, sin prioridad ni fecha). */
  const nuevo = async () => {
    if (ocupado) return;
    ocupado = true;
    try { await nuevaTarea(listaId, { visita: true }); } catch (e) { toast(e?.message || 'No se ha podido apuntar el repaso', 'err'); } finally { ocupado = false; }
  };
  const finalizar = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      // Lo que se va a firmar es lo que haya AHORA, no lo que había al pintar.
      const [entrega, deAhora, yaFirmada] = await Promise.all([
        store.entregaDeUnidad(unidadId), store.tareasDeLista(listaId), store.conformeDeLista(listaId),
      ]);
      if (yaFirmada) { refrescar(); return; }
      await finalizarVisita({ lista, entrega, repasos: deAhora });
    } catch (e) {
      toast(e?.message || 'No se ha podido finalizar la visita', 'err');
    } finally {
      ocupado = false;
    }
  };

  /* «Borrar esta visita»: quien la empezó, o el administrador. */
  const puedeBorrar = haceVisitas && (store.esAdmin() || store.esMio(lista));
  const menu = !puedeBorrar ? null : async () => {
    const elegido = await menuTarjeta('Visita de repasos', [
      { id: 'borrar', icono: 'trash', rotulo: 'Borrar esta visita', rojo: true },
    ]);
    if (elegido !== 'borrar') return;
    const n = (await store.tareasDeLista(listaId)).length;
    const seguro = await confirmar({
      titulo: '¿Borrar esta visita?',
      texto: n === 0 ? 'Todavía no tiene ningún repaso.'
        : n === 1 ? 'Se borra su repaso con sus fotos. No se puede deshacer.'
          : `Se borran sus ${n} repasos con sus fotos. No se puede deshacer.`,
      ok: 'Borrar la visita', icono: 'trash', rojo: true,
    });
    if (!seguro) return;
    try {
      await store.borrarVisita(listaId);
      toast('Visita borrada', '', { icono: 'trash' });
      ir(ficha, { reemplazar: true });
    } catch (e) {
      toast(e?.message || 'No se ha podido borrar la visita', 'err');
      refrescar();
    }
  };

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    fab: haceVisitas
      ? h('button.fab.d-fab-negro.vr-nuevo', { type: 'button', onclick: nuevo }, icon('camera'), 'Nuevo repaso')
      : null,
    contenido: [
      cabecera({ volver: () => ir(ficha), titulo: 'Visita de repasos', menu: menu || undefined }),
      avisoLocal() || barraSync(),
      h('p.vr-sub', null, `${u?.nombre || 'La vivienda'}${empezada ? ` · ${E.fechaConDia(empezada)}` : ''}`),
      h('p.d-epigrafe.vr-epigrafe', null, repasos.length ? `Repasos de la visita · ${repasos.length}` : 'Repasos de la visita'),
      listado || h('div.vr-vacio', null, haceVisitas
        ? 'Todavía no hay ningún repaso. Haz una foto de cada cosa que haya que repasar.'
        : 'Todavía no hay ningún repaso apuntado en esta visita.'),
      haceVisitas
        ? h('button.d-boton-negro.vr-finalizar', { type: 'button', 'data-accion': 'finalizar', onclick: finalizar }, icon('check'), 'Finalizar visita')
        : null,
      haceVisitas
        ? h('p.vr-pie', null, repasos.length
          ? 'Al finalizar se enseña el documento y los compradores lo firman con el dedo.'
          : 'Si no hay nada que repasar, finaliza la visita igualmente: el documento dirá que no se ha anotado ningún repaso.')
        : null,
    ],
  };
}
