/* ═══════════════════════════════════════════════════════════════════════════
   capturar.mjs — Conduce index.html (captura.js) con Playwright/Chromium sin
   pantalla y guarda, por cada vista de vistas.json, la imagen, sus máscaras
   y la descripción exacta de la cámara.

   Uso (desde la raíz del repositorio, con el servidor ya levantado):
     python3 -m http.server 8793 --bind 127.0.0.1 &
     node nuevo/tools/captura/capturar.mjs --salida /ruta/de/trabajo \
          [--url http://127.0.0.1:8793/nuevo/tools/captura/] [--solo conjunto,edificio]
          [--vistas nuevo/tools/captura/vistas.json]

   Salida por vista <n>:
     <n>.png                    imagen (post del visor: GTAO, SSR, bloom, SMAA, grado)
     <n>-mascara-plantas.png    plantas lógicas (1 rojo, 2 verde, 3 azul, 4 amarillo,
                                resto del edificio blanco, lo demás negro)
     <n>-mascara-edificios.png  Apolo rojo, otros edificios SERENEA verde
     <n>-mascara-viviendas.png  prisma de cada vivienda, R = índice + 1
     <n>-camara.json            cámara, matrices, transformación (cenitales),
                                límites de nivel, orden de las viviendas, datos de
                                estancias (sección y mobiliario)
   Lo procesa después procesar.py.

   WebGL va por SwiftShader (CPU): una imagen de 2400 px tarda del orden de un
   minuto. Los tiempos de espera son largos a propósito.
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opcion = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : def; };
const SALIDA = opcion('salida');
const URL_BASE = opcion('url', 'http://127.0.0.1:8793/nuevo/tools/captura/');
const VISTAS = JSON.parse(fs.readFileSync(opcion('vistas', path.join(AQUI, 'vistas.json')), 'utf8'));
const SOLO = opcion('solo') ? new Set(opcion('solo').split(',')) : null;
if (!SALIDA) { console.error('falta --salida <carpeta>'); process.exit(1); }
fs.mkdirSync(SALIDA, { recursive: true });

const ARGS_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const ESPERA = 20 * 60 * 1000;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s]`, ...a);
const guardarPNG = (url, nombre) => fs.writeFileSync(path.join(SALIDA, nombre), Buffer.from(url.split(',')[1], 'base64'));

async function abrir(navegador, modo, planta) {
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  pagina.setDefaultTimeout(ESPERA);
  pagina.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /\[captura\]/.test(t)) console.log('  [página]', t.slice(0, 400)); });
  pagina.on('pageerror', (e) => console.log('  [error de página]', e.message));
  await pagina.goto(`${URL_BASE}?modo=${modo}${planta ? `&planta=${planta}` : ''}`);
  await pagina.waitForFunction(() => window.__listo === true, null, { timeout: ESPERA, polling: 1000 });
  const estado = await pagina.evaluate(() => window.captura.estado);
  if (estado.etapa !== 'listo') throw new Error(`la página no cargó: ${estado.error}`);
  log(`página ${modo}${planta ? ` (${planta})` : ''} lista`, JSON.stringify(estado.tiempos), JSON.stringify(estado.mobiliario || estado.mallas));
  return pagina;
}

async function capturar(pagina, v) {
  const tv = Date.now();
  const camara = await pagina.evaluate((v) => {
    const c = window.captura;
    if (v.fondo) c.setFondo(v.fondo);
    if (v.sol) c.setSol(v.sol);
    const d = v.camara.s ? c.camaraCenital(v.camara) : c.camaraPerspectiva(v.camara);
    if (v.sombras) c.setAlcanceSombras(v.sombras);
    return d;
  }, v);
  guardarPNG(await pagina.evaluate((n) => window.captura.renderizar({ fotogramas: n }), v.fotogramas || 3), `${v.nombre}.png`);
  log(`  ${v.nombre}.png (${((Date.now() - tv) / 1000).toFixed(0)} s)`);
  const extra = { especificacion: v };
  for (const m of v.mascaras || []) {
    if (m === 'plantas') {
      const r = await pagina.evaluate(() => window.captura.mascaraPlantas());
      guardarPNG(r.url, `${v.nombre}-mascara-plantas.png`);
      extra.limitesNivel = r.limites;
    } else if (m === 'edificios') {
      const r = await pagina.evaluate(() => window.captura.mascaraEdificios());
      guardarPNG(r.url, `${v.nombre}-mascara-edificios.png`);
      extra.gruposSerenea = r.grupos;
    } else if (m === 'viviendas') {
      guardarPNG(await pagina.evaluate((ids) => window.captura.mascaraViviendas(ids), v.viviendas), `${v.nombre}-mascara-viviendas.png`);
      extra.ordenViviendas = v.viviendas;
    }
    log(`  máscara ${m}`);
  }
  if (v.estancias) {
    extra.estancias = await pagina.evaluate(async ({ id, alturas }) => {
      const viv = (await (await fetch('data/viviendas_serenea.json')).json()).viviendas[id];
      const xs = viv.poligono.map((p) => p[0]), zs = viv.poligono.map((p) => p[1]);
      const caja = { x0: Math.min(...xs) - 0.6, x1: Math.max(...xs) + 0.6, z0: Math.min(...zs) - 0.6, z1: Math.max(...zs) + 0.6 };
      const secciones = {};
      for (const dy of alturas) secciones[dy] = window.captura.seccion({ y: viv.y0 + dy, ...caja });
      const mobiliario = window.captura.mobiliarioEn({ poligono: viv.poligono, y0: viv.y0 - 0.2, y1: viv.y0 + 2.6, triangulos: true });
      return { id, caja, y0: viv.y0, secciones, mobiliario };
    }, v.estancias);
    log(`  datos de estancias de ${v.estancias.id}`);
  }
  fs.writeFileSync(path.join(SALIDA, `${v.nombre}-camara.json`), JSON.stringify({ ...camara, ...extra }, null, 1));
}

const navegador = await playwright.chromium.launch({ args: ARGS_GL });
try {
  const exteriores = VISTAS.exterior.filter((v) => !SOLO || SOLO.has(v.nombre));
  if (exteriores.length) {
    const p = await abrir(navegador, 'exterior');
    for (const v of exteriores) await capturar(p, v);
    await p.close();
  }
  const porPlanta = new Map();
  for (const v of VISTAS.planta) if (!SOLO || SOLO.has(v.nombre)) porPlanta.set(v.planta, [...(porPlanta.get(v.planta) || []), v]);
  for (const [planta, vistas] of porPlanta) {
    const p = await abrir(navegador, 'planta', planta);
    for (const v of vistas) await capturar(p, v);
    await p.close();
  }
} finally {
  await navegador.close();
}
log('hecho');
