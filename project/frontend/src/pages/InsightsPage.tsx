import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import {
  getJson, type Candidate, type Candidates, type HourRow, type Inventory, type Journeys, type Overview,
  type Recovery, type FC, type StationP, type Transit, type Weather,
} from '../components/insights/data'
import {
  BLUE, Bars, C, DIVERGING, HourChart, Legend, MetaNote, RampLegend, Section, Stat, Table, card, divColor, fmtN, seqColor,
} from '../components/insights/viz'

const TABS = ['Overview', 'Recovery', 'Station candidates', 'Station flows', 'Transit', 'Journeys', 'Weather', 'Data'] as const
type Tab = typeof TABS[number]
const CASCAIS: [number, number] = [38.715, -9.40]

function useData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    getJson<T>(path).then((d) => alive && setData(d)).catch((e) => alive && setErr(String(e)))
    return () => { alive = false }
  }, [path])
  return { data, err }
}

function Map({ children, height = 520, zoom = 13, center = CASCAIS }: { children: ReactNode; height?: number; zoom?: number; center?: [number, number] }) {
  return (
    <div style={{ height, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.line}` }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} preferCanvas>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="tiles-muted"
          attribution="© OpenStreetMap contributors" />
        {children}
      </MapContainer>
    </div>
  )
}

function Loading({ err }: { err?: string | null }) {
  return <div style={{ ...card, color: err ? '#c0302f' : C.text2 }}>{err ?? 'Loading…'}</div>
}

const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }

/* ------------------------------------------------------------------ Overview */
function OverviewTab() {
  const { data: o, err } = useData<Overview>('overview')
  if (!o) return <Loading err={err} />
  const h = (m: number) => `${fmtN(m / 60, 1)} h`
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Stat label="Provider pickups the detector would have flagged first" value={`${fmtN(o.b5.pct_flagged, 1)}%`}
          sub={<>{fmtN(o.b5.flagged_before_recovery)} of {fmtN(o.b5.provider_recoveries_outside)} bikes collected from outside a station had been parked there &gt;120 min</>} />
        <Stat label="How much earlier (median)" value={h(o.b5.median_lead_minutes)}
          sub={<>between our flag and the provider's pickup · p90 {h(o.b5.p90_lead_minutes)}</>} />
        <Stat label="Bikes parked >120 min outside stations" value={fmtN(o.bike.supported_120)}
          sub={<>{fmtN(o.b5.supported_ended_by_new_trip)} later taken by a rider, {fmtN(o.b5.supported_ended_by_provider)} by the provider, {fmtN(o.b5.supported_still_open_at_data_end)} still open</>} />
        <Stat label="Trip ends inside the permitted parking zone" value={`${fmtN(o.bike.pct_ends_in_parking_zone, 1)}%`}
          sub={<>station area + 30 m · only {fmtN(o.bike.pct_ends_in_station_area, 1)}% inside the painted area itself</>} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Stat label="Transit cards travelling to/from Cascais" value={fmtN(o.journeys.cards)}
          sub={<>{fmtN(o.journeys.journeys)} journeys in the week 31 Aug–6 Sep 2026</>} />
        <Stat label="Journeys with a transfer" value={`${fmtN(o.journeys.pct_with_transfer, 1)}%`}
          sub={<>{fmtN(o.journeys.avg_boardings_per_journey, 2)} boardings per journey on average</>} />
        <Stat label="Valid bike trips analysed" value={fmtN(o.bike.valid_trips)} sub={<>of {fmtN(o.bike.trips)} supplied · {o.bike.stations} stations</>} />
        <Stat label="Station candidate areas scored" value={fmtN(o.candidates.scored)} sub={<>of {fmtN(o.candidates.screened)} uncovered 250 m cells with activity</>} />
      </div>
      <Section title="How to read this page">
        <div style={{ fontSize: 14, lineHeight: 1.6, color: C.text }}>
          Every layer says whether it is <b>observed</b>, an <b>inferred proxy</b> or a <b>screening score</b>. Nothing here is a
          municipality-approved recommendation. The candidate weights are provisional, and the Cascais Próxima operations lead approves them.
          Bike data covers 18 Aug–8 Sep 2026. Transit data covers the week 31 Aug–6 Sep 2026, using the timetables in force that week.
        </div>
      </Section>
    </div>
  )
}

/* ------------------------------------------------------------------ Recovery */
function RecoveryTab() {
  const { data: d, err } = useData<Recovery>('recovery')
  const [metric, setMetric] = useState<'supported_120' | 'outside_per_100_trip_ends'>('supported_120')
  if (!d) return <Loading err={err} />
  const max = Math.max(...d.cells.features.map((f) => (f.properties[metric] as number | null) ?? 0))
  const reasons: Record<string, string> = { new_trip: 'Taken by a rider', provider_recovery: 'Collected by provider', moved: 'Moved (>10 m)',
    left_area: 'Left operating area', censored: 'Still parked at data end', restarted: 'New rest event' }
  return (
    <div style={grid2}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['supported_120', 'Bikes parked >120 min'], ['outside_per_100_trip_ends', 'Outside parkings per 100 trip ends']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMetric(k)} style={pill(metric === k)}>{l}</button>
          ))}
        </div>
        <Map>
          <GeoJSON key={metric} data={d.cells as unknown as GeoJSON.GeoJsonObject}
            style={(f) => {
              const p = f!.properties
              const v = p[metric] as number | null
              return { color: '#fff', weight: 1, fillOpacity: !v ? 0.12 : p.insufficient ? 0.45 : 0.85,
                fillColor: !v ? '#9aa0a6' : seqColor(v, max) }
            }}
            onEachFeature={(f, layer) => {
              const p = f.properties
              layer.bindTooltip(`<b>${fmtN(p.supported_120)}</b> parked &gt;120 min · ${fmtN(p.outside_intervals)} outside parkings<br/>
                ${fmtN(p.trip_ends)} trip ends · ${p.outside_per_100_trip_ends ?? '—'} per 100 ends<br/>
                median parked ${p.median_hours_parked ?? '—'} h · provider pickups ${p.provider_recoveries}
                ${p.insufficient ? '<br/><i>insufficient observations (&lt;5)</i>' : ''}`)
            }} />
        </Map>
        <RampLegend colors={BLUE} low="0" high={fmtN(max, 0)} title={`${metric === 'supported_120' ? 'Bikes parked >120 min outside a station' : 'Outside-station parkings per 100 trip ends'} (250 m cells; pale = fewer than 5 outside parkings, grey = none)`} />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <Section title="Would the detector have got there first?">
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            The provider collected <b>{fmtN(d.b5.provider_recoveries_outside)}</b> bikes from outside a station.
            <b> {fmtN(d.b5.flagged_before_recovery)} ({fmtN(d.b5.pct_flagged, 1)}%)</b> had been there more than 120 minutes,
            so the detector would have flagged them a median of <b>{fmtN(d.b5.median_lead_minutes / 60, 1)} h</b> before pickup.
          </div>
        </Section>
        <Section title="How outside-station parkings ended">
          <Bars rows={d.by_end_reason.map((r) => ({ label: reasons[r.end_reason] ?? r.end_reason, value: r.n, note: `${r.over_120} lasted >120 min` }))} />
        </Section>
        <MetaNote meta={d.meta} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Candidates */
function CandidatesTab() {
  const { data: d, err } = useData<Candidates>('candidates')
  const [sel, setSel] = useState<Candidate | null>(null)
  const scored = useMemo(() => d?.cells.features.filter((f) => f.properties.score != null).map((f) => f.properties) ?? [], [d])
  useEffect(() => { if (scored.length && !sel) setSel(scored[0]) }, [scored, sel])
  if (!d) return <Loading err={err} />
  return (
    <div style={grid2}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Map>
          <GeoJSON data={d.cells as unknown as GeoJSON.GeoJsonObject}
            style={(f) => {
              const p = f!.properties as Candidate
              const on = sel?.cell_id === p.cell_id
              return { color: on ? '#0b0b0b' : '#fff', weight: on ? 3 : 1, fillOpacity: p.score == null ? 0.18 : 0.85,
                fillColor: p.score == null ? '#9aa0a6' : seqColor(p.score, 1) }
            }}
            onEachFeature={(f, layer) => {
              const p = f.properties as Candidate
              layer.on('click', () => setSel(p))
              layer.bindTooltip(p.score == null ? `insufficient observations (${p.outside_intervals} outside parkings)`
                : `#${p.rank} · score ${p.score}`)
            }} />
        </Map>
        <RampLegend colors={BLUE} low="0" high="1" title="Candidate score (grey = fewer than 5 outside parkings, not scored)" />
        <Section title="Top candidate areas">
          <Table rows={scored.slice(0, 15)} cols={[
            { key: 'rank', label: '#', num: true },
            { key: 'score', label: 'Score', num: true, fmt: (v) => fmtN(v as number, 3) },
            { key: 'trip_endpoints', label: 'Trip ends+starts', num: true, fmt: (v) => fmtN(v as number) },
            { key: 'supported_120', label: 'Parked >120 min', num: true, fmt: (v) => fmtN(v as number) },
            { key: 'departures_per_hour_333m', label: 'Bus/rail dep./h ≤333 m', num: true },
            { key: 'nearest_station_m', label: 'Nearest station (m)', num: true, fmt: (v) => fmtN(v as number) },
          ]} />
        </Section>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {sel && <CandidateDetail c={sel} weights={d.weights} />}
        <MetaNote meta={d.meta} />
      </div>
    </div>
  )
}

function CandidateDetail({ c, weights }: { c: Candidate; weights: Candidates['weights'] }) {
  const comps = [
    { label: 'Observed demand (35%)', value: c.demand_n, raw: `${fmtN(c.trip_endpoints)} trip starts+ends` },
    { label: 'Outside parking (25%)', value: c.parking_n, raw: `${fmtN(c.supported_120)} parked >120 min` },
    { label: 'Transport gap (10%)', value: c.transport_gap_n, raw: `${fmtN(c.departures_per_hour_333m, 1)} dep./h within 333 m (estimate)` },
    { label: 'Bus delay (5%)', value: c.bus_delay_n, raw: 'missing: neutral 0.5' },
  ]
  const sens = [['without demand', c.score_without_demand], ['without parking', c.score_without_parking],
    ['without transport gap', c.score_without_transport_gap], ['without bus delay', c.score_without_bus_delay]] as const
  return (
    <Section title={c.rank ? `Candidate #${c.rank} · score ${fmtN(c.score, 3)}` : 'Not scored'}
      aside={<span style={{ fontSize: 12, color: C.text2 }}>{c.lat.toFixed(4)}, {c.lon.toFixed(4)}</span>}>
      <div style={{ fontSize: 13, color: C.text2 }}>Component values are percentile ranks among candidate cells (0–1).</div>
      <Bars rows={comps.map((x) => ({ label: x.label, value: x.value, note: x.raw }))} max={1} />
      <Table rows={comps} cols={[{ key: 'label', label: 'Component' }, { key: 'raw', label: 'Underlying value' }]} />
      <div style={{ fontSize: 13 }}>
        <b>Sensitivity:</b> {sens.map(([l, v]) => `${l} ${fmtN(v as number | null, 3)}`).join(' · ')}
      </div>
      <div style={{ fontSize: 12.5, color: C.text2 }}>
        Not available (excluded, not zero): {weights.filter((w) => w.status === 'unavailable').map((w) => `${w.component} ${w.weight * 100}%`).join(', ')}.
        Score uses {fmtN(c.weight_available * 100)}% of the weight. Operators within 333 m: {c.operators_333m ?? 'none'}.
        Legal/safety feasibility is an unchecked gate.
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------ Station flows */
function StationsTab() {
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
    <div style={grid2}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Map>
          {st.map((f) => {
            const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates
            const p = f.properties
            return (
              <CircleMarker key={p.station_id} center={[lat, lon]} radius={4 + 10 * Math.sqrt(p.departures / maxDep)}
                pathOptions={{ color: sel?.station_id === p.station_id ? '#0b0b0b' : '#fff', weight: 2, fillColor: divColor(p.net_flow, maxAbs), fillOpacity: 0.95 }}
                eventHandlers={{ click: () => setSel(p) }}>
                <Tooltip>{p.name.split(',')[0]}<br />{fmtN(p.departures)} departures · {fmtN(p.arrivals)} arrivals · net {p.net_flow > 0 ? '+' : ''}{p.net_flow}</Tooltip>
              </CircleMarker>
            )
          })}
        </Map>
        <RampLegend colors={DIVERGING} low={`more departures (−${maxAbs})`} high={`more arrivals (+${maxAbs})`} title="Net trip flow per station, whole period (size = departures)" />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <Section title={sel ? sel.name.split(',')[0] : 'Pick a station on the map'}>
          {sel && hours ? (
            <>
              <div style={{ fontSize: 13, color: C.text2 }}>Average departures per day by hour (Europe/Lisbon)</div>
              <HourChart unit="departures/day" series={[
                { name: 'Weekday', color: C.s1, values: perDay(false, 'departures') },
                { name: 'Weekend', color: C.s2, values: perDay(true, 'departures') }]} />
              <div style={{ fontSize: 13, color: C.text2 }}>Average arrivals per day by hour</div>
              <HourChart unit="arrivals/day" series={[
                { name: 'Weekday', color: C.s1, values: perDay(false, 'arrivals') },
                { name: 'Weekend', color: C.s2, values: perDay(true, 'arrivals') }]} />
            </>
          ) : <div style={{ fontSize: 13, color: C.text2 }}>The hourly profile shows when a station empties or fills. Rebalancing is needed where net flow is strongly negative in the morning.</div>}
        </Section>
        <Section title="Busiest stations (departures)">
          <Bars rows={top.map((f) => ({ label: f.properties.name.split(',')[0], value: f.properties.departures }))} />
        </Section>
        <MetaNote meta={{ kind: 'observed trip flow', notes: ['A trip counts for a station only when it ends inside the station area.', 'Net flow = arrivals − departures. This is not stock: there is no inventory history.'] }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Transit */
function TransitTab() {
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
    <div style={grid2}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Map>
          {stops.map((f) => {
            const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates
            const p = f.properties
            return (
              <CircleMarker key={p.agency_id + p.stop_id} center={[lat, lon]} radius={2.5 + 12 * Math.sqrt(p.weekly_boardings / maxB)}
                pathOptions={{ color: '#fff', weight: 1, fillColor: seqColor(p.departures_per_hour, maxF), fillOpacity: 0.9 }}>
                <Tooltip>{p.stop_name} ({p.agency_name})<br />{fmtN(p.departures_per_hour, 1)} scheduled dep./h (07–20, weekday)<br />{fmtN(p.weekly_boardings)} boardings in the week</Tooltip>
              </CircleMarker>
            )
          })}
        </Map>
        <RampLegend colors={BLUE} low="0" high={`${fmtN(maxF, 0)} dep./h`} title="Scheduled weekday departures per hour (size = MobiCascais boardings)" />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <Section title="MobiCascais boardings by hour (average per day)">
          <HourChart unit="boardings" series={[{ name: 'Weekday', color: C.s1, values: hourly(false) }, { name: 'Weekend', color: C.s2, values: hourly(true) }]} />
        </Section>
        <Section title="Route departure delay, M01–M36 (median minutes late)">
          <Bars rows={delays.slice(0, 14).map((r) => ({ label: r.route, value: Number(r.median_delay_min), note: `p90 ${r.p90_delay_min} min · ${r.services} services` }))} unit=" min" />
          <div style={{ fontSize: 12.5, color: C.text2 }}>Top 12 routes by median delay</div>
          <Table rows={delays} max={12} cols={[
            { key: 'route', label: 'Route' }, { key: 'services', label: 'Services', num: true, fmt: (v) => fmtN(v as number) },
            { key: 'median_delay_min', label: 'Median late', num: true }, { key: 'p90_delay_min', label: 'p90 late', num: true },
            { key: 'median_early_min', label: 'Median early', num: true }]} />
        </Section>
        <MetaNote meta={d.meta} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Journeys */
function JourneysTab() {
  const { data: d, err } = useData<Journeys>('journeys')
  const [peak, setPeak] = useState<'journeys' | 'am_peak' | 'pm_peak'>('journeys')
  if (!d) return <Loading err={err} />
  const flows = d.flows.features.filter((f) => f.properties[peak] > 0).sort((a, b) => a.properties[peak] - b.properties[peak])
  const max = Math.max(1, ...flows.map((f) => f.properties[peak]))
  const s = d.summary
  const muni = d.municipalities.filter((m) => m.origin_municipality !== m.dest_municipality).slice(0, 10)
  return (
    <div style={grid2}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['journeys', 'All day'], ['am_peak', '07–10'], ['pm_peak', '16–19']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPeak(k)} style={pill(peak === k)}>{l}</button>
          ))}
        </div>
        <Map zoom={11} center={[38.73, -9.30]}>
          {flows.map((f, i) => {
            const coords = (f.geometry as GeoJSON.LineString).coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
            const v = f.properties[peak]
            return (
              <Polyline key={i} positions={coords}
                pathOptions={{ color: seqColor(Math.max(v, max * 0.3), max), weight: 1.5 + 8 * Math.sqrt(v / max), opacity: 0.35 + 0.6 * Math.sqrt(v / max) }}>
                <Tooltip sticky>{f.properties.origin_municipality} → {f.properties.dest_municipality}<br />{fmtN(v)} journeys · {fmtN(f.properties.cards)} cards · {fmtN(f.properties.with_transfer)} with transfer</Tooltip>
              </Polyline>
            )
          })}
        </Map>
        <RampLegend colors={BLUE} low="5+ cards" high={`${fmtN(max)} journeys`} title="Journeys between 1 km zones (origin → destination), top 300 flows" />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat label="Cards" value={fmtN(s.cards)} sub={`${fmtN(s.journeys)} journeys`} />
          <Stat label="With a transfer" value={`${fmtN(s.pct_with_transfer, 1)}%`} sub={`${fmtN(s.pct_mobicascais_with_other_operator, 1)}% combine MobiCascais with another operator`} />
        </div>
        <Section title="Between municipalities (journeys)">
          <Bars rows={muni.map((m) => ({ label: `${m.origin_municipality} → ${m.dest_municipality}`, value: m.journeys, note: `${m.cards} cards` }))} />
        </Section>
        <Section title="Most common transfers">
          <Table rows={d.transfers.slice(0, 12)} cols={[
            { key: 'from_operator', label: 'From', fmt: (v, r) => `${v ?? '?'} ${r.from_line}` },
            { key: 'to_operator', label: 'To', fmt: (v, r) => `${v ?? '?'} ${r.to_line}` },
            { key: 'transfers', label: 'Transfers', num: true, fmt: (v) => fmtN(v as number) },
            { key: 'median_gap_min', label: 'Median min. between boardings', num: true }]} />
        </Section>
        <MetaNote meta={d.meta} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Weather */
function WeatherTab() {
  const { data: d, err } = useData<Weather>('weather')
  if (!d) return <Loading err={err} />
  const groups = ['rain', 'temperature', 'wind']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      {groups.map((g) => (
        <Section key={g} title={`Trip starts per hour by ${g} (08–20 h)`}>
          <Bars rows={d.by_class.filter((r) => r.factor === g).map((r) => ({ label: `${r.level} (${r.hours} h)`, value: Number(r.avg_starts_per_hour) }))} />
        </Section>
      ))}
      <div style={{ gridColumn: '1 / -1' }}><MetaNote meta={d.meta} /></div>
    </div>
  )
}

/* ------------------------------------------------------------ Data */
function DataTab() {
  const { data: d, err } = useData<Inventory>('inventory')
  if (!d) return <Loading err={err} />
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Section title="Collected inputs (analytics database, filtered to Cascais)">
        <Table rows={d.steps} max={100} cols={[
          { key: 'target', label: 'Table' }, { key: 'rows_read', label: 'Rows read', num: true, fmt: (v) => fmtN(v as number | null) },
          { key: 'rows_kept', label: 'Rows kept', num: true, fmt: (v) => fmtN(v as number | null) }, { key: 'filter', label: 'Filter / note' }]} />
      </Section>
      <Section title="Can card validations be placed on the map? (stop geolocation via dated plans)">
        <Table rows={d.coverage} cols={[
          { key: 'agency_name', label: 'Operator', fmt: (v, r) => `${v ?? r.agency_id}` },
          { key: 'validations', label: 'Validations', num: true, fmt: (v) => fmtN(v as number) },
          { key: 'pct_geolocated', label: '% geolocated', num: true },
          { key: 'in_cascais', label: 'In Cascais', num: true, fmt: (v) => fmtN(v as number) }]} />
      </Section>
    </div>
  )
}

function pill(on: boolean): React.CSSProperties {
  return { border: `1px solid ${on ? C.s1 : C.line}`, background: on ? '#e8f1fc' : '#fff', color: on ? '#184f95' : C.text2,
    borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
}

export function InsightsPage() {
  const [tab, setTab] = useState<Tab>(() => (TABS.find((t) => t === decodeURIComponent(location.hash.slice(1))) ?? 'Overview'))
  useEffect(() => { history.replaceState(null, '', `#${encodeURIComponent(tab)}`) }, [tab])
  const body: Record<Tab, ReactNode> = {
    Overview: <OverviewTab />, Recovery: <RecoveryTab />, 'Station candidates': <CandidatesTab />, 'Station flows': <StationsTab />,
    Transit: <TransitTab />, Journeys: <JourneysTab />, Weather: <WeatherTab />, Data: <DataTab />,
  }
  return (
    <div style={{ minHeight: '100dvh', background: '#f6f6f4', fontFamily: 'system-ui, sans-serif', color: C.text }}>
      <header style={{ background: '#fff', borderBottom: `1px solid ${C.line}`, padding: '14px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Cascais micromobility insights</h1>
          <span style={{ fontSize: 13, color: C.text2 }}>Planning analysis · bike sample 18 Aug–8 Sep 2026 · transit week 31 Aug–6 Sep 2026</span>
        </div>
        <nav style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              border: 'none', background: 'none', padding: '8px 12px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
              color: t === tab ? C.text : C.text2, fontWeight: t === tab ? 650 : 500,
              borderBottom: `2px solid ${t === tab ? C.s1 : 'transparent'}` }}>{t}</button>
          ))}
        </nav>
      </header>
      <main style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>{body[tab]}</main>
      <style>{`.tiles-muted { filter: grayscale(1) brightness(1.06) contrast(0.85); }`}</style>
    </div>
  )
}

export { Legend }
