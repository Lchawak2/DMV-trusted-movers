import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import TruckLogo from './TruckLogo'
import { telLink, useSite } from '../lib/site'

// Page frame for customers, who aren't signed in
export default function PublicPage({ sub, children }: { sub: string; children: ReactNode }) {
  const { session } = useAuth()
  const { site } = useSite()
  return (
    <div className="app public">
      <header className="topbar">
        <div>
          <Link to="/" className="topbar-name brand"><TruckLogo />DMV Trusted Movers</Link>
          <div className="topbar-sub">{sub}</div>
        </div>
        {session
          ? <Link to="/" className="topbar-link">My moves</Link>
          : site.phone && <a href={telLink(site.phone)} className="topbar-link nowrap" aria-label={`Call ${site.phone}`}>Call us</a>}
      </header>
      <main className="content">{children}</main>
      <footer className="public-foot">
        <Link to="/pricing">Prices</Link>
        {!session && <Link to="/login">Sign in</Link>}
        <Link to="/policies#terms">Terms</Link>
        <Link to="/policies#cancellation">Cancellation</Link>
        <Link to="/policies#privacy">Privacy</Link>
      </footer>
    </div>
  )
}
