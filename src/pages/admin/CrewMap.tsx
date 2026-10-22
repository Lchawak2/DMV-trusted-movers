import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { dateTime } from '../../lib/format'

type OnClock = {
  crew_id: string; name: string; phone: string | null
  job_id: string; job_date: string; from_address: string; to_address: string | null; clock_in: string
  lat: number | null; lng: number | null; accuracy: number | null; updated_at: string | null
}

const REFRESH_MS = 30_000
// A spot older than this means the mover's app is closed or their phone lost signal
const STALE_MIN = 5

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : dateTime(iso)
}

// Where the crew on the clock are right now, refreshed every 30 seconds
export default function CrewMap() {
  const [crew, setCrew] = useState<OnClock[] | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const fitted = useRef(false)

  useEffect(() => {
    const load = () => supabase.rpc('crew_on_the_clock').then(({ data }) => setCrew((data ?? []) as OnClock[]))
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!box.current || map.current) return
    // Starts over the DMV until the crew's spots come in
    map.current = L.map(box.current).setView([38.9, -77.03], 10)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  useEffect(() => {
    if (!map.current || !layer.current || !crew) return
    layer.current.clearLayers()
    const spots = crew.filter((c) => c.lat != null && c.lng != null)
    for (const c of spots) {
      const stale = (Date.now() - new Date(c.updated_at!).getTime()) / 60_000 > STALE_MIN
      L.circleMarker([c.lat!, c.lng!], {
        radius: 10, weight: 3, color: '#fff', fillColor: stale ? '#9aa3af' : '#d4a017', fillOpacity: 1,
      }).bindTooltip(`${c.name} · ${ago(c.updated_at!)}`, { permanent: true, direction: 'top', offset: [0, -10] })
        .addTo(layer.current)
    }
    if (spots.length && !fitted.current) {
      map.current.fitBounds(L.latLngBounds(spots.map((c) => [c.lat!, c.lng!] as [number, number])), { maxZoom: 15, padding: [40, 40] })
      fitted.current = true
    }
  }, [crew])

  return (
    <Layout back="/" title="Crew map">
      <div ref={box} className="crew-map" />
      <section className="card">
        <h3>On the clock</h3>
        {crew === null && <p className="muted">Loading…</p>}
        {crew?.length === 0 && <p className="muted">No one is on the clock right now. Movers show up here once they clock in.</p>}
        <ul className="list">
          {crew?.map((c) => {
            const stale = c.updated_at && (Date.now() - new Date(c.updated_at).getTime()) / 60_000 > STALE_MIN
            return (
              <li key={`${c.crew_id}-${c.job_id}`}>
                <div className="list-main">
                  <strong>{c.name}</strong>
                  <div className="muted small"><Link to={`/jobs/${c.job_id}`}>{c.from_address}</Link></div>
                  <div className="small">
                    {c.updated_at
                      ? `Seen ${ago(c.updated_at)}${stale ? ' · app may be closed' : ''}`
                      : 'No location yet · app closed or location off'}
                  </div>
                </div>
                <div className="list-side">
                  {c.phone && <a href={`tel:${c.phone}`} className="secondary small-btn">Call</a>}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="note">Movers share their spot only while clocked in, with the job page open on their phone. Clocking out stops it and clears their spot.</p>
      </section>
    </Layout>
  )
}
