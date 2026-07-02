/* ══════════════════════════════════════════════════════════════════════════════
   Ocean Fast Ferries · V500 ULTRA — Service Worker
   ══════════════════════════════════════════════════════════════════════════════ */

const CACHE = 'off-v500-cache';
const APP_VERSION = 'V500';
const BASE = '/ocean-ferries-pro';

const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/styles.css`,
  `${BASE}/app.js`,
  `${BASE}/data.js`,
  `${BASE}/utils.js`,
  `${BASE}/map.js`,
  `${BASE}/sw.js`,
  `${BASE}/manifest.json`
];

const CDN_HOSTS = [
  'unpkg.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Install: pre-cache app assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
  console.log(`SW ${APP_VERSION} installed`);
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
  // Notify clients of version update
  self.clients.matchAll().then(clients => {
    clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: APP_VERSION }));
  });
  console.log(`SW ${APP_VERSION} activated`);
});

// Fetch: network-first for app assets, stale-while-revalidate for CDN
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isAppAsset = ASSETS.some(a => url.pathname.endsWith(a.replace(BASE, '')));
  const isCDN = CDN_HOSTS.some(h => url.hostname.includes(h));

  if (isAppAsset) {
    // Network-first for app assets (to get latest version)
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
  } else if (isCDN) {
    // Stale-while-revalidate for CDN
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  } else {
    // Default: try network, fall back to cache
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
