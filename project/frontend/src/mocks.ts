// Used when VITE_USE_MOCKS=true so UI work never waits on the backend.
import type { Case, Mission } from './types'

export const mockCases: Case[] = [
  { id: 1, device_id: 'bike-001', status: 'eligible', source: 'detector', lat: 38.6975, lng: -9.4230, rest_since: '2026-09-01T08:00:00Z', distance_outside_m: 85, reason: '85 m outside for 190 min; fresh observation', needs_approval: false, blocked_reason: null, updated_at: '2026-09-01T11:10:00Z' },
  { id: 2, device_id: 'bike-002', status: 'uncertain', source: 'detector', lat: 38.7010, lng: -9.4150, rest_since: '2026-09-01T09:30:00Z', distance_outside_m: 12, reason: 'provider state non_contactable', needs_approval: false, blocked_reason: null, updated_at: '2026-09-01T11:00:00Z' },
  { id: 3, device_id: 'bike-003', status: 'assigned', source: 'detector', lat: 38.7050, lng: -9.4000, rest_since: '2026-09-01T07:00:00Z', distance_outside_m: 240, reason: '240 m outside for 250 min; fresh observation', needs_approval: false, blocked_reason: null, updated_at: '2026-09-01T11:05:00Z' },
]

export const mockMission: Mission = {
  id: 1, operator_id: 'op1', status: 'active', version: 3, total_km: 4.2, capacity: 6,
  last_change: 'bike-004 started a trip — removed; next: bike-003',
  stops: [
    { id: 10, case_id: 3, seq: 1, kind: 'pickup', status: 'planned', lat: 38.7050, lng: -9.4000, outcome: null, photo_path: null },
    { id: 11, case_id: 1, seq: 2, kind: 'pickup', status: 'planned', lat: 38.6975, lng: -9.4230, outcome: null, photo_path: null },
    { id: 12, case_id: null, seq: 3, kind: 'depot', status: 'planned', lat: 38.736686, lng: -9.386868, outcome: null, photo_path: null },
  ],
}
