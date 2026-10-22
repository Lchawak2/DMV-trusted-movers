import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type Sharing = 'off' | 'sharing' | 'denied' | 'unsupported'

const EVERY_MS = 30_000

// While a mover is on the clock, their phone sends its spot to the office about every 30 seconds.
// A web page can only do this while it's open, so it stops when the app is closed or the screen locks.
export function useShareLocation(jobId: string, active: boolean): Sharing {
  const [state, setState] = useState<Sharing>('off')
  const last = useRef(0)

  useEffect(() => {
    if (!active) { setState('off'); return }
    if (!('geolocation' in navigator)) { setState('unsupported'); return }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setState('sharing')
        if (Date.now() - last.current < EVERY_MS) return
        last.current = Date.now()
        // A clock-in still waiting for signal is refused here; the next position tries again
        supabase.rpc('share_location', {
          p_job: jobId, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_accuracy: pos.coords.accuracy,
        }).then(({ error }) => { if (error) last.current = 0 })
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'sharing'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [jobId, active])

  return state
}
