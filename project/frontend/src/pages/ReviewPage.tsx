import { useEffect, useState } from 'react'
import { CircleMarker, Popup } from 'react-leaflet'
import { api } from '../api'
import { BaseMap } from '../components/BaseMap'
import { useT } from '../i18n'
import type { Case, CaseStatus } from '../types'

export const STATUS_COLOR: Record<CaseStatus, string> = {
  candidate: '#9aa0a6', uncertain: '#f4b400', supported: '#fa7b17', eligible: '#d93025',
  assigned: '#a142f4', picked_up: '#188038', resolved: '#5f6368',
}

/** Desktop review view: map + searchable case list. */
export function ReviewPage() {
  const t = useT()
  const [cases, setCases] = useState<Case[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    const load = () => api.cases().then(setCases).catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const shown = cases.filter((c) => !q || c.device_id.includes(q) || c.status.includes(q))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', height: '100dvh' }}>
      <BaseMap>
        {shown.map((c) => (
          <CircleMarker key={c.id} center={[c.lat, c.lng]} radius={8} pathOptions={{ color: STATUS_COLOR[c.status], fillOpacity: 0.8 }}>
            <Popup>{c.device_id} · {c.status}<br />{c.reason}</Popup>
          </CircleMarker>
        ))}
      </BaseMap>
      <aside style={{ overflow: 'auto', padding: 12, fontFamily: 'system-ui' }}>
        <h2>{t.cases} ({shown.length})</h2>
        <input placeholder="search id / status" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', padding: 6 }} />
        {/* TODO(T-E2): case detail drawer with timeline, correction form, approve, export */}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {shown.map((c) => (
            <li key={c.id} style={{ borderLeft: `4px solid ${STATUS_COLOR[c.status]}`, padding: '6px 8px', margin: '6px 0' }}>
              <b>#{c.id} {c.device_id}</b> — {c.status}{c.needs_approval && ' · needs approval'}{c.blocked_reason && ` · ${c.blocked_reason}`}
              <div style={{ fontSize: 13, color: '#555' }}>{c.reason}</div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
