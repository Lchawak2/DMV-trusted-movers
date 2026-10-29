import { useCallback, useEffect, useState } from 'react'
import Layout from '../../components/Layout'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { locale, t } from '../../lib/lang'

const WEEKS = 6
const iso = (d: Date) => d.toLocaleDateString('en-CA')

// Today, then the next six weeks, laid out Sunday to Saturday
function calendar(): { day: string; date: Date; past: boolean }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(today.getDate() - today.getDay())
  return Array.from({ length: WEEKS * 7 }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    return { day: iso(date), date, past: date < today }
  })
}

export default function Availability() {
  const { account } = useAuth()
  const [days, setDays] = useState<Set<string> | null>(null)
  const [booked, setBooked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const cells = calendar()
  const open = cells.filter((c) => !c.past)

  const load = useCallback(async () => {
    if (!account) return
    const from = iso(new Date())
    const [a, j] = await Promise.all([
      supabase.from('crew_availability').select('day').eq('crew_id', account.id).gte('day', from),
      supabase.from('assignments').select('jobs!inner(job_date)').eq('crew_id', account.id)
        .in('status', ['offered', 'accepted']).gte('jobs.job_date', from),
    ])
    if (a.error) return setError(t('Could not load your days. Check your signal and try again.', 'No se pudieron cargar tus días. Revisa tu señal e intenta otra vez.'))
    setDays(new Set((a.data ?? []).map((r) => r.day as string)))
    setBooked(new Set((j.data ?? []).map((r) => (r.jobs as unknown as { job_date: string }).job_date)))
  }, [account])

  useEffect(() => { load() }, [load])

  async function set(list: string[], on: boolean) {
    if (!days || !account || !list.length) return
    setError(null)
    // Show the change at once; put it back if it doesn't save
    const before = days
    const next = new Set(days)
    list.forEach((d) => (on ? next.add(d) : next.delete(d)))
    setDays(next)
    const { error: e } = on
      ? await supabase.from('crew_availability').upsert(list.map((day) => ({ crew_id: account.id, day })), { onConflict: 'crew_id,day', ignoreDuplicates: true })
      : await supabase.from('crew_availability').delete().eq('crew_id', account.id).in('day', list)
    if (e) {
      setDays(before)
      setError(t('That didn\'t save. Check your signal and try again.', 'No se guardó. Revisa tu señal e intenta otra vez.'))
    }
  }

  const weekdayNames = cells.slice(0, 7).map((c) => c.date.toLocaleDateString(locale(), { weekday: 'narrow' }))
  const count = days ? open.filter((c) => days.has(c.day)).length : 0
  const pick = (test: (d: Date) => boolean) => open.filter((c) => test(c.date) && !days?.has(c.day)).map((c) => c.day)

  return (
    <Layout back="/" title={t('My availability', 'Mi disponibilidad')}>
      <p className="note">
        {t('Tap the days you can work. The office sees them when it picks the crew for a move.',
          'Toca los días que puedes trabajar. La oficina los ve cuando escoge el equipo para una mudanza.')}
      </p>
      {days === null ? (
        error ? <p className="warn">{error}</p> : <p className="muted center">{t('Loading…', 'Cargando…')}</p>
      ) : (
        <section className="card">
          <div className="cal">
            {weekdayNames.map((n, i) => <div key={i} className="cal-head">{n}</div>)}
            {cells.map((c) => {
              const on = days.has(c.day)
              const first = c.date.getDate() === 1 || c === cells[0]
              return (
                <button key={c.day} className={`cal-day${on ? ' on' : ''}${booked.has(c.day) ? ' booked' : ''}`} disabled={c.past}
                  aria-pressed={on} aria-label={c.date.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })}
                  onClick={() => set([c.day], !on)}>
                  {first && <span className="cal-month">{c.date.toLocaleDateString(locale(), { month: 'short' })}</span>}
                  {c.date.getDate()}
                </button>
              )
            })}
          </div>
          <p className="muted small">
            {count === 1 ? t('1 day marked', '1 día marcado') : t(`${count} days marked`, `${count} días marcados`)}
            {booked.size > 0 && <> · <span className="cal-key" /> {t('you have a job', 'tienes trabajo')}</>}
          </p>
          <div className="chips">
            <button className="chip" onClick={() => set(pick((d) => d.getDay() === 0 || d.getDay() === 6), true)}>{t('Add all weekends', 'Agregar fines de semana')}</button>
            <button className="chip" onClick={() => set(pick((d) => d.getDay() > 0 && d.getDay() < 6), true)}>{t('Add all weekdays', 'Agregar entre semana')}</button>
            <button className="chip" onClick={() => set(open.filter((c) => days.has(c.day)).map((c) => c.day), false)}>{t('Clear all', 'Borrar todo')}</button>
          </div>
          {error && <p className="warn">{error}</p>}
        </section>
      )}
    </Layout>
  )
}
