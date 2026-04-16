/**
 * Brackets — optional root service worker (copy-paste template)
 *
 * Interacts with: docs/guide.md (offline / PWA section), framework/runtime.js (auto-registration),
 *   your entry folder's index.html (same origin as this script when served as `/service-worker.js`).
 *
 * HOW TO USE
 * 1. Copy this file to your **entry root** (same folder as `index.html` for your `config.yaml`
 *    `entry.folder`), keeping the filename **`service-worker.js`**.
 * 2. Edit `CACHE_NAME` whenever you change the precache list so clients drop old caches (see
 *    https://developer.mozilla.org/en-US/docs/Web/API/Cache ).
 * 3. Edit `OFFLINE_ASSETS`: every URL must be a **same-origin** path your host actually serves.
 *    Wrong or missing URLs can make `install` fail — trim the list to what you need, then grow it.
 * 4. The Brackets runtime only registers the worker on **trustworthy** origins (not opaque
 *    `file://`); see runtime `navigator.serviceWorker.register('/service-worker.js')`.
 *
 * This is **not** required for Brackets to work; it is an add-on for offline / installable UX.
 */

/** Bump this string when you change `OFFLINE_ASSETS` so old caches are deleted in `activate`. */
const CACHE_NAME = 'brackets-example-offline-v1';

/**
 * Precached GET URLs. Must match paths your app serves at runtime (same origin as the page).
 * Start minimal (e.g. `/`, `/manifest.webmanifest`, `/robots.txt`) and add app assets as needed.
 */
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
    const cache = await caches.open(CACHE_NAME);
    // Precache shell assets. If any URL fails (404/CORS), install fails — fix OFFLINE_ASSETS.
    await cache.addAll(OFFLINE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
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
