import { assertAdmin, handleFunctionError, HttpError, jsonResponse, optionsResponse, requireUser } from '../_shared/http.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    await assertAdmin(client, user.id)
    const { data: authUsers, error: authError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authError) throw new Error('USERS_LOOKUP_FAILED')
    const { data: profiles, error: profileError } = await client.from('profiles').select('user_id,display_name,avatar_url,status,created_at,updated_at')
    if (profileError) throw new Error('PROFILES_LOOKUP_FAILED')
    const profileById = new Map((profiles || []).map((profile) => [profile.user_id, profile]))
    const users = (authUsers.users || []).map((authUser) => {
      const profile = profileById.get(authUser.id)
      return {
        userId: authUser.id,
        email: authUser.email || '',
        displayName: profile?.display_name || '',
        avatarUrl: profile?.avatar_url || undefined,
        status: profile?.status || 'disabled',
        createdAt: authUser.created_at,
        lastSignInAt: authUser.last_sign_in_at || undefined,
      }
    })
    return jsonResponse(request, { users })
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

