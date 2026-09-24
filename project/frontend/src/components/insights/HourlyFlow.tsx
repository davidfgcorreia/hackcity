/** Departures and arrivals by local hour for one station (F3).
 *
 *  Two series, one unit, one axis — never a second y-scale. A legend is always present because
 *  there are two series, values are labelled on hover, and the grid stays recessive.
 */
import { useState } from 'react'
import { useT } from '../../i18n'
import type { HourFlow } from './types'
import { INK, SERIES } from './viz'

const W = 420
const H = 150
const PAD = { top: 10, right: 8, bottom: 20, left: 30 }

export function HourlyFlow({ hours, title }: { hours: HourFlow[]; title: string }) {
  const t = useT()
  const [hover, setHover] = useState<HourFlow | null>(null)

  const peak = Math.max(1, ...hours.flatMap((h) => [h.departures, h.arrivals]))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const slot = plotW / hours.length
  const barW = Math.max(2, slot / 2 - 1) // 2px surface gap between the paired bars
  const y = (v: number) => PAD.top + plotH - (v / peak) * plotH
  const ticks = [0, Math.round(peak / 2), peak]

  return (
    <figure style={{ margin: 0, fontFamily: 'system-ui' }}>
      <figcaption style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: INK.primary }}>{title}</span>
        <span style={{ display: 'flex', gap: 10, fontSize: 12, color: INK.secondary }}>
          {(['departures', 'arrivals'] as const).map((k) => (
            <span key={k} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: SERIES[k] }} />
              {k === 'departures' ? t.departures : t.arrivals}
            </span>
          ))}
        </span>
      </figcaption>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${title}: ${t.departures} / ${t.arrivals} ${t.hourLabel} 0-23`}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={INK.grid} strokeWidth={1} />
            <text x={PAD.left - 5} y={y(v) + 3} textAnchor="end" fontSize={9} fill={INK.muted}>{v}</text>
          </g>
        ))}
        {hours.map((h, i) => {
          const x = PAD.left + i * slot
          return (
            <g key={h.hour} onMouseEnter={() => setHover(h)}>
              {/* Hit target spans the whole slot, not just the bars. */}
              <rect x={x} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              <rect x={x} y={y(h.departures)} width={barW} height={PAD.top + plotH - y(h.departures)}
                fill={SERIES.departures} rx={2} />
              <rect x={x + barW + 2} y={y(h.arrivals)} width={barW} height={PAD.top + plotH - y(h.arrivals)}
                fill={SERIES.arrivals} rx={2} />
              {h.hour % 6 === 0 && (
                <text x={x + slot / 2} y={H - 6} textAnchor="middle" fontSize={9} fill={INK.muted}>{h.hour}</text>
              )}
            </g>
          )
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
          stroke={INK.axis} strokeWidth={1} />
      </svg>

      <div style={{ fontSize: 12, color: INK.secondary, minHeight: 18 }}>
        {hover
          ? `${t.hourLabel} ${String(hover.hour).padStart(2, '0')}:00 — ${t.departures} ${hover.departures} · ${t.arrivals} ${hover.arrivals} · ${t.netFlow} ${hover.net > 0 ? '+' : ''}${hover.net}`
          : `${t.hourLabel} 0–23 · ${hours.reduce((s, h) => s + h.departures, 0)} / ${hours.reduce((s, h) => s + h.arrivals, 0)}`}
      </div>
    </figure>
  )
}
