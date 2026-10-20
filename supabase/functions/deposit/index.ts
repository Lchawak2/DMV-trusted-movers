// Card deposits through Stripe Checkout.
// POST { action: 'start', token } -> { url } to send the customer to Stripe's payment page
// POST { action: 'confirm', token } -> { paid } after they come back; a paid deposit books the job
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

async function stripe(path: string, form?: Record<string, string>) {
  const key = Deno.env.get('STRIPE_SECRET_KEY')
  if (!key) throw new Error("Card payments aren't set up yet. Please reply to our text to book.")
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { action, token } = await req.json()
    if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/.test(token)) return reply({ error: 'This quote link is not valid.' }, 400)
    const quote = await quoteFor(token)
    if (!quote) return reply({ error: 'This quote link is not valid.' }, 404)

    if (action === 'confirm') return reply({ paid: await confirm(quote.id) })

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
