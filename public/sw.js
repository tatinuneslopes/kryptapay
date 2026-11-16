// KryptaPay Service Worker - PWA & Push Notifications com Logomarca Oficial
const CACHE_NAME = 'kryptapay-v2026.31';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/css/theme.css',
  '/css/components.css',
  '/js/api.js',
  '/js/app.js',
  '/js/timer-worker.js',
  '/js/globe3d.js',
  '/js/i18n.js',
  '/js/pwa.js',
  '/icons/logo.png',
  '/assets/globo-oficial.jpg',
  '/audio/cash-register.wav',
  '/audio/silence.wav',
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

// Network-First Rigoroso: Sempre entrega a versão mais recente do servidor
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  // Navegação e HTML sempre com no-cache direto na rede
  const isNav = event.request.mode === 'navigate' || 
                (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) ||
                event.request.url.endsWith('.html');
  if (isNav) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

// Suporte a mensagens diretas do app para disparar notificações na barra do celular
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const d = event.data.notification || {};
    const title = d.title || '🎉 Venda aprovada! - KryptaPay';
    const body = d.body || 'Venda confirmada com sucesso!';
    const tag = d.tag || ('kryptapay-sale-' + Date.now() + '-' + Math.floor(Math.random() * 1000));

    event.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: '/icons/logo.png',
        badge: '/icons/logo.png',
        image: d.image || null,
        vibrate: [300, 100, 300, 100, 300],
        tag: tag,
        renotify: true,
        silent: false,
        requireInteraction: false,
        data: (d && typeof d.url === 'string' && !d.url.includes('object')) ? d.url : '/app.html?tab=test-dashboard'
      })
    );
  }
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
    data: (data && typeof data.url === 'string' && !data.url.includes('object')) ? data.url : '/app.html?tab=test-dashboard',
    tag: data.tag || ('kryptapay-sale-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
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

  // Redirecionamento 100% seguro para a Dashboard 2
  const origin = self.location.origin;
  const targetUrl = origin + '/app.html?tab=test-dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. Se o aplicativo já estiver aberto em alguma aba ou PWA do celular:
      for (const client of clientList) {
        if (client.url && (client.url.includes('app.html') || client.url.includes('/app') || client.url.startsWith(origin))) {
          try {
            client.postMessage({ type: 'SWITCH_TAB', tab: 'test-dashboard' });
          } catch (_) {}
          try {
            if ('navigate' in client && !client.url.includes('app.html')) {
              client.navigate(targetUrl);
            }
          } catch (_) {}
          if ('focus' in client) {
            return client.focus();
          }
        }
      }
      // 2. Se o app estiver fechado no celular, abre diretamente a Dashboard 2:
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
