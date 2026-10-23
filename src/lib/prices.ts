// Our price list, shown on the public Prices page (/pricing). Change the numbers here.

// The page shows only these hourly prices. Only 2-mover crews for now.
export const HOURLY = [
  { name: '2 movers', rate: 149, per: 'an hour' },
  { name: 'Loading help', rate: 120, per: 'an hour, your truck' },
  { name: 'Packing', rate: 75, per: 'an hour per packer' },
]
export const MIN_HOURS = 3

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
export const SMALL_MIN_HOURS = 2

// Not shown on the page, but added to every quote:
// truck $129 per move (gas and the first 40 miles), then $2 a mile;
// $49 trip fee for loading help or packing-only visits; boxes at cost.

export function fromRate() {
  return HOURLY[0].rate
}
