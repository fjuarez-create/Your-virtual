<?php

/* ── GET /gestion/api/estado.php ──────────────────────────────────────────────
   La única fuente de verdad sobre qué viviendas están disponibles, reservadas
   o vendidas. La consultan tres clientes:

     · el visor clásico (showroom.unikdi.com/)
     · el visor nuevo   (showroom.unikdi.com/new/)
     · el ejecutable de Unreal de la oficina de ventas, al arrancar

   Respuesta:

     {
       "actualizado": "2026-09-12T18:04:11+02:00",
       "sello": "9f2c1a77b0e4",
       "total": 166,
       "viviendas": { "101": "vendida", "102": "disponible", ... }
     }

   Parámetros opcionales, pensados para el ejecutable:

     ?equipo=ventas-01    nombre del puesto; queda anotado con la fecha de la
                          llamada y aparece en el panel. Sin él no se anota
                          nada, así que las visitas del navegador no ensucian.
     ?version=1.4.0       versión del ejecutable, para saber si la oficina
                          tiene la build buena.

   El `sello` va también como ETag: mandando If-None-Match el servidor
   responde 304 sin cuerpo si nada ha cambiado. Así el ejecutable puede
   preguntar cada pocos minutos sin gastar nada.

   No hay clave: el estado comercial es justo lo que el visor público ya
   enseña. Lo que sí está protegido es escribirlo, que es cosa del panel. */

require dirname(__DIR__) . '/lib.php';

$doc = leer_estado();
$sello = (string) dato($doc, 'sello', '');

registrar_equipo(
  (string) dato($_GET, 'equipo', ''),
  (string) dato($_GET, 'version', ''),
  $sello
);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
/* El ejecutable no es un navegador y no le hace falta, pero el visor sí puede
   servirse desde otro dominio (una landing de GILMAR, por ejemplo). */
header('Access-Control-Allow-Origin: *');
header('ETag: "' . $sello . '"');

$previo = trim((string) dato($_SERVER, 'HTTP_IF_NONE_MATCH', ''), '"');
if ($previo !== '' && $previo === $sello) {
  http_response_code(304);
  exit;
}

unset($doc['origen']);
$opciones = 0;
if (defined('JSON_PRETTY_PRINT'))      $opciones |= JSON_PRETTY_PRINT;
if (defined('JSON_UNESCAPED_UNICODE')) $opciones |= JSON_UNESCAPED_UNICODE;
if (defined('JSON_UNESCAPED_SLASHES')) $opciones |= JSON_UNESCAPED_SLASHES;
echo json_encode($doc, $opciones), "\n";
