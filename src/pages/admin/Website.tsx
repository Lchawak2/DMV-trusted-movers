import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { shrink } from '../../lib/photos'
import { DEFAULT_SITE, photoUrl, withDefaults, type SiteContent } from '../../lib/site'

type ListKey = 'services' | 'prices' | 'testimonials'
const BLANK = {
  services: { title: '', text: '' },
  prices: { label: '', price: '' },
  testimonials: { name: '', text: '' },
}

// Edit the public website: words, prices, reviews and photos
export default function Website() {
  const [site, setSite] = useState<SiteContent | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('site').maybeSingle().then(({ data }) => setSite(withDefaults(data?.site)))
  }, [])

  if (!site) return <Layout title="Website" back="/"><p className="muted center">Loading…</p></Layout>

  function change(next: Partial<SiteContent>) {
    setSite({ ...site!, ...next })
    setState('idle')
  }
  const text = (key: keyof SiteContent) => ({
    value: site[key] as string,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change({ [key]: e.target.value }),
  })
  function setItem(key: ListKey, i: number, field: string, value: string) {
    const list = [...site![key]] as Record<string, string>[]
    list[i] = { ...list[i], [field]: value }
    change({ [key]: list })
  }
  function addItem(key: ListKey) { change({ [key]: [...site![key], { ...BLANK[key] }] }) }
  function removeItem(key: ListKey, i: number) { change({ [key]: site![key].filter((_, j) => j !== i) }) }
  function moveItem(key: ListKey, i: number, by: number) {
    const list = [...site![key]]
    const j = i + by
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    change({ [key]: list })
  }

  async function upload(files: FileList | null, into: 'hero' | 'gallery') {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    const paths: string[] = []
    for (const file of Array.from(files)) {
      const path = `${crypto.randomUUID()}.jpg`
      try {
        const up = await supabase.storage.from('site-photos').upload(path, await shrink(file), { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        paths.push(path)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not upload that photo.')
      }
    }
    setUploading(false)
    if (into === 'hero' && paths[0]) change({ hero_photo: paths[0] })
    if (into === 'gallery') change({ gallery: [...site!.gallery, ...paths] })
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setState('saving')
    setError(null)
    const clean: SiteContent = {
      ...site!,
      services: site!.services.filter((s) => s.title.trim()),
      prices: site!.prices.filter((p) => p.label.trim() && p.price.trim()),
      testimonials: site!.testimonials.filter((t) => t.text.trim()),
    }
    const { error } = await supabase.from('settings').update({ site: clean, updated_at: new Date().toISOString() }).eq('id', true)
    if (error) { setState('idle'); return setError(error.message) }
    setSite(clean)
    setState('saved')
  }

  return (
    <Layout title="Website" back="/">
      <form className="form" onSubmit={save}>
        <div className="card">
          <p className="muted small">This is your public website. Change anything below and tap Save. Leave a box empty to use the starting text.</p>
          <a href="/site" target="_blank" rel="noreferrer" className="secondary block">View my website</a>
        </div>

        <section className="card form">
          <h3>Top of the page</h3>
          <label>Headline<input {...text('headline')} placeholder={DEFAULT_SITE.headline} /></label>
          <label>Under the headline<textarea rows={3} {...text('subheadline')} placeholder={DEFAULT_SITE.subheadline} /></label>
          <div className="site-edit-photo">
            {site.hero_photo
              ? <img src={photoUrl(site.hero_photo)} alt="" />
              : <span className="muted small">No background photo. The top shows your navy color.</span>}
            <div className="row">
              <label className="secondary file-btn">{site.hero_photo ? 'Change photo' : 'Add background photo'}
                <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files, 'hero')} />
              </label>
              {site.hero_photo && <button type="button" className="secondary" onClick={() => change({ hero_photo: null })}>Remove</button>}
            </div>
          </div>
        </section>

        <section className="card form">
          <h3>Colors</h3>
          <div className="row">
            <label>Main color<input type="color" {...text('main_color')} /></label>
            <label>Button color<input type="color" {...text('accent_color')} /></label>
          </div>
          <button type="button" className="link" onClick={() => change({ main_color: DEFAULT_SITE.main_color, accent_color: DEFAULT_SITE.accent_color })}>Go back to the starting colors</button>
        </section>

        <section className="card form">
          <h3>Contact</h3>
          <label>Phone<input type="tel" {...text('phone')} placeholder="(240) 555-0123" /></label>
          <label>Email<input type="email" {...text('email')} /></label>
          <label>Where you work<input {...text('area')} /></label>
          <label>Hours<input {...text('hours')} /></label>
        </section>

        <section className="card form">
          <h3>Services</h3>
          {site.services.map((s, i) => (
            <div className="site-edit-item" key={i}>
              <input value={s.title} placeholder="Service name" onChange={(e) => setItem('services', i, 'title', e.target.value)} />
              <textarea rows={2} value={s.text} placeholder="One or two lines about it" onChange={(e) => setItem('services', i, 'text', e.target.value)} />
              <ItemButtons onUp={() => moveItem('services', i, -1)} onDown={() => moveItem('services', i, 1)} onRemove={() => removeItem('services', i)} />
            </div>
          ))}
          <button type="button" className="secondary" onClick={() => addItem('services')}>Add a service</button>
        </section>

        <section className="card form">
          <h3>Prices</h3>
          <p className="muted small">Shown as a price list. Leave empty to hide the prices section.</p>
          {site.prices.map((p, i) => (
            <div className="site-edit-item" key={i}>
              <div className="row">
                <input value={p.label} placeholder="2 movers and a truck" onChange={(e) => setItem('prices', i, 'label', e.target.value)} />
                <input value={p.price} placeholder="$140/hr" onChange={(e) => setItem('prices', i, 'price', e.target.value)} />
              </div>
              <ItemButtons onUp={() => moveItem('prices', i, -1)} onDown={() => moveItem('prices', i, 1)} onRemove={() => removeItem('prices', i)} />
            </div>
          ))}
          <button type="button" className="secondary" onClick={() => addItem('prices')}>Add a price</button>
        </section>

        <section className="card form">
          <h3>Customer reviews</h3>
          <p className="muted small">Paste real reviews from your customers. Leave empty to hide this section. Your star rating from finished moves shows at the top on its own.</p>
          {site.testimonials.map((t, i) => (
            <div className="site-edit-item" key={i}>
              <textarea rows={3} value={t.text} placeholder="What they said" onChange={(e) => setItem('testimonials', i, 'text', e.target.value)} />
              <input value={t.name} placeholder="Their name, like Maria G., Silver Spring" onChange={(e) => setItem('testimonials', i, 'name', e.target.value)} />
              <ItemButtons onUp={() => moveItem('testimonials', i, -1)} onDown={() => moveItem('testimonials', i, 1)} onRemove={() => removeItem('testimonials', i)} />
            </div>
          ))}
          <button type="button" className="secondary" onClick={() => addItem('testimonials')}>Add a review</button>
        </section>

        <section className="card form">
          <h3>Photos of your work</h3>
          {site.gallery.length > 0 && (
            <div className="site-edit-gallery">
              {site.gallery.map((p) => (
                <div key={p}>
                  <img src={photoUrl(p)} alt="" />
                  <button type="button" className="link" onClick={() => change({ gallery: site.gallery.filter((g) => g !== p) })}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <label className="secondary file-btn">{uploading ? 'Uploading…' : 'Add photos'}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files, 'gallery')} />
          </label>
        </section>

        <section className="card form">
          <h3>About you</h3>
          <label>About the company<textarea rows={4} {...text('about')} /></label>
          <label>USDOT number<input {...text('usdot')} /></label>
          <label>Maryland mover license<input {...text('md_license')} /></label>
          <label>Insurance line<input {...text('insurance')} placeholder="Licensed and insured" /></label>
          <p className="muted small">The numbers show at the bottom of the page once you fill them in.</p>
        </section>

        {error && <p className="warn">{error}</p>}
        <div className="site-save">
          {state === 'saved' && <p className="note">Saved. Your website shows the changes now.</p>}
          <button className="primary block" disabled={state === 'saving' || uploading}>{state === 'saving' ? 'Saving…' : 'Save website'}</button>
        </div>
      </form>
    </Layout>
  )
}

function ItemButtons({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="site-edit-btns">
      <button type="button" className="link" onClick={onUp}>Move up</button>
      <button type="button" className="link" onClick={onDown}>Move down</button>
      <button type="button" className="link" onClick={onRemove}>Remove</button>
    </div>
  )
}
