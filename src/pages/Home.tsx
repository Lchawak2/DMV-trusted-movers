import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SiteFrame from '../components/SiteFrame'
import { FREE_MINUTES, HOME_MOVES, MOVE_RATE, SMALL_OFFICE, WEEKEND_FEE } from '../lib/prices'
import { photoUrl, rgb, telLink, usePageTitle, useSite } from '../lib/site'
import { track, usePageView, useScrollDepth } from '../lib/track'

const dollars = (n: number) => `$${n.toLocaleString('en-US')}`
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

// Same truck the instant quote picks (private.instant_price)
const truckFor = (size: string) => (size === '2 bedrooms' || size === '3 bedrooms' ? '22 ft truck' : '16 ft truck')
const SIZES = [
  ...HOME_MOVES.map((m) => ({ type: 'full_move', size: m.size, name: m.label ?? m.size, price: m.price, hours: m.hours })),
  { type: 'office_move', size: 'Small office (1 to 10 people)', name: 'Small office', price: SMALL_OFFICE.price, hours: SMALL_OFFICE.hours },
]

const TRUST = ['Flat price before we start', '2 careful movers and a truck', 'See your price right away', 'Free cancellation up to 72 hours']

const WHY = [
  { title: 'Clear, flat prices', text: 'One price for your size of move, with the truck and gas included. You see it before you book.' },
  { title: 'Careful with your things', text: 'We handle every item with care, from the first box to the last piece of furniture.' },
  { title: 'On time, kept posted', text: 'You pick an arrival window, and we keep you posted on moving day.' },
  { title: 'Book in minutes', text: 'Answer a few questions, see your price right away, and hold your date with a small deposit.' },
]

const STEPS = [
  { title: 'Tell us about your move', text: 'A short form with your addresses, date and size. No account needed.' },
  { title: 'See your price', text: 'Your flat price shows up right away, with every part listed.' },
  { title: 'Hold your date', text: 'Pay a small deposit online. Free cancellation up to 72 hours before.' },
  { title: 'Moving day', text: 'Your crew arrives on time, moves you carefully, and you sign off when it\'s done.' },
]

const FAQ = [
  { q: 'How much does my move cost?', a: `Home moves are a flat price by size: ${HOME_MOVES.map((m) => `${m.label ?? m.size} ${dollars(m.price)}`).join(', ')}. A small office is ${dollars(SMALL_OFFICE.price)}. Every price includes 2 movers, the truck and gas.` },
  { q: 'What if my move takes longer?', a: `Each price covers a set number of hours. The first ${FREE_MINUTES} minutes past that are free, then it's ${dollars(MOVE_RATE)} an hour for the extra time, by the minute.` },
  { q: 'Do weekend moves cost more?', a: `Saturday and Sunday home and office moves are ${dollars(WEEKEND_FEE)} more. Move Monday to Friday to save.` },
  { q: 'Do you pack for me?', a: 'You pack your boxes and we do the heavy lifting.' },
  { q: 'Can I cancel?', a: 'Yes. Cancel up to 72 hours before your move and your deposit comes back to you.' },
  { q: 'Do you move pianos, safes or pool tables?', a: 'Yes. Pick them on the quote form and we\'ll look over your move and send you a price ourselves.' },
  { q: 'How far ahead do I need to book?', a: 'At least 48 hours before your move. Need it sooner? Call us and we\'ll try to fit you in.' },
  { q: 'Where do you work?', a: 'Washington DC, Maryland and Northern Virginia. Moving more than 50 miles? Call us first.' },
]

const AREAS = [
  { name: 'Washington DC', places: ['All DC neighborhoods'] },
  { name: 'Maryland', places: ['Montgomery County', 'Prince George\'s County', 'Silver Spring', 'Bethesda', 'Rockville'] },
  { name: 'Northern Virginia', places: ['Arlington', 'Alexandria', 'Fairfax'] },
]

// The public website, shown at the home address to anyone who isn't signed in
export default function Home() {
  const { site, rating, ratings, review_url } = useSite()
  const { hash } = useLocation()
  usePageTitle('DMV Trusted Movers | Flat-price movers in DC, Maryland and Virginia')
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
            <h1>{site.headline}</h1>
            <p>{site.subheadline}</p>
            <ul className="site-tags">
              <li>From {dollars(HOME_MOVES[0].price)}</li>
              <li>Truck and gas included</li>
              <li>Price shown right away</li>
            </ul>
            {ratings > 0 && rating !== null && (
              <p className="site-rating">{'★'.repeat(Math.round(rating))} {rating} from {ratings} {ratings === 1 ? 'customer' : 'customers'}</p>
            )}
          </div>
          <QuickQuote phone={site.phone} />
        </div>
      </section>

      <section className="site-trust">
        <div className="site-wrap">
          <ul>{TRUST.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      </section>

      <section className="site-sec" id="why">
        <div className="site-wrap">
          <h2>Why people choose us</h2>
          <div className="site-grid four">
            {WHY.map((w) => (
              <div className="site-card" key={w.title}><h3>{w.title}</h3><p>{w.text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-sec alt" id="prices">
        <div className="site-wrap">
          <h2>Pick your move</h2>
          <p className="site-lead">Every move comes with 2 movers, the truck and gas. Each extra hour is {dollars(MOVE_RATE)}.</p>
          <div className="site-sizes">
            {SIZES.map((s) => (
              <div className="site-size" key={s.size}>
                <span className="site-size-tag">{s.type === 'office_move' ? 'Office' : 'Home'}</span>
                <h3>{s.name}</h3>
                <strong>{dollars(s.price)}</strong>
                <ul>
                  <li>Up to {s.hours} hours</li>
                  <li>2 movers</li>
                  <li>{s.type === 'office_move' ? '16 ft truck' : truckFor(s.size)}</li>
                </ul>
                <Link to={`/book?type=${s.type}&size=${encodeURIComponent(s.size)}`} className="site-btn gold">Book this move</Link>
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
          <Link to="/pricing" className="site-more">See all our prices</Link>
        </div>
      </section>

      <section className="site-sec" id="services">
        <div className="site-wrap">
          <h2>What we do</h2>
          <div className="site-grid">
            {site.services.map((s, i) => (
              <div className="site-card" key={i}><h3>{s.title}</h3><p>{s.text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-sec alt">
        <div className="site-wrap">
          <h2>How it works</h2>
          <ol className="site-steps">
            {STEPS.map((s) => <li key={s.title}><h3>{s.title}</h3><p>{s.text}</p></li>)}
          </ol>
        </div>
      </section>

      {site.gallery.length > 0 && (
        <section className="site-sec">
          <div className="site-wrap">
            <h2>Our work</h2>
            <div className="site-gallery">
              {site.gallery.map((p) => <img key={p} src={photoUrl(p)} alt="" loading="lazy" />)}
            </div>
          </div>
        </section>
      )}

      {site.testimonials.length > 0 && (
        <section className="site-sec">
          <div className="site-wrap">
            <h2>What customers say</h2>
            <div className="site-grid">
              {site.testimonials.map((t, i) => (
                <blockquote className="site-card" key={i}>
                  <p>"{t.text}"</p>
                  <cite>{t.name}</cite>
                </blockquote>
              ))}
            </div>
            {review_url && <a href={review_url} target="_blank" rel="noreferrer" className="site-more">Read our Google reviews</a>}
          </div>
        </section>
      )}

      <section className="site-promise">
        <div className="site-wrap">
          <h2>Our promise</h2>
          <p className="site-promise-big">The price you book is the price you pay.</p>
          <p>Your flat price is set before moving day. The only extra is time past your included hours: the first {FREE_MINUTES} minutes are free, then {dollars(MOVE_RATE)} an hour. No hidden fees.</p>
        </div>
      </section>

      <section className="site-sec" id="faq">
        <div className="site-wrap site-faq">
          <h2>Questions people ask</h2>
          {FAQ.map((f) => (
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
            <h2>About us</h2>
            <p>{site.about}</p>
            <div className="site-areas">
              {AREAS.map((a) => (
                <div key={a.name}><h3>{a.name}</h3><p>{a.places.join(' · ')}</p></div>
              ))}
            </div>
          </div>
          <div className="site-card">
            <h3>Hours</h3>
            <p>{site.hours}</p>
            <h3>Contact</h3>
            {site.phone && <p><a href={telLink(site.phone)}>{site.phone}</a></p>}
            {site.email && <p><a href={`mailto:${site.email}`}>{site.email}</a></p>}
          </div>
        </div>
      </section>

      <section className="site-band">
        <div className="site-wrap">
          <h2>Ready to move?</h2>
          <p>See your price in about 2 minutes. No account needed.</p>
          <div className="site-cta">
            <Link to="/book" className="site-btn gold">See my price</Link>
            {site.phone && <a href={telLink(site.phone)} className="site-btn ghost">Call {site.phone}</a>}
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
      <h2>Get your price</h2>
      <div className="segmented wide">
        <button type="button" className={type === 'full_move' ? 'on' : ''} onClick={() => { setType('full_move'); setSize('') }}>Home</button>
        <button type="button" className={type === 'office_move' ? 'on' : ''} onClick={() => { setType('office_move'); setSize('') }}>Office</button>
      </div>
      <label>Size
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">Choose</option>
          {sizes.map((s) => <option key={s.size} value={s.size}>{s.name} · {dollars(s.price)}</option>)}
        </select>
      </label>
      <label>Moving date<input type="date" value={date} min={addDays(2)} onChange={(e) => setDate(e.target.value)} /></label>
      <button className="primary block">See my price</button>
      <p className="note">Your price shows on the next screen. No account needed.</p>
      <ul className="site-quote-trust">
        <li>Flat price</li>
        <li>Free cancellation</li>
        {phone && <li><a href={telLink(phone)}>{phone}</a></li>}
      </ul>
    </form>
  )
}
