import { useDT } from '../../i18n-data'
import type { Cell, GridMetric } from './types'

export function useFormat() {
  const dt = useDT()
  const n = (value: number | null | undefined, digits = 0) =>
    value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toLocaleString(dt.locale, { maximumFractionDigits: digits })
  /** Sample totals below five are shown as "<5"; averages divide by the observed days of the source. */
  const count = (value: number, average: boolean, days: number) => value > 0 && value < 5 ? '<5' : n(average ? value / days : value, average ? 1 : 0)
  const time = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString(dt.locale, { timeZone: 'Europe/Lisbon' }) : '—'
  const dateTime = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString(dt.locale, { timeZone: 'Europe/Lisbon' }) : '—'
  return { dt, n, count, time, dateTime }
}

export const metricValue = (p: Cell, metric: GridMetric) => (p[metric] as number | null) ?? 0
export const ageMinutes = (value: string | null) => value ? (Date.now() - new Date(value).getTime()) / 60000 : 0
export const routeLabel = (value: string) => /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 44 ? `M${value.padStart(2, '0')}` : value
