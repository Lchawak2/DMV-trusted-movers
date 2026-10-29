import { useEffect, useState } from 'react'
import { t } from '../lib/lang'
import { canOffer, install, installed, isIPhone, onInstallChange } from '../lib/install'

// "Put the app on your phone": one tap on Android, steps on iPhone. Hidden once it's on the home screen.
export default function InstallApp() {
  const [, setTick] = useState(0)
  useEffect(() => onInstallChange(() => setTick((n) => n + 1)), [])

  if (installed()) return null
  const phone = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || isIPhone()
  if (!phone && !canOffer()) return null

  return (
    <section className="card install-app">
      <img src="/icon-192.png" alt="" width={44} height={44} />
      <div>
        <strong>{t('Put the app on your phone', 'Pon la app en tu teléfono')}</strong>
        {canOffer() ? (
          <>
            <p className="muted small">{t('It opens like any other app, right from your home screen.', 'Se abre como cualquier app, desde tu pantalla de inicio.')}</p>
            <button className="primary" onClick={install}>{t('Add to home screen', 'Agregar a la pantalla de inicio')}</button>
          </>
        ) : isIPhone() ? (
          <p className="muted small">
            {t('In Safari, tap the Share button', 'En Safari, toca el botón Compartir')} <span className="share-icon" aria-hidden>⬆︎</span>
            {t(', then Add to Home Screen.', ', luego Agregar a inicio.')}
          </p>
        ) : (
          <p className="muted small">{t('Open the browser menu (⋮), then tap Add to home screen or Install app.', 'Abre el menú del navegador (⋮) y toca Agregar a la pantalla de inicio o Instalar app.')}</p>
        )}
      </div>
    </section>
  )
}
