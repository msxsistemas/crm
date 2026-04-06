const CACHE_NAME = 'msx-crm-v9'
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

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nova mensagem', {
      body: data.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});

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
