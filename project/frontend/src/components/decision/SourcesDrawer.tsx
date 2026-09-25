import { useEffect, useState } from 'react'
import { useAnalysisRules, useRules, windowLabel } from '../../enforcement'
import { getJson } from '../insights/data'
import { useFormat } from './format'
import type { CatalogueRow } from './types'
import type { DecisionData } from './useDecisionData'

/** Every source behind the map: period, rows, meaning and the layers that use it, plus live feed freshness. */
export function SourcesDrawer({ data, onClose }: { data: DecisionData; onClose: () => void }) {
  const { dt, n, dateTime } = useFormat()
  const analysis = useAnalysisRules(), ops = useRules()
  const [rows, setRows] = useState<{ sources: CatalogueRow[]; live: CatalogueRow[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { getJson<{ sources: CatalogueRow[]; live: CatalogueRow[] }>('map/catalogue').then(setRows).catch(e => setError(String(e))) }, [])
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc) }, [onClose])
  const latest = (values: (string | null | undefined)[]) => values.filter(Boolean).sort().at(-1) ?? null
  const liveUpdate: Record<string, string | null> = {
    gbfs: latest([...data.bikes.map(b => b.last_reported), ...data.balance.map(b => b.collected_at)]),
    transit_live: latest(data.vehicles.map(v => v.observed_at)),
    cases: latest(data.cases.map(c => c.updated_at)),
  }
  const c = dt.catalogue
  const layerNames = (keys: string[]) => keys.map(k => dt.layer[k as keyof typeof dt.layer] ?? k).join(', ') || '—'
  return <div className="decision-drawer-backdrop" onClick={onClose}>
    <aside className="decision-drawer" role="dialog" aria-modal="true" aria-label={c.title} onClick={e => e.stopPropagation()}>
      <header><h3>{c.title}</h3><button className="decision-close" onClick={onClose} aria-label={dt.map.close}>×</button></header>
      {error && <p className="decision-error">{error}</p>}
      {!rows && !error && <p>{dt.page.loading}</p>}
      {rows && <div className="decision-drawer-table"><table>
        <thead><tr><th>{c.source}</th><th>{c.kind}</th><th>{c.period}</th><th>{c.rows}</th><th>{c.usedIn}</th><th>{c.meaning}</th></tr></thead>
        <tbody>{rows.sources.map(r => ({ ...r, ...c.rowText[r.key] })).map(r => <tr key={r.key}>
          <td><b>{r.name}</b><br /><small>{r.coverage}</small></td><td>{r.kind}</td>
          <td>{r.available === false ? c.unavailable : r.period_start ? `${r.period_start} – ${r.period_end}` : '—'}</td>
          <td>{n(r.rows)} {r.unit}</td><td>{layerNames(r.used_in)}</td><td>{r.meaning}</td></tr>)}</tbody></table></div>}
      {rows && <><h4>{c.live}</h4><div className="decision-drawer-table"><table>
        <thead><tr><th>{c.source}</th><th>{c.lastUpdate}</th><th>{c.usedIn}</th><th>{c.meaning}</th></tr></thead>
        <tbody>{rows.live.map(r => ({ ...r, ...c.rowText[r.key] })).map(r => <tr key={r.key}><td><b>{r.name}</b></td><td>{dateTime(liveUpdate[r.key])}</td><td>{layerNames(r.used_in)}</td><td>{r.meaning}</td></tr>)}</tbody>
      </table></div></>}
      <h4>{c.definitions}</h4>
      <ul><li>{c.ruleDef(windowLabel(analysis))}</li>{c.defs.map(d => <li key={d}>{d}</li>)}</ul>
      {analysis.enforce_window !== ops.enforce_window && <p className="decision-warn">{c.mismatch(windowLabel(analysis), windowLabel(ops))}</p>}
    </aside>
  </div>
}
