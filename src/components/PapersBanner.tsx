import { Link } from 'react-router-dom'
import { t } from '../lib/lang'
import { papersCount, papersDone } from '../lib/papers'
import type { CrewPapers } from '../lib/types'

// Shown to movers until their sign-up papers are in
export default function PapersBanner({ papers }: { papers: CrewPapers | null | undefined }) {
  if (papers === undefined || papersDone(papers)) return null
  const n = papersCount(papers)
  return (
    <Link to="/papers" className="card papers-banner">
      <span className="list-main">
        <strong>{t('Finish your sign-up papers', 'Termina tus papeles de registro')}</strong>
        <span className="muted small step-detail">
          {t(`Photo ID, W-9 and crew rules (${n} of 3 done). You can claim jobs once they're in.`,
            `Identificación, W-9 y reglas del equipo (${n} de 3 listos). Podrás tomar trabajos cuando estén completos.`)}
        </span>
      </span>
      <span className="muted">›</span>
    </Link>
  )
}
