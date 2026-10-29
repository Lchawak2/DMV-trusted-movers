import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SiteFrame from '../components/SiteFrame'
import { telLink, usePageTitle, useSite } from '../lib/site'
import { usePageView } from '../lib/track'
import { FREE_MINUTES, MOVE_RATE, TILES, WEEKEND_FEE } from '../lib/prices'

const dollars = (n: number) => '$' + n.toLocaleString('en-US')

const INCLUDED = [
  'No extra charge for stairs or elevators',
  'No extra charge for paying by card',
  'Free cancellation up to 72 hours before your move',
]

// The public price list, open to anyone at /pricing
export default function Pricing() {
  const { site } = useSite()
  usePageTitle('Moving prices | DMV Trusted Movers')
  usePageView()
  useEffect(() => { window.scrollTo(0, 0) }, [])

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
                {h.extra && <span className="extra">{h.extra}</span>}
              </div>
            ))}
          </div>
          <ul className="price-rules">
            <li><strong>Home moves:</strong> one flat price for 2 movers, the truck and gas, for up to the hours shown.</li>
            <li><strong>Going over your hours?</strong> The first {FREE_MINUTES} minutes are free, then it's {dollars(MOVE_RATE)} an hour for the extra time, by the minute.</li>
            <li><strong>Saturday and Sunday:</strong> home and office moves are {dollars(WEEKEND_FEE)} more. Move Monday to Friday to save.</li>
            <li><strong>You pack, we move.</strong> Please have your boxes packed before we arrive.</li>
            <li><strong>Moving more than 50 miles?</strong> Call us first and we'll price it for you.</li>
            <li><strong>Your price:</strong> fill out our <Link to="/book">quote form</Link> and see your price right away.</li>
          </ul>
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
