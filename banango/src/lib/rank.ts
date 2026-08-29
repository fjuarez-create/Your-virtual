import type { Product, Understanding } from '@/lib/types';

/**
 * Fusión y puntuación de resultados. Módulo aparte (sin dependencias de
 * Node) para poder usarlo tanto en el servidor como en el navegador
 * (versión estática de /bng).
 */

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
