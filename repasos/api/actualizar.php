<?php
/**
 * actualizar.php — da de alta el equipo inicial de una instalación nueva.
 *
 * Ya NO hay que abrirlo después de cada publicación: los campos y las
 * tablas que falten los añade el propio backend al arrancar
 * (api/lib/esquema.php). Este fichero queda solo para la primera puesta
 * en marcha, y por eso no se sube al servidor: se ejecuta en local.
 *
 * Nunca toca la contraseña de quien ya existe.
 */
declare(strict_types=1);

require __DIR__ . '/lib/nucleo.php';

/*
 * Esta página crea usuarios y enseña sus contraseñas en pantalla, y no
 * pide ninguna para hacerlo. El despliegue ya se encarga de no subirla y
 * de retirarla del servidor si quedó de antes, pero eso son dos pasos que
 * podrían fallar; este es el que no depende de nadie: fuera de la línea
 * de comandos y de la propia máquina, no se ejecuta.
 */
$porConsola = PHP_SAPI === 'cli' || PHP_SAPI === 'cli-server';
$desdeAqui = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if (!$porConsola && !$desdeAqui) {
    http_response_code(404);
    exit("No disponible.\n");
}

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

    require_once __DIR__ . '/lib/esquema.php';
    $hechos = esquema_aplicar($pdo);
    esquema_guardar_version($pdo, ESQUEMA_VERSION);
    $pasos[] = $hechos
        ? 'Campos añadidos: ' . htmlspecialchars(implode(', ', $hechos), ENT_QUOTES) . '.'
        : 'El esquema ya estaba al día.';

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

?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Actualización · UNIK Works</title>
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
    <h1>UNIK Works</h1>
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
      Copia las contraseñas de los usuarios nuevos antes de cerrar esta página: no se pueden volver a consultar.</p>
    <?php endif; ?>
  </div>
</body>
</html>
