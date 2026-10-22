import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Clock-ins, clock-outs and job photos taken with no signal (basements, elevators, loading
// docks) are kept on the phone and sent once there's a connection again, in the order they
// happened. Each row carries an id made on the phone, so sending one twice does no harm.
export type OutboxItem =
  | { id: string; at: number; type: 'clock_in'; assignment_id: string; time: string }
  | { id: string; at: number; type: 'clock_out'; assignment_id: string; entry_id: string; time: string }
  | { id: string; at: number; type: 'photo'; job_id: string; kind: 'before' | 'damage'; path: string; blob: Blob }
type Pending = OutboxItem & { error?: string }
type NewItem = OutboxItem extends infer T ? T extends OutboxItem ? Omit<T, 'at'> : never : never

const DB = 'dmv-outbox'
const STORE = 'items'
const CHANGED = 'outbox-changed'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function pending(): Promise<Pending[]> {
  try {
    return ((await run('readonly', (s) => s.getAll())) as Pending[]).sort((a, b) => a.at - b.at)
  } catch {
    return []
  }
}

export const OUTBOX_CHANGED = CHANGED

export async function queue(item: NewItem) {
  await run('readwrite', (s) => s.put({ ...item, at: Date.now() }))
  window.dispatchEvent(new Event(CHANGED))
}

// A failed request because there's no connection, as opposed to the database saying no
export function isOffline(error: { message?: string } | null | undefined): boolean {
  return !navigator.onLine || /fetch|network|load failed|timed? ?out/i.test(error?.message ?? '')
}

// Already saved by an earlier try
const duplicate = (error: { code?: string; message?: string } | null) =>
  error?.code === '23505' || /already exists|duplicate/i.test(error?.message ?? '')

async function send(item: OutboxItem): Promise<{ message?: string } | null> {
  if (item.type === 'clock_in') {
    const { error } = await supabase.from('time_entries').insert({ id: item.id, assignment_id: item.assignment_id, clock_in: item.time })
    return duplicate(error) ? null : error
  }
  if (item.type === 'clock_out') {
    const { error } = await supabase.from('time_entries').update({ clock_out: item.time }).eq('id', item.entry_id).is('clock_out', null)
    return error
  }
  const up = await supabase.storage.from('job-photos').upload(item.path, item.blob, { contentType: 'image/jpeg' })
  if (up.error && !duplicate(up.error)) return up.error
  const { error } = await supabase.from('job_photos').insert({ id: item.id, job_id: item.job_id, kind: item.kind, storage_path: item.path })
  return duplicate(error) ? null : error
}

let flushing: Promise<number> | null = null

// Send what's waiting. Stops at the first connection failure so things stay in order.
// Returns how many were sent.
export function flush(): Promise<number> {
  flushing ??= (async () => {
    let sent = 0
    let changed = false
    for (const item of await pending()) {
      if (!navigator.onLine) break
      const error = await send(item).catch((e: Error) => ({ message: e.message }))
      if (error && isOffline(error)) break
      if (error) {
        // The database refused it (say the job was cancelled); keep it so it isn't lost, and show why
        await run('readwrite', (s) => s.put({ ...item, error: error.message }))
        changed = true
        continue
      }
      await run('readwrite', (s) => s.delete(item.id))
      sent++
    }
    // Tell screens only when something changed, since they reload (and flush again) on this
    if (sent || changed) window.dispatchEvent(new Event(CHANGED))
    return sent
  })().finally(() => { flushing = null })
  return flushing
}

export async function discard(id: string) {
  await run('readwrite', (s) => s.delete(id))
  window.dispatchEvent(new Event(CHANGED))
}

// What's waiting, kept current. Also sends it when the phone gets signal back, and every
// 30 seconds while anything is waiting.
export function useOutbox(): Pending[] {
  const [items, setItems] = useState<Pending[]>([])
  useEffect(() => {
    const refresh = () => { pending().then(setItems) }
    const retry = () => { flush() }
    refresh()
    flush()
    window.addEventListener(CHANGED, refresh)
    window.addEventListener('online', retry)
    const timer = setInterval(() => { pending().then((p) => p.length && flush()) }, 30_000)
    return () => {
      window.removeEventListener(CHANGED, refresh)
      window.removeEventListener('online', retry)
      clearInterval(timer)
    }
  }, [])
  return items
}
