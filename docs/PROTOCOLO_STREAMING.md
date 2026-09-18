# Protocolo entre la interfaz y la aplicación de Unreal

Especificación de los mensajes que cruzan entre la interfaz HTML de
`showroom.unikdi.com` y el Apolo de Unreal. Los dos lados se construyen
contra este documento. Los mensajes no dependen de por dónde viajen: nacieron
para un stream (Vagon) y valen igual dentro del ejecutable de la oficina de
ventas, que es donde se usan ahora.

## La arquitectura, en una imagen

```
   Apolo.exe (Windows)
   ├── la interfaz del visor web, la de siempre    unreal.html
   │   dibujada encima del 3D por el plugin Web UI
   │        │  ue.interface.broadcast('apolo', JSON)   página → Blueprint
   │        │  ue.interface.apolo(JSON)                Blueprint → página
   │        ▼
   ├── Blueprint que interpreta el JSON (8 órdenes, 6 eventos)
   └── la escena de Unreal: corte, prismas, cámara, sol
```

Lo importante de este reparto: **la lógica comercial no entra en Unreal**. La
página sigue leyendo `/gestion/api/estado.php` como hace en la web y le manda
a la aplicación el mapa ya resuelto. La aplicación solo pinta.

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

### En la página (hecho el 17-sep-2026)

La interfaz del visor ya está separada del motor. `js/shell.js` habla con
`window.apolo` y no sabe quién hay debajo:

- `js/visor/main.js` — three.js, en el navegador (lo de siempre).
- `js/motor/puente.js` — la misma API `window.apolo`, pero cada llamada
  se convierte en una orden de este protocolo y cada evento que vuelve
  actualiza el estado y se reemite a la interfaz. No dibuja nada.
- `js/motor/transporte.js` — el cable: Web UI dentro del `.exe`, o un
  simulador en un navegador normal.

Se elige en `index.html`: `?motor=unreal` (o que Web UI ya haya
inyectado sus globales) carga el puente; si no, three.js. Con
`&simulador=1` el puente contesta solo: `listo` a los 300 ms, lo enviado se
apunta en `window.__mensajes` y `window.__simularEvento(evento, valor)` mete
un evento como si viniera de Unreal. Sirve para probar la interfaz sin
Unreal, también en el hosting:
`https://showroom.unikdi.com/?motor=unreal&simulador=1`.

**`unreal.html` es la página que va dentro del ejecutable.** La genera
`node tools/unreal_html.mjs` desde `index.html` y se commitea generada:

- un solo archivo de JavaScript clásico (esbuild junta el puente, la interfaz
  y lo que importan): desde disco (`file://`) el navegador bloquea los
  módulos ES y el `fetch` de archivos locales, así que no usa ninguno;
- el catálogo (`data/units.json`) y la copia de estados
  (`data/availability.json`) van incrustados en la página;
- los estados vivos se piden a
  `https://showroom.unikdi.com/gestion/api/estado.php` (el endpoint ya manda
  `Access-Control-Allow-Origin: *`); sin internet, vale la copia incrustada;
- `<base href="./">`: hoja de estilos, logos e iconos relativos a su carpeta
  de arriba. En el paquete van juntos `unreal.html`, `css/` y `assets/` (`logo_unik.png`,
  `logo_gilmar.png`, `icono/`; `assets/plans/` si se quiere el plano en la
  ficha).

Probado abriéndola desde disco en Chromium (`file:///…/unreal.html?simulador=1`):
carga, pinta la interfaz y manda las 166 viviendas sin servidor. Cuando
cambie la interfaz, el puente o los datos: volver a generar y commitear.

Lo que hace el puente por su cuenta:

- Retiene las órdenes hasta recibir `listo`. Entonces manda, en este orden,
  `fecha` (hoy), `hora` (la del momento activo) y `estados` (el mapa completo
  de las 166 viviendas, todas con valor: las que el panel no nombra van como
  `disponible`), y después lo retenido.
- Los cuatro botones de momento de la web se traducen a `hora`: mañana 9,5;
  mediodía 13,95; atardecer 19,25; noche 22,5. Provisional hasta que haya
  deslizador solar.
- Vuelve a pedir los estados cada 60 s y solo manda `estados` si han cambiado.
- Cualquier pulsación, rueda, tecla o toque corta el escaparate: manda
  `escaparate: false` una vez y no vuelve a mandarlo hasta que la aplicación
  avise de que ha entrado otra vez (`evento escaparate: true`).
- Al recibir `escaparate: true` recoge ficha y panel de plantas y marca el
  conjunto, como hace la web en reposo.
- Una vivienda vendida es inerte: ni la selecciona la interfaz ni acepta el
  evento `vivienda` con su id.
- Lo que la aplicación cuenta (evento `vivienda`, `hover`, `planta`) no se
  le devuelve como orden.

### En Unreal (por hacer; fase 7 de docs/UNREAL_ESTADO.md)

Plugin **Web UI** (Tracer Interactive, en Fab, versión 5.8). Un widget con la
página `unreal.html`, a pantalla completa, fondo transparente y con la
transparencia de ratón activada para que los clics sobre el 3D no se queden en
la página.

- **Página → Blueprint.** La página llama a
  `ue.interface.broadcast('apolo', '<JSON>')`. En el widget, el evento *On
  Interface Event* llega con `Name = "apolo"` y `Data` con el JSON en texto:
  se parsea y se reparte por `orden`. Las versiones antiguas del plugin
  exponen una función global `ue4(nombre, datos)`; la página la usa si es lo
  que encuentra.
- **Blueprint → página.** La página define `ue.interface.apolo`. Desde
  Blueprint, nodo *Call* del widget con `Function = "apolo"` y `Data` = el
  JSON del evento (`{"evento":"vivienda","valor":"214"}`), como texto o como
  objeto: la página acepta los dos.
- Un solo nombre de canal (`apolo`) en los dos sentidos: un manejador por
  lado y el resto se decide por `orden` / `evento`.
- Copiar `unreal.html`, `css/` y `assets/` juntos a la carpeta de interfaz
  del proyecto y cargar `unreal.html` con *Load File*. Para desarrollar también vale
  *Load URL* contra `https://showroom.unikdi.com/unreal.html`.

**Por confirmar en el .exe** (esto se escribió sin poder abrir la
documentación del plugin ni probar dentro de Unreal):

1. Los nombres exactos `ue.interface.broadcast` / `ue4` y del evento *On
   Interface Event* en la versión 5.8 del plugin. Si difieren, se cambia solo
   `js/motor/transporte.js` y se vuelve a generar `unreal.html`.
2. Que la petición a `showroom.unikdi.com` salga desde una página cargada de
   disco (origen `null`; el endpoint ya permite cualquier origen). Si el
   navegador del plugin la bloqueara, la interfaz enseña la copia incrustada
   y hay que mirar los ajustes de seguridad web del plugin.

### Antes: Vagon

La primera versión de este documento describía el transporte por streaming:
SDK de JavaScript de Vagon en la página, `sendApplicationMessage` para
mandar y, en Unreal, un WebSocket a `ws://127.0.0.1:7788`. Vagon se
descartó (el `.exe` corre en la pantalla de la oficina de ventas); si algún
día volviera a hacer falta, los mensajes son los mismos y solo cambiaría
`transporte.js`.
