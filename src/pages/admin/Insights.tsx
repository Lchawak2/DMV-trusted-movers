import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parseDay } from '../../lib/format'
import { addDays, dollars, figures, iso, monthOf, useJobs, weekOf, type JobRow } from './jobData'

// Chart colors: booked and kept are told apart by color and by the legend
const BOOKED = '#2563eb'
const KEPT = '#0d9488'

const monthName = (day: string) => parseDay(day).toLocaleDateString('en-US', { month: 'short' })
const shortDay = (day: string) => parseDay(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// How the business is doing: money by month, moves per week, quotes, and what's booked ahead
export default function Insights() {
  const today = iso(new Date())
  const thisMonth = monthOf(today)
  const first = parseDay(thisMonth.start)
  const months = Array.from({ length: 6 }, (_, i) => monthOf(iso(new Date(first.getFullYear(), first.getMonth() - 5 + i, 1))))
  const weekStart = addDays(weekOf(today).start, -7 * 11)
  const from = months[0].start < weekStart ? months[0].start : weekStart
  const jobs = useJobs(from, addDays(today, 30))
  const quotes = useQuoteCounts(thisMonth.start)

  if (!jobs) return null

  const money = months.map((m) => {
    const inMonth = jobs.filter((j) => j.job_date >= m.start && j.job_date <= m.end)
    return { label: monthName(m.start), booked: sum(inMonth, (j) => figures(j).charged), kept: sum(inMonth, (j) => figures(j).kept) }
  })
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(weekStart, i * 7)
    const end = addDays(start, 6)
    return { label: shortDay(start), n: jobs.filter((j) => j.job_date >= start && j.job_date <= end).length }
  })
  const ahead = jobs.filter((j) => j.job_date > today && j.job_date <= addDays(today, 30))

  return (
    <section className="card insights">
      <div className="card-head"><h3>How the business is doing</h3></div>

      <div className="kpis">
        <div className="kpi">
          <div className="muted small">Next 30 days</div>
          <div className="kpi-value">{ahead.length} {ahead.length === 1 ? 'move' : 'moves'}</div>
          <div className="muted small">booked so far</div>
        </div>
        <div className="kpi">
          <div className="muted small">Next 30 days</div>
          <div className="kpi-value">{dollars(sum(ahead, (j) => figures(j).charged))}</div>
          <div className="muted small">money booked</div>
        </div>
      </div>

      <h4 className="chart-title">Money by month</h4>
      <div className="chart-legend">
        <span><i style={{ background: BOOKED }} />Booked</span>
        <span><i style={{ background: KEPT }} />Kept</span>
      </div>
      <MoneyBars data={money} />

      <h4 className="chart-title">Moves per week</h4>
      <WeekLine data={weeks} />

      <h4 className="chart-title">Quotes this month</h4>
      {quotes ? <Funnel steps={[['Requests', quotes.requests], ['Quoted', quotes.quoted], ['Booked', quotes.booked]]} /> : <p className="muted small">Loading…</p>}
    </section>
  )
}

const sum = (jobs: JobRow[], f: (j: JobRow) => number) => jobs.reduce((s, j) => s + f(j), 0)

function useQuoteCounts(since: string) {
  const [counts, setCounts] = useState<{ requests: number; quoted: number; booked: number } | null>(null)
  useEffect(() => {
    supabase.from('move_requests').select('status, quotes(id)').gte('created_at', since)
      .then(({ data }) => {
        const rows = (data ?? []) as { status: string; quotes: { id: string }[] }[]
        setCounts({
          requests: rows.length,
          quoted: rows.filter((r) => r.quotes.length > 0 || r.status === 'accepted').length,
          booked: rows.filter((r) => r.status === 'accepted').length,
        })
      })
  }, [since])
  return counts
}

// Round the top of the scale up to a tidy number so the grid lines read well
function niceMax(n: number) {
  if (n <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(n))
  return Math.ceil(n / step) * step
}

const W = 320, H = 150, PAD = { top: 8, right: 8, bottom: 20, left: 44 }

function MoneyBars({ data }: { data: { label: string; booked: number; kept: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const top = niceMax(Math.max(...data.map((d) => Math.max(d.booked, d.kept))))
  const low = Math.min(0, ...data.map((d) => d.kept))
  const bottom = low < 0 ? -niceMax(-low) : 0
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * (H - PAD.top - PAD.bottom)
  const slot = (W - PAD.left - PAD.right) / data.length
  const bar = Math.min(16, (slot - 10) / 2)
  const h = hover === null ? null : data[hover]

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Money booked and kept for the last 6 months">
        {[top, top / 2, 0, bottom].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'chart-base' : 'chart-grid'} />
            {v >= 0 && <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" className="chart-axis">{dollars(v)}</text>}
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * slot + (slot - bar * 2 - 2) / 2
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={H - PAD.top - PAD.bottom} fill={hover === i ? 'rgba(15,23,42,0.04)' : 'transparent'} />
              <Bar x={x} w={bar} y0={y(0)} y1={y(d.booked)} color={BOOKED} />
              <Bar x={x + bar + 2} w={bar} y0={y(0)} y1={y(d.kept)} color={KEPT} />
              <text x={PAD.left + i * slot + slot / 2} y={H - 6} textAnchor="middle" className="chart-axis">{d.label}</text>
            </g>
          )
        })}
      </svg>
      <p className="chart-tip">{h ? `${h.label}: ${dollars(h.booked)} booked, ${dollars(h.kept)} kept` : 'Tap a month to see its numbers'}</p>
    </div>
  )
}

// A bar with a rounded end away from the baseline; goes down when the value is below zero
function Bar({ x, w, y0, y1, color }: { x: number; w: number; y0: number; y1: number; color: string }) {
  const hgt = Math.abs(y0 - y1)
  if (hgt < 0.5) return null
  const r = Math.min(4, hgt, w / 2)
  const up = y1 < y0
  const d = up
    ? `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`
    : `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`
  return <path d={d} fill={color} />
}

function WeekLine({ data }: { data: { label: string; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  // An even top keeps the middle grid line on a whole number of moves
  const most = niceMax(Math.max(...data.map((d) => d.n)))
  const top = Math.max(4, most + (most % 2))
  const y = (v: number) => PAD.top + ((top - v) / top) * (H - PAD.top - PAD.bottom)
  const step = (W - PAD.left - PAD.right) / (data.length - 1)
  const x = (i: number) => PAD.left + i * step
  const points = data.map((d, i) => `${x(i)},${y(d.n)}`).join(' ')
  const h = hover === null ? null : data[hover]

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Moves per week for the last 12 weeks">
        {[top, top / 2, 0].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'chart-base' : 'chart-grid'} />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" className="chart-axis">{v}</text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} className="chart-grid" />}
        <polyline points={points} fill="none" stroke={BOOKED} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <circle cx={x(hover)} cy={y(data[hover].n)} r={4} fill={BOOKED} stroke="#fff" strokeWidth={2} />}
        {[0, 4, 8, 11].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === 11 ? 'end' : 'middle'} className="chart-axis">{data[i].label}</text>
        ))}
        {data.map((_, i) => (
          <rect key={i} x={x(i) - step / 2} y={PAD.top} width={step} height={H - PAD.top - PAD.bottom} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)} />
        ))}
      </svg>
      <p className="chart-tip">{h ? `Week of ${h.label}: ${h.n} ${h.n === 1 ? 'move' : 'moves'}` : 'Tap a week to see its moves'}</p>
    </div>
  )
}

function Funnel({ steps }: { steps: [string, number][] }) {
  const top = Math.max(1, steps[0][1])
  return (
    <div className="funnel">
      {steps.map(([label, n]) => (
        <div key={label} className="funnel-row">
          <span className="funnel-label">{label}</span>
          <span className="funnel-track"><span style={{ width: `${(n / top) * 100}%`, background: BOOKED }} /></span>
          <strong className="funnel-n">{n}</strong>
        </div>
      ))}
    </div>
  )
}
