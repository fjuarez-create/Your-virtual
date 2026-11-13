/* ═══════════════════════════════════════════════════════════════
   constancia.js — la descarga del «Reconocimiento de repasos
   pendientes» de una vivienda: el papel que se firma en la notaría.

   Se pulsa la tarjeta negra del menú «···» de la villa y se descarga.
   No hay pantalla de revisión ni de edición: mientras el servidor lee
   los repasos, mira las fotos y redacta, un velo a pantalla completa
   cuenta por qué paso va. Al acabar se quita solo y entrega el PDF.

   Cuatro reglas que este fichero no se salta:

   · El velo NUNCA se queda colgado. Cualquier tropiezo acaba en una
     frase, «Volver a intentarlo» y «Cerrar».
   · «Cancelar» vale en cualquier paso. Lo que el servidor ya tenga
     guardado —fotos miradas, el documento redactado— se aprovecha la
     próxima vez, así que cancelar no tira el dinero.
   · La IA se gasta lo justo: si el documento de la vivienda está al
     día, se descarga sin volver a llamarla. Y si la redacción se corta
     por el camino (se apaga la pantalla, un bache de cobertura), se
     espera a la que el servidor ya tiene en marcha en vez de pedir otra.
   · El papel no sale viejo. Si alguien toca un repaso de la vivienda
     mientras se prepara, el servidor lo dice (`alDia: false`) y el
     documento se rehace con lo de ahora, una vez; si siguen cambiando,
     se dice y no se entrega.

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
  // La redacción es una llamada larga y el teléfono la corta si la
  // pantalla se apaga o la app pasa a segundo plano: por eso se pide.
  espera: 'La primera vez puede tardar uno o dos minutos. No cierres la app ni dejes que se apague la pantalla.',
  sinConexion: 'Hace falta conexión para preparar el documento.',
  sinClaveAdmin: 'Falta la clave de la IA. Se pone en Ajustes.',
  sinClave: 'Falta la clave de la IA. Avisa al administrador.',
  // Los fallos de la IA, dichos para quien los lee aquí. El servidor los
  // escribió para el administrador («La clave de Anthropic… Vuelve a
  // ponerla en Ajustes»); el comercial no tiene Ajustes ni sabe quién
  // es Anthropic (ver fraseDeLaIA).
  claveMalaAdmin: 'La clave de la IA no es válida. Vuelve a ponerla en Ajustes.',
  claveMala: 'La clave de la IA no es válida. Avisa al administrador.',
  sinCupo: 'La IA ha llegado a su límite por ahora. Prueba dentro de un rato; si sigue igual, avisa al administrador.',
  iaNoContesta: 'La IA no ha contestado bien{codigo}. Vuelve a intentarlo dentro de un momento.',
  sinSalida: 'No se ha podido hablar con la IA. Vuelve a intentarlo dentro de un momento; si sigue igual, avisa al administrador.',
  // La sesión caducada no se arregla reintentando: hay que volver a entrar.
  sinSesion: 'La sesión ha caducado. Cierra y vuelve a entrar: después se descarga el documento.',
  sinRepasos: 'Esta vivienda no tiene repasos pendientes ahora mismo: no hay documento que generar.',
  // La redacción se cortó por el camino y el documento no ha aparecido
  // en el servidor (ver recogerRedaccion).
  seApago: 'La pantalla se apagó o la app pasó a segundo plano mientras se redactaba el documento. Vuelve a intentarlo: lo que el servidor ya tenga hecho se aprovecha.',
  seCorto: 'Se ha cortado la conexión mientras se redactaba el documento. Vuelve a intentarlo: lo que el servidor ya tenga hecho se aprovecha.',
  // Alguien ha tocado los repasos de la vivienda mientras se preparaba el
  // papel, dos veces seguidas: no se entrega un documento que ya nace
  // viejo; se dice y se espera.
  haCambiado: 'Alguien está apuntando o cambiando repasos de esta vivienda ahora mismo, y el documento saldría sin lo último. Espera a que termine y vuelve a intentarlo.',
  tarda: 'El servidor está tardando demasiado en contestar. Vuelve a intentarlo dentro de un momento.',
  sinFrase: 'El servidor no ha contestado bien (error {codigo}). Vuelve a intentarlo dentro de un momento.',
  // Contesta, pero no es la app quien contesta: la página de entrada
  // de un wifi con portal, un hosting a medio publicar.
  sinRespuesta: 'El servidor no ha contestado bien. Comprueba la conexión y vuelve a intentarlo dentro de un momento.',
  // Un módulo que no llegó a bajar, hay navegadores que no lo vuelven a
  // pedir hasta que la app se abre de nuevo: por eso la segunda mitad
  // (y por eso se pide por otra dirección: ver pedirModuloPdf).
  sinImprenta: 'No se ha podido cargar lo necesario para montar el PDF. Comprueba la conexión y vuelve a intentarlo; si sigue igual, cierra la app y ábrela de nuevo.',
  // Lo que significa «Seguir sin mirar las fotos», debajo del fallo.
  sinFotos: 'Sin las fotos, el documento se redacta solo con lo anotado en cada repaso.',
  // Lo apuntado en este aparato que no ha conseguido subir: el papel
  // saldría sin ello. Se dice y se pregunta; no se sigue callado. Sin
  // nombrar el aparato: el documento se saca también desde el ordenador.
  sinSubir: (n) => (n === 1
    ? 'Hay 1 cambio de esta vivienda sin subir. El documento saldría sin él.'
    : `Hay ${n} cambios de esta vivienda sin subir. El documento saldría sin ellos.`),
  sinSubirAclaracion: 'Comprueba la conexión y vuelve a intentarlo para que suban antes de redactar.',
  // Lo que se le dice a quien descarga cuando algún repaso ha acabado
  // solo en la fórmula general («Repasos de terminación y acabado de los
  // puntos anotados…»). El papel sale igual; lo que cambia es que
  // alguien que lo entienda lo lea antes de llevarlo a firmar. A quien
  // ve las notas internas se le manda a ellas; al comercial, que no las
  // ve, a quien sí.
  general: (n, veNotas) => (n === 1
    ? '1 repaso va citado solo de forma general, sin redacción propia.'
    : `${n} repasos van citados solo de forma general, sin redacción propia.`)
    + (veNotas
      ? ' Míralo en las notas internas antes de la firma.'
      : ' Conviene que la dirección facultativa o el administrador lean el documento antes de la firma.'),
  generica: 'No se ha podido preparar el documento.',
};

/** El tipo de cada nota interna, en palabras llanas. OJO con dos
    palabras del servidor que se parecen y no son lo mismo: una nota
    `sensible` (fisuras, humedades, un interrogante) es lo que aquí se
    rotula «Punto delicado»; los párrafos «delicados» de constancia.php
    (`CONSTANCIA_DELICADO`) son otra cosa: los que no pueden ir al papel
    y se retiran al sellar. */
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
/* Un error sin frase: lo corta el hosting antes de que conteste la app
   (un 502, un 504) y llega como «Error 504» a secas. */
const sinFrase = (e) => e instanceof api.ApiError && (!e.message || /^Error \d+$/.test(e.message));
const sinSesion = (e) => e instanceof api.ApiError && e.status === 401 && e.codigo === 'sin-sesion';

/* Las esperas con tope. Ninguna deja el flujo parado para siempre:
   · TOPE_SUBIDA: lo que se espera a la sincronización del primer paso.
     Sube TODA la cola del aparato —también fotos y vídeos de otras
     viviendas— y con mala cobertura puede tardar lo que quiera. Pasado
     el tope se mira solo lo de ESTA vivienda (sinSubirDeUnidad).
   · TOPE_LETRA: lo que se espera a la letra del PDF, contado desde que
     se pide (nada más pulsar). Si no ha llegado, el papel sale con la
     de reserva, igual que cuando la descarga falla.
   · La recogida de una redacción cortada: una lectura al momento y
     después una cada CADA_RECOGIDA, hasta VECES_RECOGIDA (dos minutos). */
const TOPE_SUBIDA = 30000;
const TOPE_LETRA = 10000;
const CADA_RECOGIDA = 5000;
const VECES_RECOGIDA = 25;

/** Una espera que «Cancelar» corta: con la señal cortada, acaba ya. */
const pausa = (ms, senal) => new Promise((listo) => {
  if (senal?.aborted) { listo(); return; }
  const fin = () => {
    clearTimeout(reloj);
    senal?.removeEventListener('abort', fin);
    listo();
  };
  const reloj = setTimeout(fin, ms);
  senal?.addEventListener('abort', fin);
});

/** Espera a que algo acabe —bien o mal—, pero solo hasta el tope o hasta
    que se cancele. No lanza: lo que venga detrás dirá si hacía falta. */
const hastaElTope = (promesa, ms, senal) => {
  // El corte propio sirve para dos cosas: llevarle «Cancelar» a la
  // pausa y pararle el reloj cuando lo esperado acaba antes.
  const corte = new AbortController();
  const cancelar = () => corte.abort();
  if (senal?.aborted) corte.abort();
  else senal?.addEventListener('abort', cancelar);
  return Promise.race([Promise.resolve(promesa).catch(() => {}), pausa(ms, corte.signal)])
    .finally(() => { senal?.removeEventListener('abort', cancelar); corte.abort(); });
};

/** ¿Ha dejado de verse la app mientras duraba algo? Devuelve la función
    que deja de mirar y lo contesta. */
function vigilarSiSeOculta() {
  let oculta = document.visibilityState === 'hidden';
  const mirar = () => { if (document.visibilityState === 'hidden') oculta = true; };
  document.addEventListener('visibilitychange', mirar);
  return () => {
    document.removeEventListener('visibilitychange', mirar);
    return oculta;
  };
}

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
/* El módulo del PDF, una sola copia para toda la sesión. Un módulo que
   no llegó a bajar (sin cobertura y sin caché), hay navegadores que lo
   recuerdan como fallido y no lo vuelven a pedir hasta que la app se
   abre de nuevo: «Volver a intentarlo» no arreglaba nada. Si la
   dirección de siempre falla, se pide por otra —la misma con una
   coletilla—, que el navegador no tiene apuntada. Y lo que baje se
   guarda aquí para no pedirlo dos veces: dos copias del módulo serían
   dos memorias de la letra. */
let moduloPdf = null;
function pedirModuloPdf() {
  if (!moduloPdf) {
    moduloPdf = import('./pdfConstancia.js')
      .catch(() => import(`./pdfConstancia.js?otra=${Date.now()}`))
      .catch((e) => { moduloPdf = null; throw e; });
  }
  return moduloPdf;
}

/**
 * La imprenta: el módulo del PDF y su letra, pedidos nada más empezar
 * para que bajen mientras el servidor trabaja. La letra puede faltar
 * —si falla o tarda más de TOPE_LETRA, el PDF sale con la de reserva—;
 * el módulo, no.
 *
 * (Se llama «imprenta» y no «taller»: en esta casa el taller es la app
 * de pruebas, la que vive en /taller.)
 */
function cargarImprenta() {
  const imprenta = pedirModuloPdf().then(async (pdf) => ({
    pdf,
    fuente: await Promise.race([
      pdf.cargarTipografia().catch(() => null),
      pausa(TOPE_LETRA).then(() => null),
    ]),
  }), () => { throw new Tropiezo(FRASES.sinImprenta); });
  // Si se cancela antes de usarla, que no quede un rechazo sin recoger.
  imprenta.catch(() => {});
  return imprenta;
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

/* ─── La redacción que se corta por el camino ─────────────────── */
/**
 * Redactar es la llamada larga —un minuto o dos— y en un teléfono se
 * corta con facilidad: se apaga la pantalla, entra una llamada, se
 * cambia de app, un bache de cobertura, o el hosting suelta la conexión
 * antes de tiempo. El servidor no se entera y sigue redactando. Si
 * entonces se pregunta, «Volver a intentarlo» lanza una SEGUNDA
 * redacción entera encima de la primera (otro minuto y otra factura).
 *
 * Así que no se pregunta todavía: se espera a la que ya está en marcha.
 * Se relee la vivienda —una vez al momento y después cada pocos
 * segundos— hasta que aparece un documento que antes no estaba, y con
 * él se sigue como si nada. `anterior` es el id del que había antes de
 * pedir la redacción ('' si no había).
 *
 * Si no aparece en dos minutos, o no hay conexión ni para leer, lanza
 * el tropiezo con la frase de lo que ha pasado.
 */
async function recogerRedaccion(m, anterior, seOculto) {
  const { unidadId, senal } = m;
  let sinRed = 0;
  for (let vez = 0; vez < VECES_RECOGIDA && sinRed < 3; vez++) {
    if (vez) await pausa(CADA_RECOGIDA, senal);
    if (m.cancelada) throw new Tropiezo('Descarga cancelada', CANCELADO);
    try {
      const estado = await api.constanciaVer(unidadId, { senal });
      sinRed = 0;
      if (esEstado(estado) && estado.actual && estado.actual.id !== anterior) return estado;
    } catch (e) {
      // Sin conexión se insiste un poco (tres lecturas seguidas); lo
      // demás —la sesión, un error con su frase— se enseña tal cual.
      if (m.cancelada || !esRed(e)) throw e;
      sinRed++;
    }
  }
  throw new Tropiezo(sinRed ? FRASES.sinConexion : seOculto ? FRASES.seApago : FRASES.seCorto);
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

  const imprenta = cargarImprenta();

  for (let vuelta = 0; ; vuelta++) {
    /* ¿Sigue valiendo lo que acaba de contestar el servidor? Redactar,
       ajustar y sellar releen la vivienda al acabar y dicen
       `alDia: false` si alguien ha tocado un repaso mientras tanto (la
       dirección facultativa apuntando en esa misma vivienda, por
       ejemplo). Ese documento ya nace viejo: no se entrega. La primera
       vez se da una vuelta más —se relee y se redacta con lo de ahora—;
       si a la segunda sigue cambiando, se dice y se espera. */
    const alDia = (respuesta, pasoHecho) => {
      if (respuesta?.alDia !== false) return true;
      if (vuelta === 0) return false;
      throw new Tropiezo(FRASES.haCambiado, 'ha-cambiado', { pasoHecho });
    };

    velo.empezar();
    m.paso = 'leer';

    // 1. Lo último apuntado en este aparato tiene que estar en el
    //    servidor antes de redactar. Si la sincronización falla, se
    //    sigue: el paso siguiente dirá si hay conexión o no. Y si tarda
    //    (ver TOPE_SUBIDA), tampoco se la espera para siempre.
    if (vuelta === 0) {
      await hastaElTope((async () => {
        await store.sincronizar({ forzar: true });
        // Si ya había una sincronización en marcha, la llamada de arriba
        // se sube a esa, que pudo empezar antes del último apunte. Si
        // acabó bien y aún queda algo en la cola, una vuelta más.
        if (store.estadoSync.pendientes > 0 && !store.estadoSync.error) {
          await store.sincronizar({ forzar: true });
        }
      })(), TOPE_SUBIDA, senal);
      seguir();
      // Que la sincronización falle o no acabe no corta, pero tampoco
      // se calla: si algo de ESTA vivienda sigue sin subir, el servidor
      // no lo conoce y el documento saldría sin ello. Se pregunta, y la
      // respuesta («Seguir sin ellos») sobrevive al reintento.
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
    // Primero, si hay algo que redactar: sin repasos pendientes no hace
    // falta la clave para nada, y no se manda a nadie a por ella.
    if (!((estado.cuenta?.pendientes || 0) + (estado.cuenta?.rechazados || 0))) {
      throw new Tropiezo(FRASES.sinRepasos, 'sin-repasos', { pasoHecho: true });
    }
    // Sin clave solo se corta si de verdad hay que redactar: un
    // documento ya redactado y al día se vuelve a bajar sin la IA.
    if (!estado.hayClave && (m.forzar || !(estado.actual && estado.alDia))) {
      throw new Tropiezo(store.esAdmin() ? FRASES.sinClaveAdmin : FRASES.sinClave, 'sin-clave', { pasoHecho: true });
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

      // 5. Redactar. Si la llamada se corta por el camino, no se
      //    pregunta: se espera a la redacción que ya está en marcha.
      empezarPaso('redactar');
      const anterior = estado.actual?.id || '';
      const seOculto = vigilarSiSeOculta();
      try {
        estado = await api.constanciaRedactar(unidadId, { sinFotos: m.sinFotos, forzar: m.forzar }, { senal });
      } catch (e) {
        if (m.cancelada || !(esRed(e) || (sinFrase(e) && [502, 504].includes(e.status)))) throw e;
        estado = await recogerRedaccion(m, anterior, seOculto());
      } finally {
        seOculto();
      }
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
      // Han tocado un repaso mientras se redactaba: ni se ajusta ni se
      // sella un documento que ya nace viejo.
      if (!alDia(estado, true)) continue;
    }

    // 6. Medir con el mismo motor que pinta el PDF y, si hace falta,
    //    UNA segunda pasada.
    m.paso = 'pdf';
    const { pdf, fuente } = await imprenta;
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
        // sigue con lo que hay (y si lo que hay se ha quedado viejo, lo
        // dirá el sellado).
        velo.poner('ajustar', 'saltado');
      }
    }

    // 7. Sellar: con ESA respuesta se monta el documento definitivo.
    empezarPaso('pdf');
    const sellado = await api.constanciaSellar(unidadId, { id: actual.id }, { senal });
    seguir();
    if (!esObjeto(sellado)) throw new Tropiezo(FRASES.sinRespuesta);
    if (!sellado.actual) throw new Tropiezo(FRASES.generica);
    // La última guarda: lo sellado tiene que ser lo de ahora. Un repaso
    // apuntado mientras se ajustaba o se sellaba no puede faltar en el
    // papel sin que nadie se entere.
    if (!alDia(sellado, false)) continue;
    const doc = montarDoc(m.u, m.promo, sellado.actual, sellado.compradores);

    // 8. El PDF.
    const nombre = pdf.nombreDeConstancia(doc);
    const fichero = new File([pdf.pdfConstancia(doc, { fuente })], nombre, { type: 'application/pdf' });
    velo.poner('pdf', 'hecho');
    return { fichero, nombre, actual: sellado.actual };
  }
}

/**
 * Los fallos de la IA, dichos para quien los lee en el velo. El servidor
 * los manda con la frase que escribió para quien administra la clave
 * («La clave de Anthropic no es válida. Vuelve a ponerla en Ajustes.»),
 * que es la que ven el dictado y las actas de reunión. Aquí la lee
 * también el comercial, que no tiene Ajustes ni sabe quién es Anthropic.
 * Devuelve '' si ese fallo no tiene frase propia (y vale la del servidor).
 */
function fraseDeLaIA(e) {
  const admin = store.esAdmin();
  switch (e.codigo) {
    case 'sin-clave': return admin ? FRASES.sinClaveAdmin : FRASES.sinClave;
    case 'clave-mala': return admin ? FRASES.claveMalaAdmin : FRASES.claveMala;
    // Al administrador, la del servidor: la cuenta es cosa suya.
    case 'sin-cupo': return admin ? '' : FRASES.sinCupo;
    // «La API ha contestado con un error (529).»: se dice en llano y se
    // conserva el número, que es lo único que sirve para preguntar.
    case 'api-error': {
      const numero = /\((\d{3})\)/.exec(e.message || '')?.[1];
      return FRASES.iaNoContesta.replace('{codigo}', numero ? ` (error ${numero})` : '');
    }
    // El servidor no consigue salir a internet: al administrador, el
    // motivo que dé el servidor; a los demás no les dice nada.
    case 'sin-salida':
    case 'php-curl': return admin ? '' : FRASES.sinSalida;
    default: return '';
  }
}

/** La frase que se enseña cuando un intento tropieza. */
function fraseDe(e) {
  if (e instanceof Tropiezo) return e.message;
  if (e instanceof api.ApiError) {
    if (e.codigo === 'tarda') return FRASES.tarda;
    if (e.status === 0) return FRASES.sinConexion;
    if (sinSesion(e)) return FRASES.sinSesion;
    // Un error sin frase (lo corta el hosting antes de que conteste la
    // app: un 502, un 504) llega como «Error 504» a secas. Se dice en
    // llano; muchas veces el servidor acabó igualmente y el reintento
    // se encuentra el trabajo hecho.
    if (sinFrase(e)) return FRASES.sinFrase.replace('{codigo}', e.status);
    // 403, 409, «declinado»…: la frase la manda el servidor. Los fallos
    // de la clave, del cupo y de la salida a la IA, la de la casa.
    return fraseDeLaIA(e) || e.message;
  }
  // Las pegas del propio PDF («Los nombres de los compradores son
  // demasiado largos…») vienen ya escritas para leerlas. Lo demás es un
  // fallo del programa y su mensaje no le dice nada a quien está delante.
  return e?.constructor === Error && e.message ? e.message : FRASES.generica;
}

/** Sin repasos pendientes, con algo sin subir o con alguien apuntando
    en la vivienda, no hay nada roto: se dice sin pintarlo de fallo. */
const esAviso = (e) => ['sin-repasos', 'sin-subir', 'ha-cambiado'].includes(e?.codigo);

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
 * no le sale ninguna (lo único que puede leer de más es la nota de la
 * fórmula general: ver FRASES.general).
 */
function extrasDe(actual, unidadId) {
  const usuario = store.sesion();
  const notas = Array.isArray(actual?.notas) ? actual.notas : [];
  const extras = [];
  if (puedeVerificar(usuario) && notas.length) {
    extras.push({
      notas: true,
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
      // Y la pantalla deja de mantenerse despierta ya, sin esperar a
      // que acabe lo que estuviera en camino.
      despierta();
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
        // La sesión caducada no se arregla reintentando: solo «Cerrar».
        const caducada = sinSesion(e);
        // «Seguir sin mirar las fotos» solo se ofrece cuando arregla
        // algo: si lo que falla es la clave de la IA (o la sesión),
        // redactar fallaría igual. Con el cupo sí se ofrece: el límite
        // que salta mirando fotos es el de peticiones por minuto —salen
        // de dieciocho en dieciocho—, y redactar es una sola llamada.
        const enFotos = m.paso === 'fotos' && !caducada && !['clave-mala', 'sin-clave'].includes(e?.codigo);
        const sinSubir = e?.codigo === 'sin-subir';
        const aviso = esAviso(e);
        if (m.velo.estadoDe(m.paso)) {
          m.velo.poner(m.paso, e?.pasoHecho ? 'hecho' : aviso ? 'saltado' : 'fallo');
        }
        const eleccion = await m.velo.preguntar(fraseDe(e), [
          caducada ? null : { id: 'otra', rotulo: 'Volver a intentarlo' },
          enFotos ? { id: 'sin-fotos', rotulo: 'Seguir sin mirar las fotos' } : null,
          sinSubir ? { id: 'sin-lo-suyo', rotulo: 'Seguir sin ellos' } : null,
          { id: 'cerrar', rotulo: 'Cerrar' },
        ].filter(Boolean), { aclaracion: enFotos ? FRASES.sinFotos : sinSubir ? FRASES.sinSubirAclaracion : '', aviso });
        if (eleccion === 'cerrar' || m.cancelada) {
          // Con la sesión caducada, al cerrar se va a la pantalla de
          // entrar por el camino de siempre: la sincronización, que es
          // quien sabe quitar la sesión de este aparato.
          if (caducada) Promise.resolve(store.sincronizar({ forzar: true })).catch(() => {});
          return false;
        }
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
    const extras = extrasDe(hecho.actual, unidadId);
    // Si algún repaso ha acabado solo en la fórmula general, se le dice
    // a quien descarga, sea quien sea: es quien lleva el papel a firmar.
    const general = Number(hecho.actual?.genericos) || 0;
    const veNotas = extras.some((x) => x.notas);
    entregarFichero(hecho.fichero, hecho.nombre, {
      extras,
      nota: general > 0 ? FRASES.general(general, veNotas) : '',
    });
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
