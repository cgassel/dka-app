// ============================================================================
// sw.js — service worker for offline support
// Caches static assets (HTML/CSS/JS/icons) so the app shell loads offline.
// API calls to Apps Script are NOT cached — those always need a live network
// connection since they read/write live booking data.
// ============================================================================

const CACHE_NAME = 'dka-app-v3';
const STATIC_ASSETS = [
  './index.html',
  './api.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/dka-logo.png',
  './icons/apple-touch-icon.png',
  // Agent pages
  './agent-dashboard.html',   './agent-dashboard.js',
  './band-directory.html',    './band-directory.js',
  './venue-directory.html',   './venue-directory.js',
  './add-band.html',          './add-band.js',
  './add-venue.html',         './add-venue.js',
  './venue-map.html',         './venue-map.js',
  './booking-calendar.html',  './booking-calendar.js',
  './create-booking.html',    './create-booking.js',
  './my-bookings.html',       './my-bookings.js',
  './contracts.html',         './contracts.js',
  './band-stats.html',        './band-stats.js',
  // Venue pages
  './venue-calendar.html',        './venue-calendar.js',
  './venue-schedule.html',        './venue-schedule.js',
  './venue-booking-request.html', './venue-booking-request.js',
  // Band pages
  './band-portal.html',       './band-portal.js',
  // Admin pages
  './admin-dashboard.html',   './admin-dashboard.js',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('Service worker: failed to cache', url, err);
          });
        })
      );
    })
  );
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
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  if (event.request.url.indexOf('script.google.com') !== -1) return;

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (response.ok && event.request.url.indexOf(self.location.origin) === 0) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(function() {
        return cached;
      });
    })
  );
});
