import type { Session, User } from '@supabase/supabase-js'
import { clearAuthCallbackParams, getAuthCallbackType, getAuthRedirectUrl, getCurrentAuthCallbackUrl } from './auth-callback'
import { getSupabase } from './supabase'
import type { AccessCapabilities, AccessContext, AccountProfile, AccountRole, LocalProfile, StreamQualityId } from '../types'
import { normalizeProfileNameStyle } from './profile'

export type AuthResult = { ok: true } | { ok: false; message: string }

type RawAccessContext = {
  user_id?: unknown
  is_admin?: unknown
  role?: unknown
  capabilities?: Record<string, unknown>
  profile?: {
    user_id?: unknown
    display_name?: unknown
    username?: unknown
    username_configured?: unknown
    avatar_url?: unknown
    status?: unknown
    created_at?: unknown
    updated_at?: unknown
    role?: unknown
    name_font?: unknown
    name_color?: unknown
    name_effect?: unknown
    name_weight?: unknown
    name_spacing?: unknown
    name_case?: unknown
    name_badge?: unknown
    name_animation?: unknown
  } | null
}

const genericAuthError = 'Não foi possível concluir essa operação. Confira seus dados e tente novamente.'

const profileFromRaw = (raw: RawAccessContext, user: User): AccountProfile | null => {
  const profile = raw.profile
  if (!profile || typeof profile.user_id !== 'string' || typeof profile.status !== 'string') return null
  if (profile.status !== 'active' && profile.status !== 'disabled') return null
  const role = profile.role === 'manager' || profile.role === 'host' || profile.role === 'member' ? profile.role : 'member'
  return {
    userId: profile.user_id,
    displayName: typeof profile.display_name === 'string' ? profile.display_name : '',
    username: typeof profile.username === 'string' ? profile.username : undefined,
    usernameConfigured: profile.username_configured === true,
    avatarDataUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : undefined,
    email: user.email,
    status: profile.status,
    role: role as AccountRole,
    nameStyle: normalizeProfileNameStyle({
      font: typeof profile.name_font === 'string' ? profile.name_font as never : undefined,
      color: typeof profile.name_color === 'string' ? profile.name_color : undefined,
      effect: typeof profile.name_effect === 'string' ? profile.name_effect as never : undefined,
      weight: typeof profile.name_weight === 'number' ? profile.name_weight as never : undefined,
      spacing: typeof profile.name_spacing === 'string' ? profile.name_spacing as never : undefined,
      casing: typeof profile.name_case === 'string' ? profile.name_case as never : undefined,
      badge: typeof profile.name_badge === 'string' ? profile.name_badge as never : undefined,
      animation: typeof profile.name_animation === 'string' ? profile.name_animation as never : undefined,
    }),
    createdAt: typeof profile.created_at === 'string' ? profile.created_at : undefined,
    updatedAt: typeof profile.updated_at === 'string' ? profile.updated_at : undefined,
  }
}

export const accessContextFromResponse = (raw: unknown, user: User): AccessContext | null => {
  if (!raw || typeof raw !== 'object') return null
  const context = raw as RawAccessContext
  const profile = profileFromRaw(context, user)
  if (!profile || typeof context.user_id !== 'string') return null
  const role = context.role === 'owner' || context.role === 'manager' || context.role === 'host' || context.role === 'member'
    ? context.role
    : context.is_admin === true ? 'owner' : profile.role
  const rawCapabilities = context.capabilities || {}
  const rawMaxQuality = rawCapabilities.max_screen_share_quality
  const roleMaxQuality: StreamQualityId = role === 'owner' || role === 'manager' ? '1080p60' : role === 'host' ? '1080p30' : '720p30'
  const maxScreenShareQuality: StreamQualityId = rawMaxQuality === '1080p60' || rawMaxQuality === '1080p30' || rawMaxQuality === '720p30'
    ? rawMaxQuality
    : roleMaxQuality
  const capabilities: AccessCapabilities = {
    canCreateChannel: rawCapabilities.can_create_channel === true || role === 'owner' || role === 'manager' || role === 'host',
    canManageAllChannels: rawCapabilities.can_manage_all_channels === true || role === 'owner' || role === 'manager',
    canManageUsers: rawCapabilities.can_manage_users === true || role === 'owner' || role === 'manager',
    canInviteManagers: rawCapabilities.can_invite_managers === true || role === 'owner',
    canModerateAllCalls: rawCapabilities.can_moderate_all_calls === true || role === 'owner' || role === 'manager',
    canHighQualityScreenShare: maxScreenShareQuality !== '720p30',
    maxScreenShareQuality,
  }
  profile.role = role
  return {
    userId: context.user_id,
    profile,
    isAdmin: role === 'owner' || role === 'manager',
    role,
    capabilities,
  }
}

export const exchangeAuthCallback = async (value?: string) => {
  const callbackUrl = getCurrentAuthCallbackUrl(value)
  if (!callbackUrl) return null
  const code = callbackUrl.searchParams.get('code')
  // Implicit email callbacks put the recovery/invite marker in the URL hash.
  // Supabase restores that session during client initialization, so there is no
  // PKCE code for us to exchange here.
  if (!code) return null
  if (code.length > 2048) throw new Error('AUTH_CALLBACK_INVALID')
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
  await getSupabase().auth.resetPasswordForEmail(normalizedEmail, { redirectTo: getAuthRedirectUrl('recovery') })
  // Deliberately do not expose whether the address exists.
  return { ok: true }
}

export const updateMyProfile = async (profile: LocalProfile): Promise<AccountProfile> => {
  const normalizedName = profile.displayName.trim().replace(/\s+/g, ' ')
  if (!normalizedName || normalizedName.length > 48) throw new Error('PROFILE_NAME_INVALID')
  const avatarUrl = profile.avatarDataUrl?.startsWith('data:image/') ? profile.avatarDataUrl : null
  const nameStyle = normalizeProfileNameStyle(profile.nameStyle)
  const { data, error } = await getSupabase().rpc('update_my_profile', {
    p_avatar_url: avatarUrl,
    p_display_name: normalizedName,
    p_name_badge: nameStyle.badge,
    p_name_animation: nameStyle.animation,
    p_name_case: nameStyle.casing,
    p_name_color: nameStyle.color,
    p_name_effect: nameStyle.effect,
    p_name_font: nameStyle.font,
    p_name_spacing: nameStyle.spacing,
    p_name_weight: nameStyle.weight,
  })
  if (error) throw error
  const { data: userData } = await getSupabase().auth.getUser()
  if (!userData.user) throw new Error('AUTH_REQUIRED')
  const context = accessContextFromResponse(data, userData.user)
  if (!context) throw new Error('ACCESS_CONTEXT_INVALID')
  return context.profile
}

export const claimMyUsername = async (username: string): Promise<AccountProfile> => {
  const normalizedUsername = username.trim().toLowerCase().replace(/^@/, '')
  if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) throw new Error('USERNAME_INVALID')
  const { data, error } = await getSupabase().rpc('claim_my_username', { p_username: normalizedUsername })
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

// Named errors from the redeem-invite-code Edge Function, each mapped to a
// message that tells the person exactly what to fix.
const inviteCodeErrorMessages: Record<string, string> = {
  CODE_ALREADY_USED: 'Este código de convite já foi utilizado. Peça um novo a quem te convidou.',
  CODE_EXPIRED: 'Este código de convite expirou. Peça um novo a quem te convidou.',
  CODE_REVOKED: 'Este código de convite foi cancelado. Peça um novo a quem te convidou.',
  CODE_NOT_FOUND: 'Código de convite não encontrado. Confira os 8 caracteres e tente de novo.',
  INVALID_CODE: 'O código de convite precisa ter 8 caracteres.',
  INVALID_OR_EXPIRED_CODE: 'Código inválido ou expirado.',
  INVALID_EMAIL: 'E-mail inválido. Confira o endereço digitado.',
  INVALID_PASSWORD: 'A senha precisa ter entre 8 e 128 caracteres.',
  EMAIL_ALREADY_REGISTERED: 'Esse e-mail já tem uma conta. Faça login em vez de usar o convite.',
  ACCOUNT_CREATION_FAILED: 'Não foi possível criar a conta com esse e-mail. Tente outro.',
  RATE_LIMITED: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
}

export const redeemInviteCode = async (code: string, email: string, password: string): Promise<AuthResult> => {
  const { error } = await getSupabase().functions.invoke('redeem-invite-code', {
    body: { code, email, password },
  })
  if (!error) return { ok: true }
  // On a non-2xx response supabase-js puts the JSON body on error.context
  // (a Response), not on `data` — so the specific code must be read from there.
  let status = 0
  let errorCode = ''
  const context = (error as { context?: Response }).context
  if (context instanceof Response) {
    status = context.status
    try {
      const parsed = await context.json()
      if (parsed?.error) errorCode = String(parsed.error)
    } catch { /* body may be empty or non-JSON; fall back to status below */ }
  }
  if (errorCode && inviteCodeErrorMessages[errorCode]) return { ok: false, message: inviteCodeErrorMessages[errorCode] }
  if (status === 409) return { ok: false, message: inviteCodeErrorMessages.EMAIL_ALREADY_REGISTERED }
  if (status === 429) return { ok: false, message: inviteCodeErrorMessages.RATE_LIMITED }
  return { ok: false, message: 'Não foi possível criar a conta agora. Verifique sua conexão e tente novamente.' }
}

export const signOut = async () => {
  await getSupabase().auth.signOut({ scope: 'local' })
}

export const currentSession = async (): Promise<Session | null> => {
  const { data, error } = await getSupabase().auth.getSession()
  if (error) throw error
  return data.session
}
