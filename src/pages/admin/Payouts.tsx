import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dayHeading, money } from '../../lib/format'
import { assignmentPay } from '../../lib/pay'
import { JOB_TYPES, PAY_METHODS, type Job, type PayMethod } from '../../lib/types'
import { iso, type CrewRow } from './jobData'

type Row = CrewRow & { jobs: Pick<Job, 'id' | 'job_date' | 'job_type' | 'est_hours' | 'status'> }
const SELECT = '*, accounts(full_name, email, phone, zelle), time_entries(*), jobs!inner(id, job_date, job_type, est_hours, status)'

// Crew are paid after each job: everyone who worked a job up to today and hasn't been paid yet
export default function Payouts() {
  const [owed, setOwed] = useState<Row[] | null>(null)
  const [paid, setPaid] = useState<Row[]>([])
  const [error, setError] = useState('')

  async function load() {
    const [o, p] = await Promise.all([
      supabase.from('assignments').select(SELECT)
        .eq('status', 'accepted').is('paid_at', null)
        .lte('jobs.job_date', iso(new Date())).neq('jobs.status', 'cancelled'),
      supabase.from('assignments').select(SELECT)
        .not('paid_at', 'is', null).order('paid_at', { ascending: false }).limit(20),
    ])
    const rows = (o.data ?? []) as Row[]
    setOwed(rows.sort((a, b) => a.jobs.job_date.localeCompare(b.jobs.job_date)))
    setPaid((p.data ?? []) as Row[])
  }

  useEffect(() => { load() }, [])

  async function markPaid(a: Row, amount: number, method: PayMethod) {
    setError('')
    const { error: e } = await supabase.from('assignments')
      .update({ paid_at: new Date().toISOString(), paid_amount: amount, paid_method: method }).eq('id', a.id)
    if (e) setError(e.message)
    load()
  }

  async function undo(a: Row) {
    await supabase.from('assignments').update({ paid_at: null, paid_amount: null, paid_method: null }).eq('id', a.id)
    load()
  }

  if (!owed) return <Layout back="/money" title="Pay crew"><p className="muted center">Loading…</p></Layout>

  // Group by job so each job reads as one payday
  const jobs = new Map<string, Row[]>()
  for (const a of owed) jobs.set(a.jobs.id, [...(jobs.get(a.jobs.id) ?? []), a])
  const total = owed.reduce((s, a) => s + assignmentPay(a, a.jobs, a.time_entries), 0)

  return (
    <Layout back="/money" title="Pay crew">
      <div className="kpis">
        <div className="kpi">
          <div className="muted small">You owe crew</div>
          <div className="kpi-value">{money(total)}</div>
          <div className="small muted">{owed.length} {owed.length === 1 ? 'person' : 'people'} to pay</div>
        </div>
        <div className="kpi">
          <div className="muted small">Paid recently</div>
          <div className="kpi-value">{money(paid.reduce((s, a) => s + Number(a.paid_amount ?? 0), 0))}</div>
          <div className="small muted">Last {paid.length} payouts</div>
        </div>
      </div>
      {error && <p className="warn">{error}</p>}

      {jobs.size === 0 && <section className="card"><p className="muted">Everyone is paid. Crew show up here after each job.</p></section>}
      {[...jobs.values()].map((crew) => {
        const job = crew[0].jobs
        return (
          <section className="card" key={job.id}>
            <div className="card-head">
              <Link to={`/jobs/${job.id}`}><h3>{JOB_TYPES[job.job_type] ?? job.job_type} · {dayHeading(job.job_date)}</h3></Link>
            </div>
            <ul className="list">
              {crew.map((a) => <OwedRow key={a.id} a={a} onPaid={markPaid} />)}
            </ul>
          </section>
        )
      })}

      {paid.length > 0 && (
        <section className="card">
          <h3>Paid</h3>
          <ul className="list">
            {paid.map((a) => (
              <li key={a.id}>
                <div className="list-main">
                  <strong>{a.accounts?.full_name ?? a.accounts?.email}</strong>
                  <div className="muted small">
                    {JOB_TYPES[a.jobs.job_type] ?? a.jobs.job_type} · {dayHeading(a.jobs.job_date)} · {PAY_METHODS[a.paid_method!]}, {new Date(a.paid_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div className="list-side">
                  <strong>{money(a.paid_amount)}</strong>
                  <button className="link" onClick={() => undo(a)}>Undo</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Layout>
  )
}

function OwedRow({ a, onPaid }: { a: Row; onPaid: (a: Row, amount: number, method: PayMethod) => Promise<void> }) {
  const due = Math.round(assignmentPay(a, a.jobs, a.time_entries) * 100) / 100
  const [amount, setAmount] = useState(String(due))
  const [method, setMethod] = useState<PayMethod>('zelle')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const onClock = a.time_entries.some((t) => !t.clock_out)
  const hours = a.pay_type === 'hourly' ? (a.time_entries.length ? 'hours on the clock' : 'estimated hours') : null

  return (
    <li className="stack">
      <div className="card-head">
        <div>
          <strong>{a.accounts?.full_name ?? a.accounts?.email}</strong>
          <div className="muted small">
            {a.role === 'lead' ? 'Lead' : 'Helper'} · {a.pay_type === 'hourly' ? `${money(a.crew_pay)}/hr × ${hours}` : 'flat pay'}
            {a.accounts?.phone ? ` · ${a.accounts.phone}` : ''}
          </div>
          {onClock && <div className="small tone-warn">Still on the clock</div>}
          {a.accounts?.zelle ? (
            <div className="small">
              Zelle: <strong>{a.accounts.zelle}</strong>{' '}
              <button className="link" onClick={() => { navigator.clipboard?.writeText(a.accounts!.zelle!); setCopied(true) }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          ) : (
            <div className="small muted">No Zelle saved yet. Add it in People.</div>
          )}
        </div>
        <strong>{money(due)}</strong>
      </div>
      <div className="payout-row">
        <input className="pay" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount paid" />
        <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} aria-label="Paid with">
          {Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="primary small-btn" disabled={busy || amount === '' || Number(amount) < 0}
          onClick={async () => { setBusy(true); await onPaid(a, Number(amount), method); setBusy(false) }}>
          Mark paid
        </button>
      </div>
    </li>
  )
}
