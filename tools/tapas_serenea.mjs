#!/usr/bin/env node
/* Tapas de las plantas seccionadas: la sección de los muros de
   assets/serenea/apolo_envolvente.glb a la cota de corte de cada cajón de
   cada planta (data/cortes.json), como triángulos horizontales. Escribe
   data/tapas_serenea.json. Ver js/visor/tapas.js para el método.

   Uso: node tools/tapas_serenea.mjs [envolvente.glb] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirGLB } from './lib/glb_lectura.mjs';
import { seccionar, ES_MURO } from '../js/visor/tapas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const glb = process.argv[2] || path.join(raiz, 'assets/serenea/apolo_envolvente.glb');
const modelo = await abrirGLB(glb);
const triangulos = modelo.triangulos((nombre) => ES_MURO.test(nombre));
console.log(`muros: ${triangulos.length} triángulos de ${modelo.materiales.filter((n) => ES_MURO.test(n)).join(' | ')}`);

/* ── secciones ── */
const cortes = JSON.parse(fs.readFileSync(path.join(raiz, 'data/cortes.json'), 'utf8'));
const salida = { origen: path.basename(glb), cortes: cortes.origen, alzar: 0.01, unidad: 'mm', formato: 'por cajón: { y, poligonos: [n, x, z, … ] } en mm', plantas: {} };
const t0 = Date.now();
for (const [clave, cajones] of Object.entries(cortes.plantas)) {
  /* Por cajón: cota y polígonos planos [n, x, z, x, z, …] en milímetros. */
  const cajonesSalida = []; const resumen = []; let nPol = 0;
  for (const [i, c] of cajones.entries()) {
    const stats = {};
    const { poligonos } = seccionar(triangulos, c.y, { rect: { x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1 }, alzar: 0.01, stats });
    const plano = [];
    for (const p of poligonos) { plano.push(p.length); for (const [x, z] of p) plano.push(Math.round(x * 1000), Math.round(z * 1000)); }
    cajonesSalida.push({ y: c.y, poligonos: plano });
    nPol += poligonos.length;
    resumen.push(`c${i}@${c.y.toFixed(2)}: ${stats.segmentos} seg → ${stats.caras} caras, ${stats.pares} pares, ${stats.area.toFixed(1)} m²`);
  }
  salida.plantas[clave] = { cajones: cajonesSalida };
  console.log(`${clave}: ${nPol} polígonos, ${resumen.join(' · ')}`);
}
fs.writeFileSync(path.join(raiz, 'data/tapas_serenea.json'), JSON.stringify(salida));
console.log(`escrito data/tapas_serenea.json (${(fs.statSync(path.join(raiz, 'data/tapas_serenea.json')).size / 1024).toFixed(0)} KB) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
