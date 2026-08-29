'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import { STORE_MAP, STORES } from '@/data/stores';
import type { SearchResponse } from '@/lib/types';

const SUGGESTIONS = [
  'camisa amarilla',
  'auriculares inalámbricos por menos de 50€',
  'zapatillas running',
  'taladro percutor',
  'perfume mujer',
  'pienso para perro',
];

type Sort = 'rel' | 'asc' | 'desc';

// Fijados en build: la versión estática (unikdi.com/bng) busca en el navegador.
const IS_STATIC = process.env.NEXT_PUBLIC_STATIC === '1';
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function Home() {
  const [input, setInput] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>('rel');
  const [now, setNow] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setNow(new Date()), []);

  const runSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query || query === lastQueryRef.current) return;
    lastQueryRef.current = query;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      let body: SearchResponse;
      if (IS_STATIC) {
        const { searchClient } = await import('@/lib/client-search');
        body = await searchClient(query);
      } else {
        const res = await fetch(`${BASE_PATH}/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = (await res.json()) as SearchResponse;
      }
      setData(body);
      setStoreFilter(new Set());
      setSort('rel');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('No he podido completar la búsqueda. Inténtalo de nuevo.');
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  // Búsqueda en vivo mientras se escribe
  useEffect(() => {
    if (input.trim().length < 3) return;
    const t = setTimeout(() => runSearch(input), 450);
    return () => clearTimeout(t);
  }, [input, runSearch]);

  const results = useMemo(() => {
    if (!data) return [];
    let r = data.results;
    if (storeFilter.size) r = r.filter(p => storeFilter.has(p.storeId));
    if (sort === 'asc') r = [...r].sort((a, b) => a.price - b.price);
    if (sort === 'desc') r = [...r].sort((a, b) => b.price - a.price);
    return r;
  }, [data, storeFilter, sort]);

  const storeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data?.results ?? []) {
      counts.set(p.storeId, (counts.get(p.storeId) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const greeting = now
    ? now.getHours() < 12 ? 'Buenos días' : now.getHours() < 20 ? 'Buenas tardes' : 'Buenas noches'
    : 'Hola';
  const rawDate = now
    ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
    : '';
  const dateLine = rawDate ? rawDate.charAt(0).toUpperCase() + rawDate.slice(1) : '';

  const hasResults = Boolean(data) || loading;

  const toggleStore = (id: string) => {
    setStoreFilter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-6xl px-4 pb-20 sm:px-6">
      {/* Barra superior */}
      <header className="flex items-center justify-between pt-5">
        <span className="glass flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold tracking-tight">
          <span aria-hidden>🍌</span> banango
        </span>
        <span className="glass rounded-full px-3.5 py-2 text-xs text-ink-soft">
          {STORES.length} tiendas conectadas
        </span>
      </header>

      {/* Hero + buscador */}
      <section
        className={`mx-auto flex w-full max-w-2xl flex-col items-center text-center transition-all duration-500 ${
          hasResults ? 'pb-6 pt-8' : 'pb-10 pt-[16vh] sm:pt-[20vh]'
        }`}
      >
        {!hasResults && (
          <>
            <p className="mb-2 text-sm text-ink-soft">{dateLine}</p>
            <h1 className="mb-8 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {greeting},
              <br />
              <span className="text-ink-soft">¿qué buscamos hoy?</span>
            </h1>
          </>
        )}

        <form
          className="glass search-glow flex w-full items-center gap-2 rounded-full p-2 pl-5 transition-shadow"
          onSubmit={e => {
            e.preventDefault();
            runSearch(input);
          }}
          role="search"
        >
          <span className="text-lg" aria-hidden>✨</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Describe lo que buscas…"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none"
            autoFocus
            enterKeyHint="search"
            maxLength={200}
          />
          <button
            type="submit"
            aria-label="Buscar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1d2233] text-white transition-transform hover:scale-105 active:scale-95"
          >
            {loading ? (
              <span className="pulse-soft text-base" aria-hidden>✦</span>
            ) : (
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden>
                <circle cx="7.5" cy="7.5" r="5.2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M11.5 11.5L15 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </form>

        {/* Sugerencias (solo mientras no hay resultados) */}
        <div className={`mt-4 flex flex-wrap items-center justify-center gap-2 ${hasResults ? 'hidden' : ''}`}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => {
                setInput(s);
                runSearch(s);
              }}
              className="glass rounded-full px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="glass mx-auto max-w-md rounded-3xl p-5 text-center text-sm text-ink-soft">
          {error}
        </div>
      )}

      {/* Esqueleto de carga */}
      {loading && !data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="glass overflow-hidden rounded-3xl">
              <div className="skeleton aspect-[4/5]" />
              <div className="space-y-2 p-3.5">
                <div className="skeleton h-3 w-4/5 rounded-full" />
                <div className="skeleton h-3 w-2/5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <section className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Meta + filtros */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <span className="glass rounded-full px-3 py-1.5">
              {results.length} resultado{results.length === 1 ? '' : 's'}
              {storeCounts.length > 0 && <> · {storeCounts.length} tienda{storeCounts.length === 1 ? '' : 's'}</>}
              {' '}· {data.tookMs} ms
            </span>
            <span className="glass rounded-full px-3 py-1.5">
              IA: {data.understanding.engine === 'claude' ? 'Claude' : 'local'}
            </span>
            {data.understanding.color && (
              <span className="glass rounded-full px-3 py-1.5">color: {data.understanding.color}</span>
            )}
            {data.understanding.maxPrice !== undefined && data.understanding.maxPrice !== null && (
              <span className="glass rounded-full px-3 py-1.5">hasta {data.understanding.maxPrice} €</span>
            )}
            {data.demo && (
              <span className="glass rounded-full bg-[#ffbe4d]/40 px-3 py-1.5 font-medium text-ink">
                modo demo
              </span>
            )}
            <span className="ml-auto flex gap-1.5">
              {([['rel', 'Relevancia'], ['asc', 'Precio ↑'], ['desc', 'Precio ↓']] as [Sort, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={`rounded-full px-3 py-1.5 transition-colors ${
                    sort === key ? 'glass-strong font-medium text-ink' : 'glass text-ink-soft hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>

          {/* Chips de tiendas presentes en los resultados */}
          {storeCounts.length > 1 && (
            <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {storeCounts.map(([id, count]) => {
                const store = STORE_MAP[id];
                const active = storeFilter.has(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleStore(id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                      active ? 'glass-strong font-medium text-ink' : 'glass text-ink-soft hover:text-ink'
                    }`}
                  >
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: store?.dot ?? '#999' }} />
                    {store?.name ?? id}
                    <span className="text-ink-faint">{count}</span>
                  </button>
                );
              })}
              {storeFilter.size > 0 && (
                <button
                  onClick={() => setStoreFilter(new Set())}
                  className="glass shrink-0 rounded-full px-3.5 py-1.5 text-xs text-ink-soft hover:text-ink"
                >
                  ✕ limpiar
                </button>
              )}
            </div>
          )}

          {/* Resultados */}
          {results.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {results.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          ) : (
            <div className="glass mx-auto max-w-md rounded-3xl p-8 text-center">
              <p className="mb-1 text-3xl" aria-hidden>🔍</p>
              <p className="text-sm text-ink-soft">
                Nada por aquí para «{data.query}». Prueba con otras palabras o quita filtros.
              </p>
            </div>
          )}

          <p className="mt-10 text-center text-[11px] leading-relaxed text-ink-faint">
            Al pulsar un producto se abre la tienda oficial en una pestaña nueva para completar la compra allí.
            {data.demo && ' Los resultados en modo demo son de muestra y enlazan al buscador de cada tienda.'}
          </p>
        </section>
      )}
    </main>
  );
}
