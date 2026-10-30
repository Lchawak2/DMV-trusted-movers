import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import TruckLogo from './TruckLogo'
import { telLink, type SiteContent } from '../lib/site'

// Header and footer shared by the public website pages (home and prices)
export default function SiteFrame({ site, children }: { site: SiteContent; children: ReactNode }) {
  const licenses = [
    site.usdot && `USDOT ${site.usdot}`,
    site.md_license && `MD license ${site.md_license}`,
    site.insurance && site.insurance,
  ].filter(Boolean)

  return (
    <div className="site" style={{ '--site-main': site.main_color, '--site-accent': site.accent_color } as CSSProperties}>
      <header className="site-bar">
        <div className="site-wrap site-bar-in">
          <Link to="/" className="site-name brand plain"><TruckLogo size={24} />DMV Trusted Movers</Link>
          <nav className="site-nav">
            <Link to="/#services" className="site-nav-wide">Services</Link>
            <Link to="/pricing">Prices</Link>
            <Link to="/#faq" className="site-nav-wide">FAQ</Link>
            <Link to="/#contact" className="site-nav-wide">Contact</Link>
            <Link to="/login" className="site-nav-wide">Sign in</Link>
            <Link to="/book" className="site-nav-book">Get my price</Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="site-foot">
        <div className="site-wrap">
          <div className="site-foot-cols">
            <div>
              <p className="site-foot-name"><TruckLogo size={20} />DMV Trusted Movers</p>
              <p>Local movers for homes and offices in {site.area}.</p>
              {site.phone && <p><a href={telLink(site.phone)}>{site.phone}</a></p>}
              {site.email && <p><a href={`mailto:${site.email}`}>{site.email}</a></p>}
            </div>
            <div>
              <h3>Services</h3>
              {site.services.map((s) => <p key={s.title}><Link to="/#services">{s.title}</Link></p>)}
            </div>
            <div>
              <h3>Where we work</h3>
              <p>Washington DC</p>
              <p>Maryland</p>
              <p>Northern Virginia</p>
            </div>
            <div>
              <h3>Company</h3>
              <p><Link to="/book">Get my price</Link></p>
              <p><Link to="/pricing">Prices</Link></p>
              <p><Link to="/#faq">Questions</Link></p>
              <p><Link to="/join">Work with us</Link></p>
              <p><Link to="/login">Crew and customer sign in</Link></p>
            </div>
          </div>
          {licenses.length > 0 && <p className="site-foot-lic">{licenses.join(' · ')}</p>}
          <div className="site-foot-bottom">
            <span>© {new Date().getFullYear()} DMV Trusted Movers</span>
            <nav>
              <Link to="/policies#terms">Terms</Link>
              <Link to="/policies#cancellation">Cancellation</Link>
              <Link to="/policies#privacy">Privacy</Link>
            </nav>
          </div>
        </div>
      </footer>

      {/* Always in reach on phones, where most ad clicks land */}
      <div className="site-sticky">
        {site.phone && <a href={telLink(site.phone)} className="site-btn ghost">Call</a>}
        <Link to="/book" className="site-btn gold">Get my price</Link>
      </div>
    </div>
  )
}
