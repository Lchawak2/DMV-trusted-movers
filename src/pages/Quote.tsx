import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import PublicPage from '../components/PublicPage'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { track, usePageView } from '../lib/track'
import { money, parseDay } from '../lib/format'
import { JOB_TYPES } from '../lib/types'
import { BOOK_TYPES, es } from './Book'
import { locale, sizeName, t, useLang } from '../lib/lang'

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

const longDay = (day: string) => parseDay(day).toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })
const longDate = (iso: string) => new Date(iso).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' })
// "16 ft" → "16 pies"
const truckName = (size: string) => t(size, size.replace(/(\d+)\s*ft\b/, '$1 pies'))
// Time the crew's clock added on the day ("Extra time: 1 hr 15 min"); other extras are typed by the crew
const extraName = (title: string) => t(title, title.replace(/^Extra time:/, 'Tiempo extra:').replace(/(\d+) hr\b/, '$1 h'))

// The customer's quote, opened from the link in our text or email
export default function Quote({ token }: { token: string }) {
  usePageView()
  useLang()
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
    const message = error ? await errorText(error, t('We could not cancel online. Please call or text us.', 'No pudimos cancelar en línea. Por favor llámenos o envíenos un mensaje.')) : data?.error
    setBusy(false)
    if (message) return setError(message)
    setAsking(false)
    setCancelNote(data.refund_failed
      ? t("We'll refund your deposit by hand in the next day or two.", 'Le devolveremos su depósito a mano en uno o dos días.')
      : data.refunded > 0 ? t(`Your ${money(data.refunded)} deposit is on its way back to your card. Banks take 5 to 10 days to show it.`, `Su depósito de ${money(data.refunded)} va de regreso a su tarjeta. Los bancos tardan de 5 a 10 días en mostrarlo.`) : null)
    load()
  }

  // Before paying: "No thanks" closes the quote
  async function closeQuote() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('cancel_open_quote', { p_token: token })
    setBusy(false)
    if (error || !data) return setError(t("We couldn't cancel this online. Please call or text us.", 'No pudimos cancelar esto en línea. Por favor llámenos o envíenos un mensaje.'))
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
    return <PublicPage sub={t('Your quote', 'Su cotización')} langSwitch><p className="muted center">{returning ? t('Checking your payment…', 'Revisando su pago…') : t('Loading…', 'Cargando…')}</p></PublicPage>
  }
  if (q === null) {
    return <PublicPage sub={t('Your quote', 'Su cotización')} langSwitch><p className="muted center">{t('This quote link isn\'t valid. Please reply to our text and we\'ll send it again.', 'Este enlace no es válido. Responda a nuestro mensaje y se lo enviamos otra vez.')}</p></PublicPage>
  }

  if (closed) {
    return (
      <PublicPage sub={t('Quote cancelled', 'Cotización cancelada')} langSwitch>
        <section className="card center">
          <h2>{t('No problem, it\'s cancelled', 'Listo, quedó cancelada')}</h2>
          <p>{t('Nothing was charged.', 'No se cobró nada.')}</p>
          <Link to="/book" className="primary">{t('Get a new price', 'Pedir un nuevo precio')}</Link>
        </section>
      </PublicPage>
    )
  }

  const date = longDay(q.preferred_date)
  const cancelled = q.job_status === 'cancelled'
  const booked = q.status === 'accepted' && !cancelled
  const free = !!q.free_cancel_until && new Date(q.free_cancel_until) > new Date()

  return (
    <PublicPage sub={cancelled ? t('Booking cancelled', 'Reserva cancelada') : booked ? t('Booking confirmed', 'Reserva confirmada') : t(`Quote for ${q.first_name}`, `Cotización para ${q.first_name}`)} langSwitch>
      {cancelled ? (
        <section className="card center">
          <h2>{t('Your move is cancelled', 'Su mudanza está cancelada')}</h2>
          <p>{date}</p>
          {cancelNote && <p className="note">{cancelNote}</p>}
          {!cancelNote && q.deposit_refunded && <p className="note">{t('Your deposit was refunded to your card.', 'Su depósito se devolvió a su tarjeta.')}</p>}
          {!cancelNote && q.deposit_paid && <p className="note">{t('Questions about your deposit? Reply to our text.', '¿Preguntas sobre su depósito? Responda a nuestro mensaje.')}</p>}
          <p className="note">{t('Want to book again? Reply to our text and we\'ll send a new quote.', '¿Quiere reservar otra vez? Responda a nuestro mensaje y le enviamos una nueva cotización.')}</p>
        </section>
      ) : booked ? (
        <section className="card center">
          <div className="done-mark">✓</div>
          <h2>{t('You\'re booked', 'Su mudanza está reservada')}</h2>
          <p>{date}{q.arrival_window ? ` · ${es(q.arrival_window)}` : ''}</p>
          {q.deposit_paid && <p className="note">{t(`Deposit of ${money(q.deposit)} paid. The balance of ${money(q.price - q.deposit)} is due after the move.`, `Depósito de ${money(q.deposit)} pagado. El saldo de ${money(q.price - q.deposit)} se paga después de la mudanza.`)}</p>}
        </section>
      ) : (
        <div className="quote-price">
          <div className="muted small">{t('Your price', 'Su precio')}</div>
          <div className="quote-amount">{money(q.price)}</div>
          {q.status === 'sent' && q.expires_at && <div className="muted small">{t('Good until', 'Válido hasta el')} {longDate(q.expires_at)}</div>}
        </div>
      )}

      <section className="card">
        <h3>{booked ? t('Your move', 'Su mudanza') : t('What you get', 'Lo que incluye')}</h3>
        <ul className="list">
          <li><span>{t('Service', 'Servicio')}</span><span>{BOOK_TYPES[q.move_type] ? es(BOOK_TYPES[q.move_type]) : JOB_TYPES[q.move_type] ?? q.move_type}{q.home_size ? `, ${sizeName(q.home_size)}` : ''}</span></li>
          <li><span>{t('Date', 'Fecha')}</span><span>{date}</span></li>
          {q.arrival_window && <li><span>{t('Crew arrives', 'Llegada del equipo')}</span><span>{es(q.arrival_window)}</span></li>}
          {q.crew_size && <li><span>{t('Movers', 'Mudanceros')}</span><span>{t(`${q.crew_size}, with a lead mover`, `${q.crew_size}, con un líder`)}</span></li>}
          {q.truck_size && <li><span>{t('Truck', 'Camión')}</span><span>{truckName(q.truck_size)}{t(', fuel included', ', gasolina incluida')}</span></li>}
          {q.est_hours && <li><span>{t('Time included', 'Tiempo incluido')}</span><span>{t(`Up to ${q.est_hours} hours`, `Hasta ${q.est_hours} horas`)}</span></li>}
          <li className="stack"><strong>{q.to_address ? t('From', 'Desde') : t('Address', 'Dirección')}</strong><span>{q.from_address}</span></li>
          {q.to_address && <li className="stack"><strong>{t('To', 'Hasta')}</strong><span>{q.to_address}</span></li>}
        </ul>
        {q.note && <p className="note">{q.note}</p>}
      </section>

      {booked && (
        <section className="card">
          <h3>{t('What happens next', 'Qué sigue')}</h3>
          <ol className="steps-plain">
            <li>{t('We\'ll remind you the day before.', 'Le recordaremos un día antes.')}</li>
            <li>{t('Book the elevator and save a parking spot for the truck if you can.', 'Reserve el elevador y aparte un lugar para estacionar el camión si puede.')}</li>
            <li>{t('Your lead mover walks through with you, and you sign off at the end.', 'Su líder revisa todo con usted y usted firma al final.')}</li>
            <li>{t('Pay the balance when the move is done.', 'Pague el saldo cuando termine la mudanza.')}</li>
          </ol>
        </section>
      )}

      {booked && q.job_status === 'completed' && <RateMove token={token} q={q} onDone={load} />}

      {booked && <SaveMoves token={token} />}

      {booked && q.balance_payable && q.balance_due != null && (
        <section className="card form">
          {q.balance_due > 0 ? (
            <>
              <h3>{t('Pay your balance', 'Pague su saldo')}</h3>
              <ul className="list">
                {(q.extras ?? []).length > 0 && q.move_price != null && <>
                  <li><span>{t('Your move', 'Su mudanza')}</span><span>{money(q.move_price)}</span></li>
                  {q.extras!.map((x, i) => <li key={i}><span>{extraName(x.title)}</span><span>{money(x.amount)}</span></li>)}
                </>}
                <li><span>{t('Move total', 'Total de la mudanza')}</span><span>{money(q.total)}</span></li>
                <li><span>{t('Already paid', 'Ya pagado')}</span><span>{money(Number(q.total) - q.balance_due)}</span></li>
                <li><strong>{t('Left to pay', 'Falta pagar')}</strong><strong>{money(q.balance_due)}</strong></li>
              </ul>
              <TipPicker total={Number(q.total)} tip={tip} onChange={setTip} />
              {error && <p className="warn">{error}</p>}
              <button className="primary" disabled={busy} onClick={payBalance}>{busy ? t('Opening payment…', 'Abriendo el pago…') : t(`Pay ${money(q.balance_due + tip)}`, `Pagar ${money(q.balance_due + tip)}`)}</button>
              <p className="note">{t('You\'ll pay securely with Stripe. The total includes anything added on the day, like extra items or extra time.', 'Pagará de forma segura con Stripe. El total incluye lo que se agregó ese día, como cosas o tiempo extra.')}</p>
            </>
          ) : q.tipped > 0 ? (
            <p className="center-text"><strong>{t('Paid in full.', 'Pagado por completo.')}</strong> {t(`Thank you for the ${money(q.tipped)} tip! It goes to your movers.`, `¡Gracias por la propina de ${money(q.tipped)}! Es para sus mudanceros.`)}</p>
          ) : (
            <>
              <p className="center-text"><strong>{t('Paid in full.', 'Pagado por completo.')}</strong> {t('Thank you for moving with us.', 'Gracias por mudarse con nosotros.')}</p>
              <TipPicker total={Number(q.total)} tip={tip} onChange={setTip} />
              {error && <p className="warn">{error}</p>}
              {tip > 0 && <button className="primary" disabled={busy} onClick={payBalance}>{busy ? t('Opening payment…', 'Abriendo el pago…') : t(`Tip ${money(tip)}`, `Dar ${money(tip)} de propina`)}</button>}
            </>
          )}
        </section>
      )}

      {booked && q.job_status && !q.started && (
        <section className="card form">
          <h3>{t('Need to change or cancel?', '¿Necesita cambiar o cancelar?')}</h3>
          {q.change_status === 'pending' && q.change_date && (
            <p className="note">{t('You asked to move to', 'Pidió cambiar al')} <strong>{longDay(q.change_date)}</strong>. {t(`We'll check our crew and confirm. Your move stays on ${longDay(q.preferred_date)} until then.`, `Revisaremos nuestro equipo y le confirmamos. Mientras tanto su mudanza sigue el ${longDay(q.preferred_date)}.`)}</p>
          )}
          {q.change_status === 'declined' && q.change_date && (
            <p className="warn">{t(`We can't move you to ${longDay(q.change_date)}. Please pick another day, or reply to our text and we'll find one together.`, `No podemos cambiarlo al ${longDay(q.change_date)}. Escoja otro día, o responda a nuestro mensaje y buscamos uno juntos.`)}</p>
          )}
          {moving ? (
            <>
              <label>{t('New date', 'Nueva fecha')}<input type="date" min={q.earliest_change} value={newDate} onChange={(e) => setNewDate(e.target.value)} /></label>
              <label>{t('Anything we should know? (optional)', '¿Algo que debamos saber? (opcional)')}<input value={moveNote} maxLength={500} onChange={(e) => setMoveNote(e.target.value)} placeholder={t('For example: mornings only', 'Por ejemplo: solo en la mañana')} /></label>
              {error && <p className="warn">{error}</p>}
              <button className="primary" disabled={busy || !newDate} onClick={askNewDate}>{busy ? t('Sending…', 'Enviando…') : t('Ask for this date', 'Pedir esta fecha')}</button>
              <button className="link" onClick={() => { setMoving(false); setError(null) }}>{t('Never mind', 'Mejor no')}</button>
              <p className="note">{t('Same price and arrival time. We\'ll confirm the new date with you.', 'Mismo precio y hora de llegada. Le confirmaremos la nueva fecha.')}</p>
            </>
          ) : !asking ? (
            <div className="row">
              <button className="secondary" onClick={() => { setMoving(true); setError(null) }}>{q.change_status === 'pending' ? t('Pick a different date', 'Escoger otra fecha') : t('Change my date', 'Cambiar mi fecha')}</button>
              <button className="secondary" onClick={() => setAsking(true)}>{t('Cancel my move', 'Cancelar mi mudanza')}</button>
            </div>
          ) : (
            <>
              <p>
                {free
                  ? q.deposit_paid ? t(`You're more than 72 hours out, so your ${money(q.deposit)} deposit will be refunded to your card.`, `Faltan más de 72 horas, así que su depósito de ${money(q.deposit)} se devolverá a su tarjeta.`) : t("You're more than 72 hours out, so there's no charge.", 'Faltan más de 72 horas, así que no hay cargo.')
                  : q.deposit_paid ? t(`Your move is less than 72 hours away, so the ${money(q.deposit)} deposit is kept.`, `Faltan menos de 72 horas para su mudanza, así que el depósito de ${money(q.deposit)} no se devuelve.`) : t('Your move is less than 72 hours away.', 'Faltan menos de 72 horas para su mudanza.')}
              </p>
              {error && <p className="warn">{error}</p>}
              <button className="danger" disabled={busy} onClick={cancel}>{busy ? t('Cancelling…', 'Cancelando…') : t('Yes, cancel my move', 'Sí, cancelar mi mudanza')}</button>
              <button className="link" onClick={() => { setAsking(false); setError(null) }}>{t('Keep my booking', 'Conservar mi reserva')}</button>
            </>
          )}
        </section>
      )}

      {q.status === 'sent' && (
        <section className="card form">
          {q.deposit > 0 ? (
            <>
              <h3>{t('Pay a deposit to book', 'Pague un depósito para reservar')}</h3>
              <ul className="list">
                <li><strong>{t('Deposit now', 'Depósito ahora')}</strong><strong>{money(q.deposit)}</strong></li>
                <li><span>{t('Balance after the move', 'Saldo después de la mudanza')}</span><span>{money(q.price - q.deposit)}</span></li>
              </ul>
              {error && <p className="warn">{error}</p>}
              <button className="primary" disabled={busy} onClick={pay}>{busy ? t('Opening payment…', 'Abriendo el pago…') : t(`Pay ${money(q.deposit)} and book`, `Pagar ${money(q.deposit)} y reservar`)}</button>
              <Link to={`/book?change=${token}`} className="secondary">{t('Change my answers', 'Cambiar mis respuestas')}</Link>
              {closing ? (
                <div className="row">
                  <button className="secondary" disabled={busy} onClick={closeQuote}>{busy ? t('Cancelling…', 'Cancelando…') : t('Yes, cancel it', 'Sí, cancelarla')}</button>
                  <button className="link" onClick={() => setClosing(false)}>{t('Keep it', 'Conservarla')}</button>
                </div>
              ) : (
                <button className="link" onClick={() => setClosing(true)}>{t('No thanks, cancel this quote', 'No gracias, cancelar esta cotización')}</button>
              )}
              <p className="note">{t('You\'ll pay securely with Stripe. Free cancellation up to 72 hours before your move. After that the deposit is kept. By paying, you agree to our', 'Pagará de forma segura con Stripe. Cancelación gratis hasta 72 horas antes de su mudanza. Después de eso el depósito no se devuelve. Al pagar, acepta nuestros')} <Link to="/policies#terms">{t('terms', 'términos')}</Link> {t('and', 'y nuestra')} <Link to="/policies#cancellation">{t('cancellation policy', 'política de cancelación')}</Link>.</p>
            </>
          ) : (
            <p>{t('To book, just reply to our text or email and say yes.', 'Para reservar, solo responda a nuestro mensaje o correo y diga que sí.')}</p>
          )}
        </section>
      )}
      {q.status === 'expired' && <p className="note center-text">{t('This quote is closed.', 'Esta cotización ya cerró.')} <Link to="/book">{t('Get a new price', 'Pedir un nuevo precio')}</Link>.</p>}
      {q.status === 'superseded' && <p className="note center-text">{t('We sent you a newer quote. Please use the latest link.', 'Le enviamos una cotización más nueva. Por favor use el enlace más reciente.')}</p>}
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
          <h3>{t('How did we do?', '¿Cómo lo hicimos?')}</h3>
          <div className="star-pick" role="radiogroup" aria-label={t('Rating', 'Calificación')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t(`${n} star${n > 1 ? 's' : ''}`, `${n} estrella${n > 1 ? 's' : ''}`)}
                className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>
            ))}
          </div>
          <label>{rating && rating < 4 ? t('What could we have done better?', '¿Qué pudimos hacer mejor?') : t('Anything to tell us? (optional)', '¿Algo que quiera decirnos? (opcional)')}
            <textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {error && <p className="warn">{error}</p>}
          <button className="primary" disabled={!rating || busy} onClick={submit}>{busy ? t('Sending…', 'Enviando…') : t('Send', 'Enviar')}</button>
        </>
      ) : (
        <>
          <h3>{t('Thanks for your feedback!', '¡Gracias por su opinión!')}</h3>
          <p className="stars center-text">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</p>
          {q.review_url && (
            <>
              <p className="center-text">{t('A Google review helps other families find movers they can trust.', 'Una reseña en Google ayuda a otras familias a encontrar mudanceros de confianza.')}</p>
              <a className="primary block" href={q.review_url} target="_blank" rel="noreferrer">{t('Leave a Google review', 'Dejar una reseña en Google')}</a>
            </>
          )}
          <button className="link" onClick={() => setEditing(true)}>{t('Change my rating', 'Cambiar mi calificación')}</button>
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
      <h3>{t('Save your moves', 'Guarde sus mudanzas')}</h3>
      {state === 'saved' ? (
        <p>{t('Saved. You\'ll find this move under', 'Guardada. Encontrará esta mudanza en')} <Link to="/">{t('My moves', 'Mis mudanzas')}</Link>{t(', and you can book again from there.', ', y puede reservar otra vez desde ahí.')}</p>
      ) : session ? (
        <>
          <p className="muted">{t('Add this move to your account so it\'s easy to find and book again.', 'Agregue esta mudanza a su cuenta para encontrarla y reservar otra vez fácilmente.')}</p>
          {error && <p className="warn">{error}</p>}
          <button className="secondary" disabled={state === 'busy'} onClick={save}>{state === 'busy' ? t('Saving…', 'Guardando…') : t('Add to my account', 'Agregar a mi cuenta')}</button>
        </>
      ) : (
        <>
          <p className="muted">{t('Make an account to see all your moves in one place and book again in a minute.', 'Cree una cuenta para ver todas sus mudanzas en un solo lugar y reservar otra vez en un minuto.')}</p>
          <Link className="secondary" to={`/account?booking=${token}`}>{t('Create an account', 'Crear una cuenta')}</Link>
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
      <strong>{t('Add a tip for your crew?', '¿Quiere dejar propina a su equipo?')}</strong>
      <div className="tip-choices">
        <button type="button" className={!other && tip === 0 ? 'on' : ''} onClick={() => pick(0)}>{t('No tip', 'Sin propina')}</button>
        {choices.map((n) => (
          <button type="button" key={n} className={!other && tip === n ? 'on' : ''} onClick={() => pick(n)}>{money(n)}</button>
        ))}
        <button type="button" className={other ? 'on' : ''} onClick={() => { setOther(true); onChange(0) }}>{t('Other', 'Otra')}</button>
      </div>
      {other && (
        <label>{t('Tip amount $', 'Monto de propina $')}
          <input type="number" min={1} max={1000} step={1} inputMode="decimal" autoFocus
            onChange={(e) => onChange(Math.min(Math.max(Number(e.target.value) || 0, 0), 1000))} />
        </label>
      )}
      <p className="note">{t('Every dollar goes to the movers who did your move, split evenly.', 'Cada dólar es para los mudanceros que hicieron su mudanza, repartido en partes iguales.')}</p>
    </div>
  )
}

// supabase-js hides the function's message inside the response
async function errorText(error: unknown, fallback = t('Payment could not be started. Please try again.', 'No se pudo iniciar el pago. Intente otra vez.')): Promise<string> {
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
