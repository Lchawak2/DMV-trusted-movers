import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
    setBusy(false)
    if (error) setMessage(error.message)
    else if (mode === 'signup') setMessage('Check your email to confirm your account, then sign in.')
  }

  async function resetPassword() {
    if (!email) return setMessage('Enter your email first.')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setMessage(error ? error.message : 'Password reset email sent.')
  }

  return (
    <div className="login">
      <h1>DMV Trusted Movers</h1>
      <p className="muted">{mode === 'signin' ? 'Sign in to your account' : 'Create an account'}</p>
      <form onSubmit={submit} className="card form">
        {mode === 'signup' && (
          <label>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
        </label>
        <button className="primary" disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        {message && <p className="note">{message}</p>}
      </form>
      <div className="login-links">
        <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'New crew member? Create an account' : 'Already have an account? Sign in'}
        </button>
        {mode === 'signin' && <button className="link" onClick={resetPassword}>Forgot password</button>}
      </div>
      <Link to="/book" className="secondary block">Need a move? Get a quote</Link>
    </div>
  )
}
