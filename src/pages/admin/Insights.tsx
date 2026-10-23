import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parseDay } from '../../lib/format'
import { JOB_TYPES, LEAD_SOURCES, type LeadSource } from '../../lib/types'
import { addDays, dollars, figures, iso, monthOf, useJobs, weekOf, type JobRow } from './jobData'

// Chart colors: booked and kept are told apart by color and by the legend
const BOOKED = '#2563eb'
const KEPT = '#0d9488'

const PERIODS = { 1: 'This month', 3: '3 months', 6: '6 months', 12: '12 months' } as const
type Months = keyof typeof PERIODS

const monthName = (day: string) => parseDay(day).toLocaleDateString('en-US', { month: 'short' })
const shortDay = (day: string) => parseDay(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const sum = (jobs: JobRow[], f: (j: JobRow) => number) => jobs.reduce((s, j) => s + f(j), 0)

// The month that starts n months before (or after) the month of a day
function monthsFrom(day: string, n: number) {
  const d = parseDay(day)
  return monthOf(iso(new Date(d.getFullYear(), d.getMonth() + n, 1)))
}

type Request = { status: string; lead_source: LeadSource | null; created_at: string; quotes: { id: string }[] }

// A report of how the business is doing: tiles with the change from the period before, then graphs
export default function Insights() {
  const today = iso(new Date())
  const [months, setMonths] = useState<Months>(1)
  const start = monthsFrom(today, -(months - 1)).start
  const end = monthOf(today).end
  const prevStart = monthsFrom(today, -(months * 2 - 1)).start
  const prevEnd = addDays(start, -1)
  // Load two years so every filter and its comparison come from one fetch
  const earliest = monthsFrom(today, -23).start
  const jobs = useJobs(earliest, addDays(today, 31))
  const requests = useRequests(earliest)

  if (!jobs || !requests) return <section className="card report"><p className="muted">Loading the report…</p></section>

  const inside = (a: string, b: string) => jobs.filter((j) => j.job_date >= a && j.job_date <= b)
  const asked = (a: string, b: string) => requests.filter((r) => { const d = iso(new Date(r.created_at)); return d >= a && d <= b })
  const now = inside(start, end), before = inside(prevStart, prevEnd)
  const reqNow = asked(start, end), reqBefore = asked(prevStart, prevEnd)
  const totals = (list: JobRow[]) => {
    const booked = sum(list, (j) => figures(j).charged), kept = sum(list, (j) => figures(j).kept)
    return { booked, kept, moves: list.length, avg: list.length ? booked / list.length : 0, margin: booked ? (kept / booked) * 100 : 0 }
  }
  const rate = (list: Request[]) => (list.length ? (list.filter((r) => r.status === 'accepted').length / list.length) * 100 : 0)
  const a = totals(now), b = totals(before)
  const ahead = jobs.filter((j) => j.job_date > today && j.job_date <= addDays(today, 30))
  const vs = months === 1 ? 'last month' : `the ${months} months before`

  const chartMonths = months === 12 ? 12 : 6
  const money = Array.from({ length: chartMonths }, (_, i) => {
    const m = monthsFrom(today, i - chartMonths + 1)
    const list = inside(m.start, m.end)
    return { label: monthName(m.start), booked: sum(list, (j) => figures(j).charged), kept: sum(list, (j) => figures(j).kept) }
  })
  const weekStart = addDays(weekOf(today).start, -7 * 11)
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const s = addDays(weekStart, i * 7)
    return { label: shortDay(s), n: inside(s, addDays(s, 6)).length }
  })
  const sources = new Map<string, { n: number; booked: number }>()
  for (const r of reqNow) {
    const k = r.lead_source ? LEAD_SOURCES[r.lead_source] : 'Not known'
    const s = sources.get(k) ?? { n: 0, booked: 0 }
    s.n += 1
    if (r.status === 'accepted') s.booked += 1
    sources.set(k, s)
  }
  const types = new Map<string, number>()
  for (const j of now) { const k = JOB_TYPES[j.job_type] ?? j.job_type; types.set(k, (types.get(k) ?? 0) + 1) }

  return (
    <section className="report">
      <div className="report-head">
        <h3>How the business is doing</h3>
        <div className="segmented report-filter">
          {(Object.keys(PERIODS) as unknown as Months[]).map((m) => (
            <button key={m} type="button" className={Number(months) === Number(m) ? 'on' : ''} onClick={() => setMonths(Number(m) as Months)}>{PERIODS[m]}</button>
          ))}
        </div>
      </div>

      <div className="tiles">
        <Tile label="Money booked" value={dollars(a.booked)} change={pct(a.booked, b.booked)} vs={vs} />
        <Tile label="Money kept" value={dollars(a.kept)} change={pct(a.kept, b.kept)} vs={vs} />
        <Tile label="Margin" value={`${Math.round(a.margin)}%`} change={a.booked && b.booked ? a.margin - b.margin : null} points vs={vs} />
        <Tile label="Moves" value={String(a.moves)} change={pct(a.moves, b.moves)} vs={vs} />
        <Tile label="Average per move" value={dollars(a.avg)} change={pct(a.avg, b.avg)} vs={vs} />
        <Tile label="Quotes booked" value={`${Math.round(rate(reqNow))}%`} change={reqNow.length && reqBefore.length ? rate(reqNow) - rate(reqBefore) : null} points vs={vs} sub={`${reqNow.length} ${reqNow.length === 1 ? 'request' : 'requests'}`} />
        <Tile label="Next 30 days" value={`${ahead.length} ${ahead.length === 1 ? 'move' : 'moves'}`} sub="booked so far" />
        <Tile label="Next 30 days" value={dollars(sum(ahead, (j) => figures(j).charged))} sub="money booked" />
      </div>

      <div className="report-grid">
        <div className="card panel wide-panel">
          <h4 className="chart-title">Money by month</h4>
          <div className="chart-legend">
            <span><i style={{ background: BOOKED }} />Booked</span>
            <span><i style={{ background: KEPT }} />Kept</span>
          </div>
          <MoneyBars data={money} />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Moves per week</h4>
          <WeekLine data={weeks} />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Quotes · {PERIODS[months].toLowerCase()}</h4>
          <HBars rows={[
            { label: 'Requests', n: reqNow.length },
            { label: 'Quoted', n: reqNow.filter((r) => r.quotes.length > 0 || r.status === 'accepted').length },
            { label: 'Booked', n: reqNow.filter((r) => r.status === 'accepted').length },
          ]} empty="No quote requests yet." />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Where customers come from</h4>
          <HBars rows={[...sources.entries()].sort((x, y) => y[1].n - x[1].n).map(([label, s]) => ({ label, n: s.n, sub: `${s.booked} booked` }))} empty="No quote requests yet." />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Kinds of moves</h4>
          <HBars rows={[...types.entries()].sort((x, y) => y[1] - x[1]).map(([label, n]) => ({ label, n }))} empty="No moves yet." />
        </div>
      </div>
    </section>
  )
}

// Percent change, or nothing when there's no earlier number to compare with
function pct(now: number, before: number) {
  if (!before) return null
  return ((now - before) / Math.abs(before)) * 100
}

function Tile({ label, value, change, vs, points, sub }: { label: string; value: string; change?: number | null; vs?: string; points?: boolean; sub?: string }) {
  const shown = change != null && Number.isFinite(change)
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      <div className={`tile-sub${shown ? (change! >= 0 ? ' up' : ' down') : ''}`}>
        {shown ? `${change! >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(change!))}${points ? ' pts' : '%'} vs ${vs}` : sub ?? (vs ? `Nothing to compare yet` : '')}
      </div>
    </div>
  )
}

function useRequests(since: string) {
  const [rows, setRows] = useState<Request[] | null>(null)
  useEffect(() => {
    supabase.from('move_requests').select('status, lead_source, created_at, quotes(id)').gte('created_at', since)
      .then(({ data }) => setRows((data ?? []) as Request[]))
  }, [since])
  return rows
}

// Round the top of the scale up to a tidy number so the grid lines read well
function niceMax(n: number) {
  if (n <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(n))
  return Math.ceil(n / step) * step
}

const H = 170, PAD = { top: 8, right: 8, bottom: 20, left: 44 }

// Draw at the box's real width so text stays the same size however wide the panel is
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.max(240, el.clientWidth))
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function MoneyBars({ data }: { data: { label: string; booked: number; kept: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [ref, W] = useWidth()
  const top = niceMax(Math.max(...data.map((d) => Math.max(d.booked, d.kept))))
  const low = Math.min(0, ...data.map((d) => d.kept))
  const bottom = low < 0 ? -niceMax(-low) : 0
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * (H - PAD.top - PAD.bottom)
  const slot = (W - PAD.left - PAD.right) / data.length
  const bar = Math.min(24, (slot - 10) / 2)
  const h = hover === null ? null : data[hover]

  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Money booked and kept for the last 6 months">
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
  const [ref, W] = useWidth()
  // An even top keeps the middle grid line on a whole number of moves
  const most = niceMax(Math.max(...data.map((d) => d.n)))
  const top = Math.max(4, most + (most % 2))
  const y = (v: number) => PAD.top + ((top - v) / top) * (H - PAD.top - PAD.bottom)
  const step = (W - PAD.left - PAD.right) / (data.length - 1)
  const x = (i: number) => PAD.left + i * step
  const points = data.map((d, i) => `${x(i)},${y(d.n)}`).join(' ')
  const h = hover === null ? null : data[hover]

  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Moves per week for the last 12 weeks">
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

// Horizontal bars, longest first, each with its number at the end
function HBars({ rows, empty }: { rows: { label: string; n: number; sub?: string }[]; empty: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>
  const top = Math.max(1, ...rows.map((r) => r.n))
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar-row">
          <span className="hbar-label">{r.label}{r.sub && <span className="hbar-sub">{r.sub}</span>}</span>
          <span className="hbar-track"><span style={{ width: `${(r.n / top) * 100}%`, background: BOOKED }} /></span>
          <strong className="hbar-n">{r.n}</strong>
        </div>
      ))}
    </div>
  )
}
