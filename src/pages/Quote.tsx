import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import PublicPage from '../components/PublicPage'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { track, usePageView } from '../lib/track'
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
  total: number | null
  move_price: number | null
  extras: { title: string; amount: number }[] | null
  balance_due: number | null
  balance_payable: boolean | null
  change_date: string | null
  change_status: 'pending' | 'declined' | null
  earliest_change: string
  tipped: number
  rating: number | null
  review_comment: string | null
  review_url: string | null
}

const longDay = (day: string) => parseDay(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

// The customer's quote, opened from the link in our text or email
export default function Quote({ token }: { token: string }) {
  usePageView()
  const [q, setQ] = useState<QuoteView | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [cancelNote, setCancelNote] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [moveNote, setMoveNote] = useState('')
  const [tip, setTip] = useState(0)
  const [closing, setClosing] = useState(false)
  const [closed, setClosed] = useState(false)
  const returning = new URLSearchParams(location.search).has('paid')

  async function load() {
    const { data } = await supabase.rpc('get_quote', { p_token: token })
    const view = (data as QuoteView | null) ?? null
    setQ(view)
    if (view) trackQuote(view)
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
    track('deposit_click')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('deposit', { body: { action: 'start', token } })
    const message = error ? await errorText(error) : data?.error
    if (message) { setBusy(false); return setError(message) }
    if (data?.paid) { setBusy(false); return load() }
    location.href = data.url
  }

  // Pays the balance plus the tip picked, or just the tip once the balance is paid
  async function payBalance() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('deposit', { body: { action: 'balance', token, tip } })
    const message = error ? await errorText(error) : data?.error
    if (message) { setBusy(false); return setError(message) }
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

  // Before paying: "No thanks" closes the quote
  async function closeQuote() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('cancel_open_quote', { p_token: token })
    setBusy(false)
    if (error || !data) return setError("We couldn't cancel this online. Please call or text us.")
    setClosed(true)
    window.scrollTo(0, 0)
  }

  async function askNewDate() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('request_date_change', { p_token: token, p_date: newDate, p_note: moveNote || null })
    setBusy(false)
    if (error) return setError(error.message)
    setMoving(false)
    setNewDate('')
    setMoveNote('')
    load()
  }

  if (q === undefined || (busy && returning)) {
    return <PublicPage sub="Your quote"><p className="muted center">{returning ? 'Checking your payment…' : 'Loading…'}</p></PublicPage>
  }
  if (q === null) {
    return <PublicPage sub="Your quote"><p className="muted center">This quote link isn't valid. Please reply to our text and we'll send it again.</p></PublicPage>
  }

  if (closed) {
    return (
      <PublicPage sub="Quote cancelled">
        <section className="card center">
          <h2>No problem, it's cancelled</h2>
          <p>Nothing was charged.</p>
          <Link to="/book" className="primary">Get a new price</Link>
        </section>
      </PublicPage>
    )
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
          {q.est_hours && <li><span>Time included</span><span>Up to {q.est_hours} hours</span></li>}
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

      {booked && q.job_status === 'completed' && <RateMove token={token} q={q} onDone={load} />}

      {booked && <SaveMoves token={token} />}

      {booked && q.balance_payable && q.balance_due != null && (
        <section className="card form">
          {q.balance_due > 0 ? (
            <>
              <h3>Pay your balance</h3>
              <ul className="list">
                {(q.extras ?? []).length > 0 && q.move_price != null && <>
                  <li><span>Your move</span><span>{money(q.move_price)}</span></li>
                  {q.extras!.map((x, i) => <li key={i}><span>{x.title}</span><span>{money(x.amount)}</span></li>)}
                </>}
                <li><span>Move total</span><span>{money(q.total)}</span></li>
                <li><span>Already paid</span><span>{money(Number(q.total) - q.balance_due)}</span></li>
                <li><strong>Left to pay</strong><strong>{money(q.balance_due)}</strong></li>
              </ul>
              <TipPicker total={Number(q.total)} tip={tip} onChange={setTip} />
              {error && <p className="warn">{error}</p>}
              <button className="primary" disabled={busy} onClick={payBalance}>{busy ? 'Opening payment…' : `Pay ${money(q.balance_due + tip)}`}</button>
              <p className="note">You'll pay securely with Stripe. The total includes anything added on the day, like extra items or extra time.</p>
            </>
          ) : q.tipped > 0 ? (
            <p className="center-text"><strong>Paid in full.</strong> Thank you for the {money(q.tipped)} tip! It goes to your movers.</p>
          ) : (
            <>
              <p className="center-text"><strong>Paid in full.</strong> Thank you for moving with us.</p>
              <TipPicker total={Number(q.total)} tip={tip} onChange={setTip} />
              {error && <p className="warn">{error}</p>}
              {tip > 0 && <button className="primary" disabled={busy} onClick={payBalance}>{busy ? 'Opening payment…' : `Tip ${money(tip)}`}</button>}
            </>
          )}
        </section>
      )}

      {booked && q.job_status && !q.started && (
        <section className="card form">
          <h3>Need to change or cancel?</h3>
          {q.change_status === 'pending' && q.change_date && (
            <p className="note">You asked to move to <strong>{longDay(q.change_date)}</strong>. We'll check our crew and confirm. Your move stays on {longDay(q.preferred_date)} until then.</p>
          )}
          {q.change_status === 'declined' && q.change_date && (
            <p className="warn">We can't move you to {longDay(q.change_date)}. Please pick another day, or reply to our text and we'll find one together.</p>
          )}
          {moving ? (
            <>
              <label>New date<input type="date" min={q.earliest_change} value={newDate} onChange={(e) => setNewDate(e.target.value)} /></label>
              <label>Anything we should know? (optional)<input value={moveNote} maxLength={500} onChange={(e) => setMoveNote(e.target.value)} placeholder="For example: mornings only" /></label>
              {error && <p className="warn">{error}</p>}
              <button className="primary" disabled={busy || !newDate} onClick={askNewDate}>{busy ? 'Sending…' : 'Ask for this date'}</button>
              <button className="link" onClick={() => { setMoving(false); setError(null) }}>Never mind</button>
              <p className="note">Same price and arrival time. We'll confirm the new date with you.</p>
            </>
          ) : !asking ? (
            <div className="row">
              <button className="secondary" onClick={() => { setMoving(true); setError(null) }}>{q.change_status === 'pending' ? 'Pick a different date' : 'Change my date'}</button>
              <button className="secondary" onClick={() => setAsking(true)}>Cancel my move</button>
            </div>
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
              <Link to={`/book?change=${token}`} className="secondary">Change my answers</Link>
              {closing ? (
                <div className="row">
                  <button className="secondary" disabled={busy} onClick={closeQuote}>{busy ? 'Cancelling…' : 'Yes, cancel it'}</button>
                  <button className="link" onClick={() => setClosing(false)}>Keep it</button>
                </div>
              ) : (
                <button className="link" onClick={() => setClosing(true)}>No thanks, cancel this quote</button>
              )}
              <p className="note">You'll pay securely with Stripe. Free cancellation up to 72 hours before your move. After that the deposit is kept. By paying, you agree to our <Link to="/policies#terms">terms</Link> and <Link to="/policies#cancellation">cancellation policy</Link>.</p>
            </>
          ) : (
            <p>To book, just reply to our text or email and say yes.</p>
          )}
        </section>
      )}
      {q.status === 'expired' && <p className="note center-text">This quote is closed. <Link to="/book">Get a new price</Link>.</p>}
      {q.status === 'superseded' && <p className="note center-text">We sent you a newer quote. Please use the latest link.</p>}
    </PublicPage>
  )
}

// After the move: stars and a comment come to us; everyone also gets the Google review link
function RateMove({ token, q, onDone }: { token: string; q: QuoteView; onDone: () => void }) {
  const [rating, setRating] = useState(q.rating ?? 0)
  const [comment, setComment] = useState(q.review_comment ?? '')
  const [editing, setEditing] = useState(!q.rating)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('rate_move', { p_token: token, p_rating: rating, p_comment: comment || null })
    setBusy(false)
    if (error) return setError(error.message)
    setEditing(false)
    onDone()
  }

  return (
    <section className="card form">
      {editing ? (
        <>
          <h3>How did we do?</h3>
          <div className="star-pick" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>
            ))}
          </div>
          <label>{rating && rating < 4 ? 'What could we have done better?' : 'Anything to tell us? (optional)'}
            <textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {error && <p className="warn">{error}</p>}
          <button className="primary" disabled={!rating || busy} onClick={submit}>{busy ? 'Sending…' : 'Send'}</button>
        </>
      ) : (
        <>
          <h3>Thanks for your feedback!</h3>
          <p className="stars center-text">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</p>
          {q.review_url && (
            <>
              <p className="center-text">A Google review helps other families find movers they can trust.</p>
              <a className="primary block" href={q.review_url} target="_blank" rel="noreferrer">Leave a Google review</a>
            </>
          )}
          <button className="link" onClick={() => setEditing(true)}>Change my rating</button>
        </>
      )}
    </section>
  )
}

// Offer to keep this booking in a customer account, so booking again is quick
function SaveMoves({ token }: { token: string }) {
  const { session, account } = useAuth()
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setState('busy'); setError(null)
    const { error } = await supabase.rpc('claim_booking', { p_token: token })
    if (error) { setError(error.message); setState('idle') } else setState('saved')
  }

  if (session && account?.role !== 'client') return null
  return (
    <section className="card">
      <h3>Save your moves</h3>
      {state === 'saved' ? (
        <p>Saved. You'll find this move under <Link to="/">My moves</Link>, and you can book again from there.</p>
      ) : session ? (
        <>
          <p className="muted">Add this move to your account so it's easy to find and book again.</p>
          {error && <p className="warn">{error}</p>}
          <button className="secondary" disabled={state === 'busy'} onClick={save}>{state === 'busy' ? 'Saving…' : 'Add to my account'}</button>
        </>
      ) : (
        <>
          <p className="muted">Make an account to see all your moves in one place and book again in a minute.</p>
          <Link className="secondary" to={`/account?booking=${token}`}>Create an account</Link>
        </>
      )}
    </section>
  )
}

// Tip for the crew: a share of the move total, a custom amount, or none
function TipPicker({ total, tip, onChange }: { total: number; tip: number; onChange: (n: number) => void }) {
  const [other, setOther] = useState(false)
  const choices = total > 0 ? [...new Set([10, 15, 20].map((pct) => Math.max(Math.round((total * pct) / 100), 1)))] : [20, 40, 60]
  const pick = (n: number) => { setOther(false); onChange(n) }
  return (
    <div className="tip-picker">
      <strong>Add a tip for your crew?</strong>
      <div className="tip-choices">
        <button type="button" className={!other && tip === 0 ? 'on' : ''} onClick={() => pick(0)}>No tip</button>
        {choices.map((n) => (
          <button type="button" key={n} className={!other && tip === n ? 'on' : ''} onClick={() => pick(n)}>{money(n)}</button>
        ))}
        <button type="button" className={other ? 'on' : ''} onClick={() => { setOther(true); onChange(0) }}>Other</button>
      </div>
      {other && (
        <label>Tip amount $
          <input type="number" min={1} max={1000} step={1} inputMode="decimal" autoFocus
            onChange={(e) => onChange(Math.min(Math.max(Number(e.target.value) || 0, 0), 1000))} />
        </label>
      )}
      <p className="note">Every dollar goes to the movers who did your move, split evenly.</p>
    </div>
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

// What a visitor opening a booking link saw: an open quote to book, a booked move, or a closed quote
let quoteSeen = ''
function trackQuote(q: QuoteView) {
  const status = q.deposit_paid || q.job_status ? 'booked' : q.status
  if (quoteSeen === status) return
  quoteSeen = status
  track('quote_view', { status })
}
