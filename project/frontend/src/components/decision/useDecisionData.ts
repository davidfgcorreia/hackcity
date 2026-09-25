import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { Case } from '../../types'
import { getJson, type FC, type Laya, type Transit } from '../insights/data'
import type { Balance, Bike, Candidate, Cell, MapStop, People, Place, Route, Scheduled, StationArea, StationFlow, Vehicle } from './types'
import type { MapState } from './useMapState'

/** A fetched collection plus a version that changes on every load. React-Leaflet's <GeoJSON> ignores
 *  `data` changes after mount, so layers key on `version` to remount exactly when new data arrives. */
export type Versioned<T> = { data: T; version: number; loading: boolean }
const emptyFC = <P,>(): FC<P> => ({ type: 'FeatureCollection', features: [] })
let versionCounter = 0

const fetchJson = <T,>(path: string) => fetch(path).then(r => { if (!r.ok) throw new Error(`${r.status} ${path}`); return r.json() as Promise<T> })

export function useStatic<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!path) { setData(null); return }
    let active = true
    ;(path.startsWith('/') ? fetchJson<T>(path) : getJson<T>(path))
      .then(v => { if (active) { setData(v); setError('') } }).catch(e => { if (active) setError(String(e)) })
    return () => { active = false }
  }, [path])
  return { data, error }
}

function useCollection<P>(path: string, pick: (json: unknown) => FC<P>, onError: (e: string) => void): Versioned<FC<P>> {
  const [state, setState] = useState<Versioned<FC<P>>>({ data: emptyFC<P>(), version: 0, loading: true })
  const pickRef = useRef(pick); pickRef.current = pick
  const errorRef = useRef(onError); errorRef.current = onError
  useEffect(() => {
    let active = true
    setState(s => ({ ...s, loading: true }))
    getJson<unknown>(path)
      .then(v => { if (active) setState({ data: pickRef.current(v), version: ++versionCounter, loading: false }) })
      .catch(e => { if (active) { setState({ data: emptyFC<P>(), version: ++versionCounter, loading: false }); errorRef.current(String(e)) } })
    return () => { active = false }
  }, [path])
  return state
}

const lisbonNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Lisbon' }).replace(' ', 'T')

export function useDecisionData(s: MapState) {
  const [errors, setErrors] = useState<string[]>([])
  const fail = (e: string) => setErrors(current => current.includes(e) ? current : [...current, e])
  const [querySize, setQuerySize] = useState(s.size)
  useEffect(() => { const id = window.setTimeout(() => setQuerySize(s.size), 300); return () => window.clearTimeout(id) }, [s.size])
  useEffect(() => setErrors([]), [querySize, s.day, s.hour])

  const time = new URLSearchParams({ ...(s.day ? { day: s.day } : {}), ...(s.hour ? { hour: s.hour } : {}) }).toString()
  const filters = new URLSearchParams({ size: String(querySize), ...(s.day ? { day: s.day } : {}), ...(s.hour ? { hour: s.hour } : {}) }).toString()
  const cells = useCollection<Cell>(`map/analysis-cells?${filters}`, v => (v as { cells: FC<Cell> }).cells, fail)
  const candidates = useCollection<Candidate>(`map/analysis-candidates?${filters}`, v => (v as { cells: FC<Candidate> }).cells, fail)
  const people = useCollection<People>(`map/people?${filters}`, v => (v as { cells: FC<People> }).cells, fail)
  const stations = useStatic<{ stations: FC<StationFlow> }>(`map/station-flows${time ? `?${time}` : ''}`)
  const areas = useStatic<{ areas: FC<StationArea> }>('map/station-areas')
  const transit = useStatic<Transit>('transit')
  const stops = useStatic<{ stops: FC<MapStop> }>(`map/stops${time ? `?${time}` : ''}`)
  const routes = useStatic<{ routes: FC<Route> }>(`map/routes${time ? `?${time}` : ''}`)
  const places = useStatic<{ places: Place[] }>(s.layers.has('places') ? '/cascais-places.json' : null)
  // Laya re-scores the candidate pool at the chosen square size (all dates); the API caches every size.
  // Verdicts use the same top 10 as the Station candidates tab.
  const laya = useStatic<Laya>(s.layers.has('candidates') ? `laya?limit=10&pool=true&size=${querySize}` : null)

  const [cases, setCases] = useState<Case[]>([])
  const [bikes, setBikes] = useState<Bike[]>([])
  const [balance, setBalance] = useState<Balance[]>([])
  const reloadBalance = () => fetchJson<Balance[]>('/api/stations/balance').then(v => { if (Array.isArray(v)) setBalance(v) })
  useEffect(() => {
    let active = true
    const load = () => Promise.allSettled([api.cases(), fetchJson<{ bikes: Bike[] }>('/api/live/bikes'), fetchJson<Balance[]>('/api/stations/balance')])
      .then(([c, b, st]) => {
        if (!active) return
        if (c.status === 'fulfilled') setCases(c.value)
        if (b.status === 'fulfilled') setBikes(b.value.bikes ?? [])
        if (st.status === 'fulfilled' && Array.isArray(st.value)) setBalance(st.value)
      })
    load(); const id = window.setInterval(load, 15000)
    return () => { active = false; window.clearInterval(id) }
  }, [])

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [transitErrors, setTransitErrors] = useState<string[]>([])
  useEffect(() => {
    if (s.view !== 'live') return
    let active = true
    const load = () => fetchJson<{ vehicles: Vehicle[]; errors?: string[] }>('/api/transit/vehicles')
      .then(v => { if (active) { setVehicles(Array.isArray(v.vehicles) ? v.vehicles : []); setTransitErrors(v.errors ?? []) } })
      .catch(() => { if (active) { setVehicles([]); setTransitErrors(['live transit feed unavailable']) } })
    load(); const id = window.setInterval(load, 5000)
    return () => { active = false; window.clearInterval(id) }
  }, [s.view])

  const [scheduled, setScheduled] = useState<FC<Scheduled>>(emptyFC())
  useEffect(() => {
    let active = true
    const load = () => {
      const local = lisbonNow()
      // Live: the dated sample weekday/Saturday stands in for today, since today's timetable is not ingested.
      const sampleDay = [0, 6].includes(new Date(`${local.slice(0, 10)}T12:00:00`).getDay()) ? '2026-09-05' : '2026-09-02'
      const day = s.view === 'history' ? s.day || '2026-09-02' : sampleDay
      const hour = s.view === 'history' ? s.hour || '12' : local.slice(11, 13)
      getJson<{ vehicles: FC<Scheduled> }>(`map/scheduled-vehicles?day=${day}&hour=${hour}&minute=${local.slice(14, 16)}`)
        .then(v => { if (active) setScheduled(v.vehicles) }).catch(() => { if (active) setScheduled(emptyFC()) })
    }
    load(); const id = window.setInterval(load, 30000)
    return () => { active = false; window.clearInterval(id) }
  }, [s.view, s.day, s.hour])

  const staticErrors = [stations.error, areas.error, transit.error, stops.error, routes.error, places.error].filter(Boolean)
  return {
    querySize, filters, cells, candidates, people, stations: stations.data, areas: areas.data, transit: transit.data, stops: stops.data,
    routes: routes.data, places: places.data, laya: laya.data, cases, setCases, bikes, balance, reloadBalance, vehicles, transitErrors, scheduled,
    errors: [...errors, ...staticErrors], fail,
  }
}
export type DecisionData = ReturnType<typeof useDecisionData>
