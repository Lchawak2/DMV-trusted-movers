import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PublicPage from '../components/PublicPage'
import TalkToUs from '../components/TalkToUs'
import { supabase } from '../lib/supabase'
import { t } from '../lib/lang'
import { usePageView } from '../lib/track'

// "Pay my bill" on the website (/pay). The customer types the email they booked with and we email
// them the link to their booking page, where they pay the balance by card (and can tip).
// The answer is the same whether or not we know the email, so the page can't be used to look people up.
export default function Pay() {
  usePageView()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('request_pay_link', { p_email: email.trim() })
    setBusy(false)
    if (err) return setError(err.code === 'PT429'
      ? t('Too many tries. Please wait a little while and try again, or call us.', 'Demasiados intentos. Espere un rato y vuelva a intentarlo, o llámenos.')
      : t('Something went wrong. Please try again, or text us.', 'Algo salió mal. Vuelva a intentarlo o escríbanos.'))
    setSent(true)
  }

  return (
    <PublicPage sub={t('Pay my bill', 'Pagar mi cuenta')} langSwitch>
      <section className="card">
        <h2>{t('Pay for your move', 'Pague su mudanza')}</h2>
        <p className="muted">
          {t('The rest of your price is paid after your move, by card. Type the email you booked with and we will email you the link to your booking page. There you can see what you owe, pay by card, and leave a tip for your crew if you like.',
            'El resto del precio se paga con tarjeta después de su mudanza. Escriba el correo con el que reservó y le enviaremos el enlace a la página de su reserva. Allí puede ver cuánto debe, pagar con tarjeta y dejar una propina para su equipo si quiere.')}
        </p>
      </section>
      {sent
        ? <section className="card">
          <h3>{t('Check your email', 'Revise su correo')}</h3>
          <p>{t(`If we have a move under ${email.trim()}, we just sent you the link. It can take a minute or two. Check your spam folder too.`,
            `Si tenemos una mudanza con ${email.trim()}, le acabamos de enviar el enlace. Puede tardar uno o dos minutos. Revise también la carpeta de spam.`)}</p>
          <button type="button" className="link" onClick={() => { setSent(false); setEmail('') }}>{t('Use a different email', 'Usar otro correo')}</button>
        </section>
        : <form className="card form" onSubmit={submit}>
          <label>{t('Email you booked with', 'Correo con el que reservó')}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
          </label>
          <button className="primary" disabled={busy}>{busy ? t('One moment…', 'Un momento…') : t('Email me my payment link', 'Enviarme el enlace para pagar')}</button>
          {error && <p className="note">{error}</p>}
          <p className="muted small">{t('Already have the link from our email or text? Just open it and tap Pay.', '¿Ya tiene el enlace de nuestro correo o mensaje? Ábralo y toque Pagar.')}</p>
        </form>}
      <TalkToUs
        title={t('Booked without an email, or have a question?', '¿Reservó sin correo o tiene una pregunta?')}
        message={t('Hi, I would like to pay for my move.', 'Hola, quiero pagar mi mudanza.')}
      />
      <p className="muted small center-text"><Link to="/policies#cancellation">{t('Payment and cancellation policy', 'Política de pago y cancelación')}</Link></p>
    </PublicPage>
  )
}
