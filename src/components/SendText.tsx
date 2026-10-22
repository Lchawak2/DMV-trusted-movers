import { useState } from 'react'
import { sendText, useTexting } from '../lib/texting'

// Sends a text from the business number, once Twilio is set up
export default function SendText({ to, body, label = 'Send text', onSent }: { to: string; body: string; label?: string; onSent?: () => void }) {
  const ready = useTexting()
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  if (!ready) return null

  async function send() {
    setState('busy'); setError(null)
    const err = await sendText(to, body)
    if (err) { setError(err); setState('idle') } else { setState('sent'); onSent?.() }
  }

  return (
    <>
      <button type="button" className="primary" disabled={state !== 'idle'} onClick={send}>
        {state === 'busy' ? 'Sending…' : state === 'sent' ? 'Text sent' : label}
      </button>
      {error && <p className="warn">{error}</p>}
    </>
  )
}
