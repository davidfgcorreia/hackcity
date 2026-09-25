/** Helpers shared by the /data analysis tabs (InsightsPage and the Bird tab). */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { useDT } from '../../i18n-data'
import { getJson } from './data'
import { C, card } from './viz'

export const CASCAIS: [number, number] = [38.715, -9.40]
/** Opens the decision map with a query-string preset (see components/decision/useMapState.ts). */
export type OpenOnMap = (query: Record<string, string>) => void

export function useData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    getJson<T>(path).then((d) => alive && setData(d)).catch((e) => alive && setErr(String(e)))
    return () => { alive = false }
  }, [path])
  return { data, err }
}

export function Map({ children, height = 520, zoom = 13, center = CASCAIS }: { children: ReactNode; height?: number; zoom?: number; center?: [number, number] }) {
  return (
    <div style={{ height, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.line}` }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} preferCanvas>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="tiles-muted"
          attribution="© OpenStreetMap contributors" />
        {children}
      </MapContainer>
    </div>
  )
}

export function Loading({ err }: { err?: string | null }) {
  const dt = useDT()
  return <div style={{ ...card, color: err ? '#c0302f' : C.text2 }}>{err ?? dt.page.loading}</div>
}

export function pill(on: boolean): CSSProperties {
  return { border: `1px solid ${on ? C.s1 : C.line}`, background: on ? '#e8f1fc' : '#fff', color: on ? '#184f95' : C.text2,
    borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
}

export function MapLink({ open, query }: { open: OpenOnMap; query: Record<string, string> }) {
  const dt = useDT()
  return <button onClick={() => open(query)} style={pill(false)}>{dt.page.openOnMap} →</button>
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
