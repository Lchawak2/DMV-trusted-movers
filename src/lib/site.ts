import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { lang } from './lang'

// The public website's words and photos. The admin edits them on the Website page;
// anything left blank falls back to the defaults below.
export type SiteContent = {
  headline: string
  subheadline: string
  phone: string
  email: string
  area: string
  hours: string
  about: string
  services: { title: string; text: string }[]
  prices: { label: string; price: string }[]
  testimonials: { name: string; text: string }[]
  usdot: string
  md_license: string
  insurance: string
  hero_photo: string | null
  gallery: string[]
  main_color: string
  accent_color: string
}

export const DEFAULT_SITE: SiteContent = {
  headline: 'Moving in DC, Maryland and Virginia, done right',
  subheadline: 'Homes, apartments and offices. Careful movers, clear prices, and a crew that shows up on time.',
  phone: '(202) 656-0756',
  email: 'dmvtrustedmoversservices@gmail.com',
  area: 'Washington DC, Maryland and Northern Virginia',
  hours: 'Every day, 7am to 8pm',
  about: 'DMV Trusted Movers is a local moving company. We treat your things like our own, we tell you the price before we start, and we keep you posted on the day of your move.',
  services: [
    { title: 'Home moves', text: 'Apartments, condos and houses, from studios to 3 bedrooms.' },
    { title: 'Office moves', text: 'Desks, files and equipment, planned around your work hours.' },
    { title: 'Small moves', text: 'A few rooms or a single big item like a couch or a dresser.' },
    { title: 'Junk removal', text: 'We haul away what you don\'t want to take with you.' },
  ],
  prices: [],
  testimonials: [],
  usdot: '',
  md_license: '',
  insurance: '',
  hero_photo: null,
  gallery: [],
  main_color: '#0f172a',
  accent_color: '#0f172a',
}

export type SiteData = { site: SiteContent; review_url: string | null; rating: number | null; ratings: number }

// Fill blanks from the defaults so the page always has something to show
export function withDefaults(saved: Partial<SiteContent> | null | undefined): SiteContent {
  const s = { ...DEFAULT_SITE }
  for (const [k, v] of Object.entries(saved ?? {})) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && !v.trim() && (DEFAULT_SITE as Record<string, unknown>)[k]) continue
    ;(s as Record<string, unknown>)[k] = v
  }
  return s
}

export async function loadSite(): Promise<SiteData> {
  const { data } = await supabase.rpc('get_site')
  return {
    site: withDefaults(data?.site),
    review_url: data?.review_url ?? null,
    rating: data?.rating ?? null,
    ratings: data?.ratings ?? 0,
  }
}

const SITE_CACHE = 'site-content'
const EMPTY: SiteData = { site: DEFAULT_SITE, review_url: null, rating: null, ratings: 0 }

// The website's content for the public pages. It shows straight away (from this browser's last
// visit, or the defaults) so visitors never wait on a blank page, then updates once loaded.
export function useSite(): SiteData {
  const [data, setData] = useState<SiteData>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SITE_CACHE) ?? 'null') as SiteData | null
      return saved ? { ...saved, site: withDefaults(saved.site) } : EMPTY
    } catch { return EMPTY }
  })
  useEffect(() => {
    loadSite().then((d) => {
      setData(d)
      try { localStorage.setItem(SITE_CACHE, JSON.stringify(d)) } catch { /* storage full or blocked */ }
    }).catch(() => { /* keep what's showing */ })
  }, [])
  return data
}

// The default website words in Spanish. Text the admin wrote on the Website page shows as written.
const SITE_ES: Record<string, string> = {
  'Moving in DC, Maryland and Virginia, done right': 'Mudanzas en DC, Maryland y Virginia, bien hechas',
  'Homes, apartments and offices. Careful movers, clear prices, and a crew that shows up on time.': 'Casas, apartamentos y oficinas. Mudanceros cuidadosos, precios claros y un equipo que llega a tiempo.',
  'Washington DC, Maryland and Northern Virginia': 'Washington DC, Maryland y el norte de Virginia',
  'Every day, 7am to 8pm': 'Todos los días, de 7 am a 8 pm',
  'DMV Trusted Movers is a local moving company. We treat your things like our own, we tell you the price before we start, and we keep you posted on the day of your move.':
    'DMV Trusted Movers es una compañía de mudanzas local. Cuidamos sus cosas como si fueran nuestras, le damos el precio antes de empezar y lo mantenemos informado el día de su mudanza.',
  'Home moves': 'Mudanzas de casa',
  'Apartments, condos and houses, from studios to 3 bedrooms.': 'Apartamentos, condominios y casas, desde estudios hasta 3 habitaciones.',
  'Office moves': 'Mudanzas de oficina',
  'Desks, files and equipment, planned around your work hours.': 'Escritorios, archivos y equipos, planeado según su horario de trabajo.',
  'Small moves': 'Mudanzas pequeñas',
  'A few rooms or a single big item like a couch or a dresser.': 'Unos cuantos cuartos o un solo mueble grande, como un sofá o una cómoda.',
  'A few rooms or a single big item like a couch or a piano.': 'Unos cuantos cuartos o un solo mueble grande, como un sofá o un piano.',
  'Junk removal': 'Retiro de basura',
  'We haul away what you don\'t want to take with you.': 'Nos llevamos lo que usted no quiere llevar.',
}
export const siteText = (s: string) => (lang() === 'es' ? SITE_ES[s.trim()] : undefined) ?? s

// Sets the browser tab title (and what search results show) for a page
export function usePageTitle(title: string) {
  useEffect(() => { document.title = title }, [title])
}

export function photoUrl(path: string) {
  return supabase.storage.from('site-photos').getPublicUrl(path).data.publicUrl
}

// "(240) 555-0123" → "tel:+12405550123"
export function telLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return `tel:${digits.length === 10 ? '+1' + digits : '+' + digits}`
}

// "#0f1b2d" → "15,27,45", for see-through overlays in the main color
export function rgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}
