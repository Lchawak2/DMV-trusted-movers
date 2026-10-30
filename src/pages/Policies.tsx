import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import PublicPage from '../components/PublicPage'
import { usePageView } from '../lib/track'
import { FREE_MINUTES, MOVE_RATE } from '../lib/prices'
import { lang, t, useLang } from '../lib/lang'

const EMAIL = 'dmvtrustedmoversservices@gmail.com'
const updated = () => t('October 27, 2026', '27 de octubre de 2026')

// Terms, privacy and cancellation policy in one page, with a section for each.
// The booking form and quote page link to a section by its #id.
export default function Policies() {
  usePageView()
  useLang()
  // Links like /policies#cancellation open at that section
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [hash])

  return (
    <PublicPage sub={t('Terms and policies', 'Términos y políticas')} langSwitch>
      <nav className="card policy-nav">
        <a href="#terms">{t('Terms of service', 'Términos de servicio')}</a>
        <a href="#cancellation">{t('Cancellation policy', 'Política de cancelación')}</a>
        <a href="#privacy">{t('Privacy policy', 'Política de privacidad')}</a>
      </nav>
      {lang() === 'es' && <p className="note">Esta es una traducción. Si hay alguna diferencia entre la versión en inglés y la versión en español, aplica la versión en inglés.</p>}

      <section className="card policy" id="terms">
        <h2>{t('Terms of service', 'Términos de servicio')}</h2>
        <p className="note">{t('Last updated', 'Última actualización:')} {updated()}</p>
        <p>{t('These terms cover moves booked with DMV Trusted Movers ("we", "us") in Washington DC, Maryland and Virginia. By asking for a quote, paying a deposit or having us do your move, you agree to them.', 'Estos términos cubren las mudanzas reservadas con DMV Trusted Movers ("nosotros") en Washington DC, Maryland y Virginia. Al pedir una cotización, pagar un depósito o hacer su mudanza con nosotros, usted los acepta.')}</p>

        <h3>{t('Quotes', 'Cotizaciones')}</h3>
        <p>{t('Your price is based on what you tell us and the photos you send. A quote is good for 3 days. If the move turns out bigger than described (more items, more stairs, a long walk to the truck, or more time than planned), we\'ll tell you before doing the extra work. Extras are listed on the job and you see them when you sign off at the end.', 'Su precio se basa en lo que nos dice y en las fotos que envía. Una cotización es válida por 3 días. Si la mudanza resulta más grande de lo descrito (más cosas, más escaleras, un camino largo hasta el camión o más tiempo del planeado), le avisaremos antes de hacer el trabajo extra. Los extras se anotan en el trabajo y usted los ve cuando firma al final.')}</p>
        <p>{t(`Flat prices include a set number of hours, counted from when the crew starts to when you sign off. The first ${FREE_MINUTES} minutes past that are free; after that, the extra time is $${MOVE_RATE} an hour, billed by the minute, and added to your balance.`, `Los precios fijos incluyen un número fijo de horas, contadas desde que el equipo empieza hasta que usted firma. Los primeros ${FREE_MINUTES} minutos extra son gratis; después, el tiempo extra cuesta $${MOVE_RATE} la hora, cobrado por minuto, y se suma a su saldo.`)}</p>

        <h3>{t('Booking', 'Reserva')}</h3>
        <p>{t('Paying the deposit on your quote books your date. We need at least 48 hours\' notice for a new booking.', 'Pagar el depósito de su cotización reserva su fecha. Necesitamos al menos 48 horas de aviso para una nueva reserva.')}</p>

        <h3>{t('Payment', 'Pago')}</h3>
        <p>{t('The balance (your price, plus any extras, minus the deposit) is due when the move is done. You can pay by card from your booking link. Card payments are handled by Stripe.', 'El saldo (su precio, más cualquier extra, menos el depósito) se paga cuando termina la mudanza. Puede pagar con tarjeta desde su enlace de reserva. Los pagos con tarjeta los procesa Stripe.')}</p>
        <p>{t('Tips are never expected. If you add one when you pay, all of it goes to the movers on your job, split evenly.', 'Las propinas nunca son obligatorias. Si agrega una al pagar, todo va para los mudanceros de su trabajo, repartido en partes iguales.')}</p>

        <h3>{t('Your part', 'Lo que le toca a usted')}</h3>
        <ul>
          <li>{t('Be there at the start and end of the move, or have someone there for you.', 'Esté presente al empezar y al terminar la mudanza, o tenga a alguien ahí por usted.')}</li>
          <li>{t('Have things packed and ready before we arrive.', 'Tenga todo empacado y listo antes de que lleguemos.')}</li>
          <li>{t('Book the elevator and save parking close to the door if your building needs it.', 'Reserve el elevador y aparte estacionamiento cerca de la puerta si su edificio lo requiere.')}</li>
          <li>{t('Tell us before the move about anything very heavy, fragile or valuable.', 'Avísenos antes de la mudanza de cualquier cosa muy pesada, frágil o valiosa.')}</li>
          <li>{t('Move cash, jewelry, medicine and important papers yourself.', 'Lleve usted mismo el dinero, las joyas, las medicinas y los papeles importantes.')}</li>
        </ul>
        <p>{t('We don\'t move hazardous materials such as gasoline, propane, paint or cleaning chemicals.', 'No movemos materiales peligrosos como gasolina, propano, pintura o químicos de limpieza.')}</p>

        <h3>{t('Damage', 'Daños')}</h3>
        <p>{t('We handle your things with care. Check your items when we finish and note any damage on the sign-off sheet. If you find damage later, tell us in writing within 7 days and we\'ll work with you on a fair repair, replacement or payment.', 'Tratamos sus cosas con cuidado. Revise sus cosas cuando terminemos y anote cualquier daño en la hoja de firma. Si encuentra un daño después, avísenos por escrito dentro de 7 días y buscaremos con usted una reparación, reemplazo o pago justo.')}</p>

        <h3>{t('Delays', 'Retrasos')}</h3>
        <p>{t('Weather, traffic and building rules can slow a move down. We\'ll keep you updated if we\'re running late.', 'El clima, el tráfico y las reglas del edificio pueden hacer más lenta una mudanza. Le avisaremos si vamos tarde.')}</p>

        <h3>{t('Changes', 'Cambios')}</h3>
        <p>{t('We may update these terms. The terms in place when you booked apply to your move.', 'Podemos actualizar estos términos. A su mudanza le aplican los términos vigentes cuando reservó.')}</p>
      </section>

      <section className="card policy" id="cancellation">
        <h2>{t('Cancellation policy', 'Política de cancelación')}</h2>
        <ul>
          <li><strong>{t('72 hours or more before your move:', '72 horas o más antes de su mudanza:')}</strong> {t('cancel for free. Your deposit is refunded to your card right away. Banks take 5 to 10 days to show it.', 'cancele gratis. Su depósito se devuelve a su tarjeta de inmediato. Los bancos tardan de 5 a 10 días en mostrarlo.')}</li>
          <li><strong>{t('Less than 72 hours before your move:', 'Menos de 72 horas antes de su mudanza:')}</strong> {t('you can still cancel, but the deposit is kept.', 'todavía puede cancelar, pero el depósito no se devuelve.')}</li>
          <li><strong>{t('If we have to cancel:', 'Si nosotros tenemos que cancelar:')}</strong> {t('you get your full deposit back.', 'le devolvemos todo su depósito.')}</li>
        </ul>
        <p>{t('To cancel, open your booking link and tap "Cancel my move". To change your date, tap "Change my date" and pick a new day. We\'ll confirm it if a crew is free.', 'Para cancelar, abra su enlace de reserva y toque "Cancel my move". Para cambiar su fecha, toque "Change my date" y escoja un nuevo día. Se la confirmamos si hay un equipo libre.')}</p>
      </section>

      <section className="card policy" id="privacy">
        <h2>{t('Privacy policy', 'Política de privacidad')}</h2>
        <p className="note">{t('Last updated', 'Última actualización:')} {updated()}</p>

        <h3>{t('What we collect', 'Qué datos recopilamos')}</h3>
        <p>{t('Your name, phone, email, addresses, move details and the photos you send us. We also keep photos and the sign-off from the day of your move.', 'Su nombre, teléfono, correo, direcciones, detalles de la mudanza y las fotos que nos envía. También guardamos fotos y la firma del día de su mudanza.')}</p>
        <p>{t('Card payments go through Stripe. We never see or store your full card number.', 'Los pagos con tarjeta pasan por Stripe. Nunca vemos ni guardamos el número completo de su tarjeta.')}</p>
        <p>{t('When you use this website we count which pages you open and how far you get on the quote form, so we can make the site easier to use. That count uses a random number saved in your browser, not your name or contact details, and is kept for a year.', 'Cuando usa este sitio contamos qué páginas abre y hasta dónde llega en el formulario, para hacer el sitio más fácil de usar. Ese conteo usa un número al azar guardado en su navegador, no su nombre ni sus datos de contacto, y se guarda por un año.')}</p>

        <h3>{t('Why', 'Para qué')}</h3>
        <p>{t('To price your move, plan it, keep in touch with you about it, take payment, and keep business records.', 'Para darle el precio de su mudanza, planearla, mantenernos en contacto con usted, cobrar y llevar los registros del negocio.')}</p>

        <h3>{t('Who sees it', 'Quién los ve')}</h3>
        <p>{t('Our team, and the movers on your job, who see the addresses and details they need for the move. We use a few services to run the business: Stripe for payments, Supabase to store data, Vercel to host this site and Resend to send email. We don\'t sell your information.', 'Nuestro equipo y los mudanceros de su trabajo, que ven las direcciones y los detalles que necesitan para la mudanza. Usamos algunos servicios para operar el negocio: Stripe para pagos, Supabase para guardar datos, Vercel para alojar este sitio y Resend para enviar correos. No vendemos su información.')}</p>

        <h3>{t('How long we keep it', 'Cuánto tiempo los guardamos')}</h3>
        <p>{t('We keep booking and payment records as long as we need them for taxes and business records. Email us to ask for a copy of your information, or to have it deleted when we no longer need to keep it.', 'Guardamos los registros de reservas y pagos mientras los necesitemos para impuestos y registros del negocio. Escríbanos para pedir una copia de su información, o para que la borremos cuando ya no necesitemos guardarla.')}</p>
      </section>

      <p className="note center-text">{t('Questions? Email', '¿Preguntas? Escriba a')} <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
    </PublicPage>
  )
}
