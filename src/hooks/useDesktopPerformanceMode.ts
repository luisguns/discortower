import { useEffect } from 'react'
import type { Room } from '@gunns-dev/control-tower-client'

export const useDesktopPerformanceMode = (room: Room) => {
  useEffect(() => {
    if (!window.splotysDesktop) return
    // Visibility is not viewer intent. Tearing subscriptions down here races
    // with watch controls, reconnection and publisher demand on restoration.
    const syncVisibility = () => {
      document.documentElement.classList.toggle('desktop-background-mode', document.hidden)
    }
    document.addEventListener('visibilitychange', syncVisibility)
    syncVisibility()
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      document.documentElement.classList.remove('desktop-background-mode')
    }
  }, [room])
}
