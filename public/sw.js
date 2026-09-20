const CACHE_NAME = 'seven-private-drive-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through to network for dynamic data
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
