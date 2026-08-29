# 🍌 banango

Buscador de compras con IA para España. Escribes en lenguaje natural
(«camisa amarilla por menos de 30€») y banango busca a la vez en las
20 grandes tiendas online; cada resultado abre la tienda oficial en una
pestaña nueva con tu enlace de afiliado para completar la compra allí.

Diseño *liquid glass* (glassmorphism): fondo aurora pastel y paneles de
cristal esmerilado.

## Arranque rápido

```bash
cd banango
npm install
npm run dev   # http://localhost:3000
```

Sin configurar nada funciona en **modo demo**: un catálogo de muestra de
las 20 tiendas para ver el producto de punta a punta. Cada clave que
añadas en `.env.local` (copia `.env.example`) **enciende sola** su fuente
real y apaga la parte demo correspondiente.

## Cómo funciona

```
consulta ("camisa amarilla")
   │
   ▼
src/lib/ai/understand.ts      → interpreta la consulta
   • con ANTHROPIC_API_KEY: Claude (sinónimos, colores, precios, intención)
   • sin clave / si falla:  heurística local en español (heuristics.ts)
   │
   ▼
src/lib/stores/registry.ts    → lanza en paralelo los adaptadores activos
   ├─ demo.ts          catálogo de muestra (se apaga tienda a tienda)
   ├─ ebay.ts          eBay Browse API (en vivo)
   ├─ etsy.ts          Etsy Open API v3 (en vivo)
   ├─ tradedoubler.ts  Products API: MediaMarkt… (en vivo)
   └─ awin.ts          feeds ingeridos: El Corte Inglés, Leroy Merlin,
                       ManoMano, Shein, Decathlon… (índice local)
   │
   ▼
rank() fusiona y puntúa (color, palabras del título, precio, descuento)
   │
   ▼
UI: tarjetas de cristal → clic → tienda oficial en pestaña nueva
    (rel="sponsored nofollow"; nunca iframes: los contratos de afiliación
    lo prohíben y las tiendas lo bloquean con X-Frame-Options)
```

## Activar cada tienda (cuando lleguen las aprobaciones)

| Fuente | Tiendas | Pasos |
|---|---|---|
| **eBay** | eBay | App gratis en [developer.ebay.com](https://developer.ebay.com) → `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET`. Para comisión: alta en eBay Partner Network → `EBAY_EPN_CAMPAIGN_ID`. |
| **Etsy** | Etsy | App en [etsy.com/developers](https://www.etsy.com/developers) (revisión ~24-48 h) → `ETSY_API_KEY`. |
| **Tradedoubler** | MediaMarkt | Alta como publisher en tradedoubler.com → aprobación del programa MediaMarkt ES → token en `TRADEDOUBLER_TOKEN`. |
| **Awin** | El Corte Inglés, PcComponentes, Carrefour, Leroy Merlin, Decathlon, Fnac, Shein, Miravia, ManoMano, Mango, Druni, Primor, Sprinter, Zooplus | Alta como publisher en awin.com → solicitar cada programa → clave Create-a-Feed → `npm run ingest:awin -- --list`, configurar `AWIN_FEEDS` y `npm run ingest:awin`. |
| **TradeTracker** | Worten | Alta en tradetracker.com (ES) → aceptación campaña Worten → exportar feed y guardarlo como `data/feeds/worten.json` (mismo formato que la ingesta Awin). |
| **Rakuten** | H&M | Alta en Rakuten Advertising → catálogo de producto → convertir a `data/feeds/hm.json`. |
| **AliExpress** | AliExpress | Programa de afiliados en portals.aliexpress.com + app en el Open Platform. El adaptador aún no está escrito (las peticiones van firmadas); hueco previsto en `src/lib/stores/`. |

Pendientes conocidos: Amazon (su Creators API exige ≥10 ventas/30 días —
se integrará cuando banango genere ventas con enlaces normales de
Afiliados), Inditex/Zara (API real pero acceso restringido; solicitado).

## IA

- Intérprete de consultas: `claude-opus-5` por defecto
  (`BANANGO_AI_MODEL` para cambiarlo). Una llamada corta por búsqueda;
  si no hay clave o falla, la heurística local responde igual.
- Siguiente paso natural: búsqueda semántica sobre los feeds ingeridos
  (embeddings) y re-ranking con Claude de los 60 primeros resultados.

## Producción

- Los feeds grandes (ManoMano tiene 16M de productos) no caben en el
  índice en memoria: sustituir `awin.ts` por Meilisearch/Typesense
  manteniendo la interfaz `SearchAdapter`.
- Programar `npm run ingest:awin` (cron diario: Awin refresca ~cada 24 h).
- Desplegable en Vercel tal cual (`banango/` como raíz del proyecto).
