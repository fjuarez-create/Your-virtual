import type { Product, SearchAdapter, Understanding } from '@/lib/types';

/**
 * eBay Browse API (búsqueda en vivo, mercado eBay España).
 * Se activa con EBAY_CLIENT_ID + EBAY_CLIENT_SECRET (app de producción del
 * eBay Developer Program). Si además hay EBAY_EPN_CAMPAIGN_ID (eBay Partner
 * Network), los enlaces devueltos llevan tu comisión.
 */

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const basic = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`,
  ).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials&scope=' +
      encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  if (!res.ok) throw new Error(`eBay OAuth ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

interface EbayItem {
  itemId: string;
  title: string;
  shortDescription?: string;
  condition?: string;
  image?: { imageUrl?: string };
  price?: { value?: string; currency?: string };
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  brand?: string;
}

export const ebayAdapter: SearchAdapter = {
  id: 'ebay',
  label: 'eBay (API oficial)',
  mode: 'live',
  isActive: () => Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
  async search(u: Understanding): Promise<Product[]> {
    const token = await getToken();
    const params = new URLSearchParams({
      q: u.keywords.join(' ') || u.raw,
      limit: '20',
    });
    if (u.maxPrice !== undefined || u.minPrice !== undefined) {
      const lo = u.minPrice ?? '';
      const hi = u.maxPrice ?? '';
      params.set('filter', `price:[${lo}..${hi}],priceCurrency:EUR`);
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_ES',
      'Accept-Language': 'es-ES',
    };
    if (process.env.EBAY_EPN_CAMPAIGN_ID) {
      headers['X-EBAY-C-ENDUSERCTX'] =
        `affiliateCampaignId=${process.env.EBAY_EPN_CAMPAIGN_ID}`;
    }
    const res = await fetch(`${SEARCH_URL}?${params}`, { headers });
    if (!res.ok) throw new Error(`eBay Browse ${res.status}`);
    const data = (await res.json()) as { itemSummaries?: EbayItem[] };

    return (data.itemSummaries ?? []).flatMap(item => {
      const price = parseFloat(item.price?.value ?? '');
      if (!item.title || !isFinite(price)) return [];
      return [{
        id: `ebay-${item.itemId}`,
        storeId: 'ebay',
        title: item.title,
        description: item.shortDescription ?? item.condition ?? '',
        price,
        currency: item.price?.currency ?? 'EUR',
        image: item.image?.imageUrl,
        url: item.itemAffiliateWebUrl ?? item.itemWebUrl ?? '',
        brand: item.brand,
      } satisfies Product];
    }).filter(p => p.url);
  },
};
