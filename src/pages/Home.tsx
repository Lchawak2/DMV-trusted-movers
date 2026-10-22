import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { loadSite, photoUrl, rgb, telLink, type SiteData } from '../lib/site'

const STEPS = [
  { title: 'Tell us about your move', text: 'Fill in a short form with your dates, addresses and a few photos. No account needed.' },
  { title: 'Get your price', text: 'We send you a clear price by text or email. It\'s good for 3 days.' },
  { title: 'Book with a deposit', text: 'Pay a small deposit online to hold your date. Free cancellation up to 72 hours before.' },
  { title: 'Moving day', text: 'Your crew arrives on time, moves you carefully, and you sign off when it\'s done.' },
]

// The public website, shown at the home address to anyone who isn't signed in
export default function Home() {
  const [data, setData] = useState<SiteData | null>(null)
  useEffect(() => { loadSite().then(setData) }, [])

  if (!data) return <div className="center muted">Loading…</div>
  const { site, rating, ratings, review_url } = data
  const licenses = [
    site.usdot && `USDOT ${site.usdot}`,
    site.md_license && `MD license ${site.md_license}`,
    site.insurance && site.insurance,
  ].filter(Boolean)

  return (
    <div className="site" style={{ '--site-main': site.main_color, '--site-accent': site.accent_color } as CSSProperties}>
      <header className="site-bar">
        <div className="site-wrap site-bar-in">
          <span className="site-name">DMV Trusted Movers</span>
          <nav className="site-nav">
            {site.phone && <a href={telLink(site.phone)}>{site.phone}</a>}
            <Link to="/login">Sign in</Link>
          </nav>
        </div>
      </header>

      <section className="site-hero" style={site.hero_photo ? { backgroundImage: `linear-gradient(rgba(${rgb(site.main_color)},.72), rgba(${rgb(site.main_color)},.72)), url(${photoUrl(site.hero_photo)})` } : undefined}>
        <div className="site-wrap">
          <h1>{site.headline}</h1>
          <p>{site.subheadline}</p>
          <div className="site-cta">
            <Link to="/book" className="site-btn gold">Get a free quote</Link>
            {site.phone && <a href={telLink(site.phone)} className="site-btn ghost">Call {site.phone}</a>}
          </div>
          {ratings > 0 && rating !== null && (
            <p className="site-rating">{'★'.repeat(Math.round(rating))} {rating} from {ratings} {ratings === 1 ? 'customer' : 'customers'}</p>
          )}
        </div>
      </section>

      <section className="site-sec">
        <div className="site-wrap">
          <h2>What we do</h2>
          <div className="site-grid">
            {site.services.map((s, i) => (
              <div className="site-card" key={i}>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {site.prices.length > 0 && (
        <section className="site-sec alt">
          <div className="site-wrap">
            <h2>Prices</h2>
            <div className="site-prices">
              {site.prices.map((p, i) => (
                <div className="site-price" key={i}><span>{p.label}</span><strong>{p.price}</strong></div>
              ))}
            </div>
            <p className="muted small">Your exact price depends on your move. Get a free quote to see it.</p>
          </div>
        </section>
      )}

      <section className={site.prices.length > 0 ? 'site-sec' : 'site-sec alt'}>
        <div className="site-wrap">
          <h2>How it works</h2>
          <ol className="site-steps">
            {STEPS.map((s, i) => (
              <li key={i}><h3>{s.title}</h3><p>{s.text}</p></li>
            ))}
          </ol>
          <Link to="/book" className="site-btn gold">Start my quote</Link>
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
        <section className="site-sec alt">
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

      <section className="site-sec">
        <div className="site-wrap site-about">
          <div>
            <h2>About us</h2>
            <p>{site.about}</p>
          </div>
          <div className="site-card">
            <h3>Where we work</h3>
            <p>{site.area}</p>
            <h3>Hours</h3>
            <p>{site.hours}</p>
            <h3>Contact</h3>
            {site.phone && <p><a href={telLink(site.phone)}>{site.phone}</a></p>}
            {site.email && <p><a href={`mailto:${site.email}`}>{site.email}</a></p>}
          </div>
        </div>
      </section>

      <footer className="site-foot">
        <div className="site-wrap">
          <Link to="/book" className="site-btn gold">Get a free quote</Link>
          {licenses.length > 0 && <p>{licenses.join(' · ')}</p>}
          <nav>
            <Link to="/policies#terms">Terms</Link>
            <Link to="/policies#cancellation">Cancellation</Link>
            <Link to="/policies#privacy">Privacy</Link>
            <Link to="/login">Crew and customer sign in</Link>
          </nav>
          <p>© {new Date().getFullYear()} DMV Trusted Movers</p>
        </div>
      </footer>
    </div>
  )
}
