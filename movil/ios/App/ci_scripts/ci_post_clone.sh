#!/bin/sh
# Lo que Xcode Cloud tiene que hacer nada más bajarse el repositorio,
# antes de compilar: preparar el envoltorio de Capacitor.
#
# Existe porque el proyecto de iOS no se basta solo: necesita que antes
# se instalen las piezas de Capacitor y se copien dentro. En la máquina
# de Apple no hay nada instalado de partida, así que se instala aquí.
set -e

echo "─── Instalando Node"
brew install node@20
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

echo "─── Instalando lo del envoltorio"
cd "$CI_PRIMARY_REPOSITORY_PATH/movil"
npm ci

echo "─── Sincronizando el proyecto de iOS"
npx cap sync ios

echo "─── Instalando las dependencias nativas"
cd "$CI_PRIMARY_REPOSITORY_PATH/movil/ios/App"
pod install --repo-update

echo "─── Listo para compilar"
