import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { money, smsLink } from '../../lib/format'
import SendText from '../../components/SendText'
import type { Job } from '../../lib/types'

// The booking confirmation as a text the admin sends from their own phone
// (the same details as the automatic email after the deposit, in the customer's language)
type Info = { name: string; phone: string | null; es: boolean; price: number; deposit: number; link: string }

const SIZES_ES: Record<string, string> = {
  Studio: 'estudio', '1 bedroom': '1 habitación', '2 bedrooms': '2 habitaciones', '3 bedrooms': '3 habitaciones',
}
const TZ = 'America/New_York'

function clock(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// 72 hours before the arrival time, New York time (same rule as the booking link)
function freeCancelUntil(day: string, start: string | null): Date {
  const [y, mo, d] = day.split('-').map(Number)
  const [h, mi] = (start ?? '08:00').split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const ny = new Date(new Date(guess).toLocaleString('en-US', { timeZone: TZ }))
  const utc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess + (utc.getTime() - ny.getTime()) - 72 * 3600 * 1000)
}

export function bookingText(job: Pick<Job, 'job_date' | 'window_start' | 'window_end' | 'home_size' | 'from_address' | 'to_address'>, i: Info) {
  const locale = i.es ? 'es-US' : 'en-US'
  const date = new Date(`${job.job_date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
  const until = freeCancelUntil(job.job_date, job.window_start)
  const untilText = `${until.toLocaleDateString(locale, { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' })}, ${until.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}`
  const arrive = job.window_start ? (job.window_end ? `${clock(job.window_start)} ${i.es ? 'a' : 'to'} ${clock(job.window_end)}` : clock(job.window_start)) : null
  const balance = Math.max(i.price - i.deposit, 0)
  const size = job.home_size ? (i.es ? SIZES_ES[job.home_size] ?? job.home_size : job.home_size) : null
  const lines = i.es
    ? [
        `Hola ${i.name}, ¡gracias por reservar con DMV Trusted Movers! Su mudanza está confirmada.`,
        '',
        `Fecha: ${date}`,
        arrive && `Llegada: ${arrive}`,
        `${job.to_address ? 'Desde' : 'Dirección'}: ${job.from_address}`,
        job.to_address && `Hasta: ${job.to_address}`,
        size && `Tamaño: ${size}`,
        '',
        `Precio total: ${money(i.price)}`,
        `Depósito pagado: ${money(i.deposit)}`,
        `Saldo después de la mudanza: ${money(balance)}`,
        '',
        `Cancele gratis hasta el ${untilText} y su depósito se devuelve a su tarjeta. Después de eso el depósito no se devuelve.`,
        `Para cancelar o cambiar la fecha: ${i.link}`,
      ]
    : [
        `Hi ${i.name}, thank you for booking with DMV Trusted Movers! Your move is confirmed.`,
        '',
        `Date: ${date}`,
        arrive && `Arrival: ${arrive}`,
        `${job.to_address ? 'From' : 'Address'}: ${job.from_address}`,
        job.to_address && `To: ${job.to_address}`,
        size && `Size: ${size}`,
        '',
        `Total price: ${money(i.price)}`,
        `Deposit paid: ${money(i.deposit)}`,
        `Balance after the move: ${money(balance)}`,
        '',
        `Free cancellation until ${untilText}, and your deposit goes back to your card. After that the deposit is kept.`,
        `To cancel or change your date: ${i.link}`,
      ]
  return lines.filter((l): l is string => typeof l === 'string').join('\n')
}

export default function BookingText({ job }: { job: Job }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!job.quote_id) return
    Promise.all([
      supabase.from('quotes').select('token, price, move_requests(customers(full_name, phone, language))').eq('id', job.quote_id).maybeSingle(),
      supabase.from('payments').select('amount').eq('quote_id', job.quote_id).eq('kind', 'deposit').eq('status', 'paid'),
    ]).then(([q, p]) => {
      if (!q.data) return
      const c = (q.data.move_requests as unknown as { customers: { full_name: string; phone: string | null; language: string | null } | null } | null)?.customers
      setInfo({
        name: c?.full_name.split(' ')[0] ?? '', phone: c?.phone ?? null, es: c?.language === 'es',
        price: Number(q.data.price), deposit: (p.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
        link: `${location.origin}/quote/${q.data.token}`,
      })
    })
  }, [job.quote_id])

  if (!info) return null
  const text = bookingText(job, info)
  return (
    <section className="card">
      <h3>Booking confirmation text</h3>
      <p className="muted small">The customer already got this by email. Send it as a text too{info.es ? ' (in Spanish, their language)' : ''}.</p>
      <pre className="notes" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{text}</pre>
      {info.phone && <SendText to={info.phone} body={text} label="Text it from the business number" />}
      <div className="row">
        {info.phone && <a className="primary small-btn" href={smsLink(info.phone, text)}>Text confirmation</a>}
        <button className="secondary small-btn" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true) }}>{copied ? 'Copied' : 'Copy message'}</button>
      </div>
      <p className="muted small">{info.phone ? 'Texting opens your phone\'s messages app with the message filled in. On a computer, copy it and send it from your phone or Google Voice.' : 'No phone number on file. Copy the message and send it another way.'}</p>
    </section>
  )
}
