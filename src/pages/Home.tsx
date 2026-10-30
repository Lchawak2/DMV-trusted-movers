import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SiteFrame from '../components/SiteFrame'
import { FREE_MINUTES, HOME_MOVES, MOVE_RATE, SMALL_OFFICE, WEEKEND_FEE } from '../lib/prices'
import { photoUrl, rgb, siteText, telLink, usePageTitle, useSite } from '../lib/site'
import { sizeName, t, useLang } from '../lib/lang'
import { track, usePageView, useScrollDepth } from '../lib/track'

const dollars = (n: number) => `$${n.toLocaleString('en-US')}`
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

// Same truck the instant quote picks (private.instant_price)
const truckFor = (size: string) => (size === '2 bedrooms' || size === '3 bedrooms' ? t('22 ft truck', 'Camión de 22 pies') : t('16 ft truck', 'Camión de 16 pies'))
const SIZES = [
  ...HOME_MOVES.map((m) => ({ type: 'full_move', size: m.size, name: m.label ?? m.size, price: m.price, hours: m.hours })),
  { type: 'office_move', size: 'Small office (1 to 10 people)', name: 'Small office', price: SMALL_OFFICE.price, hours: SMALL_OFFICE.hours },
]

const trust = () => [
  t('Flat price before we start', 'Precio fijo antes de empezar'),
  t('2 careful movers and a truck', '2 mudanceros cuidadosos y un camión'),
  t('See your price right away', 'Vea su precio al instante'),
  t('Free cancellation up to 72 hours', 'Cancelación gratis hasta 72 horas antes'),
]

const why = () => [
  { title: t('Clear, flat prices', 'Precios claros y fijos'), text: t('One price for your size of move, with the truck and gas included. You see it before you book.', 'Un precio según el tamaño de su mudanza, con camión y gasolina incluidos. Lo ve antes de reservar.') },
  { title: t('Careful with your things', 'Cuidamos sus cosas'), text: t('We handle every item with care, from the first box to the last piece of furniture.', 'Tratamos cada cosa con cuidado, desde la primera caja hasta el último mueble.') },
  { title: t('On time, kept posted', 'Puntuales y siempre informado'), text: t('You pick an arrival window, and we keep you posted on moving day.', 'Usted escoge un horario de llegada y lo mantenemos informado el día de la mudanza.') },
  { title: t('Book in minutes', 'Reserve en minutos'), text: t('Answer a few questions, see your price right away, and hold your date with a small deposit.', 'Conteste unas preguntas, vea su precio al instante y aparte su fecha con un pequeño depósito.') },
]

const steps = () => [
  { title: t('Tell us about your move', 'Cuéntenos de su mudanza'), text: t('A short form with your addresses, date and size. No account needed.', 'Un formulario corto con sus direcciones, fecha y tamaño. No necesita cuenta.') },
  { title: t('See your price', 'Vea su precio'), text: t('Your flat price shows up right away, with every part listed.', 'Su precio fijo aparece al instante, con cada parte detallada.') },
  { title: t('Hold your date', 'Aparte su fecha'), text: t('Pay a small deposit online. Free cancellation up to 72 hours before.', 'Pague un pequeño depósito en línea. Cancelación gratis hasta 72 horas antes.') },
  { title: t('Moving day', 'El día de la mudanza'), text: t('Your crew arrives on time, moves you carefully, and you sign off when it\'s done.', 'Su equipo llega a tiempo, hace la mudanza con cuidado y usted firma al terminar.') },
]

const faq = () => [
  {
    q: t('How much does my move cost?', '¿Cuánto cuesta mi mudanza?'),
    a: t(`Home moves are a flat price by size: ${HOME_MOVES.map((m) => `${m.label ?? m.size} ${dollars(m.price)}`).join(', ')}. A small office is ${dollars(SMALL_OFFICE.price)}. Every price includes 2 movers, the truck and gas.`,
      `Las mudanzas de casa tienen un precio fijo según el tamaño: ${HOME_MOVES.map((m) => `${sizeName(m.label ?? m.size)} ${dollars(m.price)}`).join(', ')}. Una oficina pequeña cuesta ${dollars(SMALL_OFFICE.price)}. Cada precio incluye 2 mudanceros, el camión y la gasolina.`),
  },
  {
    q: t('What if my move takes longer?', '¿Y si mi mudanza tarda más?'),
    a: t(`Each price covers a set number of hours. The first ${FREE_MINUTES} minutes past that are free, then it's ${dollars(MOVE_RATE)} an hour for the extra time, by the minute.`,
      `Cada precio cubre un número fijo de horas. Los primeros ${FREE_MINUTES} minutos extra son gratis; después, el tiempo extra cuesta ${dollars(MOVE_RATE)} la hora, cobrado por minuto.`),
  },
  {
    q: t('Do weekend moves cost more?', '¿Las mudanzas en fin de semana cuestan más?'),
    a: t(`Saturday and Sunday home and office moves are ${dollars(WEEKEND_FEE)} more. Move Monday to Friday to save.`,
      `Las mudanzas de casa y oficina en sábado y domingo cuestan ${dollars(WEEKEND_FEE)} más. Múdese de lunes a viernes para ahorrar.`),
  },
  { q: t('Do you pack for me?', '¿Ustedes empacan por mí?'), a: t('You pack your boxes and we do the heavy lifting.', 'Usted empaca sus cajas y nosotros hacemos el trabajo pesado.') },
  { q: t('Can I cancel?', '¿Puedo cancelar?'), a: t('Yes. Cancel up to 72 hours before your move and your deposit comes back to you.', 'Sí. Cancele hasta 72 horas antes de su mudanza y le devolvemos su depósito.') },
  { q: t('Do you move pianos, safes or pool tables?', '¿Mueven pianos, cajas fuertes o mesas de billar?'), a: t('Yes. Pick them on the quote form and we\'ll look over your move and send you a price ourselves.', 'Sí. Márquelos en el formulario y nosotros revisamos su mudanza y le enviamos el precio.') },
  { q: t('How far ahead do I need to book?', '¿Con cuánta anticipación debo reservar?'), a: t('At least 48 hours before your move. Need it sooner? Call us and we\'ll try to fit you in.', 'Al menos 48 horas antes de su mudanza. ¿La necesita antes? Llámenos y trataremos de hacerle espacio.') },
  { q: t('Where do you work?', '¿Dónde trabajan?'), a: t('Washington DC, Maryland and Northern Virginia. Moving more than 50 miles? Call us first.', 'Washington DC, Maryland y el norte de Virginia. ¿Se muda a más de 50 millas? Llámenos primero.') },
]

const areas = () => [
  { name: 'Washington DC', places: [t('All DC neighborhoods', 'Todos los vecindarios de DC')] },
  { name: 'Maryland', places: ['Montgomery County', 'Prince George\'s County', 'Silver Spring', 'Bethesda', 'Rockville'] },
  { name: t('Northern Virginia', 'Norte de Virginia'), places: ['Arlington', 'Alexandria', 'Fairfax'] },
]

// The public website, shown at the home address to anyone who isn't signed in
export default function Home() {
  const { site, rating, ratings, review_url } = useSite()
  const { hash } = useLocation()
  useLang()
  usePageTitle(t('DMV Trusted Movers | Flat-price movers in DC, Maryland and Virginia', 'DMV Trusted Movers | Mudanzas a precio fijo en DC, Maryland y Virginia'))
  usePageView()
  useScrollDepth()
  // Menu links like /#faq: scroll there once the page is up
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])

  return (
    <SiteFrame site={site}>
      <section className="site-hero split" style={site.hero_photo ? { backgroundImage: `linear-gradient(rgba(${rgb(site.main_color)},.8), rgba(${rgb(site.main_color)},.8)), url(${photoUrl(site.hero_photo)})` } : undefined}>
        <div className="site-wrap site-hero-in">
          <div>
            <h1>{siteText(site.headline)}</h1>
            <p>{siteText(site.subheadline)}</p>
            <ul className="site-tags">
              <li>{t('From', 'Desde')} {dollars(HOME_MOVES[0].price)}</li>
              <li>{t('Truck and gas included', 'Camión y gasolina incluidos')}</li>
              <li>{t('Price shown right away', 'Precio al instante')}</li>
            </ul>
            {ratings > 0 && rating !== null && (
              <p className="site-rating">{'★'.repeat(Math.round(rating))} {rating} {t('from', 'de')} {ratings} {ratings === 1 ? t('customer', 'cliente') : t('customers', 'clientes')}</p>
            )}
          </div>
          <QuickQuote phone={site.phone} />
        </div>
      </section>

      <section className="site-trust">
        <div className="site-wrap">
          <ul>{trust().map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </section>

      <section className="site-sec" id="why">
        <div className="site-wrap">
          <h2>{t('Why people choose us', 'Por qué nos escogen')}</h2>
          <div className="site-grid four">
            {why().map((w) => (
              <div className="site-card" key={w.title}><h3>{w.title}</h3><p>{w.text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-sec alt" id="prices">
        <div className="site-wrap">
          <h2>{t('Pick your move', 'Escoja su mudanza')}</h2>
          <p className="site-lead">{t('Every move comes with 2 movers, the truck and gas. Each extra hour is', 'Cada mudanza incluye 2 mudanceros, el camión y la gasolina. Cada hora extra cuesta')} {dollars(MOVE_RATE)}.</p>
          <div className="site-sizes">
            {SIZES.map((s) => (
              <div className="site-size" key={s.size}>
                <span className="site-size-tag">{s.type === 'office_move' ? t('Office', 'Oficina') : t('Home', 'Casa')}</span>
                <h3>{sizeName(s.name)}</h3>
                <strong>{dollars(s.price)}</strong>
                <ul>
                  <li>{t(`Up to ${s.hours} hours`, `Hasta ${s.hours} horas`)}</li>
                  <li>{t('2 movers', '2 mudanceros')}</li>
                  <li>{s.type === 'office_move' ? t('16 ft truck', 'Camión de 16 pies') : truckFor(s.size)}</li>
                </ul>
                <Link to={`/book?type=${s.type}&size=${encodeURIComponent(s.size)}`} className="site-btn gold">{t('Book this move', 'Reservar esta mudanza')}</Link>
              </div>
            ))}
          </div>
          {site.prices.length > 0 && (
            <div className="site-prices">
              {site.prices.map((p, i) => (
                <div className="site-price" key={i}><span>{p.label}</span><strong>{p.price}</strong></div>
              ))}
            </div>
          )}
          <Link to="/pricing" className="site-more">{t('See all our prices', 'Ver todos nuestros precios')}</Link>
        </div>
      </section>

      <section className="site-sec" id="services">
        <div className="site-wrap">
          <h2>{t('What we do', 'Lo que hacemos')}</h2>
          <div className="site-grid">
            {site.services.map((s, i) => (
              <div className="site-card" key={i}><h3>{siteText(s.title)}</h3><p>{siteText(s.text)}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-sec alt">
        <div className="site-wrap">
          <h2>{t('How it works', 'Cómo funciona')}</h2>
          <ol className="site-steps">
            {steps().map((s) => <li key={s.title}><h3>{s.title}</h3><p>{s.text}</p></li>)}
          </ol>
        </div>
      </section>

      {site.gallery.length > 0 && (
        <section className="site-sec">
          <div className="site-wrap">
            <h2>{t('Our work', 'Nuestro trabajo')}</h2>
            <div className="site-gallery">
              {site.gallery.map((p) => <img key={p} src={photoUrl(p)} alt="" loading="lazy" />)}
            </div>
          </div>
        </section>
      )}

      {site.testimonials.length > 0 && (
        <section className="site-sec">
          <div className="site-wrap">
            <h2>{t('What customers say', 'Lo que dicen los clientes')}</h2>
            <div className="site-grid">
              {site.testimonials.map((t, i) => (
                <blockquote className="site-card" key={i}>
                  <p>"{t.text}"</p>
                  <cite>{t.name}</cite>
                </blockquote>
              ))}
            </div>
            {review_url && <a href={review_url} target="_blank" rel="noreferrer" className="site-more">{t('Read our Google reviews', 'Lea nuestras reseñas en Google')}</a>}
          </div>
        </section>
      )}

      <section className="site-promise">
        <div className="site-wrap">
          <h2>{t('Our promise', 'Nuestra promesa')}</h2>
          <p className="site-promise-big">{t('The price you book is the price you pay.', 'El precio que reserva es el precio que paga.')}</p>
          <p>{t(`Your flat price is set before moving day. The only extra is time past your included hours: the first ${FREE_MINUTES} minutes are free, then ${dollars(MOVE_RATE)} an hour. No hidden fees.`,
            `Su precio fijo queda listo antes del día de la mudanza. Lo único extra es el tiempo después de sus horas incluidas: los primeros ${FREE_MINUTES} minutos son gratis, después ${dollars(MOVE_RATE)} la hora. Sin cargos ocultos.`)}</p>
        </div>
      </section>

      <section className="site-sec" id="faq">
        <div className="site-wrap site-faq">
          <h2>{t('Questions people ask', 'Preguntas frecuentes')}</h2>
          {faq().map((f) => (
            <details key={f.q} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) track('faq_open', { q: f.q }) }}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="site-sec alt" id="contact">
        <div className="site-wrap site-about">
          <div>
            <h2>{t('About us', 'Quiénes somos')}</h2>
            <p>{siteText(site.about)}</p>
            <div className="site-areas">
              {areas().map((a) => (
                <div key={a.name}><h3>{a.name}</h3><p>{a.places.join(' · ')}</p></div>
              ))}
            </div>
          </div>
          <div className="site-card">
            <h3>{t('Hours', 'Horario')}</h3>
            <p>{siteText(site.hours)}</p>
            <h3>{t('Contact', 'Contacto')}</h3>
            {site.phone && <p><a href={telLink(site.phone)}>{site.phone}</a></p>}
            {site.email && <p><a href={`mailto:${site.email}`}>{site.email}</a></p>}
          </div>
        </div>
      </section>

      <section className="site-sec" id="jobs">
        <div className="site-wrap site-join">
          <div>
            <h2>{t('Work with us', 'Trabaje con nosotros')}</h2>
            <p>{t('We\'re hiring movers in DC, Maryland and Northern Virginia. No experience needed: you work next to a lead mover.', 'Buscamos mudanceros en DC, Maryland y el norte de Virginia. No necesita experiencia: trabaja junto a un líder.')}</p>
            <ul>
              <li>{t('Pick the days you want to work', 'Escoja los días que quiere trabajar')}</li>
              <li>{t('Paid after every job, plus customer tips', 'Pago después de cada trabajo, más propinas')}</li>
              <li>{t('Everything runs in our app, in English or Spanish', 'Todo se maneja en nuestra app, en inglés o español')}</li>
            </ul>
          </div>
          <Link to="/join" className="site-btn gold">{t('Join our crew', 'Únase al equipo')}</Link>
        </div>
      </section>

      <section className="site-band">
        <div className="site-wrap">
          <h2>{t('Ready to move?', '¿Listo para mudarse?')}</h2>
          <p>{t('See your price in about 2 minutes. No account needed.', 'Vea su precio en unos 2 minutos. No necesita cuenta.')}</p>
          <div className="site-cta">
            <Link to="/book" className="site-btn gold">{t('See my price', 'Ver mi precio')}</Link>
            {site.phone && <a href={telLink(site.phone)} className="site-btn ghost">{t('Call', 'Llamar al')} {site.phone}</a>}
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}

// A short start to the quote form: picks carry over to /book
function QuickQuote({ phone }: { phone: string }) {
  const navigate = useNavigate()
  const [type, setType] = useState('full_move')
  const [size, setSize] = useState('')
  const [date, setDate] = useState('')
  const sizes = SIZES.filter((s) => s.type === type)

  function go(e: FormEvent) {
    e.preventDefault()
    const q = new URLSearchParams({ type })
    if (size) q.set('size', size)
    if (date) q.set('date', date)
    track('quick_quote', { type, size: size || null, has_date: !!date })
    navigate(`/book?${q}`)
  }

  return (
    <form className="site-quote" onSubmit={go}>
      <h2>{t('Get your price', 'Vea su precio')}</h2>
      <div className="segmented wide">
        <button type="button" className={type === 'full_move' ? 'on' : ''} onClick={() => { setType('full_move'); setSize('') }}>{t('Home', 'Casa')}</button>
        <button type="button" className={type === 'office_move' ? 'on' : ''} onClick={() => { setType('office_move'); setSize('') }}>{t('Office', 'Oficina')}</button>
      </div>
      <label>{t('Size', 'Tamaño')}
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">{t('Choose', 'Escoja')}</option>
          {sizes.map((s) => <option key={s.size} value={s.size}>{sizeName(s.name)} · {dollars(s.price)}</option>)}
        </select>
      </label>
      <label>{t('Moving date', 'Fecha de mudanza')}<input type="date" value={date} min={addDays(2)} onChange={(e) => setDate(e.target.value)} /></label>
      <button className="primary block">{t('See my price', 'Ver mi precio')}</button>
      <p className="note">{t('Your price shows on the next screen. No account needed.', 'Su precio aparece en la siguiente pantalla. No necesita cuenta.')}</p>
      <ul className="site-quote-trust">
        <li>{t('Flat price', 'Precio fijo')}</li>
        <li>{t('Free cancellation', 'Cancelación gratis')}</li>
        {phone && <li><a href={telLink(phone)}>{phone}</a></li>}
      </ul>
    </form>
  )
}
