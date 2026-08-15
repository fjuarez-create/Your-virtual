<?php
/* ═══════════════════════════════════════════════════════════════
   oido.php — pasar a texto lo que se dijo durante un recorrido.

   Claude ve pero no oye, así que el audio de un recorrido no le sirve
   de nada. Esto es la oreja que le falta: coge la grabación, la manda a
   transcribir y devuelve el texto, que es lo que luego se reparte entre
   las fotos.

   Está aparte de `claude.php` a propósito. Es otro proveedor, otra
   clave y otra factura, y si algún día se cambia por otro —o por algo
   que corra en el propio servidor— se cambia este fichero y nadie más
   se entera.

   La clave vive en el servidor y no vuelve nunca al móvil, igual que la
   de Anthropic: una clave metida en el JavaScript de la app se la lleva
   cualquiera que abra las herramientas del navegador.
   ═══════════════════════════════════════════════════════════════ */

/**
 * El modelo que escucha.
 *
 * `gpt-4o-transcribe` cuesta lo mismo que el Whisper de siempre y
 * entiende bastante mejor el castellano de obra, que es el que aquí se
 * habla. Admite además una pista de vocabulario, que es lo que evita
 * que «rodapié» acabe escrito «rodapiés» o «gotelé» como «gotele».
 */
const OIDO_MODELO = 'gpt-4o-transcribe';

/** El idioma que se habla en la obra, en ISO-639-1. */
const OIDO_IDIOMA = 'es';

/**
 * Tope de la grabación: 25 MB y 25 minutos, que son los de la API.
 *
 * Un recorrido de una villa son tres o cuatro minutos y unos cientos de
 * kilobytes, así que esto no es el tamaño esperado sino el techo, y se
 * comprueba aquí para no gastar una subida entera por la línea de una
 * obra en algo que iban a rechazar al otro lado.
 */
const OIDO_TOPE_BYTES = 25 * 1024 * 1024;
const OIDO_TOPE_SEGUNDOS = 1500;

/** Cuánto puede tardar el hosting en esta llamada, en segundos. */
const OIDO_MARGEN_PHP = 300;

/**
 * Vocabulario de obra, para que no lo escriba de oído.
 *
 * La API admite una pista de contexto, y estas son las palabras que un
 * transcriptor genérico no espera oír y escribe mal: son de albañilería
 * española corriente, no del diccionario de nadie.
 */
function oido_vocabulario(): string
{
    return 'Repaso de obra en una vivienda. Vocabulario: rodapié, alicatado, '
        . 'solado, gotelé, guarnecido, enfoscado, rozas, premarco, jamba, '
        . 'vierteaguas, albardilla, junta, llaga, desconchón, descuadre, '
        . 'plaqueta, terrazo, falso techo, mecanismo, enchufe, fontanería, '
        . 'carpintería, cerrajería, aplacado, remate, repaso.';
}

function oido_fichero_clave(): string
{
    return __DIR__ . '/../datos/openai.key';
}

/** La clave guardada, o '' si no hay ninguna. */
function oido_clave(): string
{
    $f = oido_fichero_clave();
    return is_file($f) ? trim((string) file_get_contents($f)) : '';
}

/**
 * Guarda la clave, con permisos 0600 y en la carpeta que el navegador
 * tiene prohibida, igual que la de Anthropic.
 */
function oido_guardar_clave(string $clave): void
{
    $f = oido_fichero_clave();
    if (file_put_contents($f, $clave . "\n", LOCK_EX) === false) {
        responder_error(500, 'No se ha podido guardar la clave en el servidor.', 'clave-no-escrita');
    }
    @chmod($f, 0600);
}

function oido_borrar_clave(): void
{
    $f = oido_fichero_clave();
    if (is_file($f)) {
        @unlink($f);
    }
}

/**
 * El nombre con el que viaja el audio.
 *
 * No es cosmético: al otro lado deciden el formato por la extensión del
 * fichero, no por lo que diga la cabecera. Un iPhone graba en mp4 y un
 * Android en webm, y si se manda con el nombre equivocado lo rechazan
 * sin más explicación.
 */
function oido_nombre(string $mime): string
{
    $limpio = strtolower(trim(explode(';', $mime)[0]));
    $porMime = [
        'audio/webm' => 'recorrido.webm',
        'audio/ogg' => 'recorrido.ogg',
        'audio/mp4' => 'recorrido.m4a',
        'audio/x-m4a' => 'recorrido.m4a',
        'audio/aac' => 'recorrido.m4a',
        'audio/mpeg' => 'recorrido.mp3',
        'audio/wav' => 'recorrido.wav',
        'audio/x-wav' => 'recorrido.wav',
        'video/mp4' => 'recorrido.mp4',
    ];
    return $porMime[$limpio] ?? 'recorrido.webm';
}

/**
 * El formulario que se manda: el fichero y los cuatro ajustes.
 *
 * Está aparte de la llamada para poder comprobarlo sin gastar una
 * transcripción: es donde están las cosas que se rompen en silencio —el
 * nombre del fichero, el idioma, el formato de la respuesta— y donde un
 * error no da una excepción sino una transcripción peor.
 */
function oido_forma(string $ruta, string $mime): array
{
    return [
        'file' => new CURLFile($ruta, $mime ?: 'application/octet-stream', oido_nombre($mime)),
        'model' => OIDO_MODELO,
        'language' => OIDO_IDIOMA,
        'prompt' => oido_vocabulario(),
        // Este modelo solo devuelve `json`; pedirle otra cosa es un 400.
        'response_format' => 'json',
    ];
}

/**
 * Manda la grabación a transcribir y devuelve lo que se dijo.
 *
 * `$ruta` es el fichero temporal de la subida; `$mime` lo que declaró el
 * móvil al grabarlo.
 */
function oido_transcribir(string $ruta, string $mime): array
{
    $clave = oido_clave();
    if ($clave === '') {
        responder_error(400, 'No hay clave de OpenAI puesta. Ponla en Ajustes → Servidor.', 'sin-clave');
    }
    if (!function_exists('curl_init')) {
        responder_error(500, 'Este servidor no tiene cURL y no puede llamar a la API.', 'php-curl');
    }

    // Transcribir cuatro minutos de audio pasa de los treinta segundos a
    // los que muchos alojamientos compartidos cortan un PHP.
    @set_time_limit(OIDO_MARGEN_PHP);

    $ch = curl_init('https://api.openai.com/v1/audio/transcriptions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $clave],
        CURLOPT_POSTFIELDS => oido_forma($ruta, $mime),
        // Corta antes que el margen de PHP a propósito, para que quien
        // avise sea este código, que sabe decir qué ha pasado.
        CURLOPT_TIMEOUT => 240,
        CURLOPT_CONNECTTIMEOUT => 15,
    ]);
    $salida = curl_exec($ch);
    $estado = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $fallo = curl_errno($ch);
    $detalle = curl_error($ch);
    curl_close($ch);

    if ($fallo) {
        responder_error(502, oido_por_que_no_sale($fallo, $detalle), 'sin-salida');
    }

    $json = json_decode((string) $salida, true);

    if ($estado === 401) {
        responder_error(401, 'La clave de OpenAI no es válida. Vuelve a ponerla en Ajustes.', 'clave-mala');
    }
    if ($estado === 429) {
        responder_error(429, 'La cuenta de OpenAI se ha quedado sin crédito o sin cupo. Recárgala y vuelve a probar.', 'sin-cupo');
    }
    if ($estado >= 400) {
        $motivo = (string) ($json['error']['message'] ?? '');
        responder_error(502, 'La transcripción ha fallado' . ($motivo !== '' ? ": {$motivo}" : '.'), 'transcripcion-mala');
    }

    $texto = trim((string) ($json['text'] ?? ''));
    if ($texto === '') {
        responder_error(422, 'No se ha entendido nada en la grabación. Escribe tú lo que dijiste.', 'sin-voz');
    }

    return ['texto' => $texto, 'modelo' => OIDO_MODELO];
}

/**
 * Por qué no ha salido la llamada. Interesa distinguirlo: cada motivo se
 * arregla en un sitio distinto, y «no se ha podido conectar» no le sirve
 * a nadie para pedirle nada al hosting.
 */
function oido_por_que_no_sale(int $errno, string $detalle): string
{
    if ($errno === CURLE_COULDNT_RESOLVE_HOST) {
        return 'El servidor no resuelve api.openai.com: le falta DNS o lo tiene cerrado.';
    }
    // Solo constantes que PHP define siempre. `CURLE_PEER_FAILED_VERIFICATION`
    // no existe en todas las compilaciones —y vale 60, lo mismo que
    // `CURLE_SSL_CACERT`—, así que nombrarla revienta el manejo de
    // errores justo cuando hace falta.
    if (in_array($errno, [CURLE_SSL_CACERT, CURLE_SSL_CACERT_BADFILE, CURLE_SSL_CONNECT_ERROR], true)) {
        return 'El servidor no se fía del certificado de OpenAI: le faltan los certificados raíz.';
    }
    if ($errno === CURLE_OPERATION_TIMEDOUT) {
        return 'La transcripción ha tardado demasiado. Prueba con un recorrido más corto.';
    }
    if ($errno === CURLE_COULDNT_CONNECT) {
        return 'El servidor no puede salir a internet: el cortafuegos del hosting bloquea la salida.';
    }
    return 'No se ha podido llamar a OpenAI' . ($detalle !== '' ? " ({$detalle})" : '.');
}
