// Service worker: cache app shell để mở PWA nhanh / offline. __BUILD__ được deploy.sh thay bằng timestamp.
const CACHE = 'yuhtahntax-__BUILD__';
const SHELL = [
  './', 'index.html', 'app.js', 'tax.js', 'db.js', 'datafile.js', 'export.js',
  'fonts/BeVietnamPro-400Regular.ttf', 'fonts/BeVietnamPro-700Bold.ttf', 'pwa.js', 'nozoom.js', 'base.css', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
// Thư viện CDN: stale-while-revalidate (thêm host nếu dùng thư viện khác)
const CDN = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // File của app: ưu tiên mạng để luôn lấy bản mới, offline thì dùng cache
  if (url.origin === location.origin) {
    // cache: 'no-cache' → luôn hỏi lại server (không dùng bản HTTP cache cũ của trình duyệt)
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
    return;
  }

  if (CDN.includes(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const cached = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || net;
    }));
  }
  // Còn lại (API Firebase/googleapis, …) để trình duyệt tự xử lý
});
