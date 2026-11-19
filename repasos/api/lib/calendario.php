<?php
/**
 * calendario.php — las firmas y las visitas de la app, en el Google
 * Calendar del administrador (lo pidió la casa el 19-11-2026: «que las
 * firmas en notaría y visitas se me pongan automáticamente en Google
 * Calendar»; y después, «es solo para mí»).
 *
 * CÓMO FUNCIONA. Google Calendar sabe suscribirse a un calendario por
 * su dirección («Otros calendarios → Desde URL») y lo vuelve a leer solo,
 * varias veces al día. Así que aquí no se manda nada a Google: se sirven
 * dos calendarios en el formato de siempre de los calendarios (RFC 5545),
 * uno con las firmas y otro con las visitas, para que en Google tengan
 * cada uno su color:
 *
 *   GET …/api/calendario/<clave>/firmas     «UNIK · Firmas»
 *   GET …/api/calendario/<clave>/visitas    «UNIK · Visitas»
 *
 * (también con «.ics» al final; ver calendario_enlaces_salida()).
 *
 * Esas dos rutas van SIN SESIÓN: quien las pide son las máquinas de
 * Google, que no tienen cookie. Lo que abre la puerta es la clave que va
 * en la dirección: 24 bytes al azar (48 cifras hexadecimales), una por
 * persona, en la tabla `calendario_enlaces` (esquema 25). Nunca como
 * columna de la tabla de personas: el directorio viaja entero a todos
 * los móviles, y la clave de cada uno acabaría en el móvil de todos.
 * Esa tabla no es ninguna de las siete que bajan a los móviles.
 *
 * QUIÉN. Solo el administrador: pedir sus enlaces y anularlos son dos
 * puertas con sesión que contestan 403 a cualquier otro. Y en cada
 * lectura sin sesión se vuelve a mirar a la persona: si ya no existe,
 * está desactivada o ha dejado de ser administradora, su enlace da 404
 * (y además la baja, la desactivación y el cambio de rol borran su fila:
 * calendario_olvidar(), desde index.php). Una clave mala, anulada o
 * inventada da exactamente el mismo 404, corto y sin pistas.
 *
 * QUÉ SALE. Lo mismo que pinta el calendario de la app (#/entregas),
 * con LAS MISMAS REGLAS, que aquí van DUPLICADAS: hitosDe() y
 * revisionHecha(), visitaMarcada(), todasLasVisitas() y diaEntregada() de
 * js/entregas.js, y visitasDelCalendario() y citaPendiente() de
 * js/posventa.js. OJO: si se cambia una regla allí, hay que cambiarla
 * aquí también (y al revés), y pasar la prueba de paridad, que compara
 * en el navegador lo que pinta la app con lo que sale de aquí.
 *
 *   Firmas    la firma de cada vivienda; ya entregada, «✓ Entregada»,
 *             o «Entregada con incidencias».
 *   Visitas   la revisión con el cliente (prevista y hechas: TODAS las
 *             del historial), y la visita de repasos de Postventa (la
 *             cita y cada visita con su conforme firmado). Una revisión
 *             que cae DESPUÉS de la entrega cuenta como visita de
 *             repasos. Los repasos de las visitas NO salen.
 *
 * Lo que en la app lleva hora (la firma, la revisión prevista y la cita
 * de la visita de repasos) sale con su hora y dura UNA hora (lo dijo la
 * casa: «las notarías son de 1 hora y las visitas de 1 hora también»).
 * Lo que no la lleva (lo ya hecho, lo entregado) sale de todo el día.
 * Las horas de la app son de Canarias: aquí se escriben en UTC, ya
 * convertidas, para que el cambio de hora de verano salga bien.
 *
 * Cada evento lleva un UID ESTABLE: al cambiar una fecha, Google MUEVE
 * el evento en vez de duplicarlo. Y todo va en una sola tanda de cuatro
 * consultas, sin una por villa.
 *
 * Este fichero se carga con red (is_file) desde index.php, y toda
 * llamada a lo de aquí va detrás de function_exists(): al publicar, los
 * ficheros de api/ suben varios a la vez y sin orden.
 */
declare(strict_types=1);

/** Bytes al azar de cada clave: salen 48 cifras hexadecimales en el enlace. */
const CALENDARIO_CLAVE_BYTES = 24;

/**
 * Las promociones que enseña el calendario de la app, con su nombre: las
 * de PROMOCIONES con `activa: true` en js/catalog.js. El servidor no
 * guarda el catálogo (vive en el cliente), así que si se activa otra,
 * hay que ponerla también aquí.
 */
const CALENDARIO_PROMOCIONES = ['brassie' => 'Brassie'];

/** Los dos calendarios: el último trozo de la dirección y el nombre con que salen en Google. */
const CALENDARIO_NOMBRES = ['firmas' => 'UNIK · Firmas', 'visitas' => 'UNIK · Visitas'];

/**
 * El dominio de los UID: el de la app de verdad, y otro para el taller,
 * para que los eventos de las dos no se confundan nunca en un mismo
 * Google Calendar aunque alguien se suscriba a las dos.
 */
const CALENDARIO_DOMINIO = 'repasos.unikdi.com';
const CALENDARIO_DOMINIO_TALLER = 'taller.repasos.unikdi.com';

/**
 * Las fases de lista que importan aquí, por sus bytes: en MariaDB un
 * «= 'visita'» no distingue mayúsculas ni tildes y se dejaba engañar
 * (ver CLAUDE.md). Son las cifras de HEX('visita') y de HEX('post').
 */
const CALENDARIO_FASE_VISITA_HEX = '766973697461';
const CALENDARIO_FASE_POST_HEX = '706F7374';

/** Los rótulos de cada clase de evento: los del Día del calendario de la app. */
const CALENDARIO_ROTULOS = [
    'firma'       => 'Firma',
    'entregada'   => '✓ Entregada',
    'incidencia'  => 'Entregada con incidencias',
    'revision'    => 'Revisión con el cliente',
    'revisada'    => '✓ Revisión hecha',
    'visita'      => 'Visita de repasos',
    'visitaHecha' => '✓ Visita de repasos hecha',
];

/** En qué calendario va cada clase de evento. */
const CALENDARIO_DE_HITO = [
    'firma' => 'firmas', 'entregada' => 'firmas', 'incidencia' => 'firmas',
    'revision' => 'visitas', 'revisada' => 'visitas', 'visita' => 'visitas', 'visitaHecha' => 'visitas',
];

const CALENDARIO_MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ═══ La tabla y las claves ═══════════════════════════════════════ */

/** ¿Existe ya la tabla? En la ventana del despliegue el código puede llegar antes que la migración. */
function calendario_hay_tabla(): bool
{
    static $hay = null;
    if ($hay === null) {
        // La base se abre ANTES de nombrar esquema_columnas(): esa función
        // vive en lib/esquema.php, que solo se carga al abrir la base, y en
        // la ruta sin sesión nadie la ha abierto todavía.
        $bd = bd();
        $hay = esquema_columnas($bd, 'calendario_enlaces') !== [];
    }
    return $hay;
}

/** ¿Tiene la forma de una clave de las de aquí? Solo minúsculas: así MariaDB no puede dar por igual otra escrita en mayúsculas. */
function calendario_es_clave(string $valor): bool
{
    return (bool) preg_match('/^[0-9a-f]{' . (2 * CALENDARIO_CLAVE_BYTES) . '}$/D', $valor);
}

/** La clave de una persona, o null si no tiene. */
function calendario_clave_de(string $usuarioId): ?string
{
    $sent = bd()->prepare('SELECT clave FROM calendario_enlaces WHERE usuario_id = ?');
    $sent->execute([$usuarioId]);
    $clave = $sent->fetchColumn();
    $sent->closeCursor();   // la lectura se suelta antes de escribir (ver upsert)
    return is_string($clave) && calendario_es_clave($clave) ? $clave : null;
}

/**
 * Le pone a una persona una clave nueva y la devuelve. Con `$renovar`,
 * la de antes deja de valer en el mismo instante; sin él, solo se crea
 * si no tenía (si otra petición la creó a la vez, vale la de esa).
 */
function calendario_poner_clave(string $usuarioId, bool $renovar): string
{
    $bd = bd();
    $clave = bin2hex(random_bytes(CALENDARIO_CLAVE_BYTES));
    if ($renovar) {
        $bd->beginTransaction();
        try {
            $bd->prepare('DELETE FROM calendario_enlaces WHERE usuario_id = ?')->execute([$usuarioId]);
            $bd->prepare('INSERT INTO calendario_enlaces (usuario_id, clave, creado) VALUES (?, ?, ?)')
                ->execute([$usuarioId, $clave, ahora_iso()]);
            $bd->commit();
        } catch (Throwable $e) {
            $bd->rollBack();
            throw $e;
        }
        return $clave;
    }
    try {
        $bd->prepare('INSERT INTO calendario_enlaces (usuario_id, clave, creado) VALUES (?, ?, ?)')
            ->execute([$usuarioId, $clave, ahora_iso()]);
        return $clave;
    } catch (PDOException $e) {
        $ya = calendario_clave_de($usuarioId);
        if ($ya !== null) {
            return $ya;
        }
        throw $e;
    }
}

/**
 * Le quita el enlace a una persona: lo llaman la baja, la desactivación
 * y el cambio de rol (index.php). No hace falta para cerrarle la puerta
 * —cada lectura vuelve a mirarla—, pero así su clave no queda guardada
 * para nada, ni vuelve a abrir si un día se le devuelve el rol.
 */
function calendario_olvidar(string $usuarioId): void
{
    if (!calendario_hay_tabla()) {
        return;
    }
    bd()->prepare('DELETE FROM calendario_enlaces WHERE usuario_id = ?')->execute([$usuarioId]);
}

/** El administrador con sesión, o 403 / 503. */
function exigir_calendario(): array
{
    $yo = exigir_sesion();
    if (($yo['rol'] ?? '') !== 'admin') {
        responder_error(403, 'El calendario en Google es solo del administrador.', 'sin-permiso');
    }
    if (!calendario_hay_tabla()) {
        responder_error(503, 'Todavía no se pueden pedir los enlaces. Vuelve a intentarlo en un momento.', 'esquema');
    }
    return $yo;
}

/**
 * Los dos enlaces, relativos a la carpeta de la API: el móvil les pone
 * delante su propia dirección (la de la app o la del taller).
 *
 * Van SIN «.ics» al final, a propósito: Google no lo necesita (mira el
 * tipo de lo que recibe, «text/calendar»), y una dirección con extensión
 * de un fichero que no existe no siempre llega a index.php. El servidor
 * de PHP del banco de pruebas, por ejemplo, la contesta él mismo con un
 * 404; y un servidor delante de Apache que sirva por su cuenta los
 * ficheros con extensión podría hacer lo mismo. Sin extensión entra por
 * donde entran todas las rutas de la API. Con «.ics» se sigue
 * contestando igual, por si alguien la escribe así.
 */
function calendario_enlaces_salida(string $clave): array
{
    return [
        'firmas'  => "calendario/{$clave}/firmas",
        'visitas' => "calendario/{$clave}/visitas",
    ];
}

/** POST calendario/enlaces · los enlaces de quien pregunta; si aún no tiene, se crean. */
function calendario_mis_enlaces(): void
{
    $yo = exigir_calendario();
    $clave = calendario_clave_de($yo['id']) ?? calendario_poner_clave($yo['id'], false);
    responder(calendario_enlaces_salida($clave));
}

/** POST calendario/enlaces/renovar · «Anular mis enlaces»: los de ahora dejan de valer y se dan otros. */
function calendario_renovar_enlaces(): void
{
    $yo = exigir_calendario();
    responder(calendario_enlaces_salida(calendario_poner_clave($yo['id'], true)));
}

/* ═══ Servir el calendario (sin sesión) ═══════════════════════════ */

/** El 404 de siempre, sea cual sea el motivo: corto y sin pistas. */
function calendario_no_hay(): void
{
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo "No encontrado.\n";
    exit;
}

/**
 * ¿Abre esta clave? Se busca por su valor exacto en el índice único y
 * se vuelve a comparar con hash_equals; y su dueño tiene que existir,
 * estar activo y ser administrador AHORA.
 */
function calendario_clave_abre(string $clave): bool
{
    $sent = bd()->prepare(
        'SELECT c.clave, u.rol, u.activo
           FROM calendario_enlaces c JOIN usuarios u ON u.id = c.usuario_id
          WHERE c.clave = ?'
    );
    $sent->execute([$clave]);
    $fila = $sent->fetch() ?: null;
    $sent->closeCursor();
    return $fila !== null
        && hash_equals((string) $fila['clave'], $clave)
        && (string) $fila['rol'] === 'admin'
        && (int) $fila['activo'] === 1;
}

/**
 * GET calendario/<clave>/<firmas|visitas>[.ics] — SIN sesión. No abre ni
 * mira ninguna (no deja cookie), y la clave no sale en la respuesta.
 */
function calendario_servir(string $clave, string $fichero, string $metodo): void
{
    $cual = preg_replace('/\.ics$/D', '', $fichero) ?? '';
    if (!isset(CALENDARIO_NOMBRES[$cual]) || !calendario_es_clave($clave)) {
        calendario_no_hay();
    }
    if (!calendario_hay_tabla()) {
        // La ventana del despliegue: Google lo vuelve a pedir más tarde.
        http_response_code(503);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        header('Retry-After: 600');
        echo "Vuelve a intentarlo en un rato.\n";
        exit;
    }
    if (!calendario_clave_abre($clave)) {
        calendario_no_hay();
    }

    $eventos = array_values(array_filter(
        calendario_eventos(calendario_hoy()),
        static fn (array $ev) => $ev['calendario'] === $cual
    ));
    // En el taller, los calendarios llevan «taller» en el nombre: quien
    // se suscriba a los dos no tendrá en su Google dos «UNIK · Firmas»
    // iguales, uno con los datos de prueba.
    $nombre = CALENDARIO_NOMBRES[$cual];
    if (defined('EN_EL_TALLER') && EN_EL_TALLER) {
        $nombre = str_replace('UNIK · ', 'UNIK taller · ', $nombre);
    }
    $cuerpo = calendario_ics($nombre, $eventos);
    $etiqueta = '"' . sha1($cuerpo) . '"';

    // No se guarda en ningún sitio intermedio (es privado) y quien lo
    // guarde, que pregunte siempre: si no ha cambiado, un 304 sin cuerpo.
    header('Cache-Control: no-cache, private');
    header('ETag: ' . $etiqueta);
    $pedida = (string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
    if ($pedida !== '' && in_array($etiqueta, array_map('trim', explode(',', $pedida)), true)) {
        http_response_code(304);
        exit;
    }
    http_response_code(200);
    header('Content-Type: text/calendar; charset=utf-8');
    header('Content-Disposition: inline; filename="unik-' . $cual . '.ics"');
    header('Content-Length: ' . strlen($cuerpo));
    if ($metodo !== 'HEAD') {
        echo $cuerpo;
    }
    exit;
}

/* ═══ Fechas ══════════════════════════════════════════════════════ */

/** Hoy en la obra (el reloj de Canarias). */
function calendario_hoy(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone(ZONA_OBRA)))->format('Y-m-d');
}

/** ¿Es un día suelto bien escrito y que exista? (esDia() de js/entregas.js) */
function calendario_es_dia($valor): bool
{
    if (!is_string($valor) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $valor, $m)) {
        return false;
    }
    return (int) $m[1] >= 100 && checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
}

/** Un instante ISO, o null si no hay o no se deja leer (el «new Date(…)» de la app). */
function calendario_instante($iso): ?DateTimeImmutable
{
    if (!is_string($iso) || trim($iso) === '') {
        return null;
    }
    // Lo que no es una marca de la casa se deja leer solo si tiene la
    // forma de una fecha: DateTimeImmutable entiende «tomorrow» y cosas
    // así, que el «new Date()» de la app da por inválidas.
    if (!preg_match('/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/D', trim($iso))) {
        return null;
    }
    try {
        return new DateTimeImmutable(trim($iso), new DateTimeZone('UTC'));
    } catch (Throwable $e) {
        return null;
    }
}

/** El día, en Canarias, de un instante ISO; '' si no se deja leer (diaDeMarca()). */
function calendario_dia_de($iso): string
{
    $d = calendario_instante($iso);
    return $d ? $d->setTimezone(new DateTimeZone(ZONA_OBRA))->format('Y-m-d') : '';
}

/** «11:12», en Canarias, de un instante ISO; '' si no se deja leer (horaDeInstante()). */
function calendario_hora_de($iso): string
{
    $d = calendario_instante($iso);
    return $d ? $d->setTimezone(new DateTimeZone(ZONA_OBRA))->format('H:i') : '';
}

/** «12 nov 2026». */
function calendario_dia_corto(string $dia): string
{
    if (!calendario_es_dia($dia)) {
        return '';
    }
    [$a, $m, $d] = array_map('intval', explode('-', $dia));
    return "{$d} " . CALENDARIO_MESES_CORTOS[$m - 1] . " {$a}";
}

/* ═══ Las reglas de la app, duplicadas ════════════════════════════
   OJO: copia de js/entregas.js y js/posventa.js. Si se toca una regla
   allí, se toca aquí, y al revés (y su prueba de paridad). Trabajan
   sobre la ficha tal como le llega al móvil (entrega_salida()). */

/** revisionHecha() de js/entregas.js. */
function calendario_revision_hecha(array $e): bool
{
    if (($e['revisadaEn'] ?? '') === '') {
        return false;
    }
    if (($e['revision'] ?? '') === '') {
        return true;
    }
    $marcada = ($e['revisadaFijadaEn'] ?? '') !== '' ? $e['revisadaFijadaEn'] : $e['revisadaEn'];
    $dia = calendario_dia_de($e['revisadaEn']);
    if ($dia === '') {
        return true;
    }
    return !((string) ($e['revisionFijadaEn'] ?? '') > (string) $marcada && (string) $e['revision'] > $dia);
}

/** visitasDe() de js/entregas.js: el historial saneado, una visita por día. */
function calendario_visitas_de(array $e): array
{
    $porDia = [];
    foreach (is_array($e['visitasHechas'] ?? null) ? $e['visitasHechas'] : [] as $v) {
        if (!is_array($v) || !calendario_es_dia($v['dia'] ?? null) || isset($porDia[$v['dia']])) {
            continue;
        }
        $porDia[$v['dia']] = [
            'dia' => $v['dia'],
            'hechaEn' => is_string($v['hechaEn'] ?? null) ? $v['hechaEn'] : '',
            'por' => is_string($v['por'] ?? null) && $v['por'] !== '' ? $v['por'] : null,
            'porNombre' => is_string($v['porNombre'] ?? null) ? $v['porNombre'] : '',
        ];
    }
    ksort($porDia, SORT_STRING);
    return array_slice(array_values($porDia), -ENTREGA_VISITAS_TOPE);
}

/** visitaMarcada() de js/entregas.js. */
function calendario_visita_marcada(array $e): ?array
{
    if (($e['revisadaEn'] ?? '') === '') {
        return null;
    }
    $vigente = calendario_revision_hecha($e);
    $dia = $vigente && calendario_es_dia($e['revision'] ?? null) ? $e['revision'] : calendario_dia_de($e['revisadaEn']);
    if (!calendario_es_dia($dia)) {
        return null;
    }
    return [
        'dia' => $dia,
        'vigente' => $vigente,
        'hechaEn' => ($e['revisadaFijadaEn'] ?? '') !== '' ? $e['revisadaFijadaEn'] : $e['revisadaEn'],
        'por' => ($e['revisadaPor'] ?? null) ?: null,
        'porNombre' => (string) ($e['revisadaPorNombre'] ?? ''),
    ];
}

/** todasLasVisitas() de js/entregas.js: las del historial y la de la marca, una por día. */
function calendario_todas_las_visitas(array $e): array
{
    $marcada = calendario_visita_marcada($e);
    $todas = [];
    foreach (calendario_visitas_de($e) as $v) {
        if ($marcada === null || $v['dia'] !== $marcada['dia']) {
            $todas[] = $v + ['vigente' => false];
        }
    }
    if ($marcada !== null) {
        $todas[] = $marcada;
    }
    usort($todas, static fn ($a, $b) => strcmp($a['dia'], $b['dia']));
    return $todas;
}

/** diaEntregada() de js/entregas.js: el día que cuenta como el de la entrega. */
function calendario_dia_entregada(array $e): string
{
    $firma = calendario_es_dia($e['firma'] ?? null) ? $e['firma'] : '';
    $apuntada = calendario_dia_de($e['entregadaEn'] ?? '');
    if ($apuntada === '') {
        return ($e['entregadaEn'] ?? '') !== '' ? $firma : '';
    }
    $sello = ($e['entregadaFijadaEn'] ?? '') !== '' ? $e['entregadaFijadaEn'] : $e['entregadaEn'];
    $puesta = calendario_dia_de($sello);
    if ($puesta === '') {
        $puesta = $apuntada;
    }
    $tope = $puesta > $apuntada ? $puesta : $apuntada;
    return $firma !== '' && $firma <= $tope ? $firma : $apuntada;
}

/** ¿Es una lista de JSON (claves 0, 1, 2…) y no un objeto? Lo que en la app es Array.isArray(). */
function calendario_es_lista($valor): bool
{
    return is_array($valor) && ($valor === [] || array_keys($valor) === range(0, count($valor) - 1));
}

/** firmadoEl() de js/posventa.js: el día y la hora de la primera firma del papel. */
function calendario_firmado_el(array $c): array
{
    $firmas = $c['datos']['firmas'] ?? null;
    $primera = calendario_es_lista($firmas) ? ($firmas[0] ?? null) : null;
    $fecha = is_array($primera) ? ($primera['fecha'] ?? null) : null;
    $hora = is_array($primera) ? ($primera['hora'] ?? null) : null;
    return [
        'dia' => calendario_es_dia($fecha) ? $fecha : calendario_dia_de($c['creado'] ?? ''),
        'hora' => is_string($hora) && preg_match('/^\d{2}:\d{2}$/D', $hora) ? $hora : calendario_hora_de($c['creado'] ?? ''),
    ];
}

/** firmantesDe() de js/posventa.js: «Lucía Roca y Daniel Vera». */
function calendario_firmantes(array $c): string
{
    $firmas = $c['datos']['firmas'] ?? null;
    $nombres = [];
    foreach (calendario_es_lista($firmas) ? $firmas : [] as $f) {
        $nombre = is_array($f) && is_scalar($f['nombre'] ?? null) ? trim((string) $f['nombre']) : '';
        if ($nombre !== '') {
            $nombres[] = $nombre;
        }
    }
    if (count($nombres) > 1) {
        return implode(', ', array_slice($nombres, 0, -1)) . ' y ' . end($nombres);
    }
    return $nombres[0] ?? '';
}

/** diaDeConforme() de js/posventa.js: el día de la visita que dice el papel. */
function calendario_dia_de_conforme(array $c): string
{
    $d = $c['datos']['fechaVisita'] ?? null;
    return calendario_es_dia($d) ? $d : calendario_firmado_el($c)['dia'];
}

/**
 * visitasDelCalendario() de js/posventa.js, para una vivienda: la cita
 * de la visita de repasos si está por hacer (citaPendiente()) y una
 * visita hecha por cada conforme firmado.
 */
function calendario_posventa_de(array $e, array $conformes): ?array
{
    $dia = (string) ($e['posventa'] ?? '');
    $fijada = (string) ($e['posventaFijadaEn'] ?? '');
    $pendiente = calendario_es_dia($dia);
    foreach ($conformes as $c) {
        if ((string) ($c['creado'] ?? '') > $fijada) {
            $pendiente = false;
        }
    }
    $hora = (string) ($e['posventaHora'] ?? '');
    $cita = $pendiente ? [
        'dia' => $dia,
        'hora' => preg_match('/^\d{2}:\d{2}$/D', $hora) ? $hora : '',
        'fijadaEn' => $fijada,
        'por' => ($e['posventaPor'] ?? null) ?: null,
        'porNombre' => (string) ($e['posventaPorNombre'] ?? ''),
    ] : null;
    $hechas = [];
    foreach ($conformes as $c) {
        $firmado = calendario_firmado_el($c);
        $hecha = [
            'dia' => calendario_dia_de_conforme($c),
            'conformeId' => (string) $c['id'],
            'listaId' => (string) ($c['tareaId'] ?? ''),
            'horaFirma' => $firmado['hora'],
            'diaFirma' => $firmado['dia'],
            'firmantes' => calendario_firmantes($c),
            'realizadaPor' => is_scalar($c['datos']['realizadaPor'] ?? null) ? (string) $c['datos']['realizadaPor'] : '',
            'realizadaPorId' => $c['datos']['realizadaPorId'] ?? null,
            'firmadaEn' => (string) ($c['creado'] ?? ''),
        ];
        if (calendario_es_dia($hecha['dia'])) {
            $hechas[] = $hecha;
        }
    }
    usort($hechas, static fn ($a, $b) => strcmp($a['dia'], $b['dia']) ?: strcmp($a['firmadaEn'], $b['firmadaEn']));
    return $cita !== null || $hechas !== [] ? ['cita' => $cita, 'hechas' => $hechas] : null;
}

/**
 * hitosDe() de js/entregas.js, para una vivienda. `$pv` es lo de
 * calendario_posventa_de() (o null) e `$incidencias`, los repasos del
 * parte post-entrega sin verificar.
 */
function calendario_hitos_de(array $e, ?array $pv, int $incidencias, string $hoy): array
{
    $base = ['entrega' => $e, 'hora' => '', 'origen' => ''];
    $entregadaEl = ($e['entregadaEn'] ?? '') !== '' ? calendario_dia_entregada($e) : '';
    $despues = static fn (string $dia) => $entregadaEl !== '' && $dia > $entregadaEl;
    $suyas = [];
    $revision = (string) ($e['revision'] ?? '');
    if ($revision !== '' && !calendario_revision_hecha($e)) {
        if (!$despues($revision)) {
            $suyas[] = ['dia' => $revision, 'tipo' => 'revision', 'hora' => (string) ($e['revisionHora'] ?? '')] + $base;
        } else {
            $cumplida = false;
            foreach ($pv['hechas'] ?? [] as $x) {
                if ($x['dia'] >= $revision) {
                    $cumplida = true;
                }
            }
            if (!$cumplida) {
                $suyas[] = ['dia' => $revision, 'tipo' => 'visita', 'origen' => 'revision',
                    'hora' => (string) ($e['revisionHora'] ?? ''), 'sinConfirmar' => $revision < $hoy] + $base;
            }
        }
    }
    foreach (calendario_todas_las_visitas($e) as $visita) {
        $suyas[] = $despues($visita['dia'])
            ? ['dia' => $visita['dia'], 'tipo' => 'visitaHecha', 'origen' => 'revision', 'visita' => $visita] + $base
            : ['dia' => $visita['dia'], 'tipo' => 'revisada', 'visita' => $visita] + $base;
    }
    $dePosventa = [];
    if (($pv['cita'] ?? null) !== null && calendario_es_dia($pv['cita']['dia'])) {
        $dePosventa[] = ['dia' => $pv['cita']['dia'], 'tipo' => 'visita', 'origen' => 'posventa',
            'hora' => $pv['cita']['hora'], 'cita' => $pv['cita'], 'sinConfirmar' => $pv['cita']['dia'] < $hoy] + $base;
    }
    foreach ($pv['hechas'] ?? [] as $hecha) {
        if (calendario_es_dia($hecha['dia'])) {
            $dePosventa[] = ['dia' => $hecha['dia'], 'tipo' => 'visitaHecha', 'origen' => 'posventa', 'hecha' => $hecha] + $base;
        }
    }
    // Una revisión de después de la entrega no sale otra vez el día que
    // la villa ya tiene su visita de Postventa: una sola.
    $diasDePosventa = array_flip(array_column($dePosventa, 'dia'));
    $hitos = [];
    foreach ($suyas as $x) {
        if (!(in_array($x['tipo'], ['visita', 'visitaHecha'], true) && isset($diasDePosventa[$x['dia']]))) {
            $hitos[] = $x;
        }
    }
    array_push($hitos, ...$dePosventa);
    if (($e['entregadaEn'] ?? '') !== '') {
        $hitos[] = ['dia' => $entregadaEl, 'tipo' => $incidencias > 0 ? 'incidencia' : 'entregada', 'incidencias' => $incidencias] + $base;
    } elseif (($e['firma'] ?? '') !== '') {
        $hitos[] = ['dia' => (string) $e['firma'], 'tipo' => 'firma', 'hora' => (string) ($e['firmaHora'] ?? ''),
            'incidencias' => 0, 'sinConfirmar' => (string) $e['firma'] < $hoy] + $base;
    }
    return $hitos;
}

/* ═══ Lo guardado, en una sola tanda ══════════════════════════════ */

/**
 * Todos los hitos de las promociones del calendario, con tres consultas:
 * las fichas de entrega, los repasos de los partes post-entrega (para
 * las incidencias) y los conformes de las visitas de repasos.
 */
function calendario_hitos(string $hoy): array
{
    $bd = bd();
    $promos = array_keys(CALENDARIO_PROMOCIONES);
    $huecos = implode(', ', array_fill(0, count($promos), '?'));

    // Las fichas, tal como le llegan al móvil (entregasDePromo()).
    $sent = $bd->prepare("SELECT * FROM entregas WHERE borrada = 0 AND promo_id IN ({$huecos}) ORDER BY unidad_id");
    $sent->execute($promos);
    $fichas = array_map('entrega_salida', $sent->fetchAll());
    $sent->closeCursor();

    // Las incidencias (incidenciasPorUnidad()): repasos vivos y sin
    // verificar de los partes post-entrega vivos, por vivienda.
    $incidencias = [];
    $sent = $bd->query(
        'SELECT l.promo_id, l.unidad_id, t.estado
           FROM tareas t JOIN listas l ON l.id = t.lista_id
          WHERE l.borrada = 0 AND t.borrada = 0 AND HEX(l.fase) = ' . $bd->quote(CALENDARIO_FASE_POST_HEX)
    );
    foreach ($sent->fetchAll() as $f) {
        if ((string) $f['estado'] !== 'verificada') {
            $clave = $f['promo_id'] . "\n" . $f['unidad_id'];
            $incidencias[$clave] = ($incidencias[$clave] ?? 0) + 1;
        }
    }
    $sent->closeCursor();

    // Los conformes de las visitas de repasos vivas (posventaDePromo() y
    // conformeDeLista()): uno por visita, el primero que se guardó.
    $conformes = [];
    $deLista = [];
    $sent = $bd->query(
        "SELECT m.id, m.tarea_id, m.tipo, m.datos, m.creado, l.promo_id, l.unidad_id
           FROM medios m JOIN listas l ON l.id = m.tarea_id
          WHERE l.borrada = 0 AND m.borrada = 0 AND m.tipo = 'documento'
            AND HEX(l.fase) = " . $bd->quote(CALENDARIO_FASE_VISITA_HEX) . '
          ORDER BY m.creado ASC, m.id ASC'
    );
    foreach ($sent->fetchAll() as $f) {
        if ((string) $f['tipo'] !== 'documento' || isset($deLista[$f['tarea_id']])) {
            continue;
        }
        $deLista[$f['tarea_id']] = true;
        $datos = json_decode((string) ($f['datos'] ?? ''), true);
        $conformes[$f['promo_id'] . "\n" . $f['unidad_id']][] = [
            'id' => (string) $f['id'], 'tareaId' => (string) $f['tarea_id'],
            'datos' => is_array($datos) ? $datos : null, 'creado' => (string) $f['creado'],
        ];
    }
    $sent->closeCursor();

    $hitos = [];
    foreach ($fichas as $e) {
        $clave = $e['promoId'] . "\n" . $e['unidadId'];
        // Lo de Postventa, solo de las que figuran como entregadas.
        $pv = $e['entregadaEn'] !== '' ? calendario_posventa_de($e, $conformes[$clave] ?? []) : null;
        array_push($hitos, ...calendario_hitos_de($e, $pv, $incidencias[$clave] ?? 0, $hoy));
    }
    return $hitos;
}

/* ═══ De hito a evento ════════════════════════════════════════════ */

/** ¿Lleva una hora de reloj que se pueda poner en el calendario? */
function calendario_hora_valida(string $hora): bool
{
    return (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/D', $hora);
}

/** La dirección de la app que sirve este calendario: la de verdad o el taller. */
function calendario_base_app(): string
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    if (!preg_match('/^[a-z0-9.-]+(:\d{1,5})?$/D', $host)) {
        $host = CALENDARIO_DOMINIO;
    }
    $local = (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/D', $host);
    // «/api/index.php» → «/»; «/taller/api/index.php» → «/taller/».
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $carpeta = rtrim(dirname(dirname($script)), '/');
    if (!preg_match('#^(/[A-Za-z0-9._-]+)*$#D', $carpeta)) {
        $carpeta = '';
    }
    return ($local ? 'http' : 'https') . "://{$host}{$carpeta}/";
}

/** Quién lo puso y cuándo (quienLoFijo() del Día de la app): [nombre, cuándo, verbo]. */
function calendario_quien(array $h): array
{
    $e = $h['entrega'];
    $dePosventa = $h['origen'] === 'posventa';
    if ($h['tipo'] === 'entregada' || $h['tipo'] === 'incidencia') {
        return [$e['entregadaPorNombre'], $e['entregadaFijadaEn'] !== '' ? $e['entregadaFijadaEn'] : $e['entregadaEn'], 'la dio por entregada'];
    }
    if ($h['tipo'] === 'visitaHecha' && $dePosventa) {
        return [$h['hecha']['realizadaPor'], $h['hecha']['firmadaEn'], 'la hizo'];
    }
    if ($h['tipo'] === 'visita' && $dePosventa) {
        return [$h['cita']['porNombre'], $h['cita']['fijadaEn'], 'la fijó'];
    }
    if ($h['tipo'] === 'revisada' || $h['tipo'] === 'visitaHecha') {
        return [$h['visita']['porNombre'], $h['visita']['hechaEn'], 'la dio por hecha'];
    }
    if ($h['tipo'] === 'revision' || $h['tipo'] === 'visita') {
        return [$e['revisionPorNombre'], $e['revisionFijadaEn'], 'la fijó'];
    }
    return [$e['firmaPorNombre'], $e['firmaFijadaEn'], 'la fijó'];
}

/**
 * Los eventos de los dos calendarios: uno por hito, con su UID estable,
 * su título, su descripción y su enlace a la ficha en la app.
 */
function calendario_eventos(string $hoy): array
{
    $dominio = defined('EN_EL_TALLER') && EN_EL_TALLER ? CALENDARIO_DOMINIO_TALLER : CALENDARIO_DOMINIO;
    $baseApp = calendario_base_app();
    $eventos = [];
    foreach (calendario_hitos($hoy) as $h) {
        if (!calendario_es_dia($h['dia']) || !isset(CALENDARIO_ROTULOS[$h['tipo']])) {
            continue;   // un día que no existe no sale tampoco en la app
        }
        $e = $h['entrega'];
        $promo = (string) $e['promoId'];
        $numero = explode(':', (string) $e['unidadId'], 2)[1] ?? (string) $e['unidadId'];
        $villa = nombre_de_unidad((string) $e['unidadId']);
        $compradores = trim(preg_replace('/\s+/u', ' ', (string) $e['compradores']) ?? '');
        $hora = calendario_hora_valida((string) $h['hora']) ? (string) $h['hora'] : '';
        $dePosventa = $h['origen'] === 'posventa';

        // El UID no lleva la fecha de lo que puede moverse (la firma, la
        // cita): al cambiarla, Google mueve el evento. Lo ya hecho sí la
        // lleva, porque cada visita hecha es un evento propio.
        if (in_array($h['tipo'], ['firma', 'entregada', 'incidencia'], true)) {
            $uid = "firma-{$promo}-{$numero}";
        } elseif ($h['tipo'] === 'visita' && $dePosventa) {
            $uid = "visita-{$promo}-{$numero}";
        } elseif ($h['tipo'] === 'visitaHecha' && $dePosventa) {
            $uid = 'visita-hecha-' . strtolower((string) $h['hecha']['listaId']);
        } elseif ($h['tipo'] === 'revision' || $h['tipo'] === 'visita') {
            $uid = "revision-{$promo}-{$numero}";
        } else {
            $uid = "revisada-{$promo}-{$numero}-{$h['dia']}";
        }

        // La descripción: dónde y a qué hora, quién lo puso, lo que haya
        // que saber, y la flecha del Día (la ficha de la vivienda, o la
        // de Postventa en las visitas de Postventa).
        $lineas = [(CALENDARIO_PROMOCIONES[$promo] ?? $promo) . " · {$villa}"
            . (in_array($h['tipo'], ['firma', 'revision', 'visita'], true) ? ($hora !== '' ? " · a las {$hora}" : ' · sin hora') : '')];
        [$nombre, $cuando, $verbo] = calendario_quien($h);
        $diaQuien = calendario_dia_de($cuando);
        if (trim((string) $nombre) !== '' || $diaQuien !== '') {
            $pila = preg_split('/\s+/u', trim((string) $nombre) !== '' ? trim((string) $nombre) : 'Alguien')[0];
            $lineas[] = "{$pila} {$verbo}" . ($diaQuien !== '' ? ' el ' . calendario_dia_corto($diaQuien) : '') . '.';
        }
        if ($h['tipo'] === 'visitaHecha' && $dePosventa) {
            $c = $h['hecha'];
            $lineas[] = 'Conforme firmado'
                . ($c['diaFirma'] !== '' && $c['diaFirma'] !== $h['dia'] ? ' el ' . calendario_dia_corto($c['diaFirma']) : '')
                . ($c['horaFirma'] !== '' ? " a las {$c['horaFirma']}" : '')
                . ($c['firmantes'] !== '' ? " por {$c['firmantes']}" : '') . '.';
        }
        if ($h['tipo'] === 'incidencia') {
            $n = (int) $h['incidencias'];
            $lineas[] = $n === 1 ? '1 repaso del parte post-entrega por resolver.' : "{$n} repasos del parte post-entrega por resolver.";
        }
        if ($h['tipo'] === 'firma' && !empty($h['sinConfirmar'])) {
            $lineas[] = 'Sin confirmar: el día ya pasó y nadie ha apuntado todavía la entrega.';
        }
        if ($h['tipo'] === 'visita' && !empty($h['sinConfirmar'])) {
            $lineas[] = 'Sin confirmar: el día ya pasó y la visita no consta como hecha.';
        }
        $url = $baseApp . ($dePosventa ? "#/entregadas/p/{$promo}/v/{$numero}" : "#/p/{$promo}/v/{$numero}");
        $lineas[] = "Ficha en la app: {$url}";

        // DTSTAMP: cuándo se tocó por última vez lo que cuenta el evento
        // (la ficha o su conforme). Estable mientras nada cambie, para
        // que dos lecturas seguidas den el mismo calendario.
        $sellos = array_filter([calendario_instante($e['actualizado'] ?? ''), calendario_instante($cuando)]);
        $sello = $sellos ? max($sellos) : new DateTimeImmutable('@0');

        $eventos[] = [
            'uid' => "{$uid}@{$dominio}",
            'calendario' => CALENDARIO_DE_HITO[$h['tipo']],
            'tipo' => $h['tipo'],
            'dia' => $h['dia'],
            'hora' => $hora,
            'titulo' => CALENDARIO_ROTULOS[$h['tipo']] . " · {$villa}" . ($compradores !== '' ? " · {$compradores}" : ''),
            'descripcion' => implode("\n", $lineas),
            'url' => $url,
            'sello' => $sello,
        ];
    }
    usort($eventos, static fn ($a, $b) => strcmp($a['dia'], $b['dia']) ?: strcmp($a['hora'], $b['hora']) ?: strcmp($a['uid'], $b['uid']));
    return $eventos;
}

/* ═══ El formato de los calendarios (RFC 5545) ════════════════════ */

/** Escapa un texto: la barra, el punto y coma, la coma y los saltos de línea. */
function calendario_texto(string $texto): string
{
    $texto = str_replace(["\r\n", "\r"], "\n", $texto);
    // Fuera los caracteres de control (salvo el tabulador y el salto,
    // que se escribe como «\n»): no caben en un texto de calendario.
    $texto = preg_replace('/[\x00-\x08\x0B-\x1F\x7F]/', '', $texto) ?? '';
    return str_replace(['\\', ';', ',', "\n"], ['\\\\', '\\;', '\\,', '\\n'], $texto);
}

/**
 * Una línea de contenido, plegada a 75 octetos como pide el formato: las
 * que siguen empiezan por un espacio. Nunca se parte un carácter: se
 * corta por caracteres enteros de UTF-8, no por bytes sueltos.
 */
function calendario_linea(string $linea): string
{
    $salida = '';
    $actual = '';
    $tope = 75;
    foreach (mb_str_split($linea, 1, 'UTF-8') as $caracter) {
        if (strlen($actual) + strlen($caracter) > $tope) {
            $salida .= $actual . "\r\n";
            $actual = ' ';
            $tope = 75;   // el espacio de delante cuenta dentro de los 75
        }
        $actual .= $caracter;
    }
    return $salida . $actual . "\r\n";
}

/** Un instante en UTC, como lo pide el formato: 20261126T110000Z. */
function calendario_utc(DateTimeImmutable $d): string
{
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z');
}

/** Un calendario entero, con sus eventos. */
function calendario_ics(string $nombre, array $eventos): string
{
    $canarias = new DateTimeZone(ZONA_OBRA);
    $lineas = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//UNIK Works//Calendario de entregas//ES',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:' . calendario_texto($nombre),
        'X-WR-TIMEZONE:' . ZONA_OBRA,
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
        // La zona de la obra va descrita siempre, aunque las horas se
        // escriban en UTC: así el calendario nunca queda sin ningún
        // componente (el formato pide al menos uno) aunque no haya nada.
        'BEGIN:VTIMEZONE',
        'TZID:' . ZONA_OBRA,
        'X-LIC-LOCATION:' . ZONA_OBRA,
        'BEGIN:DAYLIGHT',
        'TZOFFSETFROM:+0000',
        'TZOFFSETTO:+0100',
        'TZNAME:WEST',
        'DTSTART:19700329T010000',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
        'END:DAYLIGHT',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:+0100',
        'TZOFFSETTO:+0000',
        'TZNAME:WET',
        'DTSTART:19701025T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
        'END:STANDARD',
        'END:VTIMEZONE',
    ];
    foreach ($eventos as $ev) {
        $lineas[] = 'BEGIN:VEVENT';
        $lineas[] = 'UID:' . $ev['uid'];
        // Sin LAST-MODIFIED, que es optativo: algunos cambios del evento
        // (los repasos del parte post-entrega que se verifican, el día que
        // pasa y deja una firma «sin confirmar») no tocan la ficha, y esa
        // marca diría que el evento no ha cambiado cuando sí ha cambiado.
        $lineas[] = 'DTSTAMP:' . calendario_utc($ev['sello']);
        if ($ev['hora'] !== '') {
            // La hora es de Canarias: se convierte a UTC con su zona, que
            // sabe en qué época del año cae (verano +01:00, invierno +00:00).
            $inicio = new DateTimeImmutable("{$ev['dia']} {$ev['hora']}:00", $canarias);
            $lineas[] = 'DTSTART:' . calendario_utc($inicio);
            $lineas[] = 'DTEND:' . calendario_utc($inicio->modify('+1 hour'));
        } else {
            $dia = new DateTimeImmutable($ev['dia'], new DateTimeZone('UTC'));
            $lineas[] = 'DTSTART;VALUE=DATE:' . $dia->format('Ymd');
            $lineas[] = 'DTEND;VALUE=DATE:' . $dia->modify('+1 day')->format('Ymd');
        }
        $lineas[] = 'SUMMARY:' . calendario_texto($ev['titulo']);
        $lineas[] = 'DESCRIPTION:' . calendario_texto($ev['descripcion']);
        $lineas[] = 'URL:' . $ev['url'];
        $lineas[] = 'END:VEVENT';
    }
    $lineas[] = 'END:VCALENDAR';
    return implode('', array_map('calendario_linea', $lineas));
}
