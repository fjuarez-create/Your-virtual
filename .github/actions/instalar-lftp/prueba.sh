#!/usr/bin/env bash
#
# prueba.sh — lo que necesita el robot de prueba
# (.github/workflows/probar-instalar-lftp.yml) para demostrar, en una
# máquina de GitHub, que la acción de al lado instala lftp aunque los
# servidores de paquetes de Ubuntu no contesten.
#
#   prueba.sh preparar chivato|pega|cortado|de-verdad
#       Deja la máquina como la situación pide ANTES de llamar a la
#       acción:
#         chivato  apt-get funciona, pero apunta cada vez que lo llaman
#                  (para poder decir «no se le ha llamado ni una vez»)
#         pega     apt-get falla SIEMPRE, con el mensaje del 11-11-2026
#         cortado  apt-get es el de verdad, pero a los servidores de
#                  Ubuntu se les apunta a un puerto cerrado: no contesta
#                  ninguno, que es lo que pasó aquel día
#       Y si la imagen ya trajera lftp, lo quita: con él puesto la
#       acción no hace nada y no habría qué probar.
#
#   prueba.sh veredicto 1|2|3|4|5
#       Mira lo que ha hecho la acción y lo dice en el registro y en el
#       resumen de la ejecución, con una palabra por delante: BIEN, MAL o
#       NO CONCLUYENTE.
#
# NUNCA sale con error, pase lo que pase: a Fran le llega un correo por
# cada ejecución que acaba en rojo, y esta prueba existe para MIRAR un
# fallo, no para dar otro. Lo que haya ido mal se lee en el veredicto.
#
# No usa ningún secreto ni toca el servidor de la app. Todo lo que rompe
# lo rompe en la máquina de GitHub de esa ejecución, que se tira al
# acabar.

set -u
trap 'exit 0' EXIT

ORDEN="${1:-}"
CUAL="${2:-}"
LLAMADAS="${LLAMADAS_A_APT:-${RUNNER_TEMP:-/tmp}/llamadas-a-apt.txt}"
# Si existe, el chivato de apt-get no se pudo poner (lo deja «preparar»).
SIN_CHIVATO="${RUNNER_TEMP:-/tmp}/sin-chivato-de-apt"

salida() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"; fi
}
al_resumen() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"; fi
}

# ─── preparar ───────────────────────────────────────────────────
preparar() {
  local modo="$1" maquina
  maquina="$( (. /etc/os-release 2> /dev/null; printf '%s' "${PRETTY_NAME:-?}") )"
  echo "Máquina: $maquina, imagen ${ImageOS:-?} ${ImageVersion:-?}."

  if command -v lftp > /dev/null 2>&1; then
    echo "La imagen YA trae lftp: se quita, o no habría nada que probar."
    sudo dpkg --remove lftp > /dev/null 2>&1 || true
    if command -v lftp > /dev/null 2>&1; then
      echo "::warning::No se ha podido quitar el lftp de la imagen: la prueba no va a decir nada."
    fi
    salida venia si
  else
    echo "La imagen no trae lftp (es lo que se esperaba)."
    salida venia no
  fi

  : > "$LLAMADAS" 2> /dev/null || true
  chmod 666 "$LLAMADAS" 2> /dev/null || true

  case "$modo" in
    chivato | pega)
      # Se sustituye el apt-get DE VERDAD, no se le pone otro delante en
      # el PATH: así da igual con qué PATH lo busque sudo.
      if [ ! -e /usr/bin/apt-get.de-verdad ]; then
        sudo mv /usr/bin/apt-get /usr/bin/apt-get.de-verdad || true
      fi
      {
        echo '#!/bin/sh'
        echo "echo \"\$*\" >> '$LLAMADAS'"
        if [ "$modo" = pega ]; then
          echo "echo \"E: Temporary failure resolving 'security.ubuntu.com' (apt roto A PROPÓSITO por la prueba)\" >&2"
          echo 'exit 100'
        else
          echo 'exec /usr/bin/apt-get.de-verdad "$@"'
        fi
      } | sudo tee /usr/bin/apt-get > /dev/null
      sudo chmod 755 /usr/bin/apt-get || true
      if [ "$modo" = pega ]; then
        echo "apt-get, roto a propósito: falla siempre, como el 11-11-2026."
      elif apt-get --version > /dev/null 2>&1; then
        echo "apt-get, con chivato: funciona, y apunta cada llamada."
      else
        # El chivato no sabe pasarle el recado al apt-get de verdad en
        # esta imagen: se quita, y se deja dicho para que el veredicto
        # no presuma de «ni una llamada» sin haber podido contarlas.
        sudo mv -f /usr/bin/apt-get.de-verdad /usr/bin/apt-get || true
        : > "$SIN_CHIVATO" 2> /dev/null || true
        echo "::warning::El chivato de apt-get no funciona en esta imagen: se ha quitado, y las llamadas a apt-get no se van a poder contar."
      fi
      ;;
    cortado)
      # Todos los servidores de los que apt baja algo en esta máquina,
      # más los de Ubuntu de siempre, a un puerto cerrado de aquí mismo.
      local servidores
      servidores="$( { apt-cache policy 2> /dev/null | grep -o -E 'https?://[^/ ]+' | sed -E 's#^https?://##';
                       cat /etc/apt/apt-mirrors.txt 2> /dev/null | grep -o -E 'https?://[^/ 	]+' | sed -E 's#^https?://##';
                       printf '%s\n' archive.ubuntu.com security.ubuntu.com azure.archive.ubuntu.com ports.ubuntu.com esm.ubuntu.com; } \
                     | grep -E '^[A-Za-z0-9.-]+$' | LC_ALL=C sort -u | tr '\n' ' ')"
      echo "127.0.0.1 $servidores" | sudo tee -a /etc/hosts > /dev/null
      echo "Cortados (apuntan a un puerto cerrado): $servidores"
      ;;
    de-verdad) echo "apt-get, el de verdad y sin tocar." ;;
    *) echo "::warning::Modo de preparar desconocido: $modo" ;;
  esac
  : > "$LLAMADAS" 2> /dev/null || true
}

# ─── ¿reconoce la lista de la imagen lo recién recogido? ────────
# Solo informa, y solo en la situación 1. Es la pregunta que la acción
# le hará a lo guardado la próxima vez, antes de dárselo a dpkg (lftp.sh,
# es_de_ubuntu): que cada paquete sea, por su huella, uno de los que la
# lista de paquetes de la máquina da por buenos. Y solo se puede
# contestar aquí: las máquinas de GitHub van con Ubuntu 26.04, donde el
# paquete de lftp es una variante («…_amd64v3.deb») y hay que ver que su
# ficha sale. Si aquí dijera que NO, las situaciones 2 y 3 no podrán
# usar lo guardado, y esta línea dice por qué.
lo_reconoce_la_lista() {
  local carpeta="${RUNNER_TEMP:-/tmp}/lftp-guardado" deb paquete huella fichas si=0 no=0
  for deb in "$carpeta"/*.deb; do
    [ -f "$deb" ] || continue
    paquete="$(dpkg-deb -f "$deb" Package 2> /dev/null || true)"
    huella="$(sha256sum < "$deb" 2> /dev/null | awk '{ print $1 }')"
    fichas="$(apt-cache show --all-versions "${paquete:-nada}" 2> /dev/null | grep -c '^SHA256:' || true)"
    if [ -n "$paquete" ] && [ -n "$huella" ] \
       && apt-cache show --all-versions "$paquete" 2> /dev/null \
            | awk -v huella="$huella" '/^SHA256:/ && $2 == huella { esta = 1 } END { exit !esta }'; then
      si=$((si + 1))
      echo "  La lista de la imagen reconoce $(basename "$deb") (fichas de $paquete en la lista: ${fichas:-0})."
    else
      no=$((no + 1))
      echo "  La lista de la imagen NO reconoce $(basename "$deb") (fichas de ${paquete:-?} en la lista: ${fichas:-0})."
    fi
  done
  if [ $((si + no)) -eq 0 ]; then
    echo "  No hay paquetes recogidos que cotejar con la lista de la imagen."
    return 0
  fi
  if [ "$no" -eq 0 ]; then
    al_resumen "La lista de paquetes de la imagen reconoce los $si paquete(s) recogido(s): la próxima vez la acción los dará por buenos." ""
  else
    al_resumen "**OJO:** la lista de paquetes de la imagen NO reconoce $no de $((si + no)) paquete(s) recogido(s). La acción no usará lo guardado (seguirá instalando con apt, como siempre) y las situaciones 2 y 3 no saldrán BIEN: hay que mirar el cotejo con la lista (lftp.sh, es_de_ubuntu)." ""
  fi
  return 0
}

# ─── veredicto ──────────────────────────────────────────────────
# Lo que ha hecho la acción llega por el entorno (lo pone el robot):
#   RESULTADO   success o failure: cómo acabó el paso de la acción
#   CON         imagen, guardado, apt o espejo
#   RECUPERADO  la clave de la caché que se recuperó (vacío: ninguna)
#   RECOGIDO    «si» cuando se recogieron los paquetes para guardarlos
#   GUARDADO    «si» cuando el paso de guardar corrió sin error. NO
#               prueba que la caché los aceptara: actions/cache, cuando
#               no consigue guardar, avisa y sale bien igual. Que
#               quedaron guardados lo dice la situación 2, al
#               recuperarlos (y la línea «Cache saved with key: …» del
#               registro de la 1).
veredicto() {
  local situacion="$1"
  local resultado="${RESULTADO:-}" con="${CON:-}" recuperado="${RECUPERADO:-}"
  local recogido="${RECOGIDO:-}" guardado="${GUARDADO:-}"
  local va=no version="" llamadas=0 palabra="" frase="" titulo=""

  if command -v lftp > /dev/null 2>&1 && lftp --version > /dev/null 2>&1; then
    va=si
    version="$(lftp --version 2> /dev/null | head -1)"
  fi
  if [ -f "$LLAMADAS" ]; then llamadas="$(grep -c . "$LLAMADAS" 2> /dev/null || true)"; fi
  llamadas="${llamadas:-0}"

  echo "Lo que ha pasado: el paso acabó en «$resultado»; lftp arranca: $va; instalado con: «${con:-nada}»;"
  echo "  caché recuperada: «${recuperado:-ninguna}»; paquetes recogidos: «${recogido:-no}»; mandados a la caché: «${guardado:-no}»;"
  echo "  llamadas a apt-get: $llamadas."
  if [ -s "$LLAMADAS" ]; then sed 's/^/    apt-get /' "$LLAMADAS" | head -20; fi

  case "$situacion" in
    1)
      titulo="1 · Sin caché: instala con apt, como siempre, y guarda"
      if [ "$resultado" = success ] && [ "$va" = si ] && [ "$con" = apt ] && [ "$recogido" = si ] && [ "$guardado" = si ]; then
        palabra=BIEN; frase="Sin nada guardado, lftp se ha instalado con apt y sus paquetes se han mandado a la caché (que han quedado guardados lo dice la situación 2, si los recupera)."
      elif [ "$resultado" = success ] && [ "$va" = si ] && [ "$con" = espejo ] && [ "$guardado" = si ]; then
        palabra=BIEN; frase="Sin nada guardado, apt NO ha podido (¿están fallando ahora los servidores de Ubuntu?) y lftp ha salido de otro espejo; sus paquetes se han mandado a la caché (que han quedado guardados lo dice la situación 2, si los recupera)."
      elif [ "$resultado" = success ] && [ "$va" = si ] && [ "$con" = guardado ]; then
        palabra="NO CONCLUYENTE"; frase="Se ha instalado de una caché que no tenía que existir (la clave de esta prueba es nueva): no se ha probado el camino de apt."
      elif [ "$resultado" = success ] && [ "$va" = si ]; then
        palabra="NO CONCLUYENTE"; frase="lftp se ha instalado (con ${con:-?}), pero sus paquetes NO se han mandado a la caché (recogidos: ${recogido:-no}; mandados: ${guardado:-no}). Un despliegue saldría igual que hoy; lo que no se gana es la instalación sin red."
      elif [ "$con" = imagen ]; then
        palabra="NO CONCLUYENTE"; frase="La imagen ya trae lftp y no se ha podido quitar: no hay nada que instalar ni que probar."
      else
        palabra=MAL; frase="Sin nada guardado, lftp NO se ha instalado. Si apt funciona en esta máquina, esto es peor que antes de la acción: hay que mirarlo antes de fiarse de ella."
      fi
      ;;
    2)
      titulo="2 · Con caché: instala sin red"
      if [ "$resultado" = success ] && [ "$va" = si ] && [ "$con" = guardado ] && [ -e "$SIN_CHIVATO" ]; then
        palabra="NO CONCLUYENTE"; frase="lftp se ha instalado de lo guardado, pero el chivato de apt-get no se pudo poner en esta imagen: no se puede asegurar que no se le haya llamado (la situación 3, con apt-get roto, sí lo asegura)."
      elif [ "$resultado" = success ] && [ "$va" = si ] && [ "$con" = guardado ] && [ "$llamadas" = 0 ]; then
        palabra=BIEN; frase="Con lo guardado, lftp se ha instalado sin llamar a apt-get ni una vez."
      elif [ "$resultado" = success ] && [ "$va" = si ] && [ "$con" = guardado ]; then
        palabra=MAL; frase="Se ha instalado de lo guardado, pero se ha llamado a apt-get $llamadas vez/veces: no es «sin red»."
      elif [ -z "$recuperado" ]; then
        palabra="NO CONCLUYENTE"; frase="La caché que guardó la situación 1 no se ha recuperado (¿llegó a guardarse?): lftp se ha instalado con «${con:-nada}», no de lo guardado."
      else
        palabra=MAL; frase="Había caché («$recuperado») y lftp NO se ha instalado de ella, sino con «${con:-nada}» (el paso acabó en «$resultado»)."
      fi
      ;;
    3)
      titulo="3 · apt roto a propósito y con caché: instala igual"
      local apt_roto=no
      if ! sudo apt-get update > /dev/null 2>&1; then apt_roto=si; fi
      echo "  ¿apt-get está roto de verdad?: $apt_roto."
      if [ "$apt_roto" != si ]; then
        palabra="NO CONCLUYENTE"; frase="apt-get NO ha quedado roto en esta máquina: la situación no prueba nada."
      elif [ "$resultado" = success ] && [ "$va" = si ] && [ "$con" = guardado ]; then
        palabra=BIEN; frase="Con apt-get roto (falla siempre, como el 11-11-2026), lftp se ha instalado igual, de lo guardado."
      elif [ -z "$recuperado" ]; then
        palabra="NO CONCLUYENTE"; frase="La caché que guardó la situación 1 no se ha recuperado (¿llegó a guardarse?): con apt roto y sin caché no hay de dónde instalar."
      else
        palabra=MAL; frase="Con apt-get roto y la caché recuperada («$recuperado»), lftp NO se ha instalado (el paso acabó en «$resultado»)."
      fi
      ;;
    4)
      titulo="4 · Control: apt roto y SIN caché tiene que fallar"
      if [ "$resultado" = failure ] && [ "$va" = no ]; then
        palabra=BIEN; frase="Sin caché y con apt-get roto, el paso falla, como fallaba: el apt de pega rompe de verdad, y las situaciones 2 y 3 no salen bien por casualidad."
      elif [ "$va" = si ]; then
        palabra="NO CONCLUYENTE"; frase="Con apt-get roto y sin caché, lftp se ha instalado igual (con «${con:-nada}»): el apt de pega no rompe lo que debía y la situación 3 no prueba lo que dice."
      else
        palabra="NO CONCLUYENTE"; frase="El paso acabó en «$resultado» sin instalar lftp: no es el fallo limpio que se esperaba."
      fi
      ;;
    5)
      titulo="5 · Servidores de Ubuntu cortados y sin caché: sale de otro espejo"
      if [ "$resultado" = success ] && [ "$va" = si ] && [ "$con" = espejo ]; then
        palabra=BIEN; frase="Con los servidores de Ubuntu cortados y sin nada guardado, lftp ha salido de otro espejo, con la huella de la lista firmada de la imagen."
      elif [ "$resultado" = success ] && [ "$va" = si ]; then
        palabra="NO CONCLUYENTE"; frase="lftp se ha instalado con «${con:-nada}» y no del espejo: los servidores de Ubuntu no han quedado cortados del todo en esta máquina."
      else
        palabra=MAL; frase="Con los servidores de Ubuntu cortados y sin caché, ningún espejo ha servido los paquetes: esta puerta, hoy, no salva un despliegue (las situaciones 2 y 3, la de la caché, no dependen de ella)."
      fi
      ;;
    *)
      titulo="Situación desconocida ($situacion)"; palabra="NO CONCLUYENTE"; frase="No se sabe qué había que mirar."
      ;;
  esac

  echo ""
  echo "VEREDICTO · $titulo → $palabra"
  echo "  $frase"
  if [ "$va" = si ]; then echo "  ($version)"; fi
  al_resumen "### $titulo" "" "**$palabra** — $frase" ""
  salida veredicto "$palabra"
  salida frase "$frase"
  if [ "$situacion" = 1 ]; then lo_reconoce_la_lista; fi
}

case "$ORDEN" in
  preparar) preparar "$CUAL" ;;
  veredicto) veredicto "$CUAL" ;;
  *) echo "::warning::prueba.sh: orden desconocida «$ORDEN»." ;;
esac
exit 0
