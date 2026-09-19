import { useEffect, useState } from 'react'
import { listActivityCatalog, reportOffline, reportOnlinePresence } from '../services/presence'
import type { RecognizedActivity } from '../types'
import { observe, reportFailure } from '../services/observability'

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
    let lastReportAt = 0
    let lastActivityId: string | undefined
    let detectNow = () => undefined as void
    const start = async () => {
      let catalog: Awaited<ReturnType<typeof listActivityCatalog>> = []
      if (sharingEnabled && desktop?.platform === 'win32') {
        try {
          catalog = await listActivityCatalog()
        } catch {
          observe('activity.catalog_unavailable', {}, 'warn')
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
        } catch (error) {
          reportFailure('activity.detect', error)
          // Local activity detection is optional.
        }
        if (cancelled) return
        const recognized = catalog.find((item) => item.id === detected?.activityId)
        setActivity(recognized ? { ...recognized, iconDataUrl: detected?.iconDataUrl } : undefined)
        const now = Date.now()
        const heartbeatInterval = document.visibilityState === 'visible' ? 60_000 : 180_000
        if (detected?.activityId !== lastActivityId || now - lastReportAt >= heartbeatInterval) {
          try {
            await reportOnlinePresence(detected?.activityId)
            lastActivityId = detected?.activityId
            lastReportAt = now
          } catch {
            observe('presence.heartbeat_missing', { since_last_success_ms: lastReportAt ? now - lastReportAt : undefined }, 'warn')
            // Presence failures must never interfere with the app or a call.
          }
        }
        if (!cancelled) {
          timer = window.setTimeout(
            () => void detect(),
            document.visibilityState === 'visible' ? 20_000 : 60_000,
          )
        }
      }
      detectNow = () => { void detect() }
      await detect()
    }
    const refreshForVisibility = () => {
      lastReportAt = 0
      window.clearTimeout(timer)
      detectNow()
    }
    document.addEventListener('visibilitychange', refreshForVisibility)
    void start()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshForVisibility)
      void reportOffline().catch(() => undefined)
    }
  }, [active, sharingEnabled])
  return activity
}
