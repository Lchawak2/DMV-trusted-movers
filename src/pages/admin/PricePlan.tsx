import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { HOME_MOVES, MOVE_RATE, SMALL_OFFICE, WEEKEND_FEE } from '../../lib/prices'
import { START_COSTS, cardFees, moverPay, saveCosts, useCosts, type Costs } from '../../lib/costs'
import { TRUCK_SIZES } from '../../lib/types'
import { dollars } from './jobData'

const PLANS = [...HOME_MOVES, SMALL_OFFICE]

// Same truck the instant quote picks (private.instant_price)
const truckFor = (size: string, hours: number) => (size === '2 bedrooms' || size === '3 bedrooms' || hours >= 6 ? '22 ft' : '16 ft')

// What one move of a size costs and leaves you, at its included hours
function planRow(c: Costs, plan: { size: string; price: number; hours: number }, weekend: boolean) {
  const price = plan.price + (weekend ? WEEKEND_FEE : 0)
  const each = moverPay(c, plan.hours)
  const crew = c.movers * each
  const truck = truckFor(plan.size, plan.hours)
  const truckCost = c.trucks[truck] ?? 0
  const card = cardFees(price)
  const cost = crew + truckCost + c.other + card
  return { price, each, crew, truck, truckCost, card, cost, kept: price - cost }
}

// The admin's prices next to what each move costs, with the costs they can change
export default function PricePlan() {
  const saved = useCosts()
  const [costs, setCosts] = useState<Costs | null>(null)
  const [weekend, setWeekend] = useState(false)
  const [state, setState] = useState<'' | 'saving' | 'saved' | 'error'>('')
  const [month, setMonth] = useState({ moves: 20, weekends: 10, size: '1 bedroom' })

  useEffect(() => { if (saved) setCosts(saved) }, [saved])
  if (!costs) return <Layout back="/money" title="Price plan"><p className="muted center">Loading…</p></Layout>

  const set = (patch: Partial<Costs>) => { setCosts({ ...costs, ...patch }); setState('') }
  const num = (v: string) => Math.max(Number(v) || 0, 0)

  async function save() {
    setState('saving')
    setState((await saveCosts(costs!)) ? 'error' : 'saved')
  }

  const extraKeep = MOVE_RATE - costs.movers * costs.moverRate - MOVE_RATE * 0.029
  const pick = PLANS.find((p) => p.size === month.size) ?? PLANS[1]
  const weekendMoves = Math.min(month.weekends, month.moves)
  const monthKept = (month.moves - weekendMoves) * planRow(costs, pick, false).kept + weekendMoves * planRow(costs, pick, true).kept

  return (
    <Layout back="/money" title="Price plan">
      <h2>Price plan</h2>
      <p className="note">Your prices next to what each move costs you. The app uses these same costs for the profit on quotes, on each job and in Money.</p>

      <div className="segmented wide">
        <button type="button" className={!weekend ? 'on' : ''} onClick={() => setWeekend(false)}>Weekday</button>
        <button type="button" className={weekend ? 'on' : ''} onClick={() => setWeekend(true)}>Saturday or Sunday</button>
      </div>

      <div className="plan-grid">
        {PLANS.map((p) => {
          const r = planRow(costs, p, weekend)
          const margin = r.price ? r.kept / r.price : 0
          return (
            <section className="card" key={p.size}>
              <div className="card-head">
                <h3>{p.size}</h3>
                <strong>{dollars(r.price)}</strong>
              </div>
              <div className="muted small">Up to {p.hours} hours{weekend ? `, includes ${dollars(WEEKEND_FEE)} weekend move` : ''}</div>
              <ul className="list">
                <li><span>Crew ({costs.movers} × {dollars(r.each)})</span><span>−{dollars(r.crew)}</span></li>
                <li><span>{r.truck} truck and gas</span><span>−{dollars(r.truckCost)}</span></li>
                <li><span>Other costs</span><span>−{dollars(costs.other)}</span></li>
                <li><span>Card fees</span><span>−{dollars(r.card)}</span></li>
                <li><span>Total cost</span><span>{dollars(r.cost)}</span></li>
                <li><strong>You keep</strong><strong className={r.kept < 0 ? 'warn' : margin < 0.2 ? 'tone-warn' : 'tone-good'}>{dollars(r.kept)} · {Math.round(margin * 100)}%</strong></li>
                <li><span>If you work it as one of the movers</span><strong>{dollars(r.kept + r.each)}</strong></li>
              </ul>
            </section>
          )
        })}
      </div>

      <section className="card">
        <h3>Each extra hour</h3>
        <p>The customer pays {dollars(MOVE_RATE)}. The crew gets {dollars(costs.movers * costs.moverRate)} ({costs.movers} × {dollars(costs.moverRate)}), card fees take about {dollars(MOVE_RATE * 0.029)}, so you keep about <strong className="tone-good">{dollars(extraKeep)}</strong>.</p>
      </section>

      <section className="card">
        <h3>A month of moves</h3>
        <div className="row">
          <label>Moves a month<input type="number" min={0} inputMode="numeric" value={month.moves} onChange={(e) => setMonth({ ...month, moves: num(e.target.value) })} /></label>
          <label>On weekends<input type="number" min={0} inputMode="numeric" value={month.weekends} onChange={(e) => setMonth({ ...month, weekends: num(e.target.value) })} /></label>
        </div>
        <label>Most are<select value={month.size} onChange={(e) => setMonth({ ...month, size: e.target.value })}>
          {PLANS.map((p) => <option key={p.size}>{p.size}</option>)}
        </select></label>
        <div className="total-row"><span>You'd keep about</span><span className={monthKept < 0 ? 'warn' : 'tone-good'}>{dollars(monthKept)} a month</span></div>
        <p className="note">Before your own pay if you work the moves, and before taxes.</p>
      </section>

      <section className="card">
        <h3>My costs</h3>
        <p className="note">Start with guesses and put in real numbers as you get them (truck quotes, what you pay movers). Only you see these.</p>
        <div className="row">
          <label>Mover pay per hour $<input type="number" min={0} step="0.5" inputMode="decimal" value={costs.moverRate} onChange={(e) => set({ moverRate: num(e.target.value) })} /></label>
          <label>Least a mover gets per job $<input type="number" min={0} step="1" inputMode="decimal" value={costs.moverMin} onChange={(e) => set({ moverMin: num(e.target.value) })} /></label>
        </div>
        <div className="row">
          <label>Movers on a job<input type="number" min={1} step="1" inputMode="numeric" value={costs.movers} onChange={(e) => set({ movers: Math.max(num(e.target.value), 1) })} /></label>
          <label>Other costs per move $<input type="number" min={0} step="1" inputMode="decimal" value={costs.other} onChange={(e) => set({ other: num(e.target.value) })} /></label>
        </div>
        <p className="note">Other costs are your share of insurance, phone, ads and driving to the job, spread over each move.</p>
        <div className="plan-trucks">
          {TRUCK_SIZES.map((t) => (
            <label key={t}>{t} truck and gas $<input type="number" min={0} step="1" inputMode="decimal" value={costs.trucks[t] ?? 0}
              onChange={(e) => set({ trucks: { ...costs.trucks, [t]: num(e.target.value) } })} /></label>
          ))}
        </div>
        <button type="button" className="primary block" onClick={save} disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save my costs'}</button>
        {state === 'saved' && <p className="note tone-good">Saved. Quotes, jobs and Money now use these costs.</p>}
        {state === 'error' && <p className="warn">Couldn't save your costs. Try again in a minute.</p>}
        <button type="button" className="link" onClick={() => set(START_COSTS)}>Go back to the starting guesses</button>
      </section>

      <Link to="/pricing" className="secondary block">See the prices page customers see</Link>
    </Layout>
  )
}
