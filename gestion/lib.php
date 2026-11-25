<?php

/* ── Panel de gestión · utilidades comunes ────────────────────────────────────
   El estado vivo de las viviendas NO vive en el repositorio: vive en
   gestion/datos/estado.json, en el servidor. Es deliberado. El deploy por FTP
   sube el repositorio entero, así que cualquier fichero versionado se
   sobrescribe en cada push; si el panel escribiera en data/availability.json,
   el siguiente deploy borraría las ventas del comercial.

   data/availability.json queda como SEMILLA: la primera vez que alguien pide
   el estado y todavía no hay estado.json, se copia de ahí. A partir de ese
   momento manda el servidor y el repositorio ya no toca nada.

   Por el mismo motivo gestion/datos/ está excluido del deploy (ver
   .github/scripts/ftp-deploy.sh: la carpeta gestion se sube sin --delete).

   ── Sobre la sintaxis ────────────────────────────────────────────────────────
   Este fichero está escrito para PHP 5.6, y a conciencia. En un hosting
   compartido la versión de PHP la elige el panel del proveedor, no nosotros, y
   este fichero lo cargan TODAS las páginas del panel: un error de sintaxis
   aquí no da un aviso, deja /gestion entero devolviendo un 500 con el cuerpo
   vacío, sin ninguna pista de qué ha pasado. Ya ocurrió una vez.

   Nada de `declare(strict_types=1)`, ni tipos en parámetros o retornos, ni el
   operador `??`, ni funciones flecha. La comodidad de escribirlo no compensa
   el rato de encontrarlo.

   Y tiene que funcionar IGUAL en el PHP 7.0 de hoy y en el 8.2–8.4 que se
   elija en Plesk, para poder cambiar de versión y volver atrás sin tocar el
   código (docs/PANEL_Y_EJECUTABLE.md, «Versión de PHP del hosting»). */

/* Ningún aviso de PHP puede salir en la respuesta: en el endpoint iría antes
   de las cabeceras, y el visor y el ejecutable recibirían HTML en vez de JSON;
   en el panel, antes de la cookie de sesión. Van al log del dominio. Con
   function_exists porque en PHP 8 una función de disable_functions no da un
   aviso: es un error fatal. */
if (function_exists('ini_set')) { ini_set('display_errors', '0'); ini_set('log_errors', '1'); }

/* La hora que se guarda y se enseña no puede depender del php.ini que Plesk
   ponga a cada versión de PHP (sin date.timezone, PHP usa UTC). Es la de
   Canarias, donde están la promoción y la oficina de ventas. */
if (function_exists('date_default_timezone_set')) date_default_timezone_set('Atlantic/Canary');

define('ESTADO_POR_DEFECTO', 'disponible');

function estados_validos() {
  return array('disponible', 'reservada', 'vendida');
}

function dir_datos()      { return __DIR__ . '/datos'; }
function ruta_estado()    { return dir_datos() . '/estado.json'; }
function ruta_clave()     { return dir_datos() . '/clave.php'; }
function ruta_equipos()   { return dir_datos() . '/equipos.json'; }
function ruta_intentos()  { return dir_datos() . '/intentos.json'; }
function ruta_semilla()   { return dirname(__DIR__) . '/data/availability.json'; }
function ruta_unidades()  { return dirname(__DIR__) . '/data/units.json'; }

/* Valor de un array con valor por defecto. Sustituye a `??`, que es de PHP 7. */
function dato($arr, $clave, $porDefecto = null) {
  return (is_array($arr) && isset($arr[$clave])) ? $arr[$clave] : $porDefecto;
}

/* Un parámetro de la petición como texto. Si llega como array (?equipo[]=x)
   cuenta como ausente: un (string) sobre un array da un aviso, que en PHP 8
   pasó de Notice a Warning, y una función de cadena que lo reciba lanza un
   error. Para $_GET y $_POST, siempre esto y no (string) dato(...). */
function texto($arr, $clave, $porDefecto = '') {
  $v = dato($arr, $clave, $porDefecto);
  return is_scalar($v) ? (string) $v : (string) $porDefecto;
}

/* hash_equals llegó en PHP 5.6. Si faltara, una comparación en tiempo
   constante equivalente, para no abrir la puerta a un ataque por tiempos. */
if (!function_exists('hash_equals')) {
  function hash_equals($conocido, $recibido) {
    if (!is_string($conocido) || !is_string($recibido)) return false;
    if (strlen($conocido) !== strlen($recibido)) return false;
    $r = 0;
    for ($i = 0, $n = strlen($conocido); $i < $n; $i++) {
      $r |= ord($conocido[$i]) ^ ord($recibido[$i]);
    }
    return $r === 0;
  }
}

/* random_bytes llegó en PHP 7.0. En 5.6 se tira de OpenSSL, que está en
   cualquier hosting con HTTPS. */
function bytes_aleatorios($n) {
  if (function_exists('random_bytes')) return random_bytes($n);
  if (function_exists('openssl_random_pseudo_bytes')) {
    $fuerte = false;
    $b = openssl_random_pseudo_bytes($n, $fuerte);
    if ($b !== false && $fuerte) return $b;
  }
  /* Último recurso. No es criptográfico, pero un testigo de formulario
     previsible es un problema mucho menor que un panel que no arranca. */
  $b = '';
  while (strlen($b) < $n) { $b .= md5(uniqid(mt_rand(), true), true); }
  return substr($b, 0, $n);
}

/* La carpeta de datos se crea sola en la primera visita: el deploy solo sube
   ficheros del repositorio y ahí dentro no hay ninguno que deba subirse. El
   .htaccess se reescribe si falta para que nadie pueda leer datos/ por URL
   aunque el hosting no conserve el fichero. */
function asegurar_datos() {
  $dir = dir_datos();
  if (!is_dir($dir)) {
    @mkdir($dir, 0775, true);
    if (!is_dir($dir)) return false;
  }
  $guardia = $dir . '/.htaccess';
  if (!is_file($guardia)) {
    /* Cada directiva dentro de su IfModule: la de Apache 2.4 suelta provoca un
       error 500 en un Apache 2.2, que es peor que no proteger nada. */
    @file_put_contents($guardia,
      "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
      . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
  }
  return is_writable($dir);
}

function leer_json($ruta) {
  if (!is_file($ruta)) return null;
  $txt = @file_get_contents($ruta);
  if ($txt === false || $txt === '') return null;
  $dat = json_decode($txt, true);
  return is_array($dat) ? $dat : null;
}

/* Escritura atómica: fichero temporal + rename. Si el comercial guarda justo
   mientras el ejecutable de la oficina está leyendo, o lee el JSON viejo
   entero o lee el nuevo entero, nunca uno a medias. */
function escribir_json($ruta, $datos) {
  if (!asegurar_datos()) return false;
  $opciones = 0;
  if (defined('JSON_PRETTY_PRINT'))      $opciones |= JSON_PRETTY_PRINT;
  if (defined('JSON_UNESCAPED_UNICODE')) $opciones |= JSON_UNESCAPED_UNICODE;
  if (defined('JSON_UNESCAPED_SLASHES')) $opciones |= JSON_UNESCAPED_SLASHES;
  $txt = json_encode($datos, $opciones);
  if ($txt === false) return false;
  /* getmypid() solo si existe: hay hostings que la desactivan, y en PHP 8 eso
     tumbaría toda escritura (guardar, sembrar, anotar el equipo). */
  $tmp = $ruta . '.' . (function_exists('getmypid') ? getmypid() : 0) . '-' . mt_rand() . '.tmp';
  if (@file_put_contents($tmp, $txt . "\n", LOCK_EX) === false) return false;
  if (!@rename($tmp, $ruta)) { @unlink($tmp); return false; }
  return true;
}

function normalizar_estado($valor) {
  $v = is_string($valor) ? strtolower(trim($valor)) : '';
  return in_array($v, estados_validos(), true) ? $v : ESTADO_POR_DEFECTO;
}

/* El sello es un hash corto del contenido. Sirve de ETag para que el
   ejecutable pueda preguntar "¿ha cambiado?" sin descargar nada, y para que el
   panel enseñe de un vistazo si la oficina tiene la versión buena. */
function sellar($viviendas) {
  /* SORT_STRING y no el orden por defecto: con claves mixtas (101 y A03) el
     orden por defecto cambió en PHP 8.2, y con él cambiaría el sello. Con
     las claves de hoy, todas de tres cifras, da exactamente lo mismo. */
  ksort($viviendas, SORT_STRING);
  return substr(hash('sha256', (string) json_encode($viviendas)), 0, 12);
}

function documento($viviendas, $actualizado = null) {
  ksort($viviendas, SORT_NATURAL);
  return array(
    'actualizado' => $actualizado ? $actualizado : date('c'),
    'sello'       => sellar($viviendas),
    'total'       => count($viviendas),
    'viviendas'   => $viviendas,
  );
}

/* Estado vivo. Si todavía no existe, se siembra con data/availability.json y
   se intenta dejar escrito; si el hosting no deja escribir, se devuelve igual
   la semilla para que el visor y el ejecutable nunca se queden sin datos. */
function leer_estado() {
  $doc = leer_json(ruta_estado());
  if (is_array($doc) && isset($doc['viviendas']) && is_array($doc['viviendas'])) {
    return $doc;
  }
  $semilla = leer_json(ruta_semilla());
  if (!is_array($semilla)) $semilla = array();
  $viviendas = array();
  foreach ($semilla as $id => $estado) {
    $viviendas[(string) $id] = normalizar_estado($estado);
  }
  $doc = documento($viviendas);
  $doc['origen'] = 'semilla';
  escribir_json(ruta_estado(), $doc);
  return $doc;
}

function guardar_estado($viviendas) {
  return escribir_json(ruta_estado(), documento($viviendas));
}

/* Listado de viviendas con su estado, en el orden del catálogo. Las que estén
   en units.json y no tengan estado salen como disponibles; las que estén en el
   estado y ya no existan en el catálogo se ignoran (una promoción puede
   reordenarse sin arrastrar fantasmas). */
function viviendas_con_estado() {
  $doc = leer_estado();
  $estado = dato($doc, 'viviendas', array());
  $unidades = leer_json(ruta_unidades());
  if (!is_array($unidades)) $unidades = array();
  $filas = array();
  foreach ($unidades as $u) {
    if (!isset($u['id'])) continue;
    $id = (string) $u['id'];
    $filas[] = array(
      'id'     => $id,
      'planta' => (string) dato($u, 'planta', ''),
      'dorm'   => dato($u, 'dorm'),
      'sup'    => dato($u, 'supTotal'),
      'precio' => dato($u, 'precio'),
      'estado' => normalizar_estado(dato($estado, $id, ESTADO_POR_DEFECTO)),
    );
  }
  return $filas;
}

/* ── Equipos ────────────────────────────────────────────────────────────────
   Cada vez que el ejecutable de la oficina arranca llama al endpoint con su
   nombre y su versión. Aquí se anota, y el panel enseña cuándo fue la última
   vez. Es la forma de saber, sin ir a la oficina, si el visor está encendido y
   con qué datos. */
function registrar_equipo($nombre, $version, $sello) {
  $nombre = preg_replace('/[^A-Za-z0-9 ._\-]/', '', (string) $nombre);
  $nombre = trim((string) $nombre);
  if ($nombre === '') return;
  $nombre = substr($nombre, 0, 40);
  $version = preg_replace('/[^A-Za-z0-9 ._\-]/', '', (string) $version);
  $version = substr(trim((string) $version), 0, 20);

  $equipos = leer_json(ruta_equipos());
  if (!is_array($equipos)) $equipos = array();
  $previo = dato($equipos, $nombre, array());
  $equipos[$nombre] = array(
    'visto'    => date('c'),
    'version'  => $version !== '' ? $version : (string) dato($previo, 'version', ''),
    'sello'    => $sello,
    'llamadas' => ((int) dato($previo, 'llamadas', 0)) + 1,
  );
  /* Un tope por si alguien juega con el parámetro: nos quedamos con los 20
     equipos vistos más recientemente. */
  if (count($equipos) > 20) {
    uasort($equipos, 'comparar_por_visto');
    $equipos = array_slice($equipos, 0, 20, true);
  }
  escribir_json(ruta_equipos(), $equipos);
}

/* Del más reciente al más antiguo. Función con nombre y no un cierre porque
   así se puede pasar por cadena a uasort en cualquier versión de PHP. */
function comparar_por_visto($a, $b) {
  return strcmp((string) dato($b, 'visto', ''), (string) dato($a, 'visto', ''));
}

function equipos() {
  $lista = leer_json(ruta_equipos());
  if (!is_array($lista)) $lista = array();
  uasort($lista, 'comparar_por_visto');
  return $lista;
}
