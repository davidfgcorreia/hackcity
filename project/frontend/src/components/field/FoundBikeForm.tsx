/** T-D4: a bicycle the operator finds that is not on the route (ops req §7).
 *
 *  It opens a case with the operator's position as evidence, and says plainly that collection
 *  waits for a reviewer — the operator must not load it yet (ER-7).
 */
import { useState } from 'react'
import { ApiError, api } from '../../api'
import { useT } from '../../i18n'
import { Button, Sheet, colors, inputStyle } from './ui'
import type { FieldPosition } from './useGeolocation'

export function FoundBikeForm({ actor, position, onClose }: {
  actor: string
  position: FieldPosition | null
  onClose: () => void
}) {
  const t = useT()
  const [deviceId, setDeviceId] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!deviceId.trim() || !position) {
      setError(!position ? t.positionUnknown : t.bikeId)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await api.reportFieldCase({
        device_id: deviceId.trim(), lat: position.lat, lng: position.lng,
        notes: notes.trim() || undefined, actor,
      })
      setCreated(created.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.body || err.message : t.offline)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={t.foundBikeTitle} onClose={onClose}>
      {created !== null ? (
        <>
          <p style={{ background: '#fff4d6', border: `1px solid ${colors.warn}`, borderRadius: 8, padding: 12, fontWeight: 600 }}>
            {t.caseRef} #{created} — {t.awaitingApproval}
          </p>
          <Button wide onClick={onClose}>{t.close}</Button>
        </>
      ) : (
        <>
          <label style={{ fontSize: 13, color: colors.grey }}>{t.bikeId}</label>
          <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} autoComplete="off"
            style={{ ...inputStyle, marginBottom: 10 }} placeholder="bike-000" />

          <label style={{ fontSize: 13, color: colors.grey }}>{t.notes}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            style={{ ...inputStyle, marginBottom: 10, resize: 'vertical' }} />

          <p style={{ fontSize: 13, color: colors.grey, margin: '0 0 10px' }}>
            {t.myPosition}: {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : t.positionUnknown}
          </p>
          {error && <p role="alert" style={{ color: colors.danger, fontWeight: 600 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button wide tone="grey" onClick={onClose}>{t.cancel}</Button>
            <Button wide onClick={submit} disabled={busy || !deviceId.trim() || !position}>
              {busy ? '…' : t.report}
            </Button>
          </div>
          <p style={{ fontSize: 13, color: colors.grey, marginTop: 10 }}>{t.awaitingApproval}</p>
        </>
      )}
    </Sheet>
  )
}
