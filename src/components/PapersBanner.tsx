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
          {t(`Photo ID, crew rules, crew agreement and emergency contact (${n} of 4 done). You can claim jobs once they're in.`,
            `Identificación, reglas, contrato y contacto de emergencia (${n} de 4 listos). Podrás tomar trabajos cuando estén completos.`)}
        </span>
      </span>
      <span className="muted">›</span>
    </Link>
  )
}
