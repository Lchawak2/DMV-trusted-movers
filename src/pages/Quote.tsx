import { useEffect, useState } from 'react'
import PublicPage from '../components/PublicPage'
import { supabase } from '../lib/supabase'
import { money, parseDay } from '../lib/format'
import { JOB_TYPES } from '../lib/types'
import { BOOK_TYPES } from './Book'

type QuoteView = {
  first_name: string
  move_type: string
  home_size: string | null
  preferred_date: string
  from_address: string
  to_address: string | null
  price: number
  deposit: number
  crew_size: number | null
  truck_size: string | null
  est_hours: number | null
  arrival_window: string | null
  note: string | null
  expires_at: string | null
  status: 'sent' | 'accepted' | 'expired' | 'superseded'
  deposit_paid: boolean
  deposit_refunded: boolean
  job_status: string | null
  free_cancel_until: string | null
  started: boolean | null
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

// The customer's quote, opened from the link in our text or email
export default function Quote({ token }: { token: string }) {
  const [q, setQ] = useState<QuoteView | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [cancelNote, setCancelNote] = useState<string | null>(null)
  const returning = new URLSearchParams(location.search).has('paid')

  async function load() {
    const { data } = await supabase.rpc('get_quote', { p_token: token })
    setQ((data as QuoteView | null) ?? null)
  }

  useEffect(() => {
    // Coming back from Stripe: check the payment, which books the move, then show the result
    if (returning) {
      setBusy(true)
      supabase.functions.invoke('deposit', { body: { action: 'confirm', token } })
        .finally(() => { setBusy(false); load() })
    } else {
      load()
    }
  }, [token])

  async function pay() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('deposit', { body: { action: 'start', token } })
    const message = error ? await errorText(error) : data?.error
    if (message) { setBusy(false); return setError(message) }
    if (data?.paid) { setBusy(false); return load() }
    location.href = data.url
  }

  async function cancel() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('deposit', { body: { action: 'cancel', token } })
    const message = error ? await errorText(error, 'We could not cancel online. Please call or text us.') : data?.error
    setBusy(false)
    if (message) return setError(message)
    setAsking(false)
    setCancelNote(data.refund_failed
      ? "We'll refund your deposit by hand in the next day or two."
      : data.refunded > 0 ? `Your ${money(data.refunded)} deposit is on its way back to your card. Banks take 5 to 10 days to show it.` : null)
    load()
  }

  if (q === undefined || (busy && returning)) {
    return <PublicPage sub="Your quote"><p className="muted center">{returning ? 'Checking your payment…' : 'Loading…'}</p></PublicPage>
  }
  if (q === null) {
    return <PublicPage sub="Your quote"><p className="muted center">This quote link isn't valid. Please reply to our text and we'll send it again.</p></PublicPage>
  }

  const date = parseDay(q.preferred_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const cancelled = q.job_status === 'cancelled'
  const booked = q.status === 'accepted' && !cancelled
  const free = !!q.free_cancel_until && new Date(q.free_cancel_until) > new Date()

  return (
    <PublicPage sub={cancelled ? 'Booking cancelled' : booked ? 'Booking confirmed' : `Quote for ${q.first_name}`}>
      {cancelled ? (
        <section className="card center">
          <h2>Your move is cancelled</h2>
          <p>{date}</p>
          {cancelNote && <p className="note">{cancelNote}</p>}
          {!cancelNote && q.deposit_refunded && <p className="note">Your deposit was refunded to your card.</p>}
          {!cancelNote && q.deposit_paid && <p className="note">Questions about your deposit? Reply to our text.</p>}
          <p className="note">Want to book again? Reply to our text and we'll send a new quote.</p>
        </section>
      ) : booked ? (
        <section className="card center">
          <div className="done-mark">✓</div>
          <h2>You're booked</h2>
          <p>{date}{q.arrival_window ? ` · ${q.arrival_window}` : ''}</p>
          {q.deposit_paid && <p className="note">Deposit of {money(q.deposit)} paid. The balance of {money(q.price - q.deposit)} is due after the move.</p>}
        </section>
      ) : (
        <div className="quote-price">
          <div className="muted small">Your price</div>
          <div className="quote-amount">{money(q.price)}</div>
          {q.status === 'sent' && q.expires_at && <div className="muted small">Good until {longDate(q.expires_at)}</div>}
        </div>
      )}

      <section className="card">
        <h3>{booked ? 'Your move' : 'What you get'}</h3>
        <ul className="list">
          <li><span>Service</span><span>{BOOK_TYPES[q.move_type] ?? JOB_TYPES[q.move_type] ?? q.move_type}{q.home_size ? `, ${q.home_size}` : ''}</span></li>
          <li><span>Date</span><span>{date}</span></li>
          {q.arrival_window && <li><span>Crew arrives</span><span>{q.arrival_window}</span></li>}
          {q.crew_size && <li><span>Movers</span><span>{q.crew_size}, with a lead mover</span></li>}
          {q.truck_size && <li><span>Truck</span><span>{q.truck_size}, fuel included</span></li>}
          {q.est_hours && <li><span>Time</span><span>About {q.est_hours} hours</span></li>}
          <li className="stack"><strong>{q.to_address ? 'From' : 'Address'}</strong><span>{q.from_address}</span></li>
          {q.to_address && <li className="stack"><strong>To</strong><span>{q.to_address}</span></li>}
        </ul>
        {q.note && <p className="note">{q.note}</p>}
      </section>

      {booked && (
        <section className="card">
          <h3>What happens next</h3>
          <ol className="steps-plain">
            <li>We'll remind you the day before.</li>
            <li>Book the elevator and save a parking spot for the truck if you can.</li>
            <li>Your lead mover walks through with you, and you sign off at the end.</li>
            <li>Pay the balance when the move is done.</li>
          </ol>
        </section>
      )}

      {booked && q.job_status && !q.started && (
        <section className="card form">
          <h3>Need to change or cancel?</h3>
          <p className="note">To move to a different date, reply to our text or email and we'll find a new time.</p>
          {!asking ? (
            <button className="secondary" onClick={() => setAsking(true)}>Cancel my move</button>
          ) : (
            <>
              <p>
                {free
                  ? q.deposit_paid ? `You're more than 72 hours out, so your ${money(q.deposit)} deposit will be refunded to your card.` : "You're more than 72 hours out, so there's no charge."
                  : q.deposit_paid ? `Your move is less than 72 hours away, so the ${money(q.deposit)} deposit is kept.` : 'Your move is less than 72 hours away.'}
              </p>
              {error && <p className="warn">{error}</p>}
              <button className="danger" disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Yes, cancel my move'}</button>
              <button className="link" onClick={() => { setAsking(false); setError(null) }}>Keep my booking</button>
            </>
          )}
        </section>
      )}

      {q.status === 'sent' && (
        <section className="card form">
          {q.deposit > 0 ? (
            <>
              <h3>Pay a deposit to book</h3>
              <ul className="list">
                <li><strong>Deposit now</strong><strong>{money(q.deposit)}</strong></li>
                <li><span>Balance after the move</span><span>{money(q.price - q.deposit)}</span></li>
              </ul>
              {error && <p className="warn">{error}</p>}
              <button className="primary" disabled={busy} onClick={pay}>{busy ? 'Opening payment…' : `Pay ${money(q.deposit)} and book`}</button>
              <p className="note">You'll pay securely with Stripe. Free cancellation up to 72 hours before your move. After that the deposit is kept.</p>
            </>
          ) : (
            <p>To book, just reply to our text or email and say yes.</p>
          )}
        </section>
      )}
      {q.status === 'expired' && <p className="note center-text">This quote has expired. Reply to our text and we'll send a fresh one.</p>}
      {q.status === 'superseded' && <p className="note center-text">We sent you a newer quote. Please use the latest link.</p>}
    </PublicPage>
  )
}

// supabase-js hides the function's message inside the response
async function errorText(error: unknown, fallback = 'Payment could not be started. Please try again.'): Promise<string> {
  const ctx = (error as { context?: Response }).context
  try {
    const body = await ctx?.json()
    if (body?.error) return body.error
  } catch { /* not JSON */ }
  return fallback
}
