/* ═══════════════════════════════════════════════════════════════
   piezasPosventa.js — las piezas con dibujo de la sección «Postventa».

   Tres, y las tres se usan en más de una pantalla, por eso viven aparte:

     LOS CINCO BOTONES    piscina, climatización, domótica,
                          fotovoltaica y armarios,
                          como «bolitas que se rellenan»: huecas con el
                          borde y el icono de su color; macizas, con el
                          icono en blanco, cuando hay cita; en gris y
                          con el icono tachado cuando la villa no tiene
                          eso. Salen en fila en la tarjeta de la lista
                          y en cinco renglones en la ficha.
     LA TARJETA NEGRA     del «Conforme de la visita» firmado, que abre
                          el PDF. Sale en la ficha de la vivienda y en
                          la pantalla de la visita.
     LOS DOS DESPLEGABLES del repaso de la visita, oficio y estancia:
                          en la hoja de apuntarlo (js/views/tareas.js)
                          y en la de corregirlo (js/views/tarea.js). Y
                          el del lápiz del oficio, en la ficha del
                          repaso (oficioConDesplegable).

   Las reglas (qué es un botón resuelto, cómo se dice su día, quién
   firmó) están en js/posventa.js, que no tiene pantalla; aquí solo se
   pinta y se atiende al dedo.

   El día de un botón es el de la CITA con el instalador: se elige
   siempre en el calendario (no sale puesto «hoy»), se puede cambiar
   sin despulsar, y el botón está pulsado desde que hay cita aunque el
   día no haya llegado. Solo los pulsan el comercial y el administrador
   (puedePonerFechas); los demás los ven.
   ═══════════════════════════════════════════════════════════════ */
import { h, icon, toast, sheet } from './ui.js';
import * as store from './store.js';
import { hojaFecha, entregarFichero } from './piezas.js';
import * as E from './entregas.js';
import {
  BOTONES, NO_TIENE, valorDeBoton, estadoDeBoton, pieDeBoton, filaDeBoton, ariaDeBoton,
  firmantesDe, fraseDeFirma, firmadoEl,
  oficiosDelDesplegable, estanciasDelDesplegable,
} from './posventa.js';

/* ─── Los cinco botones ──────────────────────────────────────── */

/** La bolita de un botón, sola: el redondel con su icono y, si no tiene, la raya que lo tacha. */
function bolita(boton, valor, { alPulsar = null } = {}) {
  const estado = estadoDeBoton(valor);
  const nodo = h(alPulsar ? 'button.pv-bolita' : 'span.pv-bolita', {
    class: `${boton.clave} ${estado}`,
    type: alPulsar ? 'button' : null,
    role: alPulsar ? null : 'img',
    'aria-pressed': alPulsar ? (estado === 'si' ? 'true' : 'false') : null,
    'aria-disabled': alPulsar ? null : 'true',
    'aria-label': ariaDeBoton(boton, valor),
    'data-boton': boton.clave,
    'data-estado': estado,
    onclick: alPulsar ? (ev) => { ev.stopPropagation(); alPulsar(); } : null,
  }, icon(boton.icono));
  if (estado === 'nt') nodo.append(h('span.pv-raya'));
  return nodo;
}

/**
 * Los cinco botones de una vivienda entregada.
 *
 *   entrega    su ficha de entrega (de ahí salen los cinco valores, la
 *              vivienda y la promoción).
 *   puede      si quien mira pone fechas: entonces son botones y abren
 *              su hoja; si no, se ven igual y no hacen nada.
 *   alCambiar  se llama cuando algo se ha guardado, para repintar.
 *   forma      'fila' (la tarjeta de la lista: las cinco bolitas una
 *              junto a otra, con el día debajo) o 'lista' (la ficha:
 *              cinco renglones con la bolita, el nombre y «cita el…»).
 */
export function botonesPosventa(entrega, { puede = false, alCambiar = () => {}, forma = 'fila' } = {}) {
  const e = entrega || {};
  const pulsar = (boton) => (puede ? () => hojaDeBoton(boton, e, alCambiar) : null);

  if (forma === 'lista') {
    return h('div.pv-botones-lista', { role: 'group', 'aria-label': 'Puestas en marcha y armarios' },
      ...BOTONES.map((boton) => {
        const valor = valorDeBoton(e, boton.clave);
        return h('div.pv-fila-boton', { 'data-boton': boton.clave },
          bolita(boton, valor, { alPulsar: pulsar(boton) }),
          h('span.pv-fila-nombre', null, boton.nombre),
          h('span.pv-fila-cuando', { class: estadoDeBoton(valor) === 'si' ? '' : 'gris' }, filaDeBoton(valor)),
        );
      }));
  }

  const valores = BOTONES.map((boton) => valorDeBoton(e, boton.clave));
  return h('div.pv-botones', {
    // Si ninguna tiene nada que enseñar debajo, la línea del día no ocupa.
    class: valores.some(Boolean) ? '' : 'vacio',
    role: 'group', 'aria-label': 'Puestas en marcha y armarios',
  }, ...BOTONES.map((boton, i) => h('div.pv-uno', { class: estadoDeBoton(valores[i]) },
    bolita(boton, valores[i], { alPulsar: pulsar(boton) }),
    h('span.pv-dia', null, pieDeBoton(valores[i])),
  )));
}

/** «Lo apuntó Marta.», con el nombre de pila de quien tocó el botón por última vez; '' si no se sabe. */
function quienLoApunto(entrega, clave) {
  const pila = String(entrega?.[`${clave}PorNombre`] || '').trim().split(/\s+/)[0];
  return pila ? ` Lo apuntó ${pila}.` : '';
}

/** El día que devuelve hojaFecha() (un instante a mediodía) como día suelto. */
const diaDeHoja = (v) => E.isoDe(new Date(v));
/** Y al revés: un día suelto como lo quiere hojaFecha(). */
const paraHoja = (dia) => E.partes(dia).fecha.toISOString();

/**
 * La hoja de un botón. Nunca se guarda con un toque suelto: sin pulsar,
 * hay que elegir el día y darle a «Guardar»; pulsado, se cambia el día
 * o se quita la marca; y si la villa no tiene eso, se puede decir que
 * sí lo tiene.
 */
async function hojaDeBoton(boton, entrega, alCambiar) {
  const valor = valorDeBoton(entrega, boton.clave);
  const guardar = async (nuevo, aviso) => {
    try {
      await store.fijarBotonPosventa(entrega.unidadId, entrega.promoId, boton.clave, nuevo);
      toast(aviso, '', { icono: boton.icono });
      alCambiar();
    } catch (err) {
      toast(err.message || 'No se ha podido guardar', 'err');
    }
  };
  const avisoDeCita = (dia) => `${boton.nombre}: cita el ${E.fechaConDia(dia)}`;

  /* ── Sin pulsar: elegir el día (no se propone ninguno) y guardar ── */
  if (!valor) {
    const elegido = await sheet((cerrar) => {
      let dia = '';
      const rotulo = h('span.grow', null, 'Elegir el día');
      const fila = h('button.pv-elegir-dia', {
        type: 'button',
        onclick: async () => {
          const v = await hojaFecha(dia ? paraHoja(dia) : null);
          // Cerrar el calendario sin tocar nada deja lo que hubiera;
          // «Quitar la fecha» vuelve a dejarlo sin día.
          if (v === null) return;
          dia = v ? diaDeHoja(v) : '';
          rotulo.textContent = dia ? E.fechaConDia(dia) : 'Elegir el día';
          fila.classList.toggle('puesto', !!dia);
          botonGuardar.disabled = !dia;
        },
      }, icon('calendario'), rotulo, icon('chevron'));
      const botonGuardar = h('button.d-boton-negro', {
        type: 'button', disabled: true,
        onclick: () => { if (dia) cerrar(dia); },
      }, 'Guardar');
      return [
        h('h2.title', null, boton.nombre),
        h('p.hint.pv-hoja-frase', null, `Los compradores ya han quedado ${boton.conQuien}. ¿Para qué día es la cita?`),
        fila,
        h('div.pv-hoja-botones', null,
          botonGuardar,
          boton.admiteNoTiene
            ? h('button.d-boton-negro.claro', { type: 'button', onclick: () => cerrar(NO_TIENE) }, boton.queNoTiene)
            : null,
        ),
      ];
    });
    if (!elegido) return;
    if (elegido === NO_TIENE) await guardar(NO_TIENE, `${boton.nombre}: no tiene`);
    else await guardar(elegido, avisoDeCita(elegido));
    return;
  }

  /* ── «No tiene»: se puede decir que sí lo tiene ── */
  if (valor === NO_TIENE) {
    const elegido = await sheet((cerrar) => [
      h('h2.title', null, boton.nombre),
      h('p.hint.pv-hoja-frase', null, `${boton.queNoTiene}.${quienLoApunto(entrega, boton.clave)}`),
      h('div.pv-hoja-filas', null,
        h('button.d-menu-fila', { type: 'button', onclick: () => cerrar('si-tiene') },
          icon(boton.icono), h('span.grow', null, boton.queSiTiene,
            h('span.d-menu-sub', null, 'Vuelve a quedar sin cita'))),
      ),
    ]);
    if (elegido === 'si-tiene') await guardar('', `${boton.nombre}: sin cita`);
    return;
  }

  /* ── Pulsado: cambiar el día (sigue pulsado) o quitar la marca ── */
  const elegido = await sheet((cerrar) => [
    h('h2.title', null, boton.nombre),
    h('p.hint.pv-hoja-frase', null, `Cita el ${E.fechaConDia(valor)}.${quienLoApunto(entrega, boton.clave)}`),
    h('div.pv-hoja-filas', null,
      h('button.d-menu-fila', { type: 'button', onclick: () => cerrar('cambiar') },
        icon('calendario'), h('span.grow', null, 'Cambiar el día',
          h('span.d-menu-sub', null, 'Si la cita se ha movido. El botón sigue pulsado'))),
      h('button.d-menu-fila.rojo', { type: 'button', onclick: () => cerrar('quitar') },
        icon('x'), h('span.grow', null, 'Quitar la marca',
          h('span.d-menu-sub', null, 'El botón vuelve a quedar sin cita'))),
    ),
  ]);
  if (elegido === 'cambiar') {
    const v = await hojaFecha(paraHoja(valor));
    if (v === null) return;
    // En el calendario, «Quitar la fecha» es quitar la marca.
    if (!v) { await guardar('', `${boton.nombre}: sin cita`); return; }
    const dia = diaDeHoja(v);
    if (dia === valor) return;
    await guardar(dia, avisoDeCita(dia));
  } else if (elegido === 'quitar') {
    await guardar('', `${boton.nombre}: sin cita`);
  }
}

/* ─── El conforme firmado ────────────────────────────────────── */

/** El nombre del fichero de un conforme que este móvil no firmó (la fila no lo trae). */
async function nombreDeFichero(conforme) {
  if (conforme?.nombre) return conforme.nombre;
  try {
    // El nombre lo pone el mismo módulo que hace el papel, para que el
    // PDF se llame igual lo abra quien lo abra: el día de la visita y
    // la hora de la primera firma. Ese módulo solo da por firmada una
    // firma que trae su garabato, y el garabato no se guarda como dato
    // (va dibujado dentro del PDF): aquí la hora de la firma se le pasa
    // en el sitio de la hora de la visita, que es la que usa cuando no
    // ve ninguna firmada. Sin esto, el mismo papel se llamaría de una
    // manera en el móvil que firmó y de otra en los demás.
    const { nombreDeConforme } = await import('./pdfConforme.js');
    const datos = conforme?.datos || {};
    const nombre = nombreDeConforme({ ...datos, firmas: [], horaVisita: firmadoEl(conforme).hora || datos.horaVisita || '' });
    if (nombre && nombre !== '.pdf') return nombre;
  } catch { /* sin el módulo, un nombre llano */ }
  return 'Conforme_de_la_visita.pdf';
}

let abriendo = false;
/**
 * Abre el PDF de un conforme firmado: lo saca de este móvil si lo tiene
 * (funciona sin cobertura) o lo pide al servidor, y lo entrega con la
 * hoja de siempre («Compartir» / «Guardar»). No se abre en una pestaña
 * aparte: en el iPhone instalado podría no llevar la sesión.
 */
export async function abrirConforme(conforme) {
  if (abriendo) return;
  abriendo = true;
  try {
    const nombre = await nombreDeFichero(conforme);
    const fichero = await store.ficheroDeConforme(conforme, nombre);
    entregarFichero(fichero, nombre);
  } catch (err) {
    toast(err?.codigo === 'red' ? 'Sin cobertura: el conforme se podrá abrir cuando vuelva.'
      : (err?.message || 'No se ha podido abrir el conforme.'), 'err');
  } finally {
    abriendo = false;
  }
}

/**
 * La tarjeta del «Conforme de la visita» firmado.
 *
 *   puede   si quien mira abre el papel (quien hace visitas): entonces
 *           es la tarjeta negra, con la bola de bajar, y al tocarla
 *           sale el PDF. Los demás ven, en su lugar, que está firmado,
 *           cuándo y por quién, y quién lo puede abrir.
 */
export function tarjetaConforme(conforme, { puede = false } = {}) {
  const quien = firmantesDe(conforme);
  if (!puede) {
    return h('div.pv-conforme-cerrado', { 'data-conforme': conforme?.id || '' },
      icon('documento'),
      h('div.grow', null,
        h('div.pv-conforme-titulo', null, 'Conforme de la visita'),
        h('div.pv-conforme-firma', null, `${fraseDeFirma(conforme)}.`),
        h('div.pv-conforme-nota', null, 'El conforme firmado lo abren el administrador, el comercial y la dirección facultativa.'),
      ),
    );
  }
  const sinSubir = conforme?.subido === false;
  return h('button.d-menu-destacada.pv-conforme', {
    type: 'button',
    'data-conforme': conforme?.id || '',
    'aria-label': `Abrir el conforme de la visita${quien ? `, firmado por ${quien}` : ''}`,
    onclick: () => abrirConforme(conforme),
  },
    icon('documento'),
    h('span.grow', null,
      h('span', null, 'Conforme de la visita'),
      h('span.d-menu-sub', null, `PDF${quien ? ` · firmado por ${quien}` : ' · firmado'}${sinSubir ? ' · pendiente de subir' : ''}`)),
    h('span.bajar', null, icon('download')),
  );
}

/* ─── Los dos desplegables del repaso de la visita ───────────────
   Un <select> nativo de ancho completo, con su rótulo encima y la
   forma del campo de la casa (.input): en el iPhone se abre como la
   rueda del sistema, que con el comprador delante se maneja con el
   pulgar sin buscar entre treinta chips. El orden de las opciones y
   con cuál nace cada uno, en js/posventa.js. La flecha de la derecha
   es dibujo: no recibe el dedo, que va al desplegable de debajo. */

/** Un desplegable con su rótulo. `alCambiar(valor)` se llama cada vez que se elige otra opción. */
function desplegable({ nombre, rotulo, opciones, valor, alCambiar }) {
  const selector = h('select.input.vr-desplegable', { name: nombre, 'data-desplegable': nombre },
    ...opciones.map((o) => h('option', { value: o.valor }, o.texto)));
  selector.value = valor;
  // Si lo que traía no está entre las opciones, la primera: nunca en blanco.
  if (selector.selectedIndex < 0) selector.selectedIndex = 0;
  selector.addEventListener('change', () => alCambiar(selector.value));
  return h('label.field.vr-campo', null,
    h('span.lbl.eyebrow', null, rotulo),
    h('span.vr-desplegable-caja', null, selector, icon('caretAbajo')),
  );
}

/** El oficio del repaso de la visita: «General» y los demás por orden alfabético. */
export function desplegableOficio(valor, alCambiar = () => {}) {
  return desplegable({ nombre: 'oficio', rotulo: 'Oficio', opciones: oficiosDelDesplegable(), valor, alCambiar });
}

/**
 * El chip del oficio y su lápiz, en la ficha de un repaso de la visita,
 * con el desplegable del sistema ENCIMA: un <select> nativo, invisible,
 * que tapa a los dos. Tocar el chip o el lápiz es tocar el desplegable,
 * y lo abre el propio sistema —en el iPhone, la rueda— con «General» el
 * primero, los demás por orden alfabético y el de ahora elegido (pedido
 * el 17-11-2026; antes abría la hoja de chips de siempre, que en los
 * repasos de obra sigue igual).
 *
 * No se abre desde el código, con focus() o showPicker(): en el iPhone
 * un desplegable solo se abre de forma fiable con el dedo encima, y por
 * eso el dedo cae en él y no en un botón. Lleva letra de 16 px aunque no
 * se vea: con menos, el iPhone amplía la pantalla al tocarlo.
 *
 *   actual     el oficio del repaso (su id).
 *   nombre     cómo se llama.
 *   chip       su chip, ya hecho por la ficha (con la forma de los de
 *              su fila); aquí se le pone debajo del desplegable.
 *   alElegir   se llama con el id elegido, solo si es otro.
 */
export function oficioConDesplegable(actual, nombre, chip, alElegir = () => {}) {
  const opciones = oficiosDelDesplegable();
  // Un oficio que ya no está en la lista sale el primero, tal cual, para
  // que el desplegable no diga otro distinto del que lleva el repaso.
  if (actual && !opciones.some((o) => o.valor === actual)) opciones.unshift({ valor: actual, texto: nombre });
  const selector = h('select.d-oficio-selector', { 'aria-label': 'Cambiar de oficio', 'data-desplegable': 'oficio-repaso' },
    ...opciones.map((o) => h('option', { value: o.valor }, o.texto)));
  selector.value = actual;
  if (selector.selectedIndex < 0) selector.selectedIndex = 0;
  selector.addEventListener('change', () => {
    if (selector.value && selector.value !== actual) alElegir(selector.value);
  });
  // Lo que se ve queda debajo y no se lee: quien no ve oye el desplegable.
  chip.setAttribute('aria-hidden', 'true');
  return h('span.d-oficio-desplegable', null,
    chip,
    h('span.d-lapiz-oficio', { 'aria-hidden': 'true' }, icon('edit')),
    selector,
  );
}

/** La estancia del repaso de la visita, opcional: «Sin estancia» y las de la obra por orden alfabético. */
export function desplegableEstancia(valor = '', alCambiar = () => {}) {
  return desplegable({
    nombre: 'estancia', rotulo: 'Estancia · opcional',
    opciones: estanciasDelDesplegable(undefined, valor), valor: valor || '', alCambiar,
  });
}
