import { createContext, useContext } from 'react'

/** Shared by /field (D) and /review (E). `en` is typed against `pt`, so both stay in sync. */
const pt = {
  // field · navigation
  arrived: 'Cheguei', arrival: 'chegada', offRoute: 'Fora da rota — a recalcular', rerouted: 'Nova rota calculada',
  straightLine: 'Rota aproximada — sem motor de estradas', overview: 'Visão geral', recentre: 'Seguir',
  simulated: 'Simulação', directions: 'Indicações', upNext: 'A seguir', toDepot: 'Regressar ao armazém',
  settings: 'Definições', language: 'Idioma',
  // shell
  route: 'Rota', next: 'Próxima paragem', depot: 'Armazém', noMission: 'Sem missão ativa',
  cases: 'Casos', routeChanged: 'Rota alterada', offline: 'Sem ligação — registos guardados localmente',
  close: 'Fechar', cancel: 'Cancelar', save: 'Guardar', loading: 'A carregar…', none: '—',

  // field · operator and position (D1)
  operator: 'Operador', myPosition: 'A minha posição', locating: 'A localizar…',
  locationDenied: 'Sem acesso à localização — a rota parte da última posição conhecida',
  positionUnknown: 'Posição desconhecida',

  // field · route (D2)
  map: 'Mapa', list: 'Lista', recalculate: 'Recalcular', stops: 'paragens', km: 'km',
  planned: 'planeada', done: 'concluída', removed: 'removida',

  // field · stop sheet (D3)
  stop: 'Paragem', caseRef: 'Caso', bike: 'Bicicleta', bikeId: 'ID da bicicleta',
  lastSeen: 'Última posição conhecida', restSince: 'Parada desde', parkedFor: 'Parada há',
  outsideBy: 'Fora da área', reason: 'Motivo', uncertain: 'Incerto',
  needsApproval: 'Aguarda aprovação', blocked: 'Bloqueado',
  recordOutcome: 'Registar resultado', photo: 'Fotografia', addPhoto: 'Adicionar fotografia',
  notes: 'Notas', submit: 'Submeter', pickupNeedsIdAndPhoto: 'A recolha exige ID da bicicleta e fotografia',
  saved: 'Registado', savedOffline: 'Guardado no dispositivo — será enviado com ligação',

  // field · found bike (D4)
  foundBike: 'Encontrei outra bicicleta', foundBikeTitle: 'Reportar bicicleta encontrada',
  report: 'Reportar', awaitingApproval: 'Criado — aguarda aprovação do revisor',

  // field · offline (D5)
  pendingSync: 'por sincronizar', syncNow: 'Sincronizar agora', synced: 'Sincronizado',
  cachedRoute: 'Rota guardada (sem ligação)',

  // review · filters and KPIs (E1, E6)
  search: 'procurar id / estado', all: 'todos',
  notFoundRate: 'Visitas sem bicicleta', medianToPickup: 'Mediana elegível → recolha',
  openCases: 'Casos abertos', visits: 'visitas', minutesShort: 'min', noData: 'sem dados',

  // review · replay (E5)
  replay: 'Replay', start: 'Iniciar', pause: 'Pausa', step30: '+30 min',
  simClock: 'Relógio simulado', speed: 'Velocidade', notStarted: 'não iniciado', from: 'início',

  // review · case detail (E2, E3, E4)
  detail: 'Detalhe do caso', timeline: 'Linha temporal de evidência',
  boundaryDistance: 'Distância à área da estação', ruleCalc: 'Regra dos 120 minutos',
  ruleMet: 'cumprida', ruleNotMet: 'não cumprida', threshold: 'limiar',
  correct: 'Corrigir', approve: 'Aprovar', block: 'Bloquear', unblock: 'Desbloquear',
  export: 'Exportar', actor: 'Quem regista', reasonLabel: 'Motivo da alteração',
  reasonRequired: 'Indique quem regista e o motivo', before: 'antes', after: 'depois',
  newPosition: 'Nova posição', newStatus: 'Novo estado', blockReason: 'Motivo do bloqueio',
  recordedAt: 'recebido', eventTime: 'ocorreu',

  // insights · /insights analysis page (F4)
  insights: 'Análise', layerRecovery: 'Recolha', layerOpportunity: 'Novas estações',
  layerFlow: 'Procura por hora',
  mockBanner: 'Dados de exemplo — nenhuma medição foi feita ainda (F1–F3 por concluir). Não usar para decisões.',
  observedRange: 'Período observado:', coverage: 'Cobertura:', grid: 'Grelha:',
  sampleSize: 'Registos:', sources: 'Fontes:',
  abandonmentsPer100: 'Abandonos por 100 fins de viagem', idleHours: 'Horas paradas (mediana)',
  hoursToPickup: 'Horas até recolha do operador (mediana)', tripEnds: 'Fins de viagem',
  abandonments: 'Abandonos', intervals: 'Intervalos distintos',
  insufficientObs: 'Observações insuficientes', noDataShort: 'sem dados',
  exportCsv: 'Exportar CSV', weightsTitle: 'Pesos do score (provisórios, por aprovar)',
  scoreLabel: 'Score', rankLabel: '#', withoutBus: 'sem componente autocarro',
  candidate: 'Candidato', station: 'Estação', nearestStation: 'Estação mais próxima',
  componentsTitle: 'Componentes do score', rawValue: 'valor medido', missingInput: 'em falta',
  blockers: 'Impedimentos', selectRow: 'Selecione uma linha para ver o detalhe',
  dayType: 'Tipo de dia', weekday: 'Dias úteis', weekend: 'Fim de semana',
  departures: 'Partidas', arrivals: 'Chegadas', netFlow: 'Fluxo líquido', hourLabel: 'Hora',
  netFlowNote: 'Fluxo líquido = chegadas − partidas. Não é o stock da estação.',
  legendLow: 'menos', legendHigh: 'mais', legendNoData: 'sem dados',

  evidence: {
    observed: 'observado', inferred_proxy: 'proxy inferido',
    experimental_forecast: 'previsão experimental', scenario: 'cenário',
  },
  status: {
    candidate: 'Candidato', uncertain: 'Incerto', supported: 'Suportado', eligible: 'Elegível',
    assigned: 'Em rota', picked_up: 'Recolhida', resolved: 'Resolvido',
  },
  outcome: {
    picked_up: 'Recolhida', not_found: 'Não encontrada', in_use: 'Em utilização',
    provider_recovered: 'Recolhida pelo operador', unsafe: 'Local inseguro',
    inaccessible: 'Inacessível', unable_to_load: 'Impossível transportar',
  },
}

const en: typeof pt = {
  // field · navigation
  arrived: 'Arrived', arrival: 'arrival', offRoute: 'Off route — recalculating', rerouted: 'New route calculated',
  straightLine: 'Approximate route — road engine unavailable', overview: 'Overview', recentre: 'Follow',
  simulated: 'Simulation', directions: 'Directions', upNext: 'Up next', toDepot: 'Return to depot',
  settings: 'Settings', language: 'Language',
  route: 'Route', next: 'Next stop', depot: 'Depot', noMission: 'No active mission',
  cases: 'Cases', routeChanged: 'Route changed', offline: 'Offline — records saved locally',
  close: 'Close', cancel: 'Cancel', save: 'Save', loading: 'Loading…', none: '—',

  operator: 'Operator', myPosition: 'My position', locating: 'Locating…',
  locationDenied: 'No location access — the route starts from the last known position',
  positionUnknown: 'Position unknown',

  map: 'Map', list: 'List', recalculate: 'Recalculate', stops: 'stops', km: 'km',
  planned: 'planned', done: 'done', removed: 'removed',

  stop: 'Stop', caseRef: 'Case', bike: 'Bicycle', bikeId: 'Bicycle ID',
  lastSeen: 'Last known position', restSince: 'At rest since', parkedFor: 'Parked for',
  outsideBy: 'Outside the area by', reason: 'Reason', uncertain: 'Uncertain',
  needsApproval: 'Awaiting approval', blocked: 'Blocked',
  recordOutcome: 'Record outcome', photo: 'Photo', addPhoto: 'Add photo',
  notes: 'Notes', submit: 'Submit', pickupNeedsIdAndPhoto: 'A pickup needs a bicycle ID and a photo',
  saved: 'Recorded', savedOffline: 'Saved on the device — it will be sent once back online',

  foundBike: 'Found another bicycle', foundBikeTitle: 'Report a bicycle found in the field',
  report: 'Report', awaitingApproval: 'Created — awaiting reviewer approval',

  pendingSync: 'pending sync', syncNow: 'Sync now', synced: 'Synced',
  cachedRoute: 'Cached route (offline)',

  search: 'search id / status', all: 'all',
  notFoundRate: 'Visits with no bicycle', medianToPickup: 'Median eligible → pickup',
  openCases: 'Open cases', visits: 'visits', minutesShort: 'min', noData: 'no data',

  replay: 'Replay', start: 'Start', pause: 'Pause', step30: '+30 min',
  simClock: 'Simulated clock', speed: 'Speed', notStarted: 'not started', from: 'from',

  detail: 'Case detail', timeline: 'Evidence timeline',
  boundaryDistance: 'Distance to the station area', ruleCalc: '120-minute rule',
  ruleMet: 'met', ruleNotMet: 'not met', threshold: 'threshold',
  correct: 'Correct', approve: 'Approve', block: 'Block', unblock: 'Unblock',
  export: 'Export', actor: 'Recorded by', reasonLabel: 'Reason for the change',
  reasonRequired: 'Give the actor and a reason', before: 'before', after: 'after',
  newPosition: 'New position', newStatus: 'New status', blockReason: 'Blocking reason',
  recordedAt: 'received', eventTime: 'happened',

  insights: 'Insights', layerRecovery: 'Recovery', layerOpportunity: 'New stations',
  layerFlow: 'Demand by hour',
  mockBanner: 'Mock data — nothing has been measured yet (F1–F3 open). Not for decisions.',
  observedRange: 'Observed period:', coverage: 'Coverage:', grid: 'Grid:',
  sampleSize: 'Rows:', sources: 'Sources:',
  abandonmentsPer100: 'Abandonments per 100 trip ends', idleHours: 'Idle hours (median)',
  hoursToPickup: 'Hours to provider pickup (median)', tripEnds: 'Trip ends',
  abandonments: 'Abandonments', intervals: 'Distinct intervals',
  insufficientObs: 'Insufficient observations', noDataShort: 'no data',
  exportCsv: 'Export CSV', weightsTitle: 'Score weights (provisional, not approved)',
  scoreLabel: 'Score', rankLabel: '#', withoutBus: 'without the bus component',
  candidate: 'Candidate', station: 'Station', nearestStation: 'Nearest station',
  componentsTitle: 'Score components', rawValue: 'measured value', missingInput: 'missing',
  blockers: 'Blockers', selectRow: 'Select a row to see its detail',
  dayType: 'Day type', weekday: 'Weekdays', weekend: 'Weekend',
  departures: 'Departures', arrivals: 'Arrivals', netFlow: 'Net flow', hourLabel: 'Hour',
  netFlowNote: 'Net flow = arrivals − departures. It is not station stock.',
  legendLow: 'fewer', legendHigh: 'more', legendNoData: 'no data',

  evidence: {
    observed: 'observed', inferred_proxy: 'inferred proxy',
    experimental_forecast: 'experimental forecast', scenario: 'scenario',
  },
  status: {
    candidate: 'Candidate', uncertain: 'Uncertain', supported: 'Supported', eligible: 'Eligible',
    assigned: 'On route', picked_up: 'Picked up', resolved: 'Resolved',
  },
  outcome: {
    picked_up: 'Picked up', not_found: 'Not found', in_use: 'In use',
    provider_recovered: 'Recovered by provider', unsafe: 'Unsafe place',
    inaccessible: 'Inaccessible', unable_to_load: 'Unable to load',
  },
}

const dict = { pt, en }
export type Lang = keyof typeof dict
export const LangContext = createContext<Lang>('pt')
export const SetLangContext = createContext<(lang: Lang) => void>(() => {})
export const useLang = () => useContext(LangContext)
export const useT = () => dict[useContext(LangContext)]
