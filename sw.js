// Офлайн-оболочка: файлы приложения берём из сети, а без сети из кэша. Запросы к серверу не кэшируем.
const CACHE = 'ballet-forever-v5';
const FILES = ['./', 'index.html', 'me/', 'me/index.html', 'config.js', 'vendor/supabase.js', 'assets/style.css', 'assets/core.js', 'assets/store.js', 'assets/app.js', 'assets/me.js', 'assets/ballerina.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // no-cache: всегда спрашиваем сервер, не изменились ли файлы, чтобы обновления приходили сразу
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(r => {
    if (r.redirected) return Response.redirect(r.url, 302);
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
