const CACHE_NAME = 'tia-mobile-v10';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/download/app',
  '/download.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/assets/tia_logo_circle.png',
  '/assets/tia_logo_thumb.png',
  '/assets/tia_qr_code.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('PWA Cache prefetch skipped some assets:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] Invalidation of old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass API and WebSocket calls directly to network
  if (event.request.url.includes('/api/') || event.request.url.startsWith('ws') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful network responses
        if (response.status === 200) {
          const respClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
