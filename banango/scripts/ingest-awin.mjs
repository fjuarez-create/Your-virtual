#!/usr/bin/env node
/**
 * Ingesta de feeds de producto de Awin → data/feeds/<tienda>.json
 *
 * Requiere estar aprobado como publisher en Awin y en cada anunciante.
 *
 * Uso:
 *   1) Listar los feeds disponibles con tu clave de feed (Awin → Toolbox →
 *      Create-a-Feed → API key):
 *        AWIN_FEED_APIKEY=xxxx node scripts/ingest-awin.mjs --list
 *
 *   2) Definir en .env.local qué feed corresponde a cada tienda de banango
 *      (URLs de descarga que da el paso anterior):
 *        AWIN_FEEDS={"elcorteingles":"https://productdata.awin.com/datafeed/download/apikey/xxxx/language/es/fid/1234/...csv.gz","leroymerlin":"https://..."}
 *
 *   3) Ingerir:
 *        node scripts/ingest-awin.mjs
 *
 * Cada fichero resultante es un array de filas {id,title,description,price,
 * currency,image,url,brand,category} que el adaptador src/lib/stores/awin.ts
 * indexa al arrancar. AWIN_MAX_ROWS limita filas por tienda (def. 20000).
 * Para catálogos completos en producción: Meilisearch/Typesense.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';

const OUT_DIR = path.join(process.cwd(), 'data', 'feeds');
const MAX_ROWS = parseInt(process.env.AWIN_MAX_ROWS ?? '20000', 10);

async function listFeeds() {
  const key = process.env.AWIN_FEED_APIKEY;
  if (!key) {
    console.error('Falta AWIN_FEED_APIKEY (Awin → Toolbox → Create-a-Feed).');
    process.exit(1);
  }
  const res = await fetch(`https://productdata.awin.com/datafeed/list/apikey/${key}`);
  if (!res.ok) {
    console.error(`Awin respondió ${res.status} al listar feeds.`);
    process.exit(1);
  }
  console.log(await res.text());
}

/** Mapea una fila del CSV estándar de Awin a nuestro formato. */
function mapRow(row) {
  const price = parseFloat(row.search_price ?? row.store_price ?? row.display_price ?? '');
  const url = row.aw_deep_link;
  const title = row.product_name;
  if (!title || !url || !isFinite(price)) return null;
  return {
    id: row.aw_product_id ?? row.merchant_product_id ?? '',
    title,
    description: (row.description ?? '').slice(0, 300),
    price,
    currency: row.currency ?? 'EUR',
    image: row.merchant_image_url || row.aw_image_url || undefined,
    url,
    brand: row.brand_name || undefined,
    category: row.merchant_category || row.category_name || undefined,
  };
}

async function ingestFeed(storeId, feedUrl) {
  process.stdout.write(`→ ${storeId}: descargando… `);
  const res = await fetch(feedUrl);
  if (!res.ok || !res.body) {
    console.error(`ERROR HTTP ${res.status}`);
    return;
  }

  const rows = [];
  const parser = parse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
  });
  parser.on('readable', () => {
    let record;
    while ((record = parser.read()) !== null) {
      if (rows.length >= MAX_ROWS) { parser.end(); break; }
      const mapped = mapRow(record);
      if (mapped) rows.push(mapped);
    }
  });

  const isGzip = /\.gz(\?|$)/.test(feedUrl) ||
    res.headers.get('content-type')?.includes('gzip');
  try {
    if (isGzip) {
      await pipeline(res.body, zlib.createGunzip(), parser);
    } else {
      await pipeline(res.body, parser);
    }
  } catch (err) {
    // El corte al llegar a MAX_ROWS aborta el pipeline: no es un fallo.
    if (rows.length === 0) {
      console.error(`ERROR ${err.message}`);
      return;
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${storeId}.json`), JSON.stringify(rows));
  console.log(`${rows.length} productos guardados.`);
}

async function main() {
  if (process.argv.includes('--list')) return listFeeds();

  let feeds;
  try {
    feeds = JSON.parse(process.env.AWIN_FEEDS ?? '');
  } catch {
    console.error('Define AWIN_FEEDS como JSON {"tienda":"url_feed", …}. Usa --list para ver tus feeds.');
    process.exit(1);
  }
  for (const [storeId, url] of Object.entries(feeds)) {
    await ingestFeed(storeId, url);
  }
  console.log('Listo. El buscador usará estos feeds en la próxima petición.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
