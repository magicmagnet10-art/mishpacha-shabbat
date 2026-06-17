// ── Service Worker — PWA + Notifications ──────────────────

const CACHE = 'mishpacha-v1'
const OFFLINE_URLS = ['/', '/index.html']

// Cache app shell on install
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(OFFLINE_URLS).catch(() => {}))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// Serve from cache when offline
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(r => r || caches.match('/'))
    )
  )
})

// Show push notification
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title || '🏠 ביקורים אצל אמא ואבא', {
      body:     data.body || 'יש בקשה חדשה',
      icon:     '/icon.svg',
      badge:    '/icon.svg',
      dir:      'rtl',
      lang:     'he',
      tag:      'new-request',
      renotify: true,
      data:     { url: '/' },
    })
  )
})

// Click notification → open / focus app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin))
      if (existing) return existing.focus()
      return clients.openWindow('/')
    })
  )
})
