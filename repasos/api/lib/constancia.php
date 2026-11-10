<?php
/**
 * El reconocimiento de repasos pendientes de una vivienda (por dentro,
 * «constancia»): el papel que la promotora entrega a los compradores
 * antes de la firma y que dice, en español formal y por zonas, qué
 * repasos siguen pendientes.
 *
 * Lo descargan el administrador, la dirección facultativa y el
 * departamento comercial, de un tirón y sin pantalla de revisión. Por
 * eso aquí manda una regla: de la vivienda no se pierde ningún repaso.
 * La prosa la escribe el modelo (lib/claude.php); este fichero decide
 * qué viaja, comprueba que todo lo que viajó ha vuelto citado y, a lo
 * que no, le pone una fórmula general. Nunca corrige la prosa.
 *
 * Qué entra: los repasos `pendiente` y `rechazada` de las listas vivas
 * de la vivienda. Los resueltos y los verificados no entran ni se
 * mencionan.
 *
 * Qué NO viaja nunca al modelo: compradores, autores, gremios,
 * empresas, fechas ni el número de la vivienda. Tampoco los
 * identificadores de la base: cada repaso va con una clave corta (r1,
 * r2…) que solo vale para esa llamada.
 *
 * OJO con el diccionario de la casa: por dentro, la tabla `tareas`
 * guarda REPASOS y su columna `zona` guarda la ESTANCIA. Las «zonas»
 * de este fichero son otra cosa: los ocho apartados del documento.
 *
 * Las dos tablas —`constancias` y `miradas`— no viajan en `cambios`:
 * se leen y se escriben solo por las cinco rutas de aquí abajo.
 */

declare(strict_types=1);

/** Si cambia la manera de redactar, se sube: las huellas viejas dejan de valer. */
const CONSTANCIA_VERSION_REDACCION = 1;

/** Los apartados del documento, en el orden en que salen en el papel. */
const CONSTANCIA_ZONAS = ['exteriores', 'entrada', 'cocina', 'salon', 'dormitorios', 'banos', 'sotano', 'otros'];

/** Estancia (pasada por llano()) → apartado. La que no esté aquí la coloca el modelo. */
const CONSTANCIA_ESTANCIAS = [
    'accesoexterior' => 'exteriores',
    'jardin' => 'exteriores',
    'terrazapalta' => 'exteriores',
    'patiotraseropalta' => 'exteriores',
    'cubierta' => 'exteriores',
    'entrada' => 'entrada',
    'aseo' => 'entrada',
    'cocina' => 'cocina',
    'lavadero' => 'cocina',
    'salon' => 'salon',
    'escalera' => 'salon',
    'dormitorio1' => 'dormitorios',
    'dormitorio2' => 'dormitorios',
    'dormitoriosuite' => 'dormitorios',
    'pasillo' => 'dormitorios',
    'banoprincipal' => 'banos',
    'banosuite' => 'banos',
    'sotano' => 'sotano',
];

/**
 * El título de cada apartado: el completo y, cuando sus repasos son
 * todos de una sola de sus partes, el de esa parte.
 */
const CONSTANCIA_TITULOS = [
    'exteriores' => ['Acceso y exteriores', []],
    'entrada' => ['Entrada y aseo', ['Entrada' => ['entrada'], 'Aseo' => ['aseo']]],
    'cocina' => ['Cocina y lavadero', ['Cocina' => ['cocina'], 'Lavadero' => ['lavadero']]],
    'salon' => ['Salón y escalera', ['Salón' => ['salon'], 'Escalera' => ['escalera']]],
    'dormitorios' => ['Dormitorios y pasillo', [
        'Dormitorios' => ['dormitorio1', 'dormitorio2', 'dormitoriosuite'],
        'Pasillo' => ['pasillo'],
    ]],
    'banos' => ['Baños', ['Baño principal' => ['banoprincipal'], 'Baño de la suite' => ['banosuite']]],
    'sotano' => ['Sótano', []],
    'otros' => ['Otros repasos', []],
];

/** Fotos que se miran: las tres más antiguas de cada repaso y noventa por vivienda. */
const CONSTANCIA_FOTOS_POR_REPASO = 3;
const CONSTANCIA_FOTOS_POR_VIVIENDA = 90;
const CONSTANCIA_FOTOS_POR_LOTE = 6;

/** Una foto que pese más que esto no se manda: se da por saltada. */
const CONSTANCIA_PESO_MAXIMO_FOTO = 1500000;

/** Lo que conviene que alguien lea antes de que el papel llegue a la notaría. */
const CONSTANCIA_SENSIBLE = '/fisur|griet|humedad|filtraci|gotera|moho|\?/iu';

/** Lo que se añade al apartado cuando el modelo se ha dejado repasos sin citar. */
const CONSTANCIA_COLETILLA = ' Asimismo, terminación del resto de puntos anotados en esta zona en el registro de seguimiento.';

/** El apartado entero cuando el modelo no ha escrito nada para él. */
const CONSTANCIA_GENERICO = 'Repasos de terminación y acabado de los puntos anotados en el registro de seguimiento.';

/** Lo que se deja viajar de cada texto: de sobra para un repaso, corto para un abuso. */
const CONSTANCIA_TOPE_ANOTACION = 1000;
const CONSTANCIA_TOPE_NOTA = 600;
const CONSTANCIA_TOPE_NOTAS = 10;

const CONSTANCIA_JSON = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE;

/* ═══ Permisos y guardas ══════════════════════════════════════════ */

/** Quién descarga el documento: administrador, dirección facultativa y comercial. */
function exigir_constancia(): array
{
    $yo = exigir_sesion();
    if (!($yo['rol'] === 'admin' || es_df($yo) || es_comercial($yo))) {
        responder_error(
            403,
            'El reconocimiento de repasos pendientes lo descargan la dirección facultativa, el departamento comercial y el administrador.',
            'sin-permiso'
        );
    }
    return $yo;
}

/**
 * ¿Están ya las dos tablas? En la ventana del despliegue el código
 * puede ir unos segundos por delante de la base.
 */
function hay_constancias(): bool
{
    static $hay = null;
    if ($hay === null) {
        $hay = esquema_columnas(bd(), 'constancias') !== [] && esquema_columnas(bd(), 'miradas') !== [];
    }
    return $hay;
}

/**
 * ¿Existe la vivienda? El servidor no guarda el catálogo de viviendas
 * (vive en el cliente), así que existe la que tiene alguna lista de
 * repasos o una ficha de entrega.
 */
function constancia_existe_vivienda(string $unidad): bool
{
    if (!es_unidad($unidad)) {
        return false;
    }
    $stmt = bd()->prepare('SELECT 1 FROM listas WHERE unidad_id = ? LIMIT 1');
    $stmt->execute([$unidad]);
    if ($stmt->fetchColumn() !== false) {
        return true;
    }
    if (hay_entregas()) {
        $stmt = bd()->prepare('SELECT 1 FROM entregas WHERE unidad_id = ? LIMIT 1');
        $stmt->execute([$unidad]);
        if ($stmt->fetchColumn() !== false) {
            return true;
        }
    }
    return false;
}

/** La puerta de las cinco rutas: permiso, tablas y vivienda, por ese orden. */
function constancia_entrar(string $unidad): array
{
    $yo = exigir_constancia();
    if (!hay_constancias()) {
        responder_error(
            503,
            'La base de datos aún no tiene el reconocimiento de repasos. Vuelve a intentarlo en un momento.',
            'esquema'
        );
    }
    if (!constancia_existe_vivienda($unidad)) {
        responder_error(404, 'Esa vivienda no existe o todavía no tiene ninguna lista de repasos.', 'sin-vivienda');
    }
    return $yo;
}

/* ═══ Zonas y títulos ═════════════════════════════════════════════ */

/** El apartado que le toca a una estancia, o '' si es rara o no hay. */
function constancia_zona_de(string $estancia): string
{
    return CONSTANCIA_ESTANCIAS[llano($estancia)] ?? '';
}

/**
 * El título de un apartado según las estancias de sus repasos. Solo
 * cuentan las que son de ese apartado; si no hay ninguna, o las hay de
 * sus dos partes, va el título completo.
 */
function constancia_titulo(string $zona, array $estancias): string
{
    [$completo, $partes] = CONSTANCIA_TITULOS[$zona] ?? CONSTANCIA_TITULOS['otros'];
    $presentes = [];
    foreach ($partes as $titulo => $llanas) {
        foreach ($estancias as $estancia) {
            if (in_array(llano((string) $estancia), $llanas, true)) {
                $presentes[] = (string) $titulo;
                break;
            }
        }
    }
    return count($presentes) === 1 ? $presentes[0] : $completo;
}

/* ═══ Lo que hay ahora mismo en la vivienda ═══════════════════════ */

/**
 * Todo lo que el documento necesita saber de la vivienda, leído de una
 * vez: los repasos que entran —ya ordenados y con su clave r1, r2…—,
 * sus comentarios, sus fotos propias con lo que se haya visto en ellas,
 * la huella y las cuentas.
 *
 * `repasos` va por orden de clave. `dentro` son las fotos que entran en
 * el tope (medio → repaso, ruta y mirada): es contra lo que se valida
 * lo que pide el cliente. La ruta de un fichero no sale nunca de aquí
 * hacia una respuesta.
 */
function constancia_material(string $unidad): array
{
    $pdo = bd();
    $filtro = "l.unidad_id = ? AND l.borrada = 0 AND t.borrada = 0 AND t.estado IN ('pendiente', 'rechazada')";

    $stmt = $pdo->prepare(
        "SELECT t.id, t.lista_id, t.texto, t.estado, t.zona, t.creado
           FROM tareas t JOIN listas l ON l.id = t.lista_id
          WHERE {$filtro}"
    );
    $stmt->execute([$unidad]);
    $porId = [];
    foreach ($stmt->fetchAll() as $f) {
        $estancia = trim((string) $f['zona']);
        $porId[(string) $f['id']] = [
            'id' => (string) $f['id'],
            'listaId' => (string) $f['lista_id'],
            'texto' => (string) $f['texto'],
            'estado' => (string) $f['estado'],
            'estancia' => $estancia,
            'zona' => constancia_zona_de($estancia),
            'creado' => (string) $f['creado'],
            'clave' => '',
            'comentarios' => [],
            'fotos' => [],
        ];
    }

    $stmt = $pdo->prepare(
        "SELECT c.id, c.tarea_id, c.tipo, c.texto
           FROM comentarios c
           JOIN tareas t ON t.id = c.tarea_id
           JOIN listas l ON l.id = t.lista_id
          WHERE {$filtro} AND c.borrada = 0
          ORDER BY c.creado, c.id"
    );
    $stmt->execute([$unidad]);
    foreach ($stmt->fetchAll() as $c) {
        $repaso = (string) $c['tarea_id'];
        if (isset($porId[$repaso])) {
            $porId[$repaso]['comentarios'][] = [
                'id' => (string) $c['id'],
                'tipo' => (string) $c['tipo'],
                'texto' => (string) $c['texto'],
            ];
        }
    }

    // Las fotos propias del repaso: las que se hicieron al anotarlo, no
    // las que cuelgan de un comentario. De más antigua a más nueva.
    $stmt = $pdo->prepare(
        "SELECT m.id, m.tarea_id, m.ruta,
                mi.medio_id AS mirada_de, mi.texto AS mirada_texto, mi.discrepa, mi.saltada
           FROM medios m
           JOIN tareas t ON t.id = m.tarea_id
           JOIN listas l ON l.id = t.lista_id
           LEFT JOIN miradas mi ON mi.medio_id = m.id
          WHERE {$filtro} AND m.borrada = 0 AND m.tipo = 'imagen'
            AND (m.comentario_id IS NULL OR m.comentario_id = '')
          ORDER BY m.creado, m.id"
    );
    $stmt->execute([$unidad]);
    foreach ($stmt->fetchAll() as $m) {
        $repaso = (string) $m['tarea_id'];
        if (!isset($porId[$repaso])) {
            continue;
        }
        $porId[$repaso]['fotos'][] = [
            'id' => (string) $m['id'],
            'ruta' => (string) $m['ruta'],
            'dentro' => false,
            'mirada' => $m['mirada_de'] === null ? null : [
                'texto' => (string) $m['mirada_texto'],
                'discrepa' => (int) $m['discrepa'] === 1,
                'saltada' => (int) $m['saltada'] === 1,
            ],
        ];
    }

    // La huella: lo que, si cambia, obliga a redactar de nuevo. Las
    // descripciones de las fotos no entran; que haya una foto más, sí.
    $ids = array_map('strval', array_keys($porId));
    usort($ids, 'strcmp');
    $paraHuella = [];
    foreach ($ids as $id) {
        $r = $porId[$id];
        $comentarios = [];
        foreach ($r['comentarios'] as $c) {
            $comentarios[] = [$c['id'], $c['tipo'], $c['texto']];
        }
        usort($comentarios, static fn ($a, $b) => strcmp($a[0], $b[0]));
        $fotos = [];
        foreach ($r['fotos'] as $f) {
            $fotos[] = $f['id'];
        }
        usort($fotos, 'strcmp');
        $paraHuella[] = [$r['id'], $r['estado'], $r['estancia'], $r['texto'], $comentarios, $fotos];
    }
    $huella = sha1((string) json_encode([CONSTANCIA_VERSION_REDACCION, $paraHuella], CONSTANCIA_JSON));

    // El orden del documento y las claves: por apartado (el que no
    // tiene, al final), luego por antigüedad, luego por identificador.
    $puesto = array_flip(CONSTANCIA_ZONAS);
    $repasos = array_values($porId);
    usort($repasos, static function (array $a, array $b) use ($puesto): int {
        $za = $a['zona'] === '' ? count($puesto) : $puesto[$a['zona']];
        $zb = $b['zona'] === '' ? count($puesto) : $puesto[$b['zona']];
        return [$za, $a['creado'], $a['id']] <=> [$zb, $b['creado'], $b['id']];
    });

    $rechazados = 0;
    $total = 0;
    $miradas = 0;
    $fuera = 0;
    $porMirar = [];
    $dentro = [];
    $indice = [];
    foreach ($repasos as $n => $r) {
        $repasos[$n]['clave'] = 'r' . ($n + 1);
        $indice[$r['id']] = $n;
        if ($r['estado'] === 'rechazada') {
            $rechazados++;
        }
        foreach ($r['fotos'] as $k => $f) {
            if ($k >= CONSTANCIA_FOTOS_POR_REPASO || $total >= CONSTANCIA_FOTOS_POR_VIVIENDA) {
                $fuera++;
                continue;
            }
            $repasos[$n]['fotos'][$k]['dentro'] = true;
            $total++;
            $dentro[$f['id']] = ['repaso' => $r['id'], 'ruta' => $f['ruta'], 'mirada' => $f['mirada']];
            if ($f['mirada'] === null) {
                $porMirar[] = $f['id'];
            } else {
                $miradas++;
            }
        }
    }

    return [
        'repasos' => $repasos,
        'indice' => $indice,
        'huella' => $huella,
        // Como en el resto de la casa: «pendientes» son todos los que
        // siguen en obra, y los rechazados van contados dentro y aparte.
        'cuenta' => ['pendientes' => count($repasos), 'rechazados' => $rechazados],
        'fotos' => ['total' => $total, 'miradas' => $miradas, 'porMirar' => $porMirar, 'fuera' => $fuera],
        'dentro' => $dentro,
    ];
}

/** Un repaso del material por su identificador, o null si ya no entra. */
function constancia_repaso(array $material, string $id): ?array
{
    return isset($material['indice'][$id]) ? $material['repasos'][$material['indice'][$id]] : null;
}

/** Los compradores, tal cual están en la ficha de entrega. */
function constancia_compradores(string $unidad): string
{
    if (!hay_entregas()) {
        return '';
    }
    $stmt = bd()->prepare('SELECT compradores FROM entregas WHERE unidad_id = ? AND borrada = 0 LIMIT 1');
    $stmt->execute([$unidad]);
    $valor = $stmt->fetchColumn();
    return $valor === false || $valor === null ? '' : trim((string) $valor);
}

/* ═══ Lo que viaja al modelo ══════════════════════════════════════ */

/**
 * Los repasos tal como los lee el modelo. Aquí está el filtro de lo
 * personal: sale la clave, el apartado, la estancia, el estado, la
 * anotación, las notas, el motivo del rechazo y lo visto en las fotos.
 * Y nada más.
 *
 * La nota que la app escribe sola al cambiar un repaso de gremio
 * («Oficio cambiado: …») no viaja: nombra gremios y no dice nada de lo
 * que queda por hacer.
 */
function constancia_entrada_ia(array $material, bool $conFotos): array
{
    $entrada = [];
    foreach ($material['repasos'] as $r) {
        $rechazado = $r['estado'] === 'rechazada';
        $notas = [];
        $motivo = '';
        foreach ($r['comentarios'] as $c) {
            $texto = claude_en_una_linea($c['texto']);
            if ($texto === '') {
                continue;
            }
            if ($c['tipo'] === 'rechazo') {
                $motivo = mb_substr($texto, 0, CONSTANCIA_TOPE_NOTA);
                continue;
            }
            if (preg_match('/^Oficio cambiado:/u', $texto) === 1 || count($notas) >= CONSTANCIA_TOPE_NOTAS) {
                continue;
            }
            $notas[] = mb_substr($texto, 0, CONSTANCIA_TOPE_NOTA);
        }

        $fotos = [];
        $discrepa = false;
        if ($conFotos) {
            foreach ($r['fotos'] as $f) {
                $mirada = $f['mirada'];
                if (!$f['dentro'] || $mirada === null || $mirada['saltada'] || trim($mirada['texto']) === '') {
                    continue;
                }
                $fotos[] = claude_en_una_linea($mirada['texto']);
                $discrepa = $discrepa || $mirada['discrepa'];
            }
        }

        $entrada[] = [
            'clave' => $r['clave'],
            'zona' => $r['zona'],
            'estancia' => mb_substr(claude_en_una_linea($r['estancia']), 0, 80),
            'estado' => $rechazado ? 'rechazado' : 'pendiente',
            'anotacion' => mb_substr(claude_en_una_linea($r['texto']), 0, CONSTANCIA_TOPE_ANOTACION),
            'notas' => $notas,
            'motivoRechazo' => $rechazado ? $motivo : '',
            'fotos' => $fotos,
            'fotoDiscrepa' => $discrepa,
        ];
    }
    return $entrada;
}

/** Los repasos cuya foto, la que se usó al redactar, no cuadra con lo anotado. */
function constancia_fotos_que_discrepan(array $material): array
{
    $discrepan = [];
    foreach ($material['repasos'] as $r) {
        foreach ($r['fotos'] as $f) {
            $mirada = $f['mirada'];
            if ($f['dentro'] && $mirada !== null && !$mirada['saltada'] && $mirada['discrepa'] && trim($mirada['texto']) !== '') {
                $discrepan[] = ['repaso' => $r['id'], 'texto' => claude_en_una_linea($mirada['texto'])];
                break;
            }
        }
    }
    return $discrepan;
}

/* ═══ Nombres propios ═════════════════════════════════════════════ */

/** Las palabras de un texto, en orden, con su forma y su versión llana. */
function constancia_palabras(string $texto): array
{
    $palabras = [];
    if (preg_match_all('/[\p{L}\p{N}]+/u', $texto, $m)) {
        foreach ($m[0] as $forma) {
            $llana = llano($forma);
            if ($llana !== '') {
                $palabras[] = ['forma' => $forma, 'llana' => $llana];
            }
        }
    }
    return $palabras;
}

/** ¿Está esa frase —palabras llanas seguidas— en ese texto ya troceado? Devuelve dónde, o -1. */
function constancia_donde_esta(array $palabras, array $frase): int
{
    $n = count($frase);
    if ($n === 0) {
        return -1;
    }
    $tope = count($palabras) - $n;
    for ($i = 0; $i <= $tope; $i++) {
        $j = 0;
        while ($j < $n && $palabras[$i + $j]['llana'] === $frase[$j]) {
            $j++;
        }
        if ($j === $n) {
            return $i;
        }
    }
    return -1;
}

/**
 * Lo que no debería aparecer en el papel: cada palabra de cuatro
 * letras o más del nombre de cualquier usuario, y cada empresa entera.
 * Se miran todos los usuarios, también los dados de baja: su nombre
 * sigue en los repasos que anotaron.
 */
function constancia_nombres_de_la_casa(): array
{
    static $casa = null;
    if ($casa !== null) {
        return $casa;
    }
    $palabras = [];
    $frases = [];
    $stmt = bd()->prepare('SELECT nombre, empresa FROM usuarios');
    $stmt->execute();
    foreach ($stmt->fetchAll() as $u) {
        foreach (constancia_palabras((string) $u['nombre']) as $p) {
            if (strlen($p['llana']) >= 4 && !ctype_digit($p['llana'])) {
                $palabras[$p['llana']] = true;
            }
        }
        $frase = array_column(constancia_palabras((string) $u['empresa']), 'llana');
        if ($frase !== []) {
            $frases[implode(' ', $frase)] = $frase;
        }
    }
    $casa = ['palabras' => $palabras, 'frases' => array_values($frases)];
    return $casa;
}

/**
 * Las palabras del texto que coinciden con un nombre o una empresa de
 * la casa, tal como están escritas en él. Da falsos positivos a
 * propósito («Puerta» es un apellido y una puerta): quien decide es la
 * segunda pasada, y la nota interna queda para quien revisa.
 */
function constancia_buscar_nombres(string $texto): array
{
    $casa = constancia_nombres_de_la_casa();
    $palabras = constancia_palabras($texto);
    $hallados = [];
    foreach ($palabras as $p) {
        if (isset($casa['palabras'][$p['llana']]) && !isset($hallados[$p['llana']])) {
            $hallados[$p['llana']] = $p['forma'];
        }
    }
    foreach ($casa['frases'] as $frase) {
        $clave = implode(' ', $frase);
        $donde = isset($hallados[$clave]) ? -1 : constancia_donde_esta($palabras, $frase);
        if ($donde >= 0) {
            $hallados[$clave] = implode(' ', array_column(array_slice($palabras, $donde, count($frase)), 'forma'));
        }
    }
    return array_values($hallados);
}

/* ═══ El repaso determinista ══════════════════════════════════════ */

/**
 * De lo que escribió el modelo al documento que se guarda. No toca la
 * prosa: descarta las claves que no existen, une los apartados
 * repetidos, recoge los repasos que se hayan quedado sin citar —con una
 * fórmula general en su apartado—, busca nombres propios y deja los
 * apartados en su orden y con su título.
 *
 * Devuelve ['borrador' => …, 'texto' => ['zonas' => …]], las dos formas
 * que se guardan en la fila.
 */
function constancia_repasar(array $ia, array $material, bool $conFotos): array
{
    $porClave = [];
    $ordenDe = [];
    foreach ($material['repasos'] as $n => $r) {
        $porClave[$r['clave']] = $r;
        $ordenDe[$r['id']] = $n;
    }
    $aIds = static function ($claves) use ($porClave): array {
        $ids = [];
        foreach ((array) $claves as $clave) {
            if (is_string($clave) && isset($porClave[$clave]) && !in_array($porClave[$clave]['id'], $ids, true)) {
                $ids[] = $porClave[$clave]['id'];
            }
        }
        return $ids;
    };
    $enOrden = static function (array $ids) use ($ordenDe): array {
        $ids = array_values(array_unique($ids));
        usort($ids, static fn ($a, $b) => $ordenDe[$a] <=> $ordenDe[$b]);
        return $ids;
    };

    // (1) Lo del modelo, apartado a apartado. Uno que no exista va a
    // «otros»; uno repetido se une al que ya había.
    $escrito = [];
    foreach ((array) ($ia['zonas'] ?? []) as $z) {
        if (!is_array($z)) {
            continue;
        }
        $zona = in_array($z['zona'] ?? null, CONSTANCIA_ZONAS, true) ? (string) $z['zona'] : 'otros';
        if (!isset($escrito[$zona])) {
            $escrito[$zona] = ['texto' => '', 'actuaciones' => []];
        }
        $texto = trim((string) ($z['texto'] ?? ''));
        if ($texto !== '') {
            $escrito[$zona]['texto'] = trim($escrito[$zona]['texto'] . ' ' . $texto);
        }
        foreach ((array) ($z['actuaciones'] ?? []) as $a) {
            if (!is_array($a)) {
                continue;
            }
            $actuacion = ['texto' => trim((string) ($a['texto'] ?? '')), 'repasos' => $aIds($a['repasos'] ?? [])];
            if ($actuacion['texto'] !== '' || $actuacion['repasos'] !== []) {
                $escrito[$zona]['actuaciones'][] = $actuacion;
            }
        }
    }

    // Citado es el repaso que sale en una actuación de un apartado que
    // tiene texto. Salir solo en una duda no cuenta, ni salir en un
    // apartado que el modelo ha dejado sin párrafo.
    $citados = [];
    $yaCitado = [];
    foreach ($escrito as $zona => $e) {
        $citados[$zona] = [];
        if ($e['texto'] === '') {
            continue;
        }
        foreach ($e['actuaciones'] as $a) {
            foreach ($a['repasos'] as $id) {
                $citados[$zona][] = $id;
                $yaCitado[$id] = true;
            }
        }
    }

    // (2) Los descolgados, a su apartado por estancia; sin estancia
    // conocida, a «otros». Ninguno se queda fuera.
    $resto = [];
    $genericos = [];
    foreach ($material['repasos'] as $r) {
        if (!isset($yaCitado[$r['id']])) {
            $resto[$r['zona'] !== '' ? $r['zona'] : 'otros'][] = $r['id'];
            $genericos[] = $r['id'];
        }
    }

    // (4) Los apartados en su orden, con su título, y sin los vacíos.
    $zonasBorrador = [];
    $zonasTexto = [];
    foreach (CONSTANCIA_ZONAS as $zona) {
        if (isset($escrito[$zona])) {
            $zonasBorrador[] = [
                'zona' => $zona,
                'texto' => $escrito[$zona]['texto'],
                'actuaciones' => $escrito[$zona]['actuaciones'],
            ];
        }
        $delModelo = $escrito[$zona]['texto'] ?? '';
        $sueltos = $resto[$zona] ?? [];
        $ligados = $enOrden(array_merge($citados[$zona] ?? [], $sueltos));
        // Sin repasos que lo respalden no hay apartado: un párrafo que
        // no se puede seguir hasta ningún repaso no va a un papel que
        // se firma. Queda en el borrador, para quien quiera mirarlo.
        if ($ligados === []) {
            continue;
        }
        if ($delModelo === '') {
            $texto = CONSTANCIA_GENERICO;
        } elseif ($sueltos !== []) {
            $final = mb_substr($delModelo, -1);
            $texto = $delModelo . (in_array($final, ['.', '…', '!', '?'], true) ? '' : '.') . CONSTANCIA_COLETILLA;
        } else {
            $texto = $delModelo;
        }
        $estancias = [];
        foreach ($ligados as $id) {
            $estancias[] = $material['repasos'][$ordenDe[$id]]['estancia'];
        }
        $zonasTexto[] = [
            'zona' => $zona,
            'titulo' => constancia_titulo($zona, $estancias),
            'texto' => $texto,
            'repasos' => $ligados,
            'resto' => $sueltos !== [],
        ];
    }

    $dudas = [];
    foreach ((array) ($ia['dudas'] ?? []) as $d) {
        if (!is_array($d)) {
            continue;
        }
        $texto = trim((string) ($d['texto'] ?? ''));
        if ($texto !== '') {
            $dudas[] = ['texto' => $texto, 'repasos' => $aIds($d['repasos'] ?? [])];
        }
    }

    // (3) Nombres propios, sobre el texto que de verdad va al papel.
    $todo = '';
    foreach ($zonasTexto as $z) {
        $todo .= $z['texto'] . "\n";
    }

    return [
        'borrador' => [
            'zonas' => $zonasBorrador,
            'dudas' => $dudas,
            'genericos' => $genericos,
            'nombres' => constancia_buscar_nombres($todo),
            'conFotos' => $conFotos,
            'fotos' => [
                'miradas' => $material['fotos']['miradas'],
                'total' => $material['fotos']['total'],
                'fuera' => $material['fotos']['fuera'],
            ],
            // Para la nota interna «la foto no cuadra»: qué se vio.
            'discrepan' => $conFotos ? constancia_fotos_que_discrepan($material) : [],
        ],
        'texto' => ['zonas' => $zonasTexto],
    ];
}

/* ═══ La fila y lo que se sirve de ella ═══════════════════════════ */

/** La actual: la fila viva más reciente de la vivienda. */
function constancia_actual(string $unidad): ?array
{
    $stmt = bd()->prepare(
        'SELECT * FROM constancias WHERE unidad_id = ? AND borrada = 0 ORDER BY creado DESC, id DESC LIMIT 1'
    );
    $stmt->execute([$unidad]);
    $fila = $stmt->fetch();
    return $fila ?: null;
}

/** Una fila concreta de ESA vivienda, o se acaba aquí con un 404. */
function constancia_fila(string $unidad, $id): array
{
    $fila = false;
    if (is_string($id) && es_uuid($id)) {
        $stmt = bd()->prepare('SELECT * FROM constancias WHERE id = ? AND unidad_id = ? AND borrada = 0');
        $stmt->execute([strtolower($id), $unidad]);
        $fila = $stmt->fetch();
    }
    if (!$fila) {
        responder_error(404, 'Ese documento ya no está. Vuelve a generarlo.', 'sin-constancia');
    }
    return $fila;
}

/** Una columna JSON de la fila, ya como matriz ([] si no se entiende). */
function constancia_leer_json($valor): array
{
    $datos = is_string($valor) ? json_decode($valor, true) : null;
    return is_array($datos) ? $datos : [];
}

/** Una lista de cadenas sacada de un JSON guardado. */
function constancia_lista($valor): array
{
    $lista = [];
    foreach ((array) $valor as $v) {
        if (is_string($v) && $v !== '') {
            $lista[] = $v;
        }
    }
    return $lista;
}

/**
 * Los repasos de una nota interna, con lo justo para enseñarlos y
 * llegar a ellos. Los que siguen pendientes salen del material; los que
 * ya no, de la base. El que se haya borrado no sale.
 */
function constancia_fichas(array $ids, array $material, string $unidad): array
{
    static $stmt = null;
    $fichas = [];
    foreach ($ids as $id) {
        if (!is_string($id) || $id === '') {
            continue;
        }
        $r = constancia_repaso($material, $id);
        if ($r === null) {
            if ($stmt === null) {
                $stmt = bd()->prepare(
                    'SELECT t.id, t.lista_id, t.texto, t.zona
                       FROM tareas t JOIN listas l ON l.id = t.lista_id
                      WHERE t.id = ? AND l.unidad_id = ? AND t.borrada = 0 AND l.borrada = 0'
                );
            }
            $stmt->execute([$id, $unidad]);
            $f = $stmt->fetch();
            if (!$f) {
                continue;
            }
            $r = [
                'id' => (string) $f['id'],
                'listaId' => (string) $f['lista_id'],
                'texto' => (string) $f['texto'],
                'estancia' => trim((string) $f['zona']),
            ];
        }
        $fichas[] = [
            'id' => $r['id'],
            'listaId' => $r['listaId'],
            'texto' => mb_substr($r['texto'], 0, 300),
            'estancia' => $r['estancia'],
        ];
    }
    return $fichas;
}

/**
 * Las notas internas: lo que la dirección facultativa y el
 * administrador deberían saber del documento y que el papel no dice.
 * Las cuatro primeras salen del borrador guardado; la de puntos
 * delicados se calcula al servir, con los repasos como están ahora.
 */
function constancia_notas(array $borrador, array $material, string $unidad): array
{
    $notas = [];

    foreach ((array) ($borrador['dudas'] ?? []) as $d) {
        $texto = is_array($d) ? trim((string) ($d['texto'] ?? '')) : '';
        if ($texto !== '') {
            $notas[] = [
                'tipo' => 'duda',
                'texto' => $texto,
                'repasos' => constancia_fichas(constancia_lista($d['repasos'] ?? []), $material, $unidad),
            ];
        }
    }

    $fichas = constancia_fichas(constancia_lista($borrador['genericos'] ?? []), $material, $unidad);
    if ($fichas !== []) {
        $notas[] = [
            'tipo' => 'generico',
            'texto' => count($fichas) === 1
                ? 'Este repaso no tiene redacción propia: el documento lo recoge con la fórmula general de su zona.'
                : 'Estos repasos no tienen redacción propia: el documento los recoge con la fórmula general de su zona.',
            'repasos' => $fichas,
        ];
    }

    foreach (constancia_lista($borrador['nombres'] ?? []) as $palabra) {
        $frase = array_column(constancia_palabras($palabra), 'llana');
        $donde = [];
        foreach ($material['repasos'] as $r) {
            $textos = $r['texto'];
            foreach ($r['comentarios'] as $c) {
                $textos .= "\n" . $c['texto'];
            }
            if (constancia_donde_esta(constancia_palabras($textos), $frase) >= 0) {
                $donde[] = $r['id'];
            }
        }
        $notas[] = [
            'tipo' => 'nombre',
            'texto' => "La palabra «{$palabra}» coincide con el nombre de una persona o de una empresa de la obra.",
            'repasos' => constancia_fichas($donde, $material, $unidad),
        ];
    }

    foreach ((array) ($borrador['discrepan'] ?? []) as $d) {
        if (!is_array($d) || !is_string($d['repaso'] ?? null)) {
            continue;
        }
        $fichas = constancia_fichas([$d['repaso']], $material, $unidad);
        if ($fichas !== []) {
            $notas[] = [
                'tipo' => 'foto',
                'texto' => 'Lo que se ve en la foto: ' . trim((string) ($d['texto'] ?? '')),
                'repasos' => $fichas,
            ];
        }
    }

    foreach ($material['repasos'] as $r) {
        $textos = $r['texto'];
        foreach ($r['comentarios'] as $c) {
            $textos .= "\n" . $c['texto'];
        }
        if (preg_match(CONSTANCIA_SENSIBLE, $textos) !== 1) {
            continue;
        }
        if (preg_match('/fisur|griet/iu', $textos) === 1) {
            $motivo = 'Habla de fisuras o grietas';
        } elseif (preg_match('/humedad|filtraci|gotera|moho/iu', $textos) === 1) {
            $motivo = 'Habla de humedades o filtraciones';
        } else {
            $motivo = 'Lleva un interrogante';
        }
        $notas[] = [
            'tipo' => 'sensible',
            'texto' => $motivo . ': conviene leer cómo ha quedado redactado.',
            'repasos' => constancia_fichas([$r['id']], $material, $unidad),
        ];
    }

    return $notas;
}

/**
 * La fila tal como la ve el cliente. No salen ni el borrador, ni qué
 * repasos hay en cada apartado, ni el gasto. Las notas internas, solo
 * para la dirección facultativa y el administrador.
 */
function constancia_servida(array $fila, array $material, array $yo): array
{
    $borrador = constancia_leer_json($fila['borrador']);
    $texto = constancia_leer_json($fila['texto']);

    $zonas = [];
    foreach ((array) ($texto['zonas'] ?? []) as $z) {
        if (is_array($z)) {
            $zonas[] = [
                'zona' => (string) ($z['zona'] ?? ''),
                'titulo' => (string) ($z['titulo'] ?? ''),
                'texto' => (string) ($z['texto'] ?? ''),
            ];
        }
    }

    $genericos = count(constancia_lista($borrador['genericos'] ?? []));
    $nombres = count(constancia_lista($borrador['nombres'] ?? []));
    $ajustado = (int) $fila['ajustado'] === 1;
    $descargado = (string) ($fila['descargado_en'] ?? '');

    return [
        'id' => (string) $fila['id'],
        'unidadId' => (string) $fila['unidad_id'],
        'huella' => (string) $fila['huella'],
        'registro' => (string) $fila['registro'],
        'texto' => ['zonas' => $zonas],
        'ajustado' => $ajustado,
        'pideAjuste' => !$ajustado && ($genericos > 0 || $nombres > 0),
        'genericos' => $genericos,
        'conFotos' => ($borrador['conFotos'] ?? false) === true,
        'notas' => es_df($yo) ? constancia_notas($borrador, $material, (string) $fila['unidad_id']) : [],
        'descargas' => (int) $fila['descargas'],
        'descargadoEn' => $descargado !== '' ? $descargado : null,
        'descargadoPorNombre' => (string) $fila['descargado_por_nombre'],
        'creado' => (string) $fila['creado'],
        'actualizado' => (string) $fila['actualizado'],
        'creadoPorNombre' => (string) $fila['creado_por_nombre'],
    ];
}

/**
 * La respuesta de las rutas: cómo está la vivienda ahora mismo y, si
 * la hay, su constancia. Sin `$fila` se sirve la actual; con ella, esa
 * (es lo que hace sellar: el cliente monta el papel con la fila que ha
 * sellado, no con otra que haya podido nacer entretanto).
 */
function constancia_estado(string $unidad, array $yo, ?array $fila = null, ?array $material = null): array
{
    $material = $material ?? constancia_material($unidad);
    $fila = $fila ?? constancia_actual($unidad);

    return [
        'hoy' => hoy_obra(),
        // Si hay con qué llamar al modelo. La clave no sale de aquí.
        'hayClave' => claude_clave() !== '' || claude_hay_doble(),
        'huella' => $material['huella'],
        'alDia' => $fila !== null && hash_equals((string) $fila['huella'], $material['huella']),
        'actual' => $fila === null ? null : constancia_servida($fila, $material, $yo),
        'cuenta' => $material['cuenta'],
        'fotos' => $material['fotos'],
        'compradores' => constancia_compradores($unidad),
    ];
}

/* ═══ GET constancias/{unidad} ════════════════════════════════════ */

function ver_constancia(string $unidad): void
{
    $yo = constancia_entrar($unidad);
    responder(constancia_estado($unidad, $yo));
}

/* ═══ POST constancias/{unidad}/mirar ═════════════════════════════ */

/** El tipo de una imagen por sus primeros bytes, o '' si no es de las que se miran. */
function constancia_tipo_de_imagen(string $bytes): string
{
    if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) {
        return 'image/jpeg';
    }
    if (strncmp($bytes, "\x89PNG\r\n\x1a\n", 8) === 0) {
        return 'image/png';
    }
    if (strncmp($bytes, 'GIF87a', 6) === 0 || strncmp($bytes, 'GIF89a', 6) === 0) {
        return 'image/gif';
    }
    if (strlen($bytes) >= 12 && strncmp($bytes, 'RIFF', 4) === 0 && substr($bytes, 8, 4) === 'WEBP') {
        return 'image/webp';
    }
    return '';
}

/**
 * Lee una foto del disco para mandarla a mirar. La ruta es la que
 * guarda la base, nunca algo de la petición, y aun así se comprueba que
 * no se sale de la carpeta de medios. Devuelve null —y la foto se da
 * por saltada— si el fichero falta, está vacío, pesa demasiado o por
 * dentro no es JPEG, PNG, GIF ni WebP, diga lo que diga su extensión.
 */
function constancia_leer_foto(string $ruta): ?array
{
    if ($ruta === '') {
        return null;
    }
    $carpeta = carpeta_medios();
    $real = realpath($carpeta . '/' . $ruta);
    if ($real === false || strpos($real, $carpeta . DIRECTORY_SEPARATOR) !== 0 || !is_file($real)) {
        return null;
    }
    $peso = filesize($real);
    if ($peso === false || $peso < 1 || $peso > CONSTANCIA_PESO_MAXIMO_FOTO) {
        return null;
    }
    $bytes = file_get_contents($real);
    if ($bytes === false || $bytes === '') {
        return null;
    }
    $mime = constancia_tipo_de_imagen($bytes);
    if ($mime === '') {
        return null;
    }
    return ['mime' => $mime, 'b64' => base64_encode($bytes)];
}

/**
 * Apunta lo visto en una foto. Si otra petición la ha apuntado un
 * instante antes, vale la suya: una foto se mira una vez.
 */
function constancia_guardar_mirada(string $medio, string $repaso, string $texto, bool $discrepa, bool $saltada, string $modelo): void
{
    try {
        bd()->prepare(
            'INSERT INTO miradas (medio_id, tarea_id, texto, discrepa, saltada, modelo, creado)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $medio,
            $repaso,
            $texto,
            $discrepa ? 1 : 0,
            $saltada ? 1 : 0,
            mb_substr($modelo, 0, 60),
            ahora_iso(),
        ]);
    } catch (PDOException $e) {
        if (strpos((string) $e->getCode(), '23') !== 0) {
            throw $e;
        }
    }
}

/**
 * Mira un lote de fotos (de una a seis) con una sola llamada al modelo
 * y guarda una fila por foto. Solo se miran fotos propias de repasos
 * pendientes de ESTA vivienda que entren en el tope; cualquier otra
 * cosa que venga en la lista se ignora sin más. Las ya miradas no
 * vuelven a llamar.
 */
function mirar_constancia(string $unidad): void
{
    constancia_entrar($unidad);

    $medios = cuerpo()['medios'] ?? null;
    if (!is_array($medios) || count($medios) < 1 || count($medios) > CONSTANCIA_FOTOS_POR_LOTE) {
        responder_error(400, 'Las fotos se miran de una a seis cada vez.', 'formato');
    }

    $material = constancia_material($unidad);
    $pedidas = [];
    foreach ($medios as $medio) {
        if (is_string($medio) && isset($material['dentro'][$medio]) && !in_array($medio, $pedidas, true)) {
            $pedidas[] = $medio;
        }
    }

    // Qué ha sido de cada una: true = saltada, false = hecha.
    $saltada = [];
    $lote = [];
    foreach ($pedidas as $medio) {
        $foto = $material['dentro'][$medio];
        if ($foto['mirada'] !== null) {
            $saltada[$medio] = $foto['mirada']['saltada'];
            continue;
        }
        $leida = constancia_leer_foto($foto['ruta']);
        if ($leida === null) {
            // Lo que no se puede leer no depende del modelo: se apunta ya.
            constancia_guardar_mirada($medio, $foto['repaso'], '', false, true, '');
            $saltada[$medio] = true;
            continue;
        }
        $repaso = constancia_repaso($material, $foto['repaso']);
        $clave = 'f' . (count($lote) + 1);
        $lote[$clave] = [
            'medio' => $medio,
            'repaso' => $foto['repaso'],
            'anotacion' => $repaso['texto'] ?? '',
            'estancia' => $repaso['estancia'] ?? '',
            'mime' => $leida['mime'],
            'b64' => $leida['b64'],
        ];
    }

    if ($lote !== []) {
        $fotos = [];
        foreach ($lote as $clave => $f) {
            $fotos[] = [
                'clave' => $clave,
                'anotacion' => $f['anotacion'],
                'estancia' => $f['estancia'],
                'mime' => $f['mime'],
                'b64' => $f['b64'],
            ];
        }
        // Si la llamada falla, se sale de aquí con su error y no se
        // apunta ninguna de estas: se volverán a pedir.
        $vistas = claude_mirar_fotos($fotos);
        $modelo = (string) ($vistas['gasto']['modelo'] ?? '');
        $porClave = [];
        foreach ($vistas['fotos'] as $v) {
            $porClave[$v['foto']] = $v;
        }
        foreach ($lote as $clave => $f) {
            $descripcion = trim((string) ($porClave[$clave]['descripcion'] ?? ''));
            // La que el modelo se haya dejado, o haya dejado en blanco,
            // se da por saltada: no se le pregunta dos veces.
            $sinVer = $descripcion === '';
            constancia_guardar_mirada(
                $f['medio'],
                $f['repaso'],
                $descripcion,
                !$sinVer && ($porClave[$clave]['discrepa'] ?? false) === true,
                $sinVer,
                $modelo
            );
            $saltada[$f['medio']] = $sinVer;
        }
    }

    $hechas = [];
    $saltadas = [];
    foreach ($pedidas as $medio) {
        if ($saltada[$medio]) {
            $saltadas[] = $medio;
        } else {
            $hechas[] = $medio;
        }
    }

    responder([
        'hechas' => $hechas,
        'saltadas' => $saltadas,
        'quedan' => count(constancia_material($unidad)['fotos']['porMirar']),
    ]);
}

/* ═══ POST constancias/{unidad}/redactar ══════════════════════════ */

/**
 * Redacta el documento de la vivienda y lo guarda en una fila nueva.
 * Con la misma huella devuelve la fila que ya había, sin llamar a
 * nadie; `forzar` (solo el administrador) redacta de nuevo aunque nada
 * haya cambiado. Si el modelo falla no queda ninguna fila a medias: se
 * escribe una sola vez, al final, con todo.
 */
function redactar_constancia(string $unidad): void
{
    $yo = constancia_entrar($unidad);
    $cuerpo = cuerpo();
    $sinFotos = booleano($cuerpo, 'sinFotos');
    $forzar = booleano($cuerpo, 'forzar');

    if ($forzar && $yo['rol'] !== 'admin') {
        responder_error(403, 'Redactar de nuevo el documento es cosa del administrador.', 'sin-permiso');
    }

    $material = constancia_material($unidad);
    if ($material['repasos'] === []) {
        responder_error(
            409,
            'Esta vivienda no tiene repasos pendientes ahora mismo: no hay documento que generar.',
            'sin-repasos'
        );
    }

    $actual = constancia_actual($unidad);
    if (!$forzar && $actual !== null && hash_equals((string) $actual['huella'], $material['huella'])) {
        responder(constancia_estado($unidad, $yo, $actual, $material));
    }

    $conFotos = !$sinFotos;
    $ia = claude_redactar_constancia(['repasos' => constancia_entrada_ia($material, $conFotos)]);
    $hecho = constancia_repasar($ia, $material, $conFotos);

    // Más nueva que la que hubiera, aunque caigan en el mismo segundo:
    // «la actual» es la más reciente por su marca de creación.
    $creado = ahora_iso();
    $actual = constancia_actual($unidad);
    if ($actual !== null && strcmp($creado, (string) $actual['creado']) <= 0) {
        try {
            $creado = un_milisegundo_despues((string) $actual['creado']);
        } catch (Throwable $e) {
            // Una marca rara en la fila anterior no impide guardar esta.
        }
    }

    $id = uuid();
    bd()->prepare(
        'INSERT INTO constancias
            (id, unidad_id, promo_id, huella, registro, borrador, texto, ajustado, descargas,
             descargado_en, descargado_por_nombre, gasto_entrada, gasto_salida, modelo, borrada,
             creado, actualizado, creado_por, creado_por_nombre)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
    )->execute([
        $id,
        $unidad,
        explode(':', $unidad)[0],
        // La huella de lo que se mandó a redactar, no la de después.
        $material['huella'],
        hoy_obra(),
        (string) json_encode($hecho['borrador'], CONSTANCIA_JSON),
        (string) json_encode($hecho['texto'], CONSTANCIA_JSON),
        '',
        (int) $ia['gasto']['entrada'],
        (int) $ia['gasto']['salida'],
        mb_substr((string) $ia['gasto']['modelo'], 0, 60),
        $creado,
        $creado,
        (string) $yo['id'],
        mb_substr((string) $yo['nombre'], 0, 120),
    ]);

    // Se contesta con la vivienda releída: si alguien ha tocado un
    // repaso mientras el modelo escribía, `alDia` tiene que decirlo.
    responder(constancia_estado($unidad, $yo));
}

/* ═══ POST constancias/{unidad}/ajustar ═══════════════════════════ */

/**
 * La hora que se apunta al cambiar una fila: la de ahora, sin retroceder
 * nunca respecto a la que ya tenía. El reloj de la casa va de segundo en
 * segundo, y una fila creada en el mismo segundo que la anterior lleva
 * un milisegundo de más: sin esto, ajustarla o sellarla al momento le
 * dejaría una hora de cambio anterior a la de su propia creación.
 */
function constancia_hora_de_cambio(array $fila): string
{
    $ahora = ahora_iso();
    $antes = (string) ($fila['actualizado'] ?? '');
    return strcmp($ahora, $antes) > 0 ? $ahora : $antes;
}

/** El borrador guardado, de vuelta a las claves r1, r2… para la segunda pasada. */
function constancia_previo(array $borrador, array $material): array
{
    $aClaves = static function ($ids) use ($material): array {
        $claves = [];
        foreach ((array) $ids as $id) {
            $r = is_string($id) ? constancia_repaso($material, $id) : null;
            if ($r !== null) {
                $claves[] = $r['clave'];
            }
        }
        return $claves;
    };

    $zonas = [];
    foreach ((array) ($borrador['zonas'] ?? []) as $z) {
        if (!is_array($z)) {
            continue;
        }
        $actuaciones = [];
        foreach ((array) ($z['actuaciones'] ?? []) as $a) {
            if (is_array($a)) {
                $actuaciones[] = ['texto' => (string) ($a['texto'] ?? ''), 'repasos' => $aClaves($a['repasos'] ?? [])];
            }
        }
        $zonas[] = ['zona' => (string) ($z['zona'] ?? ''), 'actuaciones' => $actuaciones, 'texto' => (string) ($z['texto'] ?? '')];
    }
    $dudas = [];
    foreach ((array) ($borrador['dudas'] ?? []) as $d) {
        if (is_array($d)) {
            $dudas[] = ['texto' => (string) ($d['texto'] ?? ''), 'repasos' => $aClaves($d['repasos'] ?? [])];
        }
    }
    return ['zonas' => $zonas, 'dudas' => $dudas];
}

/**
 * La segunda pasada: una sola vez por fila, y solo sobre la actual con
 * la huella al día. Corrige lo que la primera dejó cojo —repasos sin
 * citar, líneas de más, palabras que parecen nombres— y actualiza la
 * MISMA fila. Si el modelo falla, la fila se queda como estaba.
 */
function ajustar_constancia(string $unidad): void
{
    $yo = constancia_entrar($unidad);
    $cuerpo = cuerpo();
    $fila = constancia_fila($unidad, $cuerpo['id'] ?? null);
    $sobran = max(0, min(200, entero($cuerpo, 'sobran')));

    $material = constancia_material($unidad);
    $actual = constancia_actual($unidad);
    if ($actual === null || $actual['id'] !== $fila['id'] || !hash_equals((string) $fila['huella'], $material['huella'])) {
        responder_error(
            409,
            'Los repasos de esta vivienda han cambiado desde que se redactó el documento. Hay que generarlo de nuevo.',
            'ha-cambiado'
        );
    }
    if ((int) $fila['ajustado'] === 1) {
        responder(constancia_estado($unidad, $yo, $fila, $material));
    }

    $borrador = constancia_leer_json($fila['borrador']);
    $genericos = constancia_lista($borrador['genericos'] ?? []);
    $nombres = constancia_lista($borrador['nombres'] ?? []);
    $faltan = [];
    foreach ($genericos as $id) {
        $r = constancia_repaso($material, $id);
        if ($r !== null) {
            $faltan[] = $r['clave'];
        }
    }

    $pdo = bd();
    if ($faltan === [] && $nombres === [] && $sobran === 0) {
        // Nada que corregir: no se gasta una llamada. Se da por hecha
        // para que nadie vuelva a pedirla por esta fila.
        $pdo->prepare('UPDATE constancias SET ajustado = 1, actualizado = ? WHERE id = ?')
            ->execute([constancia_hora_de_cambio($fila), $fila['id']]);
        responder(constancia_estado($unidad, $yo, constancia_fila($unidad, $fila['id']), $material));
    }

    $conFotos = ($borrador['conFotos'] ?? false) === true;
    $ia = claude_redactar_constancia([
        'repasos' => constancia_entrada_ia($material, $conFotos),
        'previo' => constancia_previo($borrador, $material),
        'observaciones' => ['faltan' => $faltan, 'sobran' => $sobran, 'nombres' => $nombres],
    ]);
    $hecho = constancia_repasar($ia, $material, $conFotos);

    $entrada = (int) $ia['gasto']['entrada'];
    $salida = (int) $ia['gasto']['salida'];
    if (count($hecho['borrador']['genericos']) > count($genericos)) {
        // Ha ido a peor: se queda lo que había. Pero la pasada está
        // dada y pagada, y no se repite.
        $pdo->prepare(
            'UPDATE constancias
                SET ajustado = 1, gasto_entrada = gasto_entrada + ?, gasto_salida = gasto_salida + ?, actualizado = ?
              WHERE id = ?'
        )->execute([$entrada, $salida, constancia_hora_de_cambio($fila), $fila['id']]);
    } else {
        $pdo->prepare(
            'UPDATE constancias
                SET borrador = ?, texto = ?, ajustado = 1, gasto_entrada = gasto_entrada + ?,
                    gasto_salida = gasto_salida + ?, modelo = ?, actualizado = ?
              WHERE id = ?'
        )->execute([
            (string) json_encode($hecho['borrador'], CONSTANCIA_JSON),
            (string) json_encode($hecho['texto'], CONSTANCIA_JSON),
            $entrada,
            $salida,
            mb_substr((string) $ia['gasto']['modelo'], 0, 60),
            constancia_hora_de_cambio($fila),
            $fila['id'],
        ]);
    }

    responder(constancia_estado($unidad, $yo, constancia_fila($unidad, $fila['id'])));
}

/* ═══ POST constancias/{unidad}/sellar ════════════════════════════ */

/**
 * Apunta una descarga: quién, cuándo y cuántas van. Si el documento
 * sigue al día, su fecha de registro pasa a ser la de hoy —el papel
 * lleva el día en que se descarga—; si los repasos han cambiado desde
 * que se redactó, conserva la suya. El cliente monta el PDF con esta
 * respuesta, que trae la fila sellada.
 */
function sellar_constancia(string $unidad): void
{
    $yo = constancia_entrar($unidad);
    $fila = constancia_fila($unidad, cuerpo()['id'] ?? null);
    $material = constancia_material($unidad);

    $ahora = ahora_iso();
    $cambio = constancia_hora_de_cambio($fila);
    $nombre = mb_substr((string) $yo['nombre'], 0, 120);
    if (hash_equals((string) $fila['huella'], $material['huella'])) {
        bd()->prepare(
            'UPDATE constancias
                SET descargas = descargas + 1, descargado_en = ?, descargado_por_nombre = ?, actualizado = ?, registro = ?
              WHERE id = ?'
        )->execute([$ahora, $nombre, $cambio, hoy_obra(), $fila['id']]);
    } else {
        bd()->prepare(
            'UPDATE constancias
                SET descargas = descargas + 1, descargado_en = ?, descargado_por_nombre = ?, actualizado = ?
              WHERE id = ?'
        )->execute([$ahora, $nombre, $cambio, $fila['id']]);
    }

    responder(constancia_estado($unidad, $yo, constancia_fila($unidad, $fila['id']), $material));
}
