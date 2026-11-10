/* ═══════════════════════════════════════════════════════════════
   constancia.js — la descarga del «Reconocimiento de repasos
   pendientes» de una vivienda: el papel que se firma en la notaría.

   Se pulsa la tarjeta negra del menú «···» de la villa y se descarga.
   No hay pantalla de revisión ni de edición: mientras el servidor lee
   los repasos, mira las fotos y redacta, un velo a pantalla completa
   cuenta por qué paso va. Al acabar se quita solo y entrega el PDF.

   Tres reglas que este fichero no se salta:

   · El velo NUNCA se queda colgado. Cualquier tropiezo acaba en una
     frase, «Volver a intentarlo» y «Cerrar».
   · «Cancelar» vale en cualquier paso. Lo que el servidor ya tenga
     guardado —fotos miradas, el documento redactado— se aprovecha la
     próxima vez, así que cancelar no tira el dinero.
   · La IA se gasta lo justo: si el documento de la vivienda está al
     día, se descarga sin volver a llamarla.

   En pantalla se llama «Reconocimiento de repasos pendientes»; por
   dentro, «constancia» (ver CLAUDE.md: «acta» es solo el documento de
   una reunión de obra).
   ═══════════════════════════════════════════════════════════════ */
import { h, icon, toast, confirmar } from './ui.js';
import * as api from './api.js';
import * as store from './store.js';
import { promocion, unidad, puedeVerificar } from './catalog.js';
import { entregarFichero, chevron } from './piezas.js';
import { ir } from './app.js';

/* ─── Los textos, en un solo sitio ───────────────────────────── */
const TITULO = 'Reconocimiento de repasos pendientes';

/** Los pasos del velo, en el orden en que se pintan. */
const PASOS = {
  leer: 'Leyendo los repasos',
  fotos: 'Mirando las fotos',
  redactar: 'Redactando el documento',
  ajustar: 'Ajustando el texto a la página',
  pdf: 'Preparando el PDF',
};
const ORDEN = Object.keys(PASOS);

const FRASES = {
  espera: 'La primera vez puede tardar uno o dos minutos. No cierres la app.',
  sinConexion: 'Hace falta conexión para preparar el documento.',
  sinClaveAdmin: 'Falta la clave de la IA. Se pone en Ajustes.',
  sinClave: 'Falta la clave de la IA. Avisa al administrador.',
  sinRepasos: 'Esta vivienda no tiene repasos pendientes ahora mismo: no hay documento que generar.',
  tarda: 'El servidor está tardando demasiado en contestar. Vuelve a intentarlo dentro de un momento.',
  sinFrase: 'El servidor no ha contestado bien (error {codigo}). Vuelve a intentarlo dentro de un momento.',
  // Contesta, pero no es la app quien contesta: la página de entrada
  // de un wifi con portal, un hosting a medio publicar.
  sinRespuesta: 'El servidor no ha contestado bien. Comprueba la conexión y vuelve a intentarlo dentro de un momento.',
  // Un módulo que no llegó a bajar, hay navegadores que no lo vuelven a
  // pedir hasta que la app se abre de nuevo: por eso la segunda mitad.
  sinTaller: 'No se ha podido cargar lo necesario para montar el PDF. Comprueba la conexión y vuelve a intentarlo; si sigue igual, cierra la app y ábrela de nuevo.',
  // Lo que significa «Seguir sin mirar las fotos», debajo del fallo.
  sinFotos: 'Sin las fotos, el documento se redacta solo con lo anotado en cada repaso.',
  // Lo apuntado en este teléfono que no ha conseguido subir: el papel
  // saldría sin ello. Se dice y se pregunta; no se sigue callado.
  sinSubir: (n) => (n === 1
    ? 'Este teléfono tiene 1 cambio de esta vivienda sin subir. El documento saldría sin él.'
    : `Este teléfono tiene ${n} cambios de esta vivienda sin subir. El documento saldría sin ellos.`),
  sinSubirAclaracion: 'Comprueba la conexión y vuelve a intentarlo para que suban antes de redactar.',
  generica: 'No se ha podido preparar el documento.',
};

/** El tipo de cada nota interna, en palabras llanas. */
const TIPOS_DE_NOTA = {
  duda: 'Duda de la redacción',
  generico: 'Citado solo de forma general',
  nombre: 'Posible nombre propio',
  foto: 'La foto no cuadra con la anotación',
  sensible: 'Punto delicado: conviene leerlo',
};

/** Las fotos se miran de seis en seis y hasta tres lotes a la vez. */
const FOTOS_POR_LOTE = 6;
const LOTES_A_LA_VEZ = 3;

/* El reposo: medio segundo en que un toque no cuenta. Es lo que tarda,
   como mucho, el segundo toque de quien pulsa dos veces seguidas, y
   ese segundo toque no debe decidir nada que nadie ha leído:

   · Los botones del velo, recién pintados, todavía no atienden. En una
     pantalla ancha el velo se recoloca al cambiar de botones y
     «Cancelar» cae justo donde estaba «Volver a intentarlo»: el
     segundo toque cancelaba el reintento sin decir nada.
   · Cuando el velo se quita por un toque («Cancelar», «Cerrar»), lo
     que hay debajo tampoco atiende: el segundo toque abría «Nueva
     inspección» o se iba a la ficha de un repaso. */
const REPOSO = 500;

/* Un tropiezo con su frase ya escrita para quien lo lee en el velo.
   `pasoHecho` dice que el paso en que salta sí se completó —se leyó la
   vivienda— y lo que no se puede es seguir: ese paso no se marca como
   fallido. */
class Tropiezo extends Error {
  constructor(frase, codigo = '', { pasoHecho = false } = {}) {
    super(frase);
    this.codigo = codigo;
    this.pasoHecho = pasoHecho;
  }
}
const CANCELADO = 'cancelado';
const esRed = (e) => e instanceof api.ApiError && e.status === 0 && e.codigo !== 'tarda' && e.codigo !== CANCELADO;

/* ¿Es esto lo que contesta la app? Un 200 no lo garantiza: la página
   de entrada de un wifi con portal o un hosting a medio publicar
   también contestan 200, sin JSON o con uno que no es el nuestro. El
   estado de una vivienda trae siempre `hayClave` a verdadero o a falso;
   si no lo trae, no es que falte la clave: es que no ha contestado quien
   debía. */
const esObjeto = (r) => !!r && typeof r === 'object' && !Array.isArray(r);
const esEstado = (r) => esObjeto(r) && typeof r.hayClave === 'boolean';

/* ─── El velo ─────────────────────────────────────────────────── */
/**
 * La capa a pantalla completa: cabecera, pasos con su marca, la nota
 * de la espera y el pie con sus botones. Se maneja con:
 *
 *   empezar()                    deja solo el primer paso y el último
 *   poner(paso, estado, detalle) 'pendiente' · 'curso' · 'hecho' ·
 *                                'saltado' · 'fallo'; el detalle va
 *                                entre paréntesis («12 de 48»)
 *   estadoDe(paso)               en qué estado está ('' si no se pinta)
 *   preguntar(frase, botones)    cambia la espera por una frase y sus
 *                                botones; resuelve con el `id` pulsado
 *   quitar()                     la retira; si es por un toque recién
 *                                dado, deja un escudo que se traga el
 *                                siguiente (ver REPOSO)
 *
 * Los botones del pie, recién pintados, llevan `aria-disabled` y no
 * atienden hasta que pasa el reposo.
 */
function montarVelo(villa, alCancelar) {
  const nodos = new Map();
  const lista = h('ol.d-constancia-pasos', { 'aria-live': 'polite' });
  const frase = h('p.d-constancia-frase');
  const detalle = h('p.d-constancia-detalle');
  const fallo = h('div.d-constancia-fallo', { role: 'alert', hidden: true },
    icon('alert'), h('div.grow', null, frase, detalle));
  const nota = h('p.d-constancia-nota', null, FRASES.espera);
  const pie = h('div.d-constancia-pie');

  // Lleva también la clase `d-velo`, la de los velos de la casa: es lo
  // que mira app.js para saber que hay algo a medias y no repintar la
  // pantalla de debajo ni recargar la app con una versión nueva en
  // mitad de la descarga.
  const capa = h('div.d-velo.d-constancia', { role: 'dialog', 'aria-modal': 'true', 'aria-label': TITULO },
    h('div.d-constancia-caja', null,
      h('div.d-constancia-cab', null,
        h('span.d-constancia-sello', null, icon('documento')),
        h('h2.d-constancia-titulo', null, TITULO),
        h('p.d-constancia-villa', null, villa),
      ),
      lista, fallo, nota, pie,
    ),
  );

  // El reposo de los botones (ver REPOSO). `reposan` manda; el
  // `aria-disabled` lo dice hacia fuera, sin cambiarles la cara.
  let reposan = false;
  let relojReposo = 0;
  let ultimoToque = -Infinity;
  const boton = (rotulo, alPulsar, claro) =>
    h(claro ? 'button.d-boton-negro.claro' : 'button.d-boton-negro', {
      onclick: () => {
        if (reposan) return;
        ultimoToque = performance.now();
        alPulsar();
      },
    }, rotulo);
  const ponerBotones = (botones) => {
    clearTimeout(relojReposo);
    reposan = true;
    for (const b of botones) b.setAttribute('aria-disabled', 'true');
    pie.replaceChildren(...botones);
    relojReposo = setTimeout(() => {
      reposan = false;
      for (const b of botones) b.removeAttribute('aria-disabled');
    }, REPOSO);
  };

  const poner = (paso, estado, entre = '') => {
    let n = nodos.get(paso);
    if (!n) {
      n = { marca: h('span.d-constancia-marca'), rotulo: h('span.grow'), estado: '' };
      n.li = h('li.d-constancia-paso', null, n.marca, n.rotulo);
      nodos.set(paso, n);
      // Cada paso en su sitio, aunque se pinte más tarde que el siguiente.
      const despues = ORDEN.slice(ORDEN.indexOf(paso) + 1).map((p) => nodos.get(p)).find(Boolean);
      lista.insertBefore(n.li, despues ? despues.li : null);
    }
    // La marca solo se toca si cambia: repintarla en cada foto haría
    // tartamudear el girito.
    if (n.estado !== estado) {
      n.estado = estado;
      n.li.className = `d-constancia-paso ${estado}`;
      n.marca.replaceChildren(...(estado === 'hecho' ? [icon('check')] : estado === 'fallo' ? [icon('x')] : []));
    }
    n.rotulo.textContent = PASOS[paso] + (entre ? ` (${entre})` : '');
  };

  // Si «Cancelar» ya está puesto se deja como está: pintarlo otra vez
  // lo tendría otro medio segundo sin atender.
  let cancelable = false;
  const trabajando = () => {
    fallo.hidden = true;
    nota.hidden = false;
    if (cancelable) return;
    cancelable = true;
    ponerBotones([boton('Cancelar', alCancelar, true)]);
  };

  document.body.append(capa);
  trabajando();

  return {
    poner,
    estadoDe: (paso) => nodos.get(paso)?.estado || '',
    empezar() {
      for (const n of nodos.values()) n.li.remove();
      nodos.clear();
      trabajando();
      poner('leer', 'curso');
      poner('pdf', 'pendiente');
    },
    preguntar(texto, botones, { aclaracion = '', aviso = false } = {}) {
      return new Promise((resolver) => {
        frase.textContent = texto;
        detalle.textContent = aclaracion;
        detalle.hidden = !aclaracion;
        // «sereno» y no «aviso»: .aviso es la banda flotante de la casa.
        fallo.classList.toggle('sereno', aviso);
        fallo.hidden = false;
        nota.hidden = true;
        cancelable = false;
        ponerBotones(botones.map((b, i) => boton(b.rotulo, () => resolver(b.id), i > 0)));
      });
    },
    quitar() {
      clearTimeout(relojReposo);
      if (!capa.isConnected) return;
      capa.remove();
      // Si se quita por un toque recién dado, lo que queda del reposo lo
      // cubre un escudo que no se ve: el toque siguiente se queda en él
      // y no en lo que el velo tapaba.
      const falta = REPOSO - (performance.now() - ultimoToque);
      if (falta <= 0) return;
      const escudo = h('div.d-constancia-escudo', { 'aria-hidden': 'true' });
      document.body.append(escudo);
      setTimeout(() => escudo.remove(), falta);
    },
  };
}

/* ─── La pantalla despierta ───────────────────────────────────── */
/**
 * Que el teléfono no se duerma a media redacción. Donde no se puede
 * (o no se deja), no pasa nada. El sistema suelta el candado cada vez
 * que la app pasa a segundo plano, así que se vuelve a pedir al volver.
 * Devuelve la función que lo suelta.
 */
function mantenerDespierta() {
  let candado = null;
  let hace = true;
  const pedir = async () => {
    if (!hace || document.visibilityState !== 'visible') return;
    try {
      const nuevo = await navigator.wakeLock?.request?.('screen');
      if (!nuevo) return;
      if (hace) candado = nuevo;
      else nuevo.release?.().catch(() => {});
    } catch { /* sin permiso o sin soporte: se sigue igual */ }
  };
  document.addEventListener('visibilitychange', pedir);
  pedir();
  return () => {
    hace = false;
    document.removeEventListener('visibilitychange', pedir);
    try { candado?.release?.().catch(() => {}); } catch { /* ya estaba suelto */ }
    candado = null;
  };
}

/* ─── Lo que hace falta para montar el PDF ────────────────────── */
/**
 * El módulo del PDF y su letra, pedidos nada más empezar para que
 * bajen mientras el servidor trabaja. La letra puede faltar (el PDF
 * sale con la de reserva); el módulo, no.
 */
function cargarTaller() {
  const modulo = import('./pdfConstancia.js');
  const taller = modulo.then(async (pdf) => ({
    pdf,
    fuente: await pdf.cargarTipografia().catch(() => null),
  }), () => { throw new Tropiezo(FRASES.sinTaller); });
  // Si se cancela antes de usarlo, que no quede un rechazo sin recoger.
  taller.catch(() => {});
  return taller;
}

/** El documento tal como lo quiere pdfConstancia.js. */
function montarDoc(u, promo, actual, compradores) {
  return {
    // «Villa 07» en la app, «VIVIENDA 7» en el papel.
    vivienda: String(u.corto).replace(/^0+(?=\d)/, ''),
    promocion: String(promo.nombre).toLocaleUpperCase('es'),
    fecha: actual.registro,
    compradores: compradores || '',
    zonas: (actual.texto?.zonas || []).map((z) => ({ titulo: z.titulo, texto: z.texto })),
  };
}

/* ─── Las fotos ───────────────────────────────────────────────── */
/**
 * Manda a mirar las fotos por lotes, varios a la vez. Al primer error
 * no sale ningún lote más; los que ya estaban en camino se esperan
 * (lo que el servidor guarde de ellos no se vuelve a pagar) y entonces
 * se lanza el error.
 */
async function mirarFotos(unidadId, ids, senal, alAvanzar) {
  const lotes = [];
  for (let i = 0; i < ids.length; i += FOTOS_POR_LOTE) lotes.push(ids.slice(i, i + FOTOS_POR_LOTE));
  let siguiente = 0;
  let error = null;
  const mano = async () => {
    while (!error && siguiente < lotes.length) {
      const lote = lotes[siguiente++];
      try {
        await api.constanciaMirar(unidadId, lote, { senal });
        alAvanzar(lote.length);
      } catch (e) {
        error = error || e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOTES_A_LA_VEZ, lotes.length) }, mano));
  if (error) throw error;
}

/* ─── Un intento, de principio a fin ──────────────────────────── */
/**
 * Los ocho pasos. Devuelve { fichero, nombre, actual } o lanza. `m` es
 * la marcha de esta descarga: la vivienda, el velo, la señal de
 * cancelar y las dos decisiones que sobreviven a un reintento
 * (`sinFotos` y `forzar`). `m.paso` dice por dónde iba si algo falla.
 */
async function intentar(m) {
  const { unidadId, velo, senal } = m;
  const seguir = () => { if (m.cancelada) throw new Tropiezo('Descarga cancelada', CANCELADO); };
  const empezarPaso = (paso, entre) => { m.paso = paso; velo.poner(paso, 'curso', entre); };

  const taller = cargarTaller();

  for (let vuelta = 0; ; vuelta++) {
    velo.empezar();
    m.paso = 'leer';

    // 1. Lo último apuntado en este teléfono tiene que estar en el
    //    servidor antes de redactar. Si la sincronización falla, se
    //    sigue: el paso siguiente dirá si hay conexión o no.
    if (vuelta === 0) {
      try {
        await store.sincronizar({ forzar: true });
        // Si ya había una sincronización en marcha, la llamada de arriba
        // se sube a esa, que pudo empezar antes del último apunte. Si
        // acabó bien y aún queda algo en la cola, una vuelta más.
        if (store.estadoSync.pendientes > 0 && !store.estadoSync.error) {
          await store.sincronizar({ forzar: true });
        }
      } catch { /* no corta */ }
      seguir();
      // Que la sincronización falle no corta, pero tampoco se calla: si
      // algo de ESTA vivienda sigue sin subir, el servidor no lo conoce
      // y el documento saldría sin ello. Se pregunta, y la respuesta
      // («Seguir sin ellos») sobrevive al reintento.
      if (!m.sinLoSuyo) {
        let sinSubir = 0;
        try { sinSubir = await store.sinSubirDeUnidad(unidadId); } catch { /* sin memoria: se sigue */ }
        seguir();
        if (sinSubir > 0) throw new Tropiezo(FRASES.sinSubir(sinSubir), 'sin-subir');
      }
    }

    // 2. Cómo está la vivienda.
    let estado;
    try {
      estado = await api.constanciaVer(unidadId, { senal });
    } catch (e) {
      throw esRed(e) ? new Tropiezo(FRASES.sinConexion) : e;
    }
    seguir();
    if (!esEstado(estado)) throw new Tropiezo(FRASES.sinRespuesta);
    // Sin clave solo se corta si de verdad hay que redactar: un
    // documento ya redactado y al día se vuelve a bajar sin la IA.
    if (!estado.hayClave && (m.forzar || !(estado.actual && estado.alDia))) {
      throw new Tropiezo(store.esAdmin() ? FRASES.sinClaveAdmin : FRASES.sinClave, 'sin-clave', { pasoHecho: true });
    }
    if (!((estado.cuenta?.pendientes || 0) + (estado.cuenta?.rechazados || 0))) {
      throw new Tropiezo(FRASES.sinRepasos, 'sin-repasos', { pasoHecho: true });
    }
    velo.poner('leer', 'hecho');

    // 3. Con el documento al día no se gasta IA: derecho a medir.
    let actual = estado.actual;
    if (m.forzar || !(actual && estado.alDia)) {
      // 4. Las fotos que falten por mirar.
      const porMirar = m.sinFotos ? [] : (estado.fotos?.porMirar || []);
      if (porMirar.length) {
        const total = Math.max(estado.fotos.total || 0, porMirar.length);
        let miradas = Math.max(0, total - porMirar.length);
        const cuenta = () => `${Math.min(miradas, total)} de ${total}`;
        velo.poner('redactar', 'pendiente');
        empezarPaso('fotos', cuenta());
        await mirarFotos(unidadId, porMirar, senal, (n) => {
          miradas += n;
          if (!m.cancelada) velo.poner('fotos', 'curso', cuenta());
        });
        seguir();
        velo.poner('fotos', 'hecho', cuenta());
      }

      // 5. Redactar.
      empezarPaso('redactar');
      estado = await api.constanciaRedactar(unidadId, { sinFotos: m.sinFotos, forzar: m.forzar }, { senal });
      seguir();
      // Si no ha contestado la app, no se ha redactado nada: se dice, y
      // el reintento lo pide igual que ahora.
      if (!esObjeto(estado)) throw new Tropiezo(FRASES.sinRespuesta);
      // La redacción forzada ya está hecha y pagada: si después falla
      // otra cosa, el reintento no la repite.
      m.forzar = false;
      actual = estado.actual;
      if (!actual) throw new Tropiezo(FRASES.generica);
      velo.poner('redactar', 'hecho');
    }

    // 6. Medir con el mismo motor que pinta el PDF y, si hace falta,
    //    UNA segunda pasada.
    m.paso = 'pdf';
    const { pdf, fuente } = await taller;
    seguir();
    const medida = pdf.medirConstancia(montarDoc(m.u, m.promo, actual, estado.compradores));
    if (!actual.ajustado && (actual.pideAjuste || !medida.cabe)) {
      empezarPaso('ajustar');
      try {
        const ajustado = await api.constanciaAjustar(unidadId, { id: actual.id, sobran: medida.sobran }, { senal });
        seguir();
        // Una respuesta sin documento no es un ajuste hecho: se sigue
        // con lo que hay, como con cualquier otro fallo del ajuste.
        if (ajustado?.actual) actual = ajustado.actual;
        velo.poner('ajustar', ajustado?.actual ? 'hecho' : 'saltado');
      } catch (e) {
        if (m.cancelada || e?.codigo === CANCELADO) throw e;
        // Los repasos han cambiado mientras tanto: se vuelve a leer la
        // vivienda, una sola vez.
        if (e?.codigo === 'ha-cambiado' && vuelta === 0) continue;
        // Cualquier otro fallo del ajuste no impide descargar: se
        // sigue con lo que hay.
        velo.poner('ajustar', 'saltado');
      }
    }

    // 7. Sellar: con ESA respuesta se monta el documento definitivo.
    empezarPaso('pdf');
    const sellado = await api.constanciaSellar(unidadId, { id: actual.id }, { senal });
    seguir();
    if (!esObjeto(sellado)) throw new Tropiezo(FRASES.sinRespuesta);
    if (!sellado.actual) throw new Tropiezo(FRASES.generica);
    const doc = montarDoc(m.u, m.promo, sellado.actual, sellado.compradores);

    // 8. El PDF.
    const nombre = pdf.nombreDeConstancia(doc);
    const fichero = new File([pdf.pdfConstancia(doc, { fuente })], nombre, { type: 'application/pdf' });
    velo.poner('pdf', 'hecho');
    return { fichero, nombre, actual: sellado.actual };
  }
}

/** La frase que se enseña cuando un intento tropieza. */
function fraseDe(e) {
  if (e instanceof Tropiezo) return e.message;
  if (e instanceof api.ApiError) {
    if (e.codigo === 'tarda') return FRASES.tarda;
    if (e.status === 0) return FRASES.sinConexion;
    // Un error sin frase (lo corta el hosting antes de que conteste la
    // app: un 502, un 504) llega como «Error 504» a secas. Se dice en
    // llano; muchas veces el servidor acabó igualmente y el reintento
    // se encuentra el trabajo hecho.
    if (!e.message || /^Error \d+$/.test(e.message)) return FRASES.sinFrase.replace('{codigo}', e.status);
    // 403, 409, los de la IA…: la frase la manda el servidor.
    return e.message;
  }
  // Las pegas del propio PDF («Los compradores no caben…») vienen ya
  // escritas para leerlas. Lo demás es un fallo del programa y su
  // mensaje no le dice nada a quien está delante.
  return e?.constructor === Error && e.message ? e.message : FRASES.generica;
}

/** Sin repasos pendientes, o con algo sin subir, no hay nada roto: se
    dice sin pintarlo de fallo. */
const esAviso = (e) => e?.codigo === 'sin-repasos' || e?.codigo === 'sin-subir';

/* ─── Lo que queda a mano después de descargar ────────────────── */
/**
 * Las notas internas del documento: lo que la dirección facultativa y
 * el administrador deberían saber y el papel no dice. Cada repaso
 * lleva a su ficha. Al cerrarla sin ir a ninguno se llama a `alCerrar`.
 */
function hojaNotas(notas, alCerrar) {
  const cerrar = (devolver = true) => {
    velo.remove();
    if (devolver) alCerrar?.();
  };
  const tarjeta = h('div.d-menu-tarjeta.d-notas-internas', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Notas internas' },
    h('div.d-menu-cab', null,
      h('span.d-menu-titulo', null, 'Notas internas'),
      h('button.d-menu-x', { 'aria-label': 'Cerrar', onclick: () => cerrar() }, icon('x')),
    ),
    h('p.d-notas-internas-aviso', null, 'Esto no sale en el PDF.'),
    ...notas.map((n) => h('div.d-nota-interna', null,
      h('p.d-nota-interna-tipo', null, TIPOS_DE_NOTA[n.tipo] || 'Nota'),
      n.texto ? h('p.d-nota-interna-texto', null, n.texto) : null,
      ...(Array.isArray(n.repasos) ? n.repasos : []).map((r) => h('button.d-nota-interna-repaso', {
        onclick: () => { cerrar(false); ir(`#/l/${r.listaId}/t/${r.id}`); },
      },
        h('span.grow', null,
          h('span', null, r.texto || 'Sin descripción'),
          r.estancia ? h('span.d-menu-sub', null, r.estancia) : null),
        chevron(),
      )),
    )),
  );
  const velo = h('div.d-menu-velo', {
    onclick: (e) => { if (e.target === velo) cerrar(); },
  }, tarjeta);
  document.body.append(velo);
}

/**
 * Las filas de más de la hoja del PDF, según quién descarga: las notas
 * internas para la dirección facultativa y el administrador (si las
 * hay) y «Redactar de nuevo» solo para el administrador. Al comercial
 * no le sale ninguna.
 */
function extrasDe(actual, unidadId) {
  const usuario = store.sesion();
  const notas = Array.isArray(actual?.notas) ? actual.notas : [];
  const extras = [];
  if (puedeVerificar(usuario) && notas.length) {
    extras.push({
      icono: 'clipboard',
      rotulo: notas.length === 1 ? 'Ver 1 nota interna' : `Ver ${notas.length} notas internas`,
      accion: (volver) => hojaNotas(notas, volver),
    });
  }
  if (usuario?.rol === 'admin') {
    extras.push({
      icono: 'refresh',
      rotulo: 'Redactar de nuevo',
      // Un toque por error gasta una redacción entera: se pregunta. Si
      // dice que no, vuelve la hoja del PDF como estaba.
      accion: async (volver) => {
        const seguro = await confirmar({
          titulo: '¿Redactar el documento de nuevo?',
          texto: 'Se vuelve a redactar entero con la IA a partir de los repasos de ahora. El anterior queda guardado.',
          ok: 'Sí, redactar de nuevo', icono: 'refresh', conservar: 'No', iconoConservar: 'x',
        });
        if (seguro) descargarReconocimiento({ unidadId, forzar: true });
        else volver?.();
      },
    });
  }
  return extras;
}

/* ─── La descarga ─────────────────────────────────────────────── */
/* La guarda de reentrada: mientras haya una descarga en marcha, una
   segunda pulsación no hace nada. */
let enMarcha = null;

/**
 * Prepara y entrega el reconocimiento de repasos pendientes de una
 * vivienda. `forzar` redacta de nuevo aunque nada haya cambiado (solo
 * el administrador; el servidor lo comprueba).
 *
 * Resuelve a true si el PDF se ha entregado y a false si se canceló,
 * se cerró tras un error o ya había otra descarga en marcha. No lanza.
 */
export async function descargarReconocimiento({ unidadId, forzar = false } = {}) {
  if (enMarcha) return false;
  const u = unidad(unidadId);
  const promo = promocion(String(unidadId).split(':')[0]);
  if (!u || !promo) { toast('Vivienda desconocida', 'err'); return false; }

  const corte = new AbortController();
  const m = {
    unidadId, u, promo, senal: corte.signal,
    forzar: !!forzar, sinFotos: false, cancelada: false, paso: 'leer', velo: null,
  };
  enMarcha = m;
  const soltar = () => { if (enMarcha === m) enMarcha = null; };

  let despierta = () => {};
  try {
    m.velo = montarVelo(u.nombre, () => {
      // Cancelar: se quita el velo ya, se cortan las llamadas en camino
      // y la bandera para lo que venga detrás. La guarda se suelta
      // aquí mismo para poder volver a pulsar sin esperar a nadie.
      m.cancelada = true;
      corte.abort();
      m.velo.quitar();
      soltar();
    });
    despierta = mantenerDespierta();

    let hecho = null;
    while (!hecho) {
      try {
        hecho = await intentar(m);
      } catch (e) {
        if (m.cancelada || e?.codigo === CANCELADO) return false;
        if (!(e instanceof Tropiezo) && !(e instanceof api.ApiError)) {
          console.error('No se pudo preparar el reconocimiento de repasos pendientes:', e);
        }
        // «Seguir sin mirar las fotos» solo se ofrece cuando arregla
        // algo: si lo que falla es la clave o el cupo de la IA, redactar
        // fallaría igual.
        const enFotos = m.paso === 'fotos' && !['clave-mala', 'sin-clave', 'sin-cupo'].includes(e?.codigo);
        const sinSubir = e?.codigo === 'sin-subir';
        const aviso = esAviso(e);
        if (m.velo.estadoDe(m.paso)) {
          m.velo.poner(m.paso, e?.pasoHecho ? 'hecho' : aviso ? 'saltado' : 'fallo');
        }
        const eleccion = await m.velo.preguntar(fraseDe(e), [
          { id: 'otra', rotulo: 'Volver a intentarlo' },
          enFotos ? { id: 'sin-fotos', rotulo: 'Seguir sin mirar las fotos' } : null,
          sinSubir ? { id: 'sin-lo-suyo', rotulo: 'Seguir sin ellos' } : null,
          { id: 'cerrar', rotulo: 'Cerrar' },
        ].filter(Boolean), { aclaracion: enFotos ? FRASES.sinFotos : sinSubir ? FRASES.sinSubirAclaracion : '', aviso });
        if (eleccion === 'cerrar' || m.cancelada) return false;
        if (eleccion === 'sin-fotos') m.sinFotos = true;
        if (eleccion === 'sin-lo-suyo') m.sinLoSuyo = true;
      }
    }
    if (m.cancelada) return false;

    // Hecho: fuera el velo y a entregar. La entrega va ya sin velo, y
    // si fallara cae en el aviso de abajo, no en una pregunta que nadie
    // podría ver.
    m.velo.quitar();
    despierta();
    soltar();
    entregarFichero(hecho.fichero, hecho.nombre, { extras: extrasDe(hecho.actual, unidadId) });
    return true;
  } catch (e) {
    // Aquí no debería llegar nada; si llega, se dice y no se deja el
    // velo puesto.
    console.error('La descarga del reconocimiento se ha roto:', e);
    toast(FRASES.generica, 'err');
    return false;
  } finally {
    m.velo?.quitar();
    despierta();
    soltar();
  }
}
