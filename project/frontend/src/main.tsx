import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LangContext, SetLangContext, type Lang } from './i18n'
import { FieldPage } from './pages/FieldPage'
import { InsightsPage } from './pages/InsightsPage'
import { ReviewPage } from './pages/ReviewPage'

/** Desktop switcher. Hidden on /field: the phone app has its own language toggle in the sheet. */
function GlobalNav({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  if (useLocation().pathname.startsWith('/field')) return null
  return (
    <nav style={{ position: 'fixed', top: 8, right: 8, zIndex: 1000, background: '#fff', padding: '4px 8px', borderRadius: 6, fontFamily: 'system-ui' }}>
      <Link to="/field">field</Link> · <Link to="/review">review</Link> · <Link to="/insights">insights</Link> ·{' '}
      <button onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}>{lang.toUpperCase()}</button>
    </nav>
  )
}

function App() {
  const [lang, setLang] = useState<Lang>('pt')
  return (
    <LangContext.Provider value={lang}>
      <SetLangContext.Provider value={setLang}>
        <BrowserRouter>
          <GlobalNav lang={lang} setLang={setLang} />
          <Routes>
            <Route path="/field" element={<FieldPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="*" element={<Navigate to="/review" />} />
          </Routes>
        </BrowserRouter>
      </SetLangContext.Provider>
    </LangContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
