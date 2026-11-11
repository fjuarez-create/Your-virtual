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

/** Se sube al añadir campos o tablas.
    La 14 no añade nada sobre la 13: repite sus CREATE. En el estreno
    de la 13, un móvil sincronizó en mitad del despliegue —esquema.php
    ya nuevo, schema.sql todavía viejo— y la migración selló la 13 sin
    la tabla de adjuntos. Los CREATE son IF NOT EXISTS: repasarlos no
    toca un dato.
    La 15 añade la prioridad de los repasos (alta o media).
    La 16 trae las entregas: la tabla `entregas`, la bandera `comercial`
    de los usuarios y la tabla de suscripciones a los avisos push.
    La 17 trae el reconocimiento de repasos pendientes de una vivienda
    (por dentro, constancia): la tabla `constancias` (una fila por
    redacción) y la tabla `miradas` (lo que la IA vio en cada foto,
    para pagarlo una sola vez).
    La 18 añade a la ficha de entrega el hecho «entregada»: que la
    vivienda se ha entregado lo dicen el comercial o el administrador,
    no la fecha de la firma (lo pidió Fran el 10-11-2026).
    La 19 añade la hora de la firma: la cita en la notaría tiene hora,
    como la revisión con el cliente (lo pidió el comercial ese día).
    La 20 trae el historial de visitas: la ficha de entrega guarda
    TODAS las revisiones hechas con el cliente y no solo la última
    (`visitas_hechas`, con su sello), y la fecha que tenía una cita
    cuando al darla por hecha se movió a hoy (`revisada_de` y su hora),
    para que deshacer la deje como estaba. Las fichas que venían con
    una visita hecha y una cita nueva encima se ponen al día aparte,
    una sola vez: entregas_visitas_al_dia() en entregas.php.
    La 21 trae la recepción: la columna `recibido`, con su índice, en
    las siete tablas que bajan a los móviles. Es el número de orden con
    el que cada fila LLEGÓ al servidor, y por él se guía la bajada de
    cambios en vez de por `actualizado`, que lo pone el reloj de cada
    móvil: lo apuntado sin cobertura y subido más tarde no les bajaba
    nunca a quienes ya habían sincronizado algo más nuevo (ver «La
    bajada por recepción» en index.php y esquema_recepcion(), aquí). */
const ESQUEMA_VERSION = 21;

/**
 * Tablas que tienen que existir para dar la versión por puesta. Si
 * falta alguna es que el CREATE no estaba en el schema.sql que había en
 * el disco en ese momento —un móvil sincronizando en mitad del
 * despliegue, con esquema.php ya nuevo y schema.sql todavía viejo— y
 * sellar la versión dejaría la base coja para siempre (pasó con la 13).
 * Sin sellar, la siguiente petición lo vuelve a intentar.
 */
const ESQUEMA_TABLAS = ['entregas', 'suscripciones_push', 'constancias', 'miradas'];

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
        // Quien pone las fechas de entrega de cada vivienda: el
        // comercial (Ezequiel). El administrador puede siempre.
        'comercial' => 'TINYINT(1) NOT NULL DEFAULT 0',
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
        // Alta o media; lo decidió Fran en noviembre de 2026 (no hay
        // «baja»: suena a que no se le da importancia). Los repasos de
        // antes del campo se quedan en alta y la dirección facultativa
        // los va bajando a media uno a uno.
        'prioridad'    => "VARCHAR(10) NOT NULL DEFAULT 'alta'",
        // El número de orden con el que la fila LLEGÓ al servidor, que
        // es por donde se guía la bajada de cambios (ver «La bajada por
        // recepción» en index.php). Vacío = recién escrita, pendiente
        // de numerar. Va en las siete tablas que bajan a los móviles.
        'recibido'     => "CHAR(24) NOT NULL DEFAULT ''",
    ],
    'listas' => [
        // Vacío = se muestra el nombre de la vivienda. Solo se guarda
        // aquí cuando alguien lo cambia a mano.
        'nombre' => "VARCHAR(120) NOT NULL DEFAULT ''",
        // El número de orden de la recepción (ver `tareas`, arriba).
        'recibido' => "CHAR(24) NOT NULL DEFAULT ''",
    ],
    'comentarios' => [
        'creado_por_empresa' => "VARCHAR(120) NOT NULL DEFAULT ''",
        // El número de orden de la recepción (ver `tareas`, arriba).
        'recibido' => "CHAR(24) NOT NULL DEFAULT ''",
    ],
    'medios' => [
        'comentario_id' => 'CHAR(36) DEFAULT NULL',
        // El número de orden de la recepción (ver `tareas`, arriba).
        'recibido' => "CHAR(24) NOT NULL DEFAULT ''",
    ],
    'mensajes' => [
        // El número de orden de la recepción (ver `tareas`, arriba).
        'recibido' => "CHAR(24) NOT NULL DEFAULT ''",
    ],
    'lecturas' => [
        // El número de orden de la recepción (ver `tareas`, arriba).
        'recibido' => "CHAR(24) NOT NULL DEFAULT ''",
    ],
    'entregas' => [
        // «La vivienda se ha entregado»: cuándo, cuándo se apuntó y
        // quién lo apuntó. Vacío = no entregada, tenga la firma la
        // fecha que tenga.
        'entregada_en'         => "CHAR(24) NOT NULL DEFAULT ''",
        'entregada_fijada_en'  => "CHAR(24) NOT NULL DEFAULT ''",
        'entregada_por'        => 'CHAR(36) DEFAULT NULL',
        'entregada_por_nombre' => "VARCHAR(120) NOT NULL DEFAULT ''",
        // La hora de la cita en la notaría. Vacía = sin hora.
        'firma_hora'           => "CHAR(5) NOT NULL DEFAULT ''",
        // El día y la hora que tenía la cita si, al darla por hecha
        // antes de tiempo, se movió a hoy: «la revisión no se ha
        // hecho» se los devuelve. Vacíos = no se movió.
        'revisada_de'          => "CHAR(10) NOT NULL DEFAULT ''",
        'revisada_de_hora'     => "CHAR(5) NOT NULL DEFAULT ''",
        // Las visitas ya hechas que no son la cita vigente: una lista
        // en JSON y su sello. TEXT sin valor por defecto (MariaDB no
        // lo admite en una columna TEXT): en las filas que ya había
        // queda en NULL, que el código lee como «ninguna», igual que
        // la cadena vacía.
        'visitas_hechas'       => 'TEXT',
        'visitas_fijadas_en'   => "CHAR(24) NOT NULL DEFAULT ''",
        // El número de orden de la recepción (ver `tareas`, arriba).
        'recibido'             => "CHAR(24) NOT NULL DEFAULT ''",
    ],
    'reuniones' => [
        // El acta que sale de la grabación: el resumen ya aceptado y,
        // aparte, la propuesta de la IA a la espera de revisión (JSON).
        // Nulos hasta que existen: una reunión sin audio no los usa.
        'resumen'   => 'MEDIUMTEXT',
        'propuesta' => 'MEDIUMTEXT',
        // Cuándo se firmó. Un acta puede firmarse con el resumen en
        // blanco, así que el resumen no sirve para saber si está
        // firmada: hace falta su propio sello.
        'acta_firmada' => 'VARCHAR(32) DEFAULT NULL',
    ],
];

/**
 * Las siete tablas que bajan a los móviles. Cada una lleva la columna
 * `recibido` y un índice sobre ella. El índice NO va como sentencia
 * suelta en schema-sqlite.sql: esquema_aplicar() pasa los CREATE del
 * fichero ANTES de añadir columnas, y en una base que ya existe un
 * índice sobre una columna que todavía no está reventaría la puesta al
 * día entera, en cada petición. Lo crea esquema_recepcion(), después.
 */
const ESQUEMA_TABLAS_QUE_VIAJAN = ['listas', 'tareas', 'comentarios', 'medios', 'mensajes', 'lecturas', 'entregas'];

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
    // Fuera las líneas de comentario ANTES de partir por «;»: un punto
    // y coma dentro de un comentario partía el fichero por la mitad y
    // el trozo suelto —texto ya sin su «--»— reventaba la migración
    // entera (pasó el 25-08-2026 con la tabla de adjuntos: MariaDB
    // 1064 en «aquí, su ficha», y la versión clavada en la 9).
    $sql = implode("\n", array_filter(
        array_map('trim', explode("\n", $sql)),
        static fn ($linea) => strpos($linea, '--') !== 0
    ));
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
    $hechos = array_merge($hechos, esquema_recepcion($pdo));

    foreach (ESQUEMA_TABLAS as $tabla) {
        if (!esquema_columnas($pdo, $tabla)) {
            throw new RuntimeException("Falta la tabla {$tabla}: el fichero de esquema no la trae todavía.");
        }
    }

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
    // Las columnas se preguntan UNA vez: con dos preguntas, si fallara
    // solo la segunda el rescate se haría sin dejar la fila pendiente.
    $columnas = esquema_columnas($pdo, 'tareas');
    if (in_array('rechazada', $columnas, true)) {
        // Con la columna de recepción puesta, la fila queda además
        // «pendiente de numerar»: sin eso, este cambio no bajaba a
        // ningún móvil (ni siquiera tocaba `actualizado`).
        $vaciar = in_array('recibido', $columnas, true) ? ", recibido = ''" : '';
        $sent = $pdo->prepare(
            "UPDATE tareas SET estado = 'rechazada'{$vaciar} WHERE estado = 'pendiente' AND rechazada = 1"
        );
        $sent->execute();
        $cuantas = $sent->rowCount();
        if ($cuantas > 0) {
            $hechos[] = "tareas: {$cuantas} rechazadas rescatadas de pendiente";
        }
    }

    return $hechos;
}

/**
 * La recepción: índice sobre `recibido` en las siete tablas que viajan
 * y, mientras la bajada por recepción no esté encendida, el número de
 * orden de las filas que ya había.
 *
 * Se puede pasar las veces que haga falta: solo crea el índice que
 * falte y solo numera lo que esté sin numerar. Si a alguna tabla le
 * falta la columna lanza una excepción, la versión no se sella y el
 * siguiente arranque lo reintenta.
 *
 * EL RELLENO. A las filas de antes se les pone como número de orden su
 * propio `actualizado` (acotado entre 1970 y ahora): conserva el
 * reparto que la bajada por tandas ya sabe paginar. No hace falta más
 * finura: la primera bajada de cada móvil después de encender es
 * completa. Una vez encendido (existe `recepcion_serie` en meta) esto
 * ya no numera nada: lo que quede vacío lo numera la bajada, con un
 * número nuevo, que es lo que hace que le llegue a todo el mundo.
 *
 * SOLO SE COPIA UN `actualizado` CON LA FORMA DE LA CASA
 * (AAAA-MM-DDTHH:MM:SS.mmmZ); cualquier otro va al principio (1970).
 * El número de una fila acaba viajando como marca de un móvil y
 * vuelve en su petición siguiente. Si no tiene esa forma, el servidor
 * ya no la reconoce como suya y la lee como una fecha cualquiera: un
 * «2026-10-30 10:08:12» (con espacio) vuelve convertido en las
 * 10:08:12 con «T», que ordena DESPUÉS, y las filas que quedan entre
 * los dos no le bajan nunca a ese móvil, sin ningún error (visto en
 * el banco de pruebas); y una que PHP no sepa leer sería un 400 en
 * cada sincronización. Hoy no debería haber ninguna —iso() no las
 * deja entrar—, pero la base de producción no se ha mirado fila a
 * fila. Las dos condiciones van en positivo (LIKE, y no NOT LIKE)
 * para que tampoco un valor nulo acabe copiado: lo que no casa cae al
 * ELSE.
 *
 * EL REPASO. El LIKE mira que los signos estén en su sitio, no que
 * haya cifras donde van cifras, y no distingue mayúsculas. La forma
 * EXACTA la remata, detrás del relleno, un repaso en PHP con la regla
 * de iso(): todo número que no la cumpla va al principio. Se corrige
 * por `id` y no por valor: con la colación de la casa, para MariaDB
 * una marca en minúsculas y su gemela bien escrita son «el mismo
 * valor». Así, antes de encender, TODO número tiene la forma de la
 * casa, lo diga el motor que lo diga.
 */
function esquema_recepcion(PDO $pdo): array
{
    $hechos = [];
    foreach (ESQUEMA_TABLAS_QUE_VIAJAN as $tabla) {
        $columnas = esquema_columnas($pdo, $tabla);
        if (!$columnas) {
            throw new RuntimeException("Falta la tabla {$tabla}.");
        }
        if (!in_array('recibido', $columnas, true)) {
            throw new RuntimeException("A la tabla {$tabla} le falta la columna recibido.");
        }
        $indice = "ix_{$tabla}_recibido";
        if (!esquema_hay_indice($pdo, $tabla, $indice)) {
            // En MariaDB, con ALTER TABLE y no con CREATE INDEX: este
            // pide el permiso INDEX, que la app no había necesitado
            // nunca (todos sus índices nacieron dentro de un CREATE
            // TABLE); a aquel le basta ALTER, el de añadir columnas.
            // SQLite solo entiende el CREATE INDEX.
            $pdo->exec(motor() === 'sqlite'
                ? "CREATE INDEX {$indice} ON {$tabla} (recibido)"
                : "ALTER TABLE {$tabla} ADD INDEX {$indice} (recibido)");
            $hechos[] = "{$tabla}: índice {$indice}";
        }
        // Un nulo no es ni «pendiente» ni un número: no lo numeraría ni
        // lo leería nadie. No puede haberlo con la columna de la casa;
        // solo si alguien la hubiera puesto a mano de otra manera.
        $pdo->exec("UPDATE {$tabla} SET recibido = '' WHERE recibido IS NULL");
    }

    $encendido = $pdo->query("SELECT 1 FROM meta WHERE clave = 'recepcion_serie'")->fetchColumn();
    if ($encendido === false) {
        $ahora = esquema_ahora_ms();
        foreach (ESQUEMA_TABLAS_QUE_VIAJAN as $tabla) {
            // Cada «_» del LIKE es un carácter cualquiera: 24 en total,
            // con los signos y las dos letras en su sitio.
            $sent = $pdo->prepare(
                "UPDATE {$tabla}
                    SET recibido = CASE
                          WHEN actualizado LIKE '____-__-__T__:__:__.___Z' AND actualizado > ? THEN ?
                          WHEN actualizado LIKE '____-__-__T__:__:__.___Z'
                               AND actualizado >= '1970-01-01T00:00:00.000Z' THEN actualizado
                          ELSE '1970-01-01T00:00:00.000Z' END
                  WHERE recibido = ''"
            );
            $sent->execute([$ahora, $ahora]);
            if ($sent->rowCount() > 0) {
                $hechos[] = "{$tabla}: {$sent->rowCount()} filas numeradas";
            }
            // El repaso: la forma exacta, mirada aquí y no por el motor.
            // Primero se lee todo y se suelta la lectura; después se
            // escribe (ver upsert() en index.php).
            $malos = [];
            $sent = $pdo->query("SELECT id, recibido FROM {$tabla} WHERE recibido <> ''");
            while ($fila = $sent->fetch(PDO::FETCH_NUM)) {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/D', (string) $fila[1])) {
                    $malos[] = $fila[0];
                }
            }
            $sent->closeCursor();
            if ($malos) {
                $corregir = $pdo->prepare("UPDATE {$tabla} SET recibido = '1970-01-01T00:00:00.000Z' WHERE id = ?");
                foreach ($malos as $id) {
                    $corregir->execute([$id]);
                }
                $hechos[] = "{$tabla}: " . count($malos) . ' números mal formados, al principio';
            }
        }
    }
    return $hechos;
}

/** ¿Tiene ya la tabla ese índice? */
function esquema_hay_indice(PDO $pdo, string $tabla, string $indice): bool
{
    if (!preg_match('/^[a-z_]+$/', $tabla)) {
        return false;
    }
    if (motor() === 'sqlite') {
        return in_array($indice, array_column($pdo->query("PRAGMA index_list({$tabla})")->fetchAll(), 'name'), true);
    }
    // Sin preparar y filtrando aquí, como esquema_columnas(): así no
    // depende de que la versión del servidor deje preparar un SHOW.
    return in_array($indice, array_column($pdo->query("SHOW INDEX FROM {$tabla}")->fetchAll(), 'Key_name'), true);
}

/** El ahora del servidor con milisegundos, en el formato de la casa. */
function esquema_ahora_ms(): string
{
    $ahora = microtime(true);
    return gmdate('Y-m-d\TH:i:s', (int) $ahora) . sprintf('.%03dZ', (int) floor(($ahora - floor($ahora)) * 1000));
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
