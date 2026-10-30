import { chooseLang, useLang } from '../lib/lang'

// English / Español switch on the public website. Narrow phone headers show just EN / ES.
export default function LangSwitch({ className = '' }: { className?: string }) {
  const lang = useLang()
  const next = lang === 'es' ? 'en' : 'es'
  return (
    <button type="button" className={`lang-switch ${className}`} lang={next} aria-label={next === 'es' ? 'Español' : 'English'}
      onClick={() => chooseLang(next)}>
      <span className="lang-long">{next === 'es' ? 'Español' : 'English'}</span>
      <span className="lang-short">{next.toUpperCase()}</span>
    </button>
  )
}
