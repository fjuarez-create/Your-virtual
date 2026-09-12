<?php
/* ── Diagnóstico del panel ────────────────────────────────────────────────────
   Página de un solo uso: dice si el hosting puede con el panel y, si no puede,
   por qué. Se escribe a propósito con la sintaxis más vieja posible —sin
   `declare`, sin `??`, sin tipos— para que funcione incluso en un PHP antiguo
   donde el resto del panel no arrancaría. No carga lib.php: si el problema
   estuviera ahí, esta página tiene que seguir contestando.

   No enseña ninguna contraseña ni ningún hash: solo si los ficheros están y si
   se puede escribir. */

header('Content-Type: text/html; charset=utf-8');

$dirDatos  = __DIR__ . '/datos';
$semilla   = dirname(__DIR__) . '/data/availability.json';
$unidades  = dirname(__DIR__) . '/data/units.json';

$hayDir    = is_dir($dirDatos);
$escribible = $hayDir ? is_writable($dirDatos) : is_writable(__DIR__);
$hayClave  = is_file($dirDatos . '/clave.php');
$hayEstado = is_file($dirDatos . '/estado.json');
$haySem    = is_readable($semilla);
$hayUni    = is_readable($unidades);
$versionOk = PHP_VERSION_ID >= 70000;
$hayJson   = function_exists('json_encode');
$hayHash   = function_exists('password_hash');

$filas = array(
  array('Versión de PHP', PHP_VERSION, $versionOk, 'El panel necesita PHP 7.0 o más nuevo. En Plesk: PHP Settings del dominio.'),
  array('json_encode disponible', $hayJson ? 'sí' : 'no', $hayJson, 'Sin la extensión JSON el panel no puede guardar nada.'),
  array('password_hash disponible', $hayHash ? 'sí' : 'no', $hayHash, 'Es lo que cifra la contraseña del panel.'),
  array('Carpeta gestion/datos', $hayDir ? 'existe' : 'todavía no existe', true, $hayDir ? '' : 'Se crea sola en la primera visita al panel, si hay permiso de escritura.'),
  array('Permiso de escritura', $escribible ? 'sí' : 'NO', $escribible, 'En Plesk: Archivos → httpdocs → gestion → Permisos, y dale escritura al usuario web.'),
  array('data/availability.json', $haySem ? 'legible' : 'NO se encuentra', $haySem, 'Es la semilla del estado inicial. Debería estar en data/ junto al visor.'),
  array('data/units.json', $hayUni ? 'legible' : 'NO se encuentra', $hayUni, 'Es el catálogo de las 166 viviendas.'),
  array('Contraseña del panel', $hayClave ? 'ya creada' : 'sin crear', true, $hayClave ? '' : 'Entra a /gestion y créala cuanto antes.'),
  array('Estado de las viviendas', $hayEstado ? 'guardado en el servidor' : 'aún sin guardar (se usa la semilla)', true, ''),
);

$fallos = 0;
foreach ($filas as $f) { if (!$f[2]) { $fallos++; } }
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Comprobación · Panel de gestión</title>
<style>
  body { margin: 0; padding: 24px 16px 60px; background: #f6f4f0; color: #23211d;
         font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  .marca { margin: 0 0 20px; font-size: .72rem; letter-spacing: .14em; text-transform: uppercase; color: #6d6a63; }
  .veredicto { padding: 14px 16px; border-radius: 10px; margin-bottom: 22px; font-weight: 600; }
  .bien { background: #e6f6ee; color: #15694a; border: 1px solid #bfe3d1; }
  .mal  { background: #fbeee7; color: #91401a; border: 1px solid #e8c4b4; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2ded6; border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 13px; border-bottom: 1px solid #e2ded6; vertical-align: top; font-size: .92rem; }
  th { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: #6d6a63; }
  tr:last-child td { border-bottom: 0; }
  .ok { color: #1f9d6b; font-weight: 600; }
  .no { color: #b3401a; font-weight: 600; }
  .pista { display: block; margin-top: 3px; color: #6d6a63; font-size: .82rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em; background: #f2f0ec; padding: 1px 5px; border-radius: 3px; }
  p.pie { color: #6d6a63; font-size: .86rem; margin-top: 22px; }
  a { color: #b4622a; }
</style>
</head>
<body>
<main>
  <p class="marca">UNIK · SERENEA</p>
  <h1>Comprobación del panel</h1>

  <?php if ($fallos === 0): ?>
    <p class="veredicto bien">Todo correcto. El panel debería funcionar: <a href="./">entra aquí</a>.</p>
  <?php else: ?>
    <p class="veredicto mal">Hay <?= $fallos ?> cosa<?= $fallos === 1 ? '' : 's' ?> que arreglar. Están marcadas abajo en rojo.</p>
  <?php endif; ?>

  <table>
    <thead><tr><th>Qué</th><th>Cómo está</th></tr></thead>
    <tbody>
    <?php foreach ($filas as $f): ?>
      <tr>
        <td><?= htmlspecialchars($f[0], ENT_QUOTES, 'UTF-8') ?></td>
        <td>
          <span class="<?= $f[2] ? 'ok' : 'no' ?>"><?= htmlspecialchars($f[1], ENT_QUOTES, 'UTF-8') ?></span>
          <?php if ($f[3] !== ''): ?><span class="pista"><?= htmlspecialchars($f[3], ENT_QUOTES, 'UTF-8') ?></span><?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>

  <p class="pie">La carpeta del panel en el servidor es <code><?= htmlspecialchars(__DIR__, ENT_QUOTES, 'UTF-8') ?></code>.
    El endpoint que consultan los visores es <a href="api/estado.php">api/estado.php</a>.</p>
</main>
</body>
</html>
