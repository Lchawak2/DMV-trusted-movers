import { Link } from 'react-router-dom'
import type { JobExtra, JobPhoto, JobSignoff } from '../../lib/types'
import { dateTime } from '../../lib/format'

// The four job-day steps, shown on the lead's job screen and the admin's
export default function JobDayChecklist({ jobId, photos, extras, signoff }: {
  jobId: string
  photos: JobPhoto[]
  extras: JobExtra[]
  signoff: JobSignoff | null
}) {
  const before = photos.filter((p) => p.kind === 'before').length
  const damage = photos.filter((p) => p.kind === 'damage').length
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  const steps = [
    {
      to: 'photos?tab=before', title: 'Before photos', done: before > 0,
      detail: before ? `${plural(before, 'photo')} of the home and furniture` : 'Photograph rooms and big furniture before anything moves',
    },
    {
      to: 'photos?tab=damage', title: 'Damage notes', done: damage > 0,
      detail: damage ? `${plural(damage, 'damage photo')} with notes` : 'Optional. Photo and note for any damage found',
    },
    {
      to: 'extras', title: 'Extra items or time', done: extras.length > 0,
      detail: extras.length ? `${extras.length} added: ${extras.map((x) => x.title).join(', ')}` : 'Optional. Anything not on the booking',
    },
    {
      to: 'sign', title: 'Customer signature', done: !!signoff,
      detail: signoff ? `Signed by ${signoff.signer_name}, ${dateTime(signoff.signed_at)}` : 'Customer reviews the job and signs',
    },
  ]

  return (
    <section className="card">
      <h3>Job day</h3>
      <ul className="steps">
        {steps.map((s, i) => (
          <li key={s.to}>
            <Link to={`/jobs/${jobId}/${s.to}`}>
              <span className={`step-dot${s.done ? ' done' : ''}`}>{s.done ? '✓' : i + 1}</span>
              <span className="list-main">
                <strong>{s.title}</strong>
                <span className="muted small step-detail">{s.detail}</span>
              </span>
              <span className="muted">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
