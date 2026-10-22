import { useState, type FormEvent } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { t } from '../lib/lang'
import { sendText } from '../lib/texting'

export default function Profile() {
  const { account, refresh } = useAuth()
  const [fullName, setFullName] = useState(account?.full_name ?? '')
  const [phone, setPhone] = useState(account?.phone ?? '')
  const [language, setLanguage] = useState(account?.language ?? 'en')
  const [zelle, setZelle] = useState(account?.zelle ?? '')
  const [saved, setSaved] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!account) return
    await supabase.from('accounts').update({ full_name: fullName, phone, language, zelle: zelle.trim() || null }).eq('id', account.id)
    await refresh()
    setSaved(true)
  }

  return (
    <Layout>
      <h2>{t('Profile', 'Perfil')}</h2>
      <form className="card form" onSubmit={save}>
        <label>{t('Full name', 'Nombre completo')}<input value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false) }} /></label>
        <label>{t('Phone', 'Teléfono')}<input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false) }} /></label>
        {account?.role === 'crew' && (
          <label>
            {t('Zelle phone or email', 'Teléfono o correo de Zelle')}
            <input value={zelle} maxLength={100} placeholder={t('Where you get paid', 'Donde recibes tu pago')} onChange={(e) => { setZelle(e.target.value); setSaved(false) }} />
          </label>
        )}
        <label>
          {t('Language', 'Idioma')}
          <select value={language} onChange={(e) => { setLanguage(e.target.value); setSaved(false) }}>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </label>
        <button className="primary">{t('Save', 'Guardar')}</button>
        {saved && <p className="note">{t('Saved.', 'Guardado.')}</p>}
      </form>
      {account?.role === 'admin' && <TestText phone={account.phone} />}
      <p className="muted">{t('Signed in as', 'Conectado como')} {account?.email} · {account?.role}</p>
      <button className="secondary" onClick={() => supabase.auth.signOut()}>{t('Sign out', 'Cerrar sesión')}</button>
    </Layout>
  )
}

// Checks the Twilio setup by texting the admin's own phone
function TestText({ phone }: { phone: string | null }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!phone) return
    setState('busy'); setError(null)
    const err = await sendText(phone, 'DMV Trusted Movers: this is a test text. Texting from the app works!')
    if (err) { setError(err); setState('idle') } else setState('sent')
  }

  return (
    <section className="card form">
      <h3>Texting</h3>
      <p className="muted small">Sends a test text from your Twilio number to your phone above, to check the setup.</p>
      {error && <p className="warn">{error}</p>}
      {state === 'sent' && <p className="note">Sent. It should arrive in a few seconds.</p>}
      <button className="secondary" disabled={!phone || state === 'busy'} onClick={send}>
        {!phone ? 'Add your phone above first' : state === 'busy' ? 'Sending…' : 'Send me a test text'}
      </button>
    </section>
  )
}
