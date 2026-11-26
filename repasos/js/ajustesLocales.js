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

/* ─── Juntar en una tarea las fotos de lo mismo ────────────────────

   En un recorrido es normal sacar dos o tres fotos del mismo defecto:
   una de lejos para situarlo y otra de cerca para que se vea. Con una
   tarea por foto salen tres órdenes de trabajo para un solo remate, y
   además desordenadas: «quitar el router» y «repasar la mancha que hay
   detrás» son la misma faena contada en dos trozos.

   Encendido, la IA agrupa esas fotos en una sola tarea con todas
   dentro. Apagado, sale una tarea por foto, que es como estaba antes.

   Nace encendido porque es lo que se parece a cómo se habla en obra
   —«aquí hay que hacer esto», y se dan dos vueltas alrededor—, pero se
   puede apagar: hay quien prefiere una foto por tarea para poder
   cerrarlas por separado. */
export function juntaFotos(usuario) {
  return leer(usuario?.id, 'juntar-fotos-recorrido', true) !== false;
}

export function ponerJuntaFotos(usuario, valor) {
  escribir(usuario?.id, 'juntar-fotos-recorrido', !!valor);
}

/* ─── Cómo se agrupa el PDF de una vivienda ───────────────────────

   El mismo papel sirve para dos faenas distintas, y cada una lo quiere
   ordenado de una manera:

     · Por gremios, que es a quién se le encarga. La hoja se parte en
       trozos y cada industrial se lleva el suyo: el fontanero no tiene
       que leerse los remates de pintura para encontrar los tres que
       son de él.
     · Por estancias, que es por dónde se anda. Vale para el repaso a
       pie de obra, entrando a cada habitación con la hoja en la mano y
       sin volver dos veces al mismo sitio.

   De serie por gremios, que es como se reparte el trabajo aquí. Es una
   preferencia de cada uno y por eso vive en su móvil: en la misma obra
   puede haber quien imprima para repartir y quien imprima para andar. */
export const ORDENES_PDF = [
  { id: 'oficio', rotulo: 'Por gremios', sub: 'Cada industrial encuentra lo suyo de un vistazo' },
  { id: 'estancia', rotulo: 'Por estancias', sub: 'Se recorre la casa habitación por habitación' },
];

export function ordenPdf(usuario) {
  const v = leer(usuario?.id, 'orden-pdf', 'oficio');
  return ORDENES_PDF.some((o) => o.id === v) ? v : 'oficio';
}

export function ponerOrdenPdf(usuario, valor) {
  if (!ORDENES_PDF.some((o) => o.id === valor)) return;
  escribir(usuario?.id, 'orden-pdf', valor);
}
