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
require __DIR__ . '/lib/voces.php';

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

/** Cuántos días vive el audio de una reunión (decidido por Fran). */
const GRABACION_DIAS_AUDIO = 30;

/** Tope por parte de audio: el del transcriptor, que es el más estrecho. */
const GRABACION_TOPE_PARTE = 25 * 1024 * 1024;

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
    if ($r0 === 'mensajes' && $metodo === 'POST') {
        guardar_mensajes();
    }
    if ($r0 === 'lecturas' && $metodo === 'POST') {
        guardar_lecturas();
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

    if ($r0 === 'config' && ($p[1] ?? '') === 'zonas') {
        if ($metodo === 'GET') {
            leer_zonas();
        }
        if ($metodo === 'PUT') {
            guardar_zonas();
        }
        responder_error(405, 'Método no permitido.');
    }

    if ($r0 === 'copia' && $metodo === 'GET') {
        if (($p[1] ?? '') === 'fichero') {
            servir_copia_fichero((string) ($_GET['id'] ?? ''));
        }
        volcar_copia();
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

    if ($r0 === 'obra') {
        $r1 = $p[1] ?? '';
        if ($r1 === 'estado' && $metodo === 'GET') {
            obra_estado();
        }
        if ($r1 === 'reuniones') {
            if ($metodo === 'GET' && !isset($p[2])) {
                listar_reuniones();
            }
            if ($metodo === 'POST' && !isset($p[2])) {
                empezar_reunion();
            }
            if ($metodo === 'GET' && isset($p[2])) {
                ver_reunion($p[2]);
            }
            if ($metodo === 'PATCH' && isset($p[2])) {
                editar_reunion($p[2]);
            }
        }
        if ($r1 === 'encargos') {
            if ($metodo === 'POST' && !isset($p[2])) {
                crear_encargo();
            }
            if ($metodo === 'PATCH' && isset($p[2])) {
                editar_encargo($p[2]);
            }
        }
        if ($r1 === 'reuniones' && isset($p[2], $p[3])) {
            if ($p[3] === 'mesa' && $metodo === 'POST') {
                tocar_mesa($p[2]);
            }
            if ($p[3] === 'grabaciones' && $metodo === 'POST') {
                empezar_grabacion($p[2]);
            }
            if ($p[3] === 'redactar' && $metodo === 'POST') {
                redactar_acta($p[2]);
            }
            if ($p[3] === 'acta' && $metodo === 'POST') {
                aceptar_acta($p[2]);
            }
        }
        if ($r1 === 'grabaciones' && isset($p[2], $p[3])) {
            if ($p[3] === 'parte' && $metodo === 'POST') {
                subir_parte_grabacion($p[2]);
            }
            if ($p[3] === 'cerrar' && $metodo === 'POST') {
                cerrar_grabacion($p[2]);
            }
            if ($p[3] === 'transcribir' && $metodo === 'POST') {
                transcribir_grabacion($p[2]);
            }
            if ($p[3] === 'audio' && $metodo === 'GET') {
                servir_audio_grabacion($p[2]);
            }
            if ($p[3] === 'hablantes' && $metodo === 'POST') {
                guardar_hablantes($p[2]);
            }
            if ($p[3] === 'identificar' && $metodo === 'POST') {
                identificar_grabacion($p[2]);
            }
        }
        if ($r1 === 'voces') {
            $r2 = $p[2] ?? '';
            if ($r2 === '' && $metodo === 'GET') {
                listar_voces();
            }
            if ($r2 === '' && $metodo === 'POST') {
                crear_voz();
            }
            if ($r2 === 'clave') {
                if ($metodo === 'GET') {
                    voces_estado();
                }
                if ($metodo === 'POST') {
                    voces_poner_clave();
                }
                if ($metodo === 'DELETE') {
                    voces_quitar_clave();
                }
            }
            if (isset($p[3]) && $p[3] === 'muestra' && $metodo === 'POST') {
                subir_muestra_voz($r2);
            }
        }
        responder_error(404, 'Ruta de obra desconocida.');
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
    if (strlen($clave) > 500 || preg_match('/\\s/', $clave)) {
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
    if (strlen($clave) > 500 || preg_match('/\\s/', $clave)) {
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

    // Juntar o no las fotos del mismo remate: lo decide cada uno en
    // sus ajustes. Si no viene el campo se junta, que es lo normal —y
    // así una versión vieja del móvil sigue funcionando igual.
    $juntar = !isset($datos['juntar']) || (bool) $datos['juntar'];
    responder(claude_redactar($texto, $limpias, $gremios, $miradas, $sitios, $juntar));
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
        $fechaLimite = isset($t['fechaLimite']) && $t['fechaLimite'] ? iso($t['fechaLimite']) : null;

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
        $estadoPor = texto($t, 'estadoPor', 120) ?: null;
        $estadoEn = isset($t['estadoEn']) ? iso($t['estadoEn'], '') : '';
        $rechazada = booleano($t, 'rechazada') ? 1 : 0;

        // Se relee dentro del bucle y se vacía cada vuelta a
        // propósito: dejar la fila de la tarea anterior colgando
        // aquí acabaría escribiendo el texto de una en otra.
        $previo = bd()->prepare('SELECT estado, estado_por, estado_en, rechazada, texto, oficio, zona, fecha_limite, borrada FROM tareas WHERE id = ?');
        $previo->execute([$t['id']]);
        $fila = $previo->fetch() ?: null;

        if (!$decide) {
            if ($fila) {
                $texto = (string) $fila['texto'];
                $oficio = (string) ($fila['oficio'] ?? 'general');
                $zona = (string) ($fila['zona'] ?? '');
                $fechaLimite = $fila['fecha_limite'] ?? null;
                $borrada = (int) ($fila['borrada'] ?? 0);
            }
            if (in_array($estado, ['verificada', 'rechazada'], true)) {
                // Lo que ya hubiera decidido un verificador no lo deshace
                // quien no puede; y si no había nada, se queda en
                // completada, que es lo más lejos que llega el jefe de obra.
                $guardado = $fila['estado'] ?? '';
                $estado = in_array($guardado, ['verificada', 'rechazada'], true) ? $guardado : 'resuelta';
                $rechazada = $estado === 'rechazada' ? 1 : 0;
            }
        }

        // El estado lleva su propio reloj: `estado_en` es el sello de
        // cuándo se puso, y entre lo que llega y lo guardado gana el
        // sello más reciente, con el empate para lo guardado. Sin esto,
        // la copia atrasada de un móvil —que empuja una foto nueva con
        // el estado viejo dentro de la misma fila— deshacía una
        // verificación: `upsert` compara `actualizado`, y la foto es más
        // nueva aunque su estado sea de ayer. Las filas de antes de que
        // existiera el sello no entran (sello guardado vacío) y se
        // comportan como siempre.
        $selloGuardado = (string) ($fila['estado_en'] ?? '');
        if ($fila && $selloGuardado !== '' && ($estadoEn === '' || $estadoEn <= $selloGuardado)) {
            $estado = (string) $fila['estado'];
            $estadoPor = $fila['estado_por'] ?? null;
            $estadoEn = $selloGuardado;
            $rechazada = (int) ($fila['rechazada'] ?? 0);
        }

        $registro = [
            'id'                => $t['id'],
            'lista_id'          => $t['listaId'],
            'texto'             => $texto,
            'estado'            => $estado,
            'oficio'            => $oficio,
            'zona'              => $zona,
            'fecha_limite'      => $fechaLimite,
            'orden'             => entero($t, 'orden'),
            'portada_id'        => es_uuid($t['portadaId'] ?? null) ? $t['portadaId'] : null,
            'estado_por'        => $estadoPor,
            'estado_en'         => $estadoEn !== '' ? $estadoEn : null,
            'rechazada'         => $rechazada,
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

/* ═══════════════════════════════════════════════════════════════
   Mensajes de una vivienda, y quién los ha leído
   ═══════════════════════════════════════════════════════════════ */
/**
 * Los mensajes del hilo de una vivienda. Los ve y los escribe cualquiera
 * con sesión: es la conversación del proyecto, no un acta.
 *
 * Borrar solo lo puede hacer quien lo escribió. No es una regla de
 * permisos, es de conversación: si un tercero puede hacer desaparecer lo
 * que dijiste, el hilo deja de servir para acordarse de nada.
 */
function guardar_mensajes(): void
{
    $yo = exigir_sesion();
    $entrada = cuerpo()['mensajes'] ?? [];
    if (!is_array($entrada)) {
        responder_error(400, 'Formato incorrecto.', 'formato');
    }
    $guardados = 0;
    foreach ($entrada as $m) {
        if (!is_array($m) || !es_uuid($m['id'] ?? null)) {
            continue;
        }
        $unidad = texto($m, 'unidadId', 60);
        if ($unidad === '') {
            continue;
        }

        $borrada = booleano($m, 'borrada') ? 1 : 0;
        if ($borrada) {
            // Se relee el autor de la base y no se cree el que llega: el
            // navegador podría mandar cualquiera.
            $previo = bd()->prepare('SELECT creado_por, borrada FROM mensajes WHERE id = ?');
            $previo->execute([$m['id']]);
            $fila = $previo->fetch();
            if ($fila && $fila['creado_por'] !== $yo['id'] && $yo['rol'] !== 'admin') {
                $borrada = (int) ($fila['borrada'] ?? 0);
            }
        }

        $registro = [
            'id'                 => $m['id'],
            'unidad_id'          => $unidad,
            'promo_id'           => texto($m, 'promoId', 40),
            'texto'              => mb_substr((string) ($m['texto'] ?? ''), 0, 4000),
            'borrada'            => $borrada,
            'creado'             => iso($m['creado'] ?? null),
            'actualizado'        => iso($m['actualizado'] ?? null),
            'creado_por'         => es_uuid($m['creadoPor'] ?? null) ? $m['creadoPor'] : null,
            'creado_por_nombre'  => texto($m, 'creadoPorNombre', 120, 'Sin identificar'),
            'creado_por_empresa' => texto($m, 'creadoPorEmpresa', 120),
        ];
        if (upsert('mensajes', $registro)) {
            $guardados++;
        }
    }
    responder(['guardados' => $guardados]);
}

/**
 * Las lecturas. Cada una es «esta persona leyó este mensaje», con el id
 * compuesto por los dos.
 *
 * Se ignora el usuario que venga escrito y se pone el de la sesión: una
 * lectura es un hecho sobre quien la hace, y dejar que el navegador diga
 * por quién lee convertiría los dos tics en algo que se puede fingir.
 *
 * Y no se reescriben: la primera vez que alguien lee algo es la que
 * cuenta, y una segunda subida de la misma lectura no puede mover la
 * fecha hacia delante.
 */
function guardar_lecturas(): void
{
    $yo = exigir_sesion();
    $entrada = cuerpo()['lecturas'] ?? [];
    if (!is_array($entrada)) {
        responder_error(400, 'Formato incorrecto.', 'formato');
    }
    $guardadas = 0;
    $sent = bd()->prepare('SELECT 1 FROM lecturas WHERE id = ?');
    foreach ($entrada as $l) {
        if (!is_array($l) || !es_uuid($l['mensajeId'] ?? null)) {
            continue;
        }
        $id = $l['mensajeId'] . ':' . $yo['id'];
        $sent->execute([$id]);
        if ($sent->fetchColumn()) {
            continue;
        }
        $cuando = iso($l['creado'] ?? null);
        if (upsert('lecturas', [
            'id'          => $id,
            'mensaje_id'  => $l['mensajeId'],
            'usuario_id'  => $yo['id'],
            'creado'      => $cuando,
            'actualizado' => $cuando,
        ])) {
            $guardadas++;
        }
    }
    responder(['guardadas' => $guardadas]);
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

    // Se cuentan los bytes que quedaron en disco: si no son los que
    // llegaron —disco lleno, escritura cortada—, el fichero no vale y
    // se dice. El móvil compara además esta cifra con la que envió, así
    // que una subida coja no se da por buena en ningún extremo.
    clearstatcache(true, $destino);
    $enDisco = (int) @filesize($destino);
    if ($enDisco !== $tam) {
        @unlink($destino);
        responder_error(500, 'El fichero se guardó incompleto.', 'guardar-corto');
    }

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

    responder(['id' => $id, 'ok' => true, 'tam' => $enDisco], 201);
}

/**
 * El volcado para la copia nocturna: todas las tablas de la base, en
 * JSON. Los ficheros de las fotos no van aquí: el robot se los lleva
 * por FTP; esto es lo que el FTP no ve, la base de datos.
 *
 * No pide sesión porque lo llama un robot de madrugada. En su lugar
 * exige una clave de un solo uso que ese mismo robot deja por FTP en
 * datos/copia.clave justo antes de llamar y retira justo después. Sin
 * ese fichero en su sitio, 403 seco: el resto del año esta puerta no
 * existe.
 */
/* ─── Las estancias de la obra ──────────────────────────────────
   La lista que antes vivía escrita en el código del móvil. Se guarda en
   meta con la clave «zonas» como JSON: [{ nombre, zonas: [...] }, …].
   Sin fila guardada, la app usa su lista de fábrica; por eso «borrar»
   es una manera válida de volver a ella. */

/** La lista guardada, o null si se está con la de fábrica. */
function zonas_guardadas(): ?array
{
    $crudo = meta_valor('zonas');
    if ($crudo === null) {
        return null;
    }
    $plantas = json_decode($crudo, true);
    return is_array($plantas) ? $plantas : null;
}

function leer_zonas(): void
{
    exigir_sesion();
    responder(['plantas' => zonas_guardadas()]);
}

function guardar_zonas(): void
{
    exigir_admin();
    $d = cuerpo();
    if (!array_key_exists('plantas', $d)) {
        responder_error(400, 'Falta la lista de plantas.', 'formato');
    }

    // Null es «volver a la lista de fábrica»: se borra lo guardado.
    if ($d['plantas'] === null) {
        meta_poner('zonas', null);
        responder(['ok' => true, 'plantas' => null]);
    }

    if (!is_array($d['plantas']) || count($d['plantas']) === 0 || count($d['plantas']) > 12) {
        responder_error(400, 'La lista de plantas no tiene buena pinta.', 'formato');
    }

    $limpias = [];
    $vistas = [];
    $totales = 0;
    foreach ($d['plantas'] as $planta) {
        if (!is_array($planta)) {
            responder_error(400, 'Hay una planta que no tiene buena pinta.', 'formato');
        }
        $nombre = trim((string) ($planta['nombre'] ?? ''));
        if ($nombre === '' || mb_strlen($nombre) > 60) {
            responder_error(400, 'Cada planta necesita un nombre de hasta 60 letras.', 'nombre');
        }
        $zonas = [];
        foreach ((array) ($planta['zonas'] ?? []) as $zona) {
            $zona = trim((string) $zona);
            if ($zona === '' || mb_strlen($zona) > 40) {
                responder_error(400, 'Cada estancia necesita un nombre de hasta 40 letras.', 'zona');
            }
            $llana = mb_strtolower($zona);
            if (isset($vistas[$llana])) {
                responder_error(400, "La estancia «{$zona}» está repetida.", 'repetida');
            }
            $vistas[$llana] = true;
            $zonas[] = $zona;
            $totales++;
        }
        $limpias[] = ['nombre' => $nombre, 'zonas' => $zonas];
    }
    if ($totales === 0) {
        responder_error(400, 'Tiene que quedar al menos una estancia.', 'vacio');
    }
    if ($totales > 80) {
        responder_error(400, 'Ochenta estancias son demasiadas para un selector.', 'demasiadas');
    }

    meta_poner('zonas', json_encode($limpias, JSON_UNESCAPED_UNICODE));
    responder(['ok' => true, 'plantas' => $limpias]);
}

/**
 * La cerradura de la puerta de la copia: solo abre si quien llama trae
 * la misma llave que haya en datos/copia.clave. Ese fichero normalmente
 * NO existe —lo pone el robot un momento y lo retira al acabar—, así
 * que la respuesta de la casa es 403.
 */
function exigir_clave_copia(): void
{
    $fichero = __DIR__ . '/datos/copia.clave';
    $clave = (string) ($_SERVER['HTTP_X_CLAVE_COPIA'] ?? '');
    $guardada = is_file($fichero) ? trim((string) @file_get_contents($fichero)) : '';
    if ($guardada === '' || $clave === '' || !hash_equals($guardada, $clave)) {
        responder_error(403, 'Sin permiso.', 'clave');
    }
}

/**
 * Entrega un fichero de medios al robot de la copia. Existe porque la
 * carpeta de medios puede vivir fuera de la carpeta del dominio (en
 * Plesk la configuración «uploads» admite una ruta absoluta) y entonces
 * el FTP del robot no llega a ella; el PHP sí, porque es quien la usa a
 * diario. Misma cerradura que el volcado.
 */
function servir_copia_fichero(string $id): void
{
    exigir_clave_copia();
    if (!es_uuid($id)) {
        responder_error(400, 'Identificador incorrecto.', 'formato');
    }
    $stmt = bd()->prepare('SELECT mime, ruta, borrada FROM medios WHERE id = ?');
    $stmt->execute([$id]);
    $m = $stmt->fetch();
    if (!$m || (int) $m['borrada'] === 1 || $m['ruta'] === '') {
        responder_error(404, 'El medio no existe.', 'sin-fila');
    }

    $ruta = carpeta_medios() . '/' . $m['ruta'];
    $real = realpath($ruta);
    // El mismo cinturón que servir_medio: la ruta guardada nunca debe
    // salirse de la carpeta de medios.
    if ($real === false || strpos($real, carpeta_medios()) !== 0 || !is_file($real)) {
        // Con su propio código: al robot le importa distinguir «no hay
        // fila» de «la fila está pero el fichero no», que es una foto
        // perdida en el servidor y hay que decirlo bien alto.
        responder_error(404, 'La base de datos habla de este fichero pero no está en el disco.', 'sin-fichero');
    }

    header('Content-Type: ' . $m['mime']);
    header('Content-Length: ' . filesize($real));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    readfile($real);
    exit;
}

function volcar_copia(): void
{
    exigir_clave_copia();

    $pdo = bd();
    $motor = (string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    $tablas = $motor === 'sqlite'
        ? $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN)
        : $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

    // La carpeta real y cuántos ficheros hay en ella: el robot coteja
    // estas cuentas con lo que baja, y si un día no cuadran, el volcado
    // mismo dice dónde mirar. El recuento baja a las subcarpetas porque
    // las rutas de los medios llevan año y mes (2026/08/…); -1 significa
    // que no se pudo contar, que no es lo mismo que cero.
    $carpeta = carpeta_medios();
    try {
        $enDisco = 0;
        $arbol = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($carpeta, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($arbol as $nodo) {
            if ($nodo->isFile()) {
                $enDisco++;
            }
        }
    } catch (Throwable $e) {
        $enDisco = -1;
    }

    $volcado = [
        'generado' => ahora_iso(),
        'motor' => $motor,
        'carpeta_medios' => $carpeta,
        'ficheros_en_disco' => $enDisco,
        'tablas' => [],
    ];
    foreach ($tablas as $t) {
        // El nombre viene de la propia base, no de fuera; aun así, comillas.
        $envuelto = $motor === 'sqlite' ? '"' . $t . '"' : '`' . $t . '`';
        $volcado['tablas'][$t] = $pdo->query('SELECT * FROM ' . $envuelto)->fetchAll(PDO::FETCH_ASSOC);
    }
    responder($volcado);
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
    if ($rango !== '' && preg_match('/bytes=(\\d*)-(\\d*)/', $rango, $m2)) {
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
    $mensajes = traer('mensajes', $desde);
    $lecturas = traer('lecturas', $desde);

    // La marca siguiente sale de los propios datos, no del reloj del
    // servidor: así un desfase horario entre hosting y móvil no puede
    // hacer que se pierdan cambios.
    // Las personas NO cuentan para la marca: como viajan siempre
    // enteras, si una tuviera la fecha más alta empujaría la marca por
    // delante de tareas que se quedaron fuera del tope de esta tanda, y
    // esas ya no se pedirían nunca.
    $marca = $desde;
    foreach ([$listas, $tareas, $comentarios, $medios, $mensajes, $lecturas] as $conjunto) {
        foreach ($conjunto as $fila) {
            if ($fila['actualizado'] > $marca) {
                $marca = $fila['actualizado'];
            }
        }
    }

    $hayMas = count($listas) >= TOPE_CAMBIOS || count($tareas) >= TOPE_CAMBIOS
        || count($comentarios) >= TOPE_CAMBIOS || count($medios) >= TOPE_CAMBIOS
        || count($mensajes) >= TOPE_CAMBIOS || count($lecturas) >= TOPE_CAMBIOS;

    responder([
        'personas'    => array_map('persona_salida', $personas),
        'listas'      => array_map('lista_salida', $listas),
        'tareas'      => array_map('tarea_salida', $tareas),
        'comentarios' => array_map('comentario_salida', $comentarios),
        'medios'      => array_map('medio_salida', $medios),
        'mensajes'    => array_map('mensaje_salida', $mensajes),
        'lecturas'    => array_map('lectura_salida', $lecturas),
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
        'fechaLimite' => $f['fecha_limite'] ?? null,
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

function mensaje_salida(array $f): array
{
    return [
        'id' => $f['id'], 'unidadId' => $f['unidad_id'], 'promoId' => $f['promo_id'] ?? '',
        'texto' => $f['texto'], 'borrada' => (int) $f['borrada'] === 1,
        'creado' => $f['creado'], 'actualizado' => $f['actualizado'],
        'creadoPor' => $f['creado_por'], 'creadoPorNombre' => $f['creado_por_nombre'],
        'creadoPorEmpresa' => $f['creado_por_empresa'] ?? '',
    ];
}

function lectura_salida(array $f): array
{
    return [
        'id' => $f['id'], 'mensajeId' => $f['mensaje_id'], 'usuarioId' => $f['usuario_id'],
        'creado' => $f['creado'], 'actualizado' => $f['actualizado'],
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

/* ═══════════════════════════════════════════════════════════════
   La obra: reuniones y encargos
   ═══════════════════════════════════════════════════════════════
   Los ENCARGOS son las tareas que nacen de una reunión: en pantalla se
   llaman «tareas», pero por dentro llevan nombre propio para no chocar
   jamás con la tabla `tareas`, que guarda repasos (ver CLAUDE.md).

   A diferencia de los repasos, esto va SIEMPRE en línea: sin outbox y
   sin upsert de cliente. Una reunión se lleva estando presente, y quien
   la lleva tiene cobertura o espera un momento; a cambio el servidor es
   la única verdad, y el sello de las 23:59 no se esquiva atrasando el
   reloj del móvil.
*/

/** La reunión la llevan la DF y el administrador: los mismos que verifican. */
function exigir_df(): array
{
    $yo = exigir_sesion();
    if ($yo['rol'] !== 'admin' && !$yo['verifica']) {
        responder_error(403, 'Las reuniones de obra las llevan la dirección facultativa y el administrador.', 'permiso');
    }
    return $yo;
}

/** El día de hoy en la obra: la fecha se corta con el reloj CANARIO.
    La obra vive en Canarias (decidido por Fran, agosto de 2026): su día,
    su sello de las 23:59 y su cortesía se cuentan en su hora. */
function hoy_obra(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Atlantic/Canary')))->format('Y-m-d');
}

/**
 * El sello de las 23:59. Al acabar el día, el acta queda cerrada: se
 * compara la fecha de la reunión con el día de hoy en Canarias, aquí
 * en el servidor. Lo único que sobrevive al sello es tachar encargos como
 * hechos —o destacharlos—, que no cambia lo acordado: solo cuenta cómo
 * va cumpliéndose.
 */
function exigir_reunion_abierta(array $reunion): void
{
    if ((string) $reunion['fecha'] < hoy_obra()) {
        responder_error(403, 'El acta de ese día ya está sellada: a las 23:59 se cierra sola.', 'sellada');
    }
}

/**
 * ¿Vale todavía firmar o redactar el acta de esta reunión? Sí mientras
 * está abierta y, ya sellada, solo en la prórroga de cortesía: es la
 * reunión de ayer, no son las 00:45 y hay grabación —el conducto
 * estaba trabajando cuando cruzó la medianoche—. Todo lo demás del
 * acta (asistentes, tareas a mano) se sella a las 23:59 en seco.
 */
function exigir_acta_entregable(array $reunion): void
{
    if ((string) $reunion['fecha'] >= hoy_obra()) {
        return;
    }
    if (acta_en_cortesia($reunion)) {
        return;
    }
    responder_error(403, 'El acta de ese día ya está sellada: a las 23:59 se cierra sola.', 'sellada');
}

/** Lo mismo, en pregunta: para que el móvil sepa si enseñar la firma. */
function acta_en_cortesia(array $reunion): bool
{
    if ((string) $reunion['fecha'] >= hoy_obra()) {
        return false;
    }
    $ahora = new DateTimeImmutable('now', new DateTimeZone('Atlantic/Canary'));
    if (!dentro_de_cortesia((string) $reunion['fecha'], $ahora)) {
        return false;
    }
    $sent = bd()->prepare('SELECT COUNT(*) FROM grabaciones WHERE reunion_id = ? AND borrada = 0');
    $sent->execute([$reunion['id']]);
    return (int) $sent->fetchColumn() > 0;
}

function reunion_o_404(string $id): array
{
    if (!es_uuid($id)) {
        responder_error(404, 'Reunión desconocida.');
    }
    $sent = bd()->prepare('SELECT * FROM reuniones WHERE id = ? AND borrada = 0');
    $sent->execute([$id]);
    $fila = $sent->fetch();
    if (!$fila) {
        responder_error(404, 'Reunión desconocida.');
    }
    return $fila;
}

function promo_pedida(): string
{
    $promo = mb_substr(trim((string) ($_GET['promo'] ?? '')), 0, 60);
    if ($promo === '') {
        responder_error(400, 'Falta la promoción.', 'formato');
    }
    return $promo;
}

/** Lo que la portada necesita saber de la obra, en una sola llamada. */
function obra_estado(): void
{
    exigir_sesion();
    $promo = promo_pedida();

    $sent = bd()->prepare('SELECT * FROM reuniones WHERE promo_id = ? AND borrada = 0 ORDER BY fecha DESC LIMIT 1');
    $sent->execute([$promo]);
    $ultima = $sent->fetch() ?: null;

    $pend = bd()->prepare("SELECT COUNT(*) FROM encargos WHERE promo_id = ? AND estado = 'pendiente' AND borrada = 0");
    $pend->execute([$promo]);

    $salida = null;
    if ($ultima) {
        $salida = reunion_salida($ultima);
        $cuentas = contar_encargos($ultima['id']);
        $salida['encargos'] = $cuentas['total'];
        $salida['pendientes'] = $cuentas['pendientes'];
    }

    responder([
        'hoy'        => hoy_obra(),
        'ultima'     => $salida,
        'pendientes' => (int) $pend->fetchColumn(),
    ]);
}

function contar_encargos(string $reunionId): array
{
    $sent = bd()->prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END), 0) AS pendientes
           FROM encargos WHERE reunion_id = ? AND borrada = 0"
    );
    $sent->execute([$reunionId]);
    $fila = $sent->fetch() ?: [];
    return ['total' => (int) ($fila['total'] ?? 0), 'pendientes' => (int) ($fila['pendientes'] ?? 0)];
}

function listar_reuniones(): void
{
    exigir_sesion();
    $promo = promo_pedida();

    // La escoba del audio viejo pasa aquí: es la pantalla que se abre
    // todos los días y este hosting no tiene cron.
    grabaciones_purgar();

    $sent = bd()->prepare('SELECT * FROM reuniones WHERE promo_id = ? AND borrada = 0 ORDER BY fecha DESC LIMIT 200');
    $sent->execute([$promo]);
    $filas = $sent->fetchAll();

    // Cuántos encargos tiene cada una y cuántos siguen pendientes, de
    // una sola consulta: la lista se abre todos los días y no tiene por
    // qué costar una consulta por reunión.
    $cuentas = [];
    $sent = bd()->prepare(
        "SELECT reunion_id, COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END), 0) AS pendientes
           FROM encargos WHERE promo_id = ? AND borrada = 0 GROUP BY reunion_id"
    );
    $sent->execute([$promo]);
    foreach ($sent->fetchAll() as $c) {
        $cuentas[$c['reunion_id']] = $c;
    }

    // Lo pendiente de toda la obra, venga de la reunión que venga: la
    // pantalla de Obra lo enseña sin obligar a abrir acta por acta.
    $sent = bd()->prepare(
        "SELECT e.*, r.fecha AS reunion_fecha FROM encargos e
           JOIN reuniones r ON r.id = e.reunion_id
          WHERE e.promo_id = ? AND e.estado = 'pendiente' AND e.borrada = 0 AND r.borrada = 0
          ORDER BY r.fecha DESC, e.creado ASC LIMIT 100"
    );
    $sent->execute([$promo]);
    $pendientes = array_map(static function ($f) {
        $salida = encargo_salida($f);
        $salida['reunionFecha'] = $f['reunion_fecha'];
        return $salida;
    }, $sent->fetchAll());

    responder(['hoy' => hoy_obra(), 'reuniones' => array_map(static function ($f) use ($cuentas) {
        $c = $cuentas[$f['id']] ?? null;
        $salida = reunion_salida($f);
        $salida['encargos'] = (int) ($c['total'] ?? 0);
        $salida['pendientes'] = (int) ($c['pendientes'] ?? 0);
        return $salida;
    }, $filas), 'tareasPendientes' => $pendientes]);
}

function empezar_reunion(): void
{
    $yo = exigir_df();
    $promo = texto(cuerpo(), 'promoId', 60);
    if ($promo === '') {
        responder_error(400, 'Falta la promoción.', 'formato');
    }
    $hoy = hoy_obra();

    // Una reunión por día y promoción, y el botón se puede pulsar dos
    // veces sin miedo: si la de hoy ya está empezada, se devuelve esa.
    $existente = reunion_del_dia($promo, $hoy);
    if ($existente) {
        responder(['reunion' => reunion_salida($existente), 'nueva' => false]);
    }

    $registro = [
        'id'                => uuid(),
        'promo_id'          => $promo,
        'fecha'             => $hoy,
        'empezada'          => ahora_iso(),
        'terminada'         => null,
        // Quien la empieza está en ella: es la primera de la lista.
        'asistentes'        => json_encode([$yo['id']]),
        'invitados'         => '[]',
        'borrada'           => 0,
        'creado'            => ahora_iso(),
        'actualizado'       => ahora_iso(),
        'creado_por'        => $yo['id'],
        'creado_por_nombre' => (string) $yo['nombre'],
    ];
    try {
        $columnas = array_keys($registro);
        bd()->prepare(sprintf(
            'INSERT INTO reuniones (%s) VALUES (%s)',
            implode(', ', $columnas),
            implode(', ', array_fill(0, count($columnas), '?'))
        ))->execute(array_values($registro));
    } catch (PDOException $e) {
        // Dos móviles a la vez: el índice único deja pasar solo a uno,
        // y el otro se lleva la misma reunión, como si llegara tarde.
        if ($e->getCode() !== '23000') {
            throw $e;
        }
        $existente = reunion_del_dia($promo, $hoy);
        if ($existente) {
            responder(['reunion' => reunion_salida($existente), 'nueva' => false]);
        }
        throw $e;
    }
    responder(['reunion' => reunion_salida($registro), 'nueva' => true], 201);
}

function reunion_del_dia(string $promo, string $fecha): ?array
{
    $sent = bd()->prepare('SELECT * FROM reuniones WHERE promo_id = ? AND fecha = ?');
    $sent->execute([$promo, $fecha]);
    return $sent->fetch() ?: null;
}

function ver_reunion(string $id): void
{
    exigir_sesion();
    $reunion = reunion_o_404($id);

    $sent = bd()->prepare('SELECT * FROM encargos WHERE reunion_id = ? AND borrada = 0 ORDER BY creado ASC');
    $sent->execute([$id]);
    $encargos = array_map('encargo_salida', $sent->fetchAll());

    // El arrastre: lo pendiente de reuniones anteriores, para repasarlo
    // en la de hoy sin ir a buscarlo acta por acta.
    $sent = bd()->prepare(
        "SELECT e.*, r.fecha AS reunion_fecha FROM encargos e
           JOIN reuniones r ON r.id = e.reunion_id
          WHERE e.promo_id = ? AND e.estado = 'pendiente' AND e.borrada = 0
            AND r.borrada = 0 AND r.fecha < ?
          ORDER BY r.fecha ASC, e.creado ASC"
    );
    $sent->execute([$reunion['promo_id'], $reunion['fecha']]);
    $arrastre = array_map(static function ($f) {
        $salida = encargo_salida($f);
        $salida['reunionFecha'] = $f['reunion_fecha'];
        return $salida;
    }, $sent->fetchAll());

    // Las grabaciones de esta reunión, con su estado.
    $sent = bd()->prepare('SELECT * FROM grabaciones WHERE reunion_id = ? AND borrada = 0 ORDER BY creado ASC');
    $sent->execute([$id]);
    $grabaciones = array_map('grabacion_salida', $sent->fetchAll());

    $propuesta = json_decode((string) ($reunion['propuesta'] ?? ''), true);

    responder([
        'hoy'         => hoy_obra(),
        'reunion'     => reunion_salida($reunion),
        'encargos'    => $encargos,
        'arrastre'    => $arrastre,
        'grabaciones' => $grabaciones,
        'resumen'     => (string) ($reunion['resumen'] ?? ''),
        'propuesta'   => is_array($propuesta) ? $propuesta : null,
        'actaEnCortesia' => acta_en_cortesia($reunion),
    ]);
}

function editar_reunion(string $id): void
{
    exigir_df();
    $reunion = reunion_o_404($id);
    exigir_reunion_abierta($reunion);
    $c = cuerpo();

    $cambios = [];
    if (array_key_exists('asistentes', $c)) {
        $cambios['asistentes'] = json_encode(lista_de_uuids($c['asistentes']));
    }
    if (array_key_exists('invitados', $c)) {
        $cambios['invitados'] = json_encode(lista_de_nombres($c['invitados']), JSON_UNESCAPED_UNICODE);
    }
    if (array_key_exists('terminada', $c)) {
        // Terminarla dos veces no mueve la hora; y mientras el día no
        // se selle, la DF puede reabrirla para apuntar lo olvidado.
        $cambios['terminada'] = $c['terminada'] ? ((string) ($reunion['terminada'] ?? '') ?: ahora_iso()) : null;
    }
    if (!$cambios) {
        responder_error(400, 'Nada que cambiar.', 'formato');
    }
    $cambios['actualizado'] = ahora_iso();

    $asignaciones = implode(', ', array_map(static fn ($k) => "{$k} = ?", array_keys($cambios)));
    $valores = array_values($cambios);
    $valores[] = $id;
    bd()->prepare("UPDATE reuniones SET {$asignaciones} WHERE id = ?")->execute($valores);

    responder(['reunion' => reunion_salida(reunion_o_404($id))]);
}

/** Ids de usuario válidos, sin repetidos y con un tope de cordura. */
function lista_de_uuids($valor): array
{
    if (!is_array($valor)) {
        return [];
    }
    $ids = [];
    foreach ($valor as $id) {
        if (is_string($id) && es_uuid($id) && !in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }
    return array_slice($ids, 0, 60);
}

/** Nombres de invitados: gente de la obra sin cuenta en la app. */
function lista_de_nombres($valor): array
{
    if (!is_array($valor)) {
        return [];
    }
    $nombres = [];
    foreach ($valor as $n) {
        $n = mb_substr(trim((string) $n), 0, 80);
        if ($n !== '' && !in_array($n, $nombres, true)) {
            $nombres[] = $n;
        }
    }
    return array_slice($nombres, 0, 60);
}

/** Una fecha de calendario «AAAA-MM-DD», o vacío si no viene o viene rara. */
function fecha_de_dia($valor): string
{
    $valor = trim((string) $valor);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $valor) === 1 ? $valor : '';
}

function crear_encargo(): void
{
    $yo = exigir_df();
    $c = cuerpo();
    $reunion = reunion_o_404((string) ($c['reunionId'] ?? ''));
    exigir_reunion_abierta($reunion);

    $texto = mb_substr(trim((string) ($c['texto'] ?? '')), 0, 2000);
    if ($texto === '') {
        responder_error(400, 'El encargo necesita un texto.', 'formato');
    }
    $general = booleano($c, 'general', true);
    $unidad = $general ? '' : texto($c, 'unidadId', 80);
    if (!$general && $unidad === '') {
        responder_error(400, 'O es general o lleva vivienda.', 'formato');
    }

    $registro = [
        'id'                 => uuid(),
        'reunion_id'         => $reunion['id'],
        'promo_id'           => $reunion['promo_id'],
        'texto'              => $texto,
        'general'            => $general ? 1 : 0,
        'unidad_id'          => $unidad,
        'responsable_id'     => es_uuid($c['responsableId'] ?? null) ? $c['responsableId'] : null,
        'responsable_nombre' => texto($c, 'responsableNombre', 120),
        'fecha_limite'       => fecha_de_dia($c['fechaLimite'] ?? ''),
        'estado'             => 'pendiente',
        'hecho_en'           => null,
        'hecho_por_nombre'   => '',
        'borrada'            => 0,
        'creado'             => ahora_iso(),
        'actualizado'        => ahora_iso(),
        'creado_por'         => $yo['id'],
        'creado_por_nombre'  => (string) $yo['nombre'],
    ];
    $columnas = array_keys($registro);
    bd()->prepare(sprintf(
        'INSERT INTO encargos (%s) VALUES (%s)',
        implode(', ', $columnas),
        implode(', ', array_fill(0, count($columnas), '?'))
    ))->execute(array_values($registro));

    responder(['encargo' => encargo_salida($registro)], 201);
}

function editar_encargo(string $id): void
{
    $yo = exigir_sesion();
    if (!es_uuid($id)) {
        responder_error(404, 'Encargo desconocido.');
    }
    $sent = bd()->prepare('SELECT * FROM encargos WHERE id = ? AND borrada = 0');
    $sent->execute([$id]);
    $encargo = $sent->fetch();
    if (!$encargo) {
        responder_error(404, 'Encargo desconocido.');
    }
    $c = cuerpo();
    $cambios = [];

    // Tachar un encargo —o destacharlo— puede hacerlo cualquiera del
    // equipo y en cualquier momento: el sello cierra lo ACORDADO, no el
    // ir cumpliéndolo.
    if (array_key_exists('estado', $c)) {
        $estado = $c['estado'] === 'hecho' ? 'hecho' : 'pendiente';
        $cambios['estado'] = $estado;
        $cambios['hecho_en'] = $estado === 'hecho' ? ahora_iso() : null;
        $cambios['hecho_por_nombre'] = $estado === 'hecho' ? (string) $yo['nombre'] : '';
    }

    // Lo demás —el texto, el responsable, la fecha, borrarlo— es tocar
    // el acta: DF o administrador, y solo mientras el día no se selle.
    $edita = array_intersect_key($c, array_flip([
        'texto', 'general', 'unidadId', 'responsableId', 'responsableNombre', 'fechaLimite', 'borrada',
    ]));
    if ($edita) {
        exigir_df();
        exigir_reunion_abierta(reunion_o_404((string) $encargo['reunion_id']));

        if (array_key_exists('texto', $edita)) {
            $texto = mb_substr(trim((string) $edita['texto']), 0, 2000);
            if ($texto === '') {
                responder_error(400, 'El encargo necesita un texto.', 'formato');
            }
            $cambios['texto'] = $texto;
        }
        if (array_key_exists('general', $edita) || array_key_exists('unidadId', $edita)) {
            $general = array_key_exists('general', $edita)
                ? (bool) $edita['general'] : (int) $encargo['general'] === 1;
            $unidad = $general ? '' : (array_key_exists('unidadId', $edita)
                ? texto($edita, 'unidadId', 80) : (string) $encargo['unidad_id']);
            if (!$general && $unidad === '') {
                responder_error(400, 'O es general o lleva vivienda.', 'formato');
            }
            $cambios['general'] = $general ? 1 : 0;
            $cambios['unidad_id'] = $unidad;
        }
        if (array_key_exists('responsableId', $edita)) {
            $cambios['responsable_id'] = es_uuid($edita['responsableId'] ?? null) ? $edita['responsableId'] : null;
        }
        if (array_key_exists('responsableNombre', $edita)) {
            $cambios['responsable_nombre'] = texto($edita, 'responsableNombre', 120);
        }
        if (array_key_exists('fechaLimite', $edita)) {
            $cambios['fecha_limite'] = fecha_de_dia($edita['fechaLimite']);
        }
        if (array_key_exists('borrada', $edita)) {
            $cambios['borrada'] = booleano($edita, 'borrada') ? 1 : 0;
        }
    }

    if (!$cambios) {
        responder_error(400, 'Nada que cambiar.', 'formato');
    }
    $cambios['actualizado'] = ahora_iso();

    $asignaciones = implode(', ', array_map(static fn ($k) => "{$k} = ?", array_keys($cambios)));
    $valores = array_values($cambios);
    $valores[] = $id;
    bd()->prepare("UPDATE encargos SET {$asignaciones} WHERE id = ?")->execute($valores);

    $sent = bd()->prepare('SELECT * FROM encargos WHERE id = ?');
    $sent->execute([$id]);
    responder(['encargo' => encargo_salida($sent->fetch())]);
}

function reunion_salida(array $f): array
{
    return [
        'id' => $f['id'], 'promoId' => $f['promo_id'], 'fecha' => $f['fecha'],
        'empezada' => $f['empezada'], 'terminada' => $f['terminada'] ?? null,
        'asistentes' => json_decode((string) $f['asistentes'], true) ?: [],
        'invitados' => json_decode((string) $f['invitados'], true) ?: [],
        'sellada' => (string) $f['fecha'] < hoy_obra(),
        // Firmada de verdad, aunque el resumen quedara vacío: sin este
        // sello, un acta sin texto parecía sin firmar y se redactaba
        // otra vez, duplicando las tareas.
        'actaFirmada' => (string) ($f['acta_firmada'] ?? '') !== '',
        'creado' => $f['creado'], 'actualizado' => $f['actualizado'],
        'creadoPor' => $f['creado_por'], 'creadoPorNombre' => $f['creado_por_nombre'],
    ];
}

function encargo_salida(array $f): array
{
    return [
        'id' => $f['id'], 'reunionId' => $f['reunion_id'], 'promoId' => $f['promo_id'],
        'texto' => $f['texto'], 'general' => (int) $f['general'] === 1,
        'unidadId' => (string) $f['unidad_id'],
        'responsableId' => $f['responsable_id'], 'responsableNombre' => (string) $f['responsable_nombre'],
        'fechaLimite' => (string) $f['fecha_limite'], 'estado' => $f['estado'],
        'hechoEn' => $f['hecho_en'] ?? null, 'hechoPorNombre' => (string) $f['hecho_por_nombre'],
        'creado' => $f['creado'], 'actualizado' => $f['actualizado'],
        'creadoPor' => $f['creado_por'], 'creadoPorNombre' => $f['creado_por_nombre'],
    ];
}

/* ═══════════════════════════════════════════════════════════════
   La grabación de las reuniones
   ═══════════════════════════════════════════════════════════════
   El audio de una reunión llega por PARTES: el móvil rota la grabadora
   cada tanto y sube cada parte como un fichero de audio completo. No
   es capricho: los trozos de un mp4 de iPhone no se pueden pegar en el
   servidor, y así cada parte cabe además en los topes del transcriptor
   (25 MB y 25 minutos por llamada).

   La transcripción va también parte a parte, una por petición: el
   móvil insiste hasta que no queda ninguna. Un hosting compartido no
   tiene trabajadores de fondo, así que el que empuja el trabajo es el
   cliente y el servidor solo da pasos cortos.

   El audio se borra solo a los 30 días (decidido por Fran): el acta y
   la transcripción se quedan; la voz de la gente, no.
*/

/** Dónde viven los ficheros de audio de las reuniones. */
function carpeta_grabaciones(): string
{
    $carpeta = carpeta_medios() . '/reuniones';
    if (!is_dir($carpeta)) {
        @mkdir($carpeta, 0755, true);
    }
    return $carpeta;
}

function extension_de_audio(string $mime): string
{
    $limpio = strtolower(trim(explode(';', $mime)[0]));
    $mapa = ['audio/webm' => 'webm', 'audio/mp4' => 'm4a', 'audio/x-m4a' => 'm4a',
             'audio/aac' => 'm4a', 'audio/ogg' => 'ogg', 'audio/mpeg' => 'mp3',
             'audio/wav' => 'wav', 'video/mp4' => 'mp4'];
    return $mapa[$limpio] ?? 'webm';
}

function ruta_de_parte(array $g, int $n): string
{
    return carpeta_grabaciones() . '/' . $g['id'] . '.parte-' . $n . '.' . extension_de_audio((string) $g['mime']);
}

function grabacion_o_404(string $id): array
{
    if (!es_uuid($id)) {
        responder_error(404, 'Grabación desconocida.');
    }
    $sent = bd()->prepare('SELECT * FROM grabaciones WHERE id = ? AND borrada = 0');
    $sent->execute([$id]);
    $fila = $sent->fetch();
    if (!$fila) {
        responder_error(404, 'Grabación desconocida.');
    }
    return $fila;
}

function partes_de(array $g): array
{
    $partes = json_decode((string) ($g['partes'] ?? '[]'), true);
    return is_array($partes) ? $partes : [];
}

function guardar_partes(string $id, array $partes, array $ademas = []): void
{
    $cambios = ['partes' => json_encode(array_values($partes), JSON_UNESCAPED_UNICODE)] + $ademas;
    $cambios['actualizado'] = ahora_iso();
    $asig = implode(', ', array_map(static fn ($k) => "{$k} = ?", array_keys($cambios)));
    $valores = array_values($cambios);
    $valores[] = $id;
    bd()->prepare("UPDATE grabaciones SET {$asig} WHERE id = ?")->execute($valores);
}

/**
 * La mesa se toca POR DIFERENCIAS, no mandando la lista entera: así
 * dos personas añadiendo asistentes a la vez no se pisan (decidido
 * por Fran, agosto de 2026). `poner`/`quitar` llevan ids del equipo;
 * `invitar`/`desinvitar`, nombres de fuera.
 */
function tocar_mesa(string $reunionId): void
{
    exigir_df();
    $reunion = reunion_o_404($reunionId);
    exigir_reunion_abierta($reunion);
    $c = cuerpo();

    $ids = static fn ($v) => lista_de_uuids(is_array($v) ? $v : []);
    $nombres = static fn ($v) => array_values(array_filter(array_map(
        static fn ($n) => mb_substr(trim((string) $n), 0, 80),
        is_array($v) ? $v : []
    ), static fn ($n) => $n !== ''));

    $bd = bd();
    $bd->beginTransaction();
    try {
        // Se relee DENTRO de la transacción: la lista sobre la que se
        // aplican las diferencias es la última de verdad, no la que
        // tuviera el móvil al abrir la hoja.
        $sent = $bd->prepare('SELECT asistentes, invitados FROM reuniones WHERE id = ?');
        $sent->execute([$reunion['id']]);
        $fila = $sent->fetch();

        $asistentes = json_decode((string) $fila['asistentes'], true) ?: [];
        $invitados = json_decode((string) $fila['invitados'], true) ?: [];

        $asistentes = array_values(array_unique(array_merge($asistentes, $ids($c['poner'] ?? []))));
        $fuera = $ids($c['quitar'] ?? []);
        $asistentes = array_values(array_filter($asistentes, static fn ($id) => !in_array($id, $fuera, true)));

        $invitados = array_values(array_unique(array_merge($invitados, $nombres($c['invitar'] ?? []))));
        $seVan = $nombres($c['desinvitar'] ?? []);
        $invitados = array_values(array_filter($invitados, static fn ($n) => !in_array($n, $seVan, true)));

        $bd->prepare('UPDATE reuniones SET asistentes = ?, invitados = ?, actualizado = ? WHERE id = ?')
            ->execute([json_encode($asistentes), json_encode($invitados, JSON_UNESCAPED_UNICODE),
                ahora_iso(), $reunion['id']]);
        $bd->commit();
    } catch (Throwable $e) {
        $bd->rollBack();
        throw $e;
    }

    $sent = bd()->prepare('SELECT * FROM reuniones WHERE id = ?');
    $sent->execute([$reunion['id']]);
    responder(['reunion' => reunion_salida($sent->fetch())]);
}

function empezar_grabacion(string $reunionId): void
{
    $yo = exigir_df();
    $reunion = reunion_o_404($reunionId);
    exigir_reunion_abierta($reunion);

    // Una sola grabación en marcha por reunión (decidido por Fran):
    // dos micros a la vez meterían la misma conversación dos veces en
    // el acta. Solo bloquea la de OTRA persona y con señales de vida
    // recientes; un resto propio (la app se murió grabando) o una
    // ajena muda media hora se recogen solos y dejan pasar.
    $sent = bd()->prepare("SELECT * FROM grabaciones WHERE reunion_id = ? AND estado = 'grabando' AND borrada = 0");
    $sent->execute([$reunionId]);
    foreach ($sent->fetchAll() as $viva) {
        $deOtro = (string) $viva['creado_por'] !== (string) $yo['id'];
        $conSenales = (string) $viva['actualizado'] >= gmdate('Y-m-d\TH:i:s', time() - 1800);
        if ($deOtro && $conSenales) {
            responder_error(409,
                (($viva['creado_por_nombre'] ?: 'Alguien') . ' ya está grabando esta reunión.'),
                'grabando-otra');
        }
        $conBytes = array_filter(partes_de($viva), static fn ($p) => (int) ($p['tam'] ?? 0) > 0);
        bd()->prepare('UPDATE grabaciones SET estado = ?, borrada = ?, actualizado = ? WHERE id = ?')
            ->execute([$conBytes ? 'lista' : 'grabando', $conBytes ? 0 : 1, ahora_iso(), $viva['id']]);
    }

    $mime = texto(cuerpo(), 'mime', 60, 'audio/webm');
    $registro = [
        'id'                => uuid(),
        'reunion_id'        => $reunion['id'],
        'promo_id'          => $reunion['promo_id'],
        'estado'            => 'grabando',
        'mime'              => $mime,
        'duracion'          => 0,
        'tam'               => 0,
        'partes'            => '[]',
        'hablantes'         => null,
        'audio_borrado'     => 0,
        'borrada'           => 0,
        'creado'            => ahora_iso(),
        'actualizado'       => ahora_iso(),
        'creado_por'        => $yo['id'],
        'creado_por_nombre' => (string) $yo['nombre'],
    ];
    $columnas = array_keys($registro);
    bd()->prepare(sprintf(
        'INSERT INTO grabaciones (%s) VALUES (%s)',
        implode(', ', $columnas),
        implode(', ', array_fill(0, count($columnas), '?'))
    ))->execute(array_values($registro));

    responder(['grabacion' => grabacion_salida($registro)], 201);
}

/**
 * Una parte de audio, en crudo en el cuerpo de la petición. `n` es su
 * número de orden y `dur` sus segundos, que el móvil sí conoce.
 * Subir la misma parte dos veces la sobreescribe: el reintento de una
 * subida cortada no duplica nada.
 */
function subir_parte_grabacion(string $id): void
{
    exigir_df();
    $g = grabacion_o_404($id);
    if ($g['estado'] !== 'grabando') {
        responder_error(409, 'Esta grabación ya está cerrada.', 'cerrada');
    }

    $n = max(0, (int) ($_GET['n'] ?? 0));
    $dur = max(0, (int) ($_GET['dur'] ?? 0));

    $cuerpo = file_get_contents('php://input');
    if ($cuerpo === false || $cuerpo === '') {
        responder_error(400, 'La parte ha llegado vacía.', 'formato');
    }
    if (strlen($cuerpo) > GRABACION_TOPE_PARTE) {
        responder_error(413, 'La parte pesa más de lo que admite el transcriptor.', 'demasiado-grande');
    }

    $ruta = ruta_de_parte($g, $n);
    if (file_put_contents($ruta, $cuerpo, LOCK_EX) === false) {
        responder_error(500, 'No se ha podido guardar el audio en el servidor.', 'disco');
    }

    $partes = partes_de($g);
    $partes = array_values(array_filter($partes, static fn ($p) => (int) $p['n'] !== $n));
    $partes[] = ['n' => $n, 'tam' => strlen($cuerpo), 'duracion' => $dur, 'estado' => 'sin-transcribir', 'texto' => ''];
    usort($partes, static fn ($a, $b) => $a['n'] <=> $b['n']);

    $tam = 0;
    $duracion = 0;
    foreach ($partes as $p) {
        $tam += (int) $p['tam'];
        $duracion += (int) $p['duracion'];
    }
    guardar_partes($id, $partes, ['tam' => $tam, 'duracion' => $duracion]);

    responder(['ok' => true, 'partes' => count($partes)]);
}

function cerrar_grabacion(string $id): void
{
    exigir_df();
    $g = grabacion_o_404($id);
    if ($g['estado'] === 'grabando') {
        // Sin un byte de audio no hay grabación que valga: es el botón
        // pulsado sin querer. Se retira en vez de dejar una fila que
        // nadie puede transcribir.
        if (!partes_de($g)) {
            bd()->prepare('UPDATE grabaciones SET borrada = 1, actualizado = ? WHERE id = ?')
                ->execute([ahora_iso(), $id]);
            responder(['grabacion' => null, 'vacia' => true]);
        }
        $duracion = max((int) $g['duracion'], entero(cuerpo(), 'duracion'));
        bd()->prepare("UPDATE grabaciones SET estado = 'lista', duracion = ?, actualizado = ? WHERE id = ?")
            ->execute([$duracion, ahora_iso(), $id]);
        $g = grabacion_o_404($id);
    }
    responder(['grabacion' => grabacion_salida($g)]);
}

/**
 * Transcribe UNA parte pendiente por llamada y cuenta cuántas quedan:
 * el móvil repite la petición hasta que la respuesta diga cero. Así
 * ninguna petición se acerca al corte del hosting aunque la reunión
 * durase dos horas.
 */
function transcribir_grabacion(string $id): void
{
    exigir_df();
    $g = grabacion_o_404($id);
    if ($g['estado'] === 'grabando') {
        responder_error(409, 'La grabación sigue abierta: ciérrala antes de transcribir.', 'sin-cerrar');
    }
    if ((int) $g['audio_borrado'] === 1) {
        responder_error(410, 'El audio de esta grabación ya se borró (a los 30 días se van solos).', 'audio-borrado');
    }

    $partes = partes_de($g);
    $pendientes = array_values(array_filter($partes, static fn ($p) => ($p['estado'] ?? '') !== 'transcrita'));
    if (!$pendientes) {
        // Aquí se marca también, y no solo al transcribir la última
        // parte: una grabación sin nada dentro —el botón mal pulsado—
        // se quedaba en «lista» para siempre y el arranque automático
        // del móvil la recogía en cada repintado. Un bucle con
        // factura, porque cada vuelta terminaba llamando a Claude.
        if ($g['estado'] !== 'transcrita') {
            bd()->prepare("UPDATE grabaciones SET estado = 'transcrita', actualizado = ? WHERE id = ?")
                ->execute([ahora_iso(), $id]);
            $g = grabacion_o_404($id);
        }
        responder(['grabacion' => grabacion_salida($g), 'quedan' => 0]);
    }

    $parte = $pendientes[0];
    $ruta = ruta_de_parte($g, (int) $parte['n']);
    if (!is_file($ruta)) {
        responder_error(500, 'Falta el fichero de la parte ' . $parte['n'] . ' en el servidor.', 'sin-fichero');
    }

    // El oído de reuniones: transcribe Y separa voces (A, B, C…). Si el
    // modelo diarizado no entrara, cae solo al plano y la parte queda
    // transcrita sin voces, que siempre es mejor que un error.
    $resultado = oido_transcribir_reunion($ruta, (string) $g['mime']);

    foreach ($partes as &$p) {
        if ((int) $p['n'] === (int) $parte['n']) {
            $p['estado'] = 'transcrita';
            $p['texto'] = $resultado['texto'];
            $p['dicho'] = $resultado['dicho'];
        }
    }
    unset($p);

    $quedan = count(array_filter($partes, static fn ($p) => $p['estado'] !== 'transcrita'));
    guardar_partes($id, $partes, $quedan === 0 ? ['estado' => 'transcrita'] : []);

    responder(['grabacion' => grabacion_salida(grabacion_o_404($id)), 'quedan' => $quedan]);
}

/** El audio de una parte, con Range: sin él iOS ni empieza a sonar. */
function servir_audio_grabacion(string $id): void
{
    exigir_sesion();
    $g = grabacion_o_404($id);
    if ((int) $g['audio_borrado'] === 1) {
        responder_error(410, 'El audio de esta grabación ya se borró.', 'audio-borrado');
    }
    $n = max(0, (int) ($_GET['parte'] ?? 0));
    $ruta = ruta_de_parte($g, $n);
    $real = realpath($ruta);
    if ($real === false || strpos($real, carpeta_grabaciones()) !== 0 || !is_file($real)) {
        responder_error(404, 'Esa parte no está en el servidor.');
    }

    $tam = filesize($real);
    header('Content-Type: ' . ((string) $g['mime'] ?: 'application/octet-stream'));
    header('Content-Disposition: inline; filename="reunion-' . $n . '.' . extension_de_audio((string) $g['mime']) . '"');
    header('Accept-Ranges: bytes');
    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');

    $inicio = 0;
    $fin = $tam - 1;
    $rango = $_SERVER['HTTP_RANGE'] ?? '';
    if ($rango !== '' && preg_match('/bytes=(\d*)-(\d*)/', $rango, $m2)) {
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
    $f = fopen($real, 'rb');
    if ($f === false) {
        responder_error(500, 'No se pudo leer el audio.');
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

/**
 * La IA redacta la propuesta de acta: resumen y tareas con responsable
 * y fecha cuando se dijeron. Se guarda como PROPUESTA en la reunión:
 * no crea nada hasta que la DF o el administrador la revisan y firman.
 *
 * El móvil manda su catálogo de viviendas (vive en el cliente) para
 * que una tarea de «la 14» pueda engancharse a la Villa 14 de verdad.
 */
function redactar_acta(string $reunionId): void
{
    exigir_df();
    $reunion = reunion_o_404($reunionId);
    exigir_acta_entregable($reunion);

    // Todo lo transcrito de esta reunión, en orden y CON NOMBRE cuando
    // se sabe: primero el que puso la identificación automática en cada
    // frase, luego el mapa manual de «¿quién es quién?», y si no, el
    // hablante anónimo. Un guion con nombres cambia el acta: «Alba:
    // pide el vidrio» ya dice quién se comprometió.
    $sentVoces = bd()->prepare('SELECT id, persona_nombre FROM voces WHERE promo_id = ? AND borrada = 0');
    $sentVoces->execute([$reunion['promo_id']]);
    $nombreDeVoz = $sentVoces->fetchAll(PDO::FETCH_KEY_PAIR);

    $sent = bd()->prepare("SELECT * FROM grabaciones WHERE reunion_id = ? AND borrada = 0 AND estado = 'transcrita' ORDER BY creado ASC");
    $sent->execute([$reunionId]);
    $texto = '';
    foreach ($sent->fetchAll() as $g) {
        $hablantes = json_decode((string) ($g['hablantes'] ?? ''), true) ?: [];
        $mapa = (array) ($hablantes['mapa'] ?? []);
        foreach (partes_de($g) as $p) {
            $dicho = (array) ($p['dicho'] ?? []);
            if (!$dicho) {
                $trozo = trim((string) ($p['texto'] ?? ''));
                if ($trozo !== '') {
                    $texto .= ($texto === '' ? '' : "\n\n") . $trozo;
                }
                continue;
            }
            $anterior = '';
            foreach ($dicho as $seg) {
                $quien = '';
                if (!empty($seg['quien']) && isset($nombreDeVoz[$seg['quien']])) {
                    $quien = (string) $nombreDeVoz[$seg['quien']];
                } elseif (!empty($mapa[$p['n'] . ':' . $seg['h']]['nombre'])) {
                    $quien = (string) $mapa[$p['n'] . ':' . $seg['h']]['nombre'];
                } else {
                    $quien = 'Hablante ' . $seg['h'];
                }
                if ($quien === $anterior) {
                    $texto .= ' ' . $seg['texto'];
                } else {
                    $texto .= ($texto === '' ? '' : "\n") . $quien . ': ' . $seg['texto'];
                    $anterior = $quien;
                }
            }
        }
    }
    if (trim($texto) === '') {
        responder_error(409, 'No hay ninguna transcripción de esta reunión todavía.', 'sin-transcripcion');
    }

    // Quién estaba en la mesa, con nombre.
    $gente = [];
    $asistentes = json_decode((string) $reunion['asistentes'], true) ?: [];
    if ($asistentes) {
        $huecos = implode(',', array_fill(0, count($asistentes), '?'));
        $sent = bd()->prepare("SELECT nombre FROM usuarios WHERE id IN ({$huecos})");
        $sent->execute($asistentes);
        $gente = $sent->fetchAll(PDO::FETCH_COLUMN);
    }
    foreach (json_decode((string) $reunion['invitados'], true) ?: [] as $inv) {
        $gente[] = $inv . ' (invitado)';
    }

    // El equipo entero, para atribuir responsables por nombre.
    $equipo = [];
    foreach (bd()->query('SELECT id, nombre, empresa FROM usuarios WHERE activo = 1 ORDER BY nombre')->fetchAll() as $u) {
        $equipo[] = ['id' => $u['id'], 'nombre' => $u['nombre'], 'empresa' => (string) ($u['empresa'] ?? '')];
    }

    // El catálogo de viviendas llega del móvil, saneado.
    $unidades = [];
    foreach ((array) (cuerpo()['unidades'] ?? []) as $u) {
        if (is_array($u) && isset($u['id'], $u['nombre'])) {
            $unidades[] = ['id' => mb_substr((string) $u['id'], 0, 80), 'nombre' => mb_substr((string) $u['nombre'], 0, 60)];
        }
    }

    $acta = claude_redactar_acta((string) $reunion['fecha'], $gente, $texto, $equipo, $unidades);

    // Los nombres del modelo se anclan a ids reales aquí, no en el
    // móvil: el nombre puede venir a medias («Alba») y aquí está la
    // lista entera para casarlo sin ambigüedad.
    $tareas = [];
    foreach ($acta['tareas'] as $t) {
        if (!is_array($t) || trim((string) ($t['texto'] ?? '')) === '') {
            continue;
        }
        $unidadId = '';
        foreach ($unidades as $u) {
            if (llano($u['nombre']) === llano((string) ($t['unidadNombre'] ?? '')) && $u['nombre'] !== '') {
                $unidadId = $u['id'];
                break;
            }
        }
        $responsableId = null;
        $responsableNombre = trim((string) ($t['responsableNombre'] ?? ''));
        foreach ($equipo as $p) {
            $suyo = llano($p['nombre']);
            $dicho = llano($responsableNombre);
            if ($dicho !== '' && ($suyo === $dicho || strpos($suyo, $dicho) === 0)) {
                $responsableId = $p['id'];
                $responsableNombre = $p['nombre'];
                break;
            }
        }
        $tareas[] = [
            'texto'             => mb_substr(trim((string) $t['texto']), 0, 2000),
            'general'           => $unidadId === '',
            'unidadId'          => $unidadId,
            'responsableId'     => $responsableId,
            'responsableNombre' => mb_substr($responsableNombre, 0, 120),
            'fechaLimite'       => fecha_de_dia($t['fechaLimite'] ?? ''),
            'seguro'            => (bool) ($t['seguro'] ?? false),
        ];
    }

    $propuesta = [
        'resumen'  => mb_substr($acta['resumen'], 0, 8000),
        'tareas'   => $tareas,
        'redactada' => ahora_iso(),
    ];
    bd()->prepare('UPDATE reuniones SET propuesta = ?, actualizado = ? WHERE id = ?')
        ->execute([json_encode($propuesta, JSON_UNESCAPED_UNICODE), ahora_iso(), $reunionId]);

    responder(['propuesta' => $propuesta, 'gasto' => $acta['gasto']]);
}

/**
 * La firma del acta: la DF revisa la propuesta —quita, corrige,
 * asigna— y lo que llega aquí se convierte en tareas de verdad y en el
 * resumen guardado. La propuesta se retira: ya cumplió.
 */
function aceptar_acta(string $reunionId): void
{
    $yo = exigir_df();
    $reunion = reunion_o_404($reunionId);
    exigir_acta_entregable($reunion);
    $c = cuerpo();

    $resumen = mb_substr(trim((string) ($c['resumen'] ?? '')), 0, 8000);
    $entrada = is_array($c['tareas'] ?? null) ? $c['tareas'] : [];

    $creadas = [];
    foreach ($entrada as $t) {
        if (!is_array($t)) {
            continue;
        }
        $texto = mb_substr(trim((string) ($t['texto'] ?? '')), 0, 2000);
        if ($texto === '') {
            continue;
        }
        $general = booleano($t, 'general', true);
        $unidad = $general ? '' : texto($t, 'unidadId', 80);
        if (!$general && $unidad === '') {
            $general = true;
        }
        $registro = [
            'id'                 => uuid(),
            'reunion_id'         => $reunion['id'],
            'promo_id'           => $reunion['promo_id'],
            'texto'              => $texto,
            'general'            => $general ? 1 : 0,
            'unidad_id'          => $unidad,
            'responsable_id'     => es_uuid($t['responsableId'] ?? null) ? $t['responsableId'] : null,
            'responsable_nombre' => texto($t, 'responsableNombre', 120),
            'fecha_limite'       => fecha_de_dia($t['fechaLimite'] ?? ''),
            'estado'             => 'pendiente',
            'hecho_en'           => null,
            'hecho_por_nombre'   => '',
            'borrada'            => 0,
            'creado'             => ahora_iso(),
            'actualizado'        => ahora_iso(),
            'creado_por'         => $yo['id'],
            'creado_por_nombre'  => (string) $yo['nombre'],
        ];
        $columnas = array_keys($registro);
        bd()->prepare(sprintf(
            'INSERT INTO encargos (%s) VALUES (%s)',
            implode(', ', $columnas),
            implode(', ', array_fill(0, count($columnas), '?'))
        ))->execute(array_values($registro));
        $creadas[] = encargo_salida($registro);
    }

    bd()->prepare('UPDATE reuniones SET resumen = ?, propuesta = NULL, acta_firmada = ?, actualizado = ? WHERE id = ?')
        ->execute([$resumen !== '' ? $resumen : null, ahora_iso(), ahora_iso(), $reunionId]);

    responder(['encargos' => $creadas, 'resumen' => $resumen]);
}

/**
 * Borra los ficheros de audio con más de 30 días. La transcripción y
 * el acta se quedan; la voz de la gente, no. Se dispara al listar las
 * reuniones —que se abre a diario—, porque este hosting no tiene cron.
 */
function grabaciones_purgar(): void
{
    $limite = gmdate('Y-m-d\TH:i:s', time() - GRABACION_DIAS_AUDIO * 86400) . '.000Z';
    $sent = bd()->prepare('SELECT * FROM grabaciones WHERE audio_borrado = 0 AND creado < ? LIMIT 10');
    $sent->execute([$limite]);
    foreach ($sent->fetchAll() as $g) {
        foreach (partes_de($g) as $p) {
            @unlink(ruta_de_parte($g, (int) $p['n']));
        }
        bd()->prepare('UPDATE grabaciones SET audio_borrado = 1, actualizado = ? WHERE id = ?')
            ->execute([ahora_iso(), $g['id']]);
    }
}

/* ═══════════════════════════════════════════════════════════════
   Quién es quién: el registro de voces y su aprendizaje
   ═══════════════════════════════════════════════════════════════
   El mapa manual («0:A es Alba») se guarda en la grabación y sirve tal
   cual para el acta. Cuando además hay clave de pyannote, cada nombre
   asignado se enrola como huella y las reuniones siguientes salen ya
   con nombre: la app aprende las voces. Sin clave, todo funciona
   igual, solo que preguntando cada día — un minuto de trabajo.
*/

function voz_salida(array $v): array
{
    return [
        'id' => $v['id'], 'promoId' => $v['promo_id'],
        'personaId' => $v['persona_id'], 'personaNombre' => (string) $v['persona_nombre'],
        // La huella JAMÁS sale del servidor: al móvil solo va si la hay.
        'conHuella' => trim((string) ($v['huella'] ?? '')) !== '',
        'enrolando' => trim((string) ($v['huella_trabajo'] ?? '')) !== '',
        'muestra' => [
            'grabacionId' => $v['muestra_grabacion_id'],
            'parte' => (int) $v['muestra_parte'],
            'desde' => (float) $v['muestra_desde'],
            'hasta' => (float) $v['muestra_hasta'],
        ],
        'creado' => $v['creado'], 'actualizado' => $v['actualizado'],
    ];
}

/**
 * El registro de voces de la promoción. De paso recoge los
 * enrolamientos que pyannote haya terminado: sus salidas se borran a
 * las 24 horas, así que cada visita a esta pantalla es una ocasión de
 * guardar la huella antes de que se evapore.
 */
function listar_voces(): void
{
    exigir_sesion();
    $promo = promo_pedida();

    if (voces_clave() !== '') {
        $sent = bd()->prepare("SELECT * FROM voces WHERE promo_id = ? AND borrada = 0 AND huella_trabajo != ''");
        $sent->execute([$promo]);
        foreach ($sent->fetchAll() as $v) {
            $t = voces_mirar_trabajo((string) $v['huella_trabajo']);
            if ($t['estado'] === 'hecho') {
                $huella = (string) ($t['salida']['voiceprint'] ?? '');
                bd()->prepare("UPDATE voces SET huella = ?, huella_trabajo = '', actualizado = ? WHERE id = ?")
                    ->execute([$huella !== '' ? $huella : null, ahora_iso(), $v['id']]);
            } elseif ($t['estado'] === 'fallado') {
                bd()->prepare("UPDATE voces SET huella_trabajo = '', actualizado = ? WHERE id = ?")
                    ->execute([ahora_iso(), $v['id']]);
            }
        }
    }

    $sent = bd()->prepare('SELECT * FROM voces WHERE promo_id = ? AND borrada = 0 ORDER BY persona_nombre');
    $sent->execute([$promo]);
    responder([
        'voces' => array_map('voz_salida', $sent->fetchAll()),
        'servicio' => ['hay' => voces_clave() !== ''],
    ]);
}

/**
 * Da de alta —o reapunta— la voz de alguien: a quién pertenece y en
 * qué tramo de qué grabación se le oye claro (la muestra que se
 * escucha al asignar, y de la que saldrá el clip de enrolamiento).
 */
function crear_voz(): void
{
    exigir_df();
    $c = cuerpo();
    $promo = texto($c, 'promoId', 60);
    $personaId = es_uuid($c['personaId'] ?? null) ? $c['personaId'] : null;
    $personaNombre = texto($c, 'personaNombre', 120);
    if ($promo === '' || ($personaId === null && $personaNombre === '')) {
        responder_error(400, 'La voz necesita promoción y dueño.', 'formato');
    }
    if ($personaId !== null) {
        $sent = bd()->prepare('SELECT nombre FROM usuarios WHERE id = ?');
        $sent->execute([$personaId]);
        $nombre = $sent->fetchColumn();
        if ($nombre !== false) {
            $personaNombre = (string) $nombre;
        }
    }

    // Una voz por dueño y promoción: reasignar actualiza la muestra y
    // deja la huella pendiente de re-enrolar con el clip nuevo.
    $sent = $personaId !== null
        ? bd()->prepare('SELECT * FROM voces WHERE promo_id = ? AND persona_id = ? AND borrada = 0')
        : bd()->prepare('SELECT * FROM voces WHERE promo_id = ? AND persona_id IS NULL AND persona_nombre = ? AND borrada = 0');
    $sent->execute([$promo, $personaId ?? $personaNombre]);
    $hay = $sent->fetch();

    $muestra = [
        'muestra_grabacion_id' => es_uuid($c['muestraGrabacionId'] ?? null) ? $c['muestraGrabacionId'] : null,
        'muestra_parte' => max(0, (int) ($c['muestraParte'] ?? 0)),
        'muestra_desde' => max(0.0, (float) ($c['muestraDesde'] ?? 0)),
        'muestra_hasta' => max(0.0, (float) ($c['muestraHasta'] ?? 0)),
    ];

    if ($hay) {
        $cambios = $muestra + ['persona_nombre' => $personaNombre, 'actualizado' => ahora_iso()];
        $asig = implode(', ', array_map(static fn ($k) => "{$k} = ?", array_keys($cambios)));
        $valores = array_values($cambios);
        $valores[] = $hay['id'];
        bd()->prepare("UPDATE voces SET {$asig} WHERE id = ?")->execute($valores);
        responder(['voz' => voz_salida(array_merge($hay, $cambios))]);
    }

    $registro = [
        'id' => uuid(),
        'promo_id' => $promo,
        'persona_id' => $personaId,
        'persona_nombre' => $personaNombre,
        'huella' => null,
        'huella_trabajo' => '',
        'borrada' => 0,
        'creado' => ahora_iso(),
        'actualizado' => ahora_iso(),
    ] + $muestra;
    $columnas = array_keys($registro);
    bd()->prepare(sprintf(
        'INSERT INTO voces (%s) VALUES (%s)',
        implode(', ', $columnas),
        implode(', ', array_fill(0, count($columnas), '?'))
    ))->execute(array_values($registro));
    responder(['voz' => voz_salida($registro)], 201);
}

/** Dónde viven los clips de enrolamiento. */
function carpeta_voces(): string
{
    $carpeta = carpeta_medios() . '/voces';
    if (!is_dir($carpeta)) {
        @mkdir($carpeta, 0755, true);
    }
    return $carpeta;
}

/**
 * El clip de la voz (un WAV corto recortado en el móvil, donde esa
 * persona habla sola). Se guarda SIEMPRE —las huellas no son portables
 * y con el clip se puede re-enrolar donde haga falta— y, si hay clave
 * de pyannote, se encarga la huella en el momento.
 */
function subir_muestra_voz(string $id): void
{
    exigir_df();
    if (!es_uuid($id)) {
        responder_error(404, 'Voz desconocida.');
    }
    $sent = bd()->prepare('SELECT * FROM voces WHERE id = ? AND borrada = 0');
    $sent->execute([$id]);
    $voz = $sent->fetch();
    if (!$voz) {
        responder_error(404, 'Voz desconocida.');
    }

    $clip = file_get_contents('php://input');
    if ($clip === false || strlen($clip) < 1000) {
        responder_error(400, 'El clip ha llegado vacío.', 'formato');
    }
    if (strlen($clip) > 10 * 1024 * 1024) {
        responder_error(413, 'El clip es demasiado grande.', 'demasiado-grande');
    }
    $ruta = carpeta_voces() . '/' . $id . '.wav';
    if (file_put_contents($ruta, $clip, LOCK_EX) === false) {
        responder_error(500, 'No se ha podido guardar el clip.', 'disco');
    }

    $enrolando = false;
    if (voces_clave() !== '') {
        $media = voces_subir_media($ruta);
        $trabajo = voces_encargar_huella($media);
        bd()->prepare('UPDATE voces SET huella = NULL, huella_trabajo = ?, actualizado = ? WHERE id = ?')
            ->execute([$trabajo, ahora_iso(), $id]);
        $enrolando = true;
    } else {
        bd()->prepare('UPDATE voces SET actualizado = ? WHERE id = ?')->execute([ahora_iso(), $id]);
    }

    responder(['ok' => true, 'enrolando' => $enrolando]);
}

/** El mapa manual: «en esta grabación, la voz 0:A es Alba». */
function guardar_hablantes(string $grabacionId): void
{
    exigir_df();
    $g = grabacion_o_404($grabacionId);

    $mapa = [];
    foreach ((array) (cuerpo()['mapa'] ?? []) as $etiqueta => $quien) {
        if (!is_array($quien) || !preg_match('/^\d+:[A-Za-z0-9_-]{1,12}$/', (string) $etiqueta)) {
            continue;
        }
        $mapa[(string) $etiqueta] = [
            'vozId' => es_uuid($quien['vozId'] ?? null) ? $quien['vozId'] : null,
            'personaId' => es_uuid($quien['personaId'] ?? null) ? $quien['personaId'] : null,
            'nombre' => mb_substr(trim((string) ($quien['nombre'] ?? '')), 0, 120),
            'auto' => (bool) ($quien['auto'] ?? false),
        ];
    }

    $hablantes = json_decode((string) ($g['hablantes'] ?? ''), true) ?: [];
    $hablantes['mapa'] = $mapa;
    bd()->prepare('UPDATE grabaciones SET hablantes = ?, actualizado = ? WHERE id = ?')
        ->execute([json_encode($hablantes, JSON_UNESCAPED_UNICODE), ahora_iso(), $grabacionId]);

    responder(['grabacion' => grabacion_salida(grabacion_o_404($grabacionId))]);
}

/**
 * La identificación automática: el audio contra las huellas de la
 * obra, parte a parte y por pasos cortos —encargar, esperar, casar—,
 * empujada por el móvil igual que la transcripción. Cada llamada da un
 * paso y cuenta lo que queda.
 */
function identificar_grabacion(string $id): void
{
    exigir_df();
    $g = grabacion_o_404($id);

    if (voces_clave() === '') {
        responder(['disponible' => false, 'motivo' => 'sin-clave']);
    }
    $sent = bd()->prepare("SELECT * FROM voces WHERE promo_id = ? AND borrada = 0 AND huella IS NOT NULL AND huella != ''");
    $sent->execute([$g['promo_id']]);
    $huellas = [];
    $nombres = [];
    foreach ($sent->fetchAll() as $v) {
        $huellas[$v['id']] = (string) $v['huella'];
        $nombres[$v['id']] = ['vozId' => $v['id'], 'personaId' => $v['persona_id'], 'nombre' => (string) $v['persona_nombre']];
    }
    if (!$huellas) {
        responder(['disponible' => false, 'motivo' => 'sin-huellas']);
    }
    if ((int) $g['audio_borrado'] === 1) {
        responder_error(410, 'El audio ya se borró: no se puede identificar.', 'audio-borrado');
    }

    $hablantes = json_decode((string) ($g['hablantes'] ?? ''), true) ?: [];
    $auto = $hablantes['_auto'] ?? null;
    $partes = partes_de($g);

    // La siguiente parte transcrita y aún sin voces.
    $pendiente = null;
    foreach ($partes as $p) {
        if (($p['estado'] ?? '') === 'transcrita' && !in_array($p['voces'] ?? '', ['hecha', 'fallada'], true)) {
            $pendiente = $p;
            break;
        }
    }

    if ($pendiente === null) {
        consolidar_hablantes($id, $partes, $hablantes, $nombres);
        responder(['disponible' => true, 'quedan' => 0, 'grabacion' => grabacion_salida(grabacion_o_404($id))]);
    }

    $n = (int) $pendiente['n'];

    // Paso 1: encargar la identificación de esta parte.
    if (!is_array($auto) || (int) ($auto['parte'] ?? -1) !== $n) {
        $ruta = ruta_de_parte($g, $n);
        if (!is_file($ruta)) {
            responder_error(500, 'Falta el fichero de la parte ' . $n . '.', 'sin-fichero');
        }
        $media = voces_subir_media($ruta);
        $trabajo = voces_encargar_identificacion($media, $huellas);
        $hablantes['_auto'] = ['parte' => $n, 'trabajo' => $trabajo];
        bd()->prepare('UPDATE grabaciones SET hablantes = ?, actualizado = ? WHERE id = ?')
            ->execute([json_encode($hablantes, JSON_UNESCAPED_UNICODE), ahora_iso(), $id]);
        responder(['disponible' => true, 'quedan' => 1 + contar_partes_sin_voces($partes, $n), 'paso' => 'encargada']);
    }

    // Paso 2: mirar cómo va y, si terminó, casar por solape de tiempos.
    $t = voces_mirar_trabajo((string) $auto['trabajo']);
    if ($t['estado'] === 'en-cola') {
        responder(['disponible' => true, 'quedan' => 1 + contar_partes_sin_voces($partes, $n), 'paso' => 'en-cola']);
    }

    foreach ($partes as &$p) {
        if ((int) $p['n'] !== $n) {
            continue;
        }
        if ($t['estado'] === 'fallado') {
            $p['voces'] = 'fallada';
            break;
        }
        $segmentos = (array) ($t['salida']['identification'] ?? $t['salida']['diarization'] ?? []);
        foreach ((array) ($p['dicho'] ?? []) as $i => $seg) {
            $mejor = null;
            $mejorSolape = 0.0;
            foreach ($segmentos as $s) {
                $ini = (float) ($s['start'] ?? 0);
                $fin = (float) ($s['end'] ?? 0);
                $solape = min((float) $seg['fin'], $fin) - max((float) $seg['ini'], $ini);
                if ($solape > $mejorSolape) {
                    $mejorSolape = $solape;
                    $mejor = (string) ($s['speaker'] ?? '');
                }
            }
            if ($mejor !== null && isset($huellas[$mejor])) {
                $p['dicho'][$i]['quien'] = $mejor;
            }
        }
        $p['voces'] = 'hecha';
    }
    unset($p);

    unset($hablantes['_auto']);
    guardar_partes($id, $partes, ['hablantes' => json_encode($hablantes, JSON_UNESCAPED_UNICODE)]);

    // Si esta era la última parte, el mapa se cierra AQUÍ. Antes se
    // dejaba para la llamada siguiente… que el móvil ya no hacía, al
    // ver que no quedaba nada: los nombres reconocidos no llegaban a
    // guardarse nunca.
    $quedan = contar_partes_sin_voces($partes, -1);
    if ($quedan === 0) {
        consolidar_hablantes($id, $partes, $hablantes, $nombres);
    }
    responder(['disponible' => true, 'quedan' => $quedan, 'paso' => 'casada']);
}

/**
 * El mapa «esta voz es esta persona» de toda la grabación, por mayoría
 * de segmentos. No pisa lo que se haya puesto a mano: quien asignó una
 * voz con su nombre manda sobre lo que dedujo la máquina.
 */
function consolidar_hablantes(string $id, array $partes, array $hablantes, array $nombres): void
{
    $mapa = $hablantes['mapa'] ?? [];
    foreach ($partes as $p) {
        $votos = [];
        foreach ((array) ($p['dicho'] ?? []) as $seg) {
            if (!empty($seg['quien'])) {
                $votos[$seg['h']][$seg['quien']] = ($votos[$seg['h']][$seg['quien']] ?? 0) + 1;
            }
        }
        foreach ($votos as $h => $cuenta) {
            arsort($cuenta);
            $vozId = (string) array_key_first($cuenta);
            $etiqueta = $p['n'] . ':' . $h;
            if (isset($nombres[$vozId]) && empty($mapa[$etiqueta]['nombre'])) {
                $mapa[$etiqueta] = $nombres[$vozId] + ['auto' => true];
            }
        }
    }
    $hablantes['mapa'] = $mapa;
    unset($hablantes['_auto']);
    bd()->prepare('UPDATE grabaciones SET hablantes = ?, actualizado = ? WHERE id = ?')
        ->execute([json_encode($hablantes, JSON_UNESCAPED_UNICODE), ahora_iso(), $id]);
}

function contar_partes_sin_voces(array $partes, int $menos): int
{
    $n = 0;
    foreach ($partes as $p) {
        if (($p['estado'] ?? '') === 'transcrita' && (int) $p['n'] !== $menos
            && !in_array($p['voces'] ?? '', ['hecha', 'fallada'], true)) {
            $n++;
        }
    }
    return $n;
}

/* Estado y clave del servicio de voces, calcados de los de Claude. */
function voces_estado(): void
{
    exigir_admin();
    $clave = voces_clave();
    responder(['puesta' => $clave !== '', 'final' => $clave !== '' ? substr($clave, -4) : '', 'modelo' => VOCES_MODELO]);
}

function voces_poner_clave(): void
{
    exigir_admin();
    $clave = trim((string) (cuerpo()['clave'] ?? ''));
    if (strlen($clave) < 12) {
        responder_error(400, 'Esa clave no parece una clave de pyannote.', 'formato');
    }
    voces_guardar_clave($clave);
    responder(['puesta' => true, 'final' => substr($clave, -4)]);
}

function voces_quitar_clave(): void
{
    exigir_admin();
    voces_borrar_clave();
    responder(['puesta' => false, 'final' => '']);
}

function grabacion_salida(array $g): array
{
    $partes = array_map(static fn ($p) => [
        'n' => (int) $p['n'],
        'tam' => (int) $p['tam'],
        'duracion' => (int) $p['duracion'],
        'estado' => (string) ($p['estado'] ?? 'sin-transcribir'),
        'texto' => (string) ($p['texto'] ?? ''),
        'dicho' => is_array($p['dicho'] ?? null) ? $p['dicho'] : [],
    ], partes_de($g));

    $hablantes = json_decode((string) ($g['hablantes'] ?? ''), true);

    return [
        'id' => $g['id'], 'reunionId' => $g['reunion_id'], 'promoId' => $g['promo_id'],
        'estado' => $g['estado'], 'mime' => (string) $g['mime'],
        'duracion' => (int) $g['duracion'], 'tam' => (int) $g['tam'],
        'partes' => $partes,
        'hablantes' => is_array($hablantes) ? $hablantes : [],
        'audioBorrado' => (int) ($g['audio_borrado'] ?? 0) === 1,
        'creado' => $g['creado'], 'actualizado' => $g['actualizado'],
        'creadoPor' => $g['creado_por'], 'creadoPorNombre' => $g['creado_por_nombre'],
    ];
}
