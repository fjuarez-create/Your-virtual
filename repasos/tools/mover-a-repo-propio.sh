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

RAIZ="$PWD"
RAMA_TEMPORAL="repasos-a-su-repo"
git branch -D "$RAMA_TEMPORAL" >/dev/null 2>&1 || true
TEMPORAL=""
YA_AL_DIA=no
limpiar() { [ -n "$TEMPORAL" ] && rm -rf "$TEMPORAL"; }
trap limpiar EXIT

RESULTADO=0

if [ "$HAY_SUBTREE" = si ]; then
  echo "1/3 · Extrayendo repasos/ con su historial…"
  git subtree split --prefix=repasos -b "$RAMA_TEMPORAL"
  echo "2/3 · Empujando a $DESTINO (rama main)…"
  git push "$DESTINO" "$RAMA_TEMPORAL:main" || RESULTADO=1
else
  # Sin subtree no se puede reescribir la historia de la carpeta. En vez
  # de inventar un repositorio nuevo —que al segundo intento chocaría con
  # lo ya publicado—, se clona el destino, se sustituye su contenido por
  # el actual y se hace un commit encima. Así vale igual para el primer
  # traslado que para cada actualización posterior.
  echo "1/3 · Tu git no trae 'git subtree'; se pondrá el destino al día"
  echo "      con un commit encima (el historial se queda en Your-virtual)."
  TEMPORAL="$(mktemp -d)"
  DESTINO_LOCAL="$TEMPORAL/destino"
  NOMBRE="$(git config user.name || echo 'UNIK repasos')"
  CORREO="$(git config user.email || echo 'repasos@unikdi.com')"

  if ! git clone --quiet "$DESTINO" "$DESTINO_LOCAL" 2>/dev/null; then
    echo "No se pudo clonar el repositorio de destino." >&2
    echo "Comprueba la URL y que tienes permiso: gh auth login" >&2
    exit 1
  fi

  # Hay que partir SIEMPRE de lo que ya está publicado; si no, el commit
  # nuevo nace suelto y GitHub rechaza el envío. Tres casos: ya existe
  # main en el destino, existe otra rama, o el repositorio está vacío y
  # todavía no hay ninguna (ahí 'checkout -B' no sirve y HEAD se apunta
  # a mano).
  if git -C "$DESTINO_LOCAL" rev-parse --verify --quiet origin/main >/dev/null; then
    git -C "$DESTINO_LOCAL" checkout -q -B main origin/main
  elif git -C "$DESTINO_LOCAL" rev-parse --verify --quiet HEAD >/dev/null; then
    git -C "$DESTINO_LOCAL" checkout -q -B main
  else
    git -C "$DESTINO_LOCAL" symbolic-ref HEAD refs/heads/main
  fi

  # Fuera todo salvo el propio .git: lo que valga se vuelve a poner
  # ahora, y así lo que se haya borrado desaparece también allí.
  find "$DESTINO_LOCAL" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

  # git archive exporta solo lo que está bajo control de versiones: ni
  # config.php, ni fotos subidas, ni bases de datos.
  git -C "$RAIZ" archive HEAD repasos | tar -x -C "$DESTINO_LOCAL" --strip-components=1

  ORIGEN_SHA="$(git -C "$RAIZ" rev-parse --short HEAD)"
  git -C "$DESTINO_LOCAL" add -A
  if git -C "$DESTINO_LOCAL" diff --cached --quiet; then
    echo "2/3 · El destino ya estaba al día: no hay nada que subir."
    YA_AL_DIA=si
  else
    git -C "$DESTINO_LOCAL" \
        -c user.name="$NOMBRE" -c user.email="$CORREO" \
        commit -q -m "UNIK repasos: al día con Your-virtual ($ORIGEN_SHA)"
    echo "2/3 · Empujando a $DESTINO (rama main)…"
    git -C "$DESTINO_LOCAL" push --quiet "$DESTINO" main || RESULTADO=1
  fi
fi

if [ "$RESULTADO" -ne 0 ]; then
  echo >&2
  echo "No se pudo empujar. Lo más habitual:" >&2
  echo "  · falta autenticación → 'gh auth login' y vuelve a intentarlo" >&2
  echo "  · la URL está mal escrita" >&2
  echo "  · alguien subió cambios al destino entre medias" >&2
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

if [ "$YA_AL_DIA" = si ]; then
  echo
  echo "El repositorio de destino ya estaba al día. No había nada que subir."
  exit 0
fi

cat <<'FIN'

Listo. El repositorio de destino tiene la app al día en su raíz.

Siguientes pasos, en el repositorio NUEVO:
  1. Settings → Secrets and variables → Actions → New repository secret
     FTP_SERVER, FTP_USERNAME, FTP_PASSWORD y, si hace falta, FTP_SERVER_DIR
  2. Actions → «Publicar en el hosting (FTP)» → Run workflow

La puesta en marcha del servidor está en docs/PUESTA_EN_MARCHA.md.
FIN
