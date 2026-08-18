/* ═══════════════════════════════════════════════════════════════
   ajustesLocales.js — las preferencias que no hacen falta en el
   servidor, guardadas en el teléfono y separadas por usuario.

   De momento vive aquí una sola cosa: si cada uno quiere que la IA le
   proponga el texto al crear una tarea de una en una.

   Va en el teléfono y no en la base por una razón práctica: es un
   ajuste de un móvil, no un dato de la obra. Meterlo en la
   sincronización obligaría a una tabla, su subida y su bajada, para
   guardar un sí o un no.

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
