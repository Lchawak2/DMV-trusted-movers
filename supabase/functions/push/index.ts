// Phone notifications (web push) test: POST { action: 'test' } sends "Notifications work" to the
// signed-in admin's own phones and computers. The real alerts are sent by the notify function.
// Deployed with verify_jwt off like the other functions; it checks the caller is the admin itself.
// The private push key is read from the server_keys table.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// The public push key (also in src/lib/push.ts); the private one is in the server-only server_keys table
const VAPID = { subject: 'https://dmvtrustedmovers.org', publicKey: 'BEFIvX3pVduQGDcBz1H5AE5guLpn_PVqWXIf4cpSSuoyOVo8fxcPacW6MOO9BKZqb8MFPkuOzdN3-spUut8m9Lg', privateKey: '' }
async function vapidReady() {
  if (!VAPID.privateKey) {
    const { data } = await db.from('server_keys').select('value').eq('name', 'vapid_private').maybeSingle()
    VAPID.privateKey = data?.value ?? ''
  }
  return !!VAPID.privateKey
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string }
async function push(subs: Sub[], payload: object): Promise<number> {
  let sent = 0
  for (const s of subs) {
    const d = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { vapidDetails: VAPID, TTL: 86400, urgency: 'high' })
    const res = await fetch(d.endpoint, { method: d.method, headers: d.headers as Record<string, string>, body: d.body })
    if (res.ok) sent++
    // The phone turned notifications off or the app was removed: forget it
    else if (res.status === 404 || res.status === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
    else console.error('push failed', res.status, (await res.text()).slice(0, 200))
  }
  return sent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer /, '')
    const { data: user } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } }
    if (!user.user) return reply({ error: 'Please sign in again.' }, 401)
    const { data: account } = await db.from('accounts').select('role, active').eq('id', user.user.id).maybeSingle()
    if (account?.role !== 'admin' || !account.active) return reply({ error: 'Only the admin can do this.' }, 403)
    if (!(await vapidReady())) return reply({ error: 'Notifications are not set up on the server yet.' })
    const { action } = await req.json()
    if (action !== 'test') return reply({ error: 'Unknown action' }, 400)
    const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('account_id', user.user.id)
    if (!subs?.length) return reply({ sent: 0, error: 'No phone is set up for notifications yet.' })
    const sent = await push(subs, { title: 'Notifications work', body: "You'll get one here when a customer pays a deposit.", url: '/', tag: 'test' })
    return reply(sent ? { sent } : { sent: 0, error: 'The notification service did not accept it. Turn notifications off and on again.' })
  } catch (e) {
    console.error('push:', e)
    return reply({ error: 'Something went wrong. Please try again.' }, 500)
  }
})
