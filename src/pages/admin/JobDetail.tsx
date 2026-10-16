import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import JobDayChecklist from '../jobday/JobDayChecklist'
import { useJobDay } from '../jobday/useJobDay'
import { supabase } from '../../lib/supabase'
import { dateTime, dayHeading, fromLocalInput, money, toLocalInput, windowText } from '../../lib/format'
import {
  JOB_TYPES, TRUCK_SIZES,
  type Account, type Assignment, type Job, type JobCost, type JobStatus, type TimeEntry, type TruckRental,
} from '../../lib/types'

type CrewRow = Assignment & { accounts: Pick<Account, 'full_name' | 'email' | 'phone'>; time_entries: TimeEntry[] }

const STATUSES: JobStatus[] = ['scheduled', 'in_progress', 'completed', 'on_hold', 'cancelled']

export default function AdminJobDetail() {
  const { id } = useParams() as { id: string }
  const navigate = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [crew, setCrew] = useState<CrewRow[]>([])
  const [rental, setRental] = useState<TruckRental | null>(null)
  const [costs, setCosts] = useState<JobCost[]>([])
  const day = useJobDay(id)

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

  if (!job) return <Layout back="/"><p className="muted center">Loading…</p></Layout>

  async function setStatus(status: JobStatus) {
    await supabase.from('jobs').update({ status }).eq('id', id)
    load()
  }

  async function remove() {
    if (!confirm('Delete this job and everything attached to it?')) return
    await supabase.from('jobs').delete().eq('id', id)
    navigate('/', { replace: true })
  }

  const totalPay = crew.filter((a) => a.status !== 'declined' && a.status !== 'removed').reduce((s, a) => s + Number(a.crew_pay), 0)
  const totalCosts = costs.reduce((s, c) => s + Number(c.amount), 0)

  return (
    <Layout back="/" title="Job">
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
        <div className="facts">
          <div><span>Truck</span>{job.truck_size ?? '—'}</div>
          <div><span>Crew</span>{job.crew_size ?? '—'}</div>
          <div><span>Hours</span>{job.est_hours ?? '—'}</div>
        </div>
        {job.access_notes && <div className="notes"><span>Access</span>{job.access_notes}</div>}
        <label>
          Status
          <select value={job.status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
      </section>

      <CrewSection job={job} crew={crew} onChange={load} />
      <JobDayChecklist jobId={id} photos={day.photos} extras={day.extras} signoff={day.signoff} />
      <RentalSection jobId={id} rental={rental} onChange={load} />
      <CostsSection jobId={id} costs={costs} onChange={load} />

      <section className="card">
        <h3>Totals (only you see this)</h3>
        <p>Crew pay {money(totalPay)} · Other costs {money(totalCosts)} · <strong>{money(totalPay + totalCosts)}</strong></p>
      </section>

      <button className="danger" onClick={remove}>Delete job</button>
    </Layout>
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
