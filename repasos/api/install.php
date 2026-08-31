<?php
/**
 * install.php — puesta en marcha.
 *
 * Se abre UNA vez en el navegador (https://repasos.unikdi.com/api/install.php):
 * crea las tablas y el primer administrador con los datos de config.php.
 * Si ya hay usuarios, no hace nada: no es una puerta trasera para crear
 * administradores nuevos.
 *
 * Cuando termine, borra este fichero del servidor.
 */
declare(strict_types=1);

require __DIR__ . '/lib/nucleo.php';

header('Content-Type: text/html; charset=utf-8');

$pasos = [];
$fallo = null;

try {
    $pdo = bd();
    $pasos[] = 'Conexión con la base de datos correcta.';

    $sql = file_get_contents(fichero_esquema());
    if ($sql === false) {
        throw new RuntimeException('No se encuentra el fichero de esquema.');
    }
    $creadas = 0;
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $sentencia) {
        // Cada trozo arrastra los comentarios que lo preceden; solo se
        // ejecutan los que contienen realmente un CREATE.
        if (stripos($sentencia, 'CREATE ') === false) {
            continue;
        }
        $pdo->exec($sentencia);
        $creadas++;
    }
    $pasos[] = "Esquema aplicado ({$creadas} sentencias, motor " . motor() . ').';

    $carpeta = carpeta_medios();
    $pasos[] = 'Carpeta de medios lista: ' . htmlspecialchars($carpeta, ENT_QUOTES);
    if (!is_writable($carpeta)) {
        throw new RuntimeException('La carpeta de medios no tiene permisos de escritura.');
    }

    $cuantos = (int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
    if ($cuantos > 0) {
        $pasos[] = "Ya hay {$cuantos} usuario(s): no se crea ninguno.";
    } else {
        $admin = config()['admin_inicial'] ?? [];
        $nombre = trim((string) ($admin['nombre'] ?? ''));
        $email = mb_strtolower(trim((string) ($admin['email'] ?? '')));
        $password = (string) ($admin['password'] ?? '');

        if ($nombre === '' || $email === '' || $password === '') {
            throw new RuntimeException('Rellena admin_inicial en config.php (nombre, email y password) y recarga.');
        }
        if (mb_strlen($password) < 8) {
            throw new RuntimeException('La contraseña del administrador debe tener al menos 8 caracteres.');
        }
        $pdo->prepare(
            'INSERT INTO usuarios (id, nombre, email, password_hash, rol, activo, creado, actualizado)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
        )->execute([uuid(), $nombre, $email, password_hash($password, PASSWORD_DEFAULT), 'admin', ahora_iso(), ahora_iso()]);
        $pasos[] = 'Administrador creado: ' . htmlspecialchars($email, ENT_QUOTES);
    }
} catch (Throwable $e) {
    $fallo = $e->getMessage();
}

?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Instalación · UNIK Works</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; background: #f2f2f0; color: #161618;
         margin: 0; padding: 40px 20px; display: flex; justify-content: center; }
  .caja { background: #fff; border-radius: 24px; padding: 30px; max-width: 560px; width: 100%;
          box-shadow: 0 14px 40px rgba(17,17,18,.1); }
  h1 { font-size: 26px; letter-spacing: -.03em; margin: 0 0 6px; }
  p.sub { color: #8a8a90; font-size: 14px; margin: 0 0 22px; }
  li { margin-bottom: 8px; line-height: 1.5; }
  .mal { background: #fdeceb; color: #b4453c; padding: 16px 18px; border-radius: 14px; line-height: 1.5; }
  .bien { background: rgba(155,143,127,.16); color: #6f6558; padding: 16px 18px; border-radius: 14px; line-height: 1.5; }
  code { background: #f2f2f0; padding: 2px 6px; border-radius: 6px; font-size: 13px; }
</style>
</head>
<body>
  <div class="caja">
    <h1>UNIK Works</h1>
    <p class="sub">Instalación del servidor</p>
    <ul>
      <?php foreach ($pasos as $paso): ?>
        <li><?= $paso ?></li>
      <?php endforeach; ?>
    </ul>
    <?php if ($fallo !== null): ?>
      <p class="mal"><strong>No se pudo terminar:</strong><br><?= htmlspecialchars($fallo, ENT_QUOTES) ?></p>
    <?php else: ?>
      <p class="bien"><strong>Listo.</strong> Ya puedes entrar en la app.
      Borra ahora <code>api/install.php</code> del servidor y vacía
      <code>admin_inicial</code> en <code>config.php</code>.</p>
    <?php endif; ?>
  </div>
</body>
</html>
