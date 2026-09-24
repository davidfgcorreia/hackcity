/** T-D2: the same route as a list, so a stop can be inspected without touching the map
 *  (ops req §7). */
import { useT } from '../../i18n'
import type { Case, Stop } from '../../types'
import { Badge, colors, fmtClock, fmtDuration, fmtTime } from './ui'

export function StopList({ stops, cases, onSelect }: {
  stops: Stop[]
  cases: Case[]
  onSelect: (stop: Stop) => void
}) {
  const t = useT()
  const visible = stops.filter((s) => s.status !== 'removed')

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: colors.card, borderRadius: 14, overflow: 'hidden' }}>
      {visible.map((s) => {
        const c = cases.find((x) => x.id === s.case_id)
        const done = s.status === 'done'
        return (
          <li key={s.id}>
            <button onClick={() => onSelect(s)} style={{
              display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', color: 'inherit',
              borderBottom: `0.5px solid ${colors.line}`, padding: '12px 14px', cursor: 'pointer',
              opacity: done ? 0.55 : 1, minHeight: 56,
            }}>
              <span style={{
                width: 30, height: 30, flexShrink: 0, borderRadius: s.kind === 'depot' ? 6 : '50%',
                background: s.kind === 'depot' ? '#1c1c1e' : done ? colors.grey : colors.danger,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                font: '700 14px system-ui',
              }}>{s.kind === 'depot' ? '■' : s.seq}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>
                  {s.kind === 'depot' ? t.depot : c?.device_id ?? `${t.caseRef} ${s.case_id}`}
                </span>
                {s.eta_s != null && s.status === 'planned' && (
                  <span style={{ display: 'block', fontSize: 13, color: colors.primary, fontWeight: 600 }}>
                    {fmtDuration(s.eta_s)} · {fmtClock(s.eta_s)}
                  </span>
                )}
                {c && (
                  <span style={{ display: 'block', fontSize: 13, color: colors.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.caseRef} #{c.id} · {fmtTime(c.rest_since)}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {c?.status === 'uncertain' && <Badge tone="warn">{t.uncertain}</Badge>}
                {c?.blocked_reason && <Badge tone="danger">{t.blocked}</Badge>}
                {done && <Badge tone="ok">{s.outcome ? t.outcome[s.outcome] : t.done}</Badge>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
