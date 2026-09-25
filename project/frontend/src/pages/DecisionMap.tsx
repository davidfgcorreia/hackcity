import 'leaflet/dist/leaflet.css'
import '../components/decision/decision.css'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { api } from '../api'
import { useRules } from '../enforcement'
import { CandidateTable } from '../components/decision/CandidateTable'
import { ControlsPanel } from '../components/decision/ControlsPanel'
import { BikeCard, CandidateCards, CellCard, EstimatedCard, LiveSummary, StationCard, StopCard, VehicleCard, type LayaLookup } from '../components/decision/DetailPanel'
import { useFormat } from '../components/decision/format'
import { CandidateLayer, GridLayer, LiveLayers, MapController, PeopleLayer, StationLayers, TransitLayers, openCases, unmovedBikes } from '../components/decision/MapLayers'
import { SourcesDrawer } from '../components/decision/SourcesDrawer'
import type { Bike, Candidate, MapStop, Scheduled, Vehicle } from '../components/decision/types'
import type { OpsMode } from '../types'
import { useDecisionData } from '../components/decision/useDecisionData'
import { useMapState } from '../components/decision/useMapState'
import { CaseDrawer } from '../components/review/CaseDrawer'
import { ReplayBar } from '../components/review/ReplayBar'

const CASCAIS: [number, number] = [38.715, -9.40]

/** /data#Decision map: historical planning evidence and live operations on one map. See docs/decision_map.md. */
export function DecisionMap() {
  const { dt } = useFormat()
  const { state, update, toggleLayer } = useMapState()
  const data = useDecisionData(state)
  const [zoom, setZoom] = useState(12)
  const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [tick, setTick] = useState(Date.now())
  const [stop, setStop] = useState<MapStop | null>(null)
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [estimated, setEstimated] = useState<Scheduled | null>(null)
  const [bike, setBike] = useState<Bike | null>(null)
  const [openCase, setOpenCase] = useState<number | null>(null)
  const [simTime, setSimTime] = useState<string | null>(null)
  const [mode, setMode] = useState<OpsMode>('live')
  const [sources, setSources] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)
  const [focus, setFocus] = useState<{ lat: number; lon: number; key: number } | null>(null)
  useEffect(() => {
    Promise.all([api.replay.state(), api.live.state()])
      .then(([r, l]) => { setMode(l.running ? 'live' : 'replay'); setSimTime(l.running ? null : r.sim_time) }).catch(() => {})
  }, [])
  useEffect(() => { if (!motion) return; const id = window.setInterval(() => setTick(Date.now()), 2000); return () => window.clearInterval(id) }, [motion])

  const history = state.view === 'history'
  const candidateById = useMemo(() => new Map(data.candidates.data.features.map(f => [f.properties.cell_id, f.properties])), [data.candidates.data])
  const selectedCandidates = state.candidates.map(id => candidateById.get(id)).filter((c): c is Candidate => !!c)
  // Laya is fetched for the current square size; ignore a response still in flight for the previous size.
  const layaCurrent = data.laya && (data.laya.size_m ?? 250) === data.querySize ? data.laya : null
  const layaById = useMemo(() => new Map((layaCurrent?.pool ?? []).map(r => [r.cell_id, r])), [layaCurrent])
  const laya: LayaLookup = layaCurrent ? { model: layaCurrent.model, size: data.querySize, get: id => layaById.get(id) ?? null } : undefined
  const cell = state.cell ? data.cells.data.features.find(f => f.properties.area_id === state.cell)?.properties : undefined
  const stationFlow = state.station ? data.stations?.stations.features.find(f => f.properties.station_id === state.station)?.properties : undefined
  const stationBalance = state.station ? data.balance.find(b => b.station_id === state.station) : undefined
  const rules = useRules()
  const unmoved = unmovedBikes(data.bikes, state.age, rules)
  const replay = mode === 'replay'
  const nowMs = replay && simTime ? Date.parse(simTime) : Date.now()
  const cases = openCases(data.cases, state.age, replay, rules, nowMs)

  const toggleCandidate = (c: Candidate, pan = false) => {
    const on = state.candidates.includes(c.cell_id)
    update({ candidates: on ? state.candidates.filter(id => id !== c.cell_id) : [...state.candidates.slice(-1), c.cell_id] })
    if (pan && !on) setFocus({ lat: c.lat, lon: c.lon, key: Date.now() })
  }
  const saveTarget = async (bikes: number) => {
    const r = await fetch(`/api/stations/${encodeURIComponent(state.station!)}/target`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bikes }) })
    if (!r.ok) { data.fail(`Station target: ${r.status}`); return }
    await data.reloadBalance()
  }

  const loading = data.cells.loading || data.candidates.loading || (state.layers.has('people') && data.people.loading)
  const when = [state.day || dt.map.allDates, state.hour ? `${state.hour.padStart(2, '0')}:00` : dt.map.allHours].join(' · ')
  const empty = history && !loading && ((state.layers.has('grid') && data.cells.data.features.length === 0) || (state.layers.has('people') && data.people.data.features.length === 0))
  const hasSelection = !!(cell || state.cell || selectedCandidates.length || state.station || stop || vehicle || estimated || bike)
  const csv = (name: string, query = data.filters) => `/analytics/map/${name}.csv?${query}`
  const timeQuery = new URLSearchParams({ ...(state.day ? { day: state.day } : {}), ...(state.hour ? { hour: state.hour } : {}) }).toString()

  return <section className="decision-layout">
    <header className="decision-toolbar">
      <div><h2>{dt.map.title}</h2><span>{dt.map.subtitle}</span></div>
      <div className="decision-tabs" role="tablist">
        <button role="tab" aria-selected={history} className={history ? 'on' : ''} onClick={() => update({ view: 'history' })}>{dt.map.historical}</button>
        <button role="tab" aria-selected={!history} className={!history ? 'on' : ''} onClick={() => update({ view: 'live' })}>{dt.map.live}</button>
      </div>
      <div className="decision-actions">
        <button onClick={() => setSources(true)}>{dt.map.sources}</button>
        <a href={csv('analysis-cells')} download>{dt.map.csvCells}</a>
        <a href={csv('station-flows', timeQuery)} download>{dt.map.csvStations}</a>
        <button onClick={() => window.print()}>{dt.map.print}</button>
      </div>
      <small>{history ? dt.map.periodHistory : dt.map.periodLive}</small>
      <p className="decision-print-only">{dt.print.filters}: {data.querySize} m · {when} · {state.average ? dt.map.average : dt.map.total} · {dt.metric[state.metric]} · {dt.print.generated} {new Date().toLocaleString(dt.locale)}</p>
    </header>
    {!history && <ReplayBar onChange={(s, m) => { setMode(m); setSimTime(m === 'replay' ? s.sim_time : null); api.cases().then(data.setCases).catch(() => {}) }} />}
    <div className="decision-body">
      <ControlsPanel state={state} data={data} update={update} toggleLayer={toggleLayer} motion={motion} setMotion={setMotion} />
      <div className="decision-main">
        <div className="decision-map-wrap">
          <MapContainer center={CASCAIS} zoom={12} className="decision-map" preferCanvas>
            <MapController data={data} resetSignal={resetSignal} focus={focus} onZoom={setZoom} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="tiles-muted" attribution="© OpenStreetMap contributors" />
            {state.layers.has('grid') && <GridLayer data={data} state={state} onCell={area => update({ cell: area === state.cell ? null : area })} />}
            {state.layers.has('people') && <PeopleLayer data={data} state={state} onCell={area => update({ cell: area === state.cell ? null : area })} />}
            {state.layers.has('candidates') && zoom >= 11 && <CandidateLayer data={data} state={state} onCandidate={c => toggleCandidate(c)} />}
            {state.layers.has('stations') && <StationLayers data={data} state={state} zoom={zoom} onStation={id => update({ station: id === state.station ? null : id })} />}
            <TransitLayers data={data} state={state} zoom={zoom} motion={motion} tick={tick}
              onStop={s => { setStop(s); setVehicle(null) }} onVehicle={v => { setVehicle(v); setStop(null) }} onEstimated={setEstimated} />
            <LiveLayers data={data} state={state} zoom={zoom} replay={replay} rules={rules} nowMs={nowMs} onBike={setBike} onCase={setOpenCase} />
          </MapContainer>
          <button className="decision-reset" onClick={() => setResetSignal(v => v + 1)}>{dt.map.resetView}</button>
          {loading && <div className="decision-status">{dt.map.loadingLayer}</div>}
          {empty && <div className="decision-status">{dt.map.noObservations(when)}</div>}
          <div className="decision-foot">{dt.map.foot}</div>
        </div>
        {state.layers.has('candidates') && <CandidateTable candidates={data.candidates.data.features.map(f => f.properties)} selected={state.candidates}
          onSelect={c => toggleCandidate(c, true)} csvHref={csv('analysis-candidates')}
          laya={laya ? layaById : null} />}
      </div>
      <aside className={`decision-panel decision-detail${hasSelection ? ' has-selection' : ''}`}>
        <h3>{dt.map.details}</h3>
        <p className="decision-small">{dt.map.gridInfo(data.querySize, !history ? dt.map.modeLive : state.average ? dt.map.modeAverage : dt.map.modeTotal)}</p>
        {state.cell && <CellCard key={`${state.cell}-${data.querySize}`} cell={cell} areaId={state.cell} size={data.querySize} day={state.day} average={state.average}
          showJourneys={state.layers.has('people')} onClose={() => update({ cell: null })} />}
        <CandidateCards selected={selectedCandidates} onToggle={c => toggleCandidate(c)} laya={laya} />
        {state.station && <StationCard key={state.station} stationId={state.station} name={stationFlow?.name ?? stationBalance?.name ?? state.station}
          departures={stationFlow?.departures} arrivals={stationFlow?.arrivals} balance={stationBalance} onClose={() => update({ station: null })} onSaveTarget={saveTarget} />}
        {stop && <StopCard stop={stop} view={state.view} day={state.day} hour={state.hour} onClose={() => setStop(null)} />}
        {vehicle && <VehicleCard v={vehicle} onClose={() => setVehicle(null)} />}
        {estimated && <EstimatedCard s={estimated} onClose={() => setEstimated(null)} />}
        {bike && <BikeCard b={bike} onClose={() => setBike(null)} />}
        {!history && <LiveSummary balance={data.balance} vehicles={data.vehicles.length} transitErrors={data.transitErrors} unmoved={unmoved.length} cases={cases.length} age={state.age} />}
        {!hasSelection && <p className="decision-small">{dt.map.inspectHint}</p>}
      </aside>
    </div>
    {openCase != null && <CaseDrawer caseId={openCase} simTime={simTime} onChanged={u => data.setCases(current => current.map(c => c.id === u.id ? { ...c, ...u } : c))} onClose={() => setOpenCase(null)} />}
    {sources && <SourcesDrawer data={data} onClose={() => setSources(false)} />}
    {data.errors.length > 0 && <p role="alert" className="decision-error">{data.errors.join(' · ')}</p>}
  </section>
}
