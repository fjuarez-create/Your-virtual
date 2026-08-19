#!/usr/bin/env bash
#
# Sube UNIK repasos al subdominio por FTP.
#
#   ftp-deploy.sh destino    comprueba que la carpeta es la de repasos
#   ftp-deploy.sh subir      todo menos index.html y sw.js
#   ftp-deploy.sh arranque   index.html y sw.js, al final del todo
#   ftp-deploy.sh comprobar  verifica que lo esencial está arriba
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
#   FTP_SERVER, FTP_USERNAME, FTP_PASSWORD
#   FTP_SERVER_DIR (opcional)

set -eu

QUE="${1:?uso: ftp-deploy.sh subir|arranque|comprobar}"

for nombre in FTP_SERVER FTP_USERNAME FTP_PASSWORD; do
  eval "valor=\${$nombre:-}"
  if [ -z "$valor" ]; then
    echo "Falta el secreto $nombre en el repositorio." >&2
    exit 1
  fi
done

AJUSTES='
  set ftp:passive-mode true;
  set net:timeout 20;
  set net:max-retries 3;
  set net:reconnect-interval-base 4;
  set mirror:parallel-transfer-count 6;
  set xfer:clobber on;
  set cmd:fail-exit true;
'
# El canal de CONTROL, por donde viaja la contraseña, va cifrado siempre.
# El de DATOS va en claro porque Plesk cortaba la conexión al renegociar
# TLS en cada fichero, y por ahí solo pasan los ficheros públicos de la
# app. Esa distinción es deliberada; lo que no se admite es mandar las
# credenciales en claro.
CIFRADO="set ftp:ssl-allow true; set ftp:ssl-force true; set ftp:ssl-protect-data false;"
TLS_VERIFICADO="$AJUSTES set ssl:verify-certificate yes; $CIFRADO"
TLS_SIN_VERIFICAR="$AJUSTES set ssl:verify-certificate no; $CIFRADO"
PLANO="$AJUSTES set ssl:verify-certificate no; set ftp:ssl-allow false;"

lanzar() {
  lftp <<FIN
$1
open -u "$FTP_USERNAME","$FTP_PASSWORD" "$FTP_SERVER"
$2
bye
FIN
}

# Nunca se baja a FTP en claro por su cuenta: una sonda fallida por un
# corte de red bastaría para mandar la contraseña del hosting por
# Internet en texto plano, y con ella se lee api/config.php, que trae las
# credenciales de la base de datos.
if lanzar "$TLS_VERIFICADO" "pwd" >/dev/null 2>&1; then
  OPC="$TLS_VERIFICADO"
  echo "Conexión cifrada, con el certificado del servidor verificado."
elif lanzar "$TLS_SIN_VERIFICAR" "pwd" >/dev/null 2>&1; then
  OPC="$TLS_SIN_VERIFICAR"
  echo "AVISO: no se ha podido verificar el certificado del servidor FTP."
  echo "       La contraseña sigue viajando cifrada, pero conviene revisar"
  echo "       el certificado del hosting."
elif [ "${FTP_PERMITIR_PLANO:-}" = "1" ]; then
  OPC="$PLANO"
  echo "AVISO: FTP SIN CIFRAR. Permitido a propósito con FTP_PERMITIR_PLANO=1."
else
  echo "El servidor no acepta FTPS y la contraseña viajaría en claro. Paro." >&2
  echo "Plesk ofrece FTPS y SFTP: revisa que estén activados para esta cuenta." >&2
  echo "Si no hubiera alternativa, hay que ponerlo por escrito en el workflow" >&2
  echo "con FTP_PERMITIR_PLANO=1; a propósito no se hace solo." >&2
  exit 1
fi

DIR="${FTP_SERVER_DIR:-}"
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
  destino)
    # El mismo hosting alberga otros sitios, y el peor accidente posible
    # es publicar aquí encima de otro. Así que antes de escribir nada hay
    # que saber dónde se escribe. «Primera instalación» NO exime de esta
    # comprobación: cambia lo que hay que demostrar, y a algo más
    # estricto —que la carpeta esté vacía de verdad—, no a nada.
    LISTADO=$(lanzar "$OPC" "cd \"$DIR\"; cls -1" 2>/dev/null | tr -d '\r' | sed 's#/$##' | grep . || true)

    if [ "${PRIMERA_INSTALACION:-}" = "true" ]; then
      # Plesk deja sus propias carpetas de servicio en un subdominio recién
      # creado; esas no cuentan como «ocupado».
      AJENOS=$(printf '%s\n' "$LISTADO" | grep -vx -e 'logs' -e 'tmp' -e 'anon_ftp' -e 'error_docs' -e '.well-known' || true)
      if [ -z "$AJENOS" ]; then
        echo "Destino vacío: «$DIR» está listo para la primera instalación."
      else
        echo "" >&2
        echo "PARO ANTES DE TOCAR NADA." >&2
        echo "Has marcado «primera instalación», pero «$DIR» NO está vacía:" >&2
        printf '%s\n' "$AJENOS" | sed 's/^/    /' >&2
        echo "" >&2
        echo "Si UNIK repasos ya está instalado ahí, lanza el despliegue normal," >&2
        echo "SIN marcar la casilla." >&2
        echo "Si eso de arriba es OTRO sitio web, los secretos REPASOS_FTP_*" >&2
        echo "apuntan donde no deben y publicar aquí lo habría borrado." >&2
        exit 1
      fi
    elif [ "$(contar_remoto "api/config.php")" -ge 1 ]; then
      # api/config.php lo crea el instalador y no viaja nunca en el
      # despliegue: es una señal que solo existe en esta instalación.
      echo "Destino correcto: «$DIR» es una instalación de UNIK repasos."
    else
      echo "" >&2
      echo "PARO ANTES DE TOCAR NADA." >&2
      echo "En «$DIR» no hay api/config.php, así que no parece la carpeta de" >&2
      echo "UNIK repasos. Casi siempre esto es un problema de credenciales:" >&2
      echo "comprueba que REPASOS_FTP_USERNAME sea el usuario FTP DEL SUBDOMINIO" >&2
      echo "de repasos y no el de otro sitio del mismo hosting, y revisa" >&2
      echo "REPASOS_FTP_SERVER_DIR." >&2
      echo "" >&2
      echo "Esto es lo que hay ahora mismo en «$DIR»:" >&2
      if [ -n "$LISTADO" ]; then
        printf '%s\n' "$LISTADO" | sed 's/^/    /' >&2
      else
        echo "    (vacía)" >&2
        echo "" >&2
        echo "Al estar vacía, si de verdad es la primera instalación puedes lanzar" >&2
        echo "el workflow a mano marcando «primera_instalacion»." >&2
      fi
      exit 1
    fi
    ;;

  subir)
    # Las páginas sueltas de la raíz —la de privacidad hoy, las que
    # vengan mañana— se suben todas, sin lista escrita a mano. La de
    # privacidad se quedó en tierra el día que se escribió porque aquí
    # solo estaban nombrados el manifiesto y el .htaccess, y una página
    # que Apple exige leer no puede depender de que alguien se acuerde.
    #
    # index.html no va aquí: sube el último, en «arranque», junto al
    # service worker, para que ningún navegador se encuentre el índice
    # nuevo antes que el código nuevo.
    PAGINAS=""
    for f in publish/*.html; do
      [ -e "$f" ] || continue
      n=$(basename "$f")
      [ "$n" = index.html ] && continue
      PAGINAS="$PAGINAS
      put \"publish/$n\" -o \"$n\";"
      echo "página suelta: $n"
    done

    lanzar "$OPC" "cd \"$DIR\";
      mirror -R --transfer-all --delete --no-perms -v publish/css css;
      mirror -R --transfer-all --delete --no-perms -v publish/js js;
      mirror -R --transfer-all --delete --no-perms -v publish/assets assets;
      mirror -R --transfer-all --no-perms -v publish/api api;
      put publish/manifest.webmanifest -o manifest.webmanifest;
      put publish/.htaccess -o .htaccess;$PAGINAS"
    ;;

  limpiar)
    # api/ se sube sin --delete para no rozar las fotos ni config.php, así
    # que lo que se retira del repositorio hay que retirarlo a mano.
    #
    # Estas dos páginas crean usuarios y tocan la base de datos SIN pedir
    # contraseña, así que aquí no vale con intentarlo: hay que comprobar
    # que ya no están. Y «no las veo» solo cuenta si de verdad se ha
    # podido preguntar: un corte de FTP no puede pasar por «no estaban».
    listar_api() {
      lanzar "$OPC" "cd \"$DIR\"; cls -1 api/" 2>/dev/null | tr -d '\r' | sed 's#/$##; s#.*/##' | grep . || true
    }

    EN_API=$(listar_api)
    if [ -z "$EN_API" ]; then
      echo "No he podido listar api/ en el servidor, así que no puedo asegurar" >&2
      echo "que las páginas de instalación no estén publicadas. Paro." >&2
      exit 1
    fi

    for f in actualizar.php install.php; do
      if ! printf '%s\n' "$EN_API" | grep -qx "$f"; then
        echo "no estaba  api/$f"
        continue
      fi
      lanzar "$OPC" "cd \"$DIR\"; rm -f \"api/$f\";" >/dev/null 2>&1 || true

      QUEDA=$(listar_api)
      if [ -z "$QUEDA" ] || printf '%s\n' "$QUEDA" | grep -qx "$f"; then
        echo "" >&2
        echo "NO he podido quitar api/$f del servidor." >&2
        echo "Esa página crea usuarios y enseña sus contraseñas sin pedir nada," >&2
        echo "y está publicada. Bórrala a mano por FTP antes de seguir." >&2
        exit 1
      fi
      echo "retirado   api/$f"
    done
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
    # Las tres páginas sueltas entran en la lista a propósito: son las
    # que Apple tiene que poder leer para dejar la app en la tienda, y
    # sus direcciones están escritas en la ficha. Si un día dejan de
    # subir, que se entere el despliegue y no el revisor.
    for f in index.html sw.js manifest.webmanifest \
             privacidad.html soporte.html marketing.html \
             assets/marketing/inicio.jpg \
             css/app.css js/app.js js/store.js \
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
