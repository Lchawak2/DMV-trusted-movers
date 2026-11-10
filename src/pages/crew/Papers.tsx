import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import Layout from '../../components/Layout'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { shrink } from '../../lib/photos'
import { dateTime } from '../../lib/format'
import { t } from '../../lib/lang'
import { papersCount, papersDone, useMyPapers } from '../../lib/papers'
import type { CrewPapers } from '../../lib/types'
import { AGREEMENT_VERSION, CREW_AGREEMENT, type Block } from '../../lib/crewAgreement'

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
  ['Handle every item with care, and protect floors and door frames.',
    'Trata cada cosa con cuidado, y protege pisos y marcos de puertas.'],
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
          : t(`${papersCount(papers)} of 4 done. Once all 4 are in, you can claim jobs on Find Job.`,
            `${papersCount(papers)} de 4 listos. Cuando los 4 estén completos, podrás tomar trabajos en Buscar trabajo.`)}
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
      <AgreementStep papers={papers} reload={reload} />
      <EmergencyStep papers={papers} reload={reload} />
      {error && <p className="warn">{error}</p>}
    </>
  )
}

function StepHead({ n, done, title }: { n: number; done: boolean; title: string }) {
  return (
    <div className="paper-head">
      <span className={`step-dot${done ? ' done' : ''}`}>{done ? '✓' : n}</span>
      <h3>{title}</h3>
    </div>
  )
}

// A paper's text: headings, paragraphs, and runs of list items as one list
function PaperText({ blocks }: { blocks: Block[] }) {
  const out: ReactNode[] = []
  let items: ReactNode[] = []
  const flush = () => { if (items.length) out.push(<ul className="rules" key={out.length}>{items}</ul>); items = [] }
  blocks.forEach(([kind, en, es], i) => {
    if (kind === 'li') { items.push(<li key={i}>{t(en, es)}</li>); return }
    flush()
    out.push(kind === 'h' ? <h4 key={i} className="paper-h">{t(en, es)}</h4> : <p key={i} className="small">{t(en, es)}</p>)
  })
  flush()
  return <>{out}</>
}

// Step 3: contractor agreement, damage policy, safety rules, privacy and code of conduct, signed once
function AgreementStep({ papers, reload }: { papers: CrewPapers | null; reload: () => void }) {
  const { account } = useAuth()
  const [name, setName] = useState(account?.full_name ?? '')
  const [agree, setAgree] = useState(false)
  const [signed, setSigned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pad = useRef<HTMLCanvasElement>(null)
  if (!account) return null
  const done = !!papers?.agreement_signed_at

  async function sign() {
    setError(null)
    setBusy(true)
    try {
      const blob = await new Promise<Blob | null>((ok) => pad.current?.toBlob(ok, 'image/png'))
      if (!blob) throw new Error(t('Sign in the box first.', 'Firma primero en el recuadro.'))
      const path = `${account!.id}/signature-${crypto.randomUUID()}.png`
      const up = await supabase.storage.from('crew-docs').upload(path, blob, { contentType: 'image/png' })
      if (up.error) throw up.error
      const old = papers?.agreement_sig_path
      // The database records the time itself
      const row = await supabase.from('crew_papers').upsert({
        crew_id: account!.id, agreement_name: name.trim(), agreement_sig_path: path,
        agreement_version: AGREEMENT_VERSION, agreement_signed_at: new Date().toISOString(),
      }, { onConflict: 'crew_id' })
      if (row.error) {
        await supabase.storage.from('crew-docs').remove([path])
        throw row.error
      }
      if (old) await supabase.storage.from('crew-docs').remove([old])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Your signature could not be saved. Try again.', 'No se pudo guardar tu firma. Intenta otra vez.'))
    }
    setBusy(false)
    reload()
  }

  return (
    <section className="card">
      <StepHead n={3} done={done} title={t('Crew agreement', 'Contrato del equipo')} />
      <p className="muted small">
        {t(`${CREW_AGREEMENT.length} short papers: how you work with us, damage, safety, privacy and conduct. Tap each one to read it, then sign once at the bottom.`,
          `${CREW_AGREEMENT.length} papeles cortos: cómo trabajas con nosotros, daños, seguridad, privacidad y conducta. Toca cada uno para leerlo y luego firma una vez abajo.`)}
      </p>
      <div className="papers-list">
        {CREW_AGREEMENT.map((paper) => (
          <details key={paper.title[0]} className="more">
            <summary>{t(...paper.title)}</summary>
            <PaperText blocks={paper.blocks} />
          </details>
        ))}
      </div>
      {done ? (
        <p className="small tone-good">{t('Signed by', 'Firmado por')} {papers!.agreement_name}, {dateTime(papers!.agreement_signed_at!)}</p>
      ) : (
        <div className="form">
          <label>{t('Your full legal name', 'Tu nombre legal completo')}<input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label>
          <SignaturePad canvas={pad} onChange={setSigned} />
          <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            {t(`I read all ${CREW_AGREEMENT.length} papers and agree to them. My signature here counts as signing them.`,
              `Leí los ${CREW_AGREEMENT.length} papeles y los acepto. Mi firma aquí cuenta como firma de todos.`)}
          </label>
          <button className="primary" disabled={!agree || !signed || name.trim().length < 2 || busy} onClick={sign}>
            {busy ? t('Saving…', 'Guardando…') : t('Sign', 'Firmar')}
          </button>
        </div>
      )}
      {error && <p className="warn">{error}</p>}
    </section>
  )
}

// Finger or mouse signature on a canvas
function SignaturePad({ canvas, onChange }: { canvas: RefObject<HTMLCanvasElement>; onChange: (signed: boolean) => void }) {
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [canvas])
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  function down(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = point(e)
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke()
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = point(e)
    ctx.lineTo(x, y); ctx.stroke()
    if (empty) { setEmpty(false); onChange(true) }
  }
  function clear() {
    const c = canvas.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setEmpty(true); onChange(false)
  }
  return (
    <div className="sig-pad">
      <div className="sig-head">
        <span>{t('Sign here with your finger', 'Firma aquí con tu dedo')}</span>
        {!empty && <button type="button" className="link" onClick={clear}>{t('Clear', 'Borrar')}</button>}
      </div>
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drawing.current = false }}
        onPointerCancel={() => { drawing.current = false }} />
    </div>
  )
}

// Step 4: who to call if something happens on a job
function EmergencyStep({ papers, reload }: { papers: CrewPapers | null; reload: () => void }) {
  const { account } = useAuth()
  const blank = {
    emergency_name: '', emergency_relation: '', emergency_phone: '',
    emergency2_name: '', emergency2_relation: '', emergency2_phone: '', health_notes: '',
  }
  type Form = typeof blank
  const fromPapers = (): Form => Object.fromEntries(Object.keys(blank).map((k) => [k, papers?.[k as keyof Form] ?? ''])) as Form
  const [f, setF] = useState<Form>(fromPapers)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!account) return null
  const done = !!papers?.emergency_phone
  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const phoneOk = (v: string) => v.replace(/\D/g, '').length >= 10

  async function save() {
    setError(null)
    setBusy(true)
    const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]))
    const { error: e } = await supabase.from('crew_papers').upsert({ crew_id: account!.id, ...clean }, { onConflict: 'crew_id' })
    setBusy(false)
    if (e) { setError(e.message); return }
    setEditing(false)
    reload()
  }

  return (
    <section className="card">
      <StepHead n={4} done={done} title={t('Emergency contact', 'Contacto de emergencia')} />
      <p className="muted small">{t('The office calls them only if something happens to you on a job.', 'La oficina le llama solo si te pasa algo en un trabajo.')}</p>
      {done && !editing ? (
        <>
          <p className="small tone-good">{papers!.emergency_name}{papers!.emergency_relation ? ` (${papers!.emergency_relation})` : ''} · {papers!.emergency_phone}</p>
          <button className="link" onClick={() => { setF(fromPapers()); setEditing(true) }}>{t('Change', 'Cambiar')}</button>
        </>
      ) : (
        <div className="form">
          <label>{t('Name', 'Nombre')}<input value={f.emergency_name} maxLength={100} onChange={set('emergency_name')} /></label>
          <label>{t('How you know them (mother, partner, friend…)', 'Quién es (mamá, pareja, amigo…)')}<input value={f.emergency_relation} maxLength={60} onChange={set('emergency_relation')} /></label>
          <label>{t('Phone', 'Teléfono')}<input type="tel" value={f.emergency_phone} maxLength={30} onChange={set('emergency_phone')} /></label>
          <details className="more">
            <summary>{t('Second contact (optional)', 'Segundo contacto (opcional)')}</summary>
            <label>{t('Name', 'Nombre')}<input value={f.emergency2_name} maxLength={100} onChange={set('emergency2_name')} /></label>
            <label>{t('How you know them', 'Quién es')}<input value={f.emergency2_relation} maxLength={60} onChange={set('emergency2_relation')} /></label>
            <label>{t('Phone', 'Teléfono')}<input type="tel" value={f.emergency2_phone} maxLength={30} onChange={set('emergency2_phone')} /></label>
          </details>
          <details className="more">
            <summary>{t('Health info for first responders (optional)', 'Información de salud para emergencias (opcional)')}</summary>
            <label>{t('Allergies, conditions or medicines you want them to know about', 'Alergias, condiciones o medicinas que quieras que sepan')}
              <textarea value={f.health_notes} maxLength={500} rows={3} onChange={set('health_notes')} /></label>
          </details>
          <p className="muted small">{t('By saving, you agree the office may share this with emergency responders and your contacts if you are hurt or sick on a job.', 'Al guardar, aceptas que la oficina comparta esto con servicios de emergencia y tus contactos si te lastimas o enfermas en un trabajo.')}</p>
          <button className="primary" disabled={busy || f.emergency_name.trim().length < 2 || !phoneOk(f.emergency_phone)} onClick={save}>
            {busy ? t('Saving…', 'Guardando…') : t('Save', 'Guardar')}
          </button>
          {editing && <button className="secondary" onClick={() => setEditing(false)}>{t('Cancel', 'Cancelar')}</button>}
        </div>
      )}
      {error && <p className="warn">{error}</p>}
    </section>
  )
}
