# La app de UNIK Works para el iPhone

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
- Una pantalla propia para cuando no se llega al servidor. No acusa a la
  primera: prueba en silencio unos segundos —los tropiezos del arranque
  se curan solos— y únicamente si el servidor sigue sin contestar
  confiesa, recordando que lo apuntado sigue guardado en el móvil. En
  cuanto vuelve a contestar, entra sola en la aplicación.
- Un robot de GitHub que compila, **se firma él solo** y sube a
  TestFlight. Sin Mac y sin exportar ningún certificado: lo único que
  hace falta es una clave de App Store Connect, que se saca de la web de
  Apple en tres clics.

## Datos de la app

| | |
|---|---|
| Nombre | UNIK Works |
| Identificador | `com.unikdi.repasos` |
| Versión | 1.0 |
| Mínimo | iPhone con iOS 15.6 o superior |
| Dispositivos | Solo iPhone (en un iPad se instala igual, se ve como en un iPhone) |
| Qué abre | `https://repasos.unikdi.com` |

Lo de **solo iPhone** no es un capricho: Apple obliga a que toda app que
se declare para iPad se pueda poner de lado y en media pantalla junto a
otra. El diseño está hecho a lo alto y de lado no se sostiene, así que
la app se declara de iPhone y en el iPad funciona igual, a pantalla de
iPhone. De paso, la ficha de la tienda solo pide capturas de iPhone.

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
- Nombre: **UNIK Works**
- Idioma principal: **Español (España)**
- ID del paquete: elige `com.unikdi.repasos` de la lista. Si no aparece,
  primero hay que crearlo en
  [developer.apple.com](https://developer.apple.com/account/resources/identifiers)
  → **Identifiers** → **+** → **App IDs** → **App**, con ese mismo texto.
- SKU: `unik-repasos` (es un código interno tuyo, da igual cuál).

Al registrar el App ID, en la lista larga de **Capabilities** hay que
marcar **una sola**: **Push Notifications**. Todas las demás se quedan
sin marcar: son para cosas que esta app no hace (Apple Pay, iCloud,
HealthKit, CarPlay…). La cámara y el micrófono no están en esa lista
porque no son capacidades: van dentro de la app y ya están puestos.

Si al marcar Push Notifications sale un botón **Configure**, no hay que
tocarlo: eso es el sistema antiguo de certificados. El nuevo es la
clave del paso siguiente.

### 1 bis. Crear la clave de notificaciones

En [developer.apple.com](https://developer.apple.com/account/resources/authkeys)
→ **Keys** → **+**:

- Key Name: `Notificaciones UNIK Works`
- Marca **Apple Push Notifications service (APNs)**
- **Continue** → **Register**

Sale un fichero `.p8` para descargar. **Solo se puede descargar una
vez**: guárdalo en tu bloc de notas junto al **Key ID** (10 caracteres)
que aparece en la misma pantalla. Si se pierde, no se recupera: hay que
revocar la clave y crear otra.

Esa clave hace falta la semana que viene, cuando enchufemos las
notificaciones de verdad. Va del bloc de notas a los secretos de
GitHub, sin pasar por ninguna conversación.

### 1 ter. La cuenta para el revisor de Apple — HECHA A MANO

**Esto ya está resuelto: Fran creó la cuenta del revisor él mismo desde
la propia aplicación.** No hace falta poner ningún secreto ni lanzar
ningún despliegue por este motivo.

Lo que sigue queda escrito por si algún día conviene que la cuenta se
cree y se retire sola —por ejemplo, para no dejarla viva entre revisión
y revisión—. Mientras no existan los dos secretos, el mecanismo no hace
absolutamente nada: ni crea, ni toca, ni desactiva ninguna cuenta.

<details>
<summary>Cómo sería si se quisiera automática</summary>

En **Settings → Secrets and variables → Actions** del repositorio, añade

| Secreto | Valor |
|---|---|
| `REVISION_EMAIL` | el correo de la cuenta |
| `REVISION_PASSWORD` | su contraseña |

y al siguiente despliegue la cuenta existe y entra. Le pone permiso de
dirección facultativa, para que el revisor vea también los botones de
verificar y de rechazar, que son la mitad de la aplicación.

Esos dos datos son los que van luego en App Store Connect, en
**Información de revisión de la app → Inicio de sesión obligatorio**.

**Cuando Apple valide la app, borra los dos secretos.** Al siguiente
despliegue el fichero desaparece del servidor y la cuenta se desactiva
sola. No hay que acordarse de nada más.

La contraseña no está en el repositorio ni en ninguna conversación: va
de tus secretos al servidor por el mismo camino que las credenciales
del FTP. El repositorio es público, y una contraseña escrita ahí queda
publicada para siempre aunque se borre después.

</details>

### 2. Rellenar la ficha de la tienda

En `movil/tienda/` tienes los textos ya escritos para copiar y pegar:
descripción, novedades, palabras clave y la política de privacidad.

Las **capturas de pantalla** están en `movil/tienda/capturas/`, ya con
la medida exacta (1290 × 2796). Al ser la app solo de iPhone, no se
piden capturas de iPad. Si prefieres las tuyas hechas con la obra de
verdad, mándamelas y te las dejo del tamaño que exige Apple.

### 3. Dar de alta la API de App Store Connect y su clave

Aquí está la parte que hace que no necesites ni Mac ni certificados.

**a) Pedir el permiso.** En App Store Connect →
**Usuarios y acceso** → pestaña **Integraciones** → **API de App Store
Connect**. Si sale un botón **Solicitar acceso**, dale. Es un permiso
para tu organización y solo se pide una vez; suele concederse en el
momento.

**b) Crear la clave.** En esa misma pantalla, botón **+**:

- Nombre: `Robot de compilación`
- Acceso: **App Manager** (necesita poder crear certificados y subir
  compilaciones; con «Developer» no llega)

Al crearla te deja descargar un fichero **`.p8`**. **Solo se puede
descargar una vez.** Guárdalo.

**c) Apuntar dos datos.** En la misma pantalla verás:

- El **Key ID** de la clave que acabas de crear (10 caracteres).
- El **Issuer ID**, arriba, común a todas las claves.

El Team ID no hace falta apuntarlo: ya está puesto en
`movil/fastlane/Appfile`. No es un secreto —viaja dentro de cada app
publicada en la App Store y sale a la vista en la web de Apple, al lado
del nombre de la empresa—, así que guardarlo aparte solo añadía un paso.

**d) Ponerlo en los secretos.** En GitHub, en el repositorio →
**Settings → Secrets and variables → Actions** → *New repository
secret*, tres veces:

| Secreto | Qué se pega |
|---|---|
| `APPSTORE_CLAVE_ID` | el Key ID |
| `APPSTORE_EMISOR_ID` | el Issuer ID |
| `APPSTORE_CLAVE_P8` | el contenido del `.p8` **entero** |

Para el `.p8`: ábrelo con el Bloc de notas, selecciona todo y pega. Tiene
que empezar por `-----BEGIN PRIVATE KEY-----`. No hay que convertirlo a
nada.

**e) Lanzar la compilación.** Dime que están puestos y la lanzo yo. O la
lanzas tú: en GitHub, pestaña **Actions** → **Publicar la app de
iPhone** → **Run workflow**.

Tarda entre 15 y 25 minutos y la deja en TestFlight.

**Lo que hace el robot por dentro**, para que sepas qué está pasando: se
crea él mismo el certificado de distribución y el perfil, compila,
firma, sube, y en la siguiente compilación retira el certificado de la
anterior. Apple solo deja tener dos o tres vivos a la vez, por eso
barre antes de sembrar. Retirar un certificado no afecta a las apps ya
publicadas: Apple las vuelve a firmar con el suyo al distribuirlas.

**Y Xcode Cloud, por qué no.** Es el sistema de Apple y sería más
cómodo, pero el primer workflow **solo se puede crear desde Xcode, en
un Mac**. Desde la web de App Store Connect no hay botón para empezar:
esa pestaña solo sirve para editar workflows que ya existen. Si algún
día tienes un Mac a mano, es una alternativa perfectamente válida.

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

**Y las notificaciones**, que son las que rematan el argumento. Una app
que avisa al jefe de obra de que tiene tres tareas rechazadas ya no se
parece en nada a una página web.

El envoltorio ya viene preparado para ellas: el permiso está declarado
en `App.entitlements` y el plugin instalado. Lo que falta es el trabajo
del servidor —guardar el aparato de cada persona y mandar el aviso— y
la parte de la web que pide permiso. Eso llega en la siguiente tanda.

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

### La pantalla de arranque, y cómo dejó colgada la app

La primera compilación salió con `launchAutoHide` en `false`: iOS
enseñaba el logotipo y esperaba a que la web dijera «ya está». La web
no lo decía, así que el logotipo se quedaba puesto para siempre y la
aplicación parecía colgada. No lo era: por debajo estaba cargada.

Ahora hay tres cierres, y hacen falta los tres:

1. La web la retira en cuanto pinta la primera pantalla —también si esa
   pantalla es un error—, en `repasos/js/app.js`.
2. Un temporizador de seis segundos en el propio `index.html`, que se
   pide siempre a la red: aunque el código de la app se quedara viejo
   en la caché de un móvil, ese seguro llega igual.
3. `launchAutoHide` en `true` con cinco segundos, aquí en
   `capacitor.config.json`: si algún día el puente de Capacitor no
   estuviera, iOS la retira solo.

Si se vuelve a tocar esto, la regla es sencilla: **nunca dejar la
retirada en manos de una sola de las tres.**
