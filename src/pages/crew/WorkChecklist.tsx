import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { clock } from '../../lib/format'
import { t } from '../../lib/lang'

type Check = { step: string; checked_by: string | null; checked_at: string }

// The work steps of a move. Keys are saved in job_checks, so keep them when changing the wording.
const STEPS: { place: [string, string]; items: [string, string, string][] }[] = [
  {
    place: ['At pickup', 'Al recoger'],
    items: [
      ['walk', 'Walk through the home with the customer', 'Recorre la casa con el cliente'],
      ['floors', 'Protect floors and door frames', 'Protege pisos y marcos de puertas'],
      ['apart', 'Take apart beds and tables, bag and label the screws', 'Desarma camas y mesas, guarda y marca los tornillos'],
      ['wrap', 'Wrap furniture in blankets and plastic wrap', 'Envuelve los muebles con cobijas y plástico'],
      ['load', 'Load heavy items first and strap the load', 'Carga lo pesado primero y asegura la carga con correas'],
      ['empty', 'Check every room, closet and cabinet is empty', 'Revisa que cada cuarto, clóset y gabinete esté vacío'],
    ],
  },
  {
    place: ['At drop-off', 'Al entregar'],
    items: [
      ['rooms', 'Put each item in the room the customer wants', 'Pon cada cosa en el cuarto que el cliente quiere'],
      ['assemble', 'Put beds and tables back together', 'Vuelve a armar camas y mesas'],
      ['final_walk', 'Final walk-through with the customer', 'Recorrido final con el cliente'],
      ['truck', 'Truck empty: blankets, straps and tools collected', 'Camión vacío: cobijas, correas y herramientas recogidas'],
    ],
  },
]
const TOTAL = STEPS.reduce((n, s) => n + s.items.length, 0)

// Everyone on the job can tick steps; the admin sees who did what
export default function WorkChecklist({ jobId }: { jobId: string }) {
  const { account } = useAuth()
  const isAdmin = account?.role === 'admin'
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('job_checks').select('step, checked_by, checked_at').eq('job_id', jobId)
    if (e) return
    setChecks((data ?? []) as Check[])
    const ids = [...new Set((data ?? []).map((c) => c.checked_by).filter(Boolean))] as string[]
    // Crew can only read their own account, so names show for the admin
    if (isAdmin && ids.length) {
      const { data: people } = await supabase.from('accounts').select('id, full_name, email').in('id', ids)
      setNames(Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name ?? p.email ?? ''])))
    }
  }, [jobId, isAdmin])

  useEffect(() => { load() }, [load])

  if (!checks || !account) return null

  async function toggle(step: string) {
    setError(null)
    const done = checks!.some((c) => c.step === step)
    const before = checks!
    setChecks(done ? before.filter((c) => c.step !== step) : [...before, { step, checked_by: account!.id, checked_at: new Date().toISOString() }])
    const { error: e } = done
      ? await supabase.from('job_checks').delete().eq('job_id', jobId).eq('step', step)
      : await supabase.from('job_checks').upsert({ job_id: jobId, step }, { onConflict: 'job_id,step', ignoreDuplicates: true })
    if (e) {
      setChecks(before)
      setError(t("That didn't save. Check your signal and tap it again.", 'No se guardó. Revisa tu señal y tócalo otra vez.'))
    }
    load()
  }

  const who = (c: Check) => c.checked_by === account.id ? t('You', 'Tú') : names[c.checked_by ?? ''] ?? t('Crew', 'Equipo')

  return (
    <section className="card">
      <h3 className="day">
        <span>{t('Work checklist', 'Lista de trabajo')}</span>
        <span className={checks.length === TOTAL ? 'tone-good' : ''}>{checks.length} / {TOTAL}</span>
      </h3>
      {STEPS.map((group) => (
        <div key={group.place[0]}>
          <div className="check-group muted small">{t(...group.place)}</div>
          <ul className="checks">
            {group.items.map(([key, en, es]) => {
              const c = checks.find((x) => x.step === key)
              return (
                <li key={key}>
                  <button className={`check-row${c ? ' done' : ''}`} aria-pressed={!!c} onClick={() => toggle(key)}>
                    <span className="check-box">{c ? '✓' : ''}</span>
                    <span className="list-main">
                      {t(en, es)}
                      {c && <span className="muted small step-detail">{who(c)} · {clock(new Date(c.checked_at).toTimeString().slice(0, 5))}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {error && <p className="warn">{error}</p>}
    </section>
  )
}
