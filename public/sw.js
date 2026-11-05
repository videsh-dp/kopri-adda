/* Kopri Manager service worker: offline app shell.
   All data lives in localStorage, so once the shell is cached the whole app
   works offline. Paths are relative to this file, so it works at "/" and at
   a sub-path such as GitHub Pages' "/kopri-adda/". */
const VERSION = "v1";
const CACHE = `kopri-shell-${VERSION}`;
const SCOPE = self.registration.scope; // e.g. https://x.github.io/kopri-adda/
const INDEX = new URL("index.html", SCOPE).href;
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon.svg"].map(
  (p) => new URL(p, SCOPE).href
);

// Cache index.html plus the hashed JS/CSS it references, so the very first
// visit is enough to work offline afterwards.
async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(SHELL.map((u) => cache.add(u).catch(() => {})));
  try {
    const html = await (await fetch(INDEX, { cache: "no-store" })).text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => new URL(m[1], INDEX).href);
    await Promise.all(assets.map((u) => cache.add(u).catch(() => {})));
  } catch {
    /* offline during install: runtime caching will fill in later */
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kopri-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;

  // Page loads (any route, e.g. /loans/l6): network first so updates show up,
  // fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(INDEX, copy));
          }
          return res;
        })
        .catch(() => caches.match(INDEX).then((r) => r || caches.match(new URL("./", SCOPE).href)))
    );
    return;
  }

  // Static files: hashed assets never change, so cache first.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
