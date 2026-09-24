import { mockCases, mockMission } from './mocks'
import type { Case, CaseDetail, Mission, Outcome, Station } from './types'

const MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`)
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json()
}

export const api = {
  stations: () => get<Station[]>('/stations'),
  cases: (status?: string) => (MOCKS ? Promise.resolve(mockCases) : get<Case[]>(`/cases${status ? `?status=${status}` : ''}`)),
  caseDetail: (id: number) => get<CaseDetail>(`/cases/${id}`),
  mission: (operator: string) => (MOCKS ? Promise.resolve(mockMission) : get<Mission | null>(`/missions/current?operator_id=${operator}`)),
  // TODO(T-D5): queue in IndexedDB when offline, replay with the same client_uuid
  recordOutcome: async (stopId: number, data: { outcome: Outcome; actor: string; lat: number; lng: number; device_id?: string; notes?: string; photo?: File }) => {
    const form = new FormData()
    Object.entries({ ...data, client_uuid: crypto.randomUUID() }).forEach(([k, v]) => v !== undefined && form.append(k, v as string | Blob))
    const r = await fetch(`/api/stops/${stopId}/outcome`, { method: 'POST', body: form })
    if (!r.ok) throw new Error(await r.text())
    return (await r.json()) as Mission
  },
}
