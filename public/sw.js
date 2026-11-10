/* Offline support for the home-screen web app.
 * Pages: network first (so updates arrive), falling back to the cached copy offline.
 * Everything else from this site (hashed JS bundle, Skia's WebAssembly, icons): cache first. */
const CACHE = 'collage-studio-v1';

// Cache the whole app on install (page, hashed JS bundle, Skia's WebAssembly, icons),
// so it opens offline from the very first visit.
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch('./', { cache: 'no-cache' });
      const html = await res.clone().text();
      await cache.put('./', res);
      const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|png|ico|webmanifest))"/g)]
        .map((m) => m[1])
        .filter((u) => !/^https?:/.test(u));
      await cache.addAll([...new Set([...assets, 'canvaskit.wasm'])]).catch(() => {});
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
