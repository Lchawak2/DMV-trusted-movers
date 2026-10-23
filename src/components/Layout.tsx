import { useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Bell from './Bell'
import { t } from '../lib/lang'
import { discard, useOutbox } from '../lib/outbox'
import { useWide } from '../lib/useWide'

export default function Layout({ title, back, children }: { title?: string; back?: string; children: ReactNode }) {
  const { account } = useAuth()
  const name = account?.full_name || account?.email || ''
  const waiting = useOutbox()
  const failed = waiting.filter((w) => w.error)
  const portal = account?.role === 'admin' ? 'Admin' : t('Crew Portal', 'Portal del equipo')
  const wide = useWide()

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
      <main className="content">
        {waiting.length > 0 && (
          <div className="outbox-bar">
            {waiting.length === 1
              ? t('1 item saved on this phone. It uploads when you have signal.', '1 cosa guardada en este teléfono. Se sube cuando tengas señal.')
              : t(`${waiting.length} items saved on this phone. They upload when you have signal.`, `${waiting.length} cosas guardadas en este teléfono. Se suben cuando tengas señal.`)}
            {failed.map((f) => (
              <div key={f.id} className="small">
                {t("Couldn't upload", 'No se pudo subir')}: {f.error}{' '}
                <button className="link" onClick={() => { if (confirm(t('Delete it from this phone?', '¿Borrarlo de este teléfono?'))) discard(f.id) }}>{t('Delete', 'Borrar')}</button>
              </div>
            ))}
          </div>
        )}
        {children}
      </main>
      {account?.role === 'admin' && wide ? <SideMenu /> : (
        <nav className="tabbar">
          <div className="side-brand side-only">DMV Trusted Movers</div>
          {account?.role === 'crew' && <NavLink to="/find">{t('Find Job', 'Buscar trabajo')}</NavLink>}
          {account?.role === 'admin' ? (
            <>
              <NavLink to="/" end>Dashboard</NavLink>
              <NavLink to="/jobs">Jobs</NavLink>
              <NavLink to="/money">Money</NavLink>
              <NavLink to="/people">People</NavLink>
            </>
          ) : (
            <NavLink to="/" end>{t('My Jobs', 'Mis trabajos')}</NavLink>
          )}
          {/* Admin reaches Profile from the avatar, so the tab bar fits four tabs */}
          {account?.role !== 'admin' && <NavLink to="/profile">{t('Profile', 'Perfil')}</NavLink>}
        </nav>
      )}
    </div>
  )
}

// On a computer the admin menu runs down the side with every page, grouped, and a search box
function SideMenu() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  function search(e: FormEvent) {
    e.preventDefault()
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }
  return (
    <nav className="tabbar">
      <div className="side-brand">DMV Trusted Movers</div>
      <form className="side-search" onSubmit={search} role="search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers, addresses" aria-label="Search" />
      </form>
      <div className="side-group">Work</div>
      <NavLink to="/" end>Dashboard</NavLink>
      <NavLink to="/jobs">Jobs</NavLink>
      <NavLink to="/requests">Quote requests</NavLink>
      <NavLink to="/crew-map">Crew map</NavLink>
      <div className="side-group">Crew</div>
      <NavLink to="/people">People</NavLink>
      <NavLink to="/payouts">Pay crew</NavLink>
      <div className="side-group">Business</div>
      <NavLink to="/money">Money</NavLink>
      <NavLink to="/website">Website</NavLink>
      <NavLink to="/profile">Profile and settings</NavLink>
    </nav>
  )
}
