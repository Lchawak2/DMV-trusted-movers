import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import JobCard from '../../components/JobCard'
import DayGroups from '../../components/DayGroups'
import { supabase } from '../../lib/supabase'
import { dayHeading, money, windowText } from '../../lib/format'
import { useWide } from '../../lib/useWide'
import { JOB_TYPES, type Assignment, type Job } from '../../lib/types'

type Row = { job: Job; crew: Assignment[]; customer: string | null }
type Fetched = Job & { assignments: Assignment[]; move_requests: { customers: { full_name: string } | null } | null }

export default function AdminJobs() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [newRequests, setNewRequests] = useState(0)
  const wide = useWide()

  useEffect(() => {
    supabase.from('move_requests').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count }) => setNewRequests(count ?? 0))
  }, [])

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA')
    let query = supabase.from('jobs')
      .select('*, assignments(*), move_requests!jobs_request_id_fkey(customers(full_name))')
      .order('job_date', { ascending: !showPast }).order('window_start')
    query = showPast ? query.lt('job_date', today) : query.gte('job_date', today)
    query.then(({ data }) =>
      setRows(((data ?? []) as Fetched[]).map(({ assignments, move_requests, ...job }) => (
        { job, crew: assignments, customer: move_requests?.customers?.full_name ?? null }
      ))),
    )
  }, [showPast])

  return (
    <Layout>
      <div className="toolbar">
        <div className="segmented">
          <button className={!showPast ? 'on' : ''} onClick={() => setShowPast(false)}>Upcoming</button>
          <button className={showPast ? 'on' : ''} onClick={() => setShowPast(true)}>Past</button>
        </div>
        <Link to="/jobs/new" className="primary">+ New job</Link>
      </div>
      {!wide && (
        <Link to="/requests" className="secondary block requests-link">
          Quote requests{newRequests ? ` · ${newRequests} new` : ''} ›
        </Link>
      )}
      {rows === null ? (
        <p className="muted center">Loading…</p>
      ) : wide ? (
        <JobsTable rows={rows} empty={showPast ? 'No past jobs yet.' : 'No upcoming jobs. Create one to get started.'} />
      ) : (
        <DayGroups
          items={rows}
          empty={showPast ? 'No past jobs yet.' : 'No upcoming jobs. Create one to get started.'}
          render={({ job, crew }) => {
            const active = crew.filter((a) => a.status === 'offered' || a.status === 'accepted')
            const accepted = crew.filter((a) => a.status === 'accepted').length
            const pay = active.reduce((sum, a) => sum + Number(a.crew_pay), 0)
            const short = job.crew_size != null && accepted < job.crew_size
            return (
              <JobCard
                key={job.id}
                job={job}
                amount={`$${pay.toFixed(2)}`}
                amountLabel="Crew pay"
                badge={job.status === 'scheduled' ? undefined : job.status.replace('_', ' ')}
                footer={
                  <p className={short ? 'warn' : 'muted'}>
                    Crew: {accepted} accepted{job.crew_size ? ` of ${job.crew_size}` : ''}
                    {active.length > accepted ? `, ${active.length - accepted} waiting` : ''}
                    {job.is_open ? ' · Posted to crew' : ''}
                  </p>
                }
              />
            )
          }}
        />
      )}
    </Layout>
  )
}

// On a computer: one row per job, click a row to open it
function JobsTable({ rows, empty }: { rows: Row[]; empty: string }) {
  const navigate = useNavigate()
  if (rows.length === 0) return <p className="muted center">{empty}</p>
  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr><th>Date</th><th>Time</th><th>Customer</th><th>Job</th><th>From</th><th>Crew</th><th>Crew pay</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map(({ job, crew, customer }) => {
            const active = crew.filter((a) => a.status === 'offered' || a.status === 'accepted')
            const accepted = crew.filter((a) => a.status === 'accepted').length
            const pay = active.reduce((sum, a) => sum + Number(a.crew_pay), 0)
            const short = job.crew_size != null && accepted < job.crew_size
            return (
              <tr key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}>
                <td><Link to={`/jobs/${job.id}`}>{dayHeading(job.job_date)}</Link></td>
                <td>{windowText(job.window_start, job.window_end)}</td>
                <td>{customer ?? <span className="muted">—</span>}</td>
                <td>{JOB_TYPES[job.job_type] ?? job.job_type}{job.home_size ? <div className="muted small">{job.home_size}</div> : null}</td>
                <td className="table-addr">{job.from_address}</td>
                <td className={short ? 'tone-warn' : ''}>
                  {accepted}{job.crew_size ? ` of ${job.crew_size}` : ''}
                  {active.length > accepted && <div className="muted small">{active.length - accepted} waiting</div>}
                  {job.is_open && <div className="muted small">Posted to crew</div>}
                </td>
                <td>{money(pay)}</td>
                <td><span className={`pill ${job.status === 'completed' ? 'good' : job.status === 'cancelled' ? 'none' : job.status === 'scheduled' ? 'info' : 'warn'}`}>{job.status.replace('_', ' ')}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
