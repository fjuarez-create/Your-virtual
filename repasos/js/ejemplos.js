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
import { unidades } from './catalog.js';

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
      fase: i === 1 ? 'post' : 'pre',
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
