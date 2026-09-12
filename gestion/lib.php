<?php
declare(strict_types=1);

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
   .github/scripts/ftp-deploy.sh: la carpeta gestion se sube sin --delete). */

/* El código de aquí se mantiene compatible con PHP 7.0 a propósito: el panel
   de un hosting compartido puede tener el dominio fijado a una versión vieja, y
   un error de sintaxis en este fichero deja /gestion en blanco entero, sin
   mensaje. Nada de funciones flecha ni de `match`. */

const ESTADOS = ['disponible', 'reservada', 'vendida'];
const ESTADO_POR_DEFECTO = 'disponible';

function dir_datos(): string   { return __DIR__ . '/datos'; }
function ruta_estado(): string { return dir_datos() . '/estado.json'; }
function ruta_clave(): string  { return dir_datos() . '/clave.php'; }
function ruta_equipos(): string { return dir_datos() . '/equipos.json'; }
function ruta_intentos(): string { return dir_datos() . '/intentos.json'; }
function ruta_semilla(): string { return dirname(__DIR__) . '/data/availability.json'; }
function ruta_unidades(): string { return dirname(__DIR__) . '/data/units.json'; }

/* La carpeta de datos se crea sola en la primera visita: el deploy solo sube
   ficheros del repositorio y ahí dentro no hay ninguno que deba subirse. El
   .htaccess se reescribe si falta para que nadie pueda leer datos/ por URL
   aunque el hosting no conserve el fichero. */
function asegurar_datos(): bool {
  $dir = dir_datos();
  if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) return false;
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

function leer_json(string $ruta) {
  if (!is_file($ruta)) return null;
  $txt = @file_get_contents($ruta);
  if ($txt === false || $txt === '') return null;
  $dat = json_decode($txt, true);
  return is_array($dat) ? $dat : null;
}

/* Escritura atómica: fichero temporal + rename. Si el comercial guarda justo
   mientras el ejecutable de la oficina está leyendo, o lee el JSON viejo
   entero o lee el nuevo entero, nunca uno a medias. */
function escribir_json(string $ruta, array $datos): bool {
  if (!asegurar_datos()) return false;
  $txt = json_encode($datos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($txt === false) return false;
  $tmp = $ruta . '.' . getmypid() . '.tmp';
  if (@file_put_contents($tmp, $txt . "\n", LOCK_EX) === false) return false;
  if (!@rename($tmp, $ruta)) { @unlink($tmp); return false; }
  return true;
}

function normalizar_estado($valor): string {
  $v = is_string($valor) ? strtolower(trim($valor)) : '';
  return in_array($v, ESTADOS, true) ? $v : ESTADO_POR_DEFECTO;
}

/* El sello es un hash corto del contenido. Sirve de ETag para que el
   ejecutable pueda preguntar "¿ha cambiado?" sin descargar nada, y para que el
   panel enseñe de un vistazo si la oficina tiene la versión buena. */
function sellar(array $viviendas): string {
  ksort($viviendas);
  return substr(hash('sha256', (string) json_encode($viviendas)), 0, 12);
}

function documento(array $viviendas, ?string $actualizado = null): array {
  ksort($viviendas, SORT_NATURAL);
  return [
    'actualizado' => $actualizado ?: date('c'),
    'sello'       => sellar($viviendas),
    'total'       => count($viviendas),
    'viviendas'   => $viviendas,
  ];
}

/* Estado vivo. Si todavía no existe, se siembra con data/availability.json y
   se intenta dejar escrito; si el hosting no deja escribir, se devuelve igual
   la semilla para que el visor y el ejecutable nunca se queden sin datos. */
function leer_estado(): array {
  $doc = leer_json(ruta_estado());
  if (is_array($doc) && isset($doc['viviendas']) && is_array($doc['viviendas'])) {
    return $doc;
  }
  $semilla = leer_json(ruta_semilla()) ?: [];
  $viviendas = [];
  foreach ($semilla as $id => $estado) {
    $viviendas[(string) $id] = normalizar_estado($estado);
  }
  $doc = documento($viviendas);
  $doc['origen'] = 'semilla';
  escribir_json(ruta_estado(), $doc);
  return $doc;
}

function guardar_estado(array $viviendas): bool {
  return escribir_json(ruta_estado(), documento($viviendas));
}

/* Listado de viviendas con su estado, en el orden del catálogo. Las que estén
   en units.json y no tengan estado salen como disponibles; las que estén en el
   estado y ya no existan en el catálogo se ignoran (una promoción puede
   reordenarse sin arrastrar fantasmas). */
function viviendas_con_estado(): array {
  $doc = leer_estado();
  $estado = $doc['viviendas'] ?? [];
  $unidades = leer_json(ruta_unidades()) ?: [];
  $filas = [];
  foreach ($unidades as $u) {
    if (!isset($u['id'])) continue;
    $id = (string) $u['id'];
    $filas[] = [
      'id'      => $id,
      'planta'  => (string) ($u['planta'] ?? ''),
      'dorm'    => $u['dorm'] ?? null,
      'sup'     => $u['supTotal'] ?? null,
      'precio'  => $u['precio'] ?? null,
      'estado'  => normalizar_estado($estado[$id] ?? ESTADO_POR_DEFECTO),
    ];
  }
  return $filas;
}

/* ── Equipos ────────────────────────────────────────────────────────────────
   Cada vez que el ejecutable de la oficina arranca llama al endpoint con su
   nombre y su versión. Aquí se anota, y el panel enseña cuándo fue la última
   vez. Es la forma de saber, sin ir a la oficina, si el visor está encendido y
   con qué datos. */
function registrar_equipo(string $nombre, string $version, string $sello): void {
  $nombre = trim(preg_replace('/[^A-Za-z0-9 ._\-]/', '', $nombre) ?? '');
  if ($nombre === '') return;
  $nombre = substr($nombre, 0, 40);
  $version = substr(trim(preg_replace('/[^A-Za-z0-9 ._\-]/', '', $version) ?? ''), 0, 20);

  $equipos = leer_json(ruta_equipos()) ?: [];
  $previo = $equipos[$nombre] ?? [];
  $equipos[$nombre] = [
    'visto'    => date('c'),
    'version'  => $version !== '' ? $version : ($previo['version'] ?? ''),
    'sello'    => $sello,
    'llamadas' => (int) ($previo['llamadas'] ?? 0) + 1,
  ];
  /* Un tope por si alguien juega con el parámetro: nos quedamos con los 20
     equipos vistos más recientemente. */
  if (count($equipos) > 20) {
    uasort($equipos, function ($a, $b) {
      return strcmp((string) $b['visto'], (string) $a['visto']);
    });
    $equipos = array_slice($equipos, 0, 20, true);
  }
  escribir_json(ruta_equipos(), $equipos);
}

function equipos(): array {
  $lista = leer_json(ruta_equipos()) ?: [];
  uasort($lista, function ($a, $b) {
    $va = isset($b['visto']) ? $b['visto'] : '';
    $vb = isset($a['visto']) ? $a['visto'] : '';
    return strcmp((string) $va, (string) $vb);
  });
  return $lista;
}
