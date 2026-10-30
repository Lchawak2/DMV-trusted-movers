import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import PublicPage from '../components/PublicPage'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { shrink } from '../lib/photos'
import { HOME_SIZES, LEAD_SOURCES } from '../lib/types'
import { FREE_MINUTES, HOME_MOVES, MOVE_RATE, WEEKEND_FEE } from '../lib/prices'
import { usePageTitle } from '../lib/site'
import { track, trackOnce, usePageView } from '../lib/track'
import { priceLine, sizeName, t, useLang } from '../lib/lang'

// What customers can ask for; keys match JOB_TYPES
export const BOOK_TYPES: Record<string, string> = {
  full_move: 'Home move',
  office_move: 'Office move',
  small_move: 'Small move or a few items',
  junk_haul: 'Junk haul',
}
export const SPECIAL_ITEMS = ['Piano', 'Safe', 'Gym equipment', 'Pool table', 'Large TV', 'Artwork or mirrors', 'Appliances']
export const ARRIVAL_WINDOWS = ['Morning (8 to 10 AM)', 'Midday (11 AM to 1 PM)', 'Afternoon (2 to 4 PM)', 'Flexible']
const PARKING = ['Street', 'Driveway', 'Loading dock', 'Parking garage']

// Spanish names for the choices above; the English one is what gets saved
const ES: Record<string, string> = {
  'Home move': 'Mudanza de casa', 'Office move': 'Mudanza de oficina', 'Small move or a few items': 'Mudanza pequeña o pocas cosas', 'Junk haul': 'Retiro de basura',
  'Piano': 'Piano', 'Safe': 'Caja fuerte', 'Gym equipment': 'Equipo de gimnasio', 'Pool table': 'Mesa de billar', 'Large TV': 'TV grande',
  'Artwork or mirrors': 'Cuadros o espejos', 'Appliances': 'Electrodomésticos',
  'Morning (8 to 10 AM)': 'Mañana (8 a 10 AM)', 'Midday (11 AM to 1 PM)': 'Mediodía (11 AM a 1 PM)', 'Afternoon (2 to 4 PM)': 'Tarde (2 a 4 PM)', 'Flexible': 'Flexible',
  'Street': 'En la calle', 'Driveway': 'Entrada de la casa', 'Loading dock': 'Muelle de carga', 'Parking garage': 'Estacionamiento techado',
  'Google search': 'Búsqueda en Google', 'Facebook or Instagram': 'Facebook o Instagram', 'Friend or family': 'Un amigo o familiar',
  'Yelp, Thumbtack or Angi': 'Yelp, Thumbtack o Angi', 'Moved with us before': 'Ya me mudé con ustedes', 'Other': 'Otro',
}
const es = (s: string) => t(s, ES[s] ?? s)
const MAX_PHOTOS = 8

const dollars = (n: number) => '$' + n.toLocaleString('en-US')

// The price the database worked out right after the form was sent, with its quote link
type Instant = {
  lines: { label: string; amount: number }[]; price: number; deposit: number; token: string
  included_hours: number; extra_rate: number
}

// The answers behind an instant price, kept for this browser tab so "Change my answers" can bring them back
type Answers = {
  type: string; from: Place; to: Place; size: string; items: string[]
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

// Turn a saved request back into form answers
function fromRequest(r: RequestAnswers): Answers {
  const place = (address: string | null, floor: number | null, elevator: boolean | null, parking: string | null): Place =>
    ({ address: address ?? '', floor: floor === null ? '' : String(floor), elevator: elevator === null ? '' : elevator ? 'yes' : 'no', parking: parking ?? '' })
  const lines = (r.notes ?? '').split('\n')
  // older requests started with the boxes they wanted and how far apart the places were
  if (lines[0]?.startsWith('Supplies wanted:')) lines.shift()
  if (lines[0]?.startsWith('Distance: ')) lines.shift()
  return {
    type: r.move_type, size: r.home_size ?? '', items: r.special_items ?? [],
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

const isWeekend = (d: string) => d !== '' && [0, 6].includes(new Date(`${d}T12:00:00`).getDay())
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

// The form's parts, as the Visitors tab names them when it shows where people stop
const STEP_NAMES: Record<string, string> = { type: 'what they need', size: 'size', date: 'date', from: 'moving from', to: 'moving to', contact: 'how to reach them' }

// The first touch of each part of the form, so the Visitors tab can show how far people get
function touched(e: { target: EventTarget }) {
  const step = (e.target as Element).closest?.('[data-step]')?.getAttribute('data-step')
  if (!step) return
  trackOnce('book_start')
  trackOnce('book_step', step, { step })
}

// A required box the browser stopped the send for
function missing(e: { target: EventTarget }) {
  const step = (e.target as Element).closest?.('[data-step]')?.getAttribute('data-step')
  if (step) trackOnce('book_error', `missing-${step}`, { message: `Left blank: ${STEP_NAMES[step] ?? step}` })
}

type Place = { address: string; floor: string; elevator: string; parking: string }
const emptyPlace: Place = { address: '', floor: '', elevator: '', parking: '' }

export default function Book() {
  useLang()
  usePageTitle(t('Get your moving price | DMV Trusted Movers', 'Vea el precio de su mudanza | DMV Trusted Movers'))
  usePageView()
  const [type, setType] = useState('full_move')
  const [from, setFrom] = useState<Place>(emptyPlace)
  const [to, setTo] = useState<Place>(emptyPlace)
  const [size, setSize] = useState('')
  const [items, setItems] = useState<string[]>([])
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
    setType(a.type in BOOK_TYPES ? a.type : 'full_move'); setFrom(a.from); setTo(a.to); setSize(a.size); setItems(a.items)
    setDate(a.date); setArrival(a.arrival); setNotes(a.notes); setName(a.name); setPhone(a.phone); setEmail(a.email); setSource(a.source)
  }

  // Started from the quick quote box on the home page: /book?type=full_move&size=1+bedroom&date=2026-11-02
  useEffect(() => {
    const t = params.get('type'), sz = params.get('size'), d = params.get('date')
    if (t && t in BOOK_TYPES) setType(t)
    if (sz && HOME_SIZES.includes(sz)) setSize(sz)
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= addDays(2)) setDate(d)
  }, [params])

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
    track('change_answers')
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
  // No small item jobs for now; those requests used to be "Few items"
  // Home moves run from studio or 1 bedroom (booked as 1 bedroom) to 3 bedrooms
  const sizes = HOME_SIZES.filter((s) => s !== 'Few items' && s !== '4+ bedrooms' && (office ? s.includes('office') : !s.includes('office'))
    && !(type === 'full_move' && s === 'Studio'))
  const oneAddress = type === 'labor_only' || type === 'junk_haul' || type === 'packing'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!phone.trim() && !email.trim()) {
      track('book_error', { message: 'No phone or email' })
      return setError(t('Please give a phone number or an email so we can send your price.', 'Por favor déjenos un teléfono o un correo para enviarle su precio.'))
    }
    setError(null)
    setBusy(true)
    const elevator = (v: string) => (v === '' ? null : v === 'yes')
    const floor = (v: string) => (v === '' ? null : Number(v))
    const { data, error } = await supabase.rpc('submit_move_request', {
      p_full_name: name, p_phone: phone || null, p_email: email || null,
      p_move_type: type, p_home_size: size || null, p_special_items: items,
      p_from_address: from.address, p_from_floor: floor(from.floor), p_from_elevator: elevator(from.elevator), p_from_parking: from.parking || null,
      p_to_address: to.address || null, p_to_floor: floor(to.floor), p_to_elevator: elevator(to.elevator), p_to_parking: to.parking || null,
      p_preferred_date: date, p_arrival_window: arrival || null, p_notes: notes.trim() || null,
      p_lead_source: source || null,
    })
    if (error) {
      track('book_error', { message: error.message.slice(0, 80) })
      setBusy(false)
      return setError(error.message)
    }
    track('book_submit', { type, size })
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
    const quick = await supabase.rpc('instant_quote', { p_request: id, p_supplies: {}, p_replaces: replaces })
    const instant = quick.error ? null : (quick.data as Instant | null)
    if (instant) track('price_shown', { type, size: size || BOOK_TYPES[type], price: instant.price })
    else track('no_price', { type })
    if (instant) {
      saveDraft({ request: id, token: instant.token, answers: { type, from, to, size, items, date, arrival, notes, name, phone, email, source } })
    }
    setBusy(false)
    setReplaces(null)
    setSent({ photosFailed, instant, request: id })
    window.scrollTo(0, 0)
  }

  if (sent) {
    return (
      <PublicPage sub={t('Request sent', 'Solicitud enviada')} langSwitch>
        <section className="card center">
          <div className="done-mark">✓</div>
          <h2>{t('Thanks', 'Gracias')}, {name.split(' ')[0]}!</h2>
          {sent.instant ? (
            <>
              <p>{t('Here is your price.', 'Este es su precio.')}</p>
              <ul className="est-lines">
                {sent.instant.lines.map((l) => <li key={l.label}><span>{priceLine(l.label)}</span><strong>{dollars(l.amount)}</strong></li>)}
                <li className="sum"><span>{t('Your price', 'Su precio')}</span><strong>{dollars(sent.instant.price)}</strong></li>
              </ul>
              <p className="est-extra">
                {t('Includes up to', 'Incluye hasta')} <strong>{sent.instant.included_hours} {t('hours', 'horas')}</strong>. {t(`Going over? The first ${FREE_MINUTES} minutes are free, then it's`, `¿Se pasa? Los primeros ${FREE_MINUTES} minutos son gratis; después cuesta`)} <strong>{dollars(sent.instant.extra_rate)} {t('an hour', 'la hora')}</strong>{t(', by the minute.', ', cobrado por minuto.')}
              </p>
              <Link to={`/quote/${sent.instant.token}`} className="primary est-book" onClick={() => track('book_click')}>{t(`Book my date with a ${dollars(sent.instant.deposit)} deposit`, `Reservar mi fecha con un depósito de ${dollars(sent.instant.deposit)}`)}</Link>
              <button type="button" className="secondary est-book" onClick={changeAnswers}>{t('Change my answers', 'Cambiar mis respuestas')}</button>
              <p className="small muted">{t('No extra charge for stairs or paying by card. Free cancellation up to 72 hours before your move. This price is good for 3 days.', 'Sin cargo extra por escaleras ni por pagar con tarjeta. Cancelación gratis hasta 72 horas antes de su mudanza. Este precio es válido por 3 días.')}</p>
            </>
          ) : (
            <p>{t('We got your request. We\'ll look it over and send your price', 'Recibimos su solicitud. La revisaremos y le enviaremos su precio')} {phone ? t('by text', 'por mensaje de texto') : t('by email', 'por correo')}.</p>
          )}
          {sent.photosFailed && <p className="note">{t('Some photos didn\'t upload. That\'s fine, we\'ll ask for them if we need them.', 'Algunas fotos no se subieron. No se preocupe, se las pediremos si las necesitamos.')}</p>}
        </section>
      </PublicPage>
    )
  }

  return (
    <PublicPage sub={t('Get a moving quote', 'Cotización de mudanza')} langSwitch>
      <form onSubmit={submit} className="form" onFocusCapture={touched} onClickCapture={touched} onInvalidCapture={missing}>
        <p className="est-intro">{replaces ? t('Change anything below and send again for your new price.', 'Cambie lo que quiera abajo y envíe otra vez para ver su nuevo precio.') : <>{t('Answer a few questions and', 'Conteste unas preguntas y')} <strong>{t('see your price right away', 'vea su precio al instante')}</strong>{t(', with every part listed.', ', con cada parte detallada.')}</>}</p>
        <section className="card" data-step="type">
          <h3>{t('What do you need?', '¿Qué necesita?')}</h3>
          <div className="chips">
            {Object.entries(BOOK_TYPES).filter(([k]) => k !== 'small_move').map(([k, label]) => (
              <button type="button" key={k} className={`chip big${type === k ? ' on' : ''}`} onClick={() => { setType(k); setSize('') }}>{es(label)}</button>
            ))}
          </div>
          {(type === 'full_move' || type === 'office_move') && <div className="small muted">{t('You pack, we move. Please have your boxes packed before we arrive.', 'Usted empaca, nosotros movemos. Por favor tenga sus cajas empacadas antes de que lleguemos.')}</div>}
        </section>

        <section className="card form" data-step="size">
          <h3>{office ? t('How big is the office?', '¿Qué tan grande es la oficina?') : t('How big is the move?', '¿Qué tan grande es la mudanza?')}</h3>
          <div className="small muted">{t('Pick one so we can show your price.', 'Escoja uno para mostrarle su precio.')}</div>
          <div className="chips">
            {sizes.map((s) => {
              const flat = type === 'full_move' ? HOME_MOVES.find((m) => m.size === s) : undefined
              return <button type="button" key={s} className={`chip big${size === s ? ' on' : ''}`} onClick={() => setSize(size === s ? '' : s)}>{sizeName(flat?.label ?? s)}{flat && ` · ${dollars(flat.price)} · ${t(`up to ${flat.hours} hrs`, `hasta ${flat.hours} h`)}`}</button>
            })}
          </div>
          {type === 'full_move' && <p className="note">{t(`Past the hours included, the first ${FREE_MINUTES} minutes are free, then it's ${dollars(MOVE_RATE)} an hour, by the minute.`, `Después de las horas incluidas, los primeros ${FREE_MINUTES} minutos son gratis; luego cuesta ${dollars(MOVE_RATE)} la hora, cobrado por minuto.`)}</p>}
          <div className="small muted">{t('Big or special items', 'Cosas grandes o especiales')}</div>
          <div className="chips">
            {SPECIAL_ITEMS.map((s) => (
              <button type="button" key={s} className={`chip big${items.includes(s) ? ' on' : ''}`}
                onClick={() => setItems(items.includes(s) ? items.filter((x) => x !== s) : [...items, s])}>{es(s)}</button>
            ))}
          </div>
          <details className="more" open={photos.length > 0 || !!notes}>
            <summary>{t('Add photos or notes (optional)', 'Agregar fotos o notas (opcional)')}</summary>
          <label>
            {t('Photos (optional, they help us price it)', 'Fotos (opcional, nos ayudan a darle el precio)')}
            <input type="file" accept="image/*" multiple
              onChange={(e) => setPhotos([...photos, ...Array.from(e.target.files ?? [])].slice(0, MAX_PHOTOS))} />
          </label>
          {photos.length > 0 && (
            <div className="small">{photos.length} {photos.length === 1 ? t('photo added', 'foto agregada') : t('photos added', 'fotos agregadas')} · <button type="button" className="link" onClick={() => setPhotos([])}>{t('Remove', 'Quitar')}</button></div>
          )}
          <label>
            {t('Anything else we should know?', '¿Algo más que debamos saber?')}
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000}
              placeholder={t('Long walk to the truck, items to take apart, storage unit…', 'Camino largo hasta el camión, muebles para desarmar, bodega…')} />
          </label>
          </details>
        </section>

        <section className="card form" data-step="date">
          <h3>{t('When?', '¿Cuándo?')}</h3>
          <div className="row">
            <label>{t('Date', 'Fecha')}<input type="date" value={date} min={addDays(2)} onChange={(e) => setDate(e.target.value)} required /></label>
            <label>
              {t('Arrival', 'Llegada')}
              <select value={arrival} onChange={(e) => setArrival(e.target.value)}>
                <option value="">{t('Any time', 'Cualquier hora')}</option>
                {ARRIVAL_WINDOWS.map((w) => <option key={w} value={w}>{es(w)}</option>)}
              </select>
            </label>
          </div>
          {isWeekend(date) && (type === 'full_move' || type === 'office_move') && (
            <p className="note">{t(`Saturday and Sunday moves are ${dollars(WEEKEND_FEE)} more. Pick a weekday to save.`, `Las mudanzas en sábado y domingo cuestan ${dollars(WEEKEND_FEE)} más. Escoja un día entre semana para ahorrar.`)}</p>
          )}
          <p className="note">{t('Moves need at least 48 hours notice. Need it sooner? Please contact us directly.', 'Las mudanzas necesitan al menos 48 horas de aviso. ¿La necesita antes? Comuníquese con nosotros directamente.')}</p>
        </section>

        <PlaceCard title={oneAddress ? t('Address', 'Dirección') : t('Moving from', 'Se muda desde')} place={from} onChange={setFrom} required step="from" />
        {!oneAddress && <PlaceCard title={t('Moving to', 'Se muda a')} place={to} onChange={setTo} step="to" note={t('Moving more than 50 miles? Call us first.', '¿Se muda a más de 50 millas? Llámenos primero.')} />}

        <section className="card form" data-step="contact">
          <h3>{t('How do we reach you?', '¿Cómo lo contactamos?')}</h3>
          <label>{t('Name', 'Nombre')}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" /></label>
          <div className="row">
            <label>{t('Phone', 'Teléfono')}<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
            <label>{t('Email', 'Correo')}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          </div>
          <label>
            {t('How did you hear about us? (optional)', '¿Cómo supo de nosotros? (opcional)')}
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">{t('Choose', 'Escoja')}</option>
              {Object.entries(LEAD_SOURCES).map(([k, v]) => <option key={k} value={k}>{es(v)}</option>)}
            </select>
          </label>
        </section>

        {error && <p className="warn">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? t('Working out your price…', 'Calculando su precio…') : t('See my price', 'Ver mi precio')}</button>
        <ul className="est-trust">
          <li>{t('Flat price, truck and gas included', 'Precio fijo, camión y gasolina incluidos')}</li>
          <li>{t('No extra charge for stairs', 'Sin cargo extra por escaleras')}</li>
          <li>{t('Free cancellation up to 72 hours before', 'Cancelación gratis hasta 72 horas antes')}</li>
        </ul>
        <p className="note center-text">{t('No account needed. Your price shows up as soon as you send, and we confirm it by text or email. By sending, you agree to our', 'No necesita cuenta. Su precio aparece en cuanto envía, y se lo confirmamos por mensaje o correo. Al enviar, acepta nuestros')} <Link to="/policies#terms">{t('terms', 'términos')}</Link> {t('and', 'y nuestra')} <Link to="/policies#privacy">{t('privacy policy', 'política de privacidad')}</Link>.</p>
      </form>
    </PublicPage>
  )
}

function PlaceCard({ title, place, onChange, required, note, step }: { title: string; place: Place; onChange: (p: Place) => void; required?: boolean; note?: string; step: string }) {
  const set = (k: keyof Place, v: string) => onChange({ ...place, [k]: v })
  return (
    <section className="card form" data-step={step}>
      <h3>{title}</h3>
      <label>{t('Street address, city', 'Dirección y ciudad')}<input value={place.address} onChange={(e) => set('address', e.target.value)} required={required} minLength={required ? 5 : undefined} maxLength={300} autoComplete="street-address" /></label>
      <details className="more" open={!!(place.floor || place.elevator || place.parking)}>
        <summary>{t('Floor, elevator and parking (optional)', 'Piso, elevador y estacionamiento (opcional)')}</summary>
      <div className="row">
        <label>{t('Floor', 'Piso')}<input type="number" min={-2} max={99} inputMode="numeric" value={place.floor} onChange={(e) => set('floor', e.target.value)} /></label>
        <label>
          {t('Elevator', 'Elevador')}
          <select value={place.elevator} onChange={(e) => set('elevator', e.target.value)}>
            <option value="">{t('Not sure', 'No sé')}</option>
            <option value="yes">{t('Yes', 'Sí')}</option>
            <option value="no">{t('No, stairs', 'No, escaleras')}</option>
          </select>
        </label>
      </div>
      <label>
        {t('Parking for the truck', 'Estacionamiento para el camión')}
        <select value={place.parking} onChange={(e) => set('parking', e.target.value)}>
          <option value="">{t('Not sure', 'No sé')}</option>
          {PARKING.map((p) => <option key={p} value={p}>{es(p)}</option>)}
        </select>
      </label>
      </details>
      {note && <div className="small muted">{note}</div>}
    </section>
  )
}
