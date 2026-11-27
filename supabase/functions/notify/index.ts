// Sends the emails waiting in the notifications outbox, through Resend, and texts through Twilio
// once its three secrets are saved (booking confirmation and the day-before reminders).
// The database wakes this function when it queues an email (and every 10 minutes as a safety net).
// Deployed with verify_jwt off: calling it only sends what is already queued, so a caller can't
// choose who gets emailed or what it says.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const LIVE_SITE = 'https://dmvtrustedmovers.org'
// Until a domain is verified in Resend, it only delivers to the Resend account's own email,
// so emails to anyone but the admins wait for NOTIFY_FROM (an address on that verified domain).
const FROM = Deno.env.get('NOTIFY_FROM')
const CAN_EMAIL_OTHERS = !!FROM

const TYPES: Record<string, string> = {
  full_move: 'Home move', office_move: 'Office move', small_move: 'Small move',
  labor_only: 'Loading or unloading', packing: 'Packing', junk_haul: 'Junk haul', other: 'Move',
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

type Email = { to: string[]; subject: string; text: string }
type Text = { sms: string[]; text: string }
// A phone notification to the admins' phones and computers that turned notifications on
type Push = { push: true; title: string; body: string; url: string; tag: string }
type Out = Email | Text | Push

const TWILIO = {
  sid: Deno.env.get('TWILIO_ACCOUNT_SID'), token: Deno.env.get('TWILIO_AUTH_TOKEN'), from: Deno.env.get('TWILIO_FROM'),
}
const CAN_TEXT = !!(TWILIO.sid && TWILIO.token && TWILIO.from)
// US numbers in any format to +1XXXXXXXXXX
function e164(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return null
}
type Note = { id: string; kind: string; ref_id: string }

const money = (n: number | string | null) => `$${Number(n ?? 0).toFixed(2)}`
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
function clock(t: string | null) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const slot = (a: string | null, b: string | null) => (a ? (b ? `${clock(a)} to ${clock(b)}` : clock(a)) : 'time to be set')
// Customers who booked in Spanish get their own emails and texts in Spanish (customers.language)
const dayEs = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-US', { weekday: 'long', month: 'long', day: 'numeric' })
const slotEs = (a: string | null, b: string | null) => (a ? (b ? `${clock(a)} a ${clock(b)}` : clock(a)) : 'hora por confirmar')
const WINDOWS_ES: Record<string, string> = {
  'Morning (8 to 10 AM)': 'Mañana (8 a 10 AM)', 'Midday (11 AM to 1 PM)': 'Mediodía (11 AM a 1 PM)',
  'Afternoon (2 to 4 PM)': 'Tarde (2 a 4 PM)', 'Flexible': 'Flexible',
}
const windowEs = (w: string) => WINDOWS_ES[w] ?? w
const lines = (...l: (string | null | false | undefined)[]) => l.filter((x) => x !== null && x !== false && x !== undefined).join('\n')

async function admins(): Promise<string[]> {
  const { data } = await db.from('accounts').select('email').eq('role', 'admin').eq('active', true).not('email', 'is', null)
  return (data ?? []).map((a) => a.email as string)
}

async function newRequest(id: string): Promise<Email[]> {
  const { data: r } = await db.from('move_requests')
    .select('move_type, home_size, preferred_date, arrival_window, from_address, to_address, notes, special_items, customers(full_name, phone, email)')
    .eq('id', id).maybeSingle()
  if (!r) return []
  const c = r.customers as unknown as { full_name: string; phone: string | null; email: string | null } | null
  return [{
    to: await admins(),
    subject: `New quote request: ${c?.full_name ?? 'Customer'}, ${day(r.preferred_date)}`,
    text: lines(
      `${c?.full_name ?? 'A customer'} asked for a quote.`,
      '',
      `${TYPES[r.move_type] ?? r.move_type}${r.home_size ? `, ${r.home_size}` : ''}`,
      `Date: ${day(r.preferred_date)}${r.arrival_window ? `, ${r.arrival_window.toLowerCase()}` : ''}`,
      `${r.to_address ? 'From' : 'Address'}: ${r.from_address}`,
      r.to_address && `To: ${r.to_address}`,
      r.special_items?.length > 0 && `Special items: ${r.special_items.join(', ')}`,
      r.notes && `Notes: ${r.notes}`,
      c?.phone && `Phone: ${c.phone}`,
      c?.email && `Email: ${c.email}`,
      '',
      `Send a price: ${LIVE_SITE}/requests/${id}`,
    ),
  }]
}

// When free cancellation ends: 72 hours before the arrival time, New York time (same as private.job_start)
function freeCancelUntil(iso: string, start: string | null): Date {
  const [y, mo, d] = iso.split('-').map(Number)
  const [h, mi] = (start ?? '08:00').split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  // New York's offset from UTC on that day (4 or 5 hours)
  const ny = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const utc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess + (utc.getTime() - ny.getTime()) - 72 * 3600 * 1000)
}
const nyWhen = (t: Date, locale: string) =>
  `${t.toLocaleDateString(locale, { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' })}, ${t.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}`
const WINDOW_TIMES: Record<string, [string, string]> = {
  Morning: ['08:00', '10:00'], Midday: ['11:00', '13:00'], Afternoon: ['14:00', '16:00'],
}
const SIZES_ES: Record<string, string> = {
  Studio: 'Estudio', '1 bedroom': '1 habitación', '2 bedrooms': '2 habitaciones', '3 bedrooms': '3 habitaciones',
  'Studio or 1 bedroom': 'Estudio o 1 habitación',
}
const TYPES_ES: Record<string, string> = {
  full_move: 'Mudanza de casa', office_move: 'Mudanza de oficina', small_move: 'Mudanza pequeña',
  labor_only: 'Carga o descarga', packing: 'Empaque', junk_haul: 'Retiro de basura', other: 'Mudanza',
}

async function depositPaid(paymentId: string): Promise<Out[]> {
  const { data: p } = await db.from('payments')
    .select('amount, quotes(id, token, price, est_hours, arrival_window, request_id, jobs(job_date, window_start, window_end, job_type, home_size, from_address, to_address), move_requests(move_type, home_size, preferred_date, arrival_window, from_address, to_address, customers(full_name, email, phone, language)))')
    .eq('id', paymentId).maybeSingle()
  type Job = { job_date: string; window_start: string | null; window_end: string | null; job_type: string; home_size: string | null; from_address: string; to_address: string | null }
  const q = p?.quotes as unknown as {
    id: string; token: string; price: number; est_hours: number | null; arrival_window: string | null; request_id: string
    jobs: Job[] | Job | null
    move_requests: {
      move_type: string; home_size: string | null; preferred_date: string; arrival_window: string | null
      from_address: string; to_address: string | null
      customers: { full_name: string; email: string | null; phone: string | null; language: string } | null
    }
  } | null
  if (!p || !q) return []
  const r = q.move_requests
  const c = r.customers
  // The booked job has the final details; if it isn't saved yet, use the quote and the request
  const job = Array.isArray(q.jobs) ? q.jobs[0] : q.jobs
  const date = job?.job_date ?? r.preferred_date
  const win = q.arrival_window ?? r.arrival_window
  const preset = win ? WINDOW_TIMES[win.split(' ')[0]] : undefined
  const start = job?.window_start ?? preset?.[0] ?? null
  const end = job?.window_end ?? preset?.[1] ?? null
  const from = job?.from_address ?? r.from_address
  const to = job?.to_address ?? r.to_address
  const type = job?.job_type ?? r.move_type
  const size = job?.home_size ?? r.home_size
  const price = Number(q.price)
  const balance = Math.max(price - Number(p.amount), 0)
  const until = freeCancelUntil(date, start)
  const link = `${LIVE_SITE}/quote/${q.token}`
  const first = c?.full_name.split(' ')[0] ?? ''
  const emails: Out[] = [{
    to: await admins(),
    subject: `Deposit paid: ${c?.full_name ?? 'Customer'}, ${money(p.amount)}`,
    text: lines(
      `${c?.full_name ?? 'A customer'} paid a ${money(p.amount)} deposit for ${day(date)}. The move is booked.`,
      'We emailed them the booking confirmation.',
      '',
      c?.phone
        ? `Text them the confirmation too: open this link on your phone and tap "Text confirmation". The message is filled in, so you just press send.`
        : 'They gave no phone number, so there is no text to send.',
      `${LIVE_SITE}/requests/${q.request_id}`,
    ),
  }, {
    push: true,
    title: `Deposit paid: ${c?.full_name ?? 'Customer'}, ${money(p.amount)}`,
    body: c?.phone ? `Move on ${day(date)} is booked. Tap to text them the confirmation.` : `Move on ${day(date)} is booked.`,
    url: `/requests/${q.request_id}`,
    tag: `deposit-${paymentId}`,
  }]
  const es = c?.language === 'es'
  if (CAN_EMAIL_OTHERS && c?.email && es) {
    emails.push({
      to: [c.email],
      subject: `Gracias por reservar: su mudanza es el ${dayEs(date)}`,
      text: lines(
        `Hola ${first}:`,
        '',
        '¡Gracias por reservar con DMV Trusted Movers! Su mudanza está confirmada.',
        '',
        'SU MUDANZA',
        `Servicio: ${TYPES_ES[type] ?? 'Mudanza'}${size ? `, ${SIZES_ES[size] ?? size}` : ''}`,
        `Fecha: ${dayEs(date)}`,
        `Hora de llegada: ${start ? slotEs(start, end) : win ? windowEs(win) : 'hora por confirmar'}`,
        `${to ? 'Desde' : 'Dirección'}: ${from}`,
        to && `Hasta: ${to}`,
        '',
        'PAGO',
        `Precio total: ${money(price)}${q.est_hours ? ` (incluye hasta ${Number(q.est_hours)} horas de trabajo)` : ''}`,
        `Depósito pagado hoy: ${money(p.amount)}`,
        `Saldo después de la mudanza: ${money(balance)}`,
        '',
        'CANCELACIÓN',
        `Cancele gratis hasta el ${nyWhen(until, 'es-US')} (72 horas antes de la llegada). Su depósito se devuelve a su tarjeta de inmediato; los bancos tardan de 5 a 10 días en mostrarlo.`,
        'Si cancela con menos de 72 horas, el depósito no se devuelve.',
        `Para cancelar o cambiar la fecha, abra su reserva y toque "Cancelar mi mudanza" o "Cambiar mi fecha":`,
        link,
        '',
        'Antes del día de la mudanza, si puede, reserve el elevador y guarde un lugar para estacionar el camión. Le enviaremos un recordatorio el día antes.',
        '',
        `Todas las reglas: ${LIVE_SITE}/policies`,
        '¿Preguntas? Responda a este correo.',
        '',
        'DMV Trusted Movers',
      ),
    })
  } else if (CAN_EMAIL_OTHERS && c?.email) {
    emails.push({
      to: [c.email],
      subject: `Thanks for booking! Your move is on ${day(date)}`,
      text: lines(
        `Hi ${first},`,
        '',
        'Thank you for booking with DMV Trusted Movers! Your move is confirmed.',
        '',
        'YOUR MOVE',
        `Service: ${TYPES[type] ?? 'Move'}${size ? `, ${size}` : ''}`,
        `Date: ${day(date)}`,
        `Arrival time: ${start ? slot(start, end) : win ?? 'time to be set'}`,
        `${to ? 'From' : 'Address'}: ${from}`,
        to && `To: ${to}`,
        '',
        'PAYMENT',
        `Total price: ${money(price)}${q.est_hours ? ` (includes up to ${Number(q.est_hours)} hours of work)` : ''}`,
        `Deposit paid today: ${money(p.amount)}`,
        `Balance after the move: ${money(balance)}`,
        '',
        'CANCELLATION',
        `Cancel for free until ${nyWhen(until, 'en-US')} (72 hours before arrival). Your deposit is refunded to your card right away; banks take 5 to 10 days to show it.`,
        'If you cancel less than 72 hours before, the deposit is kept.',
        'To cancel or change your date, open your booking and tap "Cancel my move" or "Change my date":',
        link,
        '',
        'Before moving day, please book the elevator and save a parking spot for the truck if you can. We will send you a reminder the day before.',
        '',
        `All policies: ${LIVE_SITE}/policies`,
        'Questions? Just reply to this email.',
        '',
        'DMV Trusted Movers',
      ),
    })
  }
  if (c?.phone) {
    emails.push({
      sms: [c.phone],
      text: es
        ? `DMV Trusted Movers: ¡gracias! Su mudanza está reservada para el ${dayEs(date)}${start ? `, llegada ${slotEs(start, end)}` : ''}. Depósito ${money(p.amount)}, saldo ${money(balance)}. Cancele gratis hasta 72 h antes. Su reserva: ${link}`
        : `DMV Trusted Movers: thanks! You're booked for ${day(date)}${start ? `, arrival ${slot(start, end)}` : ''}. Deposit ${money(p.amount)}, balance ${money(balance)}. Free cancellation until 72h before. Your booking: ${link}`,
    })
  }
  return emails
}

async function moveReminder(jobId: string): Promise<Out[]> {
  const { data: j } = await db.from('jobs')
    .select('job_date, window_start, window_end, job_type, from_address, to_address, status, move_requests(customers(full_name, email, phone, language)), assignments(status, accounts(email, phone, language))')
    .eq('id', jobId).maybeSingle()
  // Skip a move that was cancelled or moved after the reminder was queued
  if (!j || j.status !== 'scheduled') return []
  const when = `${day(j.job_date)}, ${slot(j.window_start, j.window_end)}`
  const emails: Out[] = []
  type Mover = { email: string | null; phone: string | null; language: string | null }
  const accepted = ((j.assignments ?? []) as unknown as { status: string; accounts: Mover | null }[])
    .filter((a) => a.status === 'accepted' && a.accounts).map((a) => a.accounts!)
  const crew = accepted.filter((a) => a.email).map((a) => a.email!)
  for (const lang of ['en', 'es']) {
    const phones = accepted.filter((a) => a.phone && (a.language === 'es') === (lang === 'es')).map((a) => a.phone!)
    if (!phones.length) continue
    emails.push({
      sms: phones,
      text: lang === 'es'
        ? `DMV Trusted Movers: tienes un trabajo mañana, ${slot(j.window_start, j.window_end)}. ${j.from_address}. Detalles: ${LIVE_SITE}/jobs/${jobId}`
        : `DMV Trusted Movers: you're on a job tomorrow, ${slot(j.window_start, j.window_end)}. ${j.from_address}. Details: ${LIVE_SITE}/jobs/${jobId}`,
    })
  }
  if (CAN_EMAIL_OTHERS && crew.length) {
    emails.push({
      to: crew,
      subject: `Job tomorrow: ${slot(j.window_start, j.window_end)}`,
      text: lines(
        `You're on a ${TYPES[j.job_type] ?? 'job'} tomorrow, ${when}.`,
        `${j.to_address ? 'From' : 'Address'}: ${j.from_address}`,
        j.to_address && `To: ${j.to_address}`,
        '',
        `Job details: ${LIVE_SITE}/jobs/${jobId}`,
      ),
    })
  }
  const c = (j.move_requests as unknown as { customers: { full_name: string; email: string | null; phone: string | null; language: string } | null } | null)?.customers
  const es = c?.language === 'es'
  const whenEs = `${dayEs(j.job_date)}, ${slotEs(j.window_start, j.window_end)}`
  if (c?.phone) {
    emails.push({
      sms: [c.phone],
      text: es
        ? `DMV Trusted Movers: su equipo llega mañana, ${whenEs}. Si puede, reserve el elevador y guarde un lugar para estacionar el camión. Responda aquí si algo cambió.`
        : `DMV Trusted Movers: your crew arrives tomorrow, ${when}. Please book the elevator and save a parking spot for the truck if you can. Reply here if anything changed.`,
    })
  }
  if (CAN_EMAIL_OTHERS && c?.email && es) {
    emails.push({
      to: [c.email],
      subject: 'Su mudanza es mañana',
      text: lines(
        `Hola ${c.full_name.split(' ')[0]}:`,
        '',
        `Le recordamos que su equipo de DMV Trusted Movers llega mañana, ${whenEs}.`,
        '',
        'Para que todo salga bien:',
        '- Reserve el elevador si su edificio tiene uno.',
        '- Guarde un lugar para estacionar el camión cerca de la puerta.',
        '- Aparte lo que va a llevar usted mismo, como objetos de valor y medicinas.',
        '',
        'Responda a este correo o a nuestro mensaje si algo cambió.',
        '',
        'DMV Trusted Movers',
      ),
    })
  } else if (CAN_EMAIL_OTHERS && c?.email) {
    emails.push({
      to: [c.email],
      subject: 'Your move is tomorrow',
      text: lines(
        `Hi ${c.full_name.split(' ')[0]},`,
        '',
        `A reminder that your DMV Trusted Movers crew arrives tomorrow, ${when}.`,
        '',
        'To help the day go smoothly:',
        '- Book the elevator if your building has one.',
        '- Save a parking spot close to the door for the truck.',
        '- Set aside anything you are moving yourself, like valuables and medicine.',
        '',
        'Reply to this email or our text if anything changed.',
        '',
        'DMV Trusted Movers',
      ),
    })
  }
  return emails
}

// After the customer signs off: the balance, with a link to pay it by card on their booking link
async function balanceDue(jobId: string): Promise<Out[]> {
  const { data: j } = await db.from('jobs')
    .select('job_date, status, job_prices(price, paid), job_extras(title, job_extra_prices(amount)), quotes(token), move_requests(customers(full_name, email, language))')
    .eq('id', jobId).maybeSingle()
  if (!j || j.status === 'cancelled') return []
  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null
  const price = one(j.job_prices as unknown as { price: number; paid: number } | null)
  const token = one(j.quotes as unknown as { token: string } | null)?.token
  const c = (j.move_requests as unknown as { customers: { full_name: string; email: string | null; language: string } | null } | null)?.customers
  if (!price || !token) return []
  const extras = ((j.job_extras ?? []) as unknown as { title: string; job_extra_prices: { amount: number } | { amount: number }[] | null }[])
    .map((x) => ({ title: x.title, amount: Number(one(x.job_extra_prices)?.amount ?? 0) })).filter((x) => x.amount > 0)
  const total = Number(price.price) + extras.reduce((t, x) => t + x.amount, 0)
  const paid = Number(price.paid)
  const due = Math.max(total - paid, 0)
  // Nothing left to pay (paid in cash or already by card)
  if (due <= 0) return []
  const link = `${LIVE_SITE}/quote/${token}`
  const out: Out[] = [{
    push: true,
    title: `Payment link sent: ${c?.full_name ?? 'Customer'}, ${money(due)}`,
    body: c?.email ? 'We emailed them the balance with a link to pay by card.' : 'They have no email. Text them the payment link from the job.',
    url: `/jobs/${jobId}?tab=money`,
    tag: `balance-${jobId}`,
  }]
  if (!CAN_EMAIL_OTHERS || !c?.email) return out
  const first = c.full_name.split(' ')[0]
  if (c.language === 'es') {
    out.push({
      to: [c.email],
      subject: `Su mudanza terminó: saldo de ${money(due)}`,
      text: lines(
        `Hola ${first}:`,
        '',
        `¡Gracias por mudarse con DMV Trusted Movers! Su mudanza del ${dayEs(j.job_date)} está terminada.`,
        '',
        `Precio de la mudanza: ${money(price.price)}`,
        ...extras.map((x) => `${x.title}: ${money(x.amount)}`),
        `Ya pagado: ${money(paid)}`,
        `Saldo a pagar: ${money(due)}`,
        '',
        'Pague con tarjeta aquí. También puede dejar una propina para su equipo si quiere:',
        link,
        '',
        '¿Preguntas sobre su factura? Responda a este correo.',
        '',
        'DMV Trusted Movers',
      ),
    })
  } else {
    out.push({
      to: [c.email],
      subject: `Your move is done: ${money(due)} balance`,
      text: lines(
        `Hi ${first},`,
        '',
        `Thank you for moving with DMV Trusted Movers! Your move on ${day(j.job_date)} is done.`,
        '',
        `Move price: ${money(price.price)}`,
        ...extras.map((x) => `${x.title}: ${money(x.amount)}`),
        `Already paid: ${money(paid)}`,
        `Balance due: ${money(due)}`,
        '',
        'Pay by card here. You can also leave a tip for your crew if you like:',
        link,
        '',
        'Questions about your bill? Just reply to this email.',
        '',
        'DMV Trusted Movers',
      ),
    })
  }
  return out
}

// "Pay my bill" page: the customer typed their email, so send them the link to each of their moves
async function payLink(requestId: string): Promise<Email[]> {
  const { data: r } = await db.from('pay_link_requests').select('email').eq('id', requestId).maybeSingle()
  if (!r || !CAN_EMAIL_OTHERS) return []
  const pattern = r.email.replace(/[\\%_]/g, (ch: string) => `\\${ch}`)
  const { data: people } = await db.from('customers')
    .select('full_name, language, created_at, move_requests(quotes(token, status, jobs(job_date, status, job_prices(price, paid), job_extras(job_extra_prices(amount)))))')
    .ilike('email', pattern).order('created_at', { ascending: false })
  if (!people?.length) return []
  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  type J = { job_date: string; status: string; job_prices: unknown; job_extras: { job_extra_prices: unknown }[] | null }
  const moves: { date: string; due: number; payable: boolean; link: string }[] = []
  for (const c of people) {
    for (const mr of (c.move_requests ?? []) as unknown as { quotes: { token: string; status: string; jobs: J | J[] | null }[] | null }[]) {
      for (const q of mr.quotes ?? []) {
        const j = one(q.jobs)
        if (q.status !== 'accepted' || !j || j.status === 'cancelled') continue
        const price = one(j.job_prices as { price: number; paid: number } | null)
        if (!price) continue
        const extras = (j.job_extras ?? []).reduce((t, x) => t + Number(one(x.job_extra_prices as { amount: number } | null)?.amount ?? 0), 0)
        moves.push({
          date: j.job_date,
          due: Math.max(Number(price.price) + extras - Number(price.paid), 0),
          payable: j.status === 'in_progress' || j.status === 'completed' || j.job_date <= today,
          link: `${LIVE_SITE}/quote/${q.token}`,
        })
      }
    }
  }
  moves.sort((a, b) => b.date.localeCompare(a.date))
  const shown = moves.slice(0, 5)
  const first = people[0].full_name.split(' ')[0]
  const es = people[0].language === 'es'
  const toPay = shown.filter((m) => m.payable && m.due > 0)
  const row = (m: typeof shown[number]) => es
    ? `${dayEs(m.date)}: ${m.due <= 0 ? 'pagado por completo' : m.payable ? `saldo de ${money(m.due)}, pague aquí` : `saldo de ${money(m.due)}, se paga después de la mudanza`}\n${m.link}`
    : `${day(m.date)}: ${m.due <= 0 ? 'paid in full' : m.payable ? `${money(m.due)} balance, pay here` : `${money(m.due)} balance, paid after your move`}\n${m.link}`
  if (es) {
    return [{
      to: [r.email],
      subject: toPay.length ? `Su saldo con DMV Trusted Movers: ${money(toPay.reduce((t, m) => t + m.due, 0))}` : 'Sus mudanzas con DMV Trusted Movers',
      text: lines(
        `Hola ${first}:`,
        '',
        shown.length ? 'Usted pidió el enlace para pagar. Estas son sus mudanzas:' : 'Usted pidió el enlace para pagar, pero no encontramos una mudanza reservada con este correo.',
        '',
        ...shown.flatMap((m) => [row(m), '']),
        toPay.length ? 'En la página puede pagar con tarjeta y dejar una propina para su equipo si quiere.' : 'No tiene nada que pagar en este momento.',
        '',
        '¿Preguntas sobre su factura? Responda a este correo.',
        '',
        'DMV Trusted Movers',
      ),
    }]
  }
  return [{
    to: [r.email],
    subject: toPay.length ? `Your DMV Trusted Movers balance: ${money(toPay.reduce((t, m) => t + m.due, 0))}` : 'Your moves with DMV Trusted Movers',
    text: lines(
      `Hi ${first},`,
      '',
      shown.length ? 'You asked for your payment link. Here are your moves:' : "You asked for your payment link, but we couldn't find a booked move under this email.",
      '',
      ...shown.flatMap((m) => [row(m), '']),
      toPay.length ? 'On that page you can pay by card and leave a tip for your crew if you like.' : 'There is nothing to pay right now.',
      '',
      'Questions about your bill? Just reply to this email.',
      '',
      'DMV Trusted Movers',
    ),
  }]
}

async function balancePaid(paymentId: string): Promise<Email[]> {
  const { data: p } = await db.from('payments')
    .select('amount, provider_ref, quotes(token, jobs(id, job_date), move_requests(customers(full_name, email, language)))')
    .eq('id', paymentId).maybeSingle()
  const q = p?.quotes as unknown as {
    token: string; jobs: { id: string; job_date: string }[] | { id: string; job_date: string } | null
    move_requests: { customers: { full_name: string; email: string | null; language: string } | null }
  } | null
  const job = Array.isArray(q?.jobs) ? q!.jobs[0] : q?.jobs
  if (!p || !q || !job) return []
  const c = q.move_requests.customers
  // A tip paid in the same checkout
  const { data: tip } = await db.from('payments').select('amount')
    .eq('provider_ref', p.provider_ref).eq('kind', 'tip').eq('status', 'paid').maybeSingle()
  const emails: Email[] = [{
    to: await admins(),
    subject: `Balance paid: ${c?.full_name ?? 'Customer'}, ${money(p.amount)}${tip ? ` + ${money(tip.amount)} tip` : ''}`,
    text: lines(
      `${c?.full_name ?? 'A customer'} paid the ${money(p.amount)} balance by card for the move on ${day(job.job_date)}.`,
      tip && `They also tipped the crew ${money(tip.amount)}. It's added to each mover's pay in Pay crew.`,
      '',
      `See the job: ${LIVE_SITE}/jobs/${job.id}`,
    ),
  }]
  if (CAN_EMAIL_OTHERS && c?.email && c.language === 'es') {
    emails.push({
      to: [c.email],
      subject: 'Recibo de su mudanza',
      text: lines(
        `Hola ${c.full_name.split(' ')[0]}:`,
        '',
        `Recibimos su pago con tarjeta de ${money(Number(p.amount) + Number(tip?.amount ?? 0))} por su mudanza del ${dayEs(job.job_date)}.`,
        tip && `Eso incluye una propina de ${money(tip.amount)} para su equipo. ¡Gracias!`,
        '',
        `¿Cómo lo hicimos? Califique su mudanza: ${LIVE_SITE}/quote/${q.token}`,
        '',
        'Gracias por elegir DMV Trusted Movers.',
      ),
    })
  } else if (CAN_EMAIL_OTHERS && c?.email) {
    emails.push({
      to: [c.email],
      subject: 'Receipt for your move',
      text: lines(
        `Hi ${c.full_name.split(' ')[0]},`,
        '',
        `We received your ${money(Number(p.amount) + Number(tip?.amount ?? 0))} card payment for your move on ${day(job.job_date)}.`,
        tip && `That includes a ${money(tip.amount)} tip for your crew. Thank you!`,
        '',
        `How did we do? Rate your move: ${LIVE_SITE}/quote/${q.token}`,
        '',
        'Thank you for choosing DMV Trusted Movers.',
      ),
    })
  }
  return emails
}

async function tipPaid(paymentId: string): Promise<Email[]> {
  const { data: p } = await db.from('payments')
    .select('amount, quotes(jobs(id, job_date), move_requests(customers(full_name)))')
    .eq('id', paymentId).maybeSingle()
  const q = p?.quotes as unknown as {
    jobs: { id: string; job_date: string }[] | { id: string; job_date: string } | null
    move_requests: { customers: { full_name: string } | null }
  } | null
  const job = Array.isArray(q?.jobs) ? q!.jobs[0] : q?.jobs
  if (!p || !q || !job) return []
  const c = q.move_requests.customers
  return [{
    to: await admins(),
    subject: `Tip for the crew: ${c?.full_name ?? 'Customer'}, ${money(p.amount)}`,
    text: lines(
      `${c?.full_name ?? 'A customer'} tipped the crew ${money(p.amount)} by card for the move on ${day(job.job_date)}.`,
      "It's split evenly among the movers and added to their pay in Pay crew.",
      '',
      `See the job: ${LIVE_SITE}/jobs/${job.id}`,
    ),
  }]
}

async function jobCancelled(jobId: string): Promise<Email[]> {
  const { data: j } = await db.from('jobs')
    .select('job_date, move_requests(customers(full_name, phone))').eq('id', jobId).maybeSingle()
  if (!j) return []
  const c = (j.move_requests as unknown as { customers: { full_name: string; phone: string | null } | null } | null)?.customers
  return [{
    to: await admins(),
    subject: `Cancelled: ${c?.full_name ?? 'Customer'}, ${day(j.job_date)}`,
    text: lines(
      `${c?.full_name ?? 'A customer'} cancelled their move on ${day(j.job_date)} from their booking link.`,
      'The crew on it were taken off the job. Card deposits are refunded automatically when they cancel 72 hours or more ahead.',
      c?.phone && `Phone: ${c.phone}`,
      '',
      `See the job: ${LIVE_SITE}/jobs/${jobId}`,
    ),
  }]
}

async function openSpots(jobId: string): Promise<Email[]> {
  const { data: j } = await db.from('jobs')
    .select('job_date, window_start, window_end, from_address, status, move_requests(customers(full_name))')
    .eq('id', jobId).maybeSingle()
  if (!j || j.status !== 'scheduled') return []
  // Skip a job that filled up since the alert was queued
  const { data: short } = await db.rpc('job_crew_short', { p_job: jobId })
  if (!short) return []
  const c = (j.move_requests as unknown as { customers: { full_name: string } | null } | null)?.customers
  const movers = `${short} more ${short === 1 ? 'mover' : 'movers'}`
  return [{
    to: await admins(),
    subject: `Crew not full: ${c?.full_name ?? j.from_address}, needs ${movers}`,
    text: lines(
      `The move on ${day(j.job_date)}, ${slot(j.window_start, j.window_end)}, still needs ${movers}.`,
      `${c?.full_name ? `${c.full_name}, ` : ''}${j.from_address}`,
      '',
      `Add crew: ${LIVE_SITE}/jobs/${jobId}`,
    ),
  }]
}

async function dateChange(jobId: string): Promise<Email[]> {
  const { data: j } = await db.from('jobs')
    .select('job_date, change_date, change_note, change_status, move_requests(customers(full_name, phone))')
    .eq('id', jobId).maybeSingle()
  // Skip one already answered before the email went out
  if (!j || j.change_status !== 'pending' || !j.change_date) return []
  const c = (j.move_requests as unknown as { customers: { full_name: string; phone: string | null } | null } | null)?.customers
  return [{
    to: await admins(),
    subject: `New date asked: ${c?.full_name ?? 'Customer'}, ${day(j.change_date)}`,
    text: lines(
      `${c?.full_name ?? 'A customer'} asked to change their move from ${day(j.job_date)} to ${day(j.change_date)}.`,
      j.change_note && `Note: ${j.change_note}`,
      c?.phone && `Phone: ${c.phone}`,
      '',
      `Approve or decline: ${LIVE_SITE}/jobs/${jobId}`,
    ),
  }]
}

async function review(jobId: string): Promise<Out[]> {
  const { data: j } = await db.from('jobs')
    .select('job_date, job_reviews(rating, comment), move_requests(customers(full_name, phone))').eq('id', jobId).maybeSingle()
  const rv = (Array.isArray(j?.job_reviews) ? j!.job_reviews[0] : j?.job_reviews) as { rating: number; comment: string | null } | undefined
  if (!j || !rv) return []
  const c = (j.move_requests as unknown as { customers: { full_name: string; phone: string | null } | null } | null)?.customers
  return [{
    to: await admins(),
    subject: `${'★'.repeat(rv.rating)}${'☆'.repeat(5 - rv.rating)} from ${c?.full_name ?? 'a customer'}`,
    text: lines(
      `${c?.full_name ?? 'A customer'} rated their move on ${day(j.job_date)} ${rv.rating} out of 5.`,
      rv.comment && `"${rv.comment}"`,
      rv.rating < 4 && c?.phone && `Worth a call: ${c.phone}`,
      '',
      `See the job: ${LIVE_SITE}/jobs/${jobId}`,
    ),
  }]
}

async function crewAccepted(assignmentId: string): Promise<Email[]> {
  const { data: a } = await db.from('assignments')
    .select('job_id, status, accounts(full_name), jobs(job_date, window_start, window_end, from_address, crew_size, status, move_requests(customers(full_name)))')
    .eq('id', assignmentId).maybeSingle()
  const j = a?.jobs as unknown as { job_date: string; window_start: string | null; window_end: string | null; from_address: string; crew_size: number | null; status: string; move_requests: { customers: { full_name: string } | null } | null } | null
  // Skip one who dropped out again before the email went out
  if (!a || a.status !== 'accepted' || !j || j.status === 'cancelled') return []
  const who = (a.accounts as unknown as { full_name: string | null } | null)?.full_name ?? 'A mover'
  const c = j.move_requests?.customers
  const { count } = await db.from('assignments').select('id', { count: 'exact', head: true }).eq('job_id', a.job_id).eq('status', 'accepted')
  const filled = j.crew_size ? ` (${count ?? 0} of ${j.crew_size} filled)` : ''
  return [{
    to: await admins(),
    subject: `${who} took a spot: ${c?.full_name ?? j.from_address}${filled}`,
    text: lines(
      `${who} is on the move on ${day(j.job_date)}, ${slot(j.window_start, j.window_end)}${filled}.`,
      `${c?.full_name ? `${c.full_name}, ` : ''}${j.from_address}`,
      '',
      `See the crew: ${LIVE_SITE}/jobs/${a.job_id}?tab=crew`,
    ),
  }]
}

async function damageReport(jobId: string): Promise<Email[]> {
  const { data: j } = await db.from('jobs')
    .select('job_date, from_address, move_requests(customers(full_name))').eq('id', jobId).maybeSingle()
  const { data: photos } = await db.from('job_photos')
    .select('note, created_at, accounts(full_name)').eq('job_id', jobId).eq('kind', 'damage').order('created_at')
  // Skip one whose photos were all removed before the email went out
  if (!j || !photos?.length) return []
  const c = (j.move_requests as unknown as { customers: { full_name: string } | null } | null)?.customers
  const who = [...new Set(photos.map((p) => (p.accounts as unknown as { full_name: string | null } | null)?.full_name ?? 'A mover'))]
  const notes = photos.map((p) => p.note?.trim()).filter(Boolean)
  return [{
    to: await admins(),
    subject: `Damage reported: ${c?.full_name ?? j.from_address}, ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`,
    text: lines(
      `${who.join(' and ')} reported damage on the move on ${day(j.job_date)}.`,
      `${c?.full_name ? `${c.full_name}, ` : ''}${j.from_address}`,
      '',
      notes.length ? 'What they wrote:' : 'No notes written yet.',
      ...notes.map((n) => `- ${n}`),
      '',
      `See the photos: ${LIVE_SITE}/jobs/${jobId}/photos?tab=damage`,
    ),
  }]
}

// The sending address has no inbox, so a customer who hits Reply reaches the admins' own email
let replyTo: Promise<string[]> | undefined

async function send(key: string, e: Email) {
  const reply = await (replyTo ??= admins())
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM ?? 'DMV Trusted Movers <onboarding@resend.dev>', to: e.to, subject: e.subject, text: e.text,
      ...(reply.length ? { reply_to: reply } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

// Texts are a bonus to the emails: a failed text is noted but doesn't resend the emails
async function sendText(to: string, body: string) {
  const number = e164(to)
  if (!number) return
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO.sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${TWILIO.sid}:${TWILIO.token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: number, From: e164(TWILIO.from) ?? TWILIO.from!, Body: body }),
  })
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

// Phone notifications (web push) to every admin's phone or computer that turned them on in Profile.
// A failed one is logged; a phone that turned them off is forgotten.
// The public push key (also in src/lib/push.ts); the private one is in the server-only server_keys table
const VAPID = { subject: 'https://dmvtrustedmovers.org', publicKey: 'BEFIvX3pVduQGDcBz1H5AE5guLpn_PVqWXIf4cpSSuoyOVo8fxcPacW6MOO9BKZqb8MFPkuOzdN3-spUut8m9Lg', privateKey: '' }
async function vapidReady() {
  if (!VAPID.privateKey) {
    const { data } = await db.from('server_keys').select('value').eq('name', 'vapid_private').maybeSingle()
    VAPID.privateKey = data?.value ?? ''
  }
  return !!VAPID.privateKey
}
async function sendPush(p: Push) {
  if (!(await vapidReady())) return
  const { data: admin } = await db.from('accounts').select('id').eq('role', 'admin').eq('active', true)
  const ids = (admin ?? []).map((a) => a.id)
  if (!ids.length) return
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('account_id', ids)
  for (const s of subs ?? []) {
    try {
      const d = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: p.title, body: p.body, url: p.url, tag: p.tag }), { vapidDetails: VAPID, TTL: 86400, urgency: 'high' })
      const res = await fetch(d.endpoint, { method: d.method, headers: d.headers as Record<string, string>, body: d.body })
      if (res.status === 404 || res.status === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      else if (!res.ok) console.error('notify: push failed', res.status, (await res.text()).slice(0, 200))
    } catch (e) {
      console.error('notify: push failed', e)
    }
  }
}

const builders: Record<string, (id: string) => Promise<Out[]>> = {
  new_request: newRequest, deposit_paid: depositPaid, move_reminder: moveReminder, job_cancelled: jobCancelled,
  balance_paid: balancePaid, tip_paid: tipPaid, open_spots: openSpots, date_change: dateChange, review,
  crew_accepted: crewAccepted, damage_report: damageReport, balance_due: balanceDue, pay_link: payLink,
}

Deno.serve(async () => {
  const key = Deno.env.get('RESEND_API_KEY')
  // Without a key, leave everything queued so it all goes out once the key is saved
  if (!key) return Response.json({ sent: 0, waiting: 'RESEND_API_KEY is not set' })
  replyTo = undefined
  const { data: batch, error } = await db.rpc('claim_notifications')
  if (error) {
    console.error('notify: could not claim the outbox:', error.message)
    return Response.json({ error: 'Could not read the outbox' }, { status: 500 })
  }
  let sent = 0
  for (const n of (batch ?? []) as Note[]) {
    try {
      const outs = (await builders[n.kind]?.(n.ref_id)) ?? []
      for (const e of outs) if ('to' in e && e.to.length) await send(key, e)
      for (const e of outs) if ('push' in e) await sendPush(e)
      let textError: string | null = null
      for (const e of outs) {
        if (!('sms' in e) || !CAN_TEXT) continue
        for (const to of e.sms) {
          try { await sendText(to, e.text) } catch (err) { textError = err instanceof Error ? err.message : String(err) }
        }
      }
      await db.from('notifications').update({ sent_at: new Date().toISOString(), last_error: textError }).eq('id', n.id)
      sent++
    } catch (e) {
      // Release the claim so the next run retries it (up to 5 tries)
      await db.from('notifications').update({ claimed_at: null, last_error: e instanceof Error ? e.message : String(e) }).eq('id', n.id)
    }
  }
  return Response.json({ sent })
})
