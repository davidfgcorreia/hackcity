/** T-E5: the demo control bar (docs/operations_requirements.md §9). Demo-critical.
 *
 *  It drives the replay clock the whole story is told on: start, pause, a manual +30 min step,
 *  the simulated clock, and the speed. Everything on screen comes from the simulated moment,
 *  never from events after it.
 */
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { useT } from '../../i18n'
import type { ReplayState } from '../../types'
import { Button, Tag, inputStyle, ui } from './ui'

const SPEEDS = [60, 360, 1800]
const POLL_MS = 2000

export function ReplayBar({ onChange }: { onChange?: (state: ReplayState) => void }) {
  const t = useT()
  const [state, setState] = useState<ReplayState | null>(null)
  const [from, setFrom] = useState('')
  const [speedChoice, setSpeedChoice] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const apply = (next: ReplayState) => {
    setState(next)
    setError(false)
    onChangeRef.current?.(next)
  }

  useEffect(() => {
    let alive = true
    const load = () =>
      api.replay.state()
        .then((s) => { if (alive) { setState(s); setError(false) } })
        .catch(() => { if (alive) setError(true) })
    load()
    const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  async function run(action: () => Promise<ReplayState>) {
    setBusy(true)
    try {
      apply(await action())
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const simTime = state?.sim_time ?? null
  const speed = speedChoice ?? state?.speed ?? SPEEDS[1]

  /** Applying a speed while paused would restart the clock, so it waits for the next start. */
  function chooseSpeed(next: number) {
    setSpeedChoice(next)
    if (state?.running) run(() => api.replay.start(undefined, next))
  }

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      padding: '8px 12px', borderBottom: `1px solid ${ui.line}`, background: ui.panel,
      fontFamily: 'system-ui', fontSize: 14,
    }}>
      <strong style={{ color: ui.primary }}>{t.replay}</strong>

      <Tag color={state?.running ? ui.ok : ui.grey}>{state?.running ? '▶' : '⏸'}</Tag>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: ui.grey }}>{t.simClock}: </span>
        <strong>{simTime ? `${new Date(simTime).toLocaleString('pt-PT', { timeZone: 'UTC' })} UTC` : t.notStarted}</strong>
      </span>

      {!simTime && (
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', color: ui.grey }}>
          {t.from} (UTC)
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)}
            style={{ ...inputStyle, width: 200 }} />
        </label>
      )}

      <label style={{ display: 'flex', gap: 4, alignItems: 'center', color: ui.grey }}>
        {t.speed}
        <select value={speed} onChange={(e) => chooseSpeed(Number(e.target.value))}
          style={{ padding: 4, borderRadius: 6 }}>
          {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
      </label>

      <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        {state?.running ? (
          <Button small tone="grey" disabled={busy} onClick={() => run(api.replay.pause)}>{t.pause}</Button>
        ) : (
          <Button small disabled={busy || (!simTime && !from)}
            onClick={() => run(() => api.replay.start(from ? `${from}:00Z` : undefined, speed))}>
            {t.start}
          </Button>
        )}
        <Button small tone="grey" disabled={busy || !simTime} onClick={() => run(() => api.replay.step(30))}>
          {t.step30}
        </Button>
      </span>

      {error && <span style={{ color: ui.danger, fontSize: 13 }}>/api/replay ✕</span>}

      {/* What the detector changed on the last ticks — the story the demo is telling. */}
      {state?.last_changes?.length ? (
        <div style={{ flexBasis: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
          {state.last_changes.slice(0, 4).map((change, i) => (
            <span key={`${change}-${i}`} style={{
              background: i === 0 ? '#fff4d6' : '#fff', border: `1px solid ${ui.line}`,
              borderRadius: 6, padding: '2px 8px',
            }}>{change}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
