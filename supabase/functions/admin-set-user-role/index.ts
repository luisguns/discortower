import { effectiveRole, handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { writeAudit } from '../_shared/audit.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    const actorRole = await effectiveRole(client, user.id)
    if (!['owner', 'manager'].includes(actorRole)) throw new HttpError(403, 'ADMIN_REQUIRED')
    await enforceRateLimit(client, `admin-role:${user.id}`, 60, 3600)
    const body = await readJson(request)
    const targetUserId = typeof body?.userId === 'string' ? body.userId : ''
    const role = body?.role === 'manager' || body?.role === 'host' || body?.role === 'member' ? body.role : ''
    if (!targetUserId || !role) throw new HttpError(400, 'INVALID_PAYLOAD')
    if (actorRole === 'manager' || targetUserId === user.id) throw new HttpError(403, 'ROLE_ASSIGNMENT_FORBIDDEN')
    const { data: targetAdmin } = await client.from('admin_users').select('user_id').eq('user_id', targetUserId).maybeSingle()
    if (targetAdmin) throw new HttpError(403, 'OWNER_PROTECTED')
    const { error } = await client.from('profiles').update({ role }).eq('user_id', targetUserId)
    if (error) throw new Error('USER_ROLE_UPDATE_FAILED')
    await writeAudit(client, { action: 'user_role_changed', actorUserId: user.id, targetUserId, result: 'success', metadata: { role } })
    return jsonResponse(request, { ok: true, role })
  } catch (error) { return handleFunctionError(request, error) }
})
