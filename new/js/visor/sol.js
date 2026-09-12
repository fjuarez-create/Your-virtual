/* ═══════════════════════════════════════════════════════════════
   sol.js — Posición real del sol sobre la parcela.

   Hasta ahora el visor tenía cuatro momentos con la elevación y el
   acimut puestos a mano. Esto los sustituye por la posición
   astronómica de verdad, para que el recorrido del sol a lo largo
   del día sea el que el cliente va a tener en su terraza.

   Algoritmo NOAA (el del Solar Calculator). Exacto a una décima de
   grado, que para decidir dónde cae una sombra sobra de largo.

   ── Convención de acimut ─────────────────────────────────────────
   Fuera se habla en brújula: 0 = norte, 90 = este, 180 = sur, 270 =
   oeste. El visor usa la suya, heredada de luz.js: 0 = sur y crece
   hacia el este, de modo que oeste = 270. La conversión entre las
   dos es la misma resta en los dos sentidos:

       visor = (180 - brujula) mod 360
       brujula = (180 - visor) mod 360

   ── La parcela ───────────────────────────────────────────────────
   SERENEA, Las Huesas (Telde, Gran Canaria): 27,9867 N · 15,3956 O.
   Canarias va en UTC+0 en invierno y UTC+1 en verano.

   ── Lo que conviene saber de esta latitud ────────────────────────
   A 28° norte el sol al mediodía va de 38,7° en diciembre a 85,3°
   en junio: casi 47 grados de diferencia, que es MUCHA. Lo que sí
   se parecen entre sí son los meses simétricos respecto al
   solsticio —octubre y febrero, por ejemplo, 53,4° y 49,5°—, que es
   la comparación que se suele hacer.
   ═══════════════════════════════════════════════════════════════ */

export const PARCELA = { lat: 27.986703, lon: -15.395572 };

const rad = Math.PI / 180;
const deg = 180 / Math.PI;
const sin = (g) => Math.sin(g * rad);
const cos = (g) => Math.cos(g * rad);

/* Día juliano a partir de una fecha civil y una hora local decimal. */
function diaJuliano(anio, mes, dia, horaLocal, huso) {
  let a = anio;
  let m = mes;
  if (m <= 2) { a -= 1; m += 12; }
  const A = Math.floor(a / 100);
  const B = 2 - A + Math.floor(A / 4);
  const jd = Math.floor(365.25 * (a + 4716)) + Math.floor(30.6001 * (m + 1)) + dia + B - 1524.5;
  return jd + (horaLocal - huso) / 24;
}

/**
 * Posición del sol.
 * @param {{anio:number, mes:number, dia:number, hora:number, huso:number}} cuando
 *        `hora` es local y decimal (13.5 = 13:30); `huso` en horas sobre UTC.
 * @param {{lat:number, lon:number}} donde
 * @returns {{elevacion:number, brujula:number, azimut:number}}
 *          `elevacion` en grados sobre el horizonte (negativa de noche),
 *          `brujula` en grados desde el norte, `azimut` en la convención
 *          del visor (0 = sur, crece hacia el este).
 */
export function posicionSolar(cuando, donde = PARCELA) {
  const { anio, mes, dia, hora, huso } = cuando;
  const t = (diaJuliano(anio, mes, dia, hora, huso) - 2451545) / 36525;

  /* Longitud media y anomalía media del sol. */
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);

  /* Ecuación del centro: la órbita no es un círculo. */
  const C = sin(M) * (1.914602 - t * (0.004817 + 0.000014 * t))
          + sin(2 * M) * (0.019993 - 0.000101 * t)
          + sin(3 * M) * 0.000289;

  const omega = 125.04 - 1934.136 * t;               // nutación
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega);
  const epsilon = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
                + 0.00256 * cos(omega);              // oblicuidad de la eclíptica

  const declinacion = Math.asin(sin(epsilon) * sin(lambda)) * deg;

  /* Ecuación del tiempo, en minutos: el desfase entre el mediodía del
     reloj y el mediodía solar, que llega a ser de un cuarto de hora. */
  const y = Math.tan(epsilon / 2 * rad) ** 2;
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const ecuacionTiempo = 4 * deg * (
    y * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y * sin(M) * cos(2 * L0)
    - 0.5 * y * y * sin(4 * L0) - 1.25 * e * e * sin(2 * M)
  );

  /* Ángulo horario: cuánto le falta al sol para cruzar el meridiano. */
  const minutosVerdaderos = (hora * 60 + ecuacionTiempo + 4 * donde.lon - 60 * huso + 1440) % 1440;
  let anguloHorario = minutosVerdaderos / 4 - 180;
  if (anguloHorario < -180) anguloHorario += 360;

  const cosCenit = Math.min(1, Math.max(-1,
    sin(donde.lat) * sin(declinacion) + cos(donde.lat) * cos(declinacion) * cos(anguloHorario)));
  const cenit = Math.acos(cosCenit) * deg;
  const elevacion = 90 - cenit;

  let brujula = 180;
  const den = cos(donde.lat) * sin(cenit);
  if (Math.abs(den) > 1e-9) {
    const ca = Math.min(1, Math.max(-1, (sin(donde.lat) * cosCenit - sin(declinacion)) / den));
    const arco = Math.acos(ca) * deg;
    brujula = anguloHorario > 0 ? (arco + 180) % 360 : (540 - arco) % 360;
  }

  return { elevacion, brujula, azimut: (180 - brujula + 360) % 360, declinacion };
}

/* Canarias: horario de verano de la UE, del último domingo de marzo al
   último de octubre. Fuera de ahí, UTC+0. */
export function husoCanarias(anio, mes, dia) {
  const ultimoDomingo = (m) => {
    const d = new Date(Date.UTC(anio, m, 0));           // último día del mes m
    return d.getUTCDate() - d.getUTCDay();
  };
  if (mes < 3 || mes > 10) return 0;
  if (mes > 3 && mes < 10) return 1;
  if (mes === 3) return dia >= ultimoDomingo(3) ? 1 : 0;
  return dia < ultimoDomingo(10) ? 1 : 0;
}

/* Salida y puesta, en horas locales decimales. Búsqueda por bisección
   sobre la elevación: más corto que la fórmula cerrada y sin sus casos
   raros. Devuelve null en el día polar, que aquí no pasa nunca pero
   dejarlo colgando sería una trampa para el que copie esto. */
export function salidaYPuesta(fecha, donde = PARCELA) {
  const { anio, mes, dia, huso } = fecha;
  const elevA = (h) => posicionSolar({ anio, mes, dia, hora: h, huso }, donde).elevacion;
  const cruce = (a, b) => {
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2;
      if (elevA(a) * elevA(m) <= 0) b = m; else a = m;
    }
    return (a + b) / 2;
  };
  let salida = null;
  let puesta = null;
  let anterior = elevA(0);
  for (let h = 0.25; h <= 24; h += 0.25) {
    const actual = elevA(h);
    if (anterior < 0 && actual >= 0) salida = cruce(h - 0.25, h);
    if (anterior >= 0 && actual < 0) puesta = cruce(h - 0.25, h);
    anterior = actual;
  }
  return { salida, puesta };
}

/* El recorrido del día, muestreado. Es lo que dibuja el arco del control:
   la trayectoria real del sol sobre la parcela ese día, no una curva
   decorativa. */
export function recorridoDelDia(fecha, muestras = 96, donde = PARCELA) {
  const { anio, mes, dia, huso } = fecha;
  const puntos = [];
  for (let i = 0; i <= muestras; i++) {
    const hora = (i / muestras) * 24;
    const p = posicionSolar({ anio, mes, dia, hora, huso }, donde);
    puntos.push({ hora, elevacion: p.elevacion, brujula: p.brujula, azimut: p.azimut });
  }
  return puntos;
}
