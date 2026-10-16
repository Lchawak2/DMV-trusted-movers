import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Pending() {
  const { account, refresh } = useAuth()
  return (
    <div className="login">
      <h1>Almost there</h1>
      <div className="card">
        <p>
          {account?.active === false
            ? 'Your account has been switched off. Contact DMV Trusted Movers if you think this is a mistake.'
            : 'Your account is waiting for approval. Once the admin adds you to the crew, your jobs will show up here.'}
        </p>
        <p className="muted">Signed in as {account?.email}</p>
        <button className="primary" onClick={refresh}>Check again</button>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  )
}
