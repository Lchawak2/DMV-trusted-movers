import { useCallback, useEffect, useState } from 'react'
import Layout from '../../components/Layout'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { TRUCK_SIZES, type Account, type Role } from '../../lib/types'

export default function People() {
  const { account: me } = useAuth()
  const [people, setPeople] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    supabase.from('accounts').select('*').order('role').order('full_name')
      .then(({ data }) => setPeople((data ?? []) as Account[]))
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

  const waiting = people.filter((p) => p.role === 'client' && p.active)
  const crew = people.filter((p) => p.role === 'crew')
  const admins = people.filter((p) => p.role === 'admin')

  return (
    <Layout>
      <h2>People</h2>
      {error && <p className="warn">{error}</p>}

      <section className="card">
        <h3>Waiting for approval</h3>
        <p className="muted small">New sign-ups land here. Only approve people you've hired.</p>
        {waiting.length === 0 && <p className="muted">No one waiting.</p>}
        <ul className="list">
          {waiting.map((p) => (
            <li key={p.id}>
              <div className="list-main"><strong>{p.full_name ?? '(no name)'}</strong><div className="muted small">{p.email}</div></div>
              <div className="list-side"><button className="secondary" onClick={() => update(p, { role: 'crew' })}>Add to crew</button></div>
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
