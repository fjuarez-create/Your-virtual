/* ═══════════════════════════════════════════════════════════════
   Recorrido de una vivienda.

   Tres momentos en una sola pantalla:

     preparado   se explica en dos líneas y hay un botón de empezar
     grabando    la cámara a pantalla completa; se toca para marcar
     repasando   lo capturado, para convertirlo en tareas

   El repaso es lo importante y por eso ocupa la mitad del fichero:
   grabar es fácil, lo difícil es que veinte fotos sueltas acaben
   siendo veinte tareas bien escritas sin que dé pereza. De momento el
   texto lo pone la persona; cuando la transcripción esté enchufada,
   estos mismos campos llegarán rellenos y el trabajo será repasar en
   vez de escribir.
   ═══════════════════════════════════════════════════════════════ */
import {
  h, icon, toast, openViewer, sheet, fechaCorta, confirmar, pantallaTrabajando,
} from '../ui.js';
import {
  promocion, unidad, FASE_UNICA, OFICIO_POR_DEFECTO, OFICIOS, ZONAS, oficio, puedeCrearLista,
} from '../catalog.js';
import * as store from '../store.js';
import * as api from '../api.js';
import * as grabadora from '../recorrido.js';
import {
  cabecera, hojaOficios, hojaZonas, hojaBienHecho, ctaAccion, ctaCancelar,
  menuFlotante, filaMenu, filaMenuFichero,
} from '../piezas.js';
import { alCerrarRecorrido, nombreCorto } from '../frases.js';
import { juntaFotos } from '../ajustesLocales.js';
import { paraMirar, prepararImagen } from '../media.js';
import { ir } from '../app.js';

/**
 * Cuántas fotos como mucho viajan a que las miren en un recorrido.
 *
 * No es un capricho: cada foto se paga, y un recorrido de sesenta
 * subiría varios megas por la línea de una obra además de costar lo que
 * cuesta. Con treinta se cubre el repaso de una villa de sobra.
 */
const TOPE_FOTOS = 30;

/**
 * Lo que se le dice a quien acaba de darle a redactar.
 *
 * Importa distinguir de dónde sale cada tarea: las que vienen de lo que
 * dijo son suyas y solo hay que leerlas por encima, y las que vienen de
 * mirar la foto son una lectura ajena que conviene repasar antes de
 * mandarle a nadie a picar una pared.
 */
function resumen(dichas, vistas, total, sinMirar) {
  const escritas = dichas + vistas;
  const cuelgan = total - escritas - sinMirar;
  const cola = cuelgan
    ? ` ${cuelgan === 1 ? 'En otra no se distingue nada: escríbela' : `En otras ${cuelgan} no se distingue nada: escríbelas`} mirando la foto.`
    : '';
  const largo = sinMirar
    ? ` El recorrido es largo y solo se miran las primeras ${TOPE_FOTOS} fotos: las ${sinMirar} últimas van a mano.`
    : '';

  if (!escritas) {
    return `No ha salido ninguna tarea: no había nada dicho y en las fotos no se distingue el defecto. Escríbelas mirándolas.${largo}`;
  }
  if (!vistas) {
    return `${escritas} ${escritas === 1 ? 'tarea' : 'tareas'} de lo que dijiste. Repásalas antes de crearlas.${cola}${largo}`;
  }
  if (!dichas) {
    return `${escritas} ${escritas === 1 ? 'tarea leída' : 'tareas leídas'} de las fotos. Repásalas con calma: salen de lo que se ve, no de lo que dijiste.${cola}${largo}`;
  }
  return `${escritas} redactadas: ${dichas} de lo que dijiste y ${vistas} ${vistas === 1 ? 'leída' : 'leídas'} de la foto. Repasa sobre todo ${vistas === 1 ? 'esa' : 'esas'}.${cola}${largo}`;
}

export async function render({ promoId, unidadId, seguir = false }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/viviendas', { reemplazar: true }); return { contenido: [] }; }
  const volver = `#/p/${promoId}/v/${String(unidadId).split(':')[1]}`;
  if (!puedeCrearLista(store.sesion())) { ir(volver, { reemplazar: true }); return { contenido: [] }; }

  const lienzo = h('div.recorrido');
  let mando = null;
  // El visor vive colgado del body: dentro del lienzo, el «fixed» se
  // queda atrapado por los ancestros y sale con alto cero.
  let visorActual = null;

  /* Las direcciones temporales que se crean para poder oír la grabación.
     Se sueltan al salir de la pantalla: cada una retiene el audio entero
     en memoria mientras viva, y en un móvil de obra eso se nota. */
  const urlsSueltas = [];

  /* El reproductor del paseo. Ya no se ve en ninguna pantalla —lo que se
     usa es el chip «▷ 0:03» de cada foto, que salta a su momento—, pero
     tiene que estar colgado del documento: en iOS, un <audio> que no
     está en la página no suena aunque le llames a play(). */
  let audioSuelto = null;

  /* Lo que el repaso deja aquí para que se ejecute antes de salir de la
     pantalla. Sin esto, lo tecleado en el último segundo se quedaba en
     el aire: el apunte va con un respiro de un segundo entre tecla y
     tecla, y salir corriendo lo pillaba a medias. */
  let guardarAlSalir = null;

  /* El menú de los tres puntos cambia según dónde estés: grabando no
     hay tareas que borrar, y repasando sí. Lo rellena el repaso cuando
     se monta. */
  let menuDelRepaso = null;

  /* Salirse mientras se graba tira el paseo: la grabación todavía no
     está guardada en ningún sitio. Antes se iba sin decir nada, que es
     justo lo que se llevó por delante un recorrido entero. Ahora
     pregunta —y solo pregunta cuando hay algo que perder, porque en la
     pantalla de antes de empezar no hay grabación ninguna—. */
  const salirDeLaGrabacion = async () => {
    const seg = mando?.segundos || 0;
    const fotos = mando?.marcas?.length || 0;
    if (!seg && !fotos) return true;
    return confirmar({
      titulo: '¿Descartar el recorrido?',
      texto: `Se pierde lo grabado hasta ahora: ${grabadora.reloj(seg)}`
        + `${fotos ? ` y ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}` : ''}. `
        + 'No se puede recuperar.',
      ok: 'Descartar el recorrido',
      rojo: true,
      conservar: 'Seguir grabando',
      iconoConservar: 'play',
    });
  };

  // La cabecera se guarda para poder tocarla desde el repaso: allí la
  // flecha de volver deja de navegar (irse dejaría el recorrido a
  // medias sin decirlo) y el título pasa a «Nueva lista - Villa N».
  // Para eso están ponerTitulo() y ponerVuelta(), que la cabecera trae
  // puestos encima.
  const cab = cabecera({
    volver,
    titulo: u.nombre,
    menu: () => (menuDelRepaso ? menuDelRepaso() : menuFlotante((cerrar) => [
      filaMenu('trash', 'Descartar el recorrido', async () => {
        cerrar();
        if (!await salirDeLaGrabacion()) return;
        await guardarAlSalir?.();
        ir(volver);
      }, { rojo: true }),
    ])),
  });

  // Los gremios que más salen aquí, para tenerlos a un toque al repasar.
  const sugeridos = await store.oficiosMasUsados(unidadId, 4);

  // Un recorrido grabado y no repasado todavía. Pasa cuando se sale de
  // la pantalla a media faena —una llamada, un resbalón hacia atrás— y
  // es justo el trabajo que más duele perder: el paseo ya está dado.
  let pendiente = await store.recorridoPendiente(unidadId);

  /** El recorrido tal y como se guarda: el audio entero y las marcas.
      El id es UNO por paseo y fijo desde antes de grabar: los guardados
      parciales de mitad de camino y el definitivo de al parar escriben
      sobre el mismo registro, en vez de sembrar copias. */
  const idPaseo = store.nuevoId();
  const paquete = (capturado) => ({
    id: idPaseo,
    unidadId, promoId,
    creado: new Date().toISOString(),
    duracion: capturado.duracion,
    audio: capturado.audio,
    mime: capturado.mime,
    marcas: capturado.marcas.map((m) => ({ id: m.id, ms: m.ms, blob: m.blob, ancho: m.ancho, alto: m.alto })),
    usado: false,
  });

  /* ─── Abrir el acta sin grabar nada ─── */
  const actaSuelta = async () => {
    const l = await store.crearLista({ unidadId, promoId, fase: FASE_UNICA });
    toast('Acta abierta · se firma con tu nombre y la fecha de hoy');
    ir('#/l/' + l.id);
  };

  /* ─── 1. Nada más entrar se abre el visor, con el pop up del
     diseño encima: comenzar o cancelar, con la cámara ya viva. ─── */
  const pintarPreparado = () => {
    if (!grabadora.sePuede()) {
      lienzo.replaceChildren(
        h('div.rec-intro', null,
          h('div.rec-ico', null, icon('camera', 30)),
          h('h2.title', null, 'Este navegador no puede grabar'),
          h('p.sub', null, 'Abre el acta y añade las tareas a mano.'),
        ),
        h('button.d-boton-negro', { style: { marginTop: '14px' }, onclick: actaSuelta }, 'Abrir el acta sin recorrido'),
      );
      return;
    }
    arrancar();
  };

  /** Soltar cámara y micrófono sin guardar nada, y recoger el visor. */
  const soltarCamara = async () => {
    document.removeEventListener('visibilitychange', alTapar);
    visorActual?.remove();
    visorActual = null;
    const m = mando;
    mando = null;
    if (m) await m.parar();
  };

  /* ─── 2. El visor del diseño: la cámara a pantalla completa, la
     tira de fotogramas arriba y el botón del cerebro abajo. Toda la
     imagen es el botón de marcar: en obra, con guantes, no se acierta
     a un botón pequeño mientras andas. ─── */
  const arrancar = async () => {
    // Nunca dos visores: si un repintado a destiempo vuelve a entrar
    // aquí con la cámara ya abierta, no se abre otra.
    if (document.querySelector('.d-visor')) return;
    const crono = h('span.mono-num', null, '0:00');
    const pildora = h('div.d-visor-crono', null, h('span.punto'), crono);
    const tira = h('div.d-visor-tira');
    const destello = h('div.d-visor-destello');
    const pista = h('p.d-visor-pista', null, 'Toca la pantalla cuando veas algo');
    const visor = h('div.d-visor');

    try {
      mando = await grabadora.empezar({
        // El seguro contra muertes a media grabación: cada pocos
        // segundos —y en cada marca— lo andado se escribe en el
        // almacén. Si la app muere, al volver está el aviso de
        // «recorrido a medias» con todo lo marcado hasta entonces.
        alParcial: (parcial) => { store.guardarRecorrido(paquete(parcial)).catch(() => {}); },
        alAvisar: ({ segundos, pausado }) => {
          crono.textContent = grabadora.reloj(segundos);
          visor.classList.toggle('pausado', !!pausado);
          pista.textContent = pausado
            ? 'En pausa. Toca la pantalla para seguir'
            : 'Toca la pantalla cuando veas algo';
        },
        alTope: () => toast('Diez minutos: se corta aquí'),
      });
    } catch (e) {
      toast(e?.name === 'NotAllowedError'
        ? 'Hay que dar permiso de cámara y micrófono'
        : 'No se ha podido abrir la cámara', 'err');
      ir(volver);
      return;
    }

    mando.video.className = 'd-visor-video';
    const cerebro = h('button.d-visor-cerebro', {
      'aria-label': 'Finalizar o pausar el recorrido',
      onclick: (ev) => { ev.stopPropagation(); menuGrabando(); },
    }, icon('cerebro'));
    visor.append(mando.video, destello, tira, pista, pildora, cerebro);

    visor.addEventListener('click', async () => {
      if (mando?.pausado) { reanudar(); return; }
      const marca = await mando.marcar();
      if (!marca) return;
      destello.classList.remove('on');
      void destello.offsetWidth;
      destello.classList.add('on');
      if (navigator.vibrate) navigator.vibrate(18);
      // La más nueva entra por la derecha y queda siempre a la vista.
      tira.append(h('div.d-mini', {
        style: { backgroundImage: `url("${URL.createObjectURL(marca.blob)}")` },
      }));
      tira.scrollLeft = tira.scrollWidth;
    });

    lienzo.classList.remove('ficha');
    lienzo.replaceChildren();
    document.body.append(visor);
    visorActual = visor;
    document.addEventListener('visibilitychange', alTapar);

    // El pop up inicial, con la grabación en pausa hasta que se decida:
    // el rato del menú ni cuenta ni se graba.
    mando.pausar();
    menuFlotante((cerrar) => [
      filaMenu('zapatilla', 'Comenzar recorrido', () => { cerrar(); reanudar(); }),
      pendiente ? filaMenu('listaChecks', 'Repasar el recorrido a medias', async () => {
        cerrar();
        await soltarCamara();
        lienzo.classList.remove('grabando');
        lienzo.closest('.screen')?.classList.remove('grabando');
        pintarRepaso(pendiente);
      }) : null,
      // Aspa y no el cuadrado de «parar»: aquí todavía no se ha grabado
      // nada —el pop up sale con la grabación en pausa—, así que esto no
      // detiene un recorrido, se va sin empezarlo. El cuadrado salía en
      // pantalla como una casilla vacía y no se entendía qué era.
      filaMenu('x', 'Cancelar', () => { cerrar(); ir(volver); }),
    ].filter(Boolean), { conX: false });
  };

  /**
   * El menú del botón de parar: las tres salidas del diseño.
   *
   * Se graba mientras el menú está abierto, y por eso la «X» dice
   * «Seguir grabando» en vez de solo cerrar: el recorrido no se ha
   * interrumpido, así que decirlo evita el susto de creer que sí.
   */
  /**
   * El menú del cerebro: finalizar o pausar, con el aspa para seguir
   * grabando. Se graba mientras el menú está abierto (salvo en pausa).
   */
  const menuGrabando = () => {
    if (!mando) return;
    const enPausa = mando.pausado;
    menuFlotante((cerrar) => [
      filaMenu('zapatilla', 'Finalizar recorrido', () => { cerrar(); terminar(); }),
      filaMenu(enPausa ? 'play' : 'pausa', enPausa ? 'Reanudar' : 'Pausar',
        () => { cerrar(); (enPausa ? reanudar : pausar)(); }),
    ]);
  };

  const pausar = () => {
    if (!mando?.pausar()) return;
    toast('En pausa. Toca la imagen para seguir');
  };

  /**
   * Reanudar puede fallar, y ahí es donde importa. Safari corta el
   * micrófono al irse la app a segundo plano y no avisa: el grabador se
   * queda muerto por su cuenta. Si no se puede reanudar, se cierra el
   * recorrido con lo que haya en vez de enseñar un cronómetro que corre
   * sobre silencio, que es lo peor que podría pasar aquí.
   */
  const reanudar = () => {
    if (!mando) return;
    if (mando.reanudar()) { toast('Seguimos'); return; }
    toast('El móvil ha cortado el micrófono. Se cierra el recorrido con lo grabado.', 'err');
    terminar();
  };

  /**
   * Irse de la app pausa, no termina.
   *
   * Antes terminaba, y era lo correcto mientras no hubiera pausa: seguir
   * «grabando» silencio es peor que cortar. Ahora se pausa, que es lo
   * que quiere alguien a quien le entra una llamada a mitad de una
   * villa, y al volver se comprueba si el grabador ha sobrevivido. Si
   * no, se cierra el recorrido igual que antes —pero cuando ya se sabe
   * que se ha roto, no por si acaso.
   */
  const alTapar = () => {
    if (!mando) return;
    if (document.visibilityState === 'hidden') { mando.pausar(); return; }
    if (!mando.vivo()) {
      toast('El móvil ha cortado el micrófono. Se cierra el recorrido con lo grabado.', 'err');
      terminar();
    }
  };

  const terminar = async () => {
    document.removeEventListener('visibilitychange', alTapar);
    visorActual?.remove();
    visorActual = null;
    const capturado = await mando.parar();
    mando = null;
    lienzo.classList.remove('grabando');
    lienzo.closest('.screen')?.classList.remove('grabando');
    if (!capturado?.marcas.length) {
      toast('No has marcado nada. Se descarta el recorrido.');
      ir(volver);
      return;
    }
    const rec = paquete(capturado);
    await store.guardarRecorrido(rec);
    pendiente = rec;
    pintarRepaso(rec);
  };

  /* ─── 3. Repasando: una ficha por pantalla ────────────────────

     Antes esto era un rollo largo con las siete fotos a tamaño
     completo, una detrás de otra y sin nada que dijera dónde acababa
     una y empezaba la siguiente. Tenía todo el sentido cuando había
     que escribirlo todo a mano: era un formulario.

     Ahora la IA ya pone la estancia, el oficio y el texto, y lo que
     queda es otra cosa —mirar, corregir si hace falta y confirmar—.
     Eso se hace de una en una y rápido, no bajando por una columna de
     dos metros. Así que el repaso es ahora una ficha por pantalla, con
     su número («Repaso 3 de 7») y con vuelta atrás: pasar siete
     seguidas dando a Guardar es fácil de hacer sin mirar, y hay que
     poder volver a la anterior.

     Y todo lo repasado se apunta en el propio recorrido según se hace.
     Antes vivía solo en memoria: salir de la pantalla —una llamada, un
     atrás sin querer— se llevaba por delante lo escrito, incluido lo
     que acababa de redactar la IA y que ya estaba pagado. */
  const pintarRepaso = (rec) => {
    let ultimo = sugeridos[0] || OFICIO_POR_DEFECTO;
    let ultimaZona = '';

    // Lo ya repasado vuelve tal cual estaba.
    const previas = new Map((rec.fichas || []).map((x) => [String(x.id), x]));
    const fichas = rec.marcas.map((m) => {
      const v = previas.get(String(m.id)) || {};
      return {
        marca: m,
        texto: v.texto || '',
        oficio: v.oficio || ultimo,
        zona: v.zona || '',
        tocado: !!v.tocado, zonaTocada: !!v.zonaTocada,
        fuera: !!v.fuera, guardada: !!v.guardada,
        // Absorbida = esta foto es de un remate que ya cuenta otra
        // ficha. No está fuera —su foto va a ir en la tarea— pero no
        // tiene ficha propia.
        absorbida: !!v.absorbida,
        extras: Array.isArray(v.extras) ? v.extras.slice() : [],
        confianza: v.confianza || null, sinFoto: false,
      };
    });
    const porMarca = new Map(fichas.map((f) => [String(f.marca.id), f]));
    /** Las fotos de una ficha: la suya y las que haya absorbido. */
    const fotosDe = (f) => [f.marca, ...f.extras.map((id) => porMarca.get(String(id))?.marca).filter(Boolean)];

    /* Apuntar lo repasado. Se espera un momento entre tecla y tecla:
       guardar el recorrido reescribe el registro entero —con su audio y
       sus fotos dentro— y hacerlo en cada letra pondría el móvil a
       trabajar para nada. Con `ya` se escribe en el acto, que es lo que
       toca al cerrar una ficha o al salir. */
    let esperando = null;
    const apuntar = ({ ya = false } = {}) => {
      clearTimeout(esperando);
      const escribir = async () => {
        rec.fichas = fichas.map((f) => ({
          id: f.marca.id, texto: f.texto, oficio: f.oficio, zona: f.zona,
          tocado: f.tocado, zonaTocada: f.zonaTocada,
          fuera: f.fuera, guardada: f.guardada, confianza: f.confianza,
          absorbida: f.absorbida, extras: f.extras,
        }));
        try { await store.guardarRecorrido(rec); } catch { /* al siguiente cambio */ }
      };
      if (ya) return escribir();
      esperando = setTimeout(escribir, 1200);
      return Promise.resolve();
    };
    guardarAlSalir = () => apuntar({ ya: true });

    /* El reproductor del paseo, si es que hay algo que reproducir.

       Va con red porque el audio es lo único frágil del recorrido: es un
       Blob que ha dormido en la base del móvil, y un Blob guardado puede
       volver inservible —iOS lo tira cuando anda justo de espacio—. Las
       fotos y las marcas vuelven siempre.

       Sin esta comprobación reventaba aquí, antes de pintar una sola
       ficha, y como el rescate del recorrido a medias pasa por la misma
       línea, las fotos se volvían irrecuperables. */
    const audio = (() => {
      if (!(rec.audio instanceof Blob) || !rec.audio.size) return null;
      try {
        const nodo = h('audio', { preload: 'metadata', style: { display: 'none' } });
        nodo.src = URL.createObjectURL(rec.audio);
        urlsSueltas.push(nodo.src);
        audioSuelto?.remove();
        audioSuelto = nodo;
        document.body.append(nodo);
        return nodo;
      } catch {
        return null;
      }
    })();

    /* ─── El contagio de siempre ───
       El gremio y la estancia elegidos en una marca se propagan a las
       de después: un recorrido va habitación por habitación, así que la
       siguiente está casi siempre en el mismo sitio y es del mismo
       oficio. Se para en la primera que ya hayas decidido tú, y hacia
       atrás no toca nada. */
    const contagiar = (desde, gremio) => {
      let visto = false;
      for (const f of fichas) {
        if (f === desde) { visto = true; continue; }
        if (!visto || f.fuera) continue;
        if (f.tocado) break;
        f.oficio = gremio;
      }
    };
    const contagiarZona = (desde, z) => {
      let visto = false;
      for (const f of fichas) {
        if (f === desde) { visto = true; continue; }
        if (!visto || f.fuera) continue;
        if (f.zonaTocada) break;
        f.zona = z;
      }
    };

    /* ─── Por dónde vamos ─── */
    const vivas = () => fichas.filter((f) => !f.fuera && !f.absorbida);
    const cerradas = () => vivas().filter((f) => f.guardada);
    const abiertas = () => vivas().filter((f) => !f.guardada);
    let mirando = abiertas()[0] || vivas()[0] || null;
    /* Si ahora mismo hay una ficha en pantalla: el menú de los tres
       puntos solo ofrece «descartar esta tarea» cuando hay una delante. */
    let enFicha = false;

    const irAFicha = (f) => { mirando = f; pintarFicha(); };
    const vecina = (paso) => {
      const l = vivas();
      const i = l.indexOf(mirando);
      return i < 0 ? null : l[i + paso] || null;
    };

    /* ─── La antesala: el paseo y la IA ───
       Aquí se decide cómo se llenan las fichas: dejando que las escriba
       la IA, o entrando a escribirlas a mano. */
    const pintarAntesala = (motivo = '') => {
      enFicha = false;
      lienzo.classList.remove('ficha');
      cab.ponerTitulo(u.nombre);
      cab.ponerVuelta(() => salir());
      const cuantas = vivas().length;

      /* El reproductor de audio grande ya no está, y no es un descuido.

         Estaba duplicado: cada foto lleva su chip «▷ 0:03», que salta al
         momento exacto de la grabación en que la hiciste. Ése sirve
         —estás mirando una foto, no te cuadra lo que dice y oyes qué
         dijiste justo ahí—. La barra de arriba ofrecía oír la grabación
         entera desde el principio, sin saber qué buscabas. Nadie hace
         eso, y ocupaba la mejor parte de la pantalla.

         Con .filter(Boolean) y no a pelo: replaceChildren() convierte un
         null en la palabra «null» y la escribe en la pantalla, al revés
         que h(), que se los salta. */
      lienzo.replaceChildren(...[
        h('p.d-saludo', { style: { margin: '10px 0 4px', fontSize: '32px' } },
          cerradas().length ? 'Sigamos' : 'Ya está grabado'),
        h('p.sub', { style: { margin: '0 0 4px' } },
          `${grabadora.reloj(rec.duracion)} y ${cuantas} ${cuantas === 1 ? 'foto' : 'fotos'}`
          + (cerradas().length ? ` · ${cerradas().length} ${cerradas().length === 1 ? 'lista' : 'listas'}` : '')),
        tarjetaIA(motivo),
        h('button.d-boton-negro.claro', { style: { marginTop: '14px' }, onclick: () => pintarFicha() },
          cerradas().length
            ? `Seguir el repaso (${cerradas().length} de ${cuantas})`
            : `Escribir ${cuantas === 1 ? 'la tarea' : 'las tareas'} yo`),
      ].filter(Boolean));
    };

    /* ─── Una ficha ─── */
    const pintarFicha = () => {
      if (!mirando || !vivas().length) { pintarAntesala(); return; }
      if (!vivas().includes(mirando)) mirando = vivas()[0];
      const f = mirando;
      const l = vivas();
      const n = l.indexOf(f) + 1;

      // «Tarea», no «repaso»: lo que se está haciendo aquí es crear
      // tareas, una por foto.
      cab.ponerTitulo(`Tarea ${n} de ${l.length}`);
      // La flecha vuelve a la ficha anterior, y desde la primera sale de
      // la pantalla. Salir ya no cuesta nada: está todo apuntado.
      cab.ponerVuelta(() => (vecina(-1) ? irAFicha(vecina(-1)) : salir()));

      // Sin Blob no hay dirección que crear: pasa en fichas viejas cuya
      // foto se perdió en el disco, y antes tiraba la pantalla entera.
      const url = f.sinFoto || !(f.marca.blob instanceof Blob) ? null
        : URL.createObjectURL(f.marca.blob);
      if (url) urlsSueltas.push(url);
      enFicha = true;

      /* La foto. La papelera de la esquina cambia la imagen —no borra la
         ficha—, y por eso pregunta con las palabras exactas de lo que
         hace. Borrar la ficha entera es el botón de abajo. */
      /* Si el Blob volvió muerto del disco —Safari pierde los que
         guarda, ver store.js; los recorridos nuevos van en bytes y ya
         no les pasa—, el navegador pintaba su icono de imagen rota,
         que parece un fallo y no dice qué hacer. Se cambia por la
         verdad y por la salida: la papelera hace otra foto. */
      const imagen = url ? h('img', { src: url, alt: 'Foto del repaso' }) : null;
      if (imagen) {
        imagen.addEventListener('error', () => {
          foto.dataset.rota = '1';
          imagen.replaceWith(h('div', {
            style: { display: 'grid', placeItems: 'center', gap: '6px', height: '100%', color: 'var(--d-gris)', textAlign: 'center', padding: '20px' },
          },
            icon('camera', 30),
            h('p', { style: { margin: 0, fontSize: '15px' } }, 'La foto no se pudo recuperar'),
            h('p', { style: { margin: 0, fontSize: '13px' } }, 'Con la papelera puedes hacer otra'),
          ));
        });
      }

      const foto = h('div.d-foto.repaso', {
        style: url ? {} : { display: 'grid', placeItems: 'center', color: 'var(--d-gris)' },
        onclick: (ev) => {
          if (ev.target.closest('.d-foto-papelera') || ev.target.closest('.tag') || !url || foto.dataset.rota) return;
          openViewer(h('img', { src: url, alt: '' }));
        },
      },
        imagen || icon('image', 30),
        // El trocito de grabación de este momento, solo si hay audio.
        audio ? h('span.tag', {
          style: { position: 'absolute', left: '10px', top: '10px', background: 'rgba(0,0,0,.45)', color: '#fff' },
          onclick: (ev) => {
            ev.stopPropagation();
            audio.currentTime = Math.max(0, f.marca.ms / 1000 - 8);
            audio.play();
          },
        }, icon('play', 12), grabadora.reloj(f.marca.ms / 1000)) : null,
        url ? h('button.d-foto-papelera', {
          'aria-label': 'Cambiar esta foto',
          onclick: async () => {
            if (await confirmar({
              texto: 'Se quita esta foto y tendrás que hacer otra o traerla de la galería. '
                + 'El texto y la estancia se quedan como están.',
              ok: 'Cambiar la foto',
              icono: 'camera',
            })) reponer();
          },
        }, icon('trash')) : null,
      );

      const reponer = () => menuFlotante((cerrar) => [
        filaMenuFichero(cerrar, { capture: 'environment', multiple: false }, 'camera', 'Hacer foto', cambiarFoto),
        filaMenuFichero(cerrar, { multiple: false }, 'image', 'Seleccionar de la galería', cambiarFoto),
        filaMenu('corazon', 'Dejar la que había', cerrar),
      ], { conX: false });
      const cambiarFoto = async (ficheros) => {
        try {
          const img = await prepararImagen(ficheros[0]);
          f.marca.blob = img.blob; f.marca.ancho = img.ancho; f.marca.alto = img.alto;
          // Los bytes viejos, fuera: son la foto anterior y el guardado
          // los reutilizaría creyendo que el Blob nuevo ya está volcado.
          f.marca.bytes = null;
          f.sinFoto = false;
          await apuntar({ ya: true });
          pintarFicha();
        } catch { toast('No se pudo leer la foto', 'err'); }
      };

      /* Los campos, sin rótulos encima: los propios desplegables dicen
         qué son con su texto de espera, y el sitio que se ahorra se lo
         lleva la foto. */
      const selZona = h('button.d-desplegable', { style: { width: '100%' }, onclick: async () => {
        const elegida = await hojaZonas(f.zona);
        if (elegida === null) return;
        f.zona = elegida; f.zonaTocada = true; ultimaZona = elegida;
        contagiarZona(f, elegida);
        apuntar();
        pintarZona(); validar();
      } }, h('span'), icon('caretAbajo'));
      const pintarZona = () => {
        selZona.querySelector('span').textContent = f.zona || 'Seleccionar estancia';
        selZona.classList.toggle('puesto', !!f.zona);
      };
      pintarZona();

      const selGremio = h('button.d-desplegable', { style: { width: '100%' }, onclick: async () => {
        const elegido = await hojaOficios(f.oficio || ultimo, { titulo: 'Oficio o subcontrata' });
        if (!elegido) return;
        f.oficio = elegido; f.tocado = true; ultimo = elegido;
        contagiar(f, elegido);
        apuntar();
        pintarGremio(); validar();
      } }, h('span'), icon('caretAbajo'));
      const pintarGremio = () => {
        selGremio.querySelector('span').textContent = f.oficio ? oficio(f.oficio).nombre : 'Seleccionar gremio';
        selGremio.classList.toggle('puesto', !!f.oficio);
      };
      pintarGremio();

      /* La descripción: 400 caracteres como mucho, y la caja mide lo
         que mide el texto —ni sobra blanco ni se corta—. Lo que la caja
         no ocupa se lo queda la foto de abajo. */
      const texto = h('textarea.d-area', {
        rows: 1, maxlength: 400, placeholder: 'Qué hay que hacer aquí…',
        autocapitalize: 'sentences',
        style: { minHeight: '56px' },
      });
      texto.value = f.texto;
      const crecer = () => {
        texto.style.height = 'auto';
        texto.style.height = Math.max(56, texto.scrollHeight) + 'px';
      };
      texto.addEventListener('input', () => { f.texto = texto.value; crecer(); apuntar(); validar(); });

      /* El pie del Figma: dos botones a todo lo ancho, uno debajo del
         otro. «Crear tarea» en negro manda; «Descartar tarea» en
         blanco hueco, debajo, sin pelear por la vista. */
      const guardarBtn = h('button.d-boton-negro', {
        onclick: async () => {
          f.guardada = true;
          await apuntar({ ya: true });
          const sig = abiertas()[0];
          if (sig) { irAFicha(sig); return; }
          await cerrarElRepaso();
        },
      }, f.guardada ? 'Creada · seguir' : 'Crear tarea');

      const descartarBtn = h('button.d-boton-hueco', {
        onclick: () => quitarFicha(f),
      }, 'Descartar tarea');

      const validar = () => { guardarBtn.disabled = !(f.texto.trim() && f.oficio && f.zona); };
      validar();

      /* Las otras fotos del mismo remate, en tira debajo de la
         principal. Salen cuando la IA ha agrupado varias: hay que poder
         verlas y quitarlas de aquí sin perder la tarea. */
      const extras = f.extras.length ? h('div.d-rec-extras', null,
        ...f.extras.map((id) => {
          const g = porMarca.get(String(id));
          if (!g) return null;
          // La miniatura solo si su foto sigue viva; si se perdió, el
          // hueco con el aspa sigue ahí para poder separarla igual.
          const u2 = g.marca.blob instanceof Blob ? URL.createObjectURL(g.marca.blob) : null;
          if (u2) urlsSueltas.push(u2);
          return h('button.d-rec-extra', {
            'aria-label': 'Otra foto de este mismo repaso',
            onclick: () => { if (u2) openViewer(h('img', { src: u2, alt: '' })); },
          },
            u2 ? h('img', { src: u2, alt: '' }) : icon('image', 18),
            h('span.quitar', {
              'aria-label': 'Sacarla de este repaso',
              onclick: async (ev) => {
                ev.stopPropagation();
                if (!await confirmar({
                  texto: 'Esta foto vuelve a ser un repaso aparte, con su propia tarea. '
                    + 'El texto de éste se queda como está.',
                  ok: 'Separarla en otro repaso',
                  icono: 'cursores',
                  conservar: 'Dejarla aquí',
                  mini: u2,
                })) return;
                g.absorbida = false;
                f.extras = f.extras.filter((x) => String(x) !== String(id));
                await apuntar({ ya: true });
                pintarFicha();
              },
            }, icon('x', 14)),
          );
        }).filter(Boolean),
      ) : null;

      /* El orden del Figma («TAREA 2 DE 4», pantallas A y B): la FOTO
         arriba, estirando con todo lo que sobre —en la A, pantalla
         corta, queda más baja; en la B, más alta: recorta, nunca
         deforma—; la villa en su pastilla, solo como señalización; los
         dos desplegables; la descripción con su alto justo; y el pie
         con los dos botones, SIEMPRE a la vista. La clase `ficha` hace
         del lienzo una columna que mide la pantalla. */
      lienzo.classList.add('ficha');
      lienzo.replaceChildren(...[
        foto,
        extras,
        // La villa: el recorrido ya se hizo desde ella y no hay nada
        // que pedir ni que explicar, solo decir cuál es.
        h('div.d-rec-villa', null, u.nombre),
        selZona,
        selGremio,
        texto,
        h('div.d-rec-pie.apilado', null, guardarBtn, descartarBtn),
        // Cuando ya está todo cerrado, el remate se puede dar desde
        // cualquier ficha sin tener que llegar hasta la última.
        abiertas().length ? null : h('button.d-boton-negro.claro', {
          onclick: () => crearLasTareas(),
        }, `Crear ${cerradas().length === 1 ? 'la tarea' : `las ${cerradas().length} tareas`}`),
      ].filter(Boolean));
      requestAnimationFrame(() => { if (f.texto) crecer(); });
      lienzo.closest('.screen')?.scrollTo?.({ top: 0 });
      document.getElementById('app')?.scrollTo?.({ top: 0 });
    };

    /* Descartar una ficha. La usan el botón del pie de la ficha y el
       menú de los tres puntos, para que las dos puertas hagan lo mismo
       y pregunten lo mismo.

       «Descartar», no «eliminar»: la tarea todavía no existe —se está
       creando— y eliminar es lo que se hace con una ya creada. Y la
       pregunta va pelada, sin miniatura ni explicación: dos opciones y
       ya, como pidió Fran. */
    const quitarFicha = async (f) => {
      if (!f) return;
      if (!await confirmar({
        ok: 'Descartar tarea',
        rojo: true,
        conservar: 'Conservar tarea',
      })) return;
      f.fuera = true;
      await apuntar({ ya: true });
      const sig = vecina(1) || vecina(-1);
      if (sig) { irAFicha(sig); return; }
      if (!vivas().length) { await tirarElRecorrido(); return; }
      pintarFicha();
    };

    /* Tirar el paseo entero, desde el menú y en cualquier momento.

       Distinto de tirarElRecorrido(), que salta solo cuando ya no queda
       ninguna ficha: aquí se decide a propósito y hay que decir todo lo
       que se lleva por delante, incluido lo repasado hasta ahora. */
    const descartarTodo = async () => {
      const listas = cerradas().length;
      const seguro = await confirmar({
        titulo: '¿Descartar el recorrido?',
        texto: `Se borra el paseo entero: ${rec.marcas.length} `
          + `${rec.marcas.length === 1 ? 'foto' : 'fotos'} y ${grabadora.reloj(rec.duracion)} `
          + `de grabación${listas ? `, con ${listas} ${listas === 1 ? 'tarea ya lista' : 'tareas ya listas'}` : ''}. `
          + 'No se puede recuperar.',
        ok: 'Descartar el recorrido',
        rojo: true,
        conservar: 'Conservar el recorrido',
      });
      if (!seguro) return;
      guardarAlSalir = null;
      await store.borrarRecorrido(rec.id);
      toast('Recorrido descartado');
      ir(volver);
    };

    /* ─── El remate ─── */

    /** Al cerrar la última: se pregunta antes de crear nada. */
    const cerrarElRepaso = async () => {
      const buenas = cerradas();
      if (!buenas.length) { await tirarElRecorrido(); return; }
      const quiere = await confirmar({
        titulo: 'Ese era el último',
        texto: `Se crearán ${buenas.length} ${buenas.length === 1 ? 'tarea' : 'tareas'} en ${u.nombre}. `
          + 'Puedes seguir revisándolas antes, que no se pierde nada.',
        ok: `Crear ${buenas.length === 1 ? 'la tarea' : `las ${buenas.length} tareas`}`,
        icono: 'check',
        conservar: 'Seguir revisando',
        iconoConservar: 'edit',
      });
      if (!quiere) { irAFicha(vivas()[0]); return; }
      await crearLasTareas();
    };

    /** Las tareas, de una vez, y a la vivienda. */
    const crearLasTareas = async () => {
      const buenas = cerradas();
      if (!buenas.length) return;
      toast('Creando las tareas…');

      /* Todo el tramo va vigilado, y no por manía. Aquí antes no había
         try/catch, y el día que una foto llegó muerta del disco —Safari
         pierde los Blobs guardados, ver store.js— esto reventaba justo
         después del «Creando las tareas…» y se quedaba clavado en la
         ficha: ni tareas, ni aviso, ni salida. Lo peor de lo peor,
         porque parecía que algo se estaba creando y no.

         Ahora cada foto se comprueba leyéndola ANTES de meterla: una
         ilegible se apunta como perdida y la tarea sale igual, con su
         texto, su gremio y su estancia, que es trabajo escrito a mano y
         no se tira porque a Safari se le haya caído un fichero. Y si
         aun así algo revienta, se dice y te quedas donde estás, con
         todo lo repasado intacto. */
      /* La regla de la casa: una tarea sin fotografía NO EXISTE. Por
         eso la prueba de vida de cada foto va ANTES de crear nada —una
         lectura completa, que un Blob perdido conserva el tamaño y
         solo falla al leer— y una ficha con todas sus fotos muertas no
         se convierte en tarea: se cuenta y se dice, con su texto, para
         que se vuelva a hacer esa foto en obra. Crearla sin imagen
         sería colar por buena una tarea que la regla prohíbe. */
      const conVida = [];
      let sinCrear = 0;
      for (const f of buenas) {
        const fotosVivas = [];
        if (!f.sinFoto) {
          for (const m of fotosDe(f)) {
            try {
              if (!(m.blob instanceof Blob) || !m.blob.size) throw new Error('sin foto');
              await m.blob.arrayBuffer();
              fotosVivas.push(m);
            } catch { /* muerta: si no queda ninguna, la ficha no entra */ }
          }
        }
        if (fotosVivas.length) conVida.push({ f, fotosVivas });
        else sinCrear += 1;
      }
      if (!conVida.length) {
        toast('Ninguna foto ha sobrevivido y sin foto no se crean tareas. Vuelve a hacer el recorrido.', 'err');
        return;
      }

      let lista;
      try {
        lista = await store.crearLista({ unidadId, promoId, fase: FASE_UNICA });
        for (const { f, fotosVivas } of conVida) {
          const t = await store.crearTarea({
            listaId: lista.id, texto: f.texto.trim(), oficio: f.oficio, zona: f.zona,
          });
          // Todas las fotos vivas del remate, no solo la principal.
          for (const m of fotosVivas) {
            await store.añadirMedio(t.id, {
              tipo: 'imagen', blob: m.blob, mime: 'image/jpeg',
              ancho: m.ancho, alto: m.alto,
            });
          }
        }
        await store.marcarRecorridoUsado(rec.id, lista.id);
      } catch (e) {
        console.error(e);
        toast('No se han podido crear las tareas. Nada se ha perdido: vuelve a intentarlo.', 'err');
        return;
      }
      guardarAlSalir = null;
      const yo = store.sesion();
      await hojaBienHecho({
        titulo: `Excelente${nombreCorto(yo) ? ', ' + nombreCorto(yo) : ''}`,
        frase: `${conVida.length} ${conVida.length === 1 ? 'tarea creada' : 'tareas creadas'}. `
          + (sinCrear
            ? `${sinCrear === 1 ? 'Una se ha quedado fuera porque su foto se perdió' : `${sinCrear} se han quedado fuera porque sus fotos se perdieron`}: sin foto no se crean tareas.`
            : 'Que empiecen los remates.'),
        usuario: yo,
        boton: `Volver a ${u.nombre}`,
      });
      /* Aquí NO se llama a refrescar(), y es la corrección importante.

         refrescar() vuelve a pintar la pantalla en la que estás, y la
         pantalla en la que estás es ésta: se montaba entera otra vez y
         abría la cámara. Y como arrancar() asigna el mando después de un
         await, la limpieza de la pantalla ya había pasado con el mando
         vacío: nadie soltaba cámara ni micrófono. El punto verde se
         quedaba encendido con la batería en obra. La vivienda se pinta
         sola al llegar; no hay que refrescar nada. */
      ir(volver);
    };

    /** Sin ninguna ficha viva no hay tareas: el paseo se tira entero. */
    const tirarElRecorrido = async () => {
      const seguro = await confirmar({
        titulo: 'Has quitado todas las fotos',
        texto: `Eliminar ahora borra el paseo entero: ${rec.marcas.length} `
          + `${rec.marcas.length === 1 ? 'foto' : 'fotos'} y ${grabadora.reloj(rec.duracion)} `
          + 'de grabación. No se puede recuperar.',
        ok: 'Eliminar el recorrido',
        conservar: 'Conservar el recorrido',
      });
      if (!seguro) {
        for (const f of fichas) f.fuera = false;
        await apuntar({ ya: true });
        mirando = vivas()[0];
        toast('Recorrido recuperado');
        pintarFicha();
        return;
      }
      guardarAlSalir = null;
      await store.borrarRecorrido(rec.id);
      toast('Recorrido descartado');
      ir(volver);
    };

    /** Salir de la pantalla. Ya no cuesta nada: está todo apuntado. */
    const salir = async () => {
      await apuntar({ ya: true });
      if (cerradas().length || fichas.some((f) => f.texto)) {
        toast('Lo repasado se queda guardado en este móvil');
      }
      ir(volver);
    };

    /* ─── La tarjeta de la IA ─── */
    /* ─── Que las escriba la IA ───

       Antes esto era el manejador de un botón, y por eso había que pasar
       por una pantalla intermedia a pulsarlo. Ahora es una función que
       se llama sola al terminar de grabar: si has elegido el recorrido
       con IA, preguntarte si quieres IA es preguntarte lo que ya has
       contestado.

       Devuelve el motivo del fallo, o null si ha ido bien. */
    const redactar = async ({ texto = rec.transcripcion || '' } = {}) => {
      const conFicha = vivas();
      if (!conFicha.length) return 'No queda ninguna foto que redactar.';

      const hayQueEscuchar = !texto.trim()
        && rec.audio instanceof Blob && rec.audio.size > 0;

      const paso = pantallaTrabajando([
        'Escuchando la grabación',
        'Insertando fotos',
        'Creando tareas',
      ]);
      let rendido = false;
      paso.alRendirse(() => {
        rendido = true;
        toast('Seguimos sin la IA: escribe tú las tareas');
        pintarFicha();
      });
      let nota = '';

      try {
        /* Primero se escucha, y solo si no hay ya texto: lo que hayas
           escrito manda sobre la grabación, y lo que ya se transcribió
           una vez no se vuelve a pagar.

           El subtítulo lleva la duración porque es lo que explica la
           espera: «son 6:12 de grabación» se entiende solo. */
        paso.ir(0, hayQueEscuchar
          ? `Son ${grabadora.reloj(rec.duracion)} de grabación`
          : 'Ya estaba escrito de antes');
        if (hayQueEscuchar) {
          try {
            const t = await api.oidoTranscribir(rec.audio, rec.duracion);
            texto = t.texto || '';
            rec.transcripcion = texto;
            await store.guardarRecorrido(rec);
          } catch (e) {
            // Que falle el oído no puede dejarte sin tareas: las fotos
            // siguen ahí y de ellas ya sale un parte.
            nota = e?.codigo === 'sin-clave'
              ? ''
              : ` No se ha podido escuchar la grabación: ${e?.message || 'ha fallado'}`;
          }
        }

        // Las fotos se encogen aquí, en el móvil: lo que sube por la
        // línea de la obra son unos cientos de kilobytes y no ocho
        // megas, y en la API se paga por lo que ocupa cada una.
        const conFoto = conFicha.slice(0, TOPE_FOTOS);
        const fotos = [];
        for (const f of conFoto) {
          // El único paso con cuenta de verdad, y por eso el subtítulo
          // la lleva: un número que avanza es lo que acorta una espera.
          paso.ir(1, `Foto ${fotos.length + 1} de ${conFoto.length}`,
            (fotos.length + 1) / conFoto.length);
          try {
            fotos.push({ id: f.marca.id, b64: await paraMirar(f.marca.blob) });
          } catch { /* si una foto no se deja leer, se manda sin ella */ }
        }

        // Aquí no hay nada que contar, así que se dice la verdad en vez
        // de prometer «unos segundos» que luego son cuarenta.
        paso.ir(2, 'Es lo que más tarda');
        const r = await api.claudeRedactar(
          texto.trim(),
          conFicha.map((f) => ({ id: f.marca.id, ms: f.marca.ms })),
          OFICIOS.map((o) => ({ id: o.id, nombre: o.nombre })),
          fotos,
          ZONAS,
          juntaFotos(store.sesion()),
        );

        const porId = new Map(conFicha.map((f) => [String(f.marca.id), f]));
        let dichas = 0;
        let vistas = 0;
        for (const ficha of r.fichas || []) {
          const f = porId.get(String(ficha.id));
          if (!f) continue;
          const t = String(ficha.texto || '').trim();
          f.confianza = ficha.confianza || null;
          if (!t) continue;
          f.texto = t;
          // Lo redactado cuenta como decidido: el contagio de gremios
          // no debe pisarlo después.
          if (ficha.oficio && OFICIOS.some((o) => o.id === ficha.oficio)) {
            f.oficio = ficha.oficio;
            f.tocado = true;
          }
          // La estancia solo se acepta si está en la lista cerrada: un
          // «baño de arriba» inventado rompería el filtro, que es justo
          // para lo que existe el campo.
          if (ficha.zona && ZONAS.includes(ficha.zona)) {
            f.zona = ficha.zona;
            f.zonaTocada = true;
          }
          /* Las otras fotos del mismo remate se meten en esta ficha y
             dejan de tener la suya. La tarea saldrá con las dos —o las
             tres— dentro, que es lo que se quiere ver al abrirla: el
             sitio de lejos y el defecto de cerca. */
          f.extras = [];
          for (const otro of ficha.con || []) {
            const g = porMarca.get(String(otro));
            if (!g || g === f || g.fuera || g.absorbida) continue;
            g.absorbida = true;
            f.extras.push(g.marca.id);
          }
          if (ficha.origen === 'foto') vistas += 1; else dichas += 1;
        }

        /* Lo redactado se apunta en el acto, y también que ya se ha
           intentado. Cuesta dinero y medio minuto: no puede depender de
           que no entre una llamada en los diez segundos siguientes, ni
           volver a dispararse solo cada vez que entras en la pantalla. */
        rec.redactado = true;
        await apuntar({ ya: true });
        if (rendido) return null;   // se cansó de esperar; ya está en las fichas
        paso.quitar();
        toast(resumen(dichas, vistas, conFicha.length, conFicha.length - conFoto.length) + nota);
        mirando = abiertas()[0] || vivas()[0];
        pintarFicha();
        return null;
      } catch (e) {
        paso.quitar();
        if (rendido) return null;
        // Se apunta el intento aunque falle: si no, volver a entrar
        // dispararía otra llamada sola, y la de antes ya está pagada.
        rec.redactado = true;
        await apuntar({ ya: true });
        return e?.status === 404
          ? 'El servidor todavía no tiene esta parte instalada.'
          : (e?.message || 'No se ha podido redactar.');
      }
    };

    /* ─── La tarjeta de la IA ───
       Ya no es la puerta de entrada: solo se ve desde la antesala, que
       es a donde se cae cuando la IA falla o cuando vuelves a un
       recorrido que se quedó sin redactar. */
    const tarjetaIA = (motivo = '') => {
      if (!api.HAY_SERVIDOR) return null;

      const campo = h('textarea.d-area', {
        rows: 3, autocapitalize: 'sentences', style: { minHeight: '96px' },
        placeholder: 'Se rellena solo con lo que dijiste. Si escribes aquí, manda lo tuyo…',
      });
      const crecerCampo = () => {
        campo.style.height = 'auto';
        campo.style.height = campo.scrollHeight + 'px';
      };
      campo.addEventListener('input', crecerCampo);
      if (rec.transcripcion) {
        campo.value = rec.transcripcion;
        requestAnimationFrame(crecerCampo);
      }

      const aviso = h('p.hint');
      if (motivo) { aviso.className = 'hint err'; aviso.textContent = motivo; }

      const boton = h('button.d-boton-negro', null,
        icon('cerebro'),
        h('span.grow', null, motivo ? 'Volver a intentarlo' : 'Que las escriba la IA'));

      boton.addEventListener('click', async () => {
        const fallo = await redactar({ texto: campo.value });
        if (fallo) pintarAntesala(fallo);
      });

      return h('div.rec-dictado', null,
        h('p.d-epigrafe', { style: { margin: '0 0 4px' } }, 'Que las escriba solas'),
        h('p.sub', { style: { marginTop: '4px' } },
          'Se escucha lo que dijiste, se miran las fotos y sale una tarea de cada '
          + 'una con su estancia y su gremio. Un solo toque.'),
        h('div', { style: { marginTop: '10px' } }, campo),
        aviso,
        boton,
      );
    };

    /* ─── Por dónde se entra ───

       El recorrido tiene que terminar en las tareas, no en una sala de
       espera con un botón. Así que aquí no se pregunta nada que ya esté
       contestado:

         · si ya hay algo escrito, a las fichas;
         · si no, y la IA está disponible y no se ha intentado aún, se
           dispara sola y de ahí a las fichas;
         · y solo si falla —o si no hay IA, o si vuelves a un recorrido
           que se quedó a medias— aparece la antesala, que pasa a ser lo
           que debía: el plan B, no el peaje. */
    const arranque = async () => {
      const algoEscrito = fichas.some((f) => f.texto);
      if (algoEscrito) { pintarFicha(); return; }
      if (!api.HAY_SERVIDOR || rec.redactado) {
        pintarAntesala();
        return;
      }
      const fallo = await redactar();
      if (fallo) pintarAntesala(fallo);
    };

    /* El menú de los tres puntos, ya con el repaso montado.

       Antes solo tenía «Salir del recorrido», que además de no preguntar
       nada sonaba a abandonar el paseo —y por eso asustaba—. Ahora se
       llama por lo que hace: salir no cuesta nada, porque todo lo
       repasado se apunta según se hace. Lo que sí cuesta son las otras
       dos, y ésas preguntan. */
    menuDelRepaso = () => menuFlotante((cerrar) => [
      filaMenu('arrowLeft', 'Salir y seguir luego', () => { cerrar(); salir(); }),
      /* «Descartar esta tarea» solo cuando hay una ficha delante. En la
         antesala no hay ninguna «esta», y una fila que no sabe a qué se
         refiere es peor que no estar. */
      enFicha && mirando && vivas().includes(mirando) ? filaMenu('trash', 'Descartar esta tarea', () => {
        const f = mirando;
        cerrar();
        quitarFicha(f);
      }, { rojo: true }) : null,
      filaMenu('trash', 'Descartar el recorrido', () => { cerrar(); descartarTodo(); }, { rojo: true }),
    ].filter(Boolean));

    arranque();
  };

  /* Con `seguir` se entra directo al repaso: ni cámara, ni micrófono,
     ni pop up de arranque. Viene del aviso de la ficha de la vivienda,
     donde ya se ha decidido que lo que toca es terminar lo de antes.

     Si el paseo ya no está —se terminó desde otra pestaña, o el aviso
     venía de un enlace viejo— se vuelve a la vivienda diciéndolo. Abrir
     la cámara aquí sería empezar un recorrido nuevo sin que nadie lo
     haya pedido. */
  if (seguir) {
    if (pendiente) pintarRepaso(pendiente);
    else { toast('Ese recorrido ya no está'); ir(volver, { reemplazar: true }); }
  } else {
    pintarPreparado();
  }

  return {
    sinTabs: true,
    clase: 'pantalla-diseno pantalla-recorrido',
    contenido: [
      cab,
      lienzo,
    ],
    // Al salir de la pantalla hay que soltar cámara y micrófono sí o sí:
    // si no, el piloto de la cámara se queda encendido y la batería se
    // va sin que nadie sepa por qué.
    //
    // Y lo que se llevara grabado no se tira: se guarda tal cual y al
    // volver a entrar en la vivienda se ofrece repasarlo. Salir a mitad
    // de un recorrido casi nunca es «bórralo»; es el teléfono sonando.
    alSalir: () => {
      // Lo repasado, antes que nada: es lo único que no se puede volver
      // a hacer solo. La cámara se suelta igual justo después.
      guardarAlSalir?.();
      guardarAlSalir = null;
      audioSuelto?.remove();
      audioSuelto = null;
      document.removeEventListener('visibilitychange', alTapar);
      visorActual?.remove();
      visorActual = null;
      for (const u of urlsSueltas) URL.revokeObjectURL(u);
      urlsSueltas.length = 0;
      const m = mando;
      mando = null;
      if (!m) return;
      m.cancelar()
        .then((cap) => (cap?.marcas.length ? store.guardarRecorrido(paquete(cap)) : null))
        .catch(() => { /* la cámara ya está suelta, que es lo urgente */ });
    },
  };
}
