import { Link } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import PublicPage from '../components/PublicPage'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { shrink } from '../lib/photos'
import { HOME_SIZES, LEAD_SOURCES } from '../lib/types'
import { SUPPLIES } from '../lib/prices'

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

// The supplies the customer picked go at the top of their notes, where the office sees them when pricing
function withSupplies(notes: string, supplies: string[]) {
  const text = [supplies.length ? `Supplies wanted: ${supplies.join(', ')}` : '', notes.trim()].filter(Boolean).join('\n')
  return text || null
}

const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

type Place = { address: string; floor: string; elevator: string; parking: string }
const emptyPlace: Place = { address: '', floor: '', elevator: '', parking: '' }

export default function Book() {
  const [type, setType] = useState('full_move')
  const [from, setFrom] = useState<Place>(emptyPlace)
  const [to, setTo] = useState<Place>(emptyPlace)
  const [size, setSize] = useState('')
  const [items, setItems] = useState<string[]>([])
  const [supplies, setSupplies] = useState<string[]>([])
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
  const [sent, setSent] = useState<{ photosFailed: boolean } | null>(null)
  const { account } = useAuth()

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
      p_preferred_date: date, p_arrival_window: arrival || null, p_notes: withSupplies(notes, supplies),
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
    setBusy(false)
    setSent({ photosFailed })
    window.scrollTo(0, 0)
  }

  if (sent) {
    return (
      <PublicPage sub="Request sent">
        <section className="card center">
          <div className="done-mark">✓</div>
          <h2>Thanks, {name.split(' ')[0]}!</h2>
          <p>We got your request. We'll look it over and send your price {phone ? 'by text' : 'by email'}.</p>
          {sent.photosFailed && <p className="note">Some photos didn't upload. That's fine, we'll ask for them if we need them.</p>}
        </section>
      </PublicPage>
    )
  }

  return (
    <PublicPage sub="Get a moving quote">
      <form onSubmit={submit} className="form">
        <section className="card">
          <h3>What do you need?</h3>
          <div className="chips">
            {Object.entries(BOOK_TYPES).map(([k, label]) => (
              <button type="button" key={k} className={`chip big${type === k ? ' on' : ''}`} onClick={() => { setType(k); setSize('') }}>{label}</button>
            ))}
          </div>
        </section>

        <PlaceCard title={oneAddress ? 'Address' : 'Moving from'} place={from} onChange={setFrom} required />
        {!oneAddress && <PlaceCard title="Moving to" place={to} onChange={setTo} />}

        <section className="card form">
          <h3>{office ? 'How big is the office?' : 'How big is the move?'}</h3>
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
          <div className="small muted">Moving supplies (optional, added to your price)</div>
          <div className="chips">
            {SUPPLIES.map((x) => (
              <button type="button" key={x.name} className={`chip big${supplies.includes(x.name) ? ' on' : ''}`}
                onClick={() => setSupplies(supplies.includes(x.name) ? supplies.filter((s) => s !== x.name) : [...supplies, x.name])}>
                {x.name} · ${x.price} {x.per}
              </button>
            ))}
          </div>
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
        <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        <p className="note center-text">No account needed. We review every request and send you a price. By sending, you agree to our <Link to="/policies#terms">terms</Link> and <Link to="/policies#privacy">privacy policy</Link>.</p>
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
