<?php

/* ── Panel de gestión comercial · showroom.unikdi.com/gestion ─────────────────
   Una sola pantalla: las 166 viviendas del Apolo con tres estados. Lo que se
   guarda aquí es lo que ven al instante los dos visores web y, en el siguiente
   arranque, el ejecutable de la oficina de ventas.

   Sobre la contraseña: no hay ninguna en el repositorio ni ningún secreto
   nuevo en GitHub. La primera vez que se entra, el panel pide crearla y la
   guarda cifrada en gestion/datos/clave.php, que vive solo en el servidor.
   IMPORTANTE: entra a crearla en cuanto se publique, porque hasta entonces
   cualquiera que dé con la URL podría crearla él. */

require __DIR__ . '/lib.php';

$https = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && $_SERVER['HTTPS'] !== 'off')
  || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

/* La forma con array —la única que admite SameSite— es de PHP 7.3 en adelante.
   En una versión anterior hay que pasar los parámetros sueltos, y SameSite se
   queda fuera; la cookie sigue siendo httponly y secure, que es lo que de
   verdad la protege. */
if (PHP_VERSION_ID >= 70300) {
  session_set_cookie_params(array(
    'httponly' => true,
    'samesite' => 'Lax',
    'secure'   => $https,
  ));
} else {
  session_set_cookie_params(0, '/', '', $https, true);
}
session_name('unikgestion');
session_start();

function h($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }

function testigo() {
  if (empty($_SESSION['testigo'])) $_SESSION['testigo'] = bin2hex(bytes_aleatorios(16));
  return $_SESSION['testigo'];
}
function testigo_valido() {
  return isset($_POST['testigo'], $_SESSION['testigo'])
    && hash_equals((string) $_SESSION['testigo'], (string) $_POST['testigo']);
}

function hay_clave() { return is_file(ruta_clave()); }
function hash_guardado() {
  $c = @include ruta_clave();
  return is_array($c) && isset($c['hash']) ? (string) $c['hash'] : '';
}
function guardar_clave($clave) {
  if (!asegurar_datos()) return false;
  $php = "<?php\n/* Generado por el panel. No está en el repositorio: solo existe aquí. */\nreturn "
    . var_export(array('hash' => password_hash($clave, PASSWORD_DEFAULT), 'creada' => date('c')), true) . ";\n";
  $tmp = ruta_clave() . '.tmp';
  if (@file_put_contents($tmp, $php, LOCK_EX) === false) return false;
  return @rename($tmp, ruta_clave());
}

/* Freno a la fuerza bruta: cinco fallos y quince minutos de espera. */
function bloqueado_hasta() {
  return (int) dato(leer_json(ruta_intentos()), 'hasta', 0);
}
function anotar_fallo() {
  $fallos = ((int) dato(leer_json(ruta_intentos()), 'fallos', 0)) + 1;
  escribir_json(ruta_intentos(), array(
    'fallos' => $fallos,
    'hasta'  => $fallos >= 5 ? time() + 900 : 0,
  ));
}
function limpiar_fallos() { escribir_json(ruta_intentos(), array('fallos' => 0, 'hasta' => 0)); }

$dentro = !empty($_SESSION['dentro']);
$aviso = null;
$error = null;

/* ── Acciones ─────────────────────────────────────────────────────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $accion = (string) dato($_POST, 'accion', '');

  if (!testigo_valido()) {
    $error = 'La sesión ha caducado. Vuelve a intentarlo.';
  } elseif ($accion === 'crear' && !hay_clave()) {
    $c1 = (string) dato($_POST, 'clave', '');
    $c2 = (string) dato($_POST, 'clave2', '');
    if (strlen($c1) < 8)        $error = 'La contraseña necesita al menos 8 caracteres.';
    elseif ($c1 !== $c2)        $error = 'Las dos contraseñas no coinciden.';
    elseif (!guardar_clave($c1)) $error = 'No se ha podido guardar. Comprueba los permisos de escritura de gestion/datos.';
    else { $_SESSION['dentro'] = true; $dentro = true; $aviso = 'Contraseña creada. Ya puedes gestionar las viviendas.'; }

  } elseif ($accion === 'entrar' && hay_clave()) {
    if (bloqueado_hasta() > time()) {
      $error = 'Demasiados intentos. Prueba de nuevo en ' . ceil((bloqueado_hasta() - time()) / 60) . ' minutos.';
    } elseif (password_verify((string) dato($_POST, 'clave', ''), hash_guardado())) {
      session_regenerate_id(true);
      limpiar_fallos();
      $_SESSION['dentro'] = true;
      $dentro = true;
    } else {
      usleep(400000);
      anotar_fallo();
      $error = 'Contraseña incorrecta.';
    }

  } elseif ($accion === 'salir') {
    $_SESSION = array();
    session_destroy();
    header('Location: ' . strtok((string) dato($_SERVER, 'REQUEST_URI', '/gestion/'), '?'));
    exit;

  } elseif ($accion === 'guardar' && $dentro) {
    $enviado = (array) dato($_POST, 'estado', array());
    $viviendas = array();
    /* Se recorre el catálogo, no lo enviado: así un id inventado en el POST no
       entra, y una vivienda que falte en el formulario no desaparece. Un valor
       que no sea uno de los tres estados tampoco cuenta: se conserva el que
       tenía. Un POST a medias no puede dejar una vendida como disponible. */
    foreach (viviendas_con_estado() as $v) {
      $nuevo = dato($enviado, $v['id']);
      $viviendas[$v['id']] = in_array($nuevo, estados_validos(), true) ? $nuevo : $v['estado'];
    }
    if (guardar_estado($viviendas)) {
      $_SESSION['flash'] = 'Guardado. Los visores ya lo enseñan; la oficina lo verá al abrir el ejecutable.';
    } else {
      $_SESSION['flash_error'] = 'No se ha podido guardar. Comprueba que gestion/datos tiene permiso de escritura.';
    }
    header('Location: ' . strtok((string) dato($_SERVER, 'REQUEST_URI', '/gestion/'), '?'));
    exit;
  }
}

if (!empty($_SESSION['flash']))       { $aviso = $_SESSION['flash']; unset($_SESSION['flash']); }
if (!empty($_SESSION['flash_error'])) { $error = $_SESSION['flash_error']; unset($_SESSION['flash_error']); }

$escribible = asegurar_datos();
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Gestión · Edificio Apolo</title>
<link rel="icon" href="/assets/icono/favicon.ico" sizes="any">
<link rel="stylesheet" href="estilo.css?v=2">
</head>
<body>

<?php if (!$dentro): ?>
<main class="portada">
  <div class="tarjeta">
    <p class="marca">UNIK · SERENEA</p>
    <h1>Edificio Apolo</h1>
    <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>
    <?php if (!$escribible): ?>
      <p class="error">La carpeta <code>gestion/datos</code> no se puede escribir. En Plesk: Archivos → gestion → datos → Permisos, y dale escritura al usuario web.</p>
    <?php endif; ?>

    <?php if (!hay_clave()): ?>
      <p class="pie">Primera entrada: elige la contraseña del panel. Se guarda cifrada en el servidor, no en el repositorio.</p>
      <form method="post" autocomplete="off">
        <input type="hidden" name="testigo" value="<?= h(testigo()) ?>">
        <input type="hidden" name="accion" value="crear">
        <label>Contraseña nueva
          <input type="password" name="clave" minlength="8" required autofocus>
        </label>
        <label>Repítela
          <input type="password" name="clave2" minlength="8" required>
        </label>
        <button type="submit">Crear contraseña</button>
      </form>
    <?php else: ?>
      <form method="post" autocomplete="off">
        <input type="hidden" name="testigo" value="<?= h(testigo()) ?>">
        <input type="hidden" name="accion" value="entrar">
        <label>Contraseña
          <input type="password" name="clave" required autofocus>
        </label>
        <button type="submit">Entrar</button>
      </form>
    <?php endif; ?>
  </div>
</main>

<?php else:
  $filas = viviendas_con_estado();
  $doc = leer_estado();
  $cuenta = ['disponible' => 0, 'reservada' => 0, 'vendida' => 0];
  $plantas = [];
  foreach ($filas as $v) {
    $cuenta[$v['estado']]++;
    $plantas[$v['planta']][] = $v;
  }
  $lista_equipos = equipos();
?>
<header class="barra">
  <div>
    <p class="marca">UNIK · SERENEA</p>
    <h1>Edificio Apolo</h1>
  </div>
  <form method="post" class="salir">
    <input type="hidden" name="testigo" value="<?= h(testigo()) ?>">
    <input type="hidden" name="accion" value="salir">
    <button type="submit" class="enlace">Salir</button>
  </form>
</header>

<main>
  <?php if ($aviso): ?><p class="aviso"><?= h($aviso) ?></p><?php endif; ?>
  <?php if ($error): ?><p class="error"><?= h($error) ?></p><?php endif; ?>

  <section class="resumen">
    <p class="cifra disponible"><strong id="nDisponible"><?= $cuenta['disponible'] ?></strong> disponibles</p>
    <p class="cifra reservada"><strong id="nReservada"><?= $cuenta['reservada'] ?></strong> reservadas</p>
    <p class="cifra vendida"><strong id="nVendida"><?= $cuenta['vendida'] ?></strong> vendidas</p>
    <p class="sello">Última actualización <?= h(date('d/m/Y H:i', strtotime((string) dato($doc, 'actualizado', 'now')))) ?> · sello <code><?= h(substr((string) dato($doc, 'sello', ''), 0, 8)) ?></code></p>
  </section>

  <form method="post" id="formulario">
    <input type="hidden" name="testigo" value="<?= h(testigo()) ?>">
    <input type="hidden" name="accion" value="guardar">

    <div class="filtro">
      <input type="search" id="buscar" placeholder="Buscar vivienda (por ejemplo 214)" autocomplete="off">
    </div>

    <?php foreach ($plantas as $nombre => $grupo): ?>
      <section class="planta">
        <h2><?= h($nombre) ?> <span><?= count($grupo) ?> viviendas</span></h2>
        <div class="rejilla">
          <?php foreach ($grupo as $v): ?>
            <div class="vivienda estado-<?= h($v['estado']) ?>" data-id="<?= h($v['id']) ?>">
              <p class="id"><?= h($v['id']) ?>
                <span class="detalle"><?= h($v['dorm']) ?>D · <?= h(number_format((float) $v['sup'], 0, ',', '.')) ?> m²</span>
              </p>
              <div class="opciones">
                <?php foreach (estados_validos() as $e): ?>
                  <label class="op op-<?= h($e) ?>">
                    <input type="radio" name="estado[<?= h($v['id']) ?>]" value="<?= h($e) ?>"
                      <?= $v['estado'] === $e ? 'checked' : '' ?>>
                    <span><?= h(['disponible' => 'Libre', 'reservada' => 'Reserv.', 'vendida' => 'Vendida'][$e]) ?></span>
                  </label>
                <?php endforeach; ?>
              </div>
            </div>
          <?php endforeach; ?>
        </div>
      </section>
    <?php endforeach; ?>

    <div class="guardar">
      <button type="submit">Guardar cambios</button>
      <span id="pendiente" hidden>Hay cambios sin guardar</span>
    </div>
  </form>

  <section class="equipos">
    <h2>Oficina de ventas</h2>
    <?php if (!$lista_equipos): ?>
      <p class="pie">Todavía no ha llamado ningún equipo. El ejecutable se anota solo la primera vez que arranca con conexión.</p>
    <?php else: ?>
      <table>
        <thead><tr><th>Equipo</th><th>Última conexión</th><th>Versión</th><th>Datos</th></tr></thead>
        <tbody>
        <?php foreach ($lista_equipos as $nombre => $e):
          $visto = strtotime((string) dato($e, 'visto', ''));
          if (!$visto) $visto = 0;
          $aldia = dato($e, 'sello', '') === dato($doc, 'sello', '');
        ?>
          <tr>
            <td><?= h($nombre) ?></td>
            <td><?= $visto ? h(date('d/m/Y H:i', $visto)) : '—' ?></td>
            <td><?= h(dato($e, 'version', '')) ?: '—' ?></td>
            <td class="<?= $aldia ? 'ok' : 'viejo' ?>"><?= $aldia ? 'Al día' : 'Pendiente de reabrir' ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
    <p class="pie">El ejecutable lee <code>/gestion/api/estado.php</code> al abrirse y guarda una copia en el disco,
      así que si un día la oficina se queda sin internet sigue enseñando el último estado conocido.</p>
  </section>
</main>

<script src="panel.js?v=2" defer></script>
<?php endif; ?>

</body>
</html>
