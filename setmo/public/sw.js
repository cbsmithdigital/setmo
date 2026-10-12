// SetMo service worker — deliberately small.
//
// Two jobs. When the phone has no connection, show a friendly offline screen
// instead of the browser's error page. And show SetMo's phone notifications
// (score ready, goal reached, low tokens, practice reminders), opening the right
// screen when one is tapped. It never caches pages or API responses (practice
// data stays on the server, and a stale screen is worse than none), and it
// touches nothing but page loads and the offline screen's own icon — calls,
// scoring and every API request go straight to the network as if it weren't
// here.

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

// ---- notifications ----

// Safari (iPhone, iPad, Mac) must show a notification for every push or it
// stops delivering them, so "skip while the app is open" is for other browsers.
const UA = self.navigator.userAgent;
const SAFARI = /iPhone|iPad|iPod|Macintosh/.test(UA) && /Safari/.test(UA) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(UA);

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: "SetMo", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      if (msg.skipIfVisible && !SAFARI) {
        const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (open.some((c) => c.visibilityState === "visible")) return;
      }
      await self.registration.showNotification(msg.title || "SetMo", {
        body: msg.body || "",
        icon: OFFLINE_ICON,
        tag: msg.tag || undefined,
        data: { url: msg.url || "/go" },
      });
    })()
  );
});

// Tapping one opens its screen — in the SetMo window already open, if there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/go", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of open) {
        if (new URL(c.url).origin !== self.location.origin) continue;
        await c.focus();
        if ("navigate" in c) {
          try {
            await c.navigate(url);
            return;
          } catch {
            /* not controlled by this worker — open a window instead */
          }
        }
        break;
      }
      await self.clients.openWindow(url);
    })()
  );
});

// The browser rotated this device's push registration: sign the new one up so
// notifications keep arriving without the person doing anything.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch("/api/push");
      const { publicKey } = await res.json();
      if (!publicKey) return;
      const pad = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + pad).replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
    })()
  );
});
