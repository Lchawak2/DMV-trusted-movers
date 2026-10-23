import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SiteFrame from '../components/SiteFrame'
import { loadSite, telLink, type SiteData } from '../lib/site'
import { MOVE_RATE, MOVE_START_HOURS, SMALL_MIN_HOURS, TILES, TRIP_FEE, USUAL_MOVES } from '../lib/prices'

const dollars = (n: number) => '$' + n.toLocaleString('en-US')

const INCLUDED = [
  'Moving blankets and plastic wrap to protect your furniture',
  'No extra charge for stairs or elevators',
  'No extra charge for paying by card',
  'Free cancellation up to 72 hours before your move',
]

// The public price list, open to anyone at /pricing
export default function Pricing() {
  const [data, setData] = useState<SiteData | null>(null)
  useEffect(() => { loadSite().then(setData) }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [])

  if (!data) return <div className="center muted">Loading…</div>
  const { site } = data

  return (
    <SiteFrame site={site}>
      <section className="site-hero short">
        <div className="site-wrap">
          <h1>Our prices</h1>
          <p>Simple and upfront. Fill out our quote form and your price shows up right away, with every part listed.</p>
        </div>
      </section>

      <section className="site-sec">
        <div className="site-wrap">
          <h2>Our prices</h2>
          <div className="price-tiles">
            {TILES.map((h) => (
              <div className="price-tile" key={h.name}>
                <span>{h.name}</span>
                <strong>{dollars(h.price)}</strong>
                <span>{h.per}</span>
              </div>
            ))}
          </div>
          <ul className="price-rules">
            <li><strong>Moves:</strong> one flat price covers the truck, gas and the first {MOVE_START_HOURS} hours. Takes longer? {dollars(MOVE_RATE)} an hour, only for the time used.</li>
            <li><strong>You pack, we move.</strong> Please have your boxes packed before we arrive. Want us to pack too? Book Packing.</li>
            <li><strong>Moving more than 50 miles?</strong> Call us first and we'll price it for you.</li>
            <li><strong>Loading help and packing:</strong> {SMALL_MIN_HOURS} hour minimum, plus a {dollars(TRIP_FEE)} trip fee.</li>
            <li><strong>Your price:</strong> fill out our <Link to="/book">quote form</Link> and see your price right away.</li>
          </ul>
        </div>
      </section>

      <section className="site-sec alt">
        <div className="site-wrap">
          <h2>What home moves usually cost</h2>
          <p className="site-lead">With 2 movers and our truck. You only pay for the time we use.</p>
          <div className="site-prices">
            {USUAL_MOVES.map((m) => (
              <div className="site-price" key={m.size}><span>{m.size}, about {m.hours} hours</span><strong>about {dollars(m.price)}</strong></div>
            ))}
            <div className="site-price"><span>3 bedrooms or more</span><strong>we'll price it</strong></div>
          </div>
        </div>
      </section>

      <section className="site-sec">
        <div className="site-wrap">
          <h2>Always included</h2>
          <ul className="price-included">
            {INCLUDED.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </section>

      <section className="site-sec alt">
        <div className="site-wrap">
          <h2>How you pay</h2>
          <p className="site-lead">Your price shows up as soon as you send the quote form, and you can book it right there. A small deposit holds your date, and you pay the rest when the move is done. If your move turns out bigger than you told us, we'll tell you before doing any extra work.</p>
          <div className="site-cta">
            <Link to="/book" className="site-btn gold">See my price</Link>
            {site.phone && <a href={telLink(site.phone)} className="site-btn outline">Call {site.phone}</a>}
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}
