import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dateTime, dayHeading, money, parseDay, smsLink } from '../../lib/format'
import { JOB_TYPES, TRUCK_SIZES, type RequestStatus } from '../../lib/types'
import { ARRIVAL_WINDOWS, BOOK_TYPES } from '../Book'
import { REQUEST_SELECT, crossesStateLine, latestQuote, placeText, requestState, type RequestRow } from './requestData'

const QUOTE_DAYS = 3

export default function RequestDetail() {
  const { id } = useParams() as { id: string }
  const navigate = useNavigate()
  const [r, setR] = useState<RequestRow | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [earlier, setEarlier] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ price: '', deposit: '', crew_size: '2', truck_size: '', est_hours: '', arrival_window: '', note: '' })
  const [depositPaid, setDepositPaid] = useState(true)

  async function load() {
    const { data } = await supabase.from('move_requests').select(REQUEST_SELECT).eq('id', id).single()
    const row = data as RequestRow | null
    setR(row)
    if (!row) return
    const q = latestQuote(row)
    if (q?.status === 'sent') {
      const { count } = await supabase.from('payments').select('id', { count: 'exact', head: true }).eq('quote_id', q.id).eq('status', 'pending')
      // A customer may pay and close the page before coming back; ask Stripe and book it if so
      if (count) {
        const { data: res } = await supabase.functions.invoke('deposit', { body: { action: 'confirm', token: q.token } })
        if (res?.paid) return load()
      }
    }
    setForm({
      price: q?.price.toString() ?? '', deposit: q?.deposit.toString() ?? '',
      crew_size: q?.crew_size?.toString() ?? '2', truck_size: q?.truck_size ?? '', est_hours: q?.est_hours?.toString() ?? '',
      arrival_window: q?.arrival_window ?? row.arrival_window ?? '', note: q?.note ?? '',
    })
    const { data: files } = await supabase.from('request_photos').select('storage_path').eq('request_id', id)
    const paths = (files ?? []).map((f) => f.storage_path as string)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('request-photos').createSignedUrls(paths, 3600)
      setPhotos((signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[])
    }
    const { count } = await supabase.from('move_requests').select('id', { count: 'exact', head: true })
      .eq('customer_id', row.customer_id).neq('id', id)
    setEarlier(count ?? 0)
  }

  useEffect(() => { load() }, [id])

  if (!r) return <Layout back="/requests"><p className="muted center">Loading…</p></Layout>

  const c = r.customers
  const q = latestQuote(r)
  const state = requestState(r)
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v })
  const typeName = BOOK_TYPES[r.move_type] ?? JOB_TYPES[r.move_type] ?? r.move_type
  const open = r.status === 'new' || r.status === 'waiting_on_client' || r.status === 'quoted'

  async function setStatus(status: RequestStatus) {
    await supabase.from('move_requests').update({ status }).eq('id', id)
    load()
  }

  async function sendQuote(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (q?.status === 'sent') await supabase.from('quotes').update({ status: 'superseded' }).eq('id', q.id)
    const { error } = await supabase.from('quotes').insert({
      request_id: id, version: (q?.version ?? 0) + 1, status: 'sent',
      price: Number(form.price), deposit: Number(form.deposit || 0),
      crew_size: form.crew_size ? Number(form.crew_size) : null, truck_size: form.truck_size || null,
      est_hours: form.est_hours ? Number(form.est_hours) : null,
      arrival_window: form.arrival_window || null, note: form.note || null,
      sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + QUOTE_DAYS * 86_400_000).toISOString(),
    })
    if (!error) await supabase.from('move_requests').update({ status: 'quoted' }).eq('id', id)
    setBusy(false)
    if (error) return setError(error.message)
    load()
  }

  // Customer said yes: the database turns the request and quote into a job with its price
  async function book() {
    if (!q) return
    setBusy(true)
    setError(null)
    const { data: job, error } = await supabase.rpc('book_quote', { p_quote: q.id, p_paid: depositPaid ? q.deposit : 0 })
    if (error || !job) { setBusy(false); return setError(error?.message ?? 'The job could not be created.') }
    navigate(`/jobs/${job}`)
  }

  const first = c?.full_name.split(' ')[0] ?? ''
  const when = parseDay(r.preferred_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const quoteText = q && [
    `Hi ${first}, thanks for asking DMV Trusted Movers.`,
    `Your price for ${when}${q.arrival_window ? `, ${q.arrival_window.toLowerCase()}` : ''}: ${money(q.price)}`,
    [q.crew_size && `${q.crew_size} movers`, q.truck_size && `a ${q.truck_size} truck`, q.est_hours && `about ${q.est_hours} hours`].filter(Boolean).join(', '),
    q.note,
    q.deposit > 0 ? `A ${money(q.deposit)} deposit books your date. Free cancellation up to 72 hours before the move.` : null,
    `See your quote${q.deposit > 0 ? ' and pay the deposit' : ''}: ${location.origin}/quote/${q.token}`,
    `This price is good until ${q.expires_at ? new Date(q.expires_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'further notice'}.`,
  ].filter(Boolean).join('\n')
  const askText = `Hi ${first}, thanks for your moving request for ${when}. Could you send a few photos of the rooms and any large items so we can price it?`
  const sms = (body: string) => c?.phone ? smsLink(c.phone, body) : null
  const mail = (body: string) => c?.email ? `mailto:${c.email}?subject=${encodeURIComponent('Your moving quote')}&body=${encodeURIComponent(body)}` : null

  return (
    <Layout back="/requests" title="Request">
      <section className="card">
        <div className="card-head"><h3>{c?.full_name}</h3><span className={`pill ${state.pill}`}>{state.label}</span></div>
        <p className="muted small">{typeName}{r.home_size ? ` · ${r.home_size}` : ''} · {dayHeading(r.preferred_date)}{r.arrival_window ? ` · ${r.arrival_window}` : ''}</p>
        <ul className="list">
          {c?.phone && <li><span>Phone</span><a href={`tel:${c.phone}`}>{c.phone}</a></li>}
          {c?.email && <li><span>Email</span><a href={`mailto:${c.email}`}>{c.email}</a></li>}
          <li className="stack"><strong>{r.to_address ? 'From' : 'Address'}</strong><span>{r.from_address}</span><span className="muted small">{placeText(r.from_floor, r.from_elevator, r.from_parking)}</span></li>
          {r.to_address && <li className="stack"><strong>To</strong><span>{r.to_address}</span><span className="muted small">{placeText(r.to_floor, r.to_elevator, r.to_parking)}</span></li>}
          {r.special_items.length > 0 && <li><span>Special items</span><span>{r.special_items.join(', ')}</span></li>}
          {r.notes && <li className="stack"><strong>Notes</strong><span>{r.notes}</span></li>}
          <li><span>Sent</span><span className="muted">{dateTime(r.created_at)}</span></li>
        </ul>
        {crossesStateLine(r) && <p className="flag">Crosses a state line, so it's an interstate move.</p>}
        {earlier > 0 && <p className="flag">This customer has {earlier} other {earlier === 1 ? 'request' : 'requests'}.</p>}
        {photos.length > 0 && (
          <div className="photo-grid">
            {photos.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="photo"><img src={url} alt="" /></a>)}
          </div>
        )}
      </section>

      {open && (
        <form className="card form" onSubmit={sendQuote}>
          <h3>{q ? `Quote (version ${q.version})` : 'Your quote'}</h3>
          <div className="row">
            <label>Price ($)<input type="number" min={1} step="0.01" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} required /></label>
            <label>Deposit ($)<input type="number" min={0} step="0.01" inputMode="decimal" value={form.deposit} onChange={(e) => set('deposit', e.target.value)} /></label>
          </div>
          <div className="row">
            <label>Movers<input type="number" min={1} max={12} inputMode="numeric" value={form.crew_size} onChange={(e) => set('crew_size', e.target.value)} /></label>
            <label>
              Truck
              <select value={form.truck_size} onChange={(e) => set('truck_size', e.target.value)}>
                <option value="">No truck</option>
                {TRUCK_SIZES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <label>Estimated hours<input type="number" min={0.5} step="0.5" inputMode="decimal" value={form.est_hours} onChange={(e) => set('est_hours', e.target.value)} /></label>
            <label>
              Arrival
              <select value={form.arrival_window} onChange={(e) => set('arrival_window', e.target.value)}>
                <option value="">Not set</option>
                {ARRIVAL_WINDOWS.map((w) => <option key={w}>{w}</option>)}
              </select>
            </label>
          </div>
          <label>Note to customer<textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="What the price includes" /></label>
          <p className="note">The quote is good for {QUOTE_DAYS} days.</p>
          {error && <p className="warn">{error}</p>}
          <button className="primary" disabled={busy}>{q ? 'Save new quote' : 'Save quote'}</button>
          {!q && (sms(askText) || mail(askText)) && (
            <a href={(sms(askText) ?? mail(askText))!} className="secondary" onClick={() => setStatus('waiting_on_client')}>Ask for more info</a>
          )}
        </form>
      )}

      {q && quoteText && (
        <section className="card form">
          <h3>Send the quote</h3>
          <pre className="quote-text">{quoteText}</pre>
          <div className="row">
            {sms(quoteText) && <a href={sms(quoteText)!} className="primary">Text it</a>}
            {mail(quoteText) && <a href={mail(quoteText)!} className="secondary">Email it</a>}
          </div>
          {r.status === 'accepted' ? (
            <p className="note">Booked for {money(q.price)}. The job is on the Jobs tab.</p>
          ) : (
            <>
              <h3>Customer said yes?</h3>
              {q.deposit > 0 && (
                <label className="check"><input type="checkbox" checked={depositPaid} onChange={(e) => setDepositPaid(e.target.checked)} /> Deposit of {money(q.deposit)} received</label>
              )}
              <button type="button" className="primary" disabled={busy} onClick={book}>Book it and create the job</button>
              <button type="button" className="link" onClick={() => setStatus('declined')}>Customer said no</button>
            </>
          )}
        </section>
      )}
    </Layout>
  )
}
