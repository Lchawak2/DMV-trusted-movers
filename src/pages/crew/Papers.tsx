import { useState, type ChangeEvent, type ReactNode } from 'react'
import Layout from '../../components/Layout'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { shrink } from '../../lib/photos'
import { dateTime } from '../../lib/format'
import { t } from '../../lib/lang'
import { papersCount, papersDone, useMyPapers } from '../../lib/papers'
import type { CrewPapers } from '../../lib/types'

type Doc = 'id'

// The rules every mover agrees to before claiming jobs
export const CREW_RULES: [string, string][] = [
  ['Arrive on time for the arrival window. If you are running late, call the office before the window starts.',
    'Llega a tiempo para la hora de llegada. Si vas tarde, llama a la oficina antes de esa hora.'],
  ['Clock in when you arrive and clock out when you leave, in this app.',
    'Marca tu entrada al llegar y tu salida al irte, en esta app.'],
  ['No alcohol or drugs before or during a job. No smoking in a customer\'s home or in the truck.',
    'Nada de alcohol ni drogas antes o durante un trabajo. No fumes en la casa del cliente ni en el camión.'],
  ['Wear closed shoes and clean clothes. Be polite to customers and their neighbors.',
    'Usa zapatos cerrados y ropa limpia. Sé amable con los clientes y sus vecinos.'],
  ['Handle every item with care. Use blankets and wrap, and protect floors and door frames.',
    'Trata cada cosa con cuidado. Usa cobijas y plástico, y protege pisos y marcos de puertas.'],
  ['If something gets damaged, or was already damaged, take a photo and report it in the app right away. Never hide damage.',
    'Si algo se daña, o ya estaba dañado, toma una foto y repórtalo en la app de inmediato. Nunca escondas un daño.'],
  ['Don\'t ask customers for cash or tips. Customers tip through their booking link, and tips go to the crew.',
    'No pidas dinero ni propinas a los clientes. Ellos dan propina desde su enlace de reserva, y la propina es para el equipo.'],
  ['Keep customers\' addresses, belongings and details private. Don\'t post photos of their homes.',
    'Mantén en privado las direcciones, cosas y datos de los clientes. No publiques fotos de sus casas.'],
  ['Follow the lead\'s directions on the job, and lift safely: ask for help with heavy items.',
    'Sigue las indicaciones del líder en el trabajo, y levanta con cuidado: pide ayuda con cosas pesadas.'],
  ['If you can\'t make a job you accepted, tell the office as early as you can.',
    'Si no puedes llegar a un trabajo que aceptaste, avisa a la oficina lo antes posible.'],
]

export default function Papers() {
  const { papers, reload } = useMyPapers()
  if (papers === undefined) return <Layout back="/profile" title={t('Sign-up papers', 'Papeles')}><p className="muted center">{t('Loading…', 'Cargando…')}</p></Layout>
  const done = papersDone(papers)
  return (
    <Layout back="/profile" title={t('Sign-up papers', 'Papeles')}>
      <p className={done ? 'note tone-good' : 'note'}>
        {done
          ? t('All done. You can claim jobs on Find Job.', 'Todo listo. Puedes tomar trabajos en Buscar trabajo.')
          : t(`${papersCount(papers)} of 2 done. Once both are in, you can claim jobs on Find Job.`,
            `${papersCount(papers)} de 2 listos. Cuando los dos estén completos, podrás tomar trabajos en Buscar trabajo.`)}
      </p>
      {papers?.admin_ok_at && <p className="note">{t('The office has checked your papers.', 'La oficina revisó tus papeles.')}</p>}
      <PapersSteps papers={papers} reload={reload} />
    </Layout>
  )
}

// The three steps, on the papers page and on the screen new sign-ups see while they wait
export function PapersSteps({ papers, reload }: { papers: CrewPapers | null; reload: () => void }) {
  const { account } = useAuth()
  const [busy, setBusy] = useState<Doc | 'rules' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(account?.full_name ?? '')
  const [agree, setAgree] = useState(false)

  if (!account) return null

  async function upload(kind: Doc, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setBusy(kind)
    try {
      const pdf = file.type === 'application/pdf'
      if (pdf && file.size > 10 * 1024 * 1024) throw new Error(t('That file is over 10 MB. Try a photo instead.', 'Ese archivo pesa más de 10 MB. Mejor toma una foto.'))
      const blob = pdf ? file : await shrink(file)
      const path = `${account!.id}/${kind}-${crypto.randomUUID()}.${pdf ? 'pdf' : 'jpg'}`
      const up = await supabase.storage.from('crew-docs').upload(path, blob, { contentType: pdf ? 'application/pdf' : 'image/jpeg' })
      if (up.error) throw up.error
      const field = 'id_path'
      const old = papers?.[field]
      const row = await supabase.from('crew_papers').upsert({ crew_id: account!.id, [field]: path }, { onConflict: 'crew_id' })
      if (row.error) {
        await supabase.storage.from('crew-docs').remove([path])
        throw row.error
      }
      // The new file replaces the old one
      if (old) await supabase.storage.from('crew-docs').remove([old])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('The file could not be saved. Try again.', 'No se pudo guardar el archivo. Intenta otra vez.'))
    }
    setBusy(null)
    reload()
  }

  async function acceptRules() {
    setError(null)
    setBusy('rules')
    // The database records the time itself
    const { error: e } = await supabase.from('crew_papers')
      .upsert({ crew_id: account!.id, rules_name: name.trim(), rules_accepted_at: new Date().toISOString() }, { onConflict: 'crew_id' })
    if (e) setError(e.message)
    setBusy(null)
    reload()
  }

  const fileStep = (kind: Doc, n: number, title: string, help: ReactNode, accept: string) => {
    const path = papers?.id_path
    return (
      <section className="card">
        <div className="paper-head">
          <span className={`step-dot${path ? ' done' : ''}`}>{path ? '✓' : n}</span>
          <h3>{title}</h3>
        </div>
        {help}
        {path && <p className="small tone-good">{t('Uploaded. Only you and the office can see it.', 'Subido. Solo tú y la oficina pueden verlo.')}</p>}
        <label className={`secondary block upload-btn${busy === kind ? ' faded' : ''}`}>
          {busy === kind ? t('Uploading…', 'Subiendo…') : path ? t('Replace', 'Reemplazar') : t('Take a photo or choose a file', 'Toma una foto o elige un archivo')}
          <input type="file" accept={accept} onChange={(e) => upload(kind, e)} disabled={!!busy} hidden />
        </label>
      </section>
    )
  }

  return (
    <>
      {fileStep('id', 1, t('Photo ID', 'Identificación con foto'),
        <p className="muted small">{t('Driver\'s license, state ID or passport. Make sure your name and photo are clear.', 'Licencia de conducir, identificación estatal o pasaporte. Que tu nombre y foto se vean claros.')}</p>,
        'image/*,application/pdf')}
      <section className="card">
        <div className="paper-head">
          <span className={`step-dot${papers?.rules_accepted_at ? ' done' : ''}`}>{papers?.rules_accepted_at ? '✓' : 2}</span>
          <h3>{t('Crew rules', 'Reglas del equipo')}</h3>
        </div>
        <ol className="rules">
          {CREW_RULES.map(([en, es]) => <li key={en}>{t(en, es)}</li>)}
        </ol>
        {papers?.rules_accepted_at ? (
          <p className="small tone-good">{t('Agreed by', 'Aceptado por')} {papers.rules_name}, {dateTime(papers.rules_accepted_at)}</p>
        ) : (
          <div className="form">
            <label>{t('Your full name', 'Tu nombre completo')}<input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />{t('I read the rules and agree to follow them', 'Leí las reglas y acepto seguirlas')}</label>
            <button className="primary" disabled={!agree || name.trim().length < 2 || busy === 'rules'} onClick={acceptRules}>
              {busy === 'rules' ? t('Saving…', 'Guardando…') : t('I agree', 'Acepto')}
            </button>
          </div>
        )}
      </section>
      {error && <p className="warn">{error}</p>}
    </>
  )
}
