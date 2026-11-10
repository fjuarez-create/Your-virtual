<?php
/**
 * Las entregas: la ficha de entrega de cada vivienda (compradores,
 * revisión con el cliente, firma) y los avisos push que salen de ella.
 *
 * Una fila por vivienda, con la misma clave que la vivienda. Las fechas
 * son días sueltos (AAAA-MM-DD), sin zona horaria: «la firma es el 20»
 * es verdad en Canarias y en Madrid. Solo la revisión lleva hora.
 *
 * Quién pone las fechas: el comercial (bandera `comercial` del
 * usuario) y el administrador. El resto del equipo las ve.
 */

declare(strict_types=1);

require_once __DIR__ . '/push.php';

/** Cómo se llama una vivienda a partir de su clave, para los avisos. */
const ETIQUETA_UNIDAD = ['brassie' => 'Villa'];

/** La zona horaria de la obra: «quedan 12 días» se cuenta desde su hoy. */
const ZONA_OBRA = 'Atlantic/Canary';

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_ANO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ═══ Permisos y guardas ══════════════════════════════════════════ */

/** ¿Pone esta persona las fechas de entrega? (comercial o administrador) */
function es_comercial(array $yo): bool
{
    return $yo['rol'] === 'admin' || !empty($yo['comercial']);
}

/**
 * ¿Existe ya la tabla? En la ventana del despliegue el código puede ir
 * por delante de la base unos segundos: mejor contestar sin entregas
 * que romper la sincronización entera.
 */
function hay_entregas(): bool
{
    static $hay = null;
    if ($hay === null) {
        $hay = esquema_columnas(bd(), 'entregas') !== [];
    }
    return $hay;
}

function hay_suscripciones_push(): bool
{
    static $hay = null;
    if ($hay === null) {
        $hay = esquema_columnas(bd(), 'suscripciones_push') !== [];
    }
    return $hay;
}

/* ═══ Las que ya figuraban como entregadas ════════════════════════ */

/**
 * Hasta el 10-11-2026 la app daba una vivienda por entregada en cuanto
 * llegaba el día de su firma. Desde ese día lo dicen el comercial o el
 * administrador. Para no obligarles a marcar una a una las que ya
 * figuraban como entregadas, las que firmaron ANTES de ese día se dan
 * por entregadas aquí, una sola vez (marca en `meta`), con el día de
 * su firma. Las de ese día en adelante esperan a que alguien lo diga.
 * Cualquiera se puede deshacer después desde la app.
 */
const ENTREGADAS_DE_ANTES_HASTA = '2026-11-10';

function entregas_de_antes_al_dia(PDO $pdo): void
{
    try {
        if (revision_meta($pdo, 'entregadas_de_antes') === ENTREGADAS_DE_ANTES_HASTA) {
            return;
        }
        if (!in_array('entregada_en', esquema_columnas($pdo, 'entregas'), true)) {
            return;   // la columna llega en el siguiente arranque; se vuelve a intentar
        }
        $filas = $pdo->prepare(
            "SELECT id, firma FROM entregas
              WHERE borrada = 0 AND firma <> '' AND firma < ? AND entregada_en = '' AND entregada_fijada_en = ''"
        );
        $filas->execute([ENTREGADAS_DE_ANTES_HASTA]);
        $poner = $pdo->prepare(
            'UPDATE entregas
                SET entregada_en = ?, entregada_fijada_en = ?, entregada_por = NULL, entregada_por_nombre = ?, actualizado = ?
              WHERE id = ?'
        );
        $ahora = ahora_iso();
        $cuantas = 0;
        foreach ($filas->fetchAll() as $f) {
            // A mediodía: es el mismo día en Canarias y en la Península.
            $poner->execute([$f['firma'] . 'T12:00:00.000Z', $ahora, 'Precarga', $ahora, $f['id']]);
            $cuantas++;
        }
        revision_meta($pdo, 'entregadas_de_antes', ENTREGADAS_DE_ANTES_HASTA);
        error_log("UNIK Works · {$cuantas} vivienda(s) que firmaron antes del " . ENTREGADAS_DE_ANTES_HASTA . ' quedan como entregadas.');
    } catch (Throwable $e) {
        // No puede tumbar la app: se apunta y se vuelve a intentar.
        error_log('UNIK Works · entregadas de antes: ' . $e->getMessage());
    }
}

/* ═══ Validación de campos ════════════════════════════════════════ */

/** Un día suelto «AAAA-MM-DD» que exista de verdad, o vacío. */
function entrega_fecha($valor): string
{
    $valor = is_scalar($valor) ? trim((string) $valor) : '';
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $valor, $m)) {
        return '';
    }
    return checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? $valor : '';
}

/** Una hora «HH:MM» de reloj de veinticuatro horas, o vacío. */
function entrega_hora($valor): string
{
    $valor = is_scalar($valor) ? trim((string) $valor) : '';
    return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $valor) ? $valor : '';
}

/** Una marca ISO como las del cliente, o vacío (no «ahora»: vacío es «no ha pasado»). */
function entrega_sello($valor): string
{
    $valor = is_scalar($valor) ? (string) $valor : '';
    return $valor === '' ? '' : iso($valor, '');
}

/** La clave de una vivienda: «brassie:07». */
function es_unidad(string $valor): bool
{
    return (bool) preg_match('/^[a-z0-9-]{1,40}:[a-z0-9-]{1,40}$/', $valor);
}

/* ═══ Guardar ═════════════════════════════════════════════════════ */

/**
 * Los hechos de una ficha. Cada uno lleva su sello (cuándo se tocó por
 * última vez, en el móvil) y, menos los compradores, su autor. Se
 * funden uno a uno, no la fila entera: el comercial y el administrador
 * tocan la misma ficha desde móviles distintos, y con una sola marca
 * para toda la fila el que subiera el último pisaría lo del otro
 * —reproducido en el banco antes de hacerlo así—.
 */
const ENTREGA_HECHOS = [
    'compradores' => ['sello' => 'compradores_fijados_en', 'campos' => ['compradores'], 'autor' => null],
    'revision'    => ['sello' => 'revision_fijada_en', 'campos' => ['revision', 'revision_hora'], 'autor' => 'revision_por'],
    'firma'       => ['sello' => 'firma_fijada_en', 'campos' => ['firma', 'firma_hora'], 'autor' => 'firma_por'],
    'revisada'    => ['sello' => 'revisada_fijada_en', 'campos' => ['revisada_en'], 'autor' => 'revisada_por'],
    // Que la vivienda se ha entregado no lo dice la fecha de la firma:
    // lo dice el comercial o el administrador (Fran, 10-11-2026).
    'entregada'   => ['sello' => 'entregada_fijada_en', 'campos' => ['entregada_en'], 'autor' => 'entregada_por'],
];

/** Lo que manda el cliente para cada sello, en camelCase. */
const ENTREGA_SELLOS_CLIENTE = [
    'compradores' => 'compradoresFijadosEn',
    'revision'    => 'revisionFijadaEn',
    'firma'       => 'firmaFijadaEn',
    'revisada'    => 'revisadaFijadaEn',
    'entregada'   => 'entregadaFijadaEn',
];

/** Una marca ISO venga como venga; si no vale, ahora. */
function entrega_iso($valor): string
{
    return iso(is_scalar($valor) ? (string) $valor : null);
}

/**
 * Quién firma un hecho que el móvil acaba de subir. Normalmente la
 * sesión; pero en el móvil de obra entra hoy uno y mañana otro, y lo
 * que dejó pendiente Ezequiel sin cobertura lo sube la sesión de quien
 * venga detrás. Si el móvil dice quién fue y esa persona existe y
 * puede poner fechas, se le cree; si no, firma la sesión.
 */
function entrega_autor(array $e, string $hecho, array $yo): array
{
    static $consulta = null;
    static $vistos = [];
    $id = $e["{$hecho}Por"] ?? null;
    if (is_string($id) && es_uuid($id) && $id !== $yo['id']) {
        if (!array_key_exists($id, $vistos)) {
            $consulta ??= bd()->prepare('SELECT nombre, rol, comercial FROM usuarios WHERE id = ? AND activo = 1');
            $consulta->execute([$id]);
            $fila = $consulta->fetch() ?: null;
            $vistos[$id] = ($fila && es_comercial($fila)) ? (string) $fila['nombre'] : null;
        }
        if ($vistos[$id] !== null) {
            return ['id' => $id, 'nombre' => $vistos[$id]];
        }
    }
    return ['id' => es_uuid($yo['id']) ? $yo['id'] : null, 'nombre' => (string) $yo['nombre']];
}

/**
 * POST /entregas · { entregas: [ … ] }
 *
 * Solo el comercial o el administrador guardan. De cada ficha que llega
 * se mira hecho por hecho: si el sello del móvil es más nuevo que el
 * guardado, se adopta lo suyo y se firma; si no, se conserva lo que
 * había (y no se avisa de nada). El cuándo se le cree al móvil, que es
 * quien sabe cuándo se tocó (puede llegar horas después, sin
 * cobertura); la marca de la fila sube siempre al menos hasta ahora,
 * para que los demás móviles se la bajen aunque el cambio venga de
 * ayer.
 */
function guardar_entregas(): void
{
    $yo = exigir_sesion();
    if (!hay_entregas()) {
        responder_error(503, 'La base de datos aún no tiene las entregas. Vuelve a intentarlo en un momento.', 'esquema');
    }
    if (!es_comercial($yo)) {
        responder_error(403, 'Las fechas de entrega las pone el comercial o el administrador.', 'permiso');
    }
    $entrada = cuerpo()['entregas'] ?? [];
    if (!is_array($entrada)) {
        responder_error(400, 'Formato incorrecto.', 'formato');
    }

    $guardadas = 0;
    $avisados = 0;
    $previa = bd()->prepare('SELECT * FROM entregas WHERE id = ?');
    foreach ($entrada as $e) {
        if (!is_array($e)) {
            continue;
        }
        $unidad = texto($e, 'unidadId', 80);
        if (!es_unidad($unidad) || texto($e, 'id', 80) !== $unidad) {
            continue;
        }
        $promo = texto($e, 'promoId', 60);
        if ($promo === '') {
            $promo = explode(':', $unidad)[0];
        }

        $previa->execute([$unidad]);
        $antes = $previa->fetch() ?: null;

        // Lo que manda el móvil, ya saneado.
        $llega = [
            'compradores'   => texto($e, 'compradores', 160),
            'revision'      => entrega_fecha($e['revision'] ?? ''),
            'revision_hora' => entrega_hora($e['revisionHora'] ?? ''),
            'firma'         => entrega_fecha($e['firma'] ?? ''),
            'firma_hora'    => entrega_hora($e['firmaHora'] ?? ''),
            'revisada_en'   => entrega_sello($e['revisadaEn'] ?? ''),
            'entregada_en'  => entrega_sello($e['entregadaEn'] ?? ''),
        ];
        // Una hora sin fecha no significa nada.
        if ($llega['revision'] === '') {
            $llega['revision_hora'] = '';
        }
        if ($llega['firma'] === '') {
            $llega['firma_hora'] = '';
        }

        $ahora = ahora_iso();
        $registro = [
            'id'            => $unidad,
            'unidad_id'     => $unidad,
            'promo_id'      => $promo,
            'borrada'       => booleano($e, 'borrada') ? 1 : 0,
            'creado'        => $antes ? (string) $antes['creado'] : entrega_iso($e['creado'] ?? null),
            'actualizado'   => max((string) ($antes['actualizado'] ?? ''), entrega_iso($e['actualizado'] ?? null), $ahora),
            // La ficha la firma quien la abrió; después ya no cambia.
            'creado_por'        => $antes ? $antes['creado_por'] : (es_uuid($yo['id']) ? $yo['id'] : null),
            'creado_por_nombre' => $antes ? (string) $antes['creado_por_nombre'] : (string) $yo['nombre'],
        ];

        $adoptados = 0;
        foreach (ENTREGA_HECHOS as $hecho => $def) {
            $selloMovil = entrega_sello($e[ENTREGA_SELLOS_CLIENTE[$hecho]] ?? '');
            $selloGuardado = $antes ? (string) ($antes[$def['sello']] ?? '') : '';
            if ($selloMovil !== '' && $selloMovil > $selloGuardado) {
                foreach ($def['campos'] as $campo) {
                    $registro[$campo] = $llega[$campo];
                }
                $registro[$def['sello']] = $selloMovil;
                if ($def['autor']) {
                    $autor = entrega_autor($e, $hecho, $yo);
                    $registro[$def['autor']] = $autor['id'];
                    $registro["{$def['autor']}_nombre"] = $autor['nombre'];
                }
                $adoptados++;
            } else {
                foreach ($def['campos'] as $campo) {
                    $registro[$campo] = $antes ? (string) ($antes[$campo] ?? '') : '';
                }
                $registro[$def['sello']] = $selloGuardado;
                if ($def['autor']) {
                    $registro[$def['autor']] = $antes ? ($antes[$def['autor']] ?? null) : null;
                    $registro["{$def['autor']}_nombre"] = $antes ? (string) ($antes["{$def['autor']}_nombre"] ?? '') : '';
                }
            }
        }
        // Nada nuevo sobre lo guardado: ni se toca ni se avisa.
        if ($antes && $adoptados === 0 && (int) $antes['borrada'] === $registro['borrada']) {
            continue;
        }

        upsert('entregas', $registro);
        $guardadas++;
        if (!$registro['borrada']) {
            $avisados += entregas_avisar($antes, $registro, $yo);
        }
    }
    responder(['guardadas' => $guardadas, 'avisados' => $avisados]);
}

/** La ficha tal como viaja al cliente. */
function entrega_salida(array $f): array
{
    return [
        'id' => $f['id'], 'unidadId' => $f['unidad_id'], 'promoId' => $f['promo_id'],
        'compradores' => (string) ($f['compradores'] ?? ''),
        'revision' => (string) ($f['revision'] ?? ''),
        'revisionHora' => (string) ($f['revision_hora'] ?? ''),
        'firma' => (string) ($f['firma'] ?? ''),
        'firmaHora' => (string) ($f['firma_hora'] ?? ''),
        'revisadaEn' => (string) ($f['revisada_en'] ?? ''),
        'revisionFijadaEn' => (string) ($f['revision_fijada_en'] ?? ''),
        'revisionPor' => $f['revision_por'] ?? null,
        'revisionPorNombre' => (string) ($f['revision_por_nombre'] ?? ''),
        'firmaFijadaEn' => (string) ($f['firma_fijada_en'] ?? ''),
        'firmaPor' => $f['firma_por'] ?? null,
        'firmaPorNombre' => (string) ($f['firma_por_nombre'] ?? ''),
        'compradoresFijadosEn' => (string) ($f['compradores_fijados_en'] ?? ''),
        'revisadaFijadaEn' => (string) ($f['revisada_fijada_en'] ?? ''),
        'revisadaPor' => $f['revisada_por'] ?? null,
        'revisadaPorNombre' => (string) ($f['revisada_por_nombre'] ?? ''),
        'entregadaEn' => (string) ($f['entregada_en'] ?? ''),
        'entregadaFijadaEn' => (string) ($f['entregada_fijada_en'] ?? ''),
        'entregadaPor' => $f['entregada_por'] ?? null,
        'entregadaPorNombre' => (string) ($f['entregada_por_nombre'] ?? ''),
        'borrada' => (int) ($f['borrada'] ?? 0) === 1,
        'creado' => $f['creado'], 'actualizado' => $f['actualizado'],
        'creadoPor' => $f['creado_por'] ?? null,
        'creadoPorNombre' => (string) ($f['creado_por_nombre'] ?? ''),
    ];
}

/* ═══ ¿Está hecha la revisión? ════════════════════════════════════ */

/**
 * ¿Está hecha la revisión que figura en la ficha? La marca «hecha»
 * vale para la cita que había cuando se puso. Si después alguien fija
 * una fecha de revisión NUEVA y posterior a aquel día, es otra cita y
 * está pendiente. Lo vio el comercial el 10-11-2026: puso una revisión
 * en dos villas que ya tenían hecha la visita de cortesía y le salían
 * en verde, como hechas. Es la misma regla que revisionHecha() en
 * js/entregas.js: si se toca una, se toca la otra.
 */
function entrega_revision_hecha(array $f): bool
{
    $hecha = (string) ($f['revisada_en'] ?? '');
    if ($hecha === '') {
        return false;
    }
    $revision = (string) ($f['revision'] ?? '');
    if ($revision === '') {
        return true;
    }
    $marcada = (string) ($f['revisada_fijada_en'] ?? '');
    if ($marcada === '') {
        $marcada = $hecha;
    }
    try {
        $diaHecha = (new DateTimeImmutable($hecha))->setTimezone(new DateTimeZone(ZONA_OBRA))->format('Y-m-d');
    } catch (Throwable $e) {
        return true;
    }
    return !((string) ($f['revision_fijada_en'] ?? '') > $marcada && $revision > $diaHecha);
}

/* ═══ Los avisos ══════════════════════════════════════════════════ */

/** «Villa 22» a partir de «brassie:22». */
function nombre_de_unidad(string $unidadId): string
{
    [$promo, $numero] = array_pad(explode(':', $unidadId, 2), 2, '');
    $etiqueta = ETIQUETA_UNIDAD[$promo] ?? 'Vivienda';
    return trim($etiqueta . ' ' . $numero);
}

/** «miércoles 18 de noviembre». */
function fecha_bonita(string $dia, bool $conDia = true): string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dia, $m)) {
        return $dia;
    }
    $fecha = new DateTimeImmutable($dia, new DateTimeZone(ZONA_OBRA));
    $texto = ((int) $m[3]) . ' de ' . MESES_ANO[(int) $m[2] - 1];
    return $conDia ? DIAS_SEMANA[(int) $fecha->format('w')] . ' ' . $texto : $texto;
}

/** Días enteros desde el hoy de la obra hasta ese día (negativo si pasó). */
function dias_hasta(string $dia, int $ahora): int
{
    $zona = new DateTimeZone(ZONA_OBRA);
    $hoy = (new DateTimeImmutable('@' . $ahora))->setTimezone($zona)->setTime(0, 0);
    $destino = new DateTimeImmutable($dia, $zona);
    return (int) $hoy->diff($destino)->format('%r%a');
}

/** «miércoles 18», para el título del aviso. */
function fecha_corta_bonita(string $dia): string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dia, $m)) {
        return $dia;
    }
    $fecha = new DateTimeImmutable($dia, new DateTimeZone(ZONA_OBRA));
    return DIAS_SEMANA[(int) $fecha->format('w')] . ' ' . ((int) $m[3]);
}

/** «Quedan 12 días para dejarla impecable.» · «Es hoy. Toca dejarla impecable.» */
function frase_de_cuenta(int $dias, string $cola, string $hoy): string
{
    if ($dias < 0) {
        return '';
    }
    if ($dias === 0) {
        return "Es hoy. {$hoy}";
    }
    if ($dias === 1) {
        return "Queda 1 día para {$cola}.";
    }
    return "Quedan {$dias} días para {$cola}.";
}

/** El nombre de pila de quien hizo el cambio. */
function nombre_de_pila(string $nombre): string
{
    $partes = preg_split('/\s+/', trim($nombre)) ?: [];
    return $partes[0] !== '' ? $partes[0] : 'Alguien';
}

/**
 * Qué aviso merece el cambio, si alguno. Uno por guardado: si en la
 * misma hoja se tocan la revisión y la firma, manda la revisión (es la
 * cita con persona); si se da por hecha, manda eso.
 */
function entregas_aviso(?array $antes, array $ahora, array $yo, int $momento): ?array
{
    $villa = nombre_de_unidad($ahora['unidad_id']);
    $compradores = trim((string) $ahora['compradores']);
    $ruta = '#/p/' . rawurlencode($ahora['promo_id']) . '/v/' . rawurlencode(explode(':', $ahora['unidad_id'], 2)[1] ?? '');
    // Quien hizo el hecho, que no siempre es la sesión que lo sube (el
    // móvil de obra): el aviso le nombra a él y no se le manda a él.
    $autor = static function (string $hecho) use ($ahora, $yo): array {
        $id = $ahora["{$hecho}_por"] ?? null;
        $nombre = (string) ($ahora["{$hecho}_por_nombre"] ?? '');
        if ($nombre === '') {
            $id = es_uuid($yo['id']) ? $yo['id'] : null;
            $nombre = (string) $yo['nombre'];
        }
        return ['autor' => is_string($id) && es_uuid($id) ? $id : null, 'quien' => nombre_de_pila($nombre)];
    };
    $base = ['ruta' => $ruta, 'etiqueta' => 'entrega-' . $ahora['unidad_id']];

    // Entregada: es el hecho que cierra la ficha, y manda sobre los demás.
    if ((string) ($antes['entregada_en'] ?? '') === '' && (string) ($ahora['entregada_en'] ?? '') !== '') {
        ['autor' => $base['autor'], 'quien' => $quien] = $autor('entregada');
        return $base + [
            'titulo' => "{$villa} · entregada",
            'texto' => $compradores !== ''
                ? "{$quien} ha apuntado la entrega de llaves a {$compradores}."
                : "{$quien} ha apuntado la entrega de llaves.",
        ];
    }

    // Se avisa cada vez que alguien da una revisión por hecha: la
    // primera, y también la de una cita nueva en una vivienda que ya
    // tenía otra hecha (cambia el cuándo de la marca).
    $revisadaAntes = (string) ($antes['revisada_en'] ?? '');
    if ($ahora['revisada_en'] !== '' && $ahora['revisada_en'] !== $revisadaAntes) {
        ['autor' => $base['autor'], 'quien' => $quien] = $autor('revisada');
        return $base + [
            'titulo' => "{$villa} · revisada con el cliente",
            'texto' => $compradores !== ''
                ? "{$quien} ha dado por hecha la visita con {$compradores}. Lo que haya salido va al parte post-entrega."
                : "{$quien} ha dado por hecha la visita con el cliente. Lo que haya salido va al parte post-entrega.",
        ];
    }

    $revisionAntes = (string) ($antes['revision'] ?? '') . '|' . (string) ($antes['revision_hora'] ?? '');
    $revisionAhora = $ahora['revision'] . '|' . $ahora['revision_hora'];
    if ($ahora['revision'] !== '' && $revisionAntes !== $revisionAhora && !entrega_revision_hecha($ahora)) {
        ['autor' => $base['autor'], 'quien' => $quien] = $autor('revision');
        $cuando = fecha_bonita($ahora['revision']);
        $hora = $ahora['revision_hora'] !== '' ? " a las {$ahora['revision_hora']}" : '';
        $con = $compradores !== '' ? $compradores : 'el cliente';
        $cuenta = frase_de_cuenta(dias_hasta($ahora['revision'], $momento), 'dejarla impecable', 'Toca dejarla impecable.');
        return $base + [
            'titulo' => "{$villa} · revisión el " . fecha_corta_bonita($ahora['revision']),
            'texto' => trim("{$quien} ha fijado la visita con {$con} para el {$cuando}{$hora}. {$cuenta}"),
        ];
    }

    $firmaAntes = (string) ($antes['firma'] ?? '') . '|' . (string) ($antes['firma_hora'] ?? '');
    $firmaAhora = $ahora['firma'] . '|' . (string) ($ahora['firma_hora'] ?? '');
    // En una vivienda ya entregada, corregir el día o la hora de la firma
    // es poner bien un dato del pasado: no se avisa de «firma nueva».
    // Salvo que la firma pase a un día que aún no ha llegado: entonces es
    // que la marca de entregada estaba mal, y la fecha sí es noticia.
    $esDelPasado = (string) ($ahora['entregada_en'] ?? '') !== '' && dias_hasta($ahora['firma'] !== '' ? $ahora['firma'] : '1970-01-01', $momento) <= 0;
    if ($ahora['firma'] !== '' && $firmaAntes !== $firmaAhora && !$esDelPasado) {
        ['autor' => $base['autor'], 'quien' => $quien] = $autor('firma');
        $cuando = fecha_bonita($ahora['firma'])
            . ((string) ($ahora['firma_hora'] ?? '') !== '' ? " a las {$ahora['firma_hora']}" : '');
        $cuenta = frase_de_cuenta(dias_hasta($ahora['firma'], $momento), 'que no quede ni un repaso', 'Que no quede ni un repaso.');
        $texto = $compradores !== ''
            ? "{$quien} ha puesto fecha a la entrega de llaves a {$compradores}: el {$cuando}. {$cuenta}"
            : "{$quien} ha puesto fecha a la entrega de llaves: el {$cuando}. {$cuenta}";
        return $base + [
            'titulo' => "{$villa} · firma el " . fecha_corta_bonita($ahora['firma']),
            'texto' => trim($texto),
        ];
    }

    return null;
}

/** Avisa al equipo del cambio, menos a quien lo ha hecho. Devuelve cuántos. */
function entregas_avisar(?array $antes, array $ahora, array $yo): int
{
    $aviso = entregas_aviso($antes, $ahora, $yo, time());
    if ($aviso === null) {
        return 0;
    }
    $excepto = $aviso['autor'] ?? (es_uuid($yo['id']) ? $yo['id'] : null);
    unset($aviso['autor']);   // no viaja en el aviso
    return push_avisar($aviso, $excepto);
}

/* ═══ Suscripciones push ══════════════════════════════════════════ */

/** Las claves VAPID, generadas la primera vez y guardadas en meta. */
function push_claves(): array
{
    $publica = meta_valor('push_publica');
    $privada = meta_valor('push_privada');
    if ($publica === null || $privada === null || $publica === '' || $privada === '') {
        // Dos primeros «Activar» a la vez generarían dos parejas y el
        // último en escribir ganaría, dejando al otro móvil atado a una
        // clave que ya no existe. Se INSERTA (no se reemplaza): si otro
        // llegó antes, el INSERT choca y se lee lo suyo.
        $nuevas = push_generar_claves();
        $pdo = bd();
        try {
            $pdo->beginTransaction();
            $pdo->prepare('DELETE FROM meta WHERE clave IN (?, ?)')->execute(['push_publica', 'push_privada']);
            $poner = $pdo->prepare('INSERT INTO meta (clave, valor) VALUES (?, ?)');
            $poner->execute(['push_publica', $nuevas['publica']]);
            $poner->execute(['push_privada', $nuevas['privada']]);
            $pdo->commit();
            return $nuevas;
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $publica = meta_valor('push_publica');
            $privada = meta_valor('push_privada');
            if ($publica === null || $privada === null || $publica === '' || $privada === '') {
                throw $e;
            }
        }
    }
    return ['publica' => $publica, 'privada' => $privada];
}

/** GET /push/clave · la pública, que es lo que necesita el navegador. */
function push_clave_publica(): void
{
    exigir_sesion();
    responder(['publica' => push_claves()['publica'], 'disponible' => hay_suscripciones_push()]);
}

/**
 * POST /push/suscripcion · { endpoint, p256dh, auth }
 * Un navegador, una fila. Si ya estaba, se le pone el usuario de ahora:
 * en un móvil de obra entra hoy uno y mañana otro.
 */
function push_suscribir(): void
{
    $yo = exigir_sesion();
    if (!hay_suscripciones_push()) {
        responder_error(503, 'La base de datos aún no tiene las suscripciones. Vuelve a intentarlo en un momento.', 'esquema');
    }
    $d = cuerpo();
    $endpoint = texto($d, 'endpoint', 2000);
    $p256dh = texto($d, 'p256dh', 120);
    $auth = texto($d, 'auth', 40);
    if (!push_endpoint_valido($endpoint)
        || strlen(push_desde_base64url($p256dh)) !== 65 || strlen(push_desde_base64url($auth)) !== 16) {
        responder_error(400, 'La suscripción no es válida.', 'suscripcion');
    }
    $id = hash('sha256', $endpoint);
    $agente = mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
    $ahora = ahora_iso();
    $usuario = es_uuid($yo['id']) ? $yo['id'] : null;

    $hay = bd()->prepare('SELECT 1 FROM suscripciones_push WHERE id = ?');
    $hay->execute([$id]);
    if ($hay->fetchColumn()) {
        bd()->prepare('UPDATE suscripciones_push SET usuario_id = ?, p256dh = ?, auth = ?, agente = ?, fallos = 0, actualizado = ? WHERE id = ?')
            ->execute([$usuario, $p256dh, $auth, $agente, $ahora, $id]);
    } else {
        bd()->prepare('INSERT INTO suscripciones_push (id, usuario_id, endpoint, p256dh, auth, agente, fallos, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
            ->execute([$id, $usuario, $endpoint, $p256dh, $auth, $agente, $ahora, $ahora]);
    }
    responder(['ok' => true]);
}

/**
 * ¿Es un endpoint al que el servidor puede mandar avisos? Solo https
 * al puerto normal, con nombre (no una IP) y que no apunte a la propia
 * máquina ni a la red interna del hosting: el endpoint lo pone el
 * navegador de cada usuario, y un servidor que abre conexiones a lo
 * que le digan es una sonda de puertos gratis.
 */
function push_endpoint_valido(string $endpoint): bool
{
    $partes = parse_url($endpoint);
    if (!$partes || ($partes['scheme'] ?? '') !== 'https' || empty($partes['host'])
        || isset($partes['user']) || isset($partes['pass'])
        || (isset($partes['port']) && (int) $partes['port'] !== 443)) {
        return false;
    }
    $host = strtolower(trim(rtrim($partes['host'], '.'), '[]'));
    // Un nombre de verdad: etiquetas con punto y una letra al final
    // (fuera quedan las IP, también en hexadecimal u octal, y los
    // literales IPv6 entre corchetes).
    if (!preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)+$/', $host) || !preg_match('/[a-z]/', substr($host, (int) strrpos($host, '.')))
        || $host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local')
        || str_ends_with($host, '.internal') || filter_var($host, FILTER_VALIDATE_IP) !== false) {
        return false;
    }
    // Si resuelve (A o AAAA) a una dirección privada o reservada, no.
    // Si no resuelve (DNS caído, banco de pruebas), se deja pasar: el
    // envío fallará y la suscripción se irá sola con los fallos.
    $registros = [];
    try {
        $registros = @dns_get_record($host, DNS_A | DNS_AAAA) ?: [];
    } catch (Throwable $e) {
        $registros = [];
    }
    foreach ($registros as $r) {
        $ip = (string) ($r['ip'] ?? $r['ipv6'] ?? '');
        if ($ip !== '' && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
    }
    return true;
}

/** DELETE /push/suscripcion · { endpoint } */
function push_baja(): void
{
    exigir_sesion();
    if (!hay_suscripciones_push()) {
        responder(['ok' => true]);
    }
    $endpoint = texto(cuerpo(), 'endpoint', 2000);
    if ($endpoint !== '') {
        bd()->prepare('DELETE FROM suscripciones_push WHERE id = ?')->execute([hash('sha256', $endpoint)]);
    }
    responder(['ok' => true]);
}

/** POST /push/prueba · un aviso a los móviles de quien lo pide, para ver que llega. */
function push_prueba(): void
{
    $yo = exigir_sesion();
    if (!hay_suscripciones_push()) {
        responder_error(503, 'La base de datos aún no tiene las suscripciones.', 'esquema');
    }
    $stmt = bd()->prepare('SELECT * FROM suscripciones_push WHERE usuario_id = ?');
    $stmt->execute([$yo['id']]);
    $mias = $stmt->fetchAll();
    if (!$mias) {
        responder_error(404, 'Este usuario no tiene ningún móvil apuntado a los avisos.', 'sin-suscripcion');
    }
    $enviados = push_repartir($mias, [
        'titulo' => 'UNIK Works · avisos activados',
        'texto' => 'Así te llegarán las fechas de entrega y las revisiones con el cliente.',
        'ruta' => '#/entregas',
        'etiqueta' => 'prueba',
    ]);
    responder(['enviados' => $enviados, 'moviles' => count($mias)]);
}

/** Avisa a todos los móviles apuntados, menos a los de una persona. */
function push_avisar(array $carga, ?string $exceptoUsuario): int
{
    if (!hay_suscripciones_push()) {
        return 0;
    }
    if ($exceptoUsuario !== null) {
        $stmt = bd()->prepare('SELECT * FROM suscripciones_push WHERE usuario_id IS NULL OR usuario_id <> ?');
        $stmt->execute([$exceptoUsuario]);
    } else {
        $stmt = bd()->query('SELECT * FROM suscripciones_push');
    }
    return push_repartir($stmt->fetchAll(), $carga);
}

/**
 * El reparto: cifra, firma y manda a cada móvil, todos a la vez. Las
 * suscripciones que el servicio da por muertas (404/410) se borran; un
 * fallo pasajero suma uno, y a la octava se da por perdida.
 */
function push_repartir(array $suscripciones, array $carga): int
{
    if (!$suscripciones) {
        return 0;
    }
    try {
        $claves = push_claves();
    } catch (Throwable $e) {
        error_log('UNIK repasos · sin claves push: ' . $e->getMessage());
        return 0;
    }
    try {
        $resultados = push_enviar_varias($suscripciones, $carga, $claves, time());
    } catch (Throwable $e) {
        // La clave del servidor, no los móviles: no se toca ninguna fila.
        error_log('UNIK repasos · reparto push abortado: ' . $e->getMessage());
        return 0;
    }
    $enviados = 0;
    $borrar = bd()->prepare('DELETE FROM suscripciones_push WHERE id = ?');
    $fallar = bd()->prepare('UPDATE suscripciones_push SET fallos = fallos + 1 WHERE id = ?');
    $sanar = bd()->prepare('UPDATE suscripciones_push SET fallos = 0 WHERE id = ? AND fallos <> 0');
    foreach ($suscripciones as $s) {
        $r = $resultados[$s['id']] ?? ['codigo' => 0, 'caducada' => false];
        if ($r['codigo'] >= 200 && $r['codigo'] < 300) {
            $enviados++;
            $sanar->execute([$s['id']]);
        } elseif ($r['caducada'] || in_array($r['codigo'], [401, 403], true) || (int) ($s['fallos'] ?? 0) >= 7) {
            // 401/403: el servicio no reconoce nuestra clave para esa
            // suscripción (cambió la pareja VAPID): se retira y el móvil
            // se vuelve a apuntar solo en su siguiente arranque.
            $borrar->execute([$s['id']]);
        } else {
            $fallar->execute([$s['id']]);
            if (!empty($r['error'])) {
                error_log('UNIK repasos · push sin entregar (' . $r['codigo'] . '): ' . $r['error']);
            }
        }
    }
    return $enviados;
}
