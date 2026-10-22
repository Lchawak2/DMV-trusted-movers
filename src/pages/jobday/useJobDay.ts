import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import type { Assignment, Job, JobExtra, JobPhoto, JobSignoff } from '../../lib/types'
import { isOffline } from '../../lib/outbox'

export type PhotoWithUrl = JobPhoto & { url: string | null }

type Cached = { job: Job; allowed: boolean; photos: JobPhoto[]; extras: JobExtra[]; signoff: JobSignoff | null }
const cacheKey = (id: string) => `job-day:${id}`

// Everything the job-day screens need. The accepted lead or an admin can use them;
// the database enforces that, this only decides what to show.
export function useJobDay(jobId: string) {
  const { account } = useAuth()
  const isAdmin = account?.role === 'admin'
  const [job, setJob] = useState<Job | null | undefined>(undefined)
  const [allowed, setAllowed] = useState(false)
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([])
  const [extras, setExtras] = useState<JobExtra[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [signoff, setSignoff] = useState<JobSignoff | null>(null)

  const load = useCallback(async () => {
    if (!account) return
    const [j, a, p, e, s] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).maybeSingle(),
      isAdmin
        ? Promise.resolve({ data: null })
        : supabase.from('assignments').select('*').eq('job_id', jobId).eq('crew_id', account.id).maybeSingle(),
      supabase.from('job_photos').select('*').eq('job_id', jobId).order('created_at'),
      supabase.from('job_extras').select('*').eq('job_id', jobId).order('created_at'),
      supabase.from('job_signoffs').select('*').eq('job_id', jobId).maybeSingle(),
    ])
    // No signal: use what this phone saw last time, so the lead can still take photos and clock out
    if (j.error && isOffline(j.error)) {
      try {
        const c = JSON.parse(localStorage.getItem(cacheKey(jobId)) ?? 'null') as Cached | null
        if (c) {
          setJob(c.job)
          setAllowed(c.allowed)
          setPhotos(c.photos.map((r) => ({ ...r, url: null })))
          setExtras(c.extras)
          setSignoff(c.signoff)
        }
      } catch { /* no saved copy */ }
      return
    }
    const mine = a.data as Assignment | null
    setJob(j.data as Job | null)
    setAllowed(isAdmin || (mine?.role === 'lead' && mine.status === 'accepted'))

    const rows = (p.data ?? []) as JobPhoto[]
    const signed = rows.length
      ? (await supabase.storage.from('job-photos').createSignedUrls(rows.map((r) => r.storage_path), 3600)).data ?? []
      : []
    setPhotos(rows.map((r) => ({ ...r, url: signed.find((u) => u.path === r.storage_path)?.signedUrl ?? null })))

    const extraRows = (e.data ?? []) as JobExtra[]
    setExtras(extraRows)
    if (isAdmin && extraRows.length) {
      const { data } = await supabase.from('job_extra_prices').select('*').in('extra_id', extraRows.map((x) => x.id))
      setPrices(Object.fromEntries((data ?? []).map((r: { extra_id: string; amount: number }) => [r.extra_id, Number(r.amount)])))
    }
    setSignoff(s.data as JobSignoff | null)
    if (j.data && !isAdmin) {
      const c: Cached = { job: j.data as Job, allowed: mine?.role === 'lead' && mine.status === 'accepted', photos: rows, extras: extraRows, signoff: s.data as JobSignoff | null }
      try { localStorage.setItem(cacheKey(jobId), JSON.stringify(c)) } catch { /* storage full or blocked */ }
    }
  }, [account, isAdmin, jobId])

  useEffect(() => { load() }, [load])

  return { job, allowed, isAdmin, photos, extras, prices, signoff, reload: load }
}
