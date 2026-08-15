<?php
/**
 * claude.php — redactar tareas a partir de lo que se dijo en un recorrido.
 *
 * Esto vive en el servidor y no en el móvil por una razón sola: la clave.
 * Una clave metida en el JavaScript de la app se la lleva cualquiera que
 * abra las herramientas del navegador, y con ella puede gastar en tu
 * cuenta. Aquí solo sale del servidor hacia Anthropic.
 *
 * La clave se guarda en api/datos/, la misma carpeta que la base de
 * datos, cerrada al navegador por su .htaccess. No viaja al repositorio
 * ni la escribe el despliegue: se pega una vez desde Ajustes.
 */
declare(strict_types=1);

/** Modelo. El de más criterio de la gama; ver README para el porqué. */
const CLAUDE_MODELO = 'claude-opus-5';

/**
 * Cuánto se piensa la respuesta. Repartir quince frases entre quince
 * fotos no es un problema difícil, y en «medium» sale igual de bien que
 * en «high» por menos dinero y menos espera. Si algún día las tareas
 * salen pobres, subir esto es lo primero que hay que probar.
 */
const CLAUDE_ESFUERZO = 'medium';

/**
 * Tope de la respuesta para un recorrido corto. Cuenta lo que el modelo
 * piensa además de lo que escribe —en Opus 5 pensar viene puesto de
 * fábrica—, así que no es el tamaño de las tareas: es el de las tareas
 * más el rato que tarda en repartirlas.
 *
 * Con quince fotos sobra. Un recorrido de sesenta necesita más sitio, y
 * eso lo pone `claude_tope_salida()`.
 */
const CLAUDE_TOPE_SALIDA = 16000;

/** Cuánto puede tardar el hosting en esta llamada, en segundos. */
const CLAUDE_MARGEN_PHP = 300;

/**
 * Cuántas fotos como mucho se mandan a mirar, y cuánto puede ocupar
 * cada una ya en base64.
 *
 * El móvil ya las encoge a 1024 px antes de subirlas —unos 150 KB, que
 * en base64 son 200— así que el tope de aquí no es el tamaño esperado
 * sino el techo: lo que no lo cumpla no viaja, porque cada foto se paga
 * por lo que ocupa.
 */
const CLAUDE_TOPE_FOTOS = 30;
const CLAUDE_TOPE_FOTO_B64 = 900000;

/**
 * El tope de la respuesta según lo largo que haya sido el recorrido.
 *
 * Repartir sesenta frases entre sesenta fotos se piensa más que
 * repartir quince entre quince, y si se queda sin sitio a media
 * respuesta el JSON llega cortado y no hay nada que salvar.
 */
function claude_tope_salida(int $marcas): int
{
    return min(40000, CLAUDE_TOPE_SALIDA + max(0, $marcas - 20) * 400);
}

function claude_fichero_clave(): string
{
    return __DIR__ . '/../datos/claude.key';
}

/** La clave guardada, o '' si no hay ninguna. */
function claude_clave(): string
{
    $f = claude_fichero_clave();
    return is_file($f) ? trim((string) file_get_contents($f)) : '';
}

/**
 * Guarda la clave. Se escribe con permisos 0600 —solo el usuario del
 * servidor web puede leerla— y en una carpeta que el navegador tiene
 * prohibida.
 */
function claude_guardar_clave(string $clave): void
{
    $f = claude_fichero_clave();
    if (file_put_contents($f, $clave . "\n", LOCK_EX) === false) {
        responder_error(500, 'No se ha podido guardar la clave en el servidor.', 'clave-no-escrita');
    }
    @chmod($f, 0600);
}

function claude_borrar_clave(): void
{
    $f = claude_fichero_clave();
    if (is_file($f)) {
        @unlink($f);
    }
}

/* ═══════════════════════════════════════════════════════════════
   Las instrucciones
   ═══════════════════════════════════════════════════════════════ */
/**
 * Lo que se le pide al modelo. Escrito en el idioma de la obra, porque
 * lo que va a leer está en ese idioma y lo que escriba lo va a leer un
 * jefe de obra.
 *
 * La regla que más importa es la última: si de una foto no se dijo
 * nada, se deja en blanco. Un parte de repaso con un defecto inventado
 * es peor que un parte con un hueco: manda a alguien a arreglar algo
 * que no existe y quema la confianza en el resto de la lista.
 */
function claude_instrucciones(array $oficios): string
{
    $lista = '';
    foreach ($oficios as $o) {
        $lista .= "  - {$o['id']}: {$o['nombre']}\n";
    }

    return <<<TXT
Eres el ayudante de un arquitecto que acaba de recorrer una vivienda en
obra pasando revista a los remates. Cada vez que encontraba algo tocaba
la pantalla para sacar una foto, y a veces iba comentando en voz alta lo
que veía.

Te doy las fotos que tomó, cada una con el segundo del recorrido en que
se hizo, y —si dijo algo— lo que dijo. Tu trabajo es convertir eso en
las órdenes de trabajo que se le van a pasar al jefe de obra.

Devuelve una ficha por cada foto, en el mismo orden, con su mismo id.

DE DÓNDE SACAS CADA FICHA, por este orden:
1. Si algo de lo que dijo se le puede atribuir a esa foto, manda lo que
   dijo: él estaba delante y tú no. Pon origen «dicho».
2. Si no dijo nada que le encaje pero en la foto se ve claramente qué
   está mal —una junta abierta, un desconchón, un golpe, una mancha, un
   rodapié suelto, un remate sin terminar—, escribe eso. Pon origen
   «foto».
3. Si no dijo nada y en la foto no distingues ningún defecto concreto,
   deja el texto vacío, pon origen «foto» y confianza «baja». Quien lo
   repase lo escribirá a mano mirándola.

Cuando lo dicho y la foto se contradigan, manda lo dicho.

EL TEXTO de cada ficha:
- Una orden de trabajo, no una descripción. «Repasar la junta del
  alicatado en la esquina de la ducha», no «se ve una junta abierta».
- Corta y concreta: lo que hay que hacer y dónde. Una frase, dos si el
  sitio necesita explicarse.
- Si dijo en qué estancia estaba, ponla. Es lo que convierte una tarea
  en algo que se puede encontrar sin llamar por teléfono.
- El idioma y el vocabulario, los suyos. Si dice «rodapié», no lo
  cambies por «zócalo».
- Nada de preámbulos, comillas, numeración ni coletillas.

EL GREMIO de cada ficha, solo uno de estos:
{$lista}
Si no encaja claramente en ninguno, pon `general`.

EMPAREJAR lo dicho con las fotos:
- Se habla mientras se anda, así que el comentario de una foto suele
  estar dicho justo antes o justo después de tomarla. Usa los segundos.
- Si en un mismo sitio se dijeron varias cosas y hay varias fotos
  seguidas, repártelas por orden.

LO QUE NO DEBES HACER:
- No adivines. Escribe lo que se ve, no lo que sueles encontrarte en una
  obra: si en la foto no distingues ningún defecto, deja el texto vacío
  antes que inventarte uno. Una tarea inventada manda a alguien a
  arreglar algo que no existe y quema la confianza en toda la lista.
- No describas la habitación ni lo que está bien. Solo lo que hay que
  tocar.
- No agrupes dos fotos en una ficha ni partas una foto en dos fichas.
  Una foto, una ficha, siempre.
- No añadas tareas que no tengan foto, por mucho que se hayan
  mencionado.

LA CONFIANZA de cada ficha:
- «alta»: lo que dijo señala a esa foto, o el defecto se ve sin lugar a
  dudas.
- «media»: encaja por el momento en que se tomó pero cabe duda, o lo ves
  en la foto y podría ser otra cosa.
- «baja»: no hay nada que atribuirle y en la foto no se distingue.
TXT;
}

/**
 * Lo capturado, tal y como se le pasa al modelo: lo que dijo, y luego
 * cada foto precedida de su id y su minuto.
 *
 * Van intercaladas —rótulo, foto, rótulo, foto— y no todas las fotos
 * detrás de una lista, porque así cada imagen queda pegada al id al que
 * tiene que contestar y no hay forma de que se le crucen.
 *
 * Una marca cuya foto no haya llegado se queda con su rótulo y sin
 * imagen: sigue habiendo que devolver su ficha, aunque salga vacía.
 */
function claude_mensaje(string $texto, array $marcas, array $fotos): array
{
    $bloques = [];
    $bloques[] = ['type' => 'text', 'text' => $texto === ''
        ? "NO DIJO NADA DURANTE EL RECORRIDO. Solo hay las fotos.\n\nLAS FOTOS QUE TOMÓ, por orden:"
        : "LO QUE DIJO DURANTE EL RECORRIDO:\n\n{$texto}\n\nLAS FOTOS QUE TOMÓ, por orden:"];

    foreach ($marcas as $i => $m) {
        $seg = (int) round(((float) $m['ms']) / 1000);
        $reloj = sprintf('%d:%02d', intdiv($seg, 60), $seg % 60);
        $n = $i + 1;
        $b64 = $fotos[$m['id']] ?? '';

        $bloques[] = ['type' => 'text', 'text' => $b64 === ''
            ? "FOTO {$n} · id={$m['id']} · tomada en el minuto {$reloj} · no ha llegado la imagen"
            : "FOTO {$n} · id={$m['id']} · tomada en el minuto {$reloj}"];

        if ($b64 !== '') {
            $bloques[] = ['type' => 'image', 'source' => [
                'type' => 'base64',
                'media_type' => 'image/jpeg',
                'data' => $b64,
            ]];
        }
    }

    return $bloques;
}

/** El molde de la respuesta. Con esto no hay que fiarse del formato. */
function claude_esquema(array $oficios): array
{
    $ids = array_map(static fn ($o) => $o['id'], $oficios);

    return [
        'type' => 'object',
        'properties' => [
            'fichas' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'properties' => [
                        'id' => ['type' => 'string'],
                        'texto' => ['type' => 'string'],
                        'oficio' => ['type' => 'string', 'enum' => $ids],
                        // De dónde ha salido la tarea. Es lo que luego se
                        // le dice a quien repasa: lo suyo se lee por
                        // encima, lo leído de una foto se mira dos veces.
                        'origen' => ['type' => 'string', 'enum' => ['dicho', 'foto']],
                        'confianza' => ['type' => 'string', 'enum' => ['alta', 'media', 'baja']],
                    ],
                    'required' => ['id', 'texto', 'oficio', 'origen', 'confianza'],
                    'additionalProperties' => false,
                ],
            ],
        ],
        'required' => ['fichas'],
        'additionalProperties' => false,
    ];
}

/* ═══════════════════════════════════════════════════════════════
   La llamada
   ═══════════════════════════════════════════════════════════════ */
/**
 * Redacta las tareas. Devuelve ['fichas' => [...], 'gasto' => [...]].
 *
 * Los errores no se tragan: si algo falla, quien lo pidió tiene que
 * poder leer por qué —sin clave, sin saldo, sin salida a internet— y
 * escribir las tareas a mano, que es lo que hacía hasta ayer.
 */
function claude_redactar(string $texto, array $marcas, array $oficios, array $fotos = []): array
{
    $clave = claude_clave();
    if ($clave === '') {
        responder_error(400, 'No hay clave de Anthropic guardada. Ponla en Ajustes.', 'sin-clave');
    }
    if (!function_exists('curl_init')) {
        responder_error(500, 'Este servidor no tiene cURL y no puede llamar a la API.', 'php-curl');
    }

    // Muchos alojamientos compartidos cortan un PHP a los 30 segundos, y
    // esta llamada tarda más que eso. Si la corta el hosting, el móvil ve
    // «sin conexión» y en Anthropic ya se ha pagado la llamada igual: el
    // trabajo estaba hecho, lo que faltó fue esperar a recogerlo.
    @set_time_limit(CLAUDE_MARGEN_PHP);

    $cuerpo = [
        'model' => CLAUDE_MODELO,
        'max_tokens' => claude_tope_salida(count($marcas)),
        'system' => claude_instrucciones($oficios),
        'messages' => [
            ['role' => 'user', 'content' => claude_mensaje($texto, $marcas, $fotos)],
        ],
        'output_config' => [
            'effort' => CLAUDE_ESFUERZO,
            'format' => [
                'type' => 'json_schema',
                'schema' => claude_esquema($oficios),
            ],
        ],
    ];

    // Si el modelo declinara por sus filtros de seguridad —improbable
    // hablando de rodapiés, pero es gratis cubrirse— la propia API
    // reintenta con otro modelo en la misma llamada.
    $respuesta = claude_pedir($clave, $cuerpo, true);
    if ($respuesta['reintentar_sin_fallback']) {
        $respuesta = claude_pedir($clave, $cuerpo, false);
    }
    $json = $respuesta['json'];

    if (($json['stop_reason'] ?? '') === 'refusal') {
        responder_error(422, 'El modelo ha declinado redactar esto. Escribe las tareas a mano.', 'declinado');
    }
    // Se quedó sin sitio a mitad de la respuesta: el JSON llega cortado y
    // no se puede leer. Se dice lo que pasó, que si no parece que el
    // modelo conteste raro cuando lo que pasa es que el recorrido es largo.
    if (($json['stop_reason'] ?? '') === 'max_tokens') {
        responder_error(502, 'El recorrido es tan largo que la respuesta se ha cortado. Divídelo en dos.', 'sin-sitio');
    }

    $texto_salida = '';
    foreach (($json['content'] ?? []) as $bloque) {
        if (($bloque['type'] ?? '') === 'text') {
            $texto_salida .= $bloque['text'];
        }
    }
    $datos = json_decode($texto_salida, true);
    if (!is_array($datos) || !isset($datos['fichas']) || !is_array($datos['fichas'])) {
        error_log('UNIK repasos · Claude devolvió algo que no encaja: ' . substr($texto_salida, 0, 400));
        responder_error(502, 'La respuesta del modelo no se ha entendido. Vuelve a intentarlo.', 'respuesta-rara');
    }

    return [
        'fichas' => $datos['fichas'],
        'gasto' => [
            'entrada' => (int) ($json['usage']['input_tokens'] ?? 0),
            'salida' => (int) ($json['usage']['output_tokens'] ?? 0),
            'modelo' => (string) ($json['model'] ?? CLAUDE_MODELO),
        ],
    ];
}

/**
 * Una llamada a la API. Devuelve el JSON ya decodificado, o corta con un
 * error legible.
 *
 * `reintentar_sin_fallback` avisa a quien llama de que el 400 venía del
 * parámetro de respaldo y no del contenido: se repite la misma petición
 * sin él en vez de dar el trabajo por perdido.
 */
function claude_pedir(string $clave, array $cuerpo, bool $con_fallback): array
{
    $cabeceras = [
        'content-type: application/json',
        'x-api-key: ' . $clave,
        'anthropic-version: 2023-06-01',
    ];
    if ($con_fallback) {
        $cuerpo['fallbacks'] = 'default';
        $cabeceras[] = 'anthropic-beta: server-side-fallback-2026-07-01';
    }

    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => $cabeceras,
        CURLOPT_POSTFIELDS => json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        // Pensar y escribir veinte tareas lleva su tiempo; el móvil
        // espera con su propio aviso mientras tanto. Se corta antes que
        // el margen de PHP a propósito: así el que avisa es este código,
        // que sabe decir qué ha pasado, y no el hosting a medias.
        CURLOPT_TIMEOUT => 240,
        CURLOPT_CONNECTTIMEOUT => 15,
    ]);
    $salida = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    curl_close($ch);

    if ($errno !== 0) {
        $motivos = [
            CURLE_COULDNT_RESOLVE_HOST => 'El servidor no puede resolver nombres: no hay DNS de salida.',
            CURLE_COULDNT_CONNECT => 'La salida a internet está cerrada en el hosting.',
            CURLE_OPERATION_TIMEDOUT => 'La llamada ha tardado demasiado y se ha cortado.',
            CURLE_SSL_CACERT => 'Faltan los certificados raíz del servidor.',
        ];
        responder_error(502, $motivos[$errno] ?? ('No se ha podido llamar a la API: ' . $error), 'sin-salida');
    }

    $json = json_decode((string) $salida, true);

    if ($codigo === 400 && $con_fallback) {
        $mensaje = (string) ($json['error']['message'] ?? '');
        if (stripos($mensaje, 'fallback') !== false || stripos($mensaje, 'beta') !== false) {
            return ['json' => null, 'reintentar_sin_fallback' => true];
        }
    }

    if ($codigo === 401) {
        responder_error(401, 'La clave de Anthropic no es válida. Vuelve a ponerla en Ajustes.', 'clave-mala');
    }
    if ($codigo === 429) {
        responder_error(429, 'La cuenta de Anthropic ha llegado a su límite. Prueba en un rato.', 'sin-cupo');
    }
    if ($codigo >= 400 || !is_array($json)) {
        $mensaje = (string) ($json['error']['message'] ?? 'respuesta inesperada');
        error_log("UNIK repasos · Claude HTTP {$codigo}: {$mensaje}");
        responder_error(502, "La API ha contestado con un error ({$codigo}).", 'api-error');
    }

    return ['json' => $json, 'reintentar_sin_fallback' => false];
}
