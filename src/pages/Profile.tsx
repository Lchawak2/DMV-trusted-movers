import { useState, type FormEvent } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { t } from '../lib/lang'

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
      <p className="muted">{t('Signed in as', 'Conectado como')} {account?.email} · {account?.role}</p>
      <button className="secondary" onClick={() => supabase.auth.signOut()}>{t('Sign out', 'Cerrar sesión')}</button>
    </Layout>
  )
}
