import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Account } from './types'

interface AuthState {
  session: Session | null
  account: Account | null
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState>({ session: null, account: null, loading: true, refresh: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadAccount(s: Session | null) {
    if (!s) {
      setAccount(null)
      return
    }
    const { data } = await supabase.from('accounts').select('*').eq('id', s.user.id).maybeSingle()
    setAccount(data as Account | null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadAccount(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Defer the query so it doesn't run inside the auth callback
      setTimeout(() => loadAccount(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, account, loading, refresh: () => loadAccount(session) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
