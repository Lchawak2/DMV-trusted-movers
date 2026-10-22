import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type Sharing = 'off' | 'sharing' | 'denied' | 'unsupported'

const EVERY_MS = 30_000

// While a mover is on the clock, their phone sends its spot to the office about every 30 seconds.
// A web page can only do this while it's open, so it also keeps the screen awake while on the clock.
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

  // Keep the screen from locking on its own while on the clock, so sharing doesn't stop.
  // The phone drops the lock when the app is hidden, so take it again on return.
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let gone = false
    const take = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then((l) => { if (gone) l.release(); else lock = l }, () => {})
    }
    take()
    document.addEventListener('visibilitychange', take)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', take)
      lock?.release()
    }
  }, [active])

  return state
}
