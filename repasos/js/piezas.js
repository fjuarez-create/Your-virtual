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
import { unidad, fase, oficio, estado, OFICIOS } from './catalog.js';
import { ir } from './app.js';

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
      h('div.grow', null, logoUnik({ alto: 16 })),
      avatar(store.sesion(), { tam: 55, onclick: () => ir('#/ajustes') }),
    ),
    ajustarTitulo(h('h1.titulo-pantalla', null, titulo)),
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
      avatar(store.sesion(), { tam: 55, onclick: () => ir('#/ajustes') }),
    ),
    ajustarTitulo(h('h1.titulo-pantalla', null, titulo)),
  ];
}

/**
 * Ajusta el cuerpo del titular para que la palabra ocupe justo el ancho
 * disponible. Se mide una vez con canvas en lugar de probar tamaños en
 * el DOM: una sola medición y ninguna relectura de estilos, que es lo
 * que evita el parpadeo al entrar en la pantalla.
 */
function ajustarTitulo(nodo) {
  const medir = () => {
    // El ancho del PROPIO titular, no el de su contenedor: clientWidth
    // de un contenedor incluye su relleno, y medir contra él hacía los
    // títulos 40 px más anchos de lo que cabe, así que se salían.
    const ancho = nodo.clientWidth || 0;
    if (!ancho) return;
    const lienzo = ajustarTitulo.lienzo ||= document.createElement('canvas').getContext('2d');
    const REF = 100;
    lienzo.font = `200 ${REF}px ${getComputedStyle(nodo).fontFamily}`;
    const suyo = lienzo.measureText(nodo.textContent).width;
    if (suyo <= 0) return;
    // Con tope por arriba y por abajo: una palabra corta no debe salir
    // gigante ni un nombre largo quedar ilegible por caber a la fuerza.
    const cuerpo = Math.min(150, Math.max(26, Math.floor((REF * ancho) / suyo)));
    nodo.style.fontSize = cuerpo + 'px';
    // Si aun al mínimo no cabe, se deja partir en dos líneas.
    nodo.style.whiteSpace = (REF * ancho) / suyo < 26 ? 'normal' : 'nowrap';
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
  const f = fase(lista.fase);
  const titulo = mostrarVivienda
    ? `${u?.nombre || lista.unidadId} · ${fechaCorta(lista.creado)}`
    : `Inspección ${fechaCorta(lista.creado)}`;

  const partes = [f.nombre, lista.creadoPorNombre];
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
 * Etiqueta de fase. Pre-entrega en gris, porque es lo corriente;
 * post-entrega en el color de marca, porque es lo que hay que mirar
 * primero: la vivienda ya está entregada y el cliente está dentro.
 */
export function chipFase(faseId) {
  const f = fase(faseId);
  return h('span.chip-fase' + (faseId === 'post' ? '.post' : ''), null, f.corto.toUpperCase());
}

/**
 * Tarjeta de un acta. La misma en la portada, en la pestaña de ACTAS y
 * al pie de cada vivienda: quién ha participado, de qué acta se trata,
 * cuándo se hizo, si es pre o post, y cuánto lleva verificado. Se toca
 * aquí y cambia en los tres sitios.
 *
 * Lo único que depende de dónde se enseñe es el título cuando el acta
 * no tiene nombre puesto. En la lista general hace falta decir de qué
 * vivienda es; dentro de esa misma vivienda eso ya se sabe, y lo que
 * distingue un acta de otra es su fecha. De ahí `dentroDeVivienda`.
 */
export function tarjetaActa({ lista, conteo, gente }, { dentroDeVivienda = false } = {}) {
  const u = unidad(lista.unidadId);
  const porDefecto = dentroDeVivienda
    ? `Acta de ${fechaCorta(lista.creado)}`
    : (u?.nombre || lista.unidadId);
  const titulo = lista.nombre || porDefecto;

  return h('button.acta', { onclick: () => ir('#/l/' + lista.id) },
    grupoAvatares(gente.map((g) => store.persona(g.id, g.nombre)), { tam: 55 }),
    h('div.grow', null,
      h('div.acta-tit', null, titulo),
      h('div.acta-pie', null,
        h('span', null, fechaRelativa(lista.creado)),
        chipFase(lista.fase),
      ),
    ),
    anillo(store.avance(conteo), { tam: 46 }),
  );
}

/**
 * Chips de estado. Mismos tres en actas y en viviendas, y con el mismo
 * significado: terminada = todo verificado.
 */
export function filtroEstado(alCambiar, inicial = 'todas') {
  let activo = inicial;
  const chips = h('div.chips.filtro', null,
    ...[['todas', 'Todas'], ['pendientes', 'Pendientes'], ['terminadas', 'Terminadas']].map(([id, txt]) =>
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
  const texto = h('span.grow', null, 'Todos los oficios');

  const boton = h('button.selector', {
    onclick: async () => {
      const elegido = await hojaOficios(activo, { conTodos: true });
      if (elegido === null || elegido === activo) return;
      activo = elegido;
      texto.textContent = activo === 'todos' ? 'Todos los oficios' : oficio(activo).nombre;
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
export function hojaOficios(actual, { conTodos = false, titulo = 'Oficio' } = {}) {
  return sheet((cerrar) => [
    h('h2.title', null, titulo),
    h('div.rejilla-oficios', null,
      conTodos ? h('button.oficio' + (actual === 'todos' ? '.on' : ''), {
        onclick: () => cerrar('todos'),
      }, 'Todos los oficios') : null,
      ...OFICIOS.map((o) => h('button.oficio' + (actual === o.id ? '.on' : ''), {
        onclick: () => cerrar(o.id),
      }, o.corto)),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
  ]);
}

/** Flecha «>» del final de las píldoras. */
export function chevron() {
  const svg = icon('chevron');
  svg.classList.add('chev');
  return svg;
}

/**
 * Barra de avance de tres tramos con su leyenda. Un anillo de un solo
 * color no puede decir la proporción entre tres estados; esta sí, y de
 * paso pone a la vista la cola de «Revisar», que es donde se atasca el
 * trabajo cuando la subcontrata va por delante de quien comprueba.
 */
export function barraAvance(c) {
  const total = c.total || 0;
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

  return h('div.widget-avance', null,
    h('p.eyebrow', null, 'Avance'),
    h('div.avance-barra', null,
      tramo('t-resuelta', c.hechas),
      tramo('t-revisar', c.esperando),
      tramo('t-pendiente', c.pendientes),
    ),
    h('div.leyenda', null,
      dato('t-resuelta', c.hechas, 'Resueltas'),
      dato('t-revisar', c.esperando, 'A revisar'),
      dato('t-pendiente', c.pendientes, 'Pendientes'),
    ),
  );
}

/**
 * Una tarea en un listado: foto, texto, estado y quién la creó.
 * `donde` es opcional y sitúa la tarea cuando el listado mezcla
 * viviendas (la portada), porque ahí «rodapié sin sellar» no dice nada
 * si no se sabe de qué villa es.
 */
export function tareaFila(t, { portada, donde } = {}) {
  const e = estado(t.estado);
  const clases = ['tarea-fila'];
  if (t.rechazada) clases.push('rechazada');
  else if (t.estado === 'verificada') clases.push('resuelta');

  return h('button', {
    class: clases.join(' '),
    onclick: () => ir(`#/l/${t.listaId}/t/${t.id}`),
  },
    portada
      ? h('div.tarea-foto', { style: { backgroundImage: `url("${portada}")` } })
      : h('div.tarea-foto', null, icon('image', 20)),
    h('div.grow', null,
      h('p.tarea-txt', null, t.texto || 'Sin descripción'),
      h('div.tarea-pie', null,
        avatar(store.persona(t.creadoPor, t.creadoPorNombre), { tam: 35 }),
        t.rechazada ? h('span.tag.rojo', null, 'Rechazada') : h('span.tag', { class: e.tag }, e.nombre),
        donde ? h('span.tarea-donde', null, donde) : null,
      ),
    ),
  );
}
