<?php
/**
 * La precarga de las entregas: los compradores, las firmas y las
 * visitas ya hechas que se sabían al estrenar el calendario (noviembre
 * de 2026, fase 1), para no tener que teclear veinticuatro fichas a
 * mano. Viven en api/precarga-entregas.php, un PHP mudo que devuelve
 * un array y no imprime nada, como la cuenta de revisión: pedirlo por
 * su dirección da una página en blanco. Lleva nombre y primer
 * apellido, sin más (lo decidió Fran: con eso no se identifica a
 * nadie, y no quería andar con secretos de GitHub).
 *
 * Se aplica una vez por versión del fichero (huella en `meta`) y solo
 * RELLENA lo que esté vacío: lo que alguien haya puesto ya desde la
 * app manda siempre sobre la precarga.
 *
 * Forma del array:
 *   [ 'version' => '2026-10-29',
 *     'autorNombre' => 'Precarga',                     (opcional)
 *     'comerciales' => [ [ 'empresa' => 'gilmar', 'nombre' => 'ezequiel' ] ],   (opcional)
 *     'entregas' => [
 *       [ 'unidadId' => 'brassie:02', 'compradores' => 'Dolores Montesdeoca',
 *         'firma' => '2026-10-20', 'revision' => '2026-10-15', 'revisionHora' => '',
 *         'revisadaEn' => '2026-10-15T18:00:00.000Z' ],   // la visita ya se hizo
 *       … ],
 *     'correcciones' => [                              (opcional)
 *       [ 'unidadId' => 'brassie:13', 'compradoresEra' => '<sha256 de lo que había>',
 *         'compradores' => 'Nombre Apellido' ],
 *       … ] ]
 *
 * Las correcciones son la única excepción al «solo rellena»: cambian
 * unos compradores que la propia precarga puso mal. Para no volver a
 * escribir en un repositorio público justo lo que se quiere quitar, la
 * regla no lleva el valor viejo sino su huella: solo se corrige si lo
 * guardado sigue siendo exactamente aquello. Lo que alguien haya
 * escrito después desde la app no se toca.
 */
declare(strict_types=1);

// Los saneadores de fechas y de claves de vivienda viven con las entregas.
require_once __DIR__ . '/entregas.php';

function precarga_fichero(): string
{
    return __DIR__ . '/../precarga-entregas.php';
}

/**
 * Se llama en cada arranque, con la base ya al día. Si no hay fichero,
 * o ya se aplicó esta misma versión, compara una huella y se va.
 */
function precarga_entregas_al_dia(PDO $pdo): void
{
    try {
        $fichero = precarga_fichero();
        if (!is_readable($fichero)) {
            return;
        }
        $datos = include $fichero;
        if (!is_array($datos) || empty($datos['version']) || !is_array($datos['entregas'] ?? null)) {
            error_log('UNIK Works · precarga-entregas.php existe pero no tiene la forma esperada.');
            return;
        }
        $huella = hash('sha256', json_encode($datos));
        if (revision_meta($pdo, 'precarga_entregas') === $huella) {
            return;
        }
        if (esquema_columnas($pdo, 'entregas') === []) {
            return;   // la tabla llega en el siguiente arranque; se vuelve a intentar
        }
        $n = precarga_aplicar($pdo, $datos);
        $corregidas = precarga_corregir($pdo, is_array($datos['correcciones'] ?? null) ? $datos['correcciones'] : []);
        $comerciales = precarga_comerciales($pdo, $datos['comerciales'] ?? []);
        revision_meta($pdo, 'precarga_entregas', $huella);
        error_log("UNIK Works · precarga de entregas {$datos['version']} aplicada: {$n} ficha(s) tocada(s)"
            . ($corregidas ? "; {$corregidas} corregida(s)" : '')
            . ($comerciales ? '; con el chip comercial: ' . implode(', ', $comerciales) : '') . '.');
    } catch (Throwable $e) {
        // Una precarga torcida no puede tumbar la app: se apunta y sigue.
        error_log('UNIK Works · precarga de entregas: ' . $e->getMessage());
    }
}

/** Rellena hecho a hecho lo que esté vacío. Devuelve cuántas fichas tocó. */
function precarga_aplicar(PDO $pdo, array $datos): int
{
    $version = (string) $datos['version'];
    // El sello de lo precargado es el día de la versión, a mediodía:
    // así en el muro queda por debajo de lo que se haga desde ese día.
    $sello = preg_match('/^\d{4}-\d{2}-\d{2}$/', $version) ? "{$version}T12:00:00.000Z" : ahora_iso();
    $autor = mb_substr(trim((string) ($datos['autorNombre'] ?? 'Precarga')), 0, 120) ?: 'Precarga';
    $hechos = [
        'compradores' => ['sello' => 'compradores_fijados_en', 'campos' => ['compradores'], 'autor' => null],
        'revision'    => ['sello' => 'revision_fijada_en', 'campos' => ['revision', 'revision_hora'], 'autor' => 'revision_por'],
        'firma'       => ['sello' => 'firma_fijada_en', 'campos' => ['firma'], 'autor' => 'firma_por'],
        'revisada'    => ['sello' => 'revisada_fijada_en', 'campos' => ['revisada_en'], 'autor' => 'revisada_por'],
    ];
    $previa = $pdo->prepare('SELECT * FROM entregas WHERE id = ?');
    $tocadas = 0;
    foreach ($datos['entregas'] as $e) {
        if (!is_array($e)) {
            continue;
        }
        $unidad = trim((string) ($e['unidadId'] ?? ''));
        if (!es_unidad($unidad)) {
            continue;
        }
        $llega = [
            'compradores'   => mb_substr(trim((string) ($e['compradores'] ?? '')), 0, 160),
            'revision'      => entrega_fecha($e['revision'] ?? ''),
            'revision_hora' => entrega_hora($e['revisionHora'] ?? ''),
            'firma'         => entrega_fecha($e['firma'] ?? ''),
            'revisada_en'   => entrega_sello($e['revisadaEn'] ?? ''),
        ];
        if ($llega['revision'] === '') {
            $llega['revision_hora'] = '';
        }
        $previa->execute([$unidad]);
        $antes = $previa->fetch() ?: null;
        $registro = $antes ?: [
            'id' => $unidad, 'unidad_id' => $unidad, 'promo_id' => explode(':', $unidad)[0],
            'compradores' => '', 'revision' => '', 'revision_hora' => '', 'firma' => '', 'revisada_en' => '',
            'compradores_fijados_en' => '', 'revisada_fijada_en' => '',
            'revision_fijada_en' => '', 'revision_por' => null, 'revision_por_nombre' => '',
            'firma_fijada_en' => '', 'firma_por' => null, 'firma_por_nombre' => '',
            'revisada_por' => null, 'revisada_por_nombre' => '',
            'borrada' => 0, 'creado' => $sello, 'actualizado' => $sello,
            'creado_por' => null, 'creado_por_nombre' => $autor,
        ];
        $cambia = false;
        foreach ($hechos as $def) {
            // Solo si el hecho está vacío del todo: ni valor ni sello.
            $vacio = (string) ($registro[$def['sello']] ?? '') === '';
            foreach ($def['campos'] as $campo) {
                $vacio = $vacio && (string) ($registro[$campo] ?? '') === '';
            }
            $trae = array_filter(array_map(static fn ($c) => $llega[$c], $def['campos']), static fn ($v) => $v !== '');
            if (!$vacio || !$trae) {
                continue;
            }
            foreach ($def['campos'] as $campo) {
                $registro[$campo] = $llega[$campo];
            }
            // La visita hecha se sella con su propio cuándo, que es lo que lee el muro.
            $registro[$def['sello']] = $def['sello'] === 'revisada_fijada_en' ? $llega['revisada_en'] : $sello;
            if ($def['autor']) {
                $registro[$def['autor']] = null;
                $registro["{$def['autor']}_nombre"] = $autor;
            }
            $cambia = true;
        }
        if (!$cambia) {
            continue;
        }
        // La marca de la fila sube hasta ahora para que los móviles se la bajen.
        $registro['actualizado'] = max((string) $registro['actualizado'], ahora_iso());
        $columnas = array_keys($registro);
        if ($antes) {
            $sinId = $registro;
            unset($sinId['id']);
            $asignaciones = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($sinId)));
            $pdo->prepare("UPDATE entregas SET {$asignaciones} WHERE id = ?")
                ->execute([...array_values($sinId), $registro['id']]);
        } else {
            $pdo->prepare(sprintf(
                'INSERT INTO entregas (%s) VALUES (%s)',
                implode(', ', $columnas),
                implode(', ', array_fill(0, count($columnas), '?'))
            ))->execute(array_values($registro));
        }
        $tocadas++;
    }
    return $tocadas;
}

/**
 * Corrige compradores que la precarga puso mal (ver la cabecera). Cada
 * regla dice la vivienda, la huella sha256 de lo que había y lo que
 * tiene que haber. Si lo guardado ya no es aquello —alguien lo cambió
 * desde la app, o ya se corrigió—, no hace nada. El hecho se sella con
 * el ahora para que todos los móviles se bajen el nombre corregido.
 * Devuelve cuántas fichas ha corregido.
 */
function precarga_corregir(PDO $pdo, array $reglas): int
{
    $corregidas = 0;
    $leer = $pdo->prepare('SELECT compradores FROM entregas WHERE id = ?');
    $poner = $pdo->prepare('UPDATE entregas SET compradores = ?, compradores_fijados_en = ?, actualizado = ? WHERE id = ?');
    foreach ($reglas as $regla) {
        if (!is_array($regla)) {
            continue;
        }
        $unidad = trim((string) ($regla['unidadId'] ?? ''));
        $era = strtolower(trim((string) ($regla['compradoresEra'] ?? '')));
        $nuevo = mb_substr(trim((string) ($regla['compradores'] ?? '')), 0, 160);
        if (!es_unidad($unidad) || !preg_match('/^[0-9a-f]{64}$/', $era) || $nuevo === '') {
            continue;
        }
        $leer->execute([$unidad]);
        $guardado = $leer->fetchColumn();
        if ($guardado === false || !hash_equals($era, hash('sha256', (string) $guardado))) {
            continue;
        }
        $ahora = ahora_iso();
        $poner->execute([$nuevo, $ahora, $ahora, $unidad]);
        $corregidas++;
    }
    return $corregidas;
}

/**
 * El chip «Comercial» para quien diga el fichero: Fran no quiso ponerlo
 * a mano desde el móvil (6-11-2026). Cada regla casa por empresa o por
 * nombre, sin distinguir mayúsculas, solo entre los usuarios activos.
 * Devuelve los nombres a los que se les acaba de poner.
 */
function precarga_comerciales(PDO $pdo, array $reglas): array
{
    $puestos = [];
    foreach ($reglas as $regla) {
        if (!is_array($regla)) {
            continue;
        }
        $empresa = mb_strtolower(trim((string) ($regla['empresa'] ?? '')));
        $nombre = mb_strtolower(trim((string) ($regla['nombre'] ?? '')));
        if ($empresa === '' && $nombre === '') {
            continue;
        }
        $condiciones = [];
        $valores = [];
        if ($empresa !== '') {
            $condiciones[] = 'LOWER(empresa) LIKE ?';
            $valores[] = "%{$empresa}%";
        }
        if ($nombre !== '') {
            $condiciones[] = 'LOWER(nombre) LIKE ?';
            $valores[] = "%{$nombre}%";
        }
        $donde = 'activo = 1 AND comercial = 0 AND (' . implode(' OR ', $condiciones) . ')';
        $quienes = $pdo->prepare("SELECT id, nombre FROM usuarios WHERE {$donde}");
        $quienes->execute($valores);
        $filas = $quienes->fetchAll();
        if (!$filas) {
            continue;
        }
        $pdo->prepare("UPDATE usuarios SET comercial = 1 WHERE {$donde}")->execute($valores);
        foreach ($filas as $f) {
            $puestos[] = (string) $f['nombre'];
        }
    }
    return $puestos;
}
