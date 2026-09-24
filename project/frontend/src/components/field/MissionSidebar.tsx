import { useState } from 'react'
import type { Mission, Stop } from '../../types'
import type { Lang } from '../../i18n'
import type { NavState } from './useNavigation'
import { colors, fmtDistance, fmtDuration } from './ui'

/** First stop: remaining from the van. Later stops: the extra driving leg from the previous stop. */
export function stopEstimate(mission: Mission, nav: NavState, stops: Stop[], index: number): { seconds: number | null; metres: number | null } {
  const legs = mission.route_legs ?? []
  if (index < nav.legIndex) return { seconds: 0, metres: 0 }
  const leg = legs[index]
  const eta = stops[index]?.eta_s
  const previousEta = stops[index - 1]?.eta_s
  const seconds: number | null = index === nav.legIndex
    ? nav.toStopS ?? leg?.duration_s ?? eta ?? null
    : leg?.duration_s ?? (eta != null && previousEta != null ? eta - previousEta : null)
  const metres: number | null = index === nav.legIndex ? nav.toStopM ?? leg?.distance_m ?? null : leg?.distance_m ?? null
  return { seconds: seconds == null ? null : Math.max(0, seconds), metres: metres == null ? null : Math.max(0, metres) }
}

export function MissionSidebar({ mission, nav, lang, statusVisible, onSelect }: {
  mission: Mission
  nav: NavState
  lang: Lang
  statusVisible: boolean
  onSelect: (stop: Stop) => void
}) {
  const [open, setOpen] = useState(false)
  const bikes = mission.stops.filter(s => s.status === 'planned').sort((a, b) => a.seq - b.seq)
  const pickupCount = bikes.filter(s => s.kind !== 'depot').length
  const en = lang === 'en'
  return <aside aria-label={en ? 'Mission stops' : 'Paragens da missão'} className="glass" style={{
    position: 'absolute', zIndex: 24, left: 10, top: `calc(${statusVisible ? 196 : 160}px + env(safe-area-inset-top))`,
    width: open ? 'min(300px, calc(100vw - 84px))' : 52,
    maxHeight: `calc(100dvh - ${statusVisible ? 456 : 420}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`,
    overflow: 'hidden', borderRadius: 17, transition: 'width .2s ease',
  }}>
    <button aria-label={open ? (en ? 'Collapse mission sidebar' : 'Recolher barra da missão') : (en ? 'Expand mission sidebar' : 'Expandir barra da missão')}
      aria-expanded={open} onClick={() => setOpen(v => !v)} style={{ width: '100%', minHeight: 52, border: 0, background: 'transparent',
        color: colors.primary, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', cursor: 'pointer', fontWeight: 700, fontSize: 15,
        whiteSpace: 'nowrap', textAlign: 'left' }}>
      <span aria-hidden="true" style={{ fontSize: 23, lineHeight: 1 }}>{open ? '‹' : '☰'}</span>
      {open && <span>{en ? 'Mission' : 'Missão'} · {pickupCount} {en ? 'bikes' : 'bicicletas'}</span>}
    </button>
    {open && <div style={{ overflowY: 'auto', maxHeight: `calc(100dvh - ${statusVisible ? 516 : 480}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`, borderTop: `1px solid ${colors.line}` }}>
      {pickupCount === 0 && <p style={{ padding: '0 14px', color: colors.secondary }}>{en ? 'No bikes on this mission' : 'Sem bicicletas nesta missão'}</p>}
      {bikes.map((stop, index) => {
        const depot = stop.kind === 'depot'
        const bikeNumber = bikes.slice(0, index + 1).filter(s => s.kind !== 'depot').length
        const estimate = stopEstimate(mission, nav, bikes, index)
        const extra = index > nav.legIndex ? '+' : ''
        return <button key={stop.id} onClick={() => onSelect(stop)} style={{ width: '100%', border: 0, borderBottom: `1px solid ${colors.line}`,
          background: 'transparent', textAlign: 'left', padding: '13px 14px', cursor: 'pointer', color: colors.label }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: depot ? colors.primary : colors.danger }}>{depot ? '⌂' : `${bikeNumber}.`}</span>{' '}
            {depot ? 'Complexo Multisserviços' : `${en ? 'Bicycle' : 'Bicicleta'} ${bikeNumber}`}
          </span>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: colors.secondary }}>
            <span>{en ? 'Time' : 'Tempo'} <b style={{ color: colors.label }}>{extra}{fmtDuration(estimate.seconds)}</b></span>
            <span>{en ? 'Distance' : 'Distância'} <b style={{ color: colors.label }}>{extra}{fmtDistance(estimate.metres)}</b></span>
          </span>
        </button>
      })}
    </div>}
  </aside>
}
