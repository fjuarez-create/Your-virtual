# El panel de gestión y el ejecutable de la oficina

Cómo se conectan las tres piezas: el panel donde el comercial marca las ventas,
el endpoint que las publica y el ejecutable de Unreal que las lee al arrancar.

```
   showroom.unikdi.com/gestion          el comercial marca disponible /
   (panel, con contraseña)              reservada / vendida
              │
              ▼
   gestion/datos/estado.json            estado vivo, en el servidor
              │
              ▼
   /gestion/api/estado.php   ──────►    visor web      (showroom.unikdi.com/)
   (JSON público, sin clave)  ──────►   ejecutable de Unreal (unreal.html)
                              ──────►   Apolo.exe      (oficina de ventas)
                                            │
                                            ▼
                                        copia en disco
                                        (para trabajar sin internet)
```

## Por qué el estado no vive en el repositorio

El deploy sube el repositorio entero por FTP en cada push. Si el panel
escribiera en `data/availability.json`, el siguiente deploy borraría lo que el
comercial hubiera apuntado. Por eso:

- **`data/availability.json`** (en el repositorio) es solo la **semilla**: la
  primera vez que se pide el estado y todavía no hay `estado.json`, se copia de
  ahí. También es el plan B del visor web si el endpoint no contesta.
- **`gestion/datos/estado.json`** (solo en el servidor) es la **verdad** a
  partir de ese momento.
- `gestion/` es la única carpeta que el deploy sube **sin `--delete`**,
  justamente para no llevarse `datos/` por delante.

## El endpoint

```
GET https://showroom.unikdi.com/gestion/api/estado.php
```

```json
{
  "actualizado": "2026-09-12T18:04:11+02:00",
  "sello": "1ae8e124a7de",
  "total": 166,
  "viviendas": { "101": "reservada", "102": "disponible", "104": "vendida" }
}
```

Los tres estados posibles son `disponible`, `reservada` y `vendida`. Una
vivienda que no aparezca se trata como disponible.

Parámetros opcionales, pensados para el ejecutable:

| Parámetro  | Para qué                                                          |
|------------|-------------------------------------------------------------------|
| `equipo`   | Nombre del puesto (`ventas-01`). Queda anotado con fecha y hora y sale en el panel. Sin él no se anota nada. |
| `version`  | Versión del ejecutable, para saber si la oficina tiene la build buena. |

El `sello` viaja también como `ETag`. Mandando `If-None-Match` el servidor
contesta `304` sin cuerpo si nada ha cambiado, así que el ejecutable puede
preguntar cada pocos minutos sin gastar nada.

No lleva contraseña: es exactamente la información que el visor público ya
enseña. Lo que sí está protegido es **escribirla**, que es cosa del panel.

## Qué tiene que hacer el ejecutable

El requisito es que la oficina **no dependa de internet**. La secuencia:

1. Al arrancar, pedir el endpoint con un tiempo de espera corto (3–5 s). Si el
   router está caído, no puede quedarse la aplicación colgada en el arranque.
2. Si contesta: usar esos estados y **guardar una copia en disco**
   (`FPaths::ProjectSavedDir() / "estado.json"`).
3. Si no contesta: leer la copia del arranque anterior.
4. Si tampoco existe (primer arranque sin conexión): usar la copia que va
   dentro del propio ejecutable, la que se empaquetó al compilar.

Con eso, lo peor que puede pasar es enseñar el estado del día anterior, nunca
una pantalla vacía ni un error delante de un cliente.

Opcionalmente, repetir la consulta cada 10 minutos: si el comercial marca una
venta desde el móvil durante la visita, el visor de la oficina se entera sin
reiniciar.

### En Unreal

Unreal no trae nodos de HTTP genérico en Blueprint, así que hay dos caminos:

- **C++** (recomendado, sin dependencias): una clase de subsistema que use
  `FHttpModule::Get().CreateRequest()`. La API es estable desde UE4 y no
  necesita ningún plugin.
- **Plugin VaRest** (gratuito): añade nodos de petición HTTP y de lectura de
  JSON en Blueprint. Sirve si se prefiere no tocar C++.

Esqueleto de la parte de red en C++:

```cpp
void UEstadoViviendas::Consultar()
{
    const FString Url = TEXT("https://showroom.unikdi.com/gestion/api/estado.php")
                        TEXT("?equipo=ventas-01&version=") + VersionApp;

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
    Req->SetURL(Url);
    Req->SetVerb(TEXT("GET"));
    Req->SetTimeout(5.f);   // la oficina no espera a un router caído
    Req->OnProcessRequestComplete().BindUObject(this, &UEstadoViviendas::AlResponder);
    Req->ProcessRequest();

    // Mientras tanto, la escena ya se pinta con la copia del disco.
    CargarDeDisco();
}

void UEstadoViviendas::AlResponder(FHttpRequestPtr, FHttpResponsePtr Res, bool Ok)
{
    if (!Ok || !Res.IsValid() || Res->GetResponseCode() != 200) return;  // se queda la copia
    if (!Aplicar(Res->GetContentAsString())) return;                     // JSON roto: igual
    GuardarEnDisco(Res->GetContentAsString());
}
```

`Aplicar()` parsea el JSON, recorre `viviendas` y pinta cada vivienda con el
material que toque. Y solo se guarda en disco lo que se ha podido parsear: así
una respuesta a medias no envenena la copia buena.

### Cómo se identifican las viviendas en el modelo

Los identificadores del JSON (`101`, `214`, `A03`…) son los mismos que usa
`data/units.json` y los mismos que llevan las mallas del GLB. Si el modelo se
lleva a Unreal con el conversor (`node tools/para_unreal.mjs`), los nombres
llegan intactos, incluidos `__T<n>__` para el tramo y `__y<cota>` en el
mobiliario. En Unreal basta con leer el nombre del actor para saber a qué
vivienda corresponde.

## Puesta en marcha, una sola vez

1. Publicar (push a la rama de trabajo; el workflow sube `gestion/`).
2. Entrar **enseguida** a `https://showroom.unikdi.com/gestion` y crear la
   contraseña. Hasta que se cree, cualquiera que dé con la URL podría crearla
   él: es el único momento delicado y dura lo que se tarde en entrar.
3. Comprobar que `https://showroom.unikdi.com/gestion/api/estado.php` devuelve
   el JSON con las 166 viviendas.
4. Si sale un error de escritura: en Plesk, Archivos → `httpdocs/gestion` →
   crear o dar permiso de escritura a la carpeta `datos`.

Como refuerzo se puede añadir, en Plesk, protección por contraseña del
directorio `/gestion` (Sitios web y dominios → Directorios protegidos). No
sustituye a la contraseña del panel, se suma a ella.

## Versión de PHP del hosting

Loading avisó en noviembre de 2026 de que el PHP 7.0.33 del dominio ya no
recibe parches. El panel (`gestion/`, lo único con PHP de la web) funciona
**igual en 7.0.33 y en 8.2, 8.3 y 8.4**, así que la versión se puede cambiar en
Plesk y volver atrás sin tocar el código. Lo que lo hace independiente de la
versión:

- Sigue escrito en el subconjunto de PHP 5.6.
- No depende del php.ini de cada versión: `lib.php` fija la zona horaria
  (`Atlantic/Canary`, la hora de la oficina de ventas) y apaga `display_errors`. Las páginas que no cargan
  `lib.php`, o que lo cargan después, también lo apagan antes. Un aviso de PHP
  impreso en el endpoint saldría antes de las cabeceras, y el visor y el
  ejecutable recibirían HTML en vez de JSON.
- `getmypid()`, `usleep()` e `ini_set()` solo se llaman si existen. En PHP 8,
  una función que esté en `disable_functions` es un error fatal, no un aviso.
- Los parámetros de la petición se leen con `texto()`: con un `?equipo[]=x` no
  sale ningún aviso.
- El sello se ordena con `SORT_STRING`, que da lo mismo en todas las versiones.
- La cookie de sesión fija lifetime, path y domain en las dos ramas.

El guardián del deploy (`.github/scripts/comprobar-php56.sh`) vigila tanto la
sintaxis 5.6 como lo que falla o cambia de resultado en PHP 8.

**Cómo se comprobó (25-nov-2026).**

- **PHP 8.3.6, ejecutando el panel entero.** Se usó `php -S` en 7
  configuraciones:
  - `display_errors` activado y desactivado;
  - `output_buffering` a 0 y a 4096;
  - sin `date.timezone` y con UTC;
  - sin opcache;
  - con `getmypid`, `usleep`, `ini_set`, `date_default_timezone_set` y
    `random_bytes` desactivadas.

  En cada una se hicieron unas 150 comprobaciones. No salió ningún error, aviso
  ni deprecación, ni en el log ni en la salida. El endpoint es idéntico byte a
  byte al del código anterior (salvo `actualizado`), con el mismo sello.
- **7.0, 8.2 y 8.4.** No se pudieron ejecutar en el entorno de desarrollo. Se
  revisaron con PHPCompatibility (7.0–8.4, sin hallazgos) y con el changelog
  de PHP.

**El día del cambio:**

1. Comprobar que el código de este apartado ya está desplegado. En 7.0 se
   comporta igual que el anterior.
2. En Plesk (Sitios web y dominios → showroom.unikdi.com → Configuración de
   PHP), apuntar la versión y el manejador actuales, porque son la vuelta atrás.
3. Elegir **8.3 u 8.4 con «FPM application served by Apache»** (o FastCGI
   servido por Apache). No elegir «served by nginx»: con él los `.htaccess` no
   se aplican y `gestion/datos/` queda legible por URL.
4. En la misma pantalla, dejar `display_errors` desactivado.
5. Lanzar el workflow **Diagnóstico del panel** (`diagnostico-panel.yml`, acción
   `mirar`). Si no aparece «Run workflow», basta con subir un cambio de
   `.github/scripts/ftp-diagnostico.sh` a la rama de trabajo. Tiene que dar:
   - En **Veredicto**: `TODO CORRECTO` y `endpoint: "total": 166`.
   - En **Leer la comprobación entera**:
     - «Todo correcto»;
     - «Versión de PHP» con la versión nueva y el manejador (`fpm-fcgi`,
       `cgi-fcgi` o `apache2handler`);
     - «Servidor web» Apache;
     - «Funciones de PHP» sin ninguna en «faltan».

     Si falta alguna imprescindible, hay que quitarla de `disable_functions` en
     Plesk.
   - En el log de errores del final: ninguna línea nueva `PHP Fatal`,
     `PHP Warning` ni `PHP Deprecated`.
6. Entrar al panel y guardar un cambio, por ejemplo marcar y desmarcar una
   vivienda. El comercial tendrá que volver a entrar, porque las sesiones de la
   versión anterior no pasan a la nueva.
7. Al día siguiente, comprobar en «Oficina de ventas» que el ejecutable sigue
   anotándose.

**Volver atrás:** en la misma pantalla de Plesk, elegir otra vez 7.0.33 con el
manejador apuntado y repetir el workflow. No hay nada que deshacer en el código
ni en `gestion/datos/`: `estado.json`, `equipos.json` y `clave.php` valen en
las dos direcciones. Una contraseña creada en 8.4 (bcrypt de coste 12) también
se verifica en 7.0.
