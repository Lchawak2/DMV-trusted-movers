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

export type Pricing = 'move' | 'labor' | 'pack'

// What the calculator offers, with the usual hours (low to high) for 2 people
export const JOB_TYPES: { key: string; name: string; pricing: Pricing; sizes: { name: string; hours: [number, number] }[] }[] = [
  { key: 'home', name: 'Home move', pricing: 'move', sizes: [
    { name: 'Studio', hours: [2, 3] },
    { name: '1 bedroom', hours: [3, 5] },
    { name: '2 bedrooms', hours: [5, 8] },
  ] },
  { key: 'office', name: 'Office move', pricing: 'move', sizes: [
    { name: 'Up to 5 desks', hours: [3, 5] },
    { name: '6 to 15 desks', hours: [5, 8] },
  ] },
  { key: 'small', name: 'A few items', pricing: 'move', sizes: [
    { name: '1 to 3 big items', hours: [1, 2] },
    { name: 'One room or a storage unit', hours: [2, 3] },
  ] },
  { key: 'labor', name: 'Loading help', pricing: 'labor', sizes: [
    { name: 'Studio or 1 bedroom', hours: [2, 3] },
    { name: '2 bedrooms', hours: [3, 5] },
  ] },
  { key: 'pack', name: 'Packing', pricing: 'pack', sizes: [
    { name: 'Studio or 1 bedroom', hours: [2, 4] },
    { name: '2 bedrooms', hours: [4, 6] },
  ] },
]

// Price for a job of this many hours
export function priceFor(pricing: Pricing, hours: number) {
  if (pricing === 'move') return MOVE_START + Math.max(0, hours - MOVE_START_HOURS) * MOVE_RATE
  const h = Math.max(hours, SMALL_MIN_HOURS)
  return (pricing === 'labor' ? LABOR_RATE * h : 2 * PACK_RATE * h) + TRIP_FEE
}

// Supplies the customer can add to their move; listed on the page and picked on the booking form
export const SUPPLIES = [
  { name: 'Moving blankets', price: 5, per: 'each' },
  { name: 'Plastic wrap', price: 35, per: 'a roll' },
  { name: 'Packing tape', price: 5, per: 'a roll' },
  { name: 'Small boxes', price: 3, per: 'each' },
  { name: 'Medium boxes', price: 4, per: 'each' },
  { name: 'Large boxes', price: 5, per: 'each' },
  { name: 'Wardrobe boxes', price: 25, per: 'each' },
]
