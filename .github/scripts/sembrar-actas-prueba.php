<?php
/**
 * Siembra en un banco SQLite del taller tres actas de prueba, pedidas
 * por Fran para ver la portada y el archivo con carne dentro:
 *
 *   - la reunión de HOY, terminada pero sin firmar (sigue viva);
 *   - una de hace 5 días, firmada, con una tarea aún pendiente
 *     (así se ve el arrastre dentro de la reunión de hoy);
 *   - una de hace 16 meses, firmada y con todo hecho (así se ve el
 *     año en la fecha).
 *
 * Es AÑADIR, nunca borrar: si un día ya tiene reunión, se deja tal
 * cual. Se puede pasar mil veces sin estropear nada.
 *
 * Uso: php sembrar-actas-prueba.php ruta/al/repasos.sqlite
 */
declare(strict_types=1);

$ruta = $argv[1] ?? '';
if ($ruta === '' || !is_file($ruta)) {
    fwrite(STDERR, "No existe el banco: {$ruta}\n");
    exit(1);
}

$pdo = new PDO('sqlite:' . $ruta);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$uuid = static function (): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
};

/* Una hora de Madrid, guardada como se guarda en la app: UTC con Z. */
$madrid = new DateTimeZone('Europe/Madrid');
$utc = new DateTimeZone('UTC');
$sello = static function (string $fecha, string $hora) use ($madrid, $utc): string {
    return (new DateTimeImmutable("{$fecha} {$hora}", $madrid))
        ->setTimezone($utc)->format('Y-m-d\TH:i:s.000\Z');
};

/* La mesa: Fran si está, y hasta dos compañeros más con cuenta. */
$sent = $pdo->prepare('SELECT id, nombre FROM usuarios WHERE email = ? AND activo = 1');
$sent->execute(['f.juarez@unikdi.com']);
$fran = $sent->fetch(PDO::FETCH_ASSOC) ?: null;

$resto = $pdo->query(
    "SELECT id, nombre FROM usuarios WHERE activo = 1"
    . ($fran ? " AND id != " . $pdo->quote($fran['id']) : '')
    . " ORDER BY creado LIMIT 2"
)->fetchAll(PDO::FETCH_ASSOC);

$mesa = array_values(array_filter(array_merge([$fran], $resto)));
if (!$mesa) {
    fwrite(STDERR, "El banco no tiene ni un usuario activo.\n");
    exit(1);
}
$asistentes = array_column($mesa, 'id');
$quien = $mesa[0]['id'];
$nombreQuien = $mesa[0]['nombre'];

$hoy = new DateTimeImmutable('now', $madrid);

/* Las tres actas. Cada tarea: [texto, hecha, responsable]. */
$actas = [
    [
        'fecha' => $hoy->format('Y-m-d'),
        'empieza' => '09:04', 'termina' => '09:36',
        'invitados' => ['Marisa', 'Ginés'],
        'resumen' => null, 'firmada' => false,
        'tareas' => [
            ['Proteger el acopio de tarima antes de la lluvia (prueba)', false],
            ['Repasar el sellado del lucernario del portal 2 (prueba)', true],
        ],
    ],
    [
        'fecha' => $hoy->modify('-5 days')->format('Y-m-d'),
        'empieza' => '09:07', 'termina' => '09:41',
        'invitados' => ['Marisa'],
        'resumen' => 'Se revisó el avance de la urbanización y el acopio de vidrio. '
            . 'La grúa se retira el viernes; queda pendiente el vallado del vial sur. '
            . '(Acta de prueba.)',
        'firmada' => true,
        'tareas' => [
            ['Vallar el tramo sur del vial antes del viernes (prueba)', false],
            ['Confirmar con el vidriero la fecha del lucernario (prueba)', true],
        ],
    ],
    [
        'fecha' => $hoy->modify('-16 months')->format('Y-m-d'),
        'empieza' => '09:12', 'termina' => '09:47',
        'invitados' => ['Ginés'],
        'resumen' => 'Arranque de la fase de cubiertas. Se aprobó el plan de acopios '
            . 'y el corte de agua del martes. (Acta de prueba.)',
        'firmada' => true,
        'tareas' => [
            ['Señalizar el corte de agua del martes (prueba)', true],
            ['Entregar el plan de acopios a la contrata (prueba)', true],
        ],
    ],
];

$hay = $pdo->prepare("SELECT COUNT(*) FROM reuniones WHERE promo_id = 'brassie' AND fecha = ? AND borrada = 0");
$reunion = $pdo->prepare(
    'INSERT INTO reuniones (id, promo_id, fecha, empezada, terminada, asistentes, invitados,
        resumen, acta_firmada, borrada, creado, actualizado, creado_por, creado_por_nombre)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
);
$encargo = $pdo->prepare(
    "INSERT INTO encargos (id, reunion_id, promo_id, texto, general, unidad_id,
        responsable_id, responsable_nombre, fecha_limite, estado, hecho_en, hecho_por_nombre,
        borrada, creado, actualizado, creado_por, creado_por_nombre)
     VALUES (?, ?, 'brassie', ?, 1, '', NULL, '', '', ?, ?, ?, 0, ?, ?, ?, ?)"
);

foreach ($actas as $a) {
    $hay->execute([$a['fecha']]);
    if ((int) $hay->fetchColumn() > 0) {
        echo "· {$a['fecha']}: ya tenía reunión, se deja como está.\n";
        continue;
    }
    $empezada = $sello($a['fecha'], $a['empieza']);
    $terminada = $sello($a['fecha'], $a['termina']);
    // La firma, a media tarde de su día: siempre antes de las 23:59.
    $firmada = $a['firmada'] ? $sello($a['fecha'], '18:30') : null;

    $rid = $uuid();
    $reunion->execute([$rid, 'brassie', $a['fecha'], $empezada, $terminada,
        json_encode($asistentes), json_encode($a['invitados'], JSON_UNESCAPED_UNICODE),
        $a['resumen'], $firmada, $empezada, $terminada, $quien, $nombreQuien]);

    foreach ($a['tareas'] as [$texto, $hecha]) {
        $encargo->execute([$uuid(), $rid, $texto,
            $hecha ? 'hecho' : 'pendiente',
            $hecha ? $terminada : null, $hecha ? $nombreQuien : '',
            $empezada, $terminada, $quien, $nombreQuien]);
    }
    echo "· {$a['fecha']}: sembrada con sus dos tareas" . ($a['firmada'] ? ' y su acta firmada' : '') . ".\n";
}

echo "Mesa usada: " . implode(', ', array_column($mesa, 'nombre')) . ".\n";
