<?php
/* ═══════════════════════════════════════════════════════════════
   voces.php — la capa acústica: quién suena en cada tramo.

   El oído (OpenAI) separa hablantes DENTRO de una grabación: A, B,
   C… con sus tiempos, pero sin nombres y sin memoria entre días. Esta
   capa es la memoria: huellas de voz persistentes en pyannoteAI
   (api.pyannote.ai, modelo precision-2), el laboratorio detrás del
   pyannote de código abierto y el único servicio autoservicio con
   enrolamiento de voces verificado entre ficheros distintos.

   Tres decisiones que importan:

   - LA HUELLA VIVE AQUÍ, no allí: pyannote devuelve una cadena (el
     voiceprint) y borra sus salidas a las 24 horas; el dato biométrico
     queda solo en la tabla `voces` de esta base. Borrar a una persona
     es borrar una fila.

   - EL CLIP TAMBIÉN SE GUARDA: las huellas no son portables entre
     proveedores ni entre versiones de modelo. Con el clip guardado se
     puede re-enrolar donde sea sin pedirle a nadie que repita.

   - SIN CLAVE, NADA SE ROMPE: la pantalla de «¿quién es quién?»
     funciona igual asignando a mano; la clave solo añade la memoria.

   La clave se guarda como las de Anthropic y OpenAI: fichero 0600 en
   api/datos/, y de aquí solo salen sus cuatro últimos caracteres.
   ═══════════════════════════════════════════════════════════════ */
declare(strict_types=1);

const VOCES_API = 'https://api.pyannote.ai/v1';
const VOCES_MODELO = 'precision-2';

/** Umbral de confianza para dar por buena una identificación. */
const VOCES_UMBRAL = 0.35;

/** Cuánto puede tardar el hosting en estas llamadas, en segundos. */
const VOCES_MARGEN_PHP = 300;

function voces_fichero_clave(): string
{
    return __DIR__ . '/../datos/pyannote.key';
}

function voces_clave(): string
{
    $f = voces_fichero_clave();
    return is_file($f) ? trim((string) file_get_contents($f)) : '';
}

function voces_guardar_clave(string $clave): void
{
    $f = voces_fichero_clave();
    if (file_put_contents($f, $clave . "\n", LOCK_EX) === false) {
        responder_error(500, 'No se ha podido guardar la clave en el servidor.', 'clave-no-escrita');
    }
    @chmod($f, 0600);
}

function voces_borrar_clave(): void
{
    $f = voces_fichero_clave();
    if (is_file($f)) {
        @unlink($f);
    }
}

/** Una llamada JSON a pyannote. Devuelve [código, json]. */
function voces_pedir(string $metodo, string $ruta, ?array $cuerpo = null): array
{
    $clave = voces_clave();
    if ($clave === '') {
        responder_error(400, 'No hay clave de pyannote puesta. Ponla en Ajustes → Servidor.', 'sin-clave');
    }
    if (!function_exists('curl_init')) {
        responder_error(500, 'Este servidor no tiene cURL y no puede llamar a la API.', 'php-curl');
    }
    @set_time_limit(VOCES_MARGEN_PHP);

    $ch = curl_init(VOCES_API . $ruta);
    $opciones = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $clave,
            'Content-Type: application/json',
        ],
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CONNECTTIMEOUT => 15,
    ];
    if ($cuerpo !== null) {
        $opciones[CURLOPT_POSTFIELDS] = json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    curl_setopt_array($ch, $opciones);
    $salida = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno = curl_errno($ch);
    $detalle = curl_error($ch);
    curl_close($ch);

    if ($errno !== 0) {
        responder_error(502, 'No se ha podido llamar a pyannote: ' . $detalle, 'sin-salida');
    }
    if ($codigo === 401 || $codigo === 403) {
        responder_error(401, 'La clave de pyannote no es válida. Vuelve a ponerla en Ajustes.', 'clave-mala');
    }
    if ($codigo === 429) {
        responder_error(429, 'La cuenta de pyannote ha llegado a su cupo. Prueba en un rato.', 'sin-cupo');
    }
    return [$codigo, json_decode((string) $salida, true)];
}

/**
 * Sube un fichero al almacenamiento temporal de pyannote y devuelve su
 * dirección `media://`. Dos pasos: pedir la URL prefirmada y hacer el
 * PUT del binario. Lo temporal es de verdad: allí se borra al procesar.
 */
function voces_subir_media(string $ruta): string
{
    $nombre = 'media://unik-repasos/' . uuid();
    [$codigo, $json] = voces_pedir('POST', '/media/input', ['url' => $nombre]);
    $destino = (string) ($json['url'] ?? '');
    if ($codigo >= 400 || $destino === '') {
        responder_error(502, 'pyannote no ha dado sitio para subir el audio (' . $codigo . ').', 'api-error');
    }

    $f = fopen($ruta, 'rb');
    if ($f === false) {
        responder_error(500, 'No se pudo leer el audio para subirlo.', 'disco');
    }
    $ch = curl_init($destino);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_PUT => true,
        CURLOPT_INFILE => $f,
        CURLOPT_INFILESIZE => filesize($ruta),
        CURLOPT_TIMEOUT => 240,
        CURLOPT_CONNECTTIMEOUT => 15,
    ]);
    curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errno = curl_errno($ch);
    curl_close($ch);
    fclose($f);

    if ($errno !== 0 || $codigo >= 400) {
        responder_error(502, 'La subida del audio a pyannote no ha terminado bien (' . $codigo . ').', 'api-error');
    }
    return $nombre;
}

/** Encarga la huella de un clip ya subido. Devuelve el id del trabajo. */
function voces_encargar_huella(string $mediaUrl): string
{
    [$codigo, $json] = voces_pedir('POST', '/voiceprint', [
        'url' => $mediaUrl,
        'model' => VOCES_MODELO,
    ]);
    $trabajo = (string) ($json['jobId'] ?? '');
    if ($codigo >= 400 || $trabajo === '') {
        responder_error(502, 'pyannote no ha aceptado el enrolamiento (' . $codigo . ').', 'api-error');
    }
    return $trabajo;
}

/**
 * Encarga la identificación de un audio contra las huellas dadas
 * (etiqueta → huella). Devuelve el id del trabajo.
 */
function voces_encargar_identificacion(string $mediaUrl, array $huellas): string
{
    [$codigo, $json] = voces_pedir('POST', '/identify', [
        'url' => $mediaUrl,
        'model' => VOCES_MODELO,
        'voiceprints' => array_map(
            static fn ($etiqueta, $huella) => ['label' => $etiqueta, 'voiceprint' => $huella],
            array_keys($huellas),
            array_values($huellas)
        ),
        // exclusive: dos hablantes no pueden ser la misma persona.
        // El umbral corta las corazonadas: por debajo, la voz se queda
        // anónima y cae a la pantalla de asignar, no a un nombre mal puesto.
        'matching' => ['threshold' => VOCES_UMBRAL, 'exclusive' => true],
    ]);
    $trabajo = (string) ($json['jobId'] ?? '');
    if ($codigo >= 400 || $trabajo === '') {
        responder_error(502, 'pyannote no ha aceptado la identificación (' . $codigo . ').', 'api-error');
    }
    return $trabajo;
}

/**
 * Mira cómo va un trabajo. Devuelve ['estado' => 'en-cola|hecho|fallado',
 * 'salida' => array]. Las salidas se borran allí a las 24 horas: lo que
 * devuelva hecho, guárdalo YA.
 */
function voces_mirar_trabajo(string $trabajoId): array
{
    [$codigo, $json] = voces_pedir('GET', '/jobs/' . rawurlencode($trabajoId));
    if ($codigo >= 400 || !is_array($json)) {
        responder_error(502, 'pyannote no contesta por ese trabajo (' . $codigo . ').', 'api-error');
    }
    $estado = (string) ($json['status'] ?? '');
    if (in_array($estado, ['succeeded', 'completed'], true)) {
        return ['estado' => 'hecho', 'salida' => (array) ($json['output'] ?? [])];
    }
    if (in_array($estado, ['failed', 'canceled', 'cancelled'], true)) {
        error_log('UNIK repasos · trabajo de voces fallado: ' . substr(json_encode($json), 0, 300));
        return ['estado' => 'fallado', 'salida' => []];
    }
    return ['estado' => 'en-cola', 'salida' => []];
}
