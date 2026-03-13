// Firebase Messaging Service Worker
// Handles background push notifications when the app tab is not in focus.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDqAmfnm2MvwiCeXwaaL7KHgfVV_2GOlLI',
  authDomain: 'gudu-stokvel.firebaseapp.com',
  projectId: 'gudu-stokvel',
  storageBucket: 'gudu-stokvel.firebasestorage.app',
  messagingSenderId: '749807897730',
  appId: '1:749807897730:web:923b8692753cc467eaf89b',
});

const messaging = firebase.messaging();

// Background message handler — fires when tab is not focused
messaging.onBackgroundMessage((payload) => {
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

// Notification click — open/focus the app at the right page
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
