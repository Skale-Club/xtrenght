// Minimal, deliberately conservative service worker.
//
// It never caches authenticated/dynamic HTML or API responses -- only the
// static offline fallback page and hashed, immutable Next.js build assets.
// Bump CACHE_VERSION whenever this file's caching behaviour changes; the
// activate handler drops every cache that doesn't match the new name.
const CACHE_VERSION = "v1";
const STATIC_CACHE = `xtrenght-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever handle same-origin GETs. Everything else (Supabase requests,
  // POSTed Server Actions, cross-origin calls) falls through to the network
  // untouched -- respondWith is never called for them.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const isHashedAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/manifest-icons/");
  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});
