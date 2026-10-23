import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { parseDay, windowText } from '../../lib/format'
import { JOB_TYPES } from '../../lib/types'
import { addDays, dollars, figures, iso, useJobs, weekOf } from './jobData'
import Insights from './Insights'
import { useTodos } from './needs'

// How many jobs can run on one day; the week strip shows how full each day is
const CREWS_PER_DAY = 3

export default function Dashboard() {
  const today = iso(new Date())
  const week = weekOf(today)
  const jobs = useJobs(addDays(today, -30), week.end > addDays(today, 7) ? week.end : addDays(today, 7))
  const todos = useTodos()
  const urgent = todos?.filter((t) => t.level !== 'info').length ?? 0

  if (!jobs) return <Layout><p className="muted center">Loading…</p></Layout>

  const todays = jobs.filter((j) => j.job_date === today)
  const thisWeek = jobs.filter((j) => j.job_date >= week.start && j.job_date <= week.end)


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
      {urgent > 0 && (
        <Link to="/needs" className="needs-banner">
          <span><span className="level warn" aria-hidden="true" />{urgent} {urgent === 1 ? 'urgent thing needs' : 'urgent things need'} you</span>
          <span>Open ›</span>
        </Link>
      )}
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
