const BRACKETS_DEMO_CACHE = 'brackets-demo-v0.95.0';
const OFFLINE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/robots.txt',
  '/framework/runtime.js',
  '/framework/datastar.js',
  '/framework/syntax.js',
  '/framework/version.js',
  '/app/styles.css',
  '/app/logo.svg',
  '/app/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(BRACKETS_DEMO_CACHE);
    await cache.addAll(OFFLINE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key !== BRACKETS_DEMO_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(BRACKETS_DEMO_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response && response.ok && new URL(request.url).origin === self.location.origin) {
        cache.put(request, response.clone()).catch(() => null);
      }
      return response;
    } catch {
      return cached ?? Response.error();
    }
  })());
});
