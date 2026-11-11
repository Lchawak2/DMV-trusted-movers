import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { setLang, siteLang } from './lang'
import type { Account } from './types'
import { markStaff } from './track'

interface AuthState {
  session: Session | null
  account: Account | null
  loading: boolean
  refresh: () => Promise<void>
  // Opened the Forgot password email link: show the Set a new password screen first
  recovering: boolean
  doneRecovering: () => void
}

const RECOVER_KEY = 'password-recovery'

const AuthContext = createContext<AuthState>({ session: null, account: null, loading: true, refresh: async () => {}, recovering: false, doneRecovering: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(() => {
    try { return sessionStorage.getItem(RECOVER_KEY) === '1' } catch { return false }
  })

  async function loadAccount(s: Session | null) {
    if (!s) {
      // Signed out: the website visitor's own pick
      setLang(siteLang())
      setAccount(null)
      return
    }
    const { data } = await supabase.from('accounts').select('*').eq('id', s.user.id).maybeSingle()
    let acct = data as Account | null
    // Signed up with the website in Spanish: the app starts in Spanish too (once; they can change it in Profile)
    if (acct && s.user.user_metadata?.language === 'es') {
      if (acct.language !== 'es') {
        const { error } = await supabase.from('accounts').update({ language: 'es' }).eq('id', acct.id)
        if (!error) acct = { ...acct, language: 'es' }
      }
      await supabase.auth.updateUser({ data: { language: null } })
    }
    // Admin screens are English only
    setLang(acct?.role === 'admin' ? 'en' : acct?.language)
    if (acct?.role === 'admin' || acct?.role === 'crew') markStaff()
    setAccount(acct)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadAccount(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') {
        try { sessionStorage.setItem(RECOVER_KEY, '1') } catch { /* still shows for this visit */ }
        setRecovering(true)
      }
      if (event === 'SIGNED_OUT') doneRecovering()
      // Defer the query so it doesn't run inside the auth callback
      setTimeout(() => loadAccount(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  function doneRecovering() {
    try { sessionStorage.removeItem(RECOVER_KEY) } catch { /* nothing saved */ }
    setRecovering(false)
  }

  return (
    <AuthContext.Provider value={{ session, account, loading, refresh: () => loadAccount(session), recovering, doneRecovering }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
