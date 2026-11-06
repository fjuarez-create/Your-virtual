<?php
/**
 * Avisos push (Web Push con VAPID, RFC 8291 / RFC 8292).
 *
 * Todo se hace con lo que trae PHP: openssl para las claves P-256, la
 * firma del testigo y el cifrado AES-128-GCM; hash_hkdf para derivar las
 * claves; curl para hablar con el servicio de push de cada móvil.
 *
 * Las funciones de este fichero son puras: reciben las claves y la
 * suscripción y devuelven el resultado. Quién guarda las claves y las
 * suscripciones es cosa de index.php.
 */

declare(strict_types=1);

/** Quién firma los avisos. El servicio de push lo usa para contactar si algo va mal. */
const PUSH_REMITENTE = 'https://repasos.unikdi.com';

/** Cuánto guarda el servicio un aviso si el móvil está apagado (segundos). */
const PUSH_TTL = 86400;

/** Tamaño de registro del cifrado (RFC 8188). Un aviso cabe en un solo registro. */
const PUSH_TAMANO_REGISTRO = 4096;

function push_base64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function push_desde_base64url(string $texto): string
{
    $texto = strtr($texto, '-_', '+/');
    $resto = strlen($texto) % 4;
    if ($resto) {
        $texto .= str_repeat('=', 4 - $resto);
    }
    $bytes = base64_decode($texto, true);
    return $bytes === false ? '' : $bytes;
}

/**
 * Genera el par de claves VAPID. Devuelve la privada en PEM y la pública
 * en crudo (65 bytes, sin comprimir) codificada en base64url, que es lo
 * que el navegador necesita para suscribirse.
 */
function push_generar_claves(): array
{
    $clave = openssl_pkey_new([
        'curve_name' => 'prime256v1',
        'private_key_type' => OPENSSL_KEYTYPE_EC,
    ]);
    if ($clave === false) {
        throw new RuntimeException('No se ha podido generar la clave VAPID');
    }
    $pem = '';
    if (!openssl_pkey_export($clave, $pem)) {
        throw new RuntimeException('No se ha podido exportar la clave VAPID');
    }
    return [
        'privada' => $pem,
        'publica' => push_base64url(push_publica_cruda($clave)),
    ];
}

/** La clave pública en crudo: 0x04 || x || y. */
function push_publica_cruda($clave): string
{
    $detalles = openssl_pkey_get_details($clave);
    if (!$detalles || empty($detalles['ec']['x']) || empty($detalles['ec']['y'])) {
        throw new RuntimeException('La clave no es P-256');
    }
    return "\x04" . str_pad($detalles['ec']['x'], 32, "\0", STR_PAD_LEFT)
        . str_pad($detalles['ec']['y'], 32, "\0", STR_PAD_LEFT);
}

/** Convierte una clave pública en crudo (65 bytes) en un recurso de openssl. */
function push_publica_desde_cruda(string $cruda)
{
    if (strlen($cruda) !== 65 || $cruda[0] !== "\x04") {
        throw new InvalidArgumentException('Clave pública P-256 mal formada');
    }
    // Cabecera DER de SubjectPublicKeyInfo para EC P-256 sin comprimir.
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $cruda;
    $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    $clave = openssl_pkey_get_public($pem);
    if ($clave === false) {
        throw new InvalidArgumentException('Clave pública P-256 inválida');
    }
    return $clave;
}

/** Pasa una firma ECDSA en DER a los 64 bytes crudos r||s que pide JWT. */
function push_firma_cruda(string $der): string
{
    $pos = 0;
    if (ord($der[$pos++]) !== 0x30) {
        throw new RuntimeException('Firma DER inesperada');
    }
    $len = ord($der[$pos++]);
    if ($len & 0x80) {
        $pos += $len & 0x7f;
    }
    $leer = function () use ($der, &$pos): string {
        if (ord($der[$pos++]) !== 0x02) {
            throw new RuntimeException('Firma DER inesperada');
        }
        $n = ord($der[$pos++]);
        $valor = substr($der, $pos, $n);
        $pos += $n;
        $valor = ltrim($valor, "\0");
        return str_pad($valor, 32, "\0", STR_PAD_LEFT);
    };
    $r = $leer();
    $s = $leer();
    return $r . $s;
}

/**
 * El testigo VAPID (JWT ES256) para un servicio de push concreto.
 * $destino es el origen del endpoint (https://web.push.apple.com, …).
 */
function push_testigo(string $privadaPem, string $destino, int $ahora): string
{
    // Sin barras escapadas («https:\/\/…»): es JSON válido igual, pero
    // ninguna librería de referencia lo emite así y no vale la pena
    // darle a un servicio la ocasión de compararlo a lo bruto.
    $cabecera = push_base64url(json_encode(['typ' => 'JWT', 'alg' => 'ES256'], JSON_UNESCAPED_SLASHES));
    $cuerpo = push_base64url(json_encode([
        'aud' => $destino,
        'exp' => $ahora + 12 * 3600,
        'sub' => PUSH_REMITENTE,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $clave = openssl_pkey_get_private($privadaPem);
    if ($clave === false) {
        throw new RuntimeException('Clave VAPID privada inválida');
    }
    $firma = '';
    if (!openssl_sign("$cabecera.$cuerpo", $firma, $clave, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('No se ha podido firmar el testigo VAPID');
    }
    return "$cabecera.$cuerpo." . push_base64url(push_firma_cruda($firma));
}

/**
 * Cifra el aviso para una suscripción (RFC 8291, aes128gcm).
 * $p256dh y $auth vienen tal cual los da el navegador (base64url).
 * Devuelve el cuerpo binario listo para enviar.
 */
function push_cifrar(string $texto, string $p256dh, string $auth, ?string $salPrueba = null, $clavePrueba = null): string
{
    $publicaUsuario = push_desde_base64url($p256dh);
    $secretoAuth = push_desde_base64url($auth);
    if (strlen($publicaUsuario) !== 65 || strlen($secretoAuth) !== 16) {
        throw new InvalidArgumentException('Suscripción push mal formada');
    }
    if (strlen($texto) > PUSH_TAMANO_REGISTRO - 16 - 1 - 100) {
        throw new LengthException('El aviso es demasiado largo');
    }

    $claveServidor = $clavePrueba ?? openssl_pkey_new([
        'curve_name' => 'prime256v1',
        'private_key_type' => OPENSSL_KEYTYPE_EC,
    ]);
    $publicaServidor = push_publica_cruda($claveServidor);
    $secretoCompartido = openssl_pkey_derive(push_publica_desde_cruda($publicaUsuario), $claveServidor, 32);
    if ($secretoCompartido === false || strlen($secretoCompartido) !== 32) {
        throw new RuntimeException('No se ha podido acordar la clave con el móvil');
    }

    $ikm = hash_hkdf('sha256', $secretoCompartido, 32, "WebPush: info\0" . $publicaUsuario . $publicaServidor, $secretoAuth);
    $sal = $salPrueba ?? random_bytes(16);
    $claveContenido = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $sal);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $sal);

    $etiqueta = '';
    $cifrado = openssl_encrypt($texto . "\x02", 'aes-128-gcm', $claveContenido, OPENSSL_RAW_DATA, $nonce, $etiqueta, '', 16);
    if ($cifrado === false) {
        throw new RuntimeException('No se ha podido cifrar el aviso');
    }

    return $sal . pack('N', PUSH_TAMANO_REGISTRO) . chr(65) . $publicaServidor . $cifrado . $etiqueta;
}

/**
 * Envía un aviso a una suscripción. Devuelve el código HTTP del servicio
 * de push (201 es «aceptado») y si la suscripción ya no vale (404/410),
 * que es la señal para borrarla.
 */
function push_enviar(array $suscripcion, array $carga, array $claves, int $ahora): array
{
    $endpoint = (string)($suscripcion['endpoint'] ?? '');
    $partes = parse_url($endpoint);
    if (!$partes || ($partes['scheme'] ?? '') !== 'https' || empty($partes['host'])) {
        return ['codigo' => 0, 'caducada' => true, 'error' => 'endpoint inválido'];
    }
    $destino = 'https://' . $partes['host'] . (isset($partes['port']) ? ':' . $partes['port'] : '');

    // Solo se da por caducada la suscripción cuando la culpa es suya
    // (mal formada). Si falla la clave del servidor o el cifrado, la
    // suscripción es buena y no se toca.
    $testigo = push_testigo($claves['privada'], $destino, $ahora);
    try {
        $cuerpo = push_cifrar(
            json_encode($carga, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            (string)($suscripcion['p256dh'] ?? ''),
            (string)($suscripcion['auth'] ?? '')
        );
    } catch (InvalidArgumentException $e) {
        return ['codigo' => 0, 'caducada' => true, 'error' => $e->getMessage()];
    } catch (Throwable $e) {
        return ['codigo' => 0, 'caducada' => false, 'error' => $e->getMessage()];
    }

    $curl = curl_init($endpoint);
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $cuerpo,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'Content-Length: ' . strlen($cuerpo),
            'TTL: ' . PUSH_TTL,
            'Urgency: normal',
            'Authorization: vapid t=' . $testigo . ', k=' . $claves['publica'],
        ],
    ]);
    $respuesta = curl_exec($curl);
    $codigo = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = $respuesta === false ? curl_error($curl) : '';
    curl_close($curl);

    return [
        'codigo' => $codigo,
        'caducada' => in_array($codigo, [404, 410], true),
        'error' => $error,
    ];
}

/**
 * Varios avisos a la vez (uno por móvil), con curl_multi: diez móviles
 * tardan lo que el más lento, no la suma. Devuelve, por id de
 * suscripción, lo mismo que push_enviar().
 */
function push_enviar_varias(array $suscripciones, array $carga, array $claves, int $ahora): array
{
    $texto = json_encode($carga, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    // Un testigo por destino (Apple, Google, Mozilla…), ANTES de tocar
    // ninguna suscripción: si la clave del servidor está mal, aquí se
    // lanza y el reparto se aborta entero sin borrar ninguna fila. Lo
    // único que da una suscripción por caducada es que ella misma esté
    // mal formada.
    $destinoDe = static function (array $s): ?string {
        $partes = parse_url((string) ($s['endpoint'] ?? ''));
        if (!$partes || ($partes['scheme'] ?? '') !== 'https' || empty($partes['host'])) {
            return null;
        }
        return 'https://' . $partes['host'] . (isset($partes['port']) ? ':' . $partes['port'] : '');
    };
    $testigos = [];
    foreach ($suscripciones as $s) {
        $destino = $destinoDe($s);
        if ($destino !== null && !isset($testigos[$destino])) {
            $testigos[$destino] = push_testigo($claves['privada'], $destino, $ahora);
        }
    }
    $resultados = [];
    $multi = curl_multi_init();
    $vivos = [];
    foreach ($suscripciones as $s) {
        $id = (string) ($s['id'] ?? '');
        $endpoint = (string) ($s['endpoint'] ?? '');
        $destino = $destinoDe($s);
        if ($destino === null) {
            $resultados[$id] = ['codigo' => 0, 'caducada' => true, 'error' => 'endpoint inválido'];
            continue;
        }
        $testigo = $testigos[$destino];
        try {
            $cuerpo = push_cifrar($texto, (string) ($s['p256dh'] ?? ''), (string) ($s['auth'] ?? ''));
        } catch (InvalidArgumentException $e) {
            $resultados[$id] = ['codigo' => 0, 'caducada' => true, 'error' => $e->getMessage()];
            continue;
        } catch (Throwable $e) {
            $resultados[$id] = ['codigo' => 0, 'caducada' => false, 'error' => $e->getMessage()];
            continue;
        }
        $curl = curl_init($endpoint);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $cuerpo,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/octet-stream',
                'Content-Encoding: aes128gcm',
                'Content-Length: ' . strlen($cuerpo),
                'TTL: ' . PUSH_TTL,
                'Urgency: normal',
                'Authorization: vapid t=' . $testigo . ', k=' . $claves['publica'],
            ],
        ]);
        curl_multi_add_handle($multi, $curl);
        $vivos[$id] = $curl;
    }

    if ($vivos) {
        do {
            $estado = curl_multi_exec($multi, $enMarcha);
            if ($enMarcha) {
                curl_multi_select($multi, 1.0);
            }
        } while ($enMarcha && $estado === CURLM_OK);
        // En modo multi curl_error() sale vacío: el motivo de cada
        // fallo (tiempo agotado, TLS, DNS…) está en la cola de avisos
        // del multi y hay que vaciarla. Sin esto, cuando en producción
        // no llegara un aviso no habría ni una línea que dijera por qué.
        $fallos = [];
        while ($info = curl_multi_info_read($multi)) {
            $fallos[spl_object_id($info['handle'])] = (int) $info['result'];
        }
        foreach ($vivos as $id => $curl) {
            $codigo = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            $resultado = $fallos[spl_object_id($curl)] ?? CURLE_OK;
            $resultados[$id] = [
                'codigo' => $codigo,
                'caducada' => in_array($codigo, [404, 410], true),
                'error' => $resultado === CURLE_OK ? '' : curl_strerror($resultado) . " ({$resultado})",
            ];
            curl_multi_remove_handle($multi, $curl);
            curl_close($curl);
        }
    }
    curl_multi_close($multi);
    return $resultados;
}
