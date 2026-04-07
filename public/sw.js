const CACHE_NAME = 'msx-crm-v11'
const OFFLINE_URL = '/offline.html'

// Assets estáticos a pré-cachear na instalação
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
]

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS).catch(() => {}))
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'Nova mensagem', body: event.data?.text() || '' };
  }

  const title = data.title || 'MSX CRM';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.data?.conversationId ? `conv-${data.data.conversationId}` : 'msx-crm',
    renotify: true,
    data: {
      url: data.data?.conversationId ? `/inbox?c=${data.data.conversationId}` : '/',
      conversationId: data.data?.conversationId || null,
      timestamp: data.timestamp || Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification Click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Tentar focar janela já aberta com a mesma URL
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Abrir nova aba se não houver nenhuma
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Periodic Sync (sincronização offline) ────────────────────────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-conversations') {
    event.waitUntil(
      // Notifica os clientes para re-buscar dados
      clients.matchAll({ type: 'window' }).then(windowClients => {
        for (const client of windowClients) {
          client.postMessage({ type: 'PERIODIC_SYNC', tag: event.tag });
        }
      })
    );
  }
});

// ── Fetch Handler ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Nunca cachear HTML de navegação — sempre buscar da rede, fallback offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(OFFLINE_URL).then(r => r || new Response('Offline', { status: 503 }))
      )
    )
    return
  }

  // Não interceptar chamadas de domínios externos
  if (url.hostname !== self.location.hostname) return

  // Network-first para chamadas de API (/api/* ou endpoints conhecidos)
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/conversations') ||
      url.pathname.startsWith('/messages') ||
      url.pathname.startsWith('/contacts') ||
      url.pathname.startsWith('/webhook')) {
    e.respondWith(
      fetch(e.request)
        .then(res => res)
        .catch(() => new Response(JSON.stringify({ error: 'Sem conexão' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }))
    )
    return
  }

  // Cache-first para assets estáticos (js, css, imagens, fontes)
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot|ico)$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
          }
          return res
        }).catch(() => cached || new Response('', { status: 404 }))
      })
    )
    return
  }

  // Demais requisições: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
        }
        return res
      })
      return cached || fetchPromise
    })
  )
})
