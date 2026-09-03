import { useEffect, useState } from 'react'

export const DesktopTitleBar = () => {
  const desktop = window.splotysDesktop
  const [maximized, setMaximized] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!desktop) return
    void desktop.isMaximized().then(setMaximized)
    const stopMaximized = desktop.onMaximizedChange(setMaximized)
    const stopFullscreen = desktop.onFullscreenChange(setFullscreen)
    return () => { stopMaximized(); stopFullscreen() }
  }, [desktop])

  if (!desktop) return null

  return <header className={`desktop-titlebar${fullscreen ? ' is-hidden' : ''}`}>
    <div className="desktop-titlebar__identity">
      <img alt="" src="/favicon.svg" />
      <strong>splotys</strong>
      <span>ponto de encontro gamer</span>
    </div>
    <nav aria-label="Controles da janela" className="desktop-titlebar__controls">
      <button aria-label="Minimizar" onClick={desktop.minimize} title="Minimizar" type="button"><i className="desktop-titlebar__minimize" /></button>
      <button aria-label={maximized ? 'Restaurar janela' : 'Maximizar'} onClick={() => void desktop.toggleMaximize().then(setMaximized)} title={maximized ? 'Restaurar' : 'Maximizar'} type="button"><i className={maximized ? 'desktop-titlebar__restore' : 'desktop-titlebar__maximize'} /></button>
      <button aria-label="Fechar" className="desktop-titlebar__close" onClick={desktop.closeWindow} title="Fechar" type="button"><i /></button>
    </nav>
  </header>
}
