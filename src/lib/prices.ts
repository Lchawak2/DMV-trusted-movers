// Our price list, shown on the public Prices page (/pricing). Change the numbers here.

// Hourly prices. Only 2-mover crews for now.
export const HOURLY = [
  { key: 'move', name: '2 movers', rate: 149, per: 'an hour', minHours: 3 },
  { key: 'labor', name: 'Loading help', rate: 120, per: 'an hour, your truck', minHours: 2 },
  { key: 'pack', name: 'Packing', rate: 75, per: 'an hour per packer', minHours: 2 },
]
export const MIN_HOURS = 3
export const SMALL_MIN_HOURS = 2

// One-time charges the calculator adds
export const TRUCK = 129 // truck and gas for a move, up to 20 miles apart
export const TRUCK_MILES = 20
export const TRIP_FEE = 49 // loading help or a packing-only visit

// Usual hours for 2 movers, used as the calculator's starting guess
export const HOME_SIZES = [
  { name: 'Studio', move: 3, labor: 2, pack: 2 },
  { name: '1 bedroom', move: 4, labor: 2, pack: 3 },
  { name: '2 bedrooms', move: 7, labor: 4, pack: 5 },
]

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

export function fromRate() {
  return HOURLY[0].rate
}
