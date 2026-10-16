import { useState, type FormEvent } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Profile() {
  const { account, refresh } = useAuth()
  const [fullName, setFullName] = useState(account?.full_name ?? '')
  const [phone, setPhone] = useState(account?.phone ?? '')
  const [language, setLanguage] = useState(account?.language ?? 'en')
  const [saved, setSaved] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!account) return
    await supabase.from('accounts').update({ full_name: fullName, phone, language }).eq('id', account.id)
    await refresh()
    setSaved(true)
  }

  return (
    <Layout>
      <h2>Profile</h2>
      <form className="card form" onSubmit={save}>
        <label>Full name<input value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false) }} /></label>
        <label>Phone<input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false) }} /></label>
        <label>
          Language
          <select value={language} onChange={(e) => { setLanguage(e.target.value); setSaved(false) }}>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </label>
        <button className="primary">Save</button>
        {saved && <p className="note">Saved.</p>}
      </form>
      <p className="muted">Signed in as {account?.email} · {account?.role}</p>
      <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </Layout>
  )
}
