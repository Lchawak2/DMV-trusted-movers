import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Job } from './types'

// What a move costs the business. The admin sets these on Money → Price plan (kept in settings.costs);
// until then the app uses these starting guesses. Quotes, each job's Money tab and the Money totals
// all count profit with them, so every screen agrees.
export type Costs = {
  moverRate: number // pay per mover per hour
  moverMin: number // least a mover gets for a job
  movers: number // crew size when a job has no crew yet
  trucks: Record<string, number> // truck rental and gas, by size
  other: number // everything else per move (insurance, phone, ads, gas to the job)
}

export const START_COSTS: Costs = {
  moverRate: 30,
  moverMin: 100,
  movers: 2,
  trucks: { 'Cargo van': 90, '12 ft': 110, '16 ft': 132, '22 ft': 150, '26 ft': 200 },
  other: 110,
}

const withStart = (saved: Partial<Costs> | null | undefined): Costs => ({
  ...START_COSTS, ...saved, trucks: { ...START_COSTS.trucks, ...saved?.trucks },
})

// One load per visit, shared by every screen
let cached: Costs = START_COSTS
let loading: Promise<Costs> | null = null

export function loadCosts(): Promise<Costs> {
  loading ??= Promise.resolve(supabase.from('settings').select('costs').maybeSingle())
    .then(({ data }) => (cached = withStart(data?.costs as Partial<Costs> | null)))
    .catch(() => cached)
  return loading
}

export const currentCosts = () => cached

export async function saveCosts(next: Costs) {
  const { error } = await supabase.from('settings').update({ costs: next, updated_at: new Date().toISOString() }).eq('id', true)
  if (!error) { cached = next; loading = Promise.resolve(next) }
  return error
}

export function useCosts() {
  const [costs, setCosts] = useState<Costs | null>(null)
  useEffect(() => { loadCosts().then(setCosts) }, [])
  return costs
}

// Stripe takes 2.9% + 30¢ on each card payment (the deposit and the balance)
export const cardFees = (price: number, deposit = 50) =>
  price > 0 ? price * 0.029 + (deposit > 0 && deposit < price ? 0.6 : 0.3) : 0

// One mover's pay for a job of this many hours
export const moverPay = (c: Costs, hours: number) => Math.max(c.moverRate * hours, hours > 0 ? c.moverMin : 0)

// What a job costs beyond what's already recorded on it: crew pay when no crew is on it yet,
// the truck until its rental is added as a cost, other costs per move, and card fees for online bookings
export function costGuesses(c: Costs, j: Pick<Job, 'job_type' | 'truck_size' | 'est_hours' | 'crew_size' | 'quote_id'>,
  { charged, hasCrew, costKinds }: { charged: number; hasCrew: boolean; costKinds: string[] }) {
  if (charged <= 0) return { crew: 0, truck: 0, other: 0, card: 0, total: 0 }
  const usesTruck = !!j.truck_size && j.job_type !== 'labor_only' && j.job_type !== 'packing'
  const crew = hasCrew ? 0 : (j.crew_size ?? c.movers) * moverPay(c, Number(j.est_hours ?? 0))
  const truck = usesTruck && !costKinds.includes('Truck rental') ? c.trucks[j.truck_size!] ?? 0 : 0
  const other = c.other
  const card = j.quote_id ? cardFees(charged) : 0
  return { crew, truck, other, card, total: crew + truck + other + card }
}
