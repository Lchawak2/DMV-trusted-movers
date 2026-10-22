import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// Page frame for customers, who aren't signed in
export default function PublicPage({ sub, children }: { sub: string; children: ReactNode }) {
  const { session } = useAuth()
  return (
    <div className="app public">
      <header className="topbar">
        <div>
          <Link to="/" className="topbar-name">DMV Trusted Movers</Link>
          <div className="topbar-sub">{sub}</div>
        </div>
        <Link to={session ? '/' : '/login'} className="topbar-link">{session ? 'My moves' : 'Sign in'}</Link>
      </header>
      <main className="content">{children}</main>
      <footer className="public-foot">
        <Link to="/policies#terms">Terms</Link>
        <Link to="/policies#cancellation">Cancellation</Link>
        <Link to="/policies#privacy">Privacy</Link>
      </footer>
    </div>
  )
}
