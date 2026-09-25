import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormat } from './format'
import type { LayaRec } from '../insights/data'
import { VERDICT_COLOR } from './DetailPanel'
import type { Candidate } from './types'

/** Ranked candidates synchronised with the map: a row click selects and pans; a map click highlights the row.
 *  `laya` is Laya's evaluation at the same square size (null while it loads). */
export function CandidateTable({ candidates, selected, onSelect, csvHref, laya }: {
  candidates: Candidate[]; selected: string[]; onSelect: (c: Candidate) => void; csvHref: string
  laya: Map<string, LayaRec> | null
}) {
  const { dt, n } = useFormat()
  const [all, setAll] = useState(false)
  const scored = useMemo(() => candidates.filter(c => c.score != null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)), [candidates])
  const selectedOutside = scored.filter(c => selected.includes(c.cell_id) && (c.rank ?? 0) > 15)
  const rows = all ? scored : [...scored.slice(0, 15), ...selectedOutside]
  const body = useRef<HTMLTableSectionElement>(null)
  useEffect(() => {
    const last = selected[selected.length - 1]
    if (last) body.current?.querySelector(`[data-cell="${CSS.escape(last)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  const c = dt.candidate
  return <section className="decision-table">
    <header><h3>{c.table}</h3><small>{c.compareHint}</small>
      <span className="decision-actions">
        {scored.length > 15 && <button onClick={() => setAll(!all)}>{all ? c.showTop : `${c.showAll} (${scored.length})`}</button>}
        <a href={csvHref} download>{dt.map.csvCandidates}</a></span></header>
    {laya && <p className="decision-small">{c.laya.filterNote}</p>}
    {scored.length === 0 ? <p className="decision-small">{c.none}</p> : <div className="decision-table-scroll"><table>
      <thead><tr>
        <th>{c.rank}</th><th>{c.score}</th><th>{c.demandCol}</th><th>{c.parkingCol}</th><th>{c.gapCol}</th>
        <th>{c.endpointsCol}</th><th>{c.parkedCol}</th><th>{c.nearestCol}</th><th>{c.depCol}</th>
        {laya && <><th>{c.laya.rank}</th><th>{c.laya.score}</th><th>{c.laya.verdict}</th></>}</tr></thead>
      <tbody ref={body}>{rows.map(r => <tr key={r.cell_id} data-cell={r.cell_id} className={selected.includes(r.cell_id) ? 'on' : ''}
        tabIndex={0} onClick={() => onSelect(r)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r) } }}>
        <td>{r.rank}</td><td><Bar v={r.score ?? 0} />{n(r.score, 3)}</td><td>{n(r.demand_n, 2)}</td><td>{n(r.parking_n, 2)}</td><td>{n(r.transport_gap_n, 2)}</td>
        <td>{n(r.trip_endpoints)}</td><td>{n(r.supported_120)}</td><td>{n(r.nearest_station_m)}</td><td>{n(r.departures_per_hour_333m, 1)}</td>
        {laya && <LayaCells rec={laya.get(r.cell_id)} />}
      </tr>)}</tbody></table></div>}
  </section>
}

function LayaCells({ rec }: { rec: LayaRec | undefined }) {
  const { dt, n } = useFormat()
  if (!rec) return <><td>—</td><td>—</td><td>—</td></>
  return <><td>{rec.laya_rank}</td><td>{n(rec.laya_score, 1)}</td>
    <td><span className="decision-verdict" title={dt.candidate.laya.verdicts[rec.verdict] ?? rec.verdict}
      style={{ borderColor: VERDICT_COLOR[rec.verdict], color: VERDICT_COLOR[rec.verdict] }}>{dt.candidate.laya.verdictsShort[rec.verdict] ?? rec.verdict}</span></td></>
}

function Bar({ v }: { v: number }) {
  return <span className="decision-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} /></span>
}
