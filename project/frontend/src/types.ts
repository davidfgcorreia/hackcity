// Mirror of backend/app/schemas.py — change both together.
export type CaseStatus =
  | 'candidate' | 'uncertain' | 'supported' | 'eligible' | 'assigned' | 'picked_up' | 'resolved'

export type Outcome =
  | 'picked_up' | 'not_found' | 'in_use' | 'provider_recovered' | 'unsafe' | 'inaccessible' | 'unable_to_load'

export interface Station { id: string; name: string; lat: number; lng: number; area: { coordinates: number[][][][] } }

export interface Case {
  id: number; device_id: string; status: CaseStatus; source: string
  lat: number; lng: number; rest_since: string | null; distance_outside_m: number | null
  reason: string; needs_approval: boolean; blocked_reason: string | null; updated_at: string
}

export interface CaseEvent { id: number; kind: string; detail: Record<string, unknown>; actor: string; event_time: string | null; recorded_at: string }
export interface CaseDetail extends Case { timeline: CaseEvent[] }

export interface Stop { id: number; case_id: number | null; seq: number; kind: 'pickup' | 'verify' | 'depot'; status: string; lat: number; lng: number; outcome: Outcome | null }

export interface Mission { id: number; operator_id: string; status: string; version: number; last_change: string | null; total_km: number | null; capacity: number; stops: Stop[] }
