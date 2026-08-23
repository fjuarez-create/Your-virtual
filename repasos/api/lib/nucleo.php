<?php
/**
 * nucleo.php — configuración, conexión y utilidades comunes.
 *
 * Las marcas de tiempo se guardan tal cual las manda el cliente:
 * cadenas ISO-8601 en UTC (2026-08-22T09:15:03.412Z). Al tener todas la
 * misma longitud, ordenarlas como texto es ordenarlas por fecha, y así
 * la sincronización no depende de la zona horaria del hosting ni de que
 * el reloj del servidor coincida con el del móvil.
 */
declare(strict_types=1);

const LONGITUD_ISO = 24;

function config(): array
{
    static $config = null;
    if ($config === null) {
        $ruta = __DIR__ . '/../config.php';
        if (!is_file($ruta)) {
            responder_error(500, 'El servidor no está configurado (falta config.php).', 'sin-config');
        }
        $config = require $ruta;
    }
    return $config;
}

/** Motor en uso: 'mysql' (lo normal en el hosting) o 'sqlite'. */
function motor(): string
{
    return (config()['db']['driver'] ?? 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
}

function bd(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config()['db'];
        $opciones = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            if (motor() === 'sqlite') {
                // Alternativa sin servidor de base de datos: un único
                // fichero. Va sobrado para el volumen de una promoción.
                $ruta = $c['fichero'] ?? (__DIR__ . '/../datos/repasos.sqlite');
                if (!is_dir(dirname($ruta))) {
                    @mkdir(dirname($ruta), 0755, true);
                }
                $pdo = new PDO('sqlite:' . $ruta, null, null, $opciones);
                $pdo->exec('PRAGMA journal_mode = WAL');
                $pdo->exec('PRAGMA foreign_keys = ON');
                $pdo->exec('PRAGMA busy_timeout = 5000');
            } else {
                $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['host'], $c['nombre']);
                $pdo = new PDO($dsn, $c['usuario'], $c['password'], $opciones);
            }
        } catch (PDOException $e) {
            error_log('UNIK repasos · sin base de datos: ' . $e->getMessage());
            responder_error(500, 'No se puede conectar con la base de datos.', 'sin-bd');
        }
        // Al abrir la conexión se comprueba que la base de datos tenga lo
        // que el código espera. Es una consulta a una tabla de dos filas
        // cuando ya está al día, y evita tener que acordarse de abrir
        // ninguna página después de publicar.
        require_once __DIR__ . '/esquema.php';
        esquema_al_dia($pdo);

        // Y la cuenta temporal de la revisión de Apple, si el despliegue
        // dejó su fichero. Cuando ya está como toca no toca la base de
        // datos: compara una huella y se va.
        require_once __DIR__ . '/revision.php';
        revision_al_dia($pdo);
    }
    return $pdo;
}

/** Fichero de esquema del motor en uso. */
function fichero_esquema(): string
{
    return __DIR__ . '/../' . (motor() === 'sqlite' ? 'schema-sqlite.sql' : 'schema.sql');
}

/* ─── Respuestas ─────────────────────────────────────────────── */
function responder($datos, int $codigo = 200): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function responder_error(int $codigo, string $mensaje, string $clave = ''): void
{
    responder(['error' => $mensaje, 'codigo' => $clave], $codigo);
}

/** Cuerpo JSON de la petición. */
function cuerpo(): array
{
    static $datos = null;
    if ($datos === null) {
        $crudo = file_get_contents('php://input');
        $datos = $crudo === '' ? [] : (json_decode($crudo, true) ?: []);
    }
    return $datos;
}

/* ─── Utilidades ─────────────────────────────────────────────── */
function ahora_iso(): string
{
    return gmdate('Y-m-d\TH:i:s') . '.000Z';
}

/** Valida que una cadena sea una marca ISO como las que manda el cliente. */
function iso(?string $valor, ?string $porDefecto = null): string
{
    $valor = (string) $valor;
    if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', $valor)) {
        return $valor;
    }
    return $porDefecto ?? ahora_iso();
}

function uuid(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function es_uuid(?string $valor): bool
{
    return is_string($valor) && (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $valor);
}

/** Minúsculas, sin tildes y sin nada que no sea letra o número. */
function llano(string $texto): string
{
    $tildes = [
        'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'ã' => 'a', 'å' => 'a',
        'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
        'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o', 'õ' => 'o',
        'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
        'ñ' => 'n', 'ç' => 'c',
    ];
    $texto = mb_strtolower($texto, 'UTF-8');
    $texto = strtr($texto, $tildes);
    return preg_replace('/[^a-z0-9]/', '', $texto) ?? '';
}

/**
 * Contraseña inicial: nombre completo seguido de la primera palabra de
 * la empresa o rol, en minúsculas, sin tildes ni espacios.
 * «Alba García» + «Unik — Promotor» → albagarciaunik
 *
 * Tiene que dar exactamente lo mismo que contrasenaInicial() en
 * js/catalog.js: quien da de alta a alguien dicta la contraseña de
 * memoria, y las dos partes han de coincidir.
 */
function contrasena_inicial(string $nombre, string $empresa): string
{
    $primera = '';
    foreach (preg_split('/\s+/u', trim($empresa)) ?: [] as $palabra) {
        $limpia = llano($palabra);
        if ($limpia !== '') {
            $primera = $limpia;
            break;
        }
    }
    return llano($nombre) . $primera;
}

function texto(array $origen, string $clave, int $max = 255, string $porDefecto = ''): string
{
    $v = $origen[$clave] ?? $porDefecto;
    if (!is_scalar($v)) {
        return $porDefecto;
    }
    return mb_substr(trim((string) $v), 0, $max);
}

function entero(array $origen, string $clave, int $porDefecto = 0): int
{
    $v = $origen[$clave] ?? $porDefecto;
    return is_numeric($v) ? (int) $v : $porDefecto;
}

function booleano(array $origen, string $clave, bool $porDefecto = false): bool
{
    $v = $origen[$clave] ?? $porDefecto;
    return $v === true || $v === 1 || $v === '1' || $v === 'true';
}

/**
 * Carpeta absoluta donde viven los medios, creada si hace falta.
 *
 * Admite una ruta relativa a api/ ('uploads', que es lo que funciona sin
 * tocar nada) o una absoluta. Lo segundo permite sacar las fotos fuera de
 * la carpeta web, que es más seguro: en Plesk, nginx sirve los ficheros
 * estáticos por su cuenta y no lee los .htaccess de Apache, así que una
 * carpeta dentro de httpdocs puede quedar accesible por URL aunque su
 * .htaccess diga lo contrario.
 */
function carpeta_medios(): string
{
    $configurada = config()['carpeta_medios'] ?? 'uploads';
    $ruta = $configurada !== '' && $configurada[0] === '/'
        ? $configurada
        : __DIR__ . '/../' . $configurada;
    if (!is_dir($ruta) && !mkdir($ruta, 0755, true) && !is_dir($ruta)) {
        responder_error(500, 'No se puede crear la carpeta de medios.', 'sin-carpeta');
    }
    return realpath($ruta) ?: $ruta;
}

/* ─── La tabla meta como almacén de ajustes ─────────────────────
   Pares clave→valor sueltos: la versión del esquema, la huella de la
   cuenta de revisión… y los ajustes de la obra que se editan desde la
   app, como la lista de estancias. Para media docena de claves no hace
   falta una tabla cada vez. */

/** El valor guardado bajo una clave, o null si no hay. */
function meta_valor(string $clave): ?string
{
    $stmt = bd()->prepare('SELECT valor FROM meta WHERE clave = ?');
    $stmt->execute([$clave]);
    $valor = $stmt->fetchColumn();
    return $valor === false ? null : (string) $valor;
}

/** Guarda un valor bajo una clave; con null, la borra. */
function meta_poner(string $clave, ?string $valor): void
{
    bd()->prepare('DELETE FROM meta WHERE clave = ?')->execute([$clave]);
    if ($valor !== null) {
        bd()->prepare('INSERT INTO meta (clave, valor) VALUES (?, ?)')->execute([$clave, $valor]);
    }
}
