import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, type SubmitResult } from '../api'
import { FoundBikeForm } from '../components/field/FoundBikeForm'
import { BottomSheet, type Detent } from '../components/field/BottomSheet'
import { ManeuverBanner, ManeuverIcon, instruction } from '../components/field/ManeuverBanner'
import { MissionSidebar } from '../components/field/MissionSidebar'
import { NavMap, type CameraMode } from '../components/field/NavMap'
import { StopList } from '../components/field/StopList'
import { StopSheet, type StopAutoplay } from '../components/field/StopSheet'
import {
  cacheCases, cacheMission, cachedCases, cachedMission, onQueueChange, queuedCount,
} from '../components/field/offline'
import { Badge, Button, FIELD_CSS, colors, fmtClock, fmtDistance, fmtDuration, bikeNumbers } from '../components/field/ui'
import { freshFix, useGeolocation, type FieldPosition } from '../components/field/useGeolocation'
import { useNavigation, useSimulatedDrive } from '../components/field/useNavigation'
import { SetLangContext, useLang, useT } from '../i18n'
import type { Case, Mission, Outcome, Stop } from '../types'

const OPERATORS = ['op1', 'op2'] // T-D1: stand-in for real sign-in (auth is out of MVP scope)
const OPERATOR_KEY = 'field:operator'
const POLL_MS = 5000
const REPLAN_COOLDOWN_MS = 30_000
const OFF_ROUTE_COOLDOWN_MS = 20_000
/** `/field?sim` runs the scripted presentation demo as this operator (backend services/demo.py). */
const DEMO_OPERATOR = 'demo'
const DEMO_BIKES = 5
/** Fast-forward driving (m/s): about 10 s out of the depot to bike 1 and a 2–3 minute full demo. */
const DEMO_SPEED_MS = 70
/** The demo shows one complete pickup, then ends a few seconds into the drive to bike 2. */
const DEMO_AFTER_PICKUP_MS = 7000
const DEMO_AUTOPLAY: Record<'pt' | 'en', StopAutoplay> = {
  pt: { photoUrl: '/demo/bike-photo.svg', description: 'Bicicleta estacionada no passeio, a bloquear a passagem. Guarda-lamas traseiro riscado; bateria a 40%.' },
  en: { photoUrl: '/demo/bike-photo.svg', description: 'Bike parked on the pavement, blocking the way. Rear mudguard scratched; battery at 40%.' },
}
/** `/field?sim` drives the van along the demo route (pitch without GPS), starting at the depot. */
const DEPOT_POSITION: FieldPosition = { lat: 38.736686, lng: -9.386868, accuracy: 5, at: new Date().toISOString() }

/** Mobile field view, Apple-Maps style: road-route navigation map with a maneuver banner,
 *  a draggable sheet (next stop, ETA, stop list, directions, settings), stop sheet,
 *  found-bike report and the offline queue. */
export function FieldPage() {
  const t = useT()
  const navigate = useNavigate()
  // Read per mount, not per module load: leaving /field?sim through Home must not keep simulating on /field.
  const SIMULATE = new URLSearchParams(useLocation().search).has('sim')
  const lang = useLang()
  const setLang = useContext(SetLangContext)
  const [operator, setOperator] = useState(() => {
    try { return localStorage.getItem(OPERATOR_KEY) ?? OPERATORS[0] } catch { return OPERATORS[0] }
  })
  const { position: gpsPosition, live, error: geoError } = useGeolocation()
  // The demo runs as its own operator so it never touches op1/op2's missions or cached routes.
  const who = SIMULATE ? DEMO_OPERATOR : operator

  const [mission, setMission] = useState<Mission | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [stale, setStale] = useState(false)      // showing the cached route, server unreachable
  const [banner, setBanner] = useState<string | null>(null)
  const [detent, setDetent] = useState<Detent>('peek')
  const [camera, setCamera] = useState<CameraMode>('follow')
  const [selected, setSelected] = useState<Stop | null>(null)
  const [showFound, setShowFound] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [clockNow, setClockNow] = useState(Date.now())
  const [demoDone, setDemoDone] = useState(false)
  const demoStarting = useRef(false)
  const onDemoArrive = useRef<() => void>(() => {})

  const simPosition = useSimulatedDrive(mission, SIMULATE && !demoDone, { speedMs: DEMO_SPEED_MS, onArrive: () => onDemoArrive.current() })
  const position = SIMULATE ? simPosition ?? gpsPosition ?? DEPOT_POSITION : gpsPosition

  const version = useRef(0)
  const positionRef = useRef(position)
  const pendingRef = useRef(0)
  const lastReplan = useRef(0)
  const initialRouteChecked = useRef(false)
  positionRef.current = position
  pendingRef.current = pending

  useEffect(() => {
    try { localStorage.setItem(OPERATOR_KEY, operator) } catch { /* storage blocked */ }
  }, [operator])
  useEffect(() => { const id = setInterval(() => setClockNow(Date.now()), 1000); return () => clearInterval(id) }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  /** T-C1/T-C2: a mission is created on the operator's first request, from where they are. */
  const replanNow = useCallback(async (reason?: 'off_route') => {
    const at = positionRef.current
    if (!at) return
    lastReplan.current = Date.now()
    try {
      const next = await api.replan(who, at.lat, at.lng, reason)
      if (reason === 'off_route' || (version.current && next.version !== version.current)) {
        setBanner(next.last_change ?? null)
      }
      setMission(next)
      version.current = next.version
      cacheMission(who, next)
    } catch { /* replan lands with T-C2; polling keeps showing whatever exists */ }
  }, [who])

  // Poll the mission and its cases. A failed request must never blank the route (ER-8).
  useEffect(() => {
    version.current = 0
    initialRouteChecked.current = false
    setMission(cachedMission(who))
    setCases(cachedCases(who))

    let alive = true
    const load = async () => {
      try {
        const [nextMission, nextCases] = await Promise.all([api.mission(who), SIMULATE ? api.cases(undefined, false, DEMO_OPERATOR) : api.cases(undefined, true)])
        if (!alive) return
        if (nextMission && version.current && nextMission.version !== version.current) {
          setBanner(nextMission.last_change ?? '')
        }
        version.current = nextMission?.version ?? 0
        setMission(nextMission)
        setCases(nextCases)
        setStale(false)
        cacheMission(who, nextMission)
        // Only the cases on the route are cached: that is what the stop sheet needs offline,
        // and it keeps the whole case list out of a limited localStorage quota.
        const onRoute = new Set((nextMission?.stops ?? []).map((s) => s.case_id))
        cacheCases(who, nextCases.filter((c) => onRoute.has(c.id)))
        if (pendingRef.current > 0) {
          const { sent } = await api.flushQueue()
          if (alive && sent > 0) setToast(`${t.synced} (${sent})`)
        }
        // The demo starts itself: no demo mission yet means a fresh 5-bike mission from the depot.
        if (SIMULATE && !nextMission && !demoStarting.current) {
          demoStarting.current = true
          const started = await api.demo.start().finally(() => { demoStarting.current = false })
          if (!alive) return
          version.current = started.version
          setMission(started)
          setCases(await api.cases(undefined, false, DEMO_OPERATOR))
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
  }, [who, replanNow])

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
  const planned = useMemo(() => stops.filter((s) => s.status === 'planned').sort((a, b) => a.seq - b.seq), [stops])
  const subjectFor = (stop: Stop | null) => cases.find((c) => c.id === stop?.case_id)
  const numbers = useMemo(() => bikeNumbers(stops), [stops])
  const stopLabel = (stop?: Stop) =>
    !stop ? t.none : stop.kind === 'depot' ? 'Complexo Multisserviços' : `${t.bike} ${numbers.get(stop.id) ?? ''}`

  const onOffRoute = useCallback(() => {
    const cooldownLeft = OFF_ROUTE_COOLDOWN_MS - (Date.now() - lastReplan.current)
    if (cooldownLeft > 0) return cooldownLeft
    setToast(t.offRoute)
    replanNow('off_route')
    return 0
  }, [replanNow, t.offRoute])
  const nav = useNavigation(mission, position, onOffRoute)
  useEffect(() => {
    if (SIMULATE || !mission || !freshFix(gpsPosition, live) || nav.offRouteM == null || initialRouteChecked.current) return
    initialRouteChecked.current = true
    // A saved mission may have been planned on a previous shift or GPS location.
    if ((nav.offRouteM > 80 || mission.routing_engine === 'straight-line') && Date.now() - lastReplan.current > REPLAN_COOLDOWN_MS) replanNow()
  }, [mission, gpsPosition, live, nav.offRouteM, replanNow])
  const next = planned[nav.legIndex] ?? planned[0]
  const straightLine = mission?.routing_engine === 'straight-line'
  const heading = position?.heading ?? (nav.step?.maneuver.bearing_after ?? null)
  const legSteps = mission?.route_legs?.[nav.legIndex]?.steps ?? []
  const upcoming = nav.next ? legSteps.slice(Math.max(0, legSteps.indexOf(legSteps.find((s) => s.maneuver.location === nav.next!.maneuver.location) ?? legSteps[0]))) : legSteps
  const thenStep = nav.next && nav.toNextM != null && nav.toNextM < 250
    ? legSteps[legSteps.findIndex((s) => s.maneuver.location === nav.next!.maneuver.location) + 1] ?? null : null

  useEffect(() => {
    if (banner === null) return
    const id = setTimeout(() => setBanner(null), 7000)
    return () => clearTimeout(id)
  }, [banner])

  // Demo: the drive holds at the next stop. A bike opens its stop sheet (photo + description);
  // the depot closes the demo. Recording the outcome re-plans from the bike and driving resumes.
  onDemoArrive.current = () => {
    const stop = planned[0]
    if (!stop || !mission || demoDone) return  // the post-depot re-plan is a zero-length route: arrive once
    if (stop.kind === 'depot') {
      api.depotArrived(mission.id, stop.lat, stop.lng).then(setMission).catch(() => {})
      setDemoDone(true)
      return
    }
    setToast(t.demoArrived(numbers.get(stop.id) ?? 1, DEMO_BIKES))
    setSelected(stop)
  }

  async function restartDemo() {
    if (demoTimer.current) clearTimeout(demoTimer.current)
    setDemoDone(false)
    setSelected(null)
    demoStarting.current = true
    try {
      const started = await api.demo.start()
      version.current = started.version
      setMission(started)
      cacheMission(who, started)
      setCases(await api.cases(undefined, false, DEMO_OPERATOR))
    } catch { setToast(t.demoStarting) } finally { demoStarting.current = false }
  }

  // Demo: after the one scripted pickup, drive toward bike 2 briefly, then end.
  const demoTimer = useRef<number | null>(null)
  useEffect(() => () => { if (demoTimer.current) clearTimeout(demoTimer.current) }, [])

  function handleOutcome(result: SubmitResult, outcome: Outcome) {
    const stop = selected
    setSelected(null)
    if (SIMULATE && !result.queued && outcome === 'picked_up') {
      if (demoTimer.current) clearTimeout(demoTimer.current)
      demoTimer.current = window.setTimeout(() => setDemoDone(true), DEMO_AFTER_PICKUP_MS)
    }
    if (!result.queued) {
      setMission(result.mission)
      version.current = result.mission.version
      cacheMission(who, result.mission)
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
      cacheMission(who, updated)
      return updated
    })
  }

  const offline = stale || pending > 0
  const positionFresh = SIMULATE || (freshFix(gpsPosition, live) && Boolean(gpsPosition && clockNow - Date.parse(gpsPosition.at) < 15_000))
  const navigating = Boolean(mission && position && (mission.route_legs?.length ?? 0) > 0) && !(SIMULATE && demoDone)
  const nearStop = nav.toStopM != null && nav.toStopM < 60

  return (
    <div className="field-root" style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--f-bg)' }}>
      <style>{FIELD_CSS}</style>
      <NavMap mission={mission} position={position} snapped={nav.snapped} heading={heading} travelled={nav.travelled} ahead={nav.ahead}
        cases={cases} activeStopId={selected?.id ?? next?.id ?? null} mode={camera}
        onUserMove={() => setCamera('free')} onSelect={setSelected} />
      {mission && <MissionSidebar mission={mission} nav={nav} lang={lang} statusVisible={banner !== null} onSelect={setSelected} />}

      {navigating ? (
        <ManeuverBanner next={nav.next} distanceM={nav.next ? nav.toNextM : nav.toStopM} lang={lang}
          stopName={stopLabel(next)} then={thenStep} straightLine={straightLine} straightLineText={t.straightLine} />
      ) : (
        <div className="glass" style={{ position: 'absolute', top: 'calc(10px + env(safe-area-inset-top))', left: 10, right: 10, zIndex: 20,
          borderRadius: 20, padding: '14px 16px', fontSize: 17, fontWeight: 600 }}>
          {mission ? t.route : <>{t.noMission} · <Link to="/">{lang === 'en' ? 'Start on home' : 'Iniciar na página inicial'}</Link></>}
          <div style={{ fontSize: 14, fontWeight: 400, color: colors.secondary }}>
            {position ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` : geoError ? t.locationDenied : t.locating}
            {position && <> · ±{Math.round(position.accuracy ?? 0)} m · {positionFresh ? (lang === 'en' ? 'GPS current' : 'GPS atual') : (lang === 'en' ? 'GPS stale' : 'GPS desatualizado')}</>}
          </div>
        </div>
      )}

      {/* route change / status pills under the banner */}
      <div style={{ position: 'absolute', top: 'calc(118px + env(safe-area-inset-top))', left: 0, right: 0, zIndex: 25, pointerEvents: 'none' }}>
        {banner !== null && (
          <div role="status" onClick={() => setBanner(null)} className="glass" style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', animation: 'pill-in .3s ease-out', pointerEvents: 'auto',
            width: 'min(92vw, 520px)', borderRadius: 18, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <span style={{ width: 30, height: 30, borderRadius: 15, background: colors.warn, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>↻</span>
            <span style={{ fontSize: 14, lineHeight: 1.3 }}><b>{t.routeChanged}</b>{banner ? ` · ${banner}` : ''}</span>
          </div>
        )}
      </div>

      {/* floating controls (right) */}
      <div style={{ position: 'absolute', right: 10, top: `calc(${banner !== null ? 196 : 160}px + env(safe-area-inset-top))`, zIndex: 22,
        display: 'flex', flexDirection: 'column', gap: 8, transition: 'top .3s' }}>
        <div className="glass" style={{ borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <RoundButton label={t.home} onClick={() => navigate('/')}>
            <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5" />
          </RoundButton>
          <div style={{ height: 0.5, background: colors.line }} />
          <RoundButton label={t.recentre} onClick={() => setCamera('follow')}>
            <path d="M12 2 4 20l8-4 8 4z" fill={camera === 'follow' ? colors.primary : 'none'} />
          </RoundButton>
          <div style={{ height: 0.5, background: colors.line }} />
          <RoundButton label={t.overview} onClick={() => setCamera('overview')}>
            <path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6" />
          </RoundButton>
          <div style={{ height: 0.5, background: colors.line }} />
          <RoundButton label={t.foundBike} onClick={() => setShowFound(true)}><path d="M12 5v14M5 12h14" /></RoundButton>
        </div>
        {(offline || SIMULATE) && (
          <div className="glass" style={{ borderRadius: 12, padding: '6px 8px', fontSize: 11, fontWeight: 700, textAlign: 'center',
            color: offline ? colors.danger : colors.primary, maxWidth: 88 }}>
            {SIMULATE ? t.simulated : stale ? t.cachedRoute : `${pending} ${t.pendingSync}`}
          </div>
        )}
      </div>

      <BottomSheet detent={detent} onDetent={setDetent} peek={
        mission ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, color: nearStop ? colors.ok : colors.label }}>
                {fmtDuration(nav.toStopS ?? next?.eta_s)}
              </div>
              <div style={{ fontSize: 14, color: colors.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmtDistance(nav.toStopM)} · {t.arrival} {fmtClock(nav.toStopS ?? next?.eta_s ?? 0)} · {planned.filter((s) => s.kind !== 'depot').length} {t.stops}
              </div>
              <button onClick={() => next && setSelected(next)} style={{ border: 'none', background: 'none', padding: 0, marginTop: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, color: 'inherit', maxWidth: '100%' }}>
                <span style={{ width: 22, height: 22, borderRadius: next?.kind === 'depot' ? 6 : 11, background: next?.kind === 'depot' ? '#1c1c1e' : colors.danger,
                  color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {next?.kind === 'depot' ? '⌂' : next && numbers.get(next.id)}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stopLabel(next)}
                </span>
              </button>
            </div>
            <Button tone={nearStop ? 'ok' : 'primary'} disabled={!next} onClick={() => next && setSelected(next)}>{t.arrived}</Button>
          </div>
        ) : (
          <div style={{ fontSize: 17, fontWeight: 600, padding: '8px 0' }}>{t.noMission}</div>
        )
      }>
        <StopList stops={planned.concat(stops.filter((s) => s.status === 'done'))} cases={cases} onSelect={setSelected} />

        {upcoming.length > 0 && !straightLine && (
          <>
            <SectionTitle>{t.directions}</SectionTitle>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: colors.card, borderRadius: 14, overflow: 'hidden' }}>
              {upcoming.slice(0, 12).map((s, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderBottom: `0.5px solid ${colors.line}` }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: '#3a3a3c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ManeuverIcon step={s} size={22} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{instruction(s, lang, stopLabel(next))}</span>
                  <span style={{ fontSize: 13, color: colors.secondary }}>{fmtDistance(s.distance)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <SectionTitle>{t.settings}</SectionTitle>
        <div style={{ background: colors.card, borderRadius: 14, padding: '4px 14px' }}>
          <SettingRow label={t.operator}>
            <Segmented value={operator} options={OPERATORS} onChange={setOperator} />
          </SettingRow>
          <SettingRow label={t.language}>
            <Segmented value={lang} options={['pt', 'en']} onChange={(l) => setLang(l as 'pt' | 'en')} />
          </SettingRow>
          <SettingRow label={t.myPosition}>
            <span style={{ fontSize: 14, color: live || SIMULATE ? colors.ok : colors.secondary }}>
              {position ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` : geoError ? t.locationDenied : t.locating}
              {position && ` · ±${Math.round(position.accuracy ?? 0)} m · ${positionFresh ? (lang === 'en' ? 'current' : 'atual') : (lang === 'en' ? 'stale' : 'desatualizado')}`}
            </span>
          </SettingRow>
          <SettingRow label={t.route}>
            <span style={{ fontSize: 14, color: straightLine ? colors.warn : colors.secondary }}>
              {straightLine ? t.straightLine : `OSRM · ${fmtDistance(mission?.distance_m)} · v${mission?.version ?? 0}`}
            </span>
          </SettingRow>
          {offline && (
            <SettingRow label={t.pendingSync}>
              <button onClick={() => api.flushQueue(true).then(({ sent }) => sent && setToast(`${t.synced} (${sent})`)).catch(() => {})}
                style={{ border: 'none', background: 'none', color: colors.primary, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                {pending > 0 && <Badge tone="warn">{pending}</Badge>} {t.syncNow}
              </button>
            </SettingRow>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          {SIMULATE && <div style={{ gridColumn: '1 / -1' }}><Button wide onClick={restartDemo}>{t.restartDemo}</Button></div>}
          <Button tone="grey" onClick={() => replanNow()} disabled={!position || SIMULATE}>{t.recalculate}</Button>
          <Button tone="grey" onClick={() => setShowFound(true)}>{t.foundBike}</Button>
        </div>
      </BottomSheet>

      {toast && (
        <div role="status" className="glass" style={{
          position: 'absolute', bottom: 'calc(184px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
          zIndex: 40, borderRadius: 18, padding: '10px 16px', fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap',
          animation: 'pill-in .25s ease-out',
        }}>{toast}</div>
      )}

      {selected && (
        <StopSheet stop={selected} subject={subjectFor(selected)} actor={who} position={position}
          onDone={handleOutcome} onClose={() => setSelected(null)} autoplay={SIMULATE && !demoDone ? DEMO_AUTOPLAY[lang] : undefined} />
      )}
      {SIMULATE && demoDone && (
        <div role="status" className="glass" style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translate(-50%, -50%)', zIndex: 60,
          width: 'min(88vw, 380px)', borderRadius: 22, padding: '22px 20px', textAlign: 'center', animation: 'pill-in .3s ease-out' }}>
          <div style={{ width: 52, height: 52, margin: '0 auto 10px', borderRadius: 26, background: colors.ok, color: '#fff', fontSize: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{t.demoComplete}</div>
          <div style={{ fontSize: 15, color: colors.secondary, marginBottom: 16 }}>{t.demoCompleteDetail}</div>
          <Button wide onClick={restartDemo}>{t.restartDemo}</Button>
        </div>
      )}
      {showFound && (
        <FoundBikeForm actor={who} position={position} onClose={() => setShowFound(false)} />
      )}
    </div>
  )
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} style={{ width: 48, height: 48, border: 'none', background: 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, margin: '14px 2px 8px' }}>{children}</div>
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, borderBottom: `0.5px solid ${colors.line}` }}>
      <span style={{ fontSize: 16 }}>{label}</span>{children}
    </div>
  )
}

function Segmented({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', background: colors.fill, borderRadius: 9, padding: 2 }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{ border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', background: o === value ? colors.card : 'transparent', color: 'inherit',
          boxShadow: o === value ? '0 1px 3px rgba(0,0,0,.15)' : 'none' }}>{o.toUpperCase()}</button>
      ))}
    </div>
  )
}
