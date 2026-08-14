#!/usr/bin/env bash
#
# Sube UNIK repasos al subdominio por FTP.
#
#   ftp-repasos.sh subir      todo menos index.html y sw.js
#   ftp-repasos.sh arranque   index.html y sw.js, al final del todo
#   ftp-repasos.sh comprobar  verifica que lo esencial está arriba
#
# El orden importa: index.html y sw.js son los que declaran la versión
# nueva. Si subieran primero, un móvil podría pedir un módulo que aún no
# está en el servidor.
#
# Lo que NUNCA se toca en el servidor:
#   api/config.php     credenciales de la base de datos
#   api/uploads/       fotos, vídeos y audios de los repasos
#   api/datos/         base de datos SQLite, si se usa ese motor
# Por eso el espejo va carpeta por carpeta y api/ se sube sin --delete.
#
# Variables (secretos del repositorio):
#   FTP_REPASOS_SERVER, FTP_REPASOS_USERNAME, FTP_REPASOS_PASSWORD
#   FTP_REPASOS_SERVER_DIR (opcional)

set -eu

QUE="${1:?uso: ftp-repasos.sh subir|arranque|comprobar}"

for nombre in FTP_REPASOS_SERVER FTP_REPASOS_USERNAME FTP_REPASOS_PASSWORD; do
  eval "valor=\${$nombre:-}"
  if [ -z "$valor" ]; then
    echo "Falta el secreto $nombre en el repositorio." >&2
    exit 1
  fi
done

AJUSTES='
  set ssl:verify-certificate no;
  set ftp:passive-mode true;
  set net:timeout 20;
  set net:max-retries 3;
  set net:reconnect-interval-base 4;
  set mirror:parallel-transfer-count 6;
  set xfer:clobber on;
  set cmd:fail-exit true;
'
# Igual que en el showroom: el canal de control cifrado protege las
# credenciales; el de datos va en claro porque Plesk cortaba la conexión
# al renegociar TLS en cada fichero.
TLS="$AJUSTES set ftp:ssl-allow true; set ftp:ssl-force true; set ftp:ssl-protect-data false;"
PLANO="$AJUSTES set ftp:ssl-allow false;"

lanzar() {
  lftp <<FIN
$1
open -u "$FTP_REPASOS_USERNAME","$FTP_REPASOS_PASSWORD" "$FTP_REPASOS_SERVER"
$2
bye
FIN
}

OPC="$TLS"
if ! lanzar "$TLS" "pwd" >/dev/null 2>&1; then
  echo "El servidor no aceptó FTPS; se usa FTP plano."
  OPC="$PLANO"
fi

DIR="${FTP_REPASOS_SERVER_DIR:-}"
case "$DIR" in "" | "." | "./") DIR="" ;; esac
if [ -z "$DIR" ]; then
  if lanzar "$OPC" "cls -1" 2>/dev/null | tr -d '\r/' | grep -qx httpdocs; then
    DIR=httpdocs
  else
    DIR=.
  fi
fi
echo "Carpeta destino: $DIR"

contar_remoto() {
  lanzar "$OPC" "cd \"$DIR\"; cls -1 \"$1\"" 2>/dev/null | grep -c . || true
}

case "$QUE" in
  subir)
    lanzar "$OPC" "cd \"$DIR\";
      mirror -R --transfer-all --delete --no-perms -v publish/css css;
      mirror -R --transfer-all --delete --no-perms -v publish/js js;
      mirror -R --transfer-all --delete --no-perms -v publish/assets assets;
      mirror -R --transfer-all --no-perms -v publish/api api;
      put publish/manifest.webmanifest -o manifest.webmanifest;
      put publish/.htaccess -o .htaccess;"
    ;;

  arranque)
    # Los dos ficheros que hacen que el navegador descubra la versión nueva.
    lanzar "$OPC" "cd \"$DIR\";
      put publish/sw.js -o sw.js;
      put publish/index.html -o index.html;"
    ;;

  comprobar)
    echo "Contenido de $DIR:"
    lanzar "$OPC" "cd \"$DIR\"; cls -1" 2>/dev/null | sed 's/^/  /'

    fallos=0
    for f in index.html sw.js manifest.webmanifest css/app.css js/app.js js/store.js \
             api/index.php api/lib/nucleo.php assets/fonts/opensans-var.woff2; do
      if [ "$(contar_remoto "$f")" -ge 1 ]; then
        echo "ok     $f"
      else
        echo "FALTA  $f"
        fallos=$((fallos + 1))
      fi
    done

    locales=$(find publish/js -type f | wc -l)
    remotos=$(contar_remoto "js/views")
    echo "js/views: $remotos ficheros en el servidor (local total js: $locales)"

    if [ "$fallos" -gt 0 ]; then
      echo "La subida está incompleta: faltan $fallos ficheros." >&2
      exit 1
    fi
    echo "Todo subido."
    ;;

  *)
    echo "Parte desconocida: $QUE" >&2
    exit 1
    ;;
esac
