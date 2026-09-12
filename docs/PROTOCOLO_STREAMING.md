# Protocolo entre la interfaz web y la aplicación de Unreal

Especificación de los mensajes que cruzan entre `showroom.unikdi.com` y el
Apolo que corre en el servidor de Vagon. Los dos lados se construyen contra
este documento.

## La arquitectura, en una imagen

```
   showroom.unikdi.com
   ├── nuestra interfaz HTML          raíl de plantas, ficha, filtros,
   │   (nítida, la de siempre)        listado, planos, galería
   │        │
   │        │  sendApplicationMessage(JSON)      ← SDK JS de Vagon
   │        ▼
   └── <iframe id="vagonFrame">       solo el vídeo del 3D
              │
              ▼
        Apolo.exe en el servidor
              │  WebSocket ws://127.0.0.1:7788  ← ya viene montado en la build
              ▼
        Blueprint que interpreta el JSON
```

Lo importante de este reparto: **la lógica comercial no entra en Unreal**. La
página sigue leyendo `/gestion/api/estado.php` como hace hoy y le manda a la
aplicación el mapa ya resuelto. La aplicación solo pinta.

## Reglas comunes

- Todo mensaje es un objeto JSON en texto plano, en una línea.
- De la página a la aplicación, la clave es `orden`. De la aplicación a la
  página, `evento`. Así nunca hay duda de quién habla.
- Todo mensaje lleva `valor`. Si no aplica, `null`.
- Un mensaje desconocido se ignora en silencio en los dos sentidos: así se
  puede desplegar un lado antes que el otro sin romper nada.
- Las claves de planta son las del visor: `all`, `baja`, `p1`, `p2`, `atico`.
- Los identificadores de vivienda son cadenas, no números: `"214"`. Vienen de
  `data/units.json` y son los mismos que usa el panel de gestión.

## De la página a la aplicación (`orden`)

| Orden | `valor` | Qué hace |
|---|---|---|
| `planta` | `"all"` \| `"baja"` \| `"p1"` \| `"p2"` \| `"atico"` | Corta el edificio por esa planta. `all` lo cierra. |
| `vivienda` | `"214"` \| `null` | Selecciona una vivienda. `null` deselecciona. |
| `hover` | `"214"` \| `null` | Realza una vivienda sin seleccionarla (al pasar por encima en el listado). |
| `estados` | `{ "101": "vendida", … }` | El mapa completo de estados. La aplicación repinta los prismas. |
| `hora` | `13.75` | Hora local decimal. Mueve el sol por su órbita real. |
| `fecha` | `"2026-10-15"` | Día del año para la órbita solar. |
| `vista` | `"conjunto"` \| `"edificio"` \| `"planta"` \| `"plano"` | Encuadre de cámara. |
| `escaparate` | `true` \| `false` | Fuerza el modo escaparate o lo corta. |

## De la aplicación a la página (`evento`)

| Evento | `valor` | Cuándo |
|---|---|---|
| `listo` | `null` | La escena ha terminado de cargar y ya se puede mandar órdenes. |
| `vivienda` | `"214"` \| `null` | Han pinchado una vivienda **dentro del 3D**. |
| `hover` | `"214"` \| `null` | El puntero está sobre una vivienda en el 3D. |
| `planta` | `"p2"` | La planta ha cambiado desde dentro de la aplicación. |
| `escaparate` | `true` \| `false` | Ha entrado o salido del modo escaparate. |
| `error` | `"texto"` | Algo ha fallado y la página debería enterarse. |

## Ejemplos

El comercial pulsa la segunda planta en el raíl:

```json
{ "orden": "planta", "valor": "p2" }
```

El cliente pincha una vivienda dentro del 3D y la página abre su ficha:

```json
{ "evento": "vivienda", "valor": "214" }
```

La página acaba de refrescar el panel de gestión y avisa:

```json
{ "orden": "estados", "valor": { "101": "reservada", "102": "disponible", "104": "vendida" } }
```

El deslizador solar se mueve a las 18:45:

```json
{ "orden": "hora", "valor": 18.75 }
```

## Notas de implementación

**En la página.** El SDK de JavaScript de Vagon se carga entre las etiquetas
`<head>` y el stream va en un `<iframe id="vagonFrame">`. Los mensajes salen
con `sendApplicationMessage`. El SDK avisa además de cuándo se inicializa el
stream, cuándo se conecta o desconecta el visitante y **cuándo lleva rato
inactivo**, que es justo lo que hace falta para el escaparate y el corte de
sesión.

**En Unreal.** La build que corre en Vagon ya trae el servidor WebSocket en
`ws://127.0.0.1:7788`: no hay que montar ninguno. Desde Blueprint hay que
conectarse con el nodo **«Create WebSocket with Headers connection»**, no con
el normal, porque necesita una cabecera concreta. Vagon publica una plantilla
de Blueprint de la que partir.

**Antes de dar nada por bueno**, conviene abrir la documentación de Vagon y
confirmar los nombres exactos: esta especificación se escribió con la
documentación bloqueada desde el entorno de desarrollo y los datos vienen de
búsquedas coincidentes, no de la página leída directamente.
