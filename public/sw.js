const CACHE_NAME = 'workout-shell-v5';
const APP_SHELL = ['/', '/privacy', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('/'))));
    return;
  }

  if (request.destination === 'script') {
    const refreshed = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    });
    event.respondWith(refreshed.catch(async () => (await caches.match(request)) || Response.error()));
    return;
  }

  if (['style', 'image', 'font'].includes(request.destination)) {
    const refreshed = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    });
    event.respondWith(caches.match(request).then((cached) => cached || refreshed));
    event.waitUntil(refreshed.then(() => undefined).catch(() => undefined));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { payload = { body: event.data?.text() ?? '' }; }
  const title = payload.title || 'Workout reminder';
  const options = {
    body: payload.body || 'Open Workout to see today’s plan.',
    icon: payload.icon || '/icons/workout-192.png',
    badge: payload.badge || '/icons/workout-192.png',
    tag: payload.tag || 'workout-reminder',
    renotify: false,
    data: { url: payload.url || '/' },
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    typeof self.navigator.setAppBadge === 'function' ? self.navigator.setAppBadge(1) : Promise.resolve(),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
