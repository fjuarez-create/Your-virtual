/* ═══════════════════════════════════════════════════════════════
   pendientes.js — lo que alguien tiene a medias y no ha mandado.

   De momento, las fotos que se hacen para completar o verificar una
   tarea antes de darle al botón. Viven fuera de la pantalla porque la
   pantalla se rehace más veces de las que uno cree —al mandar un
   mensaje, cuando la sincronización trae algo de otro móvil— y una
   foto hecha en obra que desaparece sin avisar obliga a volver a la
   vivienda y buscar el remate otra vez.

   Y viven aquí, en su propio fichero y no dentro de la ficha de la
   tarea, para que el arranque de la aplicación pueda preguntar si hay
   algo a medias sin cargar media app: es lo que impide que una
   actualización se aplique justo encima de una foto sin mandar.
   ═══════════════════════════════════════════════════════════════ */

const fotosPorTarea = new Map();

/** Las fotos sin mandar de una tarea. Siempre el mismo array. */
export function fotosDe(tareaId) {
  if (!fotosPorTarea.has(tareaId)) fotosPorTarea.set(tareaId, []);
  return fotosPorTarea.get(tareaId);
}

/** Ya se han mandado: fuera. */
export function soltarFotos(tareaId) {
  fotosPorTarea.delete(tareaId);
}

/** ¿Queda alguna foto hecha y sin mandar, en cualquier tarea? */
export function hayFotosSinMandar() {
  for (const fotos of fotosPorTarea.values()) if (fotos.length) return true;
  return false;
}
