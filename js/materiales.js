/* ═══════════════════════════════════════════════════════════════════════════
   materiales.js — Ajuste de los materiales del SketchUp al render del estudio.

   Tres cosas, y las tres cambian mucho la imagen.

   1) METALNESS. El exportador escribe 0,5 en todo material al que nadie le
      puso valor: madera, tierra, hoja de olivo, alicatado, rodapié, asfalto,
      bordillo, la ortofoto del terreno… Un dieléctrico renderizado como medio
      metal PIERDE LA MITAD DE SU COLOR difuso y a cambio coge un reflejo gris
      del entorno. Multiplicado por treinta materiales, eso es exactamente el
      aspecto apagado y grisáceo que se veía: nada tiene color propio y todo
      refleja el mismo cielo. Se corrige poniendo 0 en todo lo que valga
      exactamente 0,5 y no traiga mapa de metalness. Los metales de verdad
      llevan su valor puesto a mano (aluminio, cromado, bronce) y no se tocan.

   2) COLOR Y ACABADO. El modelo entregado trae CASI TODO por encima de 200
      sobre 255: carpintería 227, vidrio 229, bordillo 236, hormigón 214,
      "interior en sombra" 176, asfalto 138 azulado, hoja de olivo 172. No hay
      un solo valor oscuro ni una sola saturación en toda la escena, y sin
      oscuros no hay contraste. Aquí se devuelve a su color real lo que marca
      la diferencia, con los acabados de la memoria de calidades:

        · carpintería y aluminio → ALUMINIO GRIS (RAL 9007), no plata ni
          antracita: es lo que le da ritmo a la fachada;
        · fachada → monocapa blanco (se respeta, solo se matiza el reflejo);
        · primera planta → travertino marfil SOFT TOUCH: mate, reflejo mínimo;
        · pavimento de zonas comunes → PAMESA WELLS Sand mate;
        · lo que se ve tras el vidrio → gris medio, ni cartón claro ni negro.

   3) TEXTURA. Asfalto, acera, tierra y el césped del campo de fútbol llegan
      como un color plano: una calzada de un solo gris a cincuenta metros es
      lo que más delata que esto es un modelo y no una foto. Se les pone una
      textura procedural generada en un lienzo de 256 px (ver `RECETAS`), con
      su mapa de normales, proyectada en planta sobre las coordenadas del
      mundo. Son cuatro texturas de 256×256: menos de 2 MB de vídeo en total,
      cero descargas y cero ficheros nuevos en el repositorio.

   Si algún día el cliente entrega el modelo con estos materiales bien
   puestos, basta con vaciar AJUSTES y quitar las llamadas.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* Materiales que SÍ son metal y traen su valor puesto a conciencia. */
const METALES = /aluminio|cromado|bronce|acero|inox|metal_|_metal|FV_Marco/i;

/* ── Texturas procedurales ────────────────────────────────────────────────
   Ruido de valor periódico (se repite exactamente cada `per` celdas, así la
   baldosa casa consigo misma y no se ve la costura) con varias octavas. */
const LADO = 256;

function azar(x, y, semilla) {
  let h = (x * 374761393 + y * 668265263 + semilla * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valor(x, y, per, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const en = (i, j) => azar(((x0 + i) % per + per) % per, ((y0 + j) % per + per) % per, s);
  const a = en(0, 0), b = en(1, 0), c = en(0, 1), d = en(1, 1);
  const arriba = a + (b - a) * ux, abajo = c + (d - c) * ux;
  return arriba + (abajo - arriba) * uy;
}

function fbm(x, y, per, octavas, s) {
  let amp = 1, f = 1, suma = 0, norma = 0;
  for (let i = 0; i < octavas; i++) {
    suma += amp * valor(x * f, y * f, per * f, s + i * 977);
    norma += amp; amp *= 0.5; f *= 2;
  }
  return suma / norma;
}

const frac = (v) => v - Math.floor(v);

/* Cada receta devuelve [r, g, b, altura]. El color va al `map` (multiplica al
   color base, así que se mueve en torno a 1) y la altura, al mapa de normales.
   Todas están pensadas para verse a 10-80 m, que es la distancia de trabajo. */
const RECETAS = {
  /* Aglomerado asfáltico: parcheado de riegos + grano de árido + algún
     canto claro suelto. */
  asfalto(u, v, x, y) {
    /* El grano tiene que ser GRANO, no manchas. Con las manchas a 8 por
       baldosa y la baldosa a 7 m, cada mancha medía casi un metro: de cerca
       el asfalto parecía moqueta. Ahora la baldosa mide 4,5 m, el parcheado va
       a 16 (unos 28 cm) y con un tercio de fuerza, y lo que se ve de cerca es
       el árido, a 4 cm. */
    const manchas = fbm(u * 16, v * 16, 16, 2, 11);
    const arido = fbm(u * 128, v * 128, 128, 2, 23);
    let k = 0.955 + 0.026 * (manchas * 2 - 1) + 0.055 * (arido * 2 - 1);
    const canto = azar(x, y, 7);
    if (canto > 0.997) k += 0.05;   // algún canto claro suelto, contado: más, y es sal y pimienta
    const c = 255 * k;
    return [c, c, c * 0.995, arido * 0.85 + manchas * 0.15];
  },
  /* Césped de campo de fútbol: franjas de corte (dos por baldosa, y con la
     baldosa a 12 m eso son siegas de 6 m), mata irregular y grano de hoja.
     Las franjas claras tiran a amarillo y las oscuras a azul, que es lo que
     hace la hoja según se tumbe hacia el sol o en contra. */
  cesped(u, v) {
    const franja = Math.sin(v * Math.PI * 4);
    const mata = fbm(u * 6, v * 6, 6, 3, 31);
    const hoja = fbm(u * 80, v * 80, 80, 2, 47);
    const k = 0.955 + 0.042 * franja + 0.07 * (mata * 2 - 1) + 0.055 * (hoja * 2 - 1);
    return [255 * k * (1 + 0.055 * franja), 255 * k, 255 * k * (1 - 0.05 * franja), hoja * 0.7 + mata * 0.3];
  },
  /* Acera de loseta: junta cada cuarto de baldosa (con la baldosa a 4 m, una
     loseta de 1 m) y hormigón moteado. */
  acera(u, v) {
    const n = fbm(u * 40, v * 40, 40, 3, 53);
    const grano = fbm(u * 110, v * 110, 110, 2, 67);
    let k = 0.97 + 0.045 * (n * 2 - 1) + 0.03 * (grano * 2 - 1);
    let h = n * 0.7 + grano * 0.3;
    const du = frac(u * 4), dv = frac(v * 4);
    if (du < 0.018 || dv < 0.018) { k *= 0.90; h -= 0.5; }
    const c = 255 * k;
    return [c, c * 0.998, c * 0.99, h];
  },
  /* Tierra de alcorque y jardinera: terrones grandes y grano fino; lo claro,
     más cálido (está más seco). */
  tierra(u, v) {
    const terron = fbm(u * 10, v * 10, 10, 4, 71);
    const grano = fbm(u * 64, v * 64, 64, 2, 83);
    const k = 0.94 + 0.13 * (terron * 2 - 1) + 0.06 * (grano * 2 - 1);
    return [255 * k * 1.03, 255 * k, 255 * k * 0.93, terron * 0.8 + grano * 0.2];
  },
};

const cache = new Map();

/* Construye (una sola vez) el par color + normales de una receta. */
function texturasDe(clave) {
  if (cache.has(clave)) return cache.get(clave);
  const receta = RECETAS[clave];
  let par = { map: null, normalMap: null };
  try {
    const n = LADO;
    const color = document.createElement('canvas');
    color.width = color.height = n;
    const gc = color.getContext('2d');
    const img = gc.createImageData(n, n);
    const alturas = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const [r, g, b, h] = receta(x / n, y / n, x, y);
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
        alturas[i] = h;
      }
    }
    gc.putImageData(img, 0, 0);

    const normales = document.createElement('canvas');
    normales.width = normales.height = n;
    const gn = normales.getContext('2d');
    const imgN = gn.createImageData(n, n);
    const fuerza = n * 0.06;   // pendiente en unidades de textura
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const dx = (alturas[y * n + (x + 1) % n] - alturas[y * n + (x - 1 + n) % n]) * fuerza;
        const dy = (alturas[((y + 1) % n) * n + x] - alturas[((y - 1 + n) % n) * n + x]) * fuerza;
        const l = Math.sqrt(dx * dx + dy * dy + 1);
        imgN.data[i * 4] = 255 * ((-dx / l) * 0.5 + 0.5);
        imgN.data[i * 4 + 1] = 255 * ((dy / l) * 0.5 + 0.5);
        imgN.data[i * 4 + 2] = 255 * ((1 / l) * 0.5 + 0.5);
        imgN.data[i * 4 + 3] = 255;
      }
    }
    gn.putImageData(imgN, 0, 0);

    const mapa = new THREE.CanvasTexture(color);
    mapa.colorSpace = THREE.SRGBColorSpace;
    const normal = new THREE.CanvasTexture(normales);
    for (const t of [mapa, normal]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;   // la calzada se ve casi siempre a contrapicado
      t.name = `proc_${clave}`;
    }
    par = { map: mapa, normalMap: normal };
  } catch (e) {
    console.warn('[materiales] no se pudo generar la textura', clave, e.message);
  }
  cache.set(clave, par);
  return par;
}

/* nombre exacto → color en sRGB, acabado y textura. Solo lo que se aparta de
   verdad del modelo entregado.
     · `env`     intensidad del reflejo del entorno (1 = pleno);
     · `mapa`    receta procedural;
     · `escala`  metros que ocupa una baldosa de esa textura;
     · `relieve` fuerza del mapa de normales. */
export const AJUSTES = {
  /* ── Carpintería: PLATA GRATA, y tratada como PLÁSTICO GRIS ──
     El `metalness` es lo que la ponía negra. Un metal no tiene color difuso:
     solo devuelve lo que refleja. Una carpintería vive metida en el jambaje,
     donde no ve cielo, así que no tenía nada que reflejar y salía negra en
     cuanto el hueco estaba en sombra —daba igual el color que se le pusiera—.
     Como dieléctrico (metalness casi cero) el color SE VE siempre: gris plata
     al sol, gris plata en sombra. Que es lo que es. */
  'APOLO V6 | Aluminio plata grata': { color: 0x9fa2a1, metalness: 0.06, roughness: 0.42, env: 0.45 },
  'V6_FV_Marco_aluminio': { color: 0x9fa2a1, metalness: 0.08, roughness: 0.44, env: 0.45 },
  'APOLO | Juntas y herrajes': { color: 0x8e908f, metalness: 0.15, roughness: 0.5, env: 0.45 },
  'V6_Cromado': { color: 0xdcdfe0, metalness: 0.95, roughness: 0.14 },

  /* ── El paño que se ve tras el vidrio ──
     Es el fondo de los 267 huecos, uno por ventana, y es LO QUE MÁS PESA en
     cómo se lee un paño de vidrio: el vidrio deja pasar más de la mitad de lo
     que hay detrás. Con este plano oscuro, el paño entero salía negro en toda
     la tipología. Gris medio y con algo de reflejo: penumbra de habitación,
     no un agujero. */
  'APOLO | Interior en sombra': { color: 0x7d8288, metalness: 0, roughness: 0.92, env: 0.35 },

  /* ── Fachada: mortero monocapa blanco ──
     Se queda blanco. Lo único que se toca es el reflejo: un paño blanco con
     reflejo pleno recoge el azul del hemisferio entero y deja de ser blanco. */
  'APOLO V6 | Monocapa blanco roto 5pct calido': { color: 0xf7f3ec, metalness: 0, roughness: 0.94, env: 0.5 },
  'V6_Monocapa_contexto': { color: 0xe9e5dc, metalness: 0, roughness: 0.92, env: 0.5 },

  /* ── Primera planta: travertino marfil, efecto soft touch ──
     Mate al tacto y con un brillo mínimo: rugosidad alta y reflejo del
     entorno casi a cero. El tono sale de la foto del baño. */
  'APOLO V6 | Travertino marfil veta vertical': { color: 0xc9c1b3, metalness: 0, roughness: 0.82, env: 0.16 },

  /* ── Pavimento de zonas comunes: PAMESA WELLS Sand mate ── */
  'APOLO V6 | PAMESA WELLS Ivory 120x60': { color: 0xcbc4ba, metalness: 0, roughness: 0.68, env: 0.24 },
  'APOLO V6 | Junta Ivory 2mm': { color: 0xb5aea4, metalness: 0, roughness: 0.85, env: 0.15 },
  'SERENEA V3 | Loseta neutra 60 cm': { color: 0xcbc4ba, metalness: 0, roughness: 0.74, env: 0.26 },
  'SERENEA V3 | Bordillo claro textura': { color: 0xc6c1b7, metalness: 0, roughness: 0.85, env: 0.35 },
  'APOLO | Hormigon gris claro': { color: 0xbfbeb8, metalness: 0, roughness: 0.9, env: 0.4 },
  'APOLO V6 | Gravilla gris claro cubierta': { color: 0xbab5ab, metalness: 0, roughness: 0.95, env: 0.3 },

  /* ── Calle ──
     El asfalto es la superficie más grande del encuadre a pie de calle y
     llegaba en 138,144,149, gris claro y AZUL. Un aglomerado envejecido anda
     por 85 y es neutro. `env` bajo porque una calzada es horizontal: ve el
     hemisferio entero y con reflejo pleno se vuelve azul otra vez. */
  asphalt: { color: 0x5f5d56, metalness: 0, roughness: 0.93, env: 0.10, mapa: 'asfalto', escala: 4.5, relieve: 0.22 },
  /* Marcas viales y paso de peatones: pintura envejecida, nunca blanco puro. */
  white: { color: 0xdcd9d0, metalness: 0, roughness: 0.9, env: 0.22 },
  sidewalk: { color: 0xc2bdb3, metalness: 0, roughness: 0.9, env: 0.3, mapa: 'acera', escala: 4, relieve: 0.5 },
  curb: { color: 0xc4bfb5, metalness: 0, roughness: 0.85, env: 0.4 },
  tactile: { color: 0xb3a897, metalness: 0, roughness: 0.88, env: 0.3 },
  /* Alcantarillas, registros y rejillas: fundición, que es gris oscuro
     pardo y medio mate, no el gris claro medio metálico del modelo. */
  'SERENEA V3 | Registros y rejillas fundicion': { color: 0x4c4844, metalness: 0.55, roughness: 0.62, env: 0.3 },
  metal: { color: 0x6e6f6c, metalness: 0.6, roughness: 0.45 },
  EXT_Neumatico: { color: 0x2e3032, metalness: 0, roughness: 0.9, env: 0.3 },
  EXT_Coche_plata: { color: 0xb9bcbd, metalness: 0.65, roughness: 0.28 },
  EXT_Faro: { color: 0xe8ebe6, metalness: 0.1, roughness: 0.12 },

  /* ── Verdes ──
     Todo el verde del modelo está en torno a 170 y sin saturar, que es el
     verde de un plano, no el de una hoja. El olivo es gris-verde; el arbolado
     de calle, verde profundo. `env` a la mitad: una copa no refleja el cielo,
     lo filtra, y con reflejo pleno el arbolado se volvía gris azulado. */
  EXT_Hoja_oliva: { color: 0x828c66, metalness: 0, roughness: 0.88, env: 0.45 },
  EXT_Hoja_oliva_clara: { color: 0x9aa37e, metalness: 0, roughness: 0.88, env: 0.45 },
  EXT_Hoja_verde: { color: 0x5e7b50, metalness: 0, roughness: 0.85, env: 0.45 },
  EXT_Hoja_verde_clara: { color: 0x77935c, metalness: 0, roughness: 0.85, env: 0.45 },
  EXT_Tronco: { color: 0x6f6557, metalness: 0, roughness: 0.95, env: 0.35 },
  V6_Verde_profundo: { color: 0x4f6b44, metalness: 0, roughness: 0.88, env: 0.45 },
  V6_Verde_medio: { color: 0x63814f, metalness: 0, roughness: 0.88, env: 0.45 },
  V6_Verde_luz: { color: 0x7e9661, metalness: 0, roughness: 0.88, env: 0.45 },
  V6_Hoja_palmera: { color: 0x62804b, metalness: 0, roughness: 0.88, env: 0.45 },
  V6_Hoja_palmera_luz: { color: 0x7f975f, metalness: 0, roughness: 0.88, env: 0.45 },
  'V6 | Hoja olivo verde gris': { color: 0x818c68, metalness: 0, roughness: 0.88, env: 0.45 },
  'V6 | Hoja olivo clara': { color: 0x99a385, metalness: 0, roughness: 0.88, env: 0.45 },
  'V6 | Sotobosque verde': { color: 0x7c8a64, metalness: 0, roughness: 0.9, env: 0.45 },
  'V6 | Sotobosque salvia': { color: 0x9aa188, metalness: 0, roughness: 0.9, env: 0.45 },
  'V6 | Tronco olivo': { color: 0x7b7364, metalness: 0, roughness: 0.95, env: 0.35 },
  /* Césped del campo de fútbol: verde de juego, con siegas. */
  grass: { color: 0x527f43, metalness: 0, roughness: 0.9, env: 0.35, mapa: 'cesped', escala: 12, relieve: 0.35 },
  EXT_Tierra: { color: 0x73695b, metalness: 0, roughness: 0.95, env: 0.3, mapa: 'tierra', escala: 5, relieve: 0.6 },
  'SERENEA V3 | Tierra y acolchado de jardineras': { color: 0x5d5246, metalness: 0, roughness: 0.96, env: 0.25 },
  'V6 | Tierra vegetal portales': { color: 0x594e42, metalness: 0, roughness: 0.96, env: 0.25 },

  /* ── Contexto urbano ──
     Los vecinos y las cubiertas también venían todos por encima de 210: el
     pueblo entero se leía como una maqueta de escayola. */
  EXT_Terracota: { color: 0xb07c5c, metalness: 0, roughness: 0.9, env: 0.4 },
  roof: { color: 0xa79d8f, metalness: 0, roughness: 0.9, env: 0.4 },
  EXT_Ceramica_grafito: { color: 0x5c5e5c, metalness: 0, roughness: 0.75, env: 0.5 },
  EXT_Ceramica_arena: { color: 0xcfc6b4, metalness: 0, roughness: 0.85, env: 0.45 },
  edificacion_costera_clara: { color: 0xdbd6cb, metalness: 0, roughness: 0.9, env: 0.55 },
  industry: { color: 0xbcbfbd, metalness: 0, roughness: 0.8, env: 0.5 },
  /* La ortofoto del terreno (lo que se ve donde no hay pavimento modelado)
     llega clara y con dominante magenta, que a pie de calle canta. Se le
     quita el rosa y se baja un punto: es fondo, no protagonista. */
  ortho: { metalness: 0, roughness: 1, env: 0.35, color: 0xe8f0ea },

  /* ── Fotovoltaica y juntas ── */
  'V6 | Junta grafito': { color: 0x707372, metalness: 0, roughness: 0.8 },
  V6_FV_Celulas_antracita: { color: 0x2c323a, metalness: 0.25, roughness: 0.28 },
  V6_FV_Junta_celulas: { color: 0x60666b, metalness: 0.3, roughness: 0.45 },
  V6_FV_Lastres_gris: { color: 0xa9a8a3, metalness: 0, roughness: 0.85, env: 0.4 },
};

/* Lo mismo para las nueve teselas de la ortofoto de la costa, que comparten
   nombre con un índice detrás. */
const AJUSTES_PATRON = [
  [/^PNOA_costa_/, { metalness: 0, roughness: 1, env: 0.35, color: 0xe8f0ea }],
];

const ajusteDe = (nombre) => AJUSTES[nombre] || AJUSTES_PATRON.find(([re]) => re.test(nombre))?.[1];

/**
 * Asigna la textura procedural que le toque al material, si la tiene.
 *
 * SE LLAMA ANTES DE FUSIONAR LA GEOMETRÍA, a propósito: los dos visores
 * deciden si conservan las UV mirando `material.map`, y la fusión descarta el
 * atributo `uv` cuando el material no lleva mapa. Si esto se hiciera dentro de
 * `ajustarMaterial` (que corre después), la malla fusionada se quedaría sin
 * UV y la textura no se vería. Marca `userData.uvMundo` para que quien fusiona
 * genere las UV proyectando en planta: la baldosa mide `escala` metros de
 * mundo, así que la calzada no depende de cómo despiezara el SketchUp.
 */
export function asignarMapa(m) {
  if (!m || m.userData?.mapaProcedural || m.map) return m;
  const a = AJUSTES[m.name || ''];
  if (!a || !a.mapa || !RECETAS[a.mapa]) return m;
  const { map, normalMap } = texturasDe(a.mapa);
  if (!map) return m;
  m.userData = m.userData || {};
  m.userData.mapaProcedural = true;
  m.userData.uvMundo = true;
  const k = 1 / (a.escala || 8);
  m.map = map.clone();
  m.map.repeat.set(k, k);
  m.map.needsUpdate = true;
  if (normalMap && a.relieve > 0) {
    m.normalMap = normalMap.clone();
    m.normalMap.repeat.set(k, k);
    m.normalMap.needsUpdate = true;
    m.normalScale = new THREE.Vector2(a.relieve, a.relieve);
  }
  m.needsUpdate = true;
  return m;
}

/**
 * Corrige el metalness heredado del exportador y aplica el ajuste de color si
 * el material tiene uno. Devuelve el mismo material.
 */
export function ajustarMaterial(m) {
  if (!m || m.userData?.ajustado) return m;
  if (m.metalness === undefined) return m;
  m.userData = m.userData || {};
  m.userData.ajustado = true;
  const nombre = m.name || '';

  // 1) metalness heredado
  if (!m.metalnessMap && Math.abs(m.metalness - 0.5) < 1e-6 && !METALES.test(nombre)) {
    m.metalness = 0;
    // el exportador deja 0,5 de rugosidad con el mismo criterio: es plano y falso
    if (Math.abs(m.roughness - 0.5) < 1e-6) m.roughness = 0.85;
  }

  // 2) color y acabado
  const a = ajusteDe(nombre);
  if (a) {
    if (a.color !== undefined) m.color.setHex(a.color);
    if (a.metalness !== undefined) m.metalness = a.metalness;
    if (a.roughness !== undefined) m.roughness = a.roughness;
    if (a.env !== undefined) { m.envMapIntensity = a.env; m.userData.baseEnv = a.env; }
    if (m.userData.baseColor) m.userData.baseColor.copy(m.color);
  }
  return m;
}
