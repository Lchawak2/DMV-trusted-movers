// Crew can use the app in English or Spanish (Profile → Language). The signed-in account's
// choice is set here when it loads; screens call t('English', 'Español') for each piece of text.
// Admin screens stay in English.
export type Lang = 'en' | 'es'

let current: Lang = 'en'

export function setLang(lang: string | null | undefined) {
  current = lang === 'es' ? 'es' : 'en'
  document.documentElement.lang = current
}

export const lang = () => current
export const t = (en: string, es: string) => (current === 'es' ? es : en)
export const locale = () => (current === 'es' ? 'es-US' : 'en-US')

const JOB_TYPES_ES: Record<string, string> = {
  full_move: 'Mudanza de casa', office_move: 'Mudanza de oficina', small_move: 'Mudanza pequeña',
  labor_only: 'Cargar o descargar', packing: 'Empaque', junk_haul: 'Retiro de basura', other: 'Otro',
}

// A job type's name in the crew's language
export const jobType = (key: string, english: string | undefined) => (current === 'es' ? JOB_TYPES_ES[key] : undefined) ?? english ?? key
