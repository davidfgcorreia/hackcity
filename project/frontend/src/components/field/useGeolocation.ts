/** T-D1: the operator's live position. It is the start point every replan uses (ops req §6),
 *  and the "actual position" recorded with a pickup (§7).
 *
 *  The last fix is kept in localStorage so a reload inside a van with no signal still has a
 *  usable start point instead of falling back to the depot.
 */
import { useEffect, useState } from 'react'

export interface FieldPosition {
  lat: number
  lng: number
  accuracy: number | null
  /** Degrees clockwise from north while moving; null when stationary or unknown. */
  heading?: number | null
  /** m/s */
  speed?: number | null
  at: string
}

const KEY = 'field:position'
export const FRESH_FIX_MS = 15_000

export function freshFix(position: FieldPosition | null, live: boolean): boolean {
  return Boolean(live && position && Number.isFinite(Date.parse(position.at)) &&
    Date.now() - Date.parse(position.at) >= 0 && Date.now() - Date.parse(position.at) < FRESH_FIX_MS)
}

function lastKnown(): FieldPosition | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as FieldPosition) : null
  } catch {
    return null
  }
}

export function useGeolocation() {
  const [position, setPosition] = useState<FieldPosition | null>(lastKnown)
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('unavailable')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next: FieldPosition = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
          heading: p.coords.heading != null && Number.isFinite(p.coords.heading) ? p.coords.heading : null,
          speed: p.coords.speed != null && Number.isFinite(p.coords.speed) ? p.coords.speed : null,
          at: new Date(p.timestamp).toISOString(),
        }
        setPosition(next)
        setLive(true)
        setError(null)
        try {
          localStorage.setItem(KEY, JSON.stringify(next))
        } catch { /* storage blocked — the in-memory position is enough */ }
      },
      (e) => {
        setLive(false)
        setError(e.message || 'denied')
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  return { position, live, error }
}
