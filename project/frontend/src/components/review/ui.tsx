/** Shared bits of the desktop review UI. */
import type { CSSProperties, ReactNode } from 'react'
import type { CaseStatus } from '../../types'

export const STATUS_COLOR: Record<CaseStatus, string> = {
  candidate: '#9aa0a6', uncertain: '#f4b400', supported: '#fa7b17', eligible: '#d93025',
  assigned: '#a142f4', picked_up: '#188038', resolved: '#5f6368',
}

export const ui = {
  primary: '#0b5d7a',
  danger: '#d93025',
  warn: '#f4b400',
  ok: '#188038',
  grey: '#5f6368',
  line: '#e0e0e0',
  panel: '#fafafa',
}

/** Rule constants mirrored from backend/app/config.py for display only — the decision is
 *  always the backend's (docs/operations_requirements.md §4). The abandonment clock and its
 *  enforcement window come from /api/rules (src/enforcement.ts). */
export const BUFFER_M = 30

export function Button({ children, onClick, tone = 'primary', disabled, small, type = 'button' }: {
  children: ReactNode; onClick?: () => void; tone?: keyof typeof ui; disabled?: boolean
  small?: boolean; type?: 'button' | 'submit'
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{
        background: disabled ? '#eee' : ui[tone], color: disabled ? '#999' : '#fff', border: 'none',
        borderRadius: 6, padding: small ? '5px 9px' : '8px 12px', fontSize: small ? 13 : 14,
        fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
      }}>
      {children}
    </button>
  )
}

export function Tag({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 999, padding: '1px 8px',
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export const inputStyle: CSSProperties = {
  width: '100%', padding: 6, fontSize: 14, borderRadius: 6,
  border: `1px solid ${ui.line}`, boxSizing: 'border-box',
}

/** Event times are UTC in the source data; the suffix stays so nobody reads them as local. */
export const fmt = (iso: string | null | undefined) =>
  iso
    ? `${new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
    : '—'
