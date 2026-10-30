import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import TruckLogo from './TruckLogo'
import LangSwitch from './LangSwitch'
import { telLink, useSite } from '../lib/site'
import { t, useLang } from '../lib/lang'

// Page frame for customers, who aren't signed in. Pages that are written in Spanish too show the language switch.
export default function PublicPage({ sub, children, langSwitch = false }: { sub: string; children: ReactNode; langSwitch?: boolean }) {
  const { session } = useAuth()
  const { site } = useSite()
  useLang()
  return (
    <div className="app public">
      <header className="topbar">
        <div>
          <Link to="/" className="topbar-name brand"><TruckLogo />DMV Trusted Movers</Link>
          <div className="topbar-sub">{sub}</div>
        </div>
        <div className="topbar-right">
          {langSwitch && !session && <LangSwitch />}
          {session
            ? <Link to="/" className="topbar-link">{t('My moves', 'Mis mudanzas')}</Link>
            : site.phone && <a href={telLink(site.phone)} className="topbar-link nowrap" aria-label={`${t('Call', 'Llamar al')} ${site.phone}`}>{t('Call us', 'Llámenos')}</a>}
        </div>
      </header>
      <main className="content">{children}</main>
      <footer className="public-foot">
        <Link to="/pricing">{t('Prices', 'Precios')}</Link>
        {!session && <Link to="/login">{t('Sign in', 'Entrar')}</Link>}
        <Link to="/policies#terms">{t('Terms', 'Términos')}</Link>
        <Link to="/policies#cancellation">{t('Cancellation', 'Cancelación')}</Link>
        <Link to="/policies#privacy">{t('Privacy', 'Privacidad')}</Link>
      </footer>
    </div>
  )
}
