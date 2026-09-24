/** The /insights map. One layer at a time, because the three layers answer different questions
 *  and the requirements doc forbids mixing evidence classes in one reading. */
import { CircleMarker, Rectangle, Tooltip } from 'react-leaflet'
import { BaseMap } from '../BaseMap'
import { useT } from '../../i18n'
import type { CandidateRow, FlowRow, RecoveryMetric, RecoveryRow } from './types'
import { DIVERGING, INK, NO_DATA, SEQUENTIAL, fmtNumber, quantileScale } from './viz'

/** Sequential legend. The "no data" swatch is deliberately outside the ramp. */
export function ScaleLegend({ breaks, unit }: { breaks: number[]; unit: string }) {
  const t = useT()
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: INK.secondary }}>
      <span>{t.legendLow}</span>
      <span style={{ display: 'flex' }}>
        {SEQUENTIAL.map((c, i) => (
          <span key={c} title={breaks[i] !== undefined ? `≤ ${fmtNumber(breaks[i])}` : ''}
            style={{ width: 20, height: 12, background: c }} />
        ))}
      </span>
      <span>{t.legendHigh}</span>
      <span style={{ marginLeft: 4 }}>{unit}</span>
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 8 }}>
        <span style={{ width: 12, height: 12, background: NO_DATA, border: `1px solid ${INK.axis}` }} />
        {t.legendNoData}
      </span>
    </div>
  )
}

export function RecoveryMap({ rows, metric, selected, onSelect }: {
  rows: RecoveryRow[]
  metric: RecoveryMetric
  selected: string | null
  onSelect: (id: string) => void
}) {
  const scale = quantileScale(rows.map((r) => r[metric]).filter((v): v is number => v !== null))
  return (
    <BaseMap>
      {rows.map((r) => {
        const value = r[metric]
        return (
          <Rectangle key={r.id} bounds={r.bounds}
            pathOptions={{
              // An unmeasured cell gets the flat grey, never a pale ramp step that would read low.
              fillColor: scale.at(value), fillOpacity: value === null ? 0.35 : 0.72,
              color: r.id === selected ? INK.primary : '#ffffff',
              weight: r.id === selected ? 2 : 0.4,
            }}
            eventHandlers={{ click: () => onSelect(r.id) }}>
            <Tooltip direction="top" sticky>
              <b>{r.name}</b><br />
              {fmtNumber(value)} · {r.trip_ends} trip ends · {r.distinct_intervals} intervals
              {r.quality !== 'ok' && <><br />⚠ insufficient observations</>}
            </Tooltip>
          </Rectangle>
        )
      })}
    </BaseMap>
  )
}

export function OpportunityMap({ rows, selected, onSelect }: {
  rows: CandidateRow[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const scale = quantileScale(rows.map((r) => r.score).filter((v): v is number => v !== null))
  return (
    <BaseMap>
      {rows.map((r) => (
        <CircleMarker key={r.id} center={[r.lat, r.lng]}
          radius={r.score === null ? 8 : 9 + r.score * 9}
          pathOptions={{
            fillColor: scale.at(r.score), fillOpacity: 0.85,
            color: r.id === selected ? INK.primary : '#ffffff', weight: r.id === selected ? 3 : 1.5,
          }}
          eventHandlers={{ click: () => onSelect(r.id) }}>
          {/* Rank is a direct label: identity never rests on colour alone. */}
          <Tooltip permanent direction="center" className="insights-rank">
            {r.rank ?? '–'}
          </Tooltip>
          <Tooltip direction="top" offset={[0, -10]}>
            <b>{r.name}</b><br />{fmtNumber(r.score, 2)}
          </Tooltip>
        </CircleMarker>
      ))}
    </BaseMap>
  )
}

export function FlowMap({ rows, selected, onSelect }: {
  rows: FlowRow[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const largest = Math.max(1, ...rows.map((r) => Math.abs(r.net_flow)))
  return (
    <BaseMap>
      {rows.map((r) => (
        <CircleMarker key={r.station_id} center={[r.lat, r.lng]}
          radius={8 + (Math.abs(r.net_flow) / largest) * 14}
          pathOptions={{
            // Diverging: surplus vs deficit are opposite signs, grey sits at no net movement.
            fillColor: r.net_flow > 0 ? DIVERGING.positive : r.net_flow < 0 ? DIVERGING.negative : DIVERGING.midpoint,
            fillOpacity: 0.8,
            color: r.station_id === selected ? INK.primary : '#ffffff',
            weight: r.station_id === selected ? 3 : 1.5,
          }}
          eventHandlers={{ click: () => onSelect(r.station_id) }}>
          <Tooltip direction="top" offset={[0, -10]}>
            <b>{r.name}</b><br />
            {r.departures} ↑ · {r.arrivals} ↓ · net {r.net_flow > 0 ? '+' : ''}{r.net_flow}
          </Tooltip>
        </CircleMarker>
      ))}
    </BaseMap>
  )
}
