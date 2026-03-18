// ─── Gudu Stokvel Service Worker ─────────────────────────────────────────────
// Strategy: Network-first (finance app must always serve fresh data).
// Caches the app shell for offline fallback and PWA installability.
// Also handles Firebase Cloud Messaging (FCM) background push notifications.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ─── Firebase init (required for FCM background messages) ────────────────────
firebase.initializeApp({
  apiKey: 'AIzaSyDqAmfnm2MvwiCeXwaaL7KHgfVV_2GOlLI',
  authDomain: 'gudu-stokvel.firebaseapp.com',
  projectId: 'gudu-stokvel',
  storageBucket: 'gudu-stokvel.firebasestorage.app',
  messagingSenderId: '749807897730',
  appId: '1:749807897730:web:923b8692753cc467eaf89b',
});

const fcmMessaging = firebase.messaging();

// FCM background message handler — fires when tab is not focused
fcmMessaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  const data = payload.data ?? {};
  self.registration.showNotification(title ?? 'Gudu', {
    body: body ?? '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: { url: `/${data.navigateTo ?? 'dashboard'}` },
  });
});

// ─── Cache config ─────────────────────────────────────────────────────────────
const CACHE_NAME = 'gudu-v1';
const APP_SHELL = ['/', '/dashboard', '/activity', '/loans', '/profile'];
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'cloudfunctions.net',
  'paystack.co',
  'gstatic.com',
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {})
    )
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
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
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (BYPASS_HOSTS.some((host) => url.hostname.includes(host))) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
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
        caches.match(request).then(
          (cached) =>
            cached ??
            (request.mode === 'navigate' ? caches.match('/') : Response.error())
        )
      )
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
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            return client.navigate(targetUrl);
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});
