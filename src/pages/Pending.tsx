import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { t } from '../lib/lang'
import { papersCount, papersDone, useMyPapers } from '../lib/papers'
import { PapersSteps } from './crew/Papers'

// New sign-ups wait here for the admin to add them to the crew, and send their papers meanwhile
export default function Pending() {
  const { account, refresh } = useAuth()
  const { papers, reload } = useMyPapers()

  if (account?.active === false) {
    return (
      <div className="login">
        <h1>Almost there</h1>
        <div className="card">
          <p>Your account has been switched off. Contact DMV Trusted Movers if you think this is a mistake.</p>
          <p className="muted">Signed in as {account?.email}</p>
          <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    )
  }

  const done = papersDone(papers)
  return (
    <div className="login signup-papers">
      <h1>{done ? t('Thanks, you\'re all set', 'Gracias, ya terminaste') : t('Finish signing up', 'Termina tu registro')}</h1>
      <div className="card">
        <ol className="signup-steps">
          <li className="done">{t('Create your account', 'Crea tu cuenta')}</li>
          <li className={done ? 'done' : 'now'}>
            {t('Send your papers', 'Envía tus papeles')}{papers !== undefined && !done && ` (${papersCount(papers)} ${t('of 2', 'de 2')})`}
          </li>
          <li className={done ? 'now' : ''}>{t('The office reviews them and adds you to the crew', 'La oficina los revisa y te agrega al equipo')}</li>
        </ol>
        {done
          ? <p>{t('We have your papers. Once the office adds you to the crew, your jobs show up here.', 'Ya tenemos tus papeles. Cuando la oficina te agregue al equipo, tus trabajos aparecerán aquí.')}</p>
          : <p className="muted small">{t('A photo of your ID and the crew rules. It takes a few minutes.', 'Una foto de tu identificación y las reglas del equipo. Toma unos minutos.')}</p>}
        <button className="secondary block" onClick={refresh}>{t('Check if I\'m approved', 'Ver si ya me aprobaron')}</button>
      </div>
      {papers !== undefined && <PapersSteps papers={papers} reload={reload} />}
      <p className="muted small center">
        {t('Signed in as', 'Conectado como')} {account?.email} · <button className="link" onClick={() => supabase.auth.signOut()}>{t('Sign out', 'Cerrar sesión')}</button>
      </p>
    </div>
  )
}
