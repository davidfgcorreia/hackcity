/** Every layer must show source, observed range, retrieval date, coverage, sample size and
 *  data-quality status (requirements doc, "Common display and data rules"). This is that strip,
 *  plus the banner that fires while the file is still mock. */
import { useT } from '../../i18n'
import type { Evidence, Meta } from './types'
import { INK, STATUS } from './viz'

export const EVIDENCE_TONE: Record<Evidence, string> = {
  observed: STATUS.good,
  inferred_proxy: STATUS.warning,
  experimental_forecast: STATUS.serious,
  scenario: INK.muted,
}

export function EvidenceBadge({ evidence }: { evidence: Evidence }) {
  const t = useT()
  // Status colour never alone: the word is the signal, the dot only reinforces it.
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, color: INK.secondary }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: EVIDENCE_TONE[evidence], flexShrink: 0 }} />
      {t.evidence[evidence]}
    </span>
  )
}

export function ProvenanceBar({ meta, rowCount }: { meta: Meta; rowCount: number }) {
  const t = useT()
  return (
    <div style={{ fontFamily: 'system-ui' }}>
      {meta.status === 'mock' && (
        <div role="alert" style={{
          background: STATUS.warning, color: '#0b0b0b', padding: '8px 12px',
          fontWeight: 700, fontSize: 14,
        }}>
          ⚠ {t.mockBanner}
        </div>
      )}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap', padding: '6px 12px', fontSize: 12,
        color: INK.secondary, borderBottom: `1px solid ${INK.grid}`, background: INK.surface,
      }}>
        <span><b>{t.observedRange}</b> {meta.observed_from} → {meta.observed_to} ({meta.timezone_display})</span>
        <span><b>{t.coverage}</b> {meta.coverage}</span>
        <span><b>{t.grid}</b> {meta.grid.cell_m} m · {meta.grid.crs}</span>
        <span><b>{t.sampleSize}</b> {rowCount}</span>
        <span>
          <b>{t.sources}</b>{' '}
          {meta.sources.map((s) => `${s.name} (${s.rows.toLocaleString('pt-PT')}, ${s.retrieved})`).join(' · ')}
        </span>
      </div>
    </div>
  )
}
