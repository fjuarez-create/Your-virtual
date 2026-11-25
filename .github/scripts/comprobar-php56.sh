#!/usr/bin/env bash
#
# El hosting sirve el panel con PHP 7.0.33 (medido el 12/09/2026 con
# gestion/comprobar.php). Escribir una sola construcción más moderna en
# gestion/*.php no da un aviso: da un error al compilar el fichero, y como
# lib.php lo cargan todas las páginas, /gestion entero pasa a devolver un 500
# con el cuerpo vacío. Sin mensaje, sin pista, y desde fuera parece que el
# panel «no va».
#
# Ya pasó, con `?string` y `: void` —ambas de PHP 7.1—. Este guardián corre en
# el deploy y lo para antes de subir nada.
#
# El objetivo es PHP 5.6, no 7.0: cuesta lo mismo y deja margen si el dominio
# se mueve a otro plan o el panel se copia a otro hosting.
#
# Antes de buscar, cada fichero pasa por el tokenizador de PHP para quitarle
# comentarios, cadenas y el HTML de fuera de las etiquetas. Sin eso, un
# comentario que mencione `??` daría un falso positivo, y este guardián solo
# sirve si nunca cría cuentos: uno que se ignora no para nada.

set -u

# Carpeta a revisar: por defecto el panel actual; el de /nuevo pasa la suya.
DIR="${1:-gestion}"
LIMPIO=$(mktemp -d)
trap 'rm -rf "$LIMPIO"' EXIT
fallos=0

if ! command -v php >/dev/null 2>&1; then
  echo "No hay php en el runner; no se puede comprobar el panel." >&2
  exit 1
fi

# Deja solo el código: los comentarios, las cadenas y el HTML se sustituyen por
# sus saltos de línea, de modo que los números de línea siguen cuadrando.
despejar() {
  php -r '
    $src = file_get_contents($argv[1]);
    $fuera = array(T_COMMENT, T_DOC_COMMENT, T_CONSTANT_ENCAPSED_STRING,
                   T_ENCAPSED_AND_WHITESPACE, T_INLINE_HTML);
    $out = "";
    foreach (token_get_all($src) as $t) {
      if (is_array($t)) {
        $out .= in_array($t[0], $fuera, true)
          ? str_repeat("\n", substr_count($t[1], "\n"))
          : $t[1];
      } else {
        $out .= $t;
      }
    }
    echo $out;
  ' "$1"
}

for f in $(find "$DIR" -name '*.php' | sort); do
  mkdir -p "$LIMPIO/$(dirname "$f")"
  despejar "$f" > "$LIMPIO/$f"
done

# $1 = qué es, $2 = expresión regular, $3 = (opcional) patrón que exculpa la línea
marcar() {
  local encontrados
  # ${DIR#/}: con una ruta absoluta, la copia limpia también está debajo de
  # $LIMPIO; sin quitar la barra, grep miraría los ficheros originales.
  encontrados=$(cd "$LIMPIO" && grep -rnE "$2" "${DIR#/}" --include='*.php' || true)
  if [ -n "${3:-}" ]; then
    encontrados=$(printf '%s\n' "$encontrados" | grep -vE "$3" || true)
  fi
  encontrados=$(printf '%s\n' "$encontrados" | grep -v '^$' || true)
  if [ -n "$encontrados" ]; then
    echo "✗ $1"
    printf '%s\n' "$encontrados" | sed 's/^/    /'
    fallos=$((fallos + 1))
  fi
}

echo "Comprobando que $DIR/*.php se mantiene en el subconjunto de PHP 5.6…"

marcar "declare(strict_types=1) es de PHP 7.0"                     'declare\s*\(\s*strict_types'
marcar "tipo de retorno en la firma: PHP 7.0 (y void, 7.1)"        '\)\s*:\s*\??(string|int|bool|float|array|void|callable|iterable|object|self)\s*\{'
marcar "tipo escalar en un parámetro: PHP 7.0"                     'function\s+\w+\s*\([^)]*\b(string|int|bool|float)\s+\$'
marcar "tipo anulable (?tipo) en un parámetro: PHP 7.1"            'function\s+\w+\s*\([^)]*\?\s*\w+\s+\$'
marcar "el operador ?? es de PHP 7.0"                              '\?\?'
marcar "el operador ?-> es de PHP 8.0"                             '\?->'
marcar "las funciones flecha (fn =>) son de PHP 7.4"               '\bfn\s*\([^)]*\)\s*=>'
marcar "match() es de PHP 8.0"                                     '\bmatch\s*\('
marcar "str_contains y compañía son de PHP 8.0"                    '\b(str_contains|str_starts_with|str_ends_with)\s*\('
marcar "random_bytes es de PHP 7.0: usa bytes_aleatorios()"        '(^|[^_[:alnum:]])random_bytes\s*\(' 'function_exists'
marcar "desempaquetado de listas con []: PHP 7.1"                  '^\s*\[[^]]*\]\s*='

if [ "$fallos" -gt 0 ]; then
  echo
  echo "El panel usa $fallos construcción(es) que el hosting no sabe compilar." >&2
  echo "El servidor corre PHP 7.0.33: esto lo dejaría con un 500 en blanco." >&2
  exit 1
fi

echo "✓ Sin construcciones posteriores a PHP 5.6."

# Y la comprobación de sintaxis normal con el PHP del runner: no detecta lo
# anterior, pero sí un paréntesis mal cerrado.
for f in $(find "$DIR" -name '*.php'); do
  php -l "$f" >/dev/null || { echo "Error de sintaxis en $f" >&2; exit 1; }
done
echo "✓ Sintaxis correcta en todos los .php del panel."

# ── PHP 8 ────────────────────────────────────────────────────────────────────
# El hosting avisó en noviembre de 2026 de que hay que dejar el 7.0.33, y el
# panel tiene que funcionar IGUAL en 7.0 y en 8.2–8.4, para poder cambiar la
# versión en Plesk y volver atrás sin tocar el código. Lo de aquí compila en
# las dos, pero en PHP 8 falla, avisa o cambia de resultado. Las cuatro
# primeras estuvieron en el panel hasta entonces; el resto es lo que más fácil
# se cuela. Ver «Versión de PHP del hosting» en docs/PANEL_Y_EJECUTABLE.md.
#
# Un aviso de PHP no es inofensivo: en el endpoint sale antes de las cabeceras
# y el visor y el ejecutable reciben HTML en vez de JSON, sin ETag ni CORS.

fallos=0
echo "Comprobando que $DIR/*.php funciona igual en PHP 7.0 y en 8.x…"

marcar "función que el hosting puede tener en disable_functions, sin function_exists: en PHP 8 es un error fatal" \
  '(^|[^_[:alnum:]>:$])(getmypid|getmyuid|getmygid|getmyinode|get_current_user|usleep|sleep|time_nanosleep|set_time_limit|ignore_user_abort|ini_set|ini_alter|ini_restore|ini_get_all|putenv|php_uname|phpinfo|parse_ini_file|parse_ini_string|symlink|link|chmod|chown|chgrp|disk_free_space|error_log|syslog|openlog|mail|exec|shell_exec|system|passthru|proc_open|popen|fsockopen|pfsockopen|highlight_file|show_source|escapeshellarg|escapeshellcmd|curl_exec|curl_multi_exec)\s*\(' \
  'function_exists'
marcar "\$_GET/\$_POST leídos a pelo: con ?x[]=1 llega un array y en PHP 8 da un Warning (o un TypeError en una función de cadena). Usa texto()" \
  '\$_(GET|POST|REQUEST|COOKIE)\s*\[' '(isset|empty)\s*\('
marcar "dato(\$_GET/\$_POST…) puede devolver un array: (string) da un Warning en PHP 8. Usa texto(), o (array) dato() para listas" \
  'dato\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)\b' '\(array\)\s*dato\s*\('
marcar "sort/ksort sin flag: con valores o claves mixtos (99, 101, A03) el orden cambió en PHP 8.0 y 8.2. Pon SORT_STRING, SORT_NATURAL o SORT_NUMERIC" \
  '(^|[^_[:alnum:]>:$])(sort|rsort|asort|arsort|ksort|krsort)\s*\(\s*\$[A-Za-z_][A-Za-z0-9_]*\s*\)'
marcar "comparación laxa (== != <>): 0 == 'a' cambió en PHP 8.0. Usa === y !=="  \
  '(^|[^=!<>])(==|!=)($|[^=])|<>'
marcar "in_array/array_search sin true, o switch: comparan con ==, que cambió en PHP 8.0" \
  '(^|[^_[:alnum:]>:$])(in_array|array_search)\s*\(|(^|[^_[:alnum:]])switch\s*\(' 'true\s*\)'
marcar "función eliminada (8.0) o deprecada (8.1–8.4)" \
  '(^|[^_[:alnum:]>:$])(each|create_function|money_format|get_magic_quotes_gpc|get_magic_quotes_runtime|fgetss|convert_cyr_string|hebrevc|restore_include_path|ezmlm_hash|strftime|gmstrftime|strptime|date_sunrise|date_sunset|mhash[a-z_]*|odbc_result_all|utf8_encode|utf8_decode|lcg_value|assert_options|mysqli_ping|mysqli_refresh|mysqli_kill|xml_set_object)\s*\('
marcar "deprecado en PHP 8.1–8.4: \${…} dentro de cadenas, FILTER_SANITIZE_STRING, E_STRICT" \
  '\$\{|\bFILTER_SANITIZE_(STRING|STRIPPED)\b|\bE_STRICT\b'

# Y dos que tienen que estar: lib.php lo cargan todas las páginas del panel.
if [ -f "$LIMPIO/${DIR#/}/lib.php" ]; then
  if ! grep -qE 'date_default_timezone_set\s*\(' "$LIMPIO/${DIR#/}/lib.php"; then
    echo "✗ $DIR/lib.php no fija la zona horaria: sin date.timezone en el php.ini de la versión nueva, PHP usa UTC"
    fallos=$((fallos + 1))
  fi
  if ! grep -qF "ini_set('display_errors', '0')" "$DIR/lib.php"; then
    echo "✗ $DIR/lib.php no apaga display_errors: un aviso de PHP 8 saldría dentro de la respuesta"
    fallos=$((fallos + 1))
  fi
fi

if [ "$fallos" -gt 0 ]; then
  echo
  echo "El panel usa $fallos construcción(es) que en PHP 8 fallan, avisan o cambian de resultado." >&2
  echo "Compila en 7.0 y en 8.x, pero al cambiar la versión en Plesk dejaría de funcionar igual." >&2
  exit 1
fi
echo "✓ Nada que falle o cambie entre PHP 7.0 y 8.x."

# Lo deprecado que PHP detecta al compilar (parámetros opcionales antes de los
# obligatorios, tipos anulables implícitos en 8.4…) no hace fallar a php -l:
# lo imprime y termina bien. Aquí sí cuenta, con el PHP del runner.
for f in $(find "$DIR" -name '*.php' | sort); do
  aviso=$(php -d error_reporting=-1 -d display_errors=1 -d log_errors=0 -d display_startup_errors=0 -l "$f" 2>&1 | grep -E '(Deprecated|Warning|Notice):' || true)
  if [ -n "$aviso" ]; then
    echo "PHP $(php -r 'echo PHP_VERSION;') avisa al compilar $f:" >&2
    printf '%s\n' "$aviso" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "✓ PHP $(php -r 'echo PHP_VERSION;') compila el panel sin deprecaciones ni avisos."
