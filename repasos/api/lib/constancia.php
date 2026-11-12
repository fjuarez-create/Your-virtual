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
 * que no, le pone una fórmula general. Nunca corrige la prosa: lo más
 * que hace es cuidarle la forma (constancia_forma) y, si un párrafo
 * trae lo que no puede ir a un papel que se firma, retirarlo entero
 * (constancia_no_aceptar).
 *
 * Qué entra: los repasos `pendiente` y `rechazada` de las listas vivas
 * de la vivienda. Los resueltos y los verificados no entran ni se
 * mencionan.
 *
 * Qué NO viaja nunca al modelo: compradores, autores, gremios,
 * empresas, fechas ni el número de la vivienda (y si alguien los ha
 * dejado escritos en una anotación, se tapan: constancia_tapar).
 * Tampoco los identificadores de la base: cada repaso va con una clave
 * corta (r1, r2…) que solo vale para esa llamada. Y de cada foto, solo
 * la imagen: sin la fecha de la toma, la posición ni el modelo del
 * móvil que el fichero pueda llevar por dentro.
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

/**
 * Lo que no puede salir en un párrafo del documento, escriba lo que
 * escriba el modelo. El papel se firma ante notario y no hay pantalla
 * de revisión: esto no puede depender de que el modelo obedezca, ni de
 * lo que alguien haya dejado escrito en una nota. Va por familias, una
 * por línea:
 *
 *   – cifras de dos o más dígitos (importes, fechas, teléfonos),
 *     direcciones, marcado y la marca «[…]» del tapado;
 *   – compromiso, garantía y culpa;
 *   – la aceptación de la vivienda y lo que se diga de su estado (que
 *     está terminada, perfecta, que no queda nada, que algo no afecta);
 *   – las partes, el dinero y el derecho;
 *   – el tiempo: plazos, fechas, días, semanas y meses, con cifras o
 *     con letras.
 *
 * Un párrafo bueno solo dice qué trabajo queda por hacer, y no necesita
 * ninguna de estas palabras: ni los tres documentos aprobados por Fran
 * ni los párrafos de ejemplo de las instrucciones casan con ello (lo
 * comprueba la batería del servidor). Es una lista, y como toda lista
 * se le puede escapar algo: por eso además se le dice al modelo qué
 * palabra ha hecho saltar la red (constancia_lo_delicado).
 */
const CONSTANCIA_DELICADO = '/'
    . '\d{2,}|€|\beuros?\b|%|@|https?:|www\.|[<>\[\]{}]'
    . '|indemni|compens|penaliz|descuent|compromet|compromis|\bpromet|garant[ií]|renunci|conformidad|responsab|culpa'
    . '|defect|\bgraves?\b|urgen'
    . '|\bacept|satisfac|\bdeclar|sin\s+reservas|perfect|\bterminad[ao]s?\b|nada\s+pendiente|\bno\s+quedan?\b'
    . '|\bno\s+afect|habitab|meramente|sin\s+importancia'
    . '|promotor|comprador|vendedor|propietari|\bclientes?\b|\bse\s+oblig|\basum[eaió]|\babon[aoeó]'
    . '|\bpag(?:o|os|a|an|ar|ará|arán)\b|\bcostes?\b|\bgastos?\b|\bimportes?\b|\bprecios?\b|gratuit|sin\s+cargo'
    . '|\bcontrat|\bescritura|notar[ií]|judicial|\blegal(?:es|mente)?\b|reclam|\bdemanda|\bvicios?\b|\bruina|estructural'
    . '|\bplazos?\b|\bfechas?\b|retras|\bdemora|\bbrevedad|cuanto\s+antes|pr[oó]ximamente'
    . '|\b(?:d[ií]as?|semanas?|mes|meses|años?|quincenas?|hoy|mañana)\b'
    . '|\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|sep?tiembre|octubre|noviembre|diciembre)\b'
    . '|\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\b'
    . '|\bantes del?\s+(?:la\s+)?(?:firma|entrega|escritura|\d)'
    . '|\bmil\b|\bcien(?:to)?\b|\b\p{L}*cient[oa]s\b|\bmill[oó]n'
    . '/iu';

/**
 * Un párrafo de zona más largo que esto es un desmesurado y no va al
 * papel. Es más de lo que cabe en la primera página entera (unas 2.000
 * letras): el más largo de los modelos mide 249. Que un párrafo sea
 * largo sin llegar aquí no es cosa de esta red: si no cabe en la
 * página lo dice quien mide el PDF, con sus «sobran N líneas».
 */
const CONSTANCIA_LARGO_DE_ZONA = 2400;

/**
 * Palabras que dicen qué se hace o cómo, pero no a qué: con ellas solas
 * no se reconoce una actuación dentro del párrafo de su zona, y los
 * sitios de la casa. Van en llano (sin tildes ni mayúsculas) y por su
 * raíz: «repas» vale por «repaso», «repasos» y «repasar». Lo que queda
 * de una actuación al quitarlas son sus elementos («armarios», «tapa»,
 * «luminaria»), y eso es lo que se busca en el párrafo
 * (constancia_se_lee).
 */
const CONSTANCIA_RELLENO_RAICES = [
    'repas', 'acabad', 'terminac', 'terminar', 'empast', 'pintur', 'pintar', 'pintad', 'remat', 'encuentr',
    'limpi', 'retirad', 'retirar', 'protecc', 'adhesiv', 'sellad', 'sellar', 'ajust', 'fijac', 'fijar',
    'colocac', 'colocar', 'instalac', 'instalar', 'sustitu', 'reparac', 'reparar', 'revis', 'subsan',
    'complet', 'realiz', 'adecua', 'puntual', 'pendient', 'senalad', 'divers', 'trabaj', 'element',
];

/**
 * Con qué empieza una actuación concreta: algo que falta y se coloca,
 * algo que no va y se ajusta o se sustituye. Son las que el documento
 * no puede callarse («conserva las actuaciones concretas de
 * instalación, sustitución, reparación o funcionamiento»), y las
 * únicas que se buscan en el párrafo. Los repasos generales de pintura,
 * remates o limpieza se agrupan y se resumen: ahí no se mira nada.
 */
const CONSTANCIA_ACCIONES_CONCRETAS = [
    'coloc', 'instal', 'sustitu', 'subsan', 'complet', 'ajust', 'fijac', 'fijar', 'repos', 'repon', 'montaj', 'montar',
];

/** Las de relleno que se comparan enteras (una raíz se llevaría por delante «paramento» o «bajante»). */
const CONSTANCIA_RELLENO_PALABRAS = [
    'resto', 'obra', 'punto', 'zona', 'general', 'asimismo', 'tambien', 'ademas', 'para', 'como', 'entre',
    'sobre', 'desde', 'hasta', 'junto', 'incluido', 'incluida', 'todo', 'toda', 'cada', 'otro', 'otra',
    'este', 'esta', 'estos', 'estas', 'dicho', 'dicha', 'segun', 'donde', 'mismo', 'misma', 'ambos', 'ambas',
    'vario', 'varia', 'dormitorio', 'suite', 'salon', 'cocina', 'lavadero', 'bano', 'aseo', 'pasillo',
    'entrada', 'sotano', 'escalera', 'terraza', 'jardin', 'acceso', 'exterior', 'interior', 'principal',
    'planta', 'alta', 'baja', 'vivienda', 'estancia',
];

/**
 * Las empresas que llevan cada gremio en la obra. El servidor no guarda
 * el catálogo de gremios (vive en el cliente, js/catalog.js, GREMIOS →
 * `empresa`), y una empresa puede no tener a nadie con cuenta: sin esta
 * lista, el buscador de nombres propios no la conocería. Se buscan
 * enteras, como frase, igual que la empresa de un usuario.
 *
 * OJO: es una copia a mano. Si cambia una empresa en js/catalog.js, se
 * cambia aquí también.
 */
const CONSTANCIA_EMPRESAS_DE_GREMIOS = [
    'Insiste', 'Aluvidrio', 'Railing Canarias', 'Samony', 'Octavio Guerra', 'Cisneros',
    'Cardona Cubas', 'Construegraf', 'Zurita', 'Felipe', 'Jordán', 'Willian',
];

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

/**
 * El cuerpo JSON de la petición, siempre como matriz. El `cuerpo()` de
 * la casa (lib/nucleo.php) devuelve tal cual lo que venga, y con un
 * JSON válido que no es ni objeto ni lista —un número, una cadena
 * entre comillas, un `true`— revienta por su tipo de retorno y la ruta
 * contesta un 500. Aquí eso vale lo mismo que un cuerpo vacío o roto:
 * nada. El día que `cuerpo()` lo aguante, esto puede volver a llamarlo.
 */
function constancia_cuerpo(): array
{
    static $datos = null;
    if ($datos === null) {
        $crudo = file_get_contents('php://input');
        $leido = is_string($crudo) && $crudo !== '' ? json_decode($crudo, true) : null;
        $datos = is_array($leido) ? $leido : [];
    }
    return $datos;
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

    // La huella: lo que, si cambia, obliga a redactar de nuevo. Se
    // hace con lo mismo que lee el modelo: los textos en una línea
    // (un espacio de más no cambia nada) y sin las notas que no viajan
    // —las vacías y la que la app escribe sola al cambiar un repaso de
    // gremio—. Las descripciones de las fotos no entran; que haya una
    // foto más, sí.
    //
    // `huellaDeAntes` es la misma cuenta tal como se hacía hasta el
    // 12-11-2026, con los textos tal cual y todas las notas: los
    // documentos redactados antes llevan esa, y siguen al día mientras
    // no cambie nada (constancia_al_dia). Casi siempre son la misma.
    $ids = array_map('strval', array_keys($porId));
    usort($ids, 'strcmp');
    $paraHuella = [];
    $paraLaDeAntes = [];
    foreach ($ids as $id) {
        $r = $porId[$id];
        $comentarios = [];
        $losDeAntes = [];
        foreach ($r['comentarios'] as $c) {
            $losDeAntes[] = [$c['id'], $c['tipo'], $c['texto']];
            $texto = claude_en_una_linea($c['texto']);
            if ($texto !== '' && !constancia_es_nota_de_oficio($texto)) {
                $comentarios[] = [$c['id'], $c['tipo'], $texto];
            }
        }
        usort($comentarios, static fn ($a, $b) => strcmp($a[0], $b[0]));
        usort($losDeAntes, static fn ($a, $b) => strcmp($a[0], $b[0]));
        $fotos = [];
        foreach ($r['fotos'] as $f) {
            $fotos[] = $f['id'];
        }
        usort($fotos, 'strcmp');
        $paraHuella[] = [
            $r['id'], $r['estado'], claude_en_una_linea($r['estancia']), claude_en_una_linea($r['texto']),
            $comentarios, $fotos,
        ];
        $paraLaDeAntes[] = [$r['id'], $r['estado'], $r['estancia'], $r['texto'], $losDeAntes, $fotos];
    }
    $huella = sha1((string) json_encode([CONSTANCIA_VERSION_REDACCION, $paraHuella], CONSTANCIA_JSON));
    $huellaDeAntes = sha1((string) json_encode([CONSTANCIA_VERSION_REDACCION, $paraLaDeAntes], CONSTANCIA_JSON));

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
        'unidad' => $unidad,
        'repasos' => $repasos,
        'indice' => $indice,
        'huella' => $huella,
        'huellaDeAntes' => $huellaDeAntes,
        // Como en el resto de la casa: «pendientes» son todos los que
        // siguen en obra, y los rechazados van contados dentro y aparte.
        'cuenta' => ['pendientes' => count($repasos), 'rechazados' => $rechazados],
        'fotos' => ['total' => $total, 'miradas' => $miradas, 'porMirar' => $porMirar, 'fuera' => $fuera],
        'dentro' => $dentro,
    ];
}

/**
 * La nota que la app escribe sola en el hilo al cambiar un repaso de
 * gremio («Oficio cambiado: …»). Nombra gremios y no dice nada de lo
 * que queda por hacer: ni viaja al modelo ni cuenta para la huella.
 */
function constancia_es_nota_de_oficio(string $texto): bool
{
    return preg_match('/^\s*Oficio cambiado:/u', $texto) === 1;
}

/**
 * ¿Sigue valiendo esta fila para los repasos de ahora? Vale si su
 * huella es la de ahora, calculada como se calcula hoy o como se
 * calculaba cuando se redactó (ver `huellaDeAntes` en constancia_material).
 */
function constancia_al_dia(array $fila, array $material): bool
{
    $suya = (string) ($fila['huella'] ?? '');
    if ($suya === '') {
        return false;
    }
    return hash_equals((string) $material['huella'], $suya)
        || hash_equals((string) ($material['huellaDeAntes'] ?? $material['huella']), $suya);
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
 *
 * El motivo de un rechazo viaja como `motivoRechazo` mientras el repaso
 * siga rechazado. Si ha vuelto a pendiente, lo que dijo la dirección
 * facultativa al rechazarlo sigue diciendo qué queda por hacer: viaja
 * como una nota más, en su sitio por fecha.
 */
function constancia_entrada_ia(array $material, bool $conFotos): array
{
    $unidad = (string) ($material['unidad'] ?? '');
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
            if ($c['tipo'] === 'rechazo' && $rechazado) {
                $motivo = mb_substr(constancia_tapar($texto, $unidad), 0, CONSTANCIA_TOPE_NOTA);
                continue;
            }
            if (constancia_es_nota_de_oficio($texto)) {
                continue;
            }
            $notas[] = mb_substr(constancia_tapar($texto, $unidad), 0, CONSTANCIA_TOPE_NOTA);
        }
        // Van de la más antigua a la más reciente. Si hay más de las
        // que caben, se quedan las ÚLTIMAS: son las que dicen qué queda
        // por hacer («utiliza la información más reciente»).
        if (count($notas) > CONSTANCIA_TOPE_NOTAS) {
            $notas = array_slice($notas, -CONSTANCIA_TOPE_NOTAS);
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
            // La estancia de fábrica no lleva nada de nadie; la escrita
            // a mano es texto libre como otro cualquiera.
            'estancia' => mb_substr(constancia_tapar(claude_en_una_linea($r['estancia']), $unidad), 0, 80),
            'estado' => $rechazado ? 'rechazado' : 'pendiente',
            'anotacion' => mb_substr(
                constancia_tapar(claude_en_una_linea($r['texto']), $unidad),
                0,
                CONSTANCIA_TOPE_ANOTACION
            ),
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

/** Palabras que enlazan un nombre y no hacen nombre por sí solas. */
const CONSTANCIA_ENLACES_DE_NOMBRE = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'i', 'da', 'do', 'dos', 'van', 'von'];

/**
 * Empresas de gremio que son además una palabra corriente («insiste»,
 * del verbo insistir): solo se reconocen escritas como nombre, con
 * mayúscula inicial y en mitad de una frase.
 */
const CONSTANCIA_EMPRESAS_QUE_SON_PALABRAS = ['insiste'];

/** Los tratamientos tras los que un punto no cierra la frase («Sr. Gómez»). */
const CONSTANCIA_TRATAMIENTOS = ['sr', 'sra', 'sres', 'sras', 'd', 'dn', 'dna', 'dr', 'dra'];

/**
 * Las palabras de un texto, en orden, con su forma, su versión llana y
 * el sitio que ocupan en él (`desde` y `hasta`, en bytes).
 */
function constancia_palabras(string $texto): array
{
    $palabras = [];
    if (preg_match_all('/[\p{L}\p{N}]+/u', $texto, $m, PREG_OFFSET_CAPTURE)) {
        foreach ($m[0] as [$forma, $desde]) {
            $llana = llano($forma);
            if ($llana !== '') {
                $palabras[] = [
                    'forma' => $forma,
                    'llana' => $llana,
                    'desde' => (int) $desde,
                    'hasta' => (int) $desde + strlen($forma),
                ];
            }
        }
    }
    return $palabras;
}

/** ¿Está esa frase —palabras llanas seguidas— en ese texto ya troceado? Devuelve dónde, o -1. */
function constancia_donde_esta(array $palabras, array $frase, int $desde = 0): int
{
    $n = count($frase);
    if ($n === 0) {
        return -1;
    }
    $tope = count($palabras) - $n;
    for ($i = max(0, $desde); $i <= $tope; $i++) {
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

/** ¿Hace nombre esta palabra llana? (ni enlace, ni una letra suelta, ni un número) */
function constancia_hace_nombre(string $llana, int $letras = 2): bool
{
    return strlen($llana) >= $letras && !ctype_digit($llana) && !in_array($llana, CONSTANCIA_ENLACES_DE_NOMBRE, true);
}

/**
 * Las frases por las que se reconoce a una persona escrita con su
 * nombre: el nombre entero y cada pareja de palabras seguidas (nombre y
 * apellido, los dos apellidos). Con una palabra de enlace por medio no
 * hay pareja: «Banco de pruebas» no convierte «banco de» en un nombre.
 * Devuelve listas de palabras llanas.
 */
function constancia_frases_de_persona(string $nombre): array
{
    $palabras = array_column(constancia_palabras($nombre), 'llana');
    $n = count($palabras);
    $frases = [];
    if ($n >= 2 && count(array_filter($palabras, 'constancia_hace_nombre')) >= 2) {
        $frases[implode(' ', $palabras)] = $palabras;
    }
    for ($i = 0; $i + 1 < $n; $i++) {
        if (constancia_hace_nombre($palabras[$i]) && constancia_hace_nombre($palabras[$i + 1])) {
            $frases[$palabras[$i] . ' ' . $palabras[$i + 1]] = [$palabras[$i], $palabras[$i + 1]];
        }
    }
    return array_values($frases);
}

/**
 * Los compradores de la vivienda, uno a uno: la ficha de entrega los
 * trae en una sola línea («Ana Pérez y Luis Gómez»).
 */
function constancia_compradores_uno_a_uno(string $unidad): array
{
    if ($unidad === '') {
        return [];
    }
    try {
        $linea = constancia_compradores($unidad);
    } catch (Throwable $e) {
        return [];
    }
    $personas = [];
    foreach (preg_split('/\s+(?:y|e)\s+|[,;\/&+\n]|\s+-\s+/iu', $linea) ?: [] as $parte) {
        $parte = trim((string) $parte);
        if ($parte !== '') {
            $personas[] = $parte;
        }
    }
    return $personas;
}

/**
 * Lo que no debería aparecer en el papel: cada palabra de cuatro
 * letras o más del nombre de cualquier usuario, y cada empresa entera
 * —las de los usuarios y las que llevan cada gremio en la obra—.
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
    foreach (CONSTANCIA_EMPRESAS_DE_GREMIOS as $empresa) {
        $frase = array_column(constancia_palabras($empresa), 'llana');
        if ($frase !== []) {
            $frases[implode(' ', $frase)] = $frase;
        }
    }
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
 * la casa, o con un comprador de la vivienda, tal como están escritas
 * en él. Da falsos positivos a propósito («Puerta» es un apellido y una
 * puerta): quien decide es la segunda pasada, y la nota interna queda
 * para quien revisa.
 */
function constancia_buscar_nombres(string $texto, string $unidad = ''): array
{
    $casa = constancia_nombres_de_la_casa();
    $sueltas = $casa['palabras'];
    foreach (constancia_compradores_uno_a_uno($unidad) as $persona) {
        foreach (constancia_palabras($persona) as $p) {
            if (constancia_hace_nombre($p['llana'], 4)) {
                $sueltas[$p['llana']] = true;
            }
        }
    }
    $palabras = constancia_palabras($texto);
    $hallados = [];
    foreach ($palabras as $p) {
        if (isset($sueltas[$p['llana']]) && !isset($hallados[$p['llana']])) {
            $hallados[$p['llana']] = $p['forma'];
        }
    }
    foreach ($casa['frases'] as $frase) {
        $clave = implode(' ', $frase);
        $donde = isset($hallados[$clave]) ? -1 : constancia_donde_esta($palabras, $frase);
        // La empresa que es también una palabra corriente solo cuenta
        // escrita como nombre: «se insiste en…» no nombra a nadie.
        while ($donde >= 0 && count($frase) === 1 && in_array($frase[0], CONSTANCIA_EMPRESAS_QUE_SON_PALABRAS, true)
            && !constancia_va_como_nombre($texto, $palabras, $donde)) {
            $donde = constancia_donde_esta($palabras, $frase, $donde + 1);
        }
        if ($donde >= 0) {
            $hallados[$clave] = implode(' ', array_column(array_slice($palabras, $donde, count($frase)), 'forma'));
        }
    }
    return array_values($hallados);
}

/**
 * ¿Está escrita como nombre propio la palabra número `$i` del texto?
 * Lo está si lleva mayúscula inicial y va en mitad de una frase: al
 * principio del texto, o detrás de un punto, la mayúscula no dice nada
 * («Paredes mal pintadas»), salvo que el punto sea el de un tratamiento
 * («Sr. Gómez»). Así se distingue «el señor Paredes» de las paredes, y
 * a la empresa Insiste del verbo. Y lo está siempre, vaya donde vaya,
 * si es una sigla escrita tal como consta (`$siglas`: «UNIK»).
 */
function constancia_va_como_nombre(string $texto, array $palabras, int $i, array $siglas = []): bool
{
    if (!isset($palabras[$i])) {
        return false;
    }
    $forma = $palabras[$i]['forma'];
    if (in_array($forma, $siglas, true) && preg_match('/^[\p{Lu}\p{N}]{2,}$/u', $forma) === 1) {
        return true;
    }
    if ($i < 1 || preg_match('/^\p{Lu}\p{Ll}+$/u', $forma) !== 1) {
        return false;
    }
    $antes = $palabras[$i - 1];
    $entre = substr($texto, $antes['hasta'], $palabras[$i]['desde'] - $antes['hasta']);
    if (preg_match('/[.!?…]/u', $entre) === 1) {
        return in_array($antes['llana'], CONSTANCIA_TRATAMIENTOS, true);
    }
    return true;
}

/**
 * Los nombres propios que este documento conoce: los de la casa —la
 * gente con cuenta, sus empresas y las de los gremios— y, si se dice la
 * vivienda, los de sus compradores.
 *
 *   frases    listas de palabras llanas que, seguidas, son un nombre
 *             (nombre y apellido, una empresa): se reconocen estén
 *             escritas como estén.
 *   sueltas   palabras que son un nombre o una palabra corriente según
 *             cómo se escriban (el apellido de un comprador, una
 *             empresa de una sola palabra): solo se reconocen escritas
 *             como nombre (constancia_va_como_nombre). Cada una lleva
 *             las formas en que consta, por si es una sigla.
 *   deGente   lo mismo, para cada palabra del nombre de quien tiene
 *             cuenta. Solo las mira la red final: en lo que viaja no se
 *             tapan, que un usuario apellidado «Puerta» dejaría el
 *             documento sin puertas.
 */
function constancia_nombres_propios(string $unidad = ''): array
{
    static $porUnidad = [];
    if (isset($porUnidad[$unidad])) {
        return $porUnidad[$unidad];
    }
    $frases = [];
    $sueltas = [];
    $deGente = [];
    $empresa = static function (string $nombre) use (&$frases, &$sueltas): void {
        $palabras = constancia_palabras($nombre);
        $frase = array_column($palabras, 'llana');
        if (count($frase) > 1) {
            $frases[implode(' ', $frase)] = $frase;
        } elseif (count($frase) === 1 && constancia_hace_nombre($frase[0], 3)) {
            $sueltas[$frase[0]][$palabras[0]['forma']] = true;
        }
    };
    foreach (CONSTANCIA_EMPRESAS_DE_GREMIOS as $nombre) {
        $frase = array_column(constancia_palabras($nombre), 'llana');
        if (count($frase) === 1 && in_array($frase[0], CONSTANCIA_EMPRESAS_QUE_SON_PALABRAS, true)) {
            $sueltas[$frase[0]][$nombre] = true;
        } elseif ($frase !== []) {
            // Las de los gremios son una lista hecha a mano: se
            // reconocen siempre, también en minúsculas.
            $frases[implode(' ', $frase)] = $frase;
        }
    }
    try {
        foreach (bd()->query('SELECT nombre, empresa FROM usuarios')->fetchAll() as $u) {
            foreach (constancia_frases_de_persona((string) $u['nombre']) as $frase) {
                $frases[implode(' ', $frase)] = $frase;
            }
            foreach (constancia_palabras((string) $u['nombre']) as $p) {
                if (constancia_hace_nombre($p['llana'], 4)) {
                    $deGente[$p['llana']] = true;
                }
            }
            $empresa((string) $u['empresa']);
        }
    } catch (Throwable $e) {
        // Sin la lista de usuarios se sigue con lo demás.
    }
    foreach (constancia_compradores_uno_a_uno($unidad) as $persona) {
        foreach (constancia_frases_de_persona($persona) as $frase) {
            $frases[implode(' ', $frase)] = $frase;
        }
        foreach (constancia_palabras($persona) as $p) {
            if (constancia_hace_nombre($p['llana'], 3)) {
                $sueltas[$p['llana']][$p['forma']] = true;
            }
        }
    }
    $frases = array_values($frases);
    usort($frases, static fn ($a, $b) => count($b) <=> count($a));
    $porUnidad[$unidad] = ['frases' => $frases, 'sueltas' => $sueltas, 'deGente' => $deGente];
    return $porUnidad[$unidad];
}

/**
 * Dónde nombra el texto a alguien de esos. Devuelve las palabras del
 * texto y los tramos hallados ([primera, última], por número de
 * palabra), en orden y sin pisarse.
 */
function constancia_nombres_en(string $texto, array $propios, bool $conGente = false): array
{
    $palabras = constancia_palabras($texto);
    $n = count($palabras);
    $tomada = array_fill(0, $n, false);
    $tramos = [];
    foreach ($propios['frases'] as $frase) {
        $largo = count($frase);
        for ($i = constancia_donde_esta($palabras, $frase); $i >= 0; $i = constancia_donde_esta($palabras, $frase, $i + 1)) {
            if (!in_array(true, array_slice($tomada, $i, $largo), true)) {
                for ($j = $i; $j < $i + $largo; $j++) {
                    $tomada[$j] = true;
                }
                $tramos[] = [$i, $i + $largo - 1];
            }
        }
    }
    foreach ($palabras as $i => $p) {
        if ($tomada[$i]) {
            continue;
        }
        $formas = $propios['sueltas'][$p['llana']] ?? null;
        $esDeEstos = $formas !== null || ($conGente && isset($propios['deGente'][$p['llana']]));
        if ($esDeEstos && constancia_va_como_nombre($texto, $palabras, $i, array_map('strval', array_keys($formas ?? [])))) {
            $tramos[] = [$i, $i];
        }
    }
    usort($tramos, static fn ($a, $b) => $a[0] <=> $b[0]);
    return [$palabras, $tramos];
}

/* ═══ Lo que no va al papel, y lo que no viaja ════════════════════ */

/** ¿Trae este párrafo algo que no puede ir a un papel que se firma? */
function constancia_es_delicado(string $parrafo): bool
{
    return preg_match(CONSTANCIA_DELICADO, $parrafo) === 1;
}

/** ¿Es un párrafo desmesurado? (ver CONSTANCIA_LARGO_DE_ZONA) */
function constancia_es_desmesurado(string $parrafo): bool
{
    return mb_strlen($parrafo) > CONSTANCIA_LARGO_DE_ZONA;
}

/**
 * Qué es lo que ha hecho saltar la red en un párrafo: las palabras
 * enteras, tal como están escritas («garanti» → «garantizar»), sin
 * repetir y hasta seis. Es para decírselo al modelo en la segunda
 * pasada: «en este párrafo sobra esto» se corrige; «este párrafo trae
 * algo» no.
 */
function constancia_lo_delicado(string $parrafo): array
{
    $trozos = [];
    if (preg_match_all(CONSTANCIA_DELICADO, $parrafo, $m, PREG_OFFSET_CAPTURE)) {
        foreach ($m[0] as [$hallado, $desde]) {
            $antes = preg_match('/[\p{L}\p{N}]+$/u', substr($parrafo, 0, (int) $desde), $a) === 1 ? $a[0] : '';
            $despues = preg_match('/^[\p{L}\p{N}]+/u', substr($parrafo, (int) $desde + strlen($hallado)), $d) === 1 ? $d[0] : '';
            $trozo = mb_substr(claude_en_una_linea($antes . $hallado . $despues), 0, 40);
            if ($trozo !== '') {
                $trozos[mb_strtolower($trozo)] = $trozo;
            }
            if (count($trozos) >= 6) {
                break;
            }
        }
    }
    return array_values($trozos);
}

/**
 * Lo que viaja a la IA es texto libre que escribe la gente de la obra.
 * Antes de mandarlo se tapa lo que identifica a alguien y no hace falta
 * para saber qué trabajo queda: correos, teléfonos, documentos de
 * identidad, fechas, el número de la vivienda, las empresas de los
 * gremios y de los usuarios, el nombre y apellido seguidos de quien
 * tiene cuenta y —si se dice la vivienda— sus compradores, también por
 * el nombre o el apellido a solas cuando van escritos como nombre.
 *
 * Las palabras sueltas del nombre de un usuario NO se tapan: uno
 * apellidado «Puerta» dejaría el documento sin puertas. La huella no
 * cambia: se calcula con el texto de la base.
 */
function constancia_tapar(string $texto, string $unidad = ''): string
{
    $marca = '[…]';
    $meses = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|sep?tiembre|octubre|noviembre|diciembre';
    $pasos = [
        // Correos.
        '/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u' => $marca,
        // Teléfonos de nueve cifras, juntas o de tres en tres o de dos en dos, con o sin prefijo.
        '/(?<![\p{L}\p{N}])(?:(?:\+|00)?34[ .-]?)?[6789]\d{2}[ .-]?(?:\d{3}[ .-]?\d{3}|\d{2}[ .-]?\d{2}[ .-]?\d{2})(?![\p{L}\p{N}])/u' => $marca,
        // Documentos de identidad: ocho cifras y letra, o letra, siete cifras y letra.
        '/(?<![\p{L}\p{N}])(?:\d{8}|[XYZ]\d{7})-?[A-Z](?![\p{L}\p{N}])/iu' => $marca,
        // Fechas: «15/11/2026», «15-11-2026», «3 de noviembre», «3 de noviembre de 2026».
        '/(?<![\p{L}\p{N}\/])\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?![\p{L}\p{N}\/])/u' => $marca,
        '/(?<![\p{L}\p{N}])\d{1,2}[.-]\d{1,2}[.-]\d{2,4}(?![\p{L}\p{N}])/u' => $marca,
        '/(?<![\p{L}\p{N}])\d{1,2}\s+de\s+(?:' . $meses . ')(?:\s+de(?:l)?\s+\d{4})?(?![\p{L}\p{N}])/iu' => $marca,
        // «villa 22», «vivienda nº 7»: se queda la palabra, se va el número.
        '/\b(villa|vivienda|chalet)\s+(?:n[ºo°.]{0,2}\s*)?\d{1,3}\b/iu' => '$1',
    ];
    // El número de ESTA vivienda detrás de una abreviatura o del nombre
    // de la promoción: «V22», «nº 22», «casa 22», «Brassie 22».
    $numero = $unidad !== '' ? (string) substr((string) strrchr(':' . $unidad, ':'), 1) : '';
    $promocion = (string) strstr($unidad, ':', true);
    if ($numero !== '' && ctype_digit($numero) && $promocion !== '') {
        $pasos['/(?<![\p{L}\p{N}])(' . preg_quote($promocion, '/') . ')[ .,-]{0,3}(?:n[º°]\.?\s*)?0*'
            . preg_quote((string) (int) $numero, '/') . '(?![\p{L}\p{N}])/iu'] = '$1';
    }
    if ($numero !== '' && ctype_digit($numero)) {
        $pasos['/(?<![\p{L}\p{N}])(v|n[º°]\.?|n[uú]m\.?|n[uú]mero|casa|parcela|unidad)[ .-]{0,2}0*'
            . preg_quote((string) (int) $numero, '/') . '(?![\p{L}\p{N}])/iu'] = '$1';
    }
    foreach ($pasos as $patron => $por) {
        $texto = preg_replace($patron, $por, $texto) ?? $texto;
    }

    // Los nombres propios, del último al primero para no mover el sitio
    // de los que quedan por tapar.
    [$palabras, $tramos] = constancia_nombres_en($texto, constancia_nombres_propios($unidad));
    foreach (array_reverse($tramos) as [$primera, $ultima]) {
        $texto = substr($texto, 0, $palabras[$primera]['desde']) . $marca . substr($texto, $palabras[$ultima]['hasta']);
    }
    return $texto;
}

/**
 * La última red, justo antes de sellar. Lo que el modelo no ha querido
 * o no ha podido quitar —un párrafo con cifras, fechas, plazos,
 * compromisos o una aceptación de la vivienda, uno desmesurado, o uno
 * que nombra a una empresa de la obra, a un comprador o a alguien de la
 * casa— no se corrige: se retira. La zona sale con la fórmula general
 * y sus repasos pasan a «genéricos», con su nota interna. Así el papel
 * que se firma no depende de que el modelo obedezca.
 *
 * Devuelve [borrador, texto] ya cambiados, o null si no hay nada que retirar.
 */
function constancia_no_aceptar(array $borrador, array $texto, string $unidad = ''): ?array
{
    $propios = constancia_nombres_propios($unidad);
    $genericos = constancia_lista($borrador['genericos'] ?? []);
    $retirados = constancia_lista($borrador['retirados'] ?? []);
    $cambia = false;
    $zonas = [];
    foreach ((array) ($texto['zonas'] ?? []) as $z) {
        if (!is_array($z)) {
            continue;
        }
        $parrafo = (string) ($z['texto'] ?? '');
        $fuera = $parrafo !== CONSTANCIA_GENERICO && (
            constancia_es_delicado($parrafo)
            || constancia_es_desmesurado($parrafo)
            || constancia_nombres_en($parrafo, $propios, true)[1] !== []
        );
        if ($fuera) {
            $z['texto'] = CONSTANCIA_GENERICO;
            $z['resto'] = false;
            foreach (constancia_lista($z['repasos'] ?? []) as $id) {
                if (!in_array($id, $genericos, true)) {
                    $genericos[] = $id;
                }
            }
            $zona = (string) ($z['zona'] ?? '');
            if ($zona !== '' && !in_array($zona, $retirados, true)) {
                $retirados[] = $zona;
            }
            $cambia = true;
        }
        $zonas[] = $z;
    }
    if (!$cambia) {
        return null;
    }
    $todo = '';
    foreach ($zonas as $z) {
        $todo .= $z['texto'] . "\n";
    }
    $borrador['genericos'] = $genericos;
    $borrador['retirados'] = $retirados;
    // Lo que había que corregir en las zonas retiradas se vuelve a
    // sacar de su redacción guardada si llega una segunda pasada
    // (ajustar_constancia): aquí ya no queda nada delicado en el papel.
    $borrador['delicados'] = [];
    $borrador['nombres'] = constancia_buscar_nombres($todo, $unidad);
    return [$borrador, ['zonas' => $zonas]];
}

/* ═══ Lo que el párrafo dice, y lo que se calla ═══════════════════ */

/** ¿Es una palabra de relleno? (ver CONSTANCIA_RELLENO_RAICES) */
function constancia_es_relleno(string $llana): bool
{
    $singular = (string) preg_replace('/(?:es|s)$/', '', $llana);
    if (in_array($llana, CONSTANCIA_RELLENO_PALABRAS, true) || in_array($singular, CONSTANCIA_RELLENO_PALABRAS, true)
        || in_array($llana . 's', CONSTANCIA_RELLENO_PALABRAS, true)) {
        return true;
    }
    foreach (CONSTANCIA_RELLENO_RAICES as $raiz) {
        if (strncmp($llana, $raiz, strlen($raiz)) === 0) {
            return true;
        }
    }
    return false;
}

/** Los elementos que nombra un texto: sus palabras de cuatro letras o más que no son de relleno, en llano. */
function constancia_elementos(string $texto): array
{
    $elementos = [];
    foreach (constancia_palabras($texto) as $p) {
        if (strlen($p['llana']) >= 4 && !ctype_digit($p['llana']) && !constancia_es_relleno($p['llana'])) {
            $elementos[$p['llana']] = true;
        }
    }
    return array_keys($elementos);
}

/**
 * ¿Son la misma palabra, salvando el número y la familia? («armario» y
 * «armarios», «luminaria» e «iluminación», «sellar» y «sellados»; pero
 * no «tapa» y «tapajuntas», ni «lavabo» y «lavadero»).
 */
function constancia_misma_palabra(string $a, string $b): bool
{
    if ($a === $b) {
        return true;
    }
    $la = strlen($a);
    $lb = strlen($b);
    $comun = 0;
    while ($comun < $la && $comun < $lb && $a[$comun] === $b[$comun]) {
        $comun++;
    }
    if ($comun >= 4 && abs($la - $lb) <= 2 && $comun >= min($la, $lb) - 1) {
        return true;
    }
    // Un trozo de cinco letras en común.
    for ($i = 0; $i + 5 <= $la; $i++) {
        if (strpos($b, substr($a, $i, 5)) !== false) {
            return true;
        }
    }
    return false;
}

/**
 * ¿Se lee esta actuación en el párrafo de su zona? Lo que se imprime
 * es el párrafo, no la lista de actuaciones: si el modelo apunta
 * «colocación de la tapa de registro y de la luminaria» y luego el
 * párrafo no habla ni de tapa, ni de registro, ni de luminaria, esos
 * repasos no están en el papel aunque estén en la lista.
 *
 * Se mira a lo seguro, para no dar falsas alarmas. Solo las
 * actuaciones concretas —las que empiezan por colocar, instalar,
 * sustituir, completar o ajustar algo—: un repaso general puede
 * resumirse con otras palabras. Basta con que UNO de sus elementos esté
 * en el párrafo. Y la que no nombra ningún elemento se da por leída. No
 * corrige la prosa ni mide si el párrafo es fiel: solo caza la
 * actuación concreta que se ha caído entera.
 */
function constancia_se_lee(string $actuacion, array $palabrasDelParrafo): bool
{
    $primera = constancia_palabras($actuacion)[0]['llana'] ?? '';
    $concreta = false;
    foreach (CONSTANCIA_ACCIONES_CONCRETAS as $raiz) {
        if (strncmp($primera, $raiz, strlen($raiz)) === 0) {
            $concreta = true;
            break;
        }
    }
    $elementos = $concreta ? constancia_elementos($actuacion) : [];
    if ($elementos === []) {
        return true;
    }
    foreach ($elementos as $elemento) {
        foreach ($palabrasDelParrafo as $palabra) {
            if (constancia_misma_palabra($elemento, $palabra)) {
                return true;
            }
        }
    }
    return false;
}

/** Las palabras de cuatro letras o más de un párrafo, en llano: contra ellas se busca cada actuación. */
function constancia_palabras_largas(string $parrafo): array
{
    $largas = [];
    foreach (constancia_palabras($parrafo) as $p) {
        if (strlen($p['llana']) >= 4 && !ctype_digit($p['llana'])) {
            $largas[$p['llana']] = true;
        }
    }
    return array_keys($largas);
}

/**
 * La forma del párrafo de una zona, sin tocarle la prosa: fuera el
 * título de la zona si el modelo lo ha puesto delante (el título lo
 * pone el servidor, y saldría dos veces), la primera letra en mayúscula
 * y un punto al final, no una coma ni un punto y coma.
 */
function constancia_forma(string $parrafo, array $titulos): string
{
    $parrafo = trim($parrafo);
    if (preg_match('/^([^.:]{1,40})[.:]\s+(?=\S)/u', $parrafo, $m) === 1) {
        $cabeza = llano($m[1]);
        foreach ($titulos as $titulo) {
            if ($cabeza !== '' && $cabeza === llano((string) $titulo)) {
                $parrafo = ltrim(substr($parrafo, strlen($m[0])));
                break;
            }
        }
    }
    if ($parrafo === '') {
        return '';
    }
    $parrafo = mb_strtoupper(mb_substr($parrafo, 0, 1)) . mb_substr($parrafo, 1);
    $parrafo = (string) preg_replace('/[\s,;:]+$/u', '', $parrafo);
    if ($parrafo !== '' && !in_array(mb_substr($parrafo, -1), ['.', '…', '!', '?'], true)) {
        $parrafo .= '.';
    }
    return $parrafo;
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
        $delParrafo = constancia_palabras_largas($e['texto']);
        foreach ($e['actuaciones'] as $a) {
            // Una actuación sin texto no describe ningún trabajo, y una
            // que el párrafo se calla no llega al papel (lo que se
            // imprime es el párrafo, no esta lista): sus repasos no
            // cuentan como citados y siguen el camino de los descolgados
            // (coletilla, genéricos, nota y segunda pasada).
            if ($a['texto'] === '' || !constancia_se_lee($a['texto'], $delParrafo)) {
                continue;
            }
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
        $sueltos = $resto[$zona] ?? [];
        $ligados = $enOrden(array_merge($citados[$zona] ?? [], $sueltos));
        // Sin repasos que lo respalden no hay apartado: un párrafo que
        // no se puede seguir hasta ningún repaso no va a un papel que
        // se firma. Queda en el borrador, para quien quiera mirarlo.
        if ($ligados === []) {
            continue;
        }
        $estancias = [];
        foreach ($ligados as $id) {
            $estancias[] = $material['repasos'][$ordenDe[$id]]['estancia'];
        }
        $titulo = constancia_titulo($zona, $estancias);
        // La prosa del modelo no se toca; su forma, sí: sin el título
        // repetido delante, con mayúscula y con su punto. En el
        // borrador queda tal como la escribió.
        $delModelo = constancia_forma(
            $escrito[$zona]['texto'] ?? '',
            [$titulo, (CONSTANCIA_TITULOS[$zona] ?? CONSTANCIA_TITULOS['otros'])[0]]
        );
        if ($delModelo === '') {
            $texto = CONSTANCIA_GENERICO;
        } elseif ($sueltos !== []) {
            $texto = $delModelo . CONSTANCIA_COLETILLA;
        } else {
            $texto = $delModelo;
        }
        $zonasTexto[] = [
            'zona' => $zona,
            'titulo' => $titulo,
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

    // (3) Nombres propios, sobre el texto que de verdad va al papel; y
    // las zonas cuyo párrafo trae algo que no puede ir en él (cifras,
    // fechas, plazos, compromisos, un largo desmesurado): se piden
    // corregir en la segunda pasada y, si siguen ahí, se retiran al
    // sellar (constancia_no_aceptar).
    $unidad = (string) ($material['unidad'] ?? '');
    $todo = '';
    $delicados = [];
    foreach ($zonasTexto as $z) {
        $todo .= $z['texto'] . "\n";
        if ($z['texto'] !== CONSTANCIA_GENERICO
            && (constancia_es_delicado($z['texto']) || constancia_es_desmesurado($z['texto']))) {
            $delicados[] = $z['zona'];
        }
    }

    return [
        'borrador' => [
            'zonas' => $zonasBorrador,
            'dudas' => $dudas,
            'genericos' => $genericos,
            'nombres' => constancia_buscar_nombres($todo, $unidad),
            'delicados' => $delicados,
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

    $conDuda = [];
    foreach ((array) ($borrador['dudas'] ?? []) as $d) {
        $texto = is_array($d) ? trim((string) ($d['texto'] ?? '')) : '';
        if ($texto !== '') {
            $notas[] = [
                'tipo' => 'duda',
                'texto' => $texto,
                'repasos' => constancia_fichas(constancia_lista($d['repasos'] ?? []), $material, $unidad),
            ];
            foreach (constancia_lista($d['repasos'] ?? []) as $id) {
                $conDuda[$id] = true;
            }
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

    $retirados = count(constancia_lista($borrador['retirados'] ?? []));
    if ($retirados > 0) {
        $notas[] = [
            'tipo' => 'sensible',
            'texto' => ($retirados === 1 ? 'El párrafo de una zona traía' : "Los párrafos de {$retirados} zonas traían")
                . ' cifras, fechas, plazos, compromisos o el nombre de una persona o de una empresa, y en el documento se ha'
                . ($retirados === 1 ? '' : 'n') . ' cambiado por la fórmula general: conviene leerlo.',
            'repasos' => [],
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

    // Los puntos delicados, una nota por motivo y no una por repaso: lo
    // que se repite no se lee. El repaso que ya tiene su duda no vuelve
    // a salir aquí: la duda ya manda leerlo, y lo explica mejor.
    $porMotivo = [];
    foreach ($material['repasos'] as $r) {
        if (isset($conDuda[$r['id']])) {
            continue;
        }
        $textos = $r['texto'];
        foreach ($r['comentarios'] as $c) {
            $textos .= "\n" . $c['texto'];
        }
        if (preg_match(CONSTANCIA_SENSIBLE, $textos) !== 1) {
            continue;
        }
        if (preg_match('/fisur|griet/iu', $textos) === 1) {
            $motivo = 'de fisuras o grietas';
        } elseif (preg_match('/humedad|filtraci|gotera|moho/iu', $textos) === 1) {
            $motivo = 'de humedades o filtraciones';
        } else {
            $motivo = '';
        }
        $porMotivo[$motivo][] = $r['id'];
    }
    foreach ($porMotivo as $motivo => $ids) {
        $fichas = constancia_fichas($ids, $material, $unidad);
        $uno = count($fichas) === 1;
        $notas[] = [
            'tipo' => 'sensible',
            'texto' => ($motivo === ''
                    ? ($uno ? 'Lleva un interrogante' : 'Llevan un interrogante')
                    : ($uno ? 'Habla ' : 'Hablan ') . $motivo)
                . ($uno ? ': conviene leer cómo ha quedado redactado.' : ': conviene leer cómo han quedado redactados.'),
            'repasos' => $fichas,
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
    $delicados = count(constancia_lista($borrador['delicados'] ?? []));
    $ajustado = (int) $fila['ajustado'] === 1;
    $descargado = (string) ($fila['descargado_en'] ?? '');

    return [
        'id' => (string) $fila['id'],
        'unidadId' => (string) $fila['unidad_id'],
        'huella' => (string) $fila['huella'],
        'registro' => (string) $fila['registro'],
        'texto' => ['zonas' => $zonas],
        'ajustado' => $ajustado,
        'pideAjuste' => !$ajustado && ($genericos > 0 || $nombres > 0 || $delicados > 0),
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
        'alDia' => $fila !== null && constancia_al_dia($fila, $material),
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

/* ─── Metadatos de las fotos ─────────────────────────────────────────
   Una foto puede llevar por dentro la fecha y la hora de la toma, la
   posición GPS, el modelo del móvil y hasta un comentario. La app casi
   siempre los pierde al recomprimir, pero cuando la foto ya es pequeña
   sube la original tal cual. Al modelo no viajan fechas ni nada que
   diga qué vivienda es, así que antes de mandar una foto se le quita
   todo lo que no sea imagen.

   Se hace recorriendo el fichero trozo a trozo y copiando solo los que
   pintan —sin recomprimir: los píxeles no cambian— y sin depender de
   ninguna extensión de PHP. Es una lista de lo que se deja, no de lo
   que se quita: lo desconocido no pasa. Y si el fichero no se deja
   recorrer de principio a fin, no se manda. */

/** Un JPEG sin metadatos: fuera APP1…APP15 y COM, y lo que cuelgue detrás del final. */
function constancia_jpeg_sin_metadatos(string $b): ?string
{
    $n = strlen($b);
    if ($n < 4 || $b[0] !== "\xFF" || $b[1] !== "\xD8") {
        return null;
    }
    $limpio = "\xFF\xD8";
    $i = 2;
    while ($i < $n) {
        if ($b[$i] !== "\xFF") {
            return null;
        }
        while ($i < $n && $b[$i] === "\xFF") {
            $i++;   // un marcador puede venir con relleno delante
        }
        if ($i >= $n) {
            return null;
        }
        $marca = ord($b[$i]);
        $i++;
        if ($marca === 0xD9) {
            // Fin de la imagen. Lo que haya detrás (vídeos pegados,
            // colas del fabricante) no es imagen y no viaja.
            return $limpio . "\xFF\xD9";
        }
        $conocida = ($marca >= 0xC0 && $marca <= 0xCF) || ($marca >= 0xDA && $marca <= 0xEF) || $marca === 0xFE;
        if (!$conocida || $i + 2 > $n) {
            return null;
        }
        $largo = (ord($b[$i]) << 8) | ord($b[$i + 1]);
        if ($largo < 2 || $i + $largo > $n) {
            return null;
        }
        $trozo = substr($b, $i, $largo);
        $i += $largo;

        if ($marca === 0xE0) {
            // APP0: solo la cabecera JFIF de toda la vida.
            $dejar = strncmp(substr($trozo, 2), "JFIF\0", 5) === 0 || strncmp(substr($trozo, 2), "JFXX\0", 5) === 0;
        } elseif ($marca === 0xEE) {
            // APP14 de Adobe: doce bytes que dicen cómo van los colores.
            // Sin ellos la foto se vería con los colores cambiados.
            $dejar = $largo === 14 && strncmp(substr($trozo, 2), 'Adobe', 5) === 0;
        } else {
            // APP1…APP15 (EXIF, XMP, IPTC, perfiles, miniaturas) y COM, fuera.
            $dejar = !(($marca >= 0xE1 && $marca <= 0xEF) || $marca === 0xFE);
        }
        if ($dejar) {
            $limpio .= "\xFF" . chr($marca) . $trozo;
        }

        if ($marca === 0xDA) {
            // Detrás del inicio de un barrido van los datos de la imagen,
            // hasta el siguiente marcador de verdad (FF00 y los de
            // reinicio son parte de los datos).
            $desde = $i;
            while (true) {
                $p = strpos($b, "\xFF", $i);
                if ($p === false || $p + 1 >= $n) {
                    return null;   // se acaba sin marca de fin: está cortado
                }
                $sigue = ord($b[$p + 1]);
                if ($sigue === 0x00 || ($sigue >= 0xD0 && $sigue <= 0xD7)) {
                    $i = $p + 2;
                } elseif ($sigue === 0xFF) {
                    $i = $p + 1;
                } else {
                    $i = $p;
                    break;
                }
            }
            $limpio .= substr($b, $desde, $i - $desde);
        }
    }
    return null;
}

/** Un PNG sin metadatos: solo los trozos que pintan (ni textos, ni fecha, ni EXIF, ni perfiles). */
function constancia_png_sin_metadatos(string $b): ?string
{
    $dejar = ['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'bKGD', 'pHYs', 'acTL', 'fcTL', 'fdAT'];
    $n = strlen($b);
    $limpio = substr($b, 0, 8);
    $i = 8;
    $primero = true;
    while ($i + 12 <= $n) {
        $largo = (ord($b[$i]) << 24) | (ord($b[$i + 1]) << 16) | (ord($b[$i + 2]) << 8) | ord($b[$i + 3]);
        $tipo = substr($b, $i + 4, 4);
        if ($largo > $n - $i - 12 || preg_match('/^[A-Za-z]{4}$/', $tipo) !== 1 || ($primero && $tipo !== 'IHDR')) {
            return null;
        }
        $primero = false;
        if (in_array($tipo, $dejar, true)) {
            $limpio .= substr($b, $i, 12 + $largo);
        } elseif (ctype_upper($tipo[0])) {
            return null;   // un trozo imprescindible que no se conoce: no se sabe limpiar
        }
        $i += 12 + $largo;
        if ($tipo === 'IEND') {
            return $limpio;
        }
    }
    return null;
}

/** Dónde acaba una ristra de subbloques de un GIF (cada uno dice cuánto mide; el de cero cierra). */
function constancia_gif_fin_de_subbloques(string $b, int $i): ?int
{
    $n = strlen($b);
    while ($i < $n) {
        $largo = ord($b[$i]);
        $i += 1 + $largo;
        if ($largo === 0) {
            return $i;
        }
    }
    return null;
}

/** Un GIF sin metadatos: fuera los comentarios, el texto y las extensiones de aplicación que no sean el bucle. */
function constancia_gif_sin_metadatos(string $b): ?string
{
    $n = strlen($b);
    if ($n < 13) {
        return null;
    }
    $i = 13 + ((ord($b[10]) & 0x80) ? 3 * (1 << ((ord($b[10]) & 0x07) + 1)) : 0);
    if ($i > $n) {
        return null;
    }
    $limpio = substr($b, 0, $i);
    while ($i < $n) {
        $clase = ord($b[$i]);
        $desde = $i;
        if ($clase === 0x3B) {
            return $limpio . ';';
        }
        if ($clase === 0x2C) {
            // Una imagen: su cabecera, su paleta si la trae y sus datos.
            if ($i + 10 > $n) {
                return null;
            }
            $paleta = (ord($b[$i + 9]) & 0x80) ? 3 * (1 << ((ord($b[$i + 9]) & 0x07) + 1)) : 0;
            $fin = constancia_gif_fin_de_subbloques($b, $i + 10 + $paleta + 1);
            $dejar = true;
        } elseif ($clase === 0x21 && $i + 2 <= $n) {
            $etiqueta = ord($b[$i + 1]);
            $fin = constancia_gif_fin_de_subbloques($b, $i + 2);
            // Se quedan el control de cada fotograma y el aviso de
            // bucle; el comentario, el texto y lo demás (XMP), fuera.
            $dejar = $etiqueta === 0xF9
                || ($etiqueta === 0xFF && in_array(substr($b, $i + 2, 12), ["\x0BNETSCAPE2.0", "\x0BANIMEXTS1.0"], true));
        } else {
            return null;
        }
        if ($fin === null || $fin > $n) {
            return null;
        }
        if ($dejar) {
            $limpio .= substr($b, $desde, $fin - $desde);
        }
        $i = $fin;
    }
    return null;
}

/** Un WebP sin metadatos: fuera EXIF, XMP y perfil de color, y la cabecera deja de anunciarlos. */
function constancia_webp_sin_metadatos(string $b): ?string
{
    $dejar = ['VP8X', 'VP8 ', 'VP8L', 'ALPH', 'ANIM', 'ANMF'];
    $n = strlen($b);
    if ($n < 20) {
        return null;
    }
    $leer = static fn (int $en): int => ord($b[$en]) | (ord($b[$en + 1]) << 8) | (ord($b[$en + 2]) << 16) | (ord($b[$en + 3]) << 24);
    $fin = 8 + $leer(4);
    if ($fin > $n) {
        return null;
    }
    $trozos = '';
    $i = 12;
    while ($i + 8 <= $fin) {
        $tipo = substr($b, $i, 4);
        $largo = $leer($i + 4);
        if ($largo > $fin - $i - 8) {
            return null;
        }
        if (in_array($tipo, $dejar, true)) {
            $trozo = substr($b, $i, 8 + $largo) . (($largo & 1) ? "\0" : '');
            if ($tipo === 'VP8X') {
                if ($largo < 10) {
                    return null;
                }
                // Las banderas de «llevo perfil», «llevo EXIF» y «llevo XMP».
                $trozo[8] = chr(ord($trozo[8]) & 0xD3);
            }
            $trozos .= $trozo;
        }
        $i += 8 + $largo + ($largo & 1);
    }
    if ($trozos === '') {
        return null;
    }
    $total = 4 + strlen($trozos);
    return 'RIFF' . chr($total & 0xFF) . chr(($total >> 8) & 0xFF) . chr(($total >> 16) & 0xFF) . chr(($total >> 24) & 0xFF)
        . 'WEBP' . $trozos;
}

/**
 * La foto sin nada que no sea imagen, o null si no se ha podido limpiar
 * con garantías: el fichero no se deja recorrer, o lo que queda ya no
 * es la misma imagen (mismo tipo y mismas medidas). Lo que no se puede
 * limpiar no se manda.
 */
function constancia_sin_metadatos(string $bytes, string $mime): ?string
{
    switch ($mime) {
        case 'image/jpeg':
            $limpio = constancia_jpeg_sin_metadatos($bytes);
            break;
        case 'image/png':
            $limpio = constancia_png_sin_metadatos($bytes);
            break;
        case 'image/gif':
            $limpio = constancia_gif_sin_metadatos($bytes);
            break;
        case 'image/webp':
            $limpio = constancia_webp_sin_metadatos($bytes);
            break;
        default:
            $limpio = null;
    }
    if ($limpio === null || $limpio === '' || constancia_tipo_de_imagen($limpio) !== $mime) {
        return null;
    }
    $antes = @getimagesizefromstring($bytes);
    $despues = @getimagesizefromstring($limpio);
    if (!is_array($antes) || !is_array($despues) || (int) $antes[0] < 1 || (int) $antes[1] < 1
        || array_slice($antes, 0, 3) !== array_slice($despues, 0, 3)) {
        return null;
    }
    return $limpio;
}

/**
 * Lee una foto del disco para mandarla a mirar. La ruta es la que
 * guarda la base, nunca algo de la petición, y aun así se comprueba que
 * no se sale de la carpeta de medios. Devuelve null —y la foto se da
 * por saltada— si el fichero falta, está vacío, pesa demasiado, por
 * dentro no es JPEG, PNG, GIF ni WebP (diga lo que diga su extensión) o
 * no se deja limpiar de metadatos. Lo que devuelve va ya limpio: sin
 * fecha de la toma, sin posición, sin modelo de móvil.
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
    $limpia = constancia_sin_metadatos($bytes, $mime);
    if ($limpia === null) {
        return null;
    }
    return ['mime' => $mime, 'b64' => base64_encode($limpia)];
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

    $medios = constancia_cuerpo()['medios'] ?? null;
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
            'anotacion' => constancia_tapar(claude_en_una_linea($repaso['texto'] ?? ''), $unidad),
            'estancia' => constancia_tapar(claude_en_una_linea($repaso['estancia'] ?? ''), $unidad),
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
        // apunta ninguna de estas: se volverán a pedir. Con una
        // excepción: si el modelo DECLINA mirarlas, volvería a declinar
        // cada vez, y quien descarga tropezaría en cada documento nuevo
        // de la vivienda. Ese lote se da por saltado antes de contestar
        // el error: la siguiente vez ya no se pide.
        $vistas = claude_mirar_fotos($fotos, static function () use ($lote): void {
            foreach ($lote as $f) {
                constancia_guardar_mirada($f['medio'], $f['repaso'], '', false, true, '');
            }
        });
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
    $cuerpo = constancia_cuerpo();
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
    if (!$forzar && $actual !== null && constancia_al_dia($actual, $material)) {
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
 * Lo que hay que pedirle a la segunda pasada, sacado del borrador
 * guardado: qué repasos faltan por citar, qué actuaciones de la lista
 * no se leen en su párrafo, qué párrafos traen algo que no puede ir al
 * papel —con la palabra que ha hecho saltar la red, para que la
 * corrección acierte— y cuáles son desmesurados.
 *
 * Las zonas que la red final ya retiró al sellar (`retirados`) cuentan
 * como las delicadas: sus repasos están en «genéricos», pero no faltan
 * por citar —el modelo los citó—; lo que sobra es lo que traía su
 * párrafo, y eso se saca de la redacción guardada.
 */
function constancia_observaciones(array $borrador, array $material, int $sobran): array
{
    $unidad = (string) ($material['unidad'] ?? '');
    $retirados = constancia_lista($borrador['retirados'] ?? []);
    $porRevisar = array_values(array_unique(array_merge(constancia_lista($borrador['delicados'] ?? []), $retirados)));
    $nombres = constancia_lista($borrador['nombres'] ?? []);

    $delicados = [];
    $largos = [];
    $calladas = [];
    $yaDichos = [];   // repasos que no «faltan por citar»: su pega va en otra línea
    foreach ((array) ($borrador['zonas'] ?? []) as $z) {
        if (!is_array($z)) {
            continue;
        }
        $zona = (string) ($z['zona'] ?? '');
        $parrafo = (string) ($z['texto'] ?? '');
        if ($zona === '' || $parrafo === '') {
            continue;
        }
        $delParrafo = constancia_palabras_largas($parrafo);
        $suyas = [];
        foreach ((array) ($z['actuaciones'] ?? []) as $a) {
            $actuacion = is_array($a) ? (string) ($a['texto'] ?? '') : '';
            if ($actuacion === '') {
                continue;
            }
            $ids = constancia_lista($a['repasos'] ?? []);
            if (!constancia_se_lee($actuacion, $delParrafo)) {
                $suyas[] = mb_substr($actuacion, 0, 200);
                $yaDichos = array_merge($yaDichos, $ids);
            } elseif (in_array($zona, $retirados, true)) {
                $yaDichos = array_merge($yaDichos, $ids);
            }
        }
        if ($suyas !== []) {
            $calladas[] = ['zona' => $zona, 'actuaciones' => $suyas];
        }
        if (in_array($zona, $porRevisar, true)) {
            $sobra = constancia_lo_delicado($parrafo);
            if ($sobra !== []) {
                $delicados[] = ['zona' => $zona, 'sobra' => $sobra];
            }
            if (constancia_es_desmesurado($parrafo)) {
                $largos[] = $zona;
            }
            if (in_array($zona, $retirados, true)) {
                // El nombre que la hizo retirar ya no está en el papel,
                // pero sigue en la redacción que se le va a enseñar.
                foreach (constancia_buscar_nombres($parrafo, $unidad) as $palabra) {
                    if (!in_array($palabra, $nombres, true)) {
                        $nombres[] = $palabra;
                    }
                }
            }
        }
    }

    $faltan = [];
    foreach (constancia_lista($borrador['genericos'] ?? []) as $id) {
        $r = constancia_repaso($material, $id);
        if ($r !== null && !in_array($id, $yaDichos, true)) {
            $faltan[] = $r['clave'];
        }
    }

    return [
        'faltan' => $faltan,
        'sobran' => $sobran,
        'nombres' => $nombres,
        'delicados' => $delicados,
        'largos' => $largos,
        'calladas' => $calladas,
    ];
}

/** Cuántos repasos quedarían en el papel solo con la fórmula general, pasada la red final. */
function constancia_genericos_en_el_papel(array $borrador, array $texto, string $unidad): int
{
    $firme = constancia_no_aceptar($borrador, $texto, $unidad);
    return count(constancia_lista(($firme === null ? $borrador : $firme[0])['genericos'] ?? []));
}

/**
 * La segunda pasada: una sola vez por fila, y solo sobre la actual con
 * la huella al día. Corrige lo que la primera dejó cojo —repasos sin
 * citar, actuaciones que el párrafo se calla, líneas de más, palabras
 * que parecen nombres o que no pueden ir al papel— y actualiza la
 * MISMA fila. Si el modelo falla, la fila se queda como estaba.
 */
function ajustar_constancia(string $unidad): void
{
    $yo = constancia_entrar($unidad);
    $cuerpo = constancia_cuerpo();
    $fila = constancia_fila($unidad, $cuerpo['id'] ?? null);
    $sobran = max(0, min(200, entero($cuerpo, 'sobran')));

    $material = constancia_material($unidad);
    $actual = constancia_actual($unidad);
    if ($actual === null || $actual['id'] !== $fila['id'] || !constancia_al_dia($fila, $material)) {
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
    $observaciones = constancia_observaciones($borrador, $material, $sobran);

    $pdo = bd();
    if ($observaciones['faltan'] === [] && $observaciones['nombres'] === [] && $observaciones['delicados'] === []
        && $observaciones['largos'] === [] && $observaciones['calladas'] === [] && $sobran === 0) {
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
        'observaciones' => $observaciones,
    ]);
    $hecho = constancia_repasar($ia, $material, $conFotos);

    $entrada = (int) $ia['gasto']['entrada'];
    $salida = (int) $ia['gasto']['salida'];
    // Mientras el modelo escribía, la fila ha podido sellarse (quien
    // descarga se cansó de esperar y bajó lo que había) o ajustarse por
    // otro lado. Lo que ya se ha descargado no se pisa: las dos
    // escrituras de aquí solo valen si la fila sigue como se leyó.
    $comoSeLeyo = ' WHERE id = ? AND ajustado = 0 AND descargas = ?';
    $descargas = (int) $fila['descargas'];
    // ¿Ha ido a peor? Se compara lo que saldría de verdad en el papel,
    // pasada la red final: una pasada que cita lo que faltaba pero mete
    // una cifra en otro párrafo acabaría con esa zona entera retirada.
    $antes = constancia_genericos_en_el_papel($borrador, constancia_leer_json($fila['texto']), $unidad);
    $ahora = constancia_genericos_en_el_papel($hecho['borrador'], $hecho['texto'], $unidad);
    if ($ahora > $antes) {
        // Se queda lo que había. Pero la pasada está dada y pagada, y
        // no se repite.
        $escrita = $pdo->prepare(
            'UPDATE constancias
                SET ajustado = 1, gasto_entrada = gasto_entrada + ?, gasto_salida = gasto_salida + ?, actualizado = ?'
            . $comoSeLeyo
        );
        $escrita->execute([$entrada, $salida, constancia_hora_de_cambio($fila), $fila['id'], $descargas]);
    } else {
        $escrita = $pdo->prepare(
            'UPDATE constancias
                SET borrador = ?, texto = ?, ajustado = 1, gasto_entrada = gasto_entrada + ?,
                    gasto_salida = gasto_salida + ?, modelo = ?, actualizado = ?'
            . $comoSeLeyo
        );
        $escrita->execute([
            (string) json_encode($hecho['borrador'], CONSTANCIA_JSON),
            (string) json_encode($hecho['texto'], CONSTANCIA_JSON),
            $entrada,
            $salida,
            mb_substr((string) $ia['gasto']['modelo'], 0, 60),
            constancia_hora_de_cambio($fila),
            $fila['id'],
            $descargas,
        ]);
    }
    if ($escrita->rowCount() === 0) {
        // La fila ya no estaba como se leyó: se apunta el gasto, que se
        // ha hecho, y se deja el texto que tiene.
        $pdo->prepare('UPDATE constancias SET gasto_entrada = gasto_entrada + ?, gasto_salida = gasto_salida + ? WHERE id = ?')
            ->execute([$entrada, $salida, $fila['id']]);
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
    $fila = constancia_fila($unidad, constancia_cuerpo()['id'] ?? null);
    $material = constancia_material($unidad);

    // Primero la descarga: desde aquí, una segunda pasada que siguiera
    // en marcha ya no puede cambiarle el texto a esta fila (ver
    // ajustar_constancia), y lo que pasa la red de abajo es lo mismo que
    // se contesta.
    $ahora = ahora_iso();
    $cambio = constancia_hora_de_cambio($fila);
    $nombre = mb_substr((string) $yo['nombre'], 0, 120);
    if (constancia_al_dia($fila, $material)) {
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

    // La última red: lo que no puede ir a un papel que se firma, fuera.
    // Se hace aquí porque el PDF se monta SIEMPRE con lo que contesta
    // esta ruta, haya habido segunda pasada o no.
    $fila = constancia_fila($unidad, $fila['id']);
    $firme = constancia_no_aceptar(
        constancia_leer_json($fila['borrador']),
        constancia_leer_json($fila['texto']),
        $unidad
    );
    if ($firme !== null) {
        bd()->prepare('UPDATE constancias SET borrador = ?, texto = ? WHERE id = ?')->execute([
            (string) json_encode($firme[0], CONSTANCIA_JSON),
            (string) json_encode($firme[1], CONSTANCIA_JSON),
            $fila['id'],
        ]);
        $fila = constancia_fila($unidad, $fila['id']);
    }

    responder(constancia_estado($unidad, $yo, $fila, $material));
}
