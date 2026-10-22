import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { dateTime } from '../../lib/format'
import type { TruckRental } from '../../lib/types'

// Picked up and returned check-offs for the rental truck, for the lead mover and the admin
export default function TruckSteps({ jobId, rental, onChange }: { jobId: string; rental: TruckRental; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function mark(step: 'picked_up' | 'returned', done: boolean) {
    setBusy(true)
    setError('')
    const { error: e } = await supabase.rpc('check_truck', { p_job: jobId, p_step: step, p_done: done })
    setBusy(false)
    if (e) return setError(e.message)
    onChange()
  }

  const step = (label: string, at: string | null, key: 'picked_up' | 'returned', disabled = false) => at ? (
    <span className="small">
      <span className="tone-good">✓ {label} {dateTime(at)}</span>{' '}
      <button type="button" className="link" disabled={busy} onClick={() => mark(key, false)}>Undo</button>
    </span>
  ) : (
    <button type="button" className="secondary small-btn" disabled={busy || disabled} onClick={() => mark(key, true)}>{label}</button>
  )

  return (
    <>
      <div className="truck-steps">
        {step('Picked up', rental.picked_up_at, 'picked_up')}
        {step('Returned', rental.returned_at, 'returned', !rental.picked_up_at)}
      </div>
      {error && <p className="warn">{error}</p>}
    </>
  )
}
