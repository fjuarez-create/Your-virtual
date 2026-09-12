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

DIR=gestion
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
  encontrados=$(cd "$LIMPIO" && grep -rnE "$2" "$DIR" --include='*.php' || true)
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
