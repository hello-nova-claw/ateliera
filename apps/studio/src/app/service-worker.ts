/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;
declare const __STUDIO_PRECACHE_MANIFEST__: unknown;

const CACHE_VERSION = 'studio-app-shell-__STUDIO_BUILD_ID__';
const PRECACHE_ENTRIES = __STUDIO_PRECACHE_MANIFEST__ as ReadonlyArray<{
  url: string;
  revision: string;
}>;
const PRECACHE_PATHS = new Set(
  PRECACHE_ENTRIES.map(({ url }) => new URL(url, self.location.origin).pathname),
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_ENTRIES.map(({ url }) => url)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('studio-app-shell-') && key !== CACHE_VERSION,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isAppShellRequest =
    request.mode === 'navigate' ||
    (url.search === '' && PRECACHE_PATHS.has(url.pathname)) ||
    (url.pathname === '/studio-precache-manifest.json' && url.search === '');
  if (!isAppShellRequest) return;
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(async (cached) => {
      if (cached !== undefined) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (request.mode === 'navigate') {
          const shell = await caches.match('/', { ignoreVary: true });
          if (shell !== undefined) return shell;
        }
        throw error;
      }
    }),
  );
});

export {};
