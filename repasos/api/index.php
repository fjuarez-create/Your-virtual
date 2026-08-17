<?php
/**
 * index.php — API de UNIK repasos.
 *
 * Todo el tráfico de la carpeta api/ entra por aquí (ver .htaccess).
 * El protocolo es de tipo «upsert»: el cliente manda registros enteros
 * con su marca `actualizado` y gana el más reciente; los borrados viajan
 * como registros con borrada = 1, para que un móvil que estuvo sin
 * cobertura también se entere de lo que se borró mientras tanto.
 */
declare(strict_types=1);

require __DIR__ . '/lib/nucleo.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/claude.php';
require __DIR__ . '/lib/oido.php';

/**
 * Tipos admitidos y extensión con la que se guardan. Las funciones se
 * declaran en cualquier orden, pero las constantes no: tienen que estar
 * definidas antes de la llamada a despachar(), no después.
 */
const MIMES = [
    'imagen' => ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/heic' => 'heic'],
    'video'  => ['video/mp4' => 'mp4', 'video/quicktime' => 'mov', 'video/webm' => 'webm', 'video/3gpp' => '3gp'],
    'audio'  => ['audio/webm' => 'webm', 'audio/mp4' => 'm4a', 'audio/mpeg' => 'mp3', 'audio/ogg' => 'ogg',
                 'audio/wav' => 'wav', 'audio/x-m4a' => 'm4a', 'audio/aac' => 'aac'],
];

/** Máximo de registros por tabla y tanda en la bajada de cambios. */
const TOPE_CAMBIOS = 500;

// Nada de la API se cachea, ni siquiera por error.
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$metodo = $_SERVER['REQUEST_METHOD'];
if ($metodo === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ─── Ruta pedida ─────────────────────────────────────────────── */
$ruta = '';
if (isset($_SERVER['PATH_INFO'])) {
    $ruta = trim($_SERVER['PATH_INFO'], '/');
} else {
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    $pedida = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    if ($base !== '' && strpos($pedida, $base) === 0) {
        $pedida = substr($pedida, strlen($base));
    }
    $ruta = trim($pedida, '/');
    if ($ruta === 'index.php') {
        $ruta = '';
    }
}
$partes = $ruta === '' ? [] : explode('/', $ruta);

try {
    despachar($metodo, $partes);
} catch (PDOException $e) {
    error_log('UNIK repasos · SQL: ' . $e->getMessage());
    responder_error(500, 'Error en la base de datos.', 'sql');
} catch (Throwable $e) {
    error_log('UNIK repasos · ' . $e->getMessage());
    responder_error(500, 'Error interno.', 'interno');
}

/* ═══════════════════════════════════════════════════════════════
   Enrutado
   ═══════════════════════════════════════════════════════════════ */
function despachar(string $metodo, array $p): void
{
    // Ninguna de estas llamadas vuelve: todas terminan en responder(),
    // que escribe la respuesta y sale.
    $r0 = $p[0] ?? '';

    if ($r0 === '') {
        responder(['app' => 'UNIK repasos', 'api' => 1]);
    }

    if ($r0 === 'auth') {
        $accion = $p[1] ?? '';
        if ($accion === 'login' && $metodo === 'POST') {
            login();
        }
        if ($accion === 'logout' && $metodo === 'POST') {
            cerrar_sesion();
            responder(['ok' => true]);
        }
        if ($accion === 'me' && $metodo === 'GET') {
            responder(['usuario' => exigir_sesion()]);
        }
        if ($accion === 'password' && $metodo === 'POST') {
            cambiar_password_propia();
        }
        responder_error(404, 'Ruta de sesión desconocida.');
    }

    if ($r0 === 'usuarios') {
        if ($metodo === 'GET' && !isset($p[1])) {
            listar_usuarios();
        }
        if ($metodo === 'POST' && !isset($p[1])) {
            crear_usuario();
        }
        if ($metodo === 'PATCH' && isset($p[1])) {
            editar_usuario($p[1]);
        }
        if (isset($p[1], $p[2]) && $p[2] === 'avatar') {
            if ($metodo === 'POST') {
                subir_avatar($p[1]);
            }
            if ($metodo === 'GET') {
                servir_avatar($p[1]);
            }
            if ($metodo === 'DELETE') {
                borrar_avatar($p[1]);
            }
        }
        if ($metodo === 'DELETE' && isset($p[1])) {
            borrar_usuario($p[1]);
        }
        responder_error(405, 'Método no permitido.');
    }

    if ($r0 === 'listas' && $metodo === 'POST') {
        guardar_listas();
    }
    if ($r0 === 'tareas' && $metodo === 'POST') {
        guardar_tareas();
    }
    if ($r0 === 'comentarios' && $metodo === 'POST') {
        guardar_comentarios();
    }

    if ($r0 === 'medios') {
        if ($metodo === 'POST' && !isset($p[1])) {
            subir_medio();
        }
        if ($metodo === 'GET' && isset($p[1], $p[2]) && $p[2] === 'fichero') {
            servir_medio($p[1]);
        }
        if ($metodo === 'DELETE' && isset($p[1])) {
            borrar_medio($p[1]);
        }
        responder_error(405, 'Método no permitido.');
    }

    if ($r0 === 'cambios' && $metodo === 'GET') {
        cambios();
    }

    if ($r0 === 'diagnostico' && ($p[1] ?? '') === 'salida' && $metodo === 'GET') {
        diagnostico_salida();
    }

    if ($r0 === 'claude') {
        $accion = $p[1] ?? '';
        if ($accion === 'estado' && $metodo === 'GET') {
            claude_estado();
        }
        if ($accion === 'clave' && $metodo === 'POST') {
            claude_poner_clave();
        }
        if ($accion === 'clave' && $metodo === 'DELETE') {
            claude_quitar_clave();
        }
        if ($accion === 'redactar' && $metodo === 'POST') {
            claude_redactar_recorrido();
        }
        responder_error(404, 'Ruta de Claude desconocida.');
    }

    if ($r0 === 'oido') {
        $accion = $p[1] ?? '';
        if ($accion === 'estado' && $metodo === 'GET') {
            oido_estado();
        }
        if ($accion === 'clave' && $metodo === 'POST') {
            oido_poner_clave();
        }
        if ($accion === 'clave' && $metodo === 'DELETE') {
            oido_quitar_clave();
        }
        if ($accion === 'transcribir' && $metodo === 'POST') {
            oido_transcribir_recorrido();
        }
        responder_error(404, 'Ruta del oído desconocida.');
    }

    responder_error(404, 'Ruta desconocida.');
}

/* ═══════════════════════════════════════════════════════════════
   Claude: redactar las tareas de un recorrido
   ═══════════════════════════════════════════════════════════════ */
/**
 * Si hay clave puesta y cuál, a medias. Se devuelven los cuatro últimos
 * caracteres y nada más: sirve para reconocer «esta es la que puse» sin
 * que la clave entera vuelva a salir del servidor nunca más.
 */
function claude_estado(): void
{
    exigir_admin();
    $clave = claude_clave();
    responder([
        'puesta' => $clave !== '',
        'final' => $clave === '' ? '' : substr($clave, -4),
        'modelo' => CLAUDE_MODELO,
    ]);
}

function claude_poner_clave(): void
{
    exigir_admin();
    $datos = cuerpo();
    $clave = trim((string) ($datos['clave'] ?? ''));

    if ($clave === '') {
        responder_error(400, 'No has escrito ninguna clave.', 'clave-vacia');
    }
    // El formato lo pone Anthropic; comprobarlo aquí evita guardar un
    // recorte a medias del portapapeles y descubrirlo en mitad de una obra.
    if (strpos($clave, 'sk-ant-') !== 0 || strlen($clave) < 40) {
        responder_error(400, 'Eso no parece una clave de Anthropic (empiezan por sk-ant-).', 'clave-rara');
    }
    if (strlen($clave) > 500 || preg_match('/\s/', $clave)) {
        responder_error(400, 'La clave tiene espacios o es demasiado larga; cópiala otra vez.', 'clave-rara');
    }

    claude_guardar_clave($clave);
    responder(['puesta' => true, 'final' => substr($clave, -4), 'modelo' => CLAUDE_MODELO]);
}

function claude_quitar_clave(): void
{
    exigir_admin();
    claude_borrar_clave();
    responder(['puesta' => false, 'final' => '']);
}

/* ═══════════════════════════════════════════════════════════════
   El oído: pasar a texto lo que se dijo
   ═══════════════════════════════════════════════════════════════ */
function oido_estado(): void
{
    exigir_admin();
    $clave = oido_clave();
    responder([
        'puesta' => $clave !== '',
        'final' => $clave === '' ? '' : substr($clave, -4),
        'modelo' => OIDO_MODELO,
    ]);
}

function oido_poner_clave(): void
{
    exigir_admin();
    $datos = cuerpo();
    $clave = trim((string) ($datos['clave'] ?? ''));

    if ($clave === '') {
        responder_error(400, 'No has escrito ninguna clave.', 'clave-vacia');
    }
    // Las dos claves empiezan por `sk-`, así que se descarta a mano la de
    // Anthropic: pegar una en el sitio de la otra es el error fácil de
    // cometer y el difícil de diagnosticar luego.
    if (strpos($clave, 'sk-ant-') === 0) {
        responder_error(400, 'Esa es la clave de Anthropic, no la de OpenAI.', 'clave-cambiada');
    }
    if (strpos($clave, 'sk-') !== 0 || strlen($clave) < 40) {
        responder_error(400, 'Eso no parece una clave de OpenAI (empiezan por sk-).', 'clave-rara');
    }
    if (strlen($clave) > 500 || preg_match('/\s/', $clave)) {
        responder_error(400, 'La clave tiene espacios o es demasiado larga; cópiala otra vez.', 'clave-rara');
    }

    oido_guardar_clave($clave);
    responder(['puesta' => true, 'final' => substr($clave, -4), 'modelo' => OIDO_MODELO]);
}

function oido_quitar_clave(): void
{
    exigir_admin();
    oido_borrar_clave();
    responder(['puesta' => false, 'final' => '']);
}

/**
 * La grabación de un recorrido → lo que se dijo, en texto.
 *
 * Lo puede pedir quien pueda abrir un acta, igual que la redacción: es
 * su propia voz la que se está pasando a limpio.
 */
function oido_transcribir_recorrido(): void
{
    $u = exigir_sesion();
    if (!($u['rol'] === 'admin' || !empty($u['verifica']))) {
        responder_error(403, 'Solo quien puede abrir un acta puede pedir esto.', 'sin-permiso');
    }

    if (!isset($_FILES['fichero']) || $_FILES['fichero']['error'] !== UPLOAD_ERR_OK) {
        $codigo = $_FILES['fichero']['error'] ?? -1;
        $mensaje = in_array($codigo, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
            ? 'La grabación es más grande de lo que admite este servidor.'
            : 'No ha llegado la grabación.';
        responder_error(400, $mensaje, 'sin-fichero');
    }

    $temporal = $_FILES['fichero']['tmp_name'];
    if (!is_uploaded_file($temporal)) {
        responder_error(400, 'La grabación no ha llegado bien.', 'sin-fichero');
    }
    if ((int) $_FILES['fichero']['size'] > OIDO_TOPE_BYTES) {
        responder_error(413, 'La grabación pasa de 25 MB, que es lo que admite la transcripción.', 'audio-grande');
    }

    $mime = (string) ($_POST['mime'] ?? $_FILES['fichero']['type'] ?? '');
    $segundos = (float) ($_POST['duracion'] ?? 0);
    if ($segundos > OIDO_TOPE_SEGUNDOS) {
        responder_error(413, 'La grabación pasa de 25 minutos, que es lo que admite la transcripción.', 'audio-largo');
    }

    responder(oido_transcribir($temporal, $mime));
}

/**
 * Lo que dijo durante el recorrido + las marcas → una tarea por marca.
 *
 * Lo puede pedir quien pueda abrir un acta: es su trabajo el que se está
 * redactando. La clave es de la casa, no suya, y no la ve.
 */
function claude_redactar_recorrido(): void
{
    $u = exigir_sesion();
    if (!($u['rol'] === 'admin' || !empty($u['verifica']))) {
        responder_error(403, 'Solo quien puede abrir un acta puede pedir esto.', 'sin-permiso');
    }

    $datos = cuerpo();
    $texto = trim((string) ($datos['texto'] ?? ''));
    $marcas = $datos['marcas'] ?? [];
    $oficios = $datos['oficios'] ?? [];
    $fotos = $datos['fotos'] ?? [];
    $zonas = $datos['zonas'] ?? [];

    // Con las fotos basta: de lo que se ve en ellas ya sale una tarea, y
    // lo dicho solo sirve para afinarla. Que falten las dos cosas a la
    // vez se comprueba abajo, cuando ya se sabe qué fotos son válidas.
    if (mb_strlen($texto) > 60000) {
        responder_error(413, 'El texto del recorrido es demasiado largo.', 'texto-largo');
    }
    if (!is_array($marcas) || !count($marcas)) {
        responder_error(400, 'No hay marcas que redactar.', 'sin-marcas');
    }
    if (count($marcas) > 100) {
        responder_error(400, 'Demasiadas marcas en un solo recorrido.', 'muchas-marcas');
    }
    if (!is_array($oficios) || !count($oficios)) {
        responder_error(400, 'Falta la lista de gremios.', 'sin-oficios');
    }

    // Se normaliza lo que llega del móvil antes de armar la petición: al
    // otro lado hay una cuenta que paga por token.
    $limpias = [];
    foreach ($marcas as $m) {
        $id = (string) ($m['id'] ?? '');
        if ($id === '') {
            continue;
        }
        $limpias[] = ['id' => mb_substr($id, 0, 64), 'ms' => (float) ($m['ms'] ?? 0)];
    }
    $gremios = [];
    foreach ($oficios as $o) {
        $id = (string) ($o['id'] ?? '');
        if ($id === '') {
            continue;
        }
        $gremios[] = ['id' => mb_substr($id, 0, 40), 'nombre' => mb_substr((string) ($o['nombre'] ?? $id), 0, 60)];
    }
    if (!count($limpias) || !count($gremios)) {
        responder_error(400, 'Las marcas o los gremios no vienen bien.', 'datos-raros');
    }

    // Las estancias son opcionales: si no llegan, el modelo deja el
    // campo vacío y se pone a mano. Lo que no puede es llegar una lista
    // larguísima, que iría en cada llamada y se paga por token.
    $sitios = [];
    if (is_array($zonas)) {
        foreach ($zonas as $z) {
            $z = trim((string) $z);
            if ($z === '' || count($sitios) >= 40) {
                continue;
            }
            $sitios[] = mb_substr($z, 0, 40);
        }
    }

    // Las fotos llegan ya encogidas desde el móvil y en base64. Aquí solo
    // se comprueba que lo son: lo que se le mande a la API se paga, así
    // que no viaja nada que no sea una foto de una marca de este
    // recorrido y del tamaño que tenía que tener.
    $miradas = [];
    if (is_array($fotos)) {
        $porId = [];
        foreach ($limpias as $m) {
            $porId[$m['id']] = true;
        }
        foreach ($fotos as $f) {
            if (count($miradas) >= CLAUDE_TOPE_FOTOS) {
                break;
            }
            $id = mb_substr((string) ($f['id'] ?? ''), 0, 64);
            $b64 = (string) ($f['b64'] ?? '');
            if ($id === '' || !isset($porId[$id]) || isset($miradas[$id])) {
                continue;
            }
            if ($b64 === '' || strlen($b64) > CLAUDE_TOPE_FOTO_B64) {
                continue;
            }
            if (base64_decode($b64, true) === false) {
                continue;
            }
            $miradas[$id] = $b64;
        }
    }

    if ($texto === '' && !count($miradas)) {
        responder_error(400, 'No hay nada que redactar: ni fotos ni nada dicho.', 'sin-nada');
    }

    responder(claude_redactar($texto, $limpias, $gremios, $miradas, $sitios));
}

/* ═══════════════════════════════════════════════════════════════
   Diagnóstico
   ═══════════════════════════════════════════════════════════════ */
/**
 * ¿Puede este hosting llamar por su cuenta a un servicio de fuera?
 *
 * Hace falta saberlo antes de montar la transcripción de los
 * recorridos: el audio lo tiene que mandar el servidor, no el móvil, y
 * muchos alojamientos compartidos tienen la salida cerrada. Se prueba
 * contra un sitio cualquiera con HTTPS, sin mandar nada de nadie: solo
 * se comprueba que la puerta está abierta.
 *
 * No devuelve un sí o un no a secas, sino qué es lo que falla —el
 * cortafuegos, los certificados, la falta de cURL—, que es lo que
 * luego hay que pedirle al hosting.
 */
function diagnostico_salida(): void
{
    exigir_sesion();

    if (!function_exists('curl_init')) {
        responder([
            'puede' => false,
            'motivo' => 'Este servidor no tiene cURL instalado.',
            'detalle' => 'php-curl',
        ]);
    }

    // Se prueban los dos, porque son dos sitios distintos y un hosting
    // puede tener abierto uno y cerrado el otro. Saberlo por separado es
    // la diferencia entre pedirle algo concreto al hosting y decirle que
    // «la app no va».
    $servicios = [
        ['nombre' => 'Anthropic', 'para' => 'redactar', 'url' => 'https://api.anthropic.com/v1/models'],
        ['nombre' => 'OpenAI', 'para' => 'escuchar', 'url' => 'https://api.openai.com/v1/models'],
    ];

    $resultados = [];
    foreach ($servicios as $s) {
        $resultados[] = $s + diagnostico_llamar($s['url']);
    }

    $abiertos = array_values(array_filter($resultados, static fn($r) => $r['puede']));
    $cerrados = array_values(array_filter($resultados, static fn($r) => !$r['puede']));

    if (!count($cerrados)) {
        $ms = max(array_column($resultados, 'ms'));
        responder([
            'puede' => true,
            'motivo' => 'La salida funciona con los dos servicios.',
            'ms' => $ms,
            'php' => PHP_VERSION,
            'servicios' => $resultados,
        ]);
    }

    responder([
        'puede' => false,
        'motivo' => count($abiertos)
            ? "Sale a {$abiertos[0]['nombre']} pero no a {$cerrados[0]['nombre']}: " . lcfirst($cerrados[0]['motivo'])
            : $cerrados[0]['motivo'],
        'detalle' => $cerrados[0]['detalle'] ?? '',
        'ms' => $cerrados[0]['ms'],
        'servicios' => $resultados,
    ]);
}

/** Una llamada de prueba a un sitio, sin mandar nada de nadie. */
function diagnostico_llamar(string $url): array
{
    $t0 = microtime(true);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    curl_close($ch);
    $ms = (int) round((microtime(true) - $t0) * 1000);

    // Un 401 es la mejor noticia posible: significa que la petición ha
    // llegado hasta el otro lado y solo falta la clave.
    if ($codigo > 0) {
        return [
            'puede' => true,
            'motivo' => $codigo === 401
                ? 'contesta y solo falta la clave'
                : "contesta (respuesta $codigo)",
            'ms' => $ms,
        ];
    }

    $motivos = [
        CURLE_COULDNT_RESOLVE_HOST => 'El servidor no puede resolver su nombre: no hay DNS de salida.',
        CURLE_COULDNT_CONNECT => 'La conexión de salida está cerrada por el cortafuegos del hosting.',
        CURLE_OPERATION_TIMEDOUT => 'La conexión se ha quedado colgada: casi siempre es el cortafuegos.',
        CURLE_SSL_CACERT => 'Faltan los certificados raíz del servidor.',
        CURLE_SSL_CONNECT_ERROR => 'El servidor no consigue negociar el cifrado con el exterior.',
    ];
    return [
        'puede' => false,
        'motivo' => $motivos[$errno] ?? 'No se ha podido salir a internet.',
        'detalle' => $error !== '' ? $error : "cURL $errno",
        'ms' => $ms,
    ];
}

/* ═══════════════════════════════════════════════════════════════
   Sesión
   ═══════════════════════════════════════════════════════════════ */
function login(): void
{
    $datos = cuerpo();
    $email = mb_strtolower(texto($datos, 'email', 190));
    $password = (string) ($datos['password'] ?? '');

    if ($email === '' || $password === '') {
        responder_error(400, 'Faltan el correo o la contraseña.', 'faltan-datos');
    }
    if (intentos_recientes($email) >= MAX_INTENTOS) {
        responder_error(429, 'Demasiados intentos. Espera unos minutos.', 'bloqueado');
    }

    $stmt = bd()->prepare('SELECT id, nombre, email, rol, empresa, verifica, avatar, activo, password_hash FROM usuarios WHERE email = ?');
    $stmt->execute([$email]);
    $u = $stmt->fetch();

    // Se comprueba siempre un hash aunque el usuario no exista: si no, el
    // tiempo de respuesta delataría qué correos están dados de alta.
    $hash = $u['password_hash'] ?? '$2y$10$usuarioinexistenteusuarioinexistenteusuarioinexiste';
    $vale = password_verify($password, $hash);

    if (!$u || !$vale || (int) $u['activo'] !== 1) {
        apuntar_intento($email);
        usleep(400000);
        responder_error(401, 'Correo o contraseña incorrectos.', 'credenciales');
    }

    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        bd()->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }

    limpiar_intentos($email);
    crear_sesion($u['id']);
    responder(['usuario' => usuario_salida($u)]);
}

function cambiar_password_propia(): void
{
    $yo = exigir_sesion();
    $datos = cuerpo();
    $actual = (string) ($datos['actual'] ?? '');
    $nueva = (string) ($datos['nueva'] ?? '');

    if (mb_strlen($nueva) < 8) {
        responder_error(400, 'La contraseña nueva debe tener al menos 8 caracteres.', 'corta');
    }
    $stmt = bd()->prepare('SELECT password_hash FROM usuarios WHERE id = ?');
    $stmt->execute([$yo['id']]);
    $hash = (string) $stmt->fetchColumn();
    if (!password_verify($actual, $hash)) {
        responder_error(401, 'La contraseña actual no es correcta.', 'credenciales');
    }

    bd()->prepare('UPDATE usuarios SET password_hash = ?, actualizado = ? WHERE id = ?')
        ->execute([password_hash($nueva, PASSWORD_DEFAULT), ahora_iso(), $yo['id']]);

    // Cambiar la contraseña cierra las demás sesiones; la actual sigue.
    $token = hash('sha256', $_COOKIE[COOKIE_SESION] ?? '');
    bd()->prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token <> ?')->execute([$yo['id'], $token]);

    responder(['ok' => true]);
}

/* ═══════════════════════════════════════════════════════════════
   Usuarios
   ═══════════════════════════════════════════════════════════════ */
function listar_usuarios(): void
{
    exigir_admin();
    $filas = bd()->query(
        'SELECT id, nombre, email, rol, empresa, verifica, avatar, activo, creado
           FROM usuarios ORDER BY activo DESC, nombre ASC'
    )->fetchAll();
    foreach ($filas as &$f) {
        $f['activo'] = (int) $f['activo'] === 1;
        $f['verifica'] = (int) $f['verifica'] === 1;
        $f['avatar'] = $f['avatar'] ?? '';
    }
    responder(['usuarios' => $filas]);
}

function crear_usuario(): void
{
    exigir_admin();
    $d = cuerpo();
    $nombre = texto($d, 'nombre', 120);
    $email = mb_strtolower(texto($d, 'email', 190));
    $empresa = texto($d, 'empresa', 120);
    $rol = ($d['rol'] ?? 'usuario') === 'admin' ? 'admin' : 'usuario';
    $verifica = booleano($d, 'verifica');

    if (mb_strlen($nombre) < 3) {
        responder_error(400, 'El nombre es demasiado corto.', 'nombre');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        responder_error(400, 'El correo no es válido.', 'email');
    }
    if ($empresa === '') {
        responder_error(400, 'Falta la empresa o el rol.', 'empresa');
    }

    // La contraseña la calcula el servidor con la misma regla que la app:
    // nombre + primera palabra de la empresa. Así el alta es un solo paso
    // y quien la crea puede dictarla sin consultarla.
    $password = contrasena_inicial($nombre, $empresa);
    if (mb_strlen($password) < 8) {
        responder_error(400, 'El nombre y la empresa son demasiado cortos para generar una contraseña segura.', 'corta');
    }

    $existe = bd()->prepare('SELECT 1 FROM usuarios WHERE email = ?');
    $existe->execute([$email]);
    if ($existe->fetchColumn()) {
        responder_error(409, 'Ya existe un usuario con ese correo.', 'duplicado');
    }

    $id = uuid();
    bd()->prepare(
        'INSERT INTO usuarios (id, nombre, email, password_hash, rol, empresa, verifica, activo, creado, actualizado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
    )->execute([
        $id, $nombre, $email, password_hash($password, PASSWORD_DEFAULT),
        $rol, $empresa, $verifica ? 1 : 0, ahora_iso(), ahora_iso(),
    ]);

    // La contraseña en claro viaja una única vez, aquí, para que la app
    // pueda ofrecer el botón de compartirla. No se guarda en ningún sitio.
    responder(['usuario' => [
        'id' => $id, 'nombre' => $nombre, 'email' => $email, 'rol' => $rol,
        'empresa' => $empresa, 'verifica' => $verifica, 'activo' => true,
    ], 'password' => $password], 201);
}

function editar_usuario(string $id): void
{
    $yo = exigir_admin();
    $d = cuerpo();

    $stmt = bd()->prepare('SELECT id, rol, activo FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    $u = $stmt->fetch();
    if (!$u) {
        responder_error(404, 'Usuario no encontrado.');
    }

    $campos = [];
    $valores = [];

    if (isset($d['nombre'])) {
        $nombre = texto($d, 'nombre', 120);
        if (mb_strlen($nombre) < 3) {
            responder_error(400, 'El nombre es demasiado corto.', 'nombre');
        }
        $campos[] = 'nombre = ?';
        $valores[] = $nombre;
    }
    if (isset($d['password'])) {
        if (mb_strlen((string) $d['password']) < 8) {
            responder_error(400, 'La contraseña debe tener al menos 8 caracteres.', 'corta');
        }
        $campos[] = 'password_hash = ?';
        $valores[] = password_hash((string) $d['password'], PASSWORD_DEFAULT);
    }
    if (isset($d['empresa'])) {
        $campos[] = 'empresa = ?';
        $valores[] = texto($d, 'empresa', 120);
    }
    if (isset($d['verifica'])) {
        $campos[] = 'verifica = ?';
        $valores[] = booleano($d, 'verifica') ? 1 : 0;
    }
    if (isset($d['rol'])) {
        if ($u['id'] === $yo['id'] && $d['rol'] !== 'admin') {
            responder_error(400, 'No puedes quitarte a ti mismo los permisos de administrador.', 'ultimo-admin');
        }
        if ($u['rol'] === 'admin' && $d['rol'] !== 'admin' && cuenta_admins() <= 1) {
            responder_error(400, 'Tiene que quedar al menos un administrador.', 'ultimo-admin');
        }
        $campos[] = 'rol = ?';
        $valores[] = $d['rol'] === 'admin' ? 'admin' : 'usuario';
    }
    if (isset($d['activo'])) {
        $activo = booleano($d, 'activo');
        if ($u['id'] === $yo['id'] && !$activo) {
            responder_error(400, 'No puedes desactivar tu propia cuenta.', 'yo-mismo');
        }
        if (!$activo && $u['rol'] === 'admin' && cuenta_admins() <= 1) {
            responder_error(400, 'Tiene que quedar al menos un administrador activo.', 'ultimo-admin');
        }
        $campos[] = 'activo = ?';
        $valores[] = $activo ? 1 : 0;
        if (!$activo) {
            bd()->prepare('DELETE FROM sesiones WHERE usuario_id = ?')->execute([$id]);
        }
    }

    if (!$campos) {
        responder_error(400, 'Nada que cambiar.', 'sin-cambios');
    }
    $campos[] = 'actualizado = ?';
    $valores[] = ahora_iso();
    $valores[] = $id;

    bd()->prepare('UPDATE usuarios SET ' . implode(', ', $campos) . ' WHERE id = ?')->execute($valores);

    // Cambiarle la contraseña a alguien echa a ese alguien de sus sesiones.
    if (isset($d['password'])) {
        bd()->prepare('DELETE FROM sesiones WHERE usuario_id = ?')->execute([$id]);
    }

    responder(['ok' => true]);
}

function borrar_usuario(string $id): void
{
    $yo = exigir_admin();
    if ($id === $yo['id']) {
        responder_error(400, 'No puedes borrar tu propia cuenta.', 'yo-mismo');
    }
    $stmt = bd()->prepare('SELECT rol FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    $rol = $stmt->fetchColumn();
    if ($rol === false) {
        responder_error(404, 'Usuario no encontrado.');
    }
    if ($rol === 'admin' && cuenta_admins() <= 1) {
        responder_error(400, 'Tiene que quedar al menos un administrador.', 'ultimo-admin');
    }
    // Las listas y tareas conservan creado_por_nombre: la firma de los
    // repasos no se pierde aunque la cuenta desaparezca.
    bd()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
    responder(['ok' => true]);
}

/** Datos del usuario que se devuelven al cliente. Nunca el hash. */
function usuario_salida(array $u): array
{
    return [
        'id' => $u['id'],
        'nombre' => $u['nombre'],
        'email' => $u['email'],
        'rol' => $u['rol'],
        'empresa' => $u['empresa'] ?? '',
        'verifica' => (int) ($u['verifica'] ?? 0) === 1,
        // Marca de cuándo se puso la foto: sirve de versión para que el
        // navegador no siga enseñando la anterior desde su caché.
        'avatar' => $u['avatar'] ?? '',
    ];
}

/* ═══════════════════════════════════════════════════════════════
   Foto de perfil
   ═══════════════════════════════════════════════════════════════ */
/** La foto la puede tocar quien administra, o el propio interesado. */
function exigir_sobre_usuario(string $id): array
{
    $yo = exigir_sesion();
    if ($yo['rol'] !== 'admin' && $yo['id'] !== $id) {
        responder_error(403, 'Solo puedes cambiar tu propia foto.', 'sin-permiso');
    }
    return $yo;
}

function ruta_avatar(string $id): string
{
    return carpeta_medios() . '/avatares/' . $id . '.jpg';
}

function subir_avatar(string $id): void
{
    exigir_sobre_usuario($id);
    if (!es_uuid($id)) {
        responder_error(400, 'Identificador incorrecto.', 'formato');
    }
    if (!isset($_FILES['fichero']) || $_FILES['fichero']['error'] !== UPLOAD_ERR_OK) {
        responder_error(400, 'No llegó la foto.', 'fichero');
    }
    $temporal = $_FILES['fichero']['tmp_name'];
    if ((int) $_FILES['fichero']['size'] > 4 * 1024 * 1024) {
        responder_error(413, 'La foto es demasiado grande.', 'grande');
    }
    // La app la manda ya recortada y recomprimida en JPEG; aquí solo se
    // comprueba que de verdad sea una imagen.
    $detectado = (new finfo(FILEINFO_MIME_TYPE))->file($temporal) ?: '';
    if (!isset(MIMES['imagen'][$detectado])) {
        responder_error(415, 'Eso no es una imagen.', 'mime');
    }

    $destino = ruta_avatar($id);
    if (!is_dir(dirname($destino)) && !mkdir(dirname($destino), 0755, true) && !is_dir(dirname($destino))) {
        responder_error(500, 'No se pudo crear la carpeta de fotos.', 'carpeta');
    }
    if (!move_uploaded_file($temporal, $destino)) {
        responder_error(500, 'No se pudo guardar la foto.', 'guardar');
    }
    @chmod($destino, 0644);

    $marca = ahora_iso();
    bd()->prepare('UPDATE usuarios SET avatar = ?, actualizado = ? WHERE id = ?')
        ->execute([$marca, $marca, $id]);
    responder(['avatar' => $marca], 201);
}

function borrar_avatar(string $id): void
{
    exigir_sobre_usuario($id);
    @unlink(ruta_avatar($id));
    bd()->prepare("UPDATE usuarios SET avatar = '', actualizado = ? WHERE id = ?")
        ->execute([ahora_iso(), $id]);
    responder(['ok' => true]);
}

function servir_avatar(string $id): void
{
    exigir_sesion();
    $real = realpath(ruta_avatar($id));
    if ($real === false || strpos($real, carpeta_medios()) !== 0 || !is_file($real)) {
        responder_error(404, 'Sin foto.');
    }
    header('Content-Type: image/jpeg');
    header('Content-Length: ' . (string) filesize($real));
    // Un año: la dirección lleva la versión, así que cambiar la foto
    // cambia la dirección y la caché vieja deja de usarse sola.
    header('Cache-Control: private, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    readfile($real);
    exit;
}

function cuenta_admins(): int
{
    return (int) bd()->query("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = 1")->fetchColumn();
}

/* ═══════════════════════════════════════════════════════════════
   Listas y tareas
   ═══════════════════════════════════════════════════════════════ */
function guardar_listas(): void
{
    exigir_sesion();
    $entrada = cuerpo()['listas'] ?? [];
    if (!is_array($entrada)) {
        responder_error(400, 'Formato incorrecto.', 'formato');
    }
    $guardadas = 0;
    foreach ($entrada as $l) {
        if (!is_array($l) || !es_uuid($l['id'] ?? null)) {
            continue;
        }
        $registro = [
            'id'                => $l['id'],
            'unidad_id'         => texto($l, 'unidadId', 80),
            'promo_id'          => texto($l, 'promoId', 60),
            'fase'              => texto($l, 'fase', 20, 'pre'),
            'nombre'            => texto($l, 'nombre', 120),
            'cerrada'           => booleano($l, 'cerrada') ? 1 : 0,
            'borrada'           => booleano($l, 'borrada') ? 1 : 0,
            'creado'            => iso($l['creado'] ?? null),
            'actualizado'       => iso($l['actualizado'] ?? null),
            'creado_por'        => es_uuid($l['creadoPor'] ?? null) ? $l['creadoPor'] : null,
            'creado_por_nombre' => texto($l, 'creadoPorNombre', 120, 'Sin identificar'),
        ];
        if ($registro['unidad_id'] === '') {
            continue;
        }
        if (upsert('listas', $registro)) {
            $guardadas++;
        }
    }
    responder(['guardadas' => $guardadas]);
}

function guardar_tareas(): void
{
    $yo = exigir_sesion();
    $entrada = cuerpo()['tareas'] ?? [];
    if (!is_array($entrada)) {
        responder_error(400, 'Formato incorrecto.', 'formato');
    }
    // Quién es a efectos de permisos, una vez y no por tarea.
    $decide = (bool) $yo['verifica'] || $yo['rol'] === 'admin';

    $guardadas = 0;
    foreach ($entrada as $t) {
        if (!is_array($t) || !es_uuid($t['id'] ?? null) || !es_uuid($t['listaId'] ?? null)) {
            continue;
        }
        $estado = in_array($t['estado'] ?? '', ['pendiente', 'resuelta', 'rechazada', 'verificada'], true)
            ? $t['estado'] : 'pendiente';

        $texto = mb_substr((string) ($t['texto'] ?? ''), 0, 4000);
        $oficio = texto($t, 'oficio', 30, 'general') ?: 'general';
        $zona = texto($t, 'zona', 40);

        // El navegador no es de fiar, así que los dos permisos se
        // comprueban aquí también. Quien no verifica:
        //
        //   - no puede poner «verificada» ni «rechazada»
        //   - no puede reescribir la descripción, el gremio ni la
        //     estancia de una tarea que ya existe
        //
        // Lo segundo es lo que hace que un acta sea un acta: si el que
        // tiene que arreglarla puede además cambiar lo que se le pidió,
        // deja de haber nada que verificar. En vez de rechazar la
        // petición entera —que dejaría la app sin sincronizar y sin
        // saber por qué— se conserva lo que hay guardado y se deja pasar
        // el resto, que sí es suyo: el estado y las fotos.
        // Borrar es la forma más definitiva de editar, así que va con el
        // mismo permiso.
        $borrada = booleano($t, 'borrada') ? 1 : 0;

        if (!$decide) {
            // Se relee dentro del bucle y se vacía cada vuelta a
            // propósito: dejar la fila de la tarea anterior colgando
            // aquí acabaría escribiendo el texto de una en otra.
            $previo = bd()->prepare('SELECT estado, texto, oficio, zona, borrada FROM tareas WHERE id = ?');
            $previo->execute([$t['id']]);
            $fila = $previo->fetch() ?: null;

            if ($fila) {
                $texto = (string) $fila['texto'];
                $oficio = (string) ($fila['oficio'] ?? 'general');
                $zona = (string) ($fila['zona'] ?? '');
                $borrada = (int) ($fila['borrada'] ?? 0);
            }
            if (in_array($estado, ['verificada', 'rechazada'], true)) {
                // Lo que ya hubiera decidido un verificador no lo deshace
                // quien no puede; y si no había nada, se queda en
                // completada, que es lo más lejos que llega el jefe de obra.
                $guardado = $fila['estado'] ?? '';
                $estado = in_array($guardado, ['verificada', 'rechazada'], true) ? $guardado : 'resuelta';
            }
        }

        $registro = [
            'id'                => $t['id'],
            'lista_id'          => $t['listaId'],
            'texto'             => $texto,
            'estado'            => $estado,
            'oficio'            => $oficio,
            'zona'              => $zona,
            'orden'             => entero($t, 'orden'),
            'portada_id'        => es_uuid($t['portadaId'] ?? null) ? $t['portadaId'] : null,
            'estado_por'        => texto($t, 'estadoPor', 120) ?: null,
            'estado_en'         => isset($t['estadoEn']) ? iso($t['estadoEn']) : null,
            'rechazada'         => booleano($t, 'rechazada') ? 1 : 0,
            'borrada'           => $borrada,
            'creado'            => iso($t['creado'] ?? null),
            'actualizado'       => iso($t['actualizado'] ?? null),
            'creado_por'        => es_uuid($t['creadoPor'] ?? null) ? $t['creadoPor'] : null,
            'creado_por_nombre' => texto($t, 'creadoPorNombre', 120, 'Sin identificar'),
        ];
        if (upsert('tareas', $registro)) {
            $guardadas++;
        }
    }
    responder(['guardadas' => $guardadas]);
}

/**
 * Hilo de una tarea: rechazos y notas. Mismo protocolo de upsert que el
 * resto; el texto de un rechazo no se puede editar después, pero sí
 * borrar, y eso viaja como borrada = 1.
 */
function guardar_comentarios(): void
{
    exigir_sesion();
    $entrada = cuerpo()['comentarios'] ?? [];
    if (!is_array($entrada)) {
        responder_error(400, 'Formato incorrecto.', 'formato');
    }
    $guardados = 0;
    foreach ($entrada as $c) {
        if (!is_array($c) || !es_uuid($c['id'] ?? null) || !es_uuid($c['tareaId'] ?? null)) {
            continue;
        }
        $registro = [
            'id'                 => $c['id'],
            'tarea_id'           => $c['tareaId'],
            'texto'              => mb_substr((string) ($c['texto'] ?? ''), 0, 4000),
            'tipo'               => in_array($c['tipo'] ?? '', ['nota', 'rechazo'], true) ? $c['tipo'] : 'nota',
            'borrada'            => booleano($c, 'borrada') ? 1 : 0,
            'creado'             => iso($c['creado'] ?? null),
            'actualizado'        => iso($c['actualizado'] ?? null),
            'creado_por'         => es_uuid($c['creadoPor'] ?? null) ? $c['creadoPor'] : null,
            'creado_por_nombre'  => texto($c, 'creadoPorNombre', 120, 'Sin identificar'),
            'creado_por_empresa' => texto($c, 'creadoPorEmpresa', 120),
        ];
        if (upsert('comentarios', $registro)) {
            $guardados++;
        }
    }
    responder(['guardados' => $guardados]);
}

/**
 * Inserta o actualiza según la marca `actualizado`: si lo que hay en la
 * base es más nuevo que lo que llega, no se toca. Es lo que evita que un
 * móvil que llevaba dos días sin cobertura pise el trabajo de hoy.
 */
function upsert(string $tabla, array $registro): bool
{
    $pdo = bd();
    $stmt = $pdo->prepare("SELECT actualizado FROM {$tabla} WHERE id = ?");
    $stmt->execute([$registro['id']]);
    $existente = $stmt->fetchColumn();

    if ($existente === false) {
        $columnas = array_keys($registro);
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $tabla,
            implode(', ', $columnas),
            implode(', ', array_fill(0, count($columnas), '?'))
        );
        try {
            $pdo->prepare($sql)->execute(array_values($registro));
            return true;
        } catch (PDOException $e) {
            // Otro dispositivo lo insertó entre el SELECT y el INSERT:
            // se resuelve como actualización normal.
            if ($e->getCode() !== '23000') {
                throw $e;
            }
        }
    } elseif ($registro['actualizado'] < (string) $existente) {
        return false;
    }

    $sinId = $registro;
    unset($sinId['id']);
    $asignaciones = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($sinId)));
    $valores = array_values($sinId);
    $valores[] = $registro['id'];
    $valores[] = $registro['actualizado'];
    $pdo->prepare("UPDATE {$tabla} SET {$asignaciones} WHERE id = ? AND actualizado <= ?")->execute($valores);
    return true;
}

/* ═══════════════════════════════════════════════════════════════
   Medios
   ═══════════════════════════════════════════════════════════════ */
function subir_medio(): void
{
    exigir_sesion();

    $id = (string) ($_POST['id'] ?? '');
    $tareaId = (string) ($_POST['tareaId'] ?? '');
    $comentarioId = (string) ($_POST['comentarioId'] ?? '');
    $tipo = (string) ($_POST['tipo'] ?? '');

    if (!es_uuid($id) || !es_uuid($tareaId) || !isset(MIMES[$tipo])) {
        responder_error(400, 'Datos del medio incorrectos.', 'formato');
    }
    if (!isset($_FILES['fichero']) || $_FILES['fichero']['error'] !== UPLOAD_ERR_OK) {
        $codigo = $_FILES['fichero']['error'] ?? -1;
        $mensaje = in_array($codigo, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
            ? 'El fichero supera el límite del servidor.'
            : 'No llegó el fichero.';
        responder_error(400, $mensaje, 'fichero');
    }

    $temporal = $_FILES['fichero']['tmp_name'];
    $tam = (int) $_FILES['fichero']['size'];
    if ($tam <= 0 || $tam > (int) (config()['max_fichero'] ?? 83886080)) {
        responder_error(413, 'El fichero es demasiado grande.', 'grande');
    }

    // El MIME se deduce del contenido, no de lo que diga el navegador.
    $detectado = (new finfo(FILEINFO_MIME_TYPE))->file($temporal) ?: '';
    $extension = MIMES[$tipo][$detectado] ?? null;
    if ($extension === null) {
        // finfo no reconoce algunos contenedores de audio/vídeo de móvil;
        // en ese caso vale el MIME declarado si está en la lista blanca.
        $declarado = (string) ($_FILES['fichero']['type'] ?? '');
        $extension = MIMES[$tipo][$declarado] ?? null;
        $detectado = $extension !== null ? $declarado : $detectado;
    }
    if ($extension === null) {
        responder_error(415, 'Tipo de fichero no admitido: ' . $detectado, 'mime');
    }

    $existente = bd()->prepare('SELECT ruta FROM medios WHERE id = ?');
    $existente->execute([$id]);
    $rutaPrevia = $existente->fetchColumn();

    $relativa = gmdate('Y/m') . '/' . $id . '.' . $extension;
    $destino = carpeta_medios() . '/' . $relativa;
    if (!is_dir(dirname($destino)) && !mkdir(dirname($destino), 0755, true) && !is_dir(dirname($destino))) {
        responder_error(500, 'No se pudo crear la carpeta de destino.', 'carpeta');
    }
    if (!move_uploaded_file($temporal, $destino)) {
        responder_error(500, 'No se pudo guardar el fichero.', 'guardar');
    }
    @chmod($destino, 0644);

    // Si se resube el mismo id con otra extensión, el fichero viejo sobra.
    if (is_string($rutaPrevia) && $rutaPrevia !== '' && $rutaPrevia !== $relativa) {
        @unlink(carpeta_medios() . '/' . $rutaPrevia);
    }

    upsert('medios', [
        'id'            => $id,
        'tarea_id'      => $tareaId,
        'comentario_id' => es_uuid($comentarioId) ? $comentarioId : null,
        'tipo'        => $tipo,
        'mime'        => $detectado,
        'tam'         => $tam,
        'ancho'       => max(0, (int) ($_POST['ancho'] ?? 0)),
        'alto'        => max(0, (int) ($_POST['alto'] ?? 0)),
        'duracion'    => max(0, (int) ($_POST['duracion'] ?? 0)),
        'ruta'        => $relativa,
        'borrada'     => 0,
        'creado'      => iso($_POST['creado'] ?? null),
        'actualizado' => ahora_iso(),
    ]);

    responder(['id' => $id, 'ok' => true], 201);
}

function borrar_medio(string $id): void
{
    exigir_sesion();
    if (!es_uuid($id)) {
        responder_error(400, 'Identificador incorrecto.', 'formato');
    }
    $stmt = bd()->prepare('SELECT ruta FROM medios WHERE id = ?');
    $stmt->execute([$id]);
    $ruta = $stmt->fetchColumn();
    if ($ruta === false) {
        responder_error(404, 'El medio no existe.');
    }
    if (is_string($ruta) && $ruta !== '') {
        @unlink(carpeta_medios() . '/' . $ruta);
    }
    // Se marca como borrado en lugar de eliminar la fila: así el resto de
    // dispositivos se entera en su próxima sincronización.
    bd()->prepare("UPDATE medios SET borrada = 1, ruta = '', actualizado = ? WHERE id = ?")
        ->execute([ahora_iso(), $id]);
    responder(['ok' => true]);
}

function servir_medio(string $id): void
{
    exigir_sesion();
    if (!es_uuid($id)) {
        responder_error(400, 'Identificador incorrecto.', 'formato');
    }
    $stmt = bd()->prepare('SELECT mime, ruta, borrada FROM medios WHERE id = ?');
    $stmt->execute([$id]);
    $m = $stmt->fetch();
    if (!$m || (int) $m['borrada'] === 1 || $m['ruta'] === '') {
        responder_error(404, 'El medio no existe.');
    }

    $ruta = carpeta_medios() . '/' . $m['ruta'];
    $real = realpath($ruta);
    // Cinturón: la ruta guardada nunca debe salirse de la carpeta de medios.
    if ($real === false || strpos($real, carpeta_medios()) !== 0 || !is_file($real)) {
        responder_error(404, 'Fichero no encontrado.');
    }

    $tam = filesize($real);
    header('Content-Type: ' . $m['mime']);
    header('Content-Disposition: inline; filename="' . $id . '"');
    header('Accept-Ranges: bytes');
    // Privada: el contenido es sensible, pero el navegador puede guardarlo
    // para no volver a bajar la misma foto en cada pintada.
    header('Cache-Control: private, max-age=604800');
    header('X-Content-Type-Options: nosniff');

    $inicio = 0;
    $fin = $tam - 1;
    $rango = $_SERVER['HTTP_RANGE'] ?? '';
    if ($rango !== '' && preg_match('/bytes=(\d*)-(\d*)/', $rango, $m2)) {
        // Los vídeos y los audios se piden por trozos; sin esto, iOS ni
        // siquiera empieza a reproducir.
        if ($m2[1] !== '') {
            $inicio = (int) $m2[1];
        }
        if ($m2[2] !== '') {
            $fin = min((int) $m2[2], $tam - 1);
        }
        if ($inicio > $fin || $inicio >= $tam) {
            header('Content-Range: bytes */' . $tam);
            http_response_code(416);
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes {$inicio}-{$fin}/{$tam}");
    }

    header('Content-Length: ' . (string) ($fin - $inicio + 1));
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
        exit;
    }

    $f = fopen($real, 'rb');
    if ($f === false) {
        responder_error(500, 'No se pudo leer el fichero.');
    }
    fseek($f, $inicio);
    $restante = $fin - $inicio + 1;
    while ($restante > 0 && !feof($f)) {
        $trozo = fread($f, (int) min(262144, $restante));
        if ($trozo === false) {
            break;
        }
        echo $trozo;
        $restante -= strlen($trozo);
        flush();
    }
    fclose($f);
    exit;
}

/* ═══════════════════════════════════════════════════════════════
   Cambios (bajada)
   ═══════════════════════════════════════════════════════════════ */
function cambios(): void
{
    exigir_sesion();
    $desde = iso($_GET['desde'] ?? null, '1970-01-01T00:00:00.000Z');
    if (($_GET['desde'] ?? '') === '') {
        $desde = '1970-01-01T00:00:00.000Z';
    }

    // Directorio ligero del equipo: nombre y versión de la foto. Sin
    // él, la app solo sabe cómo se llama quien creó una tarea y tiene
    // que pintar iniciales aunque esa persona tenga foto puesta.
    //
    // Va ENTERO en cada respuesta, no por fecha como el resto. Un equipo
    // son unas decenas de filas, y filtrarlo por «lo cambiado desde la
    // última vez» dejaba sin directorio a quien ya estaba sincronizado:
    // las fichas se crearon el primer día y no vuelven a tocarse, así
    // que no aparecían nunca.
    $personas = bd()->query('SELECT * FROM usuarios ORDER BY nombre')->fetchAll();

    $listas = traer('listas', $desde);
    $tareas = traer('tareas', $desde);
    $comentarios = traer('comentarios', $desde);
    $medios = traer('medios', $desde);

    // La marca siguiente sale de los propios datos, no del reloj del
    // servidor: así un desfase horario entre hosting y móvil no puede
    // hacer que se pierdan cambios.
    // Las personas NO cuentan para la marca: como viajan siempre
    // enteras, si una tuviera la fecha más alta empujaría la marca por
    // delante de tareas que se quedaron fuera del tope de esta tanda, y
    // esas ya no se pedirían nunca.
    $marca = $desde;
    foreach ([$listas, $tareas, $comentarios, $medios] as $conjunto) {
        foreach ($conjunto as $fila) {
            if ($fila['actualizado'] > $marca) {
                $marca = $fila['actualizado'];
            }
        }
    }

    $hayMas = count($listas) >= TOPE_CAMBIOS || count($tareas) >= TOPE_CAMBIOS
        || count($comentarios) >= TOPE_CAMBIOS || count($medios) >= TOPE_CAMBIOS;

    responder([
        'personas'    => array_map('persona_salida', $personas),
        'listas'      => array_map('lista_salida', $listas),
        'tareas'      => array_map('tarea_salida', $tareas),
        'comentarios' => array_map('comentario_salida', $comentarios),
        'medios'      => array_map('medio_salida', $medios),
        'ahora'       => $marca,
        'mas'         => $hayMas,
    ]);
}

function traer(string $tabla, string $desde): array
{
    $stmt = bd()->prepare(
        "SELECT * FROM {$tabla} WHERE actualizado >= ? ORDER BY actualizado ASC LIMIT " . TOPE_CAMBIOS
    );
    $stmt->execute([$desde]);
    return $stmt->fetchAll();
}

/** Lo mínimo para pintar la bolita de alguien: nombre y foto. */
function persona_salida(array $u): array
{
    return [
        'id' => $u['id'],
        'nombre' => $u['nombre'],
        'avatar' => $u['avatar'] ?? '',
        'activo' => (int) ($u['activo'] ?? 1) === 1,
        'actualizado' => $u['actualizado'],
    ];
}

function lista_salida(array $f): array
{
    return [
        'id' => $f['id'], 'unidadId' => $f['unidad_id'], 'promoId' => $f['promo_id'],
        'fase' => $f['fase'], 'nombre' => (string) ($f['nombre'] ?? ''),
        'cerrada' => (int) $f['cerrada'] === 1, 'borrada' => (int) $f['borrada'] === 1,
        'creado' => $f['creado'], 'actualizado' => $f['actualizado'],
        'creadoPor' => $f['creado_por'], 'creadoPorNombre' => $f['creado_por_nombre'],
    ];
}

function tarea_salida(array $f): array
{
    return [
        'id' => $f['id'], 'listaId' => $f['lista_id'], 'texto' => $f['texto'],
        'estado' => $f['estado'], 'oficio' => (string) ($f['oficio'] ?? 'general'),
        'zona' => (string) ($f['zona'] ?? ''),
        'orden' => (int) $f['orden'], 'portadaId' => $f['portada_id'],
        'estadoPor' => $f['estado_por'], 'estadoEn' => $f['estado_en'],
        'rechazada' => (int) ($f['rechazada'] ?? 0) === 1,
        'borrada' => (int) $f['borrada'] === 1,
        'creado' => $f['creado'], 'actualizado' => $f['actualizado'],
        'creadoPor' => $f['creado_por'], 'creadoPorNombre' => $f['creado_por_nombre'],
    ];
}

function comentario_salida(array $f): array
{
    return [
        'id' => $f['id'], 'tareaId' => $f['tarea_id'], 'texto' => $f['texto'], 'tipo' => $f['tipo'],
        'borrada' => (int) $f['borrada'] === 1,
        'creado' => $f['creado'], 'actualizado' => $f['actualizado'],
        'creadoPor' => $f['creado_por'], 'creadoPorNombre' => $f['creado_por_nombre'],
        'creadoPorEmpresa' => $f['creado_por_empresa'] ?? '',
    ];
}

function medio_salida(array $f): array
{
    return [
        'id' => $f['id'], 'tareaId' => $f['tarea_id'],
        'comentarioId' => $f['comentario_id'] ?? null,
        'tipo' => $f['tipo'], 'mime' => $f['mime'],
        'tam' => (int) $f['tam'], 'ancho' => (int) $f['ancho'], 'alto' => (int) $f['alto'],
        'duracion' => (int) $f['duracion'], 'borrada' => (int) $f['borrada'] === 1,
        'creado' => $f['creado'], 'actualizado' => $f['actualizado'],
    ];
}
