import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { money, parseDay } from '../../lib/format'
import { jobType, locale, t } from '../../lib/lang'
import { assignmentPay, hoursWorked } from '../../lib/pay'
import { JOB_TYPES, PAY_METHODS, type Assignment, type Job, type JobTips, type TimeEntry } from '../../lib/types'

type Row = Assignment & { jobs: Job; time_entries: TimeEntry[] }
type Line = { a: Row; pay: number; tip: number; total: number; hours: number }
type Period = 'week' | 'month' | 'year' | 'all'

const iso = (d: Date) => d.toLocaleDateString('en-CA')

// First day of each period, as YYYY-MM-DD. Weeks start on Monday.
function periodStart(p: Period): string {
  const d = new Date()
  if (p === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (p === 'month') d.setDate(1)
  if (p === 'year') d.setMonth(0, 1)
  return p === 'all' ? '0000-01-01' : iso(d)
}

export default function Earnings() {
  const { account } = useAuth()
  const [lines, setLines] = useState<Line[] | null>(null)
  const [period, setPeriod] = useState<Period>('month')

  useEffect(() => {
    if (!account) return
    ;(async () => {
      // Jobs done (today or before, not cancelled), plus anything already paid
      const { data } = await supabase.from('assignments').select('*, jobs!inner(*), time_entries(*)')
        .eq('crew_id', account.id).lte('jobs.job_date', iso(new Date())).neq('jobs.status', 'cancelled')
        .or('status.eq.accepted,paid_at.not.is.null')
      const rows = (data ?? []) as Row[]
      const { data: tipRows } = rows.length ? await supabase.rpc('job_tips', { p_jobs: rows.map((a) => a.job_id) }) : { data: [] }
      const tips = Object.fromEntries(((tipRows ?? []) as JobTips[]).map((x) => [x.job_id, Number(x.share)]))
      setLines(rows
        .map((a) => {
          const pay = assignmentPay(a, a.jobs, a.time_entries)
          const tip = tips[a.job_id] ?? 0
          // Once paid, what was actually paid (it includes the tip)
          const total = a.paid_at ? Number(a.paid_amount ?? 0) : pay + tip
          return { a, pay, tip, total, hours: hoursWorked(a.time_entries.filter((e) => e.clock_out)) }
        })
        .sort((x, y) => y.a.jobs.job_date.localeCompare(x.a.jobs.job_date)))
    })()
  }, [account])

  if (lines === null) return <Layout><p className="muted center">{t('Loading…', 'Cargando…')}</p></Layout>

  const from = periodStart(period)
  const shown = lines.filter((l) => l.a.jobs.job_date >= from)
  const sum = (list: Line[], f: (l: Line) => number) => list.reduce((s, l) => s + f(l), 0)
  const waiting = lines.filter((l) => !l.a.paid_at)
  const tabs: Record<Period, string> = {
    week: t('Week', 'Semana'), month: t('Month', 'Mes'), year: t('Year', 'Año'), all: t('All', 'Todo'),
  }
  const labels: Record<Period, string> = {
    week: t('This week', 'Esta semana'), month: t('This month', 'Este mes'), year: t('This year', 'Este año'), all: t('All', 'Todo'),
  }

  // Group the list by month
  const months = new Map<string, Line[]>()
  for (const l of shown) {
    const key = l.a.jobs.job_date.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), l])
  }

  return (
    <Layout>
      <h2>{t('My earnings', 'Mis ganancias')}</h2>
      <div className="segmented">
        {(Object.keys(labels) as Period[]).map((p) => (
          <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>{tabs[p]}</button>
        ))}
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="muted small">{labels[period]}</div>
          <div className="kpi-value">{money(sum(shown, (l) => l.total))}</div>
          <div className="muted small">
            {shown.length === 1 ? t('1 job', '1 trabajo') : t(`${shown.length} jobs`, `${shown.length} trabajos`)}
            {sum(shown, (l) => l.hours) > 0 && ` · ${sum(shown, (l) => l.hours).toFixed(1)} h`}
          </div>
        </div>
        <div className="kpi">
          <div className="muted small">{t('Tips in that time', 'Propinas en ese tiempo')}</div>
          <div className="kpi-value">{money(sum(shown, (l) => l.tip))}</div>
          <div className="muted small">{t('From customers, by card', 'De clientes, con tarjeta')}</div>
        </div>
        <div className="kpi wide">
          <div className="muted small">{t('Not paid yet', 'Sin pagar todavía')}</div>
          <div className={`kpi-value${waiting.length ? ' warn' : ''}`}>{money(sum(waiting, (l) => l.total))}</div>
          <div className="muted small">
            {waiting.length
              ? t(`${waiting.length} ${waiting.length === 1 ? 'job' : 'jobs'}. You're paid after each job.`, `${waiting.length} ${waiting.length === 1 ? 'trabajo' : 'trabajos'}. Se te paga después de cada trabajo.`)
              : t("You're all paid up.", 'Estás al día con tus pagos.')}
          </div>
        </div>
      </div>

      {shown.length === 0 && <p className="muted center">{t('No jobs in this time yet.', 'Todavía no hay trabajos en este tiempo.')}</p>}
      {[...months.entries()].map(([month, list]) => (
        <section className="card" key={month}>
          <h3 className="day">
            <span>{parseDay(`${month}-01`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</span>
            <span>{money(sum(list, (l) => l.total))}</span>
          </h3>
          <ul className="list">
            {list.map(({ a, pay, tip, total, hours }) => (
              <li key={a.id}>
                <Link to={`/jobs/${a.job_id}`} className="list-main plain">
                  <strong>{parseDay(a.jobs.job_date).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                  <span className="muted"> · {jobType(a.jobs.job_type, JOB_TYPES[a.jobs.job_type])}</span>
                  <div className="muted small">
                    {[
                      a.pay_type === 'hourly' ? `${money(a.crew_pay)}/h × ${(hours || Number(a.jobs.est_hours ?? 0)).toFixed(1)} h` : hours ? `${hours.toFixed(1)} h` : null,
                      tip > 0 ? `${money(pay)} ${t('pay', 'pago')} + ${money(tip)} ${t('tip', 'propina')}` : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {a.paid_at
                    ? <div className="small tone-good">{t('Paid', 'Pagado')} {new Date(a.paid_at).toLocaleDateString(locale(), { month: 'short', day: 'numeric' })}{a.paid_method ? ` · ${PAY_METHODS[a.paid_method]}` : ''}</div>
                    : <div className="small tone-warn">{t('Not paid yet', 'Sin pagar todavía')}</div>}
                </Link>
                <div className="list-side"><strong>{money(total)}</strong></div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Layout>
  )
}
