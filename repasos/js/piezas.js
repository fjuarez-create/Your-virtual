/* ═══════════════════════════════════════════════════════════════
   piezas.js — componentes compartidos entre pantallas: cabecera con
   botón de volver, cinta de sincronización y fila de lista de repaso.
   ═══════════════════════════════════════════════════════════════ */
import {
  h, icon, sheet, toast, confirmSheet, avatar, grupoAvatares, anillo,
  logoUnik, fechaCorta, fechaRelativa, hora,
} from './ui.js';
import * as media from './media.js';
import * as store from './store.js';
import * as api from './api.js';
import { unidad, oficio, estado, rebotada, ESTADOS, OFICIOS, ZONAS } from './catalog.js';
import { ir, conFiltros } from './app.js';

/* Medidas de la cabecera, en un sitio para que las dos —la de las
   raíces y la de dentro— no se puedan separar nunca. */
const ALTO_LOGO = 14.4;    // 16 − 10 %
const TAM_CUENTA = 41;     // 55 − 25 %

/**
 * Cabecera de las cuatro pantallas con bolitas: el logotipo a la
 * izquierda, la cuenta a la derecha y debajo el titular a todo lo ancho.
 *
 * Aquí NO hay flecha de volver, y es a propósito: son las cuatro raíces
 * de la app, no hay un atrás al que ir. La flecha aparece solo al entrar
 * en un acta o en una tarea, y allí ocupa el sitio del logotipo.
 */
export function cabeceraTab(titulo) {
  return [
    h('div.topbar', null,
      h('div.grow', null, logoUnik({ alto: ALTO_LOGO })),
      avatar(store.sesion(), { tam: TAM_CUENTA, onclick: () => ir('#/ajustes') }),
    ),
    // Las tres raíces comparten cuerpo y arrancan alineadas con el
    // logotipo: no se estiran para llenar el ancho.
    ajustarTitulo(h('h1.titulo-pantalla.titulo-raiz', null, titulo),
      { hermanos: TITULOS_RAIZ, optico: true, escala: 0.85 }),
  ];
}

/**
 * Cabecera de dentro: la flecha de volver donde en las pantallas raíz va
 * el logotipo, y el titular igual de grande, para que se note que sigues
 * en la misma app y solo has bajado un nivel.
 */
export function cabeceraDentro(titulo, { volverA, sub, acciones = [] } = {}) {
  return [
    h('div.topbar', null,
      h('button.icon-btn', {
        'aria-label': 'Volver',
        onclick: () => (volverA ? ir(volverA) : history.back()),
      }, icon('arrowLeft')),
      h('div.grow', null, sub ? h('p.eyebrow', null, sub) : null),
      ...acciones,
      avatar(store.sesion(), { tam: TAM_CUENTA, onclick: () => ir('#/ajustes') }),
    ),
    ajustarTitulo(h('h1.titulo-pantalla', null, titulo)),
  ];
}

/**
 * Cierra la puerta de atrás de una cabecera ya montada: la flecha y los
 * botones de acción se quedan a la vista pero apagados.
 *
 * Lo usa la pantalla de validar un recorrido, de la que se sale creando
 * las tareas o descartándolas y no por la flecha. Se apagan y no se
 * esconden porque un hueco donde siempre hay una flecha se lee como un
 * fallo de la app; una flecha gris se lee como «por aquí no».
 *
 * Vive aquí, con la cabecera, para que quien la cambie vea también a
 * quién le está tocando el botón.
 */
export function cerrarVuelta(cabecera, motivo) {
  for (const b of cabecera[0].querySelectorAll('.icon-btn')) {
    b.disabled = true;
    b.style.opacity = '.35';
    b.style.pointerEvents = 'none';
    if (motivo) b.title = motivo;
  }
}

/**
 * Los titulares de las tres pantallas raíz. El cuerpo de las tres lo
 * marca el más ancho de esta lista, así que salen exactamente del mismo
 * tamaño y el más largo sigue cabiendo justo, sea cual sea el ancho del
 * móvil. La lista se mide, no se supone cuál es el más largo: con esta
 * tipografía «VIVIENDAS» y «AJUSTES» no ocupan lo que uno diría.
 *
 * El titular de la portada es el nombre de la promoción, que puede
 * cambiar; por eso el propio texto entra siempre en la medida aunque no
 * esté aquí. Si algún día una promoción se llamara más largo que
 * «VIVIENDAS», esa pantalla saldría con el cuerpo algo menor en lugar
 * de salirse, que es la manera correcta de fallar.
 */
const TITULOS_RAIZ = ['BRASSIE', 'VIVIENDAS', 'AJUSTES'];

/**
 * Ajusta el cuerpo del titular. Se mide una vez con canvas en lugar de
 * probar tamaños en el DOM: una sola medición y ninguna relectura de
 * estilos, que es lo que evita el parpadeo al entrar en la pantalla.
 *
 * `hermanos` fija el cuerpo midiendo también OTRAS palabras además de
 * la propia —las tres raíces se pasan la lista entera para compartir
 * tamaño—. Sin ellos, cada título se estira hasta llenar el ancho, que
 * es lo que interesa dentro de una vivienda o de un acta, donde los
 * nombres son de largos muy distintos.
 *
 * `escala` deja el cuerpo por debajo de lo que cabría: las tres raíces
 * no llenan el ancho a propósito.
 *
 * `optico` corrige el desajuste que da el TOC: una tipografía deja
 * siempre un hueco entre el borde de la caja del texto y donde empieza
 * de verdad la tinta —el «espaciado lateral» del glifo—, y ese hueco no
 * es igual en una B que en una V. Alineando la caja, la letra queda
 * metida hacia dentro respecto al logotipo de la cabecera. Aquí se mide
 * dónde empieza la tinta de verdad y se corre el titular esos pocos
 * píxeles a la izquierda, de modo que lo que queda alineado es la letra
 * y no su caja, que es lo que ve el ojo.
 */
function ajustarTitulo(nodo, { hermanos = null, optico = false, escala = 1 } = {}) {
  const medir = () => {
    // El ancho del PROPIO titular, no el de su contenedor: clientWidth
    // de un contenedor incluye su relleno, y medir contra él hacía los
    // títulos 40 px más anchos de lo que cabe, así que se salían.
    const ancho = nodo.clientWidth || 0;
    if (!ancho) return;
    const lienzo = ajustarTitulo.lienzo ||= document.createElement('canvas').getContext('2d');
    const REF = 100;
    const familia = getComputedStyle(nodo).fontFamily;
    lienzo.font = `200 ${REF}px ${familia}`;
    // El propio texto entra siempre: así ninguno se sale, aunque no
    // estuviera en la lista de hermanos.
    const suyo = Math.max(...[...(hermanos || []), nodo.textContent]
      .map((t) => lienzo.measureText(t).width));
    if (suyo <= 0) return;
    // Con tope por arriba y por abajo: una palabra corta no debe salir
    // gigante ni un nombre largo quedar ilegible por caber a la fuerza.
    const cuerpo = Math.min(150, Math.max(26, Math.floor((REF * ancho * escala) / suyo)));
    nodo.style.fontSize = cuerpo + 'px';
    // Si aun al mínimo no cabe, se deja partir en dos líneas.
    nodo.style.whiteSpace = (REF * ancho) / suyo < 26 ? 'normal' : 'nowrap';

    if (!optico) return;
    lienzo.font = `200 ${cuerpo}px ${familia}`;
    const m = lienzo.measureText(nodo.textContent);
    // Cuánto se mete la tinta desde el borde izquierdo de la caja.
    // `actualBoundingBoxLeft` va al revés de lo que parece: es positivo
    // cuando la tinta se sale por la izquierda del origen, así que el
    // hueco que buscamos es su negativo.
    const holgura = -(m.actualBoundingBoxLeft ?? 0);
    // Se corre con margen y no con transform: los hijos de .screen
    // llevan la animación de entrada, que acaba en `transform: none` con
    // fill-mode «both», y una animación pisa siempre al estilo en línea.
    // El margen negativo saca la caja esos píxeles a la izquierda y la
    // tinta cae justo bajo la U del logotipo.
    nodo.style.marginLeft = Math.abs(holgura) > 0.5 ? `${(-holgura).toFixed(2)}px` : '';
  };
  requestAnimationFrame(medir);
  // La medida se hace con la tipografía ya cargada: si se midiera con
  // la de reserva, el titular saldría con el cuerpo equivocado.
  document.fonts?.ready.then(medir);
  return nodo;
}

/** Cabecera con flecha de volver, título, subtítulo y acciones. */
export function cabecera(titulo, sub, { volverA, acciones = [] } = {}) {
  return h('div.topbar', null,
    volverA && h('button.icon-btn', {
      'aria-label': 'Volver',
      onclick: () => ir(volverA),
    }, icon('arrowLeft')),
    h('div.grow', null,
      h('h1', null, titulo),
      sub && h('div.sub', null, sub),
    ),
    ...acciones,
  );
}

/** Cinta de estado: conexión y cambios pendientes de subir. */
export function barraSync() {
  const led = h('span.led');
  const texto = h('span.grow');
  const boton = h('button', {
    'aria-label': 'Sincronizar ahora',
    style: { display: 'flex', color: 'inherit' },
    onclick: () => store.sincronizar({ forzar: true }),
  }, icon('refresh', 16));
  const barra = h('div.syncbar', null, led, texto, boton);

  const pintar = (e) => {
    barra.className = 'syncbar ' + (
      !e.online ? 'offline' : e.pendientes > 0 || e.sincronizando ? 'pending' : 'online'
    );
    if (!e.online) {
      texto.textContent = e.pendientes
        ? `Sin conexión · ${e.pendientes} ${e.pendientes === 1 ? 'cambio' : 'cambios'} en espera`
        : 'Sin conexión · se guarda en el dispositivo';
    } else if (e.sincronizando) {
      texto.textContent = 'Sincronizando…';
    } else if (e.error === 'sesion') {
      texto.textContent = 'Sesión caducada · vuelve a entrar';
    } else if (e.error) {
      texto.textContent = `No se pudo sincronizar · ${e.pendientes} en espera`;
    } else if (e.pendientes > 0) {
      texto.textContent = `Subiendo ${e.pendientes} ${e.pendientes === 1 ? 'cambio' : 'cambios'}…`;
    } else {
      texto.textContent = e.ultimo ? `Todo sincronizado · ${hora(e.ultimo)}` : 'Todo sincronizado';
    }
    boton.style.display = e.online && !e.sincronizando ? 'flex' : 'none';
  };

  // Cuando todo está bien la cinta no se enseña: en Ajustes está el
  // detalle y aquí sobra. Aparece sola si no hay cobertura o si queda
  // algo por subir, que es cuando de verdad hay que enterarse.
  const original = pintar;
  const pintarSiHaceFalta = (e) => {
    const hayQueContarlo = !e.online || e.pendientes > 0 || e.sincronizando || !!e.error;
    barra.style.display = hayQueContarlo ? '' : 'none';
    if (hayQueContarlo) original(e);
  };
  pintarSiHaceFalta(store.estadoSync);
  const quitar = store.alCambiarSync(pintarSiHaceFalta);
  // Cuando la cinta sale del documento deja de escuchar.
  new MutationObserver((_, obs) => {
    if (!barra.isConnected) { quitar(); obs.disconnect(); }
  }).observe(document.getElementById('app'), { childList: true, subtree: true });

  return barra;
}

/** Aviso de modo local, para que nadie crea que sus repasos viajan. */
export function avisoLocal() {
  if (api.HAY_SERVIDOR && !store.sesion()?.local) return null;
  return h('div.syncbar', null,
    h('span.led'),
    h('span.grow', null, 'Modo local · los datos no salen de este dispositivo'),
  );
}

/** Fila de una lista de repaso. `conteo` = { total, pendientes }. */
export function filaLista(lista, conteo, { mostrarVivienda = false } = {}) {
  const u = unidad(lista.unidadId);
  const titulo = mostrarVivienda
    ? `${u?.nombre || lista.unidadId} · ${fechaCorta(lista.creado)}`
    : `Inspección ${fechaCorta(lista.creado)}`;

  const partes = [lista.creadoPorNombre];
  if (conteo) {
    partes.push(conteo.total === 0
      ? 'sin tareas'
      : conteo.pendientes > 0
        ? `${conteo.pendientes} de ${conteo.total} pendientes`
        : `${conteo.total} ${conteo.total === 1 ? 'tarea resuelta' : 'tareas resueltas'}`);
  }

  return h('button.row', { onclick: () => ir('#/l/' + lista.id) },
    h('div.row-lead', {
      style: conteo && conteo.pendientes > 0
        ? { background: 'var(--accent)', color: 'var(--on-accent)' }
        : { background: 'var(--bg)' },
    }, conteo ? String(conteo.pendientes || conteo.total) : icon('clipboard', 18)),
    h('div.grow', null,
      h('div.row-title', null, titulo),
      h('div.row-sub', null, partes.join(' · ')),
    ),
    lista.cerrada ? h('span.tag.ok', null, 'Cerrada') : null,
    chevron(),
  );
}

/**
 * Foto de perfil: ponerla, cambiarla o quitarla. Quien administra puede
 * hacerlo sobre cualquiera; el resto, solo sobre sí mismo (y el servidor
 * lo comprueba igualmente).
 */
export function hojaFoto(u) {
  return sheet((cerrar) => {
    const previa = avatar(u, { tam: 92 });

    const poner = async (origen) => {
      const ficheros = origen === 'camara' ? await media.hacerFoto() : await media.elegirFotos();
      if (!ficheros.length) return;
      toast('Preparando la foto…');
      try {
        const blob = await media.prepararAvatar(ficheros[0]);
        await api.subirAvatar(u.id, blob);
        cerrar('puesta');
        toast('Foto actualizada');
      } catch (e) {
        toast(e.status === 403 ? 'No puedes cambiar esta foto' : 'No se pudo subir la foto', 'err');
      }
    };

    return [
      h('h2.title', null, u.nombre),
      h('div', { style: { display: 'flex', justifyContent: 'center', padding: '8px 0 4px' } }, previa),
      h('div.stack', null,
        h('button.row', { onclick: () => poner('camara') },
          h('div.row-lead', null, icon('camera', 18)),
          h('div.grow', null, h('div.row-title', null, 'Hacer una foto')),
        ),
        h('button.row', { onclick: () => poner('galeria') },
          h('div.row-lead', null, icon('image', 18)),
          h('div.grow', null, h('div.row-title', null, 'Elegir de la galería')),
        ),
        u.avatar ? h('button.row.danger', {
          onclick: async () => {
            if (!await confirmSheet({ title: '¿Quitar la foto?', text: 'Volverán a verse las iniciales.', ok: 'Quitar', danger: true })) return;
            try {
              await api.borrarAvatar(u.id);
              cerrar('quitada');
              toast('Foto quitada');
            } catch { toast('No se pudo quitar', 'err'); }
          },
        },
          h('div.row-lead', null, icon('trash', 18)),
          h('div.grow', null, h('div.row-title', null, 'Quitar la foto')),
        ) : null,
      ),
      h('p.hint', null, 'Se recorta cuadrada y se reduce a 512 px antes de subirla.'),
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cerrar'),
    ];
  });
}

/**
 * Tarjeta de un acta. La misma en la portada, en la pestaña de ACTAS y
 * al pie de cada vivienda: quién ha participado, de qué acta se trata,
 * cuándo se hizo y cuánto lleva verificado. Se toca aquí y cambia en
 * los tres sitios.
 *
 * Lo único que depende de dónde se enseñe es el título cuando el acta
 * no tiene nombre puesto. En la lista general hace falta decir de qué
 * vivienda es; dentro de esa misma vivienda eso ya se sabe, y lo que
 * distingue un acta de otra es su fecha. De ahí `dentroDeVivienda`.
 */
export function tarjetaActa({ lista, conteo, gente }, { dentroDeVivienda = false, filtros = null } = {}) {
  const u = unidad(lista.unidadId);
  // «Acta Villa 26» y no «Villa 26»: si el acta se llamara igual que la
  // vivienda, en un listado no habría manera de saber qué se está
  // abriendo. Dentro de la vivienda eso ya se sabe, y lo que distingue
  // un acta de otra es su fecha.
  const porDefecto = dentroDeVivienda
    ? `Acta de ${fechaCorta(lista.creado)}`
    : `Acta ${u?.nombre || lista.unidadId}`;
  const titulo = lista.nombre || porDefecto;

  return h('button.acta', { onclick: () => ir(conFiltros('#/l/' + lista.id, filtros || {})) },
    grupoAvatares(gente.map((g) => store.persona(g.id, g.nombre)), { tam: 55 }),
    h('div.grow', null,
      h('div.acta-tit', null, titulo),
      h('div.acta-pie', null,
        h('span', null, fechaRelativa(lista.creado)),
      ),
    ),
    anillo(store.avance(conteo), { tam: 46 }),
  );
}

/**
 * Chips de estado. Los mismos en las cuatro pantallas que filtran, y
 * con las mismas palabras: el valor que devuelve ES el identificador
 * del estado (`pendiente`, `resuelta`, `verificada`) o `todas`.
 *
 * Que el filtro hable en estados y no en palabras propias es lo que
 * quita la ambigüedad: antes cada pantalla inventaba las suyas
 * —«Pendientes», «Terminadas», «Cerradas»— y no había forma de saber
 * si dos filtros distintos buscaban o no lo mismo.
 */
export function filtroEstado(alCambiar, inicial = 'todas') {
  let activo = inicial;
  const chips = h('div.chips.filtro', null,
    ...[['todas', 'Todas'], ...ESTADOS.map((e) => [e.id, e.plural])].map(([id, txt]) =>
      h('button.chip.accent', {
        'aria-pressed': id === activo ? 'true' : 'false',
        onclick: (e) => {
          if (activo === id) return;
          activo = id;
          [...chips.children].forEach((c) => c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false'));
          alCambiar(activo);
        },
      }, txt)),
  );
  return chips;
}

/** Selector de oficio. Abre una hoja con los doce a dos columnas. */
export function filtroOficio(alCambiar, inicial = 'todos') {
  let activo = inicial;
  const rotulo = (id) => (id === 'todos' ? 'Todos los oficios' : oficio(id).nombre);
  const texto = h('span.grow', null, rotulo(activo));

  const boton = h('button.selector', {
    class: activo !== 'todos' ? 'puesto' : '',
    onclick: async () => {
      const elegido = await hojaOficios(activo, { conTodos: true });
      if (elegido === null || elegido === activo) return;
      activo = elegido;
      texto.textContent = rotulo(activo);
      boton.classList.toggle('puesto', activo !== 'todos');
      alCambiar(activo);
    },
  }, texto, icon('chevron', 16));

  return boton;
}

/**
 * Hoja de oficios. `conTodos` añade la opción de no filtrar; al crear
 * una tarea no aparece, porque ahí elegir uno es obligatorio.
 */
export function hojaOficios(actual, { conTodos = false } = {}) {
  return sheet((cerrar) => [
    // Los mismos chips que los filtros, fluyendo: caben los que quepan
    // en cada línea, dos, tres o cuatro según lo largo de la palabra. Una
    // rejilla de dos columnas obligaba a «Carp. aluminio» y a «Cocinas»
    // a medir lo mismo, con la mitad del aire de sobra en la corta.
    h('div.chips.filtro.envuelve', null,
      ...OFICIOS.map((o) => h('button.chip.accent', {
        'aria-pressed': actual === o.id ? 'true' : 'false',
        onclick: () => cerrar(o.id),
      }, o.corto)),
      // «Todos los oficios» no está en la lista: es el texto de reposo
      // del selector, no un oficio. Pero si hay uno puesto hace falta
      // una salida, y esta solo aparece entonces.
      conTodos && actual !== 'todos' ? h('button.chip.quitar', {
        onclick: () => cerrar('todos'),
      }, 'Quitar filtro') : null,
    ),
    ctaCancelar(() => cerrar(null)),
  ]);
}

/**
 * Hoja de estancias. Igual que la de oficios, con una diferencia: aquí
 * «ninguna» es una respuesta válida —hay remates que no están en una
 * habitación concreta— así que siempre hay por dónde salir sin poner
 * nada. Devuelve `null` si se cancela y `''` si se quita la estancia,
 * que no son lo mismo: uno deja las cosas como están y el otro las
 * cambia a vacío.
 */
export function hojaZonas(actual) {
  return sheet((cerrar) => [
    h('h2.title', null, 'Estancia'),
    h('div.chips.filtro.envuelve', { style: { marginTop: '12px' } },
      ...ZONAS.map((z) => h('button.chip.accent', {
        'aria-pressed': actual === z ? 'true' : 'false',
        onclick: () => cerrar(z),
      }, z)),
      actual ? h('button.chip.quitar', { onclick: () => cerrar('') }, 'Sin estancia') : null,
    ),
    ctaCancelar(() => cerrar(null)),
  ]);
}

/**
 * El modal de «bien hecho»: la cara de quien lo hizo, su nombre y una
 * frase. Lo comparten el cierre de un recorrido y el completar una
 * tarea, que es el mismo momento visto desde dos sitios.
 *
 * No devuelve nada ni pregunta nada: se cierra tocando fuera o con el
 * botón. Un modal de celebración que exige una decisión deja de
 * celebrar y se convierte en un trámite más.
 */
export function hojaBienHecho({ titulo, frase, usuario, boton = 'Seguir' }) {
  return sheet((cerrar) => [
    h('div', { style: { display: 'grid', placeItems: 'center', gap: '14px', padding: '8px 0 4px' } },
      avatar(usuario, { tam: 64 }),
      h('h2.title.center', null, titulo),
      h('p.sub.center', { style: { maxWidth: '30ch' } }, frase),
    ),
    h('button.btn.ink.full', { style: { marginTop: '18px' }, onclick: () => cerrar(true) }, boton),
  ]);
}

/** Flecha «>» del final de las píldoras. */
export function chevron() {
  const svg = icon('chevron');
  svg.classList.add('chev');
  return svg;
}

/**
 * La llamada a la acción negra de «nueva lista de repasos». La misma en
 * la pestaña de ACTAS y dentro de una vivienda, y en el mismo sitio de
 * la pantalla: debajo de los filtros y encima del listado. Lo único que
 * cambia es a dónde lleva — en ACTAS hay que elegir vivienda primero, y
 * dentro de una ya se sabe cuál es.
 */
export function ctaNuevaLista(alPulsar) {
  return ctaAccion('NUEVA LISTA DE REPASOS', { onclick: alPulsar });
}

/**
 * El botón redondo de añadir, abajo a la derecha. Para las pantallas
 * que son una lista y nada más: allí la llamada a la acción a todo lo
 * ancho parte el listado en dos y estorba justo donde se está mirando.
 *
 * La onda se dispara al soltar y no al apretar: el hundido ya cuenta lo
 * de apretar, y la onda cuenta que la acción ha salido. Se quita y se
 * vuelve a poner la clase forzando un reflujo, para que dos toques
 * seguidos den dos ondas y no una.
 */
export function fabMas(alPulsar, { etiqueta = 'Añadir' } = {}) {
  const boton = h('button.fab-bola', {
    'aria-label': etiqueta, title: etiqueta,
    onclick: () => {
      boton.classList.remove('pulsa');
      void boton.offsetWidth;
      boton.classList.add('pulsa');
      setTimeout(() => boton.classList.remove('pulsa'), 560);
      alPulsar();
    },
  }, icon('plus'));
  return boton;
}

/**
 * La llamada a la acción principal de una pantalla o de una hoja: caja
 * negra a todo lo ancho, el rótulo a la izquierda y el icono en una
 * bolita a la derecha. Es la misma pieza en todas partes para que se
 * reconozca sin leer cuál es la acción que cierra lo que estás
 * haciendo.
 */
export function ctaAccion(texto, { onclick, icono = 'plus', claro = false, disabled = false } = {}) {
  return h('button.cta-accion' + (claro ? '.claro' : ''), { onclick, disabled: disabled || null },
    h('span.grow', null, texto),
    h('span.cta-mas', null, icon(icono, 18)),
  );
}

/** La salida de una hoja: la misma caja, en claro y con la cruz. */
export function ctaCancelar(onclick) {
  return ctaAccion('CANCELAR', { onclick, icono: 'x', claro: true });
}

/**
 * Barra de avance de cuatro tramos con su leyenda. Un anillo de un solo
 * color no puede decir la proporción entre cuatro estados; esta sí, y de
 * paso pone a la vista la cola de «Completadas», que es donde se atasca
 * el trabajo cuando la subcontrata va por delante de quien comprueba.
 *
 * Las rechazadas salen aparte aunque el resumen las tenga sumadas dentro
 * de las pendientes: para el porcentaje son lo mismo —trabajo sin
 * verificar— pero en la leyenda no, porque una rechazada ya se dio por
 * buena una vez y esa es la que hay que ir a mirar antes.
 */
export function barraAvance(c) {
  const total = c.total || 0;
  const rechazadas = c.rechazadas || 0;
  const abiertas = Math.max(0, (c.pendientes || 0) - rechazadas);
  const pct = (n) => (total ? (100 * n) / total : 0);
  const tramo = (clase, n) => (n > 0
    ? h('i', { class: clase, style: { width: pct(n) + '%' } })
    : null);

  const dato = (clase, n, etiqueta) => h('div', null,
    h('div.leyenda-cifra', null,
      h('span.punto', { class: clase }),
      h('b', null, String(n)),
    ),
    h('span', null, etiqueta),
  );

  // Los rótulos salen del catálogo, no escritos aquí: es lo que impide
  // que esta leyenda diga «Validadas» el día que los chips ya dicen
  // «Verificadas», que es exactamente lo que había pasado.
  const rotulo = (id) => estado(id).plural;

  return h('div.widget-avance', null,
    h('p.eyebrow', null, 'Avance'),
    h('div.avance-barra', null,
      tramo('t-resuelta', c.hechas),
      tramo('t-revisar', c.esperando),
      tramo('t-rechazada', rechazadas),
      tramo('t-pendiente', abiertas),
    ),
    h('div.leyenda', null,
      dato('t-resuelta', c.hechas, rotulo('verificada')),
      dato('t-revisar', c.esperando, rotulo('resuelta')),
      dato('t-rechazada', rechazadas, rotulo('rechazada')),
      dato('t-pendiente', abiertas, rotulo('pendiente')),
    ),
  );
}

/**
 * Una tarea en un listado: foto, texto, estado y quién la creó.
 * `donde` es opcional y sitúa la tarea cuando el listado mezcla
 * viviendas (la portada), porque ahí «rodapié sin sellar» no dice nada
 * si no se sabe de qué villa es.
 */
export function tareaFila(t, { portada, donde, filtros = null } = {}) {
  const e = estado(t.estado);
  const clases = ['tarea-fila'];
  if (rebotada(t)) clases.push('rechazada');
  else if (t.estado === 'verificada') clases.push('resuelta');

  return h('button', {
    class: clases.join(' '),
    onclick: () => ir(conFiltros(`#/l/${t.listaId}/t/${t.id}`, filtros || {})),
  },
    portada
      ? h('div.tarea-foto', { style: { backgroundImage: `url("${portada}")` } })
      : h('div.tarea-foto', null, icon('image', 20)),
    h('div.grow', null,
      h('p.tarea-txt', null, t.texto || 'Sin descripción'),
      h('div.tarea-pie', null,
        avatar(store.persona(t.creadoPor, t.creadoPorNombre), { tam: 35 }),
        h('span.tag', { class: e.tag }, e.nombre),
        donde ? h('span.tarea-donde', null, donde) : null,
      ),
    ),
  );
}
