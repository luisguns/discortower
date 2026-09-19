import { initializeObservability, reportFailure } from './services/observability'

void initializeObservability()
  .catch(() => { console.warn('OBSERVABILITY_INIT_FAILED') })
  .then(() => import('./bootstrap'))
  .catch(error => {
    reportFailure('app.bootstrap', error)
    const root = document.getElementById('root')
    if (root) root.textContent = 'Não foi possível iniciar o splotys. Recarregue o app.'
  })
