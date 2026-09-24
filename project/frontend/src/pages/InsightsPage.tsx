import { useEffect, useMemo, useState, type ReactNode } from 'react'
import '../components/insights/insights.css'
import { HourlyFlow } from '../components/insights/HourlyFlow'
import { FlowMap, OpportunityMap, RecoveryMap, ScaleLegend } from '../components/insights/InsightsMap'
import { EvidenceBadge, ProvenanceBar } from '../components/insights/ProvenanceBar'
import type {
  CandidateRow, FlowFile, FlowRow, OpportunityFile, RecoveryFile, RecoveryMetric, RecoveryRow,
} from '../components/insights/types'
import { INK, STATUS, downloadCsv, fmtNumber, quantileScale } from '../components/insights/viz'
import { useT } from '../i18n'

type Layer = 'recovery' | 'opportunity' | 'flow'

const FILES = {
  recovery: '/analytics/recovery_kpis.json',
  opportunity: '/analytics/station_opportunity.json',
  flow: '/analytics/supply_demand.json',
}
/** Enough cells to read the pattern without asking Leaflet to draw the whole municipality. */
const MAP_CELL_LIMIT = 400

/** Analysis page (F4). It renders the JSON written by project/analytics and computes nothing. */
export function InsightsPage() {
  const t = useT()
  const [layer, setLayer] = useState<Layer>('recovery')
  const [recovery, setRecovery] = useState<RecoveryFile | null>(null)
  const [opportunity, setOpportunity] = useState<OpportunityFile | null>(null)
  const [flow, setFlow] = useState<FlowFile | null>(null)
  const [metric, setMetric] = useState<RecoveryMetric>('abandonments_per_100_trip_ends')
  const [dayType, setDayType] = useState<'weekday' | 'weekend'>('weekday')
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = <T,>(url: string, set: (v: T) => void) =>
      fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(url)))).then(set)
    Promise.all([
      load<RecoveryFile>(FILES.recovery, setRecovery),
      load<OpportunityFile>(FILES.opportunity, setOpportunity),
      load<FlowFile>(FILES.flow, setFlow),
    ]).catch((e) => setError(String(e)))
  }, [])

  useEffect(() => setSelected(null), [layer, dayType])

  const metricLabel: Record<RecoveryMetric, string> = {
    abandonments_per_100_trip_ends: t.abandonmentsPer100,
    idle_hours_median: t.idleHours,
    hours_to_provider_pickup_median: t.hoursToPickup,
  }

  // Ranked, and only ever within one evidence class + one day type.
  const recoveryRows = useMemo(
    () => [...(recovery?.rows ?? [])].sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1)),
    [recovery, metric])
  const flowRows = useMemo(
    () => (flow?.rows ?? []).filter((r) => r.day_type === dayType).sort((a, b) => b.net_flow - a.net_flow),
    [flow, dayType])
  const candidateRows = opportunity?.rows ?? []

  const meta = layer === 'recovery' ? recovery?.meta : layer === 'opportunity' ? opportunity?.meta : flow?.meta
  const rowCount = layer === 'recovery' ? recoveryRows.length : layer === 'opportunity' ? candidateRows.length : flowRows.length

  if (error) return <Shell><p style={{ padding: 16, color: STATUS.critical }}>{error}</p></Shell>
  if (!meta) return <Shell><p style={{ padding: 16, color: INK.secondary }}>{t.loading}</p></Shell>

  function exportCurrent() {
    if (layer === 'recovery') {
      downloadCsv('recovery_kpis.csv',
        ['id', 'nome', metricLabel[metric], t.tripEnds, t.abandonments, t.intervals, 'qualidade', 'evidencia'],
        recoveryRows.map((r) => [r.id, r.name, r[metric], r.trip_ends, r.abandonments, r.distinct_intervals, r.quality, r.evidence]))
    } else if (layer === 'opportunity') {
      downloadCsv('station_opportunity.csv',
        ['rank', 'id', 'nome', 'score', 'score_sem_autocarro', t.intervals, t.nearestStation, 'qualidade', 'evidencia', t.blockers],
        candidateRows.map((r) => [r.rank, r.id, r.name, r.score, r.score_without_bus_delay,
          r.distinct_intervals, r.nearest_station_m, r.quality, r.evidence, r.blockers.join(' | ')]))
    } else {
      downloadCsv(`supply_demand_${dayType}.csv`,
        ['station_id', 'nome', t.dayType, t.departures, t.arrivals, t.netFlow, 'evidencia'],
        flowRows.map((r) => [r.station_id, r.name, r.day_type, r.departures, r.arrivals, r.net_flow, r.evidence]))
    }
  }

  const scale = quantileScale(recoveryRows.map((r) => r[metric]).filter((v): v is number => v !== null))
  const mapCells = recoveryRows.slice(0, MAP_CELL_LIMIT)

  return (
    <Shell>
      <ProvenanceBar meta={meta} rowCount={rowCount} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderBottom: `1px solid ${INK.grid}` }}>
        {(['recovery', 'opportunity', 'flow'] as Layer[]).map((l) => (
          <button key={l} onClick={() => setLayer(l)} aria-pressed={layer === l} style={{
            border: `1px solid ${layer === l ? INK.primary : INK.axis}`, cursor: 'pointer',
            background: layer === l ? INK.primary : '#fff', color: layer === l ? '#fff' : INK.primary,
            borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600,
          }}>
            {l === 'recovery' ? t.layerRecovery : l === 'opportunity' ? t.layerOpportunity : t.layerFlow}
          </button>
        ))}

        {layer === 'recovery' && (
          <select value={metric} onChange={(e) => setMetric(e.target.value as RecoveryMetric)}
            style={{ padding: 5, borderRadius: 6, fontSize: 13 }}>
            {Object.entries(metricLabel).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        )}
        {layer === 'flow' && (
          <select value={dayType} onChange={(e) => setDayType(e.target.value as 'weekday' | 'weekend')}
            style={{ padding: 5, borderRadius: 6, fontSize: 13 }}>
            <option value="weekday">{t.weekday}</option>
            <option value="weekend">{t.weekend}</option>
          </select>
        )}

        <button onClick={exportCurrent} style={{
          marginLeft: 'auto', border: `1px solid ${INK.axis}`, background: '#fff', cursor: 'pointer',
          borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: INK.primary,
        }}>{t.exportCsv}</button>
      </div>

      {layer === 'recovery' && (
        <div style={{ padding: '6px 12px', borderBottom: `1px solid ${INK.grid}` }}>
          <ScaleLegend breaks={scale.breaks} unit={metricLabel[metric]} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 460px', minHeight: 0 }}>
        <div style={{ minHeight: 0 }}>
          {layer === 'recovery' && <RecoveryMap rows={mapCells} metric={metric} selected={selected} onSelect={setSelected} />}
          {layer === 'opportunity' && <OpportunityMap rows={candidateRows} selected={selected} onSelect={setSelected} />}
          {layer === 'flow' && <FlowMap rows={flowRows} selected={selected} onSelect={setSelected} />}
        </div>

        <aside style={{ overflowY: 'auto', borderLeft: `1px solid ${INK.grid}`, padding: 12, minWidth: 0 }}>
          {layer === 'recovery' && (
            <RankedTable
              head={[t.rankLabel, t.candidate, metricLabel[metric], t.intervals]}
              rows={recoveryRows.slice(0, MAP_CELL_LIMIT).map((r, i) => ({
                id: r.id, selected: r.id === selected,
                cells: [String(i + 1), r.name, cellValue(r[metric], r.quality === 'ok', t.noDataShort), String(r.distinct_intervals)],
                muted: r.quality !== 'ok',
              }))}
              onSelect={setSelected} />
          )}
          {layer === 'opportunity' && (
            <RankedTable
              head={[t.rankLabel, t.candidate, t.scoreLabel, `${t.scoreLabel} ${t.withoutBus}`]}
              rows={candidateRows.map((r) => ({
                id: r.id, selected: r.id === selected,
                cells: [r.rank === null ? '–' : String(r.rank), r.name,
                  cellValue(r.score, r.quality === 'ok', t.noDataShort, 2),
                  cellValue(r.score_without_bus_delay, r.quality === 'ok', t.noDataShort, 2)],
                muted: r.quality !== 'ok',
              }))}
              onSelect={setSelected} />
          )}
          {layer === 'flow' && (
            <RankedTable
              head={[t.rankLabel, t.station, t.departures, t.arrivals, t.netFlow]}
              rows={flowRows.map((r, i) => ({
                id: r.station_id, selected: r.station_id === selected,
                cells: [String(i + 1), r.name, String(r.departures), String(r.arrivals),
                  `${r.net_flow > 0 ? '+' : ''}${r.net_flow}`],
                muted: false,
              }))}
              onSelect={setSelected} />
          )}

          <div style={{ marginTop: 12, borderTop: `1px solid ${INK.grid}`, paddingTop: 10 }}>
            {selected === null
              ? <p style={{ color: INK.muted, fontSize: 13 }}>{t.selectRow}</p>
              : layer === 'recovery'
                ? <RecoveryDetail row={recoveryRows.find((r) => r.id === selected)} labels={metricLabel} />
                : layer === 'opportunity'
                  ? <CandidateDetail row={candidateRows.find((r) => r.id === selected)} weights={opportunity?.weights ?? {}} />
                  : <FlowDetail row={flowRows.find((r) => r.station_id === selected)} />}
          </div>
        </aside>
      </div>
    </Shell>
  )
}

const cellValue = (v: number | null, ok: boolean, dash: string, digits = 1) =>
  !ok || v === null ? dash : fmtNumber(v, digits)

function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto auto 1fr', height: '100dvh', fontFamily: 'system-ui', background: INK.surface }}>
      {children}
    </div>
  )
}

function RankedTable({ head, rows, onSelect }: {
  head: string[]
  rows: { id: string; cells: string[]; selected: boolean; muted: boolean }[]
  onSelect: (id: string) => void
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
      <thead>
        <tr>{head.map((h, i) => (
          <th key={h} style={{
            textAlign: i === 1 ? 'left' : 'right', padding: '4px 6px', color: INK.secondary,
            fontWeight: 600, borderBottom: `1px solid ${INK.axis}`, position: 'sticky', top: 0, background: INK.surface,
          }}>{h}</th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onClick={() => onSelect(r.id)} style={{
            cursor: 'pointer', background: r.selected ? '#eef5fb' : undefined,
            color: r.muted ? INK.muted : INK.primary,
          }}>
            {r.cells.map((c, i) => (
              <td key={i} style={{
                textAlign: i === 1 ? 'left' : 'right', padding: '4px 6px',
                borderBottom: `1px solid ${INK.grid}`,
                maxWidth: i === 1 ? 190 : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function QualityNote({ quality, intervals }: { quality: string; intervals: number }) {
  const t = useT()
  if (quality === 'ok') return null
  return (
    <p style={{ fontSize: 12, color: INK.primary, background: '#fff4d6', border: `1px solid ${STATUS.warning}`, borderRadius: 6, padding: '6px 8px' }}>
      ⚠ {t.insufficientObs} — {intervals} {t.intervals.toLowerCase()} (&lt; 5)
    </p>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '2px 0' }}>
      <span style={{ color: INK.secondary, minWidth: 180 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function RecoveryDetail({ row, labels }: { row?: RecoveryRow; labels: Record<RecoveryMetric, string> }) {
  const t = useT()
  if (!row) return null
  return (
    <div>
      <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>{row.name}</h3>
      <EvidenceBadge evidence={row.evidence} />
      <QualityNote quality={row.quality} intervals={row.distinct_intervals} />
      <Row label={t.tripEnds} value={row.trip_ends} />
      <Row label={t.abandonments} value={row.abandonments} />
      <Row label={t.intervals} value={row.distinct_intervals} />
      {(Object.keys(labels) as RecoveryMetric[]).map((k) => (
        <Row key={k} label={labels[k]}
          value={row[k] === null ? <em style={{ color: INK.muted }}>{t.noDataShort}</em> : fmtNumber(row[k])} />
      ))}
    </div>
  )
}

function CandidateDetail({ row, weights }: { row?: CandidateRow; weights: Record<string, number> }) {
  const t = useT()
  if (!row) return null
  return (
    <div>
      <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>{row.name}</h3>
      <EvidenceBadge evidence={row.evidence} />
      <QualityNote quality={row.quality} intervals={row.distinct_intervals} />
      <Row label={t.scoreLabel} value={row.score === null ? '—' : fmtNumber(row.score, 2)} />
      <Row label={`${t.scoreLabel} ${t.withoutBus}`}
        value={row.score_without_bus_delay === null ? '—'
          : `${fmtNumber(row.score_without_bus_delay, 2)} (${t.rankLabel}${row.rank_without_bus_delay})`} />
      <Row label={t.nearestStation} value={`${row.nearest_station_m} m`} />

      <h4 style={{ fontSize: 13, margin: '10px 0 4px', color: INK.secondary }}>{t.componentsTitle}</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        <tbody>
          {Object.entries(row.components).map(([key, c]) => (
            <tr key={key}>
              <td style={{ padding: '3px 4px', borderBottom: `1px solid ${INK.grid}` }}>
                {key}
                <span style={{ color: INK.muted }}> · {Math.round((weights[key] ?? 0) * 100)}%</span>
              </td>
              <td style={{ padding: '3px 4px', textAlign: 'right', borderBottom: `1px solid ${INK.grid}` }}>
                {c.available
                  ? <>{fmtNumber(c.value, 2)} <span style={{ color: INK.muted }}>({c.raw} {c.unit})</span></>
                  : <span style={{ color: INK.primary, background: '#fff4d6', padding: '0 4px', borderRadius: 3 }}>
                      {fmtNumber(c.value, 2)} · {t.missingInput}
                    </span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {row.blockers.length > 0 && (
        <p style={{ fontSize: 12, marginTop: 8, color: INK.primary }}>
          <b>{t.blockers}:</b> {row.blockers.join(' · ')}
        </p>
      )}
      <p style={{ fontSize: 11, color: INK.muted, marginTop: 6 }}>{t.weightsTitle}</p>
    </div>
  )
}

function FlowDetail({ row }: { row?: FlowRow }) {
  const t = useT()
  if (!row) return null
  return (
    <div>
      <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>{row.name}</h3>
      <EvidenceBadge evidence={row.evidence} />
      <Row label={t.departures} value={row.departures} />
      <Row label={t.arrivals} value={row.arrivals} />
      <Row label={t.netFlow} value={`${row.net_flow > 0 ? '+' : ''}${row.net_flow}`} />
      <div style={{ marginTop: 8 }}>
        <HourlyFlow hours={row.by_hour} title={`${row.name} · ${row.day_type === 'weekday' ? t.weekday : t.weekend}`} />
      </div>
      <p style={{ fontSize: 11, color: INK.muted }}>{t.netFlowNote}</p>
    </div>
  )
}
