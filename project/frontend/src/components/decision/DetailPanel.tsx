import { useEffect, useState, type ReactNode } from 'react'
import { getJson, type HourRow, type Laya, type LayaRec } from '../insights/data'
import { Bars, C, HourChart } from '../insights/viz'
import type { DataStrings } from '../../i18n-data'
import { countedMinutes, useRules } from '../../enforcement'
import { BIKE_PERIOD, CARD_PERIOD, RULES } from './definitions'
import { ageMinutes, routeLabel, useFormat } from './format'
import type { Arrival, Balance, BalanceDay, Bike, Candidate, Cell, CellProfile, Departure, JourneyFlow, MapStop, Scheduled, StopProfile, Vehicle } from './types'

export function Card({ title, onClose, children }: { title: ReactNode; onClose?: () => void; children: ReactNode }) {
  const { dt } = useFormat()
  return <article className="decision-card">
    {onClose && <button className="decision-close" onClick={onClose} aria-label={dt.map.close}>×</button>}
    <b>{title}</b>{children}
  </article>
}

/** Averages hourly rows per observed day of each weekday/weekend class. */
function perDay<T extends { is_weekend: boolean; hour_local: number }>(rows: T[], value: (r: T) => number, days: (weekend: boolean) => number, weekend: boolean) {
  const out = Array<number | null>(24).fill(0)
  rows.filter(r => r.is_weekend === weekend).forEach(r => { out[r.hour_local] = value(r) / Math.max(1, days(weekend)) })
  return out
}

export function CellCard({ cell, areaId, size, day, average, showJourneys, onClose }: {
  cell: Cell | undefined; areaId: string; size: number; day: string; average: boolean; showJourneys: boolean; onClose: () => void
}) {
  const { dt, n, count } = useFormat()
  const [profile, setProfile] = useState<CellProfile | null>(null)
  const [flows, setFlows] = useState<JourneyFlow[] | null>(null)
  useEffect(() => {
    let active = true; setProfile(null)
    getJson<CellProfile>(`map/cell-profile?size=${size}&area_id=${encodeURIComponent(areaId)}${day ? `&day=${day}` : ''}`)
      .then(v => { if (active) setProfile(v) }).catch(() => {})
    return () => { active = false }
  }, [areaId, size, day])
  useEffect(() => {
    if (!showJourneys) { setFlows(null); return }
    let active = true
    getJson<{ flows: JourneyFlow[] }>(`map/journey-context?size=${size}&area_id=${encodeURIComponent(areaId)}`)
      .then(v => { if (active) setFlows(v.flows) }).catch(() => { if (active) setFlows([]) })
    return () => { active = false }
  }, [areaId, size, showJourneys])
  const days = day ? 1 : BIKE_PERIOD.days
  const classDays = (weekend: boolean) => profile?.days.find(d => d.is_weekend === weekend)?.n_days ?? 0
  const cardDays = (weekend: boolean) => day ? 1 : weekend ? 2 : 5
  const hasWeekend = profile?.trip_hours.some(r => r.is_weekend) ?? false
  return <Card title={dt.cell.title(areaId)} onClose={onClose}>
    {cell ? <>
      <span>{count(cell.trip_ends, average, days)} {dt.cell.tripEnds} · {count(cell.trip_starts, average, days)} {dt.cell.tripStarts}</span>
      <span>{count(cell.outside_intervals, average, days)} {dt.cell.outside} · {count(cell.supported_120, average, days)} {dt.cell.over120} · {count(cell.provider_recoveries, average, days)} {dt.cell.pickups}</span>
      <span>{n(cell.outside_per_100_trip_ends, 1)} {dt.cell.per100}</span>
      {cell.insufficient && <small>{dt.cell.insufficient}</small>}
    </> : <small>{dt.cell.noBike}</small>}
    {profile && profile.trip_hours.length > 0 && <>
      <strong>{dt.cell.hourly}</strong>
      <HourChart height={150} unit={dt.cell.perDay} series={[
        { name: dt.cell.weekday, color: C.s1, values: perDay(profile.trip_hours, r => r.trip_ends, classDays, false) },
        ...(hasWeekend ? [{ name: dt.cell.weekend, color: C.s2, values: perDay(profile.trip_hours, r => r.trip_ends, classDays, true) }] : [])]} />
    </>}
    {profile && profile.parking_bands.length > 0 && <><strong>{dt.cell.durations}</strong>
      <Bars rows={profile.parking_bands.map(b => ({ label: dt.cell.bands[b.band_index] ?? b.band, value: b.intervals }))} /></>}
    {profile && profile.end_reasons.length > 0 && <><strong>{dt.cell.endReasons}</strong>
      <Bars rows={profile.end_reasons.map(r => ({ label: dt.reasons[r.end_reason as keyof DataStrings['reasons']] ?? r.end_reason, value: r.intervals, note: `${r.over_120} > ${RULES.eligibleMin} min` }))} /></>}
    {profile && profile.boarding_hours.length > 0 && <><strong>{dt.cell.boardings}</strong>
      <HourChart height={150} unit={dt.cell.perDay} series={[
        { name: dt.cell.weekday, color: C.s1, values: perDay(profile.boarding_hours, r => r.boardings, cardDays, false) },
        { name: dt.cell.weekend, color: C.s2, values: perDay(profile.boarding_hours, r => r.boardings, cardDays, true) }]} />
      {profile.boarding_hours_suppressed > 0 && <small>{dt.cell.boardingsSuppressed(profile.boarding_hours_suppressed)}</small>}</>}
    {flows && <><strong>{dt.cell.journeys}</strong>
      {flows.length ? flows.map((f, i) => <span key={i}>{dt.cell.journeyRow(f.origin_municipality, f.dest_municipality, n(f.journeys), n(f.with_transfer))}</span>) : <span>{dt.cell.noJourneys}</span>}
      <small>{dt.cell.journeyNote}</small></>}
  </Card>
}

function useComponents() {
  const { dt, n } = useFormat()
  return (c: Candidate) => [
    { label: dt.candidate.demand, value: c.demand_n, note: `${n(c.trip_endpoints)} ${dt.candidate.endpoints}` },
    { label: dt.candidate.parking, value: c.parking_n, note: `${n(c.supported_120)} ${dt.candidate.parked}` },
    { label: dt.candidate.gap, value: c.transport_gap_n, note: `${n(c.departures_per_hour_333m, 1)} ${dt.candidate.depHour}` },
    { label: dt.candidate.delay, value: c.bus_delay_n ?? .5, note: dt.candidate.delayMissing },
  ]
}

/** Component percentiles as labelled 0–1 bars; the label sits above the bar so it is never truncated. */
function ComponentBar({ label, value, note }: { label: string; value: number; note?: string }) {
  const { n } = useFormat()
  return <div className="decision-component" title={note}>
    <span>{label}<b>{n(value, 2)}</b></span>
    <span className="decision-bar wide" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></span>
    {note && <small>{note}</small>}
  </div>
}

export function CandidateBreakdown({ c }: { c: Candidate }) {
  const { dt, n } = useFormat()
  const components = useComponents()
  const w = dt.candidate.without
  return <>
    <span>{dt.candidate.score} <b>{n(c.score, 3)}</b> · {n(c.nearest_station_m)} {dt.candidate.nearest}</span>
    <small>{dt.candidate.components}</small>
    {components(c).map(x => <ComponentBar key={x.label} {...x} />)}
    {c.score != null && <small><b>{dt.candidate.sensitivity}:</b> {w.demand} {n(c.score_without_demand, 3)} · {w.parking} {n(c.score_without_parking, 3)} · {w.gap} {n(c.score_without_transport_gap, 3)} · {w.delay} {n(c.score_without_bus_delay, 3)}</small>}
    <small>{dt.candidate.operators}: {c.operators_333m ?? '—'} · {dt.candidate.weightUsed(n((c.weight_available ?? .75) * 100))}</small>
  </>
}

/** Laya verdict colours, shared with the candidate table (same slots as the Station candidates tab). */
export const VERDICT_COLOR: Record<string, string> = { 'strong candidate': C.s3, 'pilot first (virtual station)': C.s2, monitor: C.muted }

/** Laya context for a selection at the current square size: undefined while loading, `get` null when the cell is not in Laya's pool. */
export type LayaLookup = { model: Laya['model']; size: number; get: (id: string) => LayaRec | null } | undefined

/** Laya's evaluation of one candidate: score, verdict, confidence, robustness and the points each component adds. */
function LayaBlock({ r, model, size }: { r: LayaRec; model: Laya['model']; size: number }) {
  const { dt, n } = useFormat()
  const l = dt.candidate.laya
  return <div className="decision-laya">
    <small><b>{l.title(size)}</b></small>
    <span><b className="decision-laya-score">{n(r.laya_score, 1)}</b> {l.scoreOf} · #{r.laya_rank}{' '}
      <span className="decision-verdict" style={{ borderColor: VERDICT_COLOR[r.verdict], color: VERDICT_COLOR[r.verdict] }}>{l.verdicts[r.verdict] ?? r.verdict}</span></span>
    <small>{l.confidence(l.confidenceLabel[r.confidence_label] ?? r.confidence_label, n(r.confidence, 2))} · {l.robustness(`${n(r.robustness * 100)}%`)}</small>
    <small>{l.points}</small>
    {model.components.map(c => <ComponentBar key={c.key} label={`${l.components[c.key] ?? c.label} (${n(c.weight * 100)}%)`}
      value={r.contributions[c.key] / (c.weight * 100)} note={`${n(r.contributions[c.key], 1)} / ${n(c.weight * 100)}`} />)}
    <small><b>{l.why}:</b></small>
    <ul className="decision-laya-list">{r.reasons.map(x => <li key={x}>{x}</li>)}</ul>
    {r.caveats.length > 0 && <><small><b>{l.check}:</b></small>
      <ul className="decision-laya-list warn">{r.caveats.map(x => <li key={x}>{x}</li>)}</ul></>}
    <a href="#Station%20candidates" className="decision-small">{l.open}</a>
  </div>
}

/** Two candidates side by side, one row per measure, so differences read across. */
function CompareTable({ a, b, onToggle, laya }: { a: Candidate; b: Candidate; onToggle: (c: Candidate) => void; laya: LayaLookup }) {
  const { dt, n } = useFormat()
  const w = dt.candidate.without
  const rows: [string, (c: Candidate) => number | null, number][] = [
    [dt.candidate.score, c => c.score, 3], [dt.candidate.demand, c => c.demand_n, 2], [dt.candidate.parking, c => c.parking_n, 2],
    [dt.candidate.gap, c => c.transport_gap_n, 2], [dt.candidate.delay, c => c.bus_delay_n ?? .5, 2],
    [dt.candidate.endpoints, c => c.trip_endpoints, 0], [dt.candidate.parked, c => c.supported_120, 0],
    [dt.candidate.nearest, c => c.nearest_station_m, 0], [dt.candidate.depHour, c => c.departures_per_hour_333m, 1],
    [w.demand, c => c.score_without_demand, 3], [w.parking, c => c.score_without_parking, 3], [w.gap, c => c.score_without_transport_gap, 3],
  ]
  const head = (c: Candidate) => <th key={c.cell_id}>#{c.rank ?? '—'} <button className="decision-close inline" onClick={() => onToggle(c)} aria-label={dt.map.close}>×</button><br /><small>{c.cell_id}</small></th>
  return <Card title={dt.candidate.compare}>
    <table className="decision-compare-table">
      <thead><tr><th />{head(a)}{head(b)}</tr></thead>
      <tbody>{rows.map(([label, get, digits]) => {
        const va = get(a), vb = get(b)
        return <tr key={label}><td>{label}</td>
          <td className={va != null && vb != null && va > vb ? 'hi' : ''}>{n(va, digits)}</td>
          <td className={va != null && vb != null && vb > va ? 'hi' : ''}>{n(vb, digits)}</td></tr>
      })}</tbody>
      {laya && <LayaCompareRows a={laya.get(a.cell_id)} b={laya.get(b.cell_id)} size={laya.size} />}
    </table>
    <small>{dt.candidate.operators}: {a.operators_333m ?? '—'} | {b.operators_333m ?? '—'}</small>
  </Card>
}

function LayaCompareRows({ a, b, size }: { a: LayaRec | null; b: LayaRec | null; size: number }) {
  const { dt, n } = useFormat()
  const l = dt.candidate.laya
  const verdict = (r: LayaRec | null) => r ? l.verdicts[r.verdict] ?? r.verdict : '—'
  const rows: [string, (r: LayaRec) => number, number, boolean][] = [
    [l.score, r => r.laya_score, 1, true], [l.rank, r => r.laya_rank, 0, false],
    [l.confidenceRow, r => r.confidence, 2, true], [l.robustnessRow, r => r.robustness * 100, 0, true]]
  return <tbody>
    <tr><td colSpan={3}><small><b>{l.title(size)}</b></small></td></tr>
    {rows.map(([label, get, digits, higherBetter]) => {
      const va = a ? get(a) : null, vb = b ? get(b) : null
      const better = (x: number | null, y: number | null) => x != null && y != null && (higherBetter ? x > y : x < y)
      return <tr key={label}><td>{label}</td>
        <td className={better(va, vb) ? 'hi' : ''}>{n(va, digits)}</td><td className={better(vb, va) ? 'hi' : ''}>{n(vb, digits)}</td></tr>
    })}
    <tr><td>{l.verdict}</td><td>{verdict(a)}</td><td>{verdict(b)}</td></tr>
  </tbody>
}

export function CandidateCards({ selected, onToggle, laya }: { selected: Candidate[]; onToggle: (c: Candidate) => void; laya: LayaLookup }) {
  const { dt } = useFormat()
  if (!selected.length) return null
  const one = laya?.get(selected[0].cell_id)
  return <>
    {selected.length === 2 ? <CompareTable a={selected[0]} b={selected[1]} onToggle={onToggle} laya={laya} />
      : <Card title={dt.candidate.title(selected[0].rank == null ? dt.candidate.unscored : String(selected[0].rank), selected[0].cell_id)} onClose={() => onToggle(selected[0])}>
        <CandidateBreakdown c={selected[0]} />
        {laya && (one ? <LayaBlock r={one} model={laya.model} size={laya.size} /> : <small>{dt.candidate.laya.notInPool}</small>)}</Card>}
    <small>{dt.candidate.note}</small>
  </>
}

export function StationCard({ stationId, name, departures, arrivals, balance, onClose, onSaveTarget }: {
  stationId: string; name: string; departures?: number; arrivals?: number; balance?: Balance; onClose: () => void; onSaveTarget: (bikes: number) => Promise<void>
}) {
  const { dt, n, dateTime } = useFormat()
  const [history, setHistory] = useState<BalanceDay[]>([])
  const [hourly, setHourly] = useState<HourRow[]>([])
  const [target, setTarget] = useState('')
  useEffect(() => {
    let active = true
    fetch(`/api/stations/${encodeURIComponent(stationId)}/balance-history`).then(r => r.json())
      .then(v => { if (active) setHistory(v.days ?? []) }).catch(() => { if (active) setHistory([]) })
    getJson<{ hourly: HourRow[] }>(`stations/${encodeURIComponent(stationId)}`).then(v => { if (active) setHourly(v.hourly) }).catch(() => { if (active) setHourly([]) })
    return () => { active = false }
  }, [stationId])
  const days = (weekend: boolean) => hourly.find(h => h.is_weekend === weekend)?.n_days ?? 1
  const ratio = balance?.occupancy_ratio
  return <Card title={name.split(',')[0]} onClose={onClose}>
    {departures != null && <span>{dt.station.historical(n(departures), n(arrivals))}</span>}
    {hourly.length > 0 && <><strong>{dt.station.history}</strong>
      <HourChart height={150} unit={dt.cell.perDay} series={[
        { name: `${dt.station.departures} · ${dt.cell.weekday}`, color: C.s1, values: perDay(hourly, r => r.departures, days, false) },
        { name: `${dt.station.arrivals} · ${dt.cell.weekday}`, color: C.s2, values: perDay(hourly, r => r.arrivals, days, false) }]} /></>}
    {balance && <>
      <span>{dt.station.currentBikes}: {n(balance.bikes_available)} · {balance.collected_at ? dateTime(balance.collected_at) : dt.station.noStatus}</span>
      {balance.benchmark_status === 'insufficient_history'
        ? <span>{dt.station.awaiting(balance.observed_days ?? 0, balance.min_benchmark_days ?? RULES.benchmarkDays)}</span>
        : <span>{dt.station.benchmark}: {n(balance.benchmark)} {balance.benchmark_status === 'operator_target' ? dt.station.target : dt.station.peak}</span>}
      <span>{dt.station.balance}: {ratio == null ? dt.station.stale : `${n(ratio * 100)}% · ${ratio >= .4 && ratio <= .6 ? dt.station.withinBand : dt.station.rebalance}`}</span>
      {history.slice(-5).map(d => <span key={d.day_local}>{dt.station.dayRow(d.day_local, n(d.average_bikes, 1), n(d.peak_bikes), n(d.samples))}</span>)}
      <label>{dt.station.saveTarget}<input type="number" min="1" max="1000" value={target} onChange={e => setTarget(e.target.value)} /></label>
      <button disabled={!Number.isInteger(Number(target)) || Number(target) < 1} onClick={() => onSaveTarget(Number(target)).then(() => setTarget(''))}>{dt.station.save}</button>
      <small>{dt.station.note}</small>
    </>}
  </Card>
}

export function StopCard({ stop, view, day, hour, onClose }: { stop: MapStop; view: 'history' | 'live'; day: string; hour: string; onClose: () => void }) {
  const { dt, n, time } = useFormat()
  const [departures, setDepartures] = useState<Departure[]>([])
  const [arrivals, setArrivals] = useState<Arrival[]>([])
  const [profile, setProfile] = useState<StopProfile | null>(null)
  useEffect(() => {
    let active = true; setDepartures([]); setArrivals([])
    const liveHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(new Date())
    const q = new URLSearchParams({ agency_id: stop.agency_id, stop_id: stop.stop_id, ...(day && view === 'history' ? { day } : {}), ...(hour || view === 'live' ? { hour: hour || liveHour } : {}) })
    getJson<{ departures: Departure[] }>(`map/stop-departures?${q}`).then(v => { if (active) setDepartures(v.departures) }).catch(() => {})
    if (view === 'live') fetch(`/api/transit/arrivals/${encodeURIComponent(stop.stop_id)}`).then(r => r.json())
      .then(v => { if (active) setArrivals(Array.isArray(v.arrivals) ? v.arrivals : []) }).catch(() => {})
    return () => { active = false }
  }, [stop, day, hour, view])
  useEffect(() => {
    let active = true; setProfile(null)
    getJson<StopProfile>(`map/stop-profile?agency_id=${encodeURIComponent(stop.agency_id)}&stop_id=${encodeURIComponent(stop.stop_id)}`)
      .then(v => { if (active) setProfile(v) }).catch(() => {})
    return () => { active = false }
  }, [stop])
  const days = (weekend: boolean) => profile?.hours.find(h => h.is_weekend === weekend)?.n_days ?? (weekend ? 2 : 5)
  return <Card title={stop.stop_name} onClose={onClose}>
    <span>{stop.agency_name} · {n(stop.departures_per_hour, 1)} {dt.stop.departures} · {n(stop.weekly_boardings)} {dt.stop.boardings}</span>
    {profile && profile.hours.length > 0 && <><strong>{dt.stop.boardingsHour}</strong>
      <HourChart height={140} unit={dt.cell.perDay} series={[
        { name: dt.cell.weekday, color: C.s1, values: perDay(profile.hours, r => r.validations, days, false) },
        { name: dt.cell.weekend, color: C.s2, values: perDay(profile.hours, r => r.validations, days, true) }]} />
      {profile.suppressed_hours > 0 && <small>{dt.stop.suppressed(profile.suppressed_hours)}</small>}</>}
    <strong>{view === 'live' ? dt.stop.sample : dt.stop.scheduled}</strong>
    {departures.length ? departures.slice(0, 12).map((d, i) => <span key={i}>{stop.agency_id === 'HF16N' ? routeLabel(d.route) : d.route} → {d.direction || dt.stop.unknownDest} · {d.time_local}</span>) : <small>{dt.stop.noTimes}</small>}
    {view === 'live' && (arrivals.length > 0 ? <><strong>{dt.stop.live}</strong>
      {arrivals.slice(0, 8).map((a, i) => <span key={i}>{routeLabel(a.route)} · {time(a.eta_at)} · {dt.stop.vehicle} {a.vehicle_id || dt.vehicle.unknown}</span>)}</> : <small>{dt.stop.noLive}</small>)}
  </Card>
}

export function VehicleCard({ v, onClose }: { v: Vehicle; onClose: () => void }) {
  const { dt, n, dateTime } = useFormat()
  const u = dt.vehicle
  return <Card title={`${v.agency_id === 'N18KL' ? u.train : u.bus} ${v.id || u.unknown}`} onClose={onClose}>
    <span>{u.route} {v.route || u.unknown} · {u.trip} {v.trip_id || u.unknown} · {u.nextStop} {v.stop_id || u.unknown}</span>
    <span>{u.speed} {v.speed_mps == null ? u.unavailable : `${n(Number(v.speed_mps) * 3.6, 1)} km/h`} · {u.observed} {dateTime(v.observed_at)}</span>
    <small>{u.source}: {v.source}</small>
  </Card>
}

export function EstimatedCard({ s, onClose }: { s: Scheduled; onClose: () => void }) {
  const { dt } = useFormat()
  return <Card title={`${s.route_type === '2' ? dt.vehicle.train : dt.vehicle.bus} ${routeLabel(s.route_short_name)}`} onClose={onClose}>
    <span>{dt.vehicle.sampleTrip} {s.trip_id}</span><small>{dt.vehicle.estimated}</small>
  </Card>
}

export function BikeCard({ b, onClose }: { b: Bike; onClose: () => void }) {
  const { dt, n, dateTime } = useFormat()
  const rules = useRules()
  return <Card title={dt.bike.title(b.id.slice(-6))} onClose={onClose}>
    <span>{b.state} · {n(b.rest_since ? countedMinutes(Date.parse(b.rest_since), Date.now(), rules) : 0)} {dt.bike.counted} ({n(ageMinutes(b.rest_since))} {dt.bike.atRest}) · {n(b.distance_outside_m)} {dt.bike.outside}</span>
    <span>{dt.bike.report}: {b.last_reported ? dateTime(b.last_reported) : dt.vehicle.unavailable}</span>
    <small>{dt.bike.note}</small>
  </Card>
}

export function LiveSummary({ balance, vehicles, transitErrors, unmoved, cases, age }: {
  balance: Balance[]; vehicles: number; transitErrors: string[]; unmoved: number; cases: number; age: number
}) {
  const { dt } = useFormat()
  const withRatio = balance.filter(b => b.occupancy_ratio != null)
  const inBand = withRatio.filter(b => b.occupancy_ratio! >= .4 && b.occupancy_ratio! <= .6).length
  const awaiting = balance.filter(b => b.benchmark_status === 'insufficient_history').length
  return <>
    <Card title={dt.station.summary}>
      {withRatio.length > 0 && <span>{dt.station.summaryRow(inBand, withRatio.length)}</span>}
      {awaiting > 0 && <span>{dt.station.summaryAwaiting(awaiting, balance[0]?.min_benchmark_days ?? RULES.benchmarkDays)}</span>}
      <small>{dt.station.summaryNote}</small>
    </Card>
    <Card title={dt.vehicle.liveCard}><span>{dt.vehicle.liveCount(vehicles)}</span>{transitErrors.map((e, i) => <small key={i}>{e}</small>)}<small>{dt.vehicle.liveNote}</small></Card>
    <Card title={dt.bike.summary(age)}><span>{dt.bike.summaryRow(unmoved, cases)}</span><small>{dt.bike.summaryNote}</small></Card>
  </>
}

export const cardDays = (day: string) => day ? 1 : CARD_PERIOD.days
