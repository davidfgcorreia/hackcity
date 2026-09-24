/** T-E6: the three pilot measures from ops req §10 — how much is open, how often the operator
 *  finds nothing, and how long eligibility takes to become a pickup. */
import { useT } from '../../i18n'
import type { Kpis } from '../../types'
import { ui } from './ui'

export function KpiStrip({ kpis }: { kpis: Kpis | null }) {
  const t = useT()
  const pct = (v: number | null) => (v === null ? t.noData : `${Math.round(v * 100)} %`)

  return (
    <div style={{
      display: 'flex', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${ui.line}`,
      fontFamily: 'system-ui', flexWrap: 'wrap',
    }}>
      <Metric label={t.openCases} value={kpis ? String(kpis.open_cases) : '—'}
        note={kpis ? `${kpis.picked_up_total} ${t.status.picked_up.toLowerCase()}` : undefined} />
      <Metric label={t.notFoundRate} value={kpis ? pct(kpis.not_found_rate) : '—'}
        note={kpis ? `${kpis.not_found_visits}/${kpis.visits_completed} ${t.visits}` : undefined}
        tone={kpis && kpis.not_found_rate !== null && kpis.not_found_rate > 0.25 ? ui.danger : undefined} />
      <Metric label={t.medianToPickup}
        value={kpis?.median_eligible_to_pickup_min != null ? `${kpis.median_eligible_to_pickup_min} ${t.minutesShort}` : t.noData} />
    </div>
  )
}

function Metric({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div style={{
      flex: '1 1 150px', background: ui.panel, border: `1px solid ${ui.line}`,
      borderRadius: 8, padding: '6px 10px',
    }}>
      <div style={{ fontSize: 12, color: ui.grey }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone ?? '#222', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: ui.grey }}>{note}</div>}
    </div>
  )
}
