import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SiteFrame from '../components/SiteFrame'
import { telLink, usePageTitle, useSite } from '../lib/site'
import { usePageView } from '../lib/track'
import { FREE_MINUTES, HOME_MOVES, MOVE_RATE, WEEKEND_FEE } from '../lib/prices'
import { sizeName, t, useLang } from '../lib/lang'

const dollars = (n: number) => '$' + n.toLocaleString('en-US')

const included = () => [
  t('No extra charge for stairs or elevators', 'Sin cargo extra por escaleras o elevadores'),
  t('No extra charge for paying by card', 'Sin cargo extra por pagar con tarjeta'),
  t('Free cancellation up to 72 hours before your move', 'Cancelación gratis hasta 72 horas antes de su mudanza'),
]

// The public price list, open to anyone at /pricing
export default function Pricing() {
  const { site } = useSite()
  useLang()
  usePageTitle(t('Moving prices | DMV Trusted Movers', 'Precios de mudanza | DMV Trusted Movers'))
  usePageView()
  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <SiteFrame site={site}>
      <section className="site-hero short">
        <div className="site-wrap">
          <h1>{t('Our prices', 'Nuestros precios')}</h1>
          <p>{t('Simple and upfront. Fill out our quote form and your price shows up right away, with every part listed.', 'Simples y claros. Llene nuestro formulario y su precio aparece al instante, con cada parte detallada.')}</p>
        </div>
      </section>

      <section className="site-sec">
        <div className="site-wrap">
          <h2>{t('Our prices', 'Nuestros precios')}</h2>
          <div className="price-tiles">
            {HOME_MOVES.map((m) => (
              <div className="price-tile" key={m.size}>
                <span>{sizeName(m.label ?? m.size)}</span>
                <strong>{dollars(m.price)}</strong>
                <span>{t(`up to ${m.hours} hours`, `hasta ${m.hours} horas`)}</span>
                <span className="extra">{t(`+$${MOVE_RATE} each extra hour`, `+$${MOVE_RATE} cada hora extra`)}</span>
              </div>
            ))}
          </div>
          <ul className="price-rules">
            <li><strong>{t('Home moves:', 'Mudanzas de casa:')}</strong> {t('one flat price for 2 movers, the truck and gas, for up to the hours shown.', 'un precio fijo por 2 mudanceros, el camión y la gasolina, hasta las horas indicadas.')}</li>
            <li><strong>{t('Going over your hours?', '¿Se pasa de sus horas?')}</strong> {t(`The first ${FREE_MINUTES} minutes are free, then it's ${dollars(MOVE_RATE)} an hour for the extra time, by the minute.`, `Los primeros ${FREE_MINUTES} minutos son gratis; después, el tiempo extra cuesta ${dollars(MOVE_RATE)} la hora, cobrado por minuto.`)}</li>
            <li><strong>{t('Saturday and Sunday:', 'Sábado y domingo:')}</strong> {t(`home and office moves are ${dollars(WEEKEND_FEE)} more. Move Monday to Friday to save.`, `las mudanzas de casa y oficina cuestan ${dollars(WEEKEND_FEE)} más. Múdese de lunes a viernes para ahorrar.`)}</li>
            <li><strong>{t('You pack, we move.', 'Usted empaca, nosotros movemos.')}</strong> {t('Please have your boxes packed before we arrive.', 'Por favor tenga sus cajas empacadas antes de que lleguemos.')}</li>
            <li><strong>{t('Moving more than 50 miles?', '¿Se muda a más de 50 millas?')}</strong> {t('Call us first and we\'ll price it for you.', 'Llámenos primero y le damos el precio.')}</li>
            <li><strong>{t('Your price:', 'Su precio:')}</strong> {t('fill out our', 'llene nuestro')} <Link to="/book">{t('quote form', 'formulario')}</Link> {t('and see your price right away.', 'y vea su precio al instante.')}</li>
          </ul>
        </div>
      </section>

      <section className="site-sec alt">
        <div className="site-wrap">
          <h2>{t('Always included', 'Siempre incluido')}</h2>
          <ul className="price-included">
            {included().map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      </section>

      <section className="site-sec">
        <div className="site-wrap">
          <h2>{t('How you pay', 'Cómo paga')}</h2>
          <p className="site-lead">{t('Your price shows up as soon as you send the quote form, and you can book it right there. A small deposit holds your date, and you pay the rest when the move is done. If your move turns out bigger than you told us, we\'ll tell you before doing any extra work.',
            'Su precio aparece en cuanto envía el formulario, y puede reservar ahí mismo. Un pequeño depósito aparta su fecha y paga el resto cuando termina la mudanza. Si su mudanza resulta más grande de lo que nos dijo, le avisamos antes de hacer cualquier trabajo extra.')}</p>
          <div className="site-cta">
            <Link to="/book" className="site-btn gold">{t('See my price', 'Ver mi precio')}</Link>
            {site.phone && <a href={telLink(site.phone)} className="site-btn outline">{t('Call', 'Llamar al')} {site.phone}</a>}
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}
