// ============================================================================
// sw.js — service worker for offline support
// Caches static assets (HTML/CSS/JS/icons) so the app shell loads offline.
// API calls to Apps Script are NOT cached — those always need a live network
// connection since they read/write live booking data.
// ============================================================================

const CACHE_NAME = 'dka-app-v1';
const STATIC_ASSETS = [
  './index.html',
  './agent-dashboard.html',
  './agent-dashboard.js',
  './api.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/dka-logo.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  // Never cache Apps Script API calls — always go to network for live data
  if (event.request.url.indexOf('script.google.com') !== -1) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // Cache new static assets as they're fetched (same-origin only)
        if (event.request.method === 'GET' && response.ok && event.request.url.indexOf(self.location.origin) === 0) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(function() {
        // Offline and not cached — nothing more we can do for this request
        return cached;
      });
    })
  );
});
