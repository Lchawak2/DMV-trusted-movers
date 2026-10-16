import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { countdown, windowText } from '../lib/format'
import { JOB_TYPES, type Job } from '../lib/types'

// The driver-portal style card: dark header with time and amount, then the job facts
export default function JobCard({ job, amount, amountLabel, badge, footer, action }: {
  job: Job
  amount?: string
  amountLabel?: string
  badge?: ReactNode
  footer?: ReactNode
  // Replaces the Open job link, e.g. a Claim button on Find Job
  action?: ReactNode
}) {
  return (
    <article className="job-card">
      <div className="job-head">
        <span className="pill">{badge ?? countdown(job.job_date, job.window_start)}</span>
        <div className="job-head-row">
          <div>
            <div className="job-time">{windowText(job.window_start, job.window_end)}</div>
            <div className="job-sub">{job.est_hours ? `About ${job.est_hours} hours` : 'Duration to be set'}</div>
          </div>
          {amount && (
            <div className="job-amount">
              <div>{amount}</div>
              <div className="job-sub">{amountLabel}</div>
            </div>
          )}
        </div>
      </div>
      <div className="job-body">
        <div className="facts">
          <div><span>Truck</span>{job.truck_size ?? '—'}</div>
          <div><span>Job</span>{JOB_TYPES[job.job_type] ?? job.job_type}</div>
          <div><span>Size</span>{job.home_size ?? '—'}</div>
        </div>
        <ol className="route">
          <li>{job.from_address}</li>
          {job.to_address && <li>{job.to_address}</li>}
        </ol>
        {job.access_notes && (
          <div className="notes"><span>Access</span>{job.access_notes}</div>
        )}
        {footer}
        {action ?? <Link to={`/jobs/${job.id}`} className="primary block">Open job ›</Link>}
      </div>
    </article>
  )
}
