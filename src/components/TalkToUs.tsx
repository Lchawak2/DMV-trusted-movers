import { smsLink } from '../lib/format'
import { t } from '../lib/lang'
import { mailLink, telLink, useSite } from '../lib/site'

// A real person to reach, on the customer pages: new companies have no reviews to lean on yet
export default function TalkToUs({ title, message }: { title: string; message: string }) {
  const { site } = useSite()
  if (!site.phone && !site.email) return null
  return (
    <section className="card">
      <h3>{title}</h3>
      <p className="muted small">{t('Text, call or email us and a real person on our team answers.', 'Escríbanos, llámenos o mándenos un correo y le contesta una persona real de nuestro equipo.')}</p>
      <div className="row">
        {site.phone && <a className="secondary" href={smsLink(site.phone, message)}>{t('Text us', 'Escríbanos')}</a>}
        {site.phone && <a className="secondary" href={telLink(site.phone)}>{t('Call', 'Llamar')}</a>}
        {site.email && <a className="secondary" href={mailLink(site.email, t('Question about a move', 'Pregunta sobre una mudanza'))}>{t('Email', 'Correo')}</a>}
      </div>
      <p className="muted small center-text">{[site.phone, site.email].filter(Boolean).join(' · ')}</p>
    </section>
  )
}
