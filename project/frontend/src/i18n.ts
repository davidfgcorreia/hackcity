import { createContext, useContext } from 'react'

const dict = {
  pt: { route: 'Rota', next: 'Próxima paragem', depot: 'Armazém', noMission: 'Sem missão ativa', cases: 'Casos', routeChanged: 'Rota alterada', offline: 'Sem ligação — registos guardados localmente' },
  en: { route: 'Route', next: 'Next stop', depot: 'Depot', noMission: 'No active mission', cases: 'Cases', routeChanged: 'Route changed', offline: 'Offline — records saved locally' },
}
export type Lang = keyof typeof dict
export const LangContext = createContext<Lang>('pt')
export const useT = () => dict[useContext(LangContext)]
