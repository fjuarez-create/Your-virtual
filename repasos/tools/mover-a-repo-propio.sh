#!/usr/bin/env bash
#
# mover-a-repo-propio.sh — saca la carpeta repasos/ a su propio
# repositorio de GitHub, conservando el historial de commits.
#
# Uso, desde la raíz del repositorio Your-virtual:
#
#   bash repasos/tools/mover-a-repo-propio.sh https://github.com/TU-USUARIO/unik-repasos.git
#
# El repositorio de destino tiene que existir y estar VACÍO (al crearlo
# en GitHub, sin README, sin .gitignore y sin licencia).
#
# Lo que hace: reescribe la historia de la carpeta como si siempre
# hubiera sido la raíz del repositorio, y la empuja a main. La carpeta
# repasos/ de este repositorio se queda donde está; borrarla o no es
# decisión aparte, y se puede hacer después con calma.

set -eu

DESTINO="${1:-}"
if [ -z "$DESTINO" ]; then
  echo "Uso: bash repasos/tools/mover-a-repo-propio.sh <url-del-repo-nuevo>" >&2
  echo "Ejemplo: bash repasos/tools/mover-a-repo-propio.sh https://github.com/fjuarez-create/unik-repasos.git" >&2
  exit 1
fi

# ── Comprobaciones antes de tocar nada ──────────────────────────
if [ ! -d .git ]; then
  echo "Esto hay que ejecutarlo desde la raíz del repositorio (donde está la carpeta .git)." >&2
  exit 1
fi
if [ ! -f repasos/index.html ]; then
  echo "No encuentro repasos/index.html. ¿Estás en la rama que tiene la app?" >&2
  echo "Prueba:  git checkout claude/uniq-repasos-app-2ja8y2" >&2
  exit 1
fi
# ¿Está disponible git subtree? Se comprueba que exista el ejecutable, NO
# con 'git subtree --help': eso abre el manual, y en un contenedor sin
# manuales instalados (un Codespace, por ejemplo) falla aunque el comando
# esté perfectamente.
HAY_SUBTREE=no
if [ -x "$(git --exec-path)/git-subtree" ] || command -v git-subtree >/dev/null 2>&1; then
  HAY_SUBTREE=si
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Hay cambios sin guardar. Haz commit o guárdalos antes de mover nada." >&2
  exit 1
fi
# Un clon superficial no tiene historia que extraer.
if [ -f .git/shallow ] && [ "$HAY_SUBTREE" = si ]; then
  echo "Este clon es superficial. Ejecuta antes:  git fetch --unshallow" >&2
  exit 1
fi

RAMA_TEMPORAL="repasos-a-su-repo"
git branch -D "$RAMA_TEMPORAL" >/dev/null 2>&1 || true
TEMPORAL=""
limpiar() { [ -n "$TEMPORAL" ] && rm -rf "$TEMPORAL"; }
trap limpiar EXIT

if [ "$HAY_SUBTREE" = si ]; then
  echo "1/3 · Extrayendo repasos/ con su historial…"
  git subtree split --prefix=repasos -b "$RAMA_TEMPORAL"
  ORIGEN_PUSH="$RAMA_TEMPORAL:main"
else
  # Plan B: sin subtree no se puede reescribir la historia de la carpeta,
  # así que se lleva su contenido actual en un commit único. El historial
  # completo sigue estando en Your-virtual, que no se toca.
  echo "1/3 · Tu git no trae 'git subtree'; se lleva el contenido actual"
  echo "      en un commit único (el historial se queda en Your-virtual)."
  TEMPORAL="$(mktemp -d)"
  # git archive exporta solo lo que está bajo control de versiones: ni
  # config.php, ni fotos subidas, ni bases de datos.
  git archive HEAD repasos | tar -x -C "$TEMPORAL" --strip-components=1
  (
    cd "$TEMPORAL"
    git init -q -b main
    git add -A
    git -c user.name="$(git -C "$OLDPWD" config user.name || echo UNIK)" \
        -c user.email="$(git -C "$OLDPWD" config user.email || echo repasos@unikdi.com)" \
        commit -q -m "UNIK repasos: importado desde Your-virtual"
  )
  ORIGEN_PUSH="main"
fi

echo "2/3 · Empujando a $DESTINO (rama main)…"
empujar() {
  if [ "$HAY_SUBTREE" = si ]; then
    git push "$DESTINO" "$ORIGEN_PUSH"
  else
    git -C "$TEMPORAL" push "$DESTINO" main
  fi
}
if ! empujar; then
  echo >&2
  echo "No se pudo empujar. Lo más habitual:" >&2
  echo "  · el repositorio de destino no está vacío → créalo sin README ni .gitignore" >&2
  echo "  · la URL está mal escrita" >&2
  echo "  · falta autenticación → prueba con 'gh auth login' o con la URL SSH" >&2
  echo >&2
  if [ "$HAY_SUBTREE" = si ]; then
    echo "La rama local '$RAMA_TEMPORAL' se conserva; puedes reintentar con:" >&2
    echo "  git push $DESTINO $RAMA_TEMPORAL:main" >&2
  else
    echo "Vuelve a ejecutar este mismo comando cuando esté resuelto." >&2
  fi
  exit 1
fi

echo "3/3 · Limpiando…"
git branch -D "$RAMA_TEMPORAL" >/dev/null 2>&1 || true

cat <<'FIN'

Listo. El repositorio nuevo ya tiene la app en su raíz.

Siguientes pasos, en el repositorio NUEVO:
  1. Settings → Secrets and variables → Actions → New repository secret
     FTP_SERVER, FTP_USERNAME, FTP_PASSWORD y, si hace falta, FTP_SERVER_DIR
  2. Actions → «Publicar en el hosting (FTP)» → Run workflow

La puesta en marcha del servidor está en docs/PUESTA_EN_MARCHA.md.
FIN
