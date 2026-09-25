import type { Candidate as CandidateBase, StopP } from '../insights/data'

export type Cell = { area_id: string; trip_ends: number; trip_starts: number; outside_intervals: number; supported_120: number; provider_recoveries: number; outside_per_100_trip_ends: number | null; insufficient: boolean }
export type Candidate = CandidateBase
export type People = { area_id: string; boardings: number; cards: number }
export type JourneyFlow = { origin_municipality: string; dest_municipality: string; journeys: number; cards: number; with_transfer: number; observed_destinations: number }
export type Route = { route_id: string; route_short_name: string; route_type: string; services: number; scheduled_departures: number }
export type Scheduled = { trip_id: string; route_short_name: string; route_type: string }
export type StationArea = { station_id: string; name: string; buffer_geometry: string }
export type StationFlow = { station_id: string; name: string; departures: number; arrivals: number }
export type MapStop = Omit<StopP, 'weekly_boardings'> & { weekly_boardings: number | null }
export type Balance = { station_id: string; name: string; bikes_available: number | null; reported_at: string | null; collected_at: string | null; observed_peak: number | null; observed_days: number | null; operator_target: number | null; benchmark: number | null; benchmark_status: 'operator_target' | 'observed_peak' | 'insufficient_history'; min_benchmark_days: number; occupancy_ratio: number | null }
export type BalanceDay = { day_local: string; samples: number; average_bikes: number; peak_bikes: number }
export type Bike = { id: string; lat: number; lng: number; state: string; last_seen: string; last_reported: string | null; rest_since: string | null; distance_outside_m: number | null }
export type Vehicle = { id: string; lat: number; lon: number; speed_mps: number | null; bearing: number | null; agency_id: string; route: string; trip_id: string; stop_id: string; source: string; observed_at: string }
export type Arrival = { route: string; trip_id: string; vehicle_id: string | null; eta_at: string; eta_seconds: number | null }
export type Departure = { route: string; route_type: string; time_local: string; direction: string }
export type Place = { name: string; category: string; lat: number; lng: number }
export type HourCount = { is_weekend: boolean; hour_local: number }
export type CellProfile = {
  trip_hours: (HourCount & { trip_starts: number; trip_ends: number })[]
  parking_hours: (HourCount & { outside_intervals: number; supported_120: number })[]
  days: { is_weekend: boolean; n_days: number }[]
  parking_bands: { band_index: number; band: string; intervals: number }[]
  end_reasons: { end_reason: string; intervals: number; over_120: number }[]
  boarding_hours: (HourCount & { boardings: number })[]
  boarding_hours_suppressed: number
}
export type StopProfile = { hours: (HourCount & { validations: number; n_days: number })[]; suppressed_hours: number }
export type CatalogueRow = { key: string; name: string; kind: string; used_in: string[]; meaning: string; coverage?: string; unit?: string; period_start?: string | null; period_end?: string | null; rows?: number | null; available?: boolean }

export type Layer = 'grid' | 'stations' | 'candidates' | 'people' | 'bus' | 'rail' | 'stops' | 'bikes' | 'unmoved' | 'cases' | 'places'
export type GridMetric = 'trip_ends' | 'trip_starts' | 'outside_intervals' | 'supported_120' | 'provider_recoveries' | 'outside_per_100_trip_ends'
export const GRID_METRICS: GridMetric[] = ['trip_ends', 'trip_starts', 'outside_intervals', 'supported_120', 'provider_recoveries', 'outside_per_100_trip_ends']
export const LAYER_GROUPS: { key: 'bikes' | 'candidates' | 'transit' | 'live' | 'context'; layers: Layer[]; liveOnly?: boolean }[] = [
  { key: 'bikes', layers: ['grid', 'stations'] },
  { key: 'candidates', layers: ['candidates'] },
  { key: 'transit', layers: ['people', 'bus', 'rail', 'stops'] },
  { key: 'live', layers: ['bikes', 'unmoved', 'cases'], liveOnly: true },
  { key: 'context', layers: ['places'] },
]
export const ALL_LAYERS = LAYER_GROUPS.flatMap(g => g.layers)
export const DEFAULT_LAYERS: Layer[] = ['grid', 'stations', 'candidates', 'stops', 'bikes', 'unmoved', 'cases']
