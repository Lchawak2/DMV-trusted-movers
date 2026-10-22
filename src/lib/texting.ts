import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Whether Twilio is set up, asked once per visit
let ready: Promise<boolean> | null = null
export function useTexting(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    ready ??= supabase.functions.invoke('sms', { body: { action: 'status' } }).then(({ data }) => !!data?.ready, () => false)
    ready.then(setOk)
  }, [])
  return ok
}

// Text from the business number; returns an error message, or null when sent
export async function sendText(to: string, body: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('sms', { body: { action: 'send', to, body } })
  if (data?.sent) return null
  const ctx = (error as { context?: Response } | null)?.context
  const msg = ctx ? await ctx.json().then((j) => j?.error, () => null) : null
  return msg ?? data?.error ?? 'The text could not be sent.'
}
