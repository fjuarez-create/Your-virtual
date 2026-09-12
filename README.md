# UNIK · Showroom Virtual — SERENEA

Showroom inmobiliario interactivo en WebGL (Three.js) para el **Edificio Apolo**
(Serenea by Unik, C/ Íñigo López de Mendoza, Las Huesas, Telde): **166 viviendas**
en cuatro plantas (1–4, el número de planta coincide con el primer dígito de cada
vivienda), con patios ajardinados interiores y terrazas en la planta 4.

![Vista del showroom](docs/screenshot.png)

## ✨ Funcionalidades

Hay **dos visores** sobre el mismo modelo y los mismos datos, para que la
comercializadora compare y elija:

| | `/` (clásico) | `/new` (nuevo) |
|---|---|---|
| Motor | Three.js r170, cielo físico + HDRI, oclusión ambiental y bloom | Three.js r185, CSM, GTAO, bokeh, SMAA y trazado de caminos en reposo |
| Carga | ligero: primera imagen con la envolvente; el resto llega después | más pesado; cuatro momentos del día horneados |
| Plantas | cambia a la variante ya cortada del proyecto | ídem, con transición por planos de recorte |
| Interfaz | cabecera, filtros, listado, modo plano y ficha | raíl lateral, barra de plantas, ficha y galería |

Común a los dos:

- **Modelo del cliente**: `assets/serenea/` sale del GLB que entrega el
  estudio (SketchUp v6) con `tools/build_serenea.mjs`: entorno (terreno,
  costa, calles y los otros cuatro edificios de SERENEA), envolvente de Apolo
  con un vidrio por hueco, mobiliario y las cuatro plantas ya cortadas. Los
  materiales son los del proyecto, no inventados.
- **Cortes del proyecto**: las cotas de sección salen de los componentes
  «CORTE P1…P4» del propio modelo (`data/cortes.json`, ocho cajones por
  planta porque el edificio se escalona con el terreno). El visor nunca los
  dibuja: solo los lee.
- **Viviendas exactas**: el contorno de cada una de las 166 viviendas se
  deduce de los tabiques y las puertas del modelo y se numera con los planos
  comerciales (`tools/viviendas_serenea.mjs` → `data/viviendas_serenea.json`).
  El realce del ratón y la selección caen dentro de la vivienda, sin invadir
  la de al lado.
- **Estados comerciales**: 🟢 disponible · 🟡 reservada · ⚪ vendida (gris,
  inerte: ni se señala ni se selecciona). De noche se encienden las ventanas
  de las que siguen a la venta.
- **Modo día / noche**, filtros en vivo (dormitorios, estado, orientación,
  precio, terraza), listado ordenable, fichas con superficies y precio, y los
  planos comerciales reales de cada planta.
- **Datos reales** del listado de precios V.01 (agosto 2026).

## 🚀 Ejecutar en local

Es un sitio 100 % estático (sin build). Basta un servidor de ficheros:

```bash
cd Your-virtual
python3 -m http.server 8080
# → http://localhost:8080
```

O `npx serve`, nginx, GitHub Pages, Netlify, Vercel… cualquier hosting estático.

## 🗂️ Panel de gestión (`/gestion`)

El comercial marca cada vivienda como disponible, reservada o vendida en
`showroom.unikdi.com/gestion` y los dos visores lo enseñan en el siguiente
refresco, sin tocar el repositorio ni esperar a un deploy. Lo lee también el
ejecutable de la oficina de ventas al arrancar.

- **Estado vivo**: `gestion/datos/estado.json`, solo en el servidor.
  `data/availability.json` queda como semilla y como plan B si el endpoint no
  contesta.
- **Endpoint público**: `GET /gestion/api/estado.php` →
  `{ actualizado, sello, total, viviendas: { "101": "vendida", … } }`.
- **Contraseña**: no hay ninguna en el repositorio ni ningún secreto nuevo en
  GitHub. Se crea desde el propio panel la primera vez que se entra, y se
  guarda cifrada en el servidor. **Hay que entrar a crearla en cuanto se
  publique.**

Los detalles, incluido lo que tiene que hacer el ejecutable de Unreal para
trabajar sin internet, están en [`docs/PANEL_Y_EJECUTABLE.md`](docs/PANEL_Y_EJECUTABLE.md).

## 🔌 Conexión con otro backend

Los visores piden primero `/gestion/api/estado.php` y, si falla, el JSON
estático `data/availability.json`. Para apuntar a un backend distinto basta con
definir las URLs antes de cargar la app (p. ej. en `index.html`):

```html
<script>
  window.APOLO_API = {
    unitsUrl:        'https://api.midominio.com/api/units',        // opcional
    availabilityUrl: 'https://api.midominio.com/api/availability', // recomendado
    leadUrl:         'https://api.midominio.com/api/leads',        // opcional
  };
</script>
```

### Contratos de la API

**GET `availabilityUrl`** — estado comercial por vivienda, en cualquiera de
las dos formas (el mapa pelado, o dentro de `viviendas`):

```json
{ "101": "disponible", "102": "reservada", "103": "vendida" }
```

**GET `unitsUrl`** — catálogo completo (mismo esquema que `data/units.json`):

```json
[{ "id": "101", "planta": "Baja", "dorm": 2, "orientacion": "Suroeste",
   "supViv": 60.87, "terraza": 0, "supTotal": 60.87, "precio": 191000 }]
```

**POST `leadUrl`** — solicitud de información:

```json
{ "unitId": "213" }
```

Sin `leadUrl`, el CTA "Solicitar información" abre el correo (mailto).

## 🧱 Regenerar el modelo

Cuando llegue un GLB nuevo del estudio:

```bash
node tools/build_serenea.mjs SERENEA_Apolo_vN_Entrega.glb   # assets/serenea + data/cortes.json
node tools/viviendas_serenea.mjs SERENEA_Apolo_vN_Entrega.glb  # data/viviendas_serenea.json
```

El primero reparte lo que trae el GLB entre Apolo y el entorno, clasifica
familias (obra, carpintería, puertas, mobiliario), simplifica, comprime las
texturas a WebP y escribe las cuatro variantes cortadas. El segundo levanta el
contorno de cada vivienda y le pone su número.
