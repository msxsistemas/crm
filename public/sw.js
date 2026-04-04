const CACHE_NAME = 'msx-crm-v4'

self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => {
      // Força reload em todos os clientes abertos ao atualizar o SW
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.navigate(client.url))
      })
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Nunca cachear HTML — sempre buscar da rede
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(e.request))
    return
  }

  // Não interceptar chamadas de API externas
  if (url.hostname !== self.location.hostname) return

  // Assets com hash: cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && url.pathname.match(/\.(js|css|png|jpg|svg|woff2?)$/)) {
        const clone = res.clone()
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
      }
      return res
    }))
  )
})
