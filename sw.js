/* Source2Pay service worker – offline cache of the static prototype (PWA). */
const CACHE = 'source2pay-v10';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'assets/icon.svg', 'css/tokens.css', 'css/components.css', 'css/app.css', 'js/main.js', 'js/core/util.js', 'js/core/config.js', 'js/core/store.js', 'js/core/notify.js', 'js/core/engine.js', 'js/core/services-onb.js', 'js/core/services-src.js', 'js/core/services-exec.js', 'js/core/services-gov.js', 'js/core/seed.js', 'js/ui/ui.js', 'js/ui/app.js', 'js/pages/home.js', 'js/pages/onboarding.js', 'js/pages/vendors.js', 'js/pages/rfq.js', 'js/pages/pan.js', 'js/pages/exec.js', 'js/pages/finance.js', 'js/pages/insights.js', 'js/pages/admin.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)).catch(() => {}); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
