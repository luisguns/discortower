const configuredRedirectUrl = () => import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL?.trim() || ''

const callbackDestination = (value: string) => {
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    if (url.pathname === '') url.pathname = '/'
    return url.toString()
  } catch {
    return ''
  }
}

export const getAuthRedirectUrl = () => {
  if (typeof window !== 'undefined' && window.splotysDesktop) return 'splotys://auth/callback'
  const configured = configuredRedirectUrl()
  if (configured) return configured
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/`
}

const allowedCallbackUrls = () => {
  const values = new Set<string>()
  const configured = configuredRedirectUrl()
  if (configured) values.add(callbackDestination(configured))
  if (typeof window !== 'undefined') values.add(callbackDestination(`${window.location.origin}/`))
  if (typeof window !== 'undefined' && window.splotysDesktop) values.add('splotys://auth/callback')
  return values
}

export const isAllowedAuthCallback = (value: string) => {
  const normalized = callbackDestination(value)
  if (!normalized || !allowedCallbackUrls().has(normalized)) return false
  try {
    const url = new URL(value)
    const allowedParams = new Set(['code', 'error', 'error_code', 'error_description', 'type'])
    const type = url.searchParams.get('type')
    return !url.username && !url.password &&
      [...url.searchParams.keys()].every((key) => allowedParams.has(key)) &&
      (!type || ['invite', 'recovery', 'signup'].includes(type))
  } catch {
    return false
  }
}

export const hasAuthCallbackCode = (value?: string) => {
  if (typeof window === 'undefined' && !value) return false
  const url = new URL(value || window.location.href)
  return Boolean(url.searchParams.get('code'))
}

export const getCurrentAuthCallbackUrl = (value?: string) => {
  const callbackUrl = new URL(value || window.location.href)
  const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''))
  const callbackType = callbackUrl.searchParams.get('type') || hashParams.get('type') || ''
  if (!callbackUrl.searchParams.get('code') && !['invite', 'recovery', 'signup'].includes(callbackType)) return null
  if (!isAllowedAuthCallback(callbackUrl.toString())) return null
  return callbackUrl
}

export const getAuthCallbackType = (value?: string) => {
  const callbackUrl = getCurrentAuthCallbackUrl(value)
  if (!callbackUrl) return ''
  const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''))
  return callbackUrl.searchParams.get('type') || hashParams.get('type') || ''
}

export const clearAuthCallbackParams = () => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('error')
  url.searchParams.delete('error_code')
  url.searchParams.delete('error_description')
  url.searchParams.delete('type')
  window.history.replaceState(null, '', url)
}
