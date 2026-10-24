import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import PublicPage from '../components/PublicPage'

const EMAIL = 'dmvtrustedmoversservices@gmail.com'
const UPDATED = 'October 22, 2026'

// Terms, privacy and cancellation policy in one page, with a section for each.
// The booking form and quote page link to a section by its #id.
export default function Policies() {
  // Links like /policies#cancellation open at that section
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [hash])

  return (
    <PublicPage sub="Terms and policies">
      <nav className="card policy-nav">
        <a href="#terms">Terms of service</a>
        <a href="#cancellation">Cancellation policy</a>
        <a href="#privacy">Privacy policy</a>
      </nav>

      <section className="card policy" id="terms">
        <h2>Terms of service</h2>
        <p className="note">Last updated {UPDATED}</p>
        <p>These terms cover moves booked with DMV Trusted Movers ("we", "us") in Washington DC, Maryland and Virginia. By asking for a quote, paying a deposit or having us do your move, you agree to them.</p>

        <h3>Quotes</h3>
        <p>Your price is based on what you tell us and the photos you send. A quote is good for 3 days. If the move turns out bigger than described (more items, more stairs, a long walk to the truck, or more time than planned), we'll tell you before doing the extra work. Extras are listed on the job and you see them when you sign off at the end.</p>

        <h3>Booking</h3>
        <p>Paying the deposit on your quote books your date. We need at least 48 hours' notice for a new booking.</p>

        <h3>Payment</h3>
        <p>The balance (your price, plus any extras, minus the deposit) is due when the move is done. You can pay by card from your booking link. Card payments are handled by Stripe.</p>
        <p>Tips are never expected. If you add one when you pay, all of it goes to the movers on your job, split evenly.</p>

        <h3>Your part</h3>
        <ul>
          <li>Be there at the start and end of the move, or have someone there for you.</li>
          <li>Have things packed and ready before we arrive.</li>
          <li>Book the elevator and save parking close to the door if your building needs it.</li>
          <li>Tell us before the move about anything very heavy, fragile or valuable.</li>
          <li>Move cash, jewelry, medicine and important papers yourself.</li>
        </ul>
        <p>We don't move hazardous materials such as gasoline, propane, paint or cleaning chemicals.</p>

        <h3>Damage</h3>
        <p>We handle your things with care. Check your items when we finish and note any damage on the sign-off sheet. If you find damage later, tell us in writing within 7 days and we'll work with you on a fair repair, replacement or payment.</p>

        <h3>Delays</h3>
        <p>Weather, traffic and building rules can slow a move down. We'll keep you updated if we're running late.</p>

        <h3>Changes</h3>
        <p>We may update these terms. The terms in place when you booked apply to your move.</p>
      </section>

      <section className="card policy" id="cancellation">
        <h2>Cancellation policy</h2>
        <ul>
          <li><strong>72 hours or more before your move:</strong> cancel for free. Your deposit is refunded to your card right away. Banks take 5 to 10 days to show it.</li>
          <li><strong>Less than 72 hours before your move:</strong> you can still cancel, but the deposit is kept.</li>
          <li><strong>If we have to cancel:</strong> you get your full deposit back.</li>
        </ul>
        <p>To cancel, open your booking link and tap "Cancel my move". To change your date, tap "Change my date" and pick a new day. We'll confirm it if a crew is free.</p>
      </section>

      <section className="card policy" id="privacy">
        <h2>Privacy policy</h2>
        <p className="note">Last updated {UPDATED}</p>

        <h3>What we collect</h3>
        <p>Your name, phone, email, addresses, move details and the photos you send us. We also keep photos and the sign-off from the day of your move.</p>
        <p>Card payments go through Stripe. We never see or store your full card number.</p>

        <h3>Why</h3>
        <p>To price your move, plan it, keep in touch with you about it, take payment, and keep business records.</p>

        <h3>Who sees it</h3>
        <p>Our team, and the movers on your job, who see the addresses and details they need for the move. We use a few services to run the business: Stripe for payments, Supabase to store data, Vercel to host this site and Resend to send email. We don't sell your information.</p>

        <h3>How long we keep it</h3>
        <p>We keep booking and payment records as long as we need them for taxes and business records. Email us to ask for a copy of your information, or to have it deleted when we no longer need to keep it.</p>
      </section>

      <p className="note center-text">Questions? Email <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
    </PublicPage>
  )
}
