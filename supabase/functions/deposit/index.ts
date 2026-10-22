// Card deposits through Stripe Checkout.
// POST { action: 'start', token } -> { url } to send the customer to Stripe's payment page
// POST { action: 'confirm', token } -> { paid } after they come back; a paid deposit books the job
// POST { action: 'cancel', token } -> { refunded } the customer cancels; 72+ hours ahead the deposit is refunded
// POST { action: 'refund', job_id } -> { refunded } the admin (signed in) refunds a cancelled job's deposit
// Deployed with verify_jwt off: guests have no login, so the function checks the quote token itself.
// The quote token in the customer's link is the only key a guest has, so every lookup goes through it.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const LIVE_SITE = 'https://dmv-trusted-movers-8tyn.vercel.app'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function stripe(path: string, form?: Record<string, string>, idempotencyKey?: string) {
  const key = Deno.env.get('STRIPE_SECRET_KEY')
  if (!key) throw new Error("Card payments aren't set up yet. Please reply to our text to book.")
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: form ? new URLSearchParams(form) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? 'Stripe error')
  return data
}

// Send customers back to the site they paid from, but only to our own sites
function siteFor(origin: string | null): string {
  if (origin && (/^https:\/\/dmv-trusted-movers[a-z0-9-]*\.vercel\.app$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin))) return origin
  return LIVE_SITE
}

async function quoteFor(token: string) {
  const { data } = await db.from('quotes')
    .select('id, status, deposit, expires_at, request_id, move_requests(preferred_date, customers(email))')
    .eq('token', token).maybeSingle()
  return data
}

async function confirm(quoteId: string): Promise<boolean> {
  const { data: payments } = await db.from('payments').select('id, amount, status, provider_ref')
    .eq('quote_id', quoteId).eq('kind', 'deposit')
  let paid = (payments ?? []).find((p) => p.status === 'paid')
  for (const p of payments ?? []) {
    if (paid || p.status !== 'pending' || !p.provider_ref) continue
    const session = await stripe(`checkout/sessions/${p.provider_ref}`)
    if (session.payment_status === 'paid') {
      await db.from('payments').update({ status: 'paid' }).eq('id', p.id)
      paid = p
    } else if (session.status === 'expired') {
      await db.from('payments').update({ status: 'expired' }).eq('id', p.id)
    }
  }
  if (!paid) return false
  const { error } = await db.rpc('book_quote', { p_quote: quoteId, p_paid: paid.amount })
  if (error) throw new Error(error.message)
  return true
}

// Refund every card deposit on a quote. Stripe's idempotency key stops a retry from refunding twice.
async function refundDeposits(quoteId: string): Promise<number> {
  const { data: payments } = await db.from('payments').select('id, amount, provider_ref')
    .eq('quote_id', quoteId).eq('kind', 'deposit').eq('status', 'paid').not('provider_ref', 'is', null)
  let total = 0
  for (const p of payments ?? []) {
    const session = await stripe(`checkout/sessions/${p.provider_ref}`)
    if (!session.payment_intent) throw new Error('Stripe has no payment to refund for this deposit.')
    await stripe('refunds', { payment_intent: session.payment_intent }, `refund-${p.id}`)
    await db.from('payments').update({ status: 'refunded' }).eq('id', p.id)
    total += Number(p.amount)
  }
  if (total > 0) {
    const { data: job } = await db.from('jobs').select('id, job_prices(paid)').eq('quote_id', quoteId).maybeSingle()
    const price = job?.job_prices as unknown as { paid: number } | null
    if (job && price) await db.from('job_prices').update({ paid: Math.max(Number(price.paid) - total, 0) }).eq('job_id', job.id)
  }
  return total
}

// The caller's own login, checked against the accounts table
async function isAdmin(req: Request): Promise<boolean> {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!jwt) return false
  const { data } = await db.auth.getUser(jwt)
  if (!data.user) return false
  const { data: account } = await db.from('accounts').select('role, active').eq('id', data.user.id).maybeSingle()
  return account?.role === 'admin' && account.active === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { action, token, job_id } = await req.json()

    if (action === 'refund') {
      if (!(await isAdmin(req))) return reply({ error: 'Only the admin can refund.' }, 403)
      const { data: job } = await db.from('jobs').select('quote_id, status').eq('id', job_id).maybeSingle()
      if (!job?.quote_id) return reply({ error: 'This job has no card deposit.' }, 404)
      if (job.status !== 'cancelled') return reply({ error: 'Cancel the job before refunding the deposit.' }, 409)
      return reply({ refunded: await refundDeposits(job.quote_id) })
    }

    if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/.test(token)) return reply({ error: 'This quote link is not valid.' }, 400)
    const quote = await quoteFor(token)
    if (!quote) return reply({ error: 'This quote link is not valid.' }, 404)

    if (action === 'confirm') return reply({ paid: await confirm(quote.id) })

    if (action === 'cancel') {
      const { data, error } = await db.rpc('cancel_booking', { p_token: token })
      if (error) return reply({ error: error.message }, 409)
      if (!data.free) return reply({ refunded: 0, free: false })
      // The move is cancelled either way; a failed refund shows up on the admin's job page to retry
      try {
        return reply({ refunded: await refundDeposits(quote.id), free: true })
      } catch {
        return reply({ refunded: 0, free: true, refund_failed: true })
      }
    }

    if (action === 'start') {
      if (await confirm(quote.id)) return reply({ paid: true })
      if (quote.status !== 'sent') return reply({ error: 'This quote is no longer open. Please reply to our text for a new one.' }, 409)
      if (!quote.expires_at || new Date(quote.expires_at) < new Date()) return reply({ error: 'This quote has expired. Please reply to our text for a new one.' }, 409)
      const cents = Math.round(Number(quote.deposit) * 100)
      if (cents < 50) return reply({ error: 'This quote has no deposit to pay.' }, 409)

      const request = quote.move_requests as unknown as { preferred_date: string; customers: { email: string | null } | null }
      const site = siteFor(req.headers.get('origin'))
      const form: Record<string, string> = {
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(cents),
        'line_items[0][price_data][product_data][name]': `Moving deposit for ${request.preferred_date}`,
        client_reference_id: quote.id,
        'metadata[quote_id]': quote.id,
        success_url: `${site}/quote/${token}?paid=1`,
        cancel_url: `${site}/quote/${token}`,
      }
      if (request.customers?.email) form.customer_email = request.customers.email
      const session = await stripe('checkout/sessions', form)
      await db.from('payments').insert({ quote_id: quote.id, kind: 'deposit', amount: cents / 100, status: 'pending', provider_ref: session.id })
      return reply({ url: session.url })
    }
    return reply({ error: 'Unknown action' }, 400)
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : 'Something went wrong' }, 500)
  }
})
