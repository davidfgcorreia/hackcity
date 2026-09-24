/** Shared bits of the field UI. Touch targets are sized for a gloved thumb on a phone. */
import type { CSSProperties, ReactNode } from 'react'

export const colors = {
  primary: '#0b5d7a',
  danger: '#d93025',
  warn: '#f4b400',
  ok: '#188038',
  grey: '#5f6368',
  line: '#ddd',
}

type Tone = keyof typeof colors

export function Button({ children, onClick, tone = 'primary', disabled, wide, type = 'button' }: {
  children: ReactNode; onClick?: () => void; tone?: Tone; disabled?: boolean; wide?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{
        background: disabled ? '#eee' : colors[tone], color: disabled ? '#999' : '#fff',
        border: 'none', borderRadius: 8, padding: '12px 14px', fontSize: 15, fontWeight: 600,
        minHeight: 48, width: wide ? '100%' : undefined, cursor: disabled ? 'default' : 'pointer',
      }}>
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'grey' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span style={{
      background: colors[tone], color: '#fff', borderRadius: 999, padding: '2px 8px',
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 14 }}>
      <span style={{ color: colors.grey, minWidth: 128 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{children}</span>
    </div>
  )
}

export const inputStyle: CSSProperties = {
  width: '100%', padding: 10, fontSize: 16, borderRadius: 8,
  border: `1px solid ${colors.line}`, boxSizing: 'border-box',
}

/** Bottom sheet — the stop detail and the found-bike form both use it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1200,
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#fff', width: '100%', maxHeight: '88dvh', overflowY: 'auto',
        borderRadius: '14px 14px 0 0', padding: 16, fontFamily: 'system-ui',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>{title}</h2>
          <button onClick={onClose} aria-label="close"
            style={{ border: 'none', background: 'none', fontSize: 26, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Event times are UTC in the source data; the suffix stays so nobody reads them as local. */
export const fmtTime = (iso: string | null | undefined) =>
  iso
    ? `${new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
    : '—'

export const minutesSince = (iso: string | null | undefined, reference = Date.now()) =>
  iso ? Math.round((reference - Date.parse(iso)) / 60000) : null
