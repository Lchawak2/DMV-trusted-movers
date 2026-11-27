// Shows phone notifications sent by the app (for example "Deposit paid") and opens the right page when tapped.
// It does not cache anything, so the app always loads fresh.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'DMV Trusted Movers', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const tab of tabs) {
      if (new URL(tab.url).origin === self.location.origin && 'navigate' in tab) {
        await tab.focus()
        return tab.navigate(url)
      }
    }
    return self.clients.openWindow(url)
  })())
})
