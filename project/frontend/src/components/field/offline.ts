/** T-D5 offline store for the field app (ops req §7, ER-8).
 *
 * Two jobs, deliberately separate:
 *  - the last route and its cases stay in localStorage, so losing connectivity never blanks
 *    the screen the operator is driving from;
 *  - recorded outcomes go into IndexedDB (they carry a photo Blob) keyed by `client_uuid`,
 *    so a resend after reconnecting is the same record, not a second pickup.
 *
 * Every read is wrapped: a browser with storage blocked degrades to in-memory, it does not
 * crash the app mid-shift.
 */
import type { Case, Mission, Outcome } from '../../types'

const DB_NAME = 'hackcity-field'
const STORE = 'outcomes'
const DB_VERSION = 1

export interface QueuedOutcome {
  client_uuid: string
  stop_id: number
  outcome: Outcome
  actor: string
  lat: number
  lng: number
  device_id?: string
  notes?: string
  photo?: Blob
  photo_name?: string
  queued_at: string
  /** Set when the server refused the record. Automatic retries skip it; "sync now" retries it,
   *  so a bad record stays visible to the operator instead of being resent every few seconds. */
  rejected?: string
}

// ---------------------------------------------------------------- route cache

const missionKey = (operator: string) => `field:mission:${operator}`
const casesKey = (operator: string) => `field:cases:${operator}`

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota — the in-memory copy still works for this session */
  }
}

export const cacheMission = (operator: string, mission: Mission | null) =>
  writeJson(missionKey(operator), mission)
export const cachedMission = (operator: string) => readJson<Mission>(missionKey(operator))
export const cacheCases = (operator: string, cases: Case[]) => writeJson(casesKey(operator), cases)
export const cachedCases = (operator: string) => readJson<Case[]>(casesKey(operator)) ?? []

// ------------------------------------------------------------- outcome queue

/** Used when IndexedDB is unavailable; the queue then lives only for this page load. */
const memoryQueue = new Map<string, QueuedOutcome>()
let idbBroken = false

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'client_uuid' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = run(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function queueOutcome(record: QueuedOutcome): Promise<void> {
  if (!idbBroken && typeof indexedDB !== 'undefined') {
    try {
      await withStore('readwrite', (s) => s.put(record))
      notify()
      return
    } catch {
      idbBroken = true
    }
  }
  memoryQueue.set(record.client_uuid, record)
  notify()
}

export async function queuedOutcomes(): Promise<QueuedOutcome[]> {
  if (!idbBroken && typeof indexedDB !== 'undefined') {
    try {
      const all = await withStore<QueuedOutcome[]>('readonly', (s) => s.getAll())
      return all.sort((a, b) => a.queued_at.localeCompare(b.queued_at))
    } catch {
      idbBroken = true
    }
  }
  return [...memoryQueue.values()].sort((a, b) => a.queued_at.localeCompare(b.queued_at))
}

export async function dequeueOutcome(clientUuid: string): Promise<void> {
  memoryQueue.delete(clientUuid)
  if (!idbBroken && typeof indexedDB !== 'undefined') {
    try {
      await withStore('readwrite', (s) => s.delete(clientUuid))
    } catch {
      idbBroken = true
    }
  }
  notify()
}

export async function queuedCount(): Promise<number> {
  return (await queuedOutcomes()).length
}

// --------------------------------------------------------------- subscribers

const listeners = new Set<() => void>()

/** The pending-sync badge re-reads the queue whenever it changes. */
export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  listeners.forEach((fn) => fn())
}
