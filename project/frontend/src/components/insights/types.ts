/** Mirror of the JSON contract in project/analytics/README.md — change both together.
 *
 *  These files are static analysis output, not the operations API, so they live apart from
 *  src/types.ts. The page renders them and never computes a metric itself.
 */

export type Evidence = 'observed' | 'inferred_proxy' | 'experimental_forecast' | 'scenario'
export type Quality = 'ok' | 'insufficient_observations'

export interface Source { name: string; retrieved: string; rows: number }

export interface Meta {
  /** "mock" makes the page shout that nothing here was measured. */
  status: 'mock' | 'observed'
  generated_at: string
  observed_from: string
  observed_to: string
  timezone_display: string
  coverage: string
  grid: { crs: string; cell_m: number }
  sources: Source[]
  notes: string[]
}

export type Bounds = [[number, number], [number, number]]

export interface RecoveryRow {
  id: string
  unit: 'cell' | 'station'
  name: string
  lat: number
  lng: number
  bounds: Bounds
  station_id: string | null
  trip_ends: number
  abandonments: number
  abandonments_per_100_trip_ends: number | null
  idle_hours_median: number | null
  hours_to_provider_pickup_median: number | null
  distinct_intervals: number
  quality: Quality
  evidence: Evidence
}

export interface Component {
  value: number
  raw: number | null
  unit: string
  available: boolean
}

export interface CandidateRow {
  id: string
  name: string
  lat: number
  lng: number
  bounds: Bounds
  score: number | null
  rank: number | null
  score_without_bus_delay: number | null
  rank_without_bus_delay: number | null
  components: Record<string, Component>
  distinct_intervals: number
  nearest_station_m: number
  quality: Quality
  evidence: Evidence
  blockers: string[]
}

export interface HourFlow { hour: number; departures: number; arrivals: number; net: number }

export interface FlowRow {
  station_id: string
  name: string
  lat: number
  lng: number
  day_type: 'weekday' | 'weekend'
  departures: number
  arrivals: number
  net_flow: number
  by_hour: HourFlow[]
  evidence: Evidence
}

export interface RecoveryFile { meta: Meta; rows: RecoveryRow[] }
export interface OpportunityFile { meta: Meta; weights: Record<string, number>; rows: CandidateRow[] }
export interface FlowFile { meta: Meta; rows: FlowRow[] }

/** Which measure paints the map on the recovery layer. */
export type RecoveryMetric =
  | 'abandonments_per_100_trip_ends'
  | 'idle_hours_median'
  | 'hours_to_provider_pickup_median'
