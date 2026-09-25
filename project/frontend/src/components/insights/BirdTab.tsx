/** Bird (the operator) performance: fineable abandonments, pickup response and station balancing,
 *  reconstructed from Bird's own event log. Data: /analytics/bird and /analytics/bird/map. */
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { api } from '../../api'
import { countedMinutes, useAnalysisRules, useRules, windowLabel, type Rules } from '../../enforcement'
import { useDT } from '../../i18n-data'
import type { Case } from '../../types'
import { openCases, unmovedBikes } from '../decision/MapLayers'
import type { Bike } from '../decision/types'
import type { FC, Meta } from './data'
import { HEAT_GRADIENT, HeatLayer } from './HeatLayer'
import { Map, MapLink, Loading, pill, useData, escapeHtml, type OpenOnMap } from './shared'
import { Bars, C, HourChart, Legend, MetaNote, SCORE_COLOR, Section, Stat, fmtN, scoreBandColor } from './viz'

type Operation = { kind: string; legs: number; median_min: number; median_m: number; from_outside: number; to_outside: number; charged: number }
type Day = { day: string; abandonments: number; not_recovered_by_bird: number; pickups: number; relocations: number; pct_empty_service_hours: number | null }
type Summary = {
  abandonment: { abandonments: number; bird_recovered: number; rider_took: number; moved: number; left_area: number; still_open: number
    bird_dropped_outside: number; median_response_min: number; p90_response_min: number }
  prevented: { bird_before_threshold: number; outside_intervals: number; bird_dropoffs_outside: number }
  response_bands: { band: string; band_index: number; bikes: number }[]
  operations: Operation[]
  balancing: { into_stations: number; into_empty: number; into_below_typical: number; out_of_stations: number; out_of_above_typical: number }
  stock: { service_hours: number; empty_service_hours: number; stations_ever_empty: number; stations: number }
  empty_spells: { refilled_by: string; spells: number; median_hours: number }[]
  daily: Day[]; hourly: { hour: number; abandonments: number; pickups: number; relocations: number }[]; days: number; meta: Meta
  station_score: ScoreSummary
}
type Abandonment = { end_reason: string; abandoned_local: string; minutes_after_threshold: number; distance_outside_m: number }
type StationRow = { station_id: string; name: string; median_bikes: number; empty_service_hours: number; empty_spells: number
  refilled_by_bird: number; refilled_by_rider: number; relocations_in: number; relocations_out: number
  service_hours: number; abandonments_near: number; bird_collected_near: number; median_response_near_min: number | null
  part_availability: number | null; part_refill: number | null; part_collection: number | null
  score: number | null; parts_used: number; band: 'good' | 'fair' | 'poor' | null }
type ScoreSummary = { stations: number; scored: number; median: number | null; bands: Record<string, number>
  histogram: { from: number; to: number; stations: number }[]
  best: (Pick<StationRow, 'station_id' | 'name' | 'score' | 'band' | 'parts_used' | 'part_availability' | 'part_refill' | 'part_collection'>)[]
  worst: (Pick<StationRow, 'station_id' | 'name' | 'score' | 'band' | 'parts_used' | 'part_availability' | 'part_refill' | 'part_collection'>)[] }
type MapData = { abandonments: FC<Abandonment>; stations: FC<StationRow> }

/** Categorical outcome colours in the palette's fixed slot order (blue, orange, aqua, yellow). */
const OUTCOME_COLOR: Record<string, string> = { provider_recovery: '#2a78d6', new_trip: '#eb6834', other: '#1baf7a', censored: '#eda100' }
/** Live abandonments: red with a dark ring, distinct from the historical outcome points. */
const LIVE_COLOR = '#d7263d'
const outcomeKey = (r: string) => r === 'moved' || r === 'left_area' ? 'other' : r
const pct = (a: number, b: number) => b ? `${fmtN(100 * a / b, 1)}%` : '—'
const hours = (min: number) => `${fmtN(min / 60, 1)} h`

/** Daily columns, one bar per series per day, with a hover tooltip. One axis, shared unit. */
function DayChart({ days, series, unit, height = 170 }: { days: string[]; series: { name: string; color: string; values: (number | null)[] }[]; unit: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 560, H = height, L = 36, R = 8, T = 10, B = 24
  const max = Math.max(1, ...series.flatMap(s => s.values.map(v => v ?? 0)))
  const slot = (W - L - R) / days.length, bar = Math.max(2, (slot - 3) / series.length)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  return <div style={{ position: 'relative' }}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}
      onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.floor((((e.clientX - r.left) / r.width) * W - L) / slot); setHover(i >= 0 && i < days.length ? i : null) }}>
      {[0, max / 2, max].map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={C.grid} />
        <text x={L - 5} y={y(t) + 4} fontSize={10.5} textAnchor="end" fill={C.muted}>{fmtN(t, t < 10 && t > 0 ? 1 : 0)}</text></g>)}
      {hover != null && <rect x={L + hover * slot} y={T} width={slot} height={H - T - B} fill={C.neutral} />}
      {days.map((d, i) => series.map((s, k) => { const v = s.values[i]; if (v == null) return null
        const h = Math.max(0, H - B - y(v))
        return <rect key={`${d}-${k}`} x={L + i * slot + 1.5 + k * bar} y={y(v)} width={Math.max(1, bar - 1)} height={h} rx={Math.min(2, bar / 2)} fill={s.color} />
      }))}
      {days.map((d, i) => i % 3 === 0 && <text key={d} x={L + i * slot + slot / 2} y={H - 7} fontSize={10.5} textAnchor="middle" fill={C.muted}>{d.slice(8, 10)}/{d.slice(5, 7)}</text>)}
    </svg>
    {hover != null && <div style={{ position: 'absolute', top: 0, left: `${((L + hover * slot + slot / 2) / W) * 100}%`, transform: 'translateX(-50%)', background: '#fff',
      border: `1px solid ${C.line}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,.08)' }}>
      <b>{days[hover]}</b>{series.map(s => <div key={s.name}><span style={{ color: s.color }}>●</span> {s.name}: {fmtN(s.values[hover], 1)} {unit}</div>)}</div>}
    {series.length > 1 && <Legend items={series.map(s => ({ color: s.color, label: s.name }))} />}
  </div>
}

/** Bikes abandoned now under the active rule: outside, freshly reported, > 120 counted minutes. */
function LiveNow({ abandoned, cases }: { abandoned: Bike[] | null; cases: Case[] }) {
  const dt = useDT()
  if (!abandoned) return null
  const rules = useRules()
  return <Section title={dt.bird.now}><div style={{ fontSize: 14 }}>{dt.bird.nowRow(abandoned.length, openCases(cases, rules.abandon_minutes, false, rules).length)}</div></Section>
}

/** Current GBFS bikes and open cases; `abandoned` applies the active rule (outside, fresh report, > limit counted minutes). */
function useLiveAbandoned(rules: Rules) {
  const [bikes, setBikes] = useState<Bike[] | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  useEffect(() => {
    fetch('/api/live/bikes').then(r => r.json()).then(v => setBikes(v.bikes ?? [])).catch(() => setBikes(null))
    api.cases().then(setCases).catch(() => {})
  }, [])
  const abandoned = useMemo(() => bikes && unmovedBikes(bikes, rules.abandon_minutes, rules), [bikes, rules])
  return { abandoned, cases }
}

export function BirdTab({ open }: { open: OpenOnMap }) {
  const dt = useDT(), t = dt.bird
  const analysis = useAnalysisRules(), ops = useRules()
  const { data: d, err } = useData<Summary>('bird')
  const { data: m } = useData<MapData>('bird/map')
  const live = useLiveAbandoned(ops)
  const [layers, setLayers] = useState({ hotspots: true, abandonments: false, live: false })
  // Station views live under "Desempenho por estação": the score, or empty service hours.
  const [stationLayer, setStationLayer] = useState<'score' | 'empty'>('score')
  const [view, setView] = useState<'abandon' | 'score'>('abandon')
  const [sortBy, setSortBy] = useState<'empty' | 'score'>('empty')
  const stations = useMemo(() => [...(m?.stations.features ?? [])].map(f => f.properties).sort((a, b) =>
    sortBy === 'score' ? (a.score ?? 101) - (b.score ?? 101) : b.empty_service_hours - a.empty_service_hours), [m, sortBy])
  const heat = useMemo(() => (m?.abandonments.features ?? []).map(f => { const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates; return [lat, lon] as [number, number] }), [m])
  if (!d) return <Loading err={err} />
  const a = d.abandonment, b = d.balancing, st = d.stock
  const notBird = a.abandonments - a.bird_recovered
  const spell = (k: string) => d.empty_spells.find(s => s.refilled_by === k)
  const fast = d.response_bands[0]?.bikes ?? 0
  const outcomes = [
    { key: 'provider_recovery', n: a.bird_recovered }, { key: 'new_trip', n: a.rider_took },
    { key: 'other', n: a.moved + a.left_area }, { key: 'censored', n: a.still_open }]
  const days = d.daily.map(r => r.day)
  const maxEmpty = Math.max(1, ...stations.map(s => s.empty_service_hours))
  const toggle = (k: keyof typeof layers) => setLayers(l => ({ ...l, [k]: !l[k] }))
  const solid = stations.filter(s => s.parts_used >= 2)
  const solidGood = solid.filter(s => s.band === 'good').length
  return <div style={{ display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <div><h2 style={{ margin: 0, fontSize: 19 }}>{t.title}</h2><p style={{ margin: '4px 0 0', fontSize: 13, color: C.text2, maxWidth: 900 }}>{t.intro(windowLabel(analysis))}</p>
        {analysis.enforce_window !== ops.enforce_window && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9c3e15' }}>{dt.catalogue.mismatch(windowLabel(analysis), windowLabel(ops))}</p>}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href="/analytics/bird/abandonments.csv" download style={{ ...pill(false), textDecoration: 'none' }}>{t.csvAbandon}</a>
        <a href="/analytics/bird/stations.csv" download style={{ ...pill(false), textDecoration: 'none' }}>{t.csvStations}</a>
        <MapLink open={open} query={{ metric: 'supported_120', layers: 'grid,stations' }} />
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
      <Stat label={t.kpi.abandoned} value={fmtN(a.abandonments)} sub={t.kpi.abandonedSub(fmtN(a.abandonments / d.days, 1), windowLabel(analysis))} />
      <Stat label={t.kpi.missed} value={`${fmtN(notBird)} · ${pct(notBird, a.abandonments)}`} sub={t.kpi.missedSub(fmtN(a.rider_took), fmtN(a.still_open), fmtN(a.moved + a.left_area))} />
      <Stat label={t.kpi.response} value={hours(a.median_response_min)} sub={t.kpi.responseSub(hours(a.p90_response_min), fmtN(fast))} />
      <Stat label={t.kpi.prevented} value={pct(d.prevented.bird_before_threshold, d.prevented.bird_before_threshold + a.abandonments)}
        sub={t.kpi.preventedSub(fmtN(d.prevented.bird_before_threshold), fmtN(a.abandonments))} />
      <Stat label={t.kpi.created} value={fmtN(a.bird_dropped_outside)} sub={t.kpi.createdSub(fmtN(d.prevented.bird_dropoffs_outside))} />
      <Stat label={t.kpi.balance} value={pct(b.into_below_typical, b.into_stations)} sub={t.kpi.balanceSub(fmtN(b.into_empty), pct(b.out_of_above_typical, b.out_of_stations))} />
      <Stat label={t.kpi.empty} value={pct(st.empty_service_hours, st.service_hours)} sub={t.kpi.emptySub(fmtN(st.stations_ever_empty), fmtN(st.stations))} />
      <Stat label={t.kpi.refill} value={pct(spell('bird')?.spells ?? 0, d.empty_spells.reduce((s, r) => s + (r.refilled_by === 'none' ? 0 : r.spells), 0))}
        sub={t.kpi.refillSub(fmtN(spell('bird')?.spells), fmtN(spell('rider')?.spells), fmtN(spell('bird')?.median_hours, 1), fmtN(spell('rider')?.median_hours, 1))} />
      <Stat label={t.scoreKpi} value={pct(solidGood, solid.length)} sub={t.scoreKpiSub(solidGood, solid.length, fmtN(d.station_score.median, 1))} />
    </div>
    <LiveNow abandoned={live.abandoned} cases={live.cases} />

    <div className="ins-grid2">
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="decision-tabs" role="tablist" style={{ display: 'flex', gap: 6 }}>
          {(['abandon', 'score'] as const).map(v => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            style={{ ...pill(view === v), borderRadius: 8, padding: '7px 14px', fontSize: 14 }}>{t.views[v]}</button>)}
        </div>
        {view === 'abandon' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(layers) as (keyof typeof layers)[]).map(k => { const off = k === 'live' && !live.abandoned
            return <button key={k} onClick={() => toggle(k)} style={{ ...pill(layers[k] && !off), opacity: off ? .5 : 1 }} aria-pressed={layers[k]} disabled={off}
              title={off ? t.liveUnavailable : undefined}>{k === 'live' && live.abandoned ? `${t.layers.live} (${fmtN(live.abandoned.length)})` : t.layers[k]}</button> })}
        </div>}
        {view === 'score' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['score', 'empty'] as const).map(k => <button key={k} onClick={() => setStationLayer(k)} style={pill(stationLayer === k)} aria-pressed={stationLayer === k}>
            {k === 'score' ? t.scoreLayer : t.layers.stations}</button>)}
        </div>}
        {view === 'score' && <p style={{ margin: 0, fontSize: 13, color: C.text2 }}>{stationLayer === 'score' ? t.scoreIntro : t.emptyIntro}</p>}
        <Map height={560}>
          {view === 'abandon' && layers.hotspots && heat.length > 0 && <HeatLayer points={heat} />}
          {view === 'score' && stationLayer === 'empty' && m && m.stations.features.map(f => { const p = f.properties, [lon, lat] = (f.geometry as GeoJSON.Point).coordinates
            return <CircleMarker key={p.station_id} center={[lat, lon]} radius={3 + 11 * Math.sqrt(p.empty_service_hours / maxEmpty)}
              pathOptions={{ color: '#fff', weight: 1, fillColor: p.empty_service_hours ? '#5f4fb8' : '#9aa0a6', fillOpacity: .8 }}>
              <Tooltip><span dangerouslySetInnerHTML={{ __html: t.tipStation(escapeHtml(p.name.split(',')[0]), fmtN(p.empty_service_hours), fmtN(p.median_bikes),
                fmtN(p.refilled_by_bird), fmtN(p.refilled_by_rider), fmtN(p.relocations_in), fmtN(p.relocations_out)) }} /></Tooltip></CircleMarker> })}
          {view === 'abandon' && m && layers.abandonments && m.abandonments.features.map((f, i) => { const p = f.properties, [lon, lat] = (f.geometry as GeoJSON.Point).coordinates
            const key = outcomeKey(p.end_reason)
            return <CircleMarker key={i} center={[lat, lon]} radius={4} pathOptions={{ color: '#fff', weight: 1, fillColor: OUTCOME_COLOR[key], fillOpacity: .9 }}>
              <Tooltip>{t.tipAbandon(t.outcome[key], p.abandoned_local.slice(0, 16).replace('T', ' '), hours(p.minutes_after_threshold), fmtN(p.distance_outside_m))}</Tooltip></CircleMarker> })}
          {view === 'abandon' && layers.live && live.abandoned?.map(b =>
            <CircleMarker key={b.id} center={[b.lat, b.lng]} radius={6} pathOptions={{ color: '#3b0a10', weight: 2, fillColor: LIVE_COLOR, fillOpacity: .95 }}>
              <Tooltip>{t.tipLive(hours(countedMinutes(Date.parse(b.rest_since!), Date.now(), ops)), fmtN(b.distance_outside_m))}</Tooltip></CircleMarker>)}
          {view === 'score' && stationLayer === 'score' && m && m.stations.features.map(f => { const p = f.properties, [lon, lat] = (f.geometry as GeoJSON.Point).coordinates
            const thin = p.parts_used < 2
            return <CircleMarker key={`score-${p.station_id}`} center={[lat, lon]} radius={4 + 2.5 * p.parts_used}
              eventHandlers={{ click: () => open({ station: p.station_id, view: 'live' }) }}
              pathOptions={{ color: thin ? '#6b6b68' : '#1f1f1d', weight: thin ? 1.2 : 1.4, dashArray: thin ? '3 3' : undefined,
                fillColor: scoreBandColor(p.band), fillOpacity: thin ? .18 : .92 }}>
              <Tooltip><span dangerouslySetInnerHTML={{ __html: t.tipScore(escapeHtml(p.name.split(',')[0]), fmtN(p.score, 0), p.band ? t.band[p.band] : '—', p.parts_used)
                + (['availability', 'refill', 'collection'] as const).map(k => { const v = p[`part_${k}`]
                  const detail = k === 'refill' ? ` (${p.refilled_by_bird}/${p.refilled_by_bird + p.refilled_by_rider})` : k === 'collection' ? ` (${p.bird_collected_near}/${p.abandonments_near})` : ''
                  return `<br/>${t.part[k]}: ${v == null ? t.partMissing : `${fmtN(v * 100, 0)}%${detail}`}` }).join('')
                + (thin ? `<br/><i>${t.insufficient}</i>` : '') }} /></Tooltip></CircleMarker> })}
        </Map>
        {view === 'score' && stationLayer === 'score' && <ScoreLegend />}
        {view === 'score' && stationLayer === 'empty' && <Legend items={[{ color: '#5f4fb8', label: t.emptyLegend }, { color: '#9aa0a6', label: t.neverEmpty }]} />}
        {view === 'abandon' && layers.hotspots && <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.text2 }}>
          <span style={{ width: 120, height: 10, borderRadius: 5, background: `linear-gradient(90deg, ${Object.values(HEAT_GRADIENT).join(', ')})` }} aria-hidden="true" />
          {t.heatLegend(fmtN(heat.length))}</div>}
        {view === 'abandon' && <Legend items={[
          ...(layers.live && live.abandoned ? [{ color: LIVE_COLOR, label: t.layers.live }] : []),
          ...(layers.abandonments ? Object.entries(OUTCOME_COLOR).map(([k, color]) => ({ color, label: t.outcome[k] })) : [])]} />}
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <Section title={t.responseTitle}>
          <Bars rows={d.response_bands.map(r => ({ label: r.band, value: r.bikes }))} unit="" />
        </Section>
        <Section title={t.outcomeTitle}>
          <Bars rows={outcomes.map(o => ({ label: t.outcome[o.key], value: o.n, note: pct(o.n, a.abandonments) }))} />
        </Section>
        <Section title={t.opsTitle}>
          <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr>{Object.values(t.opsCols).map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '5px 6px', borderBottom: `1px solid ${C.line}`, color: C.text2, fontWeight: 600 }}>{h}</th>)}</tr></thead>
            <tbody>{d.operations.map(o => <tr key={o.kind} style={{ borderBottom: `1px solid ${C.grid}` }}>
              <td style={{ padding: '5px 6px' }}>{t.kind[o.kind] ?? o.kind}</td>
              {[fmtN(o.legs), o.median_min >= 120 ? hours(o.median_min) : `${fmtN(o.median_min)} min`, `${fmtN(o.median_m)} m`, fmtN(o.from_outside), fmtN(o.to_outside), fmtN(o.charged)]
                .map((v, i) => <td key={i} style={{ padding: '5px 6px', textAlign: 'right' }}>{v}</td>)}</tr>)}</tbody>
          </table></div>
        </Section>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
      <Section title={t.dailyAbandon}><DayChart days={days} unit="" series={[
        { name: t.dailyAbandon, color: C.s1, values: d.daily.map(r => r.abandonments) },
        { name: t.dailyNotBird, color: C.s2, values: d.daily.map(r => r.not_recovered_by_bird) }]} /></Section>
      <Section title={t.dailyOps}><DayChart days={days} unit="" series={[
        { name: t.pickups, color: C.s1, values: d.daily.map(r => r.pickups) },
        { name: t.relocations, color: C.s2, values: d.daily.map(r => r.relocations) }]} /></Section>
      <Section title={t.dailyEmpty}><DayChart days={days} unit={`% ${t.emptyPct}`} series={[
        { name: t.emptyPct, color: '#5f4fb8', values: d.daily.map(r => r.pct_empty_service_hours) }]} /></Section>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
      <Section title={t.hourlyOps}><HourChart height={170} unit={t.perDay} series={[
        { name: t.pickups, color: C.s1, values: d.hourly.map(h => h.pickups / d.days) },
        { name: t.relocations, color: C.s2, values: d.hourly.map(h => h.relocations / d.days) }]} /></Section>
      <Section title={t.hourlyAbandon}><HourChart height={170} unit={t.perDay} series={[
        { name: t.kpi.abandoned, color: C.s1, values: d.hourly.map(h => h.abandonments / d.days) }]} /></Section>
    </div>

    <Section title={t.scoreTitle} aside={<span style={{ fontSize: 12, color: C.text2 }}>{t.scoreCaveat}</span>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div><div style={{ fontSize: 13, color: C.text2, marginBottom: 6 }}>{t.histTitle}</div>
          <ScoreHistogram bins={d.station_score.histogram} unit={t.histUnit} /></div>
        <ScoreTable title={t.best} rows={d.station_score.best} onOpen={id => open({ station: id, view: 'live' })} />
        <ScoreTable title={t.worst} rows={d.station_score.worst} onOpen={id => open({ station: id, view: 'live' })} />
      </div>
    </Section>

    <Section title={sortBy === 'score' ? t.worst : t.stationsTitle} aside={<span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: C.text2 }}>
      {t.sortBy} {(['empty', 'score'] as const).map(k => <button key={k} onClick={() => setSortBy(k)} style={{ ...pill(sortBy === k), padding: '3px 10px', fontSize: 12.5 }}>
        {k === 'empty' ? t.sortEmpty : t.sortScore}</button>)}</span>}>
      <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr>{[...Object.values(t.stationCols), t.scoreCols.score].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, color: C.text2, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
        <tbody>{stations.slice(0, 15).map(s => <tr key={s.station_id} style={{ borderBottom: `1px solid ${C.grid}`, cursor: 'pointer' }} onClick={() => open({ station: s.station_id, view: 'live' })}>
          <td style={{ padding: '5px 8px' }}>{s.name.split(',')[0]}</td>
          {[fmtN(s.median_bikes, 1), fmtN(s.empty_service_hours), fmtN(s.empty_spells), fmtN(s.refilled_by_bird), fmtN(s.refilled_by_rider), fmtN(s.relocations_in), fmtN(s.relocations_out)]
            .map((v, i) => <td key={i} style={{ padding: '5px 8px', textAlign: 'right' }}>{v}</td>)}
          <td style={{ padding: '5px 8px', textAlign: 'right' }}><ScoreChip score={s.score} band={s.band} thin={s.parts_used < 2} /></td></tr>)}</tbody>
      </table></div>
    </Section>

    <Section title={dt.catalogue.definitions}>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>{t.caveats.map(c => <li key={c}>{c}</li>)}</ul>
      <MetaNote meta={d.meta} />
    </Section>
  </div>
}

/** Band chip: colour swatch + number + band name, so the score never relies on colour alone. */
function ScoreChip({ score, band, thin }: { score: number | null; band: string | null; thin?: boolean }) {
  const t = useDT().bird
  if (score == null || !band) return <span style={{ color: C.muted }}>—</span>
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }} title={thin ? t.insufficient : undefined}>
    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: thin ? 'transparent' : scoreBandColor(band),
      border: `1.5px ${thin ? 'dashed' : 'solid'} ${thin ? C.muted : '#1f1f1d'}` }} />
    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtN(score, 0)}</b><span style={{ color: C.text2 }}>{t.band[band]}{thin ? ' *' : ''}</span></span>
}

function ScoreLegend() {
  const t = useDT().bird
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12.5, color: C.text2, alignItems: 'center' }}>
    {(['poor', 'fair', 'good'] as const).map(b => <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 13, height: 13, borderRadius: 7, background: SCORE_COLOR[b], border: '1.4px solid #1f1f1d' }} />
      <b style={{ color: C.text }}>{t.band[b]}</b> {t.bandRange[b]}</span>)}
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 13, height: 13, borderRadius: 7, border: `1.4px dashed ${C.muted}` }} />{t.insufficient}</span>
    <span>· {t.sizeHint}</span>
  </div>
}

/** 10-point bins coloured by the band they fall in; every bar has its count and a hover tooltip. */
function ScoreHistogram({ bins, unit }: { bins: { from: number; to: number; stations: number }[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 420, H = 190, L = 28, R = 6, T = 16, B = 26
  const max = Math.max(1, ...bins.map(b => b.stations))
  const slot = (W - L - R) / bins.length
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const bandOf = (from: number) => from >= 70 ? 'good' : from >= 40 ? 'fair' : 'poor'
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
    {[0, max].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={C.grid} />
      <text x={L - 5} y={y(v) + 4} fontSize={10.5} textAnchor="end" fill={C.muted}>{v}</text></g>)}
    {[40, 70].map(v => <line key={v} x1={L + (v / 10) * slot} x2={L + (v / 10) * slot} y1={T - 6} y2={H - B} stroke={C.text2} strokeDasharray="3 3" />)}
    {bins.map((b, i) => { const h = Math.max(0, H - B - y(b.stations))
      return <g key={b.from} onMouseEnter={() => setHover(i)}>
        <rect x={L + i * slot} y={T - 6} width={slot} height={H - B - T + 6} fill={hover === i ? C.neutral : 'transparent'} />
        {b.stations > 0 && <rect x={L + i * slot + 2} y={y(b.stations)} width={slot - 4} height={h} rx={3} fill={SCORE_COLOR[bandOf(b.from)]} />}
        {b.stations > 0 && <text x={L + i * slot + slot / 2} y={y(b.stations) - 4} fontSize={10.5} textAnchor="middle" fill={C.text2}>{b.stations}</text>}
        <text x={L + i * slot + slot / 2} y={H - 9} fontSize={10} textAnchor="middle" fill={C.muted}>{b.from}</text>
        <title>{`${b.from}–${b.to}: ${b.stations} ${unit}`}</title></g> })}
  </svg>
}

function ScoreTable({ title, rows, onOpen }: { title: string; rows: ScoreSummary['best']; onOpen: (id: string) => void }) {
  const t = useDT().bird
  const pc = (v: number | null) => v == null ? '—' : `${fmtN(v * 100, 0)}%`
  return <div><div style={{ fontSize: 13, color: C.text2, marginBottom: 6 }}>{title}</div>
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
      <thead><tr>{[t.scoreCols.name, t.scoreCols.score, t.scoreCols.avail, t.scoreCols.refill, t.scoreCols.collect].map((h, i) =>
        <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '4px 5px', borderBottom: `1px solid ${C.line}`, color: C.text2, fontWeight: 600 }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.station_id} onClick={() => onOpen(r.station_id)} style={{ cursor: 'pointer', borderBottom: `1px solid ${C.grid}` }}>
        <td style={{ padding: '4px 5px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name.split(',')[0]}</td>
        <td style={{ padding: '4px 5px', textAlign: 'right' }}><ScoreChip score={r.score} band={r.band} /></td>
        <td style={{ padding: '4px 5px', textAlign: 'right' }}>{pc(r.part_availability)}</td>
        <td style={{ padding: '4px 5px', textAlign: 'right' }}>{pc(r.part_refill)}</td>
        <td style={{ padding: '4px 5px', textAlign: 'right' }}>{pc(r.part_collection)}</td></tr>)}</tbody>
    </table></div>
}
