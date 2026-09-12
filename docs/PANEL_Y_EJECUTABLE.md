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
   /gestion/api/estado.php   ──────►    visor clásico  (showroom.unikdi.com/)
   (JSON público, sin clave)  ──────►   visor nuevo    (/new)
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
