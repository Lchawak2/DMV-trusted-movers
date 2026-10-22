// Sends the emails waiting in the notifications outbox, through Resend.
// The database wakes this function when it queues an email (and every 10 minutes as a safety net).
// Deployed with verify_jwt off: calling it only sends what is already queued, so a caller can't
// choose who gets emailed or what it says.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const LIVE_SITE = 'https://dmv-trusted-movers-8tyn.vercel.app'
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

async function depositPaid(paymentId: string): Promise<Email[]> {
  const { data: p } = await db.from('payments')
    .select('amount, quotes(id, token, price, request_id, move_requests(preferred_date, arrival_window, customers(full_name, email)))')
    .eq('id', paymentId).maybeSingle()
  const q = p?.quotes as unknown as {
    id: string; token: string; price: number; request_id: string
    move_requests: { preferred_date: string; arrival_window: string | null; customers: { full_name: string; email: string | null } | null }
  } | null
  if (!p || !q) return []
  const r = q.move_requests
  const c = r.customers
  const emails: Email[] = [{
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
  return emails
}

async function moveReminder(jobId: string): Promise<Email[]> {
  const { data: j } = await db.from('jobs')
    .select('job_date, window_start, window_end, job_type, from_address, to_address, status, move_requests(customers(full_name, email)), assignments(status, accounts(email))')
    .eq('id', jobId).maybeSingle()
  // Skip a move that was cancelled or moved after the reminder was queued
  if (!j || j.status !== 'scheduled') return []
  const when = `${day(j.job_date)}, ${slot(j.window_start, j.window_end)}`
  const emails: Email[] = []
  const crew = ((j.assignments ?? []) as unknown as { status: string; accounts: { email: string | null } | null }[])
    .filter((a) => a.status === 'accepted' && a.accounts?.email).map((a) => a.accounts!.email!)
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
  const c = (j.move_requests as unknown as { customers: { full_name: string; email: string | null } | null } | null)?.customers
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

async function send(key: string, e: Email) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM ?? 'DMV Trusted Movers <onboarding@resend.dev>', to: e.to, subject: e.subject, text: e.text }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

const builders: Record<string, (id: string) => Promise<Email[]>> = {
  new_request: newRequest, deposit_paid: depositPaid, move_reminder: moveReminder, job_cancelled: jobCancelled,
}

Deno.serve(async () => {
  const key = Deno.env.get('RESEND_API_KEY')
  // Without a key, leave everything queued so it all goes out once the key is saved
  if (!key) return Response.json({ sent: 0, waiting: 'RESEND_API_KEY is not set' })
  const { data: batch, error } = await db.rpc('claim_notifications')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  let sent = 0
  for (const n of (batch ?? []) as Note[]) {
    try {
      const emails = (await builders[n.kind]?.(n.ref_id)) ?? []
      for (const e of emails) if (e.to.length) await send(key, e)
      await db.from('notifications').update({ sent_at: new Date().toISOString(), last_error: null }).eq('id', n.id)
      sent++
    } catch (e) {
      // Release the claim so the next run retries it (up to 5 tries)
      await db.from('notifications').update({ claimed_at: null, last_error: e instanceof Error ? e.message : String(e) }).eq('id', n.id)
    }
  }
  return Response.json({ sent })
})
