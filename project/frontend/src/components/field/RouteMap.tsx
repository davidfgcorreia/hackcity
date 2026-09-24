/** T-D2: the route as the operator sees it — numbered stops, the driving order, the depot
 *  at the end, and where the van is now. */
import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { CircleMarker, Marker, Polyline, Tooltip, useMap } from 'react-leaflet'
import { BaseMap } from '../BaseMap'
import type { Case, Stop } from '../../types'
import { colors } from './ui'
import type { FieldPosition } from './useGeolocation'

const numberIcon = (seq: number, active: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;font:700 14px system-ui;color:#fff;
      background:${colors.danger};
      border:${active ? `3px solid ${colors.warn}` : '2px solid #fff'};
      box-shadow:0 1px 4px rgba(0,0,0,.4)">${seq}</div>`,
  })

const depotIcon = L.divIcon({
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  html: `<div style="width:30px;height:30px;border-radius:6px;display:flex;align-items:center;
    justify-content:center;font:700 16px system-ui;color:#fff;background:#333;border:2px solid #fff">■</div>`,
})

/** Follow the van until the operator drags the map themselves. */
function FollowPosition({ position }: { position: FieldPosition | null }) {
  const map = useMap()
  const pinned = useRef(false)
  useEffect(() => {
    const release = () => { pinned.current = true }
    map.on('dragstart', release)
    return () => { map.off('dragstart', release) }
  }, [map])
  useEffect(() => {
    if (position && !pinned.current) map.setView([position.lat, position.lng], map.getZoom())
  }, [map, position])
  return null
}

export function RouteMap({ stops, position, cases, activeStopId, onSelect }: {
  stops: Stop[]
  position: FieldPosition | null
  cases: Case[]
  activeStopId: number | null
  onSelect: (stop: Stop) => void
}) {
  const planned = stops.filter((s) => s.status === 'planned')
  const line: [number, number][] = [
    ...(position ? [[position.lat, position.lng] as [number, number]] : []),
    ...planned.map((s) => [s.lat, s.lng] as [number, number]),
  ]

  return (
    <BaseMap>
      <FollowPosition position={position} />
      <Polyline positions={line} pathOptions={{ color: colors.danger, weight: 4, opacity: 0.8 }} />
      {/* Only what is still to do: a recorded stop leaves the route (ops req §5). */}
      {planned.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]}
          icon={s.kind === 'depot' ? depotIcon : numberIcon(s.seq, s.id === activeStopId)}
          eventHandlers={{ click: () => onSelect(s) }}>
          <Tooltip direction="top" offset={[0, -16]}>
            {s.kind === 'depot'
              ? 'Armazém · Depot'
              : `#${s.seq} ${cases.find((c) => c.id === s.case_id)?.device_id ?? `case ${s.case_id}`}`}
          </Tooltip>
        </Marker>
      ))}
      {position && (
        <CircleMarker center={[position.lat, position.lng]} radius={8}
          pathOptions={{ color: '#fff', weight: 2, fillColor: colors.primary, fillOpacity: 1 }} />
      )}
    </BaseMap>
  )
}
