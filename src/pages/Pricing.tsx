import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SiteFrame from '../components/SiteFrame'
import { loadSite, telLink, type SiteData } from '../lib/site'
import PriceCalculator from '../components/PriceCalculator'
import { HOURLY, MIN_HOURS, SMALL_MIN_HOURS } from '../lib/prices'

const dollars = (n: number) => '$' + n.toLocaleString('en-US')

const INCLUDED = [
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
          <h2>Our prices by the hour</h2>
          <div className="price-tiles">
            {HOURLY.map((h) => (
              <div className="price-tile" key={h.name}>
                <span>{h.name}</span>
                <strong>{dollars(h.rate)}</strong>
                <span>{h.per}</span>
              </div>
            ))}
          </div>
          <ul className="price-rules">
            <li><strong>{MIN_HOURS} hour minimum for moves.</strong> {SMALL_MIN_HOURS} hours for loading help and packing.</li>
            <li><strong>Want the full cost?</strong> <a href="#calculator">Work it out below</a>, truck and supplies included.</li>
          </ul>
        </div>
      </section>

      <section className="site-sec alt" id="calculator">
        <div className="site-wrap">
          <h2>Work out your price</h2>
          <PriceCalculator />
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
