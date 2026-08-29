import fs from 'node:fs';
import path from 'node:path';
import MiniSearch from 'minisearch';
import type { Product, SearchAdapter, Understanding } from '@/lib/types';
import { STORE_MAP } from '@/data/stores';

/**
 * Adaptador de feeds ingeridos (Awin / TradeTracker / Rakuten).
 * Lee los ficheros data/feeds/<storeId>.json generados por
 * `npm run ingest:awin` (o por tu propio proceso) y los indexa en memoria.
 *
 * Formato de cada fichero: array de FeedRow (ver abajo). En producción con
 * catálogos de millones de productos, sustituir por Meilisearch/Typesense —
 * la interfaz del adaptador no cambia.
 */

export interface FeedRow {
  id: string;
  title: string;
  description?: string;
  price: number;
  currency?: string;
  image?: string;
  /** aw_deep_link: el enlace CON comisión. */
  url: string;
  brand?: string;
  category?: string;
}

type Doc = FeedRow & { storeId: string };

const FEEDS_DIR = path.join(process.cwd(), 'data', 'feeds');

let loaded: { index: MiniSearch<Doc>; byId: Map<string, Doc>; stores: string[] } | null = null;

function load() {
  if (loaded) return loaded;
  const byId = new Map<string, Doc>();
  const stores: string[] = [];
  const index = new MiniSearch<Doc>({
    fields: ['title', 'description', 'brand', 'category'],
    storeFields: ['id'],
    searchOptions: { boost: { title: 3, brand: 1.5 }, prefix: true, fuzzy: 0.15, combineWith: 'OR' },
    processTerm: t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
  });
  if (fs.existsSync(FEEDS_DIR)) {
    for (const file of fs.readdirSync(FEEDS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const storeId = file.replace(/\.json$/, '');
      if (!STORE_MAP[storeId]) continue;
      try {
        const rows = JSON.parse(fs.readFileSync(path.join(FEEDS_DIR, file), 'utf8')) as FeedRow[];
        const docs: Doc[] = rows
          .filter(r => r && r.title && r.url && isFinite(r.price))
          .map((r, i) => ({ ...r, id: `${storeId}-${r.id ?? i}`, storeId }));
        index.addAll(docs);
        for (const d of docs) byId.set(d.id, d);
        if (docs.length) stores.push(storeId);
      } catch {
        // Fichero corrupto: se ignora esa tienda, el resto sigue.
      }
    }
  }
  loaded = { index, byId, stores };
  return loaded;
}

/** Tiendas con feed ingerido (para apagar su parte del catálogo demo). */
export function feedStores(): string[] {
  return load().stores;
}

export const awinFeedsAdapter: SearchAdapter = {
  id: 'feeds',
  label: 'Feeds de afiliación (Awin y otros)',
  mode: 'live',
  isActive: () => load().stores.length > 0,
  async search(u: Understanding): Promise<Product[]> {
    const { index, byId } = load();
    const hits = index.search(u.terms.join(' '));
    const out: Product[] = [];
    for (const hit of hits) {
      const doc = byId.get(hit.id as string);
      if (!doc) continue;
      if (u.maxPrice !== undefined && doc.price > u.maxPrice) continue;
      if (u.minPrice !== undefined && doc.price < u.minPrice) continue;
      out.push({
        id: doc.id,
        storeId: doc.storeId,
        title: doc.title,
        description: doc.description ?? '',
        price: doc.price,
        currency: doc.currency ?? 'EUR',
        image: doc.image,
        url: doc.url,
        brand: doc.brand,
        category: doc.category,
        score: hit.score,
      });
      if (out.length >= 60) break;
    }
    return out;
  },
};
