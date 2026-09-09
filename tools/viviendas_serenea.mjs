/* ═══════════════════════════════════════════════════════════════════════════
   viviendas_serenea.mjs — Contorno exacto de cada vivienda de Apolo a partir
   del GLB de SketchUp (v6), y su asignación al identificador comercial.

   Uso:  node tools/viviendas_serenea.mjs <SERENEA_Apolo_v6_Entrega.glb> [--png <dir>]
                                          [--planta baja|p1|p2|atico] [--debug]

   El modelo no trae grupos por vivienda: se deducen de los tabiques y de las
   puertas. Método (todo en el marco del SketchUp, metros, Y arriba):

   1. Se leen de Apolo los triángulos de muros/forjados (Geom3D hijos directos
      del nodo del DWG), carpinterías (UNIK_VEN_*, VEN-X_Acristalamiento),
      pilares (PIE-*), fachadas, escaleras y ascensores → "paredes". Las
      puertas (UNIK_PUE_*) se guardan aparte con su caja y su familia. Los
      pavimentos horizontales se clasifican: vinilo roble / acabado interior
      de ático = suelo de vivienda, tarima exterior = terraza, PAMESA Wells =
      zona común.
   2. Por planta (baja, p1, p2, atico) y cajón/plataforma (data/cortes.json),
      se localizan las cotas de suelo reales: son los `ymin` de las puertas de
      entrada Pm-1 del cajón (agrupados a 30 cm; hay cajones con dos medios
      niveles). El cajón se corta con dos planos por nivel (suelo + 0,9 y
      suelo + 1,5 m) y los segmentos resultantes se rasterizan en una rejilla
      de 5 cm; las cajas de las puertas también, para que separen estancias.
      La rejilla se engorda una celda para cerrar rendijas.
   3. Inundación de las celdas libres → estancias. Las que tocan el borde son
      exterior; las que tienen pavimento Wells o ≥ 3 puertas de entrada son
      zona común; las de tarima son terraza.
   4. Las puertas interiores (Pm-2 abatible, Pm-3 corredera) unen las dos
      estancias muestreadas a ±0,5 m del centro de la puerta a lo largo de su
      normal (union-find). Las puertas de entrada (Pm-1) no unen: señalan la
      vivienda por el lado que no es zona común. Vivienda = conjunto unido
      que contiene el lado "vivienda" de una Pm-1. Las estancias sin puerta
      (armarios, baños sin hoja) van a la vivienda con la que compartan más
      tabique fino (≤ 20 cm), y se avisa.
   5. Polígono: máscara de las estancias de la vivienda con un cierre
      morfológico de 20 cm (rellena los tabiques interiores propios sin salir
      del contorno), contorno trazado por aristas de celda, colineales
      fusionados y Douglas-Peucker a 4 cm.
   6. Identificador: los planos de nivel de assets/APOLO_Fichas_Comerciales.pdf
      son vectoriales y llevan el número de cada vivienda como texto junto a
      su puerta de entrada. Se leen las etiquetas (glifos → dígitos) con su
      posición en página y se pasan al marco del SketchUp con la escala del
      plano (0,12329 m/pt, ajustada con las puertas de la fila sur; se
      comprueba que cada etiqueta cae a menos de 1,5 m de una puerta Pm-1).
      Cada etiqueta nombra la vivienda de la puerta de entrada más cercana.
      Como contraste, se calcula también el identificador por solape con los
      rectángulos de computeLayout (new/js/layout.js) trasladados al marco
      del SketchUp (x + 66,72, z − 23,94) y se anota si discrepa. Se
      comprueba el área contra supViv (útil interior: el polígono incluye
      los tabiques interiores, así que suele quedar algo por encima).
   7. Cota: y0 = mediana del pavimento de vivienda dentro del polígono (o el
      ymin de la puerta de entrada); y1 = min(y0 + 2,7, corte − 0,15).

   Salida: data/viviendas_serenea.json y, con --png, una imagen por planta
   (1 px = 5 cm) para comprobar a ojo que los polígonos siguen los tabiques.
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PNG } from 'pngjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ENTRADA = args.find((a) => !a.startsWith('--'));
const iPng = args.indexOf('--png');
const DIR_PNG = iPng >= 0 ? args[iPng + 1] : path.join(os.tmpdir(), 'viviendas_serenea');
const DEBUG = args.includes('--debug');
const iPl = args.indexOf('--planta'); const SOLO_PLANTA = iPl >= 0 ? args[iPl + 1] : null;
if (!ENTRADA) { console.error('uso: node tools/viviendas_serenea.mjs <modelo.glb> [--png <dir>]'); process.exit(1); }
fs.mkdirSync(DIR_PNG, { recursive: true });

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const f2 = (v) => Math.round(v * 100) / 100;
const avisos = [];
const aviso = (s) => { avisos.push(s); log('AVISO:', s); };

/* ─────────────────────────── Datos de apoyo ─────────────────────────── */
const PLANTAS = ['baja', 'p1', 'p2', 'atico'];
const PLANTA_DE_UNIT = { 'Baja': 'baja', '1ª': 'p1', '2ª': 'p2', 'Ático': 'atico' };
const cortes = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'cortes.json'), 'utf8'));
const units = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'units.json'), 'utf8'));
const unitsById = new Map(units.map((u) => [u.id, u]));
const layout = await import(pathToFileURL(path.join(RAIZ, 'new', 'js', 'layout.js')).href);
const { rects } = layout.computeLayout(unitsById);
const MARCO = { dx: 66.72, dz: -23.94 }; // ver cabecera de new/js/visor/edificio.js

const cajones = cortes.plantas.baja; // misma huella en todas las plantas
function plataformaDe(cx, cz) {
  let i = cajones.findIndex((c) => cx >= c.x0 && cx < c.x1 && cz >= c.z0 && cz < c.z1);
  if (i < 0) {
    let mejor = Infinity;
    cajones.forEach((c, k) => {
      const dx = Math.max(c.x0 - cx, 0, cx - c.x1), dz = Math.max(c.z0 - cz, 0, cz - c.z1);
      const d = dx * dx + dz * dz; if (d < mejor) { mejor = d; i = k; }
    });
  }
  return i;
}
const corteDe = (planta, plat) => cortes.plantas[planta][plat].y;
/* Planta a la que pertenece una cota de suelo en un cajón: la franja
   [corte − 3,05, corte − 0,9). Las puertas de entrada quedan 1,4…2,7 m bajo
   el corte de su planta y 0,3…1,6 m sobre el de la inferior. */
function plantaDeCota(y, plat) {
  for (const k of PLANTAS) { const c = corteDe(k, plat); if (y >= c - 3.05 && y < c - 0.9) return k; }
  return null;
}

/* ─────────────────────────── Etiquetas del PDF comercial ─────────────────────────── */
/* Los cuatro planos de nivel son vectoriales; el texto va en una fuente CID
   TrueType cuyos glifos siguen el orden ASCII desplazado (gid 0x13 = '0').
   Se recorre el flujo de contenido llevando la matriz gráfica (cm/q/Q) y la
   de texto (Tm/Td) para situar cada Tj en la página. */
const PLANO = { escala: 0.12329, x0: -6.323, z0: 29.63 }; // x = px·escala + x0 · z = z0 − py·escala
function leerEtiquetasPDF(ruta) {
  if (!fs.existsSync(ruta)) return null;
  const buf = fs.readFileSync(ruta); const d = buf.toString('latin1');
  const flujo = (num) => {
    const m = new RegExp(`(?<!\\d)${num} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n`).exec(d); if (!m) return '';
    const n = +(/\/Length (\d+)/.exec(m[1]) || [0, 0])[1]; const ini = m.index + m[0].length;
    const datos = buf.subarray(ini, ini + n);
    try { return /FlateDecode/.test(m[1]) ? zlib.inflateSync(datos).toString('latin1') : datos.toString('latin1'); } catch { return ''; }
  };
  const mul = (a, b) => [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3], a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3], a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]];
  const ap = (m, x, y) => [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
  const decodifica = (hex) => { let s = ''; for (let i = 0; i + 4 <= hex.length; i += 4) { const g = parseInt(hex.slice(i, i + 4), 16); s += g >= 0x13 && g <= 0x1c ? String.fromCharCode(48 + g - 0x13) : g === 3 ? ' ' : g >= 0x24 && g <= 0x5d ? String.fromCharCode(g + 0x1d) : '?'; } return s; };
  const paginas = [...d.matchAll(/\/Type\s*\/Page\b(?:(?!endobj)[\s\S])*?\/Contents\s*\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/(\d+) 0 R/g)].map((x) => x[1]));
  const salida = {};
  paginas.forEach((objs) => {
    const txt = objs.map(flujo).join('\n');
    const toks = txt.match(/<[0-9A-Fa-f]+>|\([^)]*\)|\/[^\s/\[\]<>()]+|[-+]?\d*\.?\d+|[A-Za-z'"*]+|\[|\]/g) || [];
    let ctm = [1, 0, 0, 1, 0, 0], tm = null, tlm = null; const pila = []; let stack = [];
    const etiquetas = []; let nivel = null;
    for (const t of toks) {
      if (/^[-+]?\d*\.?\d+$/.test(t)) { stack.push(+t); continue; }
      if (/^[<(\/\[\]]/.test(t)) { stack.push(t); continue; }
      const nums = stack.filter((v) => typeof v === 'number');
      if (t === 'q') pila.push(ctm.slice());
      else if (t === 'Q') ctm = pila.pop() || ctm;
      else if (t === 'cm' && nums.length >= 6) ctm = mul(nums.slice(-6), ctm);
      else if (t === 'BT') { tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); }
      else if (t === 'Tm' && nums.length >= 6) { tm = nums.slice(-6); tlm = tm.slice(); }
      else if (t === 'Td' && nums.length >= 2) { tlm = mul([1, 0, 0, 1, nums[nums.length - 2], nums[nums.length - 1]], tlm || [1, 0, 0, 1, 0, 0]); tm = tlm.slice(); }
      else if ((t === 'Tj' || t === 'TJ') && tm) {
        const hex = stack.filter((v) => typeof v === 'string' && v.startsWith('<')).map((v) => v.slice(1, -1)).join('');
        const texto = decodifica(hex); const [px, py] = ap(ctm, ...ap(tm, 0, 0));
        const niv = /^Nivel (\d)$/.exec(texto); if (niv) nivel = +niv[1];
        if (/^\d{3}$/.test(texto)) etiquetas.push({ id: texto, px, py, x: px * PLANO.escala + PLANO.x0, z: PLANO.z0 - py * PLANO.escala });
      }
      stack = [];
    }
    if (nivel === null || !etiquetas.length) return;
    /* Etiquetas duplicadas encima de otra (erratas del plano): se queda la
       que no aparece en ningún otro sitio. */
    const limpias = [];
    for (const e of etiquetas) {
      const encima = etiquetas.filter((o) => o !== e && Math.hypot(o.px - e.px, o.py - e.py) < 2);
      if (encima.length && etiquetas.filter((o) => o.id === e.id).length > 1) { aviso(`plano nivel ${nivel}: etiqueta ${e.id} repetida encima de ${encima.map((o) => o.id).join('/')}: se ignora`); continue; }
      limpias.push(e);
    }
    salida[PLANTAS[nivel - 1]] = limpias;
  });
  return salida;
}
const etiquetasPDF = leerEtiquetasPDF(path.join(RAIZ, 'assets', 'APOLO_Fichas_Comerciales.pdf'));
/* Superficie útil de cada vivienda: la ficha individual (assets/fichas/<id>.pdf)
   lista las estancias con su superficie en la fuente F1; supViv de
   units.json es la superficie CONSTRUIDA interior (con tabiques y medianeras),
   así que el contorno interior se contrasta mejor con la útil. */
function leerUtilFicha(id) {
  const ruta = path.join(RAIZ, 'assets', 'fichas', `${id}.pdf`);
  if (!fs.existsSync(ruta)) return null;
  const buf = fs.readFileSync(ruta); const d = buf.toString('latin1');
  const textos = [];
  for (const m of d.matchAll(/(\d+) 0 obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g)) {
    if (/\/Image|\/Length1/.test(m[2])) continue;
    const n = +(/\/Length (\d+)/.exec(m[2]) || [0, 0])[1]; const ini = m.index + m[0].length;
    let txt; try { txt = (/FlateDecode/.test(m[2]) ? zlib.inflateSync(buf.subarray(ini, ini + n)) : buf.subarray(ini, ini + n)).toString('latin1'); } catch { continue; }
    let fuente = '';
    for (const t of txt.matchAll(/\/(F\d+) [\d.]+ Tf|<([0-9A-Fa-f]+)>\s*Tj/g)) {
      if (t[1]) { fuente = t[1]; continue; }
      let sx = ''; for (let i = 0; i + 4 <= t[2].length; i += 4) { const g = parseInt(t[2].slice(i, i + 4), 16); sx += g >= 0x13 && g <= 0x1c ? String.fromCharCode(48 + g - 0x13) : g === 3 ? ' ' : g === 0x11 ? '.' : g >= 0x24 && g <= 0x5d ? String.fromCharCode(g + 0x1d) : '?'; }
      textos.push([fuente, sx.trim()]);
    }
  }
  const estancias = [];
  const utiles = textos.filter(([f, t]) => f === 'F1' && !/^\d$/.test(t) && t !== 'm'); // fuera dígitos sueltos (superíndice, marcas) y la 'm' de m²
  for (let i = 1; i < utiles.length; i++) {
    const [, t] = utiles[i]; const [, tp] = utiles[i - 1];
    if (/^\d+\.\d+$/.test(t) && /[A-Za-z]/.test(tp) && !/^\d/.test(tp) && !/Nivel|Ref\./.test(tp)) estancias.push({ nombre: tp, m2: +t });
  }
  if (!estancias.length) return null;
  return { util: Math.round(estancias.reduce((a, e) => a + e.m2, 0) * 100) / 100, estancias };
}
const utilFicha = new Map(); let nFichas = 0;
for (const u of units) {
  const f = leerUtilFicha(u.id); if (!f) continue;
  utilFicha.set(u.id, f); nFichas++;
  const razon = f.util / u.supViv;
  if (razon < 0.78 || razon > 0.98) aviso(`ficha ${u.id}: útil ${f.util} m² (${f.estancias.map((e) => `${e.nombre} ${e.m2}`).join(', ')}) frente a construida ${u.supViv}: razón ${f2(razon)} fuera de lo normal (0,8–0,95); puede faltar o sobrar una estancia en la ficha`);
}
log(`fichas leídas: ${nFichas} de ${units.length} (útil por estancias)` + (utilFicha.has('101') ? `; 101: ${utilFicha.get('101').util} m² útiles en ${utilFicha.get('101').estancias.length} estancias, construida ${unitsById.get('101').supViv}` : ''));
if (etiquetasPDF) log('etiquetas del PDF comercial:', PLANTAS.map((k) => `${k} ${(etiquetasPDF[k] || []).length}`).join(' · '));
else aviso('no está assets/APOLO_Fichas_Comerciales.pdf: los identificadores salen solo del solape con layout.js');

/* ─────────────────────────── Rejilla ─────────────────────────── */
const CELDA = 0.05;
const GX0 = 9.0, GZ0 = -43.5, GX1 = 125.5, GZ1 = -6.0;
const W = Math.round((GX1 - GX0) / CELDA), H = Math.round((GZ1 - GZ0) / CELDA);
const ci = (x) => Math.floor((x - GX0) / CELDA), cj = (z) => Math.floor((z - GZ0) / CELDA);
const xDe = (i) => GX0 + i * CELDA, zDe = (j) => GZ0 + j * CELDA;
const dentro = (i, j) => i >= 0 && j >= 0 && i < W && j < H;

/* ─────────────────────────── 1. Leer el GLB ─────────────────────────── */
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(ENTRADA);
const root = doc.getRoot();
const top = root.listScenes()[0].listChildren()[0].listChildren();
const nodoApolo = top.find((n) => /APOLO_Central/i.test(n.getName()));
if (!nodoApolo) throw new Error('No encuentro el nodo de Apolo');
log('leído', path.basename(ENTRADA), `nodos ${root.listNodes().length}, mallas ${root.listMeshes().length}`);

/* Triángulos en coordenadas de mundo de todas las mallas bajo un nodo:
   devuelve [{ pos: Float32Array(9n), material }]. */
function triangulosDe(nodo) {
  const salida = [];
  nodo.traverse((n) => {
    const malla = n.getMesh(); if (!malla) return;
    const M = n.getWorldMatrix();
    for (const prim of malla.listPrimitives()) {
      const P = prim.getAttribute('POSITION'); if (!P) continue;
      const src = P.getArray(); const I = prim.getIndices()?.getArray();
      const n3 = I ? I.length : src.length / 3;
      const out = new Float32Array(n3 * 3);
      for (let t = 0; t < n3; t++) {
        const k = I ? I[t] : t; const x = src[k * 3], y = src[k * 3 + 1], z = src[k * 3 + 2];
        out[t * 3] = M[0] * x + M[4] * y + M[8] * z + M[12];
        out[t * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
        out[t * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
      }
      salida.push({ pos: out, material: prim.getMaterial()?.getName() || '' });
    }
  });
  return salida;
}

/* Clasificación de las familias de Apolo (hijos directos del nodo del DWG). */
const RE_OBRA = /Monocapa|Hormig|Pintura interior|Pavimento|Travertino|Gravilla|Tarima|Aluminio|Junta|PAMESA|Vinilo|Vidrio|Lacado/i;
function categoriaDe(nombre, materiales) {
  const n = nombre;
  if (/^Geom3D/.test(n)) return 'muro';
  if (/PUE[-_]|_PUE_/i.test(n)) return 'puerta';
  if (/Acristalamiento|VEN-X/i.test(n)) return 'vidrio';
  if (/VEN[-_]|_VEN_/i.test(n)) return 'carpinteria';
  if (/PIE[-_]/i.test(n)) return 'pilar';
  if (/Celos|Barandilla/i.test(n)) return 'ignorar';          // celosías de patio y barandillas: no cierran estancias
  if (/Pavimento Wells|zonas comunes/i.test(n)) return 'suelo_comun';
  if (/Revestimientos de.*banos|Sanitarios|auxiliares|Portales parterres|Gimnasio|Plazas_Coche/i.test(n)) return 'mob';
  if (/Escalera/i.test(n)) return 'escalera';
  if (/Ascensor/i.test(n)) return 'ascensor';
  if (/MOB[-_]|_MOB_|wardrobe|Cocina|Armario|silla|mesa|cama|sofa/i.test(n)) return 'mob';
  if (materiales.length && materiales.every((m) => RE_OBRA.test(m))) return 'muro'; // Fachada PB, Muro básico…
  return 'mob';
}

const paredes = [];   // Float32Array de triángulos (pared: se cortan por plano)
const suelos = [];    // { x0,z0,x1,z1,x2,z2,y,clase } triángulos horizontales; clase 1 vivienda, 2 terraza, 3 común, 4 neutro
const puertas = [];   // { tipo, min, max, plat, planta, centro, normal }
const vidrios = [];   // { x, y, z }
const reparto = {};   // triángulos por categoría (para el log)
const familias = new Map(); // nombre → { cat, tris }
const CLASE_SUELO = (mat) => (/Vinilo|Acabado_interior/i.test(mat) ? 1 : /Tarima|Acabado_terraza/i.test(mat) ? 2 : /PAMESA|Wells/i.test(mat) ? 3 : /Pavimento interior/i.test(mat) ? 4 : 0);

function añadirSuelos(tris, claseFija = 0) {
  for (const { pos, material } of tris) {
    const clase = claseFija || CLASE_SUELO(material); if (!clase) continue;
    for (let t = 0; t < pos.length; t += 9) {
      const ax = pos[t + 3] - pos[t], ay = pos[t + 4] - pos[t + 1], az = pos[t + 5] - pos[t + 2];
      const bx = pos[t + 6] - pos[t], by = pos[t + 7] - pos[t + 1], bz = pos[t + 8] - pos[t + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz); if (len < 1e-9 || Math.abs(ny) / len < 0.98) continue;
      suelos.push({ x0: pos[t], z0: pos[t + 2], x1: pos[t + 3], z1: pos[t + 5], x2: pos[t + 6], z2: pos[t + 8], y: (pos[t + 1] + pos[t + 4] + pos[t + 7]) / 3, clase });
    }
  }
}
function registrarPuerta(nodo, nombre) {
  const b = getBounds(nodo);
  const m = /UNIK_PUE_(P[a-z]+-\d)/i.exec(nombre);
  const tipo = m ? m[1] : 'otra';
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const dx = b.max[0] - b.min[0], dz = b.max[2] - b.min[2];
  const plat = plataformaDe(cx, cz);
  puertas.push({ tipo, min: b.min, max: b.max, plat, planta: plantaDeCota(b.min[1], plat), centro: [cx, cz], normal: dx < dz ? [1, 0] : [0, 1], ancho: Math.max(dx, dz) });
}

for (const hijo of nodoApolo.listChildren()) {
  const nombre = hijo.getName();
  const tris = triangulosDe(hijo);
  const materiales = [...new Set(tris.map((t) => t.material))];
  const cat = categoriaDe(nombre, materiales);
  const nTris = tris.reduce((a, t) => a + t.pos.length / 9, 0);
  reparto[cat] = (reparto[cat] || 0) + nTris;
  const clave = nombre.replace(/-\d+-3D(_\d+)?$/, '').replace(/#\d+(_\d+)?$/, '').slice(0, 70);
  const e = familias.get(clave) || { cat, tris: 0, n: 0 }; e.tris += nTris; e.n++; familias.set(clave, e);
  if (cat === 'puerta') { registrarPuerta(hijo, nombre); continue; }
  if (cat === 'vidrio') {
    const b = getBounds(hijo); vidrios.push({ x: (b.min[0] + b.max[0]) / 2, y: (b.min[1] + b.max[1]) / 2, z: (b.min[2] + b.max[2]) / 2 });
    for (const t of tris) paredes.push(t.pos);
    continue;
  }
  if (cat === 'carpinteria') {
    for (const t of tris) {
      paredes.push(t.pos);
      if (/Vidrio/i.test(t.material)) { // vidrio dentro de la familia de la ventana
        let sx = 0, sy = 0, sz = 0; const n = t.pos.length / 3;
        for (let k = 0; k < t.pos.length; k += 3) { sx += t.pos[k]; sy += t.pos[k + 1]; sz += t.pos[k + 2]; }
        vidrios.push({ x: sx / n, y: sy / n, z: sz / n });
      }
    }
    continue;
  }
  if (cat === 'suelo_comun') { añadirSuelos(tris, 3); continue; }
  if (cat === 'muro' || cat === 'pilar' || cat === 'escalera' || cat === 'ascensor') {
    for (const t of tris) paredes.push(t.pos);
    if (cat === 'muro') añadirSuelos(tris);
  }
}
/* Grupos nuevos de primer nivel que afectan a las viviendas: los acabados de
   los áticos son el pavimento interior (roble) y de terraza de esa planta. */
for (const n of top) {
  if (/Acabados de apoyo en aticos/i.test(n.getName())) { const tris = triangulosDe(n); añadirSuelos(tris); reparto.acabados_atico = tris.reduce((a, t) => a + t.pos.length / 9, 0); }
}
log('reparto de triángulos por categoría:', Object.entries(reparto).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · '));
log('familias más pesadas (categoría asignada):');
for (const [k, v] of [...familias].sort((a, b) => b[1].tris - a[1].tris).slice(0, 40)) log(`   ${Math.round(v.tris).toString().padStart(7)} tris ×${String(v.n).padStart(3)}  ${v.cat.padEnd(11)} ${k}`);
log(`paredes ${paredes.length} primitivas, suelos ${suelos.length} tris, puertas ${puertas.length}, vidrios ${vidrios.length}`);
{
  const porTipo = {}; for (const p of puertas) { const k = `${p.tipo}/${p.planta}`; porTipo[k] = (porTipo[k] || 0) + 1; }
  log('puertas por tipo/planta:', Object.entries(porTipo).sort().map(([k, v]) => `${k} ${v}`).join(' · '));
}

/* Plataforma y rango de Y de cada triángulo de pared, precalculado. */
const triPlat = [], triY0 = [], triY1 = [];
{
  let nT = 0; for (const p of paredes) nT += p.length / 9;
  const plat = new Int8Array(nT), y0 = new Float32Array(nT), y1 = new Float32Array(nT);
  let k = 0;
  for (const p of paredes) for (let t = 0; t < p.length; t += 9) {
    const cx = (p[t] + p[t + 3] + p[t + 6]) / 3, cz = (p[t + 2] + p[t + 5] + p[t + 8]) / 3;
    plat[k] = plataformaDe(cx, cz);
    y0[k] = Math.min(p[t + 1], p[t + 4], p[t + 7]); y1[k] = Math.max(p[t + 1], p[t + 4], p[t + 7]);
    k++;
  }
  triPlat.push(plat); triY0.push(y0); triY1.push(y1);
  log(`triángulos de pared: ${nT}`);
}

/* ─────────────────────────── 2. Niveles de suelo por cajón y planta ─────────────────────────── */
/* De las puertas de entrada: agrupadas a 30 cm. Si un cajón no tiene ninguna
   en una planta, se toma corte − 1,95 (la media medida en el resto). */
const niveles = {}; // planta → [ [niveles del cajón 0], … ]
for (const k of PLANTAS) {
  niveles[k] = cajones.map((c, p) => {
    const ys = puertas.filter((d) => d.tipo === 'Pm-1' && d.planta === k && d.plat === p).map((d) => d.min[1]).sort((a, b) => a - b);
    const grupos = [];
    for (const y of ys) { const g = grupos[grupos.length - 1]; if (g && y - g[g.length - 1] < 0.3) g.push(y); else grupos.push([y]); }
    const lv = grupos.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
    if (!lv.length) { lv.push(corteDe(k, p) - 1.95); aviso(`cajón ${p} planta ${k}: sin puertas de entrada; suelo supuesto en corte − 1,95`); }
    return lv;
  });
  log(`niveles ${k}:`, niveles[k].map((l, p) => `P${p}[${l.map(f2).join('/')}] corte ${corteDe(k, p)}`).join(' · '));
}

/* ─────────────────────────── 3. Rasterización ─────────────────────────── */
function marcarSegmento(grid, xa, za, xb, zb) {
  const ia = (xa - GX0) / CELDA, ja = (za - GZ0) / CELDA, ib = (xb - GX0) / CELDA, jb = (zb - GZ0) / CELDA;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(ib - ia), Math.abs(jb - ja)) * 2));
  for (let s = 0; s <= n; s++) {
    const t = s / n; const i = Math.floor(ia + (ib - ia) * t), j = Math.floor(ja + (jb - ja) * t);
    if (dentro(i, j)) grid[j * W + i] = 1;
  }
}
/* Corta un triángulo por el plano y = yc y rasteriza el segmento. */
function cortarTri(grid, p, t, yc) {
  const pts = [];
  for (let e = 0; e < 3; e++) {
    const a = t + e * 3, b = t + ((e + 1) % 3) * 3;
    const ya = p[a + 1], yb = p[b + 1];
    if ((ya - yc) * (yb - yc) > 0) continue;
    if (ya === yb) { pts.push([p[a], p[a + 2]], [p[b], p[b + 2]]); continue; }
    const s = (yc - ya) / (yb - ya);
    pts.push([p[a] + (p[b] - p[a]) * s, p[a + 2] + (p[b + 2] - p[a + 2]) * s]);
  }
  for (let k = 1; k < pts.length; k++) marcarSegmento(grid, pts[0][0], pts[0][1], pts[k][0], pts[k][1]);
}
function rellenarCaja(grid, x0, z0, x1, z1, valor = 1) {
  const i0 = Math.max(0, ci(x0)), i1 = Math.min(W - 1, ci(x1)), j0 = Math.max(0, cj(z0)), j1 = Math.min(H - 1, cj(z1));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * W + i] = valor;
}
function dilatar(grid, r) { // cuadrado de Chebyshev, separable
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) { const f = j * W; let cnt = 0; for (let i = -r; i < W; i++) { if (i + r < W && grid[f + i + r]) cnt++; if (i - r - 1 >= 0 && grid[f + i - r - 1]) cnt--; if (i >= 0) tmp[f + i] = cnt > 0 ? 1 : 0; } }
  for (let i = 0; i < W; i++) { let cnt = 0; for (let j = -r; j < H; j++) { if (j + r < H && tmp[(j + r) * W + i]) cnt++; if (j - r - 1 >= 0 && tmp[(j - r - 1) * W + i]) cnt--; if (j >= 0) out[j * W + i] = cnt > 0 ? 1 : 0; } }
  return out;
}
function erosionar(grid, r) { const inv = new Uint8Array(W * H); for (let k = 0; k < inv.length; k++) inv[k] = grid[k] ? 0 : 1; const d = dilatar(inv, r); for (let k = 0; k < d.length; k++) d[k] = d[k] ? 0 : 1; return d; }
function rellenarTriangulo(grid, s, valor) {
  const i0 = Math.max(0, ci(Math.min(s.x0, s.x1, s.x2))), i1 = Math.min(W - 1, ci(Math.max(s.x0, s.x1, s.x2)));
  const j0 = Math.max(0, cj(Math.min(s.z0, s.z1, s.z2))), j1 = Math.min(H - 1, cj(Math.max(s.z0, s.z1, s.z2)));
  const area = (s.x1 - s.x0) * (s.z2 - s.z0) - (s.x2 - s.x0) * (s.z1 - s.z0); if (Math.abs(area) < 1e-9) return;
  for (let j = j0; j <= j1; j++) {
    const z = zDe(j) + CELDA / 2;
    for (let i = i0; i <= i1; i++) {
      const x = xDe(i) + CELDA / 2;
      const w0 = ((s.x1 - x) * (s.z2 - z) - (s.x2 - x) * (s.z1 - z)) / area;
      const w1 = ((s.x2 - x) * (s.z0 - z) - (s.x0 - x) * (s.z2 - z)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) grid[j * W + i] = valor;
    }
  }
}

/* Tipografía de 5×7 para rotular los identificadores en los PNG. */
const FUENTE = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'], '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'], '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
};

/* ─────────────────────────── 4. Estancias, puertas y viviendas ─────────────────────────── */
const resultado = { origen: path.basename(ENTRADA), viviendas: {}, sinAsignar: [] };
const metricas = { poligonos: {}, asignadas: 0, errores: [], erroresUtil: [], sinVidrio: [], mayor15: [], mayor15Util: [] };
const idsPorPlanta = {}; for (const u of units) { const k = PLANTA_DE_UNIT[u.planta]; (idsPorPlanta[k] ||= []).push(u.id); }

for (const planta of PLANTAS) {
  if (SOLO_PLANTA && planta !== SOLO_PLANTA) continue;
  const tP = Date.now();
  /* 4a. Paredes */
  const pared = new Uint8Array(W * H);
  const plat = triPlat[0], ty0 = triY0[0], ty1 = triY1[0];
  const planos = niveles[planta].map((lv) => lv.flatMap((L) => [L + 0.9, L + 1.5]));
  let k = 0;
  for (const p of paredes) for (let t = 0; t < p.length; t += 9, k++) {
    const pl = planos[plat[k]];
    for (const yc of pl) if (ty0[k] <= yc && ty1[k] >= yc) cortarTri(pared, p, t, yc);
  }
  const puertasPlanta = puertas.filter((d) => d.planta === planta);
  for (const d of puertasPlanta) rellenarCaja(pared, d.min[0], d.min[2], d.max[0], d.max[2]);
  const paredGorda = dilatar(pared, 1);

  /* 4b. Pavimentos de la planta */
  const suelo = new Uint8Array(W * H);
  for (const s of suelos) {
    const p = plataformaDe((s.x0 + s.x1 + s.x2) / 3, (s.z0 + s.z1 + s.z2) / 3);
    if (!niveles[planta][p].some((L) => s.y >= L - 0.3 && s.y <= L + 0.5)) continue;
    rellenarTriangulo(suelo, s, s.clase);
  }

  /* 4c. Inundación */
  const etiqueta = new Int32Array(W * H).fill(-1);
  const comps = []; // { id, celdas, borde, suelo:[0..4], i0,i1,j0,j1, pm1: 0, sx, sz }
  const cola = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (paredGorda[start] || etiqueta[start] >= 0) continue;
    const id = comps.length; const c = { id, celdas: 0, borde: false, suelo: [0, 0, 0, 0, 0], i0: W, i1: 0, j0: H, j1: 0, pm1: 0, pm2: 0, sx: 0, sz: 0, raiz: id };
    let qa = 0, qb = 0; cola[qb++] = start; etiqueta[start] = id;
    while (qa < qb) {
      const cur = cola[qa++]; const i = cur % W, j = (cur - i) / W;
      c.celdas++; c.suelo[suelo[cur]]++; c.sx += i; c.sz += j;
      if (i < c.i0) c.i0 = i; if (i > c.i1) c.i1 = i; if (j < c.j0) c.j0 = j; if (j > c.j1) c.j1 = j;
      if (i === 0 || j === 0 || i === W - 1 || j === H - 1) c.borde = true;
      if (i > 0 && !paredGorda[cur - 1] && etiqueta[cur - 1] < 0) { etiqueta[cur - 1] = id; cola[qb++] = cur - 1; }
      if (i < W - 1 && !paredGorda[cur + 1] && etiqueta[cur + 1] < 0) { etiqueta[cur + 1] = id; cola[qb++] = cur + 1; }
      if (j > 0 && !paredGorda[cur - W] && etiqueta[cur - W] < 0) { etiqueta[cur - W] = id; cola[qb++] = cur - W; }
      if (j < H - 1 && !paredGorda[cur + W] && etiqueta[cur + W] < 0) { etiqueta[cur + W] = id; cola[qb++] = cur + W; }
    }
    comps.push(c);
  }
  for (const c of comps) {
    c.area = c.celdas * CELDA * CELDA;
    const conSuelo = c.suelo[1] + c.suelo[2] + c.suelo[3] + c.suelo[4];
    c.fVivienda = c.suelo[1] / c.celdas; c.fTerraza = c.suelo[2] / c.celdas; c.fComun = c.suelo[3] / c.celdas;
    c.exterior = c.borde;
    c.terraza = !c.exterior && c.suelo[2] > c.suelo[1] && c.fTerraza > 0.3;
    c.comun = !c.exterior && c.fComun > 0.25;
    c.conSuelo = conSuelo;
  }

  /* 4d. Puertas: estancia a cada lado */
  const estanciaEn = (x, z) => {
    const i = ci(x), j = cj(z); if (!dentro(i, j)) return -1;
    if (etiqueta[j * W + i] >= 0) return etiqueta[j * W + i];
    for (let r = 1; r <= 8; r++) { // celda libre más cercana (huecos de paso, rejilla engordada)
      let mejor = -1, md = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ii = i + di, jj = j + dj; if (!dentro(ii, jj)) continue;
        const e = etiqueta[jj * W + ii]; if (e < 0) continue;
        const d = di * di + dj * dj; if (d < md) { md = d; mejor = e; }
      }
      if (mejor >= 0) return mejor;
    }
    return -1;
  };
  for (const d of puertasPlanta) {
    const [nx, nz] = d.normal;
    d.lados = [estanciaEn(d.centro[0] + nx * 0.5, d.centro[1] + nz * 0.5), estanciaEn(d.centro[0] - nx * 0.5, d.centro[1] - nz * 0.5)];
    if (d.tipo === 'Pm-1') for (const l of d.lados) if (l >= 0) comps[l].pm1++;
    if (d.tipo === 'Pm-2' || d.tipo === 'Pm-3') for (const l of d.lados) if (l >= 0) comps[l].pm2++;
  }
  if (DEBUG) for (const d of puertasPlanta) if (d.tipo !== 'Pcf-1' && d.tipo !== 'Pet-1') log(`   ${d.tipo} ymin=${f2(d.min[1])} caja=${f2(d.max[0]-d.min[0])}x${f2(d.max[2]-d.min[2])} (${f2(d.centro[0])}, ${f2(d.centro[1])}) n=${d.normal} lados: ` + d.lados.map((l) => l < 0 ? 'ninguna' : `#${l} ${f2(comps[l].area)}m² viv${f2(comps[l].fVivienda)} ter${f2(comps[l].fTerraza)} com${f2(comps[l].fComun)} pm1=${comps[l].pm1} pm2=${comps[l].pm2}${comps[l].exterior ? ' EXT' : ''}${comps[l].comun ? ' COMUN' : ''}${comps[l].terraza ? ' TERRAZA' : ''}`).join(' | '));
  /* Dos o más puertas de entrada dan a la misma estancia: es un pasillo,
     tenga el pavimento que tenga (las galerías de los patios llevan tarima).
     Las zonas comunes de otro tipo (escaleras, cuartos técnicos) no
     importan: no se asignan a nadie. */
  for (const c of comps) if (!c.exterior && c.pm1 >= 2) { c.comun = true; c.terraza = false; }

  /* 4e. Union-find por puertas interiores */
  const raiz = (a) => { while (comps[a].raiz !== a) { comps[a].raiz = comps[comps[a].raiz].raiz; a = comps[a].raiz; } return a; };
  const unir = (a, b) => { a = raiz(a); b = raiz(b); if (a !== b) comps[b].raiz = a; };
  /* La marca de terraza no excluye: hay viviendas con el suelo modelado en
     tarima. Una terraza de verdad nunca tiene puerta Pm, así que solo cuenta
     para las estancias huérfanas. */
  const esEstancia = (c) => c >= 0 && !comps[c].exterior && !comps[c].comun;
  for (const d of puertasPlanta) {
    if (d.tipo !== 'Pm-2' && d.tipo !== 'Pm-3') continue;
    const [a, b] = d.lados;
    if (esEstancia(a) && esEstancia(b)) unir(a, b);
  }

  /* 4f. Viviendas: el lado "vivienda" de cada Pm-1 */
  const viviendas = []; // { comps: Set, entradas: [puerta], id }
  const porRaiz = new Map();
  for (const d of puertasPlanta) {
    if (d.tipo !== 'Pm-1') continue;
    const [a, b] = d.lados;
    let lado = -1;
    const ea = esEstancia(a), eb = esEstancia(b);
    if (ea && !eb) lado = a; else if (eb && !ea) lado = b;
    else if (ea && eb) { // ninguno es común: el que tenga puertas interiores; si no, más pavimento de vivienda; si no, menos puertas de entrada
      const A = comps[a], B = comps[b];
      const clave = (c) => [c.pm2 > 0 ? 1 : 0, c.fVivienda, -c.pm1];
      const ka = clave(A), kb = clave(B);
      lado = ka[0] !== kb[0] ? (ka[0] > kb[0] ? a : b) : ka[1] !== kb[1] ? (ka[1] > kb[1] ? a : b) : (ka[2] >= kb[2] ? a : b);
      aviso(`${planta}: puerta de entrada en (${f2(d.centro[0])}, ${f2(d.centro[1])}) con estancias a ambos lados sin zona común clara; elegido el lado ${lado === a ? 'A' : 'B'} (puertas interiores ${A.pm2}/${B.pm2}, pavimento ${f2(A.fVivienda)}/${f2(B.fVivienda)})`);
    } else { aviso(`${planta}: puerta de entrada en (${f2(d.centro[0])}, ${f2(d.centro[1])}) sin estancia de vivienda a ningún lado (lados ${a}/${b})`); continue; }
    const r = raiz(lado);
    if (!porRaiz.has(r)) { porRaiz.set(r, { comps: new Set(), entradas: [], raiz: r }); viviendas.push(porRaiz.get(r)); }
    porRaiz.get(r).entradas.push(d);
  }
  for (const c of comps) if (esEstancia(c.id)) { const v = porRaiz.get(raiz(c.id)); if (v) v.comps.add(c.id); }
  for (const v of viviendas) if (v.entradas.length > 1) aviso(`${planta}: una vivienda con ${v.entradas.length} puertas de entrada (${v.entradas.map((d) => `(${f2(d.centro[0])}, ${f2(d.centro[1])})`).join(' ')}): puede que dos viviendas se hayan unido por una puerta interior`);

  /* 4f-bis. Identificador por las etiquetas del plano comercial: cada una
     nombra la puerta de entrada más cercana. Va antes de repartir las
     estancias sin puerta porque la útil de la ficha sirve de presupuesto. */
  const ids = idsPorPlanta[planta];
  const porEtiqueta = new Map();
  if (etiquetasPDF && etiquetasPDF[planta]) {
    const pm1 = puertasPlanta.filter((d) => d.tipo === 'Pm-1');
    const viviendaDePuerta = new Map(); viviendas.forEach((v, vi) => { for (const d of v.entradas) viviendaDePuerta.set(d, vi); });
    const distancias = [];
    for (const e of etiquetasPDF[planta]) {
      if (!ids.includes(e.id)) { aviso(`${planta}: la etiqueta ${e.id} del plano no está en units.json`); continue; }
      let mejor = null, md = Infinity;
      for (const d of pm1) { const dist = Math.hypot(d.centro[0] - e.x, d.centro[1] - e.z); if (dist < md) { md = dist; mejor = d; } }
      distancias.push(md);
      if (!mejor || md > 2.2) { aviso(`${planta}: etiqueta ${e.id} en (${f2(e.x)}, ${f2(e.z)}) sin puerta de entrada a menos de 2,2 m (la más cercana a ${f2(md)} m)`); continue; }
      if (md > 1.2) aviso(`${planta}: etiqueta ${e.id} a ${f2(md)} m de su puerta de entrada (${f2(mejor.centro[0])}, ${f2(mejor.centro[1])}): comprobar en la imagen`);
      const vi = viviendaDePuerta.get(mejor);
      if (vi === undefined) { aviso(`${planta}: etiqueta ${e.id}: su puerta (${f2(mejor.centro[0])}, ${f2(mejor.centro[1])}) no tiene vivienda`); continue; }
      if (porEtiqueta.has(vi) && porEtiqueta.get(vi) !== e.id) aviso(`${planta}: etiquetas ${porEtiqueta.get(vi)} y ${e.id} señalan la misma vivienda`);
      porEtiqueta.set(vi, e.id);
    }
    const media = distancias.reduce((a, b) => a + b, 0) / (distancias.length || 1);
    log(`${planta}: ${etiquetasPDF[planta].length} etiquetas del plano, distancia media a su puerta ${f2(media)} m, máxima ${f2(Math.max(0, ...distancias))} m`);
    if (media > 0.7) aviso(`${planta}: las etiquetas del plano quedan a ${f2(media)} m de media de las puertas: revisar PLANO (escala/origen)`);
  }
  viviendas.forEach((v, vi) => { v.id = porEtiqueta.get(vi) || null; });

  /* 4g. Estancias huérfanas (sin puerta): a la vivienda con más tabique fino
     compartido. En los áticos el modelo trae casi sin puertas interiores
     (36 Pm-2 frente a 145 en las plantas 1 y 2), así que aquí van a parar
     dormitorios y baños enteros; se hacen dos pasadas para que una estancia
     que solo toca a otra huérfana llegue a la vivienda a través de ella. */
  const dueño = new Int32Array(comps.length).fill(-1);
  viviendas.forEach((v, vi) => { for (const c of v.comps) dueño[c] = vi; });
  const huérfanas = comps.filter((c) => esEstancia(c.id) && !c.terraza && dueño[c.id] < 0);
  for (let pasada = 0; pasada < 2; pasada++) for (const c of huérfanas) {
    if (dueño[c.id] >= 0 || c.area > 30 || c.area < 0.5) continue;
    const contactos = new Map();
    for (let j = c.j0; j <= c.j1; j++) for (let i = c.i0; i <= c.i1; i++) {
      if (etiqueta[j * W + i] !== c.id) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (dentro(i + di, j + dj) && etiqueta[(j + dj) * W + i + di] === c.id) continue; // no es borde en esa dirección
        for (let s = 1; s <= 7; s++) { // hasta 25 cm de tabique real (+ 1 celda de engorde a cada lado)
          const ii = i + di * s, jj = j + dj * s; if (!dentro(ii, jj)) break;
          const e = etiqueta[jj * W + ii]; if (e < 0) continue;
          if (e !== c.id && dueño[e] >= 0) contactos.set(dueño[e], (contactos.get(dueño[e]) || 0) + 1);
          else if (e !== c.id && comps[e].comun) contactos.set(-1, (contactos.get(-1) || 0) + 1);
          break;
        }
      }
    }
    const comunes = contactos.get(-1) || 0; contactos.delete(-1);
    /* Presupuesto: la vivienda tiene que "necesitar" la estancia según la
       útil de su ficha (el polígono sale ~1,12 × la suma de estancias). Sin
       ficha, vale que no toque más zona común que vivienda. */
    const necesita = (vi) => { const v = viviendas[vi]; const f = v.id && utilFicha.get(v.id); if (!f) return comunes <= (contactos.get(vi) || 0); const actual = 1.12 * [...v.comps].reduce((a, k) => a + comps[k].area, 0); return f.util - actual >= 0.5 * c.area; };
    const lista = [...contactos].filter(([, n]) => n >= 16).sort((a, b) => b[1] - a[1]);
    const mejor = lista.find(([vi]) => necesita(vi));
    if (!mejor && lista.length) { log(`   ${planta}: estancia sin puerta de ${f2(c.area)} m² en (${f2(xDe(c.sx / c.celdas))}, ${f2(zDe(c.sz / c.celdas))}) toca ${lista.map(([vi, n]) => `${viviendas[vi].id || '?'} (${n})`).join(', ')} pero ninguna la necesita según su ficha (zona común ${comunes}): se deja fuera`); continue; }
    if (mejor) {
      viviendas[mejor[0]].comps.add(c.id); dueño[c.id] = mejor[0]; c.huérfana = true;
      const alt = lista.filter((x) => x !== mejor && necesita(x[0]));
      const msg = `${planta}: estancia sin puerta de ${f2(c.area)} m² en (${f2(xDe(c.sx / c.celdas))}, ${f2(zDe(c.sz / c.celdas))}) unida a ${viviendas[mejor[0]].id || '?'} por ${mejor[1]} celdas de tabique fino${alt.length ? `; también la necesitaría ${alt.map(([vi, n]) => `${viviendas[vi].id || '?'} (${n})`).join(', ')}` : ''}`;
      if (alt.length && alt[0][1] > mejor[1] * 0.5) aviso(msg + ' — reparto dudoso'); else log('   ' + msg);
    }
  }

  /* 4h. Máscara, polígono y área de cada vivienda */
  const ajeno = new Uint8Array(W * H); // celdas de otras viviendas o zonas comunes: nunca se rellenan
  for (let q = 0; q < W * H; q++) { const e = etiqueta[q]; if (e >= 0 && (comps[e].comun || comps[e].exterior || (comps[e].terraza && dueño[e] < 0))) ajeno[q] = 1; }
  for (const v of viviendas) {
    const mascara = new Uint8Array(W * H);
    let i0 = W, i1 = 0, j0 = H, j1 = 0;
    for (const c of v.comps) { const cc = comps[c]; i0 = Math.min(i0, cc.i0); i1 = Math.max(i1, cc.i1); j0 = Math.min(j0, cc.j0); j1 = Math.max(j1, cc.j1); }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const e = etiqueta[j * W + i]; if (e >= 0 && v.comps.has(e)) mascara[j * W + i] = 1; }
    const cerrada = erosionar(dilatar(mascara, 4), 4);
    for (let q = 0; q < W * H; q++) { const e = etiqueta[q]; if (cerrada[q] && (ajeno[q] || (e >= 0 && !v.comps.has(e) && dueño[e] >= 0))) cerrada[q] = 0; }
    /* La rejilla de paredes se engordó una celda para cerrar rendijas; se
       devuelve esa banda de 5 cm a la vivienda para que el contorno quede en
       la cara real del tabique (sin pisar la pared ni otras estancias). */
    const fin = dilatar(cerrada, 1);
    for (let q = 0; q < W * H; q++) { const e = etiqueta[q]; if (fin[q] && !cerrada[q] && (pared[q] || (e >= 0 && !v.comps.has(e)))) fin[q] = 0; }
    v.mascara = fin;
    v.areaUtil = [...v.comps].reduce((a, c) => a + comps[c].area, 0);
    let n = 0, sx = 0, sz = 0; for (let j = j0 - 5; j <= j1 + 5; j++) for (let i = i0 - 5; i <= i1 + 5; i++) if (dentro(i, j) && fin[j * W + i]) { n++; sx += i; sz += j; }
    v.centro = [xDe(sx / n) + CELDA / 2, zDe(sz / n) + CELDA / 2];
    v.caja = [i0 - 5, i1 + 5, j0 - 5, j1 + 5];
    const lazos = contornos(fin, v.caja);
    lazos.sort((a, b) => Math.abs(areaPoligono(b)) - Math.abs(areaPoligono(a)));
    if (!lazos.length) { aviso(`${planta}: vivienda en (${f2(v.centro[0])}, ${f2(v.centro[1])}) sin contorno`); v.poligono = []; continue; }
    const agujeros = lazos.slice(1).filter((l) => Math.abs(areaPoligono(l)) > 1);
    if (agujeros.length) aviso(`${planta}: vivienda en (${f2(v.centro[0])}, ${f2(v.centro[1])}) con ${agujeros.length} agujero(s)/isla(s) > 1 m² (${agujeros.map((l) => f2(Math.abs(areaPoligono(l)))).join(', ')} m²): se conserva solo el contorno mayor`);
    v.poligono = simplificar(lazos[0], 0.04).map(([x, z]) => [f2(x), f2(z)]);
    v.area = Math.abs(areaPoligono(v.poligono));
    if (DEBUG) log(`   vivienda entrada (${f2(v.entradas[0].centro[0])}, ${f2(v.entradas[0].centro[1])}): área ${f2(v.area)} útil ${f2(v.areaUtil)} estancias ${[...v.comps].map((c) => `#${c}:${f2(comps[c].area)}`).join(' ')} lazos ${lazos.length} (${lazos.map((l) => f2(Math.abs(areaPoligono(l)))).join('/')})`);
  }
  /* Ninguna celda puede pertenecer a dos viviendas: es lo que garantiza que
     los prismas no se pisen. */
  { const cuenta = new Uint8Array(W * H); let solapes = 0; for (const v of viviendas) if (v.mascara) for (let q = 0; q < W * H; q++) if (v.mascara[q]) { if (cuenta[q]++) solapes++; } if (solapes) aviso(`${planta}: ${solapes} celdas (${f2(solapes * CELDA * CELDA)} m²) pertenecen a dos viviendas a la vez`); else log(`${planta}: sin solapes entre viviendas`); }
  metricas.poligonos[planta] = viviendas.length;
  log(`${planta}: ${comps.length} estancias (${comps.filter((c) => c.comun).length} comunes, ${comps.filter((c) => c.terraza && c.area >= 1).length} terrazas ≥ 1 m²), ${viviendas.length} viviendas, ${huérfanas.filter((c) => c.area >= 1).length} estancias sin puerta ≥ 1 m² (${huérfanas.filter((c) => c.huérfana).length} unidas a una vivienda)`);

  /* 4i. Identificadores: contraste con layout.js y relleno de los que no tengan etiqueta */
  const rectDe = (id) => { const r = rects.get(id); return { x0: r.x - r.w / 2 + MARCO.dx, x1: r.x + r.w / 2 + MARCO.dx, z0: r.z - r.d / 2 + MARCO.dz, z1: r.z + r.d / 2 + MARCO.dz }; };
  const solape = (v, id) => { const r = rectDe(id); const i0 = Math.max(0, ci(r.x0)), i1 = Math.min(W - 1, ci(r.x1)), j0 = Math.max(0, cj(r.z0)), j1 = Math.min(H - 1, cj(r.z1)); let n = 0; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (v.mascara[j * W + i]) n++; return n; };
  // (b) por solape con los rectángulos de layout.js (contraste, o único criterio sin PDF)
  const pares = [];
  viviendas.forEach((v, vi) => { if (!v.poligono.length) return; for (const id of ids) { const s = solape(v, id); if (s > 0) pares.push([s, vi, id]); } });
  pares.sort((a, b) => b[0] - a[0]);
  const porSolape = new Map(), usado = new Set();
  for (const [, vi, id] of pares) { if (porSolape.has(vi) || usado.has(id)) continue; porSolape.set(vi, id); usado.add(id); }
  let discrepancias = 0;
  const usadosEtiqueta = new Set(porEtiqueta.values());
  viviendas.forEach((v, vi) => {
    const a = v.id, b = porSolape.get(vi);
    if (a && b && a !== b) discrepancias++;
    v.id = a || (etiquetasPDF ? null : b) || null;
    if (!v.id && b && !usadosEtiqueta.has(b) && v.poligono.length) { v.id = b; aviso(`${planta}: vivienda en (${f2(v.centro[0])}, ${f2(v.centro[1])}) sin etiqueta del plano: identificador ${b} por solape con layout.js`); }
    v.idSolape = b || null;
  });
  if (discrepancias) log(`${planta}: ${discrepancias} viviendas en las que el solape con layout.js daría otro identificador (layout.js es aproximado; manda el plano)`);
  const repetidos = new Map(); for (const v of viviendas) if (v.id) repetidos.set(v.id, (repetidos.get(v.id) || 0) + 1);
  for (const [id, n] of repetidos) if (n > 1) aviso(`${planta}: identificador ${id} asignado a ${n} polígonos`);
  const faltan = ids.filter((id) => !viviendas.some((v) => v.id === id));
  if (faltan.length) aviso(`${planta}: sin polígono para ${faltan.length} viviendas: ${faltan.join(', ')}`);

  /* 4j. Cota, vidrios y salida */
  for (const v of viviendas) {
    if (!v.poligono.length) continue;
    const plat = plataformaDe(v.centro[0], v.centro[1]);
    const ysSuelo = [];
    for (const s of suelos) {
      if (s.clase !== 1) continue;
      const i = ci((s.x0 + s.x1 + s.x2) / 3), j = cj((s.z0 + s.z1 + s.z2) / 3);
      if (!dentro(i, j) || !v.mascara[j * W + i]) continue;
      if (!niveles[planta][plataformaDe((s.x0 + s.x1 + s.x2) / 3, (s.z0 + s.z1 + s.z2) / 3)].some((L) => s.y >= L - 0.3 && s.y <= L + 0.5)) continue;
      ysSuelo.push(s.y);
    }
    ysSuelo.sort((a, b) => a - b);
    const yEntrada = Math.min(...v.entradas.map((d) => d.min[1]));
    const y0 = ysSuelo.length ? ysSuelo[Math.floor(ysSuelo.length / 2)] : yEntrada;
    if (Math.abs(y0 - yEntrada) > 0.2) aviso(`${planta} ${v.id}: pavimento a ${f2(y0)} pero puerta de entrada a ${f2(yEntrada)}`);
    const corte = corteDe(planta, plat);
    const y1 = Math.min(y0 + 2.7, corte - 0.15);
    const ampliada = dilatar(v.mascara, 6);
    let nV = 0;
    for (const g of vidrios) { if (g.y < y0 - 0.2 || g.y > y0 + 3.0) continue; const i = ci(g.x), j = cj(g.z); if (dentro(i, j) && ampliada[j * W + i]) nV++; }
    v.vidrios = nV;
    const unit = v.id ? unitsById.get(v.id) : null;
    const entrada = v.entradas[0].centro.map(f2);
    const ficha = v.id ? utilFicha.get(v.id) : null;
    const registro = { planta, plataforma: plat, poligono: v.poligono, y0: f2(y0), y1: f2(y1), area: f2(v.area), areaEstancias: f2(v.areaUtil), supViv: unit ? unit.supViv : null, errorArea: unit ? f2((v.area - unit.supViv) / unit.supViv) : null, supUtil: ficha ? ficha.util : null, errorUtil: ficha ? f2((v.area - ficha.util) / ficha.util) : null, entrada, vidrios: nV, estanciasSinPuerta: [...v.comps].filter((c) => comps[c].huérfana).length };
    if (v.idSolape && v.idSolape !== v.id) registro.idSolape = v.idSolape;
    if (v.id) {
      resultado.viviendas[v.id] = registro; metricas.asignadas++;
      metricas.errores.push(Math.abs(registro.errorArea));
      if (ficha) { metricas.erroresUtil.push(Math.abs(registro.errorUtil)); if (Math.abs(registro.errorUtil) > 0.15) metricas.mayor15Util.push(`${v.id} (${f2(v.area)} vs ${ficha.util} m² útiles, ${Math.round(registro.errorUtil * 100)} %)`); }
      if (Math.abs(registro.errorArea) > 0.15) metricas.mayor15.push(`${v.id} (${f2(v.area)} vs ${unit.supViv} m², ${Math.round(registro.errorArea * 100)} %)`);
      if (!nV) metricas.sinVidrio.push(v.id);
    } else resultado.sinAsignar.push({ planta, centro: v.centro.map(f2), poligono: v.poligono, area: f2(v.area), entrada, motivo: 'vivienda detectada sin identificador' });
  }
  for (const c of huérfanas) if (dueño[c.id] < 0 && c.area >= 2 && !c.terraza) {
    const lazos = contornosDeEstancia(etiqueta, c);
    resultado.sinAsignar.push({ planta, centro: [f2(xDe(c.sx / c.celdas)), f2(zDe(c.sz / c.celdas))], poligono: lazos.length ? simplificar(lazos[0], 0.04).map(([x, z]) => [f2(x), f2(z)]) : [], area: f2(c.area), motivo: `estancia sin puerta${c.fVivienda > 0.3 ? ' con pavimento de vivienda' : ''}` });
  }

  /* 4k. Imagen de comprobación */
  dibujar(planta, { pared: paredGorda, suelo, etiqueta, comps, viviendas, puertas: puertasPlanta, y0s: niveles[planta], rectDe, ids });
  log(`${planta} listo en ${((Date.now() - tP) / 1000).toFixed(1)} s`);
}

/* ─────────────────────────── Contornos y polígonos ─────────────────────────── */
/* Aristas de celda entre dentro/fuera, orientadas con el interior a la
   izquierda; se enlazan por vértice de inicio y se siguen hasta cerrar. */
function contornos(mascara, [i0, i1, j0, j1]) {
  const dentroM = (i, j) => dentro(i, j) && mascara[j * W + i] === 1;
  const aristas = new Map(); // clave vértice inicial → [ [vi, vj] destino, … ]
  const clave = (i, j) => i * (H + 2) + j;
  const add = (a, b, c, d) => { const k = clave(a, b); (aristas.get(k) || aristas.set(k, []).get(k)).push([c, d]); };
  for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) {
    if (!dentroM(i, j)) continue;
    if (!dentroM(i, j - 1)) add(i, j, i + 1, j);
    if (!dentroM(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!dentroM(i, j + 1)) add(i + 1, j + 1, i, j + 1);
    if (!dentroM(i - 1, j)) add(i, j + 1, i, j);
  }
  const lazos = [];
  while (aristas.size) {
    const [k0, lista] = aristas.entries().next().value;
    let cur = [Math.floor(k0 / (H + 2)), k0 % (H + 2)];
    const lazo = [cur]; let prevDir = null;
    for (let paso = 0; paso < 1e6; paso++) {
      const k = clave(cur[0], cur[1]); const salidas = aristas.get(k); if (!salidas || !salidas.length) break;
      let idx = 0;
      if (salidas.length > 1 && prevDir) { // vértice ambiguo (toque diagonal): girar a la derecha para no cruzar lazos
        let mejor = -Infinity;
        salidas.forEach((s, n) => { const d = [s[0] - cur[0], s[1] - cur[1]]; const cruz = prevDir[0] * d[1] - prevDir[1] * d[0]; if (-cruz > mejor) { mejor = -cruz; idx = n; } });
      }
      const sig = salidas.splice(idx, 1)[0]; if (!salidas.length) aristas.delete(k);
      prevDir = [sig[0] - cur[0], sig[1] - cur[1]];
      cur = sig;
      if (cur[0] === lazo[0][0] && cur[1] === lazo[0][1]) break;
      lazo.push(cur);
    }
    if (lazo.length >= 4) lazos.push(lazo.map(([i, j]) => [xDe(i), zDe(j)]));
  }
  return lazos;
}
function contornosDeEstancia(etiqueta, c) {
  const m = new Uint8Array(W * H); for (let j = c.j0; j <= c.j1; j++) for (let i = c.i0; i <= c.i1; i++) if (etiqueta[j * W + i] === c.id) m[j * W + i] = 1;
  return contornos(m, [c.i0, c.i1, c.j0, c.j1]).sort((a, b) => Math.abs(areaPoligono(b)) - Math.abs(areaPoligono(a)));
}
function areaPoligono(p) { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % n]; a += x0 * z1 - x1 * z0; } return a / 2; }
/* Fusiona colineales y aplica Douglas-Peucker (polígono cerrado: se parte por
   los dos vértices más alejados entre sí). */
function simplificar(p, eps) {
  const col = []; const n = p.length;
  for (let i = 0; i < n; i++) { const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n]; const cruz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cruz) > 1e-12) col.push(b); }
  if (col.length < 4) return col;
  let a = 0, b = 0, md = -1;
  for (let i = 0; i < col.length; i++) { const d = (col[i][0] - col[0][0]) ** 2 + (col[i][1] - col[0][1]) ** 2; if (d > md) { md = d; b = i; } }
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [x0, z0] = pts[0], [x1, z1] = pts[pts.length - 1]; const L = Math.hypot(x1 - x0, z1 - z0) || 1e-9;
    let mi = 0, mdist = -1;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((x1 - x0) * (z0 - pts[i][1]) - (x0 - pts[i][0]) * (z1 - z0)) / L; if (d > mdist) { mdist = d; mi = i; } }
    if (mdist <= eps) return [pts[0], pts[pts.length - 1]];
    const izq = dp(pts.slice(0, mi + 1)), der = dp(pts.slice(mi));
    return izq.slice(0, -1).concat(der);
  };
  const s1 = dp(col.slice(a, b + 1)), s2 = dp(col.slice(b).concat([col[a]]));
  return s1.slice(0, -1).concat(s2.slice(0, -1));
}

/* ─────────────────────────── Imagen de comprobación ─────────────────────────── */
function dibujar(planta, { pared, suelo, etiqueta, comps, viviendas, puertas, rectDe, ids }) {
  const png = new PNG({ width: W, height: H });
  const D = png.data;
  const pon = (i, j, r, g, b) => { if (!dentro(i, j)) return; const q = (j * W + i) * 4; D[q] = r; D[q + 1] = g; D[q + 2] = b; D[q + 3] = 255; };
  const mezcla = (i, j, r, g, b, a) => { if (!dentro(i, j)) return; const q = (j * W + i) * 4; D[q] = D[q] * (1 - a) + r * a; D[q + 1] = D[q + 1] * (1 - a) + g * a; D[q + 2] = D[q + 2] * (1 - a) + b * a; };
  const color = (k) => { const h = (k * 137.508) % 360, s = 0.55, l = 0.72; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const q = j * W + i;
    let rgb = [255, 255, 255];
    const e = etiqueta[q];
    if (e >= 0) { const c = comps[e]; if (c.comun) rgb = [215, 215, 215]; else if (c.terraza) rgb = [235, 225, 205]; else if (!c.exterior) rgb = [248, 248, 248]; }
    if (suelo[q] === 1 && e >= 0 && !comps[e].comun) rgb = [rgb[0] - 6, rgb[1] - 6, rgb[2] - 12];
    if (pared[q]) rgb = [0, 0, 0];
    pon(i, j, ...rgb);
  }
  viviendas.forEach((v, vi) => { if (!v.mascara) return; const [r, g, b] = color(vi); const [i0, i1, j0, j1] = v.caja; for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) if (v.mascara[j * W + i]) mezcla(i, j, r, g, b, 0.75); });
  // estancias sin dueño (huérfanas) en magenta claro
  for (const c of comps) if (!c.exterior && !c.comun && !c.terraza && !viviendas.some((v) => v.comps.has(c.id))) { for (let j = c.j0; j <= c.j1; j++) for (let i = c.i0; i <= c.i1; i++) if (etiqueta[j * W + i] === c.id) mezcla(i, j, 255, 120, 255, 0.6); }
  // contorno del polígono en el color oscuro
  const linea = (xa, za, xb, zb, rgb, dash = 0) => { const ia = (xa - GX0) / CELDA, ja = (za - GZ0) / CELDA, ib = (xb - GX0) / CELDA, jb = (zb - GZ0) / CELDA; const n = Math.ceil(Math.max(Math.abs(ib - ia), Math.abs(jb - ja))); for (let s = 0; s <= n; s++) { if (dash && Math.floor(s / dash) % 2) continue; pon(Math.floor(ia + (ib - ia) * s / n), Math.floor(ja + (jb - ja) * s / n), ...rgb); } };
  for (const v of viviendas) { const p = v.poligono || []; for (let k = 0; k < p.length; k++) { const a = p[k], b = p[(k + 1) % p.length]; linea(a[0], a[1], b[0], b[1], [120, 0, 0]); } }
  // rectángulos del layout (discontinuos)
  for (const id of ids) { const r = rectDe(id); linea(r.x0, r.z0, r.x1, r.z0, [90, 90, 90], 6); linea(r.x1, r.z0, r.x1, r.z1, [90, 90, 90], 6); linea(r.x1, r.z1, r.x0, r.z1, [90, 90, 90], 6); linea(r.x0, r.z1, r.x0, r.z0, [90, 90, 90], 6); }
  // cajones de corte
  for (const c of cajones) { linea(c.x0, c.z0, c.x1, c.z0, [170, 170, 240]); linea(c.x1, c.z0, c.x1, c.z1, [170, 170, 240]); linea(c.x1, c.z1, c.x0, c.z1, [170, 170, 240]); linea(c.x0, c.z1, c.x0, c.z0, [170, 170, 240]); }
  const punto = (x, z, r, rgb) => { const i = ci(x), j = cj(z); for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r * r) pon(i + di, j + dj, ...rgb); };
  {
    // vidrios de la planta: los que caen en la franja de suelo de su cajón
    const nivelesP = niveles[planta];
    for (const g of vidrios) { const p = plataformaDe(g.x, g.z); if (nivelesP[p].some((L) => g.y >= L - 0.2 && g.y <= L + 3.0)) punto(g.x, g.z, 2, [0, 150, 0]); }
  }
  if (etiquetasPDF && etiquetasPDF[planta]) for (const e of etiquetasPDF[planta]) { linea(e.x - 0.4, e.z, e.x + 0.4, e.z, [200, 0, 120]); linea(e.x, e.z - 0.4, e.x, e.z + 0.4, [200, 0, 120]); }
  for (const d of puertas) punto(d.centro[0], d.centro[1], d.tipo === 'Pm-1' ? 4 : 3, d.tipo === 'Pm-1' ? [220, 0, 0] : d.tipo === 'Pm-2' || d.tipo === 'Pm-3' ? [0, 60, 220] : [130, 130, 130]);
  const texto = (s, x, z, esc, rgb) => { let px = ci(x) - Math.floor(s.length * 6 * esc / 2), py = cj(z) - Math.floor(7 * esc / 2); for (const ch of s) { const gl = FUENTE[ch] || FUENTE['?']; for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (gl[r][c] === '1') for (let a = 0; a < esc; a++) for (let b = 0; b < esc; b++) pon(px + c * esc + a, py + r * esc + b, ...rgb); px += 6 * esc; } };
  for (const v of viviendas) { if (!v.poligono || !v.poligono.length) continue; const unit = v.id ? unitsById.get(v.id) : null; texto(v.id || '?', v.centro[0], v.centro[1] - 0.35, 2, [0, 0, 0]); if (unit) texto(`${Math.round(v.area)}/${Math.round(utilFicha.get(v.id)?.util ?? unit.supViv)}`, v.centro[0], v.centro[1] + 0.45, 1, [40, 40, 40]); }
  const ruta = path.join(DIR_PNG, `viviendas-${planta}.png`);
  fs.writeFileSync(ruta, PNG.sync.write(png));
  log(`→ ${ruta}`);
}

/* ─────────────────────────── 5. Salida ─────────────────────────── */
resultado.avisos = avisos;
resultado.marco = { descripcion: 'coordenadas del SketchUp (metros, Y arriba); poligono = [[x, z], …] en planta; y0/y1 = suelo y techo del prisma', celda: CELDA, cortes: 'data/cortes.json' };
fs.writeFileSync(path.join(RAIZ, 'data', 'viviendas_serenea.json'), JSON.stringify(resultado, null, 1));
const err = metricas.errores;
const media = err.length ? err.reduce((a, b) => a + b, 0) / err.length : 0;
log('─────────── resumen ───────────');
log('polígonos por planta:', JSON.stringify(metricas.poligonos));
log(`viviendas asignadas: ${metricas.asignadas} de ${units.length}; sin asignar: ${resultado.sinAsignar.length}`);
log(`error de área |polígono − supViv|/supViv: medio ${(media * 100).toFixed(1)} %, máximo ${(Math.max(0, ...err) * 100).toFixed(1)} %`);
log(`viviendas con error > 15 % (construida): ${metricas.mayor15.length}${metricas.mayor15.length ? ' → ' + metricas.mayor15.join('; ') : ''}`);
const eu = metricas.erroresUtil; const mediaU = eu.length ? eu.reduce((a, b) => a + b, 0) / eu.length : 0;
log(`error de área frente a la útil de las fichas (${eu.length} viviendas): medio ${(mediaU * 100).toFixed(1)} %, máximo ${(Math.max(0, ...eu) * 100).toFixed(1)} %`);
log(`viviendas con error > 15 % (útil): ${metricas.mayor15Util.length}${metricas.mayor15Util.length ? ' → ' + metricas.mayor15Util.join('; ') : ''}`);
log(`viviendas sin vidrio: ${metricas.sinVidrio.length}${metricas.sinVidrio.length ? ' → ' + metricas.sinVidrio.join(', ') : ''}`);
log(`avisos: ${avisos.length}`);
log('→ data/viviendas_serenea.json');
