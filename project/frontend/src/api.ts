import { dequeueOutcome, queueOutcome, queuedOutcomes, type QueuedOutcome } from './components/field/offline'
import {
  mockCaseDetail, mockCasesNow, mockKpis, mockMissionNow, mockPatchCase, mockRecordOutcome,
  mockReplan, mockReplayState, mockReportFieldCase,
} from './mocks'
import type {
  Case, CaseCorrectionIn, CaseDetail, FieldCaseIn, Kpis, Mission, Outcome, ReplayState, Station,
} from './types'

const MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

/** The server answered and refused. A thrown `TypeError` instead means the request never
 *  arrived — that is the offline case, and the only one the field app queues. */
export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`${status} ${body}`)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, init)
  if (!r.ok) throw new ApiError(r.status, await r.text().catch(() => ''))
  return (await r.json()) as T
}

const get = <T,>(path: string) => request<T>(path)
const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })

export type OutcomeInput = {
  outcome: Outcome; actor: string; lat: number; lng: number
  device_id?: string; notes?: string; photo?: File
}
/** `queued` means the record is safe on the device and will be resent (ER-8). */
export type SubmitResult = { queued: false; mission: Mission } | { queued: true }

function outcomeForm(r: QueuedOutcome): FormData {
  const form = new FormData()
  form.append('outcome', r.outcome)
  form.append('actor', r.actor)
  form.append('lat', String(r.lat))
  form.append('lng', String(r.lng))
  form.append('client_uuid', r.client_uuid)
  if (r.device_id) form.append('device_id', r.device_id)
  if (r.notes) form.append('notes', r.notes)
  if (r.photo) form.append('photo', r.photo, r.photo_name ?? 'photo.jpg')
  return form
}

const postOutcome = (r: QueuedOutcome) =>
  request<Mission>(`/stops/${r.stop_id}/outcome`, { method: 'POST', body: outcomeForm(r) })

export const api = {
  stations: () => get<Station[]>('/stations'),
  cases: (status?: string) =>
    MOCKS ? Promise.resolve(mockCasesNow()) : get<Case[]>(`/cases${status ? `?status=${status}` : ''}`),
  caseDetail: (id: number) => (MOCKS ? Promise.resolve(mockCaseDetail(id)) : get<CaseDetail>(`/cases/${id}`)),
  kpis: () => (MOCKS ? Promise.resolve(mockKpis()) : get<Kpis>('/cases/kpis')),

  reportFieldCase: (body: FieldCaseIn) =>
    MOCKS ? Promise.resolve(mockReportFieldCase(body)) : post<Case>('/cases/field', body),

  approveCase: (id: number, actor: string) =>
    MOCKS
      ? Promise.resolve(mockPatchCase(id, { needs_approval: false, status: 'eligible' }))
      : post<Case>(`/cases/${id}/approve?actor=${encodeURIComponent(actor)}`),

  correctCase: (id: number, body: CaseCorrectionIn) =>
    MOCKS
      ? Promise.resolve(mockPatchCase(id, { lat: body.lat, lng: body.lng, status: body.status, blocked_reason: body.blocked_reason }))
      : request<Case>(`/cases/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),

  /** T-E4: the evidence record behind the download button. */
  exportCase: (id: number, actor?: string) =>
    MOCKS
      ? Promise.resolve({ export_version: 1, case: mockCaseDetail(id) } as unknown)
      : get<unknown>(`/cases/${id}/export${actor ? `?actor=${encodeURIComponent(actor)}` : ''}`),

  mission: (operator: string) =>
    MOCKS ? Promise.resolve(mockMissionNow()) : get<Mission | null>(`/missions/current?operator_id=${operator}`),

  /** T-C1/T-C2: the mission starts from where the operator actually is. */
  replan: (operator_id: string, lat: number, lng: number) =>
    MOCKS ? Promise.resolve(mockReplan(operator_id)) : post<Mission>('/missions/replan', { operator_id, lat, lng }),

  recordOutcome: async (stopId: number, data: OutcomeInput): Promise<SubmitResult> => {
    if (MOCKS) return { queued: false, mission: mockRecordOutcome(stopId, data.outcome) }
    const record: QueuedOutcome = {
      client_uuid: crypto.randomUUID(),
      stop_id: stopId,
      queued_at: new Date().toISOString(),
      outcome: data.outcome,
      actor: data.actor,
      lat: data.lat,
      lng: data.lng,
      device_id: data.device_id,
      notes: data.notes,
      photo: data.photo,
      photo_name: data.photo?.name,
    }
    try {
      return { queued: false, mission: await postOutcome(record) }
    } catch (err) {
      if (err instanceof ApiError) throw err // a refusal (missing ID/photo) must be fixed now
      await queueOutcome(record) // never reached the server — keep the evidence
      return { queued: true }
    }
  },

  /** Resend queued outcomes with their original `client_uuid`, so retries stay idempotent.
   *  `force` also retries records the server has already refused. */
  flushQueue: async (force = false): Promise<{ sent: number; pending: number }> => {
    if (MOCKS) return { sent: 0, pending: 0 }
    let sent = 0
    for (const record of await queuedOutcomes()) {
      if (record.rejected && !force) continue
      try {
        await postOutcome(record)
        await dequeueOutcome(record.client_uuid)
        sent += 1
      } catch (err) {
        if (!(err instanceof ApiError)) break // still offline; try the rest later
        // Refused: keep the evidence, and stop resending it on every poll.
        await queueOutcome({ ...record, rejected: err.body || err.message })
      }
    }
    return { sent, pending: (await queuedOutcomes()).length }
  },

  replay: {
    state: () => (MOCKS ? Promise.resolve(mockReplayState()) : get<ReplayState>('/replay')),
    start: (fromTime?: string, speed?: number) => {
      if (MOCKS) return Promise.resolve(mockReplayState({ running: true, ...(fromTime ? { sim_time: fromTime } : {}), ...(speed ? { speed } : {}) }))
      const q = new URLSearchParams()
      if (fromTime) q.set('from_time', fromTime)
      if (speed) q.set('speed', String(speed))
      const query = q.toString()
      return post<ReplayState>(`/replay/start${query ? `?${query}` : ''}`)
    },
    pause: () => (MOCKS ? Promise.resolve(mockReplayState({ running: false })) : post<ReplayState>('/replay/pause')),
    step: (minutes: number) =>
      MOCKS ? Promise.resolve(mockReplayState({ stepMinutes: minutes })) : post<ReplayState>(`/replay/step?minutes=${minutes}`),
  },
}
