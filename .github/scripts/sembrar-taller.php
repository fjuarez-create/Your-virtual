<?php

/**
 * Siembra el banco del taller: el esquema al día, las cuentas del
 * equipo copiadas de la app real y la cuenta de entrada del robot.
 *
 * Las cuentas llegan en un JSON con sus huellas cifradas
 * (password_hash), nunca con contraseñas: una huella no se puede
 * deshacer, y así en el taller cada uno entra con su usuario y su
 * contraseña de siempre sin que estas viajen por ningún sitio.
 *
 * El correo y la contraseña de la cuenta del robot llegan por
 * variables de entorno, nunca por argumentos: los argumentos se ven
 * en la lista de procesos.
 *
 * «ENTREGADAS» (esquema 23). Además:
 *
 *   - De cada cuenta se copian también sus dos chips: el de comercial y
 *     el de «Posventa» (con red: el volcado de la app de verdad no trae
 *     el segundo hasta que producción tenga el esquema 23).
 *   - Se siembran cuatro viviendas ya entregadas, las villas 46 a 49 de
 *     Brassie —que la precarga no toca—, una en cada estado que la
 *     pantalla distingue: sin fecha de visita, con cita por hacer, con
 *     visita firmada y repasos por dar por buenos, y cerrada. Con
 *     nombres inventados. Es AÑADIR, nunca borrar: la villa que ya
 *     tenga ficha se deja tal cual, y pasarlo dos veces no duplica nada.
 *     El «conforme» de las dos firmadas es un PDF de MUESTRA que lo dice
 *     bien claro (no lo ha firmado nadie): el de verdad lo genera la app
 *     en el móvil al firmar.
 *   - Con el esquema 24 llega el quinto botón, la fotovoltaica: la 48
 *     la tiene con cita y la 49, la cerrada, también. A un taller que
 *     ya estaba sembrado de antes se le pone a esas dos villas UNA vez
 *     (completar_fotovoltaica_de_muestra), solo si su ficha es de la
 *     siembra y nadie ha tocado ese botón: es añadir lo que faltaba,
 *     no pisar nada.
 *   - Y, SOLO si el entorno trae TALLER_POSVENTA_EMAIL y
 *     TALLER_POSVENTA_PASSWORD, una cuenta de pruebas que lleva solo el
 *     chip «Posventa». Si no vienen, no se crea: una cuenta con una
 *     contraseña escrita aquí sería una puerta abierta al taller, que
 *     este repositorio es público. Sin ella, el chip se lo pone el
 *     administrador a quien quiera desde la pantalla de Usuarios.
 */

declare(strict_types=1);

$api = $argv[1] ?? '';
$ficheroUsuarios = $argv[2] ?? '';
$email = (string) getenv('TALLER_EMAIL');
$password = (string) getenv('TALLER_PASSWORD');
$nombre = (string) (getenv('TALLER_NOMBRE') ?: 'Revisión (taller)');

if ($api === '' || !is_dir($api)) {
    fwrite(STDERR, "Falta la carpeta api del taller.\n");
    exit(1);
}
if ($email === '' || $password === '') {
    fwrite(STDERR, "Faltan TALLER_EMAIL y TALLER_PASSWORD en el entorno.\n");
    exit(1);
}

require_once $api . '/lib/nucleo.php';
require_once $api . '/lib/esquema.php';

$pdo = bd();
esquema_aplicar_o_anotar($pdo);

$meter = $pdo->prepare(
    'INSERT INTO usuarios (id, nombre, email, password_hash, rol, empresa,
                           verifica, comercial, posventa, activo, creado, actualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

$copiados = 0;
if ($ficheroUsuarios !== '') {
    $filas = json_decode((string) file_get_contents($ficheroUsuarios), true);
    if (!is_array($filas) || $filas === []) {
        fwrite(STDERR, "El fichero de usuarios no trae ninguna fila.\n");
        exit(1);
    }
    foreach ($filas as $u) {
        if (empty($u['email']) || empty($u['password_hash'])) {
            continue;
        }
        $meter->execute([
            (string) ($u['id'] ?? uuid()),
            (string) ($u['nombre'] ?? 'Sin nombre'),
            mb_strtolower(trim((string) $u['email'])),
            (string) $u['password_hash'],
            ($u['rol'] ?? 'usuario') === 'admin' ? 'admin' : 'usuario',
            (string) ($u['empresa'] ?? ''),
            ((int) ($u['verifica'] ?? 0)) ? 1 : 0,
            // Los dos chips. El de «Posventa» no viene en el volcado
            // hasta que la app de verdad tenga el esquema 23: sin él, no.
            ((int) ($u['comercial'] ?? 0)) ? 1 : 0,
            ((int) ($u['posventa'] ?? 0)) ? 1 : 0,
            ((int) ($u['activo'] ?? 1)) ? 1 : 0,
            (string) ($u['creado'] ?? ahora_iso()),
            ahora_iso(),
        ]);
        $copiados++;
    }
}

// La cuenta de entrada del robot, que es también con la que el robot
// comprueba que el taller respira: si vino copiada de la app real se
// la asciende, y si no existía se crea. En el taller manda; en la app
// real sigue siendo la de siempre.
$correo = mb_strtolower(trim($email));
$hay = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
$hay->execute([$correo]);
$id = $hay->fetchColumn();
if ($id) {
    $pdo->prepare(
        "UPDATE usuarios SET rol = 'admin', verifica = 1, activo = 1,
                password_hash = ?, actualizado = ? WHERE id = ?"
    )->execute([password_hash($password, PASSWORD_DEFAULT), ahora_iso(), $id]);
} else {
    $meter->execute([
        uuid(), $nombre, $correo, password_hash($password, PASSWORD_DEFAULT),
        'admin', 'UNIK — Promotor', 1, 0, 0, 1, ahora_iso(), ahora_iso(),
    ]);
}

// La cuenta de pruebas que lleva SOLO el chip «Posventa»: da por buenos
// los repasos de las visitas de repasos, y nada más. Solo si el entorno
// trae su correo y su contraseña (ver la cabecera). Si ya existe, se
// deja como tiene que estar.
$correoPosventa = mb_strtolower(trim((string) getenv('TALLER_POSVENTA_EMAIL')));
$clavePosventa = (string) getenv('TALLER_POSVENTA_PASSWORD');
$conPosventa = false;
if ($correoPosventa !== '' && $clavePosventa !== '' && $correoPosventa !== $correo) {
    $hay->execute([$correoPosventa]);
    $idPosventa = $hay->fetchColumn();
    if ($idPosventa) {
        $pdo->prepare(
            "UPDATE usuarios SET rol = 'usuario', verifica = 0, comercial = 0, posventa = 1, activo = 1,
                    password_hash = ?, actualizado = ? WHERE id = ?"
        )->execute([password_hash($clavePosventa, PASSWORD_DEFAULT), ahora_iso(), $idPosventa]);
    } else {
        $meter->execute([
            uuid(), 'Posventa (taller)', $correoPosventa, password_hash($clavePosventa, PASSWORD_DEFAULT),
            'usuario', 'Pruebas del taller', 0, 0, 1, 1, ahora_iso(), ahora_iso(),
        ]);
    }
    $conPosventa = true;
}

$sembradas = sembrar_entregadas($pdo);
$completadas = completar_fotovoltaica_de_muestra($pdo);

// El banco viaja por FTP como un solo fichero: se recoge el diario
// WAL antes de cerrar, para que no queden flecos aparte. Con un
// cursor abierto SQLite no suelta el candado, así que primero se
// cierran las consultas.
$hay->closeCursor();
$hay = null;
$meter = null;
$pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');

echo "Banco del taller sembrado: {$copiados} cuentas copiadas de la app real y la cuenta del robot al mando.\n";
echo "«Entregadas»: {$sembradas} vivienda(s) de muestra sembrada(s) (villas 46 a 49)"
    . ($completadas > 0 ? ", {$completadas} con la fotovoltaica puesta ahora" : '')
    . ($conPosventa ? ', y la cuenta de pruebas con el chip «Posventa».' : '. Sin cuenta de pruebas con el chip «Posventa» (no venía en el entorno).') . "\n";

/* ═══════════════════════════════════════════════════════════════
   «Entregadas»: cuatro viviendas de muestra
   ═══════════════════════════════════════════════════════════════ */

/**
 * La fotovoltaica de las dos villas de muestra que la llevan: a cuántos
 * días de hoy cae su cita y a cuántos se apuntó (con su hora). La 48,
 * con la cita por llegar; la 49, la cerrada, con la suya ya pasada.
 */
function fotovoltaica_de_muestra(): array
{
    // (Una función y no una constante: la siembra corre arriba, antes
    // de que PHP pase por una «const» escrita aquí abajo.)
    return [
        '48' => [7, -3, '11:04'],
        '49' => [-4, -10, '11:04'],
    ];
}

/**
 * A un taller sembrado ANTES del esquema 24 le faltan, en la 48 y la 49,
 * la cita de la fotovoltaica (y la 49 dejaría de salir «Cerrada»). Se la
 * pone, una vez, solo si la ficha es de la siembra y nadie ha tocado
 * todavía ese botón (su sello está vacío): si alguien lo pulsó en el
 * taller, se deja como lo dejó. La ficha queda pendiente de numerar
 * (`recibido = ''`) para que baje a los móviles. Devuelve a cuántas.
 */
function completar_fotovoltaica_de_muestra(PDO $pdo): int
{
    if (!in_array('fotovoltaica_fijada_en', esquema_columnas($pdo, 'entregas'), true)) {
        return 0;   // un banco sin el esquema 24: no hay dónde ponerla
    }
    $canaria = new DateTimeZone('Atlantic/Canary');
    $hoy = new DateTimeImmutable('today', $canaria);
    $dia = static fn (int $dias): string => $hoy->modify(($dias >= 0 ? '+' : '') . $dias . ' days')->format('Y-m-d');
    $poner = $pdo->prepare(
        "UPDATE entregas
            SET fotovoltaica = ?, fotovoltaica_fijada_en = ?, fotovoltaica_por = NULL, fotovoltaica_por_nombre = 'Siembra del taller',
                actualizado = ?, recibido = ''
          WHERE id = ? AND creado_por_nombre = 'Siembra del taller' AND fotovoltaica_fijada_en = ''"
    );
    $cuantas = 0;
    foreach (fotovoltaica_de_muestra() as $nn => [$cita, $hace, $hora]) {
        $apuntada = (new DateTimeImmutable($dia($hace) . ' ' . $hora, $canaria))
            ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.000\Z');
        $poner->execute([$dia($cita), $apuntada, ahora_iso(), "brassie:{$nn}"]);
        $cuantas += $poner->rowCount();
    }
    return $cuantas;
}

/** Un identificador con forma de uuid que sale SIEMPRE igual de un mismo nombre: así sembrar dos veces no duplica. */
function uuid_fijo(string $nombre): string
{
    $h = md5('taller-entregadas:' . $nombre);
    $h[12] = '4';
    $h[16] = '8';
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split($h, 4));
}

/**
 * Un PDF de una página, hecho a mano, con unas líneas de texto. Es la
 * MUESTRA que hace de papel en las dos visitas sembradas como firmadas:
 * dice bien claro que no lo ha firmado nadie. El conforme de verdad lo
 * dibuja la app (js/pdfConforme.js) en el móvil.
 */
function pdf_de_muestra(array $lineas): string
{
    $texto = "BT\n/F1 11 Tf\n14 TL\n56 780 Td\n";
    foreach ($lineas as $n => $linea) {
        foreach (explode("\n", wordwrap((string) $linea, 88, "\n", true)) as $trozo) {
            $ansi = (string) mb_convert_encoding($trozo, 'Windows-1252', 'UTF-8');
            $texto .= ($n === 0 ? '/F1 15 Tf ' : '') . '(' . strtr($ansi, ['\\' => '\\\\', '(' => '\\(', ')' => '\\)']) . ") Tj T*\n" . ($n === 0 ? "/F1 11 Tf T*\n" : '');
        }
    }
    $texto .= "ET\n";
    $objetos = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        '<< /Length ' . strlen($texto) . " >>\nstream\n" . $texto . 'endstream',
    ];
    $pdf = "%PDF-1.4\n";
    $sitios = [];
    foreach ($objetos as $i => $objeto) {
        $sitios[] = strlen($pdf);
        $pdf .= ($i + 1) . " 0 obj\n{$objeto}\nendobj\n";
    }
    $tabla = strlen($pdf);
    $pdf .= 'xref' . "\n0 " . (count($objetos) + 1) . "\n0000000000 65535 f \n";
    foreach ($sitios as $sitio) {
        $pdf .= sprintf("%010d 00000 n \n", $sitio);
    }
    return $pdf . "trailer\n<< /Size " . (count($objetos) + 1) . " /Root 1 0 R >>\nstartxref\n{$tabla}\n%%EOF\n";
}

/**
 * Siembra las villas 46 a 49 como ya entregadas, una en cada estado.
 * Devuelve cuántas ha sembrado (0 si ya estaban todas). La villa que ya
 * tenga ficha de entrega no se toca, ni se le añade nada.
 */
function sembrar_entregadas(PDO $pdo): int
{
    if (!in_array('posventa', esquema_columnas($pdo, 'entregas'), true) || !in_array('datos', esquema_columnas($pdo, 'medios'), true)) {
        fwrite(STDERR, "El banco no tiene todavía las columnas de «Entregadas» (esquema 23): no se siembran las viviendas de muestra.\n");
        return 0;
    }
    $canaria = new DateTimeZone('Atlantic/Canary');
    $hoy = new DateTimeImmutable('today', $canaria);
    /** El día que cae a tantos días de hoy (en la obra), «AAAA-MM-DD». */
    $dia = static fn (int $dias): string => $hoy->modify(($dias >= 0 ? '+' : '') . $dias . ' days')->format('Y-m-d');
    /** Una marca ISO en UTC, como las de la app, para un día y una hora de la obra. */
    $sello = static fn (int $dias, string $hora): string => (new DateTimeImmutable($dia($dias) . ' ' . $hora, $canaria))
        ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.000\Z');
    $autor = 'Siembra del taller';

    $insertar = static function (string $tabla, array $fila) use ($pdo): void {
        $columnas = array_keys($fila);
        $pdo->prepare(sprintf('INSERT INTO %s (%s) VALUES (%s)', $tabla, implode(', ', $columnas), implode(', ', array_fill(0, count($columnas), '?'))))
            ->execute(array_values($fila));
    };
    $hayFicha = $pdo->prepare('SELECT 1 FROM entregas WHERE id = ?');

    /** La ficha de una villa entregada. `$mas` trae sus hechos de «Entregadas». */
    $ficha = static function (string $nn, string $compradores, int $firmaHace, array $mas = []) use ($insertar, $dia, $sello, $autor): void {
        $unidad = "brassie:{$nn}";
        $puesta = $sello(-$firmaHace - 20, '09:00');
        $insertar('entregas', $mas + [
            'id' => $unidad, 'unidad_id' => $unidad, 'promo_id' => 'brassie',
            'compradores' => $compradores, 'compradores_fijados_en' => $puesta,
            'firma' => $dia(-$firmaHace), 'firma_hora' => '11:00', 'firma_fijada_en' => $puesta, 'firma_por_nombre' => $autor,
            'entregada_en' => $sello(-$firmaHace, '12:00'), 'entregada_fijada_en' => $sello(-$firmaHace, '12:05'), 'entregada_por_nombre' => $autor,
            'borrada' => 0, 'creado' => $puesta, 'actualizado' => ahora_iso(), 'creado_por_nombre' => $autor,
        ]);
    };
    /** Un botón pulsado: su valor (el día de la cita, o «no-tiene»), con su sello y su autor. */
    $boton = static function (string $clave, string $valor, string $cuando) use ($autor): array {
        $selloDe = ['piscina' => 'piscina_fijada_en', 'clima' => 'clima_fijado_en', 'domotica' => 'domotica_fijada_en',
            'fotovoltaica' => 'fotovoltaica_fijada_en', 'armarios' => 'armarios_fijados_en'][$clave];
        return [$clave => $valor, $selloDe => $cuando, "{$clave}_por_nombre" => $autor];
    };
    /**
     * Una visita de repasos hecha y firmada hace `$hace` días: su lista,
     * sus repasos (texto → estado) y su conforme de muestra, con el PDF
     * en la carpeta de medios.
     */
    $visita = static function (string $nn, int $hace, string $compradores, string $firmante, int $firmaHace, array $repasos, string $observaciones, array $tiene)
        use ($insertar, $dia, $sello, $autor): void {
        $unidad = "brassie:{$nn}";
        $lista = uuid_fijo("lista:{$nn}");
        $empezada = $sello(-$hace, '09:35');
        $firmada = $sello(-$hace, '10:40');
        $insertar('listas', [
            'id' => $lista, 'unidad_id' => $unidad, 'promo_id' => 'brassie', 'fase' => 'visita', 'nombre' => 'Visita de repasos',
            'cerrada' => 0, 'borrada' => 0, 'creado' => $empezada, 'actualizado' => $firmada, 'creado_por' => null, 'creado_por_nombre' => $autor,
        ]);
        $firmados = [];
        $orden = 0;
        foreach ($repasos as $texto => [$estado, $estancia, $oficio]) {
            $id = uuid_fijo("repaso:{$nn}:{$orden}");
            $cuando = $sello(-$hace, sprintf('09:%02d', 40 + $orden * 5));
            $insertar('tareas', [
                'id' => $id, 'lista_id' => $lista, 'texto' => $texto, 'estado' => $estado, 'oficio' => $oficio, 'zona' => $estancia,
                'fecha_limite' => null, 'prioridad' => 'alta', 'orden' => $orden, 'portada_id' => null,
                'estado_por' => $estado === 'pendiente' ? null : $autor,
                'estado_en' => $estado === 'pendiente' ? null : $sello(min(0, -$hace + 2), '13:00'),
                'rechazada' => 0, 'borrada' => 0, 'creado' => $cuando, 'actualizado' => $estado === 'pendiente' ? $cuando : $sello(min(0, -$hace + 2), '13:00'),
                'creado_por' => null, 'creado_por_nombre' => $autor,
            ]);
            $firmados[] = ['id' => $id, 'texto' => $texto];
            $orden++;
        }
        $orientativa = $firmados === [] ? '' : $dia(-$hace + 21);
        $lineas = array_merge([
            'CONFORME DE LA VISITA — MUESTRA DEL TALLER',
            "Brassie · Villa {$nn}",
            'Este papel es una MUESTRA sembrada en el taller para poder ver la sección «Entregadas» con datos. No lo ha firmado nadie y no vale para nada.',
            'El conforme de verdad lo genera la app en el móvil al finalizar una visita de repasos y firmar con el dedo: para verlo, haz una visita en otra vivienda entregada.',
            '',
            'Repasos anotados en la visita:',
        ], array_map(static fn ($r, $n) => ($n + 1) . '. ' . $r['texto'], $firmados, array_keys($firmados)),
            $orientativa !== '' ? ['', 'Fecha orientativa de finalización: ' . $orientativa] : ['En la visita no se ha anotado ningún repaso.']);
        $pdf = pdf_de_muestra($lineas);
        $id = uuid_fijo("conforme:{$nn}");
        $relativa = substr($firmada, 0, 4) . '/' . substr($firmada, 5, 2) . "/{$id}.pdf";
        $destino = carpeta_medios() . '/' . $relativa;
        if (!is_dir(dirname($destino))) {
            mkdir(dirname($destino), 0755, true);
        }
        file_put_contents($destino, $pdf);
        $datos = [
            'v' => 1, 'unidadId' => $unidad, 'promoId' => 'brassie', 'listaId' => $lista, 'plantilla' => 'B',
            'sociedad' => 'Brassie Villas, S.L.', 'promocion' => 'Brassie', 'vivienda' => $nn,
            'fechaVisita' => $dia(-$hace), 'horaVisita' => '09:30', 'compradores' => $compradores,
            'fechaEscritura' => $dia(-$firmaHace), 'realizadaPor' => $autor, 'realizadaPorId' => null,
            'fechaOrientativa' => $orientativa, 'observaciones' => $observaciones,
            'contactos' => ['dados' => true] + $tiene + ['domotica' => true, 'fotovoltaica' => true, 'armarios' => true],
            'repasos' => $firmados,
            'firmas' => [['nombre' => $firmante, 'firmadoEn' => $firmada, 'fecha' => $dia(-$hace), 'hora' => '10:40']],
            'paginas' => 1,
            'huellaFichero' => hash('sha256', $pdf), 'tam' => strlen($pdf), 'recibidoEn' => $sello(-$hace, '10:41'),
            'subidoPor' => ['id' => null, 'nombre' => $autor],
        ];
        $insertar('medios', [
            'id' => $id, 'tarea_id' => $lista, 'comentario_id' => null, 'tipo' => 'documento', 'mime' => 'application/pdf',
            'tam' => strlen($pdf), 'ancho' => 0, 'alto' => 0, 'duracion' => 0, 'ruta' => $relativa,
            'datos' => json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'borrada' => 0, 'creado' => $firmada, 'actualizado' => $sello(-$hace, '10:41'),
        ]);
    };

    $villas = [
        // 46 · Entregada y sin tocar: ni fecha de visita ni botones.
        '46' => static function () use ($ficha): void {
            $ficha('46', 'Lucía Roca y Daniel Vera', 20);
        },
        // 47 · Con la cita de la visita por hacer (pasado mañana) y dos botones: la piscina con cita y «No tiene» climatización.
        '47' => static function () use ($ficha, $boton, $dia, $sello, $autor): void {
            $ficha('47', 'Marta Vidal', 15, [
                'posventa' => $dia(2), 'posventa_hora' => '10:00', 'posventa_fijada_en' => $sello(-1, '17:00'), 'posventa_por_nombre' => $autor,
            ] + $boton('piscina', $dia(6), $sello(-1, '17:05')) + $boton('clima', 'no-tiene', $sello(-1, '17:06')));
        },
        // 48 · Visita hecha y firmada hace tres días, con repasos por dar por buenos, la fotovoltaica con cita y los armarios sin ella.
        '48' => static function () use ($ficha, $boton, $visita, $dia, $sello, $autor): void {
            $compradores = 'Inversiones Roca Prado, S.L.';
            $ficha('48', $compradores, 30, [
                'posventa' => $dia(-3), 'posventa_hora' => '09:30', 'posventa_fijada_en' => $sello(-6, '12:00'), 'posventa_por_nombre' => $autor,
            ] + $boton('piscina', $dia(4), $sello(-3, '11:00')) + $boton('clima', $dia(9), $sello(-3, '11:01')) + $boton('domotica', $dia(-1), $sello(-3, '11:02'))
              + $boton('fotovoltaica', $dia(fotovoltaica_de_muestra()['48'][0]), $sello(fotovoltaica_de_muestra()['48'][1], fotovoltaica_de_muestra()['48'][2])));
            $visita('48', 3, $compradores, 'Nora Prado', 30, [
                'Ajuste de la puerta del dormitorio principal, que roza al cerrar' => ['verificada', 'Dormitorio suite', 'carpinteria'],
                'Sellado del plato de ducha del baño de la planta alta' => ['resuelta', 'Baño principal', 'fontaneria'],
                'Remate del rodapié junto a la puerta de la terraza' => ['pendiente', 'Salón', 'general'],
            ], 'Se intentará ajustar la puerta lo antes posible; no podemos garantizar la fecha hasta hablar con el proveedor.',
                ['piscina' => true, 'clima' => true]);
        },
        // 49 · Cerrada: visita firmada hace diez días, sus dos repasos dados por buenos y los cinco botones resueltos.
        '49' => static function () use ($ficha, $boton, $visita, $dia, $sello, $autor): void {
            $compradores = 'Hugo Sanz y Nora Prado';
            $ficha('49', $compradores, 45, [
                'posventa' => $dia(-10), 'posventa_hora' => '09:30', 'posventa_fijada_en' => $sello(-14, '12:00'), 'posventa_por_nombre' => $autor,
            ] + $boton('piscina', 'no-tiene', $sello(-10, '11:00')) + $boton('clima', $dia(-5), $sello(-10, '11:01'))
              + $boton('domotica', $dia(-6), $sello(-10, '11:02')) + $boton('armarios', $dia(-2), $sello(-10, '11:03'))
              + $boton('fotovoltaica', $dia(fotovoltaica_de_muestra()['49'][0]), $sello(fotovoltaica_de_muestra()['49'][1], fotovoltaica_de_muestra()['49'][2])));
            $visita('49', 10, $compradores, 'Hugo Sanz', 45, [
                'Regulación de la puerta corredera del salón' => ['verificada', 'Salón', 'carpinteria'],
                'Repaso de pintura en el techo del pasillo' => ['verificada', 'Pasillo', 'pintura'],
            ], '', ['piscina' => false, 'clima' => true]);
        },
    ];

    $sembradas = 0;
    foreach ($villas as $nn => $sembrar) {
        $hayFicha->execute(["brassie:{$nn}"]);
        $ya = $hayFicha->fetchColumn() !== false;
        $hayFicha->closeCursor();
        if ($ya) {
            continue;   // añadir, nunca borrar: esa villa ya tiene su ficha
        }
        $pdo->beginTransaction();
        try {
            $sembrar();
            $pdo->commit();
            $sembradas++;
        } catch (Throwable $e) {
            $pdo->rollBack();
            fwrite(STDERR, "No se ha podido sembrar la villa {$nn}: " . $e->getMessage() . "\n");
        }
    }
    return $sembradas;
}
