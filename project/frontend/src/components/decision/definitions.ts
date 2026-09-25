/** Shared periods, rules and colour ramps for /data. Periods are Europe/Lisbon local dates. */
import { BLUE } from '../insights/viz'

/** Bike trips/events: 19 Aug–8 Sep 2026 local (21 days). 19 trips just after midnight on 9 Sep are included in totals. */
export const BIKE_PERIOD = { start: '2026-08-19', end: '2026-09-08', lastData: '2026-09-09', days: 21 }
/** Card validations: 31 Aug–6 Sep 2026 local (7 days); 126 validations after midnight on 7 Sep are included in totals. */
export const CARD_PERIOD = { start: '2026-08-31', end: '2026-09-06', days: 7 }

export const RULES = { bufferM: 30, eligibleMin: 120, minCards: 5, minIntervals: 5, candidateClearanceM: 150, gapRadiusM: 333, benchmarkDays: 7 }

/** Single-hue sequential ramps, light -> dark: blue = bike activity, orange = card boardings, magenta =
 *  candidate score. Magenta replaced violet, which read too close to the blue squares underneath; blue,
 *  orange and magenta (#c2185b) pass the dataviz validator all-pairs (worst CVD ΔE 16.6, normal 18.1). */
export const RAMP = {
  blue: BLUE,
  orange: ['#fde3d5', '#f9c4a6', '#f4a177', '#eb6834', '#c9521f', '#9c3e15', '#6e2a0c'],
  magenta: ['#f7c9dc', '#f09bbd', '#e4699a', '#d23f7b', '#c2185b', '#961347', '#6b0d33'],
}

export function rampColor(ramp: string[], v: number | null | undefined, max: number) {
  if (v == null || max <= 0) return '#f0efec'
  const i = Math.floor((Math.min(v, max) / max) * (ramp.length - 1) + 0.0001)
  return ramp[Math.max(0, Math.min(ramp.length - 1, i))]
}

/** 95th percentile: one outlier square must not wash out the rest of the ramp. */
export function p95(values: number[]) {
  const sorted = values.filter(v => v > 0).sort((a, b) => a - b)
  if (!sorted.length) return 1
  return Math.max(1, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))])
}

export const inRange = (day: string, period: { start: string; end: string }) => !day || (day >= period.start && day <= period.end)
