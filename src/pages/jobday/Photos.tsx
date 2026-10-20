import { useState, type ChangeEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { shrink } from '../../lib/photos'
import { useJobDay, type PhotoWithUrl } from './useJobDay'

type Tab = 'before' | 'damage'

export default function Photos() {
  const { id } = useParams() as { id: string }
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'damage' ? 'damage' : 'before'
  const { job, allowed, photos, reload } = useJobDay(id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (job === undefined) return <Layout back={`/jobs/${id}`}><p className="muted center">Loading…</p></Layout>
  if (!job || !allowed) return <Layout back={`/jobs/${id}`}><p className="muted center">Only the lead on this job can add photos.</p></Layout>

  const shown = photos.filter((p) => p.kind === tab)
  const count = (k: Tab) => photos.filter((p) => p.kind === k).length

  async function add(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setError(null)
    setBusy(true)
    try {
      for (const file of files) {
        const blob = await shrink(file)
        const path = `${id}/${crypto.randomUUID()}.jpg`
        const up = await supabase.storage.from('job-photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        const row = await supabase.from('job_photos').insert({ job_id: id, kind: tab, storage_path: path })
        if (row.error) {
          await supabase.storage.from('job-photos').remove([path])
          throw row.error
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The photo could not be saved. Try again.')
    }
    setBusy(false)
    reload()
  }

  return (
    <Layout back={`/jobs/${id}`} title="Photos">
      <div className="segmented wide">
        {(['before', 'damage'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setParams({ tab: t }, { replace: true })}>
            {t === 'before' ? 'Before' : 'Damage'} ({count(t)})
          </button>
        ))}
      </div>
      <p className="note">
        {tab === 'before'
          ? 'Take photos of the rooms and big furniture before anything moves. They protect you and the company if a customer reports damage later.'
          : 'Photograph any damage you find, before or during the move, and say what happened.'}
      </p>

      <div className="photo-grid">
        {tab === 'before' && shown.map((p) => <Thumb key={p.id} photo={p} onRemoved={reload} />)}
        <label className={`photo-add${busy ? ' faded' : ''}`}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
          </svg>
          <span>{busy ? 'Saving…' : 'Take photo'}</span>
          <input type="file" accept="image/*" capture="environment" multiple={tab === 'before'} onChange={add} disabled={busy} hidden />
        </label>
      </div>

      {tab === 'damage' && shown.map((p) => <DamageCard key={p.id} photo={p} onChange={reload} />)}
      {error && <p className="warn">{error}</p>}
    </Layout>
  )
}

function Thumb({ photo, onRemoved }: { photo: PhotoWithUrl; onRemoved: () => void }) {
  return (
    <div className="photo">
      {photo.url ? <a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt="Before photo" /></a> : <div className="photo-missing" />}
      <button className="photo-remove" aria-label="Remove photo" onClick={() => removePhoto(photo).then(onRemoved)}>×</button>
    </div>
  )
}

function DamageCard({ photo, onChange }: { photo: PhotoWithUrl; onChange: () => void }) {
  const [note, setNote] = useState(photo.note ?? '')

  async function save() {
    if (note === (photo.note ?? '')) return
    await supabase.from('job_photos').update({ note: note || null }).eq('id', photo.id)
    onChange()
  }

  return (
    <section className="card damage">
      {photo.url ? <a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt="Damage photo" /></a> : <div className="photo-missing" />}
      <div className="list-main">
        <label>
          What did you find?
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={save}
            placeholder="Scratch on dresser top, already there before the move" />
        </label>
        <button className="link" onClick={() => removePhoto(photo).then(onChange)}>Remove</button>
      </div>
    </section>
  )
}

async function removePhoto(photo: PhotoWithUrl) {
  if (!confirm('Remove this photo?')) return
  await supabase.from('job_photos').delete().eq('id', photo.id)
  await supabase.storage.from('job-photos').remove([photo.storage_path])
}
