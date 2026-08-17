/* ═══════════════════════════════════════════════════════════════
   ajustesLocales.js — las preferencias que no hacen falta en el
   servidor, guardadas en el teléfono y separadas por usuario.

   Dos cosas viven aquí:

     · si cada uno quiere que la IA le proponga el texto al crear una
       tarea de una en una
     · cuándo miró por última vez cada uno de los dos contadores de la
       portada, para poder decir «tres nuevas desde que lo viste»

   Van en el teléfono y no en la base por una razón práctica: son
   ajustes de un móvil, no datos de la obra. Meterlos en la
   sincronización obligaría a una tabla, su subida y su bajada, para
   guardar un sí/no y dos fechas.

   Tiene un coste y conviene decirlo: quien entre desde dos aparatos
   verá contadores distintos en cada uno, porque cada uno recuerda su
   propia última mirada. Para un contador de «qué hay nuevo» eso es
   ruido menor; el día que estorbe, se sube a una tabla y se sincroniza
   igual que lo demás.

   Se guarda con la clave del usuario delante para que dos personas
   que comparten un teléfono —pasa en obra— no se pisen los ajustes.
   ═══════════════════════════════════════════════════════════════ */

const RAIZ = 'unik-repasos';

function clave(usuarioId, nombre) {
  return `${RAIZ}:${usuarioId || 'anon'}:${nombre}`;
}

/**
 * localStorage puede no estar —modo privado de algunos navegadores, o
 * el usuario lo tiene bloqueado— y ahí no se cae la app: se responde
 * con el valor por defecto y no se guarda nada.
 */
function leer(usuarioId, nombre, porDefecto = null) {
  try {
    const v = localStorage.getItem(clave(usuarioId, nombre));
    return v === null ? porDefecto : JSON.parse(v);
  } catch {
    return porDefecto;
  }
}

function escribir(usuarioId, nombre, valor) {
  try {
    localStorage.setItem(clave(usuarioId, nombre), JSON.stringify(valor));
  } catch { /* sin sitio o sin permiso: el ajuste no es crítico */ }
}

/* ─── La IA al crear tareas de una en una ─────────────────────────
   Nace encendida para todos y quien no la quiera la apaga. No es un
   capricho que sea opcional: en un recorrido, una sola llamada cubre
   veinte fotos; creando tareas de una en una, cada tarea es una
   llamada. Veinte sueltas cuestan bastante más que un recorrido de
   veinte. */
export function usaIA(usuario) {
  return leer(usuario?.id, 'ia-al-crear', true) !== false;
}

export function ponerUsaIA(usuario, valor) {
  escribir(usuario?.id, 'ia-al-crear', !!valor);
}

/* ─── Última mirada a los contadores de la portada ────────────────
   Los dos banners de la portada acumulan hasta que se pinchan. Lo que
   se guarda es cuándo se pinchó por última vez; el número sale de
   contar lo que se movió después. Así no hay un contador que llevar al
   día ni que arreglar cuando se descuadre: se calcula.

   Sin fecha guardada cuentan desde siempre, que es lo correcto la
   primera vez que alguien abre la app. */
export function ultimaMirada(usuario, banner) {
  return leer(usuario?.id, `visto:${banner}`, '') || '';
}

export function anotarMirada(usuario, banner, cuando) {
  escribir(usuario?.id, `visto:${banner}`, cuando || new Date().toISOString());
}
