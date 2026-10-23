// Our price list, shown on the public Prices page (/pricing). Change the numbers here.

// The page shows only these hourly prices. Only 2-mover crews for now.
export const HOURLY = [
  { name: '2 movers', rate: 149, per: 'an hour' },
  { name: 'Loading help', rate: 120, per: 'an hour, your truck' },
  { name: 'Packing', rate: 75, per: 'an hour per packer' },
]
export const MIN_HOURS = 3
export const SMALL_MIN_HOURS = 2

// Not shown on the page, but added to every quote:
// truck $129 per move (gas and the first 40 miles), then $2 a mile;
// $49 trip fee for loading help or packing-only visits; boxes at cost.

export function fromRate() {
  return HOURLY[0].rate
}
