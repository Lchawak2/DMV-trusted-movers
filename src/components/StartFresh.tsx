import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Clears out test moves before going live, so Dashboard and Money start at $0.
// The database refuses once a real card payment has come in.
export default function StartFresh() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.rpc('start_fresh', { p_confirm: typed.trim() })
    setBusy(false)
    if (e) return setError(e.message)
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
