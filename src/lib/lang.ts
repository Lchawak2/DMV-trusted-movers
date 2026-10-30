import { useSyncExternalStore } from 'react'

// Crew can use the app in English or Spanish (Profile → Language). The signed-in account's
// choice is set here when it loads; screens call t('English', 'Español') for each piece of text.
// Admin screens stay in English. Visitors to the public website pick with the English / Español
// switch, remembered in this browser; a phone set to Spanish starts in Spanish.
export type Lang = 'en' | 'es'

let current: Lang = 'en'
const listeners = new Set<() => void>()

export function setLang(lang: string | null | undefined) {
  current = lang === 'es' ? 'es' : 'en'
  document.documentElement.lang = current
  listeners.forEach((f) => f())
}

const SITE_KEY = 'site-lang'

// The website visitor's language: their pick on this browser, else their phone's language
export function siteLang(): Lang {
  let saved: string | null = null
  try { saved = localStorage.getItem(SITE_KEY) } catch { /* storage blocked */ }
  if (saved === 'en' || saved === 'es') return saved
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

// The English / Español switch
export function chooseLang(l: Lang) {
  try { localStorage.setItem(SITE_KEY, l) } catch { /* still switches for this visit */ }
  setLang(l)
}

// Pages call this so they redraw when the switch is used
export const useLang = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f) } }, () => current)

export const lang = () => current
export const t = (en: string, es: string) => (current === 'es' ? es : en)
export const locale = () => (current === 'es' ? 'es-US' : 'en-US')

const JOB_TYPES_ES: Record<string, string> = {
  full_move: 'Mudanza de casa', office_move: 'Mudanza de oficina', small_move: 'Mudanza pequeña',
  labor_only: 'Cargar o descargar', packing: 'Empaque', junk_haul: 'Retiro de basura', other: 'Otro',
}

// A job type's name in the crew's language
export const jobType = (key: string, english: string | undefined) => (current === 'es' ? JOB_TYPES_ES[key] : undefined) ?? english ?? key

// Move sizes as customers see them; the English name is what gets saved
const SIZES_ES: Record<string, string> = {
  'Studio': 'Estudio', 'Studio or 1 bedroom': 'Estudio o 1 habitación', '1 bedroom': '1 habitación',
  '2 bedrooms': '2 habitaciones', '3 bedrooms': '3 habitaciones', '4+ bedrooms': '4 o más habitaciones',
  'Small office': 'Oficina pequeña', 'Small office (1 to 10 people)': 'Oficina pequeña (1 a 10 personas)',
  'Medium office (11 to 30 people)': 'Oficina mediana (11 a 30 personas)', 'Large office (30+ people)': 'Oficina grande (más de 30 personas)',
  'Few items': 'Pocas cosas',
}
export const sizeName = (s: string) => (current === 'es' ? SIZES_ES[s] : undefined) ?? s

// Lines of an instant price, which the database writes in English
export function priceLine(label: string) {
  if (current !== 'es') return label
  const hours = label.match(/^2 movers, truck and gas, up to ([\d.]+) hours$/)
  if (hours) return `2 mudanceros, camión y gasolina, hasta ${hours[1]} horas`
  if (label === 'Weekend move') return 'Mudanza en fin de semana'
  return label
}
