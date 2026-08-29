import MiniSearch from 'minisearch';
import type { Product, SearchAdapter, Understanding } from '@/lib/types';
import { DEMO_PRODUCTS, type DemoProduct } from '@/data/demo-products';
import { STORE_MAP } from '@/data/stores';

/**
 * Adaptador DEMO: busca sobre el catálogo de ejemplo con MiniSearch.
 * Se desactiva por tienda en cuanto esa tienda tiene un adaptador live
 * (el registro se encarga; aquí solo se excluyen las tiendas indicadas).
 */

type Doc = DemoProduct & { searchText: string };

let index: MiniSearch<Doc> | null = null;

function getIndex(): MiniSearch<Doc> {
  if (index) return index;
  index = new MiniSearch<Doc>({
    fields: ['title', 'tags', 'description', 'brand', 'category'],
    storeFields: ['id'],
    searchOptions: {
      boost: { title: 3, tags: 2, brand: 1.5 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'OR',
    },
    processTerm: t =>
      t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
  });
  index.addAll(DEMO_PRODUCTS.map(p => ({ ...p, searchText: '' })));
  return index;
}

const byId = new Map(DEMO_PRODUCTS.map(p => [p.id, p]));

export function toProduct(p: DemoProduct): Product {
  const store = STORE_MAP[p.storeId];
  return {
    id: p.id,
    storeId: p.storeId,
    title: p.title,
    description: p.description,
    price: p.price,
    oldPrice: p.oldPrice,
    currency: 'EUR',
    emoji: p.emoji,
    url: store ? store.searchUrl(p.title) : '#',
    brand: p.brand,
    category: p.category,
    color: p.color,
  };
}

export function createDemoAdapter(excludeStores: Set<string>): SearchAdapter {
  return {
    id: 'demo',
    label: 'Catálogo demo',
    mode: 'demo',
    isActive: () => process.env.BANANGO_DISABLE_DEMO !== '1',
    async search(u: Understanding): Promise<Product[]> {
      const query = u.terms.join(' ');
      if (!query.trim()) return [];
      const hits = getIndex().search(query);
      const out: Product[] = [];
      for (const hit of hits) {
        const doc = byId.get(hit.id as string);
        if (!doc || excludeStores.has(doc.storeId)) continue;
        if (u.maxPrice !== undefined && doc.price > u.maxPrice) continue;
        if (u.minPrice !== undefined && doc.price < u.minPrice) continue;
        out.push({ ...toProduct(doc), score: hit.score });
      }
      return out.slice(0, 48);
    },
  };
}
