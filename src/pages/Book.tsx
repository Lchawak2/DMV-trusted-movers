import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import PublicPage from '../components/PublicPage'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { shrink } from '../lib/photos'
import { HOME_SIZES, LEAD_SOURCES } from '../lib/types'
import { DRIVE_FEE, SUPPLIES } from '../lib/prices'
import Stepper from '../components/Stepper'

// What customers can ask for; keys match JOB_TYPES
export const BOOK_TYPES: Record<string, string> = {
  full_move: 'Home move',
  office_move: 'Office move',
  small_move: 'Small move or a few items',
  labor_only: 'Loading or unloading only',
  packing: 'Packing',
  junk_haul: 'Junk haul',
}
export const SPECIAL_ITEMS = ['Piano', 'Safe', 'Gym equipment', 'Pool table', 'Large TV', 'Artwork or mirrors', 'Appliances']
export const ARRIVAL_WINDOWS = ['Morning (8 to 10 AM)', 'Midday (11 AM to 1 PM)', 'Afternoon (2 to 4 PM)', 'Flexible']
const PARKING = ['Street', 'Driveway', 'Loading dock', 'Parking garage']
const MAX_PHOTOS = 8
const DISTANCES: Record<string, string> = { near: 'Under 20 miles', mid: '20 to 50 miles', far: 'Over 50 miles' }

// The boxes and supplies the customer counted, and how far apart the places are, go at the top of their notes,
// where the office sees them when pricing
function withSupplies(notes: string, supplies: Record<string, number>, distance: string) {
  const wanted = SUPPLIES.filter((x) => supplies[x.name] > 0).map((x) => `${supplies[x.name]} ${x.name.toLowerCase()}`)
  const text = [
    wanted.length ? `Supplies wanted: ${wanted.join(', ')}` : 'Supplies wanted: none',
    DISTANCES[distance] ? `Distance: ${DISTANCES[distance]}` : '',
    notes.trim(),
  ].filter(Boolean).join('\n')
  return text || null
}

const dollars = (n: number) => '$' + n.toLocaleString('en-US')

// The price the database worked out right after the form was sent, with its quote link
type Instant = {
  lines: { label: string; amount: number }[]; price: number; deposit: number; token: string
  hours: number; included_hours: number; extra_rate: number; likely: number
}

// The answers behind an instant price, kept for this browser tab so "Change my answers" can bring them back
type Answers = {
  type: string; from: Place; to: Place; distance: string; size: string; items: string[]; supplies: Record<string, number>
  date: string; arrival: string; notes: string; name: string; phone: string; email: string; source: string
}
type Draft = { answers: Answers; request: string; token: string }
const DRAFT_KEY = 'quote-answers'

// A saved request as quote_answers returns it
type RequestAnswers = {
  request: string; move_type: string; home_size: string | null; special_items: string[]
  from_address: string; from_floor: number | null; from_elevator: boolean | null; from_parking: string | null
  to_address: string | null; to_floor: number | null; to_elevator: boolean | null; to_parking: string | null
  preferred_date: string; arrival_window: string | null; notes: string | null; lead_source: string | null
  full_name: string; phone: string | null; email: string | null
}

// Turn a saved request back into form answers; the box counts come from the "Supplies wanted" line withSupplies wrote
function fromRequest(r: RequestAnswers): Answers {
  const place = (address: string | null, floor: number | null, elevator: boolean | null, parking: string | null): Place =>
    ({ address: address ?? '', floor: floor === null ? '' : String(floor), elevator: elevator === null ? '' : elevator ? 'yes' : 'no', parking: parking ?? '' })
  const lines = (r.notes ?? '').split('\n')
  const supplies: Record<string, number> = {}
  if (lines[0]?.startsWith('Supplies wanted:')) {
    for (const part of lines.shift()!.slice('Supplies wanted:'.length).split(',')) {
      const m = part.trim().match(/^(\d+) (.+)$/)
      const x = m && SUPPLIES.find((s) => s.name.toLowerCase() === m[2])
      if (x) supplies[x.name] = Number(m![1])
    }
  }
  let distance = ''
  if (lines[0]?.startsWith('Distance: ')) {
    const label = lines.shift()!.slice('Distance: '.length)
    distance = Object.keys(DISTANCES).find((k) => DISTANCES[k] === label) ?? ''
  }
  return {
    type: r.move_type, distance, size: r.home_size ?? '', items: r.special_items ?? [], supplies,
    from: place(r.from_address, r.from_floor, r.from_elevator, r.from_parking), to: place(r.to_address, r.to_floor, r.to_elevator, r.to_parking),
    date: r.preferred_date, arrival: r.arrival_window ?? '', notes: lines.join('\n'),
    name: r.full_name, phone: r.phone ?? '', email: r.email ?? '', source: r.lead_source ?? '',
  }
}
function savedDraft(): Draft | null {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') } catch { return null }
}
function saveDraft(d: Draft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* private mode: change from the price screen still works */ }
}

const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

type Place = { address: string; floor: string; elevator: string; parking: string }
const emptyPlace: Place = { address: '', floor: '', elevator: '', parking: '' }

export default function Book() {
  const [type, setType] = useState('full_move')
  const [from, setFrom] = useState<Place>(emptyPlace)
  const [to, setTo] = useState<Place>(emptyPlace)
  const [distance, setDistance] = useState('')
  const [size, setSize] = useState('')
  const [items, setItems] = useState<string[]>([])
  const [supplies, setSupplies] = useState<Record<string, number>>({})
  const [photos, setPhotos] = useState<File[]>([])
  const [date, setDate] = useState('')
  const [arrival, setArrival] = useState('')
  const [notes, setNotes] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ photosFailed: boolean; instant: Instant | null; request: string } | null>(null)
  const [replaces, setReplaces] = useState<string | null>(null)
  const { account } = useAuth()
  const [params] = useSearchParams()

  function restore(a: Answers) {
    setType(a.type); setFrom(a.from); setTo(a.to); setDistance(a.distance ?? ''); setSize(a.size); setItems(a.items); setSupplies(a.supplies)
    setDate(a.date); setArrival(a.arrival); setNotes(a.notes); setName(a.name); setPhone(a.phone); setEmail(a.email); setSource(a.source)
  }

  // Coming back from the booking page with "Change my answers": use this tab's copy, or ask the database
  useEffect(() => {
    const token = params.get('change')
    if (!token) return
    const draft = savedDraft()
    if (draft?.token === token) {
      restore(draft.answers)
      setReplaces(draft.request)
      return
    }
    supabase.rpc('quote_answers', { p_token: token }).then(({ data }) => {
      if (!data) return
      const a = fromRequest(data as RequestAnswers)
      restore(a)
      setReplaces((data as RequestAnswers).request)
    })
  }, [params])

  function changeAnswers() {
    if (!sent) return
    setReplaces(sent.request)
    setSent(null)
    window.scrollTo(0, 0)
  }

  // A signed-in customer booking again: fill in their details
  useEffect(() => {
    if (account?.role !== 'client') return
    setName((v) => v || account.full_name || '')
    setPhone((v) => v || account.phone || '')
    setEmail((v) => v || account.email || '')
  }, [account])

  const office = type === 'office_move'
  const sizes = HOME_SIZES.filter((s) => (office ? s.includes('office') : !s.includes('office')))
  const oneAddress = type === 'labor_only' || type === 'junk_haul' || type === 'packing'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!phone.trim() && !email.trim()) return setError('Please give a phone number or an email so we can send your price.')
    setError(null)
    setBusy(true)
    const elevator = (v: string) => (v === '' ? null : v === 'yes')
    const floor = (v: string) => (v === '' ? null : Number(v))
    const { data, error } = await supabase.rpc('submit_move_request', {
      p_full_name: name, p_phone: phone || null, p_email: email || null,
      p_move_type: type, p_home_size: size || null, p_special_items: items,
      p_from_address: from.address, p_from_floor: floor(from.floor), p_from_elevator: elevator(from.elevator), p_from_parking: from.parking || null,
      p_to_address: to.address || null, p_to_floor: floor(to.floor), p_to_elevator: elevator(to.elevator), p_to_parking: to.parking || null,
      p_preferred_date: date, p_arrival_window: arrival || null, p_notes: withSupplies(notes, supplies, oneAddress ? '' : distance),
      p_lead_source: source || null,
    })
    if (error) { setBusy(false); return setError(error.message) }
    const id = data as string
    let photosFailed = false
    for (const file of photos) {
      try {
        const path = `${id}/${crypto.randomUUID()}.jpg`
        const up = await supabase.storage.from('request-photos').upload(path, await shrink(file), { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        const row = await supabase.rpc('add_request_photo', { p_request: id, p_path: path })
        if (row.error) throw row.error
      } catch {
        photosFailed = true
      }
    }
    // Simple moves get their price and booking link now; the rest wait for the office
    const quick = await supabase.rpc('instant_quote', { p_request: id, p_supplies: supplies, p_replaces: replaces, p_distance: oneAddress ? null : distance || null })
    const instant = quick.error ? null : (quick.data as Instant | null)
    if (instant) {
      saveDraft({ request: id, token: instant.token, answers: { type, from, to, distance, size, items, supplies, date, arrival, notes, name, phone, email, source } })
    }
    setBusy(false)
    setReplaces(null)
    setSent({ photosFailed, instant, request: id })
    window.scrollTo(0, 0)
  }

  if (sent) {
    return (
      <PublicPage sub="Request sent">
        <section className="card center">
          <div className="done-mark">✓</div>
          <h2>Thanks, {name.split(' ')[0]}!</h2>
          {sent.instant ? (
            <>
              <p>Here is your price.</p>
              <ul className="est-lines">
                {sent.instant.lines.map((l) => <li key={l.label}><span>{l.label}</span><strong>{dollars(l.amount)}</strong></li>)}
                <li className="sum"><span>Your price</span><strong>{dollars(sent.instant.price)}</strong></li>
              </ul>
              <p className="small">
                Takes more than {sent.instant.included_hours} hours? Extra time is {dollars(sent.instant.extra_rate)} an hour, and you only pay for the time we use.
                {sent.instant.hours > sent.instant.included_hours && ` Most ${size ? size.toLowerCase() + ' ' : ''}moves like yours take about ${sent.instant.hours} hours, about ${dollars(sent.instant.likely)} in total.`}
              </p>
              <Link to={`/quote/${sent.instant.token}`} className="primary est-book">Book my date with a {dollars(sent.instant.deposit)} deposit</Link>
              <button type="button" className="secondary est-book" onClick={changeAnswers}>Change my answers</button>
              <p className="small muted">No extra charge for stairs or paying by card. Free cancellation up to 72 hours before your move. This price is good for 3 days.</p>
            </>
          ) : (
            <p>We got your request. We'll look it over and send your price {phone ? 'by text' : 'by email'}.</p>
          )}
          {sent.photosFailed && <p className="note">Some photos didn't upload. That's fine, we'll ask for them if we need them.</p>}
        </section>
      </PublicPage>
    )
  }

  return (
    <PublicPage sub="Get a moving quote">
      <form onSubmit={submit} className="form">
        <p className="est-intro">{replaces ? 'Change anything below and send again for your new price.' : <>Answer a few questions and <strong>see your price right away</strong>, with every part listed.</>}</p>
        <section className="card">
          <h3>What do you need?</h3>
          <div className="chips">
            {Object.entries(BOOK_TYPES).map(([k, label]) => (
              <button type="button" key={k} className={`chip big${type === k ? ' on' : ''}`} onClick={() => { setType(k); setSize('') }}>{label}</button>
            ))}
          </div>
          {(type === 'full_move' || type === 'small_move' || type === 'office_move') && <div className="small muted">You pack, we move. Want us to pack too? Pick Packing.</div>}
        </section>

        <PlaceCard title={oneAddress ? 'Address' : 'Moving from'} place={from} onChange={setFrom} required />
        {!oneAddress && <PlaceCard title="Moving to" place={to} onChange={setTo} />}
        {!oneAddress && (
          <section className="card form">
            <h3>How far apart are the two places?</h3>
            <div className="chips">
              {Object.entries(DISTANCES).map(([k, label]) => (
                <button type="button" key={k} className={`chip big${distance === k ? ' on' : ''}`} onClick={() => setDistance(k)}>{label}</button>
              ))}
            </div>
            <div className="small muted">{distance === 'mid' ? `Adds $${DRIVE_FEE} for the longer drive.` : distance === 'far' ? "We'll work out your price and send it to you." : 'Pick one so we can show your price.'}</div>
          </section>
        )}

        <section className="card form">
          <h3>{office ? 'How big is the office?' : 'How big is the move?'}</h3>
          <div className="small muted">Pick one so we can show your price.</div>
          <div className="chips">
            {sizes.map((s) => <button type="button" key={s} className={`chip big${size === s ? ' on' : ''}`} onClick={() => setSize(size === s ? '' : s)}>{s}</button>)}
          </div>
          <div className="small muted">Big or special items</div>
          <div className="chips">
            {SPECIAL_ITEMS.map((s) => (
              <button type="button" key={s} className={`chip big${items.includes(s) ? ' on' : ''}`}
                onClick={() => setItems(items.includes(s) ? items.filter((x) => x !== s) : [...items, s])}>{s}</button>
            ))}
          </div>
          <label>
            Photos (optional, they help us price it)
            <input type="file" accept="image/*" multiple
              onChange={(e) => setPhotos([...photos, ...Array.from(e.target.files ?? [])].slice(0, MAX_PHOTOS))} />
          </label>
          {photos.length > 0 && (
            <div className="small">{photos.length} {photos.length === 1 ? 'photo' : 'photos'} added · <button type="button" className="link" onClick={() => setPhotos([])}>Remove</button></div>
          )}
          <div><strong>How many boxes do you need?</strong></div>
          <div className="small muted">We bring them and add them to your price. Have your own boxes? Leave these at 0.</div>
          {SUPPLIES.filter((x) => x.box).map((x) => (
            <div className="calc-row" key={x.name}>
              <span>{x.name} <small>${x.price} {x.per}</small></span>
              <Stepper value={supplies[x.name] ?? 0} onChange={(n) => setSupplies({ ...supplies, [x.name]: n })} label={x.name.toLowerCase()} />
            </div>
          ))}
          <div className="small muted">Other supplies (optional)</div>
          {SUPPLIES.filter((x) => !x.box).map((x) => (
            <div className="calc-row" key={x.name}>
              <span>{x.name} <small>${x.price} {x.per}</small></span>
              <Stepper value={supplies[x.name] ?? 0} onChange={(n) => setSupplies({ ...supplies, [x.name]: n })} label={x.name.toLowerCase()} />
            </div>
          ))}
          <label>
            Anything else we should know?
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000}
              placeholder="Long walk to the truck, items to take apart, storage unit…" />
          </label>
        </section>

        <section className="card form">
          <h3>When?</h3>
          <div className="row">
            <label>Date<input type="date" value={date} min={addDays(2)} onChange={(e) => setDate(e.target.value)} required /></label>
            <label>
              Arrival
              <select value={arrival} onChange={(e) => setArrival(e.target.value)}>
                <option value="">Any time</option>
                {ARRIVAL_WINDOWS.map((w) => <option key={w}>{w}</option>)}
              </select>
            </label>
          </div>
          <p className="note">Moves need at least 48 hours notice. Need it sooner? Please contact us directly.</p>
        </section>

        <section className="card form">
          <h3>How do we reach you?</h3>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" /></label>
          <div className="row">
            <label>Phone<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          </div>
          <label>
            How did you hear about us? (optional)
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Choose</option>
              {Object.entries(LEAD_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </section>

        {error && <p className="warn">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Working out your price…' : 'See my price'}</button>
        <p className="note center-text">No account needed. Your price shows up as soon as you send, and we confirm it by text or email. By sending, you agree to our <Link to="/policies#terms">terms</Link> and <Link to="/policies#privacy">privacy policy</Link>.</p>
      </form>
    </PublicPage>
  )
}

function PlaceCard({ title, place, onChange, required }: { title: string; place: Place; onChange: (p: Place) => void; required?: boolean }) {
  const set = (k: keyof Place, v: string) => onChange({ ...place, [k]: v })
  return (
    <section className="card form">
      <h3>{title}</h3>
      <label>Street address, city<input value={place.address} onChange={(e) => set('address', e.target.value)} required={required} minLength={required ? 5 : undefined} maxLength={300} autoComplete="street-address" /></label>
      <div className="row">
        <label>Floor<input type="number" min={-2} max={99} inputMode="numeric" value={place.floor} onChange={(e) => set('floor', e.target.value)} /></label>
        <label>
          Elevator
          <select value={place.elevator} onChange={(e) => set('elevator', e.target.value)}>
            <option value="">Not sure</option>
            <option value="yes">Yes</option>
            <option value="no">No, stairs</option>
          </select>
        </label>
      </div>
      <label>
        Parking for the truck
        <select value={place.parking} onChange={(e) => set('parking', e.target.value)}>
          <option value="">Not sure</option>
          {PARKING.map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
    </section>
  )
}
