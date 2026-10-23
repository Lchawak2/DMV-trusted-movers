import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { dayHeading, money } from '../../lib/format'
import { JOB_TYPES } from '../../lib/types'
import { addDays, figures, iso, useJobs } from './jobData'

export type Level = 'crit' | 'warn' | 'info'
export type Todo = { level: Level; title: string; detail: string; to: string; action: string }

// The last count, so the menu badge shows right away while it refreshes
let lastCount = 0
export const lastTodoCount = () => lastCount

// Needs you: what would go wrong if nobody acted, most urgent first
export function useTodos(): Todo[] | null {
  const today = iso(new Date())
  const jobs = useJobs(addDays(today, -30), addDays(today, 14))
  const [signups, setSignups] = useState<number | null>(null)
  const [requests, setRequests] = useState<number | null>(null)

  useEffect(() => {
    supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('role', 'client')
      .then(({ count }) => setSignups(count ?? 0))
    supabase.from('move_requests').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count }) => setRequests(count ?? 0))
  }, [])

  if (!jobs || signups === null || requests === null) return null

  const todos: Todo[] = []
  for (const j of jobs) {
    const f = figures(j)
    const name = `${JOB_TYPES[j.job_type] ?? j.job_type}, ${dayHeading(j.job_date)}`
    const to = `/jobs/${j.id}`
    if (j.job_date >= today) {
      const soon = j.job_date <= addDays(today, 2)
      if (f.short) todos.push({ level: soon ? 'crit' : 'warn', title: `Needs ${f.short} more ${f.short === 1 ? 'mover' : 'movers'}`, detail: name, to, action: 'Add crew' })
      if (!f.truckOk) todos.push({ level: soon ? 'crit' : 'warn', title: `No truck booked (${j.truck_size})`, detail: name, to, action: 'Book truck' })
      if (f.waiting) todos.push({ level: 'info', title: `${f.waiting} ${f.waiting === 1 ? 'offer' : 'offers'} waiting for an answer`, detail: name, to, action: 'Open' })
      if (!f.hasPrice) todos.push({ level: 'info', title: 'No customer price set', detail: name, to, action: 'Set price' })
    } else {
      if (j.status !== 'completed' && !f.signed) todos.push({ level: 'warn', title: 'Not signed off or completed', detail: name, to, action: 'Open' })
      else if (j.status !== 'completed') todos.push({ level: 'info', title: 'Signed, mark it completed', detail: name, to, action: 'Complete' })
      if (f.hasPrice && f.due > 0) todos.push({ level: 'warn', title: `Balance due ${money(f.due)}`, detail: name, to, action: 'Record pay' })
    }
  }
  if (requests) todos.push({ level: 'warn', title: `${requests} new quote ${requests === 1 ? 'request' : 'requests'}`, detail: 'Customers waiting for a price', to: '/requests', action: 'Quote' })
  if (signups) todos.push({ level: 'info', title: `${signups} ${signups === 1 ? 'sign-up' : 'sign-ups'} waiting`, detail: 'Approve crew in People', to: '/people', action: 'Review' })
  const rank: Record<Level, number> = { crit: 0, warn: 1, info: 2 }
  todos.sort((a, b) => rank[a.level] - rank[b.level])
  lastCount = todos.length
  return todos
}
