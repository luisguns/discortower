import type { ActivityCatalogItem, ChannelPresence } from '../types'
import { getSupabase } from './supabase'
import { presenceRefreshDelay } from './presenceTiming'

const invoke = async <T>(body: Record<string, unknown>) => {
  const { data, error } = await getSupabase().functions.invoke('channel-presence', { body })
  if (error) throw error
  return data as T
}

export const listChannelPresence = () =>
  invoke<{ channels: ChannelPresence[] }>({ action: 'summary' }).then((result) => result.channels)

export const listActivityCatalog = () =>
  invoke<{ catalog: ActivityCatalogItem[] }>({ action: 'catalog' }).then((result) => result.catalog)

export const reportActivity = (channelId: string, activityId?: string) =>
  invoke<{ ok: true; active: boolean }>({ action: 'report', channelId, activityId: activityId || null })

export const reportOnlinePresence = (activityId?: string) =>
  invoke<{ ok: true; online: boolean }>({
    action: 'heartbeat',
    activityId: activityId || null,
    ttlSeconds: document.visibilityState === 'visible' ? 150 : 240,
  })

export const reportOffline = () => invoke<{ ok: true; online: false }>({ action: 'offline' })

export const subscribeToChannelPresence = (
  onPresence: (presence: ChannelPresence[]) => void,
) => {
  let stopped = false
  let timer = 0
  let inFlight: Promise<void> | undefined

  const schedule = () => {
    if (stopped) return
    timer = window.setTimeout(() => void load(), presenceRefreshDelay(document.visibilityState))
  }
  const load = () => {
    if (inFlight) return inFlight
    window.clearTimeout(timer)
    inFlight = listChannelPresence()
      .then((presence) => { if (!stopped) onPresence(presence) })
      .catch(() => undefined)
      .finally(() => {
        inFlight = undefined
        schedule()
      })
    return inFlight
  }
  const refreshOnVisibility = () => {
    window.clearTimeout(timer)
    void load()
  }

  document.addEventListener('visibilitychange', refreshOnVisibility)
  window.addEventListener('online', refreshOnVisibility)
  void load()
  return () => {
    stopped = true
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', refreshOnVisibility)
    window.removeEventListener('online', refreshOnVisibility)
  }
}
