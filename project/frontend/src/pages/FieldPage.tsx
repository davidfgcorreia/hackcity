import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type SubmitResult } from '../api'
import { FoundBikeForm } from '../components/field/FoundBikeForm'
import { RouteMap } from '../components/field/RouteMap'
import { StopList } from '../components/field/StopList'
import { StopSheet } from '../components/field/StopSheet'
import {
  cacheCases, cacheMission, cachedCases, cachedMission, onQueueChange, queuedCount,
} from '../components/field/offline'
import { Badge, Button, colors } from '../components/field/ui'
import { useGeolocation } from '../components/field/useGeolocation'
import { useT } from '../i18n'
import type { Case, Mission, Outcome, Stop } from '../types'

const OPERATORS = ['op1', 'op2'] // T-D1: stand-in for real sign-in (auth is out of MVP scope)
const OPERATOR_KEY = 'field:operator'
const POLL_MS = 5000
const REPLAN_COOLDOWN_MS = 30_000

/** Mobile field view: route map or list, stop sheet, found-bike report, offline queue. */
export function FieldPage() {
  const t = useT()
  const [operator, setOperator] = useState(() => {
    try { return localStorage.getItem(OPERATOR_KEY) ?? OPERATORS[0] } catch { return OPERATORS[0] }
  })
  const { position, live, error: geoError } = useGeolocation()

  const [mission, setMission] = useState<Mission | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [stale, setStale] = useState(false)      // showing the cached route, server unreachable
  const [banner, setBanner] = useState<string | null>(null)
  const [view, setView] = useState<'map' | 'list'>('map')
  const [selected, setSelected] = useState<Stop | null>(null)
  const [showFound, setShowFound] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, setPending] = useState(0)

  const version = useRef(0)
  const positionRef = useRef(position)
  const pendingRef = useRef(0)
  const lastReplan = useRef(0)
  positionRef.current = position
  pendingRef.current = pending

  useEffect(() => {
    try { localStorage.setItem(OPERATOR_KEY, operator) } catch { /* storage blocked */ }
  }, [operator])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  /** T-C1/T-C2: a mission is created on the operator's first request, from where they are. */
  const replanNow = useCallback(async () => {
    const at = positionRef.current
    if (!at) return
    lastReplan.current = Date.now()
    try {
      const next = await api.replan(operator, at.lat, at.lng)
      setMission(next)
      version.current = next.version
      cacheMission(operator, next)
    } catch { /* replan lands with T-C2; polling keeps showing whatever exists */ }
  }, [operator])

  // Poll the mission and its cases. A failed request must never blank the route (ER-8).
  useEffect(() => {
    version.current = 0
    setMission(cachedMission(operator))
    setCases(cachedCases(operator))

    let alive = true
    const load = async () => {
      try {
        const [nextMission, nextCases] = await Promise.all([api.mission(operator), api.cases()])
        if (!alive) return
        if (nextMission && version.current && nextMission.version !== version.current) {
          setBanner(nextMission.last_change ?? '')
        }
        version.current = nextMission?.version ?? 0
        setMission(nextMission)
        setCases(nextCases)
        setStale(false)
        cacheMission(operator, nextMission)
        // Only the cases on the route are cached: that is what the stop sheet needs offline,
        // and it keeps the whole case list out of a limited localStorage quota.
        const onRoute = new Set((nextMission?.stops ?? []).map((s) => s.case_id))
        cacheCases(operator, nextCases.filter((c) => onRoute.has(c.id)))
        if (pendingRef.current > 0) {
          const { sent } = await api.flushQueue()
          if (alive && sent > 0) setToast(`${t.synced} (${sent})`)
        }
        if (!nextMission && positionRef.current && Date.now() - lastReplan.current > REPLAN_COOLDOWN_MS) {
          await replanNow()
        }
      } catch {
        if (alive) setStale(true)
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
    // `t` only feeds a toast; leaving it out keeps a language switch from restarting the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator, replanNow])

  // Pending-sync badge + resend as soon as the connection is back (T-D5).
  useEffect(() => {
    const refresh = () => { queuedCount().then(setPending).catch(() => {}) }
    refresh()
    const off = onQueueChange(refresh)
    const onOnline = () => { api.flushQueue().then(refresh).catch(() => {}) }
    window.addEventListener('online', onOnline)
    return () => { off(); window.removeEventListener('online', onOnline) }
  }, [])

  const stops = mission?.stops ?? []
  const planned = stops.filter((s) => s.status === 'planned')
  const doneCount = stops.filter((s) => s.status === 'done').length
  const next = planned[0]
  const subjectFor = (stop: Stop | null) => cases.find((c) => c.id === stop?.case_id)
  const stopLabel = (stop?: Stop) =>
    !stop ? t.none : stop.kind === 'depot' ? t.depot : subjectFor(stop)?.device_id ?? `${t.caseRef} ${stop.case_id}`

  function handleOutcome(result: SubmitResult, outcome: Outcome) {
    const stop = selected
    setSelected(null)
    if (!result.queued) {
      setMission(result.mission)
      version.current = result.mission.version
      cacheMission(operator, result.mission)
      setToast(t.saved)
      return
    }
    // Queued offline: take the stop off the route locally so the operator moves on.
    setToast(t.savedOffline)
    setMission((current) => {
      if (!current || !stop) return current
      const updated = {
        ...current,
        stops: current.stops.map((s) => (s.id === stop.id ? { ...s, status: 'done', outcome } : s)),
      }
      cacheMission(operator, updated)
      return updated
    })
  }

  const offline = stale || pending > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', fontFamily: 'system-ui' }}>
      {/* The right edge is left clear: main.tsx floats the nav / language toggle over it. */}
      <header style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 150px 8px 12px', borderBottom: `1px solid ${colors.line}`, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: colors.grey }}>{t.operator}</label>
        <select value={operator} onChange={(e) => setOperator(e.target.value)}
          style={{ padding: 6, fontSize: 15, borderRadius: 6 }}>
          {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{ fontSize: 12, color: live ? colors.ok : colors.grey }}>
          {position ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` : geoError ? t.locationDenied : t.locating}
        </span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexBasis: '100%' }}>
          {pending > 0 && <Badge tone="warn">{pending} {t.pendingSync}</Badge>}
          {stale && <Badge tone="danger">{t.cachedRoute}</Badge>}
        </span>
      </header>

      {banner !== null && (
        <div onClick={() => setBanner(null)} role="status"
          style={{ background: colors.warn, padding: 12, fontWeight: 600, cursor: 'pointer' }}>
          {t.routeChanged}{banner ? `: ${banner}` : ''} · {t.next}: {stopLabel(next)}
        </div>
      )}
      {offline && (
        <div style={{ background: '#fdecea', color: '#a50e0e', padding: '6px 12px', fontSize: 13 }}>
          {stale ? t.offline : `${pending} ${t.pendingSync}`}
          <button onClick={() => api.flushQueue(true).then(({ sent }) => sent && setToast(`${t.synced} (${sent})`)).catch(() => {})}
            style={{ marginLeft: 8, border: 'none', background: 'none', color: colors.primary, fontWeight: 600, cursor: 'pointer' }}>
            {t.syncNow}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 12px', fontSize: 13, color: colors.grey, borderBottom: `1px solid ${colors.line}` }}>
        <span>{planned.length} {t.stops}</span>
        {doneCount > 0 && <span style={{ color: colors.ok, fontWeight: 600 }}>· {doneCount} {t.done}</span>}
        {mission?.total_km != null && <span>· {mission.total_km} {t.km}</span>}
        {mission && <span>· v{mission.version}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setView(view === 'map' ? 'list' : 'map')}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.line}`, background: '#fff', cursor: 'pointer' }}>
            {view === 'map' ? t.list : t.map}
          </button>
          <button onClick={replanNow} disabled={!position}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.line}`, background: '#fff', cursor: position ? 'pointer' : 'default' }}>
            {t.recalculate}
          </button>
        </span>
      </div>

      <div style={{ flex: 1, overflowY: view === 'list' ? 'auto' : 'hidden' }}>
        {view === 'map' ? (
          <RouteMap stops={stops} cases={cases} position={position} activeStopId={selected?.id ?? null}
            onSelect={setSelected} />
        ) : (
          <StopList stops={stops} cases={cases} onSelect={setSelected} />
        )}
      </div>

      <footer style={{ padding: 12, borderTop: `1px solid ${colors.line}`, display: 'flex', gap: 10, alignItems: 'center' }}>
        {mission ? (
          <button onClick={() => next && setSelected(next)} disabled={!next}
            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: next ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 12, color: colors.grey }}>{t.next}</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{stopLabel(next)}</div>
          </button>
        ) : (
          <span style={{ flex: 1, color: colors.grey }}>{t.noMission}</span>
        )}
        <Button tone="grey" onClick={() => setShowFound(true)}>{t.foundBike}</Button>
      </footer>

      {toast && (
        <div role="status" style={{
          position: 'fixed', bottom: 96, left: 16, right: 16, zIndex: 1300, background: '#323232',
          color: '#fff', padding: 12, borderRadius: 8, fontWeight: 600, textAlign: 'center',
        }}>{toast}</div>
      )}

      {selected && (
        <StopSheet stop={selected} subject={subjectFor(selected)} actor={operator} position={position}
          onDone={handleOutcome} onClose={() => setSelected(null)} />
      )}
      {showFound && (
        <FoundBikeForm actor={operator} position={position} onClose={() => setShowFound(false)} />
      )}
    </div>
  )
}
