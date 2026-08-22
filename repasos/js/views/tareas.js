/* Pantalla principal de trabajo: las tareas de una lista de repaso.
   Se ve la foto y el texto de cada una sin tener que abrirla, que es
   como se repasa una vivienda andando. */
import { h, icon, sheet, toast, confirmSheet, emptyState, fechaCorta, hora } from '../ui.js';
import {
  unidad, estado, promocion, enObra, ESTADOS, OFICIOS, ZONAS, oficio, OFICIO_POR_DEFECTO,
} from '../catalog.js';
import * as store from '../store.js';
import * as media from '../media.js';
import * as api from '../api.js';
import { cabeceraDentro, barraSync, filtroEstado, filtroOficio, ctaAccion, ctaCancelar, entregarFichero } from '../piezas.js';
import { usaIA, ordenPdf } from '../ajustesLocales.js';
import { ir, refrescar, conFiltros, filtrosDeRuta, anotarFiltros } from '../app.js';
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

  // Los mismos dos filtros que en las otras tres pantallas, y llegan
  // puestos si se venía filtrando desde fuera. Aquí lo que se filtra son
  // tareas, así que el valor del chip es el estado tal cual.
  let { estado: filtro, oficio: oficioId } = filtrosDeRuta();
  const listado = h('div.stack');
  const contador = h('p.contador');

  const cambio = () => { anotarFiltros({ estado: filtro, oficio: oficioId }); pintar(); };

  const pintar = () => {
    const visibles = tareas.filter((t) =>
      (filtro === 'todas' || t.estado === filtro)
      && (oficioId === 'todos' || (t.oficio || OFICIO_POR_DEFECTO) === oficioId));
    listado.replaceChildren();
    if (!visibles.length) {
      listado.append(h('p.sub.center', { style: { padding: '26px 0' } },
        'Ninguna tarea de esta lista encaja con este filtro.'));
    } else {
      visibles.forEach((t) => listado.append(
        tarjetaTarea(t, tareas.indexOf(t) + 1, portadas.get(t.id), tipos.get(t.id), listaId,
          { estado: filtro, oficio: oficioId })));
    }
    contador.textContent = visibles.length === tareas.length
      ? `${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}`
      : `${visibles.length} de ${tareas.length} tareas`;
  };

  const chips = filtroEstado((v) => { filtro = v; cambio(); }, filtro);
  const selector = filtroOficio((v) => { oficioId = v; cambio(); }, oficioId);
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
        volverA: conFiltros(`#/p/${lista.promoId}/v/${String(lista.unidadId).split(':')[1]}`, filtrosDeRuta()),
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
      conteo.total ? selector : null,
      conteo.total ? contador : null,
      tareas.length ? listado : emptyState('camera', 'Lista vacía',
        'Recorre la vivienda y añade una tarea por cada remate, defecto o detalle que encuentres.',
        h('button.btn.accent', { onclick: () => nuevaTarea(listaId) }, icon('camera'), 'Primera tarea')),
    ],
  };
}

/* ─── Tarjeta de tarea ────────────────────────────────────────── */
function tarjetaTarea(t, numero, urlPortada, tipos, listaId, filtros = null) {
  const e = estado(t.estado);
  const thumb = urlPortada
    ? h('div.thumb', { style: { backgroundImage: `url("${urlPortada}")` } }, etiquetaNumero(numero), marcasMedios(tipos))
    : h('div.thumb.empty', null, icon('image'), etiquetaNumero(numero), marcasMedios(tipos));

  return h('button.task', {
    // Rechazada no es «hecha»: es trabajo de la constructora igual que
    // pendiente, y tacharla la escondería justo cuando hay que mirarla.
    class: enObra(t) ? '' : 'done',
    onclick: () => ir(conFiltros(`#/l/${listaId}/t/${t.id}`, filtros || {})),
  },
    thumb,
    h('div.body', null,
      h('p.txt', null, t.texto || 'Sin descripción'),
      h('div.meta', null,
        h('span.tag', { class: e.tag }, e.nombre),
        // Delante del nombre de quien la movió: en una villa con cuatro
        // baños, saber en cuál es importa más que saber quién la tocó.
        t.zona ? h('span.tag', null, t.zona) : null,
        t.estado !== 'pendiente' && t.estadoPor
          ? h('span.tag', null, t.estadoPor.split(/\s+/)[0])
          : null,
      ),
    ),
  );
}

/**
 * Le pide a la IA que lea una foto y proponga texto, gremio y estancia.
 *
 * Por dentro es la llamada del recorrido con una sola marca y sin nada
 * dicho: no hay ruta nueva en el servidor ni instrucciones aparte, y
 * eso significa que lo que se afine para el recorrido vale aquí y al
 * revés.
 *
 * Los errores se tragan a propósito, y es la única vez en toda la app
 * que se hace. Aquí la IA es una comodidad, no el trabajo: si no hay
 * clave, ni línea, ni saldo, la respuesta correcta es que la hoja salga
 * en blanco como salía antes, no un aviso rojo delante de alguien que
 * está de pie en una obra con el móvil en una mano.
 */
async function proponer(imagen) {
  try {
    const b64 = await media.paraMirar(imagen.blob);
    const marca = { id: 'sola', ms: 0 };
    const r = await api.claudeRedactar(
      '',
      [marca],
      OFICIOS.map((o) => ({ id: o.id, nombre: o.nombre })),
      [{ id: 'sola', b64 }],
      ZONAS,
    );
    const f = (r?.fichas || [])[0];
    if (!f) return null;
    return {
      texto: String(f.texto || '').trim(),
      oficio: OFICIOS.some((o) => o.id === f.oficio) ? f.oficio : null,
      zona: f.zona || '',
    };
  } catch {
    return null;
  }
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

  // Si esta persona lo quiere, se le pide a la IA que proponga texto,
  // gremio y estancia mirando la primera foto. Es la misma llamada del
  // recorrido con una sola marca y sin nada dicho, así que no hace
  // falta nada nuevo en el servidor.
  //
  // Se propone, no se impone: llega escrito en la caja y se corrige o
  // se borra. Y si falla —sin clave, sin línea, sin saldo— no se
  // interrumpe nada: la hoja sale igual, en blanco, como antes.
  let propuesta = null;
  if (usaIA(store.sesion())) {
    toast('Mirando la foto…');
    propuesta = await proponer(preparadas[0]);
  }

  const datos = await hojaTexto(preparadas, propuesta?.oficio || ultimoOficio, propuesta);
  if (!datos) return;

  // La siguiente tarea suele ser del mismo gremio: se recuerda el
  // último elegido para no repetir el toque en cada una.
  ultimoOficio = datos.oficio;

  const t = await store.crearTarea({
    listaId, texto: datos.texto, oficio: datos.oficio, zona: datos.zona,
  });
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
 * Texto, fotos, oficio y estancia. El oficio es obligatorio: de él tiran
 * los filtros de las pantallas de actas y de viviendas, y una tarea sin
 * gremio sería invisible al buscar por gremio. Por eso el botón de
 * guardar no se activa hasta elegirlo.
 *
 * La estancia NO lo es. Sirve para encontrar el remate dentro de la
 * casa, no para clasificar el trabajo, y hay tareas que no están en
 * ninguna habitación concreta. Además, las tareas de antes de que
 * existiera el campo lo tienen vacío: si aquí fuera obligatorio, la
 * pantalla exigiría algo que media base de datos no cumple.
 */
function hojaTexto(imagenes, oficioPrevio, propuesta = null) {
  return sheet((cerrar) => {
    let elegido = oficioPrevio || null;
    let zona = propuesta?.zona && ZONAS.includes(propuesta.zona) ? propuesta.zona : '';

    const texto = h('textarea.textarea', {
      placeholder: 'Qué hay que hacer aquí…',
      rows: 3, autocapitalize: 'sentences',
    });
    if (propuesta?.texto) texto.value = propuesta.texto;
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

    // La estancia se puede quitar volviendo a tocar el chip puesto: es
    // opcional, y sin eso un toque por error no habría manera de
    // deshacerlo sin cerrar la hoja y empezar de nuevo.
    const estancias = h('div.chips.filtro', null,
      ...ZONAS.map((z) => h('button.chip.accent', {
        'aria-pressed': zona === z ? 'true' : 'false',
        onclick: (e) => {
          zona = zona === z ? '' : z;
          [...estancias.children].forEach((c) => c.setAttribute(
            'aria-pressed', zona && c === e.currentTarget ? 'true' : 'false'));
        },
      }, z)),
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
    guardar.addEventListener('click', () => validar()
      && cerrar({ texto: texto.value.trim(), oficio: elegido, zona }));

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
      h('p.eyebrow', { style: { marginTop: '14px' } }, 'Estancia · opcional'),
      estancias,
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
      // El mismo orden que la hoja de la vivienda: es la misma casa y
      // el mismo papel, solo que de una inspección concreta.
      orden: ordenPdf(store.sesion()),
    });
    const nombre = nombreDeFichero(u?.nombre || 'vivienda', fechaCorta(lista.creado));
    const fichero = new File([blob], nombre, { type: 'application/pdf' });

    // La entrega va aparte y con su propia hoja: compartir en iOS exige
    // un toque recién dado, no uno de hace unos segundos.
    entregarFichero(fichero, nombre);
  } catch (e) {
    console.error('No se pudo generar el PDF del acta:', e);
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
