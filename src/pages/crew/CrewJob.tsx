import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { dateTime, dayHeading, money, windowText } from '../../lib/format'
import JobDayChecklist from '../jobday/JobDayChecklist'
import TruckSteps from '../jobday/TruckSteps'
import { jobType, t } from '../../lib/lang'
import { useJobDay } from '../jobday/useJobDay'
import { OUTBOX_CHANGED, flush, isOffline, pending, queue, type OutboxItem } from '../../lib/outbox'
import { JOB_TYPES, PAY_METHODS, type Assignment, type Job, type JobTips, type TimeEntry, type TruckRental } from '../../lib/types'

type Cached = { job: Job; assignment: Assignment | null; rental: TruckRental | null; entry: TimeEntry | null; tips: JobTips | null }

// The last copy of the job this phone saw, so the page still works with no signal
const cacheKey = (id: string) => `crew-job:${id}`
function readCache(id: string): Cached | null {
  try { return JSON.parse(localStorage.getItem(cacheKey(id)) ?? 'null') } catch { return null }
}
function writeCache(id: string, c: Cached) {
  try { localStorage.setItem(cacheKey(id), JSON.stringify(c)) } catch { /* storage full or blocked */ }
}

// Clock-ins and outs still waiting on the phone, laid over what the server has
function withPending(entry: TimeEntry | null, assignmentId: string | undefined, items: OutboxItem[]): TimeEntry | null {
  let e = entry
  for (const it of items) {
    if (it.type === 'clock_in' && it.assignment_id === assignmentId) {
      e = { id: it.id, assignment_id: it.assignment_id, clock_in: it.time, clock_out: null, break_minutes: 0 } as TimeEntry
    }
    if (it.type === 'clock_out' && e?.id === it.entry_id) e = { ...e, clock_out: it.time }
  }
  return e
}

export default function CrewJob() {
  const { id } = useParams() as { id: string }
  const { account } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [rental, setRental] = useState<TruckRental | null>(null)
  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [tips, setTips] = useState<JobTips | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const day = useJobDay(id)

  const load = useCallback(async () => {
    if (!account) return
    // Send anything taken with no signal first, so the server copy is current
    await flush()
    const [j, a] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).maybeSingle(),
      supabase.from('assignments').select('*').eq('job_id', id).eq('crew_id', account.id).maybeSingle(),
    ])
    if (j.error && isOffline(j.error)) {
      const c = readCache(id)
      if (c) {
        setJob(c.job)
        setAssignment(c.assignment)
        setRental(c.rental)
        setTips(c.tips)
        setEntry(withPending(c.entry, c.assignment?.id, await pending()))
      }
      return setOffline(true)
    }
    setOffline(false)
    const mine = a.data as Assignment | null
    let fresh: Cached = { job: j.data as Job, assignment: mine, rental: null, entry: null, tips: null }
    if (mine?.status === 'accepted') {
      // Only the accepted lead can read the rental (enforced by the database)
      const [r, te, tip] = await Promise.all([
        supabase.from('truck_rentals').select('*').eq('job_id', id).maybeSingle(),
        supabase.from('time_entries').select('*').eq('assignment_id', mine.id).order('clock_in', { ascending: false }).limit(1).maybeSingle(),
        supabase.rpc('job_tips', { p_jobs: [id] }),
      ])
      fresh = { ...fresh, rental: r.data as TruckRental | null, entry: te.data as TimeEntry | null, tips: ((tip.data ?? []) as JobTips[])[0] ?? null }
    }
    setJob(fresh.job)
    setAssignment(mine)
    setRental(fresh.rental)
    setTips(fresh.tips)
    setEntry(withPending(fresh.entry, mine?.id, await pending()))
    if (fresh.job) writeCache(id, fresh)
  }, [account, id])

  useEffect(() => { load() }, [load])
  // Reload once things saved on the phone have gone through
  useEffect(() => {
    window.addEventListener(OUTBOX_CHANGED, load)
    return () => window.removeEventListener(OUTBOX_CHANGED, load)
  }, [load])

  if (!job || !assignment) return <Layout back="/"><p className="muted center">{job === null ? t('Loading…', 'Cargando…') : t('Job not found.', 'No se encontró el trabajo.')}</p></Layout>

  async function respond(accept: boolean) {
    setError(null)
    const { error: rpcError } = await supabase.rpc('respond_to_assignment', { p_assignment: assignment!.id, p_accept: accept })
    if (rpcError) setError(rpcError.message)
    load()
  }

  // With no signal the tap is kept on the phone with its time, and sent later
  async function clockIn() {
    const item = { id: crypto.randomUUID(), type: 'clock_in' as const, assignment_id: assignment!.id, time: new Date().toISOString() }
    const { error: e } = await supabase.from('time_entries').insert({ id: item.id, assignment_id: item.assignment_id, clock_in: item.time })
    if (e && !isOffline(e)) return setError(e.message)
    if (e) await queue(item)
    load()
  }

  async function clockOut() {
    const item = { id: crypto.randomUUID(), type: 'clock_out' as const, assignment_id: assignment!.id, entry_id: entry!.id, time: new Date().toISOString() }
    // An entry still waiting on the phone isn't on the server yet, so its clock-out waits behind it
    const waiting = (await pending()).some((p) => p.id === entry!.id)
    const { error: e } = waiting
      ? { error: { message: 'offline' } }
      : await supabase.from('time_entries').update({ clock_out: item.time }).eq('id', item.entry_id)
    if (e && !waiting && !isOffline(e)) return setError(e.message)
    if (e) await queue(item)
    load()
  }

  const onClock = entry && !entry.clock_out
  const isLead = assignment.role === 'lead' && assignment.status === 'accepted'
  // The lead clocks out only after the customer has signed
  const mustSign = isLead && !day.signoff
  const mapsLink = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`

  return (
    <Layout back="/" title={t('Job', 'Trabajo')}>
      <section className="job-card">
        <div className="job-head">
          <div className="job-head-row">
            <div>
              <div className="job-time">{windowText(job.window_start, job.window_end)}</div>
              <div className="job-sub">{dayHeading(job.job_date)}</div>
            </div>
            <div className="job-amount">
              <div>{money(assignment.crew_pay)}</div>
              <div className="job-sub">{assignment.pay_type === 'hourly' ? t('Your pay per hour', 'Tu pago por hora') : t('Your pay', 'Tu pago')}</div>
              {tips && <div className="job-sub">+ {money(tips.share)} {t('tip', 'propina')}</div>}
              {assignment.paid_at && <div className="job-sub">{t('Paid', 'Pagado')} {money(assignment.paid_amount)} · {PAY_METHODS[assignment.paid_method!]}</div>}
            </div>
          </div>
        </div>
        <div className="job-body">
          <div className="facts">
            <div><span>{t('Role', 'Rol')}</span>{assignment.role === 'lead' ? t('Lead', 'Líder') : t('Helper', 'Ayudante')}</div>
            <div><span>{t('Job', 'Trabajo')}</span>{jobType(job.job_type, JOB_TYPES[job.job_type])}</div>
            <div><span>{t('Hours', 'Horas')}</span>{job.est_hours ?? '—'}</div>
          </div>
          <div className="facts">
            <div><span>{t('Truck', 'Camión')}</span>{job.truck_size ?? '—'}</div>
            <div><span>{t('Crew', 'Equipo')}</span>{job.crew_size ?? '—'}</div>
            <div><span>{t('Size', 'Tamaño')}</span>{job.home_size ?? '—'}</div>
          </div>
          <ol className="route">
            <li><a href={mapsLink(job.from_address)} target="_blank" rel="noreferrer">{job.from_address}</a></li>
            {job.to_address && <li><a href={mapsLink(job.to_address)} target="_blank" rel="noreferrer">{job.to_address}</a></li>}
          </ol>
          {job.access_notes && <div className="notes"><span>{t('Access', 'Acceso')}</span>{job.access_notes}</div>}

          {assignment.status === 'offered' && (
            <div className="row">
              <button className="primary" onClick={() => respond(true)}>{t('Accept job', 'Aceptar trabajo')}</button>
              <button className="secondary" onClick={() => respond(false)}>{t('Decline', 'Rechazar')}</button>
            </div>
          )}

          {assignment.status === 'accepted' && (
            <>
              {rental && (
                <div className="notes">
                  <span>{t('Truck pickup', 'Recoger el camión')}</span>
                  {rental.company} {rental.truck_size} · {t('Confirmation', 'Confirmación')} {rental.confirmation ?? '—'}<br />
                  {t('Pick up', 'Recoger')} {dateTime(rental.pickup_at)} {t('at', 'en')} {rental.pickup_location}<br />
                  {t('Return', 'Devolver')} {dateTime(rental.return_at)} {t('at', 'en')} {rental.return_location}
                  <TruckSteps jobId={job.id} rental={rental} onChange={load} />
                </div>
              )}
              {entry?.clock_out ? (
                <p className="muted">{t('Clocked out', 'Salida marcada')} {dateTime(entry.clock_out)}.</p>
              ) : onClock ? (
                <>
                  <p className="muted">{t('On the clock since', 'Trabajando desde')} {dateTime(entry!.clock_in)}</p>
                  {mustSign && <p className="muted small">{t('Clock out unlocks once the customer has signed.', 'Podrás marcar la salida cuando el cliente firme.')}</p>}
                  <button className="primary" onClick={clockOut} disabled={mustSign}>{t('Clock out', 'Marcar salida')}</button>
                </>
              ) : (
                <button className="primary" onClick={clockIn}>{t('Clock in', 'Marcar entrada')}</button>
              )}
            </>
          )}
          {error && <p className="warn">{error}</p>}
          {offline && <p className="note">{t('No signal. Showing the job as it was last loaded on this phone.', 'Sin señal. Se muestra el trabajo como se cargó la última vez en este teléfono.')}</p>}
        </div>
      </section>
      {isLead && <JobDayChecklist jobId={id} photos={day.photos} extras={day.extras} signoff={day.signoff} />}
    </Layout>
  )
}
