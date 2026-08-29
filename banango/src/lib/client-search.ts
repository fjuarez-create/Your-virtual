import { heuristicUnderstand } from '@/lib/ai/heuristics';
import { createDemoAdapter } from '@/lib/stores/demo';
import { rank } from '@/lib/rank';
import type { SearchResponse } from '@/lib/types';

/**
 * Búsqueda 100 % en el navegador para la versión estática (unikdi.com/bng):
 * mismo intérprete heurístico y mismo catálogo demo, sin servidor. Las
 * fuentes live (eBay, Claude, feeds…) requieren la versión con servidor.
 */
export async function searchClient(query: string): Promise<SearchResponse> {
  const started = Date.now();
  const understanding = heuristicUnderstand(query);
  const demo = createDemoAdapter(new Set());
  const found = await demo.search(understanding);
  const results = rank(found, understanding);
  return {
    query,
    understanding,
    results,
    sources: [{ source: 'demo', mode: 'demo', count: results.length, ms: Date.now() - started }],
    demo: results.length > 0,
    tookMs: Date.now() - started,
  };
}
