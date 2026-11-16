<?php
/**
 * posventa.php — «Entregadas»: la visita de repasos de una vivienda ya
 * entregada y su «Conforme de la visita», el documento que el comprador
 * firma con el dedo.
 *
 * DÓNDE VIVE CADA COSA (esquema 23; ninguna tabla nueva):
 *   - La cita de la visita y los cuatro botones (piscina, climatización,
 *     domótica y armarios): hechos de la ficha de entrega, en
 *     lib/entregas.php.
 *   - Cada visita hecha con la app: una fila de `listas` con
 *     `fase = 'visita'`. Sus repasos, filas de `tareas` como las demás
 *     (por dentro, `tareas` guarda REPASOS).
 *   - El conforme firmado: el PDF, en la carpeta de medios, y una fila
 *     de `medios` con `tipo = 'documento'` cuyo `tarea_id` es el id de
 *     la LISTA de la visita (no de un repaso). Lo firmado viaja además
 *     como dato en `medios.datos` (JSON). Entra en la copia nocturna
 *     como una foto más: el robot se lleva todo lo que tenga fila viva
 *     en `medios`.
 *
 * TRES PERMISOS, y no se mezclan:
 *   - poner la fecha de la visita y pulsar los botones: es_comercial()
 *     (administrador y comercial), en lib/entregas.php;
 *   - hacer la visita, recoger la firma y abrir el papel firmado:
 *     puede_visitar() (administrador, comercial y dirección facultativa);
 *   - dar por buenos o rechazar los repasos de una visita:
 *     verifica_visitas() (administrador, dirección facultativa y quien
 *     lleve la bandera `posventa` de `usuarios`, el chip «Posventa»).
 *     Esa bandera no vale para nada más.
 *
 * UN CONFORME FIRMADO NI SE PISA NI SE BORRA. Por eso tiene su propia
 * puerta (POST conformes) y no entra por la de las fotos, y por eso
 * están aquí las redes: durante días habrá móviles con la app de antes,
 * que ven la lista de la visita como un parte más y le ofrecen a
 * cualquiera «Borrar la lista» y «Nuevo repaso». Las redes nunca se
 * saltan la escritura: guardan por upsert() la fila que llega, con su
 * `actualizado`, reponiendo lo protegido. Así la fila le vuelve VIVA al
 * móvil que la borró (ese móvil solo adopta lo que le baja con una hora
 * igual o más nueva que la suya).
 *
 * Este fichero se carga con red (is_file) desde index.php, y toda
 * llamada a lo de aquí va detrás de function_exists(): al publicar, los
 * ficheros de api/ suben varios a la vez y sin orden.
 */
declare(strict_types=1);

/** La fase de la lista que ES una visita de repasos. */
const POSVENTA_FASE_VISITA = 'visita';

/**
 * Tope del campo `datos` del conforme TAL COMO VIAJA, en bytes de UTF-8.
 * Es la misma cifra que CONFORME_DATOS_MAX en js/conforme.js: el móvil
 * la mide ANTES de dejar firmar, porque un conforme no puede rechazarse
 * por tamaño después de que el comprador haya firmado.
 */
const CONFORME_DATOS_MAX = 58000;

/** Lo que cabe en la columna (TEXT: 65.535 bytes), con margen. */
const CONFORME_DATOS_GUARDADOS_MAX = 65000;

/** Tope del PDF de un conforme: dos megas (uno normal no llega a 100 KB). */
const CONFORME_FICHERO_MAX = 2097152;

/** Topes de lo firmado. Los mismos que comprueba el móvil antes de ofrecer «Firmar». */
const CONFORME_REPASOS_MAX = 200;
const CONFORME_OBSERVACIONES_MAX = 1000;
const CONFORME_PAGINAS_MAX = 20;

/* ═══ Permisos ════════════════════════════════════════════════════ */

/** ¿Hace esta persona visitas de repasos? Administrador, comercial o dirección facultativa. */
function puede_visitar(array $yo): bool
{
    return ($yo['rol'] ?? '') === 'admin' || !empty($yo['comercial']) || !empty($yo['verifica']);
}

/** ¿Da por buenos (y rechaza) esta persona los repasos de las VISITAS? Quien decide, o quien lleva la bandera «posventa». */
function verifica_visitas(array $yo): bool
{
    return ($yo['rol'] ?? '') === 'admin' || !empty($yo['verifica']) || !empty($yo['posventa']);
}

/* ═══ Lo guardado, con memoria por petición ═══════════════════════ */

/**
 * La fila guardada de una lista (lo justo: vivienda, fase y si está
 * borrada), o null si no existe. Sin memoria: `borrada` cambia dentro
 * de una misma petición, y la lista puede llegar en esta misma subida.
 */
function posventa_lista_guardada(string $listaId): ?array
{
    $sent = bd()->prepare('SELECT id, unidad_id, fase, borrada FROM listas WHERE id = ?');
    $sent->execute([$listaId]);
    $fila = $sent->fetch() ?: null;
    $sent->closeCursor();   // la lectura se suelta antes de escribir (ver upsert)
    if ($fila === null) {
        return null;
    }
    return [
        'id' => (string) $fila['id'], 'unidad_id' => (string) $fila['unidad_id'],
        'fase' => (string) $fila['fase'], 'borrada' => (int) $fila['borrada'],
    ];
}

/**
 * La fase guardada de una lista, o null si la lista no existe. La de
 * una lista que SÍ existe se recuerda durante la petición: que sea o no
 * de visita no cambia nunca (posventa_red_de_lista). La que no existe
 * no se recuerda: puede llegar en esta misma subida.
 */
function posventa_fase_de_lista(string $listaId): ?string
{
    static $fases = [];
    if (isset($fases[$listaId])) {
        return $fases[$listaId];
    }
    $sent = bd()->prepare('SELECT fase FROM listas WHERE id = ?');
    $sent->execute([$listaId]);
    $fase = $sent->fetchColumn();
    $sent->closeCursor();
    if ($fase === false) {
        return null;
    }
    return $fases[$listaId] = (string) $fase;
}

/** ¿Es de visita esa lista, tal como está GUARDADA? Falso si no existe. */
function posventa_lista_es_de_visita(string $listaId): bool
{
    return posventa_fase_de_lista($listaId) === POSVENTA_FASE_VISITA;
}

/**
 * La lista de la que cuelga un repaso tal como está GUARDADO, o null si
 * el repaso no existe todavía. Con memoria por petición (solo de los
 * que existen).
 */
function posventa_lista_de_tarea(string $tareaId): ?string
{
    static $vistas = [];
    if (isset($vistas[$tareaId])) {
        return $vistas[$tareaId];
    }
    $sent = bd()->prepare('SELECT lista_id FROM tareas WHERE id = ?');
    $sent->execute([$tareaId]);
    $listaId = $sent->fetchColumn();
    $sent->closeCursor();
    if ($listaId === false) {
        return null;
    }
    return $vistas[$tareaId] = (string) $listaId;
}

/**
 * ¿Cuelga este repaso de una lista de visita? Mira lo GUARDADO —la
 * lista que el repaso tiene en la base, no la que diga quien sube—.
 * Falso si el repaso no existe todavía.
 */
function posventa_tarea_es_de_visita(string $tareaId): bool
{
    $listaId = posventa_lista_de_tarea($tareaId);
    return $listaId !== null && posventa_lista_es_de_visita($listaId);
}

/** ¿Cuelga este repaso de una visita que ya tiene su conforme FIRMADO? Mira lo guardado. */
function posventa_tarea_es_de_visita_firmada(string $tareaId): bool
{
    $listaId = posventa_lista_de_tarea($tareaId);
    return $listaId !== null && posventa_lista_es_de_visita($listaId) && posventa_conforme_de_lista($listaId) !== null;
}

/**
 * El conforme vivo de una visita: `['id', 'datos' (lo firmado, o null),
 * 'repasos' (los ids de los repasos firmados)]`, o null si la visita no
 * está firmada. Con memoria por petición, también del «no hay»: en una
 * subida de cincuenta repasos de la misma visita se pregunta una vez.
 * Quien acaba de escribir un conforme pasa `$releer`.
 */
function posventa_conforme_de_lista(string $listaId, bool $releer = false): ?array
{
    static $vistos = [];
    static $hayDatos = null;
    if (!$releer && array_key_exists($listaId, $vistos)) {
        return $vistos[$listaId];
    }
    // La red de la ventana del despliegue: si la columna `datos` todavía
    // no está (este fichero ha llegado antes que lib/esquema.php), no
    // puede haber ningún conforme guardado. Sin esta pregunta, cada
    // subida de un repaso de una visita reventaba con un error de
    // columna desconocida (lo cazó la batería).
    $hayDatos ??= in_array('datos', esquema_columnas(bd(), 'medios'), true);
    if (!$hayDatos) {
        return $vistos[$listaId] = null;
    }
    $sent = bd()->prepare(
        "SELECT id, datos FROM medios WHERE tarea_id = ? AND tipo = 'documento' AND borrada = 0 ORDER BY creado ASC LIMIT 1"
    );
    $sent->execute([$listaId]);
    $fila = $sent->fetch() ?: null;
    $sent->closeCursor();
    if ($fila === null) {
        return $vistos[$listaId] = null;
    }
    $datos = json_decode((string) ($fila['datos'] ?? ''), true);
    $repasos = [];
    foreach (is_array($datos) && is_array($datos['repasos'] ?? null) ? $datos['repasos'] : [] as $r) {
        if (is_array($r) && is_string($r['id'] ?? null)) {
            $repasos[] = strtolower($r['id']);
        }
    }
    return $vistos[$listaId] = [
        'id' => (string) $fila['id'],
        'datos' => is_array($datos) ? $datos : null,
        'repasos' => $repasos,
    ];
}

/**
 * ¿Quién responde de esta fila? Su AUTOR si existe, está activo y
 * puede_visitar(); solo si no, la sesión que la sube.
 *
 * Es la regla de entrega_autor() traída aquí: la cola es del teléfono,
 * no de la persona. Una visita hecha sin cobertura en el móvil de obra
 * puede acabar subiendo con la sesión de quien entre detrás. Juzgando
 * solo por la sesión que sube, esa visita se guardaría borrada entera y
 * le bajaría borrada, sin aviso, a quien la hizo.
 */
function posventa_puede(?string $creadoPor, array $yo): bool
{
    static $consulta = null;
    static $vistos = [];
    if (is_string($creadoPor) && es_uuid($creadoPor) && $creadoPor !== ($yo['id'] ?? null)) {
        if (!array_key_exists($creadoPor, $vistos)) {
            $consulta ??= bd()->prepare('SELECT rol, comercial, verifica FROM usuarios WHERE id = ? AND activo = 1');
            $consulta->execute([$creadoPor]);
            $fila = $consulta->fetch() ?: null;
            $consulta->closeCursor();
            $vistos[$creadoPor] = $fila !== null && puede_visitar($fila);
        }
        if ($vistos[$creadoPor]) {
            return true;
        }
    }
    return puede_visitar($yo);
}

/* ═══ Las redes (ver la cabecera) ═════════════════════════════════ */

/**
 * La lista que llega a `POST listas`, con lo de una visita protegido.
 * Devuelve la fila tal como hay que guardarla (por upsert, con el
 * `actualizado` que traía).
 *
 *   - Una lista guardada como visita no cambia de fase (R1), y una que
 *     ya existe con otra fase no pasa a ser de visita: si pudiera,
 *     quien lleva la bandera «posventa» daría por buenos los repasos de
 *     siempre con solo cambiarle la fase a su parte.
 *   - Una visita con conforme no se borra, sea quien sea (R2).
 *   - Una visita sin conforme solo la borra quien hace visitas: a los
 *     demás se les conserva como estaba (R11).
 *   - Una visita NUEVA de la que no responde nadie que haga visitas se
 *     guarda ya borrada (R3): le baja borrada también a quien la creó,
 *     y así no se le queda de fantasma en el móvil.
 *   - Y una visita no se muda de vivienda: su conforme, que cuelga de
 *     ella, se iría detrás. (La app no mueve listas de vivienda.)
 */
function posventa_red_de_lista(array $registro, array $yo): array
{
    $guardada = posventa_lista_guardada((string) $registro['id']);
    if ($guardada === null) {
        if ($registro['fase'] === POSVENTA_FASE_VISITA && !posventa_puede($registro['creado_por'] ?? null, $yo)) {
            $registro['borrada'] = 1;
        }
        return $registro;
    }
    if ($guardada['fase'] !== POSVENTA_FASE_VISITA) {
        if ($registro['fase'] === POSVENTA_FASE_VISITA) {
            $registro['fase'] = $guardada['fase'];
        }
        return $registro;
    }
    $registro['fase'] = POSVENTA_FASE_VISITA;
    $registro['unidad_id'] = $guardada['unidad_id'];
    if (posventa_conforme_de_lista((string) $registro['id']) !== null) {
        $registro['borrada'] = 0;
    } elseif (!puede_visitar($yo)) {
        $registro['borrada'] = $guardada['borrada'];
    }
    return $registro;
}

/**
 * Lo que una visita le protege a un repaso que llega a `POST tareas`.
 * `$fila` es el repaso guardado (o null si es nuevo) y `$listaId` la
 * lista de la que cuelga DE VERDAD: la guardada si existe, la que llega
 * si es nuevo. Devuelve qué hay que reponer:
 *
 *   - 'borrada' => 1          el repaso se guarda ya borrado: es nuevo
 *                             y no responde de él nadie que haga
 *                             visitas (R5), o la visita ya está firmada
 *                             y él no figura en el conforme (R6);
 *   - 'conservar' => true     la visita está firmada y el repaso ya
 *                             existía: `borrada`, `texto` y `zona` se
 *                             quedan como estaban, sea quien sea (R7).
 *
 * Un repaso firmado que llega DESPUÉS que su conforme (su id está en
 * `datos.repasos`) se guarda vivo: lo firmado es lo que dice el papel.
 * Vacío si la lista no es de visita.
 */
function posventa_red_de_tarea(string $tareaId, string $listaId, ?array $fila, ?string $creadoPor, array $yo): array
{
    if (!posventa_lista_es_de_visita($listaId)) {
        return [];
    }
    $conforme = posventa_conforme_de_lista($listaId);
    if ($fila !== null) {
        return $conforme !== null ? ['conservar' => true] : [];
    }
    if ($conforme !== null) {
        return in_array(strtolower($tareaId), $conforme['repasos'], true) ? [] : ['borrada' => 1];
    }
    return posventa_puede($creadoPor, $yo) ? [] : ['borrada' => 1];
}

/**
 * ¿Hay que CONSERVAR este medio que alguien quiere borrar? (R8)
 *   (a) un documento —el conforme firmado—: siempre;
 *   (b) la foto, el vídeo o la nota de voz de un repaso de una visita
 *       ya firmada: siempre, sea quien sea;
 *   (c) la de un repaso de una visita sin firmar: si quien borra no
 *       hace visitas.
 * `$fila` es la fila guardada del medio.
 */
function posventa_conserva_medio(array $fila, array $yo): bool
{
    if ((string) ($fila['tipo'] ?? '') === 'documento') {
        return true;
    }
    $tareaId = (string) ($fila['tarea_id'] ?? '');
    $listaId = $tareaId !== '' ? posventa_lista_de_tarea($tareaId) : null;
    if ($listaId === null || !posventa_lista_es_de_visita($listaId)) {
        return false;
    }
    return posventa_conforme_de_lista($listaId) !== null || !puede_visitar($yo);
}

/* ═══ El conforme: sanear lo firmado ══════════════════════════════ */

/** ¿Es una lista (claves 0, 1, 2…) y no un objeto? */
function conforme_es_lista(array $valor): bool
{
    return $valor === [] || array_keys($valor) === range(0, count($valor) - 1);
}

/** Un texto de una línea de `datos`, recortado por los lados; null si no es un texto o pasa del tope. */
function conforme_texto($valor, int $tope, bool $obligatorio = false): ?string
{
    if ($valor === null && !$obligatorio) {
        return '';
    }
    if (!is_string($valor)) {
        return null;
    }
    $valor = trim($valor);
    if (mb_strlen($valor) > $tope || ($obligatorio && $valor === '')) {
        return null;
    }
    return $valor;
}

/**
 * Lo firmado, saneado con lista blanca: lo que no esté aquí se descarta
 * (también una fecha propia metida dentro de un repaso: ningún repaso
 * lleva la suya). Devuelve `[datos, null]` o `[null, 'qué campo no vale']`.
 */
function conforme_sanear(string $crudo, string $unidadId, string $listaId): array
{
    $d = json_decode($crudo, true);
    if (!is_array($d) || conforme_es_lista($d)) {
        return [null, 'Los datos del conforme no se pueden leer.'];
    }
    $mal = static fn (string $campo) => [null, "Los datos del conforme no valen: {$campo}."];

    if (($d['v'] ?? null) !== 1) {
        return $mal('la versión («v»)');
    }
    if (($d['unidadId'] ?? null) !== $unidadId) {
        return $mal('la vivienda («unidadId») no es la del envío');
    }
    if (!is_string($d['listaId'] ?? null) || strtolower($d['listaId']) !== strtolower($listaId)) {
        return $mal('la visita («listaId») no es la del envío');
    }
    if (($d['plantilla'] ?? null) !== 'B') {
        return $mal('la plantilla («plantilla»)');
    }

    $salida = ['v' => 1, 'unidadId' => $unidadId, 'listaId' => $listaId];
    $promo = conforme_texto($d['promoId'] ?? null, 60);
    if ($promo === null) {
        return $mal('la promoción («promoId»)');
    }
    $salida['promoId'] = $promo !== '' ? $promo : explode(':', $unidadId)[0];
    $salida['plantilla'] = 'B';
    foreach (['sociedad' => 120, 'promocion' => 120, 'vivienda' => 120] as $campo => $tope) {
        $valor = conforme_texto($d[$campo] ?? null, $tope);
        if ($valor === null) {
            return $mal("«{$campo}»");
        }
        $salida[$campo] = $valor;
    }

    $fechaVisita = is_string($d['fechaVisita'] ?? null) ? entrega_fecha($d['fechaVisita']) : '';
    if ($fechaVisita === '') {
        return $mal('la fecha de la visita («fechaVisita»)');
    }
    $salida['fechaVisita'] = $fechaVisita;
    $horaCruda = $d['horaVisita'] ?? '';
    if (!is_string($horaCruda) || (trim($horaCruda) !== '' && entrega_hora($horaCruda) === '')) {
        return $mal('la hora de la visita («horaVisita»)');
    }
    $salida['horaVisita'] = entrega_hora($horaCruda);

    $compradores = conforme_texto($d['compradores'] ?? null, 160);
    if ($compradores === null) {
        return $mal('los compradores («compradores»)');
    }
    $salida['compradores'] = $compradores;
    $escrituraCruda = $d['fechaEscritura'] ?? '';
    if (!is_string($escrituraCruda) || (trim($escrituraCruda) !== '' && entrega_fecha($escrituraCruda) === '')) {
        return $mal('la fecha de la escritura («fechaEscritura»)');
    }
    $salida['fechaEscritura'] = entrega_fecha($escrituraCruda);

    $realizadaPor = conforme_texto($d['realizadaPor'] ?? null, 120);
    if ($realizadaPor === null) {
        return $mal('quién hace la visita («realizadaPor»)');
    }
    $salida['realizadaPor'] = $realizadaPor;
    $realizadaPorId = $d['realizadaPorId'] ?? null;
    if ($realizadaPorId !== null && !(is_string($realizadaPorId) && es_uuid($realizadaPorId))) {
        return $mal('«realizadaPorId»');
    }
    $salida['realizadaPorId'] = $realizadaPorId;

    // Los repasos: solo su id y su texto, tal cual se firmó.
    $repasos = $d['repasos'] ?? null;
    if (!is_array($repasos) || !conforme_es_lista($repasos) || count($repasos) > CONFORME_REPASOS_MAX) {
        return $mal('la lista de repasos («repasos»)');
    }
    $limpios = [];
    $vistos = [];
    foreach ($repasos as $n => $r) {
        $numero = $n + 1;
        if (!is_array($r) || !is_string($r['id'] ?? null) || !es_uuid($r['id'])
            || !is_string($r['texto'] ?? null) || mb_strlen($r['texto']) > 4000) {
            return $mal("el repaso número {$numero} («repasos»)");
        }
        $id = strtolower($r['id']);
        if (isset($vistos[$id])) {
            return $mal("el repaso número {$numero} está repetido («repasos»)");
        }
        $vistos[$id] = true;
        $limpios[] = ['id' => $r['id'], 'texto' => $r['texto']];
    }

    // UNA fecha orientativa por conforme: un día concreto, obligatoria
    // si hay algún repaso. Sin repasos no existe: se guarda vacía.
    $orientativaCruda = $d['fechaOrientativa'] ?? '';
    $orientativa = is_string($orientativaCruda) ? entrega_fecha($orientativaCruda) : '';
    if ($limpios !== [] && $orientativa === '') {
        return $mal('falta la fecha orientativa de finalización («fechaOrientativa»)');
    }
    $salida['fechaOrientativa'] = $limpios !== [] ? $orientativa : '';

    // Las observaciones: texto libre, tal cual, con sus saltos de línea.
    $observaciones = $d['observaciones'] ?? '';
    if (!is_string($observaciones) || mb_strlen($observaciones) > CONFORME_OBSERVACIONES_MAX) {
        return $mal('las observaciones pasan de ' . CONFORME_OBSERVACIONES_MAX . ' letras («observaciones»)');
    }
    $salida['observaciones'] = $observaciones;

    // La línea de los contactos: cinco síes o noes, y nada más.
    $contactos = $d['contactos'] ?? null;
    $salida['contactos'] = [];
    foreach (['dados', 'piscina', 'clima', 'domotica', 'armarios'] as $clave) {
        if (!is_array($contactos) || !is_bool($contactos[$clave] ?? null)) {
            return $mal("los contactos («contactos.{$clave}»)");
        }
        $salida['contactos'][$clave] = $contactos[$clave];
    }
    $salida['repasos'] = $limpios;

    // Las firmas: una o dos, y TODAS firmadas. Quien no firma no figura.
    $firmas = $d['firmas'] ?? null;
    if (!is_array($firmas) || !conforme_es_lista($firmas) || count($firmas) < 1 || count($firmas) > 2) {
        return $mal('las firmas («firmas»): tiene que haber una o dos');
    }
    $salida['firmas'] = [];
    foreach ($firmas as $n => $f) {
        $numero = $n + 1;
        if (!is_array($f)) {
            return $mal("la firma número {$numero} («firmas»)");
        }
        $nombre = conforme_texto($f['nombre'] ?? null, 120, true);
        $firmadoEn = is_string($f['firmadoEn'] ?? null) ? iso($f['firmadoEn'], '') : '';
        $fecha = is_string($f['fecha'] ?? null) ? entrega_fecha($f['fecha']) : '';
        $hora = is_string($f['hora'] ?? null) ? entrega_hora($f['hora']) : '';
        if ($nombre === null) {
            return $mal("el nombre de la firma número {$numero} («firmas.nombre»)");
        }
        if ($firmadoEn === '') {
            return $mal("cuándo se firmó la firma número {$numero} («firmas.firmadoEn»)");
        }
        if ($fecha === '' || $hora === '') {
            return $mal("la fecha o la hora de la firma número {$numero} («firmas.fecha», «firmas.hora»)");
        }
        $salida['firmas'][] = ['nombre' => $nombre, 'firmadoEn' => $firmadoEn, 'fecha' => $fecha, 'hora' => $hora];
    }

    $paginas = $d['paginas'] ?? null;
    if (!is_int($paginas) || $paginas < 1 || $paginas > CONFORME_PAGINAS_MAX) {
        return $mal('el número de páginas («paginas»)');
    }
    $salida['paginas'] = $paginas;

    return [$salida, null];
}

/** Lo firmado tal como se guarda: sin escapar tildes ni barras, que si no cada eñe ocuparía seis bytes. */
function conforme_json(array $datos): string
{
    return (string) json_encode(
        $datos,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS | JSON_INVALID_UTF8_SUBSTITUTE
    );
}

/* ═══ El candado de la visita ═════════════════════════════════════
   El mismo patrón que el candado de la reunión (index.php): quien va a
   resucitar una visita y escribirle su conforme lo hace con la lista
   cogida, y el siguiente ESPERA y lee ya lo que el anterior dejó. Sin
   él, dos móviles que firmasen la misma visita a la vez pasarían los
   dos la pregunta de «¿tiene ya su conforme?» y quedarían dos papeles
   firmados para una sola visita. */

/** Empieza la transacción de quien va a escribir un conforme. */
function posventa_cerrar(PDO $bd): void
{
    if (motor() === 'sqlite') {
        $bd->exec('BEGIN IMMEDIATE');
        return;
    }
    $bd->beginTransaction();
}

/** La fila entera de la lista como está AHORA, cogida hasta posventa_abrir(). Solo después de posventa_cerrar(). */
function posventa_releer_lista(PDO $bd, string $listaId): ?array
{
    $sent = $bd->prepare('SELECT * FROM listas WHERE id = ?' . (motor() === 'sqlite' ? '' : ' FOR UPDATE'));
    $sent->execute([$listaId]);
    $fila = $sent->fetch() ?: null;
    $sent->closeCursor();
    return $fila;
}

/** Acaba la transacción: guarda lo escrito, o lo deshace. */
function posventa_abrir(PDO $bd, bool $bien): void
{
    if (motor() === 'sqlite') {
        $bd->exec($bien ? 'COMMIT' : 'ROLLBACK');
        return;
    }
    if ($bien) {
        $bd->commit();
    } elseif ($bd->inTransaction()) {
        $bd->rollBack();
    }
}

/* ═══ POST conformes · guardar un conforme firmado ════════════════ */

/**
 * POST /conformes · formulario con fichero: `id`, `listaId`, `unidadId`,
 * `creado`, `huella`, `datos` y `fichero` (el PDF).
 *
 * Contesta 200 `{ ok, id, tam, huella, repetido }`. Para el móvil:
 * 400, 409, 413 y 415 son un RECHAZO de verdad (lo enseña y aparta el
 * apunte); 403 es «esta sesión no puede» (el apunte espera a que entre
 * quien pueda); 503 y 500 son «todavía no» (reintenta en la siguiente
 * pasada). NUNCA contesta 404: una visita que aún no ha llegado es un
 * 503, porque su apunte va delante en la cola.
 *
 * EL PAPEL FIRMADO MANDA SOBRE UN BORRADO. Mientras el conforme no sube
 * (pueden ser horas, si se firmó sin cobertura), en los demás móviles
 * la visita sale «en curso» y quien hace visitas puede borrarla. Si por
 * eso se rechazara, el papel que firmó el comprador no entraría nunca
 * en el servidor ni en la copia. Así que una visita borrada no se
 * rechaza: se resucita, con los repasos que figuran en el conforme.
 */
function subir_conforme(): void
{
    $yo = exigir_sesion();
    if (!puede_visitar($yo)) {
        responder_error(403, 'El conforme de la visita lo recogen el administrador, el comercial o la dirección facultativa.', 'sin-permiso');
    }
    $pdo = bd();
    if (!in_array('datos', esquema_columnas($pdo, 'medios'), true)) {
        responder_error(503, 'Todavía no se pueden guardar conformes. Vuelve a intentarlo en un momento.', 'esquema');
    }

    // Si el envío entero pasa del tope de PHP (post_max_size), PHP vacía
    // el formulario: no llega ni un campo. Sin esta pregunta se
    // contestaría «no trae su identificador», que no es lo que ha pasado.
    if ($_POST === [] && $_FILES === [] && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0
        && stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') === 0) {
        responder_error(413, 'El documento firmado pesa demasiado.', 'grande');
    }

    // La forma de lo que llega.
    $id = (string) ($_POST['id'] ?? '');
    $listaId = (string) ($_POST['listaId'] ?? '');
    $unidadId = (string) ($_POST['unidadId'] ?? '');
    $creado = iso(is_string($_POST['creado'] ?? null) ? $_POST['creado'] : '', '');
    $huella = strtolower((string) ($_POST['huella'] ?? ''));
    $crudo = $_POST['datos'] ?? '';
    if (!es_uuid($id)) {
        responder_error(400, 'El conforme no trae su identificador («id»).', 'formato');
    }
    if (!es_uuid($listaId)) {
        responder_error(400, 'El conforme no dice de qué visita es («listaId»).', 'formato');
    }
    if (!es_unidad($unidadId)) {
        responder_error(400, 'El conforme no dice de qué vivienda es («unidadId»).', 'formato');
    }
    if ($creado === '') {
        responder_error(400, 'El conforme no dice cuándo se firmó («creado»).', 'formato');
    }
    if (!preg_match('/^[0-9a-f]{64}$/', $huella)) {
        responder_error(400, 'El conforme no trae la huella de su fichero («huella»).', 'formato');
    }
    if (!is_string($crudo) || $crudo === '') {
        responder_error(400, 'El conforme no trae sus datos («datos»).', 'formato');
    }
    if (strlen($crudo) > CONFORME_DATOS_MAX) {
        responder_error(413, 'Los datos del conforme ocupan demasiado.', 'datos-grandes');
    }
    [$datos, $pega] = conforme_sanear($crudo, $unidadId, $listaId);
    if ($datos === null) {
        responder_error(400, (string) $pega, 'formato');
    }

    // El fichero: que haya llegado, que no pese de más y que sea un PDF.
    if (!isset($_FILES['fichero']) || !is_array($_FILES['fichero']) || ($_FILES['fichero']['error'] ?? -1) !== UPLOAD_ERR_OK) {
        $codigo = $_FILES['fichero']['error'] ?? -1;
        if (in_array($codigo, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            responder_error(413, 'El documento firmado pesa demasiado.', 'grande');
        }
        // Un fichero que llegó A MEDIAS (la cobertura se cortó) no es un
        // rechazo del conforme: es «todavía no», y el móvil lo reintenta.
        // Si se contestara 400, el móvil apartaría un papel ya firmado
        // por un corte de red.
        if ($codigo === UPLOAD_ERR_PARTIAL) {
            responder_error(503, 'El documento firmado ha llegado incompleto. Se volverá a intentar.', 'fichero-incompleto');
        }
        // Y si es el servidor el que no ha podido recogerlo (sin carpeta
        // temporal, sin sitio en el disco), tampoco: es un fallo de aquí.
        if (in_array($codigo, [UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE, UPLOAD_ERR_EXTENSION], true)) {
            responder_error(500, 'No se pudo guardar el documento firmado.', 'guardar');
        }
        responder_error(400, 'No llegó el documento firmado.', 'fichero');
    }
    $temporal = (string) $_FILES['fichero']['tmp_name'];
    $tam = (int) $_FILES['fichero']['size'];
    if ($tam < 1 || $tam > CONFORME_FICHERO_MAX) {
        responder_error(413, 'El documento firmado pesa demasiado.', 'grande');
    }
    // El tipo se mira en el contenido, no en lo que diga el navegador.
    $detectado = (new finfo(FILEINFO_MIME_TYPE))->file($temporal) ?: '';
    if ($detectado !== 'application/pdf') {
        responder_error(415, 'El documento firmado tiene que ser un PDF.', 'mime');
    }
    // Lo que ha llegado es lo que salió del móvil: misma huella. Si no,
    // la subida se cortó a medias: no se guarda nada y se reintenta.
    clearstatcache(true, $temporal);
    if ((int) @filesize($temporal) !== $tam || !hash_equals($huella, (string) @hash_file('sha256', $temporal))) {
        responder_error(503, 'El documento firmado ha llegado incompleto. Se volverá a intentar.', 'fichero-incompleto');
    }

    // ¿Ya está guardado? La cola reintenta lo que llegó pero cuya
    // respuesta se perdió: mismo id y misma huella es «hecho».
    $repetido = conforme_ya_guardado($pdo, $id, $huella);
    if ($repetido !== null) {
        responder($repetido);
    }

    // La visita: que haya llegado, que sea una visita y de esa vivienda.
    $lista = posventa_lista_guardada($listaId);
    if ($lista === null) {
        responder_error(503, 'La visita de este conforme todavía no ha llegado al servidor. Se volverá a intentar.', 'aun-no');
    }
    if ($lista['fase'] !== POSVENTA_FASE_VISITA || $lista['unidad_id'] !== $unidadId) {
        responder_error(409, 'Ese conforme no corresponde a una visita de repasos de esa vivienda.', 'no-es-visita');
    }
    $vivo = posventa_conforme_de_lista($listaId, true);
    if ($vivo !== null) {
        // Puede ser ESTE mismo conforme, que otra subida suya acaba de
        // dejar entre la pregunta de arriba y esta (un reintento que se
        // cruza con el primer envío): entonces es «hecho», no un rechazo.
        if (strtolower($vivo['id']) === strtolower($id)) {
            $repetido = conforme_ya_guardado($pdo, $id, $huella);
            if ($repetido !== null) {
                responder($repetido);
            }
        }
        responder_error(409, 'Esta visita ya tiene su conforme firmado.', 'ya-firmada');
    }

    // El fichero. Su sitio es AAAA/MM/<id>.pdf, como las fotos; el año y
    // el mes salen del día de la firma y no del de la subida: así un
    // reintento va SIEMPRE al mismo fichero, aunque llegue otro mes.
    //
    // Pero no se deja ahí todavía: primero va a un nombre provisional,
    // suyo y de nadie más, y solo pasa a su sitio dentro del candado,
    // cuando ya se sabe que este conforme es el que entra. Si se dejara
    // directamente en su sitio, una subida que al final se rechaza (o un
    // reintento cruzado) podría pisar o borrar el papel que ya estaba
    // guardado con ese mismo identificador.
    $anio = (int) substr($creado, 0, 4);
    $carpetaDelMes = $anio >= 2020 && $anio <= (int) gmdate('Y') + 1
        ? substr($creado, 0, 4) . '/' . substr($creado, 5, 2)
        : gmdate('Y/m');
    $relativa = $carpetaDelMes . '/' . strtolower($id) . '.pdf';
    $destino = carpeta_medios() . '/' . $relativa;
    $provisional = $destino . '.' . bin2hex(random_bytes(6)) . '.parte';
    if (!is_dir(dirname($destino)) && !mkdir(dirname($destino), 0755, true) && !is_dir(dirname($destino))) {
        responder_error(500, 'No se pudo crear la carpeta de destino.', 'carpeta');
    }
    if (!move_uploaded_file($temporal, $provisional)) {
        responder_error(500, 'No se pudo guardar el documento firmado.', 'guardar');
    }
    @chmod($provisional, 0644);
    // Se mira lo que ha quedado en el disco: los mismos bytes y la misma
    // huella. Si no —disco lleno, escritura cortada—, no vale.
    clearstatcache(true, $provisional);
    if ((int) @filesize($provisional) !== $tam || !hash_equals($huella, (string) @hash_file('sha256', $provisional))) {
        @unlink($provisional);
        responder_error(500, 'El documento firmado se guardó incompleto.', 'guardar-corto');
    }
    // Hasta aquí no se ha escrito nada en la base, ni se ha tocado el
    // sitio definitivo del fichero.

    $ahora = ahora_iso();
    $datos['huellaFichero'] = $huella;
    $datos['tam'] = $tam;
    $datos['recibidoEn'] = $ahora;
    $datos['subidoPor'] = ['id' => es_uuid($yo['id']) ? $yo['id'] : null, 'nombre' => (string) $yo['nombre']];
    $json = conforme_json($datos);
    if (strlen($json) > CONFORME_DATOS_GUARDADOS_MAX) {
        @unlink($provisional);
        responder_error(413, 'Los datos del conforme ocupan demasiado.', 'datos-grandes');
    }

    // Resucitar la visita y escribir su conforme, las dos cosas o
    // ninguna, con la lista cogida (ver «El candado de la visita»).
    $rechazo = null;   // [código, frase, clave] si al releer ya no se puede
    $yaEstaba = null;
    posventa_cerrar($pdo);
    try {
        $fila = posventa_releer_lista($pdo, $listaId);
        $yaEstaba = conforme_ya_guardado($pdo, $id, $huella, false);
        if ($yaEstaba !== null) {
            // Otra subida de este mismo conforme ha llegado antes.
        } elseif ($fila === null) {
            $rechazo = [503, 'La visita de este conforme todavía no ha llegado al servidor. Se volverá a intentar.', 'aun-no'];
        } elseif (conforme_id_ocupado($pdo, $id)) {
            $rechazo = [409, 'Ya hay otro fichero guardado con ese identificador.', 'distinto'];
        } elseif (posventa_conforme_de_lista($listaId, true) !== null) {
            $rechazo = [409, 'Esta visita ya tiene su conforme firmado.', 'ya-firmada'];
        } elseif (!@rename($provisional, $destino)) {
            // El fichero, a su sitio, ANTES de escribir la fila: si lo
            // que fallara fuese la base, quedaría un fichero suelto que
            // el reintento pisa; al revés quedaría una fila viva sin su
            // papel, que es lo que no puede pasar.
            $rechazo = [500, 'No se pudo guardar el documento firmado.', 'guardar'];
        } else {
            // La visita, viva. El `actualizado` que se escribe es el más
            // nuevo entre «ahora» y el guardado: así upsert() no la da
            // por vieja y el móvil que la borró la adopta al bajarle.
            if ((int) $fila['borrada'] === 1) {
                unset($fila['recibido']);
                $fila['borrada'] = 0;
                $fila['actualizado'] = max($ahora, (string) $fila['actualizado']);
                upsert('listas', $fila);
            }
            // Y sus repasos firmados, vivos (se haya resucitado la lista
            // o no: pudo borrarse un repaso suelto).
            $leer = $pdo->prepare('SELECT * FROM tareas WHERE id = ? AND lista_id = ? AND borrada = 1');
            foreach ($datos['repasos'] as $r) {
                $leer->execute([$r['id'], $listaId]);
                $repaso = $leer->fetch() ?: null;
                $leer->closeCursor();
                if ($repaso === null) {
                    continue;
                }
                unset($repaso['recibido']);
                $repaso['borrada'] = 0;
                $repaso['actualizado'] = max($ahora, (string) $repaso['actualizado']);
                upsert('tareas', $repaso);
            }
            upsert('medios', [
                'id'            => $id,
                'tarea_id'      => $listaId,
                'comentario_id' => null,
                'tipo'          => 'documento',
                'mime'          => 'application/pdf',
                'tam'           => $tam,
                'ancho'         => 0,
                'alto'          => 0,
                'duracion'      => 0,
                'ruta'          => $relativa,
                'datos'         => $json,
                'borrada'       => 0,
                'creado'        => $creado,
                'actualizado'   => $ahora,
            ]);
        }
        posventa_abrir($pdo, $rechazo === null);
    } catch (Throwable $e) {
        try {
            posventa_abrir($pdo, false);
        } catch (Throwable $otro) {
            // nada: lo que importa es el primer fallo
        }
        // Si el fichero ya había pasado a su sitio, no estorba: el
        // reintento, con el mismo identificador, lo pisa.
        @unlink($provisional);
        throw $e;
    }
    // El provisional de quien no ha entrado (porque ya estaba, o porque
    // se rechaza) no es de nadie. El de quien ha entrado ya no existe:
    // es el fichero definitivo.
    @unlink($provisional);

    if ($yaEstaba !== null) {
        responder($yaEstaba);
    }
    if ($rechazo !== null) {
        responder_error($rechazo[0], $rechazo[1], $rechazo[2]);
    }
    responder(['ok' => true, 'id' => $id, 'tam' => $tam, 'huella' => $huella, 'repetido' => false]);
}

/**
 * Si ya hay guardado un conforme con ese identificador y esa misma
 * huella, la respuesta de «hecho»; si no lo hay, null. Fuera del
 * candado, además, corta con 409 cuando el identificador es de otra
 * cosa (otro fichero, o una foto).
 */
function conforme_ya_guardado(PDO $pdo, string $id, string $huella, bool $cortar = true): ?array
{
    $sent = $pdo->prepare('SELECT tipo, tam, datos FROM medios WHERE id = ?');
    $sent->execute([$id]);
    $fila = $sent->fetch() ?: null;
    $sent->closeCursor();
    if ($fila === null) {
        return null;
    }
    $guardados = json_decode((string) ($fila['datos'] ?? ''), true);
    if ((string) $fila['tipo'] === 'documento' && is_array($guardados)
        && is_string($guardados['huellaFichero'] ?? null) && hash_equals($guardados['huellaFichero'], $huella)) {
        return ['ok' => true, 'id' => $id, 'tam' => (int) $fila['tam'], 'huella' => $huella, 'repetido' => true];
    }
    if ($cortar) {
        responder_error(409, 'Ya hay otro fichero guardado con ese identificador.', 'distinto');
    }
    return null;
}

/** ¿Hay ya una fila de `medios` con ese identificador? */
function conforme_id_ocupado(PDO $pdo, string $id): bool
{
    $sent = $pdo->prepare('SELECT 1 FROM medios WHERE id = ?');
    $sent->execute([$id]);
    $hay = $sent->fetchColumn() !== false;
    $sent->closeCursor();
    return $hay;
}
