import 'leaflet/dist/leaflet.css'
import { useEffect, useState, type ReactNode } from 'react'
import { MapContainer, Polygon, TileLayer } from 'react-leaflet'
import { api } from '../api'
import type { Station } from '../types'

const CASCAIS: [number, number] = [38.7, -9.42]

/** OSM base + station areas. Children draw cases / routes on top. */
export function BaseMap({ children }: { children?: ReactNode }) {
  const [stations, setStations] = useState<Station[]>([])
  useEffect(() => { api.stations().then(setStations).catch(() => {}) }, [])
  return (
    <MapContainer center={CASCAIS} zoom={14} style={{ height: '100%', width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      {stations.map((s) => (
        <Polygon key={s.id} positions={s.area.coordinates.map((poly) => poly[0].map(([lng, lat]) => [lat, lng] as [number, number]))}
          pathOptions={{ color: '#0b5d7a', weight: 1 }} />
      ))}
      {children}
    </MapContainer>
  )
}
