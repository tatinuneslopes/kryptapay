// KryptaPay Service Worker - PWA & Push Notifications com Logomarca Oficial
const CACHE_NAME = 'kryptapay-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/css/theme.css',
  '/css/components.css',
  '/js/api.js',
  '/js/app.js',
  '/js/globe3d.js',
  '/js/pwa.js',
  '/icons/logo.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('Cache:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => cachedResponse);
    })
  );
});

// Suporte a Web Push Notifications reais com a foto da logomarca
self.addEventListener('push', (event) => {
  let data = { 
    title: 'KRYPTAPAY', 
    body: 'Venda aprovada! Valor: R$ 49,90 - Pedido: #10246', 
    icon: '/icons/logo.png',
    badge: '/icons/logo.png'
  };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/logo.png',
    badge: '/icons/logo.png',
    image: data.image || null,
    vibrate: [250, 100, 250],
    data: data.url || '/app.html',
    tag: 'kryptapay-sale',
    renotify: true,
    actions: [
      { action: 'open', title: 'Ver Pedido' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'KRYPTAPAY', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data || '/app.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('app.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
