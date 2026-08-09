/* ═══════════════════════════════════════════════════════════════
   layout.js — Definición de plantas y generación del layout
   geométrico del Edificio Apolo.

   La distribución de viviendas por fila se ha transcrito de las
   fichas comerciales (APOLO_Fichas_Comerciales_Plantas_A3):
   fila NE (trasera), fila SO (fachada principal) y dos sub-filas
   interiores a los patios ajardinados. La representación 3D es
   esquemática pero fiel al orden, orientación y proporción de
   superficies reales de cada vivienda.
   ═══════════════════════════════════════════════════════════════ */

// Dimensiones generales del volumen (metros). Huella y patios calibrados
// con el modelo BIM de Revit (SERENEA_APOLO_3D): barra de ~112×30 m con
// tres grandes patios pasantes de ~11×12 m.
export const BUILDING = {
  length: 112,        // eje X (dirección NO–SE)
  depth: 30,          // eje Z (NE → SO)
  chamfer: 3.5,       // chaflán de esquinas
  rowDepth: 8,        // profundidad crujías perimetrales
  innerDepth: 5.6,    // profundidad viviendas interiores
  corridor: 1.5,      // pasillo entre crujías
  margin: 2.2,        // margen en testeros
  slab: 0.32,         // canto de forjado
};

// Patios reales: límites tomados de los muros del BIM (coords de escena)
export const PATIOS = [
  { x: -30.65, z: -0.5, w: 12.3, d: 12.0 },
  { x: 0.15,   z: -0.5, w: 12.3, d: 12.0 },
  { x: 31.95,  z: -0.5, w: 10.1, d: 12.0 },
];

// ── Muros medianeros reales (posición X, medidos en el BIM: muros
//    finos perpendiculares a fachada repetidos en ≥3 plantas). Los
//    límites de vivienda se ajustan al muro real más próximo. ──
export const WALLS_NE = [-55.3, -48.0, -37.8, -30.0, -22.1, -14.4, -6.6, 1.3, 9.2, 17.0, 24.8, 32.6, 40.5, 48.2, 55.4];
export const WALLS_SW = [-55.0, -48.0, -42.0, -36.0, -30.0, -24.1, -18.2, -12.4, -6.6, 1.3, 9.2, 17.0, 24.8, 32.6, 40.5, 48.2, 53.5];

// Pares de viviendas interiores: crujías reales entre muros del BIM,
// flanqueando cada patio (orden de fichas: L1,R1,L2,R2,L3,R3)
export const INNER_PAIRS = [
  [-44.0, -36.8], [-24.5, -17.3],
  [-13.3, -6.0],  [6.3, 13.5],
  [19.6, 26.9],   [37.0, 44.3],
];

// ── Tramos del edificio (el terreno cae de O a E; cotas de forjado
//    por planta medidas en el BIM, y rasante de acera aproximada
//    según los alzados/secciones) ──
export const SECTIONS = [
  { x0: -60, x1: -31, floors: [-0.8, 2.1, 4.9, 7.7], street: 2.0 },
  { x0: -31, x1: 3.6, floors: [-0.8, 2.7, 6.3, 9.3], street: 1.35 },
  { x0: 3.6, x1: 31.6, floors: [-0.8, 1.3, 4.9, 7.9], street: 0.6 },
  { x0: 31.6, x1: 60, floors: [-0.1, 3.5, 6.5, 9.5], street: -0.25 },
];

export function sectionAt(x) {
  return SECTIONS.find((s) => x >= s.x0 && x < s.x1) || SECTIONS[x < 0 ? 0 : SECTIONS.length - 1];
}

/** Cota real (BIM) del forjado de la planta `level` en la posición x. */
export function floorYAt(x, level) {
  return sectionAt(x).floors[Math.min(level, 3)];
}

/** Rasante aproximada de la acera en x. */
export function streetYAt(x) {
  return sectionAt(x).street;
}

export const FLOOR_DEFS = [
  {
    key: 'baja', label: 'Planta Baja', short: 'PB', level: 0, y: 0, h: 3.4,
    plan: 'assets/plans/nivel-1.png', planLabel: 'Nivel 1 · Planta Baja',
    rows: {
      ne:  ['128', '127', '126', '125', '120', '119', '118', '113', '112', '111', '110', '109'],
      sw:  ['129', '132', '133', '134', '135', '136', '137', '138', '101', '102', '103', '104', '105', '106'],
      inN: ['130', '124', '121', '117', '114', '108'],
      inS: ['131', '123', '122', '116', '115', '107'],
    },
  },
  {
    key: 'p1', label: 'Planta 1ª', short: '1ª', level: 1, y: 3.4, h: 3.0,
    plan: 'assets/plans/nivel-2.png', planLabel: 'Nivel 2 · Planta Primera',
    rows: {
      ne:  ['233', '232', '231', '230', '229', '224', '223', '222', '221', '216', '215', '214', '213', '212', '211', '208', '207'],
      sw:  ['234', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '201', '202', '203', '204', '205', '206'],
      inN: ['235', '228', '225', '220', '217', '210'],
      inS: ['236', '227', '226', '219', '218', '209'],
    },
  },
  {
    key: 'p2', label: 'Planta 2ª', short: '2ª', level: 2, y: 6.4, h: 3.0,
    plan: 'assets/plans/nivel-3.png', planLabel: 'Nivel 3 · Planta Segunda',
    rows: {
      ne:  ['333', '332', '331', '330', '329', '324', '323', '322', '321', '316', '315', '314', '313', '312', '311', '308', '307'],
      sw:  ['334', '337', '338', '339', '340', '341', '342', '343', '344', '345', '346', '301', '302', '303', '304', '305', '306'],
      inN: ['335', '328', '325', '320', '317', '310'],
      inS: ['336', '327', '326', '319', '318', '309'],
    },
  },
  {
    key: 'atico', label: 'Ático', short: 'AT', level: 3, y: 9.4, h: 3.0, atico: true,
    plan: 'assets/plans/nivel-4.png', planLabel: 'Nivel 4 · Ático',
    rows: {
      ne:  ['426', '425', '424', '423', '418', '417', '412', '411', '410', '409', '406'],
      sw:  ['427', '428', '431', '432', '433', '434', '435', '436', '401', '402', '403', '404', '405'],
      inN: ['429', '422', '419', '416', '413', '408'],
      inS: ['430', '421', '420', '415', '414', '407'],
    },
  },
];

export const ROOF_Y = 12.4;

const PLANTA_KEY = { 'Baja': 'baja', '1ª': 'p1', '2ª': 'p2', 'Ático': 'atico' };

export function floorOf(unit) { return PLANTA_KEY[unit.planta]; }

/**
 * Calcula la geometría (rectángulos XZ) de cada vivienda y de los
 * patios interiores. Devuelve { rects: Map<id, rect>, courts: [] }.
 * rect = { x, z, w, d, floor, terrace? } — x/z centro, w/d dimensiones.
 */
export function computeLayout(unitsById) {
  const B = BUILDING;
  const rects = new Map();
  const courts = [];
  const halfL = B.length / 2;
  const usable = B.length - B.margin * 2;

  // ── Bandas Z ──
  const zNE = -B.depth / 2 + B.rowDepth / 2;          // fila noreste (trasera)
  const zSW = B.depth / 2 - B.rowDepth / 2;           // fila suroeste (principal)
  const zInN = -B.innerDepth / 2;                     // interior norte
  const zInS = B.innerDepth / 2;                      // interior sur

  const distributeRow = (ids, zCenter, depth, floorKey, aticoInset = 0, walls = null) => {
    // Anchura proporcional a la superficie real de cada vivienda
    const widths = ids.map((id) => {
      const u = unitsById.get(id);
      return Math.max((u ? u.supViv : 50) / depth, 4.0);
    });
    const total = widths.reduce((a, b) => a + b, 0);
    const x0 = walls ? walls[0] : -halfL + B.margin;
    const x1 = walls ? walls[walls.length - 1] : halfL - B.margin;
    const scale = (x1 - x0) / total;

    // límites acumulados y ajuste al muro medianero real más próximo
    const cuts = [x0];
    let acc = x0;
    for (let i = 0; i < ids.length - 1; i++) { acc += widths[i] * scale; cuts.push(acc); }
    cuts.push(x1);
    if (walls) {
      for (let i = 1; i < cuts.length - 1; i++) {
        let best = null, bd = 2.6;
        for (const w of walls) {
          const d = Math.abs(w - cuts[i]);
          if (d < bd && w > cuts[i - 1] + 2.8 && w < x1 - 2.8) { bd = d; best = w; }
        }
        if (best !== null) cuts[i] = best;
      }
      // garantizar monotonicidad tras el ajuste
      for (let i = 1; i < cuts.length; i++) if (cuts[i] < cuts[i - 1] + 2.6) cuts[i] = cuts[i - 1] + 2.6;
    }

    ids.forEach((id, i) => {
      const w = cuts[i + 1] - cuts[i];
      let d = depth;
      let z = zCenter;
      if (aticoInset > 0) {
        // Ático: la vivienda se retranquea (terraza al borde en el BIM)
        d = depth - aticoInset;
        const sign = zCenter > 0 ? 1 : -1;
        z = zCenter - sign * (aticoInset / 2);
      }
      rects.set(id, { x: (cuts[i] + cuts[i + 1]) / 2, z, w, d, floor: floorKey, terrace: null });
    });
  };

  // Patios reales del BIM (los mismos huecos en todas las plantas)
  for (const P of PATIOS) courts.push({ x: P.x, z: P.z, w: P.w, d: P.d });

  for (const F of FLOOR_DEFS) {
    const inset = F.atico ? 3.2 : 0;
    distributeRow(F.rows.ne, zNE, B.rowDepth, F.key, inset, WALLS_NE);
    distributeRow(F.rows.sw, zSW, B.rowDepth, F.key, inset, WALLS_SW);

    // ── Banda interior: crujías reales del BIM flanqueando cada patio ──
    const pairs = F.rows.inN.map((idN, i) => [idN, F.rows.inS[i]]);
    pairs.forEach(([idN, idS], i) => {
      const [px0, px1] = INNER_PAIRS[i];
      const P = PATIOS[Math.floor(i / 2)];
      const x = (px0 + px1) / 2;
      const w = px1 - px0;
      const zN = P.z - B.innerDepth / 2 - 0.3;
      const zS = P.z + B.innerDepth / 2 + 0.3;
      rects.set(idN, { x, z: zN, w, d: B.innerDepth, floor: F.key, terrace: null });
      rects.set(idS, { x, z: zS, w, d: B.innerDepth, floor: F.key, terrace: null });
    });
  }

  return { rects, courts };
}
