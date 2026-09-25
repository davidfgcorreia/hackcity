import { divIcon, latLngBounds, type Layer as LeafletLayer, type PathOptions } from 'leaflet'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { CircleMarker, GeoJSON, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { countedMinutes, type Rules } from '../../enforcement'
import type { Case } from '../../types'
import type { FC, Feature } from '../insights/data'
import { BIKE_PERIOD, CARD_PERIOD, RAMP, p95, rampColor } from './definitions'
import { ageMinutes, metricValue, routeLabel, useFormat } from './format'
import type { Balance, Bike, Candidate, Cell, MapStop, People, Scheduled, Vehicle } from './types'
import type { DecisionData } from './useDecisionData'
import type { MapState } from './useMapState'

const icon = (symbol: string) => divIcon({ className: 'decision-figure', html: `<span aria-hidden="true">${symbol}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] })
const ICON = { bus: icon('🚌'), rail: icon('🚆') }
const RAIL_AGENCY = 'N18KL'
const position = (f: { geometry: GeoJSON.Geometry }): [number, number] => { const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates; return [lat, lon] }

export function routeColour(delay: number | null) {
  if (delay == null) return '#60758b'
  return delay <= 2 ? '#229866' : delay <= 5 ? '#a6ae39' : delay <= 10 ? '#db8d30' : '#cc4243'
}
export function balanceColour(b: Balance | undefined) {
  if (!b || b.occupancy_ratio == null) return '#9aa0a6'
  return b.occupancy_ratio >= .4 && b.occupancy_ratio <= .6 ? '#1baf7a' : b.occupancy_ratio < .4 ? '#e34948' : '#eda100'
}

/** Extrapolates a live vehicle along its reported heading for at most eight seconds. */
function projected(v: Vehicle, tick: number): [number, number] {
  if (v.speed_mps == null || !Number.isFinite(v.speed_mps) || v.speed_mps < 0 || v.speed_mps > 35 || v.bearing == null) return [v.lat, v.lon]
  const bearing = Number(v.bearing)
  if (!Number.isFinite(bearing)) return [v.lat, v.lon]
  const seconds = Math.max(0, Math.min(8, (tick - new Date(v.observed_at).getTime()) / 1000))
  const metres = v.speed_mps * seconds, angle = bearing * Math.PI / 180
  return [v.lat + metres * Math.cos(angle) / 111320, v.lon + metres * Math.sin(angle) / (111320 * Math.cos(v.lat * Math.PI / 180))]
}

/** Keeps the latest callback without re-binding Leaflet handlers. */
function useLatest<T>(value: T) { const ref = useRef(value); ref.current = value; return ref }

/** A polygon collection that remounts only when new data arrives and restyles in place otherwise. */
function Polygons<P>({ fc, version, style, onClick, tooltip }: {
  fc: FC<P>; version: number | string; style: (p: P) => PathOptions; onClick: (p: P) => void; tooltip: (p: P) => string
}) {
  const click = useLatest(onClick), tip = useLatest(tooltip)
  const styleFn = useCallback((f?: GeoJSON.Feature) => style(f!.properties as P), [style])
  const each = useCallback((f: GeoJSON.Feature, layer: LeafletLayer) => {
    const p = f.properties as P
    layer.on('click', () => click.current(p))
    layer.bindTooltip(() => tip.current(p), { sticky: true })
  }, [click, tip])
  return <GeoJSON key={version} data={fc as unknown as GeoJSON.GeoJsonObject} style={styleFn} onEachFeature={each} />
}

export function MapController({ data, resetSignal, focus, onZoom }: {
  data: DecisionData; resetSignal: number; focus: { lat: number; lon: number; key: number } | null; onZoom: (z: number) => void
}) {
  const map = useMap()
  useMapEvents({ zoomend: e => onZoom(e.target.getZoom()) })
  const bounds = useMemo(() => {
    const pts = data.stations?.stations.features.map(position) ?? []
    return pts.length ? latLngBounds(pts).pad(0.08) : null
  }, [data.stations])
  const fitted = useRef(false)
  useEffect(() => { if (bounds && !fitted.current) { map.fitBounds(bounds); fitted.current = true } }, [bounds, map])
  useEffect(() => { if (resetSignal && bounds) map.fitBounds(bounds) }, [resetSignal, bounds, map])
  useEffect(() => { if (focus) map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 15), { duration: .6 }) }, [focus, map])
  return null
}

export function GridLayer({ data, state, onCell }: { data: DecisionData; state: MapState; onCell: (area: string) => void }) {
  const { dt, count } = useFormat()
  const { metric, cell, average, day } = state
  const features = data.cells.data.features
  const max = useMemo(() => p95(features.map(f => metricValue(f.properties, metric))), [features, metric])
  const style = useCallback((p: Cell): PathOptions => {
    const v = metricValue(p, metric), selected = p.area_id === cell
    const weak = metric === 'outside_per_100_trip_ends' && p.insufficient
    return { color: selected ? '#0b0b0b' : '#ffffff', weight: selected ? 2.5 : .4, fillColor: rampColor(RAMP.blue, v, max), fillOpacity: v ? weak ? .25 : .72 : 0 }
  }, [metric, max, cell])
  const days = day ? 1 : BIKE_PERIOD.days
  return <Polygons fc={data.cells.data} version={data.cells.version} style={style} onClick={p => onCell(p.area_id)}
    tooltip={p => dt.tip.cell(count(p.trip_ends, average, days), count(p.outside_intervals, average, days), count(p.supported_120, average, days))} />
}

export function PeopleLayer({ data, state, onCell }: { data: DecisionData; state: MapState; onCell: (area: string) => void }) {
  const { dt, count } = useFormat()
  const features = data.people.data.features
  const max = useMemo(() => p95(features.map(f => f.properties.boardings)), [features])
  const style = useCallback((p: People): PathOptions => ({
    color: p.area_id === state.cell ? '#0b0b0b' : '#ffffff', weight: p.area_id === state.cell ? 2.5 : .4,
    fillColor: rampColor(RAMP.orange, p.boardings, max), fillOpacity: .68,
  }), [max, state.cell])
  return <Polygons fc={data.people.data} version={data.people.version} style={style} onClick={p => onCell(p.area_id)}
    tooltip={p => dt.tip.people(count(p.boardings, state.average, state.day ? 1 : CARD_PERIOD.days), state.average)} />
}

export function CandidateLayer({ data, state, onCandidate }: { data: DecisionData; state: MapState; onCandidate: (p: Candidate) => void }) {
  const { dt, n } = useFormat()
  const style = useCallback((p: Candidate): PathOptions => {
    const selected = state.candidates.includes(p.cell_id)
    if (p.score == null) return { color: selected ? '#0b0b0b' : '#8a8984', weight: selected ? 3 : 1, dashArray: '3 3', fillOpacity: 0 }
    return { color: selected ? '#0b0b0b' : '#961347', weight: selected ? 3 : 1.2, fillColor: rampColor(RAMP.magenta, p.score, 1), fillOpacity: .6 }
  }, [state.candidates])
  return <Polygons fc={data.candidates.data} version={data.candidates.version} style={style} onClick={onCandidate}
    tooltip={p => p.score == null ? dt.candidate.withheld : dt.tip.candidate(String(p.rank), n(p.score, 3))} />
}

export function StationLayers({ data, state, zoom, onStation }: { data: DecisionData; state: MapState; zoom: number; onStation: (id: string) => void }) {
  const { dt, count } = useFormat()
  const polygons = data.areas?.areas
  const buffers = useMemo<FC<object> | null>(() => polygons ? {
    type: 'FeatureCollection', features: polygons.features.map(f => ({ type: 'Feature', geometry: JSON.parse(f.properties.buffer_geometry), properties: {} }) as Feature<object>),
  } : null, [polygons])
  const balance = useMemo(() => new Map(data.balance.map(b => [b.station_id, b])), [data.balance])
  const flows = data.stations?.stations.features ?? []
  const maxDep = Math.max(1, ...flows.map(f => f.properties.departures))
  return <>
    {zoom >= 13 && buffers && <GeoJSON key="buffers" data={buffers as unknown as GeoJSON.GeoJsonObject} style={{ color: '#edaa44', weight: 1, fillColor: '#f5c56b', fillOpacity: .18 }} interactive={false} />}
    {zoom >= 13 && polygons && <GeoJSON key="stations" data={polygons as unknown as GeoJSON.GeoJsonObject} style={{ color: '#08765e', weight: 1.5, fillColor: '#2eb58d', fillOpacity: .4 }} interactive={false} />}
    {flows.map(f => {
      const p = f.properties, selected = state.station === p.station_id
      const live = state.view === 'live'
      return <CircleMarker key={p.station_id} center={position(f)} radius={live ? 5 : 3 + 6 * Math.sqrt(p.departures / maxDep)}
        eventHandlers={{ click: () => onStation(p.station_id) }}
        pathOptions={{ color: selected ? '#0b0b0b' : '#075f50', weight: selected ? 3 : 1, fillColor: live ? balanceColour(balance.get(p.station_id)) : '#27a382', fillOpacity: .95 }}>
        <Tooltip>{dt.tip.station(p.name.split(',')[0], count(p.departures, state.average, state.day ? 1 : BIKE_PERIOD.days), state.average)}</Tooltip>
      </CircleMarker>
    })}
  </>
}

export function TransitLayers({ data, state, zoom, motion, tick, onStop, onVehicle, onEstimated }: {
  data: DecisionData; state: MapState; zoom: number; motion: boolean; tick: number
  onStop: (s: MapStop) => void; onVehicle: (v: Vehicle) => void; onEstimated: (s: Scheduled) => void
}) {
  const { dt, n, time } = useFormat()
  const { layers, view, day, hour } = state
  const delayWindow = day && new Date(`${day}T12:00:00`).getDay() % 6 === 0 ? 'weekend'
    : hour && Number(hour) >= 7 && Number(hour) < 10 ? 'weekday 07-10' : hour && Number(hour) >= 16 && Number(hour) < 19 ? 'weekday 16-19' : 'all'
  const delays = useMemo(() => {
    const all = new Map<string, number>(), windowed = new Map<string, number>()
    for (const r of data.transit?.bus_delay ?? []) {
      if (r.time_window === 'all') all.set(r.route.toUpperCase(), r.median_delay_min)
      if (r.time_window === delayWindow) windowed.set(r.route.toUpperCase(), r.median_delay_min)
    }
    return (label: string) => windowed.get(label.toUpperCase()) ?? all.get(label.toUpperCase()) ?? null
  }, [data.transit, delayWindow])
  const liveCounts = useMemo(() => { const c = new Map<string, number>(); data.vehicles.forEach(v => c.set(routeLabel(v.route), (c.get(routeLabel(v.route)) ?? 0) + 1)); return c }, [data.vehicles])
  const visibleStops = useMemo(() => {
    const all = data.stops?.stops.features ?? []
    if (zoom >= 14) return all
    const weight = (p: MapStop) => (p.weekly_boardings ?? 0) + p.departures_per_hour * 30 + (p.max_routes_in_an_hour ?? 0) * 20
    return all.filter(f => f.properties.agency_id === RAIL_AGENCY || (f.properties.max_routes_in_an_hour ?? 0) >= 3 || (f.properties.weekly_boardings ?? 0) >= 100)
      .sort((a, b) => weight(b.properties) - weight(a.properties)).slice(0, zoom >= 12 ? 90 : 35)
  }, [data.stops, zoom])
  return <>
    {(layers.has('bus') || layers.has('rail')) && data.routes?.routes.features.map(f => {
      const rail = f.properties.route_type === '2'
      if ((rail ? !layers.has('rail') : !layers.has('bus')) || f.geometry.type !== 'LineString') return null
      const label = routeLabel(f.properties.route_short_name)
      const delay = rail ? null : delays(label)
      const live = view === 'live' ? liveCounts.get(label) ?? 0 : 0
      const activity = live || f.properties.scheduled_departures
      return <Polyline key={`${f.properties.route_type}-${f.properties.route_id}`} positions={f.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])}
        pathOptions={{ color: routeColour(delay), dashArray: rail ? '7 5' : undefined, weight: 1.5 + Math.min(5, Math.sqrt(activity) / 2), opacity: activity ? rail ? .65 : .55 : .18 }}>
        <Tooltip sticky>{dt.tip.route(rail ? dt.vehicle.train : dt.vehicle.bus, label)} · {live ? dt.tip.liveVehicles(n(live)) : dt.tip.sampleDepartures(n(f.properties.scheduled_departures), hour ? dt.tip.atHour(hour.padStart(2, '0')) : dt.tip.repDay)} · {delay == null ? dt.tip.noDelay : dt.tip.delay(n(delay, 1))}</Tooltip>
      </Polyline>
    })}
    {view === 'live' && data.vehicles.filter(v => v.agency_id === RAIL_AGENCY ? layers.has('rail') : layers.has('bus')).map(v =>
      <Marker key={`${v.source}-${v.id}`} position={motion ? projected(v, tick) : [v.lat, v.lon]} icon={v.agency_id === RAIL_AGENCY ? ICON.rail : ICON.bus} eventHandlers={{ click: () => onVehicle(v) }}>
        <Tooltip>{dt.tip.liveVehicle(v.route || dt.vehicle.bus, v.source, time(v.observed_at))}</Tooltip></Marker>)}
    {motion && zoom >= 13 && data.scheduled.features
      .filter(f => (f.properties.route_type === '2' ? layers.has('rail') : layers.has('bus')) && (view === 'history' || !liveCounts.has(routeLabel(f.properties.route_short_name))))
      .slice(0, 70).map(f => <Marker key={`scheduled-${f.properties.trip_id}`} position={position(f)} opacity={.48} icon={f.properties.route_type === '2' ? ICON.rail : ICON.bus}
        eventHandlers={{ click: () => onEstimated(f.properties) }}><Tooltip>{dt.tip.scheduled(routeLabel(f.properties.route_short_name))}</Tooltip></Marker>)}
    {layers.has('stops') && visibleStops.map(f => <CircleMarker key={`${f.properties.agency_id}-${f.properties.stop_id}`} center={position(f)}
      radius={f.properties.agency_id === RAIL_AGENCY ? 6 : zoom >= 14 ? 4 : 3} eventHandlers={{ click: () => onStop(f.properties) }}
      pathOptions={{ color: '#60445f', weight: 1, fillColor: f.properties.agency_id === RAIL_AGENCY ? '#a36fc0' : '#edbd65', fillOpacity: .9 }}>
      <Tooltip>{dt.tip.stop(f.properties.stop_name, n(f.properties.departures_per_hour, 1))}</Tooltip></CircleMarker>)}
  </>
}

/** Minutes since `since` that count toward the abandonment rule: only the enforcement window when it is on,
 *  the same clock as the backend detector, the Bird tab and the pickup mission. */
export const countedAge = (since: string, rules: Rules, nowMs = Date.now()) => countedMinutes(Date.parse(since), nowMs, rules)

/** Bikes outside the parking zone, freshly reported, and unmoved for more than `age` counted minutes.
 *  At `age` = the rule's limit (120) this is exactly the set the detector treats as abandoned. */
export const unmovedBikes = (bikes: Bike[], age: number, rules: Rules) => bikes.filter(b => (b.state === 'available' || b.state === 'non_operational') &&
  b.distance_outside_m != null && b.distance_outside_m > 0 && b.rest_since && countedAge(b.rest_since, rules) > age && b.last_reported && ageMinutes(b.last_reported) <= 30)
/** Open cases of the current mode; `nowMs` is the replay's simulated time in replay mode. */
export const openCases = (cases: Case[], age: number, replay: boolean, rules: Rules, nowMs = Date.now()) => cases
  .filter(c => c.source === 'field' || c.source === (replay ? 'replay' : 'live'))
  .filter(c => !['resolved', 'picked_up'].includes(c.status) && (c.distance_outside_m == null || c.distance_outside_m > 0) && (c.rest_since == null || countedAge(c.rest_since, rules, nowMs) > age))

export function LiveLayers({ data, state, zoom, replay, rules, nowMs, onBike, onCase }: {
  data: DecisionData; state: MapState; zoom: number; replay: boolean; rules: Rules; nowMs: number; onBike: (b: Bike) => void; onCase: (id: number) => void
}) {
  const { dt, n, dateTime } = useFormat()
  if (state.view !== 'live') return null
  return <>
    {state.layers.has('bikes') && data.bikes.filter(b => zoom >= 14 || (b.distance_outside_m && b.distance_outside_m > 0))
      .filter(b => b.state !== 'missing' || ageMinutes(b.last_seen) < 1440).slice(0, 1000).map(b =>
        <CircleMarker key={b.id} center={[b.lat, b.lng]} radius={3} pathOptions={{ color: '#fff', weight: 1, fillColor: b.state === 'missing' ? '#888' : b.state === 'available' ? '#298dc0' : '#d1a03d', fillOpacity: .9 }}>
          <Tooltip>{dt.tip.bike(b.id.slice(-6), b.state, dateTime(b.last_seen))}{b.distance_outside_m && b.distance_outside_m > 0 ? dt.tip.outsideBy(n(b.distance_outside_m)) : ''}</Tooltip></CircleMarker>)}
    {state.layers.has('unmoved') && unmovedBikes(data.bikes, state.age, rules).map(b =>
      <CircleMarker key={`unmoved-${b.id}`} center={[b.lat, b.lng]} radius={7} eventHandlers={{ click: () => onBike(b) }} pathOptions={{ color: '#bc3436', weight: 2, fillColor: '#ef9c4c', fillOpacity: .9 }}>
        <Tooltip>{dt.tip.unmoved(b.id.slice(-6), n(countedAge(b.rest_since!, rules)), n(ageMinutes(b.rest_since)), n(b.distance_outside_m))}</Tooltip></CircleMarker>)}
    {state.layers.has('cases') && openCases(data.cases, state.age, replay, rules, nowMs).map(c =>
      <CircleMarker key={c.id} center={[c.lat, c.lng]} radius={8} eventHandlers={{ click: () => onCase(c.id) }} pathOptions={{ color: '#fff', weight: 2, fillColor: c.status === 'uncertain' ? '#888' : '#d93c42', fillOpacity: .95 }}>
        <Tooltip>{dt.tip.case(c.id, c.status, c.reason)}</Tooltip></CircleMarker>)}
  </>
}
