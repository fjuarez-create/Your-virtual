#!/usr/bin/env bash
#
# Mira por FTP qué hay realmente en el servidor: el contenido de la carpeta del
# panel, los .htaccess tal y como llegaron, y la última parte del log de errores
# de Plesk, que es donde aparece el motivo exacto de un error 500.
#
# No imprime nunca la contraseña ni el contenido de gestion/datos/clave.php.
#
# Variables: FTP_SERVER, FTP_USERNAME, FTP_PASSWORD y, opcional, FTP_SERVER_DIR.
# ACCION: mirar | sin-htaccess | restaurar

set -u

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
  set net:timeout 20;
  set net:max-retries 2;
  set cmd:fail-exit false;
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

echo "══════════ Raíz de la sesión FTP"
run_lftp "$OPTS" "cls -1" 2>/dev/null | sed 's/^/  /'

echo
echo "══════════ Contenido de $DIR/gestion (con tamaños y ocultos)"
run_lftp "$OPTS" "cd \"$DIR/gestion\"; ls -la" 2>/dev/null | sed 's/^/  /'

echo
echo "══════════ Contenido de $DIR/gestion/api y /datos"
run_lftp "$OPTS" "cd \"$DIR/gestion\"; ls -la api; echo; ls -la datos" 2>/dev/null | sed 's/^/  /'

echo
echo "══════════ Los .htaccess tal y como están en el servidor"
rm -rf /tmp/ftpdiag && mkdir -p /tmp/ftpdiag
run_lftp "$OPTS" "cd \"$DIR/gestion\";
  get -O /tmp/ftpdiag .htaccess -o gestion.htaccess;
  get -O /tmp/ftpdiag datos/.htaccess -o datos.htaccess;" >/dev/null 2>&1
for f in gestion datos; do
  echo "── $f/.htaccess"
  if [ -s "/tmp/ftpdiag/$f.htaccess" ]; then
    sed 's/^/  /' "/tmp/ftpdiag/$f.htaccess"
  else
    echo "  (no está en el servidor)"
  fi
done

# El primer byte de index.php dice si subió entero y si empieza donde debe.
echo
echo "══════════ Cabecera de index.php y lib.php en el servidor"
run_lftp "$OPTS" "cd \"$DIR/gestion\";
  get -O /tmp/ftpdiag index.php -o index.php;
  get -O /tmp/ftpdiag lib.php -o lib.php;" >/dev/null 2>&1
for f in index.php lib.php; do
  if [ -s "/tmp/ftpdiag/$f" ]; then
    printf '── %s · %s bytes · aquí %s bytes\n' "$f" \
      "$(wc -c < "/tmp/ftpdiag/$f")" "$(wc -c < "gestion/$f")"
    if cmp -s "/tmp/ftpdiag/$f" "gestion/$f"; then
      echo "   idéntico al del repositorio"
    else
      echo "   DISTINTO al del repositorio (el deploy no lo actualizó)"
    fi
    head -3 "/tmp/ftpdiag/$f" | sed 's/^/   /'
  else
    echo "── $f: no se pudo descargar"
  fi
done

# Plesk deja los logs del dominio fuera de httpdocs, en la raíz de la sesión.
echo
echo "══════════ Logs disponibles"
run_lftp "$OPTS" "cls -1 logs" 2>/dev/null | sed 's/^/  /'
echo
echo "══════════ Últimas líneas del log de errores"
for candidato in logs/error_log logs/error.log error_log logs/php_error.log; do
  run_lftp "$OPTS" "get -O /tmp/ftpdiag \"$candidato\" -o errores.txt" >/dev/null 2>&1
  if [ -s /tmp/ftpdiag/errores.txt ]; then
    echo "── $candidato"
    tail -40 /tmp/ftpdiag/errores.txt | sed 's/^/  /'
    break
  fi
done
[ -s /tmp/ftpdiag/errores.txt ] || echo "  (no se encontró ningún log legible por FTP)"

case "${ACCION:-mirar}" in
  sin-htaccess)
    echo
    echo "══════════ Experimento: apartar gestion/.htaccess"
    run_lftp "$OPTS" "cd \"$DIR/gestion\"; mv .htaccess .htaccess.off" 2>&1 | sed 's/^/  /'
    sleep 2
    echo "  /gestion/ responde ahora: $(curl -sS -o /dev/null -w '%{http_code}' -m 25 https://showroom.unikdi.com/gestion/ || echo error)"
    echo "  /gestion/index.php responde: $(curl -sS -o /dev/null -w '%{http_code}' -m 25 https://showroom.unikdi.com/gestion/index.php || echo error)"
    echo "  /gestion/comprobar.php responde: $(curl -sS -o /dev/null -w '%{http_code}' -m 25 https://showroom.unikdi.com/gestion/comprobar.php || echo error)"
    ;;
  restaurar)
    echo
    echo "══════════ Restaurar gestion/.htaccess"
    run_lftp "$OPTS" "cd \"$DIR/gestion\"; mv .htaccess.off .htaccess" 2>&1 | sed 's/^/  /'
    ;;
esac

echo
echo "Diagnóstico terminado."
