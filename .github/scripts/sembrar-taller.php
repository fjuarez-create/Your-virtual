<?php

/**
 * Siembra el banco del taller: el esquema al día y un administrador de
 * pruebas. Se ejecuta en el robot, sobre la carpeta de publicación, y
 * el fichero SQLite resultante viaja por FTP ya listo.
 *
 * El correo y la contraseña llegan por variables de entorno, nunca por
 * argumentos: los argumentos se ven en la lista de procesos.
 */

declare(strict_types=1);

$api = $argv[1] ?? '';
$email = (string) getenv('TALLER_EMAIL');
$password = (string) getenv('TALLER_PASSWORD');
$nombre = (string) (getenv('TALLER_NOMBRE') ?: 'Fran (taller)');

if ($api === '' || !is_dir($api)) {
    fwrite(STDERR, "Falta la carpeta api del taller.\n");
    exit(1);
}
if ($email === '' || $password === '') {
    fwrite(STDERR, "Faltan TALLER_EMAIL y TALLER_PASSWORD en el entorno.\n");
    exit(1);
}

require_once $api . '/lib/nucleo.php';
require_once $api . '/lib/esquema.php';

$pdo = bd();
esquema_aplicar_o_anotar($pdo);

$pdo->prepare(
    'INSERT INTO usuarios (id, nombre, email, password_hash, rol, empresa,
                           verifica, activo, creado, actualizado)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)'
)->execute([
    uuid(), $nombre, mb_strtolower(trim($email)),
    password_hash($password, PASSWORD_DEFAULT),
    'admin', 'UNIK — Promotor', ahora_iso(), ahora_iso(),
]);

// El banco viaja por FTP como un solo fichero: se recoge el diario
// WAL antes de cerrar, para que no queden flecos aparte.
$pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');

echo "Banco del taller sembrado: esquema al día y administrador creado.\n";
