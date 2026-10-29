// A person deletes their own account (the app stores ask for this).
// POST { action: 'delete' } -> { deleted } for the signed-in crew member, sign-up or customer.
// Pay records and past moves stay for the books, with the name and contact details wiped.
// The login itself is soft deleted, so it can't sign in and its email can sign up again.
// Deployed with verify_jwt off like the other functions; it checks the caller itself.
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

// Errors with a message meant for the person
class Shown extends Error {}

const check = <T extends { error: unknown }>(r: T): T => {
  if (r.error) throw r.error
  return r
}

async function deleteAccount(id: string) {
  const { data: account } = check(await db.from('accounts').select('role').eq('id', id).maybeSingle())
  if (!account) throw new Shown('Account not found.')
  // The admin would lock the business out
  if (account.role === 'admin') throw new Shown('The admin account can\'t be deleted here.')

  // Take them off upcoming jobs first; the open spot alert tells the office
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const { data: upcoming } = check(await db.from('assignments').select('id, jobs!inner(job_date)')
    .eq('crew_id', id).in('status', ['offered', 'accepted']).gte('jobs.job_date', today))
  if (upcoming?.length) check(await db.from('assignments').update({ status: 'removed' }).in('id', upcoming.map((a) => a.id)))

  // Papers, days and location are theirs alone
  const { data: files } = check(await db.storage.from('crew-docs').list(id))
  if (files?.length) check(await db.storage.from('crew-docs').remove(files.map((f) => `${id}/${f.name}`)))
  check(await db.from('crew_papers').delete().eq('crew_id', id))
  check(await db.from('crew_availability').delete().eq('crew_id', id))
  check(await db.from('crew_locations').delete().eq('crew_id', id))

  // Their moves stay on the books but are no longer tied to a login
  check(await db.from('customers').update({ account_id: null }).eq('account_id', id))
  check(await db.from('accounts').update({
    full_name: 'Deleted account', phone: null, email: null, zelle: null, can_lead: false, active: false,
  }).eq('id', id))

  const { error } = await db.auth.admin.deleteUser(id, true)
  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer /, '')
    const { data } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } }
    if (!data.user) return reply({ error: 'Please sign in again.' }, 401)
    const { action } = await req.json()
    if (action === 'delete') {
      await deleteAccount(data.user.id)
      return reply({ deleted: true })
    }
    return reply({ error: 'Unknown action' }, 400)
  } catch (e) {
    if (e instanceof Shown) return reply({ error: e.message }, 400)
    console.error(e)
    return reply({ error: 'Your account could not be deleted. Please try again or call us.' }, 500)
  }
})
