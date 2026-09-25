/** The abandonment clock, mirrored from backend/app/core/enforcement.py for display. The operational
 *  decision is always the backend's; `/api/rules` says whether the 08:00–20:00 window is on. */
import { useEffect, useState } from 'react'

export type Rules = { abandon_minutes: number; buffer_m: number; enforce_window: boolean | null; enforce_from_hour: number; enforce_until_hour: number; enforce_tz: string }
export const DEFAULT_RULES: Rules = { abandon_minutes: 120, buffer_m: 30, enforce_window: true, enforce_from_hour: 8, enforce_until_hour: 20, enforce_tz: 'Europe/Lisbon' }

let cached: Promise<Rules> | null = null
/** Active operations rule (live detection, cases). */
export function useRules(): Rules {
  const [rules, setRules] = useState(DEFAULT_RULES)
  useEffect(() => {
    cached ??= fetch('/api/rules').then(r => r.ok ? r.json() : DEFAULT_RULES).catch(() => DEFAULT_RULES)
    cached.then(setRules)
  }, [])
  return rules
}

/** Rule the analysis tables were built with (`make enforce-window-on|off` rebuilds them). */
export function useAnalysisRules(): Rules {
  const [rules, setRules] = useState(DEFAULT_RULES)
  useEffect(() => {
    fetch('/analytics/enforcement').then(r => r.json())
      .then(v => setRules({ ...DEFAULT_RULES, enforce_window: v.enabled, enforce_from_hour: v.from_hour ?? 8, enforce_until_hour: v.until_hour ?? 20, enforce_tz: v.tz ?? 'Europe/Lisbon' }))
      .catch(() => {})
  }, [])
  return rules
}

export const windowLabel = (r: Rules) => r.enforce_window === false ? '24 h'
  : `${String(r.enforce_from_hour).padStart(2, '0')}:00–${String(r.enforce_until_hour).padStart(2, '0')}:00`

/** UTC instant of a local wall-clock hour on a local date, for the rule's time zone. */
function localHour(y: number, m: number, d: number, hour: number, tz: string) {
  const guess = Date.UTC(y, m, d, hour)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const offset = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - guess
  return guess - offset
}

function localDate(ms: number, tz: string): [number, number, number] {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(ms))
  const get = (t: string) => Number(p.find(x => x.type === t)!.value)
  return [get('year'), get('month') - 1, get('day')]
}

/** Minutes of [startMs, endMs) that count toward the threshold under `rules`. */
export function countedMinutes(startMs: number, endMs: number, rules: Rules = DEFAULT_RULES) {
  if (endMs <= startMs) return 0
  if (rules.enforce_window === false) return (endMs - startMs) / 60000
  let total = 0
  const [y, m, d] = localDate(startMs, rules.enforce_tz)
  for (let day = Date.UTC(y, m, d); ; day += 86400000) {
    const date = new Date(day)
    const w0 = localHour(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), rules.enforce_from_hour, rules.enforce_tz)
    const w1 = localHour(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), rules.enforce_until_hour, rules.enforce_tz)
    if (w0 >= endMs) break
    total += Math.max(0, Math.min(endMs, w1) - Math.max(startMs, w0)) / 60000
  }
  return total
}
