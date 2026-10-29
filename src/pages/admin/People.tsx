import { useCallback, useEffect, useState } from 'react'
import Layout from '../../components/Layout'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { TRUCK_SIZES, type Account, type CrewPapers, type Role } from '../../lib/types'
import { dateTime, parseDay } from '../../lib/format'
import { papersDone } from '../../lib/papers'

export default function People() {
  const { account: me } = useAuth()
  const [people, setPeople] = useState<Account[]>([])
  const [customerIds, setCustomerIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [papers, setPapers] = useState<Record<string, CrewPapers>>({})
  const [free, setFree] = useState<Record<string, string[]>>({})

  const load = useCallback(() => {
    supabase.from('accounts').select('*').order('role').order('full_name')
      .then(({ data }) => setPeople((data ?? []) as Account[]))
    // Customers who saved their bookings into an account aren't crew sign-ups
    supabase.from('customers').select('account_id').not('account_id', 'is', null)
      .then(({ data }) => setCustomerIds(new Set((data ?? []).map((c) => c.account_id as string))))
    supabase.from('crew_papers').select('*')
      .then(({ data }) => setPapers(Object.fromEntries(((data ?? []) as CrewPapers[]).map((p) => [p.crew_id, p]))))
    // Days each mover marked free in the next two weeks
    const today = new Date()
    const until = new Date(today)
    until.setDate(today.getDate() + 13)
    supabase.from('crew_availability').select('crew_id, day').gte('day', today.toLocaleDateString('en-CA'))
      .lte('day', until.toLocaleDateString('en-CA')).order('day')
      .then(({ data }) => {
        const byCrew: Record<string, string[]> = {}
        for (const r of data ?? []) (byCrew[r.crew_id as string] ??= []).push(r.day as string)
        setFree(byCrew)
      })
  }, [])

  useEffect(() => { load() }, [load])

  async function update(person: Account, changes: Partial<Account>) {
    setError(null)
    if (changes.active === false) {
      // Edge case: don't switch off someone who still has upcoming jobs
      const today = new Date().toLocaleDateString('en-CA')
      const { count } = await supabase.from('assignments')
        .select('id, jobs!inner(job_date)', { count: 'exact', head: true })
        .eq('crew_id', person.id).in('status', ['offered', 'accepted']).gte('jobs.job_date', today)
      if (count) {
        return setError(`${person.full_name ?? person.email} still has ${count} upcoming job(s). Reassign them first.`)
      }
    }
    await supabase.from('accounts').update(changes).eq('id', person.id)
    load()
  }

  const waiting = people.filter((p) => p.role === 'client' && p.active && !customerIds.has(p.id))
  const crew = people.filter((p) => p.role === 'crew')
  const admins = people.filter((p) => p.role === 'admin')

  return (
    <Layout>
      <h2>People</h2>
      {error && <p className="warn">{error}</p>}

      <section className="card">
        <h3>Waiting for approval</h3>
        <p className="muted small">New sign-ups land here and send their photo ID and the crew rules while they wait. Only approve people you've hired.</p>
        {waiting.length === 0 && <p className="muted">No one waiting.</p>}
        <ul className="list">
          {waiting.map((p) => (
            <li key={p.id} className="stack">
              <div className="row spread">
                <div className="list-main"><strong>{p.full_name ?? '(no name)'}</strong><div className="muted small">{[p.phone, p.email].filter(Boolean).join(' · ')}</div></div>
                <button className="secondary" onClick={() => update(p, { role: 'crew' })}>Add to crew</button>
              </div>
              <PapersRow papers={papers[p.id]} crewId={p.id} onChange={load} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Crew ({crew.filter((p) => p.active).length} active)</h3>
        {crew.length === 0 && <p className="muted">No crew yet.</p>}
        <ul className="list">
          {crew.map((p) => (
            <li key={p.id} className={`stack ${p.active ? '' : 'faded'}`}>
              <div className="list-main">
                <strong>{p.full_name ?? p.email}</strong>
                <div className="muted small">{[p.phone, p.email, p.language === 'es' ? 'Español' : null].filter(Boolean).join(' · ')}</div>
              </div>
              <label className="check">
                <input type="checkbox" checked={p.can_lead} onChange={(e) => update(p, { can_lead: e.target.checked })} />
                Can lead a job
              </label>
              <div className="chips">
                <span className="muted small">Can drive:</span>
                {TRUCK_SIZES.map((size) => {
                  const on = p.truck_sizes.includes(size)
                  return (
                    <button key={size} className={`chip ${on ? 'on' : ''}`}
                      onClick={() => update(p, { truck_sizes: on ? p.truck_sizes.filter((s) => s !== size) : [...p.truck_sizes, size] })}>
                      {size}
                    </button>
                  )
                })}
              </div>
              <label className="zelle">
                Zelle
                <input defaultValue={p.zelle ?? ''} maxLength={100} placeholder="Phone or email"
                  onBlur={(e) => e.target.value.trim() !== (p.zelle ?? '') && update(p, { zelle: e.target.value.trim() || null })} />
              </label>
              <PapersRow papers={papers[p.id]} crewId={p.id} onChange={load} />
              <div className="muted small">
                Free next 2 weeks: {free[p.id]?.length
                  ? free[p.id].map((d) => parseDay(d).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })).join(', ')
                  : 'no days marked'}
              </div>
              <div className="row">
                <button className="link" onClick={() => update(p, { active: !p.active })}>{p.active ? 'Switch off' : 'Switch back on'}</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Admins</h3>
        <ul className="list">
          {admins.map((p) => (
            <li key={p.id}>
              <div className="list-main"><strong>{p.full_name ?? p.email}</strong>{p.id === me?.id && <span className="muted"> (you)</span>}</div>
              {p.id !== me?.id && (
                <div className="list-side"><button className="link" onClick={() => update(p, { role: 'crew' as Role })}>Make crew</button></div>
              )}
            </li>
          ))}
        </ul>
        <p className="muted small">To add another admin, add them to the crew first, then ask Claude to promote them.</p>
      </section>
    </Layout>
  )
}

// Photo ID and crew rules. Files open from the private bucket with a link that lasts 10 minutes.
function PapersRow({ papers, crewId, onChange }: { papers: CrewPapers | undefined; crewId: string; onChange: () => void }) {
  async function open(path: string) {
    // Open the tab first so phones don't block it as a pop-up
    const tab = window.open('', '_blank')
    const { data } = await supabase.storage.from('crew-docs').createSignedUrl(path, 600)
    if (data && tab) tab.location.href = data.signedUrl
    else tab?.close()
  }
  async function setOk(ok: boolean) {
    await supabase.from('crew_papers').upsert({ crew_id: crewId, admin_ok_at: ok ? new Date().toISOString() : null }, { onConflict: 'crew_id' })
    onChange()
  }
  const doc = (label: string, path: string | null | undefined) =>
    path ? <button className="link" onClick={() => open(path)}>{label} ✓</button> : <span className="tone-warn">{label} missing</span>

  return (
    <div className="small papers-row">
      <span className={papersDone(papers) ? 'tone-good' : 'tone-warn'}><strong>Papers:</strong></span>
      {doc('Photo ID', papers?.id_path)}
      {papers?.rules_accepted_at
        ? <span title={dateTime(papers.rules_accepted_at)}>Rules ✓ (signed as {papers.rules_name})</span>
        : <span className="tone-warn">Rules not agreed</span>}
      {papers?.admin_ok_at
        ? <span className="tone-good">Checked by you · <button className="link" onClick={() => setOk(false)}>Undo</button></span>
        : <button className="link" onClick={() => setOk(true)}>{papersDone(papers) ? 'Mark checked' : 'Got them another way'}</button>}
    </div>
  )
}
