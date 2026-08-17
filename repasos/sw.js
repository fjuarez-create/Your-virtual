/* ═══════════════════════════════════════════════════════════════
   sw.js — caché del armazón de la app.

   Solo se cachea el código: HTML, CSS, JS, tipografía e iconos. Los
   datos y los medios NO pasan por aquí (los guarda IndexedDB, que es
   quien sabe qué está subido y qué no). Así el service worker nunca
   sirve un repaso viejo por error.

   VERSION la sella el despliegue con el SHA del commit: al cambiar,
   la caché anterior se borra entera y no quedan mezclas de versiones.
   ═══════════════════════════════════════════════════════════════ */
const VERSION = '__BUILD__';
const CACHE = 'unik-repasos-' + VERSION;

const ARMAZON = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css?v=' + VERSION,
  'js/app.js?v=' + VERSION,
  'js/ui.js',
  'js/iconos.js',
  'js/db.js',
  'js/api.js',
  'js/store.js',
  'js/media.js',
  'js/recorrido.js',
  'js/piezas.js',
  'js/catalog.js',
  'js/informe.js',
  'js/pdf.js',
  'js/views/entrar.js',
  'js/views/inicio.js',
  'js/views/promociones.js',
  'js/views/viviendas.js',
  'js/views/listas.js',
  'js/views/recorrido.js',
  'js/views/tareas.js',
  'js/views/tarea.js',
  'js/views/historial.js',
  'js/views/ajustes.js',
  'js/views/usuarios.js',
  'assets/fonts/opensans-var.woff2',
  'assets/fonts/inter-tight-latin-400-normal.woff2',
  'assets/fonts/inter-tight-latin-500-normal.woff2',
  'assets/fonts/inter-tight-latin-600-normal.woff2',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/logo/marca-unik.png',
  'assets/logo/marca-check.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll falla entero si un solo fichero falla; se añade uno a uno
    // para que un icono ausente no deje la app sin caché.
    await Promise.all(ARMAZON.map((u) => cache.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Todo lo que cuelga de api/ va siempre a la red: son datos vivos y
  // fotos con sesión, y una copia cacheada solo puede confundir.
  if (url.pathname.includes('/api/')) return;

  // Navegación: red primero para recoger despliegues nuevos; si no hay
  // red, el index cacheado abre la app y IndexedDB pone los datos.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Resto del armazón: caché primero (está versionada por CACHE).
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(req, { ignoreSearch: false });
    if (guardada) return guardada;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      const porRuta = await cache.match(req, { ignoreSearch: true });
      if (porRuta) return porRuta;
      throw new Error('sin red y sin caché');
    }
  })());
});
