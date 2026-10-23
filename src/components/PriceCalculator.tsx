import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HOME_SIZES, HOURLY, SUPPLIES, TRIP_FEE, TRUCK, TRUCK_MILES } from '../lib/prices'

const dollars = (n: number) => '$' + n.toLocaleString('en-US')
type Service = 'move' | 'labor' | 'pack'

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
      <span>{value}</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
    </div>
  )
}

// Lets a customer work out their whole price from our hourly rates, truck and supplies
export default function PriceCalculator() {
  const [service, setService] = useState<Service>('move')
  const [size, setSize] = useState(1)
  const [hours, setHours] = useState(HOME_SIZES[1].move)
  const [packers, setPackers] = useState(2)
  const [qty, setQty] = useState<Record<string, number>>({})

  const rate = HOURLY.find((h) => h.key === service)!
  const pick = (s: Service, i: number) => {
    setService(s)
    setSize(i)
    setHours(Math.max(HOME_SIZES[i][s], HOURLY.find((h) => h.key === s)!.minHours))
  }

  const lines: { label: string; amount: number }[] = []
  if (service === 'pack') lines.push({ label: `${packers} ${packers === 1 ? 'packer' : 'packers'} × ${hours} hours × ${dollars(rate.rate)}`, amount: packers * hours * rate.rate })
  else lines.push({ label: `${hours} hours × ${dollars(rate.rate)}`, amount: hours * rate.rate })
  if (service === 'move') lines.push({ label: 'Truck and gas (one time)', amount: TRUCK })
  else lines.push({ label: 'Trip fee (one time)', amount: TRIP_FEE })
  for (const x of SUPPLIES) {
    const n = qty[x.name] ?? 0
    if (n) lines.push({ label: `${n} × ${x.name.toLowerCase()}`, amount: n * x.price })
  }
  const total = lines.reduce((s, l) => s + l.amount, 0)

  return (
    <div className="calc">
      <div className="calc-step">
        <h3>1. What do you need?</h3>
        <div className="chips">
          {HOURLY.map((h) => (
            <button type="button" key={h.key} className={`chip big${service === h.key ? ' on' : ''}`} onClick={() => pick(h.key as Service, size)}>
              {h.key === 'move' ? 'Movers and a truck' : h.name}
            </button>
          ))}
        </div>
      </div>

      <div className="calc-step">
        <h3>2. How big is your home?</h3>
        <div className="chips">
          {HOME_SIZES.map((s, i) => (
            <button type="button" key={s.name} className={`chip big${size === i ? ' on' : ''}`} onClick={() => pick(service, i)}>{s.name}</button>
          ))}
        </div>
        <p className="muted small">Bigger home or an office? <Link to="/book">Ask for a free quote</Link>.</p>
      </div>

      <div className="calc-step">
        <h3>3. How long?</h3>
        <div className="calc-row">
          <span>Hours <small>(most {HOME_SIZES[size].name.toLowerCase()} jobs take about {Math.max(HOME_SIZES[size][service], rate.minHours)}, minimum {rate.minHours})</small></span>
          <Stepper value={hours} min={rate.minHours} max={12} onChange={setHours} label="hours" />
        </div>
        {service === 'pack' && (
          <div className="calc-row">
            <span>Packers</span>
            <Stepper value={packers} min={1} max={2} onChange={setPackers} label="packers" />
          </div>
        )}
      </div>

      <div className="calc-step">
        <h3>4. Supplies (optional)</h3>
        {SUPPLIES.map((x) => (
          <div className="calc-row" key={x.name}>
            <span>{x.name} <small>{dollars(x.price)} {x.per}</small></span>
            <Stepper value={qty[x.name] ?? 0} min={0} max={99} onChange={(n) => setQty({ ...qty, [x.name]: n })} label={x.name.toLowerCase()} />
          </div>
        ))}
      </div>

      <div className="calc-total">
        {lines.map((l) => (
          <div className="calc-line" key={l.label}><span>{l.label}</span><span>{dollars(l.amount)}</span></div>
        ))}
        <div className="calc-line sum"><span>Your estimate</span><strong>{dollars(total)}</strong></div>
        <p className="small">
          {service === 'move' && `The truck covers moves up to ${TRUCK_MILES} miles apart. `}
          This is an estimate. Your quote gives your exact price before you book.
        </p>
        <Link to="/book" className="site-btn gold">Get my exact price</Link>
      </div>
    </div>
  )
}
