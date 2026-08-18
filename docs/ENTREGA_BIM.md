# Especificación de entrega del BIM — Showroom Edificio Apolo

Documento para pasar al equipo de arquitectura antes de exportar el modelo
definitivo (edificio y entorno).

## Por qué hace falta esto

El FBX llega al visor como un montón de mallas sueltas: sin niveles, sin
categorías y sin propiedades. Eso obliga a que el visor *deduzca* a qué planta
pertenece cada elemento y a qué altura debe cortar la sección, y esa deducción
es estadística — mira las cotas y los remates de los muros.

En el modelo provisional falló por dos motivos concretos: los cuatro tramos del
edificio están a cotas distintas, y en el tramo 2 los muros rematan 80 cm por
debajo del forjado (cajones de persiana). El resultado es que el plano de corte
cae donde no toca y aparecen tapas negras encima de las ventanas o tramos
enteros sin cortar.

Todo lo que sigue existe para que el visor no tenga que deducir nada.

## 1. Planos de corte explícitos

Es lo que resuelve el problema de raíz. Por cada planta y cada tramo:

- Un **sólido genérico** (categoría *Modelo genérico* / *Generic Model*)
  horizontal, de 1 cm de espesor.
- Con la **huella completa del tramo**. Que sobresalga de la fachada da igual,
  solo se lee su altura.
- Colocado **exactamente a la cota a la que quieren que se corte** esa planta.
  El criterio es suyo: lo habitual es entre 1,10 y 1,50 m sobre el forjado
  acabado, por encima de los antepechos y por debajo de los dinteles.
- Nombrado `CORTE_P<planta>_T<tramo>`, por ejemplo `CORTE_P02_T1`.

Si una planta tuviera una única cota en todo el edificio, basta con uno:
`CORTE_P02`.

**Importante:** un plano de referencia o un plano de trabajo de Revit *no*
sirven, porque no se exportan a FBX. Tiene que ser geometría real.

## 2. Un archivo por planta

Lo preferible es un FBX por planta: `APOLO_P01.fbx`, `APOLO_P02.fbx`, etc.

Si tiene que ir todo en un único archivo, entonces cada objeto debe llevar el
prefijo de su planta en el nombre: `P01_MURO_...`.

Lo que no funciona es que la planta haya que deducirla de la cota Z: los
elementos que cruzan dos plantas (pilares de dos alturas, escaleras, muros de
patinillo, petos) se asignan mal y desaparecen o se duplican al aislar una
planta.

## 3. Prefijo de categoría en el nombre de cada objeto

El visor pinta cada familia con un material distinto y decide qué se oculta al
aislar una planta. Hoy lo deduce de los nombres por defecto de Revit
(`Muro…`, `Suelo…`, `VEN-…`, `Puerta…`), y eso se rompe en cuanto alguien
renombra un tipo de familia.

Prefijos pedidos:

| Prefijo | Elemento                          |
|---------|-----------------------------------|
| `MURO_` | muros de carga y fachada          |
| `TAB_`  | tabiquería interior               |
| `PIL_`  | pilares                           |
| `FORJ_` | forjados y losas                  |
| `ESC_`  | escaleras y rampas                |
| `VID_`  | vidrio y carpintería              |
| `BAR_`  | barandillas y petos               |
| `CUB_`  | cubierta y casetones              |

## 4. Identidad de cada vivienda

Es hoy la parte más frágil de todo el montaje. Por cada una de las 166
viviendas hace falta **un sólido genérico que ocupe su superficie** (una
"burbuja" de la vivienda, de suelo a techo), nombrado con el código real de
comercialización:

```
VIV_SE-AP-124
```

Con eso, el visor asocia geometría ↔ ficha ↔ disponibilidad por nombre en vez
de por proximidad geométrica, y coloca la etiqueta de estado (verde disponible
/ naranja reservada) en el centro correcto de la vivienda.

## 5. Lo que no debe venir

- Mobiliario, sanitarios, electrodomésticos y vegetación de relleno.
- Vistas, cotas, textos y anotaciones.
- Instalaciones (MEP), salvo que se pidan expresamente.

Si resulta más cómodo no depurarlo, que venga todo agrupado bajo un nombre
`DESCARTE_` y se filtra en el pipeline.

## 6. Geometría y coordenadas

- **Unidades en metros.**
- **Coordenadas compartidas** (*shared coordinates*) idénticas en el modelo del
  edificio y en el del entorno. Es lo que hace que encajen solos, sin tener que
  alinearlos a ojo.
- Punto base del proyecto fijo y comunicado por escrito.
- Huecos de ventanas y puertas resueltos como huecos reales en el muro.
- Muros y tabiques de tipo seco (placa + cámara + placa): interesa que se
  exporten como **sólidos macizos**, o al menos con las cámaras cerradas. Si
  llegan como capas separadas, el corte deja ver el hueco interior y el muro no
  lee como un todo.
- FBX binario, con las mallas ya trianguladas.

## 7. Si además pueden entregar IFC 4

Un IFC 4 lleva de serie lo que el FBX obliga a codificar a mano en el nombre:
niveles (`IfcBuildingStorey`), categorías (`IfcWall`, `IfcSlab`, `IfcColumn`,
`IfcStair`) y conjuntos de propiedades. Con IFC, los puntos 2, 3 y 4 de este
documento dejan de hacer falta: la información ya viene estructurada.

El coste está de nuestro lado (cambiar el conversor de entrada), y a cambio
desaparece la clase entera de problemas.

La entrega ideal sería: **IFC 4 + los sólidos de corte del punto 1.** Con eso
sobra todo lo demás.

## 8. Coordenadas de mapeado (UV) y materiales nombrados

Dos cosas que hay que pedir expresamente porque no salen solas:

**Exportar con coordenadas UV.** El modelo provisional llegó sin ellas, y sin
UVs no se pueden aplicar texturas por el camino normal: el grano del monocapa
hay que fingirlo calculándolo en el shader a partir de la posición en el
mundo. Funciona, pero es un apaño.

**Asignar y nombrar los materiales en Revit.** No hace falta que pongan la
textura buena —esas viajan mal a FBX, referencian archivos locales y se
pierde el mapeado—, pero sí que cada elemento llegue con el nombre de su
material: `Monocapa blanco`, `Vidrio bajo emisivo`, `Carpintería lacada`… Con
eso el material se asigna por nombre en vez de deducirlo de cómo se llame la
familia, que es lo que se hace ahora y se rompe en cuanto alguien renombra
algo.

Las texturas finales las montamos nosotros a partir de fotos de muestra: el
tiempo real necesita piezas pequeñas, repetibles y comprimidas, con sus mapas
de rugosidad y relieve, que no es lo que produce un render offline.

## Lo mínimo imprescindible

Si solo pueden atender a tres cosas:

1. Los sólidos de corte por planta y tramo (punto 1).
2. Un archivo por planta (punto 2).
3. El sólido por vivienda con el código `SE-AP-XXX` (punto 4).

Y, en cualquier caso, que la exportación lleve coordenadas UV (punto 8).
