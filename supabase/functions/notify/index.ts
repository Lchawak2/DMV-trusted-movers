// Sends the emails waiting in the notifications outbox, through Resend, and texts through Twilio
// once its three secrets are saved (booking confirmation and the day-before reminders).
// The database wakes this function when it queues an email (and every 10 minutes as a safety net).
// Deployed with verify_jwt off: calling it only sends what is already queued, so a caller can't
// choose who gets emailed or what it says.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

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
type Out = Email | Text

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

async function depositPaid(paymentId: string): Promise<Out[]> {
  const { data: p } = await db.from('payments')
    .select('amount, quotes(id, token, price, request_id, move_requests(preferred_date, arrival_window, customers(full_name, email, phone)))')
    .eq('id', paymentId).maybeSingle()
  const q = p?.quotes as unknown as {
    id: string; token: string; price: number; request_id: string
    move_requests: { preferred_date: string; arrival_window: string | null; customers: { full_name: string; email: string | null; phone: string | null } | null }
  } | null
  if (!p || !q) return []
  const r = q.move_requests
  const c = r.customers
  const emails: Out[] = [{
    to: await admins(),
    subject: `Deposit paid: ${c?.full_name ?? 'Customer'}, ${money(p.amount)}`,
    text: lines(
      `${c?.full_name ?? 'A customer'} paid a ${money(p.amount)} deposit for ${day(r.preferred_date)}. The move is booked.`,
      '',
      `See the booking: ${LIVE_SITE}/requests/${q.request_id}`,
    ),
  }]
  if (CAN_EMAIL_OTHERS && c?.email) {
    emails.push({
      to: [c.email],
      subject: `You're booked for ${day(r.preferred_date)}`,
      text: lines(
        `Hi ${c.full_name.split(' ')[0]},`,
        '',
        `Thanks for booking with DMV Trusted Movers. We received your ${money(p.amount)} deposit.`,
        '',
        `Move date: ${day(r.preferred_date)}${r.arrival_window ? `, ${r.arrival_window.toLowerCase()}` : ''}`,
        `Total price: ${money(q.price)}`,
        `Balance after the move: ${money(Number(q.price) - Number(p.amount))}`,
        '',
        'Free cancellation up to 72 hours before your move. After that the deposit is kept.',
        `Your booking: ${LIVE_SITE}/quote/${q.token}`,
        '',
        'DMV Trusted Movers',
      ),
    })
  }
  if (c?.phone) {
    emails.push({
      sms: [c.phone],
      text: `DMV Trusted Movers: you're booked for ${day(r.preferred_date)}${r.arrival_window ? `, ${r.arrival_window.toLowerCase()}` : ''}. We got your ${money(p.amount)} deposit. Your booking: ${LIVE_SITE}/quote/${q.token}`,
    })
  }
  return emails
}

async function moveReminder(jobId: string): Promise<Out[]> {
  const { data: j } = await db.from('jobs')
    .select('job_date, window_start, window_end, job_type, from_address, to_address, status, move_requests(customers(full_name, email, phone)), assignments(status, accounts(email, phone, language))')
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
  const c = (j.move_requests as unknown as { customers: { full_name: string; email: string | null; phone: string | null } | null } | null)?.customers
  if (c?.phone) {
    emails.push({
      sms: [c.phone],
      text: `DMV Trusted Movers: your crew arrives tomorrow, ${when}. Please book the elevator and save a parking spot for the truck if you can. Reply here if anything changed.`,
    })
  }
  if (CAN_EMAIL_OTHERS && c?.email) {
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

async function balancePaid(paymentId: string): Promise<Email[]> {
  const { data: p } = await db.from('payments')
    .select('amount, provider_ref, quotes(token, jobs(id, job_date), move_requests(customers(full_name, email)))')
    .eq('id', paymentId).maybeSingle()
  const q = p?.quotes as unknown as {
    token: string; jobs: { id: string; job_date: string }[] | { id: string; job_date: string } | null
    move_requests: { customers: { full_name: string; email: string | null } | null }
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
  if (CAN_EMAIL_OTHERS && c?.email) {
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

const builders: Record<string, (id: string) => Promise<Out[]>> = {
  new_request: newRequest, deposit_paid: depositPaid, move_reminder: moveReminder, job_cancelled: jobCancelled,
  balance_paid: balancePaid, tip_paid: tipPaid, open_spots: openSpots, date_change: dateChange, review,
  crew_accepted: crewAccepted, damage_report: damageReport,
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
