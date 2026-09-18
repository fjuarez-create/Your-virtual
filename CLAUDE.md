# Apolo · SERENEA

Visor 3D de venta del Edificio Apolo (166 viviendas, GILMAR). Un visor web en
three.js en la raíz del sitio (`/new` solo reenvía; el visor clásico se retiró
el 18-sep-2026), un panel de gestión en PHP 5.6 en `gestion/`, y un proyecto
de Unreal 5.8 aparte que se entrega como ejecutable para la oficina de ventas.

## Reglas

- Desarrollar, commitear y hacer push en `claude/hopeful-faraday-7y80bt`.
- `[wip]` en el mensaje de commit salta el deploy al hosting.
- No crear pull requests salvo que se pida explícitamente.
- Ningún secreto nuevo: el deploy va con el workflow FTP que ya existe.
- El rendimiento en iPhone es requisito del visor web.
- `unreal.html` (la interfaz para el ejecutable de Unreal) se genera con
  `node tools/unreal_html.mjs` y se commitea generada; no se edita a mano.
- `gestion/` tiene que seguir siendo PHP 5.6 (el hosting corre 7.0.33; el
  guardián `.github/scripts/comprobar-php56.sh` lo vigila en el deploy).
- Desde el entorno de desarrollo en la nube no hay salida a
  `showroom.unikdi.com`: las comprobaciones contra el hosting se hacen con el
  workflow `diagnostico-panel.yml`.

## Si esta sesión corre en el PC de Fran con Unreal abierto

Leer primero `docs/UNREAL_ESTADO.md`: estado del proyecto, recetas, protocolo
y orden de trabajo. El MCP del editor está declarado en `.mcp.json`
(`http://127.0.0.1:8000/mcp`); en Unreal hay que arrancarlo con
`ModelContextProtocol.StartServer` en la consola. Hacer `git pull` antes de
tocar el repositorio y commitear solo `docs/` y lo del lado Unreal: el código
web lo lleva la sesión en la nube.

## Documentos

- `docs/UNREAL_ESTADO.md` — traspaso completo del proyecto de Unreal.
- `docs/PROTOCOLO_STREAMING.md` — los mensajes entre interfaz y aplicación.
- `docs/PANEL_Y_EJECUTABLE.md` — panel, endpoint y contrato de estados.
- `js/visor/CONTRATO.md` — contrato interno del visor.
