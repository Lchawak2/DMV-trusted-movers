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
            <Link to="/pricing">Prices</Link>
            {site.phone && <a href={telLink(site.phone)} className="site-nav-phone">{site.phone}</a>}
            <Link to="/login">Sign in</Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="site-foot">
        <div className="site-wrap">
          <Link to="/book" className="site-btn gold">Get a free quote</Link>
          {licenses.length > 0 && <p>{licenses.join(' · ')}</p>}
          <nav>
            <Link to="/pricing">Prices</Link>
            <Link to="/policies#terms">Terms</Link>
            <Link to="/policies#cancellation">Cancellation</Link>
            <Link to="/policies#privacy">Privacy</Link>
            <Link to="/login">Crew and customer sign in</Link>
          </nav>
          <p>© {new Date().getFullYear()} DMV Trusted Movers</p>
        </div>
      </footer>
    </div>
  )
}
