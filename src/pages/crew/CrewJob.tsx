import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { dateTime, dayHeading, money, windowText } from '../../lib/format'
import JobDayChecklist from '../jobday/JobDayChecklist'
import { useJobDay } from '../jobday/useJobDay'
import { JOB_TYPES, PAY_METHODS, type Assignment, type Job, type JobTips, type TimeEntry, type TruckRental } from '../../lib/types'

export default function CrewJob() {
  const { id } = useParams() as { id: string }
  const { account } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [rental, setRental] = useState<TruckRental | null>(null)
  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [tips, setTips] = useState<JobTips | null>(null)
  const [error, setError] = useState<string | null>(null)
  const day = useJobDay(id)

  const load = useCallback(async () => {
    if (!account) return
    const [j, a] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).maybeSingle(),
      supabase.from('assignments').select('*').eq('job_id', id).eq('crew_id', account.id).maybeSingle(),
    ])
    setJob(j.data as Job | null)
    const mine = a.data as Assignment | null
    setAssignment(mine)
    if (mine?.status === 'accepted') {
      // Only the accepted lead can read the rental (enforced by the database)
      const [r, t, tip] = await Promise.all([
        supabase.from('truck_rentals').select('*').eq('job_id', id).maybeSingle(),
        supabase.from('time_entries').select('*').eq('assignment_id', mine.id).order('clock_in', { ascending: false }).limit(1).maybeSingle(),
        supabase.rpc('job_tips', { p_jobs: [id] }),
      ])
      setRental(r.data as TruckRental | null)
      setEntry(t.data as TimeEntry | null)
      setTips(((tip.data ?? []) as JobTips[])[0] ?? null)
    }
  }, [account, id])

  useEffect(() => { load() }, [load])

  if (!job || !assignment) return <Layout back="/"><p className="muted center">{job === null ? 'Loading…' : 'Job not found.'}</p></Layout>

  async function respond(accept: boolean) {
    setError(null)
    const { error: rpcError } = await supabase.rpc('respond_to_assignment', { p_assignment: assignment!.id, p_accept: accept })
    if (rpcError) setError(rpcError.message)
    load()
  }

  async function clockIn() {
    await supabase.from('time_entries').insert({ assignment_id: assignment!.id })
    load()
  }

  async function clockOut() {
    await supabase.from('time_entries').update({ clock_out: new Date().toISOString() }).eq('id', entry!.id)
    load()
  }

  const onClock = entry && !entry.clock_out
  const isLead = assignment.role === 'lead' && assignment.status === 'accepted'
  // The lead clocks out only after the customer has signed
  const mustSign = isLead && !day.signoff
  const mapsLink = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`

  return (
    <Layout back="/" title="Job">
      <section className="job-card">
        <div className="job-head">
          <div className="job-head-row">
            <div>
              <div className="job-time">{windowText(job.window_start, job.window_end)}</div>
              <div className="job-sub">{dayHeading(job.job_date)}</div>
            </div>
            <div className="job-amount">
              <div>{money(assignment.crew_pay)}</div>
              <div className="job-sub">{assignment.pay_type === 'hourly' ? 'Your pay per hour' : 'Your pay'}</div>
              {tips && <div className="job-sub">+ {money(tips.share)} tip</div>}
              {assignment.paid_at && <div className="job-sub">Paid {money(assignment.paid_amount)} · {PAY_METHODS[assignment.paid_method!]}</div>}
            </div>
          </div>
        </div>
        <div className="job-body">
          <div className="facts">
            <div><span>Role</span>{assignment.role === 'lead' ? 'Lead' : 'Helper'}</div>
            <div><span>Job</span>{JOB_TYPES[job.job_type] ?? job.job_type}</div>
            <div><span>Hours</span>{job.est_hours ?? '—'}</div>
          </div>
          <div className="facts">
            <div><span>Truck</span>{job.truck_size ?? '—'}</div>
            <div><span>Crew</span>{job.crew_size ?? '—'}</div>
            <div><span>Size</span>{job.home_size ?? '—'}</div>
          </div>
          <ol className="route">
            <li><a href={mapsLink(job.from_address)} target="_blank" rel="noreferrer">{job.from_address}</a></li>
            {job.to_address && <li><a href={mapsLink(job.to_address)} target="_blank" rel="noreferrer">{job.to_address}</a></li>}
          </ol>
          {job.access_notes && <div className="notes"><span>Access</span>{job.access_notes}</div>}

          {assignment.status === 'offered' && (
            <div className="row">
              <button className="primary" onClick={() => respond(true)}>Accept job</button>
              <button className="secondary" onClick={() => respond(false)}>Decline</button>
            </div>
          )}

          {assignment.status === 'accepted' && (
            <>
              {rental && (
                <div className="notes">
                  <span>Truck pickup</span>
                  {rental.company} {rental.truck_size} · Confirmation {rental.confirmation ?? '—'}<br />
                  Pick up {dateTime(rental.pickup_at)} at {rental.pickup_location}<br />
                  Return {dateTime(rental.return_at)} at {rental.return_location}
                </div>
              )}
              {entry?.clock_out ? (
                <p className="muted">Clocked out {dateTime(entry.clock_out)}.</p>
              ) : onClock ? (
                <>
                  <p className="muted">On the clock since {dateTime(entry!.clock_in)}</p>
                  {mustSign && <p className="muted small">Clock out unlocks once the customer has signed.</p>}
                  <button className="primary" onClick={clockOut} disabled={mustSign}>Clock out</button>
                </>
              ) : (
                <button className="primary" onClick={clockIn}>Clock in</button>
              )}
            </>
          )}
          {error && <p className="warn">{error}</p>}
        </div>
      </section>
      {isLead && <JobDayChecklist jobId={id} photos={day.photos} extras={day.extras} signoff={day.signoff} />}
    </Layout>
  )
}
