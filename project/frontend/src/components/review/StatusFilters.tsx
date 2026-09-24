/** T-E1: one chip per case status with its count. Selecting none shows everything, which is
 *  what a reviewer opening the page wants (ops req §8). */
import { useT } from '../../i18n'
import { CASE_STATUSES, type CaseStatus } from '../../types'
import { STATUS_COLOR, ui } from './ui'

export function StatusFilters({ counts, active, onToggle, onClear, total }: {
  counts: Record<CaseStatus, number>
  active: Set<CaseStatus>
  onToggle: (status: CaseStatus) => void
  onClear: () => void
  total: number
}) {
  const t = useT()
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <Chip label={t.all} count={total} color={ui.grey} on={active.size === 0} onClick={onClear} />
      {CASE_STATUSES.map((s) => (
        <Chip key={s} label={t.status[s]} count={counts[s] ?? 0} color={STATUS_COLOR[s]}
          on={active.has(s)} onClick={() => onToggle(s)} />
      ))}
    </div>
  )
}

function Chip({ label, count, color, on, onClick }: {
  label: string; count: number; color: string; on: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{
      display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer',
      border: `1px solid ${on ? color : ui.line}`, background: on ? color : '#fff',
      color: on ? '#fff' : '#222', borderRadius: 999, padding: '4px 10px',
      fontSize: 13, fontWeight: 600, fontFamily: 'system-ui',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#fff' : color }} />
      {label}
      <span style={{ opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </button>
  )
}
