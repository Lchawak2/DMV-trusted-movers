import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Alert = { id: string; kind: string; created_at: string; read_at: string | null; title: string; detail: string | null; link: string }

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Admin alerts: the same events the emails cover (requests, payments, cancellations, tomorrow's moves, crews not full)
export default function Bell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  const load = () => supabase.rpc('admin_alerts').then(({ data }) => data && setAlerts(data as Alert[]))

  // Refresh on every page change and once a minute
  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [pathname])

  // Following an alert closes the list
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) { setOpen(false); load() }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const unread = alerts.filter((a) => !a.read_at).length

  function toggle() {
    // Opening the list counts as seeing them. New ones stay highlighted until it closes.
    if (!open && unread) supabase.rpc('mark_alerts_read').then()
    if (open) load()
    setOpen(!open)
  }

  return (
    <div className="bell-box" ref={box}>
      <button className="bell" onClick={toggle} aria-label={unread ? `${unread} new alerts` : 'Alerts'}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && !open && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-head">Alerts</div>
          {alerts.length === 0 && <p className="muted small bell-empty">Nothing yet. New quote requests and paid deposits show up here.</p>}
          {alerts.map((a) => (
            <Link key={a.id} to={a.link} className={`bell-item${a.read_at ? '' : ' new'}`}>
              <span className={`bell-dot ${a.kind}`} />
              <span className="bell-text">
                <strong>{a.title}</strong>
                <span className="muted small">{a.detail ? `${a.detail} · ` : ''}{ago(a.created_at)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
