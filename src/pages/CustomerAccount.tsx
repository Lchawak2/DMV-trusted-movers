import { useState, type FormEvent } from 'react'
import PublicPage from '../components/PublicPage'
import { supabase } from '../lib/supabase'
import { CLAIM_KEY } from './customer/claim'

// Create a customer account from a booking link (/account?booking=<token>), or sign in to one.
// The booking is linked once they're signed in, on this device or by tapping the link again.
export default function CustomerAccount() {
  const booking = new URLSearchParams(location.search).get('booking')
  const [mode, setMode] = useState<'signup' | 'signin'>(booking ? 'signup' : 'signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    if (booking && /^[0-9a-f-]{36}$/.test(booking)) {
      try { localStorage.setItem(CLAIM_KEY, booking) } catch { /* the link still works later */ }
    }
    const { data, error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/` },
      })
    setBusy(false)
    if (error) return setMessage(error.message)
    if (mode === 'signup' && !data.session) setMessage('Check your email and tap the link to confirm your account. Your move will be waiting in it.')
  }

  return (
    <PublicPage sub={mode === 'signup' ? 'Create your account' : 'Sign in'}>
      <section className="card">
        <h2>{mode === 'signup' ? 'Save your moves' : 'Welcome back'}</h2>
        <p className="muted">See all your moves in one place and book your next one in a few taps.</p>
      </section>
      <form className="card form" onSubmit={submit}>
        {mode === 'signup' && <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Password<input type="password" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
        <button className="primary" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        {message && <p className="note">{message}</p>}
        <button type="button" className="link" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(null) }}>
          {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </form>
    </PublicPage>
  )
}
