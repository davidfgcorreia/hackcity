import { useContext, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { freshFix, useGeolocation } from '../components/field/useGeolocation'
import { SetLangContext, useLang } from '../i18n'
import type { Case, Mission } from '../types'

const operators = ['op1', 'op2']
const operatorKey = 'field:operator'

export function HomePage() {
  const lang = useLang()
  const setLang = useContext(SetLangContext)
  const en = lang === 'en'
  const navigate = useNavigate()
  const [operator, setOperator] = useState(() => { try { return localStorage.getItem(operatorKey) ?? 'op1' } catch { return 'op1' } })
  const [cases, setCases] = useState<Case[]>([])
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
        const [nextCases, nextMission] = await Promise.all([api.cases('eligible'), api.mission(operator)])
        if (active) { setCases(nextCases.filter(c => c.status === 'eligible' && !c.needs_approval && !c.blocked_reason)); setMission(nextMission); setError(null) }
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

  const locationMessage = locationError
    ? (en ? 'Location access is unavailable. Enable GPS to start a live mission.' : 'Sem acesso à localização. Ative o GPS para iniciar uma missão real.')
    : (en ? 'Waiting for a fresh GPS fix to start.' : 'A aguardar uma posição GPS recente para iniciar.')
  return <main className="home-root">
    <style>{HOME_CSS}</style>
    <div className="home-shell">
      <header className="home-header">
        <button className="home-lang" onClick={() => setLang(en ? 'pt' : 'en')} aria-label={en ? 'Switch to Portuguese' : 'Mudar para inglês'}>{lang.toUpperCase()}</button>
        <p className="home-brand">Cascais · Micromobility</p>
        <h1>{en ? 'Operations home' : 'Centro de operações'}</h1>
        <p className="home-intro">{en ? 'Choose a service or begin a bicycle pickup mission.' : 'Escolha um serviço ou inicie uma missão de recolha de bicicletas.'}</p>
      </header>
      {cases.length > 0 && <section className="home-notification" role="status">
        <strong>{en ? `${cases.length} bicycles eligible for pickup` : `${cases.length} bicicletas elegíveis para recolha`}</strong>
      </section>}
      <div className="home-actions">
        <section className="home-mission" aria-label={en ? 'Pickup mission' : 'Missão de recolha'}>
          <label className="home-operator">{en ? 'Operator' : 'Operador'}: <select aria-label={en ? 'Operator' : 'Operador'} value={operator} onChange={e => setOperator(e.target.value)}>{operators.map(o => <option key={o}>{o}</option>)}</select></label>
          <button className="home-start" onClick={start} disabled={!ready || busy}>
            {busy ? (en ? 'Starting…' : 'A iniciar…') : mission ? (en ? 'Continue mission' : 'Continuar missão') : (en ? 'Start mission' : 'Iniciar missão')}
          </button>
          {!ready && <p className="home-location">{locationMessage}</p>}
          {error && <p className="home-error" role="alert">{error}</p>}
          <Link className="home-sim" to="/field?sim">{en ? 'Open presentation simulation' : 'Abrir simulação para apresentação'}</Link>
        </section>
        <nav className="home-services" aria-label={en ? 'Services' : 'Serviços'}>
          {([['/field', en ? 'Pickup' : 'Recolha', en ? 'Follow your collection route' : 'Siga a rota de recolha'], ['/review', en ? 'Case review' : 'Revisão de casos', en ? 'Inspect and correct cases' : 'Analise e corrija casos'], ['/insights', en ? 'Insights' : 'Indicadores', en ? 'Explore trends and results' : 'Explore tendências e resultados']] as const).map(([to, title, detail]) =>
            <Link className="home-service" key={to} to={to}><span className="home-service-copy"><strong>{title}</strong><small>{detail}</small></span><span className="home-chevron" aria-hidden="true">›</span></Link>)}
        </nav>
      </div>
    </div>
  </main>
}

const HOME_CSS = `
.home-root { position:fixed; inset:0; box-sizing:border-box; height:100dvh; overflow:hidden; padding:clamp(14px,3vmin,38px); background:#f5f8fc; color:#172b45; font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif; }
.home-root * { box-sizing:border-box; }
.home-shell { width:100%; max-width:900px; height:100%; margin:auto; display:flex; flex-direction:column; gap:clamp(18px,3vh,28px); }
.home-header { min-width:0; }
.home-lang { float:right; border:1px solid #ccd5e0; background:#fff; border-radius:8px; padding:6px 10px; min-height:34px; cursor:pointer; }
.home-brand { margin:0 0 8px; color:#3563a1; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; }
.home-header h1 { font-size:clamp(30px,5vw,56px); line-height:1.08; letter-spacing:-.03em; margin:0 0 8px; }
.home-intro { margin:0; color:#53657a; font-size:clamp(14px,1.7vw,18px); line-height:1.3; }
.home-notification { border:1px solid #f2ba72; border-radius:16px; padding:14px 16px; background:#fff3e5; }
.home-notification strong { font-size:clamp(17px,2.3vw,22px); line-height:1.2; }
.home-actions { width:100%; display:flex; flex-direction:column; gap:12px; }
.home-mission { border-radius:16px; padding:14px 16px; background:#fff; box-shadow:0 4px 18px #13334a12; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px 14px; }
.home-operator { font-size:14px; white-space:nowrap; }
.home-operator select { font-size:14px; padding:4px; }
.home-start { border:0; border-radius:11px; min-height:44px; padding:9px 15px; background:#007aff; color:#fff; font-size:14px; font-weight:600; cursor:pointer; }
.home-start:disabled { background:#8290a1; cursor:default; }
.home-location,.home-error,.home-sim { grid-column:1/-1; margin:0; font-size:13px; line-height:1.25; }
.home-location { color:#92530e; }.home-error { color:#a52222; }.home-sim { color:#1268d3; width:max-content; max-width:100%; }
.home-services { width:100%; overflow:hidden; border-radius:16px; background:#fff; box-shadow:0 4px 18px #13334a12; }
.home-service { display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:0; min-height:64px; padding:10px 16px; border-bottom:1px solid #e8edf3; color:inherit; text-decoration:none; }
.home-service:last-child { border-bottom:0; }
.home-service:active { background:#f2f5f9; }
.home-service-copy { display:flex; flex-direction:column; min-width:0; gap:2px; }
.home-service strong { font-size:16px; font-weight:600; line-height:1.2; }
.home-service small { color:#5b6e7f; font-size:12px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.home-chevron { flex:none; color:#8b98a7; font-size:26px; line-height:1; font-weight:300; }
@media (max-width:620px) {
  .home-shell { gap:18px; }
  .home-brand { font-size:11px; margin-bottom:5px; }
  .home-header h1 { font-size:clamp(28px,8vw,38px); margin-bottom:5px; }
  .home-intro { font-size:14px; }
  .home-notification { padding:11px 14px; }
  .home-notification strong { font-size:18px; }
  .home-mission { padding:12px 14px; gap:8px; }
  .home-service { min-height:60px; padding:8px 14px; }
}
@media (max-height:650px) {
  .home-root { padding:10px 14px; }
  .home-shell { gap:9px; }
  .home-actions { gap:7px; }
  .home-brand { margin-bottom:3px; }
  .home-header h1 { margin-bottom:3px; }
  .home-notification { padding:8px 12px; }
  .home-notification strong { font-size:17px; }
  .home-mission { padding:8px 12px; gap:6px 8px; }
  .home-start { min-height:44px; padding:7px 10px; }
  .home-service { min-height:54px; padding:6px 12px; }
  .home-service strong { font-size:15px; }
  .home-service small { font-size:11px; }
}
@media (min-width:621px) and (max-height:430px) {
  .home-root { padding:6px 10px; }
  .home-shell { gap:4px; }
  .home-actions { gap:4px; }
  .home-brand,.home-header h1 { margin-bottom:0; }
  .home-notification { padding:5px 10px; }
  .home-mission { padding:5px 10px; gap:4px 8px; }
  .home-service { min-height:44px; padding:4px 12px; }
}
@media (max-height:550px) { .home-intro { display:none; } }
`
