import type { Product, SearchAdapter, Understanding } from '@/lib/types';

/**
 * Tradedoubler Products API (búsqueda en vivo sobre los feeds de los
 * anunciantes que te hayan aprobado — en España, p. ej. MediaMarkt).
 * Se activa con TRADEDOUBLER_TOKEN (token de la web del publisher).
 * Opcional: TRADEDOUBLER_FEED_IDS="123,456" para limitar a ciertos feeds.
 * Doc: https://dev.tradedoubler.com/products/publisher/
 */

interface TdProduct {
  name?: string;
  description?: string;
  productImage?: { url?: string };
  brand?: string;
  categories?: { name?: string }[];
  offers?: {
    productUrl?: string;
    programName?: string;
    priceHistory?: { price?: { value?: string; currency?: string } }[];
  }[];
}

export const tradedoublerAdapter: SearchAdapter = {
  id: 'tradedoubler',
  label: 'Tradedoubler (MediaMarkt y otros)',
  mode: 'live',
  isActive: () => Boolean(process.env.TRADEDOUBLER_TOKEN),
  async search(u: Understanding): Promise<Product[]> {
    const q = encodeURIComponent(u.keywords.join(' ') || u.raw);
    const fids = process.env.TRADEDOUBLER_FEED_IDS
      ?.split(',').map(s => `;fid=${s.trim()}`).join('') ?? '';
    const url =
      `https://api.tradedoubler.com/1.0/products.json;q=${q}${fids};limit=30` +
      `?token=${process.env.TRADEDOUBLER_TOKEN}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Tradedoubler ${res.status}`);
    const data = (await res.json()) as { products?: TdProduct[] };

    return (data.products ?? []).flatMap((p, i) => {
      const offer = p.offers?.[0];
      const priceStr = offer?.priceHistory?.[0]?.price?.value;
      const price = parseFloat(priceStr ?? '');
      const url = offer?.productUrl;
      if (!p.name || !url || !isFinite(price)) return [];
      if (u.maxPrice !== undefined && price > u.maxPrice) return [];
      if (u.minPrice !== undefined && price < u.minPrice) return [];
      return [{
        id: `td-${i}-${p.name.slice(0, 24)}`,
        // Único programa Tradedoubler previsto por ahora; si se aprueban más,
        // mapear offer.programName → storeId aquí.
        storeId: 'mediamarkt',
        title: p.name,
        description: p.description ?? '',
        price,
        currency: offer?.priceHistory?.[0]?.price?.currency ?? 'EUR',
        image: p.productImage?.url,
        url,
        brand: p.brand,
        category: p.categories?.[0]?.name,
      } satisfies Product];
    });
  },
};
