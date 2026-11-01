/* NexNotes service worker — installable PWA shell cache.
 * Strategy: network-first with cache fallback for navigations and static
 * assets; API calls always hit the network (IndexedDB handles offline data).
 */
const CACHE = "nexnotes-shell-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // never cache API traffic
  if (url.pathname.startsWith("/api/")) return;

  // navigations (the app shell) are network-first — users always get the
  // latest build; only offline falls back to cache. Assets stay SWR.
  const isNav = req.mode === "navigate" || url.pathname === "/";
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok && (url.pathname.startsWith("/_next/") || url.pathname === "/" || url.pathname.startsWith("/icons/"))) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return isNav ? network.catch(() => cached) || network : cached || network;
    })()
  );
});
