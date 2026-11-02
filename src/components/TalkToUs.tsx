import { smsLink } from '../lib/format'
import { t } from '../lib/lang'
import { telLink, useSite } from '../lib/site'

// A real person to reach, on the customer pages: new companies have no reviews to lean on yet
export default function TalkToUs({ title, message }: { title: string; message: string }) {
  const { site } = useSite()
  if (!site.phone) return null
  return (
    <section className="card">
      <h3>{title}</h3>
      <p className="muted small">{t('Text or call us and a real person on our team answers.', 'Escríbanos o llámenos y le contesta una persona real de nuestro equipo.')}</p>
      <div className="row">
        <a className="secondary" href={smsLink(site.phone, message)}>{t('Text us', 'Escríbanos')}</a>
        <a className="secondary" href={telLink(site.phone)}>{t('Call', 'Llamar')}</a>
      </div>
      <p className="muted small center-text">{site.phone}</p>
    </section>
  )
}
