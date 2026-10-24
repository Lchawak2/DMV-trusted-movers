import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import JobDayChecklist from '../jobday/JobDayChecklist'
import TruckSteps from '../jobday/TruckSteps'
import { useJobDay } from '../jobday/useJobDay'
import { supabase } from '../../lib/supabase'
import { assignmentPay } from '../../lib/pay'
import { costGuesses, moverPay, useCosts } from '../../lib/costs'
import { dateTime, dayHeading, fromLocalInput, money, smsLink, toLocalInput, windowText } from '../../lib/format'
import SendText from '../../components/SendText'
import ReviewSection from './ReviewSection'
import {
  JOB_TYPES, PAY_METHODS, TRUCK_SIZES,
  type Account, type Assignment, type Job, type JobCost, type JobStatus, type JobTips, type TimeEntry, type TruckRental,
} from '../../lib/types'

type CrewRow = Assignment & { accounts: Pick<Account, 'full_name' | 'email' | 'phone'>; time_entries: TimeEntry[] }

const STATUSES: JobStatus[] = ['scheduled', 'in_progress', 'completed', 'on_hold', 'cancelled']
const TABS = { job: 'Job', crew: 'Crew', money: 'Money' } as const
type Tab = keyof typeof TABS

export default function AdminJobDetail() {
  const { id } = useParams() as { id: string }
  const navigate = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [crew, setCrew] = useState<CrewRow[]>([])
  const [rental, setRental] = useState<TruckRental | null>(null)
  const [costs, setCosts] = useState<JobCost[]>([])
  const day = useJobDay(id)
  // The open tab lives in the link (?tab=crew), so alerts can open the right one
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab') ?? ''
  const tab: Tab = asked in TABS ? (asked as Tab) : 'job'

  const load = useCallback(async () => {
    const [j, a, r, c] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('assignments').select('*, accounts(full_name, email, phone), time_entries(*)').eq('job_id', id).order('created_at'),
      supabase.from('truck_rentals').select('*').eq('job_id', id).maybeSingle(),
      supabase.from('job_costs').select('*').eq('job_id', id).order('created_at'),
    ])
    setJob(j.data as Job)
    setCrew((a.data ?? []) as CrewRow[])
    setRental(r.data as TruckRental | null)
    setCosts((c.data ?? []) as JobCost[])
  }, [id])

  useEffect(() => { load() }, [load])

  if (!job) return <Layout back="/jobs"><p className="muted center">Loading…</p></Layout>

  async function setStatus(status: JobStatus) {
    if (status === 'cancelled' && !confirm('Cancel this job? Everyone on the crew who hasn\'t been paid is taken off it.')) return
    await supabase.from('jobs').update({ status }).eq('id', id)
    load()
  }

  async function remove() {
    if (!confirm('Delete this job and everything attached to it?')) return
    await supabase.from('jobs').delete().eq('id', id)
    navigate('/jobs', { replace: true })
  }

  const totalPay = crew.reduce((s, a) => s + assignmentPay(a, job, a.time_entries), 0)
  const totalCosts = costs.reduce((s, c) => s + Number(c.amount), 0)

  const accepted = crew.filter((a) => a.status === 'accepted').length
  const crewLabel = job.crew_size ? `Crew ${accepted}/${job.crew_size}` : 'Crew'

  return (
    <Layout back="/jobs" title="Job">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{dayHeading(job.job_date)}</h2>
            <p className="muted">{windowText(job.window_start, job.window_end)} · {JOB_TYPES[job.job_type] ?? job.job_type}</p>
          </div>
          <Link to={`/jobs/${id}/edit`} className="secondary">Edit</Link>
        </div>
        <ol className="route">
          <li>{job.from_address}</li>
          {job.to_address && <li>{job.to_address}</li>}
        </ol>
        <label>
          Status
          <select value={job.status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
      </section>

      {job.status === 'cancelled' && <CancelledSection job={job} />}
      {job.change_status === 'pending' && job.change_date && job.status !== 'cancelled' && <DateChangeSection job={job} onChange={load} />}

      <div className="segmented" role="tablist">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''}
            onClick={() => setParams(t === 'job' ? {} : { tab: t }, { replace: true })}>
            {t === 'crew' ? crewLabel : TABS[t]}
            {t === 'crew' && job.crew_size != null && accepted < job.crew_size && <span className="seg-dot" />}
          </button>
        ))}
      </div>

      {tab === 'job' && (
        <>
          <section className="card">
            <div className="facts">
              <div><span>Truck</span>{job.truck_size ?? '—'}</div>
              <div><span>Crew</span>{job.crew_size ?? '—'}</div>
              <div><span>Hours</span>{job.est_hours ?? '—'}</div>
            </div>
            {job.access_notes && <div className="notes"><span>Access</span>{job.access_notes}</div>}
          </section>
          {job.status === 'completed' && <ReviewSection jobId={id} quoteId={job.quote_id} />}
          <JobDayChecklist jobId={id} photos={day.photos} extras={day.extras} signoff={day.signoff} />
          <RentalSection jobId={id} rental={rental} onChange={load} />
          <button className="danger" onClick={remove}>Delete job</button>
        </>
      )}

      {tab === 'crew' && <CrewSection job={job} crew={crew} onChange={load} />}

      {tab === 'money' && (
        <>
          <MoneySection job={job} extrasTotal={Object.values(day.prices).reduce((s, n) => s + n, 0)} crewPay={totalPay} costs={totalCosts}
            hasCrew={crew.some((a) => a.status !== 'declined' && a.status !== 'removed')} costKinds={costs.map((c) => c.kind)} />
          <CostsSection jobId={id} costs={costs} onChange={load} />
        </>
      )}
    </Layout>
  )
}

// The customer asked for a new date from their booking link
function DateChangeSection({ job, onChange }: { job: Job; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function answer(approve: boolean) {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('answer_date_change', { p_job: job.id, p_approve: approve })
    setBusy(false)
    if (error) return setError(error.message)
    onChange()
  }

  return (
    <section className="card change-card">
      <h3>Customer asked for a new date</h3>
      <p><strong>{dayHeading(job.change_date!)}</strong> instead of {dayHeading(job.job_date)}, same time.</p>
      {job.change_note && <div className="notes"><span>Note</span>{job.change_note}</div>}
      <p className="note">Approving moves the job. Check your crew can make the new day, or change them on the Crew tab after.</p>
      {error && <p className="warn">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy} onClick={() => answer(true)}>Approve</button>
        <button className="secondary" disabled={busy} onClick={() => answer(false)}>Decline</button>
      </div>
    </section>
  )
}

// Who cancelled, and the card deposit: refunded, or kept with a button to refund it
function CancelledSection({ job }: { job: Job }) {
  const [deposits, setDeposits] = useState<{ amount: number; status: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!job.quote_id) return setDeposits([])
    supabase.from('payments').select('amount, status').eq('quote_id', job.quote_id).eq('kind', 'deposit').in('status', ['paid', 'refunded'])
      .then(({ data }) => setDeposits((data ?? []) as { amount: number; status: string }[]))
  }, [job.quote_id])
  useEffect(() => { load() }, [load])

  const held = (deposits ?? []).filter((d) => d.status === 'paid').reduce((s, d) => s + Number(d.amount), 0)
  const refunded = (deposits ?? []).filter((d) => d.status === 'refunded').reduce((s, d) => s + Number(d.amount), 0)

  async function refund() {
    if (!confirm(`Refund ${money(held)} to the customer's card?`)) return
    setBusy(true)
    setError('')
    const { data, error: e } = await supabase.functions.invoke('deposit', { body: { action: 'refund', job_id: job.id } })
    setBusy(false)
    if (e || data?.error) setError(data?.error ?? 'The refund did not go through. Try again, or refund it in Stripe.')
    load()
  }

  return (
    <section className="card">
      <h3>Cancelled</h3>
      <p className="muted">
        {job.cancelled_by === 'customer' ? 'The customer cancelled' : 'You cancelled'}
        {job.cancelled_at ? ` on ${dateTime(job.cancelled_at)}` : ''}.
      </p>
      {refunded > 0 && <p className="tone-good">Deposit of {money(refunded)} refunded to their card.</p>}
      {held > 0 && (
        <>
          <p>You're keeping the {money(held)} deposit.</p>
          {error && <p className="warn">{error}</p>}
          <button className="secondary" disabled={busy} onClick={refund}>{busy ? 'Refunding…' : `Refund ${money(held)}`}</button>
        </>
      )}
    </section>
  )
}

function CrewSection({ job, crew, onChange }: { job: Job; crew: CrewRow[]; onChange: () => void }) {
  const [people, setPeople] = useState<Account[]>([])
  const [crewId, setCrewId] = useState('')
  const [role, setRole] = useState<'lead' | 'helper'>('helper')
  const [pay, setPay] = useState('')
  const [payType, setPayType] = useState<'flat' | 'hourly'>('flat')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('accounts').select('*').eq('role', 'crew').eq('active', true).order('full_name')
      .then(({ data }) => setPeople((data ?? []) as Account[]))
  }, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const person = people.find((p) => p.id === crewId)
    if (!person) return
    if (role === 'lead' && !person.can_lead) {
      return setError(`${person.full_name ?? person.email} isn't approved to lead. Turn on "Can lead" in People first.`)
    }
    if (role === 'lead' && crew.some((a) => a.role === 'lead' && (a.status === 'offered' || a.status === 'accepted'))) {
      return setError('This job already has a lead. Remove them first.')
    }
    // Block double-booking: same crew member on another job that day with an overlapping window
    const { data: sameDay } = await supabase.from('assignments')
      .select('job_id, jobs!inner(job_date, window_start, window_end, est_hours)')
      .eq('crew_id', crewId).in('status', ['offered', 'accepted'])
      .eq('jobs.job_date', job.job_date).neq('job_id', job.id)
    const clash = (sameDay ?? []).some((row) => {
      const other = row.jobs as unknown as Pick<Job, 'window_start' | 'window_end' | 'est_hours'>
      return overlaps(job, other)
    })
    if (clash) return setError(`${person.full_name ?? person.email} is already booked on another job at that time.`)

    if (crew.some((a) => a.crew_id === crewId && (a.status === 'offered' || a.status === 'accepted'))) {
      return setError('Already on this job.')
    }
    // Someone who declined or was removed earlier gets a fresh offer on the same row
    const { error: saveError } = await supabase.from('assignments').upsert(
      { job_id: job.id, crew_id: crewId, role, crew_pay: Number(pay || 0), pay_type: payType, status: 'offered' },
      { onConflict: 'job_id,crew_id' },
    )
    if (saveError) return setError(saveError.message)
    setCrewId('')
    setPay('')
    onChange()
  }

  async function setPayFor(a: CrewRow, value: string) {
    await supabase.from('assignments').update({ crew_pay: Number(value || 0) }).eq('id', a.id)
    onChange()
  }

  async function removeCrew(a: CrewRow) {
    await supabase.from('assignments').update({ status: 'removed' }).eq('id', a.id)
    onChange()
  }

  const accepted = crew.filter((a) => a.status === 'accepted').length

  return (
    <section className="card">
      <h3>Crew {job.crew_size ? `(${accepted} of ${job.crew_size} accepted)` : ''}</h3>
      {crew.length === 0 && <p className="muted">No one assigned yet.</p>}
      <ul className="list">
        {crew.map((a) => {
          const entry = a.time_entries[0]
          return (
            <li key={a.id} className={a.status === 'declined' || a.status === 'removed' ? 'faded' : ''}>
              <div className="list-main">
                <strong>{a.accounts.full_name ?? a.accounts.email}</strong>
                <span className="muted"> · {a.role} · {a.status}</span>
                {a.paid_at && <div className="small tone-good">Paid {money(a.paid_amount)} · {PAY_METHODS[a.paid_method!]}</div>}
                {entry && (
                  <div className="muted small">
                    In {dateTime(entry.clock_in)}{entry.clock_out ? ` · Out ${dateTime(entry.clock_out)}` : ' · On the clock'}
                  </div>
                )}
              </div>
              <div className="list-side">
                <input className="pay" type="number" min={0} step={1} defaultValue={a.crew_pay}
                  onBlur={(e) => e.target.value !== String(a.crew_pay) && setPayFor(a, e.target.value)}
                  aria-label="Crew pay" />
                <span className="muted small">{a.pay_type === 'hourly' ? '/hr' : 'flat'}</span>
                {(a.status === 'offered' || a.status === 'accepted') && (
                  <button className="link" onClick={() => removeCrew(a)}>Remove</button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <form className="form inline-form" onSubmit={add}>
        <select value={crewId} onChange={(e) => setCrewId(e.target.value)} required>
          <option value="">Add crew member</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}{p.can_lead ? ' (can lead)' : ''}</option>)}
        </select>
        <div className="row">
          <select value={role} onChange={(e) => setRole(e.target.value as 'lead' | 'helper')}>
            <option value="helper">Helper</option>
            <option value="lead">Lead</option>
          </select>
          <input type="number" min={0} placeholder="Pay $" value={pay} onChange={(e) => setPay(e.target.value)} required />
          <select value={payType} onChange={(e) => setPayType(e.target.value as 'flat' | 'hourly')}>
            <option value="flat">Flat</option>
            <option value="hourly">Hourly</option>
          </select>
        </div>
        {error && <p className="warn">{error}</p>}
        <button className="secondary">Offer job</button>
      </form>
      {people.length === 0 && <p className="muted small">No crew yet. Approve crew members in People.</p>}
    </section>
  )
}

// Windows are arrival windows; the job runs from window start for its estimated hours
function overlaps(a: Pick<Job, 'window_start' | 'window_end' | 'est_hours'>, b: Pick<Job, 'window_start' | 'window_end' | 'est_hours'>) {
  if (!a.window_start || !b.window_start) return true
  const span = (j: typeof a) => {
    const [h, m] = j.window_start!.split(':').map(Number)
    const start = h * 60 + m
    return [start, start + (Number(j.est_hours) || 4) * 60]
  }
  const [s1, e1] = span(a)
  const [s2, e2] = span(b)
  return s1 < e2 && s2 < e1
}

function RentalSection({ jobId, rental, onChange }: { jobId: string; rental: TruckRental | null; onChange: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    company: '', confirmation: '', truck_size: '', pickup_location: '', pickup_at: '', return_location: '', return_at: '',
  })

  function startEdit() {
    setForm({
      company: rental?.company ?? '',
      confirmation: rental?.confirmation ?? '',
      truck_size: rental?.truck_size ?? '',
      pickup_location: rental?.pickup_location ?? '',
      pickup_at: toLocalInput(rental?.pickup_at ?? null),
      return_location: rental?.return_location ?? '',
      return_at: toLocalInput(rental?.return_at ?? null),
    })
    setEditing(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const row = {
      job_id: jobId,
      company: form.company || null,
      confirmation: form.confirmation || null,
      truck_size: form.truck_size || null,
      pickup_location: form.pickup_location || null,
      pickup_at: fromLocalInput(form.pickup_at),
      return_location: form.return_location || null,
      return_at: fromLocalInput(form.return_at),
    }
    if (rental) await supabase.from('truck_rentals').update(row).eq('id', rental.id)
    else await supabase.from('truck_rentals').insert(row)
    setEditing(false)
    onChange()
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  return (
    <section className="card">
      <div className="card-head">
        <h3>Truck rental</h3>
        {!editing && <button className="secondary" onClick={startEdit}>{rental ? 'Edit' : 'Add'}</button>}
      </div>
      {!editing && !rental && <p className="muted">No truck reserved yet. The lead mover sees these details once added.</p>}
      {!editing && rental && (
        <div className="small">
          <p><strong>{rental.company}</strong> {rental.truck_size} · Confirmation {rental.confirmation ?? '—'}</p>
          <p>Pick up {dateTime(rental.pickup_at)} at {rental.pickup_location ?? '—'}</p>
          <p>Return {dateTime(rental.return_at)} at {rental.return_location ?? '—'}</p>
          <TruckSteps jobId={jobId} rental={rental} onChange={onChange} />
        </div>
      )}
      {editing && (
        <form className="form" onSubmit={save}>
          <div className="row">
            <label>Company<input value={form.company} onChange={set('company')} placeholder="Penske, U-Haul" /></label>
            <label>
              Truck
              <select value={form.truck_size} onChange={set('truck_size')}>
                <option value="">Choose</option>
                {TRUCK_SIZES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label>Confirmation number<input value={form.confirmation} onChange={set('confirmation')} /></label>
          <label>Pickup location<input value={form.pickup_location} onChange={set('pickup_location')} /></label>
          <label>Pickup time<input type="datetime-local" value={form.pickup_at} onChange={set('pickup_at')} /></label>
          <label>Return location<input value={form.return_location} onChange={set('return_location')} /></label>
          <label>Return time<input type="datetime-local" value={form.return_at} onChange={set('return_at')} /></label>
          <div className="row">
            <button className="primary">Save</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}

// Booked-online jobs: the customer pays the balance by card from their booking link
function PayLink({ quoteId, due }: { quoteId: string; due: number }) {
  const [info, setInfo] = useState<{ link: string; phone: string | null; name: string } | null>(null)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    supabase.from('quotes').select('token, move_requests(customers(full_name, phone))').eq('id', quoteId).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const c = (data.move_requests as unknown as { customers: { full_name: string; phone: string | null } | null } | null)?.customers
        setInfo({ link: `${location.origin}/quote/${data.token}`, phone: c?.phone ?? null, name: c?.full_name.split(' ')[0] ?? '' })
      })
  }, [quoteId])

  if (!info) return null
  const text = `Hi ${info.name}, thanks for moving with DMV Trusted Movers! Your balance is ${money(due)}. You can pay by card here: ${info.link}`
  const copy = (what: string, value: string) => { navigator.clipboard?.writeText(value); setCopied(what) }
  return (
    <>
      {info.phone && <SendText to={info.phone} body={text} label="Text payment link from the business number" />}
      <div className="row">
        {info.phone && <a className="primary small-btn" href={smsLink(info.phone, text)}>Text payment link</a>}
        <button className="secondary small-btn" onClick={() => copy('message', text)}>{copied === 'message' ? 'Copied' : 'Copy message'}</button>
        <button className="secondary small-btn" onClick={() => copy('link', info.link)}>{copied === 'link' ? 'Copied' : 'Copy link'}</button>
      </div>
      <p className="muted small">{info.phone ? 'Texting opens your phone\'s messages app. On a computer, copy the message and send it from your phone.' : 'No phone number on file. Copy the message and send it another way.'}</p>
    </>
  )
}

function CostsSection({ jobId, costs, onChange }: { jobId: string; costs: JobCost[]; onChange: () => void }) {
  const [kind, setKind] = useState('Truck rental')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  async function add(e: FormEvent) {
    e.preventDefault()
    await supabase.from('job_costs').insert({ job_id: jobId, kind, amount: Number(amount), note: note || null })
    setAmount('')
    setNote('')
    onChange()
  }

  async function remove(id: string) {
    await supabase.from('job_costs').delete().eq('id', id)
    onChange()
  }

  return (
    <section className="card">
      <h3>Costs (only you see this)</h3>
      <ul className="list">
        {costs.map((c) => (
          <li key={c.id}>
            <div className="list-main">{c.kind}{c.note ? <span className="muted"> · {c.note}</span> : null}</div>
            <div className="list-side">{money(c.amount)} <button className="link" onClick={() => remove(c.id)}>Remove</button></div>
          </li>
        ))}
      </ul>
      <form className="form" onSubmit={add}>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {['Truck rental', 'Fuel', 'Mileage', 'Late return fee', 'Supplies', 'Other'].map((k) => <option key={k}>{k}</option>)}
          </select>
          <input type="number" min={0} step={0.01} placeholder="Amount $" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="secondary">Add cost</button>
      </form>
    </section>
  )
}

function MoneySection({ job, extrasTotal, crewPay, costs, hasCrew, costKinds }: {
  job: Job; extrasTotal: number; crewPay: number; costs: number; hasCrew: boolean; costKinds: string[]
}) {
  const jobId = job.id, quoteId = job.quote_id
  const plan = useCosts()
  const [row, setRow] = useState<{ price: number; paid: number } | null>(null)
  const [tips, setTips] = useState<JobTips | null>(null)

  const load = useCallback(async () => {
    const [{ data }, t] = await Promise.all([
      supabase.from('job_prices').select('price, paid').eq('job_id', jobId).maybeSingle(),
      supabase.rpc('job_tips', { p_jobs: [jobId] }),
    ])
    setRow(data ? { price: Number(data.price), paid: Number(data.paid) } : { price: 0, paid: 0 })
    setTips(((t.data ?? []) as JobTips[])[0] ?? null)
  }, [jobId])

  useEffect(() => { load() }, [load])

  async function save(key: 'price' | 'paid', value: string) {
    if (!row || Number(value || 0) === row[key]) return
    await supabase.from('job_prices').upsert({ job_id: jobId, ...row, [key]: Number(value || 0), updated_at: new Date().toISOString() })
    load()
  }

  if (!row || !plan) return null
  const charged = row.price + extrasTotal
  const guess = costGuesses(plan, job, { charged, hasCrew, costKinds })
  const kept = charged - crewPay - costs - guess.total
  const movers = job.crew_size ?? plan.movers

  return (
    <section className="card">
      <h3>Money (only you see this)</h3>
      <div className="row">
        <label>Customer price $<input type="number" min={0} step={0.01} defaultValue={row.price || ''} onBlur={(e) => save('price', e.target.value)} /></label>
        <label>Paid so far $<input type="number" min={0} step={0.01} defaultValue={row.paid || ''} onBlur={(e) => save('paid', e.target.value)} /></label>
      </div>
      <ul className="list">
        <li><span>Price{extrasTotal ? ` + extras ${money(extrasTotal)}` : ''}</span><strong>{money(charged)}</strong></li>
        {guess.crew > 0
          ? <li><span>Crew pay, no crew yet ({movers} × {money(moverPay(plan, Number(job.est_hours ?? 0)))})</span><span>−{money(guess.crew)}</span></li>
          : <li><span>Crew pay</span><span>−{money(crewPay)}</span></li>}
        {costs > 0 && <li><span>Costs you added</span><span>−{money(costs)}</span></li>}
        {guess.truck > 0 && <li><span>{job.truck_size} truck, until you add the rental</span><span>−{money(guess.truck)}</span></li>}
        {guess.other > 0 && <li><span>Other costs per move</span><span>−{money(guess.other)}</span></li>}
        {guess.card > 0 && <li><span>Card fees</span><span>−{money(guess.card)}</span></li>}
        <li><span>Kept</span><strong className={kept < 0 ? 'warn' : ''}>{money(kept)}</strong></li>
        <li><span>Balance due from customer</span><strong>{money(Math.max(charged - row.paid, 0))}</strong></li>
        {tips && (
          <li>
            <span>Tips by card, for the crew{tips.movers > 1 ? ` (${money(tips.share)} each)` : ''}</span>
            <strong className="tone-good">{money(tips.total)}</strong>
          </li>
        )}
      </ul>
      {charged > 0 && <p className="note">Truck, other costs and card fees come from your <Link to="/price-plan">price plan</Link>. Add the real truck rental below and it replaces the guess.</p>}
      {tips && <p className="note">Tips go to the movers on top of their pay, and show in Pay crew. They aren't part of what you keep.</p>}
      {quoteId && charged - row.paid > 0 && <PayLink quoteId={quoteId} due={charged - row.paid} />}
    </section>
  )
}
