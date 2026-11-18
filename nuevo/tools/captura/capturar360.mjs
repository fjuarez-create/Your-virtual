/* ═══════════════════════════════════════════════════════════════════════════
   capturar360.mjs — Panorámica 360 exacta desde el BIM, con sus pases.

   Conduce index.html?modo=interior360 (captura.js + equirect.js) con
   Playwright/Chromium y guarda, para el punto 360 de una estancia:
     <n>-color.png        equirectangular en color (luz neutra), PNG 8 bit
     <n>-prof24.png       profundidad radial en mm empaquetada en RGB (24 bit)
     <n>-normal.png       normales de mundo, RGB = n·0,5 + 0,5
     <n>-id.png           segmentación por clase (colores de equirect.js)
     <n>-plana-<dir>-{color,id}.png   vistas planas de referencia (perspectiva
                          directa, misma posición) para comprobar la reproyección
     <n>-color-<master>.png   máster de color (--master 8192), por franjas
     <n>-ventana-{id,prof24}.png  toma auxiliar a 1,25 m de la ventana (sus cotas)
     <n>-camara.json      cámara, luz, clases, puertas, direcciones, tiempos
   Lo convierte y comprueba procesar360.py.

   Uso (desde la raíz del repositorio, con el servidor ya levantado):
     python3 -m http.server 8793 --bind 127.0.0.1 &
     node nuevo/tools/captura/capturar360.mjs --salida /ruta/brutos \
          [--vivienda 238] [--estancia "Salón - comedor"] [--nombre base-238-salon]
          [--altura 1.6] [--cara 2048] [--ancho 4096] [--rumbo 0] [--muestras 3]
          [--pases color,profundidad,normal,id] [--entorno 1] [--master 8192]
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const args = process.argv.slice(2);
const opcion = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : def; };
const SALIDA = opcion('salida');
if (!SALIDA) { console.error('falta --salida <carpeta>'); process.exit(1); }
const URL_BASE = opcion('url', 'http://127.0.0.1:8793/nuevo/tools/captura/');
const VIVIENDA = opcion('vivienda', '238');
const ESTANCIA = opcion('estancia', 'Salón - comedor');
const NOMBRE = opcion('nombre', `base-${VIVIENDA}-salon`);
const ALTURA = +opcion('altura', '1.6');
const CARA = +opcion('cara', '2048');
const ANCHO = +opcion('ancho', '4096');
const RUMBO = +opcion('rumbo', '0');
const MUESTRAS = +opcion('muestras', '3');
const PASES = opcion('pases', 'color,profundidad,normal,id').split(',');
const ENTORNO = opcion('entorno', '1');
const MASTER = +opcion('master', '0');          // ancho de un color extra (p. ej. 8192), 0 = no
const CARA_MASTER = +opcion('cara-master', '3072');
fs.mkdirSync(SALIDA, { recursive: true });

const ARGS_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const ESPERA = 40 * 60 * 1000;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s]`, ...a);
const guardarPNG = (url, nombre) => fs.writeFileSync(path.join(SALIDA, nombre), Buffer.from(url.split(',')[1], 'base64'));

/* Rumbo (horario desde −z) y elevación de un punto visto desde la cámara. */
function direccionA(cam, [x, y, z]) {
  const dx = x - cam[0], dy = y - cam[1], dz = z - cam[2];
  const rumbo = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  const elevacion = Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
  return { rumbo: +rumbo.toFixed(2), elevacion: +elevacion.toFixed(2), distancia: +Math.hypot(dx, dy, dz).toFixed(3) };
}

const navegador = await playwright.chromium.launch({ args: ARGS_GL });
try {
  const p = await navegador.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  p.setDefaultTimeout(ESPERA);
  p.on('console', (m) => { if (m.type() === 'error') console.log('  [página]', m.text().slice(0, 400)); });
  p.on('pageerror', (e) => console.log('  [error de página]', e.message));
  await p.goto(`${URL_BASE}?modo=interior360&vivienda=${VIVIENDA}&entorno=${ENTORNO}`);
  await p.waitForFunction(() => window.__listo === true, null, { timeout: ESPERA, polling: 1000 });
  const estado = await p.evaluate(() => window.captura.estado);
  if (estado.etapa !== 'listo') throw new Error(`la página no cargó: ${estado.error}`);
  log('página lista', JSON.stringify(estado.tiempos), JSON.stringify(estado.mobiliario), JSON.stringify(estado.mallas));

  const camara = await p.evaluate(({ e, h }) => window.captura.camaraInterior({ estancia: e, altura: h }), { e: ESTANCIA, h: ALTURA });
  log('cámara', JSON.stringify(camara.posicion), `dentro de la estancia: ${camara.dentroDeEstancia}`, `altura libre ${camara.alturaLibre} m`);
  const luz = await p.evaluate(() => window.captura.interior.luz);
  const puertas = await p.evaluate(() => window.captura.puertasInterior());

  /* Direcciones de comprobación, desde el modelo: la ventana (centro del
     vidrio de la estancia), la cocina (frente de la encimera), la entrada
     (puerta de la vivienda) y el pasillo (puerta al distribuidor). */
  const dirs = await p.evaluate(({ cam }) => {
    const c = window.captura, T = c.modulos.THREE;
    const out = {};
    /* vidrios a menos de 6 m de la cámara, a su altura */
    const vidrios = [];
    c.modulos.scene.traverse((o) => {
      if (!o.isMesh || !/^vidrio__/.test(o.name)) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const ctr = b.getCenter(new T.Vector3());
      if (Math.hypot(ctr.x - cam[0], ctr.z - cam[2]) < 6 && b.min.y < cam[1] + 1.5 && b.max.y > cam[1] - 1.8) vidrios.push({ nombre: o.name, min: b.min.toArray(), max: b.max.toArray() });
    });
    out.vidrios = vidrios;
    return out;
  }, { cam: camara.posicion });
  /* Huecos de puerta. Entrada: el más cercano a `entrada` de
     viviendas_serenea.json. Pasillo: el que está a la vez en el borde de la
     estancia y en el del distribuidor (polígonos de vivienda-<id>.json). */
  const viv = JSON.parse(fs.readFileSync(path.resolve('data/viviendas_serenea.json'), 'utf8')).viviendas[VIVIENDA];
  const ficha = JSON.parse(fs.readFileSync(path.resolve(`nuevo/estilos/img/vivienda-${VIVIENDA}.json`), 'utf8'));
  const T = ficha.transformacion;
  const aMundo = (pol) => pol.map(([px, py]) => [(px - T.c) / T.a, (py - T.d) / T.b]);
  const borde = (pol, x, z) => {
    let d = Infinity;
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      const [ax, az] = pol[j], [bx, bz] = pol[i], ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez;
      const t = l ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l)) : 0;
      d = Math.min(d, Math.hypot(x - ax - t * ex, z - az - t * ez));
    }
    return d;
  };
  const estanciaFicha = ficha.estancias.find((e) => e.nombre === ESTANCIA);
  const polEstancia = aMundo((estanciaFicha.poligono ? estanciaFicha : ficha.estancias.find((e) => e.poligono && e.estanciaFicha === estanciaFicha.estanciaFicha)).poligono);
  const distribuidor = [...(ficha.sinPunto || []), ...ficha.estancias].find((e) => /distribuidor|pasillo/i.test(e.nombre) && e.poligono);
  const vanos = puertas.vanos;
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const entrada = vanos.slice().sort((a, b) => dist2(a.centro, [viv.entrada[0], 0, viv.entrada[1]]) - dist2(b.centro, [viv.entrada[0], 0, viv.entrada[1]]))[0];
  /* Vidrios de la estancia: los que están a menos de 0,5 m de su contorno;
     la ventana de comprobación es el grupo más cercano a la cámara. */
  const vid = dirs.vidrios.map((v) => ({ ...v, c: [(v.min[0] + v.max[0]) / 2, (v.min[1] + v.max[1]) / 2, (v.min[2] + v.max[2]) / 2] }))
    .filter((v) => borde(polEstancia, v.c[0], v.c[2]) < 0.5)
    .sort((a, b) => Math.hypot(a.c[0] - camara.posicion[0], a.c[2] - camara.posicion[2]) - Math.hypot(b.c[0] - camara.posicion[0], b.c[2] - camara.posicion[2]));
  const ventana = vid.length ? vid.filter((v) => Math.hypot(v.c[0] - vid[0].c[0], v.c[2] - vid[0].c[2]) < 0.3) : [];
  const cv = ventana.length ? [0, 1, 2].map((k) => ventana.reduce((s, v) => s + v.c[k], 0) / ventana.length) : null;
  const direcciones = {};
  if (cv) direcciones.ventana = { ...direccionA(camara.posicion, [cv[0], camara.posicion[1], cv[2]]), punto: cv.map((n) => +n.toFixed(3)), vidrios: ventana.map((v) => ({ nombre: v.nombre, min: v.min.map((n) => +n.toFixed(3)), max: v.max.map((n) => +n.toFixed(3)) })) };
  /* Cocina: centroide de la encimera (DEKTON) que cae en la estancia. */
  const mob = await p.evaluate(({ pol, y0 }) => window.captura.mobiliarioEn({ poligono: pol, y0: y0 - 0.2, y1: y0 + 2.6 }), { pol: polEstancia, y0: camara.sueloTerminado });
  const encimera = Object.entries(mob).find(([k]) => /DEKTON|encimera/i.test(k));
  if (encimera) direcciones.cocina = { ...direccionA(camara.posicion, [encimera[1].x, camara.posicion[1], encimera[1].z]), punto: [encimera[1].x, encimera[1].z], material: encimera[0], caja: encimera[1].caja };
  if (entrada) direcciones.entrada = { ...direccionA(camara.posicion, [entrada.centro[0], camara.posicion[1], entrada.centro[2]]), punto: entrada.centro };
  if (distribuidor) {
    const polDist = aMundo(distribuidor.poligono);
    const pas = vanos.map((v) => ({ v, d: borde(polEstancia, v.centro[0], v.centro[2]) + borde(polDist, v.centro[0], v.centro[2]) })).sort((a, b) => a.d - b.d)[0];
    if (pas) direcciones.pasillo = { ...direccionA(camara.posicion, [pas.v.centro[0], camara.posicion[1], pas.v.centro[2]]), punto: pas.v.centro, distanciaABordes: +pas.d.toFixed(3) };
  }
  log('direcciones', JSON.stringify(Object.fromEntries(Object.entries(direcciones).map(([k, v]) => [k, v.rumbo]))));

  const tiempos = {};
  for (const tipo of PASES) {
    const r = await p.evaluate(({ tipo, cara, ancho, rumbo, muestras }) => window.captura.panoramica360(tipo, { cara, ancho, rumbo, muestras }),
      { tipo, cara: CARA, ancho: ANCHO, rumbo: RUMBO, muestras: MUESTRAS });
    const sufijo = { color: 'color', profundidad: 'prof24', normal: 'normal', id: 'id' }[tipo];
    guardarPNG(r.url, `${NOMBRE}-${sufijo}.png`);
    tiempos[tipo] = r.tiempos;
    log(`  ${tipo}`, JSON.stringify(r.tiempos));
  }
  if (MASTER) {
    const r = await p.evaluate(({ cara, ancho, rumbo, muestras }) => window.captura.panoramica360('color', { cara, ancho, rumbo, muestras }),
      { cara: CARA_MASTER, ancho: MASTER, rumbo: RUMBO, muestras: 2 });
    guardarPNG(r.url, `${NOMBRE}-color-${MASTER}.png`);
    tiempos[`color${MASTER}`] = r.tiempos;
    log(`  color ${MASTER}`, JSON.stringify(r.tiempos));
  }

  /* Vistas planas de referencia: perspectiva directa, sin pasar por el cubo. */
  const planas = [];
  for (const [n, d] of Object.entries(direcciones)) {
    for (const tipo of ['color', 'id']) {
      const url = await p.evaluate(({ tipo, rumbo }) => window.captura.vistaPlana360(tipo, { rumbo, elevacion: 0, fov: 75, ancho: 1200, alto: 800 }), { tipo, rumbo: d.rumbo });
      guardarPNG(url, `${NOMBRE}-plana-${n}-${tipo}.png`);
    }
    planas.push({ nombre: n, rumbo: d.rumbo, elevacion: 0, fov: 75, ancho: 1200, alto: 800 });
  }
  log('vistas planas', planas.map((v) => v.nombre).join(', '));

  /* Ventana medida de cerca: desde el punto 360 el sofá tapa el pie de la
     ventana, así que para sus cotas se hace una toma auxiliar (id +
     profundidad) a 1,25 m del vidrio, por dentro, a +1,0 m del suelo. */
  let ventanaCerca = null;
  if (cv && ventana.length) {
    const ext = [0, 2].map((k) => Math.max(...ventana.map((v) => v.max[k])) - Math.min(...ventana.map((v) => v.min[k])));
    const eje = ext[0] < ext[1] ? 0 : 2;                     // eje fino = normal del paño
    const signo = Math.sign(camara.posicion[eje] - cv[eje]) || 1;
    const pos = [cv[0], camara.sueloTerminado + 1.0, cv[2]];
    pos[eje] += signo * 1.25;
    const cam2 = await p.evaluate((pos) => window.captura.camaraInterior({ posicion: pos }), pos);
    for (const tipo of ['id', 'profundidad']) {
      const r = await p.evaluate((t) => window.captura.panoramica360(t, { cara: 1024, ancho: 2048, rumbo: 0 }), tipo);
      guardarPNG(r.url, `${NOMBRE}-ventana-${tipo === 'id' ? 'id' : 'prof24'}.png`);
    }
    ventanaCerca = { camara: cam2, eje: eje === 0 ? 'x' : 'z', centro: cv, ancho: 2048, rumboCentro: 0 };
    await p.evaluate(({ e, h }) => window.captura.camaraInterior({ estancia: e, altura: h }), { e: ESTANCIA, h: ALTURA });
    log('ventana medida de cerca desde', JSON.stringify(pos.map((n) => +n.toFixed(3))));
  }

  const clases = await p.evaluate(() => window.captura.CLASES);
  const vidriosEstancia = vid.map((v) => ({ nombre: v.nombre, min: v.min.map((n) => +n.toFixed(3)), max: v.max.map((n) => +n.toFixed(3)) }));
  const json = {
    nombre: NOMBRE, vivienda: VIVIENDA, estancia: ESTANCIA,
    descripcion: 'Panorámica equirectangular 2:1 desde el BIM (three.js, CubeCamera de 6 caras + reproyección propia). Coordenadas del SketchUp: metros, Y arriba, norte del modelo = −z.',
    convencion: {
      rumbo: 'grados, horario visto desde arriba, desde el norte del modelo (−z): 0 = −z, 90 = +x, 180 = +z, 270 = −x',
      columna: 'u = 0,5 + (rumbo − rumboCentro)/360 (u = 0 izquierda, 1 derecha); costura en rumboCentro + 180',
      fila: 'v = 0,5 − elevación/180 (v = 0 arriba = cenit)',
      direccion: '(sin β·cos φ, sin φ, −cos β·cos φ) en el mundo de three',
      nortes: 'el norte real está 12,55° en sentido horario desde el −z del modelo (PRODUCCION_IMAGENES §2): rumbo de brújula = rumbo del modelo − 12,55',
    },
    rumboCentro: RUMBO, ancho: ANCHO, alto: ANCHO / 2, cara: CARA, muestras: MUESTRAS, entorno: ENTORNO === '1',
    camara, luz, direcciones, vidriosEstancia, ventanaCerca, puertas, planas, clases, tiempos,
    estadoPagina: await p.evaluate(() => window.captura.estado),
  };
  fs.writeFileSync(path.join(SALIDA, `${NOMBRE}-camara.json`), JSON.stringify(json, null, 1));
  await p.close();
} finally {
  await navegador.close();
}
log('hecho');
