/* La Paulée de Berlin 2026 – Service Worker
   Speichert die komplette App beim ersten Öffnen; danach läuft alles ohne Empfang.
   VERSION und ASSETS werden von tools/stamp.py gesetzt. */
const VERSION = '__VERSION__';
const ASSETS = __ASSETS__;
const CACHE = 'paulee-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('paulee-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Umgeleitete Antworten dürfen für Seitenaufrufe nicht direkt verwendet werden
function clean(res) {
  if (!res.redirected) return res;
  return res.blob().then(b => new Response(b, { status: 200, headers: res.headers }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // Bestellannahme (Google) nie aus dem Cache
  if (req.mode === 'navigate') {
    // Seitenaufruf: immer die gespeicherte App (Cloudflare leitet /index.html auf / um)
    e.respondWith(caches.match('/').then(r => r ? clean(r) : fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
