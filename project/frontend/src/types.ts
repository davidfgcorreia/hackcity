// Mirror of backend/app/schemas.py — change both together.
export type CaseStatus =
  | 'candidate' | 'uncertain' | 'supported' | 'eligible' | 'assigned' | 'picked_up' | 'resolved'

export const CASE_STATUSES: CaseStatus[] =
  ['candidate', 'uncertain', 'supported', 'eligible', 'assigned', 'picked_up', 'resolved']

export type Outcome =
  | 'picked_up' | 'not_found' | 'in_use' | 'provider_recovered' | 'unsafe' | 'inaccessible' | 'unable_to_load'

export const OUTCOMES: Outcome[] =
  ['picked_up', 'not_found', 'in_use', 'provider_recovered', 'unsafe', 'inaccessible', 'unable_to_load']

export interface Station { id: string; name: string; lat: number; lng: number; area: { coordinates: number[][][][] } }

export interface Case {
  id: number; device_id: string; status: CaseStatus; source: string
  lat: number; lng: number; rest_since: string | null; distance_outside_m: number | null
  reason: string; needs_approval: boolean; blocked_reason: string | null; updated_at: string
}

export interface CaseEvent { id: number; kind: string; detail: Record<string, unknown>; actor: string; event_time: string | null; recorded_at: string }
export interface CaseDetail extends Case { timeline: CaseEvent[] }

export interface Stop { id: number; case_id: number | null; seq: number; kind: 'pickup' | 'verify' | 'depot'; status: string; lat: number; lng: number; outcome: Outcome | null; photo_path: string | null }

export interface Mission { id: number; operator_id: string; status: string; version: number; last_change: string | null; total_km: number | null; capacity: number; stops: Stop[] }

export interface LiveState { running: boolean; last_poll: string | null; last_error: string | null; vehicles_in_feed: number; tracked: number; form_factors: string; last_changes: string[] }

/** POST /cases/field — operator-found bicycle; collection waits for approval. */
export interface FieldCaseIn { device_id: string; lat: number; lng: number; notes?: string; actor: string }

/** PATCH /cases/{id} — a `null` explicitly clears the field (used to unblock). */
export interface CaseCorrectionIn {
  actor: string; reason: string
  lat?: number; lng?: number; status?: CaseStatus; blocked_reason?: string | null
}

/** GET/POST /replay* — demo mode clock. `last_changes` is newest first. */
export interface ReplayState { running: boolean; sim_time: string | null; speed: number; last_changes: string[] }

/** GET /cases/kpis — ops KPI strip (T-E6). */
export interface Kpis {
  by_status: Record<CaseStatus, number>
  open_cases: number
  visits_completed: number
  not_found_visits: number
  not_found_rate: number | null          // not_found_visits / visits_completed
  picked_up_total: number
  median_eligible_to_pickup_min: number | null
}
