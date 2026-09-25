import { useMemo, useState } from 'react'
import { useRules, windowLabel } from '../../enforcement'
import { RampLegend } from '../insights/viz'
import { BIKE_PERIOD, CARD_PERIOD, RAMP, inRange, p95 } from './definitions'
import { metricValue, useFormat } from './format'
import { GRID_METRICS, LAYER_GROUPS, type GridMetric, type Layer } from './types'
import type { DecisionData } from './useDecisionData'
import type { MapState } from './useMapState'

function Swatch({ color, label, ring, round }: { color: string; label: string; ring?: string; round?: boolean }) {
  return <div className="decision-legend"><i style={{ background: color, border: ring ? `2px solid ${ring}` : undefined, borderRadius: round ? 99 : 2 }} />{label}</div>
}

export function ControlsPanel({ state, data, update, toggleLayer, motion, setMotion }: {
  state: MapState; data: DecisionData; update: (p: Partial<MapState>) => void; toggleLayer: (l: Layer) => void
  motion: boolean; setMotion: (v: boolean) => void
}) {
  const { dt, n } = useFormat()
  const rules = useRules()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [narrow] = useState(() => window.matchMedia('(max-width: 700px)').matches)
  const history = state.view === 'history'
  const bikeDays = state.day ? 1 : BIKE_PERIOD.days
  const gridMax = useMemo(() => p95(data.cells.data.features.map(f => metricValue(f.properties, state.metric))), [data.cells.data, state.metric])
  const peopleMax = useMemo(() => p95(data.people.data.features.map(f => f.properties.boardings)), [data.people.data])
  const averaged = (v: number, days: number) => n(state.average && state.metric !== 'outside_per_100_trip_ends' ? v / days : v, state.average ? 1 : 0)
  return <aside className="decision-panel decision-controls">
    <details open={!narrow} className="decision-controls-body">
      <summary><h3>{dt.map.controls}</h3></summary>
      <label>{dt.map.squareSize}: <b>{state.size} m</b>
        <input type="range" min="50" max="1000" step="50" value={state.size} onChange={e => update({ size: Number(e.target.value), cell: null, candidates: [] })} /></label>
      {history && <>
        <label>{dt.map.date}<input type="date" min={BIKE_PERIOD.start} max={BIKE_PERIOD.lastData} value={state.day} onChange={e => update({ day: e.target.value, cell: null, candidates: [] })} /></label>
        {state.day && !inRange(state.day, CARD_PERIOD) && state.layers.has('people') && <small className="decision-warn">{dt.map.outsideCardRange}</small>}
        <label>{dt.map.hour}<select value={state.hour} onChange={e => update({ hour: e.target.value, cell: null, candidates: [] })}>
          <option value="">{dt.map.allHours}</option>
          {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>)}</select></label>
        <label>{dt.map.metricKind}<select value={state.average ? 'average' : 'total'} onChange={e => update({ average: e.target.value === 'average' })}>
          <option value="total">{dt.map.total}</option><option value="average">{dt.map.average}</option></select></label>
      </>}
      {!history && <><label>{dt.map.parkingAge}: <b>{state.age} min</b>
        <input type="range" min="15" max="720" step="15" value={state.age} onChange={e => update({ age: Number(e.target.value) })} /></label>
        <small>{dt.map.parkingAgeNote(windowLabel(rules))}</small></>}

      <h3>{dt.map.layers}</h3>
      {LAYER_GROUPS.map(g => {
        const disabled = g.liveOnly && history
        const expanded = open[g.key] ?? !disabled
        return <fieldset key={g.key} className="decision-group" disabled={disabled}>
          <legend><button type="button" onClick={() => setOpen(o => ({ ...o, [g.key]: !expanded }))} aria-expanded={expanded}>
            {expanded ? '▾' : '▸'} {dt.groups[g.key]}{disabled && <small> · {dt.map.liveOnly}</small>}</button></legend>
          {expanded && g.layers.map(l => <div key={l}>
            <label className="decision-layer"><input type="checkbox" checked={state.layers.has(l)} onChange={() => toggleLayer(l)} />
              <span>{dt.layer[l]}<small>{dt.layerMeta[l]}</small></span></label>
            {l === 'grid' && state.layers.has('grid') && <div className="decision-metrics" role="radiogroup" aria-label={dt.map.gridMetric}>
              {GRID_METRICS.map(m => <label key={m}><input type="radio" name="grid-metric" checked={state.metric === m} onChange={() => update({ metric: m as GridMetric })} />{dt.metric[m]}</label>)}
            </div>}
          </div>)}
        </fieldset>
      })}
      {(state.layers.has('bus') || state.layers.has('rail')) && <label className="decision-layer"><input type="checkbox" checked={motion} onChange={() => setMotion(!motion)} />{dt.map.motion}</label>}
    </details>

    <h3>{dt.map.legend}</h3>
    <div className="decision-legends">
      {state.layers.has('grid') && <RampLegend colors={RAMP.blue} low="0" high={dt.legend.atLeast(averaged(gridMax, bikeDays))}
        title={`${dt.metric[state.metric]}${state.average && state.metric !== 'outside_per_100_trip_ends' ? ` · ${dt.map.average.toLowerCase()}` : ''}`} />}
      {state.layers.has('grid') && state.metric === 'outside_per_100_trip_ends' && <small>{dt.legend.insufficient}</small>}
      {state.layers.has('people') && <RampLegend colors={RAMP.orange} low="0" high={dt.legend.atLeast(averaged(peopleMax, state.day ? 1 : CARD_PERIOD.days))} title={dt.legend.boardings} />}
      {state.layers.has('candidates') && <><RampLegend colors={RAMP.magenta} low="0" high="1" title={dt.legend.score} />
        <Swatch color="transparent" ring="#8a8984" label={dt.legend.withheld} /></>}
      {state.layers.has('stations') && <><Swatch color="#2eb58d" label={dt.legend.station} /><Swatch color="#f5c56b" label={dt.legend.buffer} /></>}
      {state.layers.has('stops') && <><Swatch color="#edbd65" round label={dt.legend.stop} /><Swatch color="#a36fc0" round label={dt.legend.railStop} /></>}
      {(state.layers.has('bus') || state.layers.has('rail')) && <small>{dt.legend.routeDelay}</small>}
      {!history && state.layers.has('bikes') && <><Swatch color="#298dc0" round label={dt.legend.bike} /><Swatch color="#d1a03d" round label={dt.legend.bikeOther} /></>}
      {!history && state.layers.has('unmoved') && <Swatch color="#ef9c4c" ring="#bc3436" round label={dt.legend.unmoved} />}
      {!history && state.layers.has('cases') && <Swatch color="#d93c42" round label={dt.legend.case} />}
    </div>
  </aside>
}
