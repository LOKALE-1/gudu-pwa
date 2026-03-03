// ─── Gudu Stokvel Service Worker ─────────────────────────────────────────────
// Strategy: Network-first (finance app must always serve fresh data).
// Caches the app shell for offline fallback and PWA installability.

const CACHE_NAME = 'gudu-v1';

// App shell routes — cached on install for offline fallback
const APP_SHELL = ['/', '/dashboard', '/activity', '/loans', '/profile'];

// ─── Hosts to NEVER cache — always go to network ──────────────────────────────
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'cloudfunctions.net',
  'paystack.co',
];

// ─── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting(); // activate immediately, don't wait for old SW to die
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {
        // Silently ignore — app shell caching is best-effort
      })
    )
  );
});

// ─── Activate: purge stale caches from previous versions ─────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: network-first with cache fallback ─────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Bypass all Firebase / API / payment endpoints — never cache
  if (BYPASS_HOSTS.some((host) => url.hostname.includes(host))) return;

  // Only handle same-origin requests (our Next.js pages + static assets)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Cache successful navigation responses (HTML pages)
        if (
          networkResponse.ok &&
          (request.mode === 'navigate' || request.destination === 'document')
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() =>
        // Network failed — try the cache
        caches.match(request).then(
          (cached) =>
            cached ??
            // Ultimate fallback: serve the root page for navigation requests
            (request.mode === 'navigate'
              ? caches.match('/')
              : Response.error())
        )
      )
  );
});

// ─── Push notifications (ready for Firebase Cloud Messaging) ─────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Gudu', body: event.data.text() };
  }

  const options = {
    body: payload.body ?? '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: { url: payload.url ?? '/dashboard' },
    actions: payload.actions ?? [],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Gudu', options)
  );
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/dashboard';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If an existing window is open, focus it and navigate
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            return client.navigate(targetUrl);
          }
        }
        // Otherwise open a new window
        return clients.openWindow(targetUrl);
      })
  );
});
