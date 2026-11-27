import { supabase } from './supabase'

// Phone notifications (web push). The public half of the app's push key; the private half is the
// server-only server_keys table (name vapid_private), read by the Edge Functions.
const PUBLIC_KEY = 'BEFIvX3pVduQGDcBz1H5AE5guLpn_PVqWXIf4cpSSuoyOVo8fxcPacW6MOO9BKZqb8MFPkuOzdN3-spUut8m9Lg'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
// iPhones only allow notifications for the app added to the home screen
export const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

function keyBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js')
}

// Whether this phone or computer already gets notifications
export async function pushIsOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  return !!(await reg?.pushManager.getSubscription())
}

export async function turnOnPush(accountId: string): Promise<string | null> {
  if (!pushSupported()) return isIphone() && !isInstalled()
    ? 'On iPhone, first add the app to your home screen (Share, then Add to Home Screen), open it from there, and try again.'
    : "This browser can't show notifications."
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'Notifications are blocked. Allow them for this site in your phone or browser settings, then try again.'
  const reg = await registration()
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) })
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint)
  const { error } = await supabase.from('push_subscriptions').insert({ account_id: accountId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth })
  return error ? 'Could not save it. Please try again.' : null
}

export async function turnOffPush() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestPush(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('push', { body: { action: 'test' } })
  if (error) return 'The test notification could not be sent.'
  return data?.sent ? null : (data?.error ?? 'No phone is set up for notifications yet.')
}
