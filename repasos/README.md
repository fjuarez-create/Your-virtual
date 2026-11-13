# UNIK repasos

App de repasos de **pre-entrega** y **post-entrega** de las viviendas de UNIK.
Se abre desde el navegador en un subdominio (p. ej. `repasos.unikdi.com`), pero
está hecha para usarse como una app: se instala en la pantalla de inicio del
móvil, funciona sin cobertura y sube el trabajo sola cuando vuelve la señal.

## Cómo se usa

**Promoción → vivienda → lista de repaso → tareas.**

1. **Promoción.** De momento solo **Brassie** (50 villas). Las demás quedan
   preparadas en `js/catalog.js` y aparecen deshabilitadas hasta activarlas.
2. **Vivienda.** Rejilla de la 1 a la 50. El color dice de un vistazo cómo está
   cada una sin entrar: acento = tiene tareas pendientes, negro = repasada,
   gris = todavía sin repasos.
3. **Lista de repaso.** Se crea eligiendo pre-entrega o post-entrega, y queda
   firmada con la fecha y el nombre de quien la hace. Las inspecciones
   anteriores de esa vivienda se abren desde la misma pantalla, que es como se
   confirma lo que se corrigió desde la última visita.
4. **Tareas.** Una por remate. Foto y texto, ambos visibles en el listado sin
   tener que abrir nada. Dentro de cada tarea se pueden añadir **más fotos, un
   vídeo o una nota de voz**, y marcarla como *pendiente*, *resuelta* o
   *verificada*.

Desde el menú de la lista sale el **informe imprimible**: una ficha por tarea con
su foto y su texto, para mandárselo a la constructora en PDF.

## Trabajar sin cobertura

Dentro de una villa en obra el móvil no siempre tira, así que la app **nunca
espera al servidor**:

- Todo lo que se escribe entra primero en el dispositivo (IndexedDB) y aparece
  al instante.
- Los cambios se apilan en una cola y se suben en cuanto hay red. La cinta de
  estado dice en todo momento cuántos quedan.
- La app abre sin conexión con todos sus datos (service worker + almacén local).
- Las fotos se reescalan a 1600 px y se recomprimen en el propio móvil antes de
  guardarse: una foto de 4–8 MB queda en unos 300 KB. Con decenas de tareas por
  vivienda, es la diferencia entre subir y atascarse.

Si dos personas tocan la misma tarea, gana la modificación más reciente; los
borrados también viajan, para que un móvil que estuvo dos días sin cobertura se
entere de lo que se borró mientras tanto.

## Usuarios y permisos

Las cuentas las crea el administrador desde **Ajustes → Usuarios** con solo tres
datos: nombre, correo y empresa o rol. **La contraseña la genera la app**: el
nombre completo seguido de la primera palabra de la empresa, en minúsculas, sin
tildes ni espacios (`Alba García` + `Unik — Promotor` → `albagarciaunik`). La
misma regla vive en `js/catalog.js` y en `api/lib/nucleo.php`, así que cliente y
servidor calculan siempre lo mismo.

Al crear el usuario aparece la contraseña con un botón de **compartir**, que en
el móvil abre WhatsApp, correo o lo que haya instalado. Es la única vez que se
puede ver.

**Verificar es un permiso aparte del de administrador.** Quien no lo tiene solo
puede mover tareas entre *pendiente* y *resuelta*; el chip de *verificada* le sale
apagado. El permiso se propone según la empresa (UNIK y la dirección facultativa
sí, constructora y subcontratas no) y se puede ajustar a mano. La comprobación
está también en el servidor: un cliente manipulado no puede saltársela.

Desactivar a alguien le quita el acceso pero **conserva su firma** en los repasos
que ya hizo. Siempre tiene que quedar al menos un administrador activo.

La sesión dura **seis meses**: se entra una vez y el móvil de obra no vuelve a
pedir nada.

## Rechazos: el hilo de la tarea

Devolver a *pendiente* algo que estaba *resuelto* no se puede hacer en silencio.
La app pide una explicación —y admite una foto— y con eso monta un **hilo** dentro
de la tarea. La tarea queda marcada como **Rechazada** en rojo, tanto en el
listado como al abrirla, para que quien la dio por resuelta lo vea sin buscar.

También se pueden añadir notas sueltas al hilo sin cambiar el estado.

## Dos documentos distintos

- **Hoja PDF para la puerta** (botón rojo): un listado grande, con una casilla por
  tarea, para imprimir y pegar con cinta en la puerta de la vivienda. El PDF se
  escribe a mano en `js/pdf.js`, sin librerías: pesa unos pocos kilobytes y en el
  móvil sale por el menú de compartir.
- **Informe con fotos**: una ficha por tarea con su imagen, para mandar a la
  constructora. Se genera con la impresión del navegador (*Guardar como PDF*).

## Puesta en marcha en el hosting

Los pasos completos, con el detalle de cada pantalla de Plesk, están en
**[docs/PUESTA_EN_MARCHA.md](docs/PUESTA_EN_MARCHA.md)**. En resumen:

1. Subdominio en Plesk **con HTTPS** — sin él el navegador no da acceso a la
   cámara ni al micrófono, ni deja instalar la app.
2. Base de datos MySQL (o SQLite, si el plan no la incluye).
3. Cuenta FTP del subdominio y sus datos guardados como secretos del repositorio.
4. Lanzar el despliegue desde *Actions*.
5. Crear `api/config.php` en el servidor con los datos de la base.
6. Subir los límites de PHP para que entren los vídeos.
7. Abrir `api/install.php` una vez; el despliegue lo retira del servidor solo.

**No hay que volver a abrir ninguna página después de publicar.** Cuando una
versión añade campos o tablas, el backend lo detecta al arrancar y lo aplica él
(`api/lib/esquema.php`): compara `ESQUEMA_VERSION` con lo guardado en la tabla
`meta` y añade lo que falte, una vez y con cerrojo. Si algo fallara, no sube el
número de versión y lo reintenta en el arranque siguiente, así que nunca se da
por buena una migración a medias. Ningún dato ni ninguna contraseña se tocan.

`api/actualizar.php` queda solo para dar de alta el equipo inicial en una
instalación nueva, y se ejecuta en local: **no se publica**.

### Despliegue automático

La app se publica desde el repositorio **Your-virtual**, con
`.github/workflows/deploy-repasos.yml`, en cada push a la rama de trabajo que
toque algo de `repasos/`. No hace falta pasar por ningún Codespace ni por un
segundo repositorio.

Secretos necesarios (*Settings → Secrets and variables → Actions*):

| Secreto | Qué es |
| --- | --- |
| `REPASOS_FTP_SERVER` | host FTP del panel |
| `REPASOS_FTP_USERNAME` | usuario FTP del subdominio de repasos |
| `REPASOS_FTP_PASSWORD` | contraseña |
| `REPASOS_FTP_SERVER_DIR` | opcional; sin él se detecta `httpdocs` |

Llevan el prefijo `REPASOS_` porque en ese mismo repositorio viven los `FTP_*`
del showroom, que apuntan a otro sitio del mismo hosting.

Tres protecciones, porque el hosting es compartido y un error aquí se paga caro:

- **Antes de escribir nada** se comprueba dónde se va a escribir, y este paso
  no se salta nunca. En un despliegue normal se exige que la carpeta contenga
  `api/config.php`, que crea el instalador y no viaja nunca en la subida: es
  una señal que solo existe en esta instalación. Marcar *primera_instalacion*
  no exime de la comprobación, la endurece: entonces se exige que la carpeta
  esté **vacía de verdad**. Si los secretos apuntaran a otro sitio del hosting,
  el despliegue para sin haber tocado un fichero, marque uno la casilla o no.
- **La contraseña del FTP no viaja nunca en claro.** Si el servidor no negocia
  FTPS, el despliegue para en lugar de bajar a FTP plano por su cuenta; para
  hacerlo hay que escribirlo explícitamente (`FTP_PERMITIR_PLANO=1`).
- **No sube ni borra** `api/config.php`, `api/uploads/` ni `api/datos/`: las
  fotos y las credenciales se quedan donde están.
- **Retira del servidor** `api/install.php` y `api/actualizar.php`, que
  configuran y crean usuarios sin pedir contraseña, y **comprueba que ya no
  están**: si el borrado no surtiera efecto, el despliegue falla en vez de
  darlo por hecho. Por si acaso, `actualizar.php` además solo se ejecuta desde
  la propia máquina o por línea de comandos.

Usa su propio grupo de concurrencia (`hosting-repasos`) para no cancelar un
despliegue del showroom, que usa `hosting`.

## Probar en local

Sin backend la app arranca en **modo local**: pide un nombre, guarda todo en el
dispositivo y avisa de que no se comparte. Sirve para ver la interfaz sin montar
nada:

```bash
# apiBase: '' en index.html → modo local
python3 -m http.server 8080
```

Con backend, hace falta PHP:

```bash
cp api/config.example.php api/config.php    # driver 'sqlite' y admin_inicial
PHP_CLI_SERVER_WORKERS=10 php -S 127.0.0.1:8099 -t .
# → http://127.0.0.1:8099/api/install.php  y luego  http://127.0.0.1:8099/
```

(El servidor interno de PHP es de un solo proceso: sin `PHP_CLI_SERVER_WORKERS`
se queda bloqueado en cuanto el navegador abre varias conexiones.)

## Que las tareas se escriban solas

Al terminar un recorrido se toca **REDACTAR LAS TAREAS** una vez y pasan tres
cosas seguidas: se **escucha** la grabación y se pasa a texto, se **miran** las
fotos, y de cada una sale su tarea escrita y con su gremio. Lo que se dijo en
voz alta manda sobre lo que se vea en la foto: quien andaba por allí sabe qué
miraba y la foto no lo dice.

Son dos proveedores porque hacen falta dos cosas distintas, y **Claude ve pero
no oye**. Las dos claves se ponen **una sola vez, desde el móvil**, y solo las
ve quien administra:

| Clave | Dónde | Para qué | Si falta |
|---|---|---|---|
| Anthropic | Ajustes → Servidor → *Clave de Anthropic* | Redactar las tareas | El recorrido no redacta solo |
| OpenAI | Ajustes → Servidor → *Clave de OpenAI* | Pasar a texto lo que se dijo | Se redacta igual, pero solo con las fotos |

Se puede tener la de Anthropic sola: entonces las tareas salen de mirar las
fotos, y lo que se dijo se escribe a mano. La de OpenAI sin la otra no sirve de
nada.

Cómo funciona por dentro:

- La clave se guarda en `api/datos/claude.key`, la misma carpeta cerrada por
  `.htaccess` donde vive la base de datos, con permisos `0600`. **Nunca viaja al
  repositorio ni la escribe el despliegue**, y de la API solo salen sus cuatro
  últimos caracteres, para reconocerla.
- La llamada la hace el servidor (`api/lib/claude.php`), no el móvil. Una clave
  metida en el JavaScript de la app se la lleva cualquiera que abra las
  herramientas del navegador.
- Modelo `claude-opus-5`, esfuerzo `medium`. La respuesta viene con esquema
  fijo, así que el gremio solo puede ser uno de los quince del catálogo.
- **Claude ve, pero no oye.** Por eso el audio va antes por otro sitio
  (`api/lib/oido.php`, modelo `gpt-4o-transcribe`), y a Claude le llegan las
  fotos y el texto ya transcrito. Está en un fichero aparte a propósito: es
  otra cuenta y otra factura, y cambiar de proveedor —o pasarlo algún día al
  propio servidor— se hace ahí sin que se entere nadie más.
- **La transcripción se paga una vez.** Se guarda en el recorrido del móvil, de
  modo que volver a darle a redactar no la vuelve a cobrar. Y si ya hay texto
  escrito a mano, no se escucha nada: lo escrito manda.
- Al oído se le pasa una **pista de vocabulario de obra** —rodapié, gotelé,
  guarnecido, vierteaguas…—, que es lo que evita que un transcriptor genérico
  escriba de oído las palabras que aquí se usan todos los días.
- Si el oído falla —sin clave, sin crédito, sin salida— **no te quedas sin
  tareas**: se sigue con las fotos y se dice en el aviso qué ha pasado.
- Las fotos se encogen **en el móvil** a 1024 px del lado mayor antes de subir:
  se distingue igual una junta abierta y cuesta la quinta parte. Viajan como
  mucho 30 por recorrido, y el servidor descarta las que no correspondan a una
  marca de ese recorrido.
- Cada ficha dice **de dónde sale**: de lo que se dijo o de mirar la foto. Al
  terminar se cuentan por separado, porque lo leído de una foto hay que
  repasarlo con más calma que lo que uno mismo dictó.
- Si no se dijo nada y en la foto no se distingue ningún defecto, la ficha se
  deja **en blanco y marcada**, y no se inventa: un parte con un hueco se
  arregla; uno con una tarea inventada manda a alguien a reparar algo que no
  existe y quema la confianza en el resto de la lista.
- Todo esto es opcional. Sin clave, sin salida a internet o si se prefiere
  escribir a mano, la pantalla funciona exactamente igual que antes.

Las fotos son lo que se paga: un recorrido de seis ronda los diez céntimos y
uno de treinta, los treinta. Escuchar es casi gratis al lado de eso —medio
céntimo por minuto grabado—. Para saber si el hosting puede siquiera llamar
hacia fuera: Ajustes → Servidor → *Comprobar la salida a internet*.

## Seguridad

- Contraseñas con `password_hash` (bcrypt), nunca en claro ni recuperables.
- Sesión en cookie **HttpOnly + Secure + SameSite=Lax**: el token no lo ve
  JavaScript, así que un script inyectado no puede llevárselo.
- Ocho intentos fallidos por correo e IP en 15 minutos y se frena.
- Las fotos **no son públicas**: cada fichero se sirve desde
  `api/medios/<id>/fichero`, que comprueba la sesión. La carpeta donde se guardan
  está cerrada por `.htaccess` y, mejor todavía, puede ponerse fuera de la zona
  web (`carpeta_medios` admite ruta absoluta): en Plesk, nginx sirve los estáticos
  sin leer los `.htaccess` de Apache. Ver el paso 7 bis de la guía.
- El tipo de los ficheros subidos se deduce del contenido (`finfo`), no de lo que
  diga el navegador, y solo pasan los de la lista blanca.

## Estructura

```
index.html              Armazón de la app
manifest.webmanifest    Instalación en la pantalla de inicio
sw.js                   Service worker (caché del código, no de los datos)
.htaccess               Cabeceras, caché y HTTPS forzado
css/app.css             Sistema visual completo
js/app.js               Arranque, enrutado por hash y armazón
js/store.js             Modelo de datos y motor de sincronización
js/db.js                Almacén local (IndexedDB)
js/api.js               Cliente del backend
js/media.js             Cámara, compresión de fotos y grabadora de voz
js/informe.js           Informe con fotos, para imprimir
js/pdf.js               Hoja PDF de la puerta (generador propio)
js/catalog.js           Promociones, viviendas, fases y estados
js/ui.js                Nodos, iconos, avisos, hojas y visor
js/piezas.js            Cabecera, cinta de sincronización, fila de lista
js/views/               Una pantalla por fichero
api/                    Backend PHP (ver api/schema.sql)
docs/                   Puesta en marcha del servidor
tools/make-icons.mjs    Regenera los iconos de la app
```

## Añadir una promoción

En `js/catalog.js`:

```js
{
  id: 'nueva',
  nombre: 'Nombre comercial',
  ubicacion: 'Dónde está',
  activa: true,
  unidades: { desde: 1, hasta: 30, etiqueta: 'Villa' },
}
```

Si la promoción numera las viviendas de otra forma (por portal y planta, por
ejemplo), en lugar de `desde`/`hasta` se le pasa `lista: ['1ºA', '1ºB', …]`.
