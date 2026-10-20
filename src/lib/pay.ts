import type { Assignment, Job, TimeEntry } from './types'

// Hours on the clock, minus breaks. An open entry counts up to now.
export function hoursWorked(entries: TimeEntry[]): number {
  return entries.reduce((sum, e) => {
    const end = e.clock_out ? new Date(e.clock_out).getTime() : Date.now()
    const ms = end - new Date(e.clock_in).getTime() - e.break_minutes * 60_000
    return sum + Math.max(ms, 0) / 3_600_000
  }, 0)
}

// What a mover is owed for a job: flat pay, or the hourly rate times hours worked
// (the job's estimate until they clock in)
export function assignmentPay(a: Assignment, job: Pick<Job, 'est_hours'>, entries: TimeEntry[]): number {
  if (a.status === 'declined' || a.status === 'removed') return 0
  if (a.pay_type !== 'hourly') return Number(a.crew_pay)
  const hours = entries.length ? hoursWorked(entries) : Number(job.est_hours ?? 0)
  return Number(a.crew_pay) * hours
}
