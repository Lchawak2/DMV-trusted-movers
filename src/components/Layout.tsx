import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Bell from './Bell'
import TruckLogo from './TruckLogo'
import { lastTodoCount, useTodos } from '../pages/admin/needs'
import { t } from '../lib/lang'
import { discard, useOutbox } from '../lib/outbox'

export default function Layout({ title, back, children }: { title?: string; back?: string; children: ReactNode }) {
  const { account } = useAuth()
  const name = account?.full_name || account?.email || ''
  const waiting = useOutbox()
  const failed = waiting.filter((w) => w.error)
  const portal = account?.role === 'admin' ? 'Admin' : t('Crew Portal', 'Portal del equipo')

  return (
    <div className="app">
      <header className="topbar">
        {back ? (
          <NavLink to={back} className="back">‹ {t('Back', 'Atrás')}</NavLink>
        ) : (
          <div>
            <div className="topbar-name">{name}</div>
            <div className="topbar-sub brand"><TruckLogo size={14} />DMV Trusted Movers · {portal}</div>
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
      <nav className="tabbar">
        <div className="side-brand side-only"><span className="brand"><TruckLogo size={20} />DMV Trusted Movers</span></div>
        {account?.role === 'crew' && <NavLink to="/find">{t('Find Job', 'Buscar trabajo')}</NavLink>}
        {account?.role === 'admin' ? (
          <>
            <NavLink to="/" end>Dashboard</NavLink>
            <NeedsTab />
            <NavLink to="/jobs">Jobs</NavLink>
            <NavLink to="/money">Money</NavLink>
          </>
        ) : (
          <NavLink to="/" end>{t('My Jobs', 'Mis trabajos')}</NavLink>
        )}
        {account?.role === 'admin' && <NavLink to="/people">People</NavLink>}
        {/* On a computer the menu runs down the side, with room for the pages phones reach from the dashboard */}
        {account?.role === 'admin' && (
          <>
            <NavLink to="/requests" className="side-only">Quote requests</NavLink>
            <NavLink to="/crew-map" className="side-only">Crew map</NavLink>
            <NavLink to="/website" className="side-only">Website</NavLink>
            <NavLink to="/profile" className="side-only">Profile</NavLink>
          </>
        )}
        {/* Admin reaches Profile from the avatar, so the tab bar fits four tabs */}
        {account?.role !== 'admin' && <NavLink to="/profile">{t('Profile', 'Perfil')}</NavLink>}
      </nav>
    </div>
  )
}

// The Needs you tab, with how many things are waiting
function NeedsTab() {
  const todos = useTodos()
  const n = todos ? todos.length : lastTodoCount()
  return <NavLink to="/needs">Needs you{n > 0 && <span className="tab-count">{n}</span>}</NavLink>
}
