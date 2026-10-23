import { useState } from 'react'
import { Link } from 'react-router-dom'
import { JOB_TYPES, SUPPLIES, TRUCK_MILES, priceFor } from '../lib/prices'

const dollars = (n: number) => '$' + n.toLocaleString('en-US')

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0}>−</button>
      <span>{value}</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(99, value + 1))}>+</button>
    </div>
  )
}

// Two taps (what and how big) give a price range; supplies are optional extras
export default function PriceCalculator() {
  const [typeKey, setTypeKey] = useState('home')
  const [sizeIdx, setSizeIdx] = useState(1)
  const [showSupplies, setShowSupplies] = useState(false)
  const [qty, setQty] = useState<Record<string, number>>({})

  const type = JOB_TYPES.find((t) => t.key === typeKey)!
  const size = type.sizes[Math.min(sizeIdx, type.sizes.length - 1)]
  const supplies = SUPPLIES.reduce((s, x) => s + (qty[x.name] ?? 0) * x.price, 0)
  const low = priceFor(type.pricing, size.hours[0]) + supplies
  const high = priceFor(type.pricing, size.hours[1]) + supplies

  return (
    <div className="calc">
      <div className="calc-step">
        <h3>1. What do you need?</h3>
        <div className="chips">
          {JOB_TYPES.map((t) => (
            <button type="button" key={t.key} className={`chip big${typeKey === t.key ? ' on' : ''}`}
              onClick={() => { setTypeKey(t.key); setSizeIdx(Math.min(sizeIdx, t.sizes.length - 1)) }}>{t.name}</button>
          ))}
        </div>
      </div>

      <div className="calc-step">
        <h3>2. How big?</h3>
        <div className="chips">
          {type.sizes.map((s, i) => (
            <button type="button" key={s.name} className={`chip big${size === s ? ' on' : ''}`} onClick={() => setSizeIdx(i)}>{s.name}</button>
          ))}
        </div>
        <p className="muted small">Bigger than this? <Link to="/book">Ask for a free quote</Link>.</p>
      </div>

      <div className="calc-step">
        <button type="button" className="calc-toggle" onClick={() => setShowSupplies(!showSupplies)} aria-expanded={showSupplies}>
          <h3>Add boxes or supplies (optional)</h3><span>{showSupplies ? '−' : '+'}</span>
        </button>
        {showSupplies && SUPPLIES.map((x) => (
          <div className="calc-row" key={x.name}>
            <span>{x.name} <small>{dollars(x.price)} {x.per}</small></span>
            <Stepper value={qty[x.name] ?? 0} onChange={(n) => setQty({ ...qty, [x.name]: n })} label={x.name.toLowerCase()} />
          </div>
        ))}
      </div>

      <div className="calc-total">
        <span>Usual price · {type.name}, {size.name.toLowerCase()}</span>
        <strong className="calc-range">{low === high ? dollars(low) : `${dollars(low)} to ${dollars(high)}`}</strong>
        <p className="small">
          {type.pricing === 'move' ? `Truck and gas included, for moves up to ${TRUCK_MILES} miles apart. ` : 'Includes the trip fee. '}
          {supplies > 0 && `Includes ${dollars(supplies)} of supplies. `}
          Smaller jobs land at the low end, full homes or lots of stairs at the high end. Your quote gives the exact price.
        </p>
        <Link to="/book" className="site-btn gold">Get my exact price</Link>
      </div>
    </div>
  )
}
