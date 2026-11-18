# Datos del showroom nuevo (/nuevo)

Cómo entran los datos de la promoción en el showroom de renders, qué forma
tienen y qué reglas se comprueban. Vale para el conversor en Python
(`nuevo/tools/excel_a_json.py`) y para el importador del panel web, que lee
**el mismo Excel en el navegador con SheetJS** y aplica **las mismas reglas**.

```
  SERENEA_Showroom_Carga_v1.xlsx      lo rellena el cliente (Apolo ya viene precargado)
              │
              │  panel web: «Cargar Excel» (SheetJS en el navegador,
              │  reglas de nuevo/data/esquema_plantilla.json)
              │  ─ o ─ en local: python3 nuevo/tools/excel_a_json.py
              ▼
  catálogo  (nuevo/data/serenea.json)        superficies, estancias, tipologías, textos
     +
  estado vivo (nuevo/gestion/datos/…)        estado, precio, visible: lo cambia el panel
              │
              ├──► web pública /nuevo (une catálogo + estado vivo; el estado vivo manda)
              └──► /gestion/api/estado.php ──► ejecutable de Unreal de la oficina (contrato actual, sin cambios)
```

## Ficheros

| Fichero | Qué es | ¿Público? |
|---|---|---|
| `nuevo/plantilla/SERENEA_Showroom_Carga_v1.xlsx` | Plantilla de carga con Apolo completo (166 viviendas, 792 estancias) | No (`.htaccess` lo bloquea): lleva notas internas |
| `nuevo/data/serenea.json` | Catálogo generado desde el Excel (modelo de abajo) | Sí, lo lee la web |
| `nuevo/data/tipologias.json` | Tipologías de Apolo, espejos, variantes y recuento de renders | Sí (no lleva nada privado) |
| `nuevo/data/esquema_plantilla.json` | Columnas, tipos, listas y tolerancias: la definición que comparten Python y el panel | Sí |
| `nuevo/data/fuentes/apolo_semilla.json` | Datos de Apolo cruzados de las fuentes, con avisos | No (`.htaccess`) |
| `nuevo/tools/apolo_semilla.py` | Lee las 166 fichas PDF, cruza fuentes, agrupa tipologías | No |
| `nuevo/tools/crear_plantilla.py` | Genera la plantilla Excel desde la semilla y el esquema | No |
| `nuevo/tools/excel_a_json.py` | Valida el Excel y escribe `serenea.json`; exporta el esquema | No |

Regenerar todo (requiere `pdftotext`, Pillow, numpy y openpyxl):

```sh
python3 nuevo/tools/apolo_semilla.py --discrepancias /ruta/discrepancias.md   # ≈ 45 s
python3 nuevo/tools/crear_plantilla.py
python3 nuevo/tools/excel_a_json.py nuevo/plantilla/SERENEA_Showroom_Carga_v1.xlsx
python3 nuevo/tools/excel_a_json.py --esquema nuevo/data/esquema_plantilla.json
```

`excel_a_json.py` sale con 0 si no hay errores, 1 si los hay (y entonces no
escribe el JSON, salvo `--forzar`) y 2 si no puede abrir el fichero.
`--con-notas` añade las notas internas: **solo para uso interno, nunca en el
JSON publicado**.

## La plantilla

Hojas: `LÉEME`, `Promoción`, `Edificios`, `Plantas`, `Viviendas`, `Estancias`,
`PlanesPago`, `Listas`. La fila 1 de cada hoja de datos son las cabeceras; los
datos empiezan en la fila 2. Las columnas se localizan **por el texto de la
cabecera** (sin el asterisco, sin distinguir mayúsculas ni tildes), no por su
posición; una columna desconocida se ignora con aviso.

- Cabecera con ` *` y fondo oscuro = obligatoria. Fondo gris = opcional.
  Cada cabecera lleva un comentario con su explicación.
- Desplegables (validación de datos) en todas las columnas con lista, Sí/No,
  edificio, planta, vivienda y plan de pagos; rangos numéricos en el resto.
- `Promoción` es una hoja de pares Campo / Valor (columnas A y B).
- `Listas` está protegida (sin contraseña) y alimenta los desplegables.
- Filas guía: si «Notas internas» empieza por `GUÍA` y la columna clave de la
  fila está vacía, la fila se ignora sin avisar.
- Celdas en amarillo: dato a revisar. El color no se lee; la explicación está
  en «Notas internas».
- Formatos: m² `#,##0.00" m²"`, euros `#,##0" €"`, porcentajes `0.0%` (Excel
  guarda 7 % como 0,07), identificadores como texto.

Columna clave de cada hoja (identifica la fila en los mensajes): Edificios →
ID, Plantas → Código, Viviendas → ID, Estancias → Vivienda, PlanesPago → Código.

### Hojas y columnas

La definición exacta (tipo, obligatoria, rango, ayuda) está en
`esquema_plantilla.json`. Resumen:

- **Promoción**: ID de la promoción\*, Nombre visible\*, Promotora\*,
  Dirección, Localidad, IGIC por defecto (%), Texto junto al precio,
  Teléfono, Correo, Aviso legal, Versión de los precios (interna).
- **Edificios**: ID\*, Nombre visible\*, Nº en el plano del conjunto\*,
  Nº de plantas (control), Orden\*, Estado comercial\* (En venta /
  Próximamente / Agotado / Oculto), Texto breve, Notas internas.
- **Plantas**: Edificio\*, Código\* (P-1, P0…P10), Nombre visible\* («Planta 1»,
  «Ático»), Orden\* (de abajo arriba), Tipo de ventana\* (antepecho /
  suelo-techo), Notas internas.
- **Viviendas**: Edificio\*, ID\*, Referencia\*, Planta\*, Tipología,
  Dormitorios\* (0 = estudio), Baños\*, Orientación, Sup. útil\*, Sup.
  construida interior\*, Sup. construida con ZZCC, Terraza, Precio sin
  impuestos, IGIC (%), Estado\* (Disponible / Reservada / Vendida / No a la
  venta), Visible en web\*, Plan de pagos, Notas internas.
- **Estancias**: Vivienda\*, Orden\*, Código\* (SCC, EST, D1…, B1…, VE, DI, LA,
  TE), Nombre visible\*, Tipo\* (lista), Sup. útil (obligatoria salvo Terraza y
  Patio), Tiene 360\*, Puntos 360, Notas internas.
- **PlanesPago**: Código\*, Nombre visible\*, Reserva (%), Reserva (importe
  fijo, €), Firma del contrato (%)\*, Aplazado durante la obra (%)\*, Nº de
  cuotas, Entrega de llaves (%)\*, Es ejemplo\*, Notas internas.

### Identificadores

- **Vivienda**: único en toda la promoción y estable. Apolo conserva `101`…`436`,
  que son los del modelo, de `/gestion/api/estado.php` y del ejecutable de
  Unreal. Los demás edificios, con prefijo (`HE-1A`, `ZE-1A`…): en el
  `SERENEA_Pricing v.07` Hera y Hermes comparten el prefijo `SE-HE-`, así que
  hay que decidir uno distinto para Hermes antes de cargarlos.
- **Referencia comercial**: única en la promoción. Apolo usa el formato de las
  fichas, `SEAP-101` (el Pricing escribe `SE-AP-101`).
- **Edificio**: corto y fijo, por su número en el plano del conjunto: `apolo` (1),
  `zeus` (2), `atenea` (3), `hera` (4) y `hermes` (5). Prefijos de referencia:
  AP, ZE, AT, HE y HM (el Pricing v.07 da SE-HE también a Hermes, y chocaría
  con Hera).
- **Código de estancia**: único dentro de la vivienda; con la tipología nombra
  los 360 (`<tipología>_<código>`, p. ej. `2D-08_D1`).

## Reglas de validación

Los **errores** impiden la carga; los **avisos** se enseñan pero no la
impiden. Cada mensaje dice hoja, fila y clave: `Viviendas · fila 37 · 136: …`.

Errores:

1. Falta una hoja o una columna obligatoria.
2. Celda obligatoria vacía (Promoción incluida).
3. Tipo incorrecto: número que no es número (acepta `60,87`, `1.234,56`,
   `60,87 m²`, `191.000 €`), entero con decimales, fuera de rango, Sí/No o
   valor que no está en su lista, identificador con espacios o caracteres no
   permitidos.
4. Repetidos: ID de edificio, Nº en el plano, (edificio, código de planta), ID
   de vivienda, referencia, (vivienda, código de estancia), código de plan.
   Una vivienda repetida se procesa solo la primera vez.
5. Referencias rotas: edificio inexistente (Plantas, Viviendas), planta que no
   existe **en ese edificio**, estancia de una vivienda inexistente, plan de
   pagos inexistente o marcado como ejemplo.
6. Superficies que no cuadran: la suma de las estancias interiores (todas
   menos Terraza y Patio) difiere de la útil más de 0,05 m²; útil > construida
   interior; construida interior > construida con ZZCC; estancia interior sin
   superficie.
7. Dormitorios o baños de Viviendas distintos de los de Estancias
   (Dormitorio principal + Dormitorio; Baño + Aseo).
8. Vivienda Disponible sin precio.
9. Plan de pagos cuyos cuatro porcentajes no suman 100 % (±0,01).
10. Dos plantas del mismo edificio con el mismo orden.

Avisos: útil / construida fuera de 0,70–0,97; Reservada sin precio; precio por
debajo de 10.000 €; Disponible pero no visible; vivienda sin tipología o sin
estancias; terraza en Estancias sin superficie de terraza en Viviendas; Tiene
360 con 0 puntos; plan con aplazado y sin nº de cuotas, o con reserva en % e
importe a la vez; Nº de plantas distinto de las filas de Plantas; edificio sin
plantas o sin viviendas; sin IGIC por defecto ni propio; columnas desconocidas;
filas sin ID con datos; textos de más de 200 caracteres.

Porcentajes: un número ≤ 1 se lee como fracción (0,07 = 7 %, que es lo que
guarda Excel con formato de porcentaje); mayor que 1, como porcentaje (7 = 7 %).
El JSON los guarda siempre en tanto por ciento (7).

## `serenea.json` (catálogo)

```json
{
 "esquema": 1,
 "generado": "2026-11-18T15:04:00+00:00",
 "origen": { "fichero": "SERENEA_Showroom_Carga_v1.xlsx", "sha256": "16 primeros hex" },
 "promocion": { "id": "serenea", "nombre": "SERENEA", "promotora": "Serenea by Unik SL",
                "direccion": "…", "localidad": "…", "igic": null, "textoPrecio": "+ IGIC",
                "telefono": null, "correo": null, "avisoLegal": null, "moneda": "EUR" },
 "planesPago": [
   { "codigo": "ESTANDAR", "nombre": "…",
     "reserva": { "porcentaje": 0, "importe": 6000 }, "contrato": 20,
     "aplazado": { "porcentaje": 30, "cuotas": 12 }, "entrega": 50 } ],
 "edificios": [
   { "id": "apolo", "nombre": "Apolo", "numero": 1, "orden": 1, "estado": "en-venta",
     "texto": "…", "numPlantas": 4,
     "plantas": [
       { "codigo": "P1", "nombre": "Planta 1", "orden": 1, "ventana": "antepecho",
         "viviendas": [
           { "id": "101", "referencia": "SEAP-101", "tipologia": "2D-01",
             "dormitorios": 2, "banos": 1, "orientacion": "Suroeste",
             "superficies": { "util": 53.49, "construidaInterior": 60.87,
                              "construidaZZCC": 75.15, "terraza": 0 },
             "precio": 191000, "igic": null, "estado": "reservada", "visible": true,
             "planPagos": null,
             "estancias": [
               { "codigo": "SCC", "orden": 1, "nombre": "Salón - comedor - cocina",
                 "tipo": "salon-comedor-cocina", "superficie": 21.76,
                 "tiene360": true, "puntos360": 1 } ] } ] } ] } ],
 "resumen": { "edificios": 5, "edificiosConViviendas": 1, "plantas": 4, "viviendas": 166,
              "estancias": 792, "estados": { "disponible": 96, "reservada": 15, "vendida": 55 },
              "planesPago": 0 }
}
```

- Orden: edificios por `orden`, plantas por `orden`, viviendas en el orden del
  Excel, estancias por `orden`.
- `estado`: `disponible` | `reservada` | `vendida` | `no-a-la-venta`.
  Edificio: `en-venta` | `proximamente` | `agotado` | `oculto`.
- `tipo` de estancia: `salon-comedor-cocina`, `salon-comedor`, `salon`,
  `cocina`, `estudio`, `dormitorio-principal`, `dormitorio`, `bano`, `aseo`,
  `vestidor`, `distribuidor`, `lavadero`, `trastero`, `terraza`, `patio`,
  `otro`. `terraza` y `patio` no suman en la útil y pueden ir con
  `superficie: null` (las fichas solo dan la construida exterior, que está en
  `superficies.terraza`).
- `igic`: el de la vivienda o, si no tiene, el de la promoción; `null` si no
  hay ninguno (la web enseña «+ IGIC» sin total).
- `visible: false`: la vivienda sigue en el JSON (hace falta para el velo gris
  del plano) pero **sin `precio` ni `planPagos`**.
- Las notas internas **no** salen en el JSON (salvo `--con-notas`).
- Superficies en m² con 2 decimales; precios en euros enteros, sin impuestos;
  porcentajes en tanto por ciento.

**Ojo: el `serenea.json` actual lleva los estados de demostración** de
`data/availability.json` (ver «Estado vivo»). Sirve para desarrollar; los
estados que valen son los del panel.

## `tipologias.json`

Agrupa las viviendas de Apolo para decidir cuántos renders hacen falta.

- **Tipología**: misma lista de estancias por tipo con superficies útiles
  iguales ±0,15 m² (fichas PDF; «Dormitorio individual» = «Dormitorio
  secundario») **y** el mismo plano (`assets/planos/<id>.png`) salvo giro o
  espejo. Los planos están todos a la misma escala (≈125 px/m, comprobado con
  los polígonos del modelo) y se comparan con correlación normalizada y
  búsqueda de desplazamiento por FFT en los ocho giros/espejos; dentro de una
  tipología la similitud mínima es 0,84 y el margen entre la mejor
  transformación y la mejor de la simetría contraria es ≥ 0,11, así que la
  detección de espejos es fiable. La terraza no separa tipologías.
- **Variante**: un render cenital. Misma tipología, terraza ±0,5 m²,
  construida interior ±0,15 m² y mismo grupo de plantas (planta 1 / plantas
  2-3 / ático: la planta 1 tiene retranqueos distintos en la fachada del
  corredor y el ático, su terraza). `transformaciones` dice, por vivienda,
  cómo colocar la imagen de la referencia de la variante: `igual`,
  `giro90/180/270` o `espejoH/espejoV/traspuesta/transversa`.
- **Familia** (informativo): tipologías con el mismo programa y dibujo pero
  otras medidas (p. ej. 101…106, que se estrechan a lo largo de la fachada).

```json
{ "resumen": { "viviendas": 166, "tipologias": 43, "tipologiasDeUnaVivienda": 16,
               "variantesCenital": 72, "cenitalesSinVoltear": 84,
               "variantesCenitalSinSepararPlanta1": 52,
               "puntos360Interior": 200, "puntos360Terraza": 23,
               "familias": 27, "puntos360InteriorPorFamilia": 118 },
  "tipologias": [ { "codigo": "2D-08", "ids": ["111", "…"], "recuento": 30,
                    "niveles": [1, 2, 3], "dormitorios": 2, "banos": 1, "estudio": false,
                    "estancias": [ { "codigo": "SCC", "tipo": "salon-comedor-cocina",
                                     "nombre": "…", "sup": 20.69, "rango": [20.69, 20.73],
                                     "tiene360": true } ],
                    "referencia": "111", "espejadas": ["112", "…"],
                    "transformaciones": { "111": "igual", "112": "espejoH" },
                    "similitudMinima": 0.839, "margenEspejo": 0.192,
                    "ventanas": ["antepecho", "suelo-techo"], "familia": "F05",
                    "variantes": [ { "codigo": "2D-08a", "grupoPlantas": "planta 1",
                                     "ids": ["…"], "terraza": 0.0,
                                     "supConstruidaInterior": [56.16, 56.24],
                                     "espejadas": ["…"], "referencia": "111",
                                     "transformaciones": { "…": "…" } } ],
                    "renders": { "cenitales": 5, "cenitalesSinVoltear": 7,
                                 "p360Interior": 7, "p360Terraza": 0 } } ] }
```

Cómo se cuentan los 360: salón/estudio y dormitorios, uno por tipo de ventana
presente en la tipología (antepecho en planta 1, suelo-techo en el resto);
baños, cada uno una vez por tipología (son interiores, sin ventana); terrazas ≥ 10 m², uno
por terraza distinta y dos si pasa de 40 m². Una vivienda espejada usa la
panorámica volteada en horizontal; una girada, la misma con otro rumbo inicial.

## El panel: importación en el navegador

El panel nuevo (PHP 5.6 en el servidor) **no lee Excel**: lo hace el
navegador con SheetJS, así PHP solo recibe JSON ya validado.

1. El usuario elige el `.xlsx`. SheetJS lo lee (`XLSX.read(buf, {type: 'array'})`;
   valores con `sheet_to_json(ws, {header: 1, raw: true})`).
2. Se aplican las reglas de arriba con `esquema_plantilla.json` (mismas
   cabeceras, tipos, listas, tolerancias y códigos). Si el resultado no
   coincide con el de `excel_a_json.py` para el mismo fichero, el error es del
   panel: `excel_a_json.py` es la referencia.
3. Se enseña el informe (errores y avisos por hoja y fila). Con errores no se
   puede publicar.
4. Sin errores: resumen y **diferencias con lo publicado** (viviendas nuevas,
   que desaparecen, cambios de superficie, de estado y de precio).
5. Al publicar se envía el catálogo (el mismo JSON que `serenea.json`) y el PHP
   lo guarda en `nuevo/gestion/datos/` (carpeta que el deploy no borra), con
   copia de la versión anterior.

SheetJS: usar una versión ≥ 0.19.3 (la 0.18.5 de npm tiene un fallo de
seguridad conocido al leer ficheros manipulados); la de `cdn.sheetjs.com`
(0.20.x) se puede copiar al repositorio para no depender de su CDN.

Reglas de las cargas posteriores (lo que el `LÉEME` promete al cliente):

- El catálogo (superficies, estancias, textos, tipologías) se **sustituye**
  por el del Excel.
- Estado, precio y visibilidad cambiados en el panel **se conservan**, salvo
  que el usuario marque «Aplicar también estados y precios del Excel».
- Una vivienda que deja de estar en el Excel no se borra sin confirmación.
- El panel ofrece «Descargar Excel» con los datos actuales en este mismo
  formato (con openpyxl en local o SheetJS en el navegador), para rehacer
  la carga sin volver atrás.

## Estado vivo, `/gestion/api/estado.php` y el ejecutable de Unreal

Hoy la verdad del estado comercial de Apolo es `gestion/datos/estado.json`
en el servidor, que escribe el panel antiguo (`/gestion`) y publica
`/gestion/api/estado.php` (`{actualizado, sello, total, viviendas: {"101":
"vendida", …}}`, con ETag). Lo leen el visor antiguo y el ejecutable de Unreal
de la oficina (`docs/PANEL_Y_EJECUTABLE.md`). `data/availability.json` es solo
la semilla y, ahora mismo, **de demostración** (commit a525537, «disponibilidad
demo 70/30 fija»).

Propuesta para que no haya dos verdades:

- El estado vivo del showroom nuevo (estado de 4 valores, precio, visible)
  vive en `nuevo/gestion/datos/` y lo escribe solo el panel nuevo.
- En cada guardado, el panel nuevo **regenera `gestion/datos/estado.json`**
  con el formato de siempre, solo con los IDs de Apolo y los tres estados
  del contrato (`no-a-la-venta` se publica como `vendida`, para que el
  ejecutable no la ofrezca), y con `sello` y `actualizado` nuevos. Así
  `/gestion/api/estado.php`, el visor antiguo y el ejecutable siguen
  funcionando sin tocar una línea ni recompilar.
- El panel antiguo (`/gestion`) pasa a solo lectura (o se retira) en cuanto
  el nuevo esté en marcha: dos paneles escribiendo acabarían pisándose.
- **Primera carga**: los estados reales no están en el repositorio. Al
  importar el Excel por primera vez, el panel debe ofrecer «Tomar los estados
  actuales de /gestion/api/estado.php» (opción por defecto) en lugar de los
  del Excel, que vienen de la semilla de demostración.
- Los IDs de vivienda son los mismos en el Excel, en `serenea.json`, en el
  endpoint y en las mallas del ejecutable: no se renumeran.
