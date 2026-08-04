// Noor al-Quran — service worker
// Strategy:
//   - App shell (HTML/CSS/JS/icon/manifest): cache-first, updated in background
//   - Al-Quran Cloud API: network-first, fall back to cache when offline
//   - Google Fonts (CSS + font files): cache-first with runtime cache
//   - Audio CDN: pass through (files are large; browser handles its own cache)

const VERSION = 'nq-v3';
const SHELL   = 'nq-shell-'   + VERSION;
const RUNTIME = 'nq-runtime-' + VERSION;

const APP_SHELL_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(APP_SHELL_URLS))
                      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Don't cache audio streams — they're big and range requests get weird.
  if (url.hostname === 'cdn.islamic.network') return;

  // API — network first, cache fallback
  if (url.hostname === 'api.alquran.cloud') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Google Fonts (CSS + files) — cache first, runtime cached
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  // App shell (same origin) — cache first with background revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, SHELL, /*revalidate*/ true));
    return;
  }
});

async function networkFirst(req){
  const cache = await caches.open(RUNTIME);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ code: 0, status: 'Offline', data: null }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(req, cacheName, revalidate = false){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && res.status === 200 && res.type !== 'opaque') cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (cached) {
    if (revalidate) network; // fire-and-forget background update
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  return new Response('Offline', { status: 503 });
}

// Allow the page to trigger an immediate update
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
