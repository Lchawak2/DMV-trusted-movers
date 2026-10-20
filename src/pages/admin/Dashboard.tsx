import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dayHeading, money, parseDay, windowText } from '../../lib/format'
import { assignmentPay, hoursWorked } from '../../lib/pay'
import { JOB_TYPES, type Account, type Assignment, type Job, type TimeEntry } from '../../lib/types'

type CrewRow = Assignment & { accounts: Pick<Account, 'full_name' | 'email'> | null; time_entries: TimeEntry[] }
type One<T> = T | T[] | null
type JobRow = Job & {
  assignments: CrewRow[]
  truck_rentals: One<{ id: string }>
  job_costs: { amount: number }[]
  job_extras: { id: string; job_extra_prices: One<{ amount: number }> }[]
  job_signoffs: One<{ job_id: string }>
  job_prices: One<{ price: number; paid: number }>
}

type Level = 'crit' | 'warn' | 'info'
type Todo = { level: Level; title: string; detail: string; to: string }

const first = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v)
const iso = (d: Date) => d.toLocaleDateString('en-CA')
const addDays = (day: string, n: number) => { const d = parseDay(day); d.setDate(d.getDate() + n); return iso(d) }
const needsTruck = (j: Job) => !!j.truck_size && j.job_type !== 'labor_only' && j.job_type !== 'packing'

// Figures for one job, so every section adds up the same way
function figures(j: JobRow) {
  const price = first(j.job_prices)
  const extras = j.job_extras.reduce((s, x) => s + Number(first(x.job_extra_prices)?.amount ?? 0), 0)
  const charged = Number(price?.price ?? 0) + extras
  const crewPay = j.assignments.reduce((s, a) => s + assignmentPay(a, j, a.time_entries), 0)
  const costs = j.job_costs.reduce((s, c) => s + Number(c.amount), 0)
  const accepted = j.assignments.filter((a) => a.status === 'accepted').length
  return {
    hasPrice: Number(price?.price ?? 0) > 0,
    charged, crewPay, costs, kept: charged - crewPay - costs,
    due: Math.max(charged - Number(price?.paid ?? 0), 0),
    accepted,
    waiting: j.assignments.filter((a) => a.status === 'offered').length,
    short: j.crew_size != null ? Math.max(j.crew_size - accepted, 0) : 0,
    truckOk: !needsTruck(j) || !!first(j.truck_rentals),
    signed: !!first(j.job_signoffs),
  }
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  const [signups, setSignups] = useState(0)
  const today = iso(new Date())
  const weekStart = addDays(today, -((parseDay(today).getDay() + 6) % 7))
  const weekEnd = addDays(weekStart, 6)

  useEffect(() => {
    supabase.from('jobs')
      .select('*, assignments(*, accounts(full_name, email), time_entries(*)), truck_rentals(id), job_costs(amount), job_extras(id, job_extra_prices(amount)), job_signoffs(job_id), job_prices(price, paid)')
      .gte('job_date', addDays(today, -30)).lte('job_date', addDays(today, 7))
      .neq('status', 'cancelled')
      .order('job_date').order('window_start')
      .then(({ data }) => setJobs((data ?? []) as JobRow[]))
    supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('role', 'client')
      .then(({ count }) => setSignups(count ?? 0))
  }, [today])

  if (!jobs) return <Layout><p className="muted center">Loading…</p></Layout>

  const upcoming = jobs.filter((j) => j.job_date >= today)
  const todays = jobs.filter((j) => j.job_date === today)
  const week = jobs.filter((j) => j.job_date >= weekStart && j.job_date <= weekEnd)

  // Needs you: what would go wrong if nobody acted
  const todos: Todo[] = []
  for (const j of jobs) {
    const f = figures(j)
    const when = dayHeading(j.job_date)
    const name = `${JOB_TYPES[j.job_type] ?? j.job_type}, ${when}`
    const to = `/jobs/${j.id}`
    if (j.job_date >= today) {
      const soon = j.job_date <= addDays(today, 2)
      if (f.short) todos.push({ level: soon ? 'crit' : 'warn', title: `Needs ${f.short} more ${f.short === 1 ? 'mover' : 'movers'}`, detail: name, to })
      if (f.waiting) todos.push({ level: 'info', title: `${f.waiting} ${f.waiting === 1 ? 'offer' : 'offers'} waiting for an answer`, detail: name, to })
      if (!f.truckOk) todos.push({ level: soon ? 'crit' : 'warn', title: `No truck rental booked (${j.truck_size})`, detail: name, to })
      if (!f.hasPrice) todos.push({ level: 'info', title: 'No customer price set', detail: name, to })
    } else {
      if (j.status !== 'completed' && !f.signed) todos.push({ level: 'warn', title: 'Not signed off or marked completed', detail: name, to })
      else if (j.status !== 'completed') todos.push({ level: 'info', title: 'Signed, mark it completed', detail: name, to })
      if (f.hasPrice && f.due > 0) todos.push({ level: 'warn', title: `Balance due ${money(f.due)}`, detail: name, to })
    }
  }
  if (signups) todos.push({ level: 'info', title: `${signups} ${signups === 1 ? 'sign-up' : 'sign-ups'} waiting`, detail: 'Approve crew in People', to: '/people' })
  const rank: Record<Level, number> = { crit: 0, warn: 1, info: 2 }
  todos.sort((a, b) => rank[a.level] - rank[b.level])

  // This week's money
  const totals = week.reduce((t, j) => {
    const f = figures(j)
    return { charged: t.charged + f.charged, crewPay: t.crewPay + f.crewPay, costs: t.costs + f.costs }
  }, { charged: 0, crewPay: 0, costs: 0 })
  const kept = totals.charged - totals.crewPay - totals.costs
  const unpriced = week.filter((j) => !figures(j).hasPrice).length

  // Crew this week
  const movers = new Map<string, { name: string; jobs: number; hours: number; owed: number }>()
  for (const j of week) {
    for (const a of j.assignments.filter((x) => x.status === 'accepted')) {
      const m = movers.get(a.crew_id) ?? { name: a.accounts?.full_name ?? a.accounts?.email ?? 'Mover', jobs: 0, hours: 0, owed: 0 }
      m.jobs += 1
      m.hours += hoursWorked(a.time_entries)
      m.owed += assignmentPay(a, j, a.time_entries)
      movers.set(a.crew_id, m)
    }
  }
  const crew = [...movers.values()].sort((a, b) => b.owed - a.owed)

  return (
    <Layout>
      <h2 className="dash-date">{parseDay(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>

      <div className="kpis">
        <Kpi label="Jobs this week" value={String(week.length)} sub={`${upcoming.length} in the next 7 days`} />
        <Kpi label="Booked this week" value={money(totals.charged)} sub={unpriced ? `${unpriced} without a price` : 'Price plus extras'} />
        <Kpi label="Crew pay" value={money(totals.crewPay)} sub={`Costs ${money(totals.costs)}`} />
        <Kpi label="Kept" value={money(kept)} sub={totals.charged ? `${Math.round((kept / totals.charged) * 100)}% margin` : 'Set prices to see margin'} warn={kept < 0} />
      </div>

      <section className="card">
        <div className="card-head"><h3>Needs you</h3><span className="muted small">{todos.length ? `${todos.length} items` : ''}</span></div>
        {todos.length === 0 && <p className="muted">Nothing needs you right now.</p>}
        <ul className="list">
          {todos.map((t, i) => (
            <li key={i}>
              <span className={`level ${t.level}`} aria-hidden="true" />
              <div className="list-main"><strong>{t.title}</strong><div className="muted small">{t.detail}</div></div>
              <Link to={t.to} className="secondary small-btn">Open</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="card-head"><h3>Today</h3><span className="muted small">{todays.length} {todays.length === 1 ? 'job' : 'jobs'}</span></div>
        {todays.length === 0 && <p className="muted">No jobs today.</p>}
        <ul className="list">
          {todays.map((j) => {
            const onClock = j.assignments.filter((a) => a.time_entries.some((e) => !e.clock_out))
            const f = figures(j)
            return (
              <li key={j.id}>
                <div className="list-main">
                  <Link to={`/jobs/${j.id}`}><strong>{windowText(j.window_start, j.window_end)}</strong></Link> · {JOB_TYPES[j.job_type] ?? j.job_type}
                  <div className="muted small">{j.from_address}</div>
                  <div className="small">
                    {f.signed ? 'Signed off' : onClock.length ? `On the clock: ${onClock.map((a) => a.accounts?.full_name ?? 'mover').join(', ')}` : 'Not started'}
                  </div>
                </div>
                <span className={`pill ${f.signed ? 'good' : onClock.length ? 'info' : 'none'}`}>{f.signed ? 'Done' : onClock.length ? 'Working' : 'Waiting'}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <div className="card-head"><h3>Next 7 days</h3><span className="muted small">Ready = crew, truck and price set</span></div>
        {upcoming.length === 0 && <p className="muted">Nothing booked yet.</p>}
        <ul className="list">
          {upcoming.map((j) => {
            const f = figures(j)
            const ready = !f.short && f.truckOk && f.hasPrice
            return (
              <li key={j.id}>
                <div className="list-main">
                  <Link to={`/jobs/${j.id}`}><strong>{dayHeading(j.job_date)}</strong></Link> · {JOB_TYPES[j.job_type] ?? j.job_type}
                  <div className="muted small">
                    Crew {f.accepted}{j.crew_size ? ` of ${j.crew_size}` : ''} · Truck {needsTruck(j) ? (f.truckOk ? 'booked' : 'not booked') : 'not needed'} · {f.hasPrice ? money(f.charged) : 'No price'}
                  </div>
                </div>
                <span className={`pill ${ready ? 'good' : 'warn'}`}>{ready ? 'Ready' : 'Not ready'}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <div className="card-head"><h3>Crew this week</h3><span className="muted small">{dayHeading(weekStart)} to {dayHeading(weekEnd)}</span></div>
        {crew.length === 0 && <p className="muted">No one has accepted a job this week yet.</p>}
        <ul className="list">
          {crew.map((m) => (
            <li key={m.name}>
              <div className="list-main"><strong>{m.name}</strong><div className="muted small">{m.jobs} {m.jobs === 1 ? 'job' : 'jobs'} · {m.hours.toFixed(1)} hours worked</div></div>
              <strong>{money(m.owed)}</strong>
            </li>
          ))}
        </ul>
        {crew.length > 0 && <p className="small">Total pay this week <strong>{money(crew.reduce((s, m) => s + m.owed, 0))}</strong></p>}
      </section>
    </Layout>
  )
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="kpi">
      <div className="muted small">{label}</div>
      <div className={`kpi-value${warn ? ' warn' : ''}`}>{value}</div>
      <div className="muted small">{sub}</div>
    </div>
  )
}
