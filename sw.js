/* text-to-link service worker: the pages and assets of this build are precached,
   at runtime the network wins and the cache is the offline fallback. */
var CACHE = 'ttl-f9f721f3';
var PRECACHE = [
  "/",
  "/privacy/",
  "/uk/",
  "/uk/privacy/",
  "/es/",
  "/es/privacy/",
  "/pt/",
  "/pt/privacy/",
  "/de/",
  "/de/privacy/",
  "/fr/",
  "/fr/privacy/",
  "/pl/",
  "/pl/privacy/",
  "/zh/",
  "/zh/privacy/",
  "/ar/",
  "/ar/privacy/",
  "/id/",
  "/id/privacy/",
  "/ja/",
  "/ja/privacy/",
  "/hi/",
  "/hi/privacy/",
  "/it/",
  "/it/privacy/",
  "/tr/",
  "/tr/privacy/",
  "/nl/",
  "/nl/privacy/",
  "/ko/",
  "/ko/privacy/",
  "/assets/style.css?v=736df128",
  "/assets/chrome.js?v=6a15fe14",
  "/assets/core.js?v=429b31f6",
  "/assets/app.js?v=d1877d73",
  "/assets/qrcode.js?v=6e6189e2",
  "/favicon.svg"
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k.indexOf('ttl-') === 0 && k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  var nav = req.mode === 'navigate';

  e.respondWith(
    fetch(req).then(function (res) {
      if (res.ok && !res.redirected) {
        var copy = res.clone();
        // one cached copy per page, whatever the ?url=&text= query is
        caches.open(CACHE).then(function (cache) { cache.put(nav ? url.pathname : req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(nav ? url.pathname : req).then(function (hit) {
        return hit || (nav ? caches.match('/') : Response.error());
      });
    })
  );
});
