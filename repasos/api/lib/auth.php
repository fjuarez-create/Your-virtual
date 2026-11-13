<?php
/**
 * auth.php — sesiones por cookie.
 *
 * El token va en una cookie HttpOnly: JavaScript no lo ve, así que un
 * script inyectado no puede robarlo, y de paso las fotos se pueden pedir
 * con <img src="…/fichero"> sin montar cabeceras de autorización.
 */
declare(strict_types=1);

/* La cookie de la sesión, y el taller. La app de verdad vive en la raíz
   del dominio y el taller —la rama de pruebas— en /taller/, en el MISMO
   origen; y una cookie con path «/» es de todo el origen, no de una
   carpeta. Con una sola para las dos, entrar en el taller le pisaba la
   sesión a la app de verdad: su servidor no conoce ese token, contesta
   401 y la app manda a la pantalla de entrar (y al revés). No se perdía
   nada, pero quien usa las dos —Fran, sobre todo— tenía que volver a
   entrar cada vez que cambiaba de una a otra (noviembre de 2026).

   Por eso la API que se sirve desde /taller/ lleva SU cookie: con path
   «/taller/», para que ni siquiera viaje a la app de verdad, y con OTRO
   nombre, porque la de la app de verdad sí le llega al taller (su path
   «/» lo abarca) y el taller no tiene que mirarla nunca, ni aunque
   dentro viniera un token suyo.

   La de la app de verdad NO cambia, ni puede cambiar: ni el nombre, ni
   el path, ni un atributo. Con otro nombre, el equipo entero se
   quedaría fuera a la vez y tendría que volver a entrar, y hay quien no
   recuerda su contraseña.

   Que esto es el taller se sabe por SCRIPT_NAME: la dirección del
   index.php que está corriendo, tal como la ha resuelto el servidor
   («/api/index.php» o «/taller/api/index.php», lo mismo en Apache con
   su .htaccess que con php -S). NO por REQUEST_URI, que es lo que
   escribió quien pide, sin resolver: «/taller/../api/auth/login»
   empieza por /taller/ y la contesta la app de verdad.

   OJO: quien aparta la sesión es el código que corre EN el taller.
   Mientras el taller publicado no lleve este fichero, sigue poniendo y
   leyendo la cookie de la app de verdad. Y el día que lo lleve, quien
   estuviera dentro del taller tendrá que entrar en él una vez más: su
   sesión iba en la cookie de la app de verdad, que el taller deja de
   mirar. */
define('EN_EL_TALLER', strpos((string) ($_SERVER['SCRIPT_NAME'] ?? ''), '/taller/') === 0);
define('COOKIE_SESION', EN_EL_TALLER ? 'repasos_sesion_taller' : 'repasos_sesion');
define('COOKIE_CAMINO', EN_EL_TALLER ? '/taller/' : '/');
// Seis meses: se entra una vez y el móvil de obra no vuelve a pedir
// nada hasta pasado ese plazo.
const DIAS_SESION = 183;
const MAX_INTENTOS = 8;              // por correo e IP
const VENTANA_INTENTOS = 900;        // 15 minutos

function crear_sesion(string $usuarioId): string
{
    $token = bin2hex(random_bytes(32));
    $caduca = gmdate('Y-m-d\TH:i:s', time() + DIAS_SESION * 86400) . '.000Z';
    bd()->prepare(
        'INSERT INTO sesiones (token, usuario_id, creado, visto, caduca, agente)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([
        hash('sha256', $token), $usuarioId, ahora_iso(), ahora_iso(), $caduca,
        mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 250),
    ]);

    setcookie(COOKIE_SESION, $token, [
        'expires'  => time() + DIAS_SESION * 86400,
        'path'     => COOKIE_CAMINO,
        'secure'   => (bool) (config()['cookie_segura'] ?? true),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    return $token;
}

function cerrar_sesion(): void
{
    $token = $_COOKIE[COOKIE_SESION] ?? '';
    if ($token !== '') {
        bd()->prepare('DELETE FROM sesiones WHERE token = ?')->execute([hash('sha256', $token)]);
    }
    setcookie(COOKIE_SESION, '', [
        'expires'  => time() - 3600,
        'path'     => COOKIE_CAMINO,
        'secure'   => (bool) (config()['cookie_segura'] ?? true),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/** Usuario de la petición actual, o null. */
function usuario_actual(): ?array
{
    static $usuario = false;
    if ($usuario !== false) {
        return $usuario;
    }
    $usuario = null;

    $token = $_COOKIE[COOKIE_SESION] ?? '';
    if ($token === '') {
        return null;
    }
    $stmt = bd()->prepare(
        'SELECT u.*, s.caduca
           FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token = ?'
    );
    $stmt->execute([hash('sha256', $token)]);
    $fila = $stmt->fetch();
    if (!$fila) {
        return null;
    }
    if ($fila['caduca'] < ahora_iso() || (int) $fila['activo'] !== 1) {
        bd()->prepare('DELETE FROM sesiones WHERE token = ?')->execute([hash('sha256', $token)]);
        return null;
    }

    // La sesión se renueva como mucho una vez al día: escribir en cada
    // petición multiplicaría los INSERT sin ganar nada.
    if ($fila['caduca'] < gmdate('Y-m-d\TH:i:s', time() + (DIAS_SESION - 1) * 86400) . '.000Z') {
        bd()->prepare('UPDATE sesiones SET visto = ?, caduca = ? WHERE token = ?')->execute([
            ahora_iso(),
            gmdate('Y-m-d\TH:i:s', time() + DIAS_SESION * 86400) . '.000Z',
            hash('sha256', $token),
        ]);
    }

    $usuario = [
        'id'       => $fila['id'],
        'nombre'   => $fila['nombre'],
        'email'    => $fila['email'],
        'rol'      => $fila['rol'],
        'empresa'  => $fila['empresa'] ?? '',
        'verifica' => (int) ($fila['verifica'] ?? 0) === 1,
        'comercial' => (int) ($fila['comercial'] ?? 0) === 1,
        'avatar'   => $fila['avatar'] ?? '',
    ];
    return $usuario;
}

function exigir_sesion(): array
{
    $u = usuario_actual();
    if (!$u) {
        responder_error(401, 'Sesión no válida.', 'sin-sesion');
    }
    return $u;
}

function exigir_admin(): array
{
    $u = exigir_sesion();
    if ($u['rol'] !== 'admin') {
        responder_error(403, 'Hace falta ser administrador.', 'sin-permiso');
    }
    return $u;
}

/* ─── Freno a la fuerza bruta ────────────────────────────────── */
function intentos_recientes(string $email): int
{
    $desde = gmdate('Y-m-d\TH:i:s', time() - VENTANA_INTENTOS) . '.000Z';
    $stmt = bd()->prepare('SELECT COUNT(*) FROM intentos WHERE (email = ? OR ip = ?) AND cuando > ?');
    $stmt->execute([$email, ip_cliente(), $desde]);
    return (int) $stmt->fetchColumn();
}

function apuntar_intento(string $email): void
{
    bd()->prepare('INSERT INTO intentos (email, ip, cuando) VALUES (?, ?, ?)')
        ->execute([$email, ip_cliente(), ahora_iso()]);
    // Limpieza oportunista: sin cron, se borra lo viejo de vez en cuando.
    if (random_int(1, 20) === 1) {
        bd()->prepare('DELETE FROM intentos WHERE cuando < ?')
            ->execute([gmdate('Y-m-d\TH:i:s', time() - 86400) . '.000Z']);
    }
}

function limpiar_intentos(string $email): void
{
    bd()->prepare('DELETE FROM intentos WHERE email = ? OR ip = ?')->execute([$email, ip_cliente()]);
}

function ip_cliente(): string
{
    return mb_substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}
