// Service worker: caches the app shell and data so the app opens offline.
// Stale-while-revalidate: serve from cache, refresh in the background.
const CACHE = 'grass-owed-v2';
const ASSETS = [
  './', 'index.html', 'style.css', 'core.js', 'app.js', 'manifest.webmanifest',
  'data/comfort_table.json', 'data/nudge_bank.json',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request)
        .then((res) => { if (res && res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => null);
      e.waitUntil(net);
      return hit || (await net) || (await cache.match('index.html'));
    })
  );
});
