// SetMo service worker — deliberately small.
//
// Its one job: when the phone has no connection, show a friendly offline screen
// instead of the browser's error page. It never caches pages or API responses
// (practice data stays on the server, and a stale screen is worse than none),
// and it touches nothing but page loads and the offline screen's own icon —
// calls, scoring and every API request go straight to the network as if it
// weren't here.

const CACHE = "setmo-offline-v2";
const OFFLINE_URL = "/offline";
const OFFLINE_ICON = "/icons/icon-192.png";
const PRECACHE = [OFFLINE_URL, OFFLINE_ICON];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Page loads start on the network while the worker boots, so it never
      // slows a normal visit down.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          return await fetch(req);
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })()
    );
    return;
  }

  // The offline screen's icon: from the network when there is one.
  if (new URL(req.url).pathname === OFFLINE_ICON) {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_ICON).then((res) => res || Response.error())));
  }
});
