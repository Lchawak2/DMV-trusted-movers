// Texts from the business number, through Twilio.
// POST { action: 'status' } -> { ready } whether Twilio is set up (the admin screens show Send text when it is)
// POST { action: 'send', to, body } -> { sent } the admin (signed in) texts a customer or their own phone
// Deployed with verify_jwt off like the other functions; it checks the caller is the admin itself.
// Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM saved as Edge Function secrets.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

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

const SID = Deno.env.get('TWILIO_ACCOUNT_SID')
const TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
const FROM = Deno.env.get('TWILIO_FROM')

// US numbers in any format to +1XXXXXXXXXX
function e164(phone: string): string | null {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return null
}

async function sendText(to: string, body: string) {
  if (!SID || !TOKEN || !FROM) throw new Error("Texting isn't set up yet. Save the three Twilio secrets in Supabase.")
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${SID}:${TOKEN}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: e164(FROM) ?? FROM, Body: body }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) throw new Error('Twilio did not accept the Account SID and Auth Token. Check both secrets in Supabase.')
  if (!res.ok) throw new Error(`Twilio: ${data?.message ?? res.status}`)
}

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
    if (!(await isAdmin(req))) return reply({ error: 'Only the admin can send texts.' }, 403)
    const { action, to, body } = await req.json()
    if (action === 'status') return reply({ ready: !!(SID && TOKEN && FROM) })
    if (action === 'send') {
      const number = typeof to === 'string' ? e164(to) : null
      if (!number) return reply({ error: 'That phone number does not look right.' }, 400)
      if (typeof body !== 'string' || !body.trim() || body.length > 1500) return reply({ error: 'The message is empty or too long.' }, 400)
      await sendText(number, body.trim())
      return reply({ sent: true })
    }
    return reply({ error: 'Unknown action' }, 400)
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
