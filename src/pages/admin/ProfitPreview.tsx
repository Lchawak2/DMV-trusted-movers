import { useState } from 'react'
import { money } from '../../lib/format'
import { TRUCK_SIZES } from '../../lib/types'

// What a quote leaves you after crew pay, the truck and card fees. The numbers it uses are
// starting guesses the admin changes to their own; they're kept on this device.
type Costs = { rate: number; trucks: Record<string, number> }
const KEY = 'quote-costs'
const START: Costs = {
  rate: 25,
  trucks: { 'Cargo van': 90, '12 ft': 110, '16 ft': 140, '22 ft': 170, '26 ft': 200 },
}

function loadCosts(): Costs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Costs> | null
    return { rate: saved?.rate ?? START.rate, trucks: { ...START.trucks, ...saved?.trucks } }
  } catch {
    return START
  }
}

// Stripe takes 2.9% + 30¢ on each card payment (deposit and balance)
const cardFees = (price: number, deposit: number) =>
  price > 0 ? price * 0.029 + (deposit > 0 && deposit < price ? 0.6 : 0.3) : 0

export default function ProfitPreview({ price, deposit, movers, hours, truck }: {
  price: number; deposit: number; movers: number; hours: number; truck: string
}) {
  const [costs, setCosts] = useState(loadCosts)
  const [editing, setEditing] = useState(false)

  function save(next: Costs) {
    setCosts(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private window */ }
  }

  if (!price) return null
  const crew = movers * hours * costs.rate
  const truckCost = truck ? costs.trucks[truck] ?? 0 : 0
  const fees = cardFees(price, deposit)
  const kept = price - crew - truckCost - fees
  const margin = kept / price
  const tone = kept < 0 ? 'warn' : margin < 0.2 ? 'tone-warn' : 'tone-good'

  return (
    <div className="profit">
      <ul className="list">
        <li><span>Crew pay{hours ? ` (${movers} × ${hours} hrs × ${money(costs.rate)})` : ''}</span><span>−{money(crew)}</span></li>
        {truck && <li><span>{truck} truck and fuel</span><span>−{money(truckCost)}</span></li>}
        <li><span>Card fees</span><span>−{money(fees)}</span></li>
        <li><strong>You keep</strong><strong className={tone}>{money(kept)} · {Math.round(margin * 100)}%</strong></li>
      </ul>
      {!hours && <p className="note">Add estimated hours to count crew pay.</p>}
      {kept < 0 && <p className="warn">This price loses money.</p>}
      {kept >= 0 && margin < 0.2 && <p className="note tone-warn">Under 20% left after costs.</p>}
      {editing ? (
        <div className="profit-costs">
          <label>Mover pay per hour ($)<input type="number" min={0} step="0.5" inputMode="decimal" defaultValue={costs.rate}
            onChange={(e) => save({ ...costs, rate: Number(e.target.value) || 0 })} /></label>
          {TRUCK_SIZES.map((t) => (
            <label key={t}>{t} truck and fuel ($)<input type="number" min={0} step="1" inputMode="decimal" defaultValue={costs.trucks[t]}
              onChange={(e) => save({ ...costs, trucks: { ...costs.trucks, [t]: Number(e.target.value) || 0 } })} /></label>
          ))}
          <button type="button" className="link" onClick={() => setEditing(false)}>Done</button>
        </div>
      ) : (
        <button type="button" className="link" onClick={() => setEditing(true)}>Change my costs</button>
      )}
      <p className="note">Only you see this. It's a guess from your numbers and isn't sent to the customer.</p>
    </div>
  )
}
