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
import { promocion, unidad, FASE_UNICA, OFICIO_POR_DEFECTO, OFICIOS, oficio, puedeCrearLista } from '../catalog.js';
import * as store from '../store.js';
import * as api from '../api.js';
import * as grabadora from '../recorrido.js';
import { cabeceraDentro, hojaOficios, ctaAccion, ctaCancelar } from '../piezas.js';
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

  /* ─── 1. Preparado ─── */
  const pintarPreparado = () => {
    lienzo.replaceChildren(
      pendiente ? h('div.rec-pendiente', null,
        h('p.eyebrow', null, 'Recorrido a medias'),
        h('p.sub', { style: { marginTop: '4px' } },
          `${grabadora.reloj(pendiente.duracion)} y ${pendiente.marcas.length} `
          + `${pendiente.marcas.length === 1 ? 'marca' : 'marcas'} del ${fechaCorta(pendiente.creado)}, `
          + 'grabado pero sin convertir en tareas.'),
        h('div.rec-pendiente-pies', null,
          h('button.btn.ink', { onclick: () => pintarRepaso(pendiente) }, 'Repasarlo'),
          h('button.btn.ghost', {
            onclick: async () => {
              await store.borrarRecorrido(pendiente.id);
              pendiente = null;
              pintarPreparado();
              toast('Recorrido descartado');
            },
          }, 'Descartarlo'),
        ),
      ) : null,
      h('div.rec-intro', null,
        h('div.rec-ico', null, icon('camera', 30)),
        h('h2.title', null, 'Recorre la vivienda'),
        h('p.sub', null,
          'La cámara se ve pero no se graba: solo se guarda lo que dices. '
          + 'Ve andando y comentando, y cada vez que veas algo, toca la pantalla: '
          + 'se queda la foto de ese instante.'),
        h('p.hint', { style: { marginTop: '10px' } },
          `Di la estancia y el gremio en voz alta —«en el baño de arriba, la junta del alicatado»— y las tareas saldrán solas. Máximo ${grabadora.TOPE_SEGUNDOS / 60} minutos.`),
      ),
      ctaAccion('EMPEZAR EL RECORRIDO', { icono: 'camera', onclick: arrancar }),
      h('button.btn.ghost.full', { onclick: actaSuelta }, 'Abrir el acta sin recorrido'),
    );
  };

  /* ─── 2. Grabando ─── */
  const arrancar = async () => {
    if (!grabadora.sePuede()) {
      toast('Este navegador no puede grabar. Abre el acta y añade las tareas a mano.', 'err');
      return;
    }
    const crono = h('span.rec-crono.mono-num', null, '0:00');
    const cuenta = h('span.rec-cuenta', null, '0');
    const tira = h('div.rec-tira');
    const visor = h('div.rec-visor');
    const destello = h('div.rec-destello');

    try {
      mando = await grabadora.empezar({
        alAvisar: ({ segundos, marcas }) => {
          crono.textContent = grabadora.reloj(segundos);
          cuenta.textContent = String(marcas);
        },
        alTope: () => toast('Diez minutos: se corta aquí'),
      });
    } catch (e) {
      toast(e?.name === 'NotAllowedError'
        ? 'Hay que dar permiso de cámara y micrófono'
        : 'No se ha podido abrir la cámara', 'err');
      return;
    }

    mando.video.className = 'rec-video';
    visor.append(mando.video, destello);

    // Toda la imagen es el botón de marcar: en obra, con guantes, no se
    // acierta a un botón pequeño mientras andas.
    visor.addEventListener('click', async () => {
      const marca = await mando.marcar();
      if (!marca) return;
      destello.classList.remove('on');
      void destello.offsetWidth;
      destello.classList.add('on');
      if (navigator.vibrate) navigator.vibrate(18);
      const mini = h('div.rec-mini', {
        style: { backgroundImage: `url("${URL.createObjectURL(marca.blob)}")` },
      });
      tira.prepend(mini);
      tira.scrollLeft = 0;
    });

    lienzo.replaceChildren(
      visor,
      h('div.rec-barra', null,
        h('div.rec-estado', null, h('span.rec-punto'), crono),
        h('div.grow', null, tira),
        h('div.rec-marcas', null, icon('camera', 15), cuenta),
      ),
      h('div.rec-botones', null,
        h('button.rec-parar', { onclick: () => terminar() }, h('span.rec-cuadro')),
      ),
      h('p.hint.center', { style: { marginTop: '2px' } }, 'Toca la imagen cuando veas algo'),
    );
    // Mientras se graba, el titular sobra: se sujeta el móvil en alto y
    // lo único que importa es ver bien lo que enfoca la cámara.
    lienzo.classList.add('grabando');
    lienzo.closest('.screen')?.classList.add('grabando');

    // Si el móvil se bloquea o alguien llama, Safari corta el micrófono
    // sin avisar y lo que sigue grabándose es silencio. Antes que seguir
    // fingiendo que se graba, se cierra el recorrido con lo que haya: al
    // volver a la pantalla está el repaso esperando.
    document.addEventListener('visibilitychange', alTapar);
  };

  const alTapar = () => {
    if (document.visibilityState === 'hidden' && mando) terminar();
  };

  const terminar = async () => {
    document.removeEventListener('visibilitychange', alTapar);
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
    const fichas = rec.marcas.map((m) => ({
      marca: m, texto: '', oficio: ultimo, tocado: false, fuera: false, confianza: null,
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

      return h('div.rec-ficha', { class: f.confianza === 'baja' ? 'dudosa' : '' },
        h('div.rec-ficha-cab', null,
          h('div.rec-foto', {
            style: { backgroundImage: `url("${url}")` },
            role: 'button', 'aria-label': 'Ver la foto',
            onclick: () => openViewer(h('img', { src: url, alt: '' })),
          }),
          h('div.grow', null,
            h('button.tag', {
              onclick: () => { audio.currentTime = Math.max(0, f.marca.ms / 1000 - 8); audio.play(); },
            }, icon('play', 12), grabadora.reloj(f.marca.ms / 1000)),
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
        const t = await store.crearTarea({ listaId: lista.id, texto: f.texto.trim(), oficio: f.oficio });
        await store.añadirMedio(t.id, {
          tipo: 'imagen', blob: f.marca.blob, mime: 'image/jpeg',
          ancho: f.marca.ancho, alto: f.marca.alto,
        });
      }
      await store.marcarRecorridoUsado(rec.id, lista.id);
      toast(`${vivas.length} ${vivas.length === 1 ? 'tarea creada' : 'tareas creadas'}`);
      await refrescar();
      ir('#/l/' + lista.id);
    });

    pintarFichas();

    lienzo.replaceChildren(
      h('div.rec-resumen', null,
        h('p.eyebrow', null, `Recorrido de ${grabadora.reloj(rec.duracion)}`),
        h('p.sub', { style: { marginTop: '4px' } },
          `${rec.marcas.length} ${rec.marcas.length === 1 ? 'marca' : 'marcas'}. Escribe qué hay que hacer en cada una; el gremio va propuesto y se cambia de un toque. Lo que no valga, lo tiras.`),
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
      ...cabeceraDentro(u.nombre.toUpperCase(), { volverA: volver, sub: 'Recorrido' }),
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
      const m = mando;
      mando = null;
      if (!m) return;
      m.cancelar()
        .then((cap) => (cap?.marcas.length ? store.guardarRecorrido(paquete(cap)) : null))
        .catch(() => { /* la cámara ya está suelta, que es lo urgente */ });
    },
  };
}
