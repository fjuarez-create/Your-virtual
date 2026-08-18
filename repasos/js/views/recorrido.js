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
  cabeceraDentro, cerrarVuelta, hojaOficios, hojaZonas, hojaBienHecho, ctaAccion, ctaCancelar,
  menuFlotante, filaMenu,
} from '../piezas.js';
import { alCerrarRecorrido } from '../frases.js';
import { paraMirar } from '../media.js';
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

  // La cabecera se guarda en vez de montarse dentro del `return`: al
  // pasar a validar hay que apagarle la flecha de volver, y para eso
  // hace falta poder alcanzarla desde aquí.
  const cabecera = cabeceraDentro(u.nombre.toUpperCase(), { volverA: volver, sub: 'Recorrido' });

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

    const audio = h('audio', { controls: true, preload: 'metadata', style: { width: '100%' } });
    audio.src = URL.createObjectURL(rec.audio);

    const listado = h('div.stack', { style: { gap: '10px' } });
    const guardar = ctaAccion('CREAR LAS TAREAS', { icono: 'check' });
    const pista = h('p.hint');

    const validar = () => {
      const vivas = fichas.filter((f) => !f.fuera);
      const listas = vivas.filter((f) => f.texto.trim() && f.oficio);
      guardar.disabled = !listas.length || listas.length !== vivas.length;
      guardar.querySelector('.grow').textContent = listas.length === vivas.length && vivas.length
        ? `CREAR ${vivas.length} ${vivas.length === 1 ? 'TAREA' : 'TAREAS'}`
        : 'CREAR LAS TAREAS';
      const faltan = vivas.length - listas.length;
      pista.textContent = !vivas.length
        ? 'No queda ninguna marca. Descarta el recorrido o vuelve a grabar.'
        : !faltan
          ? ''
          : `Falta escribir ${faltan} ${faltan === 1 ? 'marca' : 'marcas'} de ${vivas.length}.`;
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
      const vivas = fichas.filter((f) => !f.fuera);
      listado.replaceChildren(...vivas.map((f) => ficha(f)));
      // El alto solo se puede medir con la caja ya puesta en la página.
      for (const f of vivas) if (f.texto) f.crecer?.();
      validar();
    };

    const ficha = (f) => {
      const url = URL.createObjectURL(f.marca.blob);
      const texto = h('textarea.textarea', {
        rows: 2, placeholder: 'Qué hay que hacer aquí…', autocapitalize: 'sentences',
      });
      texto.value = f.texto;
      // Crece con lo que se escribe en vez de dejar una barra de scroll
      // de tres líneas dentro de una caja de tres líneas.
      const crecer = () => {
        texto.style.height = 'auto';
        texto.style.height = texto.scrollHeight + 'px';
      };
      texto.addEventListener('input', () => { f.texto = texto.value; crecer(); validar(); });
      f.crecer = crecer;

      // Los gremios de siempre, a un toque. Con quince marcas, abrir
      // quince veces el desplegable es lo que hace que esto dé pereza;
      // los cinco que de verdad se usan en esta obra caben aquí.
      const gremios = h('div.chips.filtro.envuelve.rec-gremios');
      const poner = (elegido, propio = true) => {
        f.oficio = elegido;
        if (propio) { f.tocado = true; ultimo = elegido; contagiar(f, elegido); }
        pintarGremio();
        validar();
      };
      const pintarGremio = () => {
        // El elegido va delante aunque no esté entre los habituales:
        // si se ha buscado en la lista larga, tiene que verse puesto.
        const lista = sugeridos.includes(f.oficio) ? sugeridos : [f.oficio, ...sugeridos];
        gremios.replaceChildren(
          ...lista.map((id) => h('button.chip.accent', {
            'aria-pressed': f.oficio === id ? 'true' : 'false',
            onclick: () => poner(id),
          }, oficio(id).corto)),
          h('button.chip.quitar', {
            onclick: async () => {
              const elegido = await hojaOficios(f.oficio || ultimo);
              if (elegido) poner(elegido);
            },
          }, 'Otro…'),
        );
      };
      f.pintarGremio = pintarGremio;
      pintarGremio();

      // Un solo botón y no los diecinueve: con quince marcas delante,
      // diecinueve estancias por ficha son casi trescientos botones en
      // la pantalla y no se encuentra nada. El que hay dice dónde está
      // puesta, y abre la lista completa al tocarlo.
      //
      // Con la misma pinta que el minuto que tiene al lado, no con la de
      // los chips de gremio: las dos cosas de la cabecera son etiquetas
      // pequeñas, y el gremio se elige abajo entre varios.
      const zonaChip = h('button.tag');
      const pintarZona = () => {
        zonaChip.className = f.zona ? 'tag accent' : 'tag';
        zonaChip.style.opacity = f.zona ? '' : '.6';
        zonaChip.textContent = f.zona || 'Estancia…';
      };
      zonaChip.addEventListener('click', async () => {
        const elegida = await hojaZonas(f.zona);
        if (elegida === null) return;
        f.zona = elegida;
        f.zonaTocada = true;
        ultimaZona = elegida;
        pintarZona();
        contagiarZona(f, elegida);
      });
      f.pintarZona = pintarZona;
      pintarZona();

      return h('div.rec-ficha', { class: f.confianza === 'baja' ? 'dudosa' : '' },
        h('div.rec-ficha-cab', null,
          h('div.rec-foto', {
            style: { backgroundImage: `url("${url}")` },
            role: 'button', 'aria-label': 'Ver la foto',
            onclick: () => openViewer(h('img', { src: url, alt: '' })),
          }),
          // El minuto y la estancia en la misma línea, encima del texto:
          // es lo que dice el diseño —foto, estancia, gremio,
          // descripción— y es el orden en que se lee una ficha, de lo
          // que la sitúa a lo que la explica.
          h('div.grow', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' } },
            h('button.tag', {
              onclick: () => { audio.currentTime = Math.max(0, f.marca.ms / 1000 - 8); audio.play(); },
            }, icon('play', 12), grabadora.reloj(f.marca.ms / 1000)),
            zonaChip,
          ),
          h('button.icon-btn', {
            'aria-label': 'Descartar esta marca',
            style: { width: '38px', height: '38px', flex: '0 0 38px' },
            onclick: () => { f.fuera = true; pintarFichas(); },
          }, icon('trash', 16)),
        ),
        texto,
        gremios,
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

      const campo = h('textarea.textarea', {
        rows: 3, autocapitalize: 'sentences',
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
      const boton = ctaAccion('REDACTAR LAS TAREAS', { icono: 'check', claro: true });
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
          if (!campo.value.trim() && rec.audio) {
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
        h('p.eyebrow', null, 'Que las escriba solas'),
        h('p.sub', { style: { marginTop: '4px' } },
          'Se escucha lo que dijiste, se miran las fotos y sale una tarea de cada '
          + 'una con su gremio. Un solo toque. Si prefieres escribirlo tú, hazlo '
          + 'abajo: lo tuyo manda sobre la grabación y sobre lo que se vea.'),
        h('div', { style: { marginTop: '10px' } }, campo),
        aviso,
        boton,
      );
    };

    guardar.addEventListener('click', async () => {
      const vivas = fichas.filter((f) => !f.fuera && f.texto.trim() && f.oficio);
      if (!vivas.length) return;
      guardar.disabled = true;
      toast('Creando las tareas…');
      const lista = await store.crearLista({ unidadId, promoId, fase: FASE_UNICA });
      for (const f of vivas) {
        const t = await store.crearTarea({
          listaId: lista.id, texto: f.texto.trim(), oficio: f.oficio, zona: f.zona,
        });
        await store.añadirMedio(t.id, {
          tipo: 'imagen', blob: f.marca.blob, mime: 'image/jpeg',
          ancho: f.marca.ancho, alto: f.marca.alto,
        });
      }
      await store.marcarRecorridoUsado(rec.id, lista.id);
      await hojaBienHecho({
        titulo: `${vivas.length} ${vivas.length === 1 ? 'tarea creada' : 'tareas creadas'}`,
        frase: alCerrarRecorrido(vivas.length),
        usuario: store.sesion(),
        boton: 'Ver la lista',
      });
      await refrescar();
      ir('#/l/' + lista.id);
    });

    pintarFichas();

    // De aquí se sale creando las tareas o descartándolas. La flecha de
    // volver se apaga a propósito: irse por ahí deja el recorrido a
    // medias sin decirlo, y lo que se ve en la pantalla —quince fichas
    // ya escritas— parece guardado y no lo está. El recorrido sigue en
    // el móvil, así que cerrar la app por accidente no pierde nada.
    cerrarVuelta(cabecera, 'Crea las tareas o descarta el recorrido');

    lienzo.replaceChildren(
      h('div.rec-resumen', null,
        h('p.eyebrow', null, `Nueva lista · ${u.nombre}`),
        h('p.sub', { style: { marginTop: '4px' } },
          `${grabadora.reloj(rec.duracion)} y ${rec.marcas.length} ${rec.marcas.length === 1 ? 'marca' : 'marcas'}. Escribe qué hay que hacer en cada una; el gremio va propuesto y se cambia de un toque. Lo que no valga, lo tiras.`),
        h('div', { style: { marginTop: '12px' } }, audio),
      ),
      dictado(),
      listado,
      pista,
      guardar,
      ctaCancelar(async () => {
        await store.borrarRecorrido(rec.id);
        ir(volver);
      }),
    );
  };

  pintarPreparado();

  return {
    sinTabs: true,
    clase: 'pantalla-recorrido',
    contenido: [
      ...cabecera,
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
      const m = mando;
      mando = null;
      if (!m) return;
      m.cancelar()
        .then((cap) => (cap?.marcas.length ? store.guardarRecorrido(paquete(cap)) : null))
        .catch(() => { /* la cámara ya está suelta, que es lo urgente */ });
    },
  };
}
