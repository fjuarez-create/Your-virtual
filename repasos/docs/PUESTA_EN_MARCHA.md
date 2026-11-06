# Puesta en marcha en el hosting

Guía para dejar **UNIK repasos** funcionando en un subdominio propio, con
Plesk y el FTP de siempre. De principio a fin son unos 30 minutos, y solo hay
que hacerlo una vez: a partir de ahí cada cambio se publica solo.

Necesitas: acceso al panel **Plesk**, acceso a **GitHub** y nada más.

---

## 1. Crear el subdominio, con HTTPS

En Plesk → **Sitios web y dominios** → *Añadir subdominio*.

- Nombre: `repasos` (queda `repasos.unikdi.com`).
- Raíz de documentos: la que proponga por defecto (`repasos.unikdi.com/httpdocs`).

Cuando esté creado, en ese subdominio → **Certificados SSL/TLS** → *Instalar un
certificado gratuito de Let's Encrypt*, y después marcar **«Redirigir
permanentemente de HTTP a HTTPS»**.

> El HTTPS no es opcional. Sin él el navegador **no da acceso a la cámara ni al
> micrófono** y no deja instalar la app en la pantalla de inicio. La app quedaría
> reducida a mirar, sin poder hacer fotos.

Comprueba que carga `https://repasos.unikdi.com` (saldrá una página vacía o el
cartel por defecto de Plesk: es lo esperado, todavía no hay nada subido).

---

## 2. Crear la base de datos

Plesk → **Bases de datos** → *Añadir base de datos*.

- Nombre: `unik_repasos`
- Usuario nuevo: `unik_repasos` con una contraseña larga (la genera el propio panel).

**Apunta los tres datos**: nombre de la base, usuario y contraseña. Hacen falta en
el paso 5.

> Si el plan de hosting no incluyera MySQL, la app también funciona con SQLite
> (un fichero, sin servidor de base de datos). En ese caso salta este paso y mira
> la nota del final.

---

## 3. Usuario FTP para el subdominio

Plesk → el subdominio → **Acceso FTP** → *Añadir cuenta FTP*.

- Nombre: `repasos-deploy`
- Contraseña: una larga.
- Directorio principal: **la carpeta del subdominio** (`/repasos.unikdi.com`).

Apunta el **host FTP** que muestra el panel (algo como `lin127.loading.es`), el
usuario y la contraseña.

---

## 4. Guardar los datos del FTP en GitHub

En el repositorio de la app → **Settings** → **Secrets and variables** →
**Actions** → *New repository secret*. Uno por uno:

| Nombre del secreto | Valor |
| --- | --- |
| `FTP_SERVER` | el host FTP del panel |
| `FTP_USERNAME` | `repasos-deploy` |
| `FTP_PASSWORD` | su contraseña |
| `FTP_SERVER_DIR` | déjalo sin crear; solo hace falta si el despliegue no encuentra la carpeta |

GitHub guarda estos valores cifrados: no se ven ni siquiera desde el propio panel
una vez guardados, y no aparecen en los registros del despliegue.

---

## 5. Primer despliegue

En el repositorio → pestaña **Actions** → **Publicar en el hosting (FTP)** →
botón **Run workflow**.

Tarda un par de minutos. Al terminar en verde, `https://repasos.unikdi.com` ya
muestra la pantalla de entrada de la app — todavía sin poder entrar, porque falta
la configuración del servidor.

Si sale en rojo, abre el paso que falló: los mensajes están en castellano y dicen
qué falta (normalmente un secreto mal escrito).

---

## 6. Poner la configuración en el servidor

Este fichero **no está en el repositorio** y no lo sube nunca el despliegue: lleva
las contraseñas de la base de datos, y su sitio es el servidor.

Plesk → el subdominio → **Administrador de archivos** → entra en `httpdocs/api`.
Verás ahí `config.example.php`. Crea un fichero nuevo llamado **`config.php`**
(botón *+* → *Crear un archivo*) y pega esto, rellenando los huecos:

```php
<?php
return [
    'db' => [
        'driver'   => 'mysql',
        'host'     => 'localhost',
        'nombre'   => 'unik_repasos',        // el del paso 2
        'usuario'  => 'unik_repasos',        // el del paso 2
        'password' => 'LA-CONTRASEÑA-DE-LA-BASE',
    ],

    // Tu usuario administrador. Se crea una sola vez, en el paso 8.
    'admin_inicial' => [
        'nombre'   => 'Fran Juárez',
        'email'    => 'f.juarez@unikdi.com',
        'password' => 'LA-QUE-QUIERAS-MINIMO-8',
    ],

    'cookie_segura'  => true,
    'carpeta_medios' => 'uploads',
    'max_fichero'    => 83886080,
];
```

Guarda. Ese fichero se queda ahí para siempre; los despliegues siguientes no lo
tocan.

---

## 7. Subir los límites de PHP

Por defecto PHP no acepta ficheros grandes, y un vídeo de obra se pasa enseguida.

Plesk → el subdominio → **Configuración de PHP**, y ajusta:

| Ajuste | Valor |
| --- | --- |
| `upload_max_filesize` | `80M` |
| `post_max_size` | `84M` |
| `max_execution_time` | `300` |
| `memory_limit` | `256M` |

Versión de PHP: **8.0 o superior** (con 8.1–8.3 va perfecto).

---

## 7 bis. Sacar las fotos fuera de la carpeta web (recomendado)

Las fotos se guardan por defecto en `httpdocs/api/uploads`, cerrada con un
`.htaccess`. Eso basta con Apache, pero **Plesk suele poner nginx delante**, y
nginx sirve los ficheros estáticos por su cuenta sin leer los `.htaccess`. En ese
caso, quien acertara la dirección exacta de una foto podría verla sin haber
entrado en la app. Los nombres son identificadores aleatorios, así que no se
pueden adivinar ni listar, pero es mejor no depender de eso.

La solución es dejar las fotos fuera de la zona web. En Plesk → el subdominio →
**Hosting**, mira cuál es la *Raíz de documentos*; será algo como:

```
/var/www/vhosts/unikdi.com/repasos.unikdi.com/httpdocs
```

Quita el `/httpdocs` del final, añade `/medios`, y ponlo en `config.php`:

```php
'carpeta_medios' => '/var/www/vhosts/unikdi.com/repasos.unikdi.com/medios',
```

La carpeta se crea sola la primera vez que se sube una foto. Desde ahí, las
imágenes solo pueden salir a través de la API, que comprueba la sesión antes de
entregarlas.

> Si ya había fotos subidas en `httpdocs/api/uploads`, muévelas con el
> Administrador de archivos a la carpeta nueva conservando la estructura de
> subcarpetas (`2026/08/…`) antes de cambiar la configuración.

---

## 8. Crear las tablas y tu usuario

Abre **una sola vez** en el navegador:

```
https://repasos.unikdi.com/api/install.php
```

Debe salir una pantalla blanca con la lista de pasos en verde y «Listo». Crea las
tablas de la base de datos y tu usuario administrador con los datos de
`admin_inicial`.

**Justo después, dos cosas:**

1. Borra `api/install.php` desde el Administrador de archivos de Plesk.
2. Vacía las tres líneas de `admin_inicial` en `config.php` (deja las comillas
   vacías).

Si más adelante se vuelve a desplegar, `install.php` volverá a subir; no pasa
nada, porque se niega a hacer nada si ya hay usuarios creados. Pero es más limpio
borrarlo.

---

## 9. Entrar y dar de alta al equipo

Abre `https://repasos.unikdi.com` y entra con tu correo y la contraseña que
pusiste en `admin_inicial`.

Dentro: **Ajustes → Usuarios → Nuevo usuario**. Para cada arquitecta o arquitecto,
nombre, correo y una contraseña inicial (hay un botón *Generar* que crea
contraseñas fáciles de dictar por teléfono). Cada uno puede cambiarla luego desde
sus propios ajustes.

Cambia también tu propia contraseña desde **Ajustes → Cambiar mi contraseña**, para
que deje de ser la que estuvo escrita en `config.php`.

---

## 10. Instalarla en el móvil

No hay que pasar por ninguna tienda de aplicaciones:

- **iPhone (Safari):** abrir la web → botón *Compartir* → **Añadir a pantalla de
  inicio**.
- **Android (Chrome):** abrir la web → menú de los tres puntos → **Instalar
  aplicación**.

Queda con su icono, a pantalla completa y sin barra de navegador. Es como se debe
usar en obra.

---

## Comprobar que todo está bien

1. Crear una lista de repaso de prueba en una vivienda cualquiera.
2. Añadir una tarea con foto hecha con la cámara.
3. **Poner el móvil en modo avión** y añadir otra tarea: tiene que dejarte, y la
   cinta de estado debe decir «Sin conexión · 1 cambio en espera».
4. Quitar el modo avión y esperar unos segundos: debe pasar a «Todo sincronizado».
5. Abrir la misma lista desde otro móvil o desde el ordenador: tienen que estar las
   dos tareas.
6. Borrar la lista de prueba desde el menú de la lista.

---

## Si algo falla

| Lo que ves | Qué suele ser |
| --- | --- |
| «El servidor no está configurado (falta config.php)» | El paso 6, o el fichero está en otra carpeta: tiene que estar en `httpdocs/api/config.php` |
| «No se puede conectar con la base de datos» | Usuario, contraseña o nombre de la base mal copiados en `config.php` |
| Entra pero no sincroniza | Mira si Plesk tiene activado algún firewall o *ModSecurity* que bloquee POST grandes |
| La cámara no se abre | Falta HTTPS, o se está entrando por `http://` en vez de `https://` |
| «El fichero supera el límite del servidor» al subir un vídeo | El paso 7 |
| El despliegue falla en «Subir código» | Datos del FTP mal, o la carpeta destino no es la del subdominio → crea el secreto `FTP_SERVER_DIR` con `httpdocs` |

---

## Nota: sin MySQL

Si el hosting no diera base de datos, cambia en `config.php`:

```php
'db' => [
    'driver'  => 'sqlite',
    'fichero' => __DIR__ . '/datos/repasos.sqlite',
],
```

Y comprueba que la carpeta `api/datos` tiene permiso de escritura. El resto es
idéntico. Para una promoción de 50 viviendas va sobrado; si algún día hay varias
promociones grandes a la vez, se pasa a MySQL exportando e importando.

---

## Copias de seguridad

Dos cosas que conviene tener respaldadas, y que **no están en GitHub** porque no
deben estarlo:

- La **base de datos** (Plesk → Bases de datos → *Exportar volcado*).
- La **carpeta de medios**, que es donde están todas las fotos, los vídeos y las
  notas de voz: `httpdocs/api/uploads`, o la que hayas puesto en el paso 7 bis.

Lo más cómodo es incluir el subdominio entero en la copia programada de Plesk
(**Herramientas y configuración → Gestor de copias de seguridad**), que se lleva
las dos cosas de una vez.
