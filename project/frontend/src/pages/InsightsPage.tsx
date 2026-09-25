import 'leaflet/dist/leaflet.css'
import { DecisionMap } from './DecisionMap'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { divIcon } from 'leaflet'
import { CircleMarker, GeoJSON, Marker, Polyline, Tooltip } from 'react-leaflet'
import {
  getJson, type Candidate, type Candidates, type HourRow, type Inventory, type Journeys, type Laya, type LayaRec,
  type Overview, type FC, type StationP, type Transit, type Weather,
} from '../components/insights/data'
import {
  BLUE, Bars, C, DIVERGING, HourChart, Legend, MetaNote, RampLegend, Section, Stat, Table, divColor, fmtN, seqColor, setNumberLocale,
} from '../components/insights/viz'
import { CandidateBreakdown } from '../components/decision/DetailPanel'
import { useDT } from '../i18n-data'
import { BirdTab } from '../components/insights/BirdTab'
import { CASCAIS, Loading, Map, MapLink, escapeHtml, pill, useData, type OpenOnMap } from '../components/insights/shared'

const TABS = ['Decision map', 'Overview', 'Bird', 'Station candidates', 'Station flows', 'Transit', 'Journeys', 'Weather', 'Data'] as const
type Tab = typeof TABS[number]
/* ------------------------------------------------------------------ Overview */
function OverviewTab({ open }: { open: OpenOnMap }) {
  const dt = useDT(), t = dt.tab.overview
  const { data: o, err } = useData<Overview>('overview')
  if (!o) return <Loading err={err} />
  const h = (m: number) => `${fmtN(m / 60, 1)} h`
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Stat label={t.flagged} value={`${fmtN(o.b5.pct_flagged, 1)}%`} sub={t.flaggedSub(fmtN(o.b5.flagged_before_recovery), fmtN(o.b5.provider_recoveries_outside))} />
        <Stat label={t.earlier} value={h(o.b5.median_lead_minutes)} sub={t.earlierSub(h(o.b5.p90_lead_minutes))} />
        <Stat label={t.parked} value={fmtN(o.bike.supported_120)}
          sub={t.parkedSub(fmtN(o.b5.supported_ended_by_new_trip), fmtN(o.b5.supported_ended_by_provider), fmtN(o.b5.supported_still_open_at_data_end))} />
        <Stat label={t.inZone} value={`${fmtN(o.bike.pct_ends_in_parking_zone, 1)}%`} sub={t.inZoneSub(fmtN(o.bike.pct_ends_in_station_area, 1))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Stat label={t.cards} value={fmtN(o.journeys.cards)} sub={t.cardsSub(fmtN(o.journeys.journeys))} />
        <Stat label={t.transfer} value={`${fmtN(o.journeys.pct_with_transfer, 1)}%`} sub={t.transferSub(fmtN(o.journeys.avg_boardings_per_journey, 2))} />
        <Stat label={t.trips} value={fmtN(o.bike.valid_trips)} sub={t.tripsSub(fmtN(o.bike.trips), String(o.bike.stations))} />
        <Stat label={t.scored} value={fmtN(o.candidates.scored)} sub={t.scoredSub(fmtN(o.candidates.screened))} />
      </div>
      <Section title={t.howTitle} aside={<MapLink open={open} query={{}} />}>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: C.text }}>{t.how}</div>
      </Section>
    </div>
  )
}

/* ------------------------------------------------------------ Candidates */
/** Same dynamic ranking as the decision map at 250 m with no date/hour filter. */
function CandidatesTab({ open }: { open: OpenOnMap }) {
  const dt = useDT(), t = dt.tab.candidates
  const { data: d, err } = useData<Candidates>('map/analysis-candidates?size=250')
  const [sel, setSel] = useState<Candidate | null>(null)
  const scored = useMemo(() => d?.cells.features.filter((f) => f.properties.score != null).map((f) => f.properties)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)) ?? [], [d])
  useEffect(() => { if (scored.length && !sel) setSel(scored[0]) }, [scored, sel])
  if (!d) return <Loading err={err} />
  return (
    <div className="ins-grid2">
      <div style={{ display: 'grid', gap: 10 }}>
        <Map>
          <GeoJSON key={sel?.cell_id ?? 'none'} data={d.cells as unknown as GeoJSON.GeoJsonObject}
            style={(f) => {
              const p = f!.properties as Candidate
              const on = sel?.cell_id === p.cell_id
              return { color: on ? '#0b0b0b' : '#fff', weight: on ? 3 : 1, fillOpacity: p.score == null ? 0.18 : 0.85, fillColor: p.score == null ? '#9aa0a6' : seqColor(p.score, 1) }
            }}
            onEachFeature={(f, layer) => {
              const p = f.properties as Candidate
              layer.on('click', () => setSel(p))
              layer.bindTooltip(p.score == null ? dt.candidate.withheld : dt.tip.candidate(String(p.rank), fmtN(p.score, 3)))
            }} />
        </Map>
        <RampLegend colors={BLUE} low="0" high="1" title={t.legend} />
        <Section title={t.top} aside={<small style={{ color: C.text2 }}>{t.same}</small>}>
          <Table rows={scored.slice(0, 15)} cols={[
            { key: 'rank', label: t.cols.rank, num: true },
            { key: 'score', label: t.cols.score, num: true, fmt: (v) => fmtN(v as number, 3) },
            { key: 'trip_endpoints', label: t.cols.trips, num: true, fmt: (v) => fmtN(v as number) },
            { key: 'supported_120', label: t.cols.parked, num: true, fmt: (v) => fmtN(v as number) },
            { key: 'departures_per_hour_333m', label: t.cols.dep, num: true },
            { key: 'nearest_station_m', label: t.cols.nearest, num: true, fmt: (v) => fmtN(v as number) },
          ]} />
        </Section>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {sel && <Section title={sel.rank ? dt.candidate.title(String(sel.rank), sel.cell_id) : t.notScored}
          aside={<MapLink open={open} query={{ cand: sel.cell_id }} />}>
          <div className="decision-card" style={{ margin: 0 }}><CandidateBreakdown c={sel} /></div>
          <div style={{ fontSize: 12.5, color: C.text2 }}>
            {t.unavailable(d.weights.filter((w) => w.status === 'unavailable').map((w) => `${w.component} ${w.weight * 100}%`).join(', '))}
          </div>
        </Section>}
        <MetaNote meta={d.meta} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}><LayaAnalysis /></div>
    </div>
  )
}

/* ------------------------------------------------------------ Laya final analysis */
const VERDICT_COLOR: Record<string, string> = { 'strong candidate': C.s3, 'pilot first (virtual station)': C.s2, monitor: C.muted }
const place = (r: LayaRec) => r.nearest_station ? `near ${r.nearest_station.split(',')[0]}` : `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`
const pct = (v: number | null) => v == null ? '—' : `${fmtN(v * 100)}%`

function LayaAnalysis() {
  const { data: d, err } = useData<Laya>('laya?limit=10')
  const [selId, setSelId] = useState<string | null>(null)
  if (!d) return <Loading err={err} />
  const recs = d.recommendations
  const sel = recs.find((r) => r.cell_id === selId) ?? recs[0]
  const s = d.summary
  const bounds = recs.map((r) => [r.lat, r.lon] as [number, number])
  const centre: [number, number] = bounds.length
    ? [bounds.reduce((a, b) => a + b[0], 0) / bounds.length, bounds.reduce((a, b) => a + b[1], 0) / bounds.length] : CASCAIS
  return (
    <div style={{ display: 'grid', gap: 16, marginTop: 8 }}>
      <div style={{ borderTop: `2px solid ${C.text}`, paddingTop: 14, display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>Final analysis: Laya's top {recs.length} station areas</h2>
        <span style={{ fontSize: 13, color: C.text2 }}>
          {d.model.name} {d.model.version} · open recommendation model · scored {d.pool_size} eligible candidate cells · abandonment clock {d.abandonment_clock}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <Stat label="Strong candidates" value={s.strong} sub="score ≥ 60, medium+ confidence, top 10 in ≥ 60% of weightings" />
        <Stat label="Pilot first" value={s.pilot} sub="promising but less certain: test with a virtual station" />
        <Stat label="Agree with screening top 10" value={`${s.also_top_in_screening}/${recs.length}`} sub="independent cross-check against the provisional screening score" />
        <Stat label="Trip starts + ends covered" value={fmtN(s.trip_endpoints)} sub="in the 10 cells, 19 Aug–9 Sep 2026 (Lisbon time)" />
        <Stat label="Bikes left > 120 min" value={fmtN(s.supported_120)} sub={`outside-station parkings these areas would absorb; clock ${d.abandonment_clock}`} />
      </div>
      <div className="ins-grid2">
        <div style={{ display: 'grid', gap: 10 }}>
          <Map height={460} zoom={13} center={centre}>
            {recs.map((r) => (
              <GeoJSON key={r.cell_id + (sel?.cell_id === r.cell_id)} data={r.geometry as GeoJSON.GeoJsonObject}
                style={{ color: sel?.cell_id === r.cell_id ? C.text : '#fff', weight: sel?.cell_id === r.cell_id ? 3 : 1,
                  fillColor: VERDICT_COLOR[r.verdict] ?? C.muted, fillOpacity: 0.55 }}
                eventHandlers={{ click: () => setSelId(r.cell_id) }} />
            ))}
            {recs.map((r) => (
              <Marker key={`m${r.cell_id}`} position={[r.lat, r.lon]} eventHandlers={{ click: () => setSelId(r.cell_id) }}
                icon={divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12],
                  html: `<div style="width:24px;height:24px;border-radius:50%;background:${VERDICT_COLOR[r.verdict] ?? C.muted};color:#fff;font:700 12px system-ui;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">${r.laya_rank}</div>` })}>
                <Tooltip>#{r.laya_rank} {place(r)} · Laya {fmtN(r.laya_score, 1)}</Tooltip>
              </Marker>
            ))}
          </Map>
          <Legend items={Object.entries(VERDICT_COLOR).map(([label, color]) => ({ label, color }))} />
          <Section title="Ranking">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead><tr>{['#', 'Area', 'Laya score', 'Confidence', 'Robustness', 'Screening #', 'Verdict'].map((h, i) => (
                  <th key={h} style={{ textAlign: i > 1 && i < 6 ? 'right' : 'left', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, color: C.text2, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>))}</tr></thead>
                <tbody>
                  {recs.map((r) => (
                    <tr key={r.cell_id} onClick={() => setSelId(r.cell_id)} style={{ borderBottom: `1px solid ${C.grid}`, cursor: 'pointer',
                      background: sel?.cell_id === r.cell_id ? '#e8f1fc' : undefined }}>
                      <td style={{ padding: '5px 8px', fontWeight: 650 }}>{r.laya_rank}</td>
                      <td style={{ padding: '5px 8px' }}>{place(r)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ display: 'inline-block', width: 60, height: 8, background: C.neutral, borderRadius: 4, marginRight: 8, verticalAlign: 'middle' }}>
                          <span style={{ display: 'block', width: `${r.laya_score}%`, height: 8, background: C.s1, borderRadius: 4 }} />
                        </span><b>{fmtN(r.laya_score, 1)}</b>
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{r.confidence_label} ({fmtN(r.confidence, 2)})</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{pct(r.robustness)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{r.screening_rank ?? '—'}</td>
                      <td style={{ padding: '5px 8px', color: VERDICT_COLOR[r.verdict], fontWeight: 600, whiteSpace: 'nowrap' }}>{r.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
        {sel && <LayaDetail r={sel} model={d.model} />}
      </div>
      <Section title="All backing data (top 10)">
        <Table rows={recs} max={10} cols={[
          { key: 'laya_rank', label: '#', num: true },
          { key: 'cell_id', label: 'Cell (250 m)' },
          { key: 'trip_starts', label: 'Starts', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'trip_ends', label: 'Ends', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'active_days', label: 'Active days /21', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'weekend_share', label: 'Weekend share', num: true, fmt: (v) => pct(v as number | null) },
          { key: 'outside_intervals', label: 'Outside parkings', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'supported_120', label: '> 120 min', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'median_hours_parked', label: 'Median parked (h)', num: true, fmt: (v) => fmtN(v as number | null, 1) },
          { key: 'provider_recoveries', label: 'Provider pickups', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'reused_by_rider', label: 'Reused by rider', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'nearest_station_m', label: 'Nearest station (m)', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'departures_per_hour_333m', label: 'Dep./h ≤ 333 m', num: true, fmt: (v) => fmtN(v as number, 1) },
          { key: 'weekly_boardings_333m', label: 'Boardings/week ≤ 333 m', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'journeys_750m', label: 'Transit journeys ≤ 750 m', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'screening_score', label: 'Screening score', num: true, fmt: (v) => fmtN(v as number | null, 3) },
        ]} />
      </Section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Section title="How Laya scores">
          <Table rows={d.model.components} cols={[
            { key: 'label', label: 'Component' }, { key: 'weight', label: 'Weight', num: true, fmt: (v) => `${fmtN((v as number) * 100)}%` },
            { key: 'method', label: 'Normalisation' }]} />
          <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>
            <b>Confidence:</b> {d.model.confidence}.<br /><b>Robustness:</b> {d.model.robustness}.<br />
            <b>Eligible:</b> {d.model.eligibility}.<br /><b>Openness:</b> {d.model.openness}.
          </div>
        </Section>
        <Section title="What Laya does not know">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>{d.model.not_modelled.map((n) => <li key={n}>{n}</li>)}</ul>
          <MetaNote meta={d.meta} />
        </Section>
      </div>
    </div>
  )
}

function LayaDetail({ r, model }: { r: LayaRec; model: Laya['model'] }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title={`#${r.laya_rank} ${place(r)}`} aside={<span style={{ fontSize: 12, color: C.text2 }}>{r.lat.toFixed(4)}, {r.lon.toFixed(4)}</span>}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtN(r.laya_score, 1)}</span>
          <span style={{ fontSize: 13, color: C.text2 }}>Laya score / 100</span>
          <span style={{ fontSize: 13, fontWeight: 650, color: VERDICT_COLOR[r.verdict] }}>{r.verdict}</span>
        </div>
        <div style={{ fontSize: 13, color: C.text2 }}>
          Confidence <b style={{ color: C.text }}>{r.confidence_label}</b> ({fmtN(r.confidence, 2)}) · stays in the top 10 in <b style={{ color: C.text }}>{pct(r.robustness)}</b> of
          perturbed weightings · screening rank {r.screening_rank ?? '—'}
        </div>
        <div style={{ fontSize: 13, color: C.text2 }}>Points contributed by each component (bar end = full weight)</div>
        {model.components.map((c) => (
          <Bars key={c.key} max={c.weight * 100} rows={[{ label: `${c.label} (${fmtN(c.weight * 100)}%)`, value: r.contributions[c.key],
            note: `component ${fmtN(r.components[c.key], 2)}` }]} />
        ))}
        <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          <b>Why:</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          {r.caveats.length > 0 && <>
            <b>Check before acting:</b>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#b06000' }}>{r.caveats.map((x) => <li key={x}>{x}</li>)}</ul>
          </>}
        </div>
      </Section>
      <Section title="When bikes are used here (trip starts + ends by hour, whole sample)">
        <HourChart unit="trip ends" height={150} series={[{ name: 'Starts + ends', color: C.s1, values: r.hourly }]} />
      </Section>
      <Section title="Context">
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          Nearest station: {r.nearest_station ?? '—'} ({fmtN(r.nearest_station_m)} m)<br />
          Stops within 333 m: {r.stops_333m ?? 'none'}<br />
          Operators within 333 m: {r.operators_333m ?? 'none'}
        </div>
      </Section>
    </div>
  )
}

/* ------------------------------------------------------------ Station flows */
function StationsTab({ open }: { open: OpenOnMap }) {
  const dt = useDT(), t = dt.tab.stations
  const { data: d, err } = useData<{ stations: FC<StationP> }>('stations')
  const [sel, setSel] = useState<StationP | null>(null)
  const [hours, setHours] = useState<HourRow[] | null>(null)
  useEffect(() => { if (sel) getJson<{ hourly: HourRow[] }>(`stations/${sel.station_id}`).then((r) => setHours(r.hourly)) }, [sel])
  if (!d) return <Loading err={err} />
  const st = d.stations.features
  const maxAbs = Math.max(...st.map((f) => Math.abs(f.properties.net_flow)))
  const maxDep = Math.max(...st.map((f) => f.properties.departures))
  const perDay = (weekend: boolean, key: 'departures' | 'arrivals') => {
    const v = Array<number | null>(24).fill(0)
    hours?.filter((h) => h.is_weekend === weekend).forEach((h) => { v[h.hour_local] = h[key] / h.n_days })
    return v
  }
  const top = [...st].sort((a, b) => b.properties.departures - a.properties.departures).slice(0, 12)
  return (
    <div className="ins-grid2">
      <div style={{ display: 'grid', gap: 10 }}>
        <Map>
          {st.map((f) => {
            const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates
            const p = f.properties
            return (
              <CircleMarker key={p.station_id} center={[lat, lon]} radius={4 + 10 * Math.sqrt(p.departures / maxDep)}
                pathOptions={{ color: sel?.station_id === p.station_id ? '#0b0b0b' : '#fff', weight: 2, fillColor: divColor(p.net_flow, maxAbs), fillOpacity: 0.95 }}
                eventHandlers={{ click: () => setSel(p) }}>
                <Tooltip>{p.name.split(',')[0]}<br />{t.tip(fmtN(p.departures), fmtN(p.arrivals), `${p.net_flow > 0 ? '+' : ''}${p.net_flow}`)}</Tooltip>
              </CircleMarker>
            )
          })}
        </Map>
        <RampLegend colors={DIVERGING} low={`${t.low} (−${maxAbs})`} high={`${t.high} (+${maxAbs})`} title={t.legend(String(maxAbs))} />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <Section title={sel ? sel.name.split(',')[0] : t.pick} aside={sel && <MapLink open={open} query={{ station: sel.station_id }} />}>
          {sel && hours ? (
            <>
              <div style={{ fontSize: 13, color: C.text2 }}>{t.avgDep}</div>
              <HourChart unit={t.unitDep} series={[
                { name: dt.cell.weekday, color: C.s1, values: perDay(false, 'departures') },
                { name: dt.cell.weekend, color: C.s2, values: perDay(true, 'departures') }]} />
              <div style={{ fontSize: 13, color: C.text2 }}>{t.avgArr}</div>
              <HourChart unit={t.unitArr} series={[
                { name: dt.cell.weekday, color: C.s1, values: perDay(false, 'arrivals') },
                { name: dt.cell.weekend, color: C.s2, values: perDay(true, 'arrivals') }]} />
            </>
          ) : <div style={{ fontSize: 13, color: C.text2 }}>{t.hint}</div>}
        </Section>
        <Section title={t.busiest}>
          <Bars rows={top.map((f) => ({ label: f.properties.name.split(',')[0], value: f.properties.departures }))} />
        </Section>
        <MetaNote meta={{ kind: t.kind, notes: t.notes }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Transit */
function TransitTab({ open }: { open: OpenOnMap }) {
  const dt = useDT(), t = dt.tab.transit
  const { data: d, err } = useData<Transit>('transit')
  if (!d) return <Loading err={err} />
  const stops = d.stops.features
  const maxB = Math.max(1, ...stops.map((f) => f.properties.weekly_boardings))
  const maxF = Math.max(1, ...stops.map((f) => f.properties.departures_per_hour ?? 0))
  const hourly = (weekend: boolean) => {
    const v = Array<number | null>(24).fill(0)
    d.boardings_by_hour.filter((h) => h.is_weekend === weekend).forEach((h) => { v[h.hour_local] = h.validations / (weekend ? 2 : 5) })
    return v
  }
  const delays = d.bus_delay.filter((r) => r.time_window === 'all').sort((a, b) => b.median_delay_min - a.median_delay_min)
  return (
    <div className="ins-grid2">
      <div style={{ display: 'grid', gap: 10 }}>
        <div><MapLink open={open} query={{ layers: 'people,bus,rail,stops' }} /></div>
        <Map>
          {stops.map((f) => {
            const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates
            const p = f.properties
            return (
              <CircleMarker key={p.agency_id + p.stop_id} center={[lat, lon]} radius={2.5 + 12 * Math.sqrt(p.weekly_boardings / maxB)}
                pathOptions={{ color: '#fff', weight: 1, fillColor: seqColor(p.departures_per_hour, maxF), fillOpacity: 0.9 }}>
                <Tooltip><span dangerouslySetInnerHTML={{ __html: t.tip(`${escapeHtml(p.stop_name)} (${escapeHtml(p.agency_name ?? p.agency_id)})`, fmtN(p.departures_per_hour, 1), fmtN(p.weekly_boardings)) }} /></Tooltip>
              </CircleMarker>
            )
          })}
        </Map>
        <RampLegend colors={BLUE} low="0" high={fmtN(maxF, 0)} title={t.legend(fmtN(maxF, 0))} />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <Section title={t.boardings}>
          <HourChart unit={t.unit} series={[{ name: dt.cell.weekday, color: C.s1, values: hourly(false) }, { name: dt.cell.weekend, color: C.s2, values: hourly(true) }]} />
        </Section>
        <Section title={t.proxyTitle}>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            {t.proxy(fmtN(d.transfer_proxy.summary.find((r) => r.kind === 'start')?.pct, 1), fmtN(d.transfer_proxy.placebo.pct, 1))}
          </div>
        </Section>
        <Section title={t.delayTitle}>
          <Bars rows={delays.slice(0, 14).map((r) => ({ label: r.route, value: Number(r.median_delay_min), note: t.p90(String(r.p90_delay_min), fmtN(r.services)) }))} unit=" min" />
          <div style={{ fontSize: 12.5, color: C.text2 }}>{t.delayNote}</div>
          <Table rows={delays} max={12} cols={[
            { key: 'route', label: t.cols.route }, { key: 'services', label: t.cols.services, num: true, fmt: (v) => fmtN(v as number) },
            { key: 'median_delay_min', label: t.cols.median, num: true }, { key: 'p90_delay_min', label: t.cols.p90, num: true },
            { key: 'median_early_min', label: t.cols.early, num: true }]} />
        </Section>
        <MetaNote meta={d.meta} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Journeys */
function JourneysTab({ open }: { open: OpenOnMap }) {
  const dt = useDT(), t = dt.tab.journeys
  const { data: d, err } = useData<Journeys>('journeys')
  const [peak, setPeak] = useState<'journeys' | 'am_peak' | 'pm_peak'>('journeys')
  if (!d) return <Loading err={err} />
  const flows = d.flows.features.filter((f) => f.properties[peak] > 0).sort((a, b) => a.properties[peak] - b.properties[peak])
  const max = Math.max(1, ...flows.map((f) => f.properties[peak]))
  const s = d.summary
  const muni = d.municipalities.filter((m) => m.origin_municipality !== m.dest_municipality).slice(0, 10)
  return (
    <div className="ins-grid2">
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([['journeys', t.allDay], ['am_peak', '07–10'], ['pm_peak', '16–19']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPeak(k)} style={pill(peak === k)}>{l}</button>
          ))}
          <MapLink open={open} query={{ layers: 'people,stations' }} />
        </div>
        <Map zoom={11} center={[38.73, -9.30]}>
          {flows.map((f, i) => {
            const coords = (f.geometry as GeoJSON.LineString).coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
            const v = f.properties[peak]
            return (
              <Polyline key={i} positions={coords}
                pathOptions={{ color: seqColor(Math.max(v, max * 0.3), max), weight: 1.5 + 8 * Math.sqrt(v / max), opacity: 0.35 + 0.6 * Math.sqrt(v / max) }}>
                <Tooltip sticky>{f.properties.origin_municipality} → {f.properties.dest_municipality}<br />{t.tip(fmtN(v), fmtN(f.properties.cards), fmtN(f.properties.with_transfer))}</Tooltip>
              </Polyline>
            )
          })}
        </Map>
        <RampLegend colors={BLUE} low="5+" high={fmtN(max)} title={t.legend(fmtN(max))} />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat label={t.cards} value={fmtN(s.cards)} sub={t.journeysSub(fmtN(s.journeys))} />
          <Stat label={t.transfer} value={`${fmtN(s.pct_with_transfer, 1)}%`} sub={t.transferSub(fmtN(s.pct_mobicascais_with_other_operator, 1))} />
        </div>
        <Section title={t.between}>
          <Bars rows={muni.map((m) => ({ label: `${m.origin_municipality} → ${m.dest_municipality}`, value: m.journeys, note: t.cardsNote(fmtN(m.cards)) }))} />
        </Section>
        <Section title={t.common}>
          <Table rows={d.transfers.slice(0, 12)} cols={[
            { key: 'from_operator', label: t.cols.from, fmt: (v, r) => `${v ?? '?'} ${r.from_line}` },
            { key: 'to_operator', label: t.cols.to, fmt: (v, r) => `${v ?? '?'} ${r.to_line}` },
            { key: 'transfers', label: t.cols.transfers, num: true, fmt: (v) => fmtN(v as number) },
            { key: 'median_gap_min', label: t.cols.gap, num: true }]} />
        </Section>
        <MetaNote meta={d.meta} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Weather */
function WeatherTab() {
  const dt = useDT(), t = dt.tab.weather
  const { data: d, err } = useData<Weather>('weather')
  if (!d) return <Loading err={err} />
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      {['rain', 'temperature', 'wind'].map((g) => (
        <Section key={g} title={t.title(t.factors[g])}>
          <Bars rows={d.by_class.filter((r) => r.factor === g).map((r) => ({ label: `${r.level} (${r.hours} h)`, value: Number(r.avg_starts_per_hour) }))} />
        </Section>
      ))}
      <div style={{ gridColumn: '1 / -1' }}><MetaNote meta={d.meta} /></div>
    </div>
  )
}

/* ------------------------------------------------------------ Data */
function DataTab() {
  const dt = useDT(), t = dt.tab.data
  const { data: d, err } = useData<Inventory>('inventory')
  if (!d) return <Loading err={err} />
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Section title={t.collected}>
        <Table rows={d.steps} max={100} cols={[
          { key: 'target', label: t.cols.target }, { key: 'rows_read', label: t.cols.read, num: true, fmt: (v) => fmtN(v as number | null) },
          { key: 'rows_kept', label: t.cols.kept, num: true, fmt: (v) => fmtN(v as number | null) }, { key: 'filter', label: t.cols.filter }]} />
      </Section>
      <Section title={t.geo}>
        <Table rows={d.coverage} cols={[
          { key: 'agency_name', label: t.geoCols.agency, fmt: (v, r) => `${v ?? r.agency_id}` },
          { key: 'validations', label: t.geoCols.validations, num: true, fmt: (v) => fmtN(v as number) },
          { key: 'pct_geolocated', label: t.geoCols.pct, num: true },
          { key: 'in_cascais', label: t.geoCols.cascais, num: true, fmt: (v) => fmtN(v as number) }]} />
      </Section>
    </div>
  )
}

/** The tab named in the hash; the former Recovery tab is now the Bird tab. */
const tabFromHash = (): Tab | undefined => {
  const name = decodeURIComponent(location.hash.slice(1))
  return TABS.find((t) => t === (name === 'Recovery' ? 'Bird' : name))
}

export function InsightsPage() {
  const dt = useDT()
  setNumberLocale(dt.locale)
  const [tab, setTab] = useState<Tab>(() => tabFromHash() ?? 'Decision map')
  useEffect(() => { history.replaceState(history.state, '', `#${encodeURIComponent(tab)}`) }, [tab])
  useEffect(() => {
    const follow = () => { const next = tabFromHash(); if (next) setTab(next) }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  const openOnMap: OpenOnMap = (query) => {
    const search = new URLSearchParams(query).toString()
    history.replaceState(history.state, '', `${location.pathname}${search ? `?${search}` : ''}#${encodeURIComponent('Decision map')}`)
    setTab('Decision map')
    window.scrollTo({ top: 0 })
  }
  const body: Record<Tab, ReactNode> = {
    'Decision map': <DecisionMap />,
    Overview: <OverviewTab open={openOnMap} />, Bird: <BirdTab open={openOnMap} />, 'Station candidates': <CandidatesTab open={openOnMap} />,
    'Station flows': <StationsTab open={openOnMap} />, Transit: <TransitTab open={openOnMap} />, Journeys: <JourneysTab open={openOnMap} />,
    Weather: <WeatherTab />, Data: <DataTab />,
  }
  return (
    <div lang={dt.locale.slice(0, 2)} style={{ minHeight: '100dvh', background: '#f6f6f4', fontFamily: 'system-ui, sans-serif', color: C.text }}>
      <header className="ins-header" style={{ background: '#fff', borderBottom: `1px solid ${C.line}`, padding: '14px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>{dt.page.title}</h1>
          <span style={{ fontSize: 13, color: C.text2 }}>{dt.page.subtitle}</span>
        </div>
        <nav style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              border: 'none', background: 'none', padding: '8px 12px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
              color: t === tab ? C.text : C.text2, fontWeight: t === tab ? 650 : 500,
              borderBottom: `2px solid ${t === tab ? C.s1 : 'transparent'}` }}>{dt.page.tabs[t]}</button>
          ))}
        </nav>
      </header>
      <main style={{ padding: 20, maxWidth: 1480, margin: '0 auto' }}>{body[tab]}</main>
      <style>{`.tiles-muted { filter: grayscale(1) brightness(1.06) contrast(0.85); }
.ins-grid2 { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); gap: 16px; align-items: start; }
@media (max-width: 900px) { .ins-grid2 { grid-template-columns: minmax(0, 1fr); } main { padding: 12px !important; } }`}</style>
    </div>
  )
}

export { Legend }
