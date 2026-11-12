#!/usr/bin/env bash
#
# lftp.sh — instala lftp sin depender de que respondan los servidores de
# paquetes de Ubuntu. Lo llama la acción de al lado (action.yml) en dos
# fases, para que entre una y otra la caché de GitHub Actions pueda traer
# lo que se guardó la vez anterior:
#
#   lftp.sh mirar      ¿hace falta instalar? y con qué clave se guarda
#   lftp.sh instalar   de lo guardado si vale; si no, con apt como siempre
#
# POR QUÉ. El 11-11-2026 tres despliegues seguidos murieron en «Instalar
# lftp»: «Temporary failure resolving 'security.ubuntu.com'». Los
# servidores de paquetes de Ubuntu estuvieron unos cuarenta minutos
# caídos vistos desde las máquinas de GitHub. No se subió nada y
# producción no se tocó, pero en ese rato no se habría podido publicar un
# arreglo urgente, y a Fran le llegaron tres correos de «Run failed».
# lftp es con lo que se sube TODO: sin él no hay despliegue, ni taller,
# ni copia nocturna.
#
# QUÉ HACE AHORA, por orden, y parando en el primero que funcione:
#
#   1. Si lftp ya viene en la máquina, nada (como siempre).
#   2. Si hay paquetes guardados de otra vez (los .deb de lftp y de lo
#      que arrastró), se instalan con dpkg: CERO red.
#      Pero solo si cada uno es, por su huella, el que dice la lista de
#      paquetes que la máquina ya trae (la que apt verificó con la firma
#      de Ubuntu): dpkg corre como root, en la máquina que dos pasos
#      después recibe la contraseña del FTP, y una caché de GitHub la
#      puede escribir cualquier ejecución de la rama. Con esto el
#      despliegue se sigue fiando de quien se fiaba antes de haber
#      caché: de Ubuntu. Tampoco cuesta red.
#      Y con una salvedad, para que lo guardado no sea para siempre: si
#      la lista de paquetes de la imagen dice que Ubuntu ya tiene un
#      lftp MÁS NUEVO (un arreglo de seguridad, por ejemplo), antes se
#      prueba UNA vez con apt, que es quien lo trae; y si apt no puede,
#      vale el guardado. Saberlo no cuesta red: es mirar una lista.
#   3. Si no los hay, o no se dejan instalar, el camino de siempre con
#      apt y sus reintentos, sin cambiarle una orden.
#   4. Entre el primer intento de apt y los reintentos, una puerta más:
#      bajar esos mismos .deb de OTRO espejo y darlos por buenos solo si
#      su huella es la que dice la lista de paquetes que la máquina ya
#      trae (la que apt verificó con la firma de Ubuntu).
#
# Y cuando ha hecho falta la red (3 o 4), deja en la carpeta los .deb de
# lo que ha entrado, para que la acción los guarde y la próxima vez
# baste el punto 2.
#
# LO QUE NO PUEDE HACER: dejar las cosas peor que antes. Sin nada
# guardado, o con lo guardado estropeado, tiene que acabar donde acababa
# el paso de siempre. Por eso lo guardado se comprueba antes de tocar
# nada, lo que dpkg deje a medias se retira antes de llamar a apt, y
# guardar para la próxima es un «si se puede»: nunca tumba el paso.
# (Lo que sí puede pasar es que lo guardado NO se use y se acabe en apt,
# como antes de haber caché: cuando la lista de la imagen ya no conoce
# esa versión de un paquete —la sustituyó otra—, no hay con qué
# cotejarlo.)
#
# En la carpeta guardada y en el registro no va ningún secreto: solo
# paquetes públicos de Ubuntu y sus nombres. Este repositorio es público
# y sus registros también.
#
# Variables (las pone action.yml):
#   LFTP_GUARDADO     la carpeta que la caché restaura y guarda
#   LFTP_CLAVE_EXTRA  (opcional) aparta la caché del robot de prueba
#   LFTP_ESPEJOS      (opcional) los otros espejos, separados por espacios
#   LFTP_PAUSA        (opcional) segundos de espera entre reintentos (10)

# Sin «set -e», a propósito. Todo lo que este guion añade a lo de
# siempre (mirar la clave, comprobar lo guardado, recoger los .deb) es
# un «si se puede»: un tropiezo ahí —una herramienta que en la imagen
# de mañana se porte distinto— no puede cortar el guion antes de llegar
# a apt. Cada decisión mira ella misma si lo suyo ha salido bien.
set -u

FASE="${1:?uso: lftp.sh mirar|instalar}"

# Con qué se ha instalado: imagen, guardado, apt o espejo. Lo lee el
# robot de prueba para dar su veredicto.
INSTALADO_CON=""
# Donde el espejo deja los .deb que baja, para no bajarlos dos veces.
CARPETA_DE_PASO=""

salida() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  fi
}

# «Está» no basta: tiene que ARRANCAR. Un lftp desempaquetado al que le
# falte una biblioteca está en el disco y no sube nada.
lftp_va() {
  command -v lftp > /dev/null 2>&1 && lftp --version > /dev/null 2>&1
}

# Lo que hay instalado: «paquete versión arquitectura», ordenado. Se
# mira antes y después de instalar; la diferencia es lo que hay que
# guardar (lftp y lo que haya arrastrado en ESTA máquina, ni más ni
# menos).
lista_instalados() {
  dpkg-query -W -f '${Package} ${Version} ${Architecture} ${db:Status-Status}\n' 2> /dev/null \
    | awk '$4 == "installed" { print $1, $2, $3 }' | LC_ALL=C sort
}

# ─── mirar ──────────────────────────────────────────────────────
mirar() {
  if command -v lftp > /dev/null; then
    echo "lftp ya está en la imagen: $(lftp --version | head -1)"
    salida hace-falta no
    salida instalado-con imagen
    return 0
  fi

  # La clave lleva la versión de Ubuntu y la arquitectura: el día que
  # GitHub cambie de imagen (en noviembre de 2026 va con Ubuntu 26.04),
  # los .deb de la vieja no casan con las bibliotecas de la nueva y hay
  # que bajarlos otra vez.
  local id=desconocido version=0 arquitectura extra clave
  if [ -r /etc/os-release ]; then
    id="$(. /etc/os-release; printf '%s' "${ID:-desconocido}")"
    version="$(. /etc/os-release; printf '%s' "${VERSION_ID:-0}")"
  fi
  arquitectura="$(dpkg --print-architecture 2> /dev/null || uname -m)"
  # La parte extra va DELANTE: la acción busca «la más reciente que
  # empiece por la clave», y con el extra detrás los robots de verdad
  # se llevarían también las cachés del robot de prueba.
  extra="${LFTP_CLAVE_EXTRA:-}"
  extra="${extra//[!A-Za-z0-9._-]/-}"
  clave="lftp-deb${extra:+-$extra}-${id}-${version}-${arquitectura}-v1"
  clave="${clave//[!A-Za-z0-9._-]/-}"
  echo "lftp no viene en la máquina ($id $version, $arquitectura): hay que instalarlo."
  echo "Clave de lo guardado: $clave"
  salida hace-falta si
  salida clave "$clave"
  # Una caché de GitHub no se puede reescribir: si hay que guardar, se
  # guarda con una clave que no exista (la fecha y un número al azar), y
  # al recuperar se pide «la más reciente que empiece por la clave». Así
  # un guardado malo se sustituye solo con el siguiente bueno.
  salida clave-nueva "$clave-$(date -u +%Y%m%dT%H%M%S 2> /dev/null || echo sin-fecha)-$RANDOM"
  return 0
}

# ¿Ha quedado ese paquete instalado DEL TODO (desempaquetado y
# configurado)? Es lo que dpkg llama «installed».
instalado_del_todo() {
  [ "$(dpkg-query -W -f '${db:Status-Status}' "$1" 2> /dev/null || true)" = installed ]
}

# ─── instalar un lote de .deb con dpkg, o dejarlo todo como estaba ──
# instalar_lote FICHERO.deb…   → 0 solo si lftp queda funcionando.
# Si lftp queda funcionando pero no ha entrado el lote entero, lo deja
# dicho en LOTE_A_MEDIAS.
LOTE_A_MEDIAS=no
instalar_lote() {
  local arquitectura deb paquete version suya estado
  local elegidos=() estrenados=() a_medias=()
  local hay_lftp=no
  LOTE_A_MEDIAS=no
  arquitectura="$(dpkg --print-architecture)"

  for deb in "$@"; do
    paquete="$(dpkg-deb -f "$deb" Package 2> /dev/null || true)"
    version="$(dpkg-deb -f "$deb" Version 2> /dev/null || true)"
    suya="$(dpkg-deb -f "$deb" Architecture 2> /dev/null || true)"
    if [ -z "$paquete" ] || [ -z "$version" ]; then
      echo "  $(basename "$deb") no se deja leer como paquete." >&2
      return 1
    fi
    case "$suya" in
      "$arquitectura" | all) ;;
      *) echo "  $paquete es de otra arquitectura ($suya): no vale para esta máquina." >&2
         return 1 ;;
    esac
    # Lo que la máquina ya trae igual o más nuevo NO se toca: una
    # imagen nueva puede traer ya una biblioteca que la vieja no
    # traía, y ponerle encima la guardada sería bajarla de versión.
    estado="$(dpkg-query -W -f '${db:Status-Status} ${Version}\n' "$paquete" 2> /dev/null | head -1 || true)"
    case "$estado" in
      "installed "*)
        if dpkg --compare-versions "${estado#installed }" ge "$version"; then
          echo "  $paquete ya viene en la máquina (${estado#installed }): no se toca."
          continue
        fi
        ;;
      *) estrenados+=("$paquete") ;;
    esac
    [ "$paquete" = lftp ] && hay_lftp=si
    elegidos+=("$deb")
  done

  if [ "$hay_lftp" != si ]; then
    echo "  Entre esos paquetes no está el de lftp." >&2
    return 1
  fi

  if timeout 120 sudo dpkg -i "${elegidos[@]}" && lftp_va; then
    return 0
  fi

  # dpkg se ha quedado a medias. Primero se retira lo que ha dejado a
  # medio poner (de lo que ha ESTRENADO, nunca de lo que la máquina ya
  # traía).
  echo "  dpkg no ha podido instalarlos todos; se retira lo que haya dejado a medias." >&2
  for paquete in ${estrenados[@]+"${estrenados[@]}"}; do
    instalado_del_todo "$paquete" || a_medias+=("$paquete")
  done
  if [ "${#a_medias[@]}" -gt 0 ]; then
    timeout 120 sudo dpkg --remove --force-depends "${a_medias[@]}" > /dev/null 2>&1 || true
  fi

  # Si lftp ha quedado instalado del todo y arranca, VALE: el tropiezo
  # ha sido de otro paquete del lote. Visto en las pruebas: a lo
  # guardado le faltaba una dependencia de openssh-client, que lftp solo
  # recomienda; dpkg dejó lftp puesto y funcionando, se atascó en el
  # otro y dio error; y aquí se retiraban los dos. Con apt funcionando
  # no pasaba nada (lo instalaba apt), pero con apt roto —el día para el
  # que esto existe— el paso fallaba teniendo un lftp bueno en la mano.
  # (dpkg solo da un paquete por instalado del todo cuando lo están
  # también todos los que necesita.)
  if instalado_del_todo lftp && lftp_va; then
    echo "  lftp sí ha quedado instalado y arranca: vale."
    LOTE_A_MEDIAS=si
    return 0
  fi

  # lftp no ha quedado bien: fuera todo lo estrenado, para que apt
  # arranque desde donde habría arrancado sin lo guardado, y no desde
  # un paquete roto.
  if [ "${#estrenados[@]}" -gt 0 ]; then
    timeout 120 sudo dpkg --remove --force-depends "${estrenados[@]}" > /dev/null 2>&1 || true
  fi
  return 1
}

# ─── 2 · de lo guardado, sin red ────────────────────────────────
# Los .deb guardados que han pasado la comprobación (los deja guardado_vale).
LO_GUARDADO=()

# es_de_ubuntu FICHERO.deb → 0 si ese .deb es, por su huella SHA-256,
# uno de los que la lista de paquetes de la máquina da para ese paquete.
# La lista es la que apt verificó con la firma de Ubuntu, y se mira sin
# red. El nombre del paquete lo dice el propio fichero, que podría
# mentir; lo que no puede es dar la huella de otro.
#
# Se piden TODAS las fichas del paquete («apt-cache show», sin decir
# versión) y vale la huella de cualquiera. Con «paquete=versión» apt
# enseña UNA sola ficha, y de una misma versión puede haber dos: en las
# máquinas de GitHub (Ubuntu 26.04) el lftp que se instala es
# «…_amd64v3.deb», la variante, y la otra ficha —«…_amd64.deb»— lleva
# otra huella. Con la ficha equivocada lo guardado no valdría nunca.
es_de_ubuntu() {
  local paquete huella
  paquete="$(dpkg-deb -f "$1" Package 2> /dev/null || true)"
  # Con forma de nombre de paquete, y nada más: va a la línea de órdenes
  # de apt-cache.
  printf '%s' "$paquete" | grep -q -E '^[a-z0-9][a-z0-9+.-]*$' || return 1
  huella="$(sha256sum < "$1" 2> /dev/null | awk '{ print $1 }')"
  printf '%s' "$huella" | grep -q -E '^[0-9a-f]{64}$' || return 1
  apt-cache show --all-versions "$paquete" 2> /dev/null \
    | awk -v huella="$huella" '/^SHA256:/ && $2 == huella { esta = 1 } END { exit !esta }'
}

# guardado_vale CARPETA → 0 si lo guardado es de fiar. NO toca la máquina.
guardado_vale() {
  local carpeta="$1" deb
  local paquetes=()
  LO_GUARDADO=()
  for deb in "$carpeta"/*.deb; do
    if [ -f "$deb" ]; then paquetes+=("$deb"); fi
  done
  if [ "${#paquetes[@]}" -eq 0 ]; then
    echo "No hay paquetes guardados de otra vez."
    return 1
  fi
  echo "Hay ${#paquetes[@]} paquete(s) guardado(s) de otra vez."

  # Antes de darle nada a dpkg (que corre como root): que lo guardado
  # sea, octeto a octeto, lo que se guardó. Una caché a medio escribir
  # o un .deb cortado se descartan aquí, sin haber tocado la máquina.
  if [ ! -f "$carpeta/SHA256SUMS" ]; then
    echo "  Les falta la lista de huellas: no se usan." >&2
    return 1
  fi
  if ! (cd "$carpeta" && sha256sum --check --strict --quiet SHA256SUMS); then
    echo "  Alguna huella no cuadra: lo guardado está estropeado y no se usa." >&2
    return 1
  fi
  for deb in "${paquetes[@]}"; do
    if ! awk -v nombre="$(basename "$deb")" \
         '{ sub(/^[0-9a-f]+ [ *]/, ""); if ($0 == nombre) esta = 1 } END { exit !esta }' \
         "$carpeta/SHA256SUMS"; then
      echo "  $(basename "$deb") no está en la lista de huellas: no se usa nada." >&2
      return 1
    fi
  done

  # Y que cada uno sea el que dice Ubuntu, no solo «el que se guardó»:
  # la lista de huellas de arriba viaja en la misma caché que los
  # paquetes, y quien pudiera cambiar unos podría rehacer la otra.
  # Probado: un «lftp» de pega con sus huellas rehechas se instalaba, y
  # el guion de su paquete corría como root.
  for deb in "${paquetes[@]}"; do
    if ! es_de_ubuntu "$deb"; then
      echo "  $(basename "$deb") no es el que dice la lista de paquetes de Ubuntu que trae la máquina (o la lista ya no conoce esa versión): no se usa lo guardado." >&2
      return 1
    fi
  done

  LO_GUARDADO=("${paquetes[@]}")
}

# ¿Tiene Ubuntu un lftp MÁS NUEVO que el guardado? Lo dice la lista de
# paquetes que la imagen ya trae: se mira sin red. Si no se sabe, no.
hay_uno_mas_nuevo() {
  local deb guardada="" candidata
  for deb in "${LO_GUARDADO[@]}"; do
    if [ "$(dpkg-deb -f "$deb" Package 2> /dev/null || true)" = lftp ]; then
      guardada="$(dpkg-deb -f "$deb" Version 2> /dev/null || true)"
    fi
  done
  [ -n "$guardada" ] || return 1
  candidata="$(LC_ALL=C apt-cache policy lftp 2> /dev/null | awk '/^ *Candidate:/ && !visto { print $2; visto = 1 }' || true)"
  case "$candidata" in "" | "(none)") return 1 ;; esac
  if dpkg --compare-versions "$candidata" gt "$guardada"; then
    echo "Ubuntu tiene un lftp más nuevo ($candidata) que el guardado ($guardada)."
    return 0
  fi
  return 1
}

# ─── 4 · de otro espejo, con la huella de la lista firmada ──────
# Solo vale si apt sabe decir, SIN red, qué instalaría (la lista de
# paquetes que la imagen trae). De ahí salen el nombre de cada fichero y
# su huella SHA-256; el espejo solo pone los octetos, y si no dan esa
# huella no se instalan. Por eso da igual de quién sea el espejo.
del_espejo() {
  local espejos="${LFTP_ESPEJOS:-}"
  [ -n "$espejos" ] || return 1
  command -v curl > /dev/null 2>&1 || return 1

  local empezado=$SECONDS tope=45
  local lineas linea direccion fichero resto paquete version ficha camino huella espejo bajado
  lineas="$(timeout 60 sudo apt-get install --print-uris -y -qq lftp 2> /dev/null | grep "^'" || true)"
  if [ -z "$lineas" ]; then
    echo "apt no sabe decir qué paquetes harían falta: no se puede probar otro espejo."
    return 1
  fi

  CARPETA_DE_PASO="$(mktemp -d)"
  echo "Se prueba a bajar los paquetes de otro espejo (no se le dan más de unos $tope segundos)…"
  while IFS= read -r linea; do
    # «'dirección' fichero tamaño huella». De la dirección se toma el
    # camino dentro del espejo (de «pool/» en adelante, que es igual en
    # todos), y del fichero, el paquete y la versión.
    direccion="$(printf '%s\n' "$linea" | awk '{ print $1 }' | tr -d "'")"
    fichero="$(printf '%s\n' "$linea" | awk '{ print $2 }')"
    case "$fichero" in
      *_*_*.deb) ;;
      *) echo "  Línea de apt que no se entiende; se deja el espejo." >&2; return 1 ;;
    esac
    case "$fichero" in */* | .*) return 1 ;; esac
    case "$direccion" in
      */pool/*) camino="pool/${direccion#*/pool/}" ;;
      *) echo "  apt no dice de dónde se baja $fichero; se deja el espejo." >&2; return 1 ;;
    esac
    case "$camino" in *..* | *[!A-Za-z0-9._+~%/-]*) return 1 ;; esac
    paquete="${fichero%%_*}"
    resto="${fichero#*_}"
    version="$(printf '%s' "${resto%_*}" | sed 's/%3[aA]/:/g')"
    # La huella, de la ficha de ESE fichero: de una misma versión puede
    # haber dos (en Ubuntu 26.04, «…_amd64.deb» y «…_amd64v3.deb»), cada
    # una con la suya. Se piden todas las fichas del paquete y se busca
    # la de este fichero: con «paquete=versión» apt enseña UNA sola, y
    # si fuera la otra aquí no habría huella que cotejar (ver
    # es_de_ubuntu). (Los awk leen hasta el final: si cortaran antes,
    # quien les escribe puede morir de un «tubo roto».)
    ficha="$(apt-cache show --all-versions "$paquete" 2> /dev/null || true)"
    huella="$(printf '%s\n' "$ficha" | awk -v camino="$camino" '
      /^$/ { suya = 0 }
      /^Filename:/ { suya = ($2 == camino) }
      /^SHA256:/ && suya && !vista { print $2; vista = 1 }')"
    if ! printf '%s' "$huella" | grep -q -E '^[0-9a-f]{64}$'; then
      echo "  $paquete no trae huella SHA-256 en la lista: no se baja de un espejo." >&2
      return 1
    fi

    bajado=no
    for espejo in $espejos; do
      if [ $((SECONDS - empezado)) -ge "$tope" ]; then
        echo "  Se acabó el tiempo del espejo." >&2
        return 1
      fi
      if curl -fsSL --proto '=http,https' --connect-timeout 8 --max-time 30 \
           -o "$CARPETA_DE_PASO/$fichero" "${espejo%/}/$camino" 2> /dev/null \
         && [ "$(sha256sum < "$CARPETA_DE_PASO/$fichero" | awk '{ print $1 }')" = "$huella" ]; then
        echo "  $paquete $version: bajado de $espejo, y su huella es la de la lista firmada."
        bajado=si
        break
      fi
      rm -f "$CARPETA_DE_PASO/$fichero"
    done
    if [ "$bajado" != si ]; then
      echo "  $paquete $version no se ha podido bajar bien de ningún espejo." >&2
      return 1
    fi
  done <<< "$lineas"

  local paquetes=() deb
  for deb in "$CARPETA_DE_PASO"/*.deb; do
    if [ -f "$deb" ]; then paquetes+=("$deb"); fi
  done
  [ "${#paquetes[@]}" -gt 0 ] || return 1
  instalar_lote "${paquetes[@]}"
}

# ─── 3 · con apt, como siempre ──────────────────────────────────
# Las mismas órdenes, los mismos topes y los mismos reintentos que
# llevaba el paso «Instalar lftp» de cada robot antes de esta acción.
con_apt() {
  local pausa="${LFTP_PAUSA:-10}" intento
  # Primero, instalar SIN actualizar la lista de paquetes: la imagen
  # del runner ya la trae y lo que se cuelga es el «update», no el
  # «install». Esto salvó el despliegue del día que los espejos
  # estuvieron caídos cuatro minutos y medio.
  if timeout 120 sudo apt-get install -y -qq lftp; then
    echo "lftp instalado con la lista que ya traía la imagen."
    INSTALADO_CON=apt
    return 0
  fi
  echo "No se ha podido con la lista de la imagen." >&2

  # La puerta nueva. Va AQUÍ y no al final porque el 11-11-2026 los
  # reintentos de abajo se comieron los seis minutos del paso sin
  # llegar a nada: al final no le habría quedado tiempo.
  if del_espejo; then
    echo "lftp instalado con los paquetes de otro espejo."
    INSTALADO_CON=espejo
    return 0
  fi

  echo "Toca actualizar la lista de paquetes." >&2
  for intento in 1 2 3; do
    echo "Instalando lftp (intento $intento de 3)…"
    if timeout 120 sudo apt-get update -qq \
       && timeout 120 sudo apt-get install -y -qq lftp; then
      echo "lftp instalado."
      INSTALADO_CON=apt
      return 0
    fi
    echo "Ha fallado o se ha colgado; se reintenta." >&2
    if [ "$intento" -lt 3 ]; then sleep $((intento * pausa)); fi
  done
  return 1
}

# ─── guardar para la próxima ────────────────────────────────────
# Fuera lo que NO se va a guardar: lo restaurado que no valía, o un lote
# a medio recoger. La acción guarda la carpeta tal como quede, y lo que
# quedara a medias se intentaría instalar la próxima vez.
vaciar() {
  find "$1" -mindepth 1 -maxdepth 1 -type f \
    \( -name '*.deb' -o -name SHA256SUMS -o -name contenido.txt \) -delete 2> /dev/null || true
}

# Tras un lote que no ha entrado entero: deja en la carpeta solo los
# .deb que SÍ han quedado instalados, con su lista de huellas rehecha,
# para que la acción los guarde y la próxima vez el lote entre limpio
# (si no, cada ejecución repetiría el tropiezo de dpkg y su limpieza).
# Es un «si se puede»: lftp ya está instalado.
podar() {
  local carpeta="$1" deb paquete version cuantos=0
  for deb in "$carpeta"/*.deb; do
    [ -f "$deb" ] || continue
    paquete="$(dpkg-deb -f "$deb" Package 2> /dev/null || true)"
    version="$(dpkg-deb -f "$deb" Version 2> /dev/null || true)"
    if [ -n "$paquete" ] \
       && [ "$(dpkg-query -W -f '${db:Status-Status} ${Version}' "$paquete" 2> /dev/null || true)" = "installed $version" ]; then
      cuantos=$((cuantos + 1))
    else
      rm -f "$deb" || return 1
    fi
  done
  [ "$cuantos" -gt 0 ] || return 1
  (cd "$carpeta" && sha256sum -- *.deb > SHA256SUMS) || return 1
  echo "Se guarda para la próxima vez solo lo que ha entrado ($cuantos paquete(s))."
}

# es_el_paquete FICHERO PAQUETE VERSIÓN ARQUITECTURA → 0 si ese .deb dice
# de sí mismo que es justo eso (o que vale para cualquier arquitectura).
es_el_paquete() {
  [ -f "$1" ] || return 1
  [ "$(dpkg-deb -f "$1" Package 2> /dev/null || true)" = "$2" ] || return 1
  [ "$(dpkg-deb -f "$1" Version 2> /dev/null || true)" = "$3" ] || return 1
  case "$(dpkg-deb -f "$1" Architecture 2> /dev/null || true)" in
    "$4" | all) return 0 ;;
  esac
  return 1
}

# Deja en la carpeta los .deb de lo que acaba de entrar en la máquina.
# Es un «si se puede»: lftp ya está instalado, y pase lo que pase aquí
# el paso sale bien. Si no se puede recoger todo, no se guarda nada (una
# caché a la que le falta una dependencia es peor que no tener caché).
recoger() {
  local carpeta="$1" antes="$2"
  local despues nuevos paquete version arquitectura origen donde candidato bajada="" cuantos=0 hay_lftp=no

  vaciar "$carpeta"

  if [ -z "$antes" ] || [ ! -s "$antes" ]; then
    echo "No se apuntó qué había instalado antes: no se guarda nada."
    return 1
  fi
  despues="$(mktemp)" || return 1
  lista_instalados > "$despues"
  nuevos="$(LC_ALL=C comm -13 "$antes" "$despues")"
  rm -f "$despues"
  if [ -z "$nuevos" ]; then
    echo "No se ve qué paquetes han entrado: no se guarda nada."
    return 1
  fi
  if [ "$(printf '%s\n' "$nuevos" | wc -l)" -gt 25 ]; then
    echo "Han entrado demasiados paquetes para ser solo lftp: no se guarda nada."
    return 1
  fi

  while read -r paquete version arquitectura; do
    [ -n "$paquete" ] || continue
    # El .deb de ese paquete en esa versión, se llame como se llame. El
    # nombre NO se puede adivinar: apt escribe los dos puntos de la
    # versión como «%3a», y desde Ubuntu 25.10 el final ya no es
    # siempre la arquitectura (el lftp de las máquinas de GitHub, que
    # van con Ubuntu 26.04, se llama «…_amd64v3.deb» y por dentro dice
    # «Architecture: amd64»). Así que se busca por el principio del
    # nombre y se da por bueno por lo que el paquete dice de sí mismo.
    origen=""
    for donde in "$CARPETA_DE_PASO" /var/cache/apt/archives; do
      [ -n "$donde" ] || continue
      for candidato in "$donde/${paquete}_${version//:/%3a}_"*.deb; do
        if es_el_paquete "$candidato" "$paquete" "$version" "$arquitectura"; then
          origen="$candidato"
          break 2
        fi
      done
    done
    if [ -z "$origen" ]; then
      # Hay máquinas que borran los .deb nada más instalarlos. La red
      # acaba de funcionar: se piden otra vez, sin instalar nada, a una
      # carpeta vacía (lo que aparezca en ella es lo bajado).
      bajada="$(mktemp -d)"
      (cd "$bajada" && timeout 60 apt-get download "$paquete=$version" > /dev/null 2>&1) || true
      for candidato in "$bajada"/*.deb; do
        if es_el_paquete "$candidato" "$paquete" "$version" "$arquitectura"; then
          origen="$candidato"
          break
        fi
      done
    fi
    if [ -z "$origen" ]; then
      echo "No se ha podido recoger el paquete de $paquete: no se guarda nada."
      return 1
    fi
    cp "$origen" "$carpeta/$(basename "$origen")" || return 1
    if [ -n "${bajada:-}" ]; then
      find "$bajada" -mindepth 1 -maxdepth 1 -type f -name '*.deb' -delete 2> /dev/null || true
      rmdir "$bajada" 2> /dev/null || true
      bajada=""
    fi
    [ "$paquete" = lftp ] && hay_lftp=si
    cuantos=$((cuantos + 1))
  done <<< "$nuevos"

  if [ "$hay_lftp" != si ]; then
    echo "Entre lo recogido no está lftp: no se guarda nada."
    return 1
  fi

  (cd "$carpeta" && sha256sum -- *.deb > SHA256SUMS) || return 1
  {
    echo "Paquetes de lftp guardados para instalar sin red."
    echo "Recogidos el $(date -u +%FT%TZ) con: $INSTALADO_CON."
    echo "Imagen de la máquina: ${ImageOS:-?} ${ImageVersion:-?}."
    printf '%s\n' "$nuevos" | sed 's/^/  /'
  } > "$carpeta/contenido.txt" || true
  echo "Guardado para la próxima vez ($cuantos paquete(s)):"
  printf '%s\n' "$nuevos" | awk '{ print "  " $1, $2 }'
}

# ─── instalar ───────────────────────────────────────────────────
instalar() {
  local carpeta="${LFTP_GUARDADO:?falta LFTP_GUARDADO}"
  local antes

  if lftp_va; then
    echo "lftp ya está: $(lftp --version | head -1)"
    salida instalado-con imagen
    salida guardar no
    return 0
  fi

  mkdir -p "$carpeta" 2> /dev/null || true
  antes="$(mktemp 2> /dev/null || true)"
  if [ -n "$antes" ]; then lista_instalados > "$antes"; fi

  if guardado_vale "$carpeta"; then
    # Lo guardado no es para siempre: si Ubuntu ya tiene un lftp más
    # nuevo, se prueba UNA vez con apt (y entonces se guarda el nuevo).
    # Si apt no puede —la red, los servidores—, vale el guardado: más
    # vale un lftp de hace un mes que no poder publicar.
    if hay_uno_mas_nuevo; then
      echo "Se prueba a instalarlo con apt; si no se puede, vale el guardado."
      if timeout 120 sudo apt-get install -y -qq lftp && lftp_va; then
        echo "lftp instalado con apt, en su versión nueva."
        INSTALADO_CON=apt
      else
        echo "apt no ha podido: se instala el guardado." >&2
      fi
    fi
    if [ -z "$INSTALADO_CON" ]; then
      echo "Se instalan los paquetes guardados, sin tocar la red."
      if instalar_lote "${LO_GUARDADO[@]}"; then
        echo "lftp instalado de lo guardado, sin red: $(lftp --version | head -1)"
        salida instalado-con guardado
        if [ "$LOTE_A_MEDIAS" = si ] && podar "$carpeta"; then
          salida guardar si
        else
          salida guardar no
        fi
        if [ -n "$antes" ]; then rm -f "$antes"; fi
        return 0
      fi
    fi
  fi

  if [ -z "$INSTALADO_CON" ] && ! con_apt; then
    if [ -n "$antes" ]; then rm -f "$antes"; fi
    echo "No se ha podido instalar lftp tras tres intentos." >&2
    return 1
  fi
  salida instalado-con "$INSTALADO_CON"

  if recoger "$carpeta" "$antes"; then
    salida guardar si
  else
    vaciar "$carpeta"
    salida guardar no
  fi
  if [ -n "$antes" ]; then rm -f "$antes"; fi
  if [ -n "$CARPETA_DE_PASO" ] && [ -d "$CARPETA_DE_PASO" ]; then
    find "$CARPETA_DE_PASO" -mindepth 1 -maxdepth 1 -type f -name '*.deb' -delete 2> /dev/null || true
    rmdir "$CARPETA_DE_PASO" 2> /dev/null || true
  fi
  return 0
}

case "$FASE" in
  mirar) mirar; exit $? ;;
  instalar) instalar; exit $? ;;
  *) echo "Fase desconocida: $FASE" >&2; exit 1 ;;
esac
