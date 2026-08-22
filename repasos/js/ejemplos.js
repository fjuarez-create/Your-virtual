/* ═══════════════════════════════════════════════════════════════
   ejemplos.js — actas de muestra firmadas por el equipo.

   Sirve para ver cómo queda la app con trabajo de varias personas antes
   de que lo haya de verdad: bolitas amontonadas, mezcla de fotos e
   iniciales, los tres estados repartidos.

   Dos decisiones importantes:

   · Las actas de ejemplo se llaman «Ejemplo · Villa NN». El prefijo se
     ve en la tarjeta a propósito: son un montaje y no deben confundirse
     con el repaso real de una vivienda, que es un documento con valor.

   · Ese mismo prefijo es lo que permite retirarlas después sin tocar
     nada más. No hay campo «es_de_ejemplo» en la base de datos porque
     no hace falta: el nombre ya lo dice.
   ═══════════════════════════════════════════════════════════════ */
import * as store from './store.js';
import * as db from './db.js';
import * as media from './media.js';
import { unidades, FASE_UNICA } from './catalog.js';

export const PREFIJO = 'Ejemplo · ';

const TEXTOS = [
  'Repasar junta del alicatado tras el inodoro',
  'Puerta de paso sin tope de goma',
  'Falta rejilla de ventilación en el armario',
  'El monomando del office gotea',
  'Enchufe suelto en el dormitorio principal',
  'Baldosa levantada junto al ventanal',
  'Cajón inferior de la cocina no cierra bien',
  'Desconchón en el revoco de la fachada sur',
  'Rodapié sin sellar en el encuentro con la corredera',
  'Falta remate de aluminio en el antepecho',
];
const OFICIOS_MUESTRA = [
  'pintura', 'pladur', 'carp-madera', 'fontaneria',
  'electricidad', 'pavimentos', 'cocinas', 'fachada',
];

/**
 * Crea tres actas en viviendas que no tengan nada, firmadas por gente
 * distinta del equipo: una con dos personas, otra con tres y otra con
 * una sola. Devuelve cuántas actas y tareas se han creado.
 */
export async function crear(promoId) {
  let equipo = store.equipo();

  // Si el dispositivo aún no tiene el directorio —recién instalado, o
  // sincronizado desde antes de que el directorio existiera— se pide y
  // se reintenta antes de rendirse. Decirle «no hay gente» a quien
  // tiene nueve personas dadas de alta sería mentirle.
  if (equipo.length < 2) {
    await store.sincronizar({ forzar: true });
    await store.cargarPersonas();
    equipo = store.equipo();
  }
  const yo = store.sesion();
  if (equipo.length < 2) {
    throw new Error(navigator.onLine
      ? 'No he podido leer el equipo. Prueba a sincronizar y vuelve.'
      : 'Sin conexión: hace falta para leer el equipo.');
  }

  // Se firma con quien NO está usando la app, que es justo lo que no se
  // puede ver de otro modo; si no hubiera nadie más, con el propio. Y
  // van primero quienes tienen foto puesta: la gracia de esto es ver la
  // pila de caras, no una fila de iniciales.
  const otros = equipo.filter((p) => p.id !== yo?.id);
  const firmantes = (otros.length ? otros : equipo)
    .slice()
    .sort((a, b) => (b.avatar ? 1 : 0) - (a.avatar ? 1 : 0));

  const libres = await viviendasLibres(promoId, 3);
  if (!libres.length) throw new Error('No quedan viviendas sin tareas donde montarlas.');

  const reparto = [3, 2, 1];
  let actas = 0;
  let tareas = 0;

  for (const [i, u] of libres.entries()) {
    const cuantos = Math.min(reparto[i] ?? 1, firmantes.length);
    const gente = firmantes.slice(0, cuantos);
    const lista = await store.crearLista({
      unidadId: u.id,
      promoId,
      fase: FASE_UNICA,
      nombre: PREFIJO + u.nombre,
      autor: gente[0],
    });
    actas++;

    for (let k = 0; k < cuantos * 2; k++) {
      const autor = gente[k % gente.length];
      const t = await store.crearTarea({
        listaId: lista.id,
        texto: TEXTOS[(i * 3 + k) % TEXTOS.length],
        oficio: OFICIOS_MUESTRA[(i * 2 + k) % OFICIOS_MUESTRA.length],
        autor,
      });
      tareas++;

      // Los tres estados repartidos, para que la barra de avance tenga
      // los tres tramos y no una sola franja.
      const estado = ['pendiente', 'resuelta', 'verificada'][k % 3];
      if (estado !== 'pendiente') await store.cambiarEstado(t.id, estado);
    }
  }
  return { actas, tareas };
}

/** Retira todo lo creado por `crear()`. No toca nada más. */
export async function borrar() {
  const suyas = (await db.getAll('listas'))
    .filter((l) => !l.borrada && String(l.nombre || '').startsWith(PREFIJO));
  for (const l of suyas) await store.borrarLista(l.id);
  return suyas.length;
}

/** ¿Hay ejemplos puestos ahora mismo? */
export async function cuantos() {
  return (await db.getAll('listas'))
    .filter((l) => !l.borrada && String(l.nombre || '').startsWith(PREFIJO)).length;
}

/**
 * Viviendas sin ninguna tarea, para no mezclar el montaje con el repaso
 * real de una casa que ya se está trabajando.
 */
async function viviendasLibres(promoId, cuantas) {
  const resumen = await store.resumenPorUnidad(promoId);
  return unidades(promoId)
    .filter((u) => !(resumen.get(u.id)?.total))
    .slice(-cuantas)          // desde el final: las primeras suelen ser las que se repasan antes
    .reverse();
}

/* ═══════════════════════════════════════════════════════════════
   Los repasos de verdad

   Al probar la aplicación se escriben tareas a lo bruto —«af af af»,
   «prueba 2»— porque lo que se está mirando es si el botón funciona,
   no lo que pone. Luego esas frases se quedan ahí, y la obra parece
   un cuaderno de garabatos.

   Esta lista es el recambio: repasos como los de una vivienda que
   entrega dentro de un mes, cuando lo gordo está hecho y lo que queda
   son remates, ajustes y limpiezas. Cada uno con su oficio, su
   estancia y el nombre de la foto que le corresponde.
   ═══════════════════════════════════════════════════════════════ */
export const REPASOS_REALES = [
  { texto: 'Rodapié despegado en el encuentro con la corredera del salón', oficio: 'rodapies', zona: 'Salón', foto: 'rodapie-despegado' },
  { texto: 'Junta del alicatado abierta detrás del inodoro', oficio: 'pavimentos', zona: 'Baño suite', foto: 'junta-alicatado' },
  { texto: 'La corredera del salón roza al cerrar y no encaja el pestillo', oficio: 'carp-aluminio', zona: 'Salón', foto: 'corredera-roza' },
  { texto: 'Gotelé sin igualar en el techo del pasillo', oficio: 'pintura', zona: 'Pasillo', foto: 'gotele-techo' },
  { texto: 'Enchufe del dormitorio principal suelto en la caja', oficio: 'electricidad', zona: 'Dormitorio suite', foto: 'enchufe-suelto' },
  { texto: 'El monomando del office gotea por la base', oficio: 'fontaneria', zona: 'Cocina', foto: 'monomando-gotea' },
  { texto: 'Cajón inferior de la cocina no cierra a tope', oficio: 'cocinas', zona: 'Cocina', foto: 'cajon-cocina' },
  { texto: 'Desconchón en el revoco de la fachada sur, a la altura del contador', oficio: 'fachada', zona: 'Acceso exterior', foto: 'desconchon-revoco' },
  { texto: 'Falta el tope de goma en la puerta del baño principal', oficio: 'carp-madera', zona: 'Baño principal', foto: 'tope-puerta' },
  { texto: 'Rejilla de ventilación del vestidor sin colocar', oficio: 'aire', zona: 'Dormitorio suite', foto: 'rejilla-ventilacion' },
  { texto: 'Baldosa levantada junto al ventanal del salón', oficio: 'pavimentos', zona: 'Salón', foto: 'baldosa-levantada' },
  { texto: 'Silicona del plato de ducha con hongos, hay que rehacerla', oficio: 'fontaneria', zona: 'Baño principal', foto: 'silicona-ducha' },
  { texto: 'Barandilla de la escalera con holgura en el anclaje inferior', oficio: 'barandillas', zona: 'Escalera', foto: 'barandilla-holgura' },
  { texto: 'Vidrio de la barandilla de la terraza rayado', oficio: 'barandillas-vidrio', zona: 'Jardín', foto: 'vidrio-rayado' },
  { texto: 'El videoportero no da imagen desde el portón', oficio: 'videoporteros', zona: 'Entrada', foto: 'videoportero' },
  { texto: 'Mecanismo del pulsador del pasillo montado del revés', oficio: 'electricidad', zona: 'Pasillo', foto: 'pulsador-reves' },
  { texto: 'Manchas de yeso en el pavimento de la entrada', oficio: 'general', zona: 'Entrada', foto: 'manchas-yeso' },
  { texto: 'Falta remate de aluminio en el antepecho del dormitorio 2', oficio: 'carp-aluminio', zona: 'Dormitorio 2', foto: 'remate-antepecho' },
  { texto: 'Puerta del armario del distribuidor desalineada', oficio: 'carp-madera', zona: 'Pasillo', foto: 'puerta-armario' },
  { texto: 'Fuga en el desagüe del lavadero, gotea al suelo', oficio: 'fontaneria', zona: 'Lavadero', foto: 'fuga-desague' },
  { texto: 'El foco del baño secundario parpadea', oficio: 'electricidad', zona: 'Baño suite', foto: 'foco-parpadea' },
  { texto: 'Junta de dilatación del sótano sin sellar', oficio: 'pavimentos', zona: 'Sótano', foto: 'junta-dilatacion' },
  { texto: 'Marcas de la cinta del pladur en el techo del salón', oficio: 'pladur', zona: 'Salón', foto: 'cinta-pladur' },
  { texto: 'Repasar el rejuntado del alicatado de la cocina', oficio: 'pavimentos', zona: 'Cocina', foto: 'rejuntado-cocina' },
  { texto: 'Grifo del jardín sin volante', oficio: 'fontaneria', zona: 'Jardín', foto: 'grifo-jardin' },
  { texto: 'El riego del seto de la entrada no llega a los últimos goteros', oficio: 'jardines', zona: 'Jardín', foto: 'riego-goteros' },
  { texto: 'Falta el vierteaguas de la ventana del aseo', oficio: 'carp-aluminio', zona: 'Aseo', foto: 'vierteaguas' },
  { texto: 'La puerta de entrada roza en el marco por la parte alta', oficio: 'carp-madera', zona: 'Entrada', foto: 'puerta-roza' },
  { texto: 'Iluminación de la cubierta sin conectar al reloj', oficio: 'electricidad', zona: 'Cubierta', foto: 'luz-cubierta' },
  { texto: 'Escalón con el canto descascarillado en el tramo de subida', oficio: 'pavimentos', zona: 'Escalera', foto: 'canto-escalon' },
  { texto: 'Encimera de la cocina con un golpe junto al fregadero', oficio: 'cocinas', zona: 'Cocina', foto: 'encimera-golpe' },
  { texto: 'La bomba de la piscina hace ruido al arrancar', oficio: 'piscinas', zona: 'Jardín', foto: 'bomba-piscina' },
  { texto: 'Falta sellar el paso de instalaciones del sótano', oficio: 'general', zona: 'Sótano', foto: 'paso-instalaciones' },
  { texto: 'La persiana del dormitorio 1 baja torcida', oficio: 'carp-aluminio', zona: 'Dormitorio 1', foto: 'persiana-torcida' },
  { texto: 'Marca de humedad en el techo del baño secundario', oficio: 'pintura', zona: 'Baño suite', foto: 'humedad-techo' },
  { texto: 'Termo del lavadero sin fijar a la pared', oficio: 'fontaneria', zona: 'Lavadero', foto: 'termo-sin-fijar' },
  { texto: 'Zócalo del jardín con las juntas abiertas en la esquina', oficio: 'fachada', zona: 'Jardín', foto: 'zocalo-juntas' },
  { texto: 'Puerta corredera del vestidor descarrilada', oficio: 'carp-madera', zona: 'Dormitorio suite', foto: 'corredera-vestidor' },
  { texto: 'Rejilla del sumidero de la terraza suelta', oficio: 'fontaneria', zona: 'Jardín', foto: 'sumidero-suelto' },
  { texto: 'Pomo del armario del dormitorio 2 flojo', oficio: 'cocinas', zona: 'Dormitorio 2', foto: 'pomo-flojo' },
];

/**
 * ¿Esto se escribió para probar y no dice nada?
 *
 * Es una sospecha, no una sentencia: lo que decida esta función se
 * enseña antes con su casilla, y quien mira quita lo que no toque. Por
 * eso puede permitirse ser generosa —«prueba de estanqueidad» es una
 * tarea legítima y aquí caería—: el coste de un falso positivo es una
 * casilla que se desmarca, y el de dejarse uno, una obra con garabatos.
 */
export function pareceDePrueba(texto) {
  const t = String(texto || '').trim();
  if (!t) return true;
  const bajo = t.toLowerCase();
  if (t.length < 8) return true;                                  // «af», «ok», «xxx»
  if (!/[aeiouáéíóúü]/.test(bajo)) return true;                   // sin una sola vocal
  if (/(.)\1{2,}/.test(bajo)) return true;                        // «oruebaaaaa»
  if (/^(\S{1,4})([\s,.-]*\1){2,}$/.test(bajo)) return true;      // «af af af», «afafaf»
  if (/\b(prueba|pruebas|probando|test|testing|asdf|qwer|bla+|lorem|kk|xd)\b/.test(bajo)) return true;
  return false;
}

/**
 * Las tareas de la promoción que parecen de prueba, cada una con el
 * repaso de verdad que le tocaría.
 *
 * Cada vivienda empieza a coger de un punto distinto de la lista para
 * que dos casas seguidas no salgan con los mismos repasos, y dentro de
 * una casa no se repite ninguno hasta agotar los cuarenta.
 */
export async function candidatosDePrueba(promoId) {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada && l.promoId === promoId);
  const casaDe = new Map(listas.map((l) => [l.id, l.unidadId]));
  const tareas = (await db.getAll('tareas'))
    .filter((t) => !t.borrada && casaDe.has(t.listaId) && pareceDePrueba(t.texto))
    .sort((a, b) => String(a.creado || '').localeCompare(String(b.creado || '')));

  const puestas = new Map();
  return tareas.map((t) => {
    const unidadId = casaDe.get(t.listaId);
    const n = puestas.get(unidadId) || 0;
    puestas.set(unidadId, n + 1);
    const salto = (parseInt(String(unidadId).split(':')[1], 10) || 0) * 7;
    return { tarea: t, unidadId, nuevo: REPASOS_REALES[(salto + n) % REPASOS_REALES.length] };
  });
}

/**
 * Cambia el texto, el oficio y la estancia de cada tarea elegida, y le
 * pone su foto si esa foto está en la aplicación.
 *
 * La foto solo se pone si la tarea no tenía ninguna: si alguien se
 * molestó en hacer una en obra, esa manda por encima de cualquier
 * imagen de muestra.
 */
export async function arreglarTextos(candidatos, alAvanzar = null) {
  let hechas = 0;
  let conFoto = 0;
  for (const c of candidatos) {
    await store.actualizarTarea(c.tarea.id, {
      texto: c.nuevo.texto,
      oficio: c.nuevo.oficio,
      zona: c.nuevo.zona,
    });
    const medios = await store.mediosDeTarea(c.tarea.id);
    if (!medios.some((m) => m.tipo === 'imagen')) {
      if (await ponerFotoDeMuestra(c.tarea.id, c.nuevo.foto)) conFoto += 1;
    }
    hechas += 1;
    alAvanzar?.(hechas, candidatos.length);
  }
  return { hechas, conFoto };
}

/**
 * Coge la foto de muestra de la propia aplicación y la mete en la tarea
 * como si se acabara de hacer.
 *
 * Si esa foto todavía no está subida, no pasa nada y la tarea se queda
 * con la imagen del oficio y su pie explicándolo, que es lo que había
 * antes. Así esto se puede usar hoy y las fotos entran cuando entren.
 */
async function ponerFotoDeMuestra(tareaId, nombre) {
  if (!nombre) return false;
  try {
    const res = await fetch(`assets/ejemplos/${nombre}.jpg`);
    if (!res.ok) return false;
    const blob = await res.blob();
    if (!blob.size || !String(blob.type).startsWith('image/')) return false;
    const img = await media.prepararImagen(blob);
    await store.añadirMedio(tareaId, { tipo: 'imagen', ...img });
    return true;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════
   Tareas sin fotografía

   La regla de la casa es que una tarea sin foto no existe, y por
   orden de Fran las que se colaron antes del blindaje se BORRAN para
   siempre, no se visten. Aquí vive el buscador que usan la purga
   manual de Ajustes y quien lo necesite.
   ═══════════════════════════════════════════════════════════════ */

/** Las tareas vivas de la promoción que no tienen ni una imagen. */
export async function tareasSinFotografia(promoId) {
  const listas = (await db.getAll('listas')).filter((l) => !l.borrada && l.promoId === promoId);
  const ids = new Set(listas.map((l) => l.id));
  const tareas = (await db.getAll('tareas'))
    .filter((t) => !t.borrada && ids.has(t.listaId))
    .sort((a, b) => String(a.creado || '').localeCompare(String(b.creado || '')));
  const cojas = [];
  for (const t of tareas) {
    const medios = await store.mediosDeTarea(t.id);
    if (!medios.some((m) => m.tipo === 'imagen' && !m.perdido)) cojas.push(t);
  }
  return cojas;
}
