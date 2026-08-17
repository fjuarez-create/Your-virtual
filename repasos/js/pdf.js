/* ═══════════════════════════════════════════════════════════════
   pdf.js — hoja de repasos en PDF para pegar en la puerta.

   El PDF se escribe a mano, sin librerías: solo texto y rectángulos con
   las tipografías Helvetica que todo lector de PDF trae de serie. Eso
   deja el fichero en unos pocos kilobytes y evita cargar 200 KB de
   dependencia en el móvil de obra.

   El texto va en Latin-1 (WinAnsiEncoding), que cubre todas las tildes,
   la eñe y los signos de apertura del castellano.
   ═══════════════════════════════════════════════════════════════ */

import { estado } from './catalog.js';

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 48;

/* Anchos de Helvetica en milésimas de punto. Con ellos las líneas se
   parten donde toca en vez de salirse del papel. */
const ANCHOS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584, '¿': 611, '¡': 333, '·': 278,
};
for (const d of '0123456789') ANCHOS[d] = 556;

function anchoTexto(texto, tam, negrita = false) {
  let total = 0;
  for (const c of texto) total += ANCHOS[c] ?? 556;
  // La negrita de Helvetica es algo más ancha; con este factor la
  // partición de líneas no se queda corta.
  return (total / 1000) * tam * (negrita ? 1.06 : 1);
}

/** Parte un texto en líneas que quepan en `ancho`. */
function partir(texto, ancho, tam, negrita = false) {
  const lineas = [];
  for (const parrafo of String(texto).split('\n')) {
    let actual = '';
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? actual + ' ' + palabra : palabra;
      if (anchoTexto(prueba, tam, negrita) <= ancho) {
        actual = prueba;
      } else {
        if (actual) lineas.push(actual);
        actual = palabra;
      }
    }
    lineas.push(actual);
  }
  return lineas.length ? lineas : [''];
}

/* ─── Escritura del fichero ───────────────────────────────────── */
function escapar(texto) {
  return String(texto).replace(/[\\()]/g, (c) => '\\' + c);
}

/** Pasa a Latin-1; lo que no quepa se sustituye por algo parecido. */
function latin1(texto) {
  const equivalentes = { '—': '-', '–': '-', '«': '"', '»': '"', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...' };
  return String(texto)
    .replace(/[—–«»“”‘’…]/g, (c) => equivalentes[c] || c)
    .split('')
    .map((c) => (c.charCodeAt(0) <= 255 ? c : '?'))
    .join('');
}

class Pagina {
  constructor() { this.ops = []; }
  texto(x, y, cadena, { tam = 11, negrita = false, gris = 0 } = {}) {
    this.ops.push(
      'BT',
      `${gris} g`,
      `/${negrita ? 'F2' : 'F1'} ${tam} Tf`,
      `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
      `(${escapar(latin1(cadena))}) Tj`,
      'ET',
    );
  }
  linea(x1, y1, x2, y2, grosor = 0.8, gris = 0) {
    this.ops.push(`${gris} G`, `${grosor} w`, `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }
  recuadro(x, y, ancho, alto, grosor = 1, gris = 0.2) {
    this.ops.push(`${gris} G`, `${grosor} w`, `${x.toFixed(2)} ${y.toFixed(2)} ${ancho} ${alto} re S`);
  }
  get contenido() { return this.ops.join('\n'); }
}

function ensamblar(paginas) {
  const objetos = [];
  const idPaginas = 2;
  const idFuente = 3;
  const idFuenteNegrita = 4;
  const primeraPagina = 5;

  objetos[1] = `<< /Type /Catalog /Pages ${idPaginas} 0 R >>`;
  const kids = paginas.map((_, i) => `${primeraPagina + i * 2} 0 R`).join(' ');
  objetos[idPaginas] = `<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`;
  objetos[idFuente] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objetos[idFuenteNegrita] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  paginas.forEach((pag, i) => {
    const idPag = primeraPagina + i * 2;
    const idContenido = idPag + 1;
    objetos[idPag] = `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${A4.ancho} ${A4.alto}] `
      + `/Resources << /Font << /F1 ${idFuente} 0 R /F2 ${idFuenteNegrita} 0 R >> >> /Contents ${idContenido} 0 R >>`;
    const flujo = pag.contenido;
    objetos[idContenido] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const posiciones = [];
  for (let i = 1; i < objetos.length; i++) {
    if (!objetos[i]) continue;
    posiciones[i] = pdf.length;
    pdf += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
  }
  const inicioXref = pdf.length;
  const total = objetos.length;
  pdf += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) {
    pdf += `${String(posiciones[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;

  // Cada carácter es un byte: el texto ya está en Latin-1 y el resto es ASCII.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}

/* ─── La hoja de la puerta ────────────────────────────────────── */
/**
 * Genera el PDF de una lista de repaso: una casilla y una línea por
 * tarea, en cuerpo grande, para imprimir y pegar en la puerta de la
 * vivienda. Sin fotos: aquí manda la legibilidad a un metro de distancia.
 *
 * @returns {Blob} el PDF listo para descargar o compartir
 */
export function hojaDePuerta({ vivienda, promocion, fecha, autor, tareas }) {
  const anchoUtil = A4.ancho - MARGEN * 2;
  const paginas = [];
  let pag = new Pagina();
  let y = A4.alto - MARGEN;

  const cabecera = (primera) => {
    if (primera) {
      pag.texto(MARGEN, y, 'UNIK REPASOS', { tam: 9, negrita: true, gris: 0.45 });
      y -= 30;
      pag.texto(MARGEN, y, vivienda, { tam: 30, negrita: true });
      y -= 20;
      pag.texto(MARGEN, y, promocion, { tam: 13, gris: 0.35 });
      y -= 18;
      pag.texto(MARGEN, y, `Inspección ${fecha}  ·  ${autor}`, { tam: 11, gris: 0.45 });
      y -= 14;
      pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 1.6);
      y -= 26;
    } else {
      pag.texto(MARGEN, y, `${vivienda}  ·  ${promocion}`, { tam: 10, negrita: true, gris: 0.4 });
      y -= 12;
      pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 0.8, 0.6);
      y -= 22;
    }
  };
  cabecera(true);

  const TAM = 12;
  const INTERLINEA = 15.5;
  const SANGRIA = 44;          // hueco de la casilla y el número

  tareas.forEach((t, i) => {
    const lineas = partir(t.texto || 'Sin descripción', anchoUtil - SANGRIA, TAM);
    const altoBloque = Math.max(lineas.length * INTERLINEA, 24) + 14;

    // Salto de página cuando ya no cabe el bloque entero.
    if (y - altoBloque < MARGEN + 26) {
      paginas.push(pag);
      pag = new Pagina();
      y = A4.alto - MARGEN;
      cabecera(false);
    }

    // Casilla para marcar a bolígrafo en la propia obra.
    pag.recuadro(MARGEN, y - 11.5, 13, 13, 1.1, 0.25);
    pag.texto(MARGEN + 22, y, `${i + 1}.`, { tam: TAM, negrita: true, gris: 0.35 });
    lineas.forEach((linea, n) => {
      pag.texto(MARGEN + SANGRIA, y - n * INTERLINEA, linea, { tam: TAM });
    });

    y -= lineas.length * INTERLINEA + 4;
    // El nombre sale del catálogo: esta hoja se imprime y se manda por
    // WhatsApp, y poner «RESUELTA» debajo de una tarea rechazada sería
    // decir en papel lo contrario de lo que pasó.
    if (t.estado && t.estado !== 'pendiente') {
      pag.texto(MARGEN + SANGRIA, y, estado(t.estado).nombre.toUpperCase(),
        { tam: 8.5, negrita: true, gris: 0.5 });
      y -= 11;
    }
    y -= 10;
    pag.linea(MARGEN, y, A4.ancho - MARGEN, y, 0.5, 0.82);
    y -= 16;
  });

  paginas.push(pag);

  // Pie con la numeración, ya sabiendo cuántas páginas hay.
  paginas.forEach((p, i) => {
    p.texto(MARGEN, MARGEN - 14,
      `${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}  ·  Página ${i + 1} de ${paginas.length}`,
      { tam: 8.5, gris: 0.55 });
  });

  return ensamblar(paginas);
}

/** Nombre de fichero legible y sin caracteres problemáticos. */
export function nombreDeFichero(vivienda, fecha) {
  const limpio = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `repasos-${limpio(vivienda)}-${limpio(fecha)}.pdf`.toLowerCase();
}
