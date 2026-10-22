import { Link } from 'react-router-dom'
import type { JobExtra, JobPhoto, JobSignoff } from '../../lib/types'
import { dateTime } from '../../lib/format'
import { t } from '../../lib/lang'

// The four job-day steps, shown on the lead's job screen and the admin's
export default function JobDayChecklist({ jobId, photos, extras, signoff }: {
  jobId: string
  photos: JobPhoto[]
  extras: JobExtra[]
  signoff: JobSignoff | null
}) {
  const before = photos.filter((p) => p.kind === 'before').length
  const damage = photos.filter((p) => p.kind === 'damage').length
  const photosText = (n: number) => n === 1 ? t('1 photo', '1 foto') : t(`${n} photos`, `${n} fotos`)

  const steps = [
    {
      to: 'photos?tab=before', title: t('Before photos', 'Fotos de antes'), done: before > 0,
      detail: before
        ? t(`${photosText(before)} of the home and furniture`, `${photosText(before)} de la casa y los muebles`)
        : t('Photograph rooms and big furniture before anything moves', 'Toma fotos de los cuartos y muebles grandes antes de mover algo'),
    },
    {
      to: 'photos?tab=damage', title: t('Damage notes', 'Notas de daños'), done: damage > 0,
      detail: damage
        ? t(`${damage} damage ${damage === 1 ? 'photo' : 'photos'} with notes`, `${damage} ${damage === 1 ? 'foto' : 'fotos'} de daños con notas`)
        : t('Optional. Photo and note for any damage found', 'Opcional. Foto y nota de cualquier daño'),
    },
    {
      to: 'extras', title: t('Extra items or time', 'Artículos o tiempo extra'), done: extras.length > 0,
      detail: extras.length
        ? `${t(`${extras.length} added`, `${extras.length} agregados`)}: ${extras.map((x) => x.title).join(', ')}`
        : t('Optional. Anything not on the booking', 'Opcional. Lo que no estaba en la reserva'),
    },
    {
      to: 'sign', title: t('Customer signature', 'Firma del cliente'), done: !!signoff,
      detail: signoff
        ? `${t('Signed by', 'Firmado por')} ${signoff.signer_name}, ${dateTime(signoff.signed_at)}`
        : t('Customer reviews the job and signs', 'El cliente revisa el trabajo y firma'),
    },
  ]

  return (
    <section className="card">
      <h3>{t('Job day', 'Día del trabajo')}</h3>
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
