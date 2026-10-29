import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { t } from '../lib/lang'
import { sendText } from '../lib/texting'
import { papersCount, papersDone, useMyPapers } from '../lib/papers'

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
      {account?.role === 'crew' && <CrewLinks />}
      {account?.role === 'admin' && <ReviewLink />}
      {account?.role === 'admin' && <TestText phone={account.phone} />}
      <p className="muted">{t('Signed in as', 'Conectado como')} {account?.email} · {account?.role}</p>
      <button className="secondary" onClick={() => supabase.auth.signOut()}>{t('Sign out', 'Cerrar sesión')}</button>
    </Layout>
  )
}

// The mover's own pages that aren't in the tab bar
function CrewLinks() {
  const { papers } = useMyPapers()
  return (
    <section className="card">
      <ul className="list">
        <li>
          <Link to="/papers" className="list-main plain">
            <strong>{t('Sign-up papers', 'Papeles de registro')}</strong>
            <div className={`small ${papersDone(papers) ? 'tone-good' : 'tone-warn'}`}>
              {papers === undefined ? '' : papersDone(papers) ? t('Done', 'Listos') : t(`${papersCount(papers)} of 3 done`, `${papersCount(papers)} de 3 listos`)}
            </div>
          </Link>
          <span className="muted">›</span>
        </li>
        <li>
          <Link to="/availability" className="list-main plain">
            <strong>{t('My availability', 'Mi disponibilidad')}</strong>
            <div className="muted small">{t('The days you can work', 'Los días que puedes trabajar')}</div>
          </Link>
          <span className="muted">›</span>
        </li>
        <li>
          <Link to="/earnings" className="list-main plain">
            <strong>{t('My earnings', 'Mis ganancias')}</strong>
            <div className="muted small">{t('Pay and tips by week and month', 'Pago y propinas por semana y mes')}</div>
          </Link>
          <span className="muted">›</span>
        </li>
      </ul>
    </section>
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

// Where the Leave a Google review button sends customers
function ReviewLink() {
  const [url, setUrl] = useState('')
  const [state, setState] = useState<'idle' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('settings').select('review_url').maybeSingle().then(({ data }) => setUrl(data?.review_url ?? ''))
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const value = url.trim()
    if (value && !value.startsWith('https://')) return setError('The link should start with https://')
    const { error } = await supabase.from('settings').update({ review_url: value || null, updated_at: new Date().toISOString() }).eq('id', true)
    if (error) return setError(error.message)
    setState('saved')
  }

  return (
    <form className="card form" onSubmit={save}>
      <h3>Google review link</h3>
      <p className="muted small">After a move, customers rate it on their booking page and get a button to this link. In your Google Business Profile, tap "Ask for reviews" to copy it.</p>
      <label>Link<input type="url" value={url} placeholder="https://g.page/r/..." onChange={(e) => { setUrl(e.target.value); setState('idle') }} /></label>
      {error && <p className="warn">{error}</p>}
      {state === 'saved' && <p className="note">Saved.</p>}
      <button className="secondary">Save link</button>
    </form>
  )
}
