import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppBar } from './components/AppBar'
import { LangContext, SetLangContext, type Lang } from './i18n'
import { FieldPage } from './pages/FieldPage'
import { InsightsPage } from './pages/InsightsPage'
import { HomePage } from './pages/HomePage'

function App() {
  const [lang, setLang] = useState<Lang>('pt')
  return (
    <LangContext.Provider value={lang}>
      <SetLangContext.Provider value={setLang}>
        <BrowserRouter>
          <AppBar setLang={setLang} />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/field" element={<FieldPage />} />
            <Route path="/data" element={<InsightsPage />} />
            <Route path="/review" element={<Navigate to="/data?view=live" replace />} />
            <Route path="/insights" element={<Navigate to="/data" replace />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </SetLangContext.Provider>
    </LangContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
