// Analytics API client (project/analytics, proxied at /analytics). Aggregates only.
export interface Feature<P> { type: 'Feature'; geometry: GeoJSON.Geometry; properties: P }
export interface FC<P> { type: 'FeatureCollection'; features: Feature<P>[] }
export interface Meta { source?: string; sources?: string[]; kind?: string; notes?: string[] }

export async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`/analytics/${path}`)
  if (!r.ok) throw new Error(`${r.status} /analytics/${path}`)
  return r.json()
}

export interface B5 {
  provider_recoveries_total: number; provider_recoveries_outside: number; flagged_before_recovery: number
  pct_flagged: number; median_lead_minutes: number; p90_lead_minutes: number; supported_intervals: number
  supported_ended_by_new_trip: number; supported_ended_by_provider: number; supported_still_open_at_data_end: number
  supported_with_later_evidence: number
}
export interface JourneySummary {
  cards: number; journeys: number; avg_boardings_per_journey: number; pct_with_transfer: number
  pct_observed_destination: number; pct_chained_destination: number; pct_mobicascais_with_other_operator: number
}
export interface Overview {
  b5: B5; journeys: JourneySummary
  bike: { trips: number; valid_trips: number; stations: number; outside_intervals: number; supported_120: number
    pct_ends_in_station_area: number; pct_ends_in_parking_zone: number }
  candidates: { screened: number; scored: number }
}
export interface RecoveryCell {
  cell_id: string; trip_ends: number; outside_intervals: number; supported_120: number; supported_with_evidence: number
  outside_per_100_trip_ends: number | null; median_hours_parked: number | null; provider_recoveries: number
  median_hours_to_provider_recovery: number | null; insufficient: boolean
}
export interface Recovery { cells: FC<RecoveryCell>; b5: B5; by_end_reason: { end_reason: string; n: number; avg_minutes: number; over_120: number }[]; meta: Meta }
export interface Candidate {
  cell_id: string; rank: number | null; score: number | null; trip_endpoints: number; trip_starts: number; trip_ends: number
  outside_intervals: number; supported_120: number; departures_per_hour_333m: number; nearest_station_m: number
  operators_333m: string | null; demand_n: number; parking_n: number; transport_gap_n: number; bus_delay_n: number
  score_without_demand: number | null; score_without_parking: number | null; score_without_transport_gap: number | null
  score_without_bus_delay: number | null; weight_available: number; insufficient: boolean; lat: number; lon: number
}
export interface Candidates { cells: FC<Candidate>; weights: { component: string; weight: number; status: string; input: string }[]; meta: Meta }
export interface StationP { station_id: string; name: string; departures: number; arrivals: number; net_flow: number; weekday_departures_per_day: number }
export interface HourRow { is_weekend: boolean; hour_local: number; departures: number; arrivals: number; net_flow: number; n_days: number }
export interface StopP { agency_id: string; agency_name: string; stop_id: string; stop_name: string; weekday_departures: number; departures_per_hour: number; weekly_boardings: number; max_routes_in_an_hour?: number }
export interface DelayRow { route: string; time_window: string; services: number; observed: number; median_delay_min: number; p90_delay_min: number; median_early_min: number; n_days: number }
export interface Transit { stops: FC<StopP>; bus_delay: DelayRow[];
  transfer_proxy: { summary: { kind: string; bike_endpoints: number; with_transit_proxy: number; pct: number }[]; placebo: { pct: number } }; boardings_by_hour: { is_weekend: boolean; hour_local: number; validations: number }[]; meta: Meta }
export interface FlowP { origin_zone: string; dest_zone: string; origin_municipality: string; dest_municipality: string; journeys: number; cards: number; am_peak: number; pm_peak: number; with_transfer: number; observed_destinations: number }
export interface Journeys {
  flows: FC<FlowP>; municipalities: { origin_municipality: string; dest_municipality: string; journeys: number; cards: number }[]
  transfers: { from_operator: string; from_line: string; to_operator: string; to_line: string; transfers: number; cards: number; median_gap_min: number }[]
  summary: JourneySummary; meta: Meta
}
export interface Weather { by_class: { factor: string; level: string; hours: number; avg_starts_per_hour: number }[]; meta: Meta }
export interface Inventory {
  steps: { target: string; step: string; rows_read: number | null; rows_kept: number | null; filter: string; finished_at: string }[]
  coverage: { agency_id: string; agency_name: string | null; validations: number; geolocated: number; pct_geolocated: number; in_cascais: number }[]
}
export type LayaComponent = 'demand' | 'abandonment' | 'consistency' | 'coverage_gain' | 'footfall' | 'transit_gap'
export interface LayaRec {
  geometry: GeoJSON.Polygon; cell_id: string; laya_rank: number; laya_score: number; confidence: number
  confidence_label: 'high' | 'medium' | 'low'; robustness: number; verdict: string
  screening_rank: number | null; screening_score: number | null
  trip_endpoints: number; trip_starts: number; trip_ends: number; outside_intervals: number; supported_120: number
  departures_per_hour_333m: number; nearest_station_m: number; nearest_station: string | null; operators_333m: string | null
  active_days: number; weekend_share: number | null; hourly: number[]; median_hours_parked: number | null
  provider_recoveries: number; reused_by_rider: number; weekly_boardings_333m: number; journeys_750m: number
  stops_333m: string | null; lat: number; lon: number
  components: Record<LayaComponent, number>; contributions: Record<LayaComponent, number>; reasons: string[]; caveats: string[]
}
export interface Laya {
  model: { name: string; version: string; openness: string; confidence: string; robustness: string; eligibility: string
    not_modelled: string[]; components: { key: LayaComponent; weight: number; input: string; label: string; method: string }[] }
  size_m?: number; pool_size: number; recommendations: LayaRec[]
  /** Every eligible cell scored against the same top N; only with `?pool=true`. */
  pool?: LayaRec[]
  summary: { strong: number; pilot: number; also_top_in_screening: number; trip_endpoints: number; supported_120: number }
  abandonment_clock: string; meta: Meta
}
