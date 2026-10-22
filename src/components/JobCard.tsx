import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { countdown, windowText } from '../lib/format'
import { JOB_TYPES, type Job } from '../lib/types'
import { jobType, t } from '../lib/lang'

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
            <div className="job-sub">{job.est_hours ? t(`About ${job.est_hours} hours`, `Unas ${job.est_hours} horas`) : t('Duration to be set', 'Duración por confirmar')}</div>
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
          <div><span>{t('Truck', 'Camión')}</span>{job.truck_size ?? '—'}</div>
          <div><span>{t('Job', 'Trabajo')}</span>{jobType(job.job_type, JOB_TYPES[job.job_type])}</div>
          <div><span>{t('Size', 'Tamaño')}</span>{job.home_size ?? '—'}</div>
        </div>
        <ol className="route">
          <li>{job.from_address}</li>
          {job.to_address && <li>{job.to_address}</li>}
        </ol>
        {job.access_notes && (
          <div className="notes"><span>{t('Access', 'Acceso')}</span>{job.access_notes}</div>
        )}
        {footer}
        {action ?? <Link to={`/jobs/${job.id}`} className="primary block">{t('Open job', 'Abrir trabajo')} ›</Link>}
      </div>
    </article>
  )
}
