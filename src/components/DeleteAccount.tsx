import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { t } from '../lib/lang'

// Delete my account: the app stores ask for it. Not shown to the admin.
export default function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    const { data, error: e } = await supabase.functions.invoke('account', { body: { action: 'delete' } })
    if (e || !data?.deleted) {
      // A refused request still carries the plain message in its body
      const body = e && 'context' in e ? await (e.context as Response).json().catch(() => null) : null
      setError(body?.error ?? data?.error ?? t('Your account could not be deleted. Please try again.', 'No se pudo borrar tu cuenta. Intenta otra vez.'))
      setBusy(false)
      return
    }
    await supabase.auth.signOut()
  }

  if (!open) {
    return <button className="link delete-account" onClick={() => setOpen(true)}>{t('Delete my account', 'Borrar mi cuenta')}</button>
  }
  return (
    <section className="card delete-confirm">
      <h3>{t('Delete your account?', '¿Borrar tu cuenta?')}</h3>
      <p className="small">
        {t('Your name, phone, email and ID papers are erased, and you can\'t sign in with this account again. If you are on upcoming jobs, you are taken off them. Moves you booked, and past jobs and payments, stay in our records without being tied to you.',
          'Se borran tu nombre, teléfono, correo y tus papeles de identificación, y ya no podrás entrar con esta cuenta. Si estás en trabajos que vienen, se te quita de ellos. Las mudanzas que reservaste y los trabajos y pagos pasados quedan en nuestros registros sin tus datos.')}
      </p>
      <div className="row">
        <button className="danger" disabled={busy} onClick={remove}>{busy ? t('Deleting…', 'Borrando…') : t('Yes, delete it', 'Sí, borrarla')}</button>
        <button className="secondary" disabled={busy} onClick={() => setOpen(false)}>{t('Keep my account', 'Conservar mi cuenta')}</button>
      </div>
      {error && <p className="warn">{error}</p>}
    </section>
  )
}
