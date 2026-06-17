// Service Worker — Push Notifications

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title || '🏠 ביקורים אצל אמא ואבא', {
      body:    data.body  || 'יש בקשה חדשה',
      icon:    '/favicon.svg',
      badge:   '/favicon.svg',
      dir:     'rtl',
      lang:    'he',
      tag:     'new-request',
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/'))
})
