/* ═══════════════════════════════════════════════════════════════
   traer-iconos.mjs — genera js/iconos.js a partir de Phosphor Icons.

   Descarga los SVG originales del repositorio de Phosphor (MIT) y
   escribe un módulo con sus trazados, para no depender de ningún CDN:
   la app tiene que arrancar entera sin red.

       node tools/traer-iconos.mjs

   Solo se traen los iconos que se usan de verdad. Para añadir uno,
   se pone aquí su nombre de Phosphor y se vuelve a ejecutar.
   ═══════════════════════════════════════════════════════════════ */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PESO = 'regular';   // el trazo de Phosphor que encaja con la app
const BASE = `https://raw.githubusercontent.com/phosphor-icons/core/main/assets/${PESO}`;

/** nombre en la app → nombre en Phosphor */
const ICONOS = {
  // Navegación
  inicio: 'squares-four',      // resumen, NO una casita
  listas: 'list-checks',
  viviendas: 'house-line',
  gear: 'gear-six',
  arrowLeft: 'arrow-left',
  arrowRight: 'arrow-right',
  chevron: 'caret-right',

  // Captura y material
  camera: 'camera',
  image: 'image',
  video: 'video-camera',
  mic: 'microphone',
  play: 'play',
  stop: 'stop',

  // Acciones
  plus: 'plus',
  check: 'check',
  x: 'x',
  trash: 'trash',
  edit: 'pencil-simple',
  copy: 'copy',
  share: 'export',
  download: 'download-simple',
  refresh: 'arrows-clockwise',
  search: 'magnifying-glass',

  // Estado y avisos
  cloud: 'cloud-check',
  cloudOff: 'cloud-slash',
  alert: 'warning',
  rechazo: 'x-circle',
  hilo: 'chat-circle-text',

  // Objetos
  clipboard: 'clipboard-text',
  documento: 'file-pdf',
  building: 'buildings',
  clock: 'clock-counter-clockwise',
  user: 'user',
  users: 'users-three',
  logout: 'sign-out',
  key: 'key',
  list: 'list',
};

function bajar(nombre) {
  // curl y no fetch: respeta el proxy del entorno sin configuración extra.
  return execFileSync('curl', ['-sS', '--fail', '--max-time', '25', `${BASE}/${nombre}.svg`], {
    encoding: 'utf8',
  });
}

/** Se queda solo con el contenido interno del <svg>, ya normalizado. */
function trazados(svg, nombre) {
  const dentro = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');
  const limpio = dentro
    .replace(/\s*<rect[^>]*fill="none"[^>]*\/>/g, '')   // el rect de recorte no pinta
    .replace(/fill="currentColor"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpio.includes('<path')) {
    throw new Error(`El icono ${nombre} no trae ningún trazado.`);
  }
  return limpio;
}

const entradas = [];
for (const [clave, nombre] of Object.entries(ICONOS)) {
  process.stdout.write(`  ${clave.padEnd(12)} ← ${nombre}`);
  const svg = bajar(nombre);
  entradas.push([clave, nombre, trazados(svg, nombre)]);
  process.stdout.write('  ✓\n');
}

const cuerpo = entradas
  .map(([clave, nombre, d]) => `  // ${nombre}\n  ${clave}: '${d.replace(/'/g, "\\'")}',`)
  .join('\n');

const modulo = `/* ═══════════════════════════════════════════════════════════════
   iconos.js — GENERADO. No editar a mano.

   Trazados de Phosphor Icons (peso «${PESO}»), licencia MIT.
   https://phosphoricons.com · https://github.com/phosphor-icons/core

   Se regenera con:  node tools/traer-iconos.mjs
   Van embebidos y no en un CDN porque la app tiene que abrir sin red.
   ═══════════════════════════════════════════════════════════════ */

/** Todos los iconos comparten el lienzo de 256×256 de Phosphor. */
export const LIENZO = '0 0 256 256';

export const TRAZADOS = {
${cuerpo}
};
`;

writeFileSync(join(AQUI, '..', 'js', 'iconos.js'), modulo);
console.log(`\n  ${entradas.length} iconos escritos en js/iconos.js`);
