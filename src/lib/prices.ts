// Our price list, shown on the public Prices page (/pricing). Change the numbers here.

// Movers and a truck, per hour
export const CREW_RATES = [
  { movers: 2, rate: 149 },
  { movers: 3, rate: 199 },
  { movers: 4, rate: 249 },
]
export const EXTRA_MOVER = 50
export const MIN_HOURS = 3
// One-time charge for driving the truck to you and back
export const TRAVEL_FEE = 129
export const INCLUDED_MILES = 40
export const PER_MILE = 2

// What most moves come to: the hourly rate for that crew times the usual hours, plus travel
const TYPICAL = [
  { name: 'Studio', movers: 2, hours: 3 },
  { name: '1 bedroom apartment', movers: 2, hours: 4 },
  { name: '2 bedroom apartment', movers: 3, hours: 6 },
  { name: '2 bedroom house or townhome', movers: 3, hours: 7 },
  { name: '3 bedroom house', movers: 4, hours: 7 },
  { name: '4 bedroom house', movers: 4, hours: 9 },
  { name: 'Small office (up to 1,500 sq ft)', movers: 3, hours: 5 },
]

// Small jobs and other help, priced on their own
export const OTHER_PRICES = [
  { name: 'Quick job', detail: '1 or 2 items, up to 1 hour, 2 movers and a van', price: '$399' },
  { name: 'A few items', detail: 'Up to 2 hours, 2 movers and a van', price: '$499' },
  { name: 'Labor only', detail: 'You have the truck or container, we load or unload it. 2 movers, 2 hour minimum, plus a $49 trip fee', price: '$120 an hour' },
  { name: 'Packing', detail: 'Per packer, plus a $49 trip fee if it\'s a packing-only visit. Boxes at cost', price: '$75 an hour' },
  { name: 'Junk haul-away', detail: 'Added to your move, plus dump fees', price: 'from $129' },
  { name: 'Piano', detail: 'Added to your move', price: 'from $150' },
]

export function rateFor(movers: number) {
  const top = CREW_RATES[CREW_RATES.length - 1]
  return CREW_RATES.find((r) => r.movers === movers)?.rate ?? top.rate + (movers - top.movers) * EXTRA_MOVER
}

export function fromRate() {
  return CREW_RATES[0].rate
}

export function typicalMoves() {
  return TYPICAL.map((m) => ({ ...m, price: rateFor(m.movers) * m.hours + TRAVEL_FEE }))
}
