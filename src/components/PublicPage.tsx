import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Page frame for customers, who aren't signed in
export default function PublicPage({ sub, children }: { sub: string; children: ReactNode }) {
  return (
    <div className="app public">
      <header className="topbar">
        <div>
          <div className="topbar-name">DMV Trusted Movers</div>
          <div className="topbar-sub">{sub}</div>
        </div>
        <Link to="/" className="topbar-link">Sign in</Link>
      </header>
      <main className="content">{children}</main>
    </div>
  )
}
