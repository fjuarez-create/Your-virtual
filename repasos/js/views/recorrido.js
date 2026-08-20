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
import { h, icon, toast, openViewer, sheet, fechaCorta } from '../ui.js';
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
import { paraMirar, prepararImagen } from '../media.js';
import { ir, refrescar } from '../app.js';

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

export async function render({ promoId, unidadId }) {
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

  // La cabecera se guarda para poder tocarla desde el repaso: allí la
  // flecha de volver deja de navegar (irse dejaría el recorrido a
  // medias sin decirlo) y el título pasa a «Nueva lista - Villa N».
  // Para eso están ponerTitulo() y ponerVuelta(), que la cabecera trae
  // puestos encima.
  const cab = cabecera({
    volver,
    titulo: u.nombre,
    menu: () => menuFlotante((cerrar) => [
      filaMenu('x', 'Salir del recorrido', () => { cerrar(); ir(volver); }),
    ]),
  });

  // Los gremios que más salen aquí, para tenerlos a un toque al repasar.
  const sugeridos = await store.oficiosMasUsados(unidadId, 4);

  // Un recorrido grabado y no repasado todavía. Pasa cuando se sale de
  // la pantalla a media faena —una llamada, un resbalón hacia atrás— y
  // es justo el trabajo que más duele perder: el paseo ya está dado.
  let pendiente = (await store.recorridosDeUnidad(unidadId))
    .filter((r) => !r.usado)
    .sort((a, b) => (a.creado < b.creado ? 1 : -1))[0] || null;

  /** El recorrido tal y como se guarda: el audio entero y las marcas. */
  const paquete = (capturado) => ({
    id: store.nuevoId(),
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
      filaMenu('stop', 'Cancelar', () => { cerrar(); ir(volver); }),
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

  /* ─── 3. Repasando ─── */
  const pintarRepaso = (rec) => {
    // Ninguna marca llega sin gremio: se propone el que más sale en esta
    // vivienda. Con quince fotos delante, obligar a abrir quince
    // desplegables es lo que convierte un buen recorrido en un rato de
    // trabajo administrativo, y todos se pueden cambiar de un toque.
    let ultimo = sugeridos[0] || OFICIO_POR_DEFECTO;
    let ultimaZona = '';
    const fichas = rec.marcas.map((m) => ({
      marca: m, texto: '', oficio: ultimo, zona: '',
      tocado: false, zonaTocada: false, fuera: false, confianza: null,
    }));

    /* El reproductor del paseo, si es que hay algo que reproducir.

       Va con red, y es la parte importante de esta pantalla. El audio es
       lo único frágil de todo el recorrido: es un Blob que ha dormido en
       la base de datos del móvil, y un Blob guardado puede volver
       inservible —iOS lo tira cuando anda justo de espacio, y hay
       versiones que lo devuelven vacío—. Las fotos, en cambio, siempre
       vuelven.

       Antes esto eran dos líneas sin protección, y si el audio no valía
       reventaba JUSTO AQUÍ, antes de pintar una sola ficha: la pantalla
       se quedaba en blanco con la cabecera y nada más. Y como el rescate
       del recorrido a medias pasa por esta misma línea, las fotos del
       paseo se volvían irrecuperables: no había forma de llegar a ellas.
       Un recorrido de una hora por una casa, perdido por la grabación de
       voz, que es lo que menos importa de las tres cosas.

       Ahora, si el audio no vale, se dice y se sigue. */
    const audio = (() => {
      if (!(rec.audio instanceof Blob) || !rec.audio.size) return null;
      try {
        const nodo = h('audio', { controls: true, preload: 'metadata', style: { width: '100%' } });
        nodo.src = URL.createObjectURL(rec.audio);
        urlsSueltas.push(nodo.src);
        return nodo;
      } catch {
        return null;
      }
    })();
    const avisoSinAudio = audio ? null : h('p.hint', null,
      'La grabación de voz de este recorrido no se puede reproducir. '
      + 'Las fotos y las marcas están todas: sigue apuntando las tareas.');

    const listado = h('div.d-propuestas');

    /** Enciende o apaga el «Guardar» de cada tarjeta según lo relleno. */
    const validar = () => {
      for (const f of fichas) f.pintarBoton?.();
    };

    /**
     * El gremio elegido en una marca se propaga a las de después. Un
     * recorrido va habitación por habitación: si en el baño dices
     * «alicatado», lo que viene detrás casi siempre es lo mismo hasta
     * que cambias de sitio.
     *
     * Se para en la primera marca que ya hayas decidido tú, y hacia
     * atrás no toca nada: tus decisiones mandan sobre todo lo que viene
     * después de ellas, y nunca se deshacen.
     */
    const contagiar = (desde, gremio) => {
      let visto = false;
      for (const f of fichas) {
        if (f === desde) { visto = true; continue; }
        if (!visto || f.fuera) continue;
        if (f.tocado) break;
        f.oficio = gremio;
        f.pintarGremio?.();
      }
    };

    /**
     * La estancia se contagia igual, y con más razón todavía: un
     * recorrido se hace habitación por habitación, así que la marca
     * siguiente está casi siempre en el mismo sitio que la anterior.
     */
    const contagiarZona = (desde, z) => {
      let visto = false;
      for (const f of fichas) {
        if (f === desde) { visto = true; continue; }
        if (!visto || f.fuera) continue;
        if (f.zonaTocada) break;
        f.zona = z;
        f.pintarZona?.();
      }
    };

    const pintarFichas = () => {
      const vivas = fichas.filter((f) => !f.fuera && !f.guardada);
      listado.replaceChildren(...vivas.map((f) => ficha(f)));
      // El alto solo se puede medir con la caja ya puesta en la página.
      for (const f of vivas) if (f.texto) f.crecer?.();
      validar();
    };

    const ficha = (f) => {
      const url = f.sinFoto ? null : URL.createObjectURL(f.marca.blob);

      /* La foto grande con su papelera. La papelera pregunta con el
         menú del diseño, y al eliminar ofrece hacer otra, traerla de
         la galería o dejar la tarea sin foto. */
      const foto = h('div.d-foto', {
        style: url ? {} : { display: 'grid', placeItems: 'center', color: 'var(--d-gris)' },
        onclick: (ev) => { if (ev.target.closest('.d-foto-papelera') || !url) return; openViewer(h('img', { src: url, alt: '' })); },
      },
        url ? h('img', { src: url, alt: 'Foto de la marca' }) : icon('image', 30),
        h('span.tag', {
          style: { position: 'absolute', left: '10px', top: '10px', background: 'rgba(0,0,0,.45)', color: '#fff' },
          onclick: (ev) => { ev.stopPropagation(); audio.currentTime = Math.max(0, f.marca.ms / 1000 - 8); audio.play(); },
        }, icon('play', 12), grabadora.reloj(f.marca.ms / 1000)),
        url ? h('button.d-foto-papelera', {
          'aria-label': 'Borrar esta foto',
          onclick: () => menuFlotante((cerrar) => [
            filaMenu('trash', 'Eliminar imagen', () => { cerrar(); reponer(); }),
            filaMenu('corazon', 'Conservar', cerrar),
          ]),
        }, icon('trash')) : null,
      );
      // Al quitar la foto hay que poner otra: una tarea sin foto no sale
      // de aquí. Si esta marca no vale, se elimina la propuesta entera,
      // que para eso está su botón; lo que no se puede es mandar a la
      // obra un remate que nadie va a saber reconocer.
      const reponer = () => menuFlotante((cerrar) => [
        filaMenuFichero(cerrar, { capture: 'environment', multiple: false }, 'camera', 'Hacer foto', cambiarFoto),
        filaMenuFichero(cerrar, { multiple: false }, 'image', 'Seleccionar de la galería', cambiarFoto),
        filaMenu('corazon', 'Conservar la que había', cerrar),
      ], { conX: false });
      const cambiarFoto = async (ficheros) => {
        try {
          const img = await prepararImagen(ficheros[0]);
          f.marca.blob = img.blob; f.marca.ancho = img.ancho; f.marca.alto = img.alto;
          f.sinFoto = false;
          pintarFichas();
        } catch { toast('No se pudo leer la foto', 'err'); }
      };

      /* Los campos del diseño: estancia y oficio en pastilla, y la
         descripción en su caja. El contagio de siempre sigue vivo. */
      const campo = (rotulo, pastilla) => h('div.d-campo', null,
        h('label.d-campo-rotulo', null, rotulo, h('span.req', null, '*')),
        pastilla,
      );
      const selZona = h('button.d-desplegable', { style: { width: '100%' }, onclick: async () => {
        const elegida = await hojaZonas(f.zona);
        if (elegida === null) return;
        f.zona = elegida;
        f.zonaTocada = true;
        ultimaZona = elegida;
        pintarZona();
        contagiarZona(f, elegida);
      } }, h('span', null, ''), icon('caretAbajo'));
      const pintarZona = () => {
        selZona.querySelector('span').textContent = f.zona || 'Seleccionar estancia';
        selZona.classList.toggle('puesto', !!f.zona);
      };
      f.pintarZona = pintarZona;
      pintarZona();

      const selGremio = h('button.d-desplegable', { style: { width: '100%' }, onclick: async () => {
        const elegido = await hojaOficios(f.oficio || ultimo, { titulo: 'Oficio o subcontrata' });
        if (elegido) poner(elegido);
      } }, h('span', null, ''), icon('caretAbajo'));
      const poner = (elegido, propio = true) => {
        f.oficio = elegido;
        if (propio) { f.tocado = true; ultimo = elegido; contagiar(f, elegido); }
        pintarGremio();
        validar();
      };
      const pintarGremio = () => {
        selGremio.querySelector('span').textContent = f.oficio ? oficio(f.oficio).nombre : 'Seleccionar oficio';
        selGremio.classList.toggle('puesto', !!f.oficio);
      };
      f.pintarGremio = pintarGremio;
      pintarGremio();

      const texto = h('textarea.d-area', {
        rows: 2, placeholder: 'Qué hay que hacer aquí…', autocapitalize: 'sentences',
        style: { minHeight: '73px' },
      });
      texto.value = f.texto;
      const crecer = () => {
        texto.style.height = 'auto';
        texto.style.height = Math.max(73, texto.scrollHeight) + 'px';
      };
      texto.addEventListener('input', () => { f.texto = texto.value; crecer(); validar(); });
      f.crecer = crecer;

      /* La pareja del diseño: eliminar en fantasma, guardar en negro
         con el cerebro de la IA. */
      const guardarBtn = h('button.d-boton-negro', {
        onclick: () => { f.guardada = true; pintarFichas(); comprobarCierre(); },
      }, icon('cerebro'), 'Guardar');
      f.pintarBoton = () => { guardarBtn.disabled = !(f.texto.trim() && f.oficio); };
      f.pintarBoton();

      return h('div.d-propuesta', { class: f.confianza === 'baja' ? 'dudosa' : '' },
        foto,
        campo('Zona o estancia', selZona),
        campo('Oficio o subcontrata', selGremio),
        h('div.d-campo', null,
          h('label.d-campo-rotulo', null, 'Descripción', h('span.req', null, '*')),
          texto,
        ),
        h('div.d-propuesta-botones', null,
          h('button.d-fantasma', {
            onclick: () => { f.fuera = true; pintarFichas(); comprobarCierre(); },
          }, icon('trash'), 'Eliminar'),
          guardarBtn,
        ),
      );
    };

    /**
     * Que las tareas se escriban solas.
     *
     * Claude no oye —el audio de arriba no le sirve—, pero sí ve. Así
     * que lo que viaja son las fotos, encogidas, y de cada una sale una
     * tarea con su gremio sin que tengas que escribir nada.
     *
     * La caja de texto sigue estando, y ahora es lo que siempre debió
     * ser: opcional. Lo que escribas o dictes ahí manda sobre lo que se
     * vea en la foto, porque tú sabes qué mirabas y la foto no lo dice.
     * Cuando la transcripción esté enchufada, llegará puesta sola.
     *
     * Y si no hay clave, si el hosting no sale a internet o si prefieres
     * escribirlas tú, las fichas siguen ahí debajo igual que antes.
     */
    const dictado = () => {
      if (!api.HAY_SERVIDOR) return null;

      const campo = h('textarea.d-area', {
        rows: 3, autocapitalize: 'sentences',
        style: { minHeight: '96px' },
        placeholder: 'Se rellena solo con lo que dijiste. Si escribes aquí, manda lo tuyo…',
      });
      // La transcripción de un recorrido de cuatro minutos no cabe en
      // tres líneas: la caja crece con lo que le echen, igual que las de
      // las fichas de abajo.
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
      const boton = h('button.d-boton-negro', { style: { marginTop: '10px' } },
        icon('cerebro'), h('span.grow', null, 'Redactar las tareas'));
      const rotulo = boton.querySelector('.grow');

      boton.addEventListener('click', async () => {
        const vivas = fichas.filter((f) => !f.fuera);
        if (!vivas.length) return;
        boton.disabled = true;
        aviso.className = 'hint';
        let nota = '';

        try {
          // Primero se escucha. Solo si no hay ya texto: lo que haya
          // escrito la persona manda sobre la grabación, y lo que ya se
          // transcribió una vez no se vuelve a pagar.
          // La misma comprobación que arriba: un audio que no vale no
          // puede tumbar la redacción de las tareas. Sin él se redacta
          // con las fotos, que es de donde sale casi todo.
          if (!campo.value.trim() && rec.audio instanceof Blob && rec.audio.size) {
            rotulo.textContent = 'ESCUCHANDO…';
            aviso.textContent = 'Pasando a texto lo que dijiste.';
            try {
              const t = await api.oidoTranscribir(rec.audio, rec.duracion);
              campo.value = t.texto || '';
              crecerCampo();
              rec.transcripcion = campo.value;
              await store.guardarRecorrido(rec);
            } catch (e) {
              // Que falle el oído no puede dejarte sin tareas: las fotos
              // siguen ahí y de ellas ya sale un parte. Pero se dice, que
              // si es la clave o el crédito hay que ir a arreglarlo.
              nota = e?.codigo === 'sin-clave'
                ? ''
                : ` No se ha podido escuchar la grabación: ${e?.message || 'ha fallado'}`;
            }
          }

          // Las fotos se encogen aquí, en el móvil: lo que sube por la
          // línea de la obra son unos cientos de kilobytes y no ocho
          // megas, y en la API se paga por lo que ocupa cada una.
          const conFoto = vivas.slice(0, TOPE_FOTOS);
          rotulo.textContent = 'PREPARANDO LAS FOTOS…';
          const fotos = [];
          for (const f of conFoto) {
            aviso.textContent = `Preparando la foto ${fotos.length + 1} de ${conFoto.length}…`;
            try {
              fotos.push({ id: f.marca.id, b64: await paraMirar(f.marca.blob) });
            } catch { /* si una foto no se deja leer, se manda sin ella */ }
          }

          rotulo.textContent = 'REDACTANDO…';
          aviso.textContent = 'Puede tardar medio minuto. No cierres la pantalla.';
          const r = await api.claudeRedactar(
            campo.value.trim(),
            vivas.map((f) => ({ id: f.marca.id, ms: f.marca.ms })),
            OFICIOS.map((o) => ({ id: o.id, nombre: o.nombre })),
            fotos,
            ZONAS,
          );

          const porId = new Map(vivas.map((f) => [String(f.marca.id), f]));
          let dichas = 0;
          let vistas = 0;
          for (const ficha of r.fichas || []) {
            const f = porId.get(String(ficha.id));
            if (!f) continue;
            const texto = String(ficha.texto || '').trim();
            f.confianza = ficha.confianza || null;
            if (!texto) continue;
            f.texto = texto;
            // Lo redactado cuenta como decidido: el contagio de gremios
            // no debe pisarlo después.
            if (ficha.oficio && OFICIOS.some((o) => o.id === ficha.oficio)) {
              f.oficio = ficha.oficio;
              f.tocado = true;
            }
            // La estancia solo se acepta si está en la lista cerrada:
            // un «baño de arriba» inventado rompería el filtro, que es
            // justo para lo que existe el campo.
            if (ficha.zona && ZONAS.includes(ficha.zona)) {
              f.zona = ficha.zona;
              f.zonaTocada = true;
            }
            if (ficha.origen === 'foto') vistas += 1; else dichas += 1;
          }
          pintarFichas();
          aviso.className = 'hint';
          aviso.textContent = resumen(dichas, vistas, vivas.length, vivas.length - conFoto.length) + nota;
          rotulo.textContent = 'VOLVER A REDACTAR';
          boton.disabled = false;
        } catch (e) {
          aviso.className = 'hint err';
          aviso.textContent = e?.status === 404
            ? 'El servidor todavía no tiene esta parte instalada.'
            : (e?.message || 'No se ha podido redactar.');
          rotulo.textContent = 'REDACTAR LAS TAREAS';
          boton.disabled = false;
        }
      });

      return h('div.rec-dictado', null,
        h('p.d-epigrafe', { style: { margin: '0 0 4px' } }, 'Que las escriba solas'),
        h('p.sub', { style: { marginTop: '4px' } },
          'Se escucha lo que dijiste, se miran las fotos y sale una tarea de cada '
          + 'una con su gremio. Un solo toque. Si prefieres escribirlo tú, hazlo '
          + 'abajo: lo tuyo manda sobre la grabación y sobre lo que se vea.'),
        h('div', { style: { marginTop: '10px' } }, campo),
        aviso,
        boton,
      );
    };

    /**
     * El cierre del diseño: cuando la última tarjeta queda guardada o
     * eliminada, se crean de una vez las guardadas —una lista nueva
     * con todas dentro— y sale el modal de enhorabuena. Guardar
     * tarjeta a tarjeta y crear al final no es contradictorio: si te
     * vas a medias, el recorrido sigue en el móvil, entero.
     */
    const comprobarCierre = async () => {
      if (fichas.some((f) => !f.fuera && !f.guardada)) return;
      const buenas = fichas.filter((f) => f.guardada);
      if (!buenas.length) {
        await store.borrarRecorrido(rec.id);
        toast('Recorrido descartado');
        ir(volver);
        return;
      }
      toast('Creando las tareas…');
      const lista = await store.crearLista({ unidadId, promoId, fase: FASE_UNICA });
      for (const f of buenas) {
        const t = await store.crearTarea({
          listaId: lista.id, texto: f.texto.trim(), oficio: f.oficio, zona: f.zona,
        });
        if (!f.sinFoto) {
          await store.añadirMedio(t.id, {
            tipo: 'imagen', blob: f.marca.blob, mime: 'image/jpeg',
            ancho: f.marca.ancho, alto: f.marca.alto,
          });
        }
      }
      await store.marcarRecorridoUsado(rec.id, lista.id);
      const yo = store.sesion();
      await hojaBienHecho({
        titulo: `Excelente${nombreCorto(yo) ? ', ' + nombreCorto(yo) : ''}`,
        frase: 'Validación completa. Que empiecen los remates.',
        usuario: yo,
        boton: `Volver a ${u.nombre}`,
      });
      await refrescar();
      ir(volver);
    };

    pintarFichas();

    // La flecha de volver deja de navegar a propósito: irse por ahí
    // dejaría el recorrido a medias sin decirlo. El recorrido sigue en
    // el móvil, así que cerrar la app por accidente no pierde nada.
    //
    // Se cambia con ponerVuelta() y no colgándole un onclick nuevo
    // encima: el de antes está puesto con addEventListener y seguiría
    // disparando también, así que la flecha avisaría Y se iría igual.
    cab.ponerTitulo(`Nueva lista - ${u.nombre}`);
    cab.ponerVuelta(() => toast('Guarda o elimina cada tarea para terminar. Lo grabado no se pierde.'));

    lienzo.replaceChildren(
      h('div.rec-resumen', null,
        h('p.d-epigrafe', { style: { margin: '0 0 8px' } },
          `${grabadora.reloj(rec.duracion)} y ${rec.marcas.length} ${rec.marcas.length === 1 ? 'marca' : 'marcas'}`),
        audio || avisoSinAudio,
      ),
      dictado(),
      listado,
    );
  };

  pintarPreparado();

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
