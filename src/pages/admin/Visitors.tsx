import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { parseDay } from '../../lib/format'
import { addDays, iso } from './jobData'
import { HBars, Tile, niceMax, pct, useWidth } from './Insights'

const PERIODS = { 1: 'Today', 7: '7 days', 30: '30 days', 90: '90 days' } as const
type Days = keyof typeof PERIODS

type Row = { label: string; n: number }
type Report = {
  visitors: number; visits: number; started: number; sent: number; priced: number; opened: number
  tapped_pay: number; called: number; booked: number; calls: number; median_secs_to_price: number | null
  days: { day: string; visitors: number }[]
  sources: { label: string; visits: number; priced: number; tapped_pay: number }[]
  devices: { label: string; visits: number; started: number; priced: number }[]
  stopped_at: { step: string; n: number }[]
  sizes: { label: string; priced: number; booked: number }[]
  pages: Row[]; call_places: Row[]; faq: Row[]; errors: Row[]
  scroll: { home_visits: number; half: number; most: number }
}

// The parts of the quote form in order, as the form names them
const STEPS: [string, string][] = [
  ['type', 'What they need'], ['size', 'Size of the move'], ['date', 'Date'],
  ['from', 'Moving from'], ['to', 'Moving to'], ['contact', 'Name, phone, email'],
]
const PAGES: Record<string, string> = { '/': 'Home page', '/book': 'Quote form', '/pricing': 'Prices page', '/policies': 'Policies', '/quote': 'Booking link' }
const DEVICES: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', computer: 'Computer' }

const share = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

// What visitors do on the website, from first page to booking, and where they drop off
export default function Visitors() {
  const [days, setDays] = useState<Days>(30)
  const [now, setNow] = useState<Report | null | undefined>(undefined)
  const [before, setBefore] = useState<Report | null>(null)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    const tomorrow = addDays(iso(new Date()), 1)
    const start = addDays(tomorrow, -days)
    const prev = addDays(start, -days)
    const at = (d: string) => parseDay(d).toISOString()
    let live = true
    setNow(undefined)
    Promise.all([
      supabase.rpc('site_report', { p_from: at(start), p_to: at(tomorrow) }),
      supabase.rpc('site_report', { p_from: at(prev), p_to: at(start) }),
    ]).then(([a, b]) => {
      if (!live) return
      setBroken(!!a.error)
      setNow((a.data as Report | null) ?? null)
      setBefore((b.data as Report | null) ?? null)
    })
    return () => { live = false }
  }, [days])

  const vs = days === 1 ? 'yesterday' : `the ${days} days before`

  return (
    <Layout title="Visitors" back="/">
      <section className="report">
        <div className="report-head">
          <h3>Website visitors</h3>
          <div className="segmented report-filter">
            {(Object.keys(PERIODS) as unknown as Days[]).map((d) => (
              <button key={d} type="button" className={Number(days) === Number(d) ? 'on' : ''} onClick={() => setDays(Number(d) as Days)}>{PERIODS[d]}</button>
            ))}
          </div>
        </div>

        {now === undefined ? <p className="muted">Loading…</p>
          : broken || !now ? <section className="card"><p className="muted">Visitor counting isn't switched on yet. It starts once the database update for it is added.</p></section>
          : <Body r={now} b={before} days={days} vs={vs} />}
      </section>
    </Layout>
  )
}

function Body({ r, b, days, vs }: { r: Report; b: Report | null; days: Days; vs: string }) {
  const change = (k: 'visitors' | 'started' | 'priced' | 'booked' | 'calls') => (b ? pct(r[k], b[k]) : null)
  const rate = r.visits ? (r.booked / r.visits) * 100 : 0
  const rateBefore = b?.visits ? (b.booked / b.visits) * 100 : 0
  const median = r.median_secs_to_price

  const stops = STEPS.map(([k, label]) => ({ label, n: r.stopped_at.find((s) => s.step === k)?.n ?? 0 })).filter((s) => s.n > 0)

  return (
    <>
      <div className="tiles">
        <Tile label="Visitors" value={String(r.visitors)} change={change('visitors')} vs={vs} sub={plural(r.visits, 'visit')} />
        <Tile label="Started a quote" value={String(r.started)} change={change('started')} vs={vs} sub={`${share(r.started, r.visits)}% of visits`} />
        <Tile label="Saw a price" value={String(r.priced)} change={change('priced')} vs={vs} sub={`${share(r.priced, r.started)}% of those who started`} />
        <Tile label="Booked" value={String(r.booked)} change={change('booked')} vs={vs} sub="deposits paid" />
        <Tile label="Visit to booking" value={`${rate.toFixed(1)}%`} change={b?.visits && r.visits ? rate - rateBefore : null} points vs={vs} sub="of visits booked" />
        <Tile label="Call taps" value={String(r.calls)} change={change('calls')} vs={vs} sub="tapped your number" />
        <Tile label="Time to a price" value={median == null ? 'None yet' : median < 90 ? `${Math.round(median)} sec` : `${Math.round(median / 60)} min`} sub="typical, from first answer" />
        <Tile label="Tapped Pay deposit" value={String(r.tapped_pay)} sub="on their booking link" />
      </div>

      <div className="report-grid">
        <div className="card panel wide-panel">
          <h4 className="chart-title">What to try next</h4>
          <ul className="tips">{tips(r).map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        <div className="card panel">
          <h4 className="chart-title">From visit to booking</h4>
          <HBars rows={[
            { label: 'Visited', n: r.visits },
            { label: 'Started a quote', n: r.started, sub: `${share(r.started, r.visits)}% of visits` },
            { label: 'Saw a price', n: r.priced, sub: `${share(r.priced, r.visits)}% of visits` },
            { label: 'Opened booking link', n: r.opened, sub: `${share(r.opened, r.visits)}% of visits` },
            { label: 'Tapped Pay deposit', n: r.tapped_pay, sub: `${share(r.tapped_pay, r.visits)}% of visits` },
            { label: 'Booked', n: r.booked, sub: 'deposits paid' },
          ]} empty="" />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Where people leave the quote form</h4>
          <p className="muted small">The last part they touched before leaving without sending</p>
          <HBars rows={stops} empty="Nobody has left the form part way yet." />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Where visitors come from</h4>
          <HBars rows={r.sources.map((s) => ({ label: s.label, n: s.visits, sub: `${s.priced} saw a price` }))} empty="No visits yet." />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Phones and computers</h4>
          <HBars rows={r.devices.map((d) => ({ label: DEVICES[d.label] ?? d.label, n: d.visits, sub: `${share(d.priced, d.visits)}% saw a price` }))} empty="No visits yet." />
        </div>
        {days > 1 && (
          <div className="card panel wide-panel">
            <h4 className="chart-title">Visitors per day</h4>
            <DayBars data={fillDays(r.days, days)} />
          </div>
        )}
        <div className="card panel">
          <h4 className="chart-title">Prices people saw</h4>
          <HBars rows={r.sizes.map((s) => ({ label: s.label, n: s.priced, sub: `${s.booked} tapped Book my date` }))} empty="No prices shown yet." />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Pages viewed</h4>
          <HBars rows={r.pages.map((p) => ({ label: PAGES[p.label] ?? p.label, n: p.n }))} empty="No pages viewed yet." />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Where people tap Call</h4>
          <HBars rows={r.call_places} empty="Nobody has tapped your number yet." />
        </div>
        <div className="card panel">
          <h4 className="chart-title">How far people read the home page</h4>
          <HBars rows={r.scroll.home_visits ? [
            { label: 'Opened it', n: r.scroll.home_visits },
            { label: 'Read half', n: r.scroll.half, sub: `${share(r.scroll.half, r.scroll.home_visits)}%` },
            { label: 'Read nearly all', n: r.scroll.most, sub: `${share(r.scroll.most, r.scroll.home_visits)}%` },
          ] : []} empty="Nobody opened the home page yet." />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Questions opened</h4>
          <HBars rows={r.faq} empty="Nobody opened a question yet." />
        </div>
        <div className="card panel">
          <h4 className="chart-title">Problems on the quote form</h4>
          <HBars rows={r.errors} empty="No problems so far." />
        </div>
      </div>
      <p className="muted small">No names, phone numbers, emails or addresses are kept here. Visits from people signed in as admin or crew aren't counted. See quote requests in <Link to="/requests">Quote requests</Link>.</p>
    </>
  )
}

// Plain advice from the numbers; each rule waits for enough visits so a couple of people don't decide it
function tips(r: Report): string[] {
  const out: string[] = []
  if (r.visits === 0) {
    out.push('No visitors counted yet. Your own visits never count, so the numbers fill in as customers visit your site.')
  } else if (r.visits < 20) {
    out.push(`Only ${plural(r.visits, 'visit')} so far. Advice shows up here once about 20 people have visited.`)
  } else if (share(r.started, r.visits) < 15) {
    out.push(`Only ${share(r.started, r.visits)}% of visits start a quote. Put the Get my price button and the price of a 1 bedroom move right at the top of the home page.`)
  }

  const stops = r.stopped_at.reduce((s, x) => s + x.n, 0)
  const worst = [...r.stopped_at].sort((a, b) => b.n - a.n)[0]
  if (worst && worst.n >= 3 && worst.n / stops >= 0.3) {
    const advice: Record<string, string> = {
      type: 'Many leave right at the start. Make the first question quicker to answer.',
      size: 'Many leave at the size question. Showing what each size usually includes may help.',
      date: 'Many leave at the date. People may not know their date yet; consider saying they can change it later for free.',
      from: 'Many leave at the moving from address. Saying the address is only used for the move may help.',
      to: 'Many leave at the moving to address. Some may not know it yet; let them write just the city.',
      contact: 'Many leave at name, phone and email. Say plainly the price shows right away and you never share their number.',
    }
    out.push(`${advice[worst.step] ?? 'Many leave the form at one part.'} (${worst.n} of ${stops} who left the form stopped there.)`)
  }

  if (r.priced >= 5 && share(r.tapped_pay, r.priced) < 20) {
    out.push(`${share(r.tapped_pay, r.priced)}% of people who saw a price tapped Pay deposit. Reviews, real photos of your crew, or the free cancellation line near the price can help people trust you.`)
  }

  const phone = r.devices.find((d) => d.label === 'phone'), computer = r.devices.find((d) => d.label === 'computer')
  if (phone && computer && phone.visits >= 10 && computer.visits >= 5 && share(phone.priced, phone.visits) * 2 < share(computer.priced, computer.visits)) {
    out.push('Phone visitors get a price much less often than computer visitors. Try the quote form on your own phone to see what slows it down.')
  }

  const quiet = r.sources.find((s) => s.label !== 'Direct' && s.visits >= 10 && s.priced === 0)
  if (quiet) out.push(`${quiet.visits} visits came from ${quiet.label} but none saw a price. Check what those visitors land on, or spend less there.`)

  if (r.calls >= 3 && r.calls >= r.priced) out.push(`More people tap your number (${r.calls}) than get a price online (${r.priced}). Keep your phone close and answer quickly, since callers are ready to book.`)

  if (r.median_secs_to_price != null && r.median_secs_to_price > 240) {
    out.push(`It takes about ${Math.round(r.median_secs_to_price / 60)} minutes to get a price. Cutting optional questions would make it faster.`)
  }

  if (r.errors[0] && r.errors[0].n >= 3) out.push(`The most common problem on the form is "${r.errors[0].label}" (${plural(r.errors[0].n, 'time')}). Making that clearer would help.`)

  if (r.faq[0] && r.faq[0].n >= 5) out.push(`The question opened most is "${r.faq[0].label}". Answer it higher up on the home page.`)

  if (r.scroll.home_visits >= 20 && share(r.scroll.half, r.scroll.home_visits) < 30) {
    out.push(`Only ${share(r.scroll.half, r.scroll.home_visits)}% read past the middle of the home page. Keep prices and the Get my price button near the top.`)
  }

  if (r.visits >= 20 && out.length === 0) out.push('Nothing stands out right now. Keep an eye on where people leave the form as more people visit.')
  return out
}

// Every day in the period, with zero for days nobody came
function fillDays(rows: { day: string; visitors: number }[], days: number) {
  const today = iso(new Date())
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1)
    return { day, n: rows.find((r) => r.day === day)?.visitors ?? 0 }
  })
}

const H = 150, PAD = { top: 8, right: 8, bottom: 20, left: 32 }
const BAR = '#2563eb'

function DayBars({ data }: { data: { day: string; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [ref, W] = useWidth()
  const most = niceMax(Math.max(...data.map((d) => d.n)))
  const top = Math.max(4, most + (most % 2))
  const y = (v: number) => PAD.top + ((top - v) / top) * (H - PAD.top - PAD.bottom)
  const slot = (W - PAD.left - PAD.right) / data.length
  const bar = Math.max(1, Math.min(18, slot - 2))
  const label = (day: string) => parseDay(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const ticks = [0, Math.floor((data.length - 1) / 2), data.length - 1]
  const h = hover === null ? null : data[hover]

  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Visitors per day">
        {[top, top / 2, 0].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'chart-base' : 'chart-grid'} />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" className="chart-axis">{v}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
            <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={H - PAD.top - PAD.bottom} fill={hover === i ? 'rgba(15,23,42,0.04)' : 'transparent'} />
            {d.n > 0 && <rect x={PAD.left + i * slot + (slot - bar) / 2} y={y(d.n)} width={bar} height={y(0) - y(d.n)} rx={Math.min(3, bar / 2)} fill={BAR} />}
          </g>
        ))}
        {ticks.map((i, k) => (
          <text key={i} x={PAD.left + i * slot + slot / 2} y={H - 6} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'} className="chart-axis">{label(data[i].day)}</text>
        ))}
      </svg>
      <p className="chart-tip">{h ? `${label(h.day)}: ${plural(h.n, 'visitor')}` : 'Tap a day to see its visitors'}</p>
    </div>
  )
}
