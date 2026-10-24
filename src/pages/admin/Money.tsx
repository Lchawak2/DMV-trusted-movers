import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { dayHeading } from '../../lib/format'
import { JOB_TYPES } from '../../lib/types'
import { crewPay, dollars, figures, iso, monthOf, useJobs, weekOf } from './jobData'

// Jobs that keep less than this share of the price are flagged
const LOW_MARGIN = 0.35

export default function Money() {
  const today = iso(new Date())
  const week = weekOf(today)
  const month = monthOf(today)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  // Load both ranges once so the switch is instant
  const jobs = useJobs(week.start < month.start ? week.start : month.start, week.end > month.end ? week.end : month.end)

  if (!jobs) return <Layout><p className="muted center">Loading…</p></Layout>

  const range = period === 'week' ? week : month
  const inRange = jobs.filter((j) => j.job_date >= range.start && j.job_date <= range.end)
  const rows = inRange.map((j) => ({ j, f: figures(j) }))

  const booked = rows.reduce((s, r) => s + r.f.charged, 0)
  const kept = rows.reduce((s, r) => s + r.f.kept, 0)
  const unpaid = rows.filter((r) => r.j.job_date <= today && r.f.hasPrice && r.f.due > 0)
  const owedByCustomers = unpaid.reduce((s, r) => s + r.f.due, 0)
  const crew = crewPay(inRange)
  const owedToCrew = crew.reduce((s, m) => s + m.owed, 0)
  const priced = rows.filter((r) => r.f.hasPrice)
  const unpriced = rows.length - priced.length

  return (
    <Layout>
      <div className="segmented wide">
        <button type="button" className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>This week</button>
        <button type="button" className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>This month</button>
      </div>

      <div className="kpis">
        <Kpi label="Customers owe you" value={dollars(owedByCustomers)} sub={unpaid.length ? `${unpaid.length} unpaid ${unpaid.length === 1 ? 'balance' : 'balances'}` : 'All paid'} tone={unpaid.length ? 'warn' : undefined} />
        <Kpi label="Crew pay" value={dollars(owedToCrew)} sub={`${crew.length} ${crew.length === 1 ? 'mover' : 'movers'}`} />
        <Kpi label="Booked" value={dollars(booked)} sub={unpriced ? `${unpriced} without a price` : `${rows.length} ${rows.length === 1 ? 'job' : 'jobs'}`} />
        <Kpi label="Kept" value={dollars(kept)} sub={booked ? `${Math.round((kept / booked) * 100)}% margin` : 'Set prices to see margin'} tone={kept < 0 ? 'bad' : booked ? 'good' : undefined} />
      </div>

      <section className="card">
        <div className="card-head"><h3>Did each job make money?</h3><span className="muted small">Kept</span></div>
        {priced.length === 0 && <p className="muted">No priced jobs {period === 'week' ? 'this week' : 'this month'} yet. Set a price on a job to see it here.</p>}
        <ul className="list">
          {priced.map(({ j, f }) => {
            const margin = f.charged ? f.kept / f.charged : 0
            return (
              <li key={j.id}>
                <div className="list-main">
                  <Link to={`/jobs/${j.id}`}><strong>{JOB_TYPES[j.job_type] ?? j.job_type} · {dayHeading(j.job_date)}</strong></Link>
                  <div className="muted small">{dollars(f.charged)} price · {f.accepted} {f.accepted === 1 ? 'mover' : 'movers'}{f.costs + f.guess.total ? ` · costs ${dollars(f.costs + f.guess.total)}` : ''}</div>
                </div>
                <div className="today-side">
                  <strong>{dollars(f.kept)}</strong>
                  <span className={`pill ${margin >= LOW_MARGIN ? 'good' : 'warn'}`}>{Math.round(margin * 100)}%</span>
                </div>
              </li>
            )
          })}
        </ul>
        {priced.length > 0 && <p className="note">Kept counts crew pay, the costs you added, and your price plan numbers for anything not added yet (truck, other costs, card fees).</p>}
        <Link to="/price-plan" className="secondary block">Price plan and my costs</Link>
      </section>

      <section className="card">
        <div className="card-head"><h3>Crew pay</h3><span className="muted small">{period === 'week' ? 'This week' : 'This month'}</span></div>
        {crew.length === 0 && <p className="muted">No one has accepted a job in this period yet.</p>}
        <ul className="list">
          {crew.map((m) => (
            <li key={m.name}>
              <div className="list-main"><strong>{m.name}</strong><div className="muted small">{m.lead ? 'Lead · ' : ''}{m.jobs} {m.jobs === 1 ? 'job' : 'jobs'} · {m.hours.toFixed(1)} h worked</div></div>
              <strong>{dollars(m.owed)}</strong>
            </li>
          ))}
        </ul>
        {crew.length > 0 && <div className="total-row"><span>Total</span><span>{dollars(owedToCrew)}</span></div>}
        <Link to="/payouts" className="secondary block">Pay crew</Link>
      </section>
    </Layout>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="kpi">
      <div className="muted small">{label}</div>
      <div className={`kpi-value${tone === 'bad' ? ' warn' : ''}`}>{value}</div>
      <div className={`small ${tone ? `tone-${tone}` : 'muted'}`}>{sub}</div>
    </div>
  )
}
