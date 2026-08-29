import type { Product, SearchAdapter, Understanding } from '@/lib/types';

/**
 * Etsy Open API v3 (búsqueda en vivo de listados activos).
 * Se activa con ETSY_API_KEY (keystring de tu app aprobada en
 * https://www.etsy.com/developers).
 */

interface EtsyListing {
  listing_id: number;
  title?: string;
  description?: string;
  url?: string;
  price?: { amount?: number; divisor?: number; currency_code?: string };
  images?: { url_570xN?: string; url_fullxfull?: string }[];
}

export const etsyAdapter: SearchAdapter = {
  id: 'etsy',
  label: 'Etsy (API oficial)',
  mode: 'live',
  isActive: () => Boolean(process.env.ETSY_API_KEY),
  async search(u: Understanding): Promise<Product[]> {
    const params = new URLSearchParams({
      keywords: u.keywords.join(' ') || u.raw,
      limit: '20',
      includes: 'Images',
    });
    if (u.maxPrice !== undefined) params.set('max_price', String(u.maxPrice));
    if (u.minPrice !== undefined) params.set('min_price', String(u.minPrice));

    const res = await fetch(
      `https://api.etsy.com/v3/application/listings/active?${params}`,
      { headers: { 'x-api-key': process.env.ETSY_API_KEY as string } },
    );
    if (!res.ok) throw new Error(`Etsy ${res.status}`);
    const data = (await res.json()) as { results?: EtsyListing[] };

    return (data.results ?? []).flatMap(l => {
      const amount = l.price?.amount;
      const divisor = l.price?.divisor || 100;
      if (!l.title || !l.url || typeof amount !== 'number') return [];
      return [{
        id: `etsy-${l.listing_id}`,
        storeId: 'etsy',
        title: l.title,
        description: l.description?.slice(0, 200) ?? '',
        price: amount / divisor,
        currency: l.price?.currency_code ?? 'EUR',
        image: l.images?.[0]?.url_570xN ?? l.images?.[0]?.url_fullxfull,
        url: l.url,
      } satisfies Product];
    });
  },
};
