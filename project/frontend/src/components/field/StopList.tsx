/** T-D2: the same route as a list, so a stop can be inspected without touching the map
 *  (ops req §7). */
import { useT } from '../../i18n'
import type { Case, Stop } from '../../types'
import { Badge, colors, fmtTime } from './ui'

export function StopList({ stops, cases, onSelect }: {
  stops: Stop[]
  cases: Case[]
  onSelect: (stop: Stop) => void
}) {
  const t = useT()
  // A stop that has an outcome is off the route; the count of finished ones lives in the
  // summary bar instead, so the list only ever shows work still to do (ops req §5).
  const visible = stops.filter((s) => s.status === 'planned')

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontFamily: 'system-ui' }}>
      {visible.map((s) => {
        const c = cases.find((x) => x.id === s.case_id)
        return (
          <li key={s.id}>
            <button onClick={() => onSelect(s)} style={{
              display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left',
              background: '#fff', border: 'none',
              borderBottom: `1px solid ${colors.line}`, padding: 12, cursor: 'pointer',
            }}>
              <span style={{
                width: 30, height: 30, flexShrink: 0, borderRadius: s.kind === 'depot' ? 6 : '50%',
                background: s.kind === 'depot' ? '#333' : colors.danger,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                font: '700 14px system-ui',
              }}>{s.kind === 'depot' ? '■' : s.seq}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>
                  {s.kind === 'depot' ? t.depot : c?.device_id ?? `${t.caseRef} ${s.case_id}`}
                </span>
                {c && (
                  <span style={{ display: 'block', fontSize: 13, color: colors.grey, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.caseRef} #{c.id} · {fmtTime(c.rest_since)}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {c?.status === 'uncertain' && <Badge tone="warn">{t.uncertain}</Badge>}
                {c?.blocked_reason && <Badge tone="danger">{t.blocked}</Badge>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
