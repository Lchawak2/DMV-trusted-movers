import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import TruckLogo from './TruckLogo'
import LangSwitch from './LangSwitch'
import { siteText, telLink, type SiteContent } from '../lib/site'
import { t } from '../lib/lang'

// Header and footer shared by the public website pages (home and prices)
export default function SiteFrame({ site, children }: { site: SiteContent; children: ReactNode }) {
  const licenses = [
    site.usdot && `USDOT ${site.usdot}`,
    site.md_license && `${t('MD license', 'Licencia de MD')} ${site.md_license}`,
    site.insurance && site.insurance,
  ].filter(Boolean)

  return (
    <div className="site" style={{ '--site-main': site.main_color, '--site-accent': site.accent_color } as CSSProperties}>
      <header className="site-bar">
        <div className="site-wrap site-bar-in">
          <Link to="/" className="site-name brand plain"><TruckLogo size={24} />DMV Trusted Movers</Link>
          <nav className="site-nav">
            <Link to="/#services" className="site-nav-wide">{t('Services', 'Servicios')}</Link>
            <Link to="/pricing">{t('Prices', 'Precios')}</Link>
            <Link to="/#faq" className="site-nav-wide">{t('FAQ', 'Preguntas')}</Link>
            <Link to="/#contact" className="site-nav-wide">{t('Contact', 'Contacto')}</Link>
            <Link to="/join">{t('Jobs', 'Empleo')}</Link>
            <Link to="/login" className="site-nav-wide">{t('Sign in', 'Entrar')}</Link>
            <Link to="/book" className="site-nav-book">{t('Get my price', 'Ver mi precio')}</Link>
            <LangSwitch />
          </nav>
        </div>
      </header>

      {children}

      <footer className="site-foot">
        <div className="site-wrap">
          <div className="site-foot-cols">
            <div>
              <p className="site-foot-name"><TruckLogo size={20} />DMV Trusted Movers</p>
              <p>{t('Local movers for homes and offices in', 'Mudanzas locales de casas y oficinas en')} {siteText(site.area)}.</p>
              {site.phone && <p><a href={telLink(site.phone)}>{site.phone}</a></p>}
              {site.email && <p><a href={`mailto:${site.email}`}>{site.email}</a></p>}
            </div>
            <div>
              <h3>{t('Services', 'Servicios')}</h3>
              {site.services.map((s) => <p key={s.title}><Link to="/#services">{siteText(s.title)}</Link></p>)}
            </div>
            <div>
              <h3>{t('Where we work', 'Dónde trabajamos')}</h3>
              <p>Washington DC</p>
              <p>Maryland</p>
              <p>{t('Northern Virginia', 'Norte de Virginia')}</p>
            </div>
            <div>
              <h3>{t('Company', 'Compañía')}</h3>
              <p><Link to="/book">{t('Get my price', 'Ver mi precio')}</Link></p>
              <p><Link to="/pricing">{t('Prices', 'Precios')}</Link></p>
              <p><Link to="/#faq">{t('Questions', 'Preguntas')}</Link></p>
              <p><Link to="/join">{t('Work with us', 'Trabaje con nosotros')}</Link></p>
              <p><Link to="/login">{t('Crew and customer sign in', 'Entrar (equipo y clientes)')}</Link></p>
            </div>
          </div>
          {licenses.length > 0 && <p className="site-foot-lic">{licenses.join(' · ')}</p>}
          <div className="site-foot-bottom">
            <span>© {new Date().getFullYear()} DMV Trusted Movers</span>
            <nav>
              <Link to="/policies#terms">{t('Terms', 'Términos')}</Link>
              <Link to="/policies#cancellation">{t('Cancellation', 'Cancelación')}</Link>
              <Link to="/policies#privacy">{t('Privacy', 'Privacidad')}</Link>
            </nav>
          </div>
        </div>
      </footer>

      {/* Always in reach on phones, where most ad clicks land */}
      <div className="site-sticky">
        {site.phone && <a href={telLink(site.phone)} className="site-btn ghost">{t('Call', 'Llamar')}</a>}
        <Link to="/book" className="site-btn gold">{t('Get my price', 'Ver mi precio')}</Link>
      </div>
    </div>
  )
}
