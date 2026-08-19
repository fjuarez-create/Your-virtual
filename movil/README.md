# La app de UNIK repasos para el iPhone

Esta carpeta es el **envoltorio**: la app que se descarga de la App Store
y que por dentro abre `repasos.unikdi.com`.

Lo importante de montarlo así: **cada mejora de la web llega sola a todos
los móviles**. Nadie tiene que actualizar nada. Solo hay que volver a
compilar y subir a Apple cuando cambie algo del propio envoltorio —un
permiso nuevo del móvil, el icono, las notificaciones—, y eso pasa una
vez cada muchos meses.

---

## Lo que ya está hecho

- El proyecto de iOS, con Capacitor.
- El icono de la tienda (1024 px) y la pantalla de arranque, sacados del
  logo de la aplicación.
- Los textos de los permisos en español: iOS los enseña tal cual cuando
  pide la cámara, el micrófono o el carrete.
- La app blindada a su propio dominio (`repasos.unikdi.com`). Eso hace
  dos cosas: que funcione sin cobertura una vez abierta, y que ningún
  enlace pueda sacar a nadie de la aplicación sin querer.
- Vertical y solo vertical, que es como está hecho el diseño.
- Una pantalla propia para cuando no se llega al servidor, que dice que
  lo apuntado sigue guardado en el móvil.
- Dos formas de compilar y subir: Xcode Cloud (más fácil) y un robot de
  GitHub (más independiente).

## Datos de la app

| | |
|---|---|
| Nombre | UNIK repasos |
| Identificador | `com.unikdi.repasos` |
| Versión | 1.0 |
| Mínimo | iPhone con iOS 13 o superior |
| Qué abre | `https://repasos.unikdi.com` |

El identificador **tiene que ser exactamente el mismo** que el que crees
en Apple. Si prefieres otro, dilo antes de crear nada y lo cambio en un
minuto; después de la primera subida ya no se puede tocar.

---

## Lo que tienes que hacer tú (una sola vez)

Son cuatro pasos y ninguno necesita programar. Todo se hace en la web de
Apple.

### 1. Crear la app en App Store Connect

En [appstoreconnect.apple.com](https://appstoreconnect.apple.com) →
**Mis apps** → **+** → **Nueva app**.

- Plataforma: **iOS**
- Nombre: **UNIK repasos**
- Idioma principal: **Español (España)**
- ID del paquete: elige `com.unikdi.repasos` de la lista. Si no aparece,
  primero hay que crearlo en
  [developer.apple.com](https://developer.apple.com/account/resources/identifiers)
  → **Identifiers** → **+** → **App IDs** → **App**, con ese mismo texto.
- SKU: `unik-repasos` (es un código interno tuyo, da igual cuál).

### 2. Rellenar la ficha de la tienda

En `movil/tienda/` tienes los textos ya escritos para copiar y pegar:
descripción, novedades, palabras clave y la política de privacidad.

Te faltarán las **capturas de pantalla**. Apple pide como mínimo las de
iPhone de 6,7 pulgadas. Dime cuando llegues aquí y te las genero del
tamaño exacto.

### 3. Elegir cómo se compila

**Opción A — Xcode Cloud. Es la que te recomiendo.**

Es el sistema de Apple, va incluido en tu cuenta de desarrollador y **no
hay que exportar ni un certificado**: Apple firma la app él solo.

En App Store Connect → tu app → pestaña **Xcode Cloud** → **Empezar**.
Conecta el repositorio de GitHub, y cuando pregunte:

- Proyecto o espacio de trabajo: `movil/ios/App/App.xcworkspace`
- Esquema: `App`
- Acción: **Archive**, y marca **Enviar a TestFlight**

El guion que prepara todo antes de compilar ya está puesto en el
repositorio; Xcode Cloud lo encuentra solo.

**Opción B — el robot de GitHub.**

Si prefieres no depender de Apple para compilar, está el robot
`app-ios.yml`, que hace lo mismo desde GitHub. Necesita siete secretos
(están explicados en la cabecera del propio fichero) y para prepararlos
hay que exportar certificados desde un Mac. Es más trabajo la primera
vez. Si te decides por esta, dímelo y te lo explico paso a paso.

### 4. Enviar a revisión

Cuando la compilación aparezca en TestFlight, pruébala en tu iPhone. Si
está bien, en App Store Connect → **Distribución** → seleccionas la
compilación y le das a **Añadir para revisión**.

La primera revisión tarda entre unas horas y unos días. **Las siguientes
mejoras de la web no pasan por aquí**: llegan solas.

---

## El aviso importante: la norma 4.2 de Apple

Apple rechaza las apps que son «una web reempaquetada sin más». Es un
rechazo frecuente y conviene saberlo antes de enviar.

**Lo que juega a favor de esta app:**

- Funciona sin cobertura: apunta tareas y fotos en el móvil y las sube
  cuando hay señal. No es una web que necesita internet para todo.
- Usa la cámara y el micrófono del móvil.
- Genera informes en PDF y los comparte con la hoja del sistema.
- Está pensada para el móvil de arriba abajo, no es una web de
  ordenador encogida.

**Lo que la haría segura del todo:** las notificaciones. Una app que
avisa al jefe de obra de que tiene tres tareas rechazadas ya no se
parece en nada a una página web. Necesita trabajo en el servidor y no
está en esta primera versión.

Si Apple rechaza la primera, lo normal es que pidan justo eso. Se
responde por el mismo panel, se añaden las notificaciones y se vuelve a
enviar.

---

## Para el que venga detrás

Compilar a mano, con un Mac y Xcode:

```
cd movil
npm install
npx cap sync ios
open ios/App/App.xcworkspace
```

Y en Xcode: elegir el equipo en **Signing & Capabilities**, y
**Product → Archive**.

Lo que **no** hay que hacer nunca: meter el código de la web dentro de
la app. La app apunta a `repasos.unikdi.com` a propósito, y ahí está
todo el valor de este montaje. Si algún día se empaqueta la web dentro,
cada cambio de un botón vuelve a ser una versión en la tienda y una
espera de días.
