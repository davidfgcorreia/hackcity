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

function pinSize(zoom: number, mode: CameraMode, active: boolean): number {
  if (mode === 'overview' || zoom < 12.5) return active ? 12 : 10
  if (zoom < 14) return active ? 24 : 18
  return active ? 38 : 30
}

function paintPin(el: HTMLElement, stop: Stop, active: boolean, size: number): void {
  el.dataset.stopId = String(stop.id)
  el.dataset.caseId = String(stop.case_id ?? '')
  el.dataset.lat = String(stop.lat)
  el.dataset.lng = String(stop.lng)
  const depot = stop.kind === 'depot'
  const done = stop.status === 'done'
  const compact = size <= 12
  el.style.boxSizing = 'border-box'
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.borderRadius = depot ? `${Math.max(2, Math.round(size / 4))}px` : '50%'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.font = `700 ${size >= 30 ? (active ? 16 : 14) : 11}px -apple-system,system-ui`
  el.style.color = '#fff'
  el.style.background = depot ? '#1c1c1e' : done ? colors.grey : colors.danger
  el.style.border = `${compact ? 1.5 : size < 30 ? 2 : 3}px solid #fff`
  el.style.cursor = 'pointer'
  el.style.boxShadow = compact ? '0 1px 3px rgba(0,0,0,.45)' : '0 2px 8px rgba(0,0,0,.35)'
  el.style.transition = 'width .15s, height .15s, border-radius .15s'
  el.title = depot ? 'Complexo Multisserviços' : `Bicicleta ${stop.seq}`
  const content = compact ? '' : depot
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M3 10 12 3l9 7v11h-6v-6H9v6H3z"/></svg>'
    : done ? '✓' : String(stop.seq)
  if (el.innerHTML !== content) el.innerHTML = content
}

function pinEl(stop: Stop, active: boolean, size: number): HTMLElement {
  const el = document.createElement('div')
  paintPin(el, stop, active, size)
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

export function NavMap({ mission, position, snapped, heading, travelled, ahead, activeStopId, mode, onUserMove, onSelect }: {
  mission: Mission | null
  position: FieldPosition | null
  snapped: LngLat | null
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
  const pins = useRef<Map<number, { marker: maplibregl.Marker; stop: Stop }>>(new Map())
  const puck = useRef<maplibregl.Marker | null>(null)
  const onUserMoveRef = useRef(onUserMove)
  const modeRef = useRef(mode)
  const activeStopRef = useRef(activeStopId)
  const refreshPinsRef = useRef<() => void>(() => {})
  onUserMoveRef.current = onUserMove
  modeRef.current = mode
  activeStopRef.current = activeStopId
  refreshPinsRef.current = () => {
    const m = map.current
    if (!m) return
    for (const [id, entry] of pins.current) {
      const active = id === activeStopRef.current
      paintPin(entry.marker.getElement(), entry.stop, active, pinSize(m.getZoom(), modeRef.current, active))
    }
  }

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!, style: STYLE, center: CASCAIS, zoom: 13.5,
      attributionControl: { compact: true }, pitchWithRotate: true,
    })
    m.on('load', () => {
      const line = (id: string) => m.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } })
      line('route-ahead'); line('route-done'); line('route-access')
      m.addLayer({ id: 'route-access', type: 'line', source: 'route-access', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#b65c23', 'line-width': 3, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } })
      m.addLayer({ id: 'route-done', type: 'line', source: 'route-done', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#8e8e93', 'line-width': 7, 'line-opacity': 0.7 } })
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route-ahead', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0461c7', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 17, 14] } })
      m.addLayer({ id: 'route-ahead', type: 'line', source: 'route-ahead', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colors.primary, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4.5, 17, 10] } })
      ready.current = true
      m.fire('route-ready')
    })
    // Only a real gesture releases follow. stop() cancels an active camera animation.
    const release = () => { m.stop(); onUserMoveRef.current() }
    m.on('dragstart', release)
    m.on('touchstart', release)
    m.on('wheel', release)
    m.on('rotatestart', (e) => { if ((e as { originalEvent?: Event }).originalEvent) release() })
    m.on('zoom', () => refreshPinsRef.current())
    map.current = m
    return () => { pins.current.clear(); puck.current = null; m.remove(); map.current = null; ready.current = false }
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
      const approximate = mission?.routing_engine === 'straight-line'
      m.setLayoutProperty('route-casing', 'visibility', approximate ? 'none' : 'visible')
      m.setPaintProperty('route-ahead', 'line-color', approximate ? '#b65c23' : colors.primary)
      m.setPaintProperty('route-ahead', 'line-dasharray', approximate ? [2, 2] : null)
      const access: LngLat[][] = []
      const waypoints = mission?.route_waypoints
      if (mission?.routing_engine === 'osrm' && waypoints?.length) {
        if (position) access.push([[position.lng, position.lat], snapped ?? waypoints[0]])
        const planned = (mission.stops ?? []).filter(s => s.status === 'planned').sort((a, b) => a.seq - b.seq)
        planned.forEach((s, i) => { if (waypoints[i + 1] && s.kind !== 'depot') access.push([waypoints[i + 1], [s.lng, s.lat]]) })
      }
      ;(m.getSource('route-access') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: access.map(coordinates => ({ type: 'Feature' as const, properties: { approximate: true }, geometry: { type: 'LineString' as const, coordinates } })) })
    }
    if (ready.current) apply()
    else m.once('route-ready', apply)
  }, [ahead, travelled, position, snapped, mission])

  // stop pins
  useEffect(() => {
    const m = map.current
    if (!m) return
    const visible = new Set((mission?.stops ?? []).filter(s => s.status !== 'removed').map(s => s.id))
    for (const [id, entry] of pins.current) if (!visible.has(id)) { entry.marker.remove(); pins.current.delete(id) }
    for (const s of mission?.stops ?? []) {
      if (!visible.has(s.id)) continue
      let entry = pins.current.get(s.id)
      if (!entry) {
        const el = pinEl(s, s.id === activeStopId, pinSize(m.getZoom(), mode, s.id === activeStopId))
        const record = { marker: new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m), stop: s }
        el.addEventListener('click', e => { e.stopPropagation(); onSelect(record.stop) })
        pins.current.set(s.id, record)
        entry = record
      } else {
        paintPin(entry.marker.getElement(), s, s.id === activeStopId, pinSize(m.getZoom(), mode, s.id === activeStopId))
        entry.marker.setLngLat([s.lng, s.lat])
        entry.stop = s
      }
    }
  }, [mission?.stops, activeStopId, mode, onSelect])

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
      const pts: LngLat[] = [...(mission?.route_geojson?.coordinates ?? []), ...(mission?.stops ?? []).filter(s => s.status === 'planned').map(s => [s.lng, s.lat] as LngLat), ...(position ? [[position.lng, position.lat] as LngLat] : [])]
      if (pts.length > 1) {
        const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]))
        m.fitBounds(b, { padding: { top: 190, bottom: 250, left: 40, right: 40 }, pitch: 0, bearing: 0, duration: 800, maxZoom: 16 })
      }
    }
  }, [mode, position, heading, mission?.route_geojson])

  return <div ref={box} style={{ position: 'absolute', inset: 0 }} />
}
