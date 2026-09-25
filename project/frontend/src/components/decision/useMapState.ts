import { useEffect, useState } from 'react'
import { ALL_LAYERS, DEFAULT_LAYERS, GRID_METRICS, type GridMetric, type Layer } from './types'

/** Map view state, mirrored into the query string so a view can be shared for review.
 *  The tab stays in the hash (#Decision%20map), which is preserved. */
export type MapState = {
  view: 'history' | 'live'; size: number; day: string; hour: string; average: boolean; metric: GridMetric
  layers: Set<Layer>; age: number; candidates: string[]; cell: string | null; station: string | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function readMapState(search: string): MapState {
  const q = new URLSearchParams(search)
  const int = (key: string, min: number, max: number, step: number, fallback: number) => {
    const v = Number(q.get(key))
    return Number.isInteger(v) && v >= min && v <= max && v % step === 0 ? v : fallback
  }
  const hour = q.get('hour') ?? ''
  const layers = q.get('layers')
  return {
    view: q.get('view') === 'live' ? 'live' : 'history',
    size: int('size', 50, 1000, 50, 250),
    day: DATE.test(q.get('day') ?? '') ? q.get('day')! : '',
    hour: /^\d{1,2}$/.test(hour) && Number(hour) <= 23 ? String(Number(hour)) : '',
    average: q.get('avg') === '1',
    metric: GRID_METRICS.includes(q.get('metric') as GridMetric) ? q.get('metric') as GridMetric : 'trip_ends',
    layers: new Set(layers == null ? DEFAULT_LAYERS : layers.split(',').filter((l): l is Layer => ALL_LAYERS.includes(l as Layer))),
    age: int('age', 15, 720, 15, 120),
    candidates: (q.get('cand') ?? '').split(',').filter(Boolean).slice(0, 2),
    cell: q.get('cell') || null,
    station: q.get('station') || null,
  }
}

export function writeMapState(s: MapState): string {
  const q = new URLSearchParams()
  if (s.view === 'live') q.set('view', 'live')
  if (s.size !== 250) q.set('size', String(s.size))
  if (s.day) q.set('day', s.day)
  if (s.hour) q.set('hour', s.hour)
  if (s.average) q.set('avg', '1')
  if (s.metric !== 'trip_ends') q.set('metric', s.metric)
  const layers = ALL_LAYERS.filter(l => s.layers.has(l))
  if (layers.join(',') !== DEFAULT_LAYERS.join(',')) q.set('layers', layers.join(','))
  if (s.age !== 120) q.set('age', String(s.age))
  if (s.candidates.length) q.set('cand', s.candidates.join(','))
  if (s.cell) q.set('cell', s.cell)
  if (s.station) q.set('station', s.station)
  return q.toString()
}

export function useMapState() {
  const [state, setState] = useState(() => readMapState(location.search))
  useEffect(() => {
    const search = writeMapState(state)
    const url = `${location.pathname}${search ? `?${search}` : ''}${location.hash}`
    if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', url)
  }, [state])
  const update = (patch: Partial<MapState>) => setState(current => ({ ...current, ...patch }))
  const toggleLayer = (layer: Layer) => setState(current => {
    const layers = new Set(current.layers)
    if (layers.has(layer)) layers.delete(layer); else layers.add(layer)
    return { ...current, layers }
  })
  return { state, update, toggleLayer }
}
