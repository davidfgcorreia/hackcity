/** T-E2/E3/E4: everything a reviewer needs about one case (ops req §8).
 *
 *  It shows the evidence timeline, the station boundary distance and the 120-minute
 *  calculation behind the decision; it lets staff correct a position or status, approve a
 *  field-found bicycle, block or unblock a stop, and export the evidence record. Every change
 *  carries an actor and a reason, and the timeline keeps the previous values (ER-10).
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ApiError, api } from '../../api'
import { useT } from '../../i18n'
import { CASE_STATUSES, type Case, type CaseDetail, type CaseEvent, type CaseStatus } from '../../types'
import { ABANDON_MINUTES, BUFFER_M, Button, STATUS_COLOR, Tag, fmt, inputStyle, ui } from './ui'

const ACTOR_KEY = 'review:actor'

export function CaseDrawer({ caseId, simTime, onClose, onChanged }: {
  caseId: number
  simTime: string | null
  onClose: () => void
  onChanged: (updated: Case) => void
}) {
  const t = useT()
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [actor, setActor] = useState(() => {
    try { return localStorage.getItem(ACTOR_KEY) ?? '' } catch { return '' }
  })
  const [reason, setReason] = useState('')
  const [form, setForm] = useState<{ lat: string; lng: string; status: '' | CaseStatus }>({ lat: '', lng: '', status: '' })
  const [showCorrect, setShowCorrect] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api.caseDetail(caseId).then(setDetail).catch(() => setError('load'))
  }, [caseId])

  useEffect(() => {
    setDetail(null)
    setShowCorrect(false)
    setError(null)
    load()
  }, [caseId, load])

  useEffect(() => {
    try { localStorage.setItem(ACTOR_KEY, actor) } catch { /* storage blocked */ }
  }, [actor])

  async function act(run: () => Promise<Case>, needsReason: boolean) {
    if (!actor.trim() || (needsReason && !reason.trim())) {
      setError(t.reasonRequired)
      return
    }
    setBusy(true)
    setError(null)
    try {
      onChanged(await run())
      setReason('')
      setShowCorrect(false)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.body || err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function exportCase() {
    try {
      const record = await api.exportCase(caseId, actor.trim() || undefined)
      const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `case-${caseId}.json`
      link.click()
      URL.revokeObjectURL(url)
      load() // the export itself is an entry in the timeline
    } catch (err) {
      setError(err instanceof ApiError ? err.body || err.message : String(err))
    }
  }

  if (!detail) {
    return <Panel onClose={onClose} title={t.detail}><p style={{ color: ui.grey }}>{t.loading}</p></Panel>
  }

  // The 120-minute rule, measured against the moment the reviewer is looking at (T-E2).
  const reference = simTime ?? detail.updated_at
  const minutes = detail.rest_since
    ? Math.round((Date.parse(reference) - Date.parse(detail.rest_since)) / 60000)
    : null
  const ruleMet = minutes !== null && minutes > ABANDON_MINUTES

  return (
    <Panel onClose={onClose} title={`${t.detail} #${detail.id}`}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ fontSize: 16 }}>{detail.device_id}</strong>
        <Tag color={STATUS_COLOR[detail.status]}>{t.status[detail.status]}</Tag>
        <Tag color={ui.grey}>{detail.source}</Tag>
        {detail.needs_approval && <Tag color={ui.warn}>{t.needsApproval}</Tag>}
        {detail.blocked_reason && <Tag color={ui.danger}>{t.blocked}</Tag>}
      </div>

      <Section title={t.ruleCalc}>
        <Line label={t.restSince} value={fmt(detail.rest_since)} />
        <Line label={simTime ? t.simClock : t.recordedAt} value={fmt(reference)} />
        <Line label={t.parkedFor}
          value={minutes === null ? t.noData : `${minutes} ${t.minutesShort} (${t.threshold} ${ABANDON_MINUTES})`} />
        <div style={{ marginTop: 4 }}>
          <Tag color={ruleMet ? ui.ok : ui.grey}>{ruleMet ? t.ruleMet : t.ruleNotMet}</Tag>
        </div>
      </Section>

      <Section title={t.boundaryDistance}>
        <Line label={t.outsideBy}
          value={detail.distance_outside_m === null ? t.noData : `${Math.round(detail.distance_outside_m)} m`} />
        <p style={{ fontSize: 12, color: ui.grey, margin: '4px 0 0' }}>
          {`+${BUFFER_M} m`} — {t.boundaryDistance.toLowerCase()} (EPSG:3763)
        </p>
        <Line label={t.lastSeen} value={`${detail.lat.toFixed(5)}, ${detail.lng.toFixed(5)}`} />
      </Section>

      <Section title={t.reason}>
        <p style={{ margin: 0 }}>{detail.reason || t.noData}</p>
        {detail.blocked_reason && (
          <p style={{ margin: '6px 0 0', color: ui.danger, fontWeight: 600 }}>{detail.blocked_reason}</p>
        )}
      </Section>

      <Section title={t.correct}>
        <label style={{ fontSize: 12, color: ui.grey }}>{t.actor}</label>
        <input value={actor} onChange={(e) => setActor(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
        <label style={{ fontSize: 12, color: ui.grey }}>{t.reasonLabel}</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {detail.needs_approval && (
            <Button small tone="ok" disabled={busy}
              onClick={() => act(() => api.approveCase(detail.id, actor.trim()), false)}>
              {t.approve}
            </Button>
          )}
          {detail.blocked_reason ? (
            <Button small tone="grey" disabled={busy}
              onClick={() => act(() => api.correctCase(detail.id, { actor: actor.trim(), reason: reason.trim(), blocked_reason: null }), true)}>
              {t.unblock}
            </Button>
          ) : (
            <Button small tone="danger" disabled={busy}
              onClick={() => act(() => api.correctCase(detail.id, { actor: actor.trim(), reason: reason.trim(), blocked_reason: reason.trim() }), true)}>
              {t.block}
            </Button>
          )}
          <Button small tone="primary" onClick={() => setShowCorrect(!showCorrect)}>{t.correct}…</Button>
          <Button small tone="grey" onClick={exportCase}>{t.export}</Button>
        </div>

        {showCorrect && (
          <div style={{ marginTop: 10, borderTop: `1px solid ${ui.line}`, paddingTop: 8 }}>
            <label style={{ fontSize: 12, color: ui.grey }}>{t.newPosition}</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input placeholder={String(detail.lat)} value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })} style={inputStyle} />
              <input placeholder={String(detail.lng)} value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })} style={inputStyle} />
            </div>
            <label style={{ fontSize: 12, color: ui.grey }}>{t.newStatus}</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CaseStatus | '' })}
              style={{ ...inputStyle, marginBottom: 8 }}>
              <option value="">{t.none}</option>
              {CASE_STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
            </select>
            <Button small disabled={busy} onClick={() => act(() => api.correctCase(detail.id, {
              actor: actor.trim(),
              reason: reason.trim(),
              ...(form.lat ? { lat: Number(form.lat) } : {}),
              ...(form.lng ? { lng: Number(form.lng) } : {}),
              ...(form.status ? { status: form.status } : {}),
            }), true)}>
              {t.save}
            </Button>
          </div>
        )}

        {error && <p role="alert" style={{ color: ui.danger, fontWeight: 600, marginBottom: 0 }}>{error}</p>}
      </Section>

      <Section title={`${t.timeline} (${detail.timeline.length})`}>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {detail.timeline.map((ev) => <TimelineEntry key={ev.id} ev={ev} />)}
        </ol>
      </Section>
    </Panel>
  )
}

function TimelineEntry({ ev }: { ev: CaseEvent }) {
  const t = useT()
  const before = ev.detail?.before as Record<string, unknown> | undefined
  const after = ev.detail?.after as Record<string, unknown> | undefined
  const note = typeof ev.detail?.reason === 'string' ? ev.detail.reason : null
  return (
    <li style={{ borderLeft: `2px solid ${ui.line}`, paddingLeft: 10, margin: '0 0 10px' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>{ev.kind}</strong>
        <span style={{ fontSize: 12, color: ui.grey }}>{ev.actor}</span>
        <span style={{ fontSize: 12, color: ui.grey, marginLeft: 'auto' }}>
          {t.eventTime} {fmt(ev.event_time)} · {t.recordedAt} {fmt(ev.recorded_at)}
        </span>
      </div>
      {before && after ? (
        <div style={{ fontSize: 12 }}>
          {note && <div style={{ marginBottom: 2 }}>{note}</div>}
          {Object.keys(after).map((k) => (
            <div key={k} style={{ fontFamily: 'ui-monospace, monospace' }}>
              {k}: <s style={{ color: ui.grey }}>{fmtValue(before[k])}</s> → <b>{fmtValue(after[k])}</b>
            </div>
          ))}
        </div>
      ) : (
        Object.keys(ev.detail ?? {}).length > 0 && (
          <div style={{ fontSize: 12, color: ui.grey, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>
            {Object.entries(ev.detail).map(([k, v]) => `${k}=${fmtValue(v)}`).join(' · ')}
          </div>
        )
      )}
    </li>
  )
}

const fmtValue = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ borderTop: `1px solid ${ui.line}`, padding: '10px 0' }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4, color: ui.grey, margin: '0 0 6px' }}>{title}</h3>
      {children}
    </section>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 14 }}>
      <span style={{ color: ui.grey, minWidth: 150 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '100vw', background: '#fff',
      boxShadow: '-2px 0 12px rgba(0,0,0,.2)', zIndex: 1100, overflowY: 'auto', padding: 16,
      fontFamily: 'system-ui',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>{title}</h2>
        <button onClick={onClose} aria-label="close"
          style={{ border: 'none', background: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
      </div>
      {children}
    </aside>
  )
}
