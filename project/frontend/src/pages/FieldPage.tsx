import { useEffect, useRef, useState } from 'react'
import { CircleMarker, Polyline, Popup } from 'react-leaflet'
import { api } from '../api'
import { BaseMap } from '../components/BaseMap'
import { useT } from '../i18n'
import type { Mission } from '../types'

const OPERATOR = 'op1' // TODO(T-D1): simple operator picker / login
const POLL_MS = 5000

/** Mobile field view: route map, next stop, change banner. */
export function FieldPage() {
  const t = useT()
  const [mission, setMission] = useState<Mission | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const version = useRef(0)

  useEffect(() => {
    const load = () =>
      api.mission(OPERATOR).then((m) => {
        if (m && version.current && m.version !== version.current) setBanner(m.last_change)
        version.current = m?.version ?? 0
        setMission(m) // keep last route on error: offline must not hide it
      }).catch(() => {})
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [])

  const planned = mission?.stops.filter((s) => s.status === 'planned') ?? []
  const next = planned[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {banner && (
        <div onClick={() => setBanner(null)} style={{ background: '#f4b400', padding: 12, fontWeight: 600 }}>
          {t.routeChanged}: {banner}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <BaseMap>
          <Polyline positions={planned.map((s) => [s.lat, s.lng] as [number, number])} pathOptions={{ color: '#d93025' }} />
          {planned.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={10}
              pathOptions={{ color: s.kind === 'depot' ? '#333' : '#d93025', fillOpacity: 0.8 }}>
              <Popup>#{s.seq} {s.kind === 'depot' ? t.depot : `case ${s.case_id}`}</Popup>
            </CircleMarker>
          ))}
        </BaseMap>
      </div>
      <div style={{ padding: 12, borderTop: '1px solid #ddd' }}>
        {mission ? (
          <>
            <b>{t.next}:</b> {next ? (next.kind === 'depot' ? t.depot : `case ${next.case_id}`) : '—'} · {mission.total_km} km
            {/* TODO(T-D3): stop sheet — bike ID, photo (<input capture>), outcome buttons -> api.recordOutcome */}
          </>
        ) : t.noMission}
      </div>
    </div>
  )
}
