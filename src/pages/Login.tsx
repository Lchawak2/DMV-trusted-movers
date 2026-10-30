import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import TruckLogo from '../components/TruckLogo'
import JoinPitch from '../components/JoinPitch'
import LangSwitch from '../components/LangSwitch'
import { lang, t, useLang } from '../lib/lang'
import { supabase } from '../lib/supabase'

// /join opens straight on the crew sign-up, with a few lines on what the work is like
export default function Login({ join = false }: { join?: boolean }) {
  const [mode, setMode] = useState<'signin' | 'signup'>(join ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useLang()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, language: lang() }, emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) setMessage(error.message)
    else if (mode === 'signup') setMessage(t('Check your email to confirm your account, then sign in.', 'Revise su correo para confirmar su cuenta, y luego entre.'))
  }

  async function resetPassword() {
    if (!email) return setMessage(t('Enter your email first.', 'Primero escriba su correo.'))
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setMessage(error ? error.message : t('Password reset email sent.', 'Le enviamos un correo para cambiar su contraseña.'))
  }

  return (
    <div className="login">
      {!join && <LangSwitch />}
      <h1><Link to="/" className="plain brand"><TruckLogo size={30} />DMV Trusted Movers</Link></h1>
      {join && mode === 'signup'
        ? <JoinPitch />
        : <p className="muted">{mode === 'signin' ? t('Sign in to your account', 'Entre a su cuenta') : t('Create an account', 'Cree una cuenta')}</p>}
      <form onSubmit={submit} className="card form">
        {mode === 'signup' && (
          <label>
            {t('Full name', 'Nombre completo')}
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
        )}
        <label>
          {t('Email', 'Correo')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          {t('Password', 'Contraseña')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
        </label>
        <button className="primary" disabled={busy}>{mode === 'signin' ? t('Sign in', 'Entrar') : t('Create account', 'Crear cuenta')}</button>
        {message && <p className="note">{message}</p>}
      </form>
      <div className="login-links">
        <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? t('New crew member? Create an account', '¿Nuevo en el equipo? Cree una cuenta') : t('Already have an account? Sign in', '¿Ya tiene cuenta? Entre')}
        </button>
        {mode === 'signin' && <button className="link" onClick={resetPassword}>{t('Forgot password', 'Olvidé mi contraseña')}</button>}
      </div>
      <Link to="/book" className="secondary block">{t('Need a move? Get a quote', '¿Necesita una mudanza? Pida su precio')}</Link>
    </div>
  )
}
