<?php

/**
 * Siembra el banco del taller: el esquema al día, las cuentas del
 * equipo copiadas de la app real y la cuenta de entrada del robot.
 *
 * Las cuentas llegan en un JSON con sus huellas cifradas
 * (password_hash), nunca con contraseñas: una huella no se puede
 * deshacer, y así en el taller cada uno entra con su usuario y su
 * contraseña de siempre sin que estas viajen por ningún sitio.
 *
 * El correo y la contraseña de la cuenta del robot llegan por
 * variables de entorno, nunca por argumentos: los argumentos se ven
 * en la lista de procesos.
 */

declare(strict_types=1);

$api = $argv[1] ?? '';
$ficheroUsuarios = $argv[2] ?? '';
$email = (string) getenv('TALLER_EMAIL');
$password = (string) getenv('TALLER_PASSWORD');
$nombre = (string) (getenv('TALLER_NOMBRE') ?: 'Revisión (taller)');

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

$meter = $pdo->prepare(
    'INSERT INTO usuarios (id, nombre, email, password_hash, rol, empresa,
                           verifica, activo, creado, actualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

$copiados = 0;
if ($ficheroUsuarios !== '') {
    $filas = json_decode((string) file_get_contents($ficheroUsuarios), true);
    if (!is_array($filas) || $filas === []) {
        fwrite(STDERR, "El fichero de usuarios no trae ninguna fila.\n");
        exit(1);
    }
    foreach ($filas as $u) {
        if (empty($u['email']) || empty($u['password_hash'])) {
            continue;
        }
        $meter->execute([
            (string) ($u['id'] ?? uuid()),
            (string) ($u['nombre'] ?? 'Sin nombre'),
            mb_strtolower(trim((string) $u['email'])),
            (string) $u['password_hash'],
            ($u['rol'] ?? 'usuario') === 'admin' ? 'admin' : 'usuario',
            (string) ($u['empresa'] ?? ''),
            ((int) ($u['verifica'] ?? 0)) ? 1 : 0,
            ((int) ($u['activo'] ?? 1)) ? 1 : 0,
            (string) ($u['creado'] ?? ahora_iso()),
            ahora_iso(),
        ]);
        $copiados++;
    }
}

// La cuenta de entrada del robot, que es también con la que el robot
// comprueba que el taller respira: si vino copiada de la app real se
// la asciende, y si no existía se crea. En el taller manda; en la app
// real sigue siendo la de siempre.
$correo = mb_strtolower(trim($email));
$hay = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
$hay->execute([$correo]);
$id = $hay->fetchColumn();
if ($id) {
    $pdo->prepare(
        "UPDATE usuarios SET rol = 'admin', verifica = 1, activo = 1,
                password_hash = ?, actualizado = ? WHERE id = ?"
    )->execute([password_hash($password, PASSWORD_DEFAULT), ahora_iso(), $id]);
} else {
    $meter->execute([
        uuid(), $nombre, $correo, password_hash($password, PASSWORD_DEFAULT),
        'admin', 'UNIK — Promotor', 1, 1, ahora_iso(), ahora_iso(),
    ]);
}

// El banco viaja por FTP como un solo fichero: se recoge el diario
// WAL antes de cerrar, para que no queden flecos aparte. Con un
// cursor abierto SQLite no suelta el candado, así que primero se
// cierran las consultas.
$hay->closeCursor();
$hay = null;
$meter = null;
$pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');

echo "Banco del taller sembrado: {$copiados} cuentas copiadas de la app real y la cuenta del robot al mando.\n";
