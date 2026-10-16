import type { ReactNode } from 'react'
import { dayHeading } from '../lib/format'
import type { Job } from '../lib/types'

export default function DayGroups<T extends { job: Job }>({ items, render, empty }: {
  items: T[]
  render: (item: T) => ReactNode
  empty: string
}) {
  if (items.length === 0) return <p className="muted center">{empty}</p>
  const days = new Map<string, T[]>()
  for (const item of items) {
    const list = days.get(item.job.job_date) ?? []
    list.push(item)
    days.set(item.job.job_date, list)
  }
  return (
    <>
      {[...days.entries()].map(([day, list]) => (
        <section key={day}>
          <h3 className="day">
            <span>{dayHeading(day)}</span>
            <span>{list.length} {list.length === 1 ? 'job' : 'jobs'}</span>
          </h3>
          {list.map(render)}
        </section>
      ))}
    </>
  )
}
