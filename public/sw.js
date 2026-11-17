// Minimal App-Shell Service Worker for PWA Installability ("Add to Home screen").
// Private portal data, API calls, and Supabase requests are NEVER cached offline.

const SHELL_CACHE = "bin-plumbing-shell-v4";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/images/logo/flowguard-icon.jpg"]).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // Never intercept or cache private portals, API routes, or external requests
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/customer") ||
    url.pathname.startsWith("/plumber") ||
    url.pathname.startsWith("/api")
  ) {
    return;
  }

  // Network-first for static app shell assets
  if (url.pathname.startsWith("/images/")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
