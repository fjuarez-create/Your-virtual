#!/usr/bin/env node
/* La guardia de la recepción: ninguna escritura del servidor se olvida del «recibido».

   POR QUÉ EXISTE. Desde el 11-11-2026 la bajada de cambios no se guía por «actualizado», que lo
   pone el reloj de cada móvil, sino por «recibido»: el número de orden con el que cada fila
   LLEGÓ al servidor. (Lo apuntado a las 10:00 sin cobertura y subido a las 10:20 entraba «por
   detrás» de quien ya había bajado algo de las 10:03, y no le bajaba nunca.) Ese arreglo le
   pone una condición a todo el código del servidor que venga después:

       toda escritura en una de las siete tablas que bajan a los móviles (listas, tareas,
       comentarios, medios, mensajes, lecturas y entregas) deja la fila con recibido = ''
       («pendiente de numerar»); la siguiente bajada le pone número nuevo y le llega a todos.

   Un UPDATE que se olvide NO DA NINGÚN ERROR: ese cambio, sencillamente, no le baja nunca a
   quien ya pasó por esa fila, y nadie se entera hasta que dos móviles enseñan cosas distintas.
   Como no avisa él, avisa esto: lee el PHP de la API antes de cada despliegue y, si encuentra
   una escritura que se salta la regla, no se sube nada.
   La regla está contada en CLAUDE.md («Una regla del servidor que no se puede olvidar») y en
   la cabecera «La bajada por recepción» de repasos/api/index.php.

   QUÉ MIRA. Todo el PHP de api/: los .php y cualquier otro fichero que lleve «<?php» dentro
   (salvo los .md y los .txt, que lo citan pero no lo son). No mira lo que no viaja con la app:
   api/config.php, api/datos/ y api/uploads/. De cada fichero, las cadenas (entre comillas o en
   un heredoc) que EMPIEZAN por un verbo que cambia filas:
     · UPDATE …                          el caso de todos los días;
     · INSERT … ON DUPLICATE KEY UPDATE  (o ON CONFLICT … DO UPDATE): si la fila ya existe, la
                                         cambia y le conserva el número;
     · DELETE FROM, TRUNCATE, DROP TABLE la fila desaparece del servidor y ningún móvil se
                                         entera: la sigue enseñando para siempre.
   Solo cuentan las que tocan una de las siete tablas, o una tabla que no se puede leer porque
   va en una variable («{$tabla}», «%s», una concatenación). Los comentarios no se miran, ni
   para acusar ni para absolver: un «recibido = ''» comentado no vale.

   CUÁNDO DA UNA SENTENCIA POR BUENA. Cuando su SET (lo que va hasta el WHERE) deja la fila
   pendiente, de una de estas maneras:
     a) lleva «recibido = ''» escrito como una asignación más;
     b) lleva una variable («{$vaciar}») cuya ÚLTIMA asignación, en esa misma función y antes,
        la rellena con «recibido = ''»;
     c) es un SET armado con las claves de un registro («SET {$asignaciones}») y a ESE registro
        se le ha puesto antes «['recibido'] = ''» (upsert, precarga_aplicar). La guardia sigue
        la clave de asignación en asignación: del registro a su copia y de ahí a la lista.
   Si el «recibido = ''» depende de recepcion_hay('x'), x tiene que ser la tabla de la sentencia.

   LAS EXENTAS. Hay sentencias que no dejan la fila pendiente porque su oficio es otro: las que
   NUMERAN (le ponen el número a lo pendiente) y el borrado del arranque limpio (que reinicia a
   todos los móviles). Están apuntadas una a una en EXENTAS, aquí abajo, con su fichero, su
   función y su porqué. La exención es estrecha: en una función que numera solo vale la
   sentencia que pone el número; cualquier otra se juzga como en el resto del código. Y una
   exención que ya no encuentra su sentencia hace fallar la comprobación: o sobra, o la guardia
   ha dejado de ver lo que antes veía.

   QUE MUERDE, Y LO DEMUESTRA EN CADA PASADA. Una guardia que dice «todo bien» porque ha dejado
   de entender el código es peor que no tener ninguna. Así que, antes de dar el visto bueno, se
   prueba a sí misma sobre una copia EN MEMORIA del código (en el disco no toca nada):
     · le quita el «recibido» a todo, y cada sentencia que estaba bien tiene que dejar de estarlo;
     · mete un olvido al final de cada fichero, y tiene que verlo; y mira que ninguna función
       le quede «dentro de una cadena» (si una comilla sin cerrar o un heredoc raro la
       hubieran despistado, ahí se nota);
     · mete, uno a uno, olvidos escritos de todas las formas que sabe leer, y tiene que verlos;
     · y mete código legítimo con cara de sospechoso, y NO tiene que asustarse.
   Si algo de eso falla, la comprobación falla diciendo que la guardia está ciega.

   LO QUE NO CAZA. Es un lector de texto, no un analizador de PHP ni una base de datos. No ve:
     1. Una sentencia cuyo verbo no está escrito al empezar su cadena: el verbo en una variable
        o en una constante ($verbo . ' tareas SET …'), o detrás de otro texto que no sea un «;»
        («WITH … UPDATE», «EXPLAIN UPDATE»).
     2. SQL que no está escrito en el PHP de api/: el que se lea de un fichero o de la base, el
        de un disparador, o el que alguien pase a mano por el panel del alojamiento.
     3. Un SET genérico cuyo registro PIERDE la clave «recibido» por el camino porque se la
        quita una función (array_diff_key, array_filter…). La guardia sigue la clave por las
        asignaciones de la función que escribe; no sabe lo que hacen las funciones a las que
        se la pasa.
     4. Una condición que decide mal: «$hay ? ", recibido = ''" : ''» con $hay mal calculada, o
        con el sí y el no cambiados. Solo se comprueba recepcion_hay('tabla'), con el nombre
        escrito.
     5. Un INSERT o un REPLACE que nombre la columna «recibido» y le dé un número a mano. Y un
        SET que meta dentro de la cadena un valor hecho con el registro entero («SET datos =
        '{$json}'», con $json = json_encode($registro)): lo toma por sus asignaciones.
     6. Lo que no viaja con la app (api/config.php, api/datos/, api/uploads/), los ficheros
        .sql (el servidor solo ejecuta sus CREATE) y todo lo que hay fuera de api/.
   Para lo primero y lo tercero sirve una guardia VIVA, que no lee texto (se usó en el banco de
   pruebas al construir la recepción): un disparador por tabla que da error si una fila ya
   numerada cambia y conserva su número. Con él puesto, cualquier batería de pruebas caza el
   olvido se escriba como se escriba. No es para producción.

   Y LAS FALSAS ALARMAS QUE PUEDE DAR, que son pocas y se arreglan en el sitio:
     · una tabla que no viaja pero va en una variable («UPDATE {$tabla}»): escribe su nombre en
       la sentencia, o apunta la función en EXENTAS como 'ajena';
     · un UPDATE de varias tablas que solo LEE de una de las siete («UPDATE reuniones r JOIN
       tareas t … SET r.total = …»): la guardia no sabe cuál de las dos se escribe;
     · una sentencia repartida entre dos instrucciones («$sql = 'UPDATE tareas SET …';» y, en
       la siguiente, «$sql .= ", recibido = ''";»): se juzga lo que hay hasta el «;». Que el
       SET vaya entero en la misma instrucción, o en una lista de campos que se une después;
     · un «recibido = ?» con el vacío pasado como parámetro: la guardia no ve el valor y lo
       toma por un número puesto a mano. Que el '' vaya escrito en la sentencia;
     · un texto que no es SQL y empieza por «UPDATE tareas …»: que no empiece así;
     · y una falsa «ceguera»: un texto largo (un heredoc) con una línea que empiece por
       «function algo(». La guardia cree que se ha perdido leyendo. Que esa línea no empiece así.

   Uso (lo llama el paso «Comprobar que ninguna escritura se salta la recepción» de
   .github/workflows/deploy-repasos.yml, con «repasos» como carpeta de trabajo):

       node .github/scripts/comprobar-recepcion.mjs [carpeta de la app]

   Sin carpeta, mira «repasos». No necesita nada más que Node (vale desde la versión 18): ni
   dependencias, ni git, ni base de datos. Sale con 0 si todo está bien y con 1 si no.

   SI TOCAS EL LECTOR: la forma de olvido que quieras que vea, a OLVIDOS; el código bueno que no
   deba asustarla, a LEGITIMOS. Y haz la prueba al revés: estropea a propósito la pieza que has
   tocado y pásala. Si sigue diciendo «bien», a su prueba le falta un caso. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Las siete tablas que bajan a los móviles. Tiene que decir lo mismo que el servidor, y se
 * comprueba: una tabla que viaja y que aquí no esté es una tabla sin guardia. El día que sean
 * ocho hay que decirlo aquí, en las listas del servidor, en CLAUDE.md y en los mensajes de este
 * guion, que dicen «siete».
 */
const TABLAS = ['listas', 'tareas', 'comentarios', 'medios', 'mensajes', 'lecturas', 'entregas'];

/**
 * Las sentencias que NO tienen que dejar la fila pendiente, una a una. «vale» dice qué se les
 * consiente:
 *   'numera'  ponerle un valor a «recibido». Solo la sentencia cuyo SET empieza por «recibido =».
 *   'borra'   borrar filas de verdad. Solo si además reinicia a todos los móviles.
 *   'ajena'   llevar la tabla en una variable que NUNCA es una de las siete.
 * Quien añada una tiene que poder escribir su porqué. Si no sabe, no es una exención: es un olvido.
 */
const EXENTAS = [
  {
    fichero: 'api/index.php', funcion: 'recepcion_recoger', vale: 'numera',
    porque: 'es la bajada: le pone a lo pendiente la marca siguiente de la serie, con el cerrojo cogido',
  },
  {
    fichero: 'api/lib/esquema.php', funcion: 'esquema_recepcion', vale: 'numera',
    porque: 'es el relleno de la migración: numera las filas que ya había, y solo antes de encender',
  },
  {
    fichero: 'api/index.php', funcion: 'arranque_limpio', vale: 'borra',
    porque: 'borra las filas y cambia el sello del arranque: cada móvil tira su copia y baja todo de cero',
  },
];

/** Dónde vive este guion, para que los mensajes manden a él. */
const ESTE_GUION = '.github/scripts/comprobar-recepcion.mjs';

/* ─── Leer PHP: qué es código, qué es cadena y qué es comentario ─────────────────────────── */

const CODIGO = 0;
const CADENA = 1;
const COMENTARIO = 2;
const FUERA = 3;   // lo que queda fuera de <?php … ?>: no se ejecuta

const ABRE_PHP = /<\?(?:php(?=\s|$)|=|(?=\s))/gi;
const ABRE_HEREDOC = /<<<[ \t]*(?:'([A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*)'|"([A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*)"|([A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*))\r?\n/y;
const FIN_DE_LINEA = /\r|\n|\?>/g;

/**
 * Recorre un texto de PHP y dice qué es cada carácter (código, cadena, comentario o lo de
 * fuera de PHP) y dónde empieza y acaba cada cadena. No entiende PHP: solo sabe dónde se abre
 * y se cierra cada cosa, que es lo que hace falta para no tomar un comentario por una
 * sentencia ni un «;» de dentro de una cadena por el final de la instrucción.
 */
function leerPhp(texto) {
  const largo = texto.length;
  const clase = new Uint8Array(largo);   // todo CODIGO mientras no se diga otra cosa
  const cadenas = [];
  const pintar = (desde, hasta, que) => { clase.fill(que, desde, Math.min(hasta, largo)); };
  const apuntar = (desde, hasta, cuerpoDesde, cuerpoHasta) => {
    pintar(desde, hasta, CADENA);
    cadenas.push({ desde, hasta, cuerpo: [cuerpoDesde, Math.max(cuerpoDesde, cuerpoHasta)] });
  };

  function finSimple(j) {
    for (; j < largo; j++) {
      if (texto[j] === '\\') j++;
      else if (texto[j] === "'") return j + 1;
    }
    return largo;
  }
  // «{$registro['id']}» dentro de una cadena doble: lo de dentro es PHP, con sus propias cadenas.
  function finInterpolada(j) {
    let hondo = 0;
    for (; j < largo; j++) {
      const c = texto[j];
      if (c === "'") j = finSimple(j + 1) - 1;
      else if (c === '"') j = finDoble(j + 1, '"') - 1;
      else if (c === '{') hondo++;
      else if (c === '}' && --hondo === 0) return j + 1;
    }
    return largo;
  }
  function finDoble(j, comilla) {
    for (; j < largo; j++) {
      const c = texto[j];
      if (c === '\\') j++;
      else if (c === comilla) return j + 1;
      else if ((c === '{' && texto[j + 1] === '$') || (c === '$' && texto[j + 1] === '{')) j = finInterpolada(j) - 1;
    }
    return largo;
  }

  let i = 0;
  let dentro = false;   // ¿dentro de <?php … ?>?
  while (i < largo) {
    if (!dentro) {
      ABRE_PHP.lastIndex = i;
      const abre = ABRE_PHP.exec(texto);
      if (!abre) { pintar(i, largo, FUERA); break; }
      pintar(i, abre.index, FUERA);
      i = abre.index + abre[0].length;
      dentro = true;
      continue;
    }
    const c = texto[i];
    const d = texto[i + 1];
    if (c === '?' && d === '>') { dentro = false; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const fin = c === "'" ? finSimple(i + 1) : finDoble(i + 1, c);
      const cerrada = fin - 1 > i && texto[fin - 1] === c;
      apuntar(i, fin, i + 1, cerrada ? fin - 1 : fin);
      i = fin;
      continue;
    }
    if (c === '<' && d === '<' && texto[i + 2] === '<') {
      ABRE_HEREDOC.lastIndex = i;
      const abre = ABRE_HEREDOC.exec(texto);
      if (abre) {
        // Acaba en su palabra de cierre, sola al empezar una línea (puede ir sangrada).
        const cuerpoDesde = i + abre[0].length;
        const cierre = new RegExp(`\\n[ \\t]*${abre[1] || abre[2] || abre[3]}(?![\\w\\u0080-\\uffff])`, 'g');
        cierre.lastIndex = cuerpoDesde - 1;
        const fin = cierre.exec(texto);
        apuntar(i, fin ? fin.index + fin[0].length : largo, cuerpoDesde, fin ? fin.index : largo);
        i = fin ? fin.index + fin[0].length : largo;
        continue;
      }
    }
    if ((c === '/' && d === '/') || (c === '#' && d !== '[')) {
      FIN_DE_LINEA.lastIndex = i;
      const fin = FIN_DE_LINEA.exec(texto);
      pintar(i, fin ? fin.index : largo, COMENTARIO);
      i = fin ? fin.index : largo;
      continue;
    }
    if (c === '/' && d === '*') {
      const fin = texto.indexOf('*/', i + 2);
      pintar(i, fin < 0 ? largo : fin + 2, COMENTARIO);
      i = fin < 0 ? largo : fin + 2;
      continue;
    }
    i++;
  }
  return { clase, cadenas };
}

/** El mismo texto con los comentarios y lo de fuera de PHP en blanco: mismo largo, mismas líneas. */
function sinComentarios(texto, clase) {
  let limpio = '';
  let desde = 0;
  const tapado = (i) => clase[i] === COMENTARIO || clase[i] === FUERA;
  for (let i = 1; i <= texto.length; i++) {
    if (i < texto.length && tapado(i) === tapado(desde)) continue;
    const trozo = texto.slice(desde, i);
    limpio += tapado(desde) ? trozo.replace(/[^\n]/g, ' ') : trozo;
    desde = i;
  }
  return limpio;
}

/** El «;» de PHP (o el «?>») que acaba la instrucción que pasa por `desde`. */
function finDeInstruccion(texto, clase, desde) {
  for (let i = desde; i < texto.length; i++) {
    if (clase[i] !== CODIGO) continue;
    if (texto[i] === ';' || (texto[i] === '?' && texto[i + 1] === '>')) return i;
  }
  return texto.length;
}

/** Las funciones con nombre de un texto, en orden: la última que empieza antes de una posición es la que la contiene. */
function funcionesDe(limpio, clase) {
  const lista = [];
  for (const m of limpio.matchAll(/\bfunction\s+&?\s*([A-Za-z_]\w*)\s*\(/g)) {
    if (clase[m.index] === CODIGO) lista.push({ nombre: m[1], inicio: m.index });
  }
  return lista;
}

/* ─── El lector: las sentencias que cambian filas, y su veredicto ────────────────────────── */

const BLANCO = String.raw`(?:\s|\\[nrt])`;
/** Una sentencia empieza al empezar su cadena (o detrás de un «;»), con blancos y comentarios de SQL delante si acaso. */
const EMPIEZA = new RegExp(
  String.raw`(^|;)${BLANCO}*(?:\/\*[\s\S]*?\*\/${BLANCO}*|--[^\n]*\n\s*)*`
  + '('
  + 'UPDATE'
  + String.raw`|DELETE\s+(?:[\w\x60.*]+(?:\s*,\s*[\w\x60.*]+)*\s+)?FROM`
  + String.raw`|INSERT\s+(?:(?:IGNORE|LOW_PRIORITY|HIGH_PRIORITY|DELAYED)\s+|OR\s+\w+\s+)*INTO`
  + String.raw`|TRUNCATE(?:\s+TABLE)?`
  + String.raw`|DROP\s+TABLE(?:\s+IF\s+EXISTS)?`
  + String.raw`)\s+`,
  'gi',
);
const VIAJA = new RegExp(String.raw`\b(${TABLAS.join('|')})\b`, 'i');
const COLUMNA = String.raw`(?:[\x60"]?\w+[\x60"]?\s*\.\s*)?[\x60"]?recibido[\x60"]?`;
/** «recibido = ''» como una asignación más del SET: al empezar o detrás de una coma (no dentro de un CASE ni de una subconsulta). */
const DEJA_PENDIENTE = new RegExp(String.raw`(?:^|,|\bSET\b)(?:\s|['".]|\\[nrt])*${COLUMNA}\s*=\s*''`, 'i');
/** «recibido = algo» que no es dejarlo vacío: eso es numerar. */
const PONE_NUMERO = new RegExp(String.raw`(?:^|,|\bSET\b)(?:\s|['".{]|\\[nrt])*${COLUMNA}\s*=(?!\s*'')`, 'i');
/** La sentencia que numera: su SET empieza por «recibido =». */
const EMPIEZA_NUMERANDO = new RegExp(String.raw`^(?:\s|['".{]|\\[nrt])*${COLUMNA}\s*=`, 'i');
const ESCRITO_PENDIENTE = /recibido[`"]?\s*=\s*''/i;
/** Una variable nombrada entera y sin más: ni «$registro['id']», ni «$sent->algo», ni «$funcion(». */
const VARIABLE_DESNUDA = /\$([A-Za-z_]\w*)(?!\w)(?!\s*(?:\[|->|\())/g;
const ASIGNA = /\$([A-Za-z_]\w*)\s*((?:\[[^\]\n]*\]\s*)*)(\.?=)(?![=>])|\bunset\s*\(\s*\$([A-Za-z_]\w*)\s*\[\s*['"]recibido['"]\s*\]/g;

/** La tabla que sigue al verbo, si está escrita con todas sus letras. Null si va en una variable o no se puede leer. */
function tablaTras(texto) {
  const nombre = String.raw`(?:\x60([^\x60]+)\x60|"([A-Za-z_][\w$]*)"|([A-Za-z_][\w$]*))`;
  const m = new RegExp(`^${nombre}(?:\\s*\\.\\s*${nombre})?`).exec(texto);
  if (!m) return null;
  // «tareas{$sufijo}», «tareas%s»: el nombre sigue en algo que no se lee.
  if (/[\w$`{%.]/.test(texto[m[0].length] ?? '')) return null;
  const leida = m[4] || m[5] || m[6] || m[1] || m[2] || m[3];
  return /^[A-Za-z_][\w$]*$/.test(leida) ? leida.toLowerCase() : null;
}

/**
 * El SET: lo que va hasta el WHERE de la propia sentencia (el de una subconsulta entre
 * paréntesis no lo corta) o, si no lo tiene, hasta que se cierra el paréntesis que la envuelve:
 * en «prepare("UPDATE … SET x = ?")->execute([$vaciar])», lo del execute() ya no es el SET.
 */
function hastaElWhere(texto) {
  let hondo = 0;
  let primero = -1;
  for (const m of texto.matchAll(/[()]|\bWHERE\b/gi)) {
    if (m[0] === '(') hondo++;
    else if (m[0] === ')') { if (--hondo < 0 && primero < 0) return texto.slice(0, m.index); }
    else {
      if (primero < 0) primero = m.index;
      if (hondo <= 0) return texto.slice(0, m.index);
    }
  }
  // Si los paréntesis no cuadran, el primero: mejor exigir de más que dar por bueno un WHERE.
  return primero < 0 ? texto : texto.slice(0, primero);
}

/** Si el «recibido = ''» depende de recepcion_hay('x') y x no es la tabla de la sentencia (o no viaja), devuelve x. */
function preguntaPorOtra(texto, tabla) {
  for (const m of texto.matchAll(/\brecepcion_hay\s*\(\s*(['"])([^'"]*)\1\s*\)/g)) {
    if (!TABLAS.includes(m[2]) || (tabla && m[2] !== tabla)) return m[2];
  }
  return null;
}

/**
 * Las variables que, al llegar a una sentencia, LLEVAN el pendiente: las que se han rellenado
 * con «recibido = ''» ($vaciar), los registros a los que se les ha puesto ['recibido'] = '', y
 * las que se han hecho a partir de ellas ($sinId = $registro; $asignaciones = …$sinId…).
 * De cada una cuenta su ÚLTIMA asignación: la que llevó el pendiente y ya no lo lleva, no vale.
 * Devuelve nombre → la tabla por la que pregunta su recepcion_hay(), si pregunta por una.
 */
function conPendiente(limpio, clase, desde, hasta) {
  const llevan = new Map();
  for (const m of limpio.slice(desde, hasta).matchAll(ASIGNA)) {
    const en = desde + m.index;
    if (clase[en] !== CODIGO) continue;
    if (m[4]) { llevan.delete(m[4]); continue; }   // unset($registro['recibido'])
    const [entera, nombre, indices, operador] = m;
    const tras = en + entera.length;
    const valor = limpio.slice(tras, Math.min(finDeInstruccion(limpio, clase, tras), hasta));
    const escrito = ESCRITO_PENDIENTE.test(valor);
    let heredado;
    for (const v of valor.matchAll(VARIABLE_DESNUDA)) {
      if (llevan.has(v[1])) { heredado = llevan.get(v[1]); break; }
    }
    const pregunta = escrito ? (/\brecepcion_hay\s*\(\s*(['"])([^'"]*)\1\s*\)/.exec(valor)?.[2] ?? '') : heredado;
    const indice = indices.replace(/\s+/g, '');
    if (indice === '') {
      if (escrito || heredado !== undefined) llevan.set(nombre, pregunta);
      else if (operador === '=') llevan.delete(nombre);
    } else if (/^\[['"]recibido['"]\]$/.test(indice)) {
      if (operador === '=' && /^\s*(?:''|"")\s*$/.test(valor)) llevan.set(nombre, '');
      else llevan.delete(nombre);
    } else if (indice === '[]' && escrito) {
      llevan.set(nombre, pregunta);   // $campos[] = "recibido = ''"
    }
  }
  return llevan;
}

/**
 * ¿Deja la fila pendiente este trozo de asignaciones (un SET, o la cola de un ON DUPLICATE KEY
 * UPDATE)? Devuelve { bien, como } si sí; { bien: false, tipo: 'pregunta', … } si lo lleva
 * escrito pero preguntando por otra tabla; y null si no lo lleva de ninguna manera.
 */
function quedaPendiente(asignaciones, instruccion, tabla, llevan) {
  const mal = (otra) => ({ bien: false, tipo: 'pregunta', otra });
  if (DEJA_PENDIENTE.test(asignaciones)) {
    const otra = preguntaPorOtra(instruccion, tabla);
    return otra === null ? { bien: true, clase: 'pendiente', como: "lleva «recibido = ''»" } : mal(otra);
  }
  // Con sprintf(), lo que rellena el SET va detrás, entre los argumentos.
  const donde = /%(?:\d+\$)?s/.test(asignaciones) ? instruccion : asignaciones;
  for (const v of donde.matchAll(VARIABLE_DESNUDA)) {
    if (!llevan().has(v[1])) continue;
    const pregunta = llevan().get(v[1]);
    if (pregunta && (!TABLAS.includes(pregunta) || (tabla && pregunta !== tabla))) return mal(pregunta);
    return { bien: true, clase: 'pendiente', como: `por $${v[1]}, que lleva el «recibido = ''»` };
  }
  return null;
}

/**
 * Todas las sentencias de un texto de PHP que cambian filas de una tabla que viaja (o de una
 * que no se sabe cuál es), cada una con su veredicto. `fichero` es su ruta dentro de la app
 * («api/index.php»): las exenciones van por fichero y función.
 */
function mirar(texto, fichero) {
  const { clase, cadenas } = leerPhp(texto);
  const limpio = sinComentarios(texto, clase);
  const funciones = funcionesDe(limpio, clase);
  const vistas = [];

  for (const cadena of cadenas) {
    const cuerpo = limpio.slice(cadena.cuerpo[0], cadena.cuerpo[1]);
    for (const m of cuerpo.matchAll(EMPIEZA)) {
      const en = cadena.cuerpo[0] + m.index + m[0].lastIndexOf(m[2]);
      const trasVerbo = cadena.cuerpo[0] + m.index + m[0].length;
      const verbo = m[2].toUpperCase().split(/\s+/)[0];
      let tabla = tablaTras(limpio.slice(trasVerbo, trasVerbo + 200));

      // La instrucción llega hasta el «;» de SQL, si lo hay en la misma cadena, o hasta el de PHP.
      const finSql = limpio.indexOf(';', trasVerbo);
      const fin = finSql >= 0 && finSql < cadena.cuerpo[1] ? finSql : finDeInstruccion(limpio, clase, cadena.hasta);
      const instruccion = limpio.slice(en, fin).replace(/\/\*[\s\S]*?\*\//g, ' ');

      let funcion = { nombre: '', inicio: 0 };
      for (const f of funciones) {
        if (f.inicio > en) break;
        funcion = f;
      }
      const exenta = EXENTAS.find((e) => e.fichero === fichero && e.funcion === funcion.nombre);
      let llevan = null;
      const pendientes = () => (llevan ??= conPendiente(limpio, clase, funcion.inicio, en));

      const apuntar = (veredicto) => vistas.push({
        fichero,
        en,
        hasta: fin,
        linea: limpio.slice(0, en).split('\n').length,
        funcion: funcion.nombre,
        verbo,
        tabla,
        sentencia: instruccion.replace(/\s+/g, ' ').trim(),
        ...veredicto,
      });
      const ajena = () => {
        if (tabla || exenta?.vale !== 'ajena') return false;
        apuntar({ bien: true, clase: 'ajena', exenta, como: 'su tabla va en una variable que nunca es una de las siete (está en EXENTAS)' });
        return true;
      };

      if (verbo === 'INSERT') {
        // Un INSERT deja la fila pendiente él solo (la columna nace vacía). Lo que no vale es
        // que, si la fila ya existe, la cambie conservándole el número.
        const cola = /\bON\s+DUPLICATE\s+KEY\s+UPDATE\b|\bON\s+CONFLICT\b[\s\S]*?\bDO\s+UPDATE\s+SET\b/i.exec(instruccion);
        if (!cola || (tabla && !TABLAS.includes(tabla)) || ajena()) continue;
        const asignaciones = hastaElWhere(instruccion.slice(cola.index + cola[0].length));
        apuntar(quedaPendiente(asignaciones, instruccion, tabla, pendientes) ?? { bien: false, tipo: 'insert' });
        continue;
      }

      if (verbo !== 'UPDATE') {
        // DELETE, TRUNCATE y DROP: una fila borrada de verdad no le baja a nadie.
        if ((tabla && !TABLAS.includes(tabla)) || ajena()) continue;
        if (exenta?.vale === 'borra') apuntar({ bien: true, clase: 'borra', exenta, como: 'borra, y reinicia a todos los móviles (está en EXENTAS)' });
        else apuntar({ bien: false, tipo: 'borra' });
        continue;
      }

      const corte = /\bSET\b/i.exec(instruccion);
      if (tabla && !TABLAS.includes(tabla)) {
        // Un UPDATE de varias tablas se mira si NOMBRA una que viaja, vaya o no la primera.
        const otra = corte ? VIAJA.exec(instruccion.slice(0, corte.index)) : null;
        if (!otra) continue;
        tabla = otra[1].toLowerCase();
      }
      if (ajena()) continue;
      const set = corte ? hastaElWhere(instruccion.slice(corte.index + corte[0].length)) : '';
      const pendiente = quedaPendiente(set, instruccion, tabla, pendientes);
      if (pendiente) apuntar(pendiente);
      else if (PONE_NUMERO.test(set)) {
        // Numerar solo se le consiente a la sentencia que pone el número, en su función.
        if (exenta?.vale === 'numera' && EMPIEZA_NUMERANDO.test(set)) apuntar({ bien: true, clase: 'numera', exenta, como: 'numera (está en EXENTAS)' });
        else apuntar({ bien: false, tipo: 'numera' });
      } else apuntar({ bien: false, tipo: tabla ? 'update' : 'variable', enExenta: exenta?.vale === 'numera' });
    }
  }
  return vistas;
}

/* ─── La prueba de la guardia: olvidos a propósito, en memoria ───────────────────────────── */

/** PHP escrito como PHP: quita la línea en blanco del principio y la sangría que comparten todas. */
function php(trozos) {
  const lineas = trozos.raw[0].replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const sangria = Math.min(...lineas.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return lineas.map((l) => l.slice(sangria)).join('\n');
}

/** El olvido de todos los días: el que se mete al final de cada fichero para ver si la guardia llega despierta. */
const OLVIDO = php`
  function guardia_olvido(string $id): void
  {
      bd()->prepare('UPDATE tareas SET estado = ?, actualizado = ? WHERE id = ?')->execute(['resuelta', ahora_iso(), $id]);
  }`;

/** Olvidos, cada uno escrito de una forma. La guardia tiene que ver UNO en cada trozo. */
const OLVIDOS = [
  ['un UPDATE que se olvida, escrito como en la casa', OLVIDO],
  ['uno en minúsculas («update tareas set … where …»)', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('update tareas set estado = ? where id = ?')->execute(['resuelta', $id]);
    }`],
  ['uno en un heredoc (<<<SQL)', php`
    function guardia_olvido(string $id): void
    {
        $sql = <<<SQL
            UPDATE tareas SET estado = ? WHERE id = ?
            SQL;
        bd()->prepare($sql)->execute(['resuelta', $id]);
    }`],
  ['uno con un comentario de SQL delante («/* arreglo */ UPDATE …»)', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('/* arreglo */ UPDATE tareas SET estado = ? WHERE id = ?')->execute(['resuelta', $id]);
    }`],
  ['uno con la tabla entre acentos graves (UPDATE `tareas`)', "function guardia_olvido(string $id): void\n{\n    bd()->prepare('UPDATE `tareas` SET estado = ? WHERE id = ?')->execute(['resuelta', $id]);\n}"],
  ['uno con la tabla en una variable («UPDATE {$tabla} SET borrada = 1 …»)', php`
    function guardia_olvido(string $tabla, string $id): void
    {
        bd()->prepare("UPDATE {$tabla} SET borrada = 1 WHERE id = ?")->execute([$id]);
    }`],
  ['uno con la tabla concatenada («UPDATE » . $tabla . …)', php`
    function guardia_olvido(string $tabla, string $id): void
    {
        bd()->prepare('UPDATE ' . $tabla . ' SET borrada = 1 WHERE id = ?')->execute([$id]);
    }`],
  ['uno armado con sprintf («UPDATE %s SET …»)', php`
    function guardia_olvido(string $tabla, string $id): void
    {
        bd()->prepare(sprintf('UPDATE %s SET borrada = 1 WHERE id = ?', $tabla))->execute([$id]);
    }`],
  ['uno de dos tablas, con la que no viaja delante («UPDATE usuarios u JOIN tareas t …»)', php`
    function guardia_olvido(): void
    {
        bd()->exec('UPDATE usuarios u JOIN tareas t ON t.creado_por = u.id SET t.creado_por_nombre = u.nombre');
    }`],
  ['uno detrás de otra sentencia, en la misma cadena («…; UPDATE …»)', php`
    function guardia_olvido(): void
    {
        bd()->exec("DELETE FROM intentos; UPDATE lecturas SET borrada = 1");
    }`],
  ['un «INSERT … ON DUPLICATE KEY UPDATE» (la fila que ya existe cambia y conserva su número)', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('INSERT INTO mensajes (id, texto) VALUES (?, ?) ON DUPLICATE KEY UPDATE texto = VALUES(texto)')->execute([$id, 'x']);
    }`],
  ['un «INSERT … ON CONFLICT … DO UPDATE» (lo mismo, dicho en SQLite)', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('INSERT INTO listas (id, nombre) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre')->execute([$id, 'x']);
    }`],
  ['un DELETE de verdad (la fila desaparece del servidor y ningún móvil se entera)', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('DELETE FROM comentarios WHERE id = ?')->execute([$id]);
    }`],
  ['un TRUNCATE (lo mismo, con todas las filas)', php`
    function guardia_olvido(): void
    {
        bd()->exec('TRUNCATE TABLE lecturas');
    }`],
  ["uno que solo nombra «recibido» en el WHERE («… WHERE recibido = ''»)", php`
    function guardia_olvido(): void
    {
        bd()->prepare("UPDATE medios SET borrada = 1 WHERE recibido = ''")->execute();
    }`],
  ["uno con el «where» en minúsculas y «recibido = ''» solo en la condición", php`
    function guardia_olvido(): void
    {
        bd()->exec("UPDATE medios SET borrada = 1 where recibido = ''");
    }`],
  ["uno con la condición en una variable («WHERE {$donde}», y es $donde quien dice «recibido = ''»)", php`
    function guardia_olvido(): void
    {
        $donde = "recibido = ''";
        bd()->exec("UPDATE medios SET borrada = 1 WHERE {$donde}");
    }`],
  ["uno con «recibido = ''» dentro de un CASE (se compara, no se asigna)", php`
    function guardia_olvido(): void
    {
        bd()->exec("UPDATE tareas SET estado = CASE WHEN recibido = '' THEN 'nueva' ELSE estado END WHERE borrada = 0");
    }`],
  ["uno con «recibido = ''» solo en una subconsulta del SET", php`
    function guardia_olvido(): void
    {
        bd()->exec("UPDATE tareas SET orden = (SELECT COUNT(*) FROM listas WHERE recibido = '') WHERE borrada = 0");
    }`],
  ["uno con el «recibido = ''» dentro de un comentario de SQL", php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare("UPDATE tareas SET estado = ? /* , recibido = '' */ WHERE id = ?")->execute(['resuelta', $id]);
    }`],
  ["dos sentencias en una cadena, y el «recibido = ''» es de la otra", php`
    function guardia_olvido(): void
    {
        bd()->exec("UPDATE tareas SET estado = 1; UPDATE usuarios SET avatar = '', recibido = ''");
    }`],
  ["uno con el «recibido = ''» comentado", php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('UPDATE tareas SET estado = ?'   // , recibido = ''
            . ' WHERE id = ?')->execute(['resuelta', $id]);
    }`],
  ["uno con una variable que llevó «recibido = ''» y ya no lo lleva", php`
    function guardia_olvido(string $id): void
    {
        $vaciar = ", recibido = ''";
        $vaciar = '';
        bd()->prepare("UPDATE tareas SET estado = ?{$vaciar} WHERE id = ?")->execute(['resuelta', $id]);
    }`],
  ["uno con un SET genérico de OTRO registro (el ['recibido'] = '' se le pone a una variable distinta)", php`
    function guardia_olvido(array $registro, array $otro): void
    {
        $otro['recibido'] = '';
        $asignaciones = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($registro)));
        bd()->prepare("UPDATE tareas SET {$asignaciones} WHERE id = ?")->execute([...array_values($registro), $registro['id']]);
    }`],
  ["uno que mete en la cadena un valor del registro («{$registro['estado']}») y no sus asignaciones", php`
    function guardia_olvido(array $registro): void
    {
        $registro['recibido'] = '';
        bd()->prepare("UPDATE tareas SET estado = '{$registro['estado']}' WHERE id = ?")->execute([$registro['id']]);
    }`],
  ["uno que le pasa la variable con el «recibido = ''» al execute(), y no al SET", php`
    function guardia_olvido(string $id): void
    {
        $vaciar = ", recibido = ''";
        bd()->prepare("UPDATE tareas SET estado = ?")->execute([$vaciar]);
    }`],
  ["uno con una variable que quien rellena con «recibido = ''» es OTRA función", php`
    function guardia_antes(): string
    {
        $vaciar = ", recibido = ''";
        return $vaciar;
    }

    function guardia_olvido(string $id, string $vaciar): void
    {
        bd()->prepare("UPDATE tareas SET estado = ?{$vaciar} WHERE id = ?")->execute(['resuelta', $id]);
    }`],
  ['uno con un SET genérico al que se le quita la clave (unset)', php`
    function guardia_olvido(array $registro): void
    {
        $registro['recibido'] = '';
        unset($registro['recibido']);
        $asignaciones = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($registro)));
        bd()->prepare("UPDATE entregas SET {$asignaciones} WHERE id = ?")->execute([...array_values($registro), $registro['id']]);
    }`],
  ["uno que pregunta recepcion_hay() por una tabla que no viaja (el «recibido = ''» está escrito y no se aplica nunca)", php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare("UPDATE medios SET borrada = 1" . (recepcion_hay('medio') ? ", recibido = ''" : '') . ' WHERE id = ?')->execute([$id]);
    }`],
  ['uno que pregunta recepcion_hay() por otra de las siete', php`
    function guardia_olvido(string $id): void
    {
        $vaciar = recepcion_hay('listas') ? ", recibido = ''" : '';
        bd()->prepare("UPDATE medios SET borrada = 1{$vaciar} WHERE id = ?")->execute([$id]);
    }`],
  ['uno que le pone un número a mano («SET recibido = ?»), fuera de las funciones que numeran', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('UPDATE tareas SET recibido = ? WHERE id = ?')->execute([ahora_iso(), $id]);
    }`],
];

/**
 * Código legítimo con cara de sospechoso. La guardia NO tiene que ver ningún olvido en él; el
 * número dice cuántas sentencias sobre las tablas que viajan tiene que ver (y dar por buenas).
 */
const LEGITIMOS = [
  ['una tabla que no viaja (usuarios)', 0, php`
    function guardia_legitimo(string $id): void
    {
        bd()->prepare('UPDATE usuarios SET nombre = ?, actualizado = ? WHERE id = ?')->execute(['x', ahora_iso(), $id]);
    }`],
  ['tablas que no viajan y se llaman parecido (tareas_obra, lecturas_de_algo, encargos)', 0, php`
    function guardia_legitimo(string $id): void
    {
        bd()->prepare('UPDATE tareas_obra SET estado = ? WHERE id = ?')->execute(['x', $id]);
        bd()->prepare('UPDATE lecturas_de_algo SET visto = 1 WHERE id = ?')->execute([$id]);
        bd()->prepare("UPDATE encargos SET {$asignaciones} WHERE id = ?")->execute([$id]);
        bd()->prepare('DELETE FROM entregas_avisos WHERE id = ?')->execute([$id]);
    }`],
  ['un comentario que cita una sentencia entre comillas', 0, php`
    function guardia_legitimo(): void
    {
        // Antes aquí había un 'UPDATE tareas SET estado = ? WHERE id = ?' que se olvidaba.
        /* Y un "DELETE FROM medios WHERE id = ?" que borraba de verdad. */
        # 'UPDATE listas SET borrada = 1'
    }`],
  ['un texto que nombra la sentencia sin empezar por ella', 0, php`
    function guardia_legitimo(): void
    {
        error_log('No se ha podido hacer el UPDATE tareas SET estado de la migración.');
        $ayuda = "Para rehacerlo: UPDATE tabla SET recibido = '' (ver la cabecera).";
    }`],
  ['el verbo suelto, que no es una sentencia', 0, php`
    function guardia_legitimo(string $accion): bool
    {
        return in_array($accion, ['insert', 'update', 'delete'], true) || $accion === 'UPDATE';
    }`],
  ['leer de una tabla que viaja', 0, php`
    function guardia_legitimo(): array
    {
        return bd()->query("SELECT id FROM tareas WHERE recibido = '' LIMIT 5")->fetchAll();
    }`],
  ['escribir en otra tabla con lo que se lee de una que viaja', 0, php`
    function guardia_legitimo(): void
    {
        bd()->exec('UPDATE encargos SET total = (SELECT COUNT(*) FROM tareas WHERE tareas.lista_id = encargos.id) WHERE borrada = 0');
    }`],
  ['un INSERT sin más (la fila nace pendiente ella sola)', 0, php`
    function guardia_legitimo(string $id): void
    {
        bd()->prepare('INSERT INTO tareas (id, titulo) VALUES (?, ?)')->execute([$id, 'x']);
    }`],
  ['borrar de una tabla que no viaja', 0, php`
    function guardia_legitimo(string $id): void
    {
        bd()->prepare('DELETE FROM sesiones WHERE usuario_id = ?')->execute([$id]);
        bd()->exec("DELETE FROM meta WHERE clave = 'arranque'");
    }`],
  ["un UPDATE bien hecho, con su «recibido = ''»", 1, php`
    function guardia_legitimo(string $id): void
    {
        bd()->prepare("UPDATE tareas SET estado = ?, actualizado = ?, recibido = '' WHERE id = ?")->execute(['x', ahora_iso(), $id]);
    }`],
  ['uno bien hecho, como en la casa (con recepcion_hay() de su tabla)', 1, php`
    function guardia_legitimo(string $id): void
    {
        bd()->prepare('UPDATE listas SET borrada = 1, actualizado = ?'
            . (recepcion_hay('listas') ? ", recibido = ''" : '') . ' WHERE id = ?')->execute([ahora_iso(), $id]);
    }`],
  ['uno bien hecho, con la variable «{$vaciar}»', 1, php`
    function guardia_legitimo(PDO $pdo, array $columnas): void
    {
        $vaciar = in_array('recibido', $columnas, true) ? ", recibido = ''" : '';
        $pdo->exec("UPDATE comentarios
                       SET texto = ''{$vaciar}
                     WHERE borrada = 1");
    }`],
  ['uno bien hecho, con una subconsulta (y su WHERE) dentro del SET', 1, php`
    function guardia_legitimo(): void
    {
        bd()->exec("UPDATE tareas SET orden = (SELECT COUNT(*) FROM listas WHERE listas.id = tareas.lista_id), recibido = '' WHERE borrada = 0");
    }`],
  ['un SET genérico bien hecho (al registro que se escribe se le pone la clave)', 1, php`
    function guardia_legitimo(array $registro): void
    {
        $registro['recibido'] = '';
        $sinId = $registro;
        unset($sinId['id']);
        $asignaciones = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($sinId)));
        bd()->prepare("UPDATE mensajes SET {$asignaciones} WHERE id = ?")->execute([...array_values($sinId), $registro['id']]);
    }`],
  ['un SET armado con una lista de campos que lleva el suyo', 1, php`
    function guardia_legitimo(string $id): void
    {
        $campos = ['estado = ?'];
        $campos[] = "recibido = ''";
        bd()->prepare('UPDATE entregas SET ' . implode(', ', $campos) . ' WHERE id = ?')->execute(['x', $id]);
    }`],
  ['un SET genérico bien hecho, armado con sprintf()', 1, php`
    function guardia_legitimo(string $tabla, array $registro): void
    {
        $registro['recibido'] = '';
        $asignaciones = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($registro)));
        bd()->prepare(sprintf('UPDATE %s SET %s WHERE id = ?', $tabla, $asignaciones))->execute([...array_values($registro), $registro['id']]);
    }`],
  ["un «ON DUPLICATE KEY UPDATE» con su «recibido = ''»", 1, php`
    function guardia_legitimo(string $id): void
    {
        bd()->prepare("INSERT INTO mensajes (id, texto) VALUES (?, ?) ON DUPLICATE KEY UPDATE texto = VALUES(texto), recibido = ''")->execute([$id, 'x']);
    }`],
];

/**
 * La guardia contra sí misma. Devuelve lo que NO ha sabido ver (vacío = muerde) y cuánto ha
 * probado. Todo sobre copias en memoria de `textos` (ruta → contenido): el disco no se toca.
 */
function probarLaGuardia(textos, vistas) {
  const fallos = [];
  const cuenta = { quitados: 0, ficheros: 0, olvidos: 0, legitimos: 0 };
  const lineasDe = (texto) => texto.split('\n').length;
  // Lo que la guardia ve de más al añadirle un trozo de PHP al final de un fichero.
  const alAnadir = (fichero, trozo) => {
    const texto = textos[fichero];
    return mirar(`${texto}\n<?php\n${trozo}\n`, fichero).filter((v) => v.linea > lineasDe(texto));
  };

  // 1 · Sin su «recibido», lo que estaba bien tiene que dejar de estarlo.
  for (const [fichero, texto] of Object.entries(textos)) {
    const sinRecibido = mirar(texto.replace(/recibido(?=['"`]?\s*\]?\s*=\s*'')/g, 'olvidado'), fichero);
    for (const v of vistas.filter((x) => x.fichero === fichero && x.bien && x.clase === 'pendiente')) {
      cuenta.quitados++;
      const ahora = sinRecibido.find((x) => x.en === v.en);
      if (!ahora || ahora.bien) fallos.push(`a la sentencia de ${fichero}, línea ${v.linea} (${v.funcion || 'fuera de función'}), se le quita el «recibido = ''» y la sigue dando por buena`);
    }
  }

  // 2 · Que no se pierde leyendo: el olvido de todos los días, al final de cada fichero, y
  //     ninguna función declarada «dentro de una cadena» (eso es que una comilla la ha
  //     despistado y está tomando el código por texto: ahí dentro no vería un olvido).
  for (const [fichero, texto] of Object.entries(textos)) {
    cuenta.ficheros++;
    const nuevas = alAnadir(fichero, OLVIDO);
    if (nuevas.length !== 1 || nuevas[0].bien) fallos.push(`no ve un olvido puesto al final de ${fichero} (algo de ese fichero la despista: una cadena sin cerrar, un heredoc, un «?>»)`);
    const { clase } = leerPhp(texto);
    for (const m of texto.matchAll(/^[ \t]*(?:(?:public|protected|private|static|final|abstract)\s+)*(function\s+&?\s*([A-Za-z_]\w*)\s*\()/gm)) {
      if (clase[m.index + m[0].length - m[1].length] !== CADENA) continue;
      fallos.push(`en ${fichero}, línea ${lineasDe(texto.slice(0, m.index))}, toma la declaración de ${m[2]}() por el interior de una cadena: se ha perdido leyendo ese fichero (una comilla sin cerrar más arriba, o una forma de escribir PHP que no entiende). Si de verdad es un texto que cita una función, que no empiece la línea por «function»`);
      break;
    }
  }

  // 3 · Los olvidos, cada uno escrito de una forma, y el código legítimo.
  const principal = textos['api/index.php'] !== undefined ? 'api/index.php' : Object.keys(textos)[0];
  for (const [que, trozo] of OLVIDOS) {
    cuenta.olvidos++;
    const nuevas = alAnadir(principal, trozo).filter((v) => !v.bien);
    if (nuevas.length !== 1) fallos.push(`no ve ${que}`);
  }
  for (const exenta of EXENTAS.filter((e) => e.vale === 'numera' && textos[e.fichero] !== undefined)) {
    // La exención es de la sentencia que numera, no de la función entera ni de su nombre.
    cuenta.olvidos += 2;
    const dentro = `function ${exenta.funcion}(PDO $pdo): void\n{\n    $pdo->exec("UPDATE mensajes SET borrada = 1 WHERE texto = ''");\n}`;
    if (alAnadir(exenta.fichero, dentro).filter((v) => !v.bien).length !== 1) fallos.push(`no ve un olvido metido dentro de ${exenta.funcion}() (la función no está exenta entera: solo su sentencia que numera)`);
    const otro = Object.keys(textos).find((f) => !EXENTAS.some((e) => e.fichero === f && e.funcion === exenta.funcion));
    const fuera = `function ${exenta.funcion}(PDO $pdo): void\n{\n    $pdo->exec('UPDATE tareas SET recibido = actualizado');\n}`;
    if (otro && alAnadir(otro, fuera).filter((v) => !v.bien).length !== 1) fallos.push(`da por buena una función que se llama ${exenta.funcion}() en otro fichero (${otro}) y pone números`);
  }
  for (const [que, cuantas, trozo] of LEGITIMOS) {
    cuenta.legitimos++;
    const nuevas = alAnadir(principal, trozo);
    if (nuevas.some((v) => !v.bien)) fallos.push(`se asusta sin razón con ${que}`);
    else if (nuevas.length !== cuantas) fallos.push(`no mira como debe ${que} (ve ${nuevas.length} sentencias y son ${cuantas})`);
  }
  return { fallos, cuenta };
}

/* ─── Decirlo de forma que se entienda dentro de un año ──────────────────────────────────── */

/** Qué pasa y qué hacer, según el olvido. `rutas` trae cómo se llaman aquí los ficheros que se citan. */
function explicar(v, rutas) {
  const tabla = v.tabla ? `«${v.tabla}»` : 'una tabla que va en una variable (puede ser cualquiera de las siete)';
  const comoAjena = `Si esa tabla no puede ser NUNCA una de las siete: escribe su nombre en la sentencia, o apunta la función en la lista EXENTAS de ${ESTE_GUION} con vale: 'ajena' y su porqué.`;
  switch (v.tipo) {
    case 'numera':
      return {
        titulo: 'La recepción: un número puesto a mano',
        pasa: `Esta sentencia le PONE un valor a «recibido» en ${tabla}, en vez de dejarlo vacío. Eso es numerar, y solo numeran las sentencias apuntadas en la lista EXENTAS de ${ESTE_GUION} (${EXENTAS.filter((e) => e.vale === 'numera').map((e) => `${e.funcion}()`).join(' y ')}): un número puesto por otro camino se salta la serie, puede quedar por debajo de la marca de quien ya sincronizó, y esa fila no le baja.`,
        hacer: `Lo normal es que lo que quieras sea «recibido = ''»: dejarla pendiente, que el número se lo pone la siguiente bajada. Si de verdad es una sentencia nueva que NUMERA, apúntala en EXENTAS (${ESTE_GUION}) con su fichero, su función, vale: 'numera' y su porqué; su SET tiene que empezar por «recibido =».`,
      };
    case 'insert':
      return {
        titulo: 'La recepción: un INSERT que cambia la fila que ya existe',
        pasa: `Este INSERT sobre ${tabla}, si la fila ya existe, la CAMBIA (ON DUPLICATE KEY UPDATE / ON CONFLICT … DO UPDATE) y le conserva el número que tenía: no la deja con «recibido = ''».`,
        hacer: `Añade «recibido = ''» a la parte del UPDATE («… ON DUPLICATE KEY UPDATE texto = VALUES(texto), recibido = ''»), o guarda con upsert() (${rutas.indice}), que ya lo hace. ${v.tabla ? '' : comoAjena}`.trim(),
      };
    case 'borra':
      return {
        titulo: 'La recepción: un borrado que no le llega a nadie',
        pasa: `Esta sentencia BORRA filas de ${tabla}. Una fila que desaparece del servidor no le baja a nadie: los móviles que ya la tienen la siguen enseñando para siempre.`,
        hacer: `No se borra: se marca. «UPDATE … SET borrada = 1, actualizado = ?, recibido = ''», como borrar_medio() en ${rutas.indice}. El único borrado de verdad que vale es el que además reinicia a todos los móviles (arranque_limpio(), con el sello del arranque); si este es otro así, apúntalo en la lista EXENTAS de ${ESTE_GUION} con vale: 'borra' y su porqué. ${v.tabla ? '' : comoAjena}`.trim(),
      };
    case 'pregunta':
      return {
        titulo: 'La recepción: se pregunta por otra tabla',
        pasa: `El «recibido = ''» está escrito, pero depende de recepcion_hay('${v.otra}') y la sentencia es sobre ${tabla}. ${TABLAS.includes(v.otra)
          ? 'Se pregunta por una tabla y se escribe en otra: el día que la primera no tenga la columna y la segunda sí, el cambio se guarda sin dejar la fila pendiente'
          : `«${v.otra}» no es una de las siete, y recepcion_hay() contesta que no a todo lo que no lo sea: el «recibido = ''» no se aplica nunca`}, y sin ningún error.`,
        hacer: v.tabla ? `Pregunta por la tabla de la sentencia: recepcion_hay('${v.tabla}').` : 'Pregunta por la tabla de la sentencia: recepcion_hay($tabla), con la misma variable.',
      };
    case 'variable':
      return {
        titulo: 'La recepción: una escritura que no deja la fila pendiente',
        pasa: `Este UPDATE lleva la tabla en una variable (o escrita de una forma que no se puede leer), así que puede ser una de las siete que bajan a los móviles, y su SET no deja la fila con «recibido = ''».`,
        hacer: `Si la tabla puede ser una de las siete: que su SET lleve «recibido = ''» (mira cómo lo hacen upsert() y recepcion_pendiente() en ${rutas.indice}). ${comoAjena}`,
      };
    default:
      return {
        titulo: 'La recepción: una escritura que no deja la fila pendiente',
        pasa: `Este UPDATE cambia filas de ${tabla}, que es una de las siete tablas que bajan a los móviles, y no las deja con «recibido = ''».${v.enExenta ? ` (${v.funcion}() está en EXENTAS, pero la exención solo vale para su sentencia que numera: la que empieza su SET por «recibido =».)` : ''}`,
        hacer: `Añade «recibido = ''» al SET de esta sentencia. Así lo hace borrar_medio() en ${rutas.indice}: «… SET borrada = 1, actualizado = ?' . (recepcion_hay('medios') ? ", recibido = ''" : '') . ' WHERE id = ?». Y si lo que guardas es un registro entero, usa upsert(), que ya lo pone.`,
      };
  }
}

const enUnaLinea = (texto) => String(texto).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
/** Una anotación de las que GitHub señala sobre el fichero y sube al resumen del despliegue. */
function anotar(mensaje, { titulo, fichero, linea } = {}) {
  const propiedad = (texto) => enUnaLinea(texto).replace(/:/g, '%3A').replace(/,/g, '%2C');
  const donde = [
    fichero ? `file=${propiedad(fichero)}` : '',
    linea ? `line=${linea}` : '',
    titulo ? `title=${propiedad(titulo)}` : '',
  ].filter(Boolean).join(',');
  console.log(`::error${donde ? ` ${donde}` : ''}::${enUnaLinea(mensaje)}`);
}

/** Las líneas del fichero en las que está la sentencia, tal como están escritas y con su número. */
function codigoDe(texto, v, tope = 8) {
  const lineas = texto.split('\n');
  const ultima = Math.min(texto.slice(0, v.hasta).split('\n').length, v.linea + tope - 1, lineas.length);
  const salida = [];
  for (let n = v.linea; n <= ultima; n++) salida.push(`    ${String(n).padStart(5)} │ ${lineas[n - 1].replace(/\r$/, '')}`);
  if (texto.slice(0, v.hasta).split('\n').length > ultima) salida.push('          │ …');
  return salida.join('\n');
}

/** Parte un texto largo en renglones, con su sangría. */
function renglones(texto, sangria = '    ', ancho = 96) {
  const lineas = [];
  let linea = '';
  for (const palabra of texto.split(/\s+/)) {
    if (linea && (linea.length + 1 + palabra.length) > ancho - sangria.length) { lineas.push(linea); linea = palabra; }
    else linea = linea ? `${linea} ${palabra}` : palabra;
  }
  if (linea) lineas.push(linea);
  return lineas.map((l) => sangria + l).join('\n');
}

/* ─── La comprobación ────────────────────────────────────────────────────────────────────── */

/** El PHP de api/: los .php y lo que lleve «<?php» dentro, menos lo que no viaja con la app. */
function ficherosDePhp(api) {
  const salida = [];
  const recorrer = (carpeta, raiz) => {
    for (const nombre of readdirSync(carpeta).sort()) {
      const ruta = join(carpeta, nombre);
      if (statSync(ruta).isDirectory()) {
        // datos/ y uploads/ viajan vacías: la base, las claves y las fotos viven solo en el servidor.
        if (!(raiz && ['datos', 'uploads'].includes(nombre))) recorrer(ruta, false);
      } else if (raiz && nombre === 'config.php') {
        continue;   // lo crea el instalador y vive solo en el servidor
      } else if (nombre.endsWith('.php')) {
        salida.push(ruta);
      } else if (!/\.(?:md|txt)$/i.test(nombre) && statSync(ruta).size < 2 * 1024 * 1024 && /<\?(?:php|=)/i.test(readFileSync(ruta, 'utf8'))) {
        salida.push(ruta);   // un .inc, un .phtml: PHP lo ejecuta igual si alguien lo incluye
      }
    }
  };
  recorrer(api, true);
  return salida;
}

function principal() {
  const app = resolve(process.argv[2] || 'repasos');
  const api = join(app, 'api');
  // Las rutas, como las entiende GitHub (desde la raíz del repositorio) y con «/».
  const repositorio = process.env.GITHUB_WORKSPACE && !relative(process.env.GITHUB_WORKSPACE, app).startsWith('..')
    ? resolve(process.env.GITHUB_WORKSPACE) : resolve(app, '..');
  const enElRepositorio = (fichero) => relative(repositorio, join(app, fichero)).split('\\').join('/');
  const rutas = { indice: enElRepositorio('api/index.php') };
  const enGitHub = process.env.GITHUB_ACTIONS === 'true';
  const plegar = (titulo, pintar) => {
    console.log(enGitHub ? `::group::${titulo}` : `\n── ${titulo}`);
    pintar();
    if (enGitHub) console.log('::endgroup::');
  };
  let mal = false;

  console.log(`La guardia de la recepción · ${api}`);
  if (!existsSync(api) || !statSync(api).isDirectory()) {
    anotar(`No encuentro la carpeta api/ dentro de ${app}. Uso: node ${ESTE_GUION} [carpeta de la app]. Sin el PHP de la API delante no hay nada que comprobar, y eso no es un visto bueno.`, { titulo: 'La guardia de la recepción no tiene qué mirar' });
    process.exit(1);
  }
  const textos = Object.fromEntries(ficherosDePhp(api).map((ruta) => [relative(app, ruta).split('\\').join('/'), readFileSync(ruta, 'utf8')]));
  const deMas = Object.keys(textos).filter((f) => !f.endsWith('.php'));
  if (Object.keys(textos).length === 0) {
    anotar(`En ${api} no hay ni un fichero de PHP. La guardia de la recepción no tiene qué mirar, y eso no es un visto bueno: ¿es esa la carpeta de la app?`, { titulo: 'La guardia de la recepción no tiene qué mirar' });
    process.exit(1);
  }

  /* 1 · Que la guardia mira las tablas que son: su lista y las del servidor dicen lo mismo. */
  const listas = [];
  for (const [fichero, texto] of Object.entries(textos)) {
    const limpio = sinComentarios(texto, leerPhp(texto).clase);
    for (const m of limpio.matchAll(/\bconst\s+(\w*TABLAS_QUE_VIAJAN|RECEPCION_ORDEN)\s*=\s*\[([^\]]*)\]/g)) {
      listas.push({ fichero, linea: limpio.slice(0, m.index).split('\n').length, nombre: m[1], tablas: [...m[2].matchAll(/['"]([^'"]+)['"]/g)].map((t) => t[1]) });
    }
  }
  const igual = (lista) => lista.length === TABLAS.length && [...lista].sort().join() === [...TABLAS].sort().join();
  if (!listas.some((l) => /TABLAS_QUE_VIAJAN$/.test(l.nombre))) {
    mal = true;
    anotar(`El servidor ya no declara TABLAS_QUE_VIAJAN (la lista de las tablas que bajan a los móviles) en ningún fichero de api/. La guardia de la recepción mira ${TABLAS.join(', ')} y no puede comprobar que sigan siendo esas. Si la lista ha cambiado de nombre o de sitio, enséñaselo a ${ESTE_GUION} (busca TABLAS_QUE_VIAJAN). Si es que esta API no tiene la bajada por recepción, no es la de hoy.`, { titulo: 'La recepción: no encuentro la lista de tablas del servidor', fichero: rutas.indice });
  }
  for (const l of listas.filter((x) => !igual(x.tablas))) {
    mal = true;
    anotar(`${l.nombre} dice que las tablas que bajan a los móviles son ${l.tablas.join(', ')}, y la guardia de la recepción mira ${TABLAS.join(', ')}. Tienen que decir lo mismo: una tabla que viaja y que la guardia no mira es una tabla en la que cualquier UPDATE puede olvidarse del «recibido» sin que nadie lo vea. Pon de acuerdo las listas del servidor (TABLAS_QUE_VIAJAN y RECEPCION_ORDEN en api/index.php, ESQUEMA_TABLAS_QUE_VIAJAN en api/lib/esquema.php), la lista TABLAS de ${ESTE_GUION} (y sus mensajes, que dicen «siete») y la regla de CLAUDE.md.`, { titulo: 'La recepción: las listas de tablas no dicen lo mismo', fichero: enElRepositorio(l.fichero), linea: l.linea });
  }

  /* 2 · Las sentencias. */
  const vistas = Object.entries(textos).flatMap(([fichero, texto]) => mirar(texto, fichero));
  const olvidos = vistas.filter((v) => !v.bien);
  const cuantas = (clase) => vistas.filter((v) => v.clase === clase).length;
  plegar(`Las ${vistas.length} sentencias que cambian filas de las tablas que viajan`, () => {
    for (const v of vistas) {
      console.log(`  ${v.bien ? 'bien  ' : 'OLVIDO'} · ${v.fichero}:${v.linea} · ${v.funcion ? `${v.funcion}()` : '(fuera de función)'} · ${v.verbo} ${v.tabla ?? '(tabla en una variable)'}${v.bien ? `: ${v.como}` : ''}`);
    }
  });

  olvidos.forEach((v, n) => {
    const e = explicar(v, rutas);
    const fichero = enElRepositorio(v.fichero);
    const sentencia = v.sentencia.length > 160 ? `${v.sentencia.slice(0, 160)} …` : v.sentencia;
    console.log(`\nOLVIDO ${n + 1} de ${olvidos.length} · ${fichero}, línea ${v.linea} · ${v.funcion ? `en ${v.funcion}()` : 'fuera de función'}\n`);
    console.log(`${codigoDe(textos[v.fichero], v)}\n`);
    console.log(`  QUÉ PASA\n${renglones(e.pasa)}`);
    console.log(`  QUÉ HACER\n${renglones(e.hacer)}`);
    anotar(`${e.pasa} QUÉ HACER: ${e.hacer} LA REGLA: toda escritura en una de las siete tablas que bajan a los móviles deja la fila con «recibido = ''»; si no, ese cambio no le baja nunca a quien ya pasó por esa fila, y no da ningún error. Está contado en CLAUDE.md («Una regla del servidor que no se puede olvidar») y en la cabecera «La bajada por recepción» de ${rutas.indice}. La sentencia: ${sentencia}`, { titulo: e.titulo, fichero, linea: v.linea });
  });
  if (olvidos.length > 0) mal = true;

  /* 3 · Las exenciones, todas en uso: la que no encuentra su sentencia, o sobra o la guardia ya no la ve. */
  for (const exenta of EXENTAS.filter((e) => !vistas.some((v) => v.exenta === e))) {
    mal = true;
    anotar(`La lista EXENTAS de ${ESTE_GUION} dice que ${exenta.funcion}(), en ${exenta.fichero}, tiene una sentencia que ${exenta.vale === 'numera' ? 'numera' : exenta.vale === 'borra' ? 'borra' : 'lleva la tabla en una variable'}, y la guardia no la encuentra. O la función se ha movido, renombrado o borrado (pon al día su entrada en EXENTAS, o quítala: una exención sin dueño es una puerta abierta), o su sentencia se ha reescrito de una forma que la guardia ya no sabe leer (y entonces tampoco vería un olvido escrito así).`, { titulo: 'La recepción: una exención que no encuentra su sentencia', fichero: enElRepositorio(exenta.fichero) });
  }
  if (cuantas('pendiente') === 0) {
    mal = true;
    anotar(`La guardia no ve ni una sola escritura que deje la fila con «recibido = ''» en todo api/ (ni la de upsert(), por la que entra todo lo que suben los móviles). O esta API no tiene la bajada por recepción, o la guardia ha dejado de entender cómo está escrito el código: en los dos casos, su visto bueno no vale.`, { titulo: 'La guardia de la recepción no ve ninguna escritura', fichero: rutas.indice });
  }

  /* 4 · La prueba de la guardia. */
  const { fallos, cuenta } = probarLaGuardia(textos, vistas);
  if (fallos.length > 0) {
    mal = true;
    console.log(`\nLA GUARDIA ESTÁ CIEGA. Antes de dar el visto bueno se prueba a sí misma sobre una copia en memoria del código, y:\n`);
    for (const f of fallos) console.log(`  · ${f}`);
    console.log(`\n${renglones(`Esto no es un fallo de la API, sino de la guardia (${ESTE_GUION}): alguien ha tocado su lector, o el código ha empezado a escribirse de una forma que la despista. Mientras esté así su visto bueno no vale, y por eso no deja pasar el despliegue. Arregla el lector (o la forma de escribir que lo despista) hasta que vuelva a ver todos los olvidos que se le ponen.`, '  ')}`);
    anotar(`La guardia de la recepción está ciega: se prueba a sí misma metiendo olvidos a propósito en una copia en memoria del código, y ${fallos.length === 1 ? 'hay uno que no ve' : `hay ${fallos.length} que no ve`}: ${fallos.join('; ')}. No es un fallo de la API sino de ${ESTE_GUION} (o de una forma nueva de escribir el código que lo despista). Mientras esté así su visto bueno no vale: por eso falla.`, { titulo: 'La guardia de la recepción está ciega', fichero: ESTE_GUION });
  } else {
    console.log(`\nLa guardia muerde: ${cuenta.quitados ? `sin su «recibido», las ${cuenta.quitados} sentencias que lo llevan dejan de estar bien; ` : ''}ve el olvido puesto al final de cada uno de los ${cuenta.ficheros} ficheros; ve los ${cuenta.olvidos} olvidos escritos de otras tantas formas; y no se asusta con ${cuenta.legitimos} trozos de código legítimo.`);
  }

  /* 5 · El veredicto. */
  const leidos = `${Object.keys(textos).length} ficheros de PHP leídos${deMas.length ? ` (además de los .php: ${deMas.join(', ')})` : ''}`;
  const son = (cuantos, una, varias) => `${cuantos} ${cuantos === 1 ? una : varias}`;
  const miradas = `${son(vistas.length, 'sentencia mirada', 'sentencias miradas')}: ${son(cuantas('pendiente'), 'que deja', 'que dejan')} la fila pendiente, ${son(cuantas('numera'), 'que numera', 'que numeran')}, ${son(cuantas('borra'), 'que borra', 'que borran')}${cuantas('ajena') ? `, ${cuantas('ajena')} de tablas ajenas` : ''}${olvidos.length ? ` y ${son(olvidos.length, 'que se olvida', 'que se olvidan')}` : ''}`;
  if (mal) {
    console.log(`\n${renglones(`LA REGLA. Las siete tablas que bajan a los móviles (${TABLAS.join(', ')}) llevan la columna «recibido»: el número de orden con el que cada fila llegó al servidor, y la bajada de cambios se guía por él. Toda escritura en una de esas tablas tiene que dejar la fila con «recibido = ''» («pendiente de numerar»): la siguiente bajada le pone número nuevo y así le llega a todos. Una escritura que se lo salta no da ningún error: ese cambio, sencillamente, no le baja nunca a quien ya pasó por esa fila.`, '')}`);
    console.log(renglones(`Está contado en CLAUDE.md («Una regla del servidor que no se puede olvidar»), en la cabecera «La bajada por recepción» de ${rutas.indice} y en la cabecera de ${ESTE_GUION}. En el despliegue, este paso va antes de subir nada: lo publicado sigue como estaba.`, ''));
    console.log(`\n${leidos} · ${miradas}.`);
    console.log('LA RECEPCIÓN NO PASA.');
    process.exit(1);
  }
  console.log(`${leidos} · ${miradas}.`);
  console.log('Ninguna escritura se salta la recepción. Bien.');
}

principal();
