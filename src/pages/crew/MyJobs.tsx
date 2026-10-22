import { useEffect, useState } from 'react'
import Layout from '../../components/Layout'
import JobCard from '../../components/JobCard'
import DayGroups from '../../components/DayGroups'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { t } from '../../lib/lang'
import type { Assignment, Job } from '../../lib/types'

type Row = { job: Job; assignment: Assignment }

export default function MyJobs() {
  const { account } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    if (!account) return
    const today = new Date().toLocaleDateString('en-CA')
    // RLS limits this to the crew member's own assignments; the customer's price is never readable
    supabase.from('assignments').select('*, jobs!inner(*)')
      .eq('crew_id', account.id).in('status', ['offered', 'accepted']).gte('jobs.job_date', today)
      .then(({ data }) => {
        const list = (data ?? []).map(({ jobs, ...assignment }) => ({ job: jobs as Job, assignment: assignment as Assignment }))
        list.sort((a, b) => (a.job.job_date + (a.job.window_start ?? '')).localeCompare(b.job.job_date + (b.job.window_start ?? '')))
        setRows(list)
      })
  }, [account])

  return (
    <Layout>
      {rows === null ? (
        <p className="muted center">{t('Loading…', 'Cargando…')}</p>
      ) : (
        <DayGroups
          items={rows}
          empty={t('No upcoming jobs. New offers will show up here.', 'No tienes trabajos próximos. Las nuevas ofertas aparecerán aquí.')}
          render={({ job, assignment }) => (
            <JobCard
              key={assignment.id}
              job={job}
              amount={money(assignment.crew_pay)}
              amountLabel={assignment.pay_type === 'hourly' ? t('Your pay per hour', 'Tu pago por hora') : t('Your pay', 'Tu pago')}
              badge={assignment.status === 'offered' ? t('New offer · respond', 'Nueva oferta · responde') : undefined}
              footer={<p className="muted small">{assignment.role === 'lead' ? t("You're the lead", 'Eres el líder') : t("You're a helper", 'Eres ayudante')}</p>}
            />
          )}
        />
      )}
    </Layout>
  )
}
