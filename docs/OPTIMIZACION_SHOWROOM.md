# Optimización del showroom /new

Base: `943a24333d98c19bc8190389b35b40386dc29bb7`, rama
`claude/hopeful-faraday-7y80bt`, correspondiente al sitio publicado revisado.
Propuesta: `codex/showroom-rendimiento`.

## Cambios

- Cielo, envolvente y entorno comienzan a cargar en paralelo. La integración
  final sigue esperando a los tres y conserva el tratamiento de fallo del entorno.
- Las variantes cortadas se solicitan al visitar la planta, tanto en móvil
  como en ordenador. El mecanismo existente de planos de corte mantiene la
  transición mientras llega el fichero; una variante ya visitada se reutiliza.
  Se difiere la descarga de **33.599.500 bytes** (33,60 MB decimales), suma de
  los cuatro GLB de corte. Es peso de archivos, no una medición de memoria GPU
  ni un porcentaje de mejora de velocidad. Si se visitan todas las plantas,
  se terminarán descargando y reteniendo las cuatro.
- La resolución del lienzo 3D responde al tiempo por fotograma durante los
  gestos y las transiciones. Usa ventanas de 0,8 s, baja por debajo de 45 FPS
  sostenidos y recupera gradualmente tras dos ventanas por encima de 58 FPS.
  Son umbrales del controlador, no FPS medidos. Las pausas largas y la carga
  inicial no se usan para clasificar el equipo. El límite inferior es 0,75
  (o el techo del dispositivo si es menor); al parar vuelve al máximo original.
  Esto intercambia detalle temporal por fluidez durante el movimiento.
- El perfil móvil se fija antes de crear las luces, de modo que CSM nazca
  con las dos cascadas previstas, en lugar de crear tres y reducir después
  solo el tamaño de sus mapas. El móvil incorpora FXAA de una pasada después
  de la salida; escritorio conserva SMAA. El resultado visual requiere revisión.
- SSR no reserva destinos de render cuando está desactivado. La demo de post
  conserva acceso explícito mediante `crearPost(ctx, luz, { reflejos: true })`.
- El cambio de DPR deja de redimensionar cada pasada dos veces.
- El picking se repite al cambiar puntero, cámara, proyección, planta,
  geometría o materiales, en vez de raycastar continuamente una vista inmóvil.
- El trazador acumula hasta 512 muestras y después presenta el resultado sin
  nuevos rayos. Las invalidaciones existentes reinician la acumulación. El
  parámetro `maxMuestras: 0` permite refinado ilimitado cuando sea necesario.
  Un límite finito puede conservar ruido residual: comprobar escenas nocturnas.
- Se omite el trabajo de dibujo si el documento está oculto.

## Conservación del original

El HTML visible de `new/index.html`, `new/css/shell.css`, `new/js/shell.js`,
los logotipos, el resto de assets y los datos del edificio permanecen iguales
a la base. El único cambio en el HTML del showroom es una entrada del mapa
de importaciones. No se modifican geometría, cotas, contornos, encuadres,
disponibilidad, precios ni el flujo de publicación.

## Validación realizada

```bash
node --test tools/rendimiento.test.mjs
```

Nueve pruebas de comportamiento: adaptación, recuperación, límites, pausas,
carga inicial, conservación de las pasadas de escritorio, composición FXAA
en móvil, ausencia de reservas SSR por defecto y redimensionado único.
Las pruebas de post usan los constructores reales de Three.js del repositorio
y un renderer de prueba, sin dibujar. No validan los shaders en una GPU.

También se comprueban sintaxis de los módulos modificados, resolución de sus
importaciones locales y conservación del HTML visible, estilos, assets y datos.

## Comparación pendiente antes de publicar

El navegador disponible para esta revisión tiene WebGL deshabilitado. No se
ha medido el tiempo real hasta primera imagen, FPS, memoria GPU ni calidad
visual. Esta propuesta debe permanecer como borrador hasta completar:

1. Servir esta rama y la base desde dos carpetas/puertos con el mismo equipo.
   Es un sitio estático: `python3 -m http.server 8765`; abrir `/new/`.
2. Comparar carga en frío y con caché, con igual red y dimensiones de ventana.
3. Girar, acercar y alejar; detenerse y comprobar recuperación de nitidez.
4. Visitar las cuatro plantas, cambiar de planta durante su descarga, volver
   a edificio completo y verificar selección y etiquetas. La primera visita
   puede mostrar el corte provisional durante más tiempo en redes lentas.
5. Probar amanecer, mediodía, atardecer y noche, además de vivienda enfocada.
6. Repetir en Windows con GPU y en iPhone/iPad. Revisar FXAA, sombras y detalle
   al detenerse; confirmar que no aparecen cortes incorrectos o pantallas negras.

El estado del controlador está disponible para diagnóstico en
`apolo.modulos.resolucion.estado`. La demo `/new/_demos/rendimiento.html`
simula secuencias deterministas y las etiqueta como simulación.

No se ha desplegado ni fusionado esta propuesta. El workflow de publicación
actual escucha las ramas de Claude, no `codex/showroom-rendimiento`.
