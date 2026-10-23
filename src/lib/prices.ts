// Our price list, shown on the public Prices page (/pricing).
// The instant price after the quote form is worked out in the database (private.instant_price); change both together.
// Only 2-mover crews for now.

// Moves: one starting price covers the truck, gas and the first hours, then a rate per hour
export const MOVE_START = 449
export const MOVE_START_HOURS = 2
export const MOVE_RATE = 149

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
