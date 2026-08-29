import type { Product, SearchAdapter, SourceReport, Understanding } from '@/lib/types';
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

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Normaliza puntuaciones por fuente y aplica boosts de la interpretación. */
export function rank(products: Product[], u: Understanding): Product[] {
  const maxByStore = new Map<string, number>();
  for (const p of products) {
    const cur = maxByStore.get(p.storeId) ?? 0;
    if ((p.score ?? 0) > cur) maxByStore.set(p.storeId, p.score ?? 0);
  }

  const colorSet = new Set((u.colorTerms ?? (u.color ? [u.color] : [])).map(norm));
  const keywords = u.keywords.map(norm);

  const scored = products.map((p, i) => {
    const base = maxByStore.get(p.storeId)
      ? (p.score ?? 0) / (maxByStore.get(p.storeId) || 1)
      : Math.max(0.2, 1 - i * 0.01); // fuentes live sin score: orden de llegada
    const text = norm(`${p.title} ${p.color ?? ''} ${p.description}`);
    let boost = 0;
    if (colorSet.size) {
      const hasColor = (p.color && colorSet.has(norm(p.color))) ||
        [...colorSet].some(c => text.includes(c));
      boost += hasColor ? 0.4 : -0.25;
    }
    const titleNorm = norm(p.title);
    const hitAll = keywords.length > 0 && keywords.every(k => titleNorm.includes(k));
    const hitSome = keywords.some(k => titleNorm.includes(k));
    boost += hitAll ? 0.35 : hitSome ? 0.15 : 0;
    if (p.oldPrice && p.oldPrice > p.price) boost += 0.05;
    return { ...p, score: base + boost };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, 60);
}
