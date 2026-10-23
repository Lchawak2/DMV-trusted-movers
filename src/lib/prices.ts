// Our price list, shown on the public Prices page (/pricing).
// The instant price after the quote form is worked out in the database (private.instant_price); change both together.
// Only 2-mover crews for now.

// Moves: one starting price covers the truck, gas and the first hours, then a rate per hour
export const MOVE_START = 449
export const MOVE_START_HOURS = 2
export const MOVE_RATE = 149
export const TRUCK_MILES = 20 // the starting price covers moves up to this many miles apart
export const DRIVE_FEE = 99 // moves 20 to 50 miles apart; farther ones are priced by the office

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

