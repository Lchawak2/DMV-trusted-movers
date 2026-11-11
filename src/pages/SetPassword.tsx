import { useState, type FormEvent } from 'react'
import TruckLogo from '../components/TruckLogo'
import { t, useLang } from '../lib/lang'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { authMessage } from '../lib/authMessage'

// Shown after the Forgot password email link: pick a new password, then go into the app
export default function SetPassword() {
  const { doneRecovering } = useAuth()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useLang()

  async function save(e: FormEvent) {
    e.preventDefault()
    if (password !== again) return setMessage(t('The two passwords are not the same.', 'Las dos contraseñas no son iguales.'))
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setMessage(authMessage(error))
    doneRecovering()
  }

  return (
    <div className="login">
      <h1><span className="brand"><TruckLogo size={30} />DMV Trusted Movers</span></h1>
      <p className="muted">{t('Choose a new password. You will use it to sign in from now on.', 'Elija una contraseña nueva. La usará para entrar de ahora en adelante.')}</p>
      <form onSubmit={save} className="card form">
        <label>
          {t('New password', 'Contraseña nueva')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </label>
        <label>
          {t('Type it again', 'Escríbala otra vez')}
          <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} required minLength={8} autoComplete="new-password" />
        </label>
        <button className="primary" disabled={busy}>{t('Save password', 'Guardar contraseña')}</button>
        {message && <p className="note">{message}</p>}
      </form>
    </div>
  )
}
