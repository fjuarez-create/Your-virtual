/* ═══════════════════════════════════════════════════════════════════════════
   tapas.js — Tapas geométricas de un corte horizontal.

   El modelo de SketchUp no tiene tapas: por la boca de un muro cortado se ve
   su cara interior. Pintar las caras traseras de oscuro falla en cuanto el
   modelo tiene caras sueltas o normales invertidas (paños enteros de pared
   salían negros), y encadenar la sección en lazos cerrados falla porque las
   caras de este modelo no forman anillos: los muros son PARES DE CARAS
   paralelas, a menudo sin testeros. Así que la tapa se calcula por pares:

   1. Cada triángulo de muro que cruza el plano y = cota da un segmento,
      orientado con la normal del triángulo (caras hacia fuera): el interior
      del sólido queda a la IZQUIERDA del sentido de marcha, visto desde
      arriba, y la normal en planta apunta a la derecha.
   2. Dos segmentos forman un muro si son antiparalelos (±8°), están a menos
      de GROSOR_MAX el uno del otro, cada uno tiene al otro en su lado
      interior (los interiores se miran: dos caras que dan a un pasillo o a
      un patinillo no cumplen esto) y se solapan a lo largo. La tapa es la
      banda entre los dos, sobre el tramo en que se solapan, alargada como
      mucho el grosor del muro hacia donde alguna de las dos caras siga (así
      se cubre el cuadrado de una esquina en L, sin invadir huecos ni puertas,
      donde las dos caras acaban a la vez).
   3. Una cara suelta, una normal invertida o una cara sin pareja no producen
      tapa alguna: como mucho ese muro queda sin tapar, nunca hay una tapa
      falsa. Las bandas se solapan en cruces y esquinas: son coplanarias y
      del mismo color plano, así que no se nota.
   4. Cada banda se recorta al rectángulo del cajón (Sutherland–Hodgman),
      porque cada cajón corta a su cota y un muro que cruza de un cajón a otro
      lleva un trozo de tapa a cada altura.

   Sirve en el navegador (tapas de la vivienda abierta, en tiempo real) y en
   node (tools/tapas_serenea.mjs, las tapas de cada planta, precalculadas).
   No importa three.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Materiales que son muro o tabique (los únicos con tapa): pintura interior,
   hormigón, monocapa, travertino y alicatado. Lo compartido con cortes.js. */
export const ES_MURO = /Pintura interior|Hormigon|Monocapa|Travertino|Alicatado/i;
export const GROSOR_MAX = 0.5;    // m: dos caras más separadas no son un muro (ni un pilar)
const GROSOR_MIN = 0.02;          // m: más juntas es la misma cara repetida
const SOLAPE_MIN = 0.015;         // m: solape mínimo a lo largo para emparejar
const COS_PARALELO = 0.99;        // cos 8°
const ALARGUE_MAX = 0.45;         // m: tope del alargue en esquinas

/* Segmento orientado de la sección de un triángulo con el plano y = h.
   a, b, c: [x, y, z]. Devuelve [x0, z0, x1, z1] o null. */
export function segmentoDe(a, b, c, h) {
  const sa = a[1] > h, sb = b[1] > h, sc = c[1] > h;
  if (sa === sb && sb === sc) return null;
  const puntos = [];
  const corta = (p, q) => {
    if ((p[1] > h) === (q[1] > h)) return;
    // simétrico: el mismo par de vértices da el mismo punto sea cual sea el orden
    const [u, v] = (p[1] < q[1] || (p[1] === q[1] && p[0] < q[0])) ? [p, q] : [q, p];
    const t = (h - u[1]) / (v[1] - u[1]);
    puntos.push([u[0] + (v[0] - u[0]) * t, u[2] + (v[2] - u[2]) * t]);
  };
  corta(a, b); corta(b, c); corta(c, a);
  if (puntos.length !== 2) return null;
  // normal (hacia fuera con el sentido antihorario del GLB); dirección = (nz, -nx)
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
  if (nx * nx + nz * nz < 1e-12) return null; // cara horizontal: no es un paramento
  const dx = nz, dz = -nx;
  let [p, q] = puntos;
  if ((q[0] - p[0]) * dx + (q[1] - p[1]) * dz < 0) [p, q] = [q, p];
  if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-4) return null;
  return [p[0], p[1], q[0], q[1]];
}

/* Une los segmentos colineales que se tocan o solapan (una cara está partida
   en muchos triángulos, y cada uno da su trocito): misma dirección y misma
   recta, en el mismo sentido. Así cada cara es un segmento y cada muro un
   par, en vez de decenas de bandas solapadas. */
export function fusionarColineales(segmentos) {
  const grupos = new Map();
  for (const s of segmentos) {
    const dx = s[2] - s[0], dz = s[3] - s[1]; const L = Math.hypot(dx, dz); if (L < 1e-6) continue;
    const ux = dx / L, uz = dz / L;
    const ang = Math.round(Math.atan2(uz, ux) / (Math.PI / 720)); // 0,25°
    const c = Math.round((-uz * s[0] + ux * s[1]) / 0.003);         // distancia con signo de la recta al origen, 3 mm
    const k = `${ang},${c}`;
    let g = grupos.get(k); if (!g) { g = { ux, uz, tramos: [] }; grupos.set(k, g); }
    const t0 = s[0] * ux + s[1] * uz, t1 = s[2] * ux + s[3] * uz;
    g.tramos.push([Math.min(t0, t1), Math.max(t0, t1), s]);
  }
  const salida = [];
  for (const g of grupos.values()) {
    g.tramos.sort((a, b) => a[0] - b[0]);
    let [lo, hi, ref] = g.tramos[0];
    const emitir = () => {
      // punto de la recta: proyección del segmento de referencia
      const px = ref[0], pz = ref[1]; const t = px * g.ux + pz * g.uz;
      salida.push([px + (lo - t) * g.ux, pz + (lo - t) * g.uz, px + (hi - t) * g.ux, pz + (hi - t) * g.uz]);
    };
    for (let i = 1; i < g.tramos.length; i++) {
      const [a, b, s] = g.tramos[i];
      if (a <= hi + 0.006) { if (b > hi) hi = b; } else { emitir(); lo = a; hi = b; ref = s; }
    }
    emitir();
  }
  return salida;
}

/* Bandas entre pares de caras. `segmentos`: [x0, z0, x1, z1] orientados.
   Devuelve cuadriláteros [[x,z]×4] y rellena stats. */
export function bandasDe(segmentosBrutos, stats = {}) {
  const segmentos = fusionarColineales(segmentosBrutos);
  stats.caras = segmentos.length;
  const segs = segmentos.map((s, i) => {
    const dx = s[2] - s[0], dz = s[3] - s[1]; const L = Math.hypot(dx, dz);
    return { i, x0: s[0], z0: s[1], x1: s[2], z1: s[3], dx: dx / L, dz: dz / L, L, nx: -dz / L, nz: dx / L }; // n = derecha = exterior
  });
  const CELDA = 0.5;
  const rejilla = new Map();
  const celdasDe = (s, margen) => {
    const xa = Math.min(s.x0, s.x1) - margen, xb = Math.max(s.x0, s.x1) + margen;
    const za = Math.min(s.z0, s.z1) - margen, zb = Math.max(s.z0, s.z1) + margen;
    const out = [];
    for (let i = Math.floor(xa / CELDA); i <= Math.floor(xb / CELDA); i++) for (let j = Math.floor(za / CELDA); j <= Math.floor(zb / CELDA); j++) out.push(`${i},${j}`);
    return out;
  };
  for (const s of segs) for (const k of celdasDe(s, 0)) { let l = rejilla.get(k); if (!l) { l = []; rejilla.set(k, l); } l.push(s); }
  const bandas = []; let pares = 0;
  const vistos = new Set();
  for (const a of segs) {
    vistos.clear();
    for (const k of celdasDe(a, GROSOR_MAX)) {
      const l = rejilla.get(k); if (!l) continue;
      for (const b of l) {
        if (b.i <= a.i || vistos.has(b.i)) continue;
        vistos.add(b.i);
        if (a.dx * b.dx + a.dz * b.dz > -COS_PARALELO) continue;                 // no antiparalelos
        const w = -((b.x0 - a.x0) * a.nx + (b.z0 - a.z0) * a.nz);                // grosor: b en el lado interior de a
        if (w < GROSOR_MIN || w > GROSOR_MAX) continue;
        const w2 = -((a.x0 - b.x0) * b.nx + (a.z0 - b.z0) * b.nz);              // y a en el lado interior de b
        if (w2 < GROSOR_MIN || w2 > GROSOR_MAX) continue;
        // extensión a lo largo de a
        const t = (x, z) => (x - a.x0) * a.dx + (z - a.z0) * a.dz;
        const tb0 = t(b.x0, b.z0), tb1 = t(b.x1, b.z1);
        const lob = Math.min(tb0, tb1), hib = Math.max(tb0, tb1);
        const lo = Math.max(0, lob), hi = Math.min(a.L, hib);
        if (hi - lo < SOLAPE_MIN) continue;
        const alargue = Math.min(w, ALARGUE_MAX);
        const lo2 = Math.max(Math.min(0, lob), lo - alargue), hi2 = Math.min(Math.max(a.L, hib), hi + alargue);
        // banda: de la cara a (lado exterior en 0) a la cara b (a -w por la normal)
        const px = a.x0 + a.dx * lo2, pz = a.z0 + a.dz * lo2, qx = a.x0 + a.dx * hi2, qz = a.z0 + a.dz * hi2;
        const ox = -a.nx * w, oz = -a.nz * w;
        bandas.push([[px, pz], [qx, qz], [qx + ox, qz + oz], [px + ox, pz + oz]]);
        pares++;
      }
    }
  }
  stats.pares = pares;
  return bandas;
}

/* Recorta un polígono convexo [[x,z],…] al rectángulo (Sutherland–Hodgman). */
export function recortarConvexo(poli, r) {
  const lados = [(p) => p[0] - r.x0, (p) => r.x1 - p[0], (p) => p[1] - r.z0, (p) => r.z1 - p[1]];
  for (const f of lados) {
    if (!poli.length) break;
    const out = [];
    for (let i = 0; i < poli.length; i++) {
      const p = poli[i], q = poli[(i + 1) % poli.length];
      const fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    poli = out;
  }
  return poli;
}
/* Igual, pero devuelve triángulos. */
export function recortarPoligono(poli, r) {
  const lados = [(p) => p[0] - r.x0, (p) => r.x1 - p[0], (p) => p[1] - r.z0, (p) => r.z1 - p[1]];
  for (const f of lados) {
    if (!poli.length) break;
    const out = [];
    for (let i = 0; i < poli.length; i++) {
      const p = poli[i], q = poli[(i + 1) % poli.length];
      const fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    poli = out;
  }
  const tris = [];
  for (let i = 1; i + 1 < poli.length; i++) tris.push([poli[0], poli[i], poli[i + 1]]);
  return tris;
}

/* Sección completa: `triangulos` es un iterable de [a, b, c] (cada uno
   [x, y, z], en mundo). Devuelve { posiciones: Float32Array (x, y, z), stats }
   con y = cota + `alzar`; las caras miran hacia arriba. `rect` opcional
   recorta al cajón. */
export function seccionar(triangulos, cota, { rect = null, alzar = 0.01, stats = {} } = {}) {
  const segmentos = [];
  for (const [a, b, c] of triangulos) { const s = segmentoDe(a, b, c, cota); if (s) segmentos.push(s); }
  stats.segmentos = segmentos.length;
  const bandas = bandasDe(segmentos, stats);
  const poligonos = [];
  for (const banda of bandas) {
    const p = rect ? recortarConvexo(banda, rect) : banda;
    if (p.length >= 3) poligonos.push(p);
  }
  const { posiciones, area } = triangularPoligonos(poligonos, cota + alzar);
  stats.bandas = bandas.length; stats.poligonos = poligonos.length; stats.area = area;
  return { posiciones, poligonos, stats };
}

/* Polígonos convexos [[x,z],…] → triángulos (abanico) mirando a +y. */
export function triangularPoligonos(poligonos, y) {
  const salida = []; let area = 0;
  for (const poli of poligonos) {
    for (let i = 1; i + 1 < poli.length; i++) {
      const u = poli[0], v = poli[i], w = poli[i + 1];
      const cruz = (v[0] - u[0]) * (w[1] - u[1]) - (w[0] - u[0]) * (v[1] - u[1]);
      if (Math.abs(cruz) < 1e-7) continue;
      // cara hacia +y: en (x, z) visto desde arriba el sentido antihorario de three es cruz < 0
      const [p1, p2, p3] = cruz < 0 ? [u, v, w] : [u, w, v];
      salida.push(p1[0], y, p1[1], p2[0], y, p2[1], p3[0], y, p3[1]);
      area += Math.abs(cruz) / 2;
    }
  }
  return { posiciones: new Float32Array(salida), area };
}
