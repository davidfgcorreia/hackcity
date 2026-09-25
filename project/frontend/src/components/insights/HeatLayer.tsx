/** Density cloud of points (leaflet.heat). Import order matters: the global `L` must exist first. */
import './leafletGlobal'
import 'leaflet.heat'
import L from 'leaflet'
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/** Low → high density, the same ramp the legend swatch shows. */
export const HEAT_GRADIENT = { 0.2: '#fde68a', 0.45: '#f59e0b', 0.7: '#ea580c', 1: '#b91c1c' }

export function HeatLayer({ points, radius = 22, blur = 18 }: { points: [number, number][]; radius?: number; blur?: number }) {
  const map = useMap()
  useEffect(() => {
    const layer = L.heatLayer(points.map(([lat, lng]) => L.latLng(lat, lng)), { radius, blur, maxZoom: 16, minOpacity: 0.25, gradient: HEAT_GRADIENT }).addTo(map)
    return () => { layer.remove() }
  }, [map, points, radius, blur])
  return null
}
