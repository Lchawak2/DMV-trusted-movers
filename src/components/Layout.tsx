import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Bell from './Bell'
import { t } from '../lib/lang'

export default function Layout({ title, back, children }: { title?: string; back?: string; children: ReactNode }) {
  const { account } = useAuth()
  const name = account?.full_name || account?.email || ''
  const portal = account?.role === 'admin' ? 'Admin' : t('Crew Portal', 'Portal del equipo')

  return (
    <div className="app">
      <header className="topbar">
        {back ? (
          <NavLink to={back} className="back">‹ {t('Back', 'Atrás')}</NavLink>
        ) : (
          <div>
            <div className="topbar-name">{name}</div>
            <div className="topbar-sub">DMV Trusted Movers · {portal}</div>
          </div>
        )}
        {title && back && <div className="topbar-title">{title}</div>}
        <div className="topbar-right">
          {account?.role === 'admin' && <Bell />}
          <NavLink to="/profile" className="avatar">{(name[0] ?? '?').toUpperCase()}</NavLink>
        </div>
      </header>
      <main className="content">{children}</main>
      <nav className="tabbar">
        {account?.role === 'crew' && <NavLink to="/find">{t('Find Job', 'Buscar trabajo')}</NavLink>}
        {account?.role === 'admin' ? (
          <>
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/jobs">Jobs</NavLink>
            <NavLink to="/money">Money</NavLink>
          </>
        ) : (
          <NavLink to="/" end>{t('My Jobs', 'Mis trabajos')}</NavLink>
        )}
        {account?.role === 'admin' && <NavLink to="/people">People</NavLink>}
        {/* Admin reaches Profile from the avatar, so the tab bar fits four tabs */}
        {account?.role !== 'admin' && <NavLink to="/profile">{t('Profile', 'Perfil')}</NavLink>}
      </nav>
    </div>
  )
}
