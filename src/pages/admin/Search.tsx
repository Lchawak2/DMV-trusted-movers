import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dayHeading, windowText } from '../../lib/format'
import { JOB_TYPES, type Customer, type Job } from '../../lib/types'
import { BOOK_TYPES } from '../Book'
import { REQUEST_SELECT, requestState, type RequestRow } from './requestData'

type JobRow = Job & { move_requests: { customers: { full_name: string } | null } | null }

// Find any customer, quote request or job by name, phone, email or address
export default function Search() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const [found, setFound] = useState<{ requests: RequestRow[]; jobs: JobRow[] } | null>(null)

  useEffect(() => {
    if (!q) return setFound({ requests: [], jobs: [] })
    setFound(null)
    // Commas and brackets would break the filter text, so drop them
    const like = `%${q.replace(/[,()%]/g, ' ')}%`
    ;(async () => {
      const { data: people } = await supabase.from('customers').select('id')
        .or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(50)
      const ids = ((people ?? []) as Pick<Customer, 'id'>[]).map((c) => c.id)
      const byPerson = ids.length ? `,customer_id.in.(${ids.join(',')})` : ''
      const { data: reqs } = await supabase.from('move_requests').select(REQUEST_SELECT)
        .or(`from_address.ilike.${like},to_address.ilike.${like}${byPerson}`)
        .order('created_at', { ascending: false }).limit(50)
      const requests = (reqs ?? []) as RequestRow[]
      const reqIds = requests.map((r) => r.id)
      const byRequest = reqIds.length ? `,request_id.in.(${reqIds.join(',')})` : ''
      const { data: jobs } = await supabase.from('jobs')
        .select('*, move_requests!jobs_request_id_fkey(customers(full_name))')
        .or(`from_address.ilike.${like},to_address.ilike.${like}${byRequest}`)
        .order('job_date', { ascending: false }).limit(50)
      setFound({ requests, jobs: (jobs ?? []) as JobRow[] })
    })()
  }, [q])

  return (
    <Layout>
      <h2 className="dash-date">Search: {q}</h2>
      {!found && <p className="muted center">Searching…</p>}
      {found && !found.jobs.length && !found.requests.length && (
        <p className="muted center">Nothing matches "{q}". Try part of a name, a phone number or a street.</p>
      )}
      {!!found?.jobs.length && (
        <section className="card">
          <h3>Jobs</h3>
          <ul className="list">
            {found.jobs.map((j) => (
              <li key={j.id}>
                <div className="list-main">
                  <Link to={`/jobs/${j.id}`}><strong>{j.move_requests?.customers?.full_name ?? JOB_TYPES[j.job_type] ?? j.job_type}</strong></Link>
                  <div className="muted small">{dayHeading(j.job_date)} · {windowText(j.window_start, j.window_end)} · {j.from_address}</div>
                </div>
                <span className="pill info">{j.status.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!found?.requests.length && (
        <section className="card">
          <h3>Quote requests</h3>
          <ul className="list">
            {found.requests.map((r) => {
              const state = requestState(r)
              return (
                <li key={r.id}>
                  <div className="list-main">
                    <Link to={`/requests/${r.id}`}><strong>{r.customers?.full_name ?? 'Customer'}</strong></Link>
                    <div className="muted small">
                      {BOOK_TYPES[r.move_type] ?? JOB_TYPES[r.move_type] ?? r.move_type} · {dayHeading(r.preferred_date)}
                      {r.customers?.phone ? ` · ${r.customers.phone}` : ''}
                    </div>
                  </div>
                  <span className={`pill ${state.pill}`}>{state.label}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </Layout>
  )
}
