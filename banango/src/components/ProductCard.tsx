import type { Product } from '@/lib/types';
import { STORE_MAP } from '@/data/stores';

const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** Placeholder teñido del color del producto: vende mejor la búsqueda por color. */
const COLOR_GRADIENTS: Record<string, [string, string]> = {
  amarillo: ['#fff1bd', '#ffe08a'],
  rojo: ['#ffdcdc', '#ffc4c4'],
  azul: ['#dbe7ff', '#c3d7ff'],
  verde: ['#ddf5e3', '#c4ecd2'],
  negro: ['#e3e4ea', '#cfd1da'],
  blanco: ['#ffffff', '#eef0f6'],
  rosa: ['#ffe0ee', '#ffcce2'],
  morado: ['#ecdfff', '#dcc8ff'],
  naranja: ['#ffe4cc', '#ffd1a8'],
  gris: ['#e8e9ee', '#d6d8e0'],
  marron: ['#efe0d1', '#e0c9b3'],
  beige: ['#f5ecdc', '#eadfc8'],
};

function price(value: number, currency: string) {
  if (currency === 'EUR') return fmt.format(value);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value);
}

export default function ProductCard({ product, index }: { product: Product; index: number }) {
  const store = STORE_MAP[product.storeId];
  const hue = (product.color && COLOR_GRADIENTS[product.color]) || store?.hue || ['#f2f2f6', '#e6e8f2'];
  const discount =
    product.oldPrice && product.oldPrice > product.price
      ? Math.round((1 - product.price / product.oldPrice) * 100)
      : null;

  return (
    <a
      href={product.url}
      target="_blank"
      rel="nofollow sponsored noopener noreferrer"
      className="glass glass-hover fade-up group flex flex-col overflow-hidden rounded-3xl"
      style={{ animationDelay: `${Math.min(index * 45, 500)}ms` }}
      title={`Ver «${product.title}» en ${store?.name ?? product.storeId}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {product.image ? (
          // Imágenes remotas de las APIs/feeds: dominio variable, se usa <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center transition-transform duration-500 group-hover:scale-105"
            style={{
              background: `radial-gradient(120% 120% at 20% 10%, ${hue[0]} 0%, ${hue[1]} 100%)`,
            }}
          >
            <span className="text-6xl drop-shadow-sm select-none" aria-hidden>
              {product.emoji ?? '🛍️'}
            </span>
          </div>
        )}

        <span className="glass-strong absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: store?.dot ?? '#999' }}
          />
          {store?.name ?? product.storeId}
        </span>

        {discount !== null && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-[#1d2233]/85 px-2 py-1 text-[11px] font-semibold text-white">
            −{discount}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <h3 className="line-clamp-2 text-[13px] font-medium leading-snug">
          {product.title}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[15px] font-semibold tracking-tight">
              {price(product.price, product.currency)}
            </span>
            {product.oldPrice && product.oldPrice > product.price && (
              <span className="text-[11px] text-ink-faint line-through">
                {price(product.oldPrice, product.currency)}
              </span>
            )}
          </div>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1d2233] text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 10L10 2M10 2H4M10 2v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </a>
  );
}
