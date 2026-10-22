import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parseDay } from '../../lib/format'
import { assignmentPay, hoursWorked } from '../../lib/pay'
import type { Account, Assignment, Job, TimeEntry } from '../../lib/types'

export type CrewRow = Assignment & { accounts: Pick<Account, 'full_name' | 'email' | 'phone' | 'zelle'> | null; time_entries: TimeEntry[] }
type One<T> = T | T[] | null
export type JobRow = Job & {
  assignments: CrewRow[]
  truck_rentals: One<{ id: string }>
  job_costs: { amount: number }[]
  job_extras: { id: string; job_extra_prices: One<{ amount: number }> }[]
  job_signoffs: One<{ job_id: string }>
  job_prices: One<{ price: number; paid: number }>
}

const first = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v)
export const iso = (d: Date) => d.toLocaleDateString('en-CA')
export const addDays = (day: string, n: number) => { const d = parseDay(day); d.setDate(d.getDate() + n); return iso(d) }
export const needsTruck = (j: Job) => !!j.truck_size && j.job_type !== 'labor_only' && j.job_type !== 'packing'

// Monday to Sunday around a day
export function weekOf(day: string) {
  const start = addDays(day, -((parseDay(day).getDay() + 6) % 7))
  return { start, end: addDays(start, 6) }
}

export function monthOf(day: string) {
  const d = parseDay(day)
  return { start: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
}

// Jobs between two days with everything the dashboard and money screens add up
export function useJobs(from: string, to: string) {
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  useEffect(() => {
    supabase.from('jobs')
      .select('*, assignments(*, accounts(full_name, email, phone), time_entries(*)), truck_rentals(id), job_costs(amount), job_extras(id, job_extra_prices(amount)), job_signoffs(job_id), job_prices(price, paid)')
      .gte('job_date', from).lte('job_date', to)
      .neq('status', 'cancelled')
      .order('job_date').order('window_start')
      .then(({ data }) => setJobs((data ?? []) as JobRow[]))
  }, [from, to])
  return jobs
}

// Figures for one job, so every screen adds up the same way
export function figures(j: JobRow) {
  const price = first(j.job_prices)
  const extras = j.job_extras.reduce((s, x) => s + Number(first(x.job_extra_prices)?.amount ?? 0), 0)
  const charged = Number(price?.price ?? 0) + extras
  const crewPay = j.assignments.reduce((s, a) => s + assignmentPay(a, j, a.time_entries), 0)
  const costs = j.job_costs.reduce((s, c) => s + Number(c.amount), 0)
  const accepted = j.assignments.filter((a) => a.status === 'accepted')
  return {
    hasPrice: Number(price?.price ?? 0) > 0,
    charged, crewPay, costs, kept: charged - crewPay - costs,
    due: Math.max(charged - Number(price?.paid ?? 0), 0),
    accepted: accepted.length,
    lead: accepted.find((a) => a.role === 'lead') ?? null,
    waiting: j.assignments.filter((a) => a.status === 'offered').length,
    short: j.crew_size != null ? Math.max(j.crew_size - accepted.length, 0) : 0,
    truckOk: !needsTruck(j) || !!first(j.truck_rentals),
    signed: !!first(j.job_signoffs),
  }
}

// Pay owed to each mover across some jobs, most owed first
export function crewPay(jobs: JobRow[]) {
  const movers = new Map<string, { name: string; lead: boolean; jobs: number; hours: number; owed: number }>()
  for (const j of jobs) {
    for (const a of j.assignments.filter((x) => x.status === 'accepted')) {
      const m = movers.get(a.crew_id) ?? { name: a.accounts?.full_name ?? a.accounts?.email ?? 'Mover', lead: false, jobs: 0, hours: 0, owed: 0 }
      m.lead ||= a.role === 'lead'
      m.jobs += 1
      m.hours += hoursWorked(a.time_entries)
      m.owed += assignmentPay(a, j, a.time_entries)
      movers.set(a.crew_id, m)
    }
  }
  return [...movers.values()].sort((a, b) => b.owed - a.owed)
}

// Whole dollars read better on the summary screens
export const dollars = (n: number) => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
