/** Apple-Maps-style draggable card with three detents: peek, half, full. */
import { useRef, useState, type ReactNode } from 'react'

export type Detent = 'peek' | 'half' | 'full'
const HEIGHT: Record<Detent, string> = { peek: '168px', half: '52dvh', full: '90dvh' }
const ORDER: Detent[] = ['peek', 'half', 'full']

export function BottomSheet({ detent, onDetent, peek, children }: {
  detent: Detent; onDetent: (d: Detent) => void; peek: ReactNode; children: ReactNode
}) {
  const start = useRef<{ y: number; h: number } | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const [dragH, setDragH] = useState<number | null>(null)

  const onDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, h: sheet.current!.getBoundingClientRect().height }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return
    setDragH(Math.max(120, Math.min(window.innerHeight * 0.92, start.current.h + start.current.y - e.clientY)))
  }
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return
    const moved = start.current.y - e.clientY
    const i = ORDER.indexOf(detent)
    if (Math.abs(moved) < 6) onDetent(ORDER[(i + 1) % ORDER.length])        // tap on the grabber cycles
    else onDetent(ORDER[Math.max(0, Math.min(2, i + (moved > 0 ? 1 : -1) * (Math.abs(moved) > 220 ? 2 : 1)))])
    start.current = null
    setDragH(null)
  }

  return (
    <div ref={sheet} className="glass" style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, borderRadius: '22px 22px 0 0',
      height: dragH ?? HEIGHT[detent], transition: dragH == null ? 'height .32s cubic-bezier(.2,.8,.2,1)' : 'none',
      display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        style={{ padding: '8px 0 4px', cursor: 'grab', touchAction: 'none', flexShrink: 0 }} aria-label="drag">
        <div style={{ width: 36, height: 5, borderRadius: 3, background: 'var(--f-secondary)', opacity: 0.5, margin: '0 auto' }} />
      </div>
      <div style={{ padding: '4px 16px 10px', flexShrink: 0 }}>{peek}</div>
      <div style={{ overflowY: detent === 'peek' ? 'hidden' : 'auto', flex: 1, padding: '0 16px 16px' }}>{children}</div>
    </div>
  )
}
