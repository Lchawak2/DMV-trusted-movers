import { useEffect, useRef, useState, type FormEvent, type PointerEvent, type RefObject } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dateTime, dayHeading } from '../../lib/format'
import { EXTRA_KINDS } from '../../lib/types'
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

  if (job === undefined) return <Layout back={`/jobs/${id}`}><p className="muted center">{t('Loading…', 'Cargando…')}</p></Layout>
  if (!job || !allowed) return <Layout back={`/jobs/${id}`}><p className="muted center">{t('Only the lead on this job can collect the signature.', 'Solo el líder de este trabajo puede tomar la firma.')}</p></Layout>

  const damage = photos.filter((p) => p.kind === 'damage')

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
          I confirm everything was moved and the extras above were done.
        </label>
        {error && <p className="warn">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Sign and finish'}</button>
      </form>
    </Layout>
  )
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
    ctx.strokeStyle = '#0f1b2d'
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
