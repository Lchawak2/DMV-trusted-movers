import type { Customer, MoveRequest, Quote } from '../../lib/types'

export type RequestRow = MoveRequest & { customers: Customer | null; quotes: Quote[] }

export const REQUEST_SELECT = '*, customers(id, full_name, phone, email), quotes(*)'

export const latestQuote = (r: RequestRow): Quote | null =>
  [...r.quotes].sort((a, b) => b.version - a.version)[0] ?? null

// What the inbox shows for a request, including a sent quote that ran out
export function requestState(r: RequestRow): { label: string; pill: string } {
  const q = latestQuote(r)
  if (r.status === 'quoted' && q?.expires_at && new Date(q.expires_at) < new Date()) return { label: 'Quote expired', pill: 'none' }
  switch (r.status) {
    case 'new': return { label: 'New', pill: 'info' }
    case 'waiting_on_client': return { label: 'Asked for info', pill: 'warn' }
    case 'quoted': return { label: 'Quote sent', pill: 'warn' }
    case 'accepted': return { label: 'Booked', pill: 'good' }
    default: return { label: r.status === 'declined' ? 'Declined' : 'Cancelled', pill: 'none' }
  }
}

function stateOf(address: string | null): string | null {
  if (!address) return null
  if (/\b(VA|Virginia)\b/i.test(address)) return 'VA'
  if (/\b(MD|Maryland)\b/i.test(address)) return 'MD'
  if (/\b(DC|D\.C\.|Washington)\b/i.test(address)) return 'DC'
  return null
}

// A move between DC, MD and VA crosses a state line, which needs the federal numbers
export function crossesStateLine(r: MoveRequest): boolean {
  const a = stateOf(r.from_address), b = stateOf(r.to_address)
  return !!a && !!b && a !== b
}

export function placeText(floor: number | null, elevator: boolean | null, parking: string | null): string {
  const parts = [
    floor != null ? (floor === 0 ? 'ground floor' : `floor ${floor}`) : null,
    elevator == null ? null : elevator ? 'elevator' : 'stairs',
    parking ? `${parking.toLowerCase()} parking` : null,
  ].filter(Boolean)
  return parts.join(', ')
}
