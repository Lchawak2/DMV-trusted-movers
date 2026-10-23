import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dayHeading, money, parseDay, windowText } from '../../lib/format'
import { JOB_TYPES } from '../../lib/types'
import { addDays, dollars, figures, iso, useJobs, weekOf } from './jobData'
import Insights from './Insights'

// How many jobs can run on one day; the week strip shows how full each day is
const CREWS_PER_DAY = 3

type Level = 'crit' | 'warn' | 'info'
type Todo = { level: Level; title: string; detail: string; to: string; action: string }

export default function Dashboard() {
  const today = iso(new Date())
  const week = weekOf(today)
  const jobs = useJobs(addDays(today, -30), week.end > addDays(today, 7) ? week.end : addDays(today, 7))
  const [signups, setSignups] = useState(0)
  const [requests, setRequests] = useState(0)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('role', 'client')
      .then(({ count }) => setSignups(count ?? 0))
    supabase.from('move_requests').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count }) => setRequests(count ?? 0))
  }, [])

  if (!jobs) return <Layout><p className="muted center">Loading…</p></Layout>

  const todays = jobs.filter((j) => j.job_date === today)
  const thisWeek = jobs.filter((j) => j.job_date >= week.start && j.job_date <= week.end)

  // Needs you: what would go wrong if nobody acted
  const todos: Todo[] = []
  for (const j of jobs) {
    const f = figures(j)
    const name = `${JOB_TYPES[j.job_type] ?? j.job_type}, ${dayHeading(j.job_date)}`
    const to = `/jobs/${j.id}`
    if (j.job_date >= today) {
      const soon = j.job_date <= addDays(today, 2)
      if (f.short) todos.push({ level: soon ? 'crit' : 'warn', title: `Needs ${f.short} more ${f.short === 1 ? 'mover' : 'movers'}`, detail: name, to, action: 'Add crew' })
      if (!f.truckOk) todos.push({ level: soon ? 'crit' : 'warn', title: `No truck booked (${j.truck_size})`, detail: name, to, action: 'Book truck' })
      if (f.waiting) todos.push({ level: 'info', title: `${f.waiting} ${f.waiting === 1 ? 'offer' : 'offers'} waiting for an answer`, detail: name, to, action: 'Open' })
      if (!f.hasPrice) todos.push({ level: 'info', title: 'No customer price set', detail: name, to, action: 'Set price' })
    } else {
      if (j.status !== 'completed' && !f.signed) todos.push({ level: 'warn', title: 'Not signed off or completed', detail: name, to, action: 'Open' })
      else if (j.status !== 'completed') todos.push({ level: 'info', title: 'Signed, mark it completed', detail: name, to, action: 'Complete' })
      if (f.hasPrice && f.due > 0) todos.push({ level: 'warn', title: `Balance due ${money(f.due)}`, detail: name, to, action: 'Record pay' })
    }
  }
  if (requests) todos.push({ level: 'warn', title: `${requests} new quote ${requests === 1 ? 'request' : 'requests'}`, detail: 'Customers waiting for a price', to: '/requests', action: 'Quote' })
  if (signups) todos.push({ level: 'info', title: `${signups} ${signups === 1 ? 'sign-up' : 'sign-ups'} waiting`, detail: 'Approve crew in People', to: '/people', action: 'Review' })
  const rank: Record<Level, number> = { crit: 0, warn: 1, info: 2 }
  todos.sort((a, b) => rank[a.level] - rank[b.level])
  const shown = showAll ? todos : todos.slice(0, 3)

  // Week strip, Monday to Sunday
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(week.start, i)
    const n = jobs.filter((j) => j.job_date === day).length
    return { day, n, free: Math.max(CREWS_PER_DAY - n, 0) }
  })

  const weekMoney = thisWeek.reduce((t, j) => { const f = figures(j); return { charged: t.charged + f.charged, kept: t.kept + f.kept } }, { charged: 0, kept: 0 })

  return (
    <Layout>
      <h2 className="dash-date">{parseDay(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
      {/* What needs doing comes first, on its own, before the numbers */}
      <section className="card needs-you">
        <div className="card-head"><h3>Needs you</h3><span className="muted small">{todos.length ? 'most urgent first' : ''}</span></div>
        {todos.length === 0 && <p className="muted">Nothing needs you right now.</p>}
        <ul className="list">
          {shown.map((t, i) => (
            <li key={i}>
              <span className={`level ${t.level}`} aria-hidden="true" />
              <div className="list-main"><strong>{t.title}</strong><div className="muted small">{t.detail}</div></div>
              <Link to={t.to} className="dark-btn small-btn">{t.action}</Link>
            </li>
          ))}
        </ul>
        {todos.length > 3 && (
          <button type="button" className="see-more" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show less' : `See ${todos.length - 3} more ›`}
          </button>
        )}
      </section>
      <Insights />
      <div className="dash-grid">

      <section className="card">
        <div className="card-head"><h3>This week</h3><span className="muted small">Jobs booked of {CREWS_PER_DAY}</span></div>
        <div className="week-strip">
          {days.map((d) => (
            <div key={d.day} className={`week-day${d.day === today ? ' today' : ''}`}>
              <span className="muted">{parseDay(d.day).toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <strong>{d.n}/{CREWS_PER_DAY}</strong>
              <span className="week-bar"><span className={d.free ? '' : 'full'} style={{ width: `${Math.min(d.n / CREWS_PER_DAY, 1) * 100}%` }} /></span>
              <span className={d.free ? 'muted' : 'full-label'}>{d.day === today ? 'Today' : d.free === 0 ? 'Full' : d.n === 0 ? 'Open' : `${d.free} free`}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h3>Today</h3><span className="muted small">{todays.length} {todays.length === 1 ? 'job' : 'jobs'} · <Link to="/crew-map">Crew map</Link></span></div>
        {todays.length === 0 && <p className="muted">No jobs today.</p>}
        <ul className="list">
          {todays.map((j) => {
            const onClock = j.assignments.filter((a) => a.time_entries.some((e) => !e.clock_out))
            const f = figures(j)
            const phone = f.lead?.accounts?.phone
            return (
              <li key={j.id}>
                <div className="list-main">
                  <Link to={`/jobs/${j.id}`}><strong>{windowText(j.window_start, j.window_end)}</strong></Link> · {JOB_TYPES[j.job_type] ?? j.job_type}
                  <div className="muted small">{j.from_address}</div>
                  <div className="small">
                    {f.signed ? 'Signed off' : onClock.length ? `On the clock: ${onClock.map((a) => a.accounts?.full_name ?? 'mover').join(', ')}` : `Crew of ${f.accepted} not started`}
                  </div>
                </div>
                <div className="today-side">
                  <span className={`pill ${f.signed ? 'good' : onClock.length ? 'info' : 'none'}`}>{f.signed ? 'Done' : onClock.length ? 'Working' : 'Waiting'}</span>
                  {phone && <a href={`tel:${phone}`} className="secondary small-btn">Call lead</a>}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <Link to="/money" className="money-bar">
        <span><span className="money-bar-sub">This week</span>{dollars(weekMoney.charged)} booked · {dollars(weekMoney.kept)} kept</span>
        <span className="money-bar-go">Money ›</span>
      </Link>

      <Link to="/website" className="money-bar">
        <span><span className="money-bar-sub">Website</span>Edit your words, prices and photos</span>
        <span className="money-bar-go">Edit ›</span>
      </Link>
      </div>
    </Layout>
  )
}
