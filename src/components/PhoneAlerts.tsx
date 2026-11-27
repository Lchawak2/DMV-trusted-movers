import { useEffect, useState } from 'react'
import { isInstalled, isIphone, pushIsOn, pushSupported, sendTestPush, turnOffPush, turnOnPush } from '../lib/push'

// Admin: turn on phone notifications for this phone or computer (deposit paid, with a tap to text the customer)
export default function PhoneAlerts({ accountId }: { accountId: string }) {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { pushIsOn().then(setOn).catch(() => setOn(false)) }, [])

  async function turnOn() {
    setBusy(true); setMsg(null)
    const err = await turnOnPush(accountId).catch(() => 'Could not turn on notifications here. Please try again.')
    if (err) { setMsg({ ok: false, text: err }); setBusy(false); return }
    setOn(true)
    const testErr = await sendTestPush()
    setMsg(testErr ? { ok: false, text: testErr } : { ok: true, text: 'Turned on. A test notification is on its way.' })
    setBusy(false)
  }

  async function test() {
    setBusy(true); setMsg(null)
    const err = await sendTestPush()
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Sent. It should show in a few seconds.' })
    setBusy(false)
  }

  async function turnOff() {
    setBusy(true); setMsg(null)
    await turnOffPush().catch(() => null)
    setOn(false); setBusy(false)
  }

  const needsHomeScreen = isIphone() && !isInstalled()
  return (
    <section className="card form">
      <h3>Phone notifications</h3>
      <p className="muted small">Get a notification on this phone when a customer pays a deposit. Tap it to text them the booking confirmation.</p>
      {needsHomeScreen && !pushSupported() && (
        <p className="note">On iPhone, first add the app to your home screen: tap Share, then Add to Home Screen. Open the app from there and come back to this page.</p>
      )}
      {msg && <p className={msg.ok ? 'note' : 'warn'}>{msg.text}</p>}
      {on ? (
        <div className="row">
          <button className="secondary" disabled={busy} onClick={test}>{busy ? 'Sending…' : 'Send me a test notification'}</button>
          <button className="secondary" disabled={busy} onClick={turnOff}>Turn off on this phone</button>
        </div>
      ) : (
        <button className="primary" disabled={busy || on === null || (needsHomeScreen && !pushSupported())} onClick={turnOn}>
          {busy ? 'Turning on…' : 'Turn on notifications'}
        </button>
      )}
    </section>
  )
}
