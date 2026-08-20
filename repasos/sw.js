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
  'js/app.js',
  'js/ui.js',
  'js/iconos.js',
  'js/db.js',
  'js/api.js',
  'js/store.js',
  'js/media.js',
  'js/recorrido.js',
  'js/piezas.js',
  'js/pendientes.js',
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
  'js/views/nuevaTarea.js',
  'js/views/tareasEstado.js',
  'js/views/historial.js',
  'js/views/ajustes.js',
  'js/views/usuarios.js',
  'assets/fonts/neue-haas-display-roman.woff2',
  'assets/fonts/opensans-var.woff2',
  'assets/fonts/inter-tight-latin-400-normal.woff2',
  'assets/fonts/inter-tight-latin-500-normal.woff2',
  'assets/fonts/inter-tight-latin-600-normal.woff2',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/logo/marca-unik.png',
  'assets/logo/marca-check.png',
  'assets/vacio/carpetas.webp',
  // Las caras de los gremios (96×96, unos pocos KB cada una): salen
  // en la hoja de filtros y en las fichas, también sin red.
  'assets/gremios/aire.webp',
  'assets/gremios/carp-aluminio.webp',
  'assets/gremios/barandillas.webp',
  'assets/gremios/cocinas.webp',
  'assets/gremios/electricidad.webp',
  'assets/gremios/fachada.webp',
  'assets/gremios/fontaneria.webp',
  'assets/gremios/jardines.webp',
  'assets/gremios/pavimentos.webp',
  'assets/gremios/pintura.webp',
  'assets/gremios/piscinas.webp',
  'assets/gremios/pladur.webp',
  'assets/gremios/carp-madera.webp',
  'assets/gremios/videoporteros.webp',
  'assets/gremios/rodapies.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll falla entero si un solo fichero falla; se añade uno a uno
    // para que un icono ausente no deje la app sin caché.
    await Promise.all(ARMAZON.map((u) => cache.add(u).catch(() => {})));
  })());
  // AQUÍ NO SE LLAMA A skipWaiting(), Y ES A PROPÓSITO.
  //
  // La versión nueva se queda esperando a que se cierre la aplicación.
  // Si tomara el mando en caliente, la pantalla que ya está abierta
  // seguiría con el código viejo en memoria y las pantallas que se
  // abren después —que se piden en el momento de tocarlas— vendrían de
  // la caché nueva: mitad y mitad. Eso es lo que reventó al entrar en
  // Tareas con «Importing binding name 'menuTarjeta' is not found»: la
  // pantalla era nueva y la pieza que usaba, vieja.
  //
  // Con esto, una sesión entera va con una sola versión de principio a
  // fin, y la nueva entra al abrir la aplicación de nuevo.
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
  })());
  // Tampoco clients.claim(): si esta versión acaba de activarse es
  // porque no quedaba ninguna pantalla abierta, y la primera que se
  // abra ya nace con ella.
});

/* Por si algún día se quiere un botón de «actualizar ahora»: la página
   manda este aviso y la versión nueva toma el mando en el acto. Sin
   nadie que lo mande, no pasa nada. */
self.addEventListener('message', (e) => {
  if (e.data?.tipo === 'saltar-espera') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Todo lo que cuelga de api/ va siempre a la red: son datos vivos y
  // fotos con sesión, y una copia cacheada solo puede confundir.
  if (url.pathname.includes('/api/')) return;

  // Navegación: la portada sale de esta misma caché, no de la red.
  //
  // Parece al revés de lo lógico —¿no habría que ir a por lo último?—
  // pero es justo lo contrario: si el index viniera de la red sería el
  // del despliegue de hace un minuto, mientras el código de la app
  // sigue siendo el de esta caché. Página nueva con aplicación vieja.
  //
  // Lo nuevo entra por su camino: el navegador comprueba este mismo
  // fichero en cada arranque, se instala la versión siguiente y toma
  // el mando cuando la aplicación se cierra. Una versión entera cada
  // vez, nunca media.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const guardada = (await cache.match('index.html')) || (await cache.match('./'));
      if (guardada) return guardada;
      try {
        return await fetch(req);
      } catch {
        return Response.error();
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
