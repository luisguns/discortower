import type { ActivityCatalogItem, ChannelPresence } from '../types'
import { getSupabase } from './supabase'

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
  invoke<{ ok: true; online: boolean }>({ action: 'heartbeat', activityId: activityId || null })

export const reportOffline = () => invoke<{ ok: true; online: false }>({ action: 'offline' })
