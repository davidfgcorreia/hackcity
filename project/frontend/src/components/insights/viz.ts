/** Colour and scale helpers for /insights.
 *
 *  Values come from the validated reference palette (see the dataviz skill): a single-hue blue
 *  ramp for magnitude, categorical slots 1-2 for the two flow series, the blue<->red diverging
 *  pair with a grey midpoint for net flow, and the fixed status palette for data quality.
 *  Status colour never carries meaning alone — every use is paired with a label.
 */

/** Sequential blue, 100 -> 700. Lightest step means "near zero" and may recede to the surface. */
export const SEQUENTIAL = [
  '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec',
  '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab',
]

/** Two series, same unit, one axis. Slots 1 and 2 clear the adjacent-pair gates. */
export const SERIES = { departures: '#2a78d6', arrivals: '#eb6834' }

/** Diverging: warm/cool poles, neutral grey midpoint — never a hue at the middle. */
export const DIVERGING = { negative: '#d03b3b', midpoint: '#f0efec', positive: '#2a78d6' }

export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' }

export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  surface: '#fcfcfb',
  border: 'rgba(11,11,11,0.10)',
}

/** Colour a cell has when its measure could not be computed. Never a ramp step: an unmeasured
 *  cell must not read as a low value (requirements doc: missing is never zero). */
export const NO_DATA = '#e8e7e2'

/**
 * Quantile breaks, so a few extreme cells cannot flatten the rest of the map.
 * Returns the upper bound of each class; `at()` maps a value onto a ramp step.
 */
export function quantileScale(values: number[], steps = SEQUENTIAL.length) {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return { breaks: [] as number[], at: () => NO_DATA }
  const breaks = Array.from({ length: steps }, (_, i) =>
    sorted[Math.min(sorted.length - 1, Math.floor(((i + 1) / steps) * (sorted.length - 1)))])
  return {
    breaks,
    at(value: number | null) {
      if (value === null || !Number.isFinite(value)) return NO_DATA
      const index = breaks.findIndex((b) => value <= b)
      return SEQUENTIAL[index === -1 ? SEQUENTIAL.length - 1 : index]
    },
  }
}

export const fmtNumber = (v: number | null, digits = 1, dash = '—') =>
  v === null || !Number.isFinite(v) ? dash : v.toFixed(digits).replace(/\.0$/, '')

/** CSV for the ranked table. Excel opens UTF-8 correctly only with a BOM. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
