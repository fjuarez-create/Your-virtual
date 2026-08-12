#!/usr/bin/env bash
#
# Sube la carpeta publish/ al hosting por FTP. Se invoca por partes para que
# el log del workflow diga en cuál se atasca si algo va mal:
#
#   ftp-deploy.sh assets   planos, fichas, HDRI y modelo (lo pesado)
#   ftp-deploy.sh code     css, js, data y vendor
#   ftp-deploy.sh index    index.html, siempre el último
#
# El orden importa: index.html referencia los módulos con ?v=<sha>, así que
# tiene que subir cuando el resto ya está arriba. Si no, un visitante podría
# recibir el HTML nuevo pidiendo un JS que todavía no existe.
#
# Variables de entorno (secretos del repositorio):
#   FTP_SERVER, FTP_USERNAME, FTP_PASSWORD y, opcional, FTP_SERVER_DIR.

set -eu

WHAT="${1:?uso: ftp-deploy.sh assets|code|index}"

for name in FTP_SERVER FTP_USERNAME FTP_PASSWORD; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Falta el secreto $name en el repositorio." >&2
    exit 1
  fi
done

# El canal de control va cifrado, que es lo que protege usuario y contraseña.
# El de datos no: el contenido es público y negociar TLS en cada uno de los
# ~500 ficheros multiplicaba por varios el tiempo de subida. Además es
# justamente donde Plesk cortaba la conexión.
#
# cmd:fail-exit al final del bloque: si alguna variable no existiera en la
# versión de lftp del runner, el aviso no aborta la sesión entera.
SETTINGS='
  set ssl:verify-certificate no;
  set ftp:passive-mode true;
  set net:timeout 20;
  set net:max-retries 3;
  set net:reconnect-interval-base 4;
  set net:reconnect-interval-multiplier 2;
  set mirror:parallel-transfer-count 8;
  set xfer:clobber on;
  set cmd:fail-exit true;
'
TLS="$SETTINGS set ftp:ssl-allow true; set ftp:ssl-force true; set ftp:ssl-protect-data false;"
PLAIN="$SETTINGS set ftp:ssl-allow false;"

# $1 = bloque de ajustes, $2 = comandos a ejecutar ya conectado.
run_lftp() {
  lftp <<LFTP_SCRIPT
$1
open -u "$FTP_USERNAME","$FTP_PASSWORD" "$FTP_SERVER"
$2
bye
LFTP_SCRIPT
}

OPTS="$TLS"
if ! run_lftp "$TLS" "pwd" >/dev/null 2>&1; then
  echo "El servidor no aceptó FTPS; se usa FTP plano."
  OPTS="$PLAIN"
fi

# Al crear en Plesk un usuario FTP apuntando a la carpeta del dominio, la raíz
# de la sesión contiene httpdocs (la raíz web real) junto a logs, conf, etc.
DIR="${FTP_SERVER_DIR:-}"
case "$DIR" in "" | "." | "./") DIR="" ;; esac
if [ -z "$DIR" ]; then
  if run_lftp "$OPTS" "cls -1" 2>/dev/null | tr -d '\r/' | grep -qx httpdocs; then
    DIR=httpdocs
  else
    DIR=.
  fi
fi
echo "Carpeta destino: $DIR"

# --transfer-all para el código: son pocos MB y así no dependemos de que el
# servidor conserve las fechas de modificación. Los assets se comparan por
# tamaño (--ignore-time), de modo que tras la primera subida solo viajan los
# planos, fichas o modelos que hayan cambiado.
case "$WHAT" in
  assets)
    CMDS="cd \"$DIR\";
      mirror -R --ignore-time --delete --no-perms -v publish/assets assets;"
    ;;
  code)
    CMDS="cd \"$DIR\";
      mirror -R --transfer-all --delete --no-perms -v publish/css css;
      mirror -R --transfer-all --delete --no-perms -v publish/js js;
      mirror -R --transfer-all --delete --no-perms -v publish/data data;
      mirror -R --transfer-all --delete --no-perms -v publish/vendor vendor;"
    ;;
  index)
    CMDS="cd \"$DIR\"; put publish/index.html -o index.html;"
    ;;
  *)
    echo "Parte desconocida: $WHAT" >&2
    exit 1
    ;;
esac

run_lftp "$OPTS" "$CMDS"
