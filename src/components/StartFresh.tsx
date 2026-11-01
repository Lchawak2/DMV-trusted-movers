import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Clears out test moves before going live, so Dashboard and Money start at $0.
// Turned off once a real card payment has come in.
export default function StartFresh() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    const fail = (message: string) => { setBusy(false); setError(message) }
    // Real money records stay: once a card payment has gone through, this is off
    const { count, error: e1 } = await supabase.from('payments').select('id', { count: 'exact', head: true }).in('status', ['paid', 'refunded'])
    if (e1) return fail(e1.message)
    if (count) return fail('A real card payment has come in, so Start fresh is turned off to keep your money records.')
    // Jobs first (their crew, photos and costs go with them), then customers, whose
    // requests, quotes and payment attempts go with them
    for (const table of ['jobs', 'customers', 'move_requests'] as const) {
      const { error: e } = await supabase.from(table).delete().not('id', 'is', null)
      if (e) return fail(e.message)
    }
    await supabase.rpc('mark_alerts_read')
    setBusy(false)
    setDone(true)
    setOpen(false)
  }

  return (
    <section className="card form">
      <h3>Start fresh</h3>
      <p className="muted small">Deletes every move, quote request, quote and customer, so Dashboard and Money go back to $0. Use it once to clear your tests before real customers book. Crew, prices and settings stay. It stops working after your first real card payment.</p>
      {done && <p className="note">Done. Everything is cleared.</p>}
      {!open
        ? <button className="secondary" onClick={() => { setOpen(true); setDone(false); setTyped('') }}>Start fresh…</button>
        : <>
            <label>
              Type DELETE to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
            </label>
            <div className="row">
              <button className="danger" disabled={busy || typed.trim() !== 'DELETE'} onClick={run}>{busy ? 'Deleting…' : 'Delete all moves'}</button>
              <button className="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </>}
      {error && <p className="warn">{error}</p>}
    </section>
  )
}
