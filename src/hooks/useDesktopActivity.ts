import { useEffect, useState } from 'react'
import { listActivityCatalog, reportOffline, reportOnlinePresence } from '../services/presence'
import type { RecognizedActivity } from '../types'

export const useDesktopActivity = (active: boolean, sharingEnabled: boolean) => {
  const [activity, setActivity] = useState<RecognizedActivity | undefined>()
  useEffect(() => {
    const desktop = window.splotysDesktop
    if (!active) {
      setActivity(undefined)
      return
    }
    let cancelled = false
    let timer = 0
    const start = async () => {
      let catalog: Awaited<ReturnType<typeof listActivityCatalog>> = []
      if (sharingEnabled && desktop?.platform === 'win32') {
        try {
          catalog = await listActivityCatalog()
        } catch {
          // Online presence still works if the optional activity catalog is unavailable.
        }
      }
      if (cancelled) return
      const detect = async () => {
        let detected: Awaited<ReturnType<NonNullable<typeof desktop>['detectKnownActivity']>> = null
        try {
          detected = desktop && catalog.length
            ? await desktop.detectKnownActivity(catalog.map((item) => ({ id: item.id, processNames: item.processNames })))
            : null
        } catch {
          // Local activity detection is optional.
        }
        if (cancelled) return
        const recognized = catalog.find((item) => item.id === detected?.activityId)
        setActivity(recognized ? { ...recognized, iconDataUrl: detected?.iconDataUrl } : undefined)
        try {
          await reportOnlinePresence(detected?.activityId)
        } catch {
          // Presence failures must never interfere with the app or a call.
        }
      }
      await detect()
      timer = window.setInterval(() => void detect(), 20_000)
    }
    void start()
    return () => {
      cancelled = true
      window.clearInterval(timer)
      void reportOffline().catch(() => undefined)
    }
  }, [active, sharingEnabled])
  return activity
}
