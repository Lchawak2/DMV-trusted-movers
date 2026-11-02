import { counting } from './track'

// Google Ads conversion tracking, so the ad campaign learns which clicks turn into quote requests.
// Loaded from here rather than an inline tag in index.html so the Content-Security-Policy can keep
// blocking inline scripts. Staff browsers are left out, like the Visitors tab.
const ADS_ID = 'AW-18527499733'
const QUOTE_REQUEST = `${ADS_ID}/X2KeCK-U87AdENXrzIJF`

type Gtag = (...args: unknown[]) => void
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag }
}

export function loadAds() {
  if (window.gtag || !counting()) return
  window.dataLayer = window.dataLayer || []
  // gtag.js reads the arguments object itself, so this must stay a plain function
  window.gtag = function gtag() { window.dataLayer!.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', ADS_ID)
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`
  document.head.appendChild(s)
}

// A quote request was saved
export function adsQuoteRequest() {
  window.gtag?.('event', 'conversion', { send_to: QUOTE_REQUEST, value: 1.0, currency: 'USD' })
}
