import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import JobCard from '../../components/JobCard'
import DayGroups from '../../components/DayGroups'
import PapersBanner from '../../components/PapersBanner'
import { papersDone, useMyPapers } from '../../lib/papers'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { t } from '../../lib/lang'
import type { Job } from '../../lib/types'

type Row = { job: Job; spotsLeft: number }

export default function FindJob() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ jobId: string; text: string } | null>(null)
  const { papers } = useMyPapers()
  // Still loading counts as done; the database checks again on claim
  const blocked = papers !== undefined && !papersDone(papers)

  const load = useCallback(async () => {
    // Spots come from the database, since crew can't read other people's assignments
    const { data: spots } = await supabase.rpc('open_job_spots')
    const open = ((spots ?? []) as { job_id: string; spots_left: number }[]).filter((s) => s.spots_left > 0)
    if (open.length === 0) return setRows([])
    const { data: jobs } = await supabase.from('jobs').select('*').in('id', open.map((s) => s.job_id))
    const list = ((jobs ?? []) as Job[]).map((job) => ({
      job,
      spotsLeft: open.find((s) => s.job_id === job.id)!.spots_left,
    }))
    list.sort((a, b) => (a.job.job_date + (a.job.window_start ?? '')).localeCompare(b.job.job_date + (b.job.window_start ?? '')))
    setRows(list)
  }, [])

  useEffect(() => { load() }, [load])

  async function claim(job: Job) {
    setError(null)
    setBusy(job.id)
    const { error: rpcError } = await supabase.rpc('claim_open_job', { p_job: job.id })
    setBusy(null)
    if (rpcError) {
      setError({ jobId: job.id, text: rpcError.message })
      return load()
    }
    navigate(`/jobs/${job.id}`)
  }

  return (
    <Layout>
      <PapersBanner papers={papers} />
      {rows === null ? (
        <p className="muted center">{t('Loading…', 'Cargando…')}</p>
      ) : (
        <DayGroups
          items={rows}
          empty={t('No open jobs right now. Posted jobs will show up here.', 'No hay trabajos abiertos ahora. Los trabajos publicados aparecerán aquí.')}
          render={({ job, spotsLeft }) => (
            <JobCard
              key={job.id}
              job={job}
              amount={money(job.open_pay ?? 0)}
              amountLabel={job.open_pay_type === 'hourly' ? t('Your pay per hour', 'Tu pago por hora') : t('Your pay', 'Tu pago')}
              footer={
                <>
                  <p className="muted small">{spotsLeft === 1 ? t('1 spot left', 'Queda 1 lugar') : t(`${spotsLeft} spots left`, `Quedan ${spotsLeft} lugares`)} · {t("you'd join as a helper", 'entrarías como ayudante')}</p>
                  {error?.jobId === job.id && <p className="warn">{error.text}</p>}
                </>
              }
              action={
                <button className="primary block" disabled={busy === job.id || blocked} onClick={() => claim(job)}>
                  {blocked ? t('Finish your papers to claim', 'Termina tus papeles para tomarlo') : busy === job.id ? t('Claiming…', 'Tomando…') : t('Claim this job', 'Tomar este trabajo')}
                </button>
              }
            />
          )}
        />
      )}
    </Layout>
  )
}
