import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dayHeading } from '../../lib/format'
import { JOB_TYPES, LEAD_SOURCES, LOST_REASONS, type LeadSource, type LostReason, type RequestStatus } from '../../lib/types'
import { BOOK_TYPES } from '../Book'
import { REQUEST_SELECT, crossesStateLine, requestState, type RequestRow } from './requestData'

export default function Requests() {
  const [rows, setRows] = useState<RequestRow[] | null>(null)
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    const open = ['new', 'waiting_on_client', 'quoted']
    let query = supabase.from('move_requests').select(REQUEST_SELECT).order('created_at', { ascending: false })
    query = showDone ? query.not('status', 'in', `(${open.join(',')})`).limit(50) : query.in('status', open)
    query.then(({ data }) => setRows((data ?? []) as RequestRow[]))
  }, [showDone])

  return (
    <Layout back="/jobs" title="Quote requests">
      <div className="toolbar">
        <div className="segmented">
          <button className={!showDone ? 'on' : ''} onClick={() => setShowDone(false)}>Open</button>
          <button className={showDone ? 'on' : ''} onClick={() => setShowDone(true)}>Done</button>
        </div>
        <a href="/book" target="_blank" rel="noreferrer" className="secondary small-btn">Booking form ↗</a>
      </div>
      {rows === null && <p className="muted center">Loading…</p>}
      {rows?.length === 0 && (
        <p className="muted center">{showDone ? 'Nothing here yet.' : 'No open requests. Share the booking form link with customers to get some.'}</p>
      )}
      {showDone && <LeadStats />}
      {!!rows?.length && (
      <ul className="list card">
        {rows?.map((r) => {
          const state = requestState(r)
          return (
            <li key={r.id}>
              <div className="list-main">
                <Link to={`/requests/${r.id}`}><strong>{r.customers?.full_name ?? 'Customer'}</strong></Link>
                <div className="muted small">
                  {BOOK_TYPES[r.move_type] ?? JOB_TYPES[r.move_type] ?? r.move_type}{r.home_size ? ` · ${r.home_size}` : ''} · {dayHeading(r.preferred_date)}
                </div>
                {crossesStateLine(r) && <div className="small tone-warn">Crosses a state line</div>}
              </div>
              <span className={`pill ${state.pill}`}>{state.label}</span>
            </li>
          )
        })}
      </ul>
      )}
    </Layout>
  )
}

type StatRow = { status: RequestStatus; lead_source: LeadSource | null; lost_reason: LostReason | null }

// Last 90 days: where requests came from and how many booked, and why quotes were lost
function LeadStats() {
  const [rows, setRows] = useState<StatRow[] | null>(null)
  useEffect(() => {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
    supabase.from('move_requests').select('status, lead_source, lost_reason').gte('created_at', since)
      .then(({ data }) => setRows((data ?? []) as StatRow[]))
  }, [])
  if (!rows?.length) return null

  const sources = new Map<string, { total: number; booked: number }>()
  for (const r of rows) {
    const key = r.lead_source ? LEAD_SOURCES[r.lead_source] : 'Not known'
    const s = sources.get(key) ?? { total: 0, booked: 0 }
    s.total += 1
    if (r.status === 'accepted') s.booked += 1
    sources.set(key, s)
  }
  const lost = new Map<string, number>()
  for (const r of rows) if (r.status === 'declined') {
    const key = r.lost_reason ? LOST_REASONS[r.lost_reason] : 'No reason given'
    lost.set(key, (lost.get(key) ?? 0) + 1)
  }
  const byCount = <T,>(m: Map<string, T>, n: (v: T) => number) => [...m.entries()].sort((a, b) => n(b[1]) - n(a[1]))

  return (
    <section className="card">
      <h3>Last 90 days</h3>
      <ul className="list">
        {byCount(sources, (s) => s.total).map(([k, s]) => (
          <li key={k}><span>{k}</span><span>{s.total} {s.total === 1 ? 'request' : 'requests'} · {s.booked} booked</span></li>
        ))}
      </ul>
      {lost.size > 0 && (
        <>
          <h3>Why quotes were lost</h3>
          <ul className="list">
            {byCount(lost, (n) => n).map(([k, n]) => <li key={k}><span>{k}</span><span>{n}</span></li>)}
          </ul>
        </>
      )}
    </section>
  )
}
