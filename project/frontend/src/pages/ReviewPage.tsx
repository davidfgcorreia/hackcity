import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { api } from '../api'
import { BaseMap } from '../components/BaseMap'
import { CaseDrawer } from '../components/review/CaseDrawer'
import { KpiStrip } from '../components/review/KpiStrip'
import { ReplayBar } from '../components/review/ReplayBar'
import { StatusFilters } from '../components/review/StatusFilters'
import { STATUS_COLOR, Tag, fmt, inputStyle, ui } from '../components/review/ui'
import { useT } from '../i18n'
import { CASE_STATUSES, type Case, type CaseStatus, type Kpis } from '../types'

const POLL_MS = 5000

export { STATUS_COLOR }

/** Desktop review view: replay controls, KPIs, status filters, map and searchable case list. */
export function ReviewPage() {
  const t = useT()
  const [cases, setCases] = useState<Case[]>([])
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [q, setQ] = useState('')
  const [active, setActive] = useState<Set<CaseStatus>>(new Set())
  const [openCase, setOpenCase] = useState<number | null>(null)
  const [simTime, setSimTime] = useState<string | null>(null)

  const load = useCallback(() => {
    api.cases().then(setCases).catch(() => {})
    api.kpis().then(setKpis).catch(() => setKpis(null))
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<CaseStatus, number>
    cases.forEach((c) => { byStatus[c.status] = (byStatus[c.status] ?? 0) + 1 })
    return byStatus
  }, [cases])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return cases.filter((c) =>
      (active.size === 0 || active.has(c.status)) &&
      (!needle || c.device_id.toLowerCase().includes(needle) || c.status.includes(needle) ||
        String(c.id) === needle || c.reason.toLowerCase().includes(needle)))
  }, [cases, q, active])

  const toggle = (s: CaseStatus) => setActive((current) => {
    const next = new Set(current)
    if (!next.delete(s)) next.add(s)
    return next
  })

  /** Keep the list in step with an edit made in the drawer, without waiting for the poll. */
  const applyChange = (updated: Case) => {
    setCases((current) => current.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))
    api.kpis().then(setKpis).catch(() => {})
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100dvh', fontFamily: 'system-ui' }}>
      <ReplayBar onChange={(s) => { setSimTime(s.sim_time); load() }} />
      <KpiStrip kpis={kpis} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 440px', minHeight: 0 }}>
        <BaseMap>
          {shown.map((c) => (
            <CircleMarker key={c.id} center={[c.lat, c.lng]} radius={c.id === openCase ? 11 : 8}
              pathOptions={{
                color: c.id === openCase ? '#000' : STATUS_COLOR[c.status],
                fillColor: STATUS_COLOR[c.status], fillOpacity: 0.85, weight: c.id === openCase ? 3 : 1,
              }}
              eventHandlers={{ click: () => setOpenCase(c.id) }}>
              <Tooltip direction="top">{c.device_id}</Tooltip>
              <Popup>
                <b>#{c.id} {c.device_id}</b> · {t.status[c.status]}<br />{c.reason}
              </Popup>
            </CircleMarker>
          ))}
        </BaseMap>

        <aside style={{ overflowY: 'auto', padding: 12, borderLeft: `1px solid ${ui.line}`, minWidth: 0 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{t.cases} ({shown.length})</h2>
          <input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)}
            style={{ ...inputStyle, marginBottom: 8 }} />
          <StatusFilters counts={counts} active={active} total={cases.length}
            onToggle={toggle} onClear={() => setActive(new Set())} />

          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
            {shown.map((c) => (
              <li key={c.id}>
                <button onClick={() => setOpenCase(c.id)} style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  border: 'none', borderLeft: `4px solid ${STATUS_COLOR[c.status]}`,
                  background: c.id === openCase ? '#eef5f8' : '#fff', padding: '8px 10px', margin: '6px 0',
                }}>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b>#{c.id} {c.device_id}</b>
                    <Tag color={STATUS_COLOR[c.status]}>{t.status[c.status]}</Tag>
                    {c.needs_approval && <Tag color={ui.warn}>{t.needsApproval}</Tag>}
                    {c.blocked_reason && <Tag color={ui.danger}>{t.blocked}</Tag>}
                  </span>
                  <span style={{ display: 'block', fontSize: 13, color: ui.grey, marginTop: 2 }}>{c.reason}</span>
                  <span style={{ display: 'block', fontSize: 12, color: ui.grey }}>
                    {t.restSince} {fmt(c.rest_since)}
                    {c.distance_outside_m !== null && ` · ${Math.round(c.distance_outside_m)} m`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {openCase !== null && (
        <CaseDrawer caseId={openCase} simTime={simTime} onChanged={applyChange}
          onClose={() => setOpenCase(null)} />
      )}
    </div>
  )
}
