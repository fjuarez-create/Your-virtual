/* node --test tools/rendimiento.test.mjs
   Comprueba la lógica y los destinos reales de Three sin dibujar ni usar
   una GPU. No sustituye la comparación visual ni la medición de FPS. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { crearControlResolucion } from '../new/js/visor/rendimiento.js';

const raiz = new URL('../', import.meta.url);
const html = readFileSync(new URL('new/index.html', raiz), 'utf8');
const mapa = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
registerHooks({
  resolve(nombre, contexto, siguiente) {
    const clave = Object.keys(mapa).sort((a, b) => b.length - a.length)
      .find((k) => k === nombre || (k.endsWith('/') && nombre.startsWith(k)));
    if (clave) nombre = new URL((mapa[clave] + nombre.slice(clave.length)).replace(/^\//, ''), raiz).href;
    return siguiente(nombre, contexto);
  },
});
// SMAA reserva sus dos imágenes, pero en estas pruebas no las decodifica.
global.Image = class Image {};
const THREE = await import('three');
const { crearPost } = await import('../new/js/visor/post.js');

function avanzar(control, fps, segundos, opciones = { moviendo: true }) {
  for (let i = 0; i < fps * segundos; i++) control.update(1 / fps, opciones);
}

test('un equipo lento reduce resolución sin salir de sus límites', () => {
  const cambios = [];
  const c = crearControlResolucion({ alCambiar: (r) => cambios.push(r) });
  avanzar(c, 25, 8);
  assert.equal(c.estado.actual, 0.75);
  assert.ok(cambios.length <= 6, 'no se deben reasignar buffers en cada fotograma');
  assert.ok(cambios.every((r) => r >= 0.75 && r <= 1.5));
});

test('al parar vuelve el detalle completo y al mover recuerda lo aprendido', () => {
  const c = crearControlResolucion();
  avanzar(c, 25, 3);
  const aprendida = c.estado.actual;
  c.update(1 / 60, { moviendo: false });
  assert.equal(c.estado.actual, 1.5);
  c.update(1 / 60, { moviendo: true });
  assert.equal(c.estado.actual, aprendida);
});

test('el rendimiento sostenido permite recuperar calidad gradualmente', () => {
  const c = crearControlResolucion();
  avanzar(c, 25, 8);
  avanzar(c, 60, 1);
  assert.equal(c.estado.actual, 0.75, 'una ventana rápida no basta');
  avanzar(c, 60, 20);
  assert.equal(c.estado.actual, 1.5);
});

test('carga, pausas y valores inválidos no degradan la calidad', () => {
  const c = crearControlResolucion();
  avanzar(c, 20, 5, { moviendo: true, medir: false });
  for (const dt of [10, 0.2, NaN, Infinity, -1, 0]) c.update(dt, { moviendo: true });
  assert.equal(c.estado.actual, 1.5);
});

test('el perfil móvil y los cambios manuales respetan el techo', () => {
  const c = crearControlResolucion({ maximo: 1 });
  avanzar(c, 25, 5);
  c.update(1 / 60, { moviendo: false });
  assert.equal(c.estado.actual, 1);
  c.setLimites(0.75, 0.6);
  avanzar(c, 25, 5);
  assert.equal(c.estado.actual, 0.6);
});

function crearContexto({ movil = false } = {}) {
  let ratio = movil ? 1 : 1.5;
  return {
    renderer: {
      getPixelRatio: () => ratio,
      setPixelRatio: (r) => { ratio = r; },
      getSize: (v) => v.set(800, 600),
    },
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(45, 4 / 3, 0.5, 4200),
    calidad: movil ? 'media' : 'alta', capas: { normal: 0, cartelas: 1 },
    on() {},
  };
}

test('escritorio conserva AO y SMAA sin reservar el efecto SSR desactivado', () => {
  const post = crearPost(crearContexto(), null);
  assert.equal(post.ssr, null);
  assert.ok(post.gtao && post.smaa && post.bokeh && post.bloom);
  assert.equal(post.fxaa, null);
  assert.equal(post.composer.renderTarget1.width, 1200);
  assert.equal(post.composer.renderTarget1.height, 900);
  post.dispose();
});

test('móvil tiene FXAA después de la salida sin reservar las pasadas caras', () => {
  const ctx = crearContexto({ movil: true });
  const post = crearPost(ctx, null, { ligero: true });
  for (const nombre of ['gtao', 'ssr', 'smaa', 'bokeh', 'desenfoque']) assert.equal(post[nombre], null);
  assert.equal(post.composer.passes.at(-1), post.fxaa);
  assert.equal(post.fxaa.uniforms.resolution.value.x, 1 / 800);
  ctx.renderer.setPixelRatio(0.75);
  post.setTamano(800, 600);
  assert.equal(post.fxaa.uniforms.resolution.value.x, 1 / 600);
  assert.equal(post.fxaa.uniforms.resolution.value.y, 1 / 450);
  post.dispose();
});

test('cambiar solo DPR redimensiona cada pasada una vez', () => {
  const ctx = crearContexto();
  const post = crearPost(ctx, null);
  let llamadas = 0;
  const original = post.bloom.setSize.bind(post.bloom);
  post.bloom.setSize = (...args) => { llamadas++; original(...args); };
  ctx.renderer.setPixelRatio(1);
  post.setTamano(800, 600);
  assert.equal(llamadas, 1);
  assert.equal(post.composer.renderTarget1.width, 800);
  post.setTamano(800, 600);
  assert.equal(llamadas, 1, 'el tamaño sin cambios no debe reasignarse');
  post.dispose();
});

test('la demo todavía puede crear SSR de forma explícita', () => {
  const post = crearPost(crearContexto(), null, { reflejos: true });
  assert.ok(post.ssr);
  post.dispose();
});
