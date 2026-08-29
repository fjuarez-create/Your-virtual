import Anthropic from '@anthropic-ai/sdk';
import type { Understanding } from '@/lib/types';
import { heuristicUnderstand } from './heuristics';

/**
 * Entiende la consulta del usuario. Si hay ANTHROPIC_API_KEY usa Claude para
 * interpretar lenguaje natural ("algo para regalar a mi madre por menos de
 * 30€") y expandir sinónimos; si no hay clave o la llamada falla, cae en la
 * heurística local sin romper la búsqueda.
 */

const MODEL = process.env.BANANGO_AI_MODEL || 'claude-opus-5';

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM = `Eres el intérprete de consultas de un buscador de compras español.
Convierte la consulta del usuario en JSON con esta forma exacta:
{"keywords": string[], "terms": string[], "color": string|null, "maxPrice": number|null, "minPrice": number|null, "category": string|null}

- "keywords": las palabras esenciales del producto buscado (sin colores ni precios).
- "terms": keywords + sinónimos y variantes útiles en español (p. ej. camisa → blusa; portátil → laptop). Máximo 12.
- "color": color canónico en español si se pide uno (p. ej. "amarillo"), si no null. Incluye en "terms" 2-3 matices del color (p. ej. mostaza, limón).
- "maxPrice"/"minPrice": límites en euros si se mencionan, si no null.
- "category": una de moda|calzado|tecnologia|deporte|hogar|bricolaje|belleza|mascotas|libros|bebe|juguetes|alimentacion, o null.

Responde SOLO con el JSON minificado, sin explicación ni markdown.`;

export async function understand(raw: string): Promise<Understanding> {
  const fallback = heuristicUnderstand(raw);
  const anthropic = getClient();
  if (!anthropic) return fallback;

  try {
    const res = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: 'user', content: raw }],
      },
      { timeout: 9000, maxRetries: 1 },
    );

    if (res.stop_reason === 'refusal') return fallback;

    let text = '';
    for (const block of res.content) {
      if (block.type === 'text') text += block.text;
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return fallback;
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      keywords?: unknown;
      terms?: unknown;
      color?: unknown;
      maxPrice?: unknown;
      minPrice?: unknown;
      category?: unknown;
    };

    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
    const num = (v: unknown): number | undefined =>
      typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined;

    const keywords = strArr(parsed.keywords);
    const terms = strArr(parsed.terms);
    if (keywords.length === 0 && terms.length === 0) return fallback;

    return {
      raw,
      keywords: keywords.length ? keywords : fallback.keywords,
      terms: [...new Set([...(terms.length ? terms : fallback.terms), ...fallback.terms])],
      color: typeof parsed.color === 'string' ? parsed.color.toLowerCase() : fallback.color,
      colorTerms: fallback.colorTerms,
      maxPrice: num(parsed.maxPrice) ?? fallback.maxPrice,
      minPrice: num(parsed.minPrice) ?? fallback.minPrice,
      category: typeof parsed.category === 'string' ? parsed.category : fallback.category,
      engine: 'claude',
    };
  } catch {
    // Sin red, sin crédito o respuesta inesperada: la búsqueda sigue en local.
    return fallback;
  }
}
