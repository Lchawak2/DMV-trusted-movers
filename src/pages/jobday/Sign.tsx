import { useEffect, useRef, useState, type FormEvent, type PointerEvent, type RefObject } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dateTime, dayHeading } from '../../lib/format'
import { EXTRA_KINDS } from '../../lib/types'
import { FREE_MINUTES, MOVE_RATE } from '../../lib/prices'
import { useJobDay } from './useJobDay'
import { t } from '../../lib/lang'

export default function Sign() {
  const { id } = useParams() as { id: string }
  const navigate = useNavigate()
  const { job, allowed, photos, extras, signoff } = useJobDay(id)
  const [name, setName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pad = useRef<HTMLCanvasElement>(null)
  const [time, setTime] = useState<MoveTime | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    supabase.rpc('job_move_time', { p_job: id }).then(({ data }) => setTime(data as MoveTime | null))
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(tick)
  }, [id])

  if (job === undefined) return <Layout back={`/jobs/${id}`}><p className="muted center">{t('Loading…', 'Cargando…')}</p></Layout>
  if (!job || !allowed) return <Layout back={`/jobs/${id}`}><p className="muted center">{t('Only the lead on this job can collect the signature.', 'Solo el líder de este trabajo puede tomar la firma.')}</p></Layout>

  const damage = photos.filter((p) => p.kind === 'damage')
  const moving = time?.started ? Math.max(Math.floor((now - new Date(time.started).getTime()) / 60_000), 0) : null
  const over = moving !== null && time?.included_hours ? moving - Math.round(time.included_hours * 60) : 0

  const summary = (
    <section className="card">
      <h3>The move, {dayHeading(job.job_date)}</h3>
      <ol className="route">
        <li>{job.from_address}</li>
        {job.to_address && <li>{job.to_address}</li>}
      </ol>
      <ul className="list">
        {extras.map((x) => (
          <li key={x.id}><span className="muted">Extra {EXTRA_KINDS[x.kind].toLowerCase()}</span><strong>{x.title}</strong></li>
        ))}
        {damage.map((p) => (
          <li key={p.id}><span className="muted">Damage noted</span><strong>{p.note || 'Photo taken'}</strong></li>
        ))}
        {extras.length === 0 && damage.length === 0 && <li><span className="muted">No extras or damage noted</span></li>}
      </ul>
      {!signoff && time?.billed && moving !== null && (
        <p className="small">
          Moving time so far <strong>{hoursMinutes(moving)}</strong>, with {hoursMinutes(Math.round(time.included_hours! * 60))} included.{' '}
          {over > FREE_MINUTES
            ? <>About <strong>{hoursMinutes(over)}</strong> of extra time will be added to your bill at ${MOVE_RATE} an hour.</>
            : <>Past the included time, the first {FREE_MINUTES} minutes are free, then it's ${MOVE_RATE} an hour.</>}
        </p>
      )}
    </section>
  )

  if (signoff) {
    return (
      <Layout back={`/jobs/${id}`} title="Customer sign-off">
        {summary}
        <section className="card">
          <h3>Signed</h3>
          <img className="signature" src={signoff.signature} alt={`Signature of ${signoff.signer_name}`} />
          <p><strong>{signoff.signer_name}</strong> · {dateTime(signoff.signed_at)}</p>
        </section>
      </Layout>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!hasInk) return setError('Ask the customer to sign in the box.')
    setBusy(true)
    const { error: saveError } = await supabase.from('job_signoffs').insert({
      job_id: id, signer_name: name.trim(), signature: pad.current!.toDataURL('image/png'),
    })
    setBusy(false)
    if (saveError) return setError(saveError.message)
    navigate(`/jobs/${id}`)
  }

  return (
    <Layout back={`/jobs/${id}`} title="Customer sign-off">
      <p className="note">{t("Hand the phone to the customer. Prices aren't shown here; the customer gets the final bill from the office.",
        'Dale el teléfono al cliente. Aquí no se muestran precios; el cliente recibe la cuenta final de la oficina.')}</p>
      {/* From here down the customer reads it, so it stays in English */}
      {summary}
      <form className="form" onSubmit={submit}>
        <label>Customer name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required /></label>
        <SignaturePad canvas={pad} onInk={setHasInk} />
        <label className="check">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
          {time?.billed && over > FREE_MINUTES
            ? `I confirm everything was moved, the extras above were done, and the moving time of ${hoursMinutes(moving!)} is right.`
            : 'I confirm everything was moved and the extras above were done.'}
        </label>
        {error && <p className="warn">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Sign and finish'}</button>
      </form>
    </Layout>
  )
}

type MoveTime = { started: string | null; included_hours: number | null; billed: boolean }

// 80 -> "1 hr 20 min", the same wording as the extra the database adds
function hoursMinutes(minutes: number) {
  const h = Math.floor(minutes / 60), m = minutes % 60
  return [h ? `${h} hr` : '', m || !h ? `${m} min` : ''].filter(Boolean).join(' ')
}

function SignaturePad({ canvas, onInk }: { canvas: RefObject<HTMLCanvasElement>; onInk: (v: boolean) => void }) {
  const drawing = useRef(false)

  // Size the drawing surface to the box at the screen's pixel density
  useEffect(() => {
    const c = canvas.current!
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    c.width = c.clientWidth * ratio
    c.height = c.clientHeight * ratio
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
    ctx.beginPath()
    ctx.moveTo(...point(e))
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')!
    ctx.lineTo(...point(e))
    ctx.stroke()
    onInk(true)
  }

  function clear() {
    const c = canvas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    onInk(false)
  }

  return (
    <div>
      <div className="toolbar">
        <span className="muted small"><strong>Sign here</strong></span>
        <button type="button" className="link" onClick={clear}>Clear</button>
      </div>
      <canvas ref={canvas} className="sign-pad" aria-label="Signature box"
        onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} onPointerCancel={() => (drawing.current = false)} />
    </div>
  )
}
