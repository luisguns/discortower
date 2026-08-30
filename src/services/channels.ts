import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabase'
import type { ChannelSummary } from '../types'

type ChannelRow = {
  id: string
  name: string
  created_by: string
  status: 'active' | 'archived'
  participant_count: number
  call_started_at: string | null
  reopen_after: string | null
}

const mapChannel = (row: ChannelRow): ChannelSummary => ({
  id: row.id,
  name: row.name,
  createdBy: row.created_by,
  status: row.status,
  participantCount: row.participant_count || 0,
  callStartedAt: row.call_started_at || undefined,
  reopenAfter: row.reopen_after || undefined,
  canManage: false,
})

export const listChannels = async (currentUserId = '', canManageAll = false) => {
  const { data, error } = await getSupabase()
    .from('channels')
    .select('id,name,created_by,status,participant_count,call_started_at,reopen_after')
    .eq('status', 'active')
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []).map((row) => ({ ...mapChannel(row as ChannelRow), canManage: canManageAll || row.created_by === currentUserId }))
}

const invoke = async <T>(body: Record<string, unknown>) => {
  const { data, error } = await getSupabase().functions.invoke('channel-action', { body })
  if (error) throw error
  return data as T
}

export const createChannel = (name: string) =>
  invoke<{ channel: ChannelSummary }>({ action: 'create', name }).then((result) => result.channel)

export const renameChannel = (channelId: string, name: string) =>
  invoke<{ channel: ChannelSummary }>({ action: 'rename', channelId, name }).then((result) => result.channel)

export const archiveChannel = (channelId: string) => invoke<{ ok: true }>({ action: 'archive', channelId })
export const restoreChannel = (channelId: string) => invoke<{ ok: true }>({ action: 'restore', channelId })

export const subscribeToChannels = (onChange: () => void) => {
  const client: SupabaseClient = getSupabase()
  const channel = client
    .channel('public-channel-presence')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, onChange)
    .subscribe()
  return () => { void client.removeChannel(channel) }
}
