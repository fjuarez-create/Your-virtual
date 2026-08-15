/* Pantalla principal de trabajo: las tareas de una lista de repaso.
   Se ve la foto y el texto de cada una sin tener que abrirla, que es
   como se repasa una vivienda andando. */
import { h, icon, sheet, toast, confirmSheet, emptyState, fechaCorta, hora } from '../ui.js';
import { unidad, estado, promocion, ESTADOS, OFICIOS, oficio } from '../catalog.js';
import * as store from '../store.js';
import * as media from '../media.js';
import { cabeceraDentro, barraSync, filtroEstado, ctaAccion, ctaCancelar } from '../piezas.js';
import { ir, refrescar } from '../app.js';
import { informe } from '../informe.js';
import { hojaDePuerta, nombreDeFichero } from '../pdf.js';

export async function render({ listaId }) {
  const lista = await store.lista(listaId);
  if (!lista) { toast('La lista ya no existe', 'err'); ir('#/', { reemplazar: true }); return { contenido: [] }; }

  const u = unidad(lista.unidadId);
  const tareas = await store.tareasDeLista(listaId);

  // Portadas y tipos de medio, para pintar cada tarjeta de una vez.
  const portadas = new Map();
  const tipos = new Map();
  for (const t of tareas) {
    portadas.set(t.id, await store.urlDePortada(t));
    const ms = await store.mediosDeTarea(t.id);
    tipos.set(t.id, {
      imagenes: ms.filter((m) => m.tipo === 'imagen').length,
      videos: ms.filter((m) => m.tipo === 'video').length,
      audios: ms.filter((m) => m.tipo === 'audio').length,
    });
  }

  const conteo = { total: tareas.length };

  let filtro = 'todas';
  const listado = h('div.stack');
  const contador = h('p.contador');

  // Los mismos chips, las mismas palabras y el mismo contador debajo
  // que en las otras tres pantallas que filtran. Aquí lo que se filtra
  // son tareas, así que el valor del chip es el estado tal cual.
  const pintar = () => {
    const visibles = tareas.filter((t) => filtro === 'todas' || t.estado === filtro);
    listado.replaceChildren();
    if (!visibles.length) {
      listado.append(h('p.sub.center', { style: { padding: '26px 0' } },
        'Ninguna tarea de esta lista está así.'));
    } else {
      visibles.forEach((t) => listado.append(
        tarjetaTarea(t, tareas.indexOf(t) + 1, portadas.get(t.id), tipos.get(t.id), listaId)));
    }
    contador.textContent = visibles.length === tareas.length
      ? `${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}`
      : `${visibles.length} de ${tareas.length} tareas`;
  };

  const chips = filtroEstado((v) => { filtro = v; pintar(); });
  pintar();

  const fab = h('button.fab', { onclick: () => nuevaTarea(listaId) }, icon('camera'), 'Nueva tarea');

  return {
    sinTabs: true,
    fab,
    contenido: [
      // El titular lleva la vivienda y no la fecha: al entrar desde una
      // lista de actas, lo primero que hay que reconocer es de qué casa
      // se está hablando. Y empieza por «ACTA» porque, si no, el acta y
      // la vivienda se llaman igual y no hay forma de saber dónde estás.
      ...cabeceraDentro(lista.nombre || `ACTA ${(u?.nombre || '').toUpperCase()}`.trim(), {
        volverA: `#/p/${lista.promoId}/v/${String(lista.unidadId).split(':')[1]}`,
        sub: fechaCorta(lista.creado),
        acciones: [h('button.icon-btn', {
          'aria-label': 'Opciones del acta',
          onclick: () => menuLista(lista, tareas),
        }, icon('gear'))],
      }),

      // La firma. Iba dentro del recuadro de cifras que se ha quitado, y
      // no puede perderse: un acta existe justamente para dejar dicho
      // quién vio la vivienda y cuándo.
      h('p.hint', null, `Firmada por ${lista.creadoPorNombre} a las ${hora(lista.creado)}.`),

      barraSync(),

      tareas.length ? h('button.btn.pdf.full', {
        onclick: () => descargarHoja(lista, tareas),
      }, icon('documento'), 'Hoja PDF para la puerta') : null,

      conteo.total ? chips : null,
      conteo.total ? contador : null,
      tareas.length ? listado : emptyState('camera', 'Lista vacía',
        'Recorre la vivienda y añade una tarea por cada remate, defecto o detalle que encuentres.',
        h('button.btn.accent', { onclick: () => nuevaTarea(listaId) }, icon('camera'), 'Primera tarea')),
    ],
  };
}

/* ─── Tarjeta de tarea ────────────────────────────────────────── */
function tarjetaTarea(t, numero, urlPortada, tipos, listaId) {
  const e = estado(t.estado);
  const thumb = urlPortada
    ? h('div.thumb', { style: { backgroundImage: `url("${urlPortada}")` } }, etiquetaNumero(numero), marcasMedios(tipos))
    : h('div.thumb.empty', null, icon('image'), etiquetaNumero(numero), marcasMedios(tipos));

  return h('button.task', {
    class: t.estado !== 'pendiente' ? 'done' : '',
    onclick: () => ir(`#/l/${listaId}/t/${t.id}`),
  },
    thumb,
    h('div.body', null,
      h('p.txt', null, t.texto || 'Sin descripción'),
      h('div.meta', null,
        t.rechazada ? h('span.tag.rojo', null, 'Rechazada') : null,
        h('span.tag', { class: e.tag }, e.nombre),
        t.estado !== 'pendiente' && t.estadoPor
          ? h('span.tag', null, t.estadoPor.split(/\s+/)[0])
          : null,
      ),
    ),
  );
}

const etiquetaNumero = (n) => h('span.n', null, String(n));

function marcasMedios(tipos) {
  if (!tipos) return null;
  const marcas = [];
  if (tipos.imagenes > 1) marcas.push(h('span', null, icon('image'), ));
  if (tipos.videos) marcas.push(h('span', null, icon('video')));
  if (tipos.audios) marcas.push(h('span', null, icon('mic')));
  return marcas.length ? h('div.kinds', null, marcas) : null;
}

/* ─── Alta de tarea ───────────────────────────────────────────── */
/** Flujo rápido: cámara → texto → guardar, sin salir del acta. */
export async function nuevaTarea(listaId) {
  // Dos tarjetas, una al lado de la otra y más altas que anchas. Es una
  // elección entre dos cosas del mismo rango, y en dos filas la de
  // arriba parecía la buena y la de abajo el plan B. Sin título: con
  // una cámara y una foto dibujadas no hace falta contarlo.
  const origen = await sheet((cerrar) => [
    h('div.opciones', null,
      h('button.opcion.principal', { onclick: () => cerrar('camara') },
        h('span.bola', null, icon('camera', 24)),
        h('span.grow'),
        h('span.rotulo', null, 'Hacer foto'),
        h('span.pie', null, 'Se abre la cámara'),
      ),
      h('button.opcion', { onclick: () => cerrar('galeria') },
        h('span.bola', null, icon('image', 24)),
        h('span.grow'),
        h('span.rotulo', null, 'Galería'),
        h('span.pie', null, 'Fotos ya hechas'),
      ),
    ),
    ctaCancelar(() => cerrar(null)),
  ]);
  if (!origen) return;

  // Toda tarea lleva foto. Un repaso sin imagen obliga a quien lo lee a
  // fiarse de la descripción, y quien tiene que corregirlo no sabe ni
  // dónde mirar.
  const preparadas = [];
  const ficheros = origen === 'camara' ? await media.hacerFoto() : await media.elegirFotos();
  if (!ficheros.length) return;
  toast(ficheros.length > 1 ? `Preparando ${ficheros.length} fotos…` : 'Preparando la foto…');
  for (const f of ficheros) {
    try { preparadas.push(await media.prepararImagen(f)); }
    catch { toast('Una de las imágenes no se pudo leer', 'err'); }
  }
  if (!preparadas.length) {
    toast('No se pudo leer ninguna foto. Inténtalo otra vez.', 'err');
    return;
  }

  const datos = await hojaTexto(preparadas, ultimoOficio);
  if (!datos) return;

  // La siguiente tarea suele ser del mismo gremio: se recuerda el
  // último elegido para no repetir el toque en cada una.
  ultimoOficio = datos.oficio;

  const t = await store.crearTarea({ listaId, texto: datos.texto, oficio: datos.oficio });
  for (const img of preparadas) {
    await store.añadirMedio(t.id, {
      tipo: 'imagen', blob: img.blob, mime: img.mime, ancho: img.ancho, alto: img.alto,
    });
  }
  toast('Tarea añadida');
  await refrescar();
}

/** Hoja con la foto tomada y el texto de la tarea. */
/** Gremio elegido en la última tarea de esta sesión. */
let ultimoOficio = null;

/**
 * Texto, fotos y oficio. El oficio es obligatorio: de él tiran los
 * filtros de las pantallas de actas y de viviendas, y una tarea sin
 * gremio sería invisible al buscar por gremio. Por eso el botón de
 * guardar no se activa hasta elegirlo.
 */
function hojaTexto(imagenes, oficioPrevio) {
  return sheet((cerrar) => {
    let elegido = oficioPrevio || null;

    const texto = h('textarea.textarea', {
      placeholder: 'Qué hay que hacer aquí…',
      rows: 3, autocapitalize: 'sentences',
    });
    // Una sola salida. Antes había un segundo botón para encadenar la
    // siguiente tarea, y con dos llamadas a la acción seguidas ninguna
    // era la principal.
    const guardar = ctaAccion('GUARDAR TAREA', { icono: 'check' });
    const pista = h('p.hint');

    // Los mismos chips que los filtros y que la hoja del selector de
    // oficio: fluyen y caben los que quepan en cada línea.
    const rejilla = h('div.chips.filtro', null,
      ...OFICIOS.map((o) => h('button.chip.accent', {
        'aria-pressed': elegido === o.id ? 'true' : 'false',
        onclick: (e) => {
          elegido = o.id;
          [...rejilla.children].forEach((c) =>
            c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false'));
          validar();
        },
      }, o.corto)),
    );

    // Las tres cosas son obligatorias: foto, descripción y oficio. La
    // pista dice cuál falta, y solo una a la vez: una lista de tres
    // reproches se lee como una regañina.
    const validar = () => {
      const hayFoto = imagenes.length > 0;
      const hayTexto = texto.value.trim().length > 0;
      const vale = hayFoto && hayTexto && !!elegido;
      guardar.disabled = !vale;
      pista.textContent = !hayFoto ? 'Esta tarea necesita al menos una foto.'
        : !hayTexto ? 'Escribe qué hay que hacer aquí.'
        : !elegido ? 'Elige el oficio para poder guardar.'
        : '';
      return vale;
    };
    texto.addEventListener('input', validar);
    guardar.addEventListener('click', () => validar() && cerrar({ texto: texto.value.trim(), oficio: elegido }));

    const previsualizacion = imagenes.length
      ? h('div.rail', null, imagenes.map((im) =>
          h('div.m', { style: { backgroundImage: `url("${URL.createObjectURL(im.blob)}")` } })))
      : null;

    setTimeout(() => texto.focus(), 320);
    validar();

    return [
      h('h2.title', null, 'Describe el repaso'),
      previsualizacion,
      texto,
      h('p.eyebrow', { style: { marginTop: '14px' } }, 'Oficio'),
      rejilla,
      pista,
      guardar,
    ];
  });
}

/* ─── Hoja PDF para la puerta ─────────────────────────────────── */
/**
 * Genera la hoja e intenta entregarla por el camino más cómodo del
 * dispositivo: en el móvil, el menú de compartir (de ahí va a WhatsApp o
 * a Archivos); en el ordenador, una descarga normal.
 */
async function descargarHoja(lista, tareas) {
  const u = unidad(lista.unidadId);
  const p = promocion(lista.promoId);
  try {
    const blob = hojaDePuerta({
      vivienda: u?.nombre || lista.unidadId,
      promocion: p?.nombre || lista.promoId,
      fecha: fechaCorta(lista.creado),
      autor: lista.creadoPorNombre,
      tareas,
    });
    const nombre = nombreDeFichero(u?.nombre || 'vivienda', fechaCorta(lista.creado));
    const fichero = new File([blob], nombre, { type: 'application/pdf' });

    if (navigator.canShare?.({ files: [fichero] })) {
      await navigator.share({ files: [fichero], title: nombre });
      return;
    }

    const url = URL.createObjectURL(blob);
    const enlace = h('a', { href: url, download: nombre, style: { display: 'none' } });
    document.body.append(enlace);
    enlace.click();
    setTimeout(() => { enlace.remove(); URL.revokeObjectURL(url); }, 4000);
    toast('PDF descargado');
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.error(e);
    toast('No se pudo generar el PDF', 'err');
  }
}

/* ─── Opciones de la lista ────────────────────────────────────── */
async function menuLista(lista, tareas) {
  const accion = await sheet((cerrar) => [
    h('h2.title', null, 'Lista de repaso'),
    h('p.sub', null, `Creada por ${lista.creadoPorNombre} el ${fechaCorta(lista.creado)} a las ${hora(lista.creado)}.`),
    h('div.stack', { style: { marginTop: '6px' } },
      h('button.row', { onclick: () => cerrar('hoja') },
        h('div.row-lead', { style: { background: 'rgba(198,58,48,.12)', color: '#c63a30' } }, icon('documento', 18)),
        h('div.grow', null,
          h('div.row-title', null, 'Hoja PDF para la puerta'),
          h('div.row-sub', null, 'Listado grande, para imprimir y pegar'),
        ),
      ),
      h('button.row', { onclick: () => cerrar('informe') },
        h('div.row-lead', null, icon('download', 18)),
        h('div.grow', null,
          h('div.row-title', null, 'Informe con fotos'),
          h('div.row-sub', null, 'Para mandar a la constructora'),
        ),
      ),
      h('button.row', { onclick: () => cerrar('nombre') },
        h('div.row-lead', null, icon('edit', 18)),
        h('div.grow', null,
          h('div.row-title', null, 'Cambiar el nombre del acta'),
          h('div.row-sub', null, lista.nombre || `Ahora se llama como la vivienda`),
        ),
      ),
      h('button.row', { onclick: () => cerrar('estados') },
        h('div.row-lead', null, icon('check', 18)),
        h('div.grow', null,
          h('div.row-title', null, 'Marcar todas como…'),
          h('div.row-sub', null, 'Cambia el estado de las ' + tareas.length + ' tareas'),
        ),
      ),
      h('button.row', { onclick: () => cerrar('cerrar') },
        h('div.row-lead', null, icon('clipboard', 18)),
        h('div.grow', null,
          h('div.row-title', null, lista.cerrada ? 'Reabrir la lista' : 'Cerrar la lista'),
          h('div.row-sub', null, lista.cerrada ? 'Permite volver a editarla' : 'Deja constancia de que la inspección terminó'),
        ),
      ),
      h('button.row.danger', { onclick: () => cerrar('borrar') },
        h('div.row-lead', null, icon('trash', 18)),
        h('div.grow', null, h('div.row-title', null, 'Borrar la lista')),
      ),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
  ]);

  if (accion === 'hoja') return descargarHoja(lista, tareas);
  if (accion === 'informe') return informe(lista, { abrirImpresion: true });

  if (accion === 'cerrar') {
    await store.actualizarLista(lista.id, { cerrada: !lista.cerrada });
    toast(lista.cerrada ? 'Lista reabierta' : 'Lista cerrada');
    return refrescar();
  }

  if (accion === 'nombre') {
    const puesto = await hojaNombre(lista);
    if (puesto !== null) {
      await store.actualizarLista(lista.id, { nombre: puesto });
      toast(puesto ? 'Nombre cambiado' : 'Vuelve a llamarse como la vivienda');
      refrescar();
    }
    return;
  }

  if (accion === 'estados') {
    const nuevo = await sheet((cerrar) => [
      h('h2.title', null, 'Marcar todas como'),
      h('div.stack', null, ESTADOS.map((e) => h('button.row', { onclick: () => cerrar(e.id) },
        h('div.grow', null, h('div.row-title', null, e.nombre)),
      ))),
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
    ]);
    if (!nuevo) return;
    for (const t of tareas) if (t.estado !== nuevo) await store.actualizarTarea(t.id, { estado: nuevo });
    toast('Estados actualizados');
    return refrescar();
  }

  if (accion === 'borrar') {
    const ok = await confirmSheet({
      title: '¿Borrar la lista?',
      text: `Se borrarán también sus ${tareas.length} tareas con sus fotos. No se puede deshacer.`,
      ok: 'Borrar', danger: true,
    });
    if (!ok) return;
    const destino = `#/p/${lista.promoId}/v/${String(lista.unidadId).split(':')[1]}`;
    await store.borrarLista(lista.id);
    toast('Lista borrada');
    ir(destino);
  }
}

/**
 * Renombrar un acta. Vacío devuelve el nombre de la vivienda: no se
 * guarda un texto igual al de la villa, porque entonces renombrar la
 * villa dejaría actas con el nombre viejo pegado.
 */
function hojaNombre(lista) {
  return sheet((cerrar) => {
    const u = unidad(lista.unidadId);
    const campo = h('input.input', {
      type: 'text', value: lista.nombre || '',
      placeholder: u?.nombre || 'Nombre del acta',
      maxlength: 80, autocapitalize: 'sentences',
    });
    setTimeout(() => campo.focus(), 320);

    return [
      h('h2.title', null, 'Nombre del acta'),
      campo,
      h('p.hint', null, `Si lo dejas vacío, el acta se llama como la vivienda (${u?.nombre || ''}).`),
      h('button.btn.accent.full', { onclick: () => cerrar(campo.value.trim()) }, 'Guardar'),
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
    ];
  });
}
