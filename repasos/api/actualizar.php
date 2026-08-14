<?php
/**
 * actualizar.php — pone al día una instalación que ya está funcionando.
 *
 * Se abre en el navegador cada vez que se publica una versión que añade
 * campos o tablas nuevas. Es idempotente: mira qué falta y solo añade
 * eso, sin tocar ni un dato existente. Pasarlo dos veces no hace nada.
 *
 *     https://repasos.unikdi.com/api/actualizar.php
 *
 * También da de alta el equipo inicial (la lista de abajo), calculando
 * la contraseña de cada uno con la regla de la app. Los que ya existen
 * se dejan como están: nunca pisa una contraseña ya en uso.
 *
 * Cuando termine, bórralo del servidor.
 */
declare(strict_types=1);

require __DIR__ . '/lib/nucleo.php';

/* ═══════════════════════════════════════════════════════════════
   Equipo inicial. Vaciar esta lista cuando ya estén todos dados
   de alta, o dejarla: los existentes no se tocan.
   `verifica` = puede marcar tareas como VERIFICADAS.
   ═══════════════════════════════════════════════════════════════ */
const EQUIPO = [
    ['Francisco Juárez del Dago', 'f.juarez@unikdi.com',        'Unik — Promotor', true,  'admin'],
    ['Alba García',               'a.garcia@unikdi.com',        'Unik — Promotor', true,  'usuario'],
    ['Félix J. Bordes',           'fj@gadapbordes.com',         'DO — Arquitecto', true,  'usuario'],
    ['Felipe Remacha',            'gerente@proyecta21.com',     'DEO Aparejador',  false, 'usuario'],
    ['Tomás Bordes',              'estudio@gadapbordes.com',    'Arquitecto',      true,  'usuario'],
    ['Andrea García',             'arquitecta@unikdi.com',      'Arquitecta',      true,  'usuario'],
    ['Fran Acién',                'arquitecto@unikdi.com',      'Arquitecto',      true,  'usuario'],
    ['Juanjo Argüelles',          'jjarguelles@sinergiabs.com', 'Sinergia',        false, 'usuario'],
    ['Sofía Santana',             'sofiasantana@sinergiabs.com', 'Sinergia',       false, 'usuario'],
];

$pasos = [];
$altas = [];
$fallo = null;

try {
    $pdo = bd();
    $pasos[] = 'Conexión con la base de datos correcta (motor ' . motor() . ').';

    /* ── Tablas que falten (comentarios, y las demás si es nuevo) ── */
    $sql = file_get_contents(fichero_esquema());
    if ($sql === false) {
        throw new RuntimeException('No se encuentra el fichero de esquema.');
    }
    $creadas = 0;
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $sentencia) {
        if (stripos($sentencia, 'CREATE ') === false) {
            continue;
        }
        $pdo->exec($sentencia);
        $creadas++;
    }
    $pasos[] = "Tablas comprobadas ({$creadas} sentencias).";

    /* ── Columnas nuevas ── */
    $nuevas = [
        'usuarios' => [
            'empresa'  => "VARCHAR(120) NOT NULL DEFAULT ''",
            'verifica' => 'TINYINT(1) NOT NULL DEFAULT 0',
        ],
        'tareas' => [
            'rechazada' => 'TINYINT(1) NOT NULL DEFAULT 0',
        ],
        'medios' => [
            'comentario_id' => 'CHAR(36) DEFAULT NULL',
        ],
    ];
    $añadidas = [];
    foreach ($nuevas as $tabla => $columnas) {
        $existentes = columnas_de($tabla);
        foreach ($columnas as $nombre => $tipo) {
            if (in_array($nombre, $existentes, true)) {
                continue;
            }
            if (motor() === 'sqlite') {
                // SQLite no tiene TINYINT ni VARCHAR con longitud útil.
                $tipo = str_replace(['TINYINT(1)', 'CHAR(36)'], ['INTEGER', 'TEXT'], $tipo);
                $tipo = preg_replace('/VARCHAR\(\d+\)/', 'TEXT', $tipo);
            }
            $pdo->exec("ALTER TABLE {$tabla} ADD COLUMN {$nombre} {$tipo}");
            $añadidas[] = "{$tabla}.{$nombre}";
        }
    }
    $pasos[] = $añadidas
        ? 'Campos añadidos: ' . htmlspecialchars(implode(', ', $añadidas), ENT_QUOTES) . '.'
        : 'No faltaba ningún campo.';

    /* ── Equipo inicial ── */
    foreach (EQUIPO as [$nombre, $email, $empresa, $verifica, $rol]) {
        $email = mb_strtolower(trim($email));
        $stmt = $pdo->prepare('SELECT id, empresa, verifica FROM usuarios WHERE email = ?');
        $stmt->execute([$email]);
        $existente = $stmt->fetch();

        if ($existente) {
            // Ya está: solo se completan empresa y permiso si faltaban.
            // La contraseña NUNCA se toca.
            if (($existente['empresa'] ?? '') === '') {
                $pdo->prepare('UPDATE usuarios SET empresa = ?, verifica = ?, actualizado = ? WHERE id = ?')
                    ->execute([$empresa, $verifica ? 1 : 0, ahora_iso(), $existente['id']]);
                $altas[] = [$nombre, $email, '(sin cambiar)', $empresa, $verifica, 'actualizado'];
            } else {
                $altas[] = [$nombre, $email, '(sin cambiar)', $existente['empresa'], (int) $existente['verifica'] === 1, 'ya existía'];
            }
            continue;
        }

        $clave = contrasena_inicial($nombre, $empresa);
        $pdo->prepare(
            'INSERT INTO usuarios (id, nombre, email, password_hash, rol, empresa, verifica, activo, creado, actualizado)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
        )->execute([
            uuid(), $nombre, $email, password_hash($clave, PASSWORD_DEFAULT),
            $rol, $empresa, $verifica ? 1 : 0, ahora_iso(), ahora_iso(),
        ]);
        $altas[] = [$nombre, $email, $clave, $empresa, $verifica, 'creado'];
    }
} catch (Throwable $e) {
    $fallo = $e->getMessage();
}

/** Nombres de columna de una tabla, en los dos motores. */
function columnas_de(string $tabla): array
{
    try {
        if (motor() === 'sqlite') {
            $filas = bd()->query("PRAGMA table_info({$tabla})")->fetchAll();
            return array_column($filas, 'name');
        }
        $filas = bd()->query("SHOW COLUMNS FROM {$tabla}")->fetchAll();
        return array_column($filas, 'Field');
    } catch (Throwable $e) {
        return [];
    }
}

?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Actualización · UNIK repasos</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #f2f2f0; color: #161618;
         margin: 0; padding: 40px 16px; display: flex; justify-content: center; }
  .caja { background: #fff; border-radius: 24px; padding: 30px; max-width: 760px; width: 100%;
          box-shadow: 0 14px 40px rgba(17,17,18,.1); }
  h1 { font-size: 26px; letter-spacing: -.03em; margin: 0 0 4px; }
  p.sub { color: #8a8a90; font-size: 14px; margin: 0 0 22px; }
  h2 { font-size: 15px; margin: 26px 0 10px; letter-spacing: -.01em; }
  li { margin-bottom: 7px; line-height: 1.5; }
  .mal { background: #fdeceb; color: #b4453c; padding: 16px 18px; border-radius: 14px; line-height: 1.5; }
  .bien { background: rgba(155,143,127,.16); color: #6f6558; padding: 16px 18px; border-radius: 14px; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; margin-top: 8px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid rgba(17,17,18,.08); }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .09em; color: #8a8a90; }
  code { background: #f2f2f0; padding: 2px 6px; border-radius: 6px; font-size: 12.5px;
         font-family: ui-monospace, Menlo, monospace; }
  .si { color: #3f7d5a; font-weight: 700; }
  .no { color: #8a8a90; }
  .nuevo { font-weight: 700; }
</style>
</head>
<body>
  <div class="caja">
    <h1>UNIK repasos</h1>
    <p class="sub">Actualización del servidor</p>

    <ul>
      <?php foreach ($pasos as $paso): ?>
        <li><?= $paso ?></li>
      <?php endforeach; ?>
    </ul>

    <?php if ($fallo !== null): ?>
      <p class="mal"><strong>No se pudo terminar:</strong><br><?= htmlspecialchars($fallo, ENT_QUOTES) ?></p>
    <?php else: ?>
      <h2>Equipo</h2>
      <table>
        <thead><tr><th>Nombre</th><th>Correo</th><th>Contraseña</th><th>Empresa / rol</th><th>Verifica</th></tr></thead>
        <tbody>
        <?php foreach ($altas as [$nombre, $email, $clave, $empresa, $verifica, $que]): ?>
          <tr class="<?= $que === 'creado' ? 'nuevo' : '' ?>">
            <td><?= htmlspecialchars($nombre, ENT_QUOTES) ?></td>
            <td><?= htmlspecialchars($email, ENT_QUOTES) ?></td>
            <td><?= $clave === '(sin cambiar)' ? '<span class="no">sin cambiar</span>' : '<code>' . htmlspecialchars($clave, ENT_QUOTES) . '</code>' ?></td>
            <td><?= htmlspecialchars($empresa, ENT_QUOTES) ?></td>
            <td><?= $verifica ? '<span class="si">sí</span>' : '<span class="no">no</span>' ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>

      <p class="bien" style="margin-top:22px"><strong>Listo.</strong>
      Copia las contraseñas de los usuarios nuevos antes de cerrar esta página: no se pueden volver a consultar.
      Después borra <code>api/actualizar.php</code> del servidor.</p>
    <?php endif; ?>
  </div>
</body>
</html>
