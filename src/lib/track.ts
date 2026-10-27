import { useEffect } from 'react'
import { supabaseKey, supabaseUrl } from './supabase'

// Counts what visitors do on the public website for the Visitors tab: pages, quote form steps,
// prices shown, booking and Call taps. Never names, phone numbers, emails or addresses. A visitor
// is a random id kept in their browser; staff who have signed in on this browser aren't counted.

const VISITOR_KEY = 'dmv-visitor'
const SESSION_KEY = 'dmv-visit'
const STAFF_KEY = 'dmv-staff'
const IDLE_MS = 30 * 60_000 // a new visit after half an hour away

type Event = { name: string; visitor: string; session: string; path: string; device: string; props: Record<string, unknown> }

// Taps that usually take the visitor away (the phone's dialer, Stripe), so they go out at once
const LEAVING = ['call_click', 'deposit_click']

let queue: Event[] = []
let timer: ReturnType<typeof setTimeout> | null = null
const sentOnce = new Set<string>()

function store(kind: 'local' | 'session') {
  try { return kind === 'local' ? window.localStorage : window.sessionStorage } catch { return null }
}

const newId = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).toLowerCase()

function visitorId() {
  const s = store('local')
  let id = s?.getItem(VISITOR_KEY)
  if (!id) { id = newId(); s?.setItem(VISITOR_KEY, id) }
  return id
}

// This visit, and where it came from (worked out on its first page)
function visit(): { id: string; source: string } {
  const s = store('session')
  let v: { id: string; source: string; seen: number } | null = null
  try { v = JSON.parse(s?.getItem(SESSION_KEY) ?? 'null') } catch { v = null }
  if (!v || Date.now() - v.seen > IDLE_MS) v = { id: newId(), source: sourceOf(), seen: Date.now() }
  v.seen = Date.now()
  s?.setItem(SESSION_KEY, JSON.stringify(v))
  return { id: v.id, source: v.source }
}

function sourceOf() {
  const p = new URLSearchParams(window.location.search)
  if (p.get('gclid') || p.get('gbraid') || p.get('wbraid')) return 'Google Ads'
  if (p.get('fbclid')) return 'Facebook or Instagram'
  const utm = (p.get('utm_source') ?? '').toLowerCase()
  const medium = (p.get('utm_medium') ?? '').toLowerCase()
  if (utm) {
    if (utm.includes('google') && ['cpc', 'ppc', 'paid'].includes(medium)) return 'Google Ads'
    return named(utm) ?? utm.slice(0, 40)
  }
  let host = ''
  try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '' } catch { host = '' }
  if (!host || host === window.location.hostname.replace(/^www\./, '')) return 'Direct'
  return named(host) ?? host.slice(0, 40)
}

function named(s: string) {
  if (s.includes('google')) return 'Google search'
  if (s.includes('bing')) return 'Bing'
  if (s.includes('facebook') || s.includes('instagram') || s === 'fb' || s.endsWith('fb.com')) return 'Facebook or Instagram'
  if (s.includes('yelp')) return 'Yelp'
  if (s.includes('nextdoor')) return 'Nextdoor'
  if (s.includes('thumbtack')) return 'Thumbtack'
  if (s.includes('angi')) return 'Angi'
  return null
}

function device() {
  const w = window.innerWidth
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (w < 700) return 'phone'
  if (touch && w < 1100) return 'tablet'
  return 'computer'
}

// The public pages only, with booking links shortened so no token is sent
function pagePath() {
  const p = window.location.pathname
  if (p.startsWith('/quote/')) return '/quote'
  return ['/', '/site', '/book', '/pricing', '/policies'].includes(p) ? (p === '/site' ? '/' : p) : null
}

function counting() {
  if (typeof window === 'undefined' || navigator.webdriver) return false
  return store('local')?.getItem(STAFF_KEY) !== '1'
}

// Staff are left out of the numbers once they sign in on a browser
export function markStaff() {
  store('local')?.setItem(STAFF_KEY, '1')
  queue = []
}

export function track(name: string, props: Record<string, unknown> = {}) {
  const path = pagePath()
  if (!path || !counting()) return
  const v = visit()
  queue.push({ name, visitor: visitorId(), session: v.id, path, device: device(), props })
  if (queue.length >= 10 || LEAVING.includes(name)) flush()
  else if (!timer) timer = setTimeout(flush, 4000)
}

// Once per page load for each key, like the first touch of each form step
export function trackOnce(name: string, key = '', props: Record<string, unknown> = {}) {
  const k = `${window.location.pathname}|${name}|${key}`
  if (sentOnce.has(k)) return
  sentOnce.add(k)
  track(name, props)
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null }
  if (!queue.length) return
  const batch = queue.splice(0, 30)
  // keepalive lets the last batch go out while the visitor leaves the page; a failure is just a lost count
  fetch(`${supabaseUrl}/rest/v1/rpc/track_events`, {
    method: 'POST', keepalive: true,
    headers: { apikey: supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_events: batch }),
  }).catch(() => {})
  if (queue.length) flush()
}

// Where on the page a link sits, for Call and Get my price taps
function placeOf(el: Element) {
  const marked = el.closest('[data-place]')?.getAttribute('data-place')
  if (marked) return marked
  if (el.closest('.site-sticky')) return 'Bottom bar on phones'
  if (el.closest('.site-bar, .topbar')) return 'Top of page'
  if (el.closest('.site-foot, .public-foot')) return 'Footer'
  if (el.closest('.site-quote')) return 'Quick quote box'
  if (el.closest('.site-hero')) return 'Top section'
  if (el.closest('.site-band')) return 'Banner near the bottom'
  const section = el.closest('section[id]')?.id
  return (section && SECTIONS[section]) || 'Middle of page'
}
const SECTIONS: Record<string, string> = { why: 'Why us section', prices: 'Prices section', services: 'Services section', faq: 'Questions section', contact: 'Contact section' }

let listening = false

// Page views, plus Call and booking taps anywhere on the public pages
export function usePageView() {
  useEffect(() => {
    track('page_view', { source: visit().source })
    if (listening) return
    listening = true
    document.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      if (href.startsWith('tel:')) track('call_click', { where: placeOf(a) })
      else if (href.startsWith('/book')) track('cta_click', { where: placeOf(a), text: (a.textContent ?? '').trim().slice(0, 40) })
    }, true)
    const away = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', away)
    window.addEventListener('pagehide', flush)
  }, [])
}

// How far down the home page people read
export function useScrollDepth() {
  useEffect(() => {
    const seen = new Set<number>()
    const onScroll = () => {
      const doc = document.documentElement
      const pct = ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100
      for (const d of [50, 90]) {
        if (pct >= d && !seen.has(d)) { seen.add(d); track('scroll', { depth: String(d) }) }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
}
