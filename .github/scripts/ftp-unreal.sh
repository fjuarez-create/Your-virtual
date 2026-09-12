#!/usr/bin/env bash
#
# Deja los tres glTF convertidos en showroom.unikdi.com/unreal/ para poder
# bajarlos desde el navegador de la máquina de Vagon.
#
# Son ~224 MB de ficheros temporales: en cuanto estén importados en Unreal,
# esta carpeta se puede borrar del hosting sin más.
#
# Ojo: la carpeta unreal/ no la toca el deploy normal (ftp-deploy.sh solo
# refleja assets, css, js, data, vendor, new y gestion), así que lo que se
# suba aquí se queda hasta que alguien lo borre a mano.

set -eu

for name in FTP_SERVER FTP_USERNAME FTP_PASSWORD; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Falta el secreto $name en el repositorio." >&2
    exit 1
  fi
done

SETTINGS='
  set ssl:verify-certificate no;
  set ftp:passive-mode true;
  set net:timeout 30;
  set net:max-retries 3;
  set net:reconnect-interval-base 4;
  set xfer:clobber on;
  set cmd:fail-exit true;
'
TLS="$SETTINGS set ftp:ssl-allow true; set ftp:ssl-force true; set ftp:ssl-protect-data false;"
PLAIN="$SETTINGS set ftp:ssl-allow false;"

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

DIR="${FTP_SERVER_DIR:-}"
case "$DIR" in "" | "." | "./") DIR="" ;; esac
if [ -z "$DIR" ]; then
  if run_lftp "$OPTS" "cls -1" 2>/dev/null | tr -d '\r/' | grep -qx httpdocs; then
    DIR=httpdocs
  else
    DIR=.
  fi
fi

echo "Subiendo $(du -sh unreal | cut -f1) a $DIR/unreal …"
run_lftp "$OPTS" "cd \"$DIR\"; mirror -R --transfer-all --no-perms -v unreal unreal;"

echo
echo "══════════ Comprobación"
fallos=0
for f in apolo_envolvente.glb apolo_mobiliario.glb entorno.glb; do
  local_b=$(wc -c < "unreal/$f")
  remote_b=$(run_lftp "$OPTS" "cd \"$DIR\"; ls \"unreal/$f\"" 2>/dev/null \
    | tr -d '\r' | awk 'NF >= 5 && $5 ~ /^[0-9]+$/ { print $5; exit }')
  remote_b=${remote_b:-0}
  if [ "$remote_b" = "$local_b" ]; then
    printf 'ok  %-24s %s bytes\n' "$f" "$local_b"
  else
    printf 'MAL %-24s local %s   servidor %s\n' "$f" "$local_b" "$remote_b"
    fallos=$((fallos + 1))
  fi
done

if [ "$fallos" -gt 0 ]; then
  echo "Alguno no subió entero." >&2
  exit 1
fi

cat <<'FIN'

Listos para descargar desde el navegador de Vagon:

  https://showroom.unikdi.com/unreal/apolo_envolvente.glb
  https://showroom.unikdi.com/unreal/apolo_mobiliario.glb
  https://showroom.unikdi.com/unreal/entorno.glb

Cuando estén importados en Unreal, esta carpeta se puede borrar del hosting.
FIN
