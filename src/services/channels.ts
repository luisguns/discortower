import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabase'
import type { ChannelCallSummary, ChannelSummary } from '../types'

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

const mapCall = (row: Record<string, unknown>): ChannelCallSummary => ({
  id: String(row.id), channelId: String(row.channel_id), name: String(row.name), status: row.status as 'active' | 'archived',
  createdBy: String(row.created_by), participantCount: Number(row.participant_count || 0),
  callStartedAt: typeof row.call_started_at === 'string' ? row.call_started_at : undefined, canManage: false,
})

export const listChannels = async (currentUserId = '', canManageAll = false) => {
  const { data, error } = await getSupabase()
    .from('channels')
    .select('id,name,created_by,status,participant_count,call_started_at,reopen_after,channel_calls(id,channel_id,name,created_by,status,participant_count,call_started_at)')
    .eq('status', 'active')
    .eq('channel_calls.status', 'active')
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []).map((row) => ({ ...mapChannel(row as ChannelRow), canManage: canManageAll || row.created_by === currentUserId, calls: ((row as any).channel_calls || []).map((call: Record<string, unknown>) => ({ ...mapCall(call), canManage: canManageAll || row.created_by === currentUserId })) }))
}

const invoke = async <T>(body: Record<string, unknown>) => {
  const { data, error } = await getSupabase().functions.invoke('channel-action', { body })
  if (error) throw error
  return data as T
}
const invokeManagement = async <T>(body: Record<string, unknown>) => {
  const { data, error } = await getSupabase().functions.invoke('channel-management', { body })
  if (error) throw error
  return data as T
}

export const createChannel = (name: string) =>
  invoke<{ channel: ChannelSummary }>({ action: 'create', name }).then((result) => result.channel)

export const renameChannel = (channelId: string, name: string) =>
  invoke<{ channel: ChannelSummary }>({ action: 'rename', channelId, name }).then((result) => result.channel)

export const archiveChannel = (channelId: string) => invoke<{ ok: true }>({ action: 'archive', channelId })
export const restoreChannel = (channelId: string) => invoke<{ ok: true }>({ action: 'restore', channelId })
export const createCall = (channelId: string, name: string) => invoke<{ call: ChannelCallSummary }>({ action: 'create_call', channelId, name }).then((result) => result.call)
export const renameCall = (callId: string, name: string) => invoke<{ call: ChannelCallSummary }>({ action: 'rename_call', callId, name }).then((result) => result.call)
export const archiveCall = (callId: string) => invoke<{ ok: true }>({ action: 'archive_call', callId })
export const createChannelInvite = (channelId: string) => invokeManagement<{ invite: { token: string; expires_at: string; max_uses: number } }>({ action: 'create_invite', channelId }).then(({ invite }) => invite)
export const createChannelInviteLink = (token: string) => {
  if (typeof window === 'undefined') return `?invite=${encodeURIComponent(token)}`
  const url = new URL(window.fordKallDesktop ? 'https://fordkall.11a3.dev/' : window.location.href)
  url.search = ''; url.searchParams.set('invite', token); url.hash = ''
  return url.toString()
}
export const acceptChannelInvite = (token: string) => invokeManagement<{ ok: true; channelId: string }>({ action: 'accept_invite', token })
export const blockCallParticipant = (channelId: string, callId: string, userId: string) => invokeManagement<{ ok: true }>({ action: 'block_call', channelId, callId, userId })
export const unblockCallParticipant = (channelId: string, callId: string, userId: string) => invokeManagement<{ ok: true }>({ action: 'unblock_call', channelId, callId, userId })

export const subscribeToChannels = (onChange: () => void) => {
  const client: SupabaseClient = getSupabase()
  const channel = client
    .channel('public-channel-presence')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, onChange)
    .subscribe()
  return () => { void client.removeChannel(channel) }
}
