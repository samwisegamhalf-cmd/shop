/**
 * Minimal PWA worker: do NOT cache HTML navigations ("/") — that breaks auth
 * redirects and RSC after a single bad response was cached. Incognito often
 * looks "fine" because no stale service worker cache.
 */
const CACHE_NAME = "shop-list-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add("/manifest.webmanifest").catch(() => undefined)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Intentionally no "fetch" handler: all requests go to the network.
// Manifest is precached for offline icon/install UX only.
