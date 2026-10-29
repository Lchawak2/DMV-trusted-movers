import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import type { CrewPapers } from './types'

// Matches private.papers_done in the database, which is what Find Job checks
export function papersDone(p: CrewPapers | null | undefined): boolean {
  return !!p && (!!p.admin_ok_at || (!!p.id_path && !!p.rules_accepted_at))
}

export function papersCount(p: CrewPapers | null | undefined): number {
  return [p?.id_path, p?.rules_accepted_at].filter(Boolean).length
}

// The signed-in mover's own papers. undefined while loading.
export function useMyPapers() {
  const { account } = useAuth()
  const [papers, setPapers] = useState<CrewPapers | null | undefined>(undefined)
  const load = useCallback(async () => {
    if (!account) return
    const { data, error } = await supabase.from('crew_papers').select('*').eq('crew_id', account.id).maybeSingle()
    // With no signal, don't nag about papers that may well be done
    setPapers(error ? undefined : (data as CrewPapers | null))
  }, [account])
  useEffect(() => { load() }, [load])
  return { papers, reload: load }
}
