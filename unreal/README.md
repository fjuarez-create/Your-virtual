# Prueba de Apolo en Unreal

Estado: **preparación de fuentes terminada; ejecución en Unreal pendiente**.
No existe todavía un render, un ejecutable ni un enlace de Unreal funcionando.
El showroom web publicado conserva su implementación actual.

## Trabajo preparado

- Proyecto inicial para Unreal Engine 5.7 con Interchange, Python y Pixel Streaming 2.
- Conversión reproducible de la envolvente, mobiliario, cuatro cortes y entorno a 200 m.
- Eliminación de la dependencia de Meshopt, WebP y atributos cuantizados en los GLB de importación.
- Texturas PNG con los mismos píxeles decodificados del WebP; geometría Float32 con las mismas posiciones, índices, UV, jerarquía y transformaciones dentro de la precisión indicada en `VALIDACION_MODELOS.json`.
- Se conserva el material `pbrMetallicRoughness` utilizado por el visor. Se retira la descripción alternativa y redundante `KHR_materials_pbrSpecularGlossiness`.
- Script de importación que crea mapas separados para no superponer las cuatro plantas.
- Configuración inicial de Lumen, sombras virtuales y TSR. No equivale a una calibración visual ni a un benchmark.

Los archivos preparados pesan más que los GLB web porque están descomprimidos.
Se importarán y cocinarán como recursos nativos de Unreal; no se descargarán en
el navegador del comprador. La transmisión por navegador requiere un proceso
de Unreal funcionando en una máquina con GPU.

## Preparar las fuentes

Desde la raíz del repositorio, con Node 22.15 o posterior:

```bash
npm install --prefix tools
npm install --prefix unreal
node unreal/preparar-modelos.mjs
node unreal/validar-modelos.mjs
```

Si falta `assets/serenea/entorno_200m.glb`, el preparador genera el recorte desde
el entorno original con `tools/recortar_entorno.mjs`. Conserva terreno, viales
y costa. Una pieza que cruza el radio se conserva completa para no abrir caras.
La distancia se calcula en planta, en metros, desde el centro de Apolo registrado
en `data/serenea_modelo.json`: x=66,72; z=-23,94.

Las fuentes y el manifiesto se escriben en `unreal/SourceAssets`. El manifiesto
incluye hashes, dimensiones de las imágenes y las unidades. El validador compara
todos los modelos con el GLTFLoader real del visor y todas las imágenes como RGBA.
No sustituye la prueba del importador ni del render de Unreal.

## Importar en Unreal

Requisitos pendientes: acceso a Epic, Unreal 5.7 instalado y un equipo con GPU
apropiada para el render y la codificación de Pixel Streaming. La máquina de
preparación no dispone del editor ni de GPU. No se ha contratado infraestructura
ni aceptado un nuevo contrato de Epic.

1. Abrir `unreal/SereneaApolo.uproject` en Unreal 5.7.
2. Ejecutar `unreal/Scripts/importar_apolo.py` desde Tools > Execute Python Script.
3. Revisar `Saved/Serenea/importacion.json` y los mapas `/Game/Serenea/Mapas`.
4. Comprobar ejes y dimensiones en el editor. Las fuentes siguen en glTF, metros y
   Y arriba. Interchange realiza la conversión; **no multiplicar otra vez por 100**.

El script guarda los cambios del editor antes de crear mapas. Se detiene si un
mapa de destino ya existe; no sobrescribe trabajo previo. Es una primera
implementación basada en la API de 5.7, **todavía no ejecutada en Unreal**.

## Integración y aspecto pendientes

La interfaz debe conservar el HTML, CSS, tipografías, logotipos y disposición de
`new/index.html`, `new/css/shell.css` y `new/js/shell.js`. Solo se sustituirá la
superficie de imagen 3D por el vídeo de Pixel Streaming. El contrato de la API
`window.apolo` y sus eventos se conservará mediante un adaptador: cámaras,
plantas, selección, estados, modo plano y hora del día. La disponibilidad de las
viviendas seguirá viniendo de los datos comerciales; Unreal no debe inventarla.

Falta implementar y probar ese adaptador, las cámaras y selección en Unreal,
los cortes del mobiliario, las cartelas y la reconexión de la sesión. El script
Python es para el editor; no se utiliza como lógica de una aplicación empaquetada.

Para la iluminación de la prueba se propone Lumen dinámico, que permite cambiar
la hora y las plantas. **No se ha horneado iluminación ni activado Lumen en la
web**. Una alternativa con luz horneada necesitaría escenarios separados y se
compararía después en la GPU elegida. La calibración pendiente incluye cielo
físico o HDR, exposición controlada, reflejos y materiales sin altas luces quemadas.

Las farolas deben situarse en todas las aceras colindantes, al otro lado de las
calles que rodean Apolo. Se excluye toda su manzana, no solo la huella del edificio.
Antes de generarlas hay que verificar el perímetro de la manzana y la cota de las
aceras contra el modelo y el plano topográfico aportado. Encendido y emisión
cálida se vincularán al modo noche. **Todavía no se han colocado ni programado**.

## Publicación pendiente

La infraestructura oficial de Pixel Streaming debe usar la rama `UE5.7` para
coincidir con el motor. Hace falta compilar/cocinar la aplicación, un servidor
de señalización y una conexión de vídeo operativa; servir este proyecto en un
hosting estático no ejecuta Unreal. Para un enlace por Internet, configurar
HTTPS y el transporte WebRTC del proveedor. No se han abierto puertos ni creado
servicios facturables durante esta preparación.

Antes de dar la prueba por terminada: comparar las mismas cámaras del showroom,
probar las cuatro plantas y horarios, selección y fichas, farolas y reconexión.
Medir GPU y fluidez en el navegador receptor, incluida latencia de red. No hay
una cifra de FPS ni mejora porcentual medida todavía.

## Referencias oficiales

- [Licencia de Unreal](https://www.unrealengine.com/license?lang=es-ES).
- [Importación con Interchange](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-assets-using-interchange-in-unreal-engine).
- [API de Interchange 5.7](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/InterchangeManager?application_version=5.7).
- [Inicio de Pixel Streaming](https://dev.epicgames.com/documentation/en-us/unreal-engine/getting-started-with-pixel-streaming-in-unreal-engine).
- [Rendimiento de Lumen](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-performance-guide-for-unreal-engine).
