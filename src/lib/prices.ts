// Our price list, shown on the public Prices page (/pricing). Change the numbers here.
// Only 2-mover crews for now.

// Moves: one starting price covers the truck, gas and the first hours, then a rate per hour
export const MOVE_START = 449
export const MOVE_START_HOURS = 2
export const MOVE_RATE = 149
export const TRUCK_MILES = 20 // the starting price covers moves up to this many miles apart

// Help without our truck: per hour plus a one-time trip fee
export const LABOR_RATE = 120 // 2 movers
export const PACK_RATE = 75 // per packer, 2 packers
export const SMALL_MIN_HOURS = 2
export const TRIP_FEE = 49

export const TILES = [
  { name: 'Movers + truck', price: MOVE_START, per: `first ${MOVE_START_HOURS} hours, then $${MOVE_RATE} an hour` },
  { name: 'Loading help', price: LABOR_RATE, per: 'an hour, your truck' },
  { name: 'Packing', price: PACK_RATE, per: 'an hour per packer' },
]

// Boxes and supplies we bring; listed on the Prices page and counted on the booking form
export const SUPPLIES = [
  { name: 'Small boxes', price: 3, per: 'each', box: true },
  { name: 'Medium boxes', price: 4, per: 'each', box: true },
  { name: 'Large boxes', price: 5, per: 'each', box: true },
  { name: 'Wardrobe boxes', price: 25, per: 'each', box: true },
  { name: 'Moving blankets', price: 5, per: 'each', box: false },
  { name: 'Plastic wrap', price: 35, per: 'a roll', box: false },
  { name: 'Packing tape', price: 5, per: 'a roll', box: false },
]

// Usual hours (low to high) for 2 movers by job type and size, for the estimate shown after the quote form.
// Sizes not listed (3+ bedrooms, bigger offices, junk haul) get no estimate; the office prices them.
const USUAL_HOURS: Record<string, Record<string, [number, number]>> = {
  full_move: { 'Few items': [1, 2], Studio: [2, 3], '1 bedroom': [3, 5], '2 bedrooms': [5, 8] },
  small_move: { 'Few items': [1, 2], Studio: [2, 3], '1 bedroom': [3, 5], '': [1, 2] },
  office_move: { 'Small office (1 to 10 people)': [3, 6] },
  labor_only: { 'Few items': [1, 2], Studio: [2, 3], '1 bedroom': [2, 3], '2 bedrooms': [3, 5] },
  packing: { Studio: [2, 4], '1 bedroom': [2, 4], '2 bedrooms': [4, 6] },
}

export type EstimateLine = { label: string; low: number; high: number }
export type Estimate = { lines: EstimateLine[]; low: number; high: number; later: string[] }

// Heavy items the office prices by hand; the other special items fit in the usual time
const PRICED_LATER = ['Piano', 'Safe', 'Pool table', 'Gym equipment']

const hrs = (n: number) => `${n} ${n === 1 ? 'hour' : 'hours'}`
const span = (a: number, b: number) => (a === b ? hrs(a) : `${a} to ${hrs(b)}`)

// Price lines for the work itself, low and high ends of the usual hours
function workLines(type: string, [lowH, highH]: [number, number]): EstimateLine[] {
  if (type === 'labor_only' || type === 'packing') {
    const [a, b] = [Math.max(lowH, SMALL_MIN_HOURS), Math.max(highH, SMALL_MIN_HOURS)]
    const rate = type === 'labor_only' ? LABOR_RATE : 2 * PACK_RATE
    const who = type === 'labor_only' ? '2 movers' : '2 packers'
    return [
      { label: `${who}, ${span(a, b)} at $${rate} an hour`, low: rate * a, high: rate * b },
      { label: 'Trip fee', low: TRIP_FEE, high: TRIP_FEE },
    ]
  }
  const lines = [{ label: `2 movers + truck, gas and the first ${hrs(MOVE_START_HOURS)}`, low: MOVE_START, high: MOVE_START }]
  const [a, b] = [Math.max(0, lowH - MOVE_START_HOURS), Math.max(0, highH - MOVE_START_HOURS)]
  if (b > 0) lines.push({ label: `Extra time, ${span(a, b)} at $${MOVE_RATE} an hour`, low: a * MOVE_RATE, high: b * MOVE_RATE })
  return lines
}

// Estimated price with a line for each part, or null when the office needs to price it
export function estimate(type: string, size: string, counts: Record<string, number>, items: string[] = []): Estimate | null {
  const hours = USUAL_HOURS[type]?.[size]
  if (!hours) return null
  const lines = workLines(type, hours)
  for (const x of SUPPLIES) {
    const n = counts[x.name] ?? 0
    if (n > 0) lines.push({ label: `${n} ${x.name.toLowerCase()} at $${x.price} ${x.per}`, low: n * x.price, high: n * x.price })
  }
  const later = items.filter((i) => PRICED_LATER.includes(i))
  return { lines, later, low: lines.reduce((s, l) => s + l.low, 0), high: lines.reduce((s, l) => s + l.high, 0) }
}
