/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = 'studio-app-shell-__STUDIO_BUILD_ID__';
const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/studio-icon.svg',
  '/studio-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
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
            .filter((key) => key.startsWith('studio-app-shell-') && key !== CACHE_VERSION)
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
    ['script', 'style', 'font'].includes(request.destination);
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
