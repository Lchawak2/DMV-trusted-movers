import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Layout({ title, back, children }: { title?: string; back?: string; children: ReactNode }) {
  const { account } = useAuth()
  const name = account?.full_name || account?.email || ''
  const portal = account?.role === 'admin' ? 'Admin' : 'Crew Portal'

  return (
    <div className="app">
      <header className="topbar">
        {back ? (
          <NavLink to={back} className="back">‹ Back</NavLink>
        ) : (
          <div>
            <div className="topbar-name">{name}</div>
            <div className="topbar-sub">DMV Trusted Movers · {portal}</div>
          </div>
        )}
        {title && back && <div className="topbar-title">{title}</div>}
        <NavLink to="/profile" className="avatar">{(name[0] ?? '?').toUpperCase()}</NavLink>
      </header>
      <main className="content">{children}</main>
      <nav className="tabbar">
        <NavLink to="/" end>{account?.role === 'admin' ? 'Jobs' : 'My Jobs'}</NavLink>
        {account?.role === 'admin' && <NavLink to="/people">People</NavLink>}
        <NavLink to="/profile">Profile</NavLink>
      </nav>
    </div>
  )
}
