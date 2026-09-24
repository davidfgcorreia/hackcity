/** Vector navigation map (MapLibre + OpenFreeMap tiles, no API key), Apple-Maps style:
 *  road route line with casing, driven part greyed, numbered stop pins, a heading puck,
 *  and two camera modes — "follow" (tilted, heading-up) and "overview" (whole route). */
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import type { Case, Mission, Stop } from '../../types'
import { colors } from './ui'
import type { FieldPosition } from './useGeolocation'

export type CameraMode = 'follow' | 'overview' | 'free'
type LngLat = [number, number]

const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const CASCAIS: LngLat = [-9.42, 38.705]

function pinEl(stop: Stop, active: boolean): HTMLElement {
  const el = document.createElement('div')
  const depot = stop.kind === 'depot'
  const done = stop.status === 'done'
  el.style.cssText = `width:${active ? 38 : 30}px;height:${active ? 38 : 30}px;border-radius:${depot ? '9px' : '50%'};
    display:flex;align-items:center;justify-content:center;font:700 ${active ? 16 : 14}px -apple-system,system-ui;color:#fff;
    background:${depot ? '#1c1c1e' : done ? colors.grey : colors.danger};border:3px solid #fff;cursor:pointer;
    box-shadow:0 2px 8px rgba(0,0,0,.35);transition:all .2s`
  el.innerHTML = depot
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M3 10 12 3l9 7v11h-6v-6H9v6H3z"/></svg>'
    : done ? '✓' : String(stop.seq)
  return el
}

function puckEl(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'width:24px;height:24px;position:relative'
  el.innerHTML = `
    <div data-cone style="position:absolute;left:-18px;top:-30px;width:60px;height:60px;transform-origin:30px 42px;
      background:radial-gradient(circle at 50% 70%, rgba(10,132,255,.35), rgba(10,132,255,0) 60%);
      clip-path:polygon(50% 70%, 20% 0, 80% 0);display:none"></div>
    <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(10,132,255,.3);animation:puck-pulse 2s ease-out infinite"></div>
    <div style="position:absolute;inset:0;border-radius:50%;background:${colors.primary};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`
  return el
}

export function NavMap({ mission, position, heading, travelled, ahead, activeStopId, mode, onUserMove, onSelect }: {
  mission: Mission | null
  position: FieldPosition | null
  heading: number | null
  travelled: LngLat[]
  ahead: LngLat[]
  cases: Case[]
  activeStopId: number | null
  mode: CameraMode
  onUserMove: () => void
  onSelect: (stop: Stop) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const ready = useRef(false)
  const pins = useRef<maplibregl.Marker[]>([])
  const puck = useRef<maplibregl.Marker | null>(null)
  const onUserMoveRef = useRef(onUserMove)
  onUserMoveRef.current = onUserMove

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!, style: STYLE, center: CASCAIS, zoom: 13.5,
      attributionControl: { compact: true }, pitchWithRotate: true,
    })
    m.on('load', () => {
      const line = (id: string) => m.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } })
      line('route-ahead'); line('route-done')
      m.addLayer({ id: 'route-done', type: 'line', source: 'route-done', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#8e8e93', 'line-width': 7, 'line-opacity': 0.7 } })
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route-ahead', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0461c7', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 17, 14] } })
      m.addLayer({ id: 'route-ahead', type: 'line', source: 'route-ahead', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colors.primary, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4.5, 17, 10] } })
      ready.current = true
      m.fire('route-ready')
    })
    // A gesture by the operator (not our camera moves) releases follow mode.
    m.on('dragstart', () => onUserMoveRef.current())
    m.on('rotatestart', (e) => { if ((e as { originalEvent?: Event }).originalEvent) onUserMoveRef.current() })
    map.current = m
    return () => { m.remove(); map.current = null; ready.current = false }
  }, [])

  // route lines
  useEffect(() => {
    const m = map.current
    if (!m) return
    const apply = () => {
      const set = (id: string, coords: LngLat[]) =>
        (m.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })
      set('route-ahead', ahead.length > 1 ? ahead : mission?.route_geojson?.coordinates ?? [])
      set('route-done', travelled.length > 1 ? travelled : [])
    }
    if (ready.current) apply()
    else m.once('route-ready', apply)
  }, [ahead, travelled, mission?.route_geojson])

  // stop pins
  useEffect(() => {
    const m = map.current
    if (!m) return
    pins.current.forEach((p) => p.remove())
    pins.current = (mission?.stops ?? []).filter((s) => s.status !== 'removed').map((s) => {
      const el = pinEl(s, s.id === activeStopId)
      el.addEventListener('click', (e) => { e.stopPropagation(); onSelect(s) })
      return new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m)
    })
  }, [mission?.stops, activeStopId, onSelect])

  // position puck
  useEffect(() => {
    const m = map.current
    if (!m || !position) return
    if (!puck.current) puck.current = new maplibregl.Marker({ element: puckEl(), rotationAlignment: 'map' }).setLngLat([position.lng, position.lat]).addTo(m)
    puck.current.setLngLat([position.lng, position.lat])
    const cone = puck.current.getElement().querySelector<HTMLElement>('[data-cone]')
    if (cone) {
      cone.style.display = heading == null ? 'none' : 'block'
      cone.style.transform = `rotate(${heading ?? 0}deg)`
    }
  }, [position, heading])

  // camera
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (mode === 'follow' && position) {
      m.easeTo({ center: [position.lng, position.lat], zoom: 16.6, pitch: 55, bearing: heading ?? m.getBearing(),
        padding: { top: 180, bottom: 240, left: 0, right: 0 }, duration: 900 })
    } else if (mode === 'overview') {
      const pts: LngLat[] = [...(mission?.route_geojson?.coordinates ?? []), ...(position ? [[position.lng, position.lat] as LngLat] : [])]
      if (pts.length > 1) {
        const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]))
        m.fitBounds(b, { padding: { top: 190, bottom: 250, left: 40, right: 40 }, pitch: 0, bearing: 0, duration: 800, maxZoom: 16 })
      }
    }
  }, [mode, position, heading, mission?.route_geojson])

  return <div ref={box} style={{ position: 'absolute', inset: 0 }} />
}
