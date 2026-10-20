import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dayHeading } from '../../lib/format'
import { JOB_TYPES } from '../../lib/types'
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
