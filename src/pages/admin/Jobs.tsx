import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import JobCard from '../../components/JobCard'
import DayGroups from '../../components/DayGroups'
import { supabase } from '../../lib/supabase'
import type { Assignment, Job } from '../../lib/types'

type Row = { job: Job; crew: Assignment[] }

export default function AdminJobs() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [newRequests, setNewRequests] = useState(0)

  useEffect(() => {
    supabase.from('move_requests').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count }) => setNewRequests(count ?? 0))
  }, [])

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA')
    let query = supabase.from('jobs').select('*, assignments(*)').order('job_date').order('window_start')
    query = showPast ? query.lt('job_date', today) : query.gte('job_date', today)
    query.then(({ data }) =>
      setRows((data ?? []).map(({ assignments, ...job }) => ({ job: job as Job, crew: assignments as Assignment[] }))),
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
      <Link to="/requests" className="secondary block requests-link">
        Quote requests{newRequests ? ` · ${newRequests} new` : ''} ›
      </Link>
      {rows === null ? (
        <p className="muted center">Loading…</p>
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
