import type { Session, User } from '@supabase/supabase-js'
import { clearAuthCallbackParams, getAuthCallbackType, getAuthRedirectUrl, getCurrentAuthCallbackUrl } from './auth-callback'
import { getSupabase } from './supabase'
import type { AccessContext, AccountProfile, LocalProfile } from '../types'

export type AuthResult = { ok: true } | { ok: false; message: string }

type RawAccessContext = {
  user_id?: unknown
  is_admin?: unknown
  profile?: {
    user_id?: unknown
    display_name?: unknown
    avatar_url?: unknown
    status?: unknown
    created_at?: unknown
    updated_at?: unknown
  } | null
}

const genericAuthError = 'Não foi possível concluir essa operação. Confira seus dados e tente novamente.'

const profileFromRaw = (raw: RawAccessContext, user: User): AccountProfile | null => {
  const profile = raw.profile
  if (!profile || typeof profile.user_id !== 'string' || typeof profile.status !== 'string') return null
  if (profile.status !== 'active' && profile.status !== 'disabled') return null
  return {
    userId: profile.user_id,
    displayName: typeof profile.display_name === 'string' ? profile.display_name : '',
    avatarDataUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : undefined,
    email: user.email,
    status: profile.status,
    createdAt: typeof profile.created_at === 'string' ? profile.created_at : undefined,
    updatedAt: typeof profile.updated_at === 'string' ? profile.updated_at : undefined,
  }
}

export const accessContextFromResponse = (raw: unknown, user: User): AccessContext | null => {
  if (!raw || typeof raw !== 'object') return null
  const context = raw as RawAccessContext
  const profile = profileFromRaw(context, user)
  if (!profile || typeof context.user_id !== 'string') return null
  return {
    userId: context.user_id,
    profile,
    isAdmin: context.is_admin === true,
  }
}

export const exchangeAuthCallback = async (value?: string) => {
  const callbackUrl = getCurrentAuthCallbackUrl(value)
  if (!callbackUrl) return null
  const code = callbackUrl.searchParams.get('code')
  if (!code || code.length > 2048) throw new Error('AUTH_CALLBACK_INVALID')
  const supabase = getSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  clearAuthCallbackParams()
  if (error) throw error
  return true
}

export { getAuthCallbackType }

export const getAccessContext = async (user: User): Promise<AccessContext> => {
  const { data, error } = await getSupabase().rpc('get_my_access_context')
  if (error) throw error
  const context = accessContextFromResponse(data, user)
  if (!context) throw new Error('ACCESS_CONTEXT_INVALID')
  return context
}

export const signInWithPassword = async (email: string, password: string): Promise<AuthResult> => {
  const normalizedEmail = email.trim().toLocaleLowerCase()
  if (!normalizedEmail || !password) return { ok: false, message: genericAuthError }
  const { error } = await getSupabase().auth.signInWithPassword({ email: normalizedEmail, password })
  return error ? { ok: false, message: genericAuthError } : { ok: true }
}

export const requestPasswordReset = async (email: string): Promise<AuthResult> => {
  const normalizedEmail = email.trim().toLocaleLowerCase()
  if (!normalizedEmail) return { ok: true }
  await getSupabase().auth.resetPasswordForEmail(normalizedEmail, { redirectTo: getAuthRedirectUrl() })
  // Deliberately do not expose whether the address exists.
  return { ok: true }
}

export const updateMyProfile = async (profile: LocalProfile): Promise<AccountProfile> => {
  const normalizedName = profile.displayName.trim().replace(/\s+/g, ' ')
  if (!normalizedName || normalizedName.length > 48) throw new Error('PROFILE_NAME_INVALID')
  const avatarUrl = profile.avatarDataUrl?.startsWith('data:image/') ? profile.avatarDataUrl : null
  const { data, error } = await getSupabase().rpc('update_my_profile', {
    p_avatar_url: avatarUrl,
    p_display_name: normalizedName,
  })
  if (error) throw error
  const { data: userData } = await getSupabase().auth.getUser()
  if (!userData.user) throw new Error('AUTH_REQUIRED')
  const context = accessContextFromResponse(data, userData.user)
  if (!context) throw new Error('ACCESS_CONTEXT_INVALID')
  return context.profile
}

export const updatePassword = async (password: string): Promise<AuthResult> => {
  if (password.length < 8 || password.length > 128) return { ok: false, message: 'A senha precisa ter entre 8 e 128 caracteres.' }
  const { error } = await getSupabase().auth.updateUser({ password })
  return error ? { ok: false, message: 'Não foi possível definir essa senha. Tente novamente.' } : { ok: true }
}

export const signOut = async () => {
  await getSupabase().auth.signOut({ scope: 'local' })
}

export const currentSession = async (): Promise<Session | null> => {
  const { data, error } = await getSupabase().auth.getSession()
  if (error) throw error
  return data.session
}
