/** Small chart kit for /insights. Colors: reference data-viz palette (validated), by role. */
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Meta } from './data'

export const C = {
  surface: '#fcfcfb', text: '#0b0b0b', text2: '#52514e', muted: '#8a8984', grid: '#e7e6e2', line: '#e0e0e0',
  s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', neutral: '#f0efec',
}
/** Sequential blue, light -> dark (magnitude). */
export const BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
/** Diverging red <- gray -> blue (net departures <- balanced -> net arrivals). */
export const DIVERGING = ['#c0302f', '#e34948', '#f4a09f', '#f0efec', '#86b6ef', '#2a78d6', '#1c5cab']

export function seqColor(v: number | null | undefined, max: number) {
  if (v == null || max <= 0) return C.neutral
  const i = Math.min(BLUE.length - 1, Math.floor((v / max) * BLUE.length))
  return BLUE[Math.max(0, i)]
}
export function divColor(v: number, maxAbs: number) {
  if (maxAbs <= 0) return DIVERGING[3]
  const t = Math.max(-1, Math.min(1, v / maxAbs))
  return DIVERGING[Math.round((t + 1) * 3)]
}

let numberLocale = 'en-GB'
/** /data sets this from the PT/EN switch so every chart and table formats numbers the same way. */
export const setNumberLocale = (locale: string) => { numberLocale = locale }
export const fmtN = (n: number | null | undefined, d = 0) => {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  const digits = Number.isInteger(v) ? 0 : d
  return v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export const card: CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 16 }

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ ...card, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: C.text2 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 650, color: C.text, margin: '4px 0', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

const KIND_COLOR: Record<string, string> = { observed: '#188038', estimate: '#b06000', proxy: '#8430ce', screening: '#b06000' }
export function MetaNote({ meta }: { meta?: Meta }) {
  if (!meta) return null
  const kind = meta.kind ?? ''
  const tone = Object.entries(KIND_COLOR).find(([k]) => kind.includes(k))?.[1] ?? C.text2
  return (
    <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>
      {kind && <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 4, padding: '1px 6px', marginRight: 8, fontWeight: 600 }}>{kind}</span>}
      {meta.source ?? meta.sources?.join(' · ')}
      {meta.notes && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{meta.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  )
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12.5, color: C.text2 }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: i.color, border: '1px solid rgba(0,0,0,.08)' }} />{i.label}
        </span>
      ))}
    </div>
  )
}

export function RampLegend({ colors, low, high, title }: { colors: string[]; low: string; high: string; title: string }) {
  return (
    <div style={{ fontSize: 12.5, color: C.text2 }}>
      <div style={{ marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', gap: 2 }}>{colors.map((c) => <span key={c} style={{ flex: 1, height: 10, background: c, borderRadius: 2 }} />)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{low}</span><span>{high}</span></div>
    </div>
  )
}

/** Hourly profile: 1–2 series of 24 values, one y-axis, crosshair tooltip. */
export function HourChart({ series, height = 180, unit }: {
  series: { name: string; color: string; values: (number | null)[] }[]; height?: number; unit: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 560, H = height, L = 40, R = 12, T = 12, B = 26
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0)))
  const x = (h: number) => L + (h / 23) * (W - L - R)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const ticks = [0, max / 2, max]
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(23, Math.round(((px - L) / (W - L - R)) * 23))))
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={C.grid} strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} fontSize={10.5} textAnchor="end" fill={C.muted}>{fmtN(t, t < 10 && t > 0 ? 1 : 0)}</text>
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((h) => <text key={h} x={x(h)} y={H - 8} fontSize={10.5} textAnchor="middle" fill={C.muted}>{String(h).padStart(2, '0')}h</text>)}
        {series.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round"
            points={s.values.map((v, h) => `${x(h)},${y(v ?? 0)}`).join(' ')} />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke={C.muted} strokeDasharray="3 3" />}
        {hover != null && series.map((s) => (
          <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} stroke={C.surface} strokeWidth={2} />
        ))}
      </svg>
      {hover != null && (
        <div style={{ position: 'absolute', top: 0, left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)', background: '#fff',
          border: `1px solid ${C.line}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,.08)' }}>
          <b>{String(hover).padStart(2, '0')}:00</b>
          {series.map((s) => <div key={s.name}><span style={{ color: s.color }}>●</span> {s.name}: {fmtN(s.values[hover], 1)} {unit}</div>)}
        </div>
      )}
      {series.length > 1 && <Legend items={series.map((s) => ({ color: s.color, label: s.name }))} />}
    </div>
  )
}

/** Horizontal bars, single series (magnitude), value labels in text ink. */
export function Bars({ rows, color = C.s1, unit = '', max: maxIn }: {
  rows: { label: string; value: number; note?: string }[]; color?: string; unit?: string; max?: number
}) {
  const max = maxIn ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: ${fmtN(r.value, 1)} ${unit}${r.note ? ` · ${r.note}` : ''}`}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 38%) 1fr 64px', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <span style={{ background: C.neutral, borderRadius: 4, height: 12 }}>
            <span style={{ display: 'block', width: `${(r.value / max) * 100}%`, height: 12, background: color, borderRadius: 4 }} />
          </span>
          <span style={{ textAlign: 'right', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtN(r.value, r.value < 10 ? 1 : 0)}{unit}</span>
        </div>
      ))}
    </div>
  )
}

export function Table<T extends object>({ rows, cols, max = 50 }: {
  rows: T[]; cols: { key: keyof T; label: string; fmt?: (v: T[keyof T], r: T) => ReactNode; num?: boolean }[]; max?: number
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead><tr>{cols.map((c) => <th key={String(c.key)} style={{ textAlign: c.num ? 'right' : 'left', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, color: C.text2, fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.grid}` }}>
              {cols.map((c) => <td key={String(c.key)} style={{ padding: '5px 8px', textAlign: c.num ? 'right' : 'left', fontVariantNumeric: 'tabular-nums' }}>
                {c.fmt ? c.fmt(r[c.key], r) : typeof r[c.key] === "number" ? fmtN(r[c.key] as number, 1) : String((r[c.key] as unknown) ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section style={{ ...card, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>{aside}
      </div>
      {children}
    </section>
  )
}

/** Bird station score bands (poor < 40 ≤ fair < 70 ≤ good). Validated all-pairs with the dataviz script
 *  (worst CVD ΔE 9.1, normal 22.9); amber/aqua sit below 3:1 on white, so every use carries a text label. */
export const SCORE_COLOR: Record<'poor' | 'fair' | 'good', string> = { poor: '#c0302f', fair: '#eda100', good: '#1baf7a' }
export const scoreBandColor = (band: string | null | undefined) => band ? SCORE_COLOR[band as keyof typeof SCORE_COLOR] ?? C.muted : C.muted
