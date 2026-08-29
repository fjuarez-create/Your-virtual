import type { Product, SearchAdapter, SourceReport, Understanding } from '@/lib/types';
import { rank } from '@/lib/rank';
import { createDemoAdapter } from './demo';
import { ebayAdapter } from './ebay';
import { etsyAdapter } from './etsy';
import { tradedoublerAdapter } from './tradedoubler';
import { awinFeedsAdapter, feedStores } from './awin';

/**
 * Registro de adaptadores. Los adaptadores live se activan solos al definir
 * sus variables de entorno (ver .env.example); el catálogo demo cubre las
 * tiendas que aún no tienen fuente real y se apaga tienda a tienda.
 */

const ADAPTER_TIMEOUT_MS = 6500;

export function activeAdapters(): SearchAdapter[] {
  const live = [ebayAdapter, etsyAdapter, tradedoublerAdapter, awinFeedsAdapter].filter(a => a.isActive());

  const covered = new Set<string>();
  if (ebayAdapter.isActive()) covered.add('ebay');
  if (etsyAdapter.isActive()) covered.add('etsy');
  if (tradedoublerAdapter.isActive()) covered.add('mediamarkt');
  if (awinFeedsAdapter.isActive()) for (const s of feedStores()) covered.add(s);

  const demo = createDemoAdapter(covered);
  return demo.isActive() ? [...live, demo] : live;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

export async function searchAll(u: Understanding): Promise<{
  products: Product[];
  sources: SourceReport[];
}> {
  const adapters = activeAdapters();
  const sources: SourceReport[] = [];

  const settled = await Promise.all(
    adapters.map(async adapter => {
      const started = Date.now();
      try {
        const products = await withTimeout(adapter.search(u), ADAPTER_TIMEOUT_MS);
        sources.push({ source: adapter.id, mode: adapter.mode, count: products.length, ms: Date.now() - started });
        return products;
      } catch (err) {
        sources.push({
          source: adapter.id,
          mode: adapter.mode,
          count: 0,
          ms: Date.now() - started,
          error: err instanceof Error ? err.message : 'error',
        });
        return [] as Product[];
      }
    }),
  );

  return { products: rank(settled.flat(), u), sources };
}
