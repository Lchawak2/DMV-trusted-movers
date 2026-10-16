import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { EXTRA_KINDS, type ExtraKind, type JobExtra } from '../../lib/types'
import { useJobDay } from './useJobDay'

const PLACEHOLDERS: Record<ExtraKind, string> = { item: 'Gun safe', time: '1 extra hour', supplies: '10 large boxes' }

export default function Extras() {
  const { id } = useParams() as { id: string }
  const { job, allowed, isAdmin, extras, prices, signoff, reload } = useJobDay(id)
  const [kind, setKind] = useState<ExtraKind>('item')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (job === undefined) return <Layout back={`/jobs/${id}`}><p className="muted center">Loading…</p></Layout>
  if (!job || !allowed) return <Layout back={`/jobs/${id}`}><p className="muted center">Only the lead on this job can add extras.</p></Layout>

  // After the customer signs, only an admin can change extras
  const locked = !!signoff && !isAdmin

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error: saveError } = await supabase.from('job_extras').insert({ job_id: id, kind, title: title.trim(), note: note.trim() || null })
    if (saveError) return setError(saveError.message)
    setTitle('')
    setNote('')
    reload()
  }

  async function remove(x: JobExtra) {
    await supabase.from('job_extras').delete().eq('id', x.id)
    reload()
  }

  async function setPrice(x: JobExtra, value: string) {
    if (value === '') await supabase.from('job_extra_prices').delete().eq('extra_id', x.id)
    else await supabase.from('job_extra_prices').upsert({ extra_id: x.id, amount: Number(value) })
    reload()
  }

  const total = extras.reduce((s, x) => s + (prices[x.id] ?? 0), 0)

  return (
    <Layout back={`/jobs/${id}`} title="Extras">
      <p className="note">
        {isAdmin
          ? 'Extras the lead added on the day. Set a price for each one; crew never see prices.'
          : "Add anything that wasn't on the booking. The office sets the price, and the customer sees each extra before signing."}
      </p>

      <section className="card">
        <h3>Added so far</h3>
        {extras.length === 0 && <p className="muted">Nothing added yet.</p>}
        <ul className="list">
          {extras.map((x) => (
            <li key={x.id}>
              <div className="list-main">
                <strong>{x.title}</strong>
                <div className="muted small">{EXTRA_KINDS[x.kind]}{x.note ? ` · ${x.note}` : ''}</div>
              </div>
              <div className="list-side">
                {isAdmin && (
                  <input className="pay" type="number" min={0} step={0.01} placeholder="Price $" aria-label={`Price for ${x.title}`}
                    defaultValue={prices[x.id] ?? ''}
                    onBlur={(e) => e.target.value !== String(prices[x.id] ?? '') && setPrice(x, e.target.value)} />
                )}
                {!locked && <button className="link" onClick={() => remove(x)}>Remove</button>}
              </div>
            </li>
          ))}
        </ul>
        {isAdmin && extras.length > 0 && <p className="small">Extras total <strong>{money(total)}</strong></p>}
      </section>

      {locked ? (
        <p className="muted">The customer has signed, so extras can't change. Ask the office if something is missing.</p>
      ) : (
        <form className="card form" onSubmit={add}>
          <h3>Add an extra</h3>
          <div className="segmented wide">
            {(Object.keys(EXTRA_KINDS) as ExtraKind[]).map((k) => (
              <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{EXTRA_KINDS[k]}</button>
            ))}
          </div>
          <label>What is it?<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={PLACEHOLDERS[kind]} required /></label>
          <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="About 400 lb, basement stairs" /></label>
          {error && <p className="warn">{error}</p>}
          <button className="primary">Add extra</button>
        </form>
      )}
    </Layout>
  )
}
