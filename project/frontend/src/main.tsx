import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { LangContext, type Lang } from './i18n'
import { FieldPage } from './pages/FieldPage'
import { InsightsPage } from './pages/InsightsPage'
import { ReviewPage } from './pages/ReviewPage'

function App() {
  const [lang, setLang] = useState<Lang>('pt')
  return (
    <LangContext.Provider value={lang}>
      <BrowserRouter>
        <nav style={{ position: 'fixed', top: 8, right: 8, zIndex: 1000, background: '#fff', padding: '4px 8px', borderRadius: 6, fontFamily: 'system-ui' }}>
          <Link to="/field">field</Link> · <Link to="/review">review</Link> · <Link to="/insights">insights</Link> ·{' '}
          <button onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}>{lang.toUpperCase()}</button>
        </nav>
        <Routes>
          <Route path="/field" element={<FieldPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="*" element={<Navigate to="/review" />} />
        </Routes>
      </BrowserRouter>
    </LangContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
