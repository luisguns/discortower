import { Component, type ReactNode } from 'react'
import { reportFailure } from '../../services/observability'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error) {
    reportFailure('react.render', error)
    console.error('SPLOTYS_RENDERER_ERROR')
    window.splotysDesktop?.setInCall(false)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="app-recovery" role="alert">
      <h1>Não foi possível exibir o splotys.</h1>
      <p>Recarregue o app para voltar. Depois, entre novamente na call.</p>
      <button onClick={() => window.location.reload()} type="button">Recarregar app</button>
    </main>
  }
}
