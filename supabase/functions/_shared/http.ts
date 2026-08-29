import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

const configuredOrigins = () => (Deno.env.get('FUNCTION_ALLOWED_ORIGINS') || 'https://fordkall.11a3.dev,fordkall-app://app,http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean)

export const corsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get('origin') || ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (configuredOrigins().includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

export const optionsResponse = (request: Request) => new Response(null, { headers: corsHeaders(request), status: 204 })

export const jsonResponse = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  headers: { ...corsHeaders(request), 'Content-Type': 'application/json; charset=utf-8' },
  status,
})

export const errorResponse = (request: Request, status: number, message: string) => jsonResponse(request, { error: message }, status)

export const readJson = async (request: Request) => {
  try {
    const value: unknown = await request.json()
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

const secretKey = () => Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

export const adminClient = (): SupabaseClient => {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = secretKey()
  if (!url || !key) throw new Error('SERVER_AUTH_NOT_CONFIGURED')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const bearerToken = (request: Request) => {
  const value = request.headers.get('authorization') || ''
  return value.match(/^Bearer\s+([^\s]+)$/i)?.[1] || ''
}

export const requireUser = async (request: Request): Promise<{ client: SupabaseClient; user: User }> => {
  const token = bearerToken(request)
  if (!token) throw new HttpError(401, 'AUTH_REQUIRED')
  const client = adminClient()
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'AUTH_INVALID')
  return { client, user: data.user }
}

export const assertAdmin = async (client: SupabaseClient, userId: string) => {
  const { data, error } = await client.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  if (error || !data) throw new HttpError(403, 'ADMIN_REQUIRED')
  return true
}

export const userIp = (request: Request) => (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 64)

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

export const handleFunctionError = (request: Request, error: unknown) => {
  if (error instanceof HttpError) return errorResponse(request, error.status, error.message)
  if (error instanceof Error && error.message === 'RATE_LIMITED') return errorResponse(request, 429, 'RATE_LIMITED')
  if (error instanceof Error && error.message === 'SERVER_AUTH_NOT_CONFIGURED') return errorResponse(request, 500, 'SERVER_NOT_CONFIGURED')
  return errorResponse(request, 500, 'INTERNAL_ERROR')
}
