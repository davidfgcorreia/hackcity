/** T-D3: what the operator sees and records at a stop (ops req §7).
 *
 *  Shows the case reference, the bicycle identifier, the last known position and time, the
 *  reason the case exists and any uncertainty, then takes one of the seven outcomes. A pickup
 *  is refused locally without a bicycle ID and a photo (ER-7) — the API refuses it too.
 */
import { useEffect, useRef, useState } from 'react'
import { ApiError, api, type SubmitResult } from '../../api'
import { useT } from '../../i18n'
import { OUTCOMES, type Case, type Outcome, type Stop } from '../../types'
import { Badge, Button, Row, Sheet, colors, fmtTime, inputStyle, minutesSince } from './ui'
import type { FieldPosition } from './useGeolocation'

const DESTRUCTIVE: Outcome[] = ['unsafe', 'inaccessible', 'unable_to_load']

/** Presentation autoplay (`/field?sim`): pick a sample photo, type a description, then record the pickup. */
export type StopAutoplay = { photoUrl: string; description: string }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function StopSheet({ stop, subject, actor, position, onDone, onClose, autoplay }: {
  autoplay?: StopAutoplay
  stop: Stop
  subject?: Case
  actor: string
  position: FieldPosition | null
  onDone: (result: SubmitResult, outcome: Outcome) => void
  onClose: () => void
}) {
  const t = useT()
  const [deviceId, setDeviceId] = useState(subject?.device_id ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [demoStep, setDemoStep] = useState<'photo' | 'notes' | 'submit' | null>(null)
  const photoRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const submitRef = useRef<(o: Outcome) => void>(() => {})

  useEffect(() => {
    if (!photo) return setPreview(null)
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  // Autoplay runs once per opened stop: each step is highlighted so the audience can follow it.
  useEffect(() => {
    if (!autoplay || stop.kind === 'depot') return
    let alive = true
    ;(async () => {
      await wait(1200)
      if (!alive) return
      setDemoStep('photo')
      photoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const blob = await fetch(autoplay.photoUrl).then((r) => r.blob())
      await wait(900)
      if (!alive) return
      const file = new File([blob], autoplay.photoUrl.split('/').pop() ?? 'demo-photo.svg', { type: blob.type })
      // Put it in the real input too, so the field shows the chosen file as a manual selection would.
      try { const dt = new DataTransfer(); dt.items.add(file); if (fileRef.current) fileRef.current.files = dt.files } catch { /* older browsers */ }
      setPhoto(file)
      await wait(1300)
      if (!alive) return
      setDemoStep('notes')
      notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      for (let i = 1; i <= autoplay.description.length && alive; i++) {
        setNotes(autoplay.description.slice(0, i))
        await wait(38)
      }
      await wait(900)
      if (!alive) return
      setDemoStep('submit')
      document.querySelector('[data-demo-submit]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      await wait(1100)
      if (alive) submitRef.current('picked_up')
    })()
    return () => { alive = false }
  }, [autoplay, stop.id, stop.kind])

  if (stop.kind === 'depot') {
    return (
      <Sheet title={t.depot} onClose={onClose}>
        <Row label={t.lastSeen}>{stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}</Row>
        <p style={{ color: colors.grey, fontSize: 14 }}>
          {t.route} → {t.depot}. {t.stops}: #{stop.seq}.
        </p>
        <Button wide onClick={onClose}>{t.close}</Button>
      </Sheet>
    )
  }

  const parkedMin = subject ? minutesSince(subject.rest_since, Date.parse(subject.updated_at)) : null
  const pickupReady = Boolean(deviceId.trim() && photo)

  const highlight = (step: typeof demoStep) => demoStep === step
    ? { outline: `3px solid ${colors.primary}`, outlineOffset: 3, borderRadius: 12, transition: 'outline .2s' } : {}

  submitRef.current = (o: Outcome) => { void submit(o) }
  async function submit(outcome: Outcome) {
    if (outcome === 'picked_up' && !pickupReady) {
      setError(t.pickupNeedsIdAndPhoto)
      return
    }
    setError(null)
    setBusy(outcome)
    try {
      const result = await api.recordOutcome(stop.id, {
        outcome,
        actor,
        // The actual position is where the van is, which may differ from the planned stop.
        lat: position?.lat ?? stop.lat,
        lng: position?.lng ?? stop.lng,
        device_id: deviceId.trim() || undefined,
        notes: notes.trim() || undefined,
        photo: photo ?? undefined,
      })
      onDone(result, outcome)
    } catch (err) {
      setError(err instanceof ApiError ? err.body || err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet title={`${t.stop} #${stop.seq} · ${subject?.device_id ?? `${t.caseRef} ${stop.case_id}`}`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {subject?.status === 'uncertain' && <Badge tone="warn">{t.uncertain}</Badge>}
        {subject?.needs_approval && <Badge tone="warn">{t.needsApproval}</Badge>}
        {subject?.blocked_reason && <Badge tone="danger">{t.blocked}</Badge>}
        {subject && <Badge tone="grey">{t.status[subject.status]}</Badge>}
      </div>

      {subject && (
        <div style={{ borderBottom: `1px solid ${colors.line}`, paddingBottom: 8, marginBottom: 12 }}>
          <Row label={t.caseRef}>#{subject.id}</Row>
          <Row label={t.bike}>{subject.device_id}</Row>
          <Row label={t.lastSeen}>{subject.lat.toFixed(5)}, {subject.lng.toFixed(5)} · {fmtTime(subject.updated_at)}</Row>
          <Row label={t.restSince}>
            {fmtTime(subject.rest_since)}{parkedMin !== null && ` · ${t.parkedFor} ${parkedMin} ${t.minutesShort}`}
          </Row>
          {subject.distance_outside_m !== null && (
            <Row label={t.outsideBy}>{Math.round(subject.distance_outside_m)} m</Row>
          )}
          <Row label={t.reason}>{subject.reason}</Row>
          {subject.blocked_reason && <Row label={t.blocked}>{subject.blocked_reason}</Row>}
        </div>
      )}

      <label style={{ fontSize: 13, color: colors.grey }}>{t.bikeId}</label>
      <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}
        placeholder={subject?.device_id ?? 'bike-000'} autoComplete="off" />

      <div ref={photoRef} style={highlight('photo')}>
        <label style={{ fontSize: 13, color: colors.grey }}>{t.photo}</label>
        <input ref={fileRef} type="file" accept="image/*" capture="environment"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          style={{ ...inputStyle, marginBottom: 10, padding: 8 }} />
        {preview && <img src={preview} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />}
      </div>

      <label style={{ fontSize: 13, color: colors.grey }}>{t.notes}</label>
      <textarea ref={notesRef} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t.notesPlaceholder}
        style={{ ...inputStyle, marginBottom: 12, resize: 'vertical', ...highlight('notes') }} />

      {error && (
        <p role="alert" style={{ color: colors.danger, fontWeight: 600, margin: '0 0 10px' }}>{error}</p>
      )}

      <div style={{ fontSize: 13, color: colors.grey, marginBottom: 6 }}>{t.recordOutcome}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {OUTCOMES.map((o) => (
          <div key={o} data-demo-submit={o === 'picked_up' || undefined} style={o === 'picked_up' ? { gridColumn: '1 / -1', ...highlight('submit') } : undefined}>
            <Button wide onClick={() => submit(o)} disabled={busy !== null || (o === 'picked_up' && !pickupReady)}
              tone={o === 'picked_up' ? 'ok' : DESTRUCTIVE.includes(o) ? 'danger' : 'grey'}>
              {busy === o ? '…' : t.outcome[o]}
            </Button>
          </div>
        ))}
      </div>
      {!pickupReady && (
        <p style={{ fontSize: 13, color: colors.grey, marginTop: 8 }}>{t.pickupNeedsIdAndPhoto}</p>
      )}
    </Sheet>
  )
}
