export interface Product {
  id: string;
  storeId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  oldPrice?: number;
  image?: string;
  emoji?: string;
  url: string;
  brand?: string;
  category?: string;
  color?: string;
  score?: number;
}

/** Interpretación estructurada de la consulta del usuario. */
export interface Understanding {
  raw: string;
  /** Términos de búsqueda, incluidos sinónimos expandidos. */
  terms: string[];
  /** Palabras clave principales (sin sinónimos). */
  keywords: string[];
  color?: string;
  /** Variantes del color (p. ej. amarillo → mostaza, lima). */
  colorTerms?: string[];
  maxPrice?: number;
  minPrice?: number;
  category?: string;
  engine: 'claude' | 'heuristica';
}

export type AdapterMode = 'demo' | 'live';

export interface SourceReport {
  source: string;
  mode: AdapterMode;
  count: number;
  ms: number;
  error?: string;
}

export interface SearchAdapter {
  id: string;
  label: string;
  mode: AdapterMode;
  isActive(): boolean;
  search(u: Understanding): Promise<Product[]>;
}

export interface SearchResponse {
  query: string;
  understanding: Understanding;
  results: Product[];
  sources: SourceReport[];
  demo: boolean;
  tookMs: number;
}
