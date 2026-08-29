import { NextRequest } from 'next/server';
import { understand } from '@/lib/ai/understand';
import { searchAll } from '@/lib/stores/registry';
import type { SearchResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return Response.json({ error: 'Falta el parámetro q' }, { status: 400 });
  }
  if (q.length > 200) {
    return Response.json({ error: 'Consulta demasiado larga' }, { status: 400 });
  }

  const started = Date.now();
  const understanding = await understand(q);
  const { products, sources } = await searchAll(understanding);

  const body: SearchResponse = {
    query: q,
    understanding,
    results: products,
    sources,
    demo: sources.some(s => s.mode === 'demo' && s.count > 0),
    tookMs: Date.now() - started,
  };
  return Response.json(body);
}
