/** T-E5: the demo control bar (docs/operations_requirements.md §9). Demo-critical.
 *
 *  It shows which clock operations run on (live GBFS feed or replay) and switches between them.
 *  In replay it drives the replay clock the whole story is told on: start, pause, a manual +30 min
 *  step, the simulated clock, and the speed. Everything on screen comes from the simulated moment,
 *  never from events after it. "Back to live" resumes the feed (the backend pauses the replay).
 */
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { useT } from '../../i18n'
import type { LiveState, OpsMode, ReplayState } from '../../types'
import { Button, Tag, inputStyle, ui } from './ui'

const SPEEDS = [60, 360, 1800]
const POLL_MS = 2000

export function ReplayBar({ onChange }: { onChange?: (state: ReplayState, mode: OpsMode) => void }) {
  const t = useT()
  const [state, setState] = useState<ReplayState | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [speedChoice, setSpeedChoice] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  /** Live when the feed is polling; otherwise the replay clock (running, paused or not started) is in charge. */
  const mode: OpsMode = live?.running ? 'live' : 'replay'
  const lastMode = useRef<OpsMode | null>(null)

  const apply = (next: ReplayState, nextLive: LiveState | null) => {
    setState(next)
    setLive(nextLive)
    setError(false)
    const nextMode: OpsMode = nextLive?.running ? 'live' : 'replay'
    lastMode.current = nextMode
    onChangeRef.current?.(next, nextMode)
  }

  useEffect(() => {
    let alive = true
    const load = () =>
      Promise.all([api.replay.state(), api.live.state()])
        .then(([s, l]) => {
          if (!alive) return
          setState(s); setLive(l); setError(false)
          // Another tab or `make demo` can switch the mode; tell the page so it refetches cases.
          const nextMode: OpsMode = l.running ? 'live' : 'replay'
          if (lastMode.current !== nextMode) { lastMode.current = nextMode; onChangeRef.current?.(s, nextMode) }
        })
        .catch(() => { if (alive) setError(true) })
    load()
    const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  /** Runs a replay action; the feed is re-read because starting or stepping the replay pauses live. */
  async function backToLive() {
    setBusy(true)
    try {
      const nextLive = await api.live.start()
      apply(await api.replay.state(), nextLive)
      setOpen(false)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  async function run(action: () => Promise<ReplayState>) {
    setBusy(true)
    try {
      const next = await action()
      apply(next, await api.live.state().catch(() => live))
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
      <Tag color={mode === 'live' ? ui.ok : ui.primary}>{mode === 'live' ? `● ${t.liveMode}` : t.replayMode}</Tag>

      {mode === 'live' && (
        <span style={{ color: ui.grey }}>
          {t.liveFeed} · {t.lastPoll} {live?.last_poll ? new Date(live.last_poll).toLocaleTimeString('pt-PT') : '—'} · {live?.vehicles_in_feed ?? 0} 🚲
        </span>
      )}
      {mode === 'live' && (
        <span style={{ marginLeft: 'auto' }}>
          <Button small tone="grey" onClick={() => setOpen(!open)}>{open ? t.hideReplay : t.startReplay}</Button>
        </span>
      )}

      {(mode === 'replay' || open) && <>
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
        {mode === 'replay' && <Button small tone="ok" disabled={busy} onClick={backToLive}>{t.backToLive}</Button>}
      </span>
      </>}

      {error && <span style={{ color: ui.danger, fontSize: 13 }}>/api/replay · /api/live ✕</span>}

      {/* What the detector changed on the last ticks — the story the demo is telling. */}
      {mode === 'replay' && state?.last_changes?.length ? (
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
