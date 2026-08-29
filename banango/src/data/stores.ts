/**
 * Las 20 tiendas de banango (verificadas ago-2026: todas con vía real de
 * acceso a datos de producto — API oficial o feed vía red de afiliación).
 *
 * `searchUrl` apunta al buscador público de cada tienda: es el enlace que
 * usan los productos del catálogo demo. Cuando un adaptador live está
 * activo, cada producto trae ya su deep link con comisión y esto no se usa.
 */

export type Network = 'API oficial' | 'Awin' | 'Tradedoubler' | 'TradeTracker' | 'Rakuten';

export interface StoreInfo {
  id: string;
  name: string;
  network: Network;
  domain: string;
  /** Color de marca aproximado para el chip identificador. */
  dot: string;
  /** Gradiente del placeholder de imagen [desde, hasta]. */
  hue: [string, string];
  searchUrl: (q: string) => string;
}

const e = encodeURIComponent;

export const STORES: StoreInfo[] = [
  { id: 'ebay', name: 'eBay', network: 'API oficial', domain: 'ebay.es', dot: '#e53238', hue: ['#fde8e8', '#e8f0fe'], searchUrl: q => `https://www.ebay.es/sch/i.html?_nkw=${e(q)}` },
  { id: 'aliexpress', name: 'AliExpress', network: 'API oficial', domain: 'aliexpress.com', dot: '#ff4747', hue: ['#ffe9e0', '#fff4d6'], searchUrl: q => `https://www.aliexpress.com/wholesale?SearchText=${e(q)}` },
  { id: 'etsy', name: 'Etsy', network: 'API oficial', domain: 'etsy.com', dot: '#f1641e', hue: ['#ffeadd', '#fdf3e7'], searchUrl: q => `https://www.etsy.com/es/search?q=${e(q)}` },
  { id: 'elcorteingles', name: 'El Corte Inglés', network: 'Awin', domain: 'elcorteingles.es', dot: '#009540', hue: ['#e3f5ea', '#eef7e9'], searchUrl: q => `https://www.elcorteingles.es/search-nwx/1/?s=${e(q)}` },
  { id: 'pccomponentes', name: 'PcComponentes', network: 'Awin', domain: 'pccomponentes.com', dot: '#ff6000', hue: ['#ffeede', '#e9f0fb'], searchUrl: q => `https://www.pccomponentes.com/buscar/?query=${e(q)}` },
  { id: 'mediamarkt', name: 'MediaMarkt', network: 'Tradedoubler', domain: 'mediamarkt.es', dot: '#df0000', hue: ['#ffe5e5', '#f3e8ff'], searchUrl: q => `https://www.mediamarkt.es/es/search.html?query=${e(q)}` },
  { id: 'carrefour', name: 'Carrefour', network: 'Awin', domain: 'carrefour.es', dot: '#004e9f', hue: ['#e2ecfa', '#fde8ec'], searchUrl: q => `https://www.carrefour.es/?q=${e(q)}` },
  { id: 'leroymerlin', name: 'Leroy Merlin', network: 'Awin', domain: 'leroymerlin.es', dot: '#78be20', hue: ['#ecf6df', '#e5f2e9'], searchUrl: q => `https://www.leroymerlin.es/buscador?query=${e(q)}` },
  { id: 'decathlon', name: 'Decathlon', network: 'Awin', domain: 'decathlon.es', dot: '#3643ba', hue: ['#e5e8fb', '#dff1fa'], searchUrl: q => `https://www.decathlon.es/es/search?Ntt=${e(q)}` },
  { id: 'fnac', name: 'Fnac', network: 'Awin', domain: 'fnac.es', dot: '#e8a400', hue: ['#fff3d6', '#f5e9d7'], searchUrl: q => `https://www.fnac.es/SearchResult/ResultList.aspx?Search=${e(q)}` },
  { id: 'worten', name: 'Worten', network: 'TradeTracker', domain: 'worten.es', dot: '#d50032', hue: ['#fde5eb', '#e9e9f7'], searchUrl: q => `https://www.worten.es/search?query=${e(q)}` },
  { id: 'shein', name: 'Shein', network: 'Awin', domain: 'shein.com', dot: '#1f1f1f', hue: ['#f2eef7', '#fdeef2'], searchUrl: q => `https://es.shein.com/pdsearch/${e(q)}/` },
  { id: 'miravia', name: 'Miravia', network: 'Awin', domain: 'miravia.es', dot: '#6a35ff', hue: ['#ece5ff', '#ffeaf4'], searchUrl: q => `https://www.miravia.es/search?q=${e(q)}` },
  { id: 'manomano', name: 'ManoMano', network: 'Awin', domain: 'manomano.es', dot: '#22b573', hue: ['#e2f6ec', '#f3f0df'], searchUrl: q => `https://www.manomano.es/busqueda/${e(q)}` },
  { id: 'mango', name: 'Mango', network: 'Awin', domain: 'shop.mango.com', dot: '#1c1c1c', hue: ['#f5efe8', '#efe9f2'], searchUrl: q => `https://shop.mango.com/es/search?kw=${e(q)}` },
  { id: 'hm', name: 'H&M', network: 'Rakuten', domain: 'www2.hm.com', dot: '#cc071e', hue: ['#fbe7e9', '#eff0f5'], searchUrl: q => `https://www2.hm.com/es_es/search-results.html?q=${e(q)}` },
  { id: 'druni', name: 'Druni', network: 'Awin', domain: 'druni.es', dot: '#e6007e', hue: ['#fde4f1', '#f0e8fb'], searchUrl: q => `https://www.druni.es/buscar?q=${e(q)}` },
  { id: 'primor', name: 'Primor', network: 'Awin', domain: 'primor.eu', dot: '#e83e8c', hue: ['#ffe8f2', '#fff1e2'], searchUrl: q => `https://www.primor.eu/es_es/catalogsearch/result/?q=${e(q)}` },
  { id: 'sprinter', name: 'Sprinter', network: 'Awin', domain: 'sprintersports.com', dot: '#ffd500', hue: ['#fff6d4', '#e6f0e4'], searchUrl: q => `https://www.sprintersports.com/search?q=${e(q)}` },
  { id: 'zooplus', name: 'Zooplus', network: 'Awin', domain: 'zooplus.es', dot: '#78b829', hue: ['#eaf6da', '#dcf1f0'], searchUrl: q => `https://www.zooplus.es/esearch.htm?q=${e(q)}` },
];

export const STORE_MAP: Record<string, StoreInfo> = Object.fromEntries(
  STORES.map(s => [s.id, s]),
);
