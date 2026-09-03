import type { SupabaseClient } from '@supabase/supabase-js'
import type { AccountRole } from '../types'
import { getSupabase } from './supabase'
import { getAuthRedirectUrl } from './auth-callback'

export interface AdminUser {
  userId: string
  email: string
  displayName: string
  avatarUrl?: string
  status: 'active' | 'disabled'
  role: AccountRole
  createdAt: string
  lastSignInAt?: string
}

export interface AdminInvitation {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  role: Exclude<AccountRole, 'owner'>
  createdAt: string
  expiresAt: string
  acceptedAt?: string
}

export interface AdminInviteCode {
  id: string
  code: string
  label: string
  role: Exclude<AccountRole, 'owner'>
  status: 'active' | 'used' | 'revoked' | 'expired'
  createdAt: string
  expiresAt: string
  usedAt?: string
}

export interface AdminParticipant {
  id: string
  userId?: string
  identity: string
  name: string
  joinedAt: string
  leftAt?: string
}

export interface AdminRoom {
  id: string
  roomName: string
  status: 'starting' | 'open' | 'closed'
  startedAt?: string
  endedAt?: string
  createdAt: string
  participants: AdminParticipant[]
}

export interface AdminUsageSummary {
  estimatedMinutes: number
  budget: number
  percentage: number | null
}

export interface CallGuardrailSettings {
  soloWarningSeconds: number
  soloKickSeconds: number
  maxCallSeconds: number
  maxWarningSeconds: number
  cooldownSeconds: number
  maxScreenShareDimension: number
  activeCallLimit: number
  startingTimeoutSeconds: number
  updatedAt?: string
}

export class AdminApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

const statusFromError = (error: { context?: { status?: number } | Response } | null) => {
  if (!error?.context) return 500
  if (error.context instanceof Response) return error.context.status
  return error.context.status || 500
}

const invokeAdmin = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await getSupabase().functions.invoke(name, { body })
  if (error) {
    const status = statusFromError(error)
    throw new AdminApiError(
      status === 403 ? 'Acesso administrativo negado.' : 'Não foi possível concluir a ação administrativa.',
      status,
    )
  }
  return data as T
}

const rows = <T>(data: T[] | null, error: { message: string } | null): T[] => {
  if (error) throw new AdminApiError('Não foi possível carregar os dados administrativos.', 500)
  return data || []
}

export const listAdminUsers = () => invokeAdmin<{ users: AdminUser[] }>('admin-list-users', {}).then((result) => result.users || [])

export const setUserStatus = (userId: string, status: 'active' | 'disabled') =>
  invokeAdmin<{ ok: boolean; removalFailures?: number; revokedSessions?: boolean }>('admin-set-user-status', { status, userId })

export const setUserRole = (userId: string, role: Exclude<AccountRole, 'owner'>) =>
  invokeAdmin<{ ok: true; role: Exclude<AccountRole, 'owner'> }>('admin-set-user-role', { role, userId })

export const getAdminUsageSummary = () => invokeAdmin<AdminUsageSummary>('admin-usage-summary', {})

export const getCallGuardrailSettings = () => invokeAdmin<{ settings: CallGuardrailSettings }>('admin-call-settings', { action: 'get' }).then((result) => result.settings)

export const updateCallGuardrailSettings = (settings: CallGuardrailSettings) =>
  invokeAdmin<{ settings: CallGuardrailSettings }>('admin-call-settings', { action: 'update', settings }).then((result) => result.settings)

export const createInvitation = (email: string, role: Exclude<AccountRole, 'owner'> = 'member') =>
  invokeAdmin<{ invitation: AdminInvitation }>('admin-invite-user', { action: 'create', email, role, redirectTo: getAuthRedirectUrl() }).then((result) => result.invitation)

export const revokeInvitation = (invitationId: string) =>
  invokeAdmin<{ ok: true }>('admin-invite-user', { action: 'revoke', invitationId })

export const createInviteCode = (role: Exclude<AccountRole, 'owner'> = 'member', label = '') =>
  invokeAdmin<{ code: AdminInviteCode }>('admin-invite-code', { action: 'create', role, label }).then((result) => result.code)

export const revokeInviteCode = (codeId: string) =>
  invokeAdmin<{ code: AdminInviteCode }>('admin-invite-code', { action: 'revoke', codeId })

export const listInviteCodes = async () => {
  const { data, error } = await getSupabase()
    .from('invite_codes')
    .select('id,code,label,role,status,created_at,expires_at,used_at')
    .order('created_at', { ascending: false })
    .limit(100)
  return rows(data, error).map((item) => ({
    id: item.id,
    code: `${(item.code as string).slice(0, 4)}-${(item.code as string).slice(4)}`,
    label: item.label || '',
    role: item.role || 'member',
    status: item.status,
    createdAt: item.created_at,
    expiresAt: item.expires_at,
    usedAt: item.used_at || undefined,
  })) as AdminInviteCode[]
}

export const listAdminInvitations = async () => {
  const { data, error } = await getSupabase()
    .from('invitations')
    .select('id,email_normalized,status,role,created_at,expires_at,accepted_at')
    .order('created_at', { ascending: false })
    .limit(100)
  return rows(data, error).map((item) => ({
    id: item.id,
    email: item.email_normalized,
    status: item.status,
    role: item.role || 'member',
    createdAt: item.created_at,
    expiresAt: item.expires_at,
    acceptedAt: item.accepted_at || undefined,
  })) as AdminInvitation[]
}

export const listAdminRooms = async () => {
  const supabase = getSupabase()
  const { data: roomData, error: roomError } = await supabase
    .from('room_sessions')
    .select('id,room_name,status,started_at,ended_at,created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  const rooms = rows(roomData, roomError)
  if (!rooms.length) return []

  const { data: participantData, error: participantError } = await supabase
    .from('participant_sessions')
    .select('id,room_session_id,user_id,livekit_identity,participant_name,joined_at,left_at')
    .in('room_session_id', rooms.map((room) => room.id))
    .order('joined_at', { ascending: true })
  const participants = rows(participantData, participantError)
  return rooms.map((room) => ({
    id: room.id,
    roomName: room.room_name,
    status: room.status,
    startedAt: room.started_at || undefined,
    endedAt: room.ended_at || undefined,
    createdAt: room.created_at,
    participants: participants.filter((participant) => participant.room_session_id === room.id).map((participant) => ({
      id: participant.id,
      userId: participant.user_id || undefined,
      identity: participant.livekit_identity,
      name: participant.participant_name,
      joinedAt: participant.joined_at,
      leftAt: participant.left_at || undefined,
    })),
  })) as AdminRoom[]
}

export const roomAction = (action: 'end_room' | 'remove_participant', roomId: string, participantId?: string) =>
  invokeAdmin<{ ok: true }>('admin-room-action', { action, participantId, roomId })

export const subscribeToAdminChanges = (onChange: () => void) => {
  const supabase: SupabaseClient = getSupabase()
  const channel = supabase
    .channel('admin-control-plane')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_sessions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'participant_sessions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invite_codes' }, onChange)
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
