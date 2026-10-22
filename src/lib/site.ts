import { supabase } from './supabase'

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
  phone: '',
  email: 'dmvtrustedmoversservices@gmail.com',
  area: 'Washington DC, Maryland and Northern Virginia',
  hours: 'Every day, 7am to 8pm',
  about: 'DMV Trusted Movers is a local moving company. We treat your things like our own, we tell you the price before we start, and we keep you posted on the day of your move.',
  services: [
    { title: 'Home moves', text: 'Apartments, condos and houses, from studios to 5 bedrooms.' },
    { title: 'Office moves', text: 'Desks, files and equipment, planned around your work hours.' },
    { title: 'Small moves', text: 'A few rooms or a single big item like a couch or a piano.' },
    { title: 'Loading help', text: 'You have the truck, we bring the muscle to load or unload it.' },
    { title: 'Packing', text: 'We bring the boxes and materials and pack everything safely.' },
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
  accent_color: '#e11d48',
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
