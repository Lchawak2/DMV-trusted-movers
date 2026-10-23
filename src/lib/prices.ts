// Our price list, shown on the public Prices page (/pricing).
// The instant price after the quote form is worked out in the database (private.instant_price); change both together.
// Only 2-mover crews for now.

// Home moves: one flat price per size for 2 movers, truck and gas, up to a set number of hours.
// Past those hours, extra time is MOVE_RATE an hour.
export const HOME_MOVES = [
  { size: 'Studio', price: 545, hours: 3 },
  { size: '1 bedroom', price: 695, hours: 4 },
  { size: '2 bedrooms', price: 895, hours: 6 },
]
export const MOVE_FROM = HOME_MOVES[0].price
export const MOVE_RATE = 149
// Saturday and Sunday home and office moves cost this much more
export const WEEKEND_FEE = 100

// Help without our truck: per hour plus a one-time trip fee
export const LABOR_RATE = 120 // 2 movers
export const PACK_RATE = 75 // per packer, 2 packers
export const SMALL_MIN_HOURS = 2
export const TRIP_FEE = 49

export const TILES = [
  ...HOME_MOVES.map((m) => ({ name: m.size, price: m.price, per: `up to ${m.hours} hours`, extra: `+$${MOVE_RATE} each extra hour` })),
  { name: 'Loading help', price: LABOR_RATE, per: 'an hour, your truck', extra: '' },
  { name: 'Packing', price: PACK_RATE, per: 'an hour per packer', extra: '' },
]
