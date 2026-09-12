#!/usr/bin/env bash
#
# Sube la carpeta publish/ al hosting por FTP. Se invoca por partes para que
# el log del workflow diga en cuál se atasca si algo va mal:
#
#   ftp-deploy.sh assets   planos, fichas, HDRI y modelo (lo pesado)
#   ftp-deploy.sh new      la versión nueva del visor, en /new
#   ftp-deploy.sh code     css, js, data y vendor
#   ftp-deploy.sh gestion  el panel comercial, en /gestion
#   ftp-deploy.sh index    index.html, siempre el último
#   ftp-deploy.sh check    cuenta lo que hay arriba y falla si no cuadra
#
# El orden importa: index.html referencia los módulos con ?v=<sha>, así que
# tiene que subir cuando el resto ya está arriba. Si no, un visitante podría
# recibir el HTML nuevo pidiendo un JS que todavía no existe.
#
# Variables de entorno (secretos del repositorio):
#   FTP_SERVER, FTP_USERNAME, FTP_PASSWORD y, opcional, FTP_SERVER_DIR.

set -eu

WHAT="${1:?uso: ftp-deploy.sh assets|code|new|gestion|index|check}"

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

# Cuenta los ficheros de una carpeta remota. Devuelve 0 si no existe.
remote_count() {
  run_lftp "$OPTS" "cd \"$DIR\"; cls -1 \"$1\"" 2>/dev/null | grep -c . || true
}

# Tamaño en bytes de un fichero remoto (0 si no está). Contar ficheros no basta
# para los modelos: un GLB a medio subir sigue estando y rompe el visor.
# `cls --size` redondea a kilobytes; el LIST crudo da los bytes exactos en la
# quinta columna, que es lo que hay que comparar.
remote_size() {
  run_lftp "$OPTS" "cd \"$DIR\"; ls \"$1\"" 2>/dev/null \
    | tr -d '\r' | awk 'NF >= 5 && $5 ~ /^[0-9]+$/ { print $5; exit }'
}

if [ "$WHAT" = check ]; then
  echo "Raíz de la sesión FTP:"
  run_lftp "$OPTS" "cls -1" 2>/dev/null | sed 's/^/  /'
  echo "Contenido de $DIR:"
  run_lftp "$OPTS" "cd \"$DIR\"; cls -1" 2>/dev/null | sed 's/^/  /'

  fallos=0
  for d in planos fichas ubicaciones descargas serenea; do
    local_n=$(find "publish/assets/$d" -type f | wc -l)
    remote_n=$(remote_count "assets/$d")
    printf 'assets/%-12s local %3s   servidor %3s\n' "$d" "$local_n" "$remote_n"
    [ "$remote_n" -ge "$local_n" ] || fallos=$((fallos + 1))
  done
  for f in index.html js/main.js js/modelo.js css/style.css \
           gestion/index.php gestion/lib.php gestion/api/estado.php \
           assets/serenea/entorno.glb assets/serenea/apolo_envolvente.glb \
           assets/serenea/apolo_corte_baja.glb assets/serenea/apolo_mobiliario.glb \
           data/viviendas_serenea.json data/cortes.json \
           new/index.html new/js/main.js; do
    if [ "$(remote_count "$f")" -ge 1 ]; then
      echo "ok  $f"
    else
      echo "FALTA  $f"
      fallos=$((fallos + 1))
    fi
  done

  # Modelos: se compara el tamaño, no solo la presencia.
  for f in publish/assets/serenea/*.glb; do
    n=${f#publish/}
    local_b=$(wc -c < "$f")
    remote_b=$(remote_size "$n")
    remote_b=${remote_b:-0}
    if [ "$remote_b" = "$local_b" ]; then
      printf 'ok  %-44s %s bytes\n' "$n" "$local_b"
    else
      printf 'MAL %-44s local %s   servidor %s\n' "$n" "$local_b" "$remote_b"
      fallos=$((fallos + 1))
    fi
  done

  if [ "$fallos" -gt 0 ]; then
    echo "La subida está incompleta: $fallos comprobaciones fallidas." >&2
    exit 1
  fi
  echo "Todo subido."
  exit 0
fi

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
  # El panel es la única carpeta que se sube SIN --delete, y es a propósito:
  # gestion/datos/ guarda en el servidor el estado vivo de las viviendas, la
  # contraseña del panel y el registro de la oficina de ventas. Nada de eso
  # está en el repositorio, así que un mirror con --delete se lo llevaría por
  # delante en cada push y el comercial perdería las ventas apuntadas.
  gestion)
    CMDS="cd \"$DIR\";
      mirror -R --transfer-all --no-perms -v publish/gestion gestion;"
    ;;
  # La versión nueva vive en /new y comparte assets, data y vendor con la
  # raíz: no se duplican los 73 MB de planos, fichas y modelos.
  new)
    CMDS="cd \"$DIR\";
      mirror -R --transfer-all --delete --no-perms -v publish/new new;"
    ;;
  *)
    echo "Parte desconocida: $WHAT" >&2
    exit 1
    ;;
esac

run_lftp "$OPTS" "$CMDS"
