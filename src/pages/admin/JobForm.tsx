import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { HOME_SIZES, JOB_TYPES, TRUCK_SIZES, type Job } from '../../lib/types'

const empty = {
  job_date: '',
  window_start: '08:00',
  window_end: '09:00',
  job_type: 'full_move',
  home_size: '',
  from_address: '',
  to_address: '',
  access_notes: '',
  est_hours: '',
  truck_size: '',
  crew_size: '2',
  is_open: false,
}

type Form = typeof empty

export default function JobForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState<Form>(empty)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase.from('jobs').select('*').eq('id', id).single().then(({ data }) => {
      const job = data as Job
      setForm({
        job_date: job.job_date,
        window_start: job.window_start?.slice(0, 5) ?? '',
        window_end: job.window_end?.slice(0, 5) ?? '',
        job_type: job.job_type,
        home_size: job.home_size ?? '',
        from_address: job.from_address,
        to_address: job.to_address ?? '',
        access_notes: job.access_notes ?? '',
        est_hours: job.est_hours?.toString() ?? '',
        truck_size: job.truck_size ?? '',
        crew_size: job.crew_size?.toString() ?? '',
        is_open: job.is_open,
      })
    })
  }, [id])

  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (form.window_start && form.window_end && form.window_end <= form.window_start) {
      return setError('The arrival window must end after it starts.')
    }
    setBusy(true)
    const row = {
      job_date: form.job_date,
      window_start: form.window_start || null,
      window_end: form.window_end || null,
      job_type: form.job_type,
      home_size: form.home_size || null,
      from_address: form.from_address,
      to_address: form.to_address || null,
      access_notes: form.access_notes || null,
      est_hours: form.est_hours ? Number(form.est_hours) : null,
      truck_size: form.truck_size || null,
      crew_size: form.crew_size ? Number(form.crew_size) : null,
      is_open: form.is_open,
    }
    const result = id
      ? await supabase.from('jobs').update(row).eq('id', id).select('id').single()
      : await supabase.from('jobs').insert(row).select('id').single()
    setBusy(false)
    if (result.error) return setError(result.error.message)
    navigate(`/jobs/${result.data.id}`, { replace: true })
  }

  return (
    <Layout back={id ? `/jobs/${id}` : '/'} title={id ? 'Edit job' : 'New job'}>
      <form className="card form" onSubmit={submit}>
        <label>Date<input type="date" value={form.job_date} onChange={set('job_date')} required /></label>
        <div className="row">
          <label>Arrival from<input type="time" value={form.window_start} onChange={set('window_start')} /></label>
          <label>to<input type="time" value={form.window_end} onChange={set('window_end')} /></label>
        </div>
        <div className="row">
          <label>
            Job type
            <select value={form.job_type} onChange={set('job_type')}>
              {Object.entries(JOB_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Move size
            <select value={form.home_size} onChange={set('home_size')}>
              <option value="">Choose</option>
              {HOME_SIZES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label>From address<input value={form.from_address} onChange={set('from_address')} required placeholder="Street, city" /></label>
        <label>To address<input value={form.to_address} onChange={set('to_address')} placeholder="Leave blank for labor only at one address" /></label>
        <label>
          Access notes for the crew
          <textarea value={form.access_notes} onChange={set('access_notes')} rows={3}
            placeholder="Stairs, elevator booked 9 to 12, loading zone, piano, COI needed" />
        </label>
        <div className="row">
          <label>
            Truck
            <select value={form.truck_size} onChange={set('truck_size')}>
              <option value="">None or not set</option>
              {TRUCK_SIZES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Crew size<input type="number" min={1} max={10} value={form.crew_size} onChange={set('crew_size')} /></label>
          <label>Est. hours<input type="number" min={0.5} step={0.5} value={form.est_hours} onChange={set('est_hours')} /></label>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.is_open} onChange={(e) => setForm({ ...form, is_open: e.target.checked })} />
          Post this job so crew members can see it before they're assigned
        </label>
        {error && <p className="warn">{error}</p>}
        <button className="primary" disabled={busy}>{id ? 'Save changes' : 'Create job'}</button>
      </form>
    </Layout>
  )
}
