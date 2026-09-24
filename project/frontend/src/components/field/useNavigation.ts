/** Turn-by-turn state from the mission's road route and the live position.
 *
 *  Snaps the position onto the route polyline, works out which OSRM step the van is on, the
 *  distance to the next maneuver, remaining time and distance, and flags "off route" when the
 *  van has been more than OFF_ROUTE_M away for OFF_ROUTE_MS (ops req §6: react to a wrong turn).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Mission, RouteStep } from '../../types'
import type { FieldPosition } from './useGeolocation'

export const OFF_ROUTE_M = 50
export const OFF_ROUTE_MS = 8_000

type LngLat = [number, number]

interface Prepared {
  coords: LngLat[]
  xy: [number, number][]
  cum: number[]          // metres along the polyline at each vertex
  length: number
  steps: (RouteStep & { leg: number; start: number })[]   // start = metres along the route
  legEnds: number[]      // metres along the route where each leg (stop) ends
  toXY: (p: LngLat) => [number, number]
}

function prepare(m: Mission | null): Prepared | null {
  const coords = m?.route_geojson?.coordinates
  if (!m || !coords || coords.length < 2) return null
  const [lng0, lat0] = coords[0]
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320
  const toXY = ([lng, lat]: LngLat): [number, number] => [(lng - lng0) * kx, (lat - lat0) * 110_540]
  const xy = coords.map(toXY)
  const cum = [0]
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]))
  const length = cum[cum.length - 1]
  const legs = m.route_legs ?? []
  const routeM = legs.reduce((a, l) => a + l.distance_m, 0) || length
  const scale = length / routeM   // OSRM step metres -> polyline metres
  const steps: Prepared['steps'] = []
  const legEnds: number[] = []
  let along = 0
  legs.forEach((leg, li) => {
    leg.steps.forEach((s) => { steps.push({ ...s, leg: li, start: along }); along += s.distance * scale })
    if (!leg.steps.length) along += leg.distance_m * scale
    legEnds.push(along)
  })
  return { coords, xy, cum, length, steps, legEnds, toXY }
}

export interface NavState {
  snapped: LngLat | null
  along: number              // metres travelled along the route
  offRouteM: number | null
  offRoute: boolean
  step: Prepared['steps'][number] | null       // step being driven
  next: Prepared['steps'][number] | null       // upcoming maneuver
  toNextM: number | null
  legIndex: number           // which stop the van is heading to (0 = first planned stop)
  toStopM: number | null
  remainingM: number | null
  remainingS: number | null
  toStopS: number | null
  travelled: LngLat[]        // for greying out the driven part
  ahead: LngLat[]
}

export function useNavigation(mission: Mission | null, position: FieldPosition | null, onOffRoute: () => number): NavState {
  // Polling returns a fresh mission object every five seconds. Its version changes whenever
  // the road route changes; key navigation state to that version so polling does not restart
  // the eight-second wrong-turn timer or the simulated drive.
  const route = useMemo(() => prepare(mission), [mission?.id, mission?.version])
  const offSince = useRef<number | null>(null)
  const fired = useRef(false)
  const [retryTick, retry] = useState(0)

  const state = useMemo<NavState>(() => {
    const empty: NavState = { snapped: null, along: 0, offRouteM: null, offRoute: false, step: null, next: null, toNextM: null,
      legIndex: 0, toStopM: null, remainingM: mission?.distance_m ?? null, remainingS: mission?.duration_s ?? null,
      toStopS: null, travelled: [], ahead: route?.coords ?? [] }
    if (!route || !position) return empty
    const p = route.toXY([position.lng, position.lat])
    let best = { d: Infinity, i: 0, t: 0 }
    for (let i = 0; i < route.xy.length - 1; i++) {
      const [ax, ay] = route.xy[i], [bx, by] = route.xy[i + 1]
      const dx = bx - ax, dy = by - ay
      const len2 = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2))
      const d = Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))
      if (d < best.d) best = { d, i, t }
    }
    const [a, b] = [route.coords[best.i], route.coords[best.i + 1]]
    const snapped: LngLat = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t]
    const along = route.cum[best.i] + (route.cum[best.i + 1] - route.cum[best.i]) * best.t
    let si = 0
    while (si + 1 < route.steps.length && route.steps[si + 1].start <= along + 3) si++
    const step = route.steps[si] ?? null
    const next = route.steps[si + 1] ?? null
    const found = route.legEnds.findIndex((end) => along < end - 15)
    const legIndex = found === -1 ? Math.max(0, route.legEnds.length - 1) : found
    const legEnd = route.legEnds[legIndex] ?? route.length
    const frac = (m: number) => (mission?.duration_s ?? 0) * (m / route.length)
    return {
      snapped, along, offRouteM: best.d, offRoute: best.d > OFF_ROUTE_M, step, next,
      toNextM: next ? next.start - along : legEnd - along,
      legIndex, toStopM: legEnd - along, toStopS: frac(legEnd - along),
      remainingM: route.length - along, remainingS: frac(route.length - along),
      travelled: [...route.coords.slice(0, best.i + 1), snapped], ahead: [snapped, ...route.coords.slice(best.i + 1)],
    }
  }, [route, position, mission])

  // Off route for long enough -> ask for a new route once, until back on route or a new route arrives.
  useEffect(() => { fired.current = false; offSince.current = null }, [mission?.id, mission?.version])
  useEffect(() => {
    if (!state.offRoute) { offSince.current = null; fired.current = false; return }
    offSince.current ??= Date.now()
    const wait = OFF_ROUTE_MS - (Date.now() - offSince.current)
    let retryId: ReturnType<typeof setTimeout> | undefined
    const id = setTimeout(() => {
      if (!fired.current && offSince.current && Date.now() - offSince.current >= OFF_ROUTE_MS) {
        const cooldownLeft = onOffRoute()
        if (cooldownLeft > 0) retryId = setTimeout(() => retry((n) => n + 1), cooldownLeft)
        else fired.current = true
      }
    }, Math.max(0, wait))
    return () => { clearTimeout(id); if (retryId) clearTimeout(retryId) }
  }, [state.offRoute, onOffRoute, retryTick])

  return state
}

/** Demo helper (`/field?sim`): drives along the planned route instead of reading GPS. */
export function useSimulatedDrive(mission: Mission | null, enabled: boolean, speedMs = 14): FieldPosition | null {
  const route = useMemo(() => prepare(mission), [mission?.id, mission?.version])
  const [pos, setPos] = useState<FieldPosition | null>(null)
  const along = useRef(0)
  useEffect(() => { along.current = 0 }, [route])
  useEffect(() => {
    if (!enabled || !route) return
    const tick = () => {
      along.current = Math.min(route.length, along.current + speedMs)
      let i = 0
      while (i + 1 < route.cum.length - 1 && route.cum[i + 1] < along.current) i++
      const seg = route.cum[i + 1] - route.cum[i] || 1
      const t = (along.current - route.cum[i]) / seg
      const [a, b] = [route.coords[i], route.coords[i + 1]]
      const heading = (Math.atan2(route.xy[i + 1][0] - route.xy[i][0], route.xy[i + 1][1] - route.xy[i][1]) * 180) / Math.PI
      setPos({ lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, accuracy: 5,
        heading: (heading + 360) % 360, speed: speedMs, at: new Date().toISOString() })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [enabled, route, speedMs])
  return pos
}
