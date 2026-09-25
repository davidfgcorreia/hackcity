/** One top bar for / and /data (the phone field view keeps its own Home button): brand, the three
 *  services, the operations mode (live feed or replay) and the PT/EN switch. Same tokens as /data. */
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useLang, type Lang } from '../i18n'
import type { LiveState, ReplayState } from '../types'

const LINKS = [
  { to: '/', end: true, pt: 'Início', en: 'Home' },
  { to: '/field', end: false, pt: 'Recolha', en: 'Pickup' },
  { to: '/data', end: false, pt: 'Análise de dados', en: 'Data analysis' },
] as const

/** The backend polls the GBFS feed every 60 s; past this the feed is shown as delayed. */
export const FEED_STALE_S = 180

/** Seconds since `iso`, re-rendered every second so the age visibly ticks. */
export function useAgeSeconds(iso: string | null | undefined) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  return iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 1000)) : null
}

export const fmtAge = (s: number | null, en: boolean) => s == null ? '—'
  : s < 60 ? (en ? `${s} s ago` : `há ${s} s`) : s < 3600 ? (en ? `${Math.floor(s / 60)} min ago` : `há ${Math.floor(s / 60)} min`)
    : (en ? `${Math.floor(s / 3600)} h ago` : `há ${Math.floor(s / 3600)} h`)

/** Lisbon wall-clock time of an instant (the operations time zone, whatever the viewer's browser uses). */
export const lisbonTime = (iso: string | null | undefined, en: boolean) => iso
  ? new Date(iso).toLocaleTimeString(en ? 'en-GB' : 'pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

/** Live when the feed polls; otherwise the replay owns the clock. Polled every 5 s. */
export function useOpsMode() {
  const [state, setState] = useState<{ live: LiveState | null; replay: ReplayState | null }>({ live: null, replay: null })
  useEffect(() => {
    let alive = true
    const load = () => Promise.all([api.live.state(), api.replay.state()])
      .then(([live, replay]) => { if (alive) setState({ live, replay }) }).catch(() => { if (alive) setState({ live: null, replay: null }) })
    load(); const id = setInterval(load, 5_000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return state
}

export function AppBar({ setLang }: { setLang: (l: Lang) => void }) {
  const lang = useLang(), en = lang === 'en'
  const { live, replay } = useOpsMode()
  const age = useAgeSeconds(live?.last_poll)
  if (useLocation().pathname === '/field') return null
  const mode = !live ? null : live.running ? (age != null && age > FEED_STALE_S ? 'stale' : 'live') : 'replay'
  return <header className="appbar">
    <style>{APPBAR_CSS}</style>
    <NavLink to="/" className="appbar-brand" aria-label={en ? 'Home' : 'Início'}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><rect width="26" height="26" rx="7" fill="#2a78d6" />
        <circle cx="8.5" cy="16.5" r="4" fill="none" stroke="#fff" strokeWidth="2" /><circle cx="17.5" cy="16.5" r="4" fill="none" stroke="#fff" strokeWidth="2" />
        <path d="M8.5 16.5 12 9.5h4.5l1 7M11 9.5h3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span><b>Cascais</b> · {en ? 'Micromobility' : 'Micromobilidade'}</span>
    </NavLink>
    <nav className="appbar-nav">
      {LINKS.map(l => <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => isActive ? 'on' : ''}>{en ? l.en : l.pt}</NavLink>)}
    </nav>
    <div className="appbar-right">
      {mode && <NavLink to="/data?view=live#Decision%20map" className={`appbar-mode ${mode}`}
        title={mode === 'replay' ? replay?.sim_time ?? '' : `GBFS · ${en ? 'last poll' : 'última leitura'} ${lisbonTime(live?.last_poll, en)} (Lisboa)${live?.last_error ? ` · ${live.last_error}` : ''}`}>
        <span className="dot" aria-hidden="true" />{mode === 'replay' ? 'Replay'
          : `${mode === 'stale' ? (en ? 'Feed delayed' : 'Feed atrasado') : (en ? 'Live' : 'Tempo real')} · ${fmtAge(age, en)}`}</NavLink>}
      <button className="appbar-lang" onClick={() => setLang(en ? 'pt' : 'en')} aria-label={en ? 'Mudar para português' : 'Switch to English'}>{en ? 'EN' : 'PT'}</button>
    </div>
  </header>
}

const APPBAR_CSS = `
.appbar { display:flex; align-items:center; gap:18px; padding:10px 20px; background:#fff; border-bottom:1px solid #e0e0e0;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; color:#0b0b0b; position:relative; z-index:1100; }
.appbar a { color:inherit; text-decoration:none; }
.appbar-brand { display:inline-flex; align-items:center; gap:9px; font-size:15px; white-space:nowrap; }
.appbar-nav { display:flex; gap:4px; }
.appbar-nav a { padding:7px 12px; border-radius:8px; font-size:14px; color:#52514e; font-weight:500; white-space:nowrap; }
.appbar-nav a:hover { background:#f0efec; color:#0b0b0b; }
.appbar-nav a.on { background:#e8f1fc; color:#184f95; font-weight:650; }
.appbar-right { margin-left:auto; display:flex; align-items:center; gap:10px; }
.appbar-mode { display:inline-flex; align-items:center; gap:7px; font-size:13px; padding:5px 11px; border-radius:999px; border:1px solid #e0e0e0; white-space:nowrap; }
.appbar-mode .dot { width:8px; height:8px; border-radius:4px; background:#8a8984; }
.appbar-mode.live .dot { background:#1baf7a; box-shadow:0 0 0 3px #1baf7a33; }
.appbar-mode.replay .dot { background:#2a78d6; }
.appbar-mode.stale { border-color:#eda100; background:#fff8e6; } .appbar-mode.stale .dot { background:#eda100; }
.appbar-mode { font-variant-numeric:tabular-nums; }
.appbar-lang { border:1px solid #e0e0e0; background:#fff; border-radius:8px; padding:5px 10px; font-weight:650; cursor:pointer; }
@media (max-width: 700px) {
  .appbar { flex-wrap:wrap; gap:8px 12px; padding:10px 16px; }
  .appbar-brand span { display:none; }
  .appbar-nav { order:3; width:100%; overflow-x:auto; }
  .appbar-nav a { padding:6px 10px; font-size:13.5px; }
}
`
