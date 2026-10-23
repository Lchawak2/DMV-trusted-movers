import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SiteFrame from '../components/SiteFrame'
import { loadSite, telLink, type SiteData } from '../lib/site'
import {
  CREW_RATES, EXTRA_MOVER, INCLUDED_MILES, MIN_HOURS, OTHER_PRICES, PER_MILE, TRAVEL_FEE, typicalMoves,
} from '../lib/prices'

const dollars = (n: number) => '$' + n.toLocaleString('en-US')

const INCLUDED = [
  'The truck and gas',
  'Blankets, tape and plastic wrap to protect your things',
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
          <p>Simple and upfront. You see your full price before you book.</p>
        </div>
      </section>

      <section className="site-sec">
        <div className="site-wrap">
          <h2>Movers and a truck, by the hour</h2>
          <div className="price-tiles">
            {CREW_RATES.map((r) => (
              <div className="price-tile" key={r.movers}>
                <span>{r.movers} movers + truck</span>
                <strong>{dollars(r.rate)}</strong>
                <span>an hour</span>
              </div>
            ))}
          </div>
          <ul className="price-rules">
            <li><strong>{MIN_HOURS} hour minimum.</strong></li>
            <li><strong>{dollars(TRAVEL_FEE)} travel fee, one time.</strong> It covers driving the truck to you and back, up to {INCLUDED_MILES} miles. After that it's {dollars(PER_MILE)} a mile.</li>
            {CREW_RATES.length > 1 && <li><strong>Need more hands?</strong> Each extra mover is {dollars(EXTRA_MOVER)} more an hour.</li>}
          </ul>
        </div>
      </section>

      <section className="site-sec alt">
        <div className="site-wrap">
          <h2>What most moves cost</h2>
          <div className="site-prices wide">
            {typicalMoves().map((m) => (
              <div className="site-price" key={m.name}>
                <span>{m.name}<small>{m.movers} movers, about {m.hours} hours</small></span>
                <strong>about {dollars(m.price)}</strong>
              </div>
            ))}
          </div>
          <p className="muted small">These include the travel fee. Your price depends on how much you have and how far you're going. Bigger homes and offices get a free custom quote.</p>
        </div>
      </section>

      <section className="site-sec">
        <div className="site-wrap">
          <h2>Small jobs and other help</h2>
          <div className="site-prices wide">
            {OTHER_PRICES.map((p) => (
              <div className="site-price" key={p.name}>
                <span>{p.name}<small>{p.detail}</small></span>
                <strong>{p.price}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-sec alt">
        <div className="site-wrap">
          <h2>Always included</h2>
          <ul className="price-included">
            {INCLUDED.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </section>

      <section className="site-sec">
        <div className="site-wrap">
          <h2>How you pay</h2>
          <p className="site-lead">Your quote shows one total price. A small deposit holds your date, and you pay the rest when the move is done. If your move turns out bigger than you told us, we'll tell you before doing any extra work.</p>
          <div className="site-cta">
            <Link to="/book" className="site-btn gold">Get my free quote</Link>
            {site.phone && <a href={telLink(site.phone)} className="site-btn outline">Call {site.phone}</a>}
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}
