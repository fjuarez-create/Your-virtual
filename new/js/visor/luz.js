/* ═══════════════════════════════════════════════════════════════════════════
   luz.js — Momentos del día: cielo, sol en cascada, ambiente, niebla y noche.

   Qué hace este módulo y por qué así:

   · El cielo no se dibuja con el `Sky` de three: se HORNEA. Un shader de
     pantalla completa evalúa la fórmula del Sky (Preetham) por dirección y la
     escribe en una textura equirectangular de 1024×512. De esa textura salen
     las tres cosas que necesitan lo mismo: el fondo (`scene.background`), la
     iluminación de imagen (PMREM → `scene.environment`) y `luz.equirect`, la
     DataTexture legible que el trazador de rayos muestrea. Así los tres ven
     exactamente el mismo cielo y no hay que mantener un cubo `Sky` en la
     escena ni reconstruir el PMREM desde una escena auxiliar.
   · Se hornean dos variantes por momento: CON disco solar (fondo y trazador,
     que necesita una fuente pequeña y brillante para sombras) y SIN disco
     (PMREM), porque el sol ya lo pone la DirectionalLight en raster y meterlo
     también en la IBL lo contaría dos veces y rellenaría las sombras.
   · El mediodía usa la fotografía HDR `assets/sky_day.hdr` (su sol está a
     47°/45°, prácticamente donde la tabla pone el sol de 'dia').
   · El sol es una DirectionalLight en cascada (CSM, 3 cascadas, 400 m). De
     noche esa misma luz se convierte en la luna: dirección distinta, color
     azulado, intensidad baja. No hay dos luces con sombra a la vez.
   · La noche lleva su propio modelo en el mismo shader de horneado: bóveda
     azul profunda, banda cálida de resplandor urbano en el horizonte, luna
     con halo y estrellas. En raster se añaden además estrellas como Points y
     la luna como sprite, porque a 1024×512 la equirect las difumina.

   Decisiones donde el contrato deja hueco (documentadas aquí):
   · `luz.parametros` es la fila OBJETIVO de MOMENTOS; `luz.actual` lleva los
     valores interpolados en vivo (bloom, umbral, exposicion…) para que post.js
     pueda seguir el fundido fotograma a fotograma si quiere.
   · El fundido de IBL se hace con `scene.environmentIntensity` (global), no
     tocando `envMapIntensity` de cada material: cortes.js atenúa plantas con
     ese mismo campo y pisarlo desde aquí rompería su atenuación.
     `aplicarMaterial` registra el material para CSM, guarda `baseEnv` y
     encadena el `onBeforeCompile` previo (el grano de building.js) con el de
     CSM, que si no lo pisaría.
   · `setMomento` devuelve una Promise que se resuelve al terminar el fundido;
     `luz.listo` es la Promise de la primera preparación (HDR cargado o cielo
     horneado). `luz.enTransicion` es lo que main consulta para el trazador.
   · Sin sol en la escena hasta que el cielo está listo: el fundido arranca
     cuando las texturas del destino existen, para que el cambio a mitad sea
     instantáneo y quede tapado por el bajón de exposición.
   · Realce de planta seccionada (`luz.setRealcePlanta(activo, { duracion })`,
     integración del v6): el cliente quiere la planta seccionada A PLENA LUZ,
     como un gemelo digital comercial, no con la luz rasante del momento.
     Con el realce activo (main lo enciende al elegir planta y lo apaga en
     'all') el sol sube a ≥ 62° de elevación conservando el acimut del
     momento, la hemisférica se multiplica ×1,45 y el IBL ×1,25 en amanecer,
     día y atardecer (con ×1,6/×1,4 la planta salía velada: blancos casi
     saturados y poco contraste en los tabiques; con estos, luminancia media
     medida ≈ 170 y sin negros); de noche la luna se queda donde está, la
     hemisférica sube ×2,4 y el IBL ×1,3 (con ×1,5 los patios y los
     interiores quedaban negros: 37 % de píxeles con L < 50). Todo con un
     fundido de 1 s (REALCE.duracion) sobre `luz.realce`, aplicado encima de
     los valores interpolados del momento: cambiar de momento con el realce
     activo lo conserva, y volver a 'all' lo restaura.
   · Noche, revisión: el disco de la luna (×6 en el shader) va solo en la
     equirect CON sol (fondo y trazador); en la del PMREM se queda el halo
     (`lunaDisco` = 0). Con el disco en la IBL y environmentIntensity 1,5,
     claraboyas y paneles de cubierta reflejaban un punto de 1,5 y salían
     como manchas blancas saturadas con halo de bloom, más brillantes que
     las ventanas encendidas. Además la noche baja el IBL a 1,2 y sube el
     umbral del bloom a 0,8 (las ventanas, emisivo 1,4, siguen por encima).
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* Tabla heredada de new/js/main.js y ampliada:
   ibl        → scene.environmentIntensity (cuánto pesa el cielo en el material)
   fondo      → scene.backgroundIntensity
   mie/mieG   → bruma y halo del sol (más bruma al amanecer y al atardecer)
   solMax     → tope del disco solar en la equirect (por el trazador y el half)
   luna       → posición de la luna (solo noche) y su fuerza en el cielo
   resplandor → color y fuerza de la banda urbana en el horizonte (noche)
   estrellas  → intensidad de las estrellas horneadas (noche) */
export const MOMENTOS = {
  /* ── Por qué se quemaba ──
     El disco solar de la equirect valía 12.000 en radiancia lineal (solMax /
     0,04). Con el umbral del bloom en 0,84, ese píxel entraba en la pasada de
     brillo catorce mil veces por encima del corte y el desenfoque lo repartía
     por TODA la pantalla: por eso al amanecer y al atardecer la imagen era un
     borrón blanco o naranja sin dibujo. Ahora el disco se acota a un valor
     que sigue leyéndose como sol (blanco puro tras la curva de tono) pero que
     el bloom puede repartir sin fundir el fotograma, la exposición baja de 1
     y el umbral del bloom sube por encima de 1, de modo que solo florece lo
     que de verdad es una fuente de luz, no una fachada blanca al sol.
     Comprobado mirando de frente al sol en los cuatro momentos. */
  manana: {
    /* Mañana ya entrada, no el amanecer: el sol a 30° no roza la fachada, la
       ilumina. Es el momento que menos riesgo tiene de quemar porque la luz
       no viene de dentro del encuadre. */
    nombre: 'Mañana', elev: 30, azim: 104, turbidez: 2.4, rayleigh: 2.4,
    mie: 0.0022, mieG: 0.78,
    sol: 0xffe8cf, solInt: 2.9, cielo: 0xd6dbe2, suelo: 0x8a7c66, hemiInt: 0.74,
    relleno: 0xf0e6d6, rellenoInt: 0.46, exposicion: 1.0, niebla: 0xaebac9,
    /* El umbral del bloom va POR ENCIMA de la superficie difusa más brillante
       del momento (la fachada al sol, medida en 0,59 de luminancia): con 1,05
       florecía la fachada entera, no solo el sol. */
    bloom: 0.10, umbral: 2.0, bloomRadio: 0.42, hdri: false, luces: false, ventana: 0,
    /* El IBL pesaba más que el sol y por eso calles y campo salían lavados;
       lo que levanta la fachada norte —la del encuadre, que nunca ve el sol—
       es el relleno, que viene justo de esa dirección. `fondo` bajo porque
       si no el cielo se va a blanco. */
    ibl: 0.08, fondo: 0.075, solMax: 45, noche: 0,
    nubes: 0.66, nubesAlto: 30, nubesMax: 5,
    interior: { sol: 0.90, cielo: 0.50, lampara: 0.52, ventana: 0.44, rebote: 0.15, colorVentana: 0xffe8cf },
    grado: { contraste: 1.16, saturacion: 1.12, negros: 0.040 },
  },
  dia: {
    /* Mediodía soleado y CON CIELO AZUL: la clave es rayleigh, que es lo que
       tiñe el cielo. Con 1,05 salía casi blanco; con 2,0 y menos turbidez el
       azul vuelve. La exposición baja a 0,86 para que el asfalto, el campo de
       fútbol y el monocapa conserven dibujo en vez de irse a blanco plano. */
    nombre: 'Mediodía', elev: 56, azim: 26, turbidez: 2.0, rayleigh: 2.6,
    mie: 0.0018, mieG: 0.76,
    /* El ambiente se reparte al revés que antes: poco IBL (el cielo horneado,
       que es azul de verdad) y mucha hemisférica con color CASI NEUTRO. Con el
       reparto anterior, todo lo que estaba en sombra —y la sombra del edificio
       cae sobre la calzada, que es media imagen— se teñía de azul: medido
       91,110,130 contra los 60,63,75 neutros del render del estudio. El cielo
       del fondo sigue siendo igual de azul: esto solo cambia con qué luz se
       rellenan las sombras. */
    sol: 0xfff6e8, solInt: 3.1, cielo: 0xd8dde4, suelo: 0x9c8b70, hemiInt: 0.78,
    relleno: 0xf2e8da, rellenoInt: 0.58, exposicion: 1.06, niebla: 0xafbfd2,
    bloom: 0.09, umbral: 2.2, bloomRadio: 0.42, luces: false, ventana: 0,
    /* `hdri: false` es la clave del CIELO AZUL. Con hdri en true no se usaba
       el cielo procedural sino assets/sky_day.hdr, que es una foto acromática
       (relación azul/rojo 1,01): ninguna exposición la iba a poner azul. Con
       el cielo horneado, turbidez 2,2 y rayleigh 2,2 el cenit sale (129, 170,
       209) y el horizonte (202, 214, 217): azul de verdad. De paso se ahorran
       5,3 MB de descarga y un PMREM de 2048×1024. */
    hdri: false,
    /* `fondo` bajísimo a propósito. Medido contra el render del estudio: su
       cielo es 84,131,188 —azul de verdad— y el del visor salía 203,228,242,
       o sea un azul lavado casi blanco. La curva AgX comprime tanto las luces
       que para que el cielo tenga COLOR hay que darle poca luz. Solo afecta
       al fondo: la iluminación la lleva `ibl`. */
    ibl: 0.07, fondo: 0.055, solMax: 50, noche: 0,
    nubes: 0.72, nubesAlto: 30, nubesMax: 8,
    interior: { sol: 0.92, cielo: 0.55, lampara: 0.54, ventana: 0.50, rebote: 0.16, colorVentana: 0xfff6e8 },
    grado: { contraste: 1.18, saturacion: 1.12, negros: 0.042 },
  },
  atardecer: {
    /* Acimut: 0° es el sur y 270° el oeste (ver direccionDe). A 288 el sol se
       pone por el oeste tirando al sur y la fachada larga recibe la luz
       rasante, que es lo que se quiere enseñar. Sube de 4° a 7°: a ras de
       horizonte el disco entraba en casi cualquier encuadre. El halo de mie
       se cierra (mieG 0,80 y menos turbidez) para que el naranja quede
       alrededor del sol y no cubra el cielo entero. */
    nombre: 'Atardecer', elev: 7, azim: 288, turbidez: 4.0, rayleigh: 2.4,
    mie: 0.0026, mieG: 0.80,
    sol: 0xffa863, solInt: 2.6, cielo: 0xc9ae96, suelo: 0x4a3a2c, hemiInt: 0.5,
    relleno: 0xd9a878, rellenoInt: 0.30, exposicion: 0.95, niebla: 0xb98f6a,
    /* Umbral alto: al atardecer el cielo entero está cerca del corte y con 1,0
       florecía medio fotograma. Sube de 3,8 a 4,6 porque lo que se ponía
       blanco en la planta seccionada no era el sol sino el REFLEJO de su halo
       en los paños de vidrio, que con el realce del IBL se iba a 4,4: por
       encima de 4,6 ya solo florece el disco. */
    bloom: 0.14, umbral: 4.6, bloomRadio: 0.32, hdri: false, luces: true, ventana: 1.0,
    ibl: 0.20, fondo: 0.32, solMax: 30, noche: 0,
    nubes: 0.70, nubesAlto: 34, nubesMax: 2.0,
    interior: { sol: 0.80, cielo: 0.38, lampara: 0.60, ventana: 0.40, rebote: 0.18, colorVentana: 0xffa863 },
    grado: { contraste: 1.14, saturacion: 1.14, negros: 0.030 },
  },
  noche: {
    /* El sol queda bajo el horizonte y la luz direccional pasa a ser la luna.
       Los valores de ambiente son altos a propósito: en la noche el cielo
       apenas emite, y sin ese relleno azulado el edificio sería un negro
       plano contra otro negro. El umbral del bloom sube a 0,95 porque ahora
       las viviendas libres se encienden por dentro (ver edificio.js) y con
       0,8 se convertían en manchas. */
    nombre: 'Noche', elev: -12, azim: 42, turbidez: 8, rayleigh: 0.6,
    mie: 0.004, mieG: 0.8,
    sol: 0xc3d4ff, solInt: 0.5, cielo: 0x243250, suelo: 0x0b0f15, hemiInt: 0.5,
    relleno: 0x7f97c8, rellenoInt: 0.38, exposicion: 1.05, niebla: 0x0a0f19,
    /* El destello de la ventana que el cliente pidió recortar no estaba en el
       cristal sino en el HALO: el paso alto del bloom no resta el umbral, deja
       pasar el píxel entero, y con radio 0,5 los cinco niveles pesaban igual,
       el de 1/32 incluido —el que reparte luz a trescientos píxeles—. Medido:
       el núcleo apenas subía (219→227) y el muro de al lado se iba de 55 a
       114. Segunda pasada, porque en el teléfono seguía brillando demasiado:
       el cristal encendido vale ahora 1,4 × 1,0 × 0,84 × 0,73 ≈ 0,86 —lee como
       ventana con luz, no como foco— y del bloom solo pasa un 20 % (corte
       0,80, rodilla 0,25) con radio 0,14. Ojo con el corte: el interior más
       claro de la planta encendida anda por 0,17 de radiancia, así que 0,80
       deja fuera todo menos el propio cristal. */
    bloom: 0.13, umbral: 0.80, bloomRadio: 0.14, hdri: false, luces: true, ventana: 1.0,
    /* El IBL de noche es el propio cielo horneado, que lleva la banda cálida
       del resplandor urbano en el horizonte. A 1,2 esa banda iluminaba TODA la
       escena desde los lados y dejaba el barrio, los árboles y las palmeras de
       color cobre. A 0,7 sigue habiendo rebote de ciudad, pero la noche vuelve
       a ser azul. */
    ibl: 0.7, fondo: 1.0, solMax: 0, noche: 1,
    luna: { elev: 9, azim: 226, int: 1.0 },
    /* Las estrellas horneadas se dejan tenues: al ampliar la equirect en
       pantalla (unas 5× a 1080p) cada una se convierte en una mancha; las
       estrellas nítidas del raster son los Points de crearCieloNocturno. */
    resplandor: 0xffa869, resplandorInt: 0.10, estrellas: 0.022,
    interior: { sol: 0, cielo: 0, lampara: 0.40, ventana: 0.08, rebote: 0.12, colorVentana: 0xc3d4ff },
    /* Saturación casi a raya: de noche subirla convierte el resplandor cálido
       del horizonte en un filtro sepia sobre el barrio entero. El contraste
       sube un poco, que es lo que da profundidad sin cerrar los interiores. */
    grado: { contraste: 1.12, saturacion: 1.02, negros: 0.020 },
  },
};

const ANCHO = 1024, ALTO = 512;
/* Realce de la planta seccionada (ver cabecera). */
/* El realce multiplica el IBL del momento. Al bajar el IBL de 0,30 a 0,11
   para que las calles dejaran de salir lavadas, el mismo ×1,25 dejaba la
   planta seccionada a oscuras: ahora ×4,2 la devuelve donde estaba
   (0,11 × 4,2 ≈ 0,46, del orden del 0,30 × 1,25 de antes, con margen porque
   la planta abierta no recibe cielo por los lados). */
/* El realce multiplica el ambiente del momento. Al pasar el relleno de las
   sombras del IBL azul a una hemisférica neutra, la hemisférica base subió de
   0,44 a 0,78 y el mismo ×2,4 dejaba la planta seccionada quemada, blanca y
   sin dibujo. Los factores se recalculan para que el ambiente EFECTIVO de la
   planta quede donde estaba: 0,78 × 1,35 ≈ 1,05 de hemisférica y
   0,07 × 6,0 ≈ 0,42 de IBL. */
/* El realce NO mueve el sol. Antes subía la elevación a 62° conservando el
   acimut, y eso dejaba las sombras del edificio apuntando a un sitio y el sol
   del cielo a otro: en cuanto se elegía planta, la imagen dejaba de cuadrar.
   Ahora la planta seccionada se levanta solo con luz SIN DIRECCIÓN
   —hemisférica, relleno e IBL—, que además es la que de verdad mete luz en un
   interior; el sol se queda donde dice el momento y la sombra, con él.

   Los factores son CORTOS a propósito. Estas tres luces son globales: suben en
   toda la escena, no solo en la planta abierta. Con ×1,75 / ×4,2 / ×2,2 la
   planta se veía, sí, pero el conjunto salía lavado y sin una sola sombra en
   la calle. Lo que se gana en el interior se paga en el exterior, y el
   exterior es lo que se enseña primero. */
/* El ×3,2 del IBL era lo que quemaba la planta a mediodía (2,25 de los 5,67
   de irradiancia que le llegaban al suelo) y lo que al atardecer ponía en
   blanco el reflejo del halo del sol en los paños de vidrio: el IBL de un
   material no se puede bajar por separado, porque three pisa
   `envMapIntensity` con `scene.environmentIntensity` en cuanto el material
   no lleva su propio envMap. Baja a ×2,4 y el interior lo recupera
   `cortes.setInterior`, que sí sabe dónde está la vivienda. */
export const REALCE = { hemi: 1.3, ibl: 2.4, relleno: 1.35, hemiNoche: 2.2, iblNoche: 1.4, rellenoNoche: 1.45, duracion: 1.0 };
const CLAVES_NUM = ['solInt', 'hemiInt', 'rellenoInt', 'exposicion', 'bloom', 'umbral', 'bloomRadio', 'ibl', 'fondo', 'noche'];
const CLAVES_COLOR = ['sol', 'cielo', 'suelo', 'relleno', 'niebla'];

function direccionDe(elev, azim) {
  // Misma convención que new/js/main.js: elevación sobre el horizonte y
  // acimut medido desde +Z hacia +X.
  return new THREE.Vector3().setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
}

/* ── Shader de horneado ──────────────────────────────────────────────────────
   Reproduce el `Sky` de three (vértice + fragmento) para una dirección que
   sale de las UV equirectangulares con la misma convención que usa three al
   muestrear un fondo equirect (equirectUv): u = atan(z, x)/2π + 0.5,
   v = asin(y)/π + 0.5. Encima añade el modelo nocturno. Sin tone mapping ni
   conversión de color: la salida es radiancia lineal. */
const FRAG_HORNEADO = /* glsl */`
  precision highp float;
  varying vec2 vUv;

  uniform float turbidity;
  uniform float rayleigh;
  uniform float mieCoefficient;
  uniform float mieDirectionalG;
  uniform vec3 sunPosition;
  uniform vec3 up;
  uniform float showSunDisc;
  uniform float solMax;
  uniform float nubes;          // cobertura de nubes, 0 despejado, 1 cubierto
  uniform float nubesAlto;      // altura del estrato, en unidades del rayo
  uniform float nubesMax;       // tope de radiancia de la nube (si no, florece más que el sol)

  uniform float noche;          // peso del modelo nocturno (0 de día, 1 de noche)
  uniform vec3 lunaDir;
  uniform float lunaInt;
  uniform float lunaDisco;
  uniform vec3 resplandor;
  uniform float resplandorInt;
  uniform float estrellasInt;

  const float pi = 3.141592653589793238462643383279502884197169;
  const float e = 2.71828182845904523536028747135266249775724709369995957;

  // ── Parte del vértice del Sky (depende solo del sol, no de la dirección) ──
  const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
  const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
  const float cutoffAngle = 1.6110731556870734;
  const float steepness = 1.5;
  const float EE = 1000.0;

  float sunIntensity( float zenithAngleCos ) {
    zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
    return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
  }
  vec3 totalMie( float T ) {
    float c = ( 0.2 * T ) * 10E-18;
    return 0.434 * c * MieConst;
  }

  // ── Parte del fragmento del Sky ──
  const float rayleighZenithLength = 8.4E3;
  const float mieZenithLength = 1.25E3;
  /* En el Sky original el disco mide ~0,53° de radio (el comentario de "66
     segundos de arco" del fuente no se corresponde con la constante). Aquí
     se conserva: a 1024 px de ancho son unos 3 texels, suficiente para que
     el trazador lo muestree como fuente pequeña y para verlo en el fondo. */
  const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;
  const float THREE_OVER_SIXTEENPI = 0.05968310365946075;

  /* ── Nubes ──
     Un estrato plano a la altura nubesAlto, muestreado por donde lo corta
     el rayo. Es ruido de valor con cuatro octavas, sin animar: el cielo se
     hornea una vez, así que no cuesta nada por fotograma, y de propina las
     nubes entran también en la IBL y suavizan la luz, que es justo lo que
     hace que un mediodía deje de parecer un foco. */
  float hash21( vec2 p ) {
    p = fract( p * vec2( 123.34, 456.21 ) );
    p += dot( p, p + 45.32 );
    return fract( p.x * p.y );
  }
  float ruidoValor( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i ), b = hash21( i + vec2( 1.0, 0.0 ) );
    float c = hash21( i + vec2( 0.0, 1.0 ) ), d = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
  }
  float fbm( vec2 p ) {
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 4; i++ ) { v += a * ruidoValor( p ); p *= 2.03; a *= 0.5; }
    return v;
  }
  /* Devuelve cuánta nube tapa el rayo (0..1). Cerca del horizonte el estrato
     se ve de canto y se acumula, así que la cobertura sube sola, que es como
     se ve un cielo de verdad. */
  float cobertura( vec3 dir ) {
    if ( nubes <= 0.001 || dir.y <= 0.0 ) return 0.0;
    /* La altura se acota: sin acotarla, junto al horizonte dir.xz/dir.y se
       dispara y el ruido se convierte en un moteado. Acotada, el estrato se
       comprime hacia el horizonte, que es como se ve de verdad. */
    vec2 uv = dir.xz / max( dir.y, 0.045 ) * nubesAlto;
    float n = fbm( uv * 0.05 );
    n = mix( n, fbm( uv * 0.13 + 31.7 ), 0.45 );
    float umbral = mix( 0.80, 0.34, nubes );
    float c = smoothstep( umbral, umbral + 0.22, n );
    return c * smoothstep( 0.0, 0.09, dir.y );   // sin banda dura en el horizonte
  }
  const float ONE_OVER_FOURPI = 0.07957747154594767;

  float rayleighPhase( float cosTheta ) {
    return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
  }
  float hgPhase( float cosTheta, float g ) {
    float g2 = pow( g, 2.0 );
    float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
    return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
  }

  // ── Ruido barato para el resplandor urbano y las estrellas ──
  float hash13( vec3 p ) {
    p = fract( p * 0.1031 );
    p += dot( p, p.zyx + 31.32 );
    return fract( ( p.x + p.y ) * p.z );
  }
  vec3 hash33( vec3 p ) {
    p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
    p += dot( p, p.yxz + 33.33 );
    return fract( ( p.xxy + p.yxx ) * p.zyx );
  }
  float ruido1( float x ) {
    float i = floor( x ), f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( hash13( vec3( i, 1.7, 9.1 ) ), hash13( vec3( i + 1.0, 1.7, 9.1 ) ), f );
  }

  /* Estrellas: una por celda de la bóveda discretizada, con brillo y tamaño
     aleatorios y un leve tinte. Se trabaja en 3D sobre la dirección, no en
     UV, para que no se apelotonen en los polos de la equirect. */
  vec3 estrellas( vec3 d ) {
    vec3 acum = vec3( 0.0 );
    for ( int capa = 0; capa < 2; capa ++ ) {
      float escala = capa == 0 ? 70.0 : 160.0;
      vec3 p = d * escala;
      vec3 celda = floor( p );
      vec3 h = hash33( celda + float( capa ) * 17.0 );
      float prob = capa == 0 ? 0.22 : 0.10;
      if ( h.x < prob ) {
        vec3 centro = celda + 0.2 + 0.6 * hash33( celda + 5.3 );
        float r = length( p - centro );
        float tam = 0.18 + 0.22 * h.z;
        float brillo = smoothstep( tam, 0.0, r ) * ( 0.35 + 0.65 * h.y * h.y );
        vec3 tinte = mix( vec3( 0.75, 0.85, 1.0 ), vec3( 1.0, 0.9, 0.75 ), step( 0.85, h.z ) );
        acum += tinte * brillo * ( capa == 0 ? 2.4 : 1.2 );
      }
    }
    return acum;
  }

  /* Modelo nocturno: bóveda azul profunda, más clara hacia el horizonte;
     banda cálida de resplandor urbano (varía con el acimut para no ser un
     anillo uniforme), luna con disco y halo, y estrellas. Bajo el horizonte,
     suelo casi negro. */
  vec3 cieloNoche( vec3 d ) {
    float h = clamp( d.y, -1.0, 1.0 );
    vec3 cenit = vec3( 0.014, 0.022, 0.050 );
    vec3 horizonte = vec3( 0.050, 0.048, 0.062 );
    vec3 c = mix( horizonte, cenit, pow( max( h, 0.0 ), 0.45 ) );

    float az = atan( d.z, d.x );
    float variacion = 0.55 + 0.45 * ruido1( az * 1.6 + 3.0 ) + 0.25 * ruido1( az * 7.0 );
    float banda = exp( - max( h, 0.0 ) * 28.0 ) * smoothstep( -0.30, 0.015, h );
    c += resplandor * resplandorInt * banda * variacion;

    // suelo: apenas un gris frío que hereda algo del resplandor; la
    // topografía lo tapa casi siempre y la transición se estira para que
    // no haya línea dura en el horizonte
    c = mix( c, vec3( 0.007, 0.008, 0.011 ) + resplandor * resplandorInt * 0.025, smoothstep( 0.0, -0.25, h ) );

    float cosL = dot( d, lunaDir );
    float disco = smoothstep( 0.99996, 0.999985, cosL ); // ~0,4° de radio, como el sprite del raster
    float halo = pow( max( cosL, 0.0 ), 600.0 ) * 0.10 + pow( max( cosL, 0.0 ), 30.0 ) * 0.014;
    c += vec3( 0.93, 0.96, 1.0 ) * lunaInt * ( disco * 6.0 * lunaDisco + halo );

    c += estrellas( d ) * estrellasInt * smoothstep( -0.02, 0.06, h );
    return c;
  }

  void main() {
    float phi = ( vUv.x - 0.5 ) * 2.0 * pi;
    float theta = ( vUv.y - 0.5 ) * pi;
    vec3 direction = vec3( cos( theta ) * cos( phi ), sin( theta ), cos( theta ) * sin( phi ) );

    vec3 vSunDirection = normalize( sunPosition );
    float vSunE = sunIntensity( dot( vSunDirection, up ) );
    float vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );
    float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );
    vec3 vBetaR = totalRayleigh * rayleighCoefficient;
    vec3 vBetaM = totalMie( turbidity ) * mieCoefficient;

    float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
    float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
    float sR = rayleighZenithLength * inverse;
    float sM = mieZenithLength * inverse;
    vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

    float cosTheta = dot( direction, vSunDirection );
    float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
    vec3 betaRTheta = vBetaR * rPhase;
    float mPhase = hgPhase( cosTheta, mieDirectionalG );
    vec3 betaMTheta = vBetaM * mPhase;

    vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
    Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

    vec3 L0 = vec3( 0.1 ) * Fex;
    float sundisc = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta ) * showSunDisc;
    /* El Sky pone el disco a vSunE·19000·Fex, del orden de 10^5: se acota
       para que quepa en half float y para que el trazador no dispare
       fireflies sin fin con una fuente tan extrema. */
    L0 += min( vSunE * 19000.0 * Fex, solMax / 0.04 ) * sundisc;

    vec3 color = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

    /* Las nubes se mezclan encima del cielo, no del suelo ni de la noche.
       La nube coge el color del cielo cenital (para que a mediodía sea blanca
       y al atardecer se tiña de naranja) y se oscurece por debajo, que es lo
       que le da volumen sin geometría. El disco del sol no se tapa: se le
       resta cobertura, así se ve pasar por detrás. */
    float cob = cobertura( direction ) * ( 1.0 - noche );
    if ( cob > 0.0 ) {
      float sol = clamp( dot( direction, vSunDirection ) * 0.5 + 0.5, 0.0, 1.0 );
      vec3 nube = mix( vec3( 0.62, 0.65, 0.72 ), vec3( 1.25, 1.22, 1.16 ), pow( sol, 3.0 ) );
      nube *= mix( 0.55, 1.0, smoothstep( 0.02, 0.4, direction.y ) );
      /* La base se toma del cielo SIN el disco del sol: si no, una nube que
         cae delante del disco valía 440 en lineal, más brillante que el propio
         sol, y florecía como una mancha. Y aun así se acota. */
      vec3 sinSol = Lin * 0.04;
      float base = ( sinSol.r + sinSol.g + sinSol.b ) / 3.0;
      color = mix( color, min( nube * max( base * 3.2, 0.35 ), vec3( nubesMax ) ), cob );
    }

    /* Bajo el horizonte el Sky repite el valor del horizonte; para la IBL es
       más creíble un suelo apagado (albedo urbano ~0,3) que un cielo
       reflejado. */
    vec3 suelo = color * vec3( 0.36, 0.33, 0.29 );
    /* La transición se estira 0,3 bajo el horizonte: a ras de suelo la bruma
       funde la tierra con el cielo, y una línea dura delataría la textura. */
    color = mix( color, suelo, smoothstep( 0.02, -0.30, direction.y ) );

    color = mix( color, cieloNoche( direction ), noche );

    gl_FragColor = vec4( max( color, vec3( 0.0 ) ), 1.0 );
  }
`;

const VERT_HORNEADO = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position, 1.0 );
  }
`;

/* ── Cielo nocturno en raster (estrellas como puntos y luna como sprite) ─── */
function crearCieloNocturno(lunaDir) {
  const grupo = new THREE.Group();
  grupo.name = 'cielo_noche';
  grupo.visible = false;

  let semilla = 991;
  const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296; };

  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 32;
  const c2 = lienzo.getContext('2d');
  const g = c2.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c2.fillStyle = g;
  c2.fillRect(0, 0, 32, 32);
  const texEstrella = new THREE.CanvasTexture(lienzo);

  const capa = (n, tam, opacidad) => {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const az = azar() * Math.PI * 2;
      const el = Math.asin(0.03 + azar() * 0.96);
      const R = 3400; // dentro del far de la cámara (4200) y detrás de todo
      pos[i * 3] = R * Math.cos(el) * Math.cos(az);
      pos[i * 3 + 1] = R * Math.sin(el);
      pos[i * 3 + 2] = R * Math.cos(el) * Math.sin(az);
      const t = azar();
      c.setHSL(t < 0.12 ? 0.09 : 0.6, t < 0.12 ? 0.5 : 0.25, 0.78 + azar() * 0.22);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: tam, map: texEstrella, transparent: true, opacity: opacidad, vertexColors: true,
      depthWrite: false, sizeAttenuation: false, fog: false, blending: THREE.AdditiveBlending,
    });
    mat.userData.opacidadBase = opacidad;
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  };
  grupo.add(capa(2400, 1.7, 0.75));
  grupo.add(capa(280, 2.7, 1.0));

  // luna: disco con limbo, mares tenues y halo, dibujada a mano en un canvas
  const lc = document.createElement('canvas');
  lc.width = lc.height = 256;
  const m = lc.getContext('2d');
  const halo = m.createRadialGradient(128, 128, 34, 128, 128, 126);
  halo.addColorStop(0, 'rgba(205,220,255,0.36)');
  halo.addColorStop(0.5, 'rgba(205,220,255,0.1)');
  halo.addColorStop(1, 'rgba(205,220,255,0)');
  m.fillStyle = halo;
  m.fillRect(0, 0, 256, 256);
  const disco = m.createRadialGradient(116, 116, 8, 128, 128, 44);
  disco.addColorStop(0, '#fbfcfd');
  disco.addColorStop(0.8, '#e8edf2');
  disco.addColorStop(1, '#c9d2dc');
  m.fillStyle = disco;
  m.beginPath(); m.arc(128, 128, 43, 0, Math.PI * 2); m.fill();
  m.globalAlpha = 0.14;
  m.fillStyle = '#7b8798';
  for (const [mx, my, mr] of [[112, 116, 13], [140, 132, 10], [122, 146, 8], [146, 108, 6], [104, 138, 5]]) {
    m.beginPath(); m.arc(mx, my, mr, 0, Math.PI * 2); m.fill();
  }
  m.globalAlpha = 1;
  const matLuna = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lc), transparent: true, depthWrite: false, fog: false });
  matLuna.userData.opacidadBase = 1;
  // por encima de 1 para que, tras AgX, el disco quede blanco y el bloom lo recoja
  matLuna.color.setScalar(2.2);
  const luna = new THREE.Sprite(matLuna);
  /* Tamaño en escena: a 3000 m, 120 m de sprite son ~2,3° con el halo; el
     disco propiamente dicho ocupa un tercio (≈0,8°), un poco mayor que la
     luna real para que se lea a 1080p. */
  luna.scale.set(120, 120, 1);
  luna.position.copy(lunaDir).multiplyScalar(3000);
  luna.frustumCulled = false;
  grupo.add(luna);

  grupo.setOpacidad = (f) => {
    grupo.visible = f > 0.001;
    grupo.traverse((o) => {
      if (o.material?.userData.opacidadBase !== undefined) o.material.opacity = o.material.userData.opacidadBase * f;
    });
  };
  return grupo;
}

export function crearLuz(ctx) {
  const { renderer, scene, camera } = ctx;

  /* ── Luces ── */
  /* Cascadas: tres en el ordenador, dos en calidad media (el móvil). Cada
     cascada vuelve a dibujar toda la geometría que proyecta sombra, así que
     quitar una es un tercio menos de trabajo por fotograma. */
  const csm = new CSM({
    camera, parent: scene, cascades: ctx.calidad === 'alta' ? 3 : 2, maxFar: 400, mode: 'practical',
    shadowMapSize: ctx.calidad === 'alta' ? 2048 : 1024,
    lightDirection: direccionDe(MOMENTOS.dia.elev, MOMENTOS.dia.azim).negate(),
    lightIntensity: MOMENTOS.dia.solInt,
    lightNear: 1, lightFar: 3500, // las cascadas llegan a 1,2 km en 'conjunto' (setAlcanceSombras)
    /* Margen generoso hacia el sol: con el sol a 4-7° las sombras de un
       edificio de 20 m se alargan cientos de metros y el ortográfico de cada
       cascada tiene que abarcar lo que las proyecta. */
    lightMargin: 300,
    shadowBias: -0.00012,
  });
  /* El fundido entre cascadas evita el escalón visible donde cambia la
     resolución de la sombra; hay que fijarlo antes de setupMaterial porque
     ahí es donde se inyecta el define CSM_FADE. */
  csm.fade = true;
  csm.updateFrustums();
  for (const l of csm.lights) {
    l.name = 'sol_cascada';
    l.shadow.normalBias = 0.04;
  }
  const sol = csm.lights[0];

  const hemi = new THREE.HemisphereLight(MOMENTOS.dia.cielo, MOMENTOS.dia.suelo, MOMENTOS.dia.hemiInt);
  hemi.name = 'hemisferica';
  scene.add(hemi);
  const relleno = new THREE.DirectionalLight(MOMENTOS.dia.relleno, MOMENTOS.dia.rellenoInt);
  relleno.name = 'relleno';
  relleno.position.set(-90, 60, -70);
  scene.add(relleno);

  scene.fog = new THREE.Fog(MOMENTOS.dia.niebla, 750, 2100);

  const lunaDir = direccionDe(MOMENTOS.noche.luna.elev, MOMENTOS.noche.luna.azim);
  const cieloNoche = crearCieloNocturno(lunaDir);
  scene.add(cieloNoche);

  /* ── Horneado ── */
  const rt = new THREE.WebGLRenderTarget(ANCHO, ALTO, {
    type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  const uniformsSky = THREE.UniformsUtils.clone(Sky.SkyShader.uniforms);
  const matHorneado = new THREE.ShaderMaterial({
    name: 'horneado_cielo',
    uniforms: Object.assign(uniformsSky, {
      solMax: { value: 12000 },
      nubes: { value: 0 },
      nubesAlto: { value: 1.0 },
      nubesMax: { value: 6 },
      noche: { value: 0 },
      lunaDir: { value: lunaDir.clone() },
      lunaInt: { value: 1 },
      lunaDisco: { value: 1 },
      resplandor: { value: new THREE.Color(0xff9a4a) },
      resplandorInt: { value: 0.15 },
      estrellasInt: { value: 1 },
    }),
    vertexShader: VERT_HORNEADO,
    fragmentShader: FRAG_HORNEADO,
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(matHorneado);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const lector = new Float32Array(ANCHO * ALTO * 4);

  function hornearA(M, conSol) {
    const u = matHorneado.uniforms;
    u.turbidity.value = M.turbidez;
    u.rayleigh.value = M.rayleigh;
    u.mieCoefficient.value = M.mie;
    u.mieDirectionalG.value = M.mieG;
    u.sunPosition.value.copy(direccionDe(M.elev, M.azim));
    u.showSunDisc.value = conSol ? 1 : 0;
    u.solMax.value = M.solMax;
    u.nubes.value = M.nubes ?? 0;
    u.nubesAlto.value = M.nubesAlto ?? 1.0;
    u.nubesMax.value = M.nubesMax ?? 6;
    u.noche.value = M.noche;
    u.lunaInt.value = conSol ? (M.luna?.int ?? 1) : 0.25;
    u.lunaDisco.value = conSol ? 1 : 0; // el disco (×6) solo en el fondo y el trazador: en el PMREM era un punto de 1,5 que el vidrio y el metal de cubierta reflejaban con halo de bloom
    u.resplandor.value.setHex(M.resplandor ?? 0xff9a4a);
    u.resplandorInt.value = M.resplandorInt ?? 0;
    u.estrellasInt.value = M.estrellas ?? 0;

    const rtPrevio = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    quad.render(renderer);
    renderer.readRenderTargetPixels(rt, 0, 0, ANCHO, ALTO, lector);
    renderer.setRenderTarget(rtPrevio);

    /* Half float: la textura de fondo se filtra bilinealmente y el float de
       32 bits solo se puede filtrar con extensión; el half es núcleo en
       WebGL2 y ocupa la mitad. */
    const datos = new Uint16Array(ANCHO * ALTO * 4);
    for (let i = 0; i < datos.length; i++) datos[i] = THREE.DataUtils.toHalfFloat(lector[i]);
    const tex = new THREE.DataTexture(datos, ANCHO, ALTO, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.name = `cielo_${M.nombre}${conSol ? '' : '_sin_sol'}`;
    tex.needsUpdate = true;
    return tex;
  }

  /* Cache por momento: { fondo, env, equirect, tiempoMs }. El día (HDR) se
     resuelve de forma asíncrona; los procedurales, síncronos pero se
     envuelven en Promise para que setMomento trate a todos igual. */
  const cache = new Map();
  const tiempos = {}; // ms de preparación por momento (horneado o carga del HDR + PMREM)
  const cargadorHDR = new HDRLoader();

  function preparar(clave) {
    if (cache.has(clave)) return cache.get(clave);
    const M = MOMENTOS[clave];
    let p;
    if (M.hdri) {
      p = new Promise((resolver, rechazar) => {
        const t0 = performance.now();
        cargadorHDR.load('assets/sky_day.hdr', (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          tex.name = 'cielo_dia_hdr';
          const env = pmrem.fromEquirectangular(tex);
          resolver({ fondo: tex, env: env.texture, equirect: tex, rtEnv: env, tiempoMs: performance.now() - t0 });
        }, undefined, (err) => {
          /* Sin la foto (fichero ausente o corrupto) el mediodía sigue siendo
             posible con el cielo procedural: nunca hay pantalla negra. */
          console.warn('luz: no se pudo cargar sky_day.hdr, se hornea el mediodía', err);
          resolver(hornearMomento(M));
        });
      });
    } else {
      p = Promise.resolve(hornearMomento(M));
    }
    p = p.then((t) => { tiempos[clave] = Math.round(t.tiempoMs); return t; });
    cache.set(clave, p);
    return p;
  }

  function hornearMomento(M) {
    const t0 = performance.now();
    const conSol = hornearA(M, true);
    const sinSol = hornearA(M, false);
    const env = pmrem.fromEquirectangular(sinSol);
    /* La variante sin disco se conserva (integración): el trazador la usa como
       entorno, porque él ya recibe el sol como DirectionalLight y con el
       disco horneado lo contaría dos veces. Con el HDR de día no existe
       (equirectSinSol = null) y el trazador usa la foto tal cual. */
    return { fondo: conSol, env: env.texture, equirect: conSol, equirectSinSol: sinSol, rtEnv: env, tiempoMs: performance.now() - t0 };
  }

  /* ── Estado en vivo e interpolación ── */
  const actual = {};
  const colores = {};
  for (const k of CLAVES_COLOR) colores[k] = new THREE.Color();
  const dirSol = new THREE.Vector3();

  function copiarFila(M, destino, destinoColores, destinoDir) {
    for (const k of CLAVES_NUM) destino[k] = M[k];
    for (const k of CLAVES_COLOR) destinoColores[k].setHex(M[k]);
    destinoDir.copy(M.noche ? lunaDir : direccionDe(M.elev, M.azim));
  }

  const trans = {
    activa: false, t: 0, duracion: 1.6, cambiado: false,
    origen: {}, origenColores: {}, origenDir: new THREE.Vector3(),
    destino: {}, destinoColores: {}, destinoDir: new THREE.Vector3(),
    texturas: null, resolver: null, clave: null,
    /* factor de exposición con el que se arranca: si una transición
       interrumpe a otra en pleno bajón, se parte de ese valle y no de 1 (si
       no, la imagen daría un fogonazo al volver de golpe a exposición plena) */
    factorInicio: 1,
  };
  let factorActual = 1;
  for (const k of CLAVES_COLOR) { trans.origenColores[k] = new THREE.Color(); trans.destinoColores[k] = new THREE.Color(); }
  const realce = { valor: 0, objetivo: 0, duracion: REALCE.duracion };
  const dirEfectiva = new THREE.Vector3();

  const luz = {
    momento: 'dia',
    parametros: MOMENTOS.dia,
    actual,
    ventanas: MOMENTOS.dia.luces,
    equirect: null,
    equirectSinSol: null, // equirect del momento sin disco solar (null con el HDR de día)
    envMap: null,
    sol,
    csm,
    hemi,
    relleno,
    cieloNoche,
    direccionSol: dirSol,
    direccionEfectiva: dirEfectiva, // la del sol en escena (con el realce de planta aplicado)
    realce: 0,                      // 0…1, peso del realce de planta
    enTransicion: false,
    listo: null,
    materiales: new Set(),
    tiempos,
    MOMENTOS,

    aplicarMaterial(material) {
      if (!material || luz.materiales.has(material)) return material;
      const iluminado = material.isMeshStandardMaterial || material.isMeshPhysicalMaterial
        || material.isMeshLambertMaterial || material.isMeshPhongMaterial;
      if (!iluminado) return material;
      material.userData.baseEnv = material.envMapIntensity ?? 1;
      const previo = material.onBeforeCompile;
      const clavePrevia = material.customProgramCacheKey?.bind(material);
      csm.setupMaterial(material);
      const deCSM = material.onBeforeCompile;
      /* El hook de CSM cierra sobre `material` y guarda el shader compilado en
         csm.shaders con esa clave. cortes.js clona materiales copiando este
         mismo hook: al compilar el clon (this ≠ material) pisaría la entrada
         del original, que dejaría de recibir las cotas de las cascadas al
         cambiar el alcance (setAlcanceSombras). Se restaura la entrada del
         original y se registra el shader del clon con su propia clave. */
      material.onBeforeCompile = function (shader, r) {
        if (previo) previo.call(this, shader, r); // se conserva `this` = material por si el hook previo lo usa
        const guardado = csm.shaders.get(material);
        deCSM.call(this, shader, r);
        if (this !== material) csm.shaders.set(material, guardado);
        csm.shaders.set(this, shader);
      };
      /* three usa el texto de onBeforeCompile como clave de caché del
         programa; con el envoltorio todas serían iguales y materiales con
         hooks distintos compartirían shader. */
      material.customProgramCacheKey = () => `${clavePrevia ? clavePrevia() : ''}|${previo ? previo.toString() : ''}|csm`;
      material.needsUpdate = true;
      luz.materiales.add(material);
      return material;
    },

    setMomento(clave, { duracion = 1.6 } = {}) {
      const M = MOMENTOS[clave];
      if (!M) return Promise.reject(new Error(`luz: momento desconocido "${clave}"`));
      /* Pedir el momento que ya se ve, sin transición en curso: no hay nada
         que fundir y un bajón de exposición gratuito se notaría. Se emite el
         evento igualmente para que la interfaz se sincronice. */
      if (!trans.activa && luz.momento === clave && trans.clave === clave && trans.cambiado) {
        ctx.emit('momento', clave);
        return Promise.resolve(clave);
      }
      luz.momento = clave;
      luz.parametros = M;
      luz.ventanas = M.luces;
      /* Una transición nueva interrumpe la anterior: se congela donde está
         (la nueva partirá de esos valores) y se resuelve su Promise sin
         emitir 'momento', que ya no correspondería al momento pedido. */
      if (trans.activa) {
        trans.activa = false;
        luz.enTransicion = false;
        const r = trans.resolver;
        trans.resolver = null;
        r?.(trans.clave);
      }
      return preparar(clave).then((tex) => {
        if (luz.momento !== clave) return clave; // otro setMomento ganó mientras horneaba
        trans.factorInicio = factorActual;
        Object.assign(trans.origen, actual);
        for (const k of CLAVES_COLOR) trans.origenColores[k].copy(colores[k]);
        trans.origenDir.copy(dirSol);
        copiarFila(M, trans.destino, trans.destinoColores, trans.destinoDir);
        trans.texturas = tex;
        trans.clave = clave;
        trans.duracion = Math.max(0, duracion);
        trans.t = 0;
        trans.cambiado = false;
        trans.activa = true;
        luz.enTransicion = trans.duracion > 0;
        return new Promise((resolver) => {
          trans.resolver = resolver;
          if (trans.duracion === 0) luz.update(0);
        });
      });
    },

    /* Realce de la planta seccionada (ver cabecera): sol alto, más
       hemisférica y más IBL, con fundido. */
    setRealcePlanta(activo, { duracion = REALCE.duracion } = {}) {
      realce.objetivo = activo ? 1 : 0;
      realce.duracion = Math.max(0, duracion);
      if (realce.duracion === 0) { realce.valor = realce.objetivo; aplicarEstado(factorActual); }
    },

    update(dt) {
      if (realce.valor !== realce.objetivo) {
        const paso = realce.duracion > 0 ? dt / realce.duracion : 1;
        realce.valor = realce.objetivo > realce.valor ? Math.min(realce.objetivo, realce.valor + paso) : Math.max(realce.objetivo, realce.valor - paso);
        if (!trans.activa) aplicarEstado(factorActual);
      }
      if (trans.activa) {
        trans.t = trans.duracion > 0 ? Math.min(1, trans.t + dt / trans.duracion) : 1;
        const s = THREE.MathUtils.smoothstep(trans.t, 0, 1);
        for (const k of CLAVES_NUM) actual[k] = THREE.MathUtils.lerp(trans.origen[k], trans.destino[k], s);
        for (const k of CLAVES_COLOR) colores[k].lerpColors(trans.origenColores[k], trans.destinoColores[k], s);
        /* nlerp de la dirección: entre dos soles rasantes opuestos el
           intermedio pasa alto, como el sol real a lo largo del día. */
        dirSol.lerpVectors(trans.origenDir, trans.destinoDir, s);
        if (dirSol.lengthSq() < 1e-6) dirSol.set(0, 1, 0);
        dirSol.normalize();

        if (!trans.cambiado && trans.t >= 0.5) {
          aplicarTexturas(trans.texturas);
          trans.cambiado = true;
        }
        /* Bajón de exposición centrado en el cambio de fondo/IBL: entre 0,3
           y 0,7 del fundido la imagen se oscurece hasta un 55 % y el salto
           de cielo queda enterrado en el valle. */
        const bump = Math.sin(Math.PI * THREE.MathUtils.clamp((trans.t - 0.3) / 0.4, 0, 1));
        // en el primer 30 % se vuelve suavemente desde el factor con el que se arrancó
        const base = THREE.MathUtils.lerp(trans.factorInicio, 1, THREE.MathUtils.clamp(trans.t / 0.3, 0, 1));
        aplicarEstado(base * (1 - 0.55 * bump));

        if (trans.t >= 1) {
          trans.activa = false;
          luz.enTransicion = false;
          aplicarEstado(1);
          const resolver = trans.resolver;
          trans.resolver = null;
          ctx.emit('momento', trans.clave);
          resolver?.(trans.clave);
        }
      }
      /* El CSM se recoloca cada fotograma sobre el frustum actual de la
         cámara. CSM.update lee camera.matrixWorld, que three solo refresca al
         renderizar: sin esta llamada las cascadas irían un fotograma por
         detrás de la cámara (camara.update acaba de moverla) y al girar
         rápido el borde de la sombra recortaría. La cámara no tiene hijos:
         cuesta nada. */
      camera.updateMatrixWorld();
      if (!proyeccionIgual()) csm.updateFrustums();
      csm.update();
    },

    /* Hornea/carga los momentos que faltan, uno por uno, para que el primer
       cambio de momento no pague el horneado ni la conversión a half (unos
       2 M de valores en JS). main puede llamarlo en un rato muerto tras la
       carga del edificio. */
    precalentar() {
      return Object.keys(MOMENTOS).reduce((p, clave) => p.then(() => preparar(clave)), Promise.resolve()).then(() => tiempos);
    },

    /* Alcance de las cascadas (maxFar). El CSM reparte las cascadas sobre el
       frustum de la cámara hasta maxFar: con un valor fijo o las sombras no
       llegan al edificio desde 'conjunto' (a 600 m) o la primera cascada es
       demasiado gruesa dentro de una vivienda. main lo ajusta a la distancia
       cámara-edificio. Cambiar maxFar recalcula los cortes y sus uniformes. */
    setAlcanceSombras(maxFar) {
      if (!(maxFar > 0) || csm.maxFar === maxFar) return;
      csm.maxFar = maxFar;
      csm.updateFrustums();
    },

    setCalidad(tier) {
      const n = tier === 'alta' ? 2048 : 1024;
      if (csm.shadowMapSize === n) return;
      csm.shadowMapSize = n;
      for (const l of csm.lights) {
        l.shadow.mapSize.set(n, n);
        // el mapa de sombras solo se recrea si se descarta el actual
        if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
      }
    },

    dispose() {
      rt.dispose();
      matHorneado.dispose();
      quad.dispose();
      pmrem.dispose();
      for (const [, p] of cache) p.then((t) => { t.rtEnv?.dispose(); t.fondo.dispose(); if (t.equirect !== t.fondo) t.equirect.dispose(); t.equirectSinSol?.dispose(); });
      cache.clear();
      csm.dispose();
      csm.remove();
      scene.remove(hemi, relleno, cieloNoche);
      // estrellas y luna: geometrías, materiales y sus texturas de canvas
      cieloNoche.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
      });
      // la escena no debe quedarse apuntando a texturas ya liberadas
      if (scene.background && scene.background.name?.startsWith('cielo_')) scene.background = null;
      if (scene.environment && luz.envMap === scene.environment) scene.environment = null;
      scene.fog = null;
      luz.envMap = null;
      luz.equirect = null;
      luz.equirectSinSol = null;
      luz.materiales.clear();
      trans.activa = false;
      luz.enTransicion = false;
      /* ctx.on no tiene baja: los escuchadores quedan registrados, pero
         apuntan a un CSM ya sin luces y a un cambio de tamaño inocuo. */
    },
  };

  const ultimaProyeccion = new THREE.Matrix4();
  function proyeccionIgual() {
    if (ultimaProyeccion.equals(camera.projectionMatrix)) return true;
    ultimaProyeccion.copy(camera.projectionMatrix);
    return false;
  }

  function aplicarTexturas(tex) {
    scene.background = tex.fondo;
    scene.environment = tex.env;
    luz.envMap = tex.env;
    luz.equirect = tex.equirect;
    luz.equirectSinSol = tex.equirectSinSol || null;
  }

  function aplicarEstado(factorExposicion) {
    factorActual = factorExposicion;
    /* Realce de planta encima del estado interpolado del momento: de noche
       (actual.noche → 1) la luna no se mueve y solo sube la hemisférica. */
    const r = THREE.MathUtils.smoothstep(realce.valor, 0, 1);
    luz.realce = realce.valor;
    const noche = THREE.MathUtils.clamp(actual.noche ?? 0, 0, 1);
    const fHemi = THREE.MathUtils.lerp(1, THREE.MathUtils.lerp(REALCE.hemi, REALCE.hemiNoche, noche), r);
    const fIbl = THREE.MathUtils.lerp(1, THREE.MathUtils.lerp(REALCE.ibl, REALCE.iblNoche, noche), r);
    const fRelleno = THREE.MathUtils.lerp(1, THREE.MathUtils.lerp(REALCE.relleno, REALCE.rellenoNoche, noche), r);
    /* El sol de la escena es SIEMPRE el del momento: lo que proyecta la sombra
       y lo que se ve en el cielo son la misma dirección (ver REALCE). */
    dirEfectiva.copy(dirSol);
    for (const l of csm.lights) {
      l.color.copy(colores.sol);
      l.intensity = actual.solInt;
    }
    csm.lightDirection.copy(dirEfectiva).negate();
    hemi.color.copy(colores.cielo);
    hemi.groundColor.copy(colores.suelo);
    hemi.intensity = actual.hemiInt * fHemi;
    relleno.color.copy(colores.relleno);
    relleno.intensity = actual.rellenoInt * fRelleno;
    scene.fog.color.copy(colores.niebla);
    scene.environmentIntensity = actual.ibl * fIbl;
    scene.backgroundIntensity = actual.fondo * factorExposicion;
    renderer.toneMappingExposure = actual.exposicion * factorExposicion;
    cieloNoche.setOpacidad(actual.noche * factorExposicion);
    // bloom y umbral quedan interpolados en luz.actual: los aplica post.js
  }

  ctx.on('calidad', (tier) => luz.setCalidad(tier));
  ctx.on('tamano', () => csm.updateFrustums());

  // Estado inicial: mediodía sin fundido. Hasta que el HDR llega, el cielo
  // procedural del día no se hornea (no hace falta: el HDR tarda décimas).
  copiarFila(MOMENTOS.dia, actual, colores, dirSol);
  aplicarEstado(1);
  luz.listo = luz.setMomento('dia', { duracion: 0 });

  return luz;
}
