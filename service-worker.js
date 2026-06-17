const CACHE_VERSION = "cortex-v4";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Only cache truly static assets (fonts, icons)
// HTML, CSS, JS are always fetched fresh from network
const PRECACHE_ASSETS = ["/manifest.json", "/icons/cortex-logo.svg"];

// Install
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => {})),
  );
  self.skipWaiting();
});

// Activate — delete ALL old caches immediately
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// Fetch strategy:
// - HTML pages: always network, never cache
// - CSS/JS: network first, short timeout, fallback cache
// - API/auth: bypass completely
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Always bypass for API, auth, and Google resources
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.hostname.includes("google") ||
    url.hostname.includes("googleapis")
  )
    return;

  // HTML — always network, no cache
  if (
    e.request.headers.get("accept")?.includes("text/html") ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html")
  ) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // CSS / JS — network first, update cache, fallback to cache
  if (url.pathname.endsWith(".css") || url.pathname.endsWith(".js")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches
            .open(STATIC_CACHE)
            .then((cache) => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }

  // Everything else — cache first
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((res) => {
          const clone = res.clone();
          caches
            .open(STATIC_CACHE)
            .then((cache) => cache.put(e.request, clone));
          return res;
        }),
    ),
  );
});
