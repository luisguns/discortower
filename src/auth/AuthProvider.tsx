import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  currentSession,
  claimMyUsername,
  exchangeAuthCallback,
  getAccessContext,
  getAuthCallbackType,
  signInWithPassword,
  signOut as signOutFromSupabase,
  requestPasswordReset,
  updateMyProfile,
  updatePassword,
} from '../services/auth'
import { getSupabase, initializeSupabase, isSupabaseConfigured } from '../services/supabase'
import type { AccessContext, AccountProfile, LocalProfile } from '../types'

export type AuthStatus = 'initializing' | 'unauthenticated' | 'authenticated' | 'disabled' | 'error'

interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  access: AccessContext | null
  error: string
  credentialSetup: 'invite' | 'recovery' | null
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>
  resetPassword: (email: string) => Promise<{ ok: boolean; message?: string }>
  updateProfile: (profile: LocalProfile) => Promise<AccountProfile | null>
  claimUsername: (username: string) => Promise<AccountProfile | null>
  completeCredentialSetup: (password: string) => Promise<{ ok: boolean; message?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const friendlyProfileError = (error: unknown) => {
  if (error instanceof Error && error.message === 'USERNAME_INVALID') return 'Use de 3 a 24 caracteres: letras minúsculas, números ou _.'
  if (error instanceof Error && error.message === 'USERNAME_TAKEN') return 'Esse @username já está em uso. Escolha outro.'
  if (error instanceof Error && error.message === 'PROFILE_NAME_INVALID') {
    return 'Use um nome entre 1 e 48 caracteres.'
  }
  return 'Não foi possível salvar seu perfil. Tente novamente.'
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>('initializing')
  const [session, setSession] = useState<Session | null>(null)
  const [access, setAccess] = useState<AccessContext | null>(null)
  const [error, setError] = useState('')
  const [credentialSetup, setCredentialSetup] = useState<'invite' | 'recovery' | null>(null)

  const loadAccess = useCallback(async (nextSession: Session | null) => {
    if (!nextSession) {
      setSession(null)
      setAccess(null)
      setStatus('unauthenticated')
      setCredentialSetup(null)
      return
    }

    setSession(nextSession)
    try {
      const nextAccess = await getAccessContext(nextSession.user)
      setAccess(nextAccess)
      setStatus(nextAccess.profile.status === 'disabled' ? 'disabled' : 'authenticated')
      setError('')
    } catch {
      setAccess(null)
      setStatus('error')
      setError('Não foi possível validar o acesso desta conta.')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let unsubscribe: () => void = () => undefined
    let unsubscribeDesktopCallback: () => void = () => undefined
    let callbackEventType: 'recovery' | null = null

    const consumeCallback = async (callbackUrl?: string) => {
      try {
        await initializeSupabase()
        const callbackType = getAuthCallbackType(callbackUrl)
        const exchanged = await exchangeAuthCallback(callbackUrl)
        const nextSession = await currentSession()
        const setupType = callbackType === 'invite' || callbackType === 'recovery'
          ? callbackType
          : callbackEventType || (exchanged && nextSession?.user.invited_at ? 'invite' : null)
        if (setupType) setCredentialSetup(setupType)
        if (mounted) await loadAccess(nextSession)
      } catch {
        if (mounted) {
          setStatus('error')
          setError('O link de acesso expirou ou não é válido. Solicite um novo convite.')
        }
      }
    }

    const bootstrap = async () => {
      if (!isSupabaseConfigured) {
        setStatus('error')
        setError('O serviço de autenticação ainda não foi configurado.')
        return
      }

      try {
        await initializeSupabase()
        const { data } = getSupabase().auth.onAuthStateChange((event, nextSession) => {
          if (event === 'INITIAL_SESSION') return
          if (event === 'PASSWORD_RECOVERY') { callbackEventType = 'recovery'; setCredentialSetup('recovery') }
          window.setTimeout(() => {
            if (mounted) void loadAccess(nextSession)
          }, 0)
        })
        unsubscribe = data.subscription.unsubscribe
        const pendingCallback = await window.splotysDesktop?.getAuthCallback()
        await consumeCallback(pendingCallback || undefined)
        const nextSession = await currentSession()
        if (mounted) await loadAccess(nextSession)
        unsubscribeDesktopCallback = window.splotysDesktop?.onAuthCallback((callbackUrl) => {
          void consumeCallback(callbackUrl)
        }) || (() => undefined)
      } catch {
        if (mounted) {
          setStatus('error')
          setError('Não foi possível iniciar a autenticação. Confira a configuração do Supabase.')
        }
      }
    }

    void bootstrap()
    return () => {
      mounted = false
      unsubscribe()
      unsubscribeDesktopCallback()
    }
  }, [loadAccess])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await signInWithPassword(email, password)
      if (!result.ok) return result
      return { ok: true }
    } catch {
      return { ok: false, message: 'Não foi possível concluir essa operação. Confira seus dados e tente novamente.' }
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    try {
      return await requestPasswordReset(email)
    } catch {
      // Keep the same response for existing and unknown addresses.
      return { ok: true }
    }
  }, [])

  const updateProfile = useCallback(async (profile: LocalProfile) => {
    try {
      const nextProfile = await updateMyProfile(profile)
      setAccess((current) => current ? { ...current, profile: nextProfile } : current)
      return nextProfile
    } catch (profileError) {
      setError(friendlyProfileError(profileError))
      return null
    }
  }, [])

  const claimUsername = useCallback(async (username: string) => {
    try {
      const nextProfile = await claimMyUsername(username)
      setAccess((current) => current ? { ...current, profile: nextProfile } : current)
      return nextProfile
    } catch (profileError) {
      setError(friendlyProfileError(profileError))
      return null
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await signOutFromSupabase()
    } finally {
      setSession(null)
      setAccess(null)
      setStatus('unauthenticated')
      setError('')
      setCredentialSetup(null)
    }
  }, [])

  const completeCredentialSetup = useCallback(async (password: string) => {
    try {
      const result = await updatePassword(password)
      if (result.ok) setCredentialSetup(null)
      return result
    } catch {
      return { ok: false, message: 'Não foi possível definir essa senha. Tente novamente.' }
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    access,
    claimUsername,
    completeCredentialSetup,
    credentialSetup,
    error,
    resetPassword,
    session,
    signIn,
    signOut,
    status,
    updateProfile,
    user: session?.user ?? null,
  }), [access, claimUsername, completeCredentialSetup, credentialSetup, error, resetPassword, session, signIn, signOut, status, updateProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
