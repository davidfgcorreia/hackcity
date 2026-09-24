// Used when VITE_USE_MOCKS=true so UI work never waits on the backend.
// Mutating helpers keep the mock stack behaving like the real one: recording an outcome
// removes the stop and bumps the mission version, reporting a bike creates a case.
import type { Case, CaseDetail, CaseEvent, FieldCaseIn, Kpis, Mission, Outcome, ReplayState } from './types'

export const mockCases: Case[] = [
  { id: 1, device_id: 'bike-001', status: 'eligible', source: 'detector', lat: 38.6975, lng: -9.4230, rest_since: '2026-09-01T08:00:00Z', distance_outside_m: 85, reason: '85 m outside for 190 min; fresh observation', needs_approval: false, blocked_reason: null, updated_at: '2026-09-01T11:10:00Z' },
  { id: 2, device_id: 'bike-002', status: 'uncertain', source: 'detector', lat: 38.7010, lng: -9.4150, rest_since: '2026-09-01T09:30:00Z', distance_outside_m: 12, reason: 'provider state non_contactable', needs_approval: false, blocked_reason: null, updated_at: '2026-09-01T11:00:00Z' },
  { id: 3, device_id: 'bike-003', status: 'assigned', source: 'detector', lat: 38.7050, lng: -9.4000, rest_since: '2026-09-01T07:00:00Z', distance_outside_m: 240, reason: '240 m outside for 250 min; fresh observation', needs_approval: false, blocked_reason: null, updated_at: '2026-09-01T11:05:00Z' },
  { id: 4, device_id: 'bike-004', status: 'candidate', source: 'detector', lat: 38.6990, lng: -9.4310, rest_since: '2026-09-01T10:20:00Z', distance_outside_m: 60, reason: 'trip end outside, 50 min — no fresh observation yet', needs_approval: false, blocked_reason: null, updated_at: '2026-09-01T11:10:00Z' },
  { id: 5, device_id: 'bike-005', status: 'uncertain', source: 'field', lat: 38.7095, lng: -9.4085, rest_since: null, distance_outside_m: null, reason: 'reported in field; awaiting approval', needs_approval: true, blocked_reason: null, updated_at: '2026-09-01T11:08:00Z' },
  { id: 6, device_id: 'bike-006', status: 'eligible', source: 'detector', lat: 38.6940, lng: -9.4190, rest_since: '2026-09-01T06:10:00Z', distance_outside_m: 310, reason: '310 m outside for 300 min; fresh observation', needs_approval: false, blocked_reason: 'unsafe: on the roundabout verge, no safe stopping place', updated_at: '2026-09-01T10:40:00Z' },
  { id: 7, device_id: 'bike-007', status: 'picked_up', source: 'detector', lat: 38.7120, lng: -9.4260, rest_since: '2026-09-01T05:00:00Z', distance_outside_m: 150, reason: '150 m outside for 280 min; fresh observation', needs_approval: false, blocked_reason: null, updated_at: '2026-09-01T10:15:00Z' },
]

export const mockMission: Mission = {
  id: 1, operator_id: 'op1', status: 'active', version: 3, total_km: 4.2, capacity: 6,
  last_change: 'bike-004 started a trip — removed; next: bike-003',
  stops: [
    { id: 10, case_id: 3, seq: 1, kind: 'pickup', status: 'planned', lat: 38.7050, lng: -9.4000, outcome: null },
    { id: 11, case_id: 1, seq: 2, kind: 'pickup', status: 'planned', lat: 38.6975, lng: -9.4230, outcome: null },
    { id: 12, case_id: null, seq: 3, kind: 'depot', status: 'planned', lat: 38.7223, lng: -9.4205, outcome: null },
  ],
}

let mission: Mission = structuredClone(mockMission)
let cases: Case[] = structuredClone(mockCases)
let nextCaseId = 8
let replay: ReplayState = { running: false, sim_time: '2026-09-01T11:10:00Z', speed: 360 }

export const mockMissionNow = (): Mission => structuredClone(mission)
export const mockCasesNow = (): Case[] => structuredClone(cases)

export function mockCaseDetail(id: number): CaseDetail {
  const base = cases.find((c) => c.id === id) ?? cases[0]
  const at = (minutes: number) =>
    new Date(Date.parse(base.rest_since ?? base.updated_at) + minutes * 60_000).toISOString()
  const timeline: CaseEvent[] = [
    { id: 1, kind: 'trip_end', detail: { lat: base.lat, lng: base.lng, source: 'provider feed' }, actor: 'system', event_time: at(0), recorded_at: at(2) },
    { id: 2, kind: 'candidate', detail: { to: 'candidate', distance_outside_m: base.distance_outside_m }, actor: 'system', event_time: at(0), recorded_at: at(2) },
    { id: 3, kind: 'observation', detail: { same_position: true, age_min: 35 }, actor: 'system', event_time: at(150), recorded_at: at(151) },
  ]
  if (base.status !== 'candidate') {
    timeline.push({ id: 4, kind: 'status_change', detail: { from: 'candidate', to: 'supported', minutes_at_rest: 150 }, actor: 'system', event_time: at(150), recorded_at: at(151) })
  }
  if (['eligible', 'assigned', 'picked_up', 'resolved'].includes(base.status)) {
    timeline.push({ id: 5, kind: 'status_change', detail: { from: 'supported', to: 'eligible' }, actor: 'system', event_time: at(155), recorded_at: at(155) })
  }
  if (base.status === 'picked_up') {
    timeline.push({ id: 6, kind: 'field_outcome', detail: { outcome: 'picked_up', device_id: base.device_id, photo: 'uploads/mock.jpg' }, actor: 'op1', event_time: at(200), recorded_at: at(201) })
  }
  if (base.blocked_reason) {
    timeline.push({ id: 7, kind: 'field_outcome', detail: { outcome: 'unsafe', notes: base.blocked_reason }, actor: 'op2', event_time: at(180), recorded_at: at(181) })
  }
  return { ...base, timeline }
}

export function mockRecordOutcome(stopId: number, outcome: Outcome): Mission {
  const stop = mission.stops.find((s) => s.id === stopId)
  if (stop) {
    stop.status = 'done'
    stop.outcome = outcome
    const target = cases.find((c) => c.id === stop.case_id)
    if (target) {
      target.status = outcome === 'picked_up' ? 'picked_up' : 'resolved'
      if (['unsafe', 'inaccessible', 'unable_to_load'].includes(outcome)) {
        target.status = 'eligible'
        target.blocked_reason = `${outcome}: reported in the field`
      }
    }
  }
  mission = { ...mission, version: mission.version + 1, last_change: `stop ${stopId} ${outcome} — recalculated` }
  return structuredClone(mission)
}

export function mockReplan(operatorId: string): Mission {
  mission = { ...mission, operator_id: operatorId, version: mission.version + 1, last_change: 'route recalculated from your position' }
  return structuredClone(mission)
}

export function mockReportFieldCase(body: FieldCaseIn): Case {
  const created: Case = {
    id: nextCaseId++, device_id: body.device_id, status: 'uncertain', source: 'field',
    lat: body.lat, lng: body.lng, rest_since: null, distance_outside_m: null,
    reason: 'reported in field; awaiting approval', needs_approval: true, blocked_reason: null,
    updated_at: new Date().toISOString(),
  }
  cases = [created, ...cases]
  return created
}

export function mockPatchCase(id: number, patch: Partial<Case>): Case {
  cases = cases.map((c) => (c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c))
  return cases.find((c) => c.id === id)!
}

export function mockKpis(): Kpis {
  const by_status = { candidate: 0, uncertain: 0, supported: 0, eligible: 0, assigned: 0, picked_up: 0, resolved: 0 }
  cases.forEach((c) => { by_status[c.status] += 1 })
  return {
    by_status,
    open_cases: cases.filter((c) => c.status !== 'picked_up' && c.status !== 'resolved').length,
    visits_completed: 5,
    not_found_visits: 1,
    not_found_rate: 0.2,
    picked_up_total: by_status.picked_up,
    median_eligible_to_pickup_min: 47.5,
  }
}

export function mockReplayState(change?: Partial<ReplayState> & { stepMinutes?: number }): ReplayState {
  if (change) {
    const { stepMinutes, ...rest } = change
    replay = { ...replay, ...rest }
    if (stepMinutes && replay.sim_time) {
      replay = { ...replay, sim_time: new Date(Date.parse(replay.sim_time) + stepMinutes * 60_000).toISOString() }
    }
  }
  return { ...replay }
}
