/* ═══════════════════════════════════════════════════════════════
   make-icons.mjs — genera los iconos PNG de la app (marca UNIK repasos).

   No hay dependencias: se dibuja en un búfer RGBA y se codifica el PNG
   a mano (zlib de Node + CRC32). Se ejecuta a mano cuando cambie la
   marca; los PNG resultantes se versionan en assets/icons/.

     node tools/make-icons.mjs

   La marca es un cuadrado negro con el visto de repaso en el color de
   acento. Para los iconos «maskable» de Android el visto se mantiene
   dentro del 80 % central, que es la zona que sobrevive al recorte.
   ═══════════════════════════════════════════════════════════════ */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'assets', 'icons');

const INK = [17, 17, 18];
const ACCENT = [155, 143, 127]; // #9b8f7f

// ── CRC32 (tabla precalculada al vuelo) ───────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro «None»
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8 bits por canal
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Dibujo ────────────────────────────────────────────────────────
// Distancia de un punto al segmento AB: da trazos con extremos
// redondeados sin más que comparar contra el grosor.
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

/**
 * @param {number} size  lado en píxeles
 * @param {boolean} rounded  true → esquinas redondeadas y fondo transparente
 *   fuera del cuadrado (icono normal); false → sangre completa (maskable).
 */
function drawIcon(size, rounded) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size / 512; // todo se define sobre un lienzo de 512
  const radius = rounded ? 112 * s : 0;

  // Trazos del visto, en coordenadas de 512.
  const stroke = 46 * s;
  const A = [150 * s, 262 * s];
  const B = [222 * s, 336 * s];
  const C = [366 * s, 182 * s];

  // Muestreo 3×3 por píxel: suficiente para que los bordes no dentellen.
  const SUB = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inSquare = 0, inMark = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const px = x + (sx + 0.5) / SUB;
          const py = y + (sy + 0.5) / SUB;

          // Cuadrado con esquinas redondeadas.
          const qx = Math.max(radius - px, px - (size - radius), 0);
          const qy = Math.max(radius - py, py - (size - radius), 0);
          if (Math.hypot(qx, qy) <= radius || (qx === 0 && qy === 0)) inSquare++;

          const d = Math.min(
            distToSegment(px, py, A[0], A[1], B[0], B[1]),
            distToSegment(px, py, B[0], B[1], C[0], C[1]),
          );
          if (d <= stroke / 2) inMark++;
        }
      }
      const total = SUB * SUB;
      const aSquare = inSquare / total;
      const aMark = inMark / total;
      if (aSquare === 0) continue;

      // El visto se compone sobre el negro; el conjunto se recorta al cuadrado.
      const r = INK[0] * (1 - aMark) + ACCENT[0] * aMark;
      const g = INK[1] * (1 - aMark) + ACCENT[1] * aMark;
      const b = INK[2] * (1 - aMark) + ACCENT[2] * aMark;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(aSquare * 255);
    }
  }
  return encodePng(size, size, buf);
}

mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['icon-maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
];
for (const [name, size, rounded] of targets) {
  writeFileSync(join(OUT, name), drawIcon(size, rounded));
  console.log('escrito', name, `(${size}×${size})`);
}

// Favicon vectorial: el mismo dibujo, sin rasterizar.
writeFileSync(
  join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#111112"/>
  <path d="M150 262 L222 336 L366 182" fill="none" stroke="#9b8f7f"
        stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`,
);
console.log('escrito favicon.svg');
