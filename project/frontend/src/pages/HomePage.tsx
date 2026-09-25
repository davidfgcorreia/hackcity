import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { FEED_STALE_S, fmtAge, lisbonTime, useAgeSeconds, useOpsMode } from '../components/AppBar'
import { openCases } from '../components/decision/MapLayers'
import { freshFix, useGeolocation } from '../components/field/useGeolocation'
import { useRules } from '../enforcement'
import { useLang } from '../i18n'
import type { Case, Mission } from '../types'

const operators = ['op1', 'op2']
const operatorKey = 'field:operator'

/** Operations home: live status, the pickup mission and the services, in the same visual system as /data. */
export function HomePage() {
  const lang = useLang()
  const en = lang === 'en'
  const navigate = useNavigate()
  const rules = useRules()
  const { live: feed, replay } = useOpsMode()
  const [operator, setOperator] = useState(() => { try { return localStorage.getItem(operatorKey) ?? 'op1' } catch { return 'op1' } })
  const [allCases, setAllCases] = useState<Case[]>([])
  const [mission, setMission] = useState<Mission | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { position, live, error: locationError } = useGeolocation()
  const [now, setNow] = useState(Date.now())
  const ready = freshFix(position, live) && now - Date.parse(position!.at) < 15_000
  useEffect(() => { try { localStorage.setItem(operatorKey, operator) } catch { /* blocked */ } }, [operator])
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        // Current mode only (live or replay), as the mission planner routes.
        const [nextCases, nextMission] = await Promise.all([api.cases(undefined, true), api.mission(operator)])
        if (active) { setAllCases(nextCases); setMission(nextMission); setError(null) }
      } catch { if (active) setError(en ? 'Could not refresh pickup status.' : 'Não foi possível atualizar o estado da recolha.') }
    }
    load()
    const poll = setInterval(load, 5000)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { active = false; clearInterval(poll); clearInterval(clock) }
  }, [operator, en])

  async function start() {
    if (busy) return
    if (!freshFix(position, live)) {
      setError(en ? 'A fresh GPS fix is required to start. Check location access and try again.' : 'É necessária uma posição GPS recente. Verifique o acesso à localização e tente novamente.')
      return
    }
    setBusy(true)
    try {
      await api.replan(operator, position!.lat, position!.lng)
      navigate('/field')
    } catch { setError(en ? 'A fresh GPS fix is required to start. Check location access and try again.' : 'É necessária uma posição GPS recente. Verifique o acesso à localização e tente novamente.') }
    finally { setBusy(false) }
  }

  // Abandoned bikes still to collect: eligible + already on a route (same set the mission planner uses).
  const toCollect = allCases.filter(c => (c.status === 'eligible' || c.status === 'assigned') && !c.needs_approval && !c.blocked_reason)
  const assigned = toCollect.filter(c => c.status === 'assigned').length
  const replayMode = feed ? !feed.running : false
  const nowMs = replayMode && replay?.sim_time ? Date.parse(replay.sim_time) : Date.now()
  const open120 = openCases(allCases, rules.abandon_minutes, replayMode, rules, nowMs).length
  const feedAge = useAgeSeconds(feed?.last_poll)
  const feedStale = !replayMode && feedAge != null && feedAge > FEED_STALE_S
  const missionStops = mission?.stops.filter(s => s.status === 'planned' && s.kind !== 'depot').length ?? 0
  const gpsChip = ready ? { tone: 'ok', text: en ? 'GPS ready' : 'GPS pronto' }
    : locationError ? { tone: 'bad', text: en ? 'Location off — enable GPS to start' : 'Localização desligada — ative o GPS para iniciar' }
      : { tone: 'wait', text: en ? 'Waiting for a fresh GPS fix' : 'A aguardar posição GPS recente' }

  return <main className="home">
    <style>{HOME_CSS}</style>
    <div className="home-wrap">
      <header className="home-head">
        <h1>{en ? 'Operations home' : 'Centro de operações'}</h1>
        <p>{en ? 'Abandoned bikes, the pickup route and the data behind station decisions in Cascais.'
          : 'Bicicletas abandonadas, a rota de recolha e os dados para decidir estações em Cascais.'}</p>
      </header>

      <section className="home-stats" aria-label={en ? 'Live status' : 'Estado atual'}>
        <StatTile to="/data?view=live#Decision%20map" accent="#c0302f" label={en ? 'Abandoned now' : 'Abandonadas agora'}
          value={toCollect.length} sub={en ? `outside a station > ${rules.abandon_minutes} counted min` : `fora da estação > ${rules.abandon_minutes} min contados`} />
        <StatTile to="/field" accent="#2a78d6" label={en ? 'Already on a route' : 'Já numa rota'} value={assigned}
          sub={en ? 'assigned to a pickup mission' : 'atribuídas a uma missão de recolha'} />
        <StatTile to="/data?view=live#Decision%20map" accent="#eb6834" label={en ? `Open cases > ${rules.abandon_minutes} min` : `Casos abertos > ${rules.abandon_minutes} min`}
          value={open120} sub={en ? 'includes bikes missing from the feed' : 'inclui bicicletas ausentes do feed'} />
        <StatTile to="/data?view=live#Decision%20map" accent={replayMode ? '#2a78d6' : feedStale ? '#eda100' : '#1baf7a'} label={en ? 'Data feed' : 'Fonte de dados'}
          value={!feed ? '—' : replayMode ? 'Replay' : feedStale ? (en ? 'Delayed' : 'Atrasado') : (en ? 'Live' : 'Tempo real')}
          sub={!feed ? (en ? 'API unreachable' : 'API indisponível') : replayMode ? (en ? 'replaying the sample' : 'a reproduzir a amostra')
            : `GBFS · ${en ? 'updated' : 'atualizado'} ${fmtAge(feedAge, en)} · ${lisbonTime(feed.last_poll, en)} · ${en ? 'every 60 s' : 'a cada 60 s'}`}
          dot={feed ? (replayMode ? 'replay' : feedStale ? 'stale' : 'live') : undefined} />
      </section>

      <section className="home-mission" aria-label={en ? 'Pickup mission' : 'Missão de recolha'}>
        <div className="home-mission-copy">
          <span className="home-kicker">{en ? 'Pickup mission' : 'Missão de recolha'}</span>
          <h2>{mission ? (en ? `${missionStops} bikes on your route` : `${missionStops} bicicletas na sua rota`) : (en ? 'No mission yet' : 'Ainda sem missão')}</h2>
          <div className="home-mission-meta">
            <label>{en ? 'Operator' : 'Operador'}
              <select aria-label={en ? 'Operator' : 'Operador'} value={operator} onChange={e => setOperator(e.target.value)}>{operators.map(o => <option key={o}>{o}</option>)}</select>
            </label>
            <span className={`home-chip ${gpsChip.tone}`}><span className="dot" aria-hidden="true" />{gpsChip.text}</span>
          </div>
          {error && <p className="home-error" role="alert">{error}</p>}
        </div>
        <div className="home-mission-actions">
          <button className="home-primary" onClick={start} disabled={!ready || busy}>
            {busy ? (en ? 'Starting…' : 'A iniciar…') : mission ? (en ? 'Continue mission' : 'Continuar missão') : (en ? 'Start mission' : 'Iniciar missão')}
          </button>
          <Link className="home-secondary" to="/field?sim">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
            {en ? 'Presentation demo' : 'Demonstração'}
          </Link>
        </div>
      </section>

      <h3 className="home-section-title">{en ? 'Services' : 'Serviços'}</h3>
      <nav className="home-services" aria-label={en ? 'Services' : 'Serviços'}>
        <ServiceTile to="/field" accent="#2a78d6" title={en ? 'Pickup' : 'Recolha'}
          detail={en ? 'Road route, stop evidence and the return to the depot' : 'Rota por estrada, registo em cada paragem e regresso ao armazém'}
          icon={<path d="M3 16V7h11v9M14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />} />
        <ServiceTile to="/data#Decision%20map" accent="#c2185b" title={en ? 'Decision map' : 'Mapa de decisão'}
          detail={en ? 'Demand squares, station candidates and the Laya ranking' : 'Procura por quadrícula, candidatos a estação e a classificação Laya'}
          icon={<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" />} />
        <ServiceTile to="/data#Bird" accent="#eb6834" title={en ? 'Bird performance' : 'Desempenho da Bird'}
          detail={en ? 'Abandonment hotspots, response times and a score per station' : 'Zonas críticas de abandono, tempos de resposta e pontuação por estação'}
          icon={<path d="M4 20V10m6 10V4m6 16v-7m6 7H2" />} />
        <ServiceTile to="/data#Station%20candidates" accent="#1baf7a" title={en ? 'Station candidates' : 'Candidatos a estação'}
          detail={en ? 'Where a new station would help most, with the evidence' : 'Onde uma nova estação ajudaria mais, com a evidência'}
          icon={<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />} />
      </nav>
    </div>
  </main>
}

function StatTile({ to, accent, label, value, sub, dot }: { to: string; accent: string; label: string; value: ReactNode; sub: string; dot?: 'live' | 'replay' | 'stale' }) {
  return <Link to={to} className="home-stat" style={{ ['--accent' as string]: accent }}>
    <span className="home-stat-label">{dot && <span className={`dot ${dot}`} aria-hidden="true" />}{label}</span>
    <span className="home-stat-value">{value}</span>
    <span className="home-stat-sub">{sub}</span>
  </Link>
}

function ServiceTile({ to, accent, title, detail, icon }: { to: string; accent: string; title: string; detail: string; icon: ReactNode }) {
  return <Link to={to} className="home-service" style={{ ['--accent' as string]: accent }}>
    <span className="home-service-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg></span>
    <span className="home-service-copy"><strong>{title}</strong><small>{detail}</small></span>
    <span className="home-service-arrow" aria-hidden="true">→</span>
  </Link>
}

/** Tokens match /data (viz.tsx C): #f6f6f4 page, white cards, #e0e0e0 lines, #0b0b0b / #52514e text. */
const HOME_CSS = `
.home { min-height:calc(100dvh - 57px); background:#f6f6f4; color:#0b0b0b; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }
.home * { box-sizing:border-box; }
.home a { color:inherit; text-decoration:none; }
.home-wrap { max-width:1120px; margin:0 auto; padding:28px 20px 40px; display:grid; gap:18px; }
.home-head h1 { margin:0; font-size:clamp(26px,3.2vw,34px); letter-spacing:-.02em; }
.home-head p { margin:6px 0 0; color:#52514e; font-size:15px; }
.home-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.home-stat { position:relative; display:grid; gap:4px; background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:14px 16px 14px 18px; overflow:hidden; transition:box-shadow .15s, transform .15s; }
.home-stat::before { content:""; position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--accent); }
.home-stat:hover { box-shadow:0 4px 16px rgba(0,0,0,.07); transform:translateY(-1px); }
.home-stat-label { display:flex; align-items:center; gap:7px; font-size:13px; color:#52514e; }
.home-stat-value { font-size:32px; font-weight:650; font-variant-numeric:tabular-nums; line-height:1.1; }
.home-stat-sub { font-size:12.5px; color:#52514e; }
.dot { width:8px; height:8px; border-radius:4px; background:#8a8984; flex:none; }
.dot.live, .home-chip.ok .dot { background:#1baf7a; box-shadow:0 0 0 3px #1baf7a33; }
.dot.replay { background:#2a78d6; }
.dot.stale { background:#eda100; }
.home-mission { display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; background:#fff; border:1px solid #e0e0e0; border-radius:14px; padding:20px 22px; }
.home-kicker { font-size:12px; font-weight:650; letter-spacing:.06em; text-transform:uppercase; color:#2a78d6; }
.home-mission h2 { margin:4px 0 10px; font-size:22px; }
.home-mission-meta { display:flex; gap:12px; align-items:center; flex-wrap:wrap; font-size:14px; color:#52514e; }
.home-mission-meta label { display:inline-flex; gap:8px; align-items:center; }
.home-mission-meta select { font:inherit; padding:5px 8px; border:1px solid #d6d6d2; border-radius:8px; background:#fff; color:#0b0b0b; }
.home-chip { display:inline-flex; align-items:center; gap:7px; padding:4px 10px; border-radius:999px; font-size:13px; background:#f0efec; }
.home-chip.wait .dot { background:#eda100; }
.home-chip.bad { background:#fbeaea; color:#9b2524; } .home-chip.bad .dot { background:#c0302f; }
.home-error { margin:10px 0 0; color:#9b2524; font-size:13px; }
.home-mission-actions { display:flex; gap:10px; flex-wrap:wrap; }
.home-primary { border:0; border-radius:10px; min-height:46px; padding:0 22px; background:#2a78d6; color:#fff; font:600 15px system-ui,sans-serif; cursor:pointer; }
.home-primary:hover:not(:disabled) { background:#256abf; }
.home-primary:disabled { background:#b9c3cf; cursor:default; }
.home-secondary { display:inline-flex; align-items:center; gap:8px; min-height:46px; padding:0 18px; border-radius:10px; border:1px solid #d6d6d2; background:#fff; font-weight:600; font-size:15px; color:#184f95 !important; }
.home-secondary:hover { background:#e8f1fc; }
.home-section-title { margin:8px 0 -6px; font-size:13px; font-weight:650; letter-spacing:.06em; text-transform:uppercase; color:#52514e; }
.home-services { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.home-service { display:flex; align-items:center; gap:14px; background:#fff; border:1px solid #e0e0e0; border-radius:14px; padding:16px 18px; transition:box-shadow .15s, transform .15s, border-color .15s; }
.home-service:hover { box-shadow:0 6px 20px rgba(0,0,0,.07); transform:translateY(-2px); border-color:var(--accent); }
.home-service-icon { flex:none; width:44px; height:44px; border-radius:12px; display:grid; place-items:center; color:var(--accent); background:color-mix(in srgb, var(--accent) 12%, #fff); }
.home-service-copy { display:grid; gap:3px; min-width:0; }
.home-service-copy strong { font-size:16px; }
.home-service-copy small { font-size:13px; color:#52514e; line-height:1.35; }
.home-service-arrow { margin-left:auto; color:#8a8984; font-size:18px; transition:transform .15s, color .15s; }
.home-service:hover .home-service-arrow { transform:translateX(3px); color:var(--accent); }
@media (max-width: 860px) { .home-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } .home-services { grid-template-columns:minmax(0,1fr); } }
@media (max-width: 480px) {
  .home-wrap { padding:18px 16px 28px; gap:14px; }
  .home-stat { padding:12px 12px 12px 15px; } .home-stat-value { font-size:26px; }
  .home-mission { padding:16px; } .home-mission-actions, .home-primary, .home-secondary { width:100%; justify-content:center; }
}
`
