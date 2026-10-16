// Dates come from Postgres as 'YYYY-MM-DD'; parse as local dates so they don't shift a day.
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dayHeading(day: string): string {
  const date = parseDay(day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (diff === 0) return `Today · ${label}`
  if (diff === 1) return `Tomorrow · ${label}`
  return label
}

export function countdown(day: string, time: string | null): string {
  const [h, m] = (time ?? '08:00').split(':').map(Number)
  const start = parseDay(day)
  start.setHours(h, m)
  const hours = Math.round((start.getTime() - Date.now()) / 3_600_000)
  if (hours < 0) return 'Started'
  if (hours < 48) return `Starts in ${hours} hours`
  return `In ${Math.round(hours / 24)} days`
}

export function clock(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function windowText(start: string | null, end: string | null): string {
  if (!start) return 'Time to be set'
  if (!end) return clock(start)
  const [a, b] = [clock(start), clock(end)]
  // '8:00 AM' + '9:00 AM' reads as '8:00 to 9:00 AM'
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} to ${b}` : `${a} to ${b}`
}

export function money(n: number | string | null | undefined): string {
  return `$${Number(n ?? 0).toFixed(2)}`
}

export function dateTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// <input type="datetime-local"> wants local 'YYYY-MM-DDTHH:mm'
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}
