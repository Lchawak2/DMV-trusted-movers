import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicPage from '../../components/PublicPage'
import Pending from '../Pending'
import DeleteAccount from '../../components/DeleteAccount'
import { supabase } from '../../lib/supabase'
import { dayHeading, money } from '../../lib/format'
import { JOB_TYPES } from '../../lib/types'
import { BOOK_TYPES } from '../Book'
import { CLAIM_KEY } from './claim'

type Move = {
  request_id: string
  date: string
  move_type: string
  home_size: string | null
  from_address: string
  to_address: string | null
  request_status: string
  job_status: string | null
  token: string | null
  quote_status: string | null
  price: number | null
}

function state(m: Move): { label: string; pill: string } {
  if (m.job_status === 'cancelled' || m.request_status === 'cancelled') return { label: 'Cancelled', pill: 'none' }
  if (m.job_status === 'completed') return { label: 'Done', pill: 'good' }
  if (m.job_status) return { label: 'Booked', pill: 'good' }
  if (m.quote_status === 'sent') return { label: 'Quote ready', pill: 'warn' }
  if (m.quote_status === 'expired') return { label: 'Quote expired', pill: 'none' }
  if (m.request_status === 'declined') return { label: 'Not booked', pill: 'none' }
  return { label: 'Waiting for your quote', pill: 'info' }
}

// A signed-in customer's moves. A sign-up with no moves is someone waiting to join the crew.
export default function MyMoves() {
  const [moves, setMoves] = useState<Move[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      // Link the booking they started the account from
      let token: string | null = new URLSearchParams(location.search).get('booking')
      if (!token) try { token = localStorage.getItem(CLAIM_KEY) } catch { /* none saved */ }
      if (token) {
        const { error: e } = await supabase.rpc('claim_booking', { p_token: token })
        if (e) setError(e.message)
        try { localStorage.removeItem(CLAIM_KEY) } catch { /* ignore */ }
      }
      const { data } = await supabase.rpc('my_moves')
      setMoves((data ?? []) as Move[])
    })()
  }, [])

  if (moves === null) return <PublicPage sub="Your moves"><p className="muted center">Loading…</p></PublicPage>
  if (moves.length === 0 && !error) return <Pending />

  const today = new Date().toLocaleDateString('en-CA')
  const upcoming = moves.filter((m) => m.date >= today && state(m).label !== 'Cancelled').reverse()
  const past = moves.filter((m) => !upcoming.includes(m))

  return (
    <PublicPage sub="Your moves">
      {error && <p className="warn">{error}</p>}
      <Link to="/book" className="primary block">Book another move</Link>
      {[['Coming up', upcoming], ['Past moves', past]].map(([title, list]) => (list as Move[]).length > 0 && (
        <section className="card" key={title as string}>
          <h3>{title as string}</h3>
          <ul className="list">
            {(list as Move[]).map((m) => {
              const s = state(m)
              return (
                <li key={m.request_id} className="stack">
                  <div className="card-head">
                    <strong>{dayHeading(m.date)}</strong>
                    <span className={`pill ${s.pill}`}>{s.label}</span>
                  </div>
                  <span className="muted small">
                    {BOOK_TYPES[m.move_type] ?? JOB_TYPES[m.move_type] ?? m.move_type}{m.home_size ? `, ${m.home_size}` : ''}
                    {m.price ? ` · ${money(m.price)}` : ''}
                  </span>
                  <span className="small">{m.from_address}{m.to_address ? ` → ${m.to_address}` : ''}</span>
                  {m.token && <Link to={`/quote/${m.token}`} className="link">Open</Link>}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      <DeleteAccount />
    </PublicPage>
  )
}
