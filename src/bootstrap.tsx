import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { DesktopTitleBar } from './components/ui/DesktopTitleBar'
import { AppErrorBoundary } from './components/ui/AppErrorBoundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className={window.splotysDesktop ? 'desktop-app-shell' : 'web-app-shell'}>
      <DesktopTitleBar />
      <div className="desktop-app-shell__content">
        <AppErrorBoundary>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AppErrorBoundary>
      </div>
    </div>
  </StrictMode>,
)
