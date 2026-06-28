// FAROUT — minimal service worker.
//
// Goals:
//   1) Make the app installable + give a fast warm start (cache shell).
//   2) Never serve stale NASA data — /api/* and external NASA images always
//      go to the network; cache only the static shell.
//   3) Stay tiny — no fancy strategies; one shell cache + a runtime image cache.
//
// Bump CACHE_VERSION on every release so old shells get evicted.
const CACHE_VERSION = "farout-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // API: always live, never cached. We want fresh NASA data, every load.
  if (url.pathname.startsWith("/api/")) return;

  // External NASA images (APOD, EPIC, NASA Image Library, Mars rovers):
  // pass through. Browser HTTP cache + CDN are already doing the right thing.
  if (url.origin !== self.location.origin) return;

  // Same-origin shell: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
