// Putting the app on the phone's home screen.
// Android's install offer comes once, right after the page loads, so it is caught here at start-up.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let offer: InstallPrompt | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((f) => f())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  offer = e as InstallPrompt
  changed()
})
window.addEventListener('appinstalled', () => {
  offer = null
  changed()
})

export const onInstallChange = (f: () => void) => {
  listeners.add(f)
  return () => { listeners.delete(f) }
}

// Already opened from the home screen
export const installed = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export const isIPhone = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const canOffer = () => offer !== null

// Shows Android's own Install box; true when they said yes
export async function install(): Promise<boolean> {
  if (!offer) return false
  await offer.prompt()
  const { outcome } = await offer.userChoice
  offer = null
  changed()
  return outcome === 'accepted'
}
