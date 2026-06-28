// FAROUT service worker — minimal offline shell.
//
// Strategy:
//   • App shell (index.html + manifest + icons): stale-while-revalidate against
//     a versioned cache, so the offline app boots while the network refreshes.
//   • /api/* (NASA proxy): network-only. NASA imagery is the point of the app —
//     a stale asteroid count is misleading.
//   • Cross-origin imagery (epic.gsfc.nasa.gov, NASA image library, APOD CDN):
//     cache-first with a runtime cap, so revisiting a day's exhibition works
//     even when the network is gone.
//
// Bumping CACHE_VERSION drops all old caches on the next activation.

const CACHE_VERSION = 'farout-v1';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const RUNTIME_LIMIT = 60;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((req) => cache.delete(req)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache the NASA proxy — freshness matters and the data shifts daily.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // App shell: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      const fetchPromise = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
    return;
  }

  // Cross-origin NASA imagery: cache-first with a small runtime cap.
  const isImageHost =
    url.hostname.endsWith('nasa.gov') ||
    url.hostname.endsWith('gsfc.nasa.gov') ||
    url.hostname === 'apod.nasa.gov' ||
    url.hostname === 'images-assets.nasa.gov';

  if (isImageHost) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          cache.put(req, res.clone());
          trimCache(RUNTIME_CACHE, RUNTIME_LIMIT);
        }
        return res;
      } catch (err) {
        return cached || Response.error();
      }
    })());
  }
});
