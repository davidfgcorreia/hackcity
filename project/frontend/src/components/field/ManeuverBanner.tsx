/** Top navigation card: maneuver arrow, distance to it, instruction (pt-PT / en), street. */
import osrmTextInstructions from 'osrm-text-instructions'
import type { RouteStep } from '../../types'
import { fmtDistance } from './ui'

const text = osrmTextInstructions('v5')

function arrow(step: RouteStep | null): string {
  const t = step?.maneuver.type ?? 'continue'
  const m = step?.maneuver.modifier ?? 'straight'
  if (t === 'arrive') return 'arrive'
  if (t === 'roundabout' || t === 'rotary' || t === 'exit roundabout' || t === 'exit rotary' || t === 'roundabout turn') return 'roundabout'
  return m.replace(' ', '-')
}

const PATHS: Record<string, string> = {
  straight: 'M12 21V5M12 5l-6 6M12 5l6 6',
  'slight-right': 'M8 21v-7a5 5 0 0 1 5-5h4M17 9l-4-4M17 9l-4 4',
  right: 'M6 21v-8a4 4 0 0 1 4-4h10M20 9l-5-5M20 9l-5 5',
  'sharp-right': 'M6 21V7M6 7l12 11M18 18h-6M18 18v-6',
  'slight-left': 'M16 21v-7a5 5 0 0 0-5-5H7M7 9l4-4M7 9l4 4',
  left: 'M18 21v-8a4 4 0 0 0-4-4H4M4 9l5-5M4 9l5 5',
  'sharp-left': 'M18 21V7M18 7L6 18M6 18h6M6 18v-6',
  uturn: 'M16 21V9a5 5 0 0 0-10 0v3M6 12l-3-3M6 12l3-3',
  roundabout: 'M12 21v-5M12 16a4 4 0 1 1 4-4M16 12l3-3M16 12l3 3',
  arrive: 'M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
}

export function ManeuverIcon({ step, size = 44 }: { step: RouteStep | null; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[arrow(step)] ?? PATHS.straight} />
    </svg>
  )
}

export function instruction(step: RouteStep | null, lang: string, stopName?: string): string {
  if (!step) return ''
  if (step.maneuver.type === 'arrive' && stopName) return stopName
  try {
    return text.compile(lang === 'pt' ? 'pt-PT' : 'en', step)
  } catch {
    return step.name ?? ''
  }
}

export function ManeuverBanner({ next, distanceM, lang, stopName, then, straightLine, straightLineText }: {
  next: RouteStep | null
  distanceM: number | null
  lang: string
  stopName?: string
  then?: RouteStep | null
  straightLine?: boolean
  straightLineText: string
}) {
  const street = next?.maneuver.type === 'arrive' ? null : next?.name || next?.ref
  return (
    <div style={{ position: 'absolute', top: 'calc(10px + env(safe-area-inset-top))', left: 10, right: 10, zIndex: 20 }}>
      <div style={{ background: 'rgba(28,28,30,.92)', WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)',
        color: '#fff', borderRadius: 20, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'center',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: '#0a84ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ManeuverIcon step={straightLine ? null : next} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.05 }}>{fmtDistance(distanceM)}</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {straightLine ? straightLineText : instruction(next, lang, stopName)}
          </div>
          {street && !straightLine && <div style={{ fontSize: 14, color: 'rgba(235,235,245,.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{street}</div>}
        </div>
      </div>
      {then && !straightLine && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, marginLeft: 8, background: 'rgba(28,28,30,.85)',
          color: '#fff', borderRadius: 12, padding: '5px 10px', fontSize: 14, fontWeight: 600 }}>
          {lang === 'pt' ? 'Depois' : 'Then'} <ManeuverIcon step={then} size={18} />
        </div>
      )}
    </div>
  )
}
