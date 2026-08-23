<?php
/**
 * esquema.php — la base de datos se pone al día sola.
 *
 * Antes, cada publicación que añadía un campo obligaba a abrir
 * actualizar.php en el navegador. Un paso manual fácil de olvidar, y
 * olvidarlo deja la app nueva hablando con una base de datos vieja: la
 * foto de perfil no sube, el rechazo no se guarda, y el fallo aparece
 * lejos de su causa.
 *
 * Ahora el backend compara la versión que trae el código con la que hay
 * guardada en la tabla `meta` y aplica lo que falte, una sola vez y con
 * cerrojo para que dos peticiones a la vez no lo hagan dos veces.
 *
 * Para añadir un campo nuevo: ponerlo en schema.sql, en schema-sqlite.sql
 * y en ESQUEMA_CAMPOS, y subir ESQUEMA_VERSION. Nada más.
 */
declare(strict_types=1);

/** Se sube al añadir campos o tablas. */
const ESQUEMA_VERSION = 10;

/**
 * Campos que tienen que existir, por tabla, con el tipo que usa MySQL.
 * Para SQLite se traducen al vuelo. Solo hacen falta aquí los que se han
 * añadido después de la primera instalación: los demás ya vienen en el
 * CREATE TABLE.
 */
const ESQUEMA_CAMPOS = [
    'usuarios' => [
        'empresa'  => "VARCHAR(120) NOT NULL DEFAULT ''",
        'verifica' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'avatar'   => "VARCHAR(24) NOT NULL DEFAULT ''",
    ],
    'tareas' => [
        'rechazada' => 'TINYINT(1) NOT NULL DEFAULT 0',
        // Las tareas de antes de que existiera el campo se quedan en
        // «general», que es justo lo que eran: un remate sin gremio.
        'oficio'    => "VARCHAR(30) NOT NULL DEFAULT 'general'",
        // Dónde está el remate dentro de la vivienda. Vacío en las
        // tareas de antes: nadie las va a reetiquetar a mano, y una
        // estancia inventada engaña más que un hueco.
        'zona'      => "VARCHAR(40) NOT NULL DEFAULT ''",
        // Para cuándo tiene que estar arreglado. Vacío = sin fecha:
        // el campo es opcional en el diseño y en la obra.
        'fecha_limite' => 'VARCHAR(32) DEFAULT NULL',
    ],
    'listas' => [
        // Vacío = se muestra el nombre de la vivienda. Solo se guarda
        // aquí cuando alguien lo cambia a mano.
        'nombre' => "VARCHAR(120) NOT NULL DEFAULT ''",
    ],
    'comentarios' => [
        'creado_por_empresa' => "VARCHAR(120) NOT NULL DEFAULT ''",
    ],
    'medios' => [
        'comentario_id' => 'CHAR(36) DEFAULT NULL',
    ],
];

/**
 * Deja la base de datos al día si no lo está. Se llama sola al abrir la
 * conexión, así que el resto del código no tiene que acordarse.
 */
function esquema_al_dia(PDO $pdo): void
{
    static $revisado = false;
    if ($revisado) {
        return;
    }
    $revisado = true;

    if (esquema_version($pdo) >= ESQUEMA_VERSION) {
        return;
    }

    // Solo un proceso migra; los demás esperan a que termine en lugar de
    // seguir adelante, que es lo que evita que una petición se encuentre
    // la tabla a medio cambiar.
    $cerrojo = @fopen(sys_get_temp_dir() . '/unik-repasos-esquema.lock', 'c');
    if ($cerrojo === false) {
        esquema_aplicar_o_anotar($pdo);
        return;
    }
    @flock($cerrojo, LOCK_EX);
    try {
        // Segunda comprobación: si el que tenía el cerrojo ya lo hizo,
        // aquí no queda nada por hacer.
        if (esquema_version($pdo) < ESQUEMA_VERSION) {
            esquema_aplicar_o_anotar($pdo);
        }
    } finally {
        @flock($cerrojo, LOCK_UN);
        fclose($cerrojo);
    }
}

/**
 * Aplica los cambios. Si algo falla, lo anota en el log del servidor y
 * NO sube el número de versión: así el siguiente arranque lo reintenta
 * en lugar de dar por buena una migración a medias.
 */
function esquema_aplicar_o_anotar(PDO $pdo): void
{
    try {
        esquema_aplicar($pdo);
        esquema_guardar_version($pdo, ESQUEMA_VERSION);
    } catch (Throwable $e) {
        error_log('UNIK repasos · no se pudo actualizar el esquema: ' . $e->getMessage());
    }
}

/** Versión guardada. 0 si la instalación es anterior a este mecanismo. */
function esquema_version(PDO $pdo): int
{
    try {
        $valor = $pdo->query("SELECT valor FROM meta WHERE clave = 'esquema'")->fetchColumn();
        return $valor === false ? 0 : (int) $valor;
    } catch (Throwable $e) {
        return 0;
    }
}

/**
 * Crea lo que falte y añade los campos que falten. Devuelve la lista de
 * cambios hechos, para que actualizar.php pueda enseñarlos.
 */
function esquema_aplicar(PDO $pdo): array
{
    $hechos = [];

    // La tabla de control primero: sin ella no hay dónde anotar nada.
    $pdo->exec(motor() === 'sqlite'
        ? 'CREATE TABLE IF NOT EXISTS meta (clave TEXT NOT NULL PRIMARY KEY, valor TEXT NOT NULL)'
        : 'CREATE TABLE IF NOT EXISTS meta (clave VARCHAR(60) NOT NULL, valor VARCHAR(255) NOT NULL,
             PRIMARY KEY (clave)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    // Tablas que falten. Todas las sentencias del esquema son
    // «CREATE TABLE IF NOT EXISTS», así que pasarlas de nuevo no toca
    // ni un dato de las que ya están.
    $sql = @file_get_contents(fichero_esquema());
    if ($sql === false) {
        throw new RuntimeException('No se encuentra el fichero de esquema.');
    }
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $sentencia) {
        if (stripos($sentencia, 'CREATE ') === false) {
            continue;
        }
        $pdo->exec($sentencia);
    }

    // Campos que falten en tablas que ya existían.
    foreach (ESQUEMA_CAMPOS as $tabla => $campos) {
        $existentes = esquema_columnas($pdo, $tabla);
        if (!$existentes) {
            continue;   // la tabla no existe todavía; el CREATE ya la trae completa
        }
        foreach ($campos as $nombre => $tipo) {
            if (in_array($nombre, $existentes, true)) {
                continue;
            }
            $pdo->exec("ALTER TABLE {$tabla} ADD COLUMN {$nombre} " . esquema_tipo($tipo));
            $hechos[] = "{$tabla}.{$nombre}";
        }
    }

    $hechos = array_merge($hechos, esquema_arreglar_datos($pdo));

    return $hechos;
}

/**
 * Arreglos de datos, no de estructura.
 *
 * Añadir una columna es inofensivo; esto toca filas que ya existen, así
 * que cada arreglo tiene que poder pasar dos veces sin estropear nada
 * —si la migración se queda a medias, el siguiente arranque la repite— y
 * tiene que dejar dicho por qué se hizo.
 */
function esquema_arreglar_datos(PDO $pdo): array
{
    $hechos = [];

    // La lista de estancias de la obra vive en meta con la clave «zonas»,
    // en JSON, y no cabe en un VARCHAR(255): en MySQL se ensancha la
    // columna a TEXT. En SQLite ya es TEXT de nacimiento. Repetirlo no
    // estropea nada, que es la regla de esta función.
    if (motor() !== 'sqlite') {
        $pdo->exec('ALTER TABLE meta MODIFY valor TEXT NOT NULL');
        $hechos[] = 'meta.valor pasa a TEXT';
    }

    // Antes, rechazar una tarea la devolvía a «pendiente» con una bandera
    // encima. Ahora «rechazada» es un estado, y sin esto las tareas que
    // ya habían rebotado se quedarían contadas como pendientes: no
    // saldrían en el contador de rechazadas ni en su filtro, que es justo
    // para lo que se hizo el estado.
    if (in_array('rechazada', esquema_columnas($pdo, 'tareas'), true)) {
        $sent = $pdo->prepare(
            "UPDATE tareas SET estado = 'rechazada' WHERE estado = 'pendiente' AND rechazada = 1"
        );
        $sent->execute();
        $cuantas = $sent->rowCount();
        if ($cuantas > 0) {
            $hechos[] = "tareas: {$cuantas} rechazadas rescatadas de pendiente";
        }
    }

    return $hechos;
}

/** SQLite no entiende TINYINT ni longitudes de VARCHAR: se traducen. */
function esquema_tipo(string $tipo): string
{
    if (motor() !== 'sqlite') {
        return $tipo;
    }
    $tipo = str_replace(['TINYINT(1)', 'CHAR(36)'], ['INTEGER', 'TEXT'], $tipo);
    return preg_replace('/VARCHAR\(\d+\)/', 'TEXT', $tipo) ?? $tipo;
}

/** Nombres de columna de una tabla; array vacío si la tabla no existe. */
function esquema_columnas(PDO $pdo, string $tabla): array
{
    // El nombre viene siempre de una constante del código, nunca de la
    // petición, pero se filtra igual: interpolar en SQL sin mirar es una
    // costumbre que acaba mordiendo en el sitio donde no se miró.
    if (!preg_match('/^[a-z_]+$/', $tabla)) {
        return [];
    }
    try {
        if (motor() === 'sqlite') {
            return array_column($pdo->query("PRAGMA table_info({$tabla})")->fetchAll(), 'name');
        }
        return array_column($pdo->query("SHOW COLUMNS FROM {$tabla}")->fetchAll(), 'Field');
    } catch (Throwable $e) {
        return [];
    }
}

function esquema_guardar_version(PDO $pdo, int $version): void
{
    // Borrar e insertar en vez de un UPSERT: la sintaxis del UPSERT no es
    // la misma en MySQL que en SQLite, y aquí no compensa distinguir.
    $pdo->prepare("DELETE FROM meta WHERE clave = 'esquema'")->execute();
    $pdo->prepare("INSERT INTO meta (clave, valor) VALUES ('esquema', ?)")
        ->execute([(string) $version]);
}
