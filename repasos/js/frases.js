/* ═══════════════════════════════════════════════════════════════
   frases.js — lo que dice la app cuando algo sale bien.

   Dos momentos: al cerrar un recorrido y al completar una tarea. En
   los dos hay un modal con la cara de quien lo hizo y una frase.

   Que la frase cambie no es adorno. Un mensaje que sale idéntico las
   ochenta veces que completas una tarea deja de leerse a la tercera, y
   con él se va la única confirmación que tiene la app de que lo que
   acabas de hacer ha llegado. Cambiando, se sigue leyendo.

   Están aquí y no repartidas por las pantallas porque son el tono de
   la app: si algún día hay que cambiarlo, se cambia en un sitio.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Al cerrar un recorrido, según cuántas tareas salieron.
 *
 * El último tramo lleva el número de verdad, no uno fijo: decir «34
 * remates» cuando salieron nueve convierte una frase con gracia en un
 * fallo que se ve a la primera.
 */
export function alCerrarRecorrido(cuantas) {
  if (cuantas <= 0) return 'Recorrido cerrado.';
  if (cuantas === 1) return 'Una y bien cazada.';
  if (cuantas <= 5) return 'Todo validado. Ni una se escapó.';
  if (cuantas <= 10) return 'Buen repaso. Hay trabajo por delante.';
  if (cuantas <= 15) return 'Repaso serio. El jefe de obra te recordará.';
  return `${cuantas} remates. Esto ya era personal.`;
}

/**
 * Al completar una tarea. Ocho, rotando.
 *
 * Rotan por turno y no al azar: al azar salen repetidas seguidas —es lo
 * que hace el azar— y dos iguales una detrás de otra se notan más que
 * ocho en orden. El turno se guarda en memoria, así que al reabrir la
 * app se empieza otra vez por la primera; para lo que hace falta, sobra.
 */
const AL_COMPLETAR = [
  'Otro remate menos. Así se hace.',
  'Bien resuelto. A por el siguiente.',
  'Un remate menos. Seguimos.',
  'Resuelto. Como tiene que ser.',
  'Bien. La lista sigue bajando.',
  'Uno menos dando guerra.',
  'Un problema menos en obra.',
  'Otro frente oficialmente cerrado.',
];

let turno = 0;
export function alCompletar() {
  const frase = AL_COMPLETAR[turno % AL_COMPLETAR.length];
  turno += 1;
  return frase;
}

/** El nombre de pila basta y cabe: «Excelente, Francisco Javier» no. */
export function nombreCorto(usuario) {
  return String(usuario?.nombre || '').trim().split(/\s+/)[0] || '';
}
