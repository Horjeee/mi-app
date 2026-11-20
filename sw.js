const CACHE_NAME = 'midia-pwa-cache-v3';
const CORE_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './manifest.webmanifest',
    './js/utils.js',
    './js/state.js',
    './js/tasks.js',
    './js/calendar.js',
    './js/alerts.js',
    './js/fitness.js',
    './js/run.js',
    './js/ui.js',
    './js/app.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // No cachear peticiones de geocodificación ni tiles dinámicos
    if (url.hostname.includes('nominatim.openstreetmap.org') || url.hostname.includes('tile.openstreetmap.org')) {
        return;
    }

    event.respondWith(
        caches.match(req).then((cached) => {
            const networkFetch = fetch(req)
                .then((res) => {
                    if (res && res.status === 200 && (url.origin === location.origin || url.hostname.includes('unpkg.com'))) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || networkFetch;
        })
    );
});
