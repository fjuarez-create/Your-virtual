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

   QUÉ MIRA. Todo el PHP de api/: los .php y cualquier otro fichero de texto de menos de 2 MB
   que lleve «<?php» o «<?=» dentro (salvo los .md y los .txt, que lo citan pero no lo son, y lo
   que lleva bytes nulos, que no es un texto). No mira lo que no viaja con la app:
   api/config.php, api/datos/ y api/uploads/. De cada fichero, las cadenas (entre comillas o en
   un heredoc) que EMPIEZAN por un verbo que cambia filas:
     · UPDATE …                          el caso de todos los días;
     · INSERT … ON DUPLICATE KEY UPDATE  (o ON CONFLICT … DO UPDATE): si la fila ya existe, la
                                         cambia y le conserva el número. Esa cola se busca
                                         también en las cadenas siguientes de la instrucción
                                         (una lista que luego se une), hasta otra sentencia;
     · DELETE FROM, TRUNCATE, DROP TABLE la fila desaparece del servidor y ningún móvil se
                                         entera: la sigue enseñando para siempre.
   Solo cuentan las que tocan una de las siete tablas, o una tabla que no se puede leer porque
   va en una variable («{$tabla}», «%s», una concatenación). Los comentarios no se miran, ni
   para acusar ni para absolver: un «recibido = ''» comentado no vale.

   CUÁNDO DA UNA SENTENCIA POR BUENA. Cuando su SET (lo que va hasta el WHERE) deja la fila
   pendiente. La sentencia es su cadena y lo que se le pega detrás con «.», y nada más: lo que
   va tras una coma, o en la otra rama de un ternario, es otra cosa, aunque esté en la misma
   instrucción de PHP (el «recibido = ''» de la sentencia vecina no es suyo). Vale de una de
   estas maneras:
     a) lleva «recibido = ''» escrito como una asignación más (o «recibido = \'\'», que es lo
        mismo dentro de unas comillas simples de PHP);
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
     · de una api/ de mentira tiene que escoger los ficheros que son, ni uno más ni uno menos;
     · le quita el «recibido» a todo, y cada sentencia que estaba bien tiene que dejar de estarlo;
     · mete un olvido al final de cada fichero, y tiene que verlo; y mira que ninguna función
       le quede «dentro de una cadena» (si una comilla sin cerrar o un heredoc raro la
       hubieran despistado, ahí se nota);
     · mete, uno a uno, los olvidos de la lista OLVIDOS, cada uno escrito de una forma, y tiene
       que verlos;
     · y mete el código legítimo con cara de sospechoso de la lista LEGITIMOS, y NO tiene que
       asustarse; y, sin su «recibido», tampoco puede seguir dándolo por bueno.
   Si algo de eso falla, la comprobación falla diciendo que la guardia está ciega.
   La prueba vigila lo que está en esas listas, no todo lo que el lector sabe leer: una pieza
   del lector que ningún caso ejercite se puede romper sin que se note (ver SI TOCAS EL LECTOR).

   LO QUE NO CAZA. Es un lector de texto, no un analizador de PHP ni una base de datos. No ve:
     1. Una sentencia cuyo verbo no está escrito al empezar su cadena: el verbo en una variable
        o en una constante ($verbo . ' tareas SET …'), partido en dos cadenas ('UPD' . 'ATE …'),
        o detrás de otro texto que no sea un «;» («WITH … UPDATE», «EXPLAIN UPDATE»).
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
     7. En un UPDATE de varias tablas, de CUÁL es el «recibido = ''»: «UPDATE tareas t JOIN
        listas l … SET t.estado = 'x', l.recibido = ''» le vale, y deja pendiente la otra.
     8. Dentro de una función que numera, un SET que empiece por «recibido = recibido» y cambie
        además otra cosa: lo toma por la sentencia que numera.
     9. Dónde ACABA una función: el código suelto que va detrás, hasta la función siguiente, lo
        toma por suyo. Un borrado fuera de función, justo después de la que tiene permiso para
        borrar, sale exento.
    10. Una variable que lleve «recibido = ''» como CONDICIÓN y se use dentro del SET («SET
        estado = CASE WHEN {$cuando} THEN …»): la toma por la que lleva el pendiente.
    11. Un ALTER TABLE … RENAME (o un RENAME TABLE) de una de las siete: no está entre los
        verbos que mira. Para los móviles es como un DROP —sus filas dejan de bajar y ninguno
        se entera— y lo que después se escriba en ella, con su nombre nuevo, ya no se juzga.
   Para lo primero y lo tercero sirve una guardia VIVA, que no lee texto (se usó en el banco de
   pruebas al construir la recepción): un disparador por tabla que da error si una fila ya
   numerada cambia y conserva su número. Con él puesto, cualquier batería de pruebas caza el
   olvido se escriba como se escriba. No es para producción.

   Y LAS FALSAS ALARMAS QUE PUEDE DAR. Todas se arreglan en el sitio, escribiendo la sentencia
   de la forma que la guardia entiende; cuando la instrucción nombra «recibido» y aun así no
   vale, el mensaje lo dice (OJO) y manda aquí:
     · una tabla que no viaja pero va en una variable o en una constante («UPDATE {$tabla}»):
       escribe su nombre en la sentencia, o apunta la función en EXENTAS como 'ajena';
     · un UPDATE o un DELETE de varias tablas que solo LEE de una de las siete («UPDATE
       reuniones r JOIN tareas t … SET r.total = …»): la guardia no sabe cuál se escribe;
     · una sentencia repartida entre dos instrucciones («$sql = 'UPDATE tareas SET …';» y, en
       la siguiente, «$sql .= ", recibido = ''";»), o entre los argumentos de una llamada
       (implode(' ', ['UPDATE …', ", recibido = ''"])): se juzga la cadena y lo que lleva
       pegado con «.». Que el SET vaya entero ahí, o en una lista de campos que se une después;
     · el «recibido = ''» puesto por un AYUDANTE («… = ?' . recepcion_vaciar('tareas') . '
       WHERE …»), una constante o una propiedad: la guardia no entra en las funciones a las que
       se llama. Hoy el trozo «(recepcion_hay('x') ? ", recibido = ''" : '')» está escrito en
       cada sentencia; quien lo junte en una función tiene que enseñársela antes al lector;
     · el registro escrito de una vez con su clave («$registro = [… 'recibido' => '']», o con
       array_merge): la guardia solo sigue la asignación «$registro['recibido'] = ''»;
     · el vacío escrito de otra manera: «recibido = ""» (comillas dobles) o «recibido = ?» con
       el vacío pasado como parámetro. La guardia lo toma por un número puesto a mano. Que el
       '' vaya escrito en la sentencia;
     · un «;» o la palabra «where» dentro de un TEXTO del SET, delante del «recibido»
       («SET notas = 'pendiente; avisado', recibido = ''»): la guardia corta ahí. Pon el
       «recibido = ''» el primero del SET, o pasa ese texto como parámetro;
     · rehacer una tabla en una migración (copiarla, DROP TABLE de la vieja y renombrar): las
       filas no se pierden, pero la guardia ve un borrado. Apunta la función en EXENTAS con
       vale: 'borra' y dilo en su porqué;
     · un texto que no es SQL y empieza por un verbo de escritura: «UPDATE tareas …», «UPDATE »
       con algo pegado detrás (error_log('UPDATE ' . $n . ' filas')) o el verbo solo en su cadena
       y pegado a otra cosa ('UPDATE' . ': ' . $que). Que no empiece así;
     · y una falsa «ceguera»: un texto largo (un heredoc, o una página con su JavaScript) con
       una línea que empiece por «function algo(». La guardia cree que se ha perdido leyendo.
       Que esa línea no empiece así.

   Uso (lo llama el paso «Comprobar que ninguna escritura se salta la recepción» de
   .github/workflows/deploy-repasos.yml, con «repasos» como carpeta de trabajo):

       node .github/scripts/comprobar-recepcion.mjs [carpeta de la app]

   Sin carpeta, mira «repasos». No necesita nada más que Node (vale desde la versión 18): ni
   dependencias, ni git, ni base de datos. Sale con 0 si todo está bien y con 1 si no.

   SI LO QUE SE QUIERE ES VOLVER AL CÓDIGO DE ANTES DE LA RECEPCIÓN. Con ese código este paso
   falla siempre: es justo el que no deja las filas pendientes (lo publicado antes del
   11-11-2026 es el control con el que se prueba esta guardia). Y no tiene interruptor para
   saltárselo, a propósito: un interruptor acabaría puesto un día cualquiera. Una vuelta atrás
   de urgencia se hace a sabiendas. Primero se lee «SI SE VUELVE ATRÁS ESTE CÓDIGO DESPUÉS DE
   ENCENDER», en la cabecera «La bajada por recepción» de repasos/api/index.php (la del código
   que LLEVA la recepción; en el de antes no está), que dice qué les pasa a los móviles y qué
   hay que hacer al volver. Y después se quita este paso de deploy-repasos.yml, en ese mismo
   commit, y se vuelve a poner cuando vuelva la recepción. El mensaje de fallo lo dice al final.

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
 *   'borra'   borrar filas de verdad. Solo si además reinicia a todos los móviles (o si no se
 *             pierde ninguna: rehacer la tabla en una migración).
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

/**
 * Dónde acaba la SENTENCIA dentro de su instrucción de PHP: es su cadena y lo que se le pega
 * detrás con «.», y nada más. Acaba en lo que la separa de otra cosa: una coma, el «?» o el «:»
 * de un ternario, un «=>», o el paréntesis que cierra la llamada que la envuelve.
 *
 * El caso: una sentencia según el motor, como las de esquema_recepcion(),
 *     $pdo->exec(motor() === 'sqlite' ? "UPDATE tareas SET estado = 'x'"
 *                                     : "UPDATE tareas SET estado = 'x', recibido = ''");
 * La primera se olvida y no tiene WHERE que la corte: leyendo hasta el «;» de PHP se daba por
 * suyo el «recibido = ''» de la vecina, y pasaba en verde (noviembre de 2026). Igual con una
 * lista de sentencias, un match, o dos sentencias como argumentos de una llamada.
 *
 * Lo que va entre paréntesis abiertos DESPUÉS de la cadena sí es suyo: es como se escribe en la
 * casa el trozo con su condición («… = ?' . (recepcion_hay('medios') ? ", recibido = ''" : '')»).
 * Con `conArgumentos`, las comas no cortan: es para sprintf(), que lleva detrás de la coma lo
 * que rellena los «%s».
 */
function finDeSentencia(texto, clase, desde, tope, conArgumentos = false) {
  let hondo = 0;
  for (let i = desde; i < tope; i++) {
    if (clase[i] !== CODIGO) continue;
    const c = texto[i];
    if (c === '(' || c === '[' || c === '{') hondo++;
    else if (c === ')' || c === ']' || c === '}') { if (--hondo < 0) return i; }
    else if (hondo > 0) continue;
    else if (c === ',' || (c === '=' && texto[i + 1] === '>')) { if (!conArgumentos) return i; }
    else if (c === '?' && texto[i + 1] !== '-') return i;   // «?->» no separa nada
    else if (c === ':' && texto[i + 1] !== ':' && texto[i - 1] !== ':') return i;   // «Clase::CONSTANTE» tampoco
  }
  return tope;
}

/**
 * Un trozo de PHP sin los comentarios de SQL que llevan sus cadenas: los de barra y asterisco
 * y los de dos guiones («-- …»). Un «recibido = ''» comentado no deja pendiente nada, y un
 * comentario metido entre la coma y el «recibido» no lo estropea. El de dos guiones llega hasta
 * el salto de línea de SQL, que es el que va DENTRO de una cadena: lo que se le pega detrás sin
 * salto («… -- nota" . ", recibido = ''"») sigue siendo comentario. Fuera de las cadenas, «--»
 * es una resta de PHP y no se toca.
 */
function sinComentariosDeSql(limpio, clase, desde, hasta) {
  let salida = '';
  let i = desde;
  while (i < hasta) {
    const enCadena = clase[i] === CADENA;
    const cierre = enCadena && limpio[i] === '/' && limpio[i + 1] === '*' ? limpio.indexOf('*/', i + 2) : -1;
    if (cierre >= 0 && cierre + 2 <= hasta) {
      i = cierre + 2;
      salida += ' ';
    } else if (enCadena && limpio[i] === '-' && limpio[i + 1] === '-') {
      while (i < hasta && !(clase[i] === CADENA && limpio[i] === '\n')) i++;
      salida += ' ';
    } else salida += limpio[i++];
  }
  return salida;
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
  // Detrás del verbo, un blanco (también el «\n» escrito) o el final de la cadena: «'UPDATE' . ' tareas …'».
  + String.raw`)(?:${BLANCO}+|$)`,
  'gi',
);
/** ¿Empieza esa cadena por una sentencia? (La misma expresión, sin la «g»: para preguntar por una cadena suelta.) */
const EMPIEZA_LA_CADENA = new RegExp(`^${EMPIEZA.source.replace('(^|;)', '()')}`, 'i');
/** La cola de un INSERT que, si la fila ya existe, la cambia. */
const COLA_DE_INSERT = /\bON\s+DUPLICATE\s+KEY\s+UPDATE\b|\bON\s+CONFLICT\b[\s\S]*?\bDO\s+UPDATE\s+SET\b/i;
const VIAJA = new RegExp(String.raw`\b(${TABLAS.join('|')})\b`, 'i');
const COLUMNA = String.raw`(?:[\x60"]?\w+[\x60"]?\s*\.\s*)?[\x60"]?recibido[\x60"]?`;
/** El vacío de SQL, como se escribe ('') y como queda dentro de unas comillas simples de PHP (\'\'). */
const VACIO = String.raw`(?:''|\\'\\')`;
/** «recibido = ''» como una asignación más del SET: al empezar o detrás de una coma (no dentro de un CASE ni de una subconsulta). */
const DEJA_PENDIENTE = new RegExp(String.raw`(?:^|,|\bSET\b)(?:\s|['".]|\\[nrt])*${COLUMNA}\s*=\s*${VACIO}`, 'i');
/** «recibido = algo» que no es dejarlo vacío: eso es numerar. */
const PONE_NUMERO = new RegExp(String.raw`(?:^|,|\bSET\b)(?:\s|['".{]|\\[nrt])*${COLUMNA}\s*=(?!\s*${VACIO})`, 'i');
/** La sentencia que numera: su SET empieza por «recibido =». */
const EMPIEZA_NUMERANDO = new RegExp(String.raw`^(?:\s|['".{]|\\[nrt])*${COLUMNA}\s*=`, 'i');
const ESCRITO_PENDIENTE = new RegExp(String.raw`recibido[\x60"]?\s*=\s*${VACIO}`, 'i');
/**
 * Lo que la prueba de la guardia le quita al código para ver si se entera: el «recibido» de todo
 * lo que el lector da por «dejar pendiente». Tiene que ser TAN ANCHA como el lector (sin distinguir
 * mayúsculas, la clave de un registro, el vacío entre comillas dobles…): si el lector aceptara una
 * forma que esto no sabe quitar, la prueba diría que la guardia está ciega sin estarlo.
 */
const QUITA_EL_RECIBIDO = new RegExp(String.raw`recibido(?=['"\x60]?\s*\]?\s*=\s*(?:${VACIO}|""))`, 'gi');
const sinSuRecibido = (texto) => texto.replace(QUITA_EL_RECIBIDO, 'olvidado');
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
 * Y si no hay ni WHERE ni paréntesis, hasta el final del texto que se le da: por eso ese texto
 * tiene que ser la sentencia SOLA (ver finDeSentencia), y no la instrucción de PHP entera.
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
 * `instruccion` es la sentencia sola; `conArgumentos()` la da con lo que la sigue en su llamada.
 */
function quedaPendiente(asignaciones, instruccion, tabla, llevan, conArgumentos) {
  const mal = (otra) => ({ bien: false, tipo: 'pregunta', otra });
  if (DEJA_PENDIENTE.test(asignaciones)) {
    const otra = preguntaPorOtra(instruccion, tabla);
    return otra === null ? { bien: true, clase: 'pendiente', como: "lleva «recibido = ''»" } : mal(otra);
  }
  // Con sprintf(), lo que rellena el SET va detrás, entre los argumentos.
  const donde = /%(?:\d+\$)?s/.test(asignaciones) ? conArgumentos() : asignaciones;
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
      // El verbo solo en su cadena es una sentencia si se le pega el resto («'UPDATE' . ' tareas
      // SET …'»). Si no, es una palabra: in_array($accion, ['insert', 'update', 'delete']).
      if (m.index + m[0].lastIndexOf(m[2]) + m[2].length === cuerpo.length && !/^\s*\./.test(limpio.slice(cadena.hasta, cadena.hasta + 200))) continue;
      let tabla = tablaTras(limpio.slice(trasVerbo, trasVerbo + 200));

      // La instrucción llega hasta el «;» de SQL, si lo hay en la misma cadena, o hasta el de PHP.
      const finSql = limpio.indexOf(';', trasVerbo);
      const fin = finSql >= 0 && finSql < cadena.cuerpo[1] ? finSql : finDeInstruccion(limpio, clase, cadena.hasta);
      // La sentencia, no: acaba donde el PHP pasa a otra cosa (ver finDeSentencia).
      const partida = fin < cadena.cuerpo[1];   // la corta un «;» de SQL dentro de su propia cadena
      const suya = partida ? fin : finDeSentencia(limpio, clase, cadena.hasta, fin);
      const instruccion = sinComentariosDeSql(limpio, clase, en, suya);
      // Con sprintf(), lo que rellena los «%s» va detrás de la coma: hasta que se cierra la llamada.
      const conArgumentos = () => (partida ? instruccion : sinComentariosDeSql(limpio, clase, en, finDeSentencia(limpio, clase, cadena.hasta, fin, true)));

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
        // ¿Nombra «recibido» la instrucción entera de PHP, comentarios incluidos, aunque no le
        // valga? Se le dice a quien lo lea, que lo tiene delante (ver explicar).
        nombraRecibido: !veredicto.bien && /recibido/i.test(texto.slice(en, partida ? finDeInstruccion(limpio, clase, cadena.hasta) : fin)),
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
        let entero = instruccion;
        let cola = COLA_DE_INSERT.exec(entero);
        if (!cola && !partida) {
          // La cola puede ir en OTRA cadena que no se le pega con «.»: el elemento siguiente de
          // una lista que luego se une (implode(' ', ['INSERT INTO mensajes …', 'ON DUPLICATE
          // KEY UPDATE …'])). Al cortar la sentencia en la coma dejaba de verse, y ese INSERT
          // pasaba por uno sin más (noviembre de 2026). Se busca en las cadenas que siguen
          // dentro de la misma instrucción, hasta la que empieza otra sentencia: lo de esa es suyo.
          for (const otra of cadenas) {
            if (otra.desde < suya) continue;
            if (otra.desde >= fin) break;
            const cuerpoDeOtra = limpio.slice(otra.cuerpo[0], otra.cuerpo[1]);
            if (EMPIEZA_LA_CADENA.test(cuerpoDeOtra)) break;
            if (!COLA_DE_INSERT.test(cuerpoDeOtra)) continue;
            entero = sinComentariosDeSql(limpio, clase, en, finDeSentencia(limpio, clase, otra.hasta, fin));
            cola = COLA_DE_INSERT.exec(entero);
            break;
          }
        }
        if (!cola || (tabla && !TABLAS.includes(tabla)) || ajena()) continue;
        const asignaciones = hastaElWhere(entero.slice(cola.index + cola[0].length));
        apuntar(quedaPendiente(asignaciones, entero, tabla, pendientes, conArgumentos) ?? { bien: false, tipo: 'insert' });
        continue;
      }

      if (verbo !== 'UPDATE') {
        // DELETE, TRUNCATE y DROP: una fila borrada de verdad no le baja a nadie.
        if (verbo === 'DELETE' && tabla && !TABLAS.includes(tabla)) {
          // Un DELETE de varias tablas («DELETE t FROM usuarios u JOIN tareas t …») se mira, como
          // el UPDATE, si NOMBRA una que viaja antes de su WHERE, vaya o no la primera.
          const otra = VIAJA.exec(hastaElWhere(instruccion));
          if (otra) tabla = otra[1].toLowerCase();
        }
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
      const pendiente = quedaPendiente(set, instruccion, tabla, pendientes, conArgumentos);
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
  // La sentencia vecina: el «recibido = ''» de otra cosa de la misma instrucción no es suyo.
  ['uno según el motor, con la otra rama del ternario bien hecha (y ese «recibido» no es suyo)', php`
    function guardia_olvido(PDO $pdo): void
    {
        $pdo->exec(motor() === 'sqlite'
            ? "UPDATE tareas SET estado = 'pendiente'"
            : "UPDATE tareas SET estado = 'pendiente', recibido = ''");
    }`],
  ['uno en una lista de sentencias, delante de otra que sí lo lleva', php`
    function guardia_olvido(PDO $pdo): void
    {
        $sentencias = ["UPDATE tareas SET orden = 0", "UPDATE listas SET borrada = 0, recibido = '' WHERE borrada IS NULL"];
        foreach ($sentencias as $sentencia) {
            $pdo->exec($sentencia);
        }
    }`],
  ["uno con la variable que lleva el «recibido = ''» de argumento, al lado de la sentencia y no en su SET", php`
    function guardia_olvido(): void
    {
        $vaciar = ", recibido = ''";
        guardia_ejecutar("UPDATE tareas SET estado = 'resuelta'", [$vaciar]);
    }`],
  ["uno con el «recibido = ''» detrás de dos guiones (un comentario de SQL, hasta el final de la línea)", php`
    function guardia_olvido(PDO $pdo): void
    {
        $pdo->exec("UPDATE medios
                       SET ruta = '' -- , recibido = ''
                     WHERE borrada = 1");
    }`],
  ["uno con el «recibido = ''» pegado detrás de un comentario de dos guiones, sin salto de línea de SQL en medio", php`
    function guardia_olvido(PDO $pdo): void
    {
        $pdo->exec("UPDATE medios SET ruta = '' -- la foto ya no está"
            . ", recibido = ''");
    }`],
  // El verbo y las comillas, escritos de formas que despistarían a un lector más torpe.
  ['uno con el verbo solo en su cadena y el resto pegado detrás', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('UPDATE' . ' tareas SET estado = ? WHERE id = ?')->execute(['resuelta', $id]);
    }`],
  ['uno con el salto de línea escrito detrás del verbo («UPDATE\\n tareas …»)', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare("UPDATE\n  tareas\n  SET estado = ?\n  WHERE id = ?")->execute(['resuelta', $id]);
    }`],
  ['uno detrás de un texto con una comilla simple escapada', php`
    function guardia_olvido(string $id): void
    {
        $nota = 'l\'obra';
        bd()->prepare('UPDATE tareas SET estado = ? WHERE id = ?')->execute(['resuelta', $id]);
    }`],
  ['uno detrás de un texto con una comilla doble escapada', php`
    function guardia_olvido(string $id): void
    {
        $nota = "la \"obra";
        bd()->prepare('UPDATE tareas SET estado = ? WHERE id = ?')->execute(['resuelta', $id]);
    }`],
  ['uno en la misma línea que un comentario que acaba en «?>» (ahí se acaba el comentario, y lo que sigue vuelve a ser código)', php`
    function guardia_olvido(): void
    {
        // una nota que cierra la etiqueta ?> <?php bd()->exec("UPDATE tareas SET estado = 'x'");
    }`],
  // Los otros verbos, y las otras formas de los que ya estaban.
  ['un DROP TABLE (la tabla entera desaparece)', php`
    function guardia_olvido(): void
    {
        bd()->exec('DROP TABLE lecturas');
    }`],
  ['un DELETE con alias, el de varias tablas de MySQL («DELETE t FROM tareas t …»)', php`
    function guardia_olvido(): void
    {
        bd()->exec('DELETE t FROM tareas t JOIN usuarios u ON u.id = t.creado_por WHERE u.activo = 0');
    }`],
  ['un DELETE de varias tablas con la que no viaja delante («DELETE t FROM usuarios u JOIN tareas t …»)', php`
    function guardia_olvido(): void
    {
        bd()->exec('DELETE t FROM usuarios u JOIN tareas t ON t.creado_por = u.id WHERE u.activo = 0');
    }`],
  ['un DELETE con la tabla en una variable', php`
    function guardia_olvido(string $tabla, string $id): void
    {
        bd()->prepare("DELETE FROM {$tabla} WHERE id = ?")->execute([$id]);
    }`],
  ['un INSERT con adjetivo («INSERT IGNORE INTO … ON DUPLICATE KEY UPDATE»)', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('INSERT IGNORE INTO mensajes (id, texto) VALUES (?, ?) ON DUPLICATE KEY UPDATE texto = VALUES(texto)')->execute([$id, 'x']);
    }`],
  ['un «INSERT … ON DUPLICATE KEY UPDATE» con la tabla en una variable', php`
    function guardia_olvido(string $tabla, string $id): void
    {
        bd()->prepare("INSERT INTO {$tabla} (id, texto) VALUES (?, ?) ON DUPLICATE KEY UPDATE texto = VALUES(texto)")->execute([$id, 'x']);
    }`],
  ['un «INSERT … ON DUPLICATE KEY UPDATE» partido entre los elementos de una lista que luego se une (la cola va en el tercero)', php`
    function guardia_olvido(PDO $pdo, string $id): void
    {
        $pdo->prepare(implode(' ', ['INSERT INTO mensajes (id, texto)', 'VALUES (?, ?)', 'ON DUPLICATE KEY UPDATE texto = VALUES(texto)']))->execute([$id, 'x']);
    }`],
  // El nombre de la tabla y la clave del registro, escritos de formas que se parecen a las buenas.
  ['un «INSERT … ON DUPLICATE KEY UPDATE» con el nombre de la tabla con mayúsculas («INSERT INTO Mensajes …»: SQLite no las distingue)', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('INSERT INTO Mensajes (id, texto) VALUES (?, ?) ON DUPLICATE KEY UPDATE texto = VALUES(texto)')->execute([$id, 'x']);
    }`],
  ['otro con el nombre de la base delante («INSERT INTO repasos.mensajes …»)', php`
    function guardia_olvido(string $id): void
    {
        bd()->prepare('INSERT INTO repasos.mensajes (id, texto) VALUES (?, ?) ON DUPLICATE KEY UPDATE texto = VALUES(texto)')->execute([$id, 'x']);
    }`],
  ["uno con un SET genérico al que se le pone una clave que solo se le parece (['recibido_por'] = '')", php`
    function guardia_olvido(array $registro): void
    {
        $registro['recibido_por'] = '';
        $asignaciones = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($registro)));
        bd()->prepare("UPDATE tareas SET {$asignaciones} WHERE id = ?")->execute([...array_values($registro), $registro['id']]);
    }`],
  ["uno con un SET genérico al que se le pone un número en la clave (['recibido'] = $marca) en vez de dejarla vacía", php`
    function guardia_olvido(array $registro, string $marca): void
    {
        $registro['recibido'] = $marca;
        $asignaciones = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($registro)));
        bd()->prepare("UPDATE tareas SET {$asignaciones} WHERE id = ?")->execute([...array_values($registro), $registro['id']]);
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
  ["uno bien hecho entre comillas simples de PHP, con el vacío escapado (recibido = \\'\\')", 1, php`
    function guardia_legitimo(string $id): void
    {
        bd()->prepare('UPDATE tareas SET estado = ?, actualizado = ?, recibido = \'\' WHERE id = ?')->execute(['x', ahora_iso(), $id]);
    }`],
  ['uno bien hecho con un comentario de SQL de dos guiones en medio del SET', 1, php`
    function guardia_legitimo(PDO $pdo): void
    {
        $pdo->exec("UPDATE medios
                       SET ruta = '', -- la foto ya no está
                           recibido = ''
                     WHERE borrada = 1");
    }`],
  ['dos según el motor, y las dos lo llevan', 2, php`
    function guardia_legitimo(PDO $pdo): void
    {
        $pdo->exec(motor() === 'sqlite'
            ? "UPDATE tareas SET orden = 0, recibido = ''"
            : "UPDATE tareas SET orden = 0, recibido = '' WHERE borrada = 0");
    }`],
  ['uno bien hecho con una resta de PHP (--) en la concatenación, que no es un comentario de SQL', 1, php`
    function guardia_legitimo(int $orden, string $id): void
    {
        bd()->prepare('UPDATE tareas SET orden = ' . $orden-- . ", recibido = '' WHERE id = ?")->execute([$id]);
    }`],
  ['un DELETE de varias tablas que no nombra ninguna de las que viajan', 0, php`
    function guardia_legitimo(PDO $pdo): void
    {
        $pdo->exec('DELETE s FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE u.activo = 0');
    }`],
  ["un «INSERT … ON DUPLICATE KEY UPDATE» partido entre dos elementos de una lista, con su «recibido = ''»", 1, php`
    function guardia_legitimo(PDO $pdo, string $id): void
    {
        $pdo->prepare(implode(' ', ['INSERT INTO mensajes (id, texto) VALUES (?, ?)', "ON DUPLICATE KEY UPDATE texto = VALUES(texto), recibido = ''"]))->execute([$id, 'x']);
    }`],
  ['dos INSERT en una lista: uno sin más en una tabla que viaja y, detrás, otro con su cola en una que no', 0, php`
    function guardia_legitimo(PDO $pdo): void
    {
        $sentencias = ['INSERT INTO tareas (id, titulo) VALUES (?, ?)', 'INSERT INTO usuarios (id, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)'];
        foreach ($sentencias as $sentencia) {
            $pdo->prepare($sentencia)->execute(['1', 'x']);
        }
    }`],
  ['el vacío de la clave del registro entre comillas dobles, y la columna en mayúsculas', 2, php`
    function guardia_legitimo(array $registro, string $id): void
    {
        $registro['recibido'] = "";
        $asignaciones = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($registro)));
        bd()->prepare("UPDATE tareas SET {$asignaciones} WHERE id = ?")->execute([...array_values($registro), $id]);
        bd()->prepare("UPDATE listas SET borrada = 1, RECIBIDO = '' WHERE id = ?")->execute([$id]);
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

  // 0 · Que lee los ficheros que son: de una api/ de mentira tiene que sacar los que viajan y
  //     llevan PHP (también los de las subcarpetas hondas y los que no acaban en .php), y dejar
  //     lo que no viaja y lo que no es un texto.
  const leidos = ficherosDePhp('api', DISCO_DE_MENTIRA).sort().join(', ');
  if (leidos !== SE_LEEN.join(', ')) fallos.push(`no lee los ficheros que tiene que leer: de la api/ de mentira de su prueba saca «${leidos}» y son «${SE_LEEN.join(', ')}»`);

  // 1 · Sin su «recibido», lo que estaba bien tiene que dejar de estarlo.
  for (const [fichero, texto] of Object.entries(textos)) {
    const sinRecibido = mirar(sinSuRecibido(texto), fichero);
    for (const v of vistas.filter((x) => x.fichero === fichero && x.bien && x.clase === 'pendiente')) {
      cuenta.quitados++;
      const ahora = sinRecibido.find((x) => x.en === v.en);
      if (!ahora || ahora.bien) fallos.push(`a la sentencia de ${fichero}, línea ${v.linea} (${v.funcion || 'fuera de función'}), se le quita el «recibido = ''» y la sigue dando por buena (o lo lleva escrito de una forma que el lector acepta y esta prueba no sabe quitar: entonces lo que hay que poner al día es QUITA_EL_RECIBIDO, en el guion, y no el código)`);
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
    cuenta.olvidos += 2;
    const borra = `function ${exenta.funcion}(PDO $pdo): void\n{\n    $pdo->exec("DELETE FROM mensajes WHERE texto = ''");\n}`;
    if (alAnadir(exenta.fichero, borra).filter((v) => !v.bien).length !== 1) fallos.push(`no ve un borrado metido dentro de ${exenta.funcion}() (numerar no da permiso para borrar)`);
    const deMas = `function ${exenta.funcion}(PDO $pdo): void\n{\n    $pdo->exec('UPDATE mensajes SET borrada = 1, recibido = actualizado');\n}`;
    if (alAnadir(exenta.fichero, deMas).filter((v) => !v.bien).length !== 1) fallos.push(`da por buena, dentro de ${exenta.funcion}(), una sentencia que pone un número sin ser la que numera (su SET no empieza por «recibido =»)`);
    const otro = Object.keys(textos).find((f) => !EXENTAS.some((e) => e.fichero === f && e.funcion === exenta.funcion));
    const fuera = `function ${exenta.funcion}(PDO $pdo): void\n{\n    $pdo->exec('UPDATE tareas SET recibido = actualizado');\n}`;
    if (otro && alAnadir(otro, fuera).filter((v) => !v.bien).length !== 1) fallos.push(`da por buena una función que se llama ${exenta.funcion}() en otro fichero (${otro}) y pone números`);
  }
  for (const [que, cuantas, trozo] of LEGITIMOS) {
    cuenta.legitimos++;
    const nuevas = alAnadir(principal, trozo);
    if (nuevas.some((v) => !v.bien)) fallos.push(`se asusta sin razón con ${que}`);
    else if (nuevas.length !== cuantas) fallos.push(`no mira como debe ${que} (ve ${nuevas.length} sentencias y son ${cuantas})`);
    // Y al revés: sin su «recibido», ninguno de esos trozos puede seguir «dejando pendiente».
    // Así, el día que el lector aprenda una forma nueva de escribirlo, QUITA_EL_RECIBIDO tiene
    // que aprenderla también, y se nota aquí y no en el despliegue de otro.
    else if (alAnadir(principal, sinSuRecibido(trozo)).some((v) => v.bien && v.clase === 'pendiente')) fallos.push(`sigue dando por buena, sin su «recibido», ${que} (el lector acepta una forma de escribirlo que QUITA_EL_RECIBIDO no sabe quitar)`);
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
        hacer: `No se borra: se marca. «UPDATE … SET borrada = 1, actualizado = ?, recibido = ''», y la fila le baja a todos como borrada. El único borrado de verdad que vale es el que además reinicia a todos los móviles (hoy, ${EXENTAS.filter((e) => e.vale === 'borra').map((e) => `${e.funcion}()`).join(' y ') || 'ninguno'}, con el sello del arranque); si este es otro así, apúntalo en la lista EXENTAS de ${ESTE_GUION} con vale: 'borra' y su porqué. ${v.verbo === 'DROP' ? `Y si lo que haces es REHACER la tabla en una migración (copiarla, tirar la vieja y renombrar la copia), las filas no se pierden y esto es una falsa alarma: apunta la función en EXENTAS, también con vale: 'borra', y dilo en su porqué. ` : ''}${v.tabla ? '' : comoAjena}`.trim(),
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
        hacer: `Añade «recibido = ''» al SET de esta sentencia. En la casa se escribe así: «… SET borrada = 1, actualizado = ?' . (recepcion_hay('${v.tabla}') ? ", recibido = ''" : '') . ' WHERE id = ?» (recepcion_hay() pregunta por la tabla de la sentencia). Y si lo que guardas es un registro entero, usa upsert(), en ${rutas.indice}, que ya lo pone.${v.nombraRecibido ? '' : ` Si esta sentencia YA deja la fila pendiente por un camino que la guardia no sabe leer (un ayudante que devuelve el trozo, una constante, una propiedad), es una de las falsas alarmas que cuenta la cabecera de ${ESTE_GUION}: la guardia no entra en las funciones a las que se llama, así que escríbelo de la forma que sí entiende.`}`,
      };
  }
}

/**
 * El aviso para cuando la instrucción NOMBRA «recibido» y aun así no vale. Sin él, a quien tenía
 * escrito «recibido = ""», o el «recibido = ''» detrás de un «;» metido en un texto, el mensaje
 * le decía «añade recibido = ''» con el recibido delante de los ojos, y no había por dónde cogerlo.
 */
function avisoDeRecibido(v) {
  if (!v.nombraRecibido || !['update', 'variable', 'numera', 'insert'].includes(v.tipo)) return '';
  return `La instrucción NOMBRA «recibido», pero no de una manera que la guardia dé por buena. Vale escrito en la propia sentencia como una asignación más de su SET («…, recibido = ''», con dos comillas simples), o de las maneras b) y c) de «CUÁNDO DA UNA SENTENCIA POR BUENA», en la cabecera de ${ESTE_GUION}. No vale detrás del WHERE ni dentro de un CASE (ahí se compara, no se asigna), ni en un comentario, ni en otra sentencia de la misma instrucción, ni entre comillas dobles («recibido = ""»), ni como parámetro («recibido = ?»). Y si de verdad deja la fila pendiente de otra forma (con un ayudante o una constante, o con un «;» o un «where» dentro de un texto del SET), es una de las falsas alarmas que cuenta esa cabecera: escríbelo de la forma que sí entiende.`;
}

/**
 * Lo último que dice un fallo: qué hacer si lo que se quiere es volver al código de antes de la
 * recepción. Ese código hace fallar la guardia siempre (es su control), así que una vuelta atrás
 * de urgencia se encontraría el despliegue cerrado y, con la prisa, sin saber si esto es un
 * estorbo o un aviso. Es las dos cosas: se quita, pero después de leer lo que cuesta volver.
 */
function siSeVuelveAtras(rutas) {
  return `¿LO QUE QUIERES ES VOLVER AL CÓDIGO DE ANTES DE LA RECEPCIÓN (una vuelta atrás de urgencia)? Con ese código este paso falla SIEMPRE, porque es justo el que no deja las filas pendientes, y no tiene interruptor para saltárselo. Haz dos cosas, por este orden. UNA: lee «SI SE VUELVE ATRÁS ESTE CÓDIGO DESPUÉS DE ENCENDER», en la cabecera «La bajada por recepción» de ${rutas.indice} (en la versión que LLEVA la recepción, que es la que vas a quitar: en el código de antes esa cabecera no está). Dice qué les pasa a los móviles mientras mande el código de antes y qué hay que hacer el día que la recepción vuelva. DOS: quita A PROPÓSITO este paso («Comprobar que ninguna escritura se salta la recepción») de .github/workflows/deploy-repasos.yml, en ese mismo commit, y vuelve a ponerlo cuando vuelva la recepción. Si NO estás volviendo atrás, nada de esto va contigo: arregla lo que se dice más arriba.`;
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

/** El disco de verdad. Va de parámetro para que la prueba de la guardia pueda poner uno de mentira. */
const DISCO = {
  nombres: (carpeta) => readdirSync(carpeta),
  que: (ruta) => statSync(ruta),
  texto: (ruta) => readFileSync(ruta, 'utf8'),
};

/**
 * El PHP de api/: los .php y, de lo demás, lo que lleve «<?php» o «<?=» dentro, menos lo que no
 * viaja con la app. De lo que no acaba en .php solo se miran los textos de menos de 2 MB: una
 * imagen o una tipografía pueden llevar «<?=» entre sus bytes por casualidad, y leídas como PHP
 * despistaban a la guardia hasta hacerle decir que estaba ciega (lo que lleva bytes nulos no es
 * un texto).
 */
function ficherosDePhp(api, disco = DISCO) {
  const salida = [];
  const recorrer = (carpeta, raiz) => {
    for (const nombre of [...disco.nombres(carpeta)].sort()) {
      const ruta = `${carpeta}/${nombre}`;
      let que;
      try { que = disco.que(ruta); } catch { continue; }   // un enlace roto: ahí no hay nada que PHP pueda ejecutar
      if (que.isDirectory()) {
        // datos/ y uploads/ viajan vacías: la base, las claves y las fotos viven solo en el servidor.
        if (!(raiz && ['datos', 'uploads'].includes(nombre))) recorrer(ruta, false);
      } else if (raiz && nombre === 'config.php') {
        continue;   // lo crea el instalador y vive solo en el servidor
      } else if (nombre.endsWith('.php')) {
        salida.push(ruta);
      } else if (!/\.(?:md|txt)$/i.test(nombre) && que.size < 2 * 1024 * 1024) {
        const contenido = disco.texto(ruta);   // un .inc, un .phtml: PHP lo ejecuta igual si alguien lo incluye
        if (/<\?(?:php|=)/i.test(contenido) && !contenido.includes('\0')) salida.push(ruta);
      }
    }
  };
  recorrer(api, true);
  return salida;
}

/**
 * Una api/ de mentira, para probar qué se lee y qué no: ruta → contenido. `SE_LEEN` es lo que
 * ficherosDePhp tiene que sacar de ella, ni un fichero más ni uno menos.
 */
const API_DE_MENTIRA = {
  'api/index.php': '<?php',
  'api/config.php': '<?php',                    // no viaja: lo crea el instalador
  'api/datos/copia.php': '<?php',               // no viaja
  'api/uploads/foto.php': '<?php',              // no viaja
  'api/lib/config.php': '<?php',                // este sí: solo se salta el de la raíz
  'api/lib/datos/tabla.php': '<?php',           // y esta carpeta también: solo se saltan las de la raíz
  'api/lib/honda/mas/abajo.php': '<?php',
  'api/lib/trozo.inc': '<?php echo 1;',
  'api/lib/pagina.phtml': '<p><?= $nombre ?></p>',
  'api/lib/LEEME.md': 'Los ficheros empiezan por <?php y no llevan cierre.',
  'api/lib/sello.png': 'PNG\0\0<?= ruido',
  'api/lib/estilo.css': 'p { color: red }',
};
const SE_LEEN = ['api/index.php', 'api/lib/config.php', 'api/lib/datos/tabla.php', 'api/lib/honda/mas/abajo.php', 'api/lib/pagina.phtml', 'api/lib/trozo.inc'];
const DISCO_DE_MENTIRA = {
  nombres: (carpeta) => [...new Set(Object.keys(API_DE_MENTIRA).filter((r) => r.startsWith(`${carpeta}/`)).map((r) => r.slice(carpeta.length + 1).split('/')[0]))],
  que: (ruta) => ({ isDirectory: () => !(ruta in API_DE_MENTIRA), size: (API_DE_MENTIRA[ruta] ?? '').length }),
  texto: (ruta) => API_DE_MENTIRA[ruta],
};

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
    anotar(`El servidor ya no declara TABLAS_QUE_VIAJAN (la lista de las tablas que bajan a los móviles) en ningún fichero de api/. La guardia de la recepción mira ${TABLAS.join(', ')} y no puede comprobar que sigan siendo esas. Si la lista ha cambiado de nombre o de sitio, enséñaselo a ${ESTE_GUION} (busca TABLAS_QUE_VIAJAN). Si es que esta API no tiene la bajada por recepción, no es la de hoy. ${siSeVuelveAtras(rutas)}`, { titulo: 'La recepción: no encuentro la lista de tablas del servidor', fichero: rutas.indice });
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
    const ojo = avisoDeRecibido(v);
    console.log(`  QUÉ PASA\n${renglones(e.pasa)}`);
    console.log(`  QUÉ HACER\n${renglones(e.hacer)}`);
    if (ojo) console.log(`  OJO\n${renglones(ojo)}`);
    anotar(`${e.pasa} QUÉ HACER: ${e.hacer}${ojo ? ` OJO: ${ojo}` : ''} LA REGLA: toda escritura en una de las siete tablas que bajan a los móviles deja la fila con «recibido = ''»; si no, ese cambio no le baja nunca a quien ya pasó por esa fila, y no da ningún error. Está contado en CLAUDE.md («Una regla del servidor que no se puede olvidar») y en la cabecera «La bajada por recepción» de ${rutas.indice}. La sentencia: ${sentencia}`, { titulo: e.titulo, fichero, linea: v.linea });
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
    console.log(`\nLa guardia muerde: de una api/ de mentira escoge los ${SE_LEEN.length} ficheros que son; ${cuenta.quitados ? `sin su «recibido», las ${cuenta.quitados} sentencias que lo llevan dejan de estar bien; ` : ''}ve el olvido puesto al final de cada uno de los ${cuenta.ficheros} ficheros; ve los ${cuenta.olvidos} olvidos escritos de otras tantas formas; y no se asusta con ${cuenta.legitimos} trozos de código legítimo.`);
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
    // Lo último, para que sea lo primero que se lea al abrir el paso que ha fallado. En el
    // resumen del despliegue GitHub solo enseña las diez primeras anotaciones de un paso, y con
    // el código de antes salen más: por eso lo lleva también el aviso de que falta
    // TABLAS_QUE_VIAJAN, que es el primero y la seña de ese código.
    console.log(`\n${renglones(siSeVuelveAtras(rutas), '')}`);
    anotar(siSeVuelveAtras(rutas), { titulo: 'La recepción: si lo que quieres es volver al código de antes' });
    process.exit(1);
  }
  console.log(`${leidos} · ${miradas}.`);
  console.log('Ninguna escritura se salta la recepción. Bien.');
}

principal();
