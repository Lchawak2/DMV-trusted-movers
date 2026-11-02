import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parseDay } from '../../lib/format'
import { addDays, iso } from './jobData'
import { HBars } from './Insights'

type Ev = { session: string; visitor: string; name: string; props: Record<string, unknown> }
type Ads = { visits: number; people: number; started: number; sent: number; priced: number; tapped_pay: number; called: number; allSent: number }

const share = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)

// Every row of a query, a page at a time (the API hands back at most 1000 rows per call)
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>) {
  const out: T[] = []
  for (let i = 0; ; i += 1000) {
    const { data } = await page(i, i + 999)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

async function load(days: number): Promise<Ads> {
  const tomorrow = addDays(iso(new Date()), 1)
  const from = parseDay(addDays(tomorrow, -days)).toISOString()
  const to = parseDay(tomorrow).toISOString()
  const range = () => supabase.from('site_events').select('session, visitor, name, props').gte('at', from).lt('at', to)

  // A visit counts as from Google Ads when its first page came from an ad click
  const views = await all<Ev>((a, b) => range().eq('name', 'page_view').order('at').order('id').range(a, b))
  const first = new Map<string, string>()
  for (const v of views) if (!first.has(v.session)) first.set(v.session, String(v.props?.source ?? ''))
  const ids = [...first].filter(([, s]) => s === 'Google Ads').map(([id]) => id)

  const sent = await all<Ev>((a, b) => range().eq('name', 'book_submit').order('id').range(a, b))
  const ev: Ev[] = []
  for (let i = 0; i < ids.length; i += 100) {
    ev.push(...await all<Ev>((a, b) => range().in('session', ids.slice(i, i + 100)).neq('name', 'page_view').order('id').range(a, b)))
  }
  const visits = (names: string[]) => new Set(ev.filter((e) => names.includes(e.name)).map((e) => e.session)).size
  return {
    visits: ids.length,
    people: new Set(views.filter((v) => ids.includes(v.session)).map((v) => v.visitor)).size,
    started: visits(['book_start', 'quick_quote']),
    sent: visits(['book_submit']),
    priced: visits(['price_shown']),
    tapped_pay: visits(['deposit_click']),
    called: visits(['call_click']),
    allSent: new Set(sent.map((e) => e.session)).size,
  }
}

// What people who clicked a Google ad did on the site, from the same visitor counts as the rest of the page
export default function AdsPanel({ days }: { days: number }) {
  const [a, setA] = useState<Ads | null>(null)
  useEffect(() => {
    let live = true
    setA(null)
    load(days).then((r) => { if (live) setA(r) })
    return () => { live = false }
  }, [days])

  return (
    <div className="card panel wide-panel">
      <h4 className="chart-title">From your Google ads</h4>
      {!a ? <p className="muted small">Loading…</p>
        : a.visits === 0 ? <p className="muted small">No visits from your Google ads in this period yet. They show up here as soon as someone clicks an ad.</p>
        : <>
          <p className="muted small">
            {a.visits} {a.visits === 1 ? 'visit' : 'visits'} from ad clicks ({a.people} {a.people === 1 ? 'person' : 'people'}).
            {' '}{a.sent} sent a quote request{a.allSent ? `, ${share(a.sent, a.allSent)}% of all quote requests` : ''}.
          </p>
          <HBars rows={[
            { label: 'Clicked an ad', n: a.visits },
            { label: 'Started a quote', n: a.started, sub: `${share(a.started, a.visits)}% of ad visits` },
            { label: 'Sent a quote request', n: a.sent, sub: `${share(a.sent, a.visits)}% of ad visits` },
            { label: 'Saw a price', n: a.priced, sub: `${share(a.priced, a.visits)}% of ad visits` },
            { label: 'Tapped Pay deposit', n: a.tapped_pay, sub: `${share(a.tapped_pay, a.visits)}% of ad visits` },
            { label: 'Tapped Call', n: a.called, sub: `${share(a.called, a.visits)}% of ad visits` },
          ]} empty="" />
          {a.visits >= 20 && a.sent === 0 && <p className="note">{a.visits} ad visits and no quote requests yet. Check which page your ad sends people to, and try the quote form on your phone.</p>}
        </>}
    </div>
  )
}
