// Service worker: оболочка приложения работает офлайн. Данные репо — в IndexedDB (не здесь).
// При выпуске новой версии увеличь VERSION — старый кэш удалится.
const VERSION = 'v1';
const CACHE = 'mt-shell-' + VERSION;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/data.js', 'js/db.js', 'js/fsrs.js', 'js/github.js', 'js/md.js', 'js/ui.js',
  'js/views/home.js', 'js/views/review.js', 'js/views/library.js', 'js/views/glossary.js',
  'js/views/progress.js', 'js/views/exam.js', 'js/views/upload.js', 'js/views/more.js', 'js/views/settings.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'demo/files.json', 'demo/courses.json', 'demo/glossary.md',
  'demo/cards/demo/2026-11-01_demo-ecdis.json', 'demo/notes/demo/2026-11-01_demo-ecdis.md',
  'demo/lectures/demo/2026-11-01_demo-ecdis.md',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('mt-shell-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Свои файлы: сначала кэш (мгновенно и офлайн), в фоне — обновление кэша.
// Чужие адреса (api.github.com) — всегда сеть, не кэшируем (там приватные данные и токен).
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (url.pathname.endsWith('/') ? c.match('index.html') : Response.error());
  }));
});
