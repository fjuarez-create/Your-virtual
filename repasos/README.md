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

## Usuarios

Las cuentas las crea el administrador desde **Ajustes → Usuarios**: nombre,
correo y una contraseña inicial (hay botón para generar una legible al dictado).
Cada uno puede cambiarla luego desde sus propios ajustes.

Desactivar a alguien le quita el acceso pero **conserva su firma** en los repasos
que ya hizo. Siempre tiene que quedar al menos un administrador activo.

## Puesta en marcha en el hosting

### 1. Subdominio

Crear el subdominio en Plesk (`repasos.unikdi.com`) con **HTTPS**. No es un
capricho: sin HTTPS el navegador no da acceso a la cámara, ni al micrófono, ni
deja instalar la app.

### 2. Base de datos

En Plesk → *Bases de datos* → *Añadir base de datos*. Apuntar nombre, usuario y
contraseña.

Si el plan no diera MySQL, la app también funciona con **SQLite** (un fichero, sin
servidor); basta poner `'driver' => 'sqlite'` en la configuración.

### 3. Configuración

Copiar `api/config.example.php` a `api/config.php` **en el servidor** y rellenar
los datos de la base y el administrador inicial:

```php
'admin_inicial' => [
    'nombre'   => 'Fran Juárez',
    'email'    => 'f.juarez@unikdi.com',
    'password' => 'la-que-quieras-min-8',
],
```

`config.php` no está en el repositorio y el despliegue no lo toca nunca.

### 4. Instalar

Abrir una vez `https://repasos.unikdi.com/api/install.php`. Crea las tablas y el
usuario administrador. **Después, borrar `api/install.php` del servidor** y vaciar
`admin_inicial` en `config.php`.

### 5. Límites de PHP

Para que entren los vídeos, en el PHP del subdominio (Plesk → *Configuración de
PHP*):

```
upload_max_filesize = 80M
post_max_size       = 84M
max_execution_time  = 300
```

### 6. Despliegue automático

`.github/workflows/deploy-repasos.yml` publica en cada push que toque `repasos/`.
Necesita estos secretos en el repositorio:

| Secreto | Qué es |
| --- | --- |
| `FTP_REPASOS_SERVER` | host FTP del panel |
| `FTP_REPASOS_USERNAME` | usuario FTP del subdominio |
| `FTP_REPASOS_PASSWORD` | contraseña |
| `FTP_REPASOS_SERVER_DIR` | opcional; vacío = se detecta `httpdocs` |

El despliegue **no sube ni borra** `api/config.php`, `api/uploads/` ni
`api/datos/`: las fotos y las credenciales del servidor se quedan donde están.

## Probar en local

Sin backend la app arranca en **modo local**: pide un nombre, guarda todo en el
dispositivo y avisa de que no se comparte. Sirve para ver la interfaz sin montar
nada:

```bash
cd repasos
# apiBase: '' en index.html → modo local
python3 -m http.server 8080
```

Con backend, hace falta PHP:

```bash
cd repasos
cp api/config.example.php api/config.php    # driver 'sqlite' y admin_inicial
PHP_CLI_SERVER_WORKERS=10 php -S 127.0.0.1:8099 -t .
# → http://127.0.0.1:8099/api/install.php  y luego  http://127.0.0.1:8099/
```

(El servidor interno de PHP es de un solo proceso: sin `PHP_CLI_SERVER_WORKERS`
se queda bloqueado en cuanto el navegador abre varias conexiones.)

## Seguridad

- Contraseñas con `password_hash` (bcrypt), nunca en claro ni recuperables.
- Sesión en cookie **HttpOnly + Secure + SameSite=Lax**: el token no lo ve
  JavaScript, así que un script inyectado no puede llevárselo.
- Ocho intentos fallidos por correo e IP en 15 minutos y se frena.
- Las fotos **no son públicas**: `api/uploads/` está cerrada por `.htaccess` y
  cada fichero se sirve desde `api/medios/<id>/fichero`, que comprueba la sesión.
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
js/informe.js           Informe imprimible
js/catalog.js           Promociones, viviendas, fases y estados
js/ui.js                Nodos, iconos, avisos, hojas y visor
js/piezas.js            Cabecera, cinta de sincronización, fila de lista
js/views/               Una pantalla por fichero
api/                    Backend PHP (ver api/schema.sql)
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
