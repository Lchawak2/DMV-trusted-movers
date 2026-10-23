import { Link } from 'react-router-dom'
import { money } from '../../lib/format'
import { cardFees, moverPay, useCosts } from '../../lib/costs'

// What a quote leaves you after crew pay, the truck, other costs and card fees,
// counted with the costs on your price plan (Money → Price plan)
export default function ProfitPreview({ price, deposit, movers, hours, truck }: {
  price: number; deposit: number; movers: number; hours: number; truck: string
}) {
  const costs = useCosts()
  if (!price || !costs) return null
  const each = moverPay(costs, hours)
  const crew = movers * each
  const truckCost = truck ? costs.trucks[truck] ?? 0 : 0
  const fees = cardFees(price, deposit)
  const kept = price - crew - truckCost - costs.other - fees
  const margin = kept / price
  const tone = kept < 0 ? 'warn' : margin < 0.2 ? 'tone-warn' : 'tone-good'

  return (
    <div className="profit">
      <ul className="list">
        <li><span>Crew pay{hours ? ` (${movers} × ${money(each)})` : ''}</span><span>−{money(crew)}</span></li>
        {truck && <li><span>{truck} truck and gas</span><span>−{money(truckCost)}</span></li>}
        {costs.other > 0 && <li><span>Other costs per move</span><span>−{money(costs.other)}</span></li>}
        <li><span>Card fees</span><span>−{money(fees)}</span></li>
        <li><strong>You keep</strong><strong className={tone}>{money(kept)} · {Math.round(margin * 100)}%</strong></li>
      </ul>
      {!hours && <p className="note">Add estimated hours to count crew pay.</p>}
      {kept < 0 && <p className="warn">This price loses money.</p>}
      {kept >= 0 && margin < 0.2 && <p className="note tone-warn">Under 20% left after costs.</p>}
      <Link to="/price-plan" className="link">Change my costs</Link>
      <p className="note">Only you see this. It's a guess from your price plan and isn't sent to the customer.</p>
    </div>
  )
}
