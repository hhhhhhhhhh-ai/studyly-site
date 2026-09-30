/* Minimal service worker so browsers offer "Install app". Network-first, no caching surprises. */
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){ e.respondWith(fetch(e.request).catch(function(){ return caches.match(e.request); })); });
