// Service Worker for archive update notifications
const CACHE_NAME = 'research-archive-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request))
})

self.addEventListener('push', event => {
  let data = {
    title: '\u590d\u76d8\u6863\u6848\u66f4\u65b0',
    body: '\u65b0\u7684\u5df2\u7ed3\u7b97\u7814\u7a76\u8bb0\u5f55\u5df2\u66f4\u65b0',
    url: '/research',
  }
  try { data = { ...data, ...event.data.json() } } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'research-archive',
      renotify: true,
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/research'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const found = list.find(c => c.url.includes(url))
      return found ? found.focus() : clients.openWindow(url)
    })
  )
})

