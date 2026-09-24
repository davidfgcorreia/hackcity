/** Shared field UI, styled after iOS / Apple Maps: system font, grouped cards, translucent
 *  materials, 44 px+ touch targets (sized for a gloved thumb). The presentation uses a fixed
 *  light palette, including when the phone requests dark mode. */
import type { CSSProperties, ReactNode } from 'react'

export const colors = {
  primary: '#0a84ff',
  danger: '#ff3b30',
  warn: '#ff9f0a',
  ok: '#34c759',
  grey: '#8e8e93',
  line: 'var(--f-line)',
  label: 'var(--f-label)',
  secondary: 'var(--f-secondary)',
  card: 'var(--f-card)',
  fill: 'var(--f-fill)',
  glass: 'var(--f-glass)',
}

export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif'

export const FIELD_CSS = `
.field-root { --f-bg:#f2f2f7; --f-card:#fff; --f-glass:rgba(255,255,255,.78); --f-label:#1c1c1e;
  --f-secondary:rgba(60,60,67,.6); --f-line:rgba(60,60,67,.14); --f-fill:rgba(118,118,128,.12);
  --f-shadow:0 8px 30px rgba(0,0,0,.14); color:var(--f-label); font-family:${FONT}; -webkit-font-smoothing:antialiased; }
.field-root button { font-family:inherit; -webkit-tap-highlight-color:transparent; }
.field-root button:active { transform:scale(.97); }
.glass { background:var(--f-glass); -webkit-backdrop-filter:saturate(180%) blur(20px); backdrop-filter:saturate(180%) blur(20px); box-shadow:var(--f-shadow); }
@keyframes puck-pulse { 0% { transform:scale(.6); opacity:.6 } 100% { transform:scale(2.4); opacity:0 } }
@keyframes pill-in { from { transform:translate(-50%,-12px); opacity:0 } to { transform:translate(-50%,0); opacity:1 } }
.maplibregl-ctrl-attrib { font-size:10px; }
`

type Tone = 'primary' | 'danger' | 'warn' | 'ok' | 'grey'

export function Button({ children, onClick, tone = 'primary', disabled, wide, type = 'button' }: {
  children: ReactNode; onClick?: () => void; tone?: Tone; disabled?: boolean; wide?: boolean
  type?: 'button' | 'submit'
}) {
  const filled = tone !== 'grey'
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{
        background: disabled ? colors.fill : filled ? colors[tone] : colors.fill,
        color: disabled ? colors.grey : filled ? '#fff' : colors.primary,
        border: 'none', borderRadius: 14, padding: '13px 16px', fontSize: 17, fontWeight: 600,
        minHeight: 50, width: wide ? '100%' : undefined, cursor: disabled ? 'default' : 'pointer',
        letterSpacing: -0.2,
      }}>
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'grey' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span style={{
      background: colors[tone], color: '#fff', borderRadius: 999, padding: '3px 9px',
      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', fontSize: 15, borderBottom: `0.5px solid ${colors.line}` }}>
      <span style={{ color: colors.secondary, minWidth: 116 }}>{label}</span>
      <span style={{ fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  )
}

export const inputStyle: CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 17, borderRadius: 12, border: 'none',
  background: 'var(--f-fill)', color: 'var(--f-label)', boxSizing: 'border-box', fontFamily: FONT,
}

/** Modal card sheet (stop detail, found-bike form), like an Apple Maps place card. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.28)', zIndex: 1200,
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} className="glass" style={{
        width: '100%', maxHeight: '90dvh', overflowY: 'auto', borderRadius: '22px 22px 0 0',
        padding: '8px 18px 18px', paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ width: 36, height: 5, borderRadius: 3, background: colors.grey, opacity: 0.4, margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.4 }}>{title}</h2>
          <button onClick={onClose} aria-label="close" style={{
            border: 'none', background: colors.fill, color: colors.secondary, width: 32, height: 32, borderRadius: 16,
            fontSize: 18, lineHeight: 1, cursor: 'pointer', flexShrink: 0,
          }}>✕</button>
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

/** 150 m · 1,2 km (Portuguese decimal comma) */
export const fmtDistance = (m: number | null | undefined) =>
  m == null ? '—' : m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`

export const fmtDuration = (s: number | null | undefined) =>
  s == null ? '—' : s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`

export const fmtClock = (secondsFromNow: number) =>
  new Date(Date.now() + secondsFromNow * 1000).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
