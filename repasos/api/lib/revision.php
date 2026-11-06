<?php
/**
 * revision.php — la cuenta temporal para la revisión de Apple.
 *
 * Apple exige una cuenta con la que su revisor pueda entrar y ver la
 * aplicación por dentro. Esa cuenta necesita una contraseña, y una
 * contraseña no puede vivir en el repositorio: el de UNIK es público, y
 * escribirla ahí sería regalar la entrada a los datos reales de la obra
 * para siempre, porque el historial de git no se borra.
 *
 * Así que viaja por el mismo camino que las credenciales del FTP: del
 * bloc de notas de Fran a los secretos de GitHub, y de ahí el
 * despliegue lo escribe directamente en el servidor.
 * Aquí solo está la mecánica; el dato no está en ningún sitio del
 * código.
 *
 * El ciclo entero, sin que nadie tenga que acordarse de nada:
 *
 *   secreto puesto  → la cuenta se crea, o se le pone al día la
 *                     contraseña si cambió, y queda activa.
 *   secreto quitado → el despliegue borra el fichero del servidor y, al
 *                     siguiente arranque, la cuenta se DESACTIVA sola.
 *
 * O sea: cuando Apple valide la app, Fran borra el secreto en GitHub,
 * se despliega, y la puerta se cierra. Sin tocar la base de datos.
 */

/**
 * Dónde deja el despliegue el fichero con la cuenta.
 *
 * Es un .php y no un .json a propósito: el servidor ejecuta los .php y
 * nunca los sirve como texto, mientras que un .json colgando de api/ se
 * podría pedir por su dirección y leer la contraseña desde el navegador.
 * Este devuelve un array y no imprime nada, así que pedirlo da una
 * página en blanco.
 */
function revision_fichero(): string
{
    return __DIR__ . '/../revision-cuenta.php';
}

/**
 * Deja la cuenta de revisión como diga el fichero: creada y al día si
 * está, desactivada si ya no está.
 *
 * Se llama en cada arranque, pero solo escribe cuando algo ha
 * cambiado: guarda en `meta` una huella de lo que aplicó la última vez
 * y, si coincide, no toca la base de datos.
 */
function revision_al_dia(PDO $pdo): void
{
    try {
        $fichero = revision_fichero();
        $cuenta = null;

        if (is_readable($fichero)) {
            $crudo = include $fichero;
            if (is_array($crudo)
                && !empty($crudo['email'])
                && !empty($crudo['password'])
                && filter_var($crudo['email'], FILTER_VALIDATE_EMAIL)) {
                $cuenta = $crudo;
            } else {
                error_log('UNIK Works · revision-cuenta.php existe pero no trae correo y contraseña válidos.');
            }
        }

        // La huella dice qué se aplicó la última vez. Sin ella habría que
        // rehacer el hash de la contraseña en cada petición, que es caro
        // a propósito —para eso es un hash de contraseña— y aquí se
        // pagaría mil veces al día sin necesidad.
        $huella = $cuenta
            ? hash('sha256', $cuenta['email'] . "\0" . $cuenta['password'])
            : 'sin-cuenta';
        if (revision_huella($pdo) === $huella) {
            return;
        }

        if ($cuenta) {
            revision_poner($pdo, $cuenta);
        } else {
            revision_cerrar($pdo);
        }
        revision_guardar_huella($pdo, $huella);
    } catch (Throwable $e) {
        // Que esto falle no puede tumbar la aplicación entera: es una
        // cuenta de más, no el funcionamiento de la obra.
        error_log('UNIK Works · no se pudo poner al día la cuenta de revisión: ' . $e->getMessage());
    }
}

/** Crea la cuenta o le pone al día la contraseña, y la deja activa. */
function revision_poner(PDO $pdo, array $cuenta): void
{
    $email = mb_strtolower(trim($cuenta['email']));
    $nombre = trim($cuenta['nombre'] ?? '') ?: 'Revisión de Apple';
    // Sin permiso de verificación no se ven los botones de verificar ni
    // de rechazar, que son la mitad de la aplicación. El revisor tiene
    // que poder verlos, así que entra como dirección facultativa.
    $empresa = trim($cuenta['empresa'] ?? '') ?: 'DO — Arquitecto';
    $hash = password_hash($cuenta['password'], PASSWORD_DEFAULT);
    $ahora = ahora_iso();

    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
    $stmt->execute([$email]);
    $id = $stmt->fetchColumn();

    if ($id) {
        $pdo->prepare(
            'UPDATE usuarios SET password_hash = ?, nombre = ?, empresa = ?,
                    verifica = 1, activo = 1, actualizado = ? WHERE id = ?'
        )->execute([$hash, $nombre, $empresa, $ahora, $id]);
    } else {
        $id = uuid();
        $pdo->prepare(
            'INSERT INTO usuarios (id, nombre, email, password_hash, rol, empresa,
                                   verifica, activo, creado, actualizado)
             VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)'
        )->execute([$id, $nombre, $email, $hash, 'usuario', $empresa, $ahora, $ahora]);
    }

    // Se apunta cuál es, para poder cerrarla luego aunque el fichero con
    // el correo ya no esté.
    revision_meta($pdo, 'usuario_revision', (string) $id);
    error_log('UNIK Works · cuenta de revisión al día (' . $email . ').');
}

/**
 * Cierra la cuenta: la desactiva y le cambia la contraseña por una que
 * nadie conoce.
 *
 * No se borra la fila a propósito. Si el revisor de Apple llegó a
 * apuntar algo, esa tarea quedó firmada con su nombre; borrar el
 * usuario dejaría el acta señalando a alguien que ya no existe.
 */
function revision_cerrar(PDO $pdo): void
{
    $id = revision_meta($pdo, 'usuario_revision');
    if (!$id) {
        return;
    }
    $pdo->prepare(
        'UPDATE usuarios SET activo = 0, password_hash = ?, actualizado = ? WHERE id = ?'
    )->execute([password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT), ahora_iso(), $id]);
    revision_meta($pdo, 'usuario_revision', null);
    error_log('UNIK Works · cuenta de revisión cerrada.');
}

/* ─── La huella y el apunte en «meta» ─────────────────────────── */

function revision_huella(PDO $pdo): string
{
    return (string) (revision_meta($pdo, 'revision_huella') ?? '');
}

function revision_guardar_huella(PDO $pdo, string $huella): void
{
    revision_meta($pdo, 'revision_huella', $huella);
}

/** Lee, escribe o borra una fila de «meta». Sin valor, lee. */
function revision_meta(PDO $pdo, string $clave, ?string $valor = '__leer__')
{
    if ($valor === '__leer__') {
        $stmt = $pdo->prepare('SELECT valor FROM meta WHERE clave = ?');
        $stmt->execute([$clave]);
        $v = $stmt->fetchColumn();
        return $v === false ? null : $v;
    }
    $pdo->prepare('DELETE FROM meta WHERE clave = ?')->execute([$clave]);
    if ($valor !== null) {
        $pdo->prepare('INSERT INTO meta (clave, valor) VALUES (?, ?)')->execute([$clave, $valor]);
    }
    return null;
}
